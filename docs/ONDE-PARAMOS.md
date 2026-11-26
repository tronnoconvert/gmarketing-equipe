# Onde paramos — 26/11/2026 (retomar quando o dono disser "oi")

## Pendente do DONO (pedir de novo, 100% específico)
1. Netlify › projeto gmarketing-painel › Project configuration › General › Visitor access → No protection (site dá 401 hoje).
2. Cópia 3 (GitHub): dono cria senha A e senha B no gerenciador de senhas; senha A em Supabase › Functions › Secrets (editar BACKUP_DOWNLOAD_SECRET);
   GitHub › Settings › Secrets › Actions: SUPABASE_FUNCTIONS_URL=https://hzonfbqsjxiwfmjywdlw.supabase.co/functions/v1, BACKUP_DOWNLOAD_SECRET=A, BACKUP_PASSPHRASE=B.
   Depois: rodar Actions › backup-diario › Run workflow e conferir luz no Cockpit.
3. Apagar ramo teste-workflow em https://github.com/tronnoconvert/gmarketing-equipe/branches
4. Depois de publicar: vincular contas Meta aos clientes (Painel de Voo › Contas sem cliente vinculado), teto de mídia e meta de custo por conversa.
5. Token Meta (usuário do sistema) para Pausar/Orçamento — passos em DEPLOY §8 / relatório item 17.

## Minha parte
- PUBLICADO 26/11 no ramo producao (2b86572): Painel de Voo real, sem dados fictícios, backups + cartão, auditoria, gestores veem todos, sem limite de verba + auditoria deOutroGestor. Bateria 3995/3995.
  auditoria mostra quando um gestor altera cliente de outro (flag deOutroGestor + notificação ao responsável e dono/admin). Se não terminou, retomar.
- Depois: rodar bateria completa, publicar no ramo `producao` (Netlify publica sozinho) incluindo netlify.toml do main (CSP/HSTS) — testar CSP no site.
- Agendar auditoria semanal (comando em docs/BACKUP-E-RESTAURACAO.md §Auditoria) e conferir 1º backup diário (03:10) e cron aos-voo-dados.
- Prontos e testados (não publicados): Painel de Voo nativo real (item 17), sem dados fictícios em produção, 3 backups + cartão no Cockpit, auditoria (131/132).
- Publicado: login imersivo + frase do dia, Ver como somente leitura, marca maior. Site em Netlify (ramo producao), DNS CNAME painel → gmarketing-painel.netlify.app, HTTPS ok.
- Cron ligado: aos-voo-dados (5 min), aos-backup-diario (06:10 UTC).

---
# Onde paramos — 25/11/2026

## No ar
- Painel: https://painel.agenciagmarketing.com.br (Hostinger, pasta public_html/painel; subir o zip de `npm run build` → dist/ sem agencia-os.html).
- Supabase hzonfbqsjxiwfmjywdlw: receita protegida no banco, senha provisória, 6 Edge Functions. APP_URL e Auth Site URL = painel.
- Logins criados: Gabriel (dono) e Rayane (admin), senha provisória entregue ao dono. BOOTSTRAP_SECRET apagado.
- GitHub: tronnoconvert/gmarketing-equipe (push funcionando).

## Painel de Voo nativo (item 17) — feito em 25/11
- `#/torre/voo` (visão geral, semáforo por cliente, fila "Comece por aqui", contas sem cliente vinculado) e `#/torre/voo/<conta>`
  (detalhe AO VIVO: KPIs, "por quê", investimento × teto, recomendações do motor, campanhas › conjuntos › anúncios, histórico).
- Edge Functions novas publicadas: **voo-dados** (Windsor, cache ≤ 5 min, detalhe ao vivo) e **voo-acao** (Meta Graph API).
  Tabelas `voo_cache` e `voo_mudancas` + função `voo_reservar_mudanca` aplicadas no banco (fim do `policies.sql`).
- Teste real `tests/live/voo.mjs`: 30/30 (72 contas ativas, gestor vê só a do cliente dele e sem receita, busca ao vivo ~2 s,
  SIM/ver como/escopo/“não configurado” recusados no servidor, limite 4/h no banco, tela de produção sem erros) e limpeza completa.
- **Pendente do dono:** `META_ACCESS_TOKEN` (DEPLOY §8.3) para liberar pausar/orçamento; cadastrar/importar os clientes e
  vincular as contas (o painel lista as 72 em "Contas sem cliente vinculado"); ligar o agendamento `aos-voo-dados` (DEPLOY §8.4).

## Próximo (minha parte)
1. (Feito) Item 17 — Painel de Voo nativo com dados reais.
2. (Decidido) Contas inativas do Windsor ficam de fora; gestor reconecta se precisar (docs/RECONECTAR-CONTA-WINDSOR.md).
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
