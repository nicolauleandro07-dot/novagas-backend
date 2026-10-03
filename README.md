# NovaGás Backend — Financeiro v3 (teste/manual)

Backend Node.js/Express para testes da plataforma NovaGás.

## Financeiro v3
- Carteira separa saldo disponível, investido, reservado e bónus.
- Depósitos entram como `pending` e nunca creditam saldo automaticamente.
- Levantamentos reservam o saldo antes da aprovação.
- Aprovação/rejeição administrativa é atómica e protegida contra processamento duplicado.
- Registo de ledger para movimentos de carteira.
- Chaves de idempotência para pedidos de depósito/levantamento.
- Referência externa obrigatória para concluir depósito/levantamento manual.
- Configurações financeiras e dados bancários são editáveis pelo ADM.
- `/api/finance/instructions` expõe apenas as instruções bancárias configuradas, não credenciais.

## Execução
`npm install`
`npm start`

## Railway/Koyeb/Render
- Start command: `npm start`
- O servidor usa `PORT` e escuta em `0.0.0.0`.
- Health check: `/api/health`

## Modo financeiro
Por padrão: `test_manual`.

`manual_bank` pode ser usado quando a operação bancária manual estiver formalmente configurada, mas a confirmação continua sendo feita pelo administrador. Uma integração bancária automática deve usar API/webhook autorizado; nunca guardar senha bancária no código.

## Importante
Esta versão usa SQLite local e é apenas para teste. Não usar para guardar dinheiro real ou saldos reais de clientes. Para produção financeira, migrar para PostgreSQL persistente, backups, auditoria, controlo de acesso, integração de pagamentos autorizada e cumprir os requisitos legais/regulatórios aplicáveis.
