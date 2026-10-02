# NovaGás Backend

Backend Node.js/Express para a plataforma NovaGás.

## Railway
- Build: Railpack/automático
- Start: `npm start`
- Variáveis: `NODE_ENV`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CORS_ORIGIN`
- Health check: `/api/health`

## Nota importante
Esta versão usa SQLite local para testes. Para movimentação financeira real em produção, use uma base de dados persistente (ex.: PostgreSQL), provedor de pagamentos legítimo, auditoria e reconciliação.
