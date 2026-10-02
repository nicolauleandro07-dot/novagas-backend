import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import db from "./db.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));
app.use("/api/", rateLimit({ windowMs: 15*60*1000, limit: 250 }));

const money = n => Math.round(Number(n) * 100);
const sign = user => jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return res.status(401).json({error:"Não autenticado"});
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { return res.status(401).json({error:"Sessão inválida"}); }
}
function admin(req,res,next) {
  if (req.user.role !== "admin") return res.status(403).json({error:"Acesso administrativo necessário"});
  next();
}
function code() { return crypto.randomBytes(4).toString("hex").toUpperCase(); }

app.get("/api/health", (req,res) => res.json({ok:true,service:"NovaGás Backend"}));

app.get("/api/referrals/validate", (req,res) => {
  const referralCode = String(req.query.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(referralCode)) return res.json({valid:false});
  const ref = db.prepare("SELECT id FROM users WHERE referral_code=?").get(referralCode);
  res.json({valid:!!ref});
});

app.post("/api/auth/register", (req,res) => {
  const {name, phone, email, password, referralCode} = req.body;
  if (!name || !phone || !password || password.length < 8) return res.status(400).json({error:"Nome, telefone e senha (mín. 8 caracteres) são obrigatórios."});
  if (!/^\+244\d{9}$/.test(phone)) return res.status(400).json({error:"Telefone deve estar no formato +244XXXXXXXXX."});
  try {
    const ref = referralCode ? db.prepare("SELECT id FROM users WHERE referral_code=?").get(referralCode.trim().toUpperCase()) : null;
    const hash = bcrypt.hashSync(password, 12);
    const referral = ref?.id || null;
    const referralCodeNew = code();
    const info = db.prepare(`
      INSERT INTO users(name,phone,email,password_hash,referral_code,referred_by)
      VALUES(?,?,?,?,?,?)
    `).run(name.trim(), phone, email?.trim() || null, hash, referralCodeNew, referral);
    db.prepare("INSERT INTO wallets(user_id) VALUES(?)").run(info.lastInsertRowid);
    if (referral) db.prepare("INSERT INTO referrals(inviter_id,invited_id) VALUES(?,?)").run(referral, info.lastInsertRowid);
    const user = db.prepare("SELECT id,name,phone,email,role,vip_level,referral_code FROM users WHERE id=?").get(info.lastInsertRowid);
    res.status(201).json({token:sign(user), user});
  } catch (e) {
    res.status(409).json({error:"Telefone ou email já está registado."});
  }
});

app.post("/api/auth/login", (req,res) => {
  const {phone,password} = req.body;
  const user = db.prepare("SELECT * FROM users WHERE phone=?").get(phone);
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) return res.status(401).json({error:"Credenciais inválidas."});
  const safe = {id:user.id,name:user.name,phone:user.phone,email:user.email,role:user.role,vip_level:user.vip_level,referral_code:user.referral_code};
  res.json({token:sign(user), user:safe});
});

app.get("/api/me", auth, (req,res) => {
  const user = db.prepare("SELECT id,name,phone,email,role,vip_level,referral_code,created_at FROM users WHERE id=?").get(req.user.id);
  const wallet = db.prepare("SELECT * FROM wallets WHERE user_id=?").get(req.user.id);
  res.json({user,wallet});
});

app.get("/api/products", auth, (req,res) => {
  res.json(db.prepare("SELECT * FROM products WHERE active=1 ORDER BY id").all());
});

app.get("/api/dashboard", auth, (req,res) => {
  const wallet = db.prepare("SELECT * FROM wallets WHERE user_id=?").get(req.user.id);
  const investments = db.prepare(`
    SELECT i.*, p.name, p.category FROM investments i JOIN products p ON p.id=i.product_id
    WHERE i.user_id=? ORDER BY i.id DESC
  `).all(req.user.id);
  const transactions = db.prepare("SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 20").all(req.user.id);
  const referrals = db.prepare("SELECT COUNT(*) c FROM referrals WHERE inviter_id=?").get(req.user.id).c;
  res.json({wallet,investments,transactions,referrals});
});

app.post("/api/deposits", auth, (req,res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount < 1000) return res.status(400).json({error:"Valor mínimo: 1.000 Kz."});
  const ref = "DEP-" + crypto.randomBytes(6).toString("hex").toUpperCase();
  const info = db.prepare(`
    INSERT INTO transactions(user_id,type,amount_cents,status,provider,provider_reference,description)
    VALUES(?,?,?,?,?,?,?)
  `).run(req.user.id,"deposit",money(amount),"pending","pending_provider",ref,"Pedido de depósito");
  res.status(201).json({id:info.lastInsertRowid,reference:ref,status:"pending",message:"Pedido criado. O saldo só será creditado após confirmação do provedor."});
});

app.post("/api/withdrawals", auth, (req,res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount < 3000) return res.status(400).json({error:"Valor mínimo de levantamento: 3.000 Kz."});
  const wallet = db.prepare("SELECT available_cents FROM wallets WHERE user_id=?").get(req.user.id);
  if (money(amount) > wallet.available_cents) return res.status(400).json({error:"Saldo disponível insuficiente."});
  const ref = "WD-" + crypto.randomBytes(6).toString("hex").toUpperCase();
  const tx = db.transaction(() => {
    db.prepare("UPDATE wallets SET available_cents=available_cents-? WHERE user_id=?").run(money(amount),req.user.id);
    db.prepare(`
      INSERT INTO transactions(user_id,type,amount_cents,status,provider,provider_reference,description)
      VALUES(?,?,?,?,?,?,?)
    `).run(req.user.id,"withdrawal",money(amount),"pending","pending_provider",ref,"Pedido de levantamento");
  });
  tx();
  res.status(201).json({reference:ref,status:"pending",message:"Pedido de levantamento criado e enviado para processamento."});
});

app.post("/api/investments", auth, (req,res) => {
  const productId = Number(req.body.productId);
  const product = db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(productId);
  if (!product) return res.status(404).json({error:"Produto não encontrado."});
  const wallet = db.prepare("SELECT available_cents FROM wallets WHERE user_id=?").get(req.user.id);
  if (wallet.available_cents < product.price_cents) return res.status(400).json({error:"Saldo disponível insuficiente."});
  const expected = product.price_cents + Math.floor(product.price_cents * product.daily_rate_bps/10000 * product.duration_days);
  const end = new Date(Date.now()+product.duration_days*86400000).toISOString();
  const tx = db.transaction(() => {
    db.prepare("UPDATE wallets SET available_cents=available_cents-?, invested_cents=invested_cents+? WHERE user_id=?").run(product.price_cents,product.price_cents,req.user.id);
    db.prepare(`
      INSERT INTO investments(user_id,product_id,amount_cents,expected_return_cents,ends_at)
      VALUES(?,?,?,?,?)
    `).run(req.user.id,product.id,product.price_cents,expected,end);
  });
  tx();
  res.status(201).json({message:"Investimento registado.",expectedReturnCents:expected});
});

app.get("/api/tasks", auth, (req,res) => {
  const rows = db.prepare(`
    SELECT t.*, CASE WHEN c.id IS NULL THEN 0 ELSE 1 END completed
    FROM tasks t LEFT JOIN task_claims c ON c.task_id=t.id AND c.user_id=?
    WHERE t.active=1
  `).all(req.user.id);
  res.json(rows);
});

app.post("/api/tasks/:id/complete", auth, (req,res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id=? AND active=1").get(req.params.id);
  if (!task) return res.status(404).json({error:"Tarefa não encontrada."});
  try {
    const tx = db.transaction(() => {
      db.prepare("INSERT INTO task_claims(task_id,user_id) VALUES(?,?)").run(task.id,req.user.id);
      db.prepare("UPDATE wallets SET bonus_cents=bonus_cents+? WHERE user_id=?").run(task.reward_cents,req.user.id);
    });
    tx();
    res.json({message:"Tarefa concluída. Recompensa registada."});
  } catch { res.status(409).json({error:"Tarefa já concluída."}); }
});

app.get("/api/team", auth, (req,res) => {
  const user = db.prepare("SELECT referral_code FROM users WHERE id=?").get(req.user.id);
  const rows = db.prepare(`
    SELECT u.name,u.created_at,r.level,r.commission_bps,r.commission_cents
    FROM referrals r JOIN users u ON u.id=r.invited_id
    WHERE r.inviter_id=? ORDER BY r.id DESC
  `).all(req.user.id);
  res.json({code:user.referral_code,link:`${req.protocol}://${req.get("host")}/?ref=${user.referral_code}`,commissionLevels:[30,5,1],members:rows});
});

/* ADMIN: only transaction state changes performed here.
   In production, provider webhooks should be verified and idempotent. */
app.get("/api/admin/transactions", auth, admin, (req,res) => {
  res.json(db.prepare(`
    SELECT t.*,u.name,u.phone FROM transactions t JOIN users u ON u.id=t.user_id
    ORDER BY t.id DESC LIMIT 100
  `).all());
});

app.post("/api/admin/transactions/:id/complete", auth, admin, (req,res) => {
  const tx = db.prepare("SELECT * FROM transactions WHERE id=?").get(req.params.id);
  if (!tx || tx.status !== "pending") return res.status(400).json({error:"Transação inválida."});
  const run = db.transaction(() => {
    if (tx.type === "deposit") db.prepare("UPDATE wallets SET available_cents=available_cents+? WHERE user_id=?").run(tx.amount_cents,tx.user_id);
    db.prepare("UPDATE transactions SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=?").run(tx.id);
  });
  run();
  res.json({message:"Transação confirmada."});
});

app.post("/api/admin/transactions/:id/reject", auth, admin, (req,res) => {
  const tx = db.prepare("SELECT * FROM transactions WHERE id=?").get(req.params.id);
  if (!tx || tx.status !== "pending") return res.status(400).json({error:"Transação inválida."});
  const run = db.transaction(() => {
    if (tx.type === "withdrawal") db.prepare("UPDATE wallets SET available_cents=available_cents+? WHERE user_id=?").run(tx.amount_cents,tx.user_id);
    db.prepare("UPDATE transactions SET status='rejected',completed_at=CURRENT_TIMESTAMP WHERE id=?").run(tx.id);
  });
  run();
  res.json({message:"Transação rejeitada."});
});

app.use((req,res) => res.sendFile("index.html",{root:"public"}));

app.listen(PORT, () => console.log(`NovaGás: http://localhost:${PORT}`));
