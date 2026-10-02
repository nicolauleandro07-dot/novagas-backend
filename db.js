import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "novagas.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  vip_level INTEGER NOT NULL DEFAULT 0,
  referral_code TEXT NOT NULL UNIQUE,
  referred_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referred_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id INTEGER PRIMARY KEY,
  available_cents INTEGER NOT NULL DEFAULT 0,
  invested_cents INTEGER NOT NULL DEFAULT 0,
  bonus_cents INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  duration_days INTEGER NOT NULL,
  daily_rate_bps INTEGER NOT NULL,
  max_participation INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS investments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  expected_return_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  provider_reference TEXT UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inviter_id INTEGER NOT NULL,
  invited_id INTEGER NOT NULL UNIQUE,
  level INTEGER NOT NULL DEFAULT 1,
  commission_bps INTEGER NOT NULL DEFAULT 3000,
  commission_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inviter_id) REFERENCES users(id),
  FOREIGN KEY (invited_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reward_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS task_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`);

const adminEmail = process.env.ADMIN_EMAIL || "admin@novagas.local";
const adminPassword = process.env.ADMIN_PASSWORD || "CHANGE_ME";
const existing = db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail);
if (!existing && adminPassword !== "CHANGE_ME") {
  const hash = bcrypt.hashSync(adminPassword, 12);
  const code = "ADMIN" + Math.random().toString(36).slice(2, 8).toUpperCase();
  const info = db.prepare(`
    INSERT INTO users(name, phone, email, password_hash, role, referral_code)
    VALUES(?,?,?,?,?,?)
  `).run("Administrador", "+244000000000", adminEmail, hash, "admin", code);
  db.prepare("INSERT INTO wallets(user_id) VALUES(?)").run(info.lastInsertRowid);
}

const productCount = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
if (!productCount) {
  const insert = db.prepare(`
    INSERT INTO products(name,category,price_cents,duration_days,daily_rate_bps,max_participation)
    VALUES(?,?,?,?,?,?)
  `);
  insert.run("Plano Energia 1", "curto", 500000, 1, 0, 1);
  insert.run("Plano Energia 7", "curto", 1500000, 7, 120, 3);
  insert.run("Plano Energia 30", "estavel", 5000000, 30, 180, 5);
  insert.run("Plano Energia 90", "longo", 15000000, 90, 220, 10);
}
const taskCount = db.prepare("SELECT COUNT(*) AS c FROM tasks").get().c;
if (!taskCount) {
  const insert = db.prepare("INSERT INTO tasks(title,description,reward_cents) VALUES(?,?,?)");
  insert.run("Tarefa de boas-vindas", "Complete o perfil da sua conta.", 5000);
  insert.run("Primeiro acesso", "Visite a área de investimentos.", 2500);
}

export default db;
