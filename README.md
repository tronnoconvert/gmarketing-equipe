# Agência OS

Painel único da agência: Cockpit, Financeiro, Clientes, Operação, Equipe, Torre de Controle (rotinas/integrações + Painel de Voo Meta Ads),
Comercial, Alertas e Insights, Webinars, Campanha (conta própria via Windsor), Notificações e Administração.

- `npm install` · `npm run build` → `dist/` (hospedagem estática) e `dist/agencia-os.html` (arquivo único de prévia)
- `npm test` → testes de navegador (Playwright) em 1366, 1920 e 390 px. Um módulo: `node tests/run.mjs clientes`.
- Sem `public/config.js` configurado o app roda em **modo demonstração** (dados fictícios no navegador; usuários `nome@agencia.demo`, senha `demo123`).
- Produção: Supabase (banco, login, funções do servidor). Passo a passo em `docs/DEPLOY.md`; backend em `supabase/`.

Documentos: `PLAN.md` (plano e decisões), `docs/CORE-API.md` (API interna), `docs/spec-dono.md`, `docs/equipe-prompt.md`, `docs/webinars-prompt.md`.
