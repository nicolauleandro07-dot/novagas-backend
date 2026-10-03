import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "novagas.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE,
 email TEXT UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user',
 vip_level INTEGER NOT NULL DEFAULT 0, referral_code TEXT NOT NULL UNIQUE, referred_by INTEGER,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(referred_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS wallets (
 user_id INTEGER PRIMARY KEY, available_cents INTEGER NOT NULL DEFAULT 0,
 invested_cents INTEGER NOT NULL DEFAULT 0, reserved_cents INTEGER NOT NULL DEFAULT 0,
 bonus_cents INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
 price_cents INTEGER NOT NULL, duration_days INTEGER NOT NULL, daily_rate_bps INTEGER NOT NULL,
 max_participation INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS investments (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
 amount_cents INTEGER NOT NULL, expected_return_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active',
 started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, ends_at TEXT NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS transactions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL,
 amount_cents INTEGER NOT NULL, fee_cents INTEGER NOT NULL DEFAULT 0, net_amount_cents INTEGER,
 status TEXT NOT NULL DEFAULT 'pending', provider TEXT, provider_reference TEXT UNIQUE,
 destination TEXT, description TEXT, idempotency_key TEXT UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS ledger_entries (
 id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
 account TEXT NOT NULL, direction TEXT NOT NULL, amount_cents INTEGER NOT NULL,
 balance_before_cents INTEGER NOT NULL, balance_after_cents INTEGER NOT NULL,
 note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(transaction_id) REFERENCES transactions(id), FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS referrals (
 id INTEGER PRIMARY KEY AUTOINCREMENT, inviter_id INTEGER NOT NULL, invited_id INTEGER NOT NULL UNIQUE,
 level INTEGER NOT NULL DEFAULT 1, commission_bps INTEGER NOT NULL DEFAULT 3000, commission_cents INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(inviter_id) REFERENCES users(id), FOREIGN KEY(invited_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS tasks (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL,
 reward_cents INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS task_claims (
 id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'completed', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(task_id,user_id), FOREIGN KEY(task_id) REFERENCES tasks(id), FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

for (const sql of [
  "ALTER TABLE transactions ADD COLUMN fee_cents INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE transactions ADD COLUMN net_amount_cents INTEGER",
  "ALTER TABLE transactions ADD COLUMN destination TEXT",
  "ALTER TABLE transactions ADD COLUMN idempotency_key TEXT"
]) { try { db.exec(sql); } catch {} }

// SQLite cannot safely create a unique index if old duplicate idempotency values exist;
// only create the index when possible, and old databases simply keep the API-level guard.
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key) WHERE idempotency_key IS NOT NULL"); } catch {}

const defaults = {
  investment_min_cents: "500000",
  withdrawal_min_cents: "300000",
  deposit_min_cents: "100000",
  withdrawal_fee_bps: "2500",
  bank_name: "",
  bank_account_name: "",
  bank_account_number: "",
  bank_iban: "",
  deposit_instructions: "Aguardando configuração bancária pelo administrador.",
  finance_mode: "test_manual"
};
const set = db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)");
for (const [k,v] of Object.entries(defaults)) set.run(k,v);

const adminEmail = process.env.ADMIN_EMAIL || "admin@novagas.local";
const adminPassword = process.env.ADMIN_PASSWORD || "CHANGE_ME";
const existing = db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail);
if (!existing && adminPassword !== "CHANGE_ME") {
 const hash = bcrypt.hashSync(adminPassword, 12);
 const code = "ADMIN" + Math.random().toString(36).slice(2,8).toUpperCase();
 const info = db.prepare("INSERT INTO users(name,phone,email,password_hash,role,referral_code) VALUES(?,?,?,?,?,?)")
   .run("Administrador", "+244000000000", adminEmail, hash, "admin", code);
 db.prepare("INSERT INTO wallets(user_id) VALUES(?)").run(info.lastInsertRowid);
}

if (!db.prepare("SELECT COUNT(*) c FROM products").get().c) {
 const p = db.prepare("INSERT INTO products(name,category,price_cents,duration_days,daily_rate_bps,max_participation) VALUES(?,?,?,?,?,?)");
 p.run("Plano Energia 1", "curto", 500000, 1, 0, 1);
 p.run("Plano Energia 7", "curto", 1500000, 120, 3, 3);
 p.run("Plano Energia 30", "estavel", 5000000, 180, 30, 5);
 p.run("Plano Energia 90", "longo", 15000000, 220, 90, 10);
}
if (!db.prepare("SELECT COUNT(*) c FROM tasks").get().c) {
 const t=db.prepare("INSERT INTO tasks(title,description,reward_cents) VALUES(?,?,?)");
 t.run("Tarefa de boas-vindas","Complete o perfil da sua conta.",5000);
 t.run("Primeiro acesso","Visite a área de investimentos.",2500);
}
export default db;
