# Onde paramos — 25/11/2026

## No ar
- Painel: https://painel.agenciagmarketing.com.br (Hostinger, pasta public_html/painel; subir o zip de `npm run build` → dist/ sem agencia-os.html).
- Supabase hzonfbqsjxiwfmjywdlw: receita protegida no banco, senha provisória, 6 Edge Functions. APP_URL e Auth Site URL = painel.
- Logins criados: Gabriel (dono) e Rayane (admin), senha provisória entregue ao dono. BOOTSTRAP_SECRET apagado.
- GitHub: tronnoconvert/gmarketing-equipe (push funcionando).

## Próximo (minha parte)
1. **Item 17 — Painel de Voo nativo com dados reais (Windsor)** ANTES de liberar a equipe.
2. Link Windsor para reconectar as 14 contas inativas.
3. Campanha CA01/CA02/soma.
4. Chaves Monday, Windsor, Z-API, Meta em Supabase › Edge Functions › Secrets (passar nomes exatos) e ligar crons (DEPLOY §2.8).

---
# Onde paramos — 25/11/2026 (retomar quando o dono disser "oi")

## Feito nesta etapa (Supabase de produção — projeto gmarketing-equipe, ref hzonfbqsjxiwfmjywdlw)
- **Banco aplicado** (`schema.sql` + `policies.sql`), org `gmarketing`, matriz padrão. **Vazio**: 0 usuários, 0 registros.
- **Receita protegida no banco**: quem não tem a permissão "receita" (padrão: só Dono e Rayane/Admin) não recebe MRR,
  faturamento, ticket, valores de contrato, comissões alheias, faturas/caixa/DRE — nem por tela, rede, realtime ou WhatsApp.
  Ao editar, o servidor preserva os valores que a pessoa não vê. Detalhes: `docs/DEPLOY.md` §7.
- **Login sem e-mail**: admin cria o acesso → senha provisória (copiar e mandar por WhatsApp) → no 1º acesso a pessoa cria a
  senha dela (mín. 10). "Redefinir senha" gera outra provisória. "Esqueci minha senha" → "peça ao administrador".
- **Edge Functions publicadas** (6): admin-invite, notify, routines-runner, windsor-proxy, monday-sync, guardiao — ativas.
- **Segredos gerados**: CRON_SECRET, BOOTSTRAP_SECRET, DEFAULT_ORG_ID. Vault do cron pronto; **nenhum agendamento ligado**.
- `public/config.js` preenchido (URL + anon key públicas). `npm run build` = produção; `AOS_DEMO=1` / `npm test` = demonstração.
- **Teste real** `tests/live/producao.mjs`: 35/35 contra o projeto (dono de teste, gestor de teste, MRR protegido, MRR 1000
  preservado depois da edição do gestor, realtime, notificações) e limpeza completa no final.
- Rede da sessão: o host `hzonfbqsjxiwfmjywdlw.supabase.co` foi liberado no ambiente (o `cdn.jsdelivr.net` continua bloqueado
  aqui; no navegador das pessoas funciona — o teste usa uma cópia local do supabase-js).

## O que o dono precisa fazer agora (em ordem)
1. **Mandar os e-mails de login** do Gabriel e da Rayane. Com eles eu (ou o dono) rodo `scripts/criar-dono.mjs`
   (`docs/DEPLOY.md` §2.5). O valor do BOOTSTRAP_SECRET não pode ser lido no painel (o Supabase só mostra o resumo):
   para rodar ele mesmo, o dono troca o valor em **Supabase › Edge Functions › Secrets › BOOTSTRAP_SECRET** por uma frase
   dele; numa próxima sessão eu posso gerar um novo valor pela API e rodar o script. Depois dos dois acessos: apagar o segredo.
2. **Instalar o app do Claude no GitHub** (push ainda bloqueado):
   https://github.com/apps/claude/installations/select_target → **tronnoconvert** → "Only select repositories" →
   **gmarketing-equipe** → **Install**; depois escrever **pronto** (os commits estão na branch main, em /home/user/gmarketing-equipe).
3. **Hostinger**: dizer o endereço do painel (ex.: painel.<domínio>) → subir o conteúdo de `dist/` (build de produção).
   Depois atualizar `APP_URL` (segredo) e a *Site URL* em Authentication › URL Configuration.
4. Ligar 2FA no Supabase (conta do dono) e, quando quiser, o plano Pro (backups diários).

## Pendente (minha parte), em ordem
1. Criar os acessos de Gabriel (dono) e Rayane (admin) assim que chegarem os e-mails.
2. Hospedar na Hostinger com o domínio do dono.
3. **Item 17 — Painel de Voo nativo com dados reais (Windsor)** ANTES de liberar a equipe.
4. Cadastrar as regras de alerta e ligar os agendamentos (`docs/DEPLOY.md` §2.8) quando a equipe existir.
5. Depois: chaves Monday, Windsor, Z-API (WhatsApp), token Meta (Guardião) — o dono cola em Supabase › Edge Functions ›
   Secrets (nomes exatos em `docs/DEPLOY.md` §2.4) e eu ligo os agendamentos correspondentes.

## Regras de comunicação com o dono
- Ser 100% específico ao pedir algo: link exato, onde clicar, o que copiar, o que responder.
- "Visível para mim" = Dono + Rayane (admin).
