# Agência OS — backend no Supabase

Tudo o que o app precisa no servidor: banco (Postgres com RLS), login (Supabase Auth) e Edge Functions
(chaves secretas e integrações). O guia passo a passo para quem não é desenvolvedor está em `docs/DEPLOY.md`.

```
supabase/
  schema.sql            tabelas records (todas as coleções do app), profiles, orgs + triggers
  policies.sql          RLS: matriz de permissões por papel × módulo, escopo "seus clientes", notificações só do destinatário
  cron.sql              (opcional) agendamentos com pg_cron: regras de alerta a cada 15 min, monday.com de hora em hora
  functions/
    _shared/            CORS, validação, cliente service role, envio WhatsApp/e-mail/Slack, avaliação das regras
    admin-invite/       convidar usuário, reenviar convite, ativar/desativar login, status das integrações (Dono/Admin)
    windsor-proxy/      dados da conta de Campanha via Windsor.ai (só Dono; a chave nunca sai do servidor)
    monday-sync/        importa clientes dos quadros 18425955775 (Cadastro) e 18425955783 (Painel de Voo)
    notify/             envia por WhatsApp/e-mail/Slack as notificações criadas no app
    routines-runner/    avalia as 7 regras de alerta, cria alertas, notifica e registra a execução
    guardiao/           segurança das contas Meta: detecta possível invasão, pausa a conta, quarentena e sirene (a cada 2 min)
  tests/
    supabase_stub.sql   simula o mínimo do Supabase num Postgres local (só para testes)
    rls_test.sql        48 verificações de RLS (Ana, Paulo, Helena, Gabriel, anon, service role)
```

## Setup (resumo)

1. Instale a CLI: `npm i -g supabase` (ou `brew install supabase/tap/supabase`) e faça `supabase login`.
2. Na pasta do projeto: `supabase link --project-ref SEU-PROJETO`.
3. Banco: no painel, **SQL Editor** → cole e rode `schema.sql`, depois `policies.sql`
   (ou `psql "$DATABASE_URL" -f supabase/schema.sql -f supabase/policies.sql`). Ambos podem ser rodados de novo.
   Troque `minha-agencia` no final de `schema.sql` pelo id da sua agência e use o mesmo id em `public/config.js` (`orgId`).
4. Funções: `supabase functions deploy admin-invite windsor-proxy monday-sync notify routines-runner guardiao`
5. Segredos (só os que for usar):
   ```
   supabase secrets set APP_URL=https://painel.suaagencia.com.br CRON_SECRET=uma-frase-longa-aleatoria
   supabase secrets set WINDSOR_API_KEY=... WINDSOR_ACCOUNT_ID=act_123
   supabase secrets set MONDAY_API_TOKEN=...            # MONDAY_BOARD_IDS=18425955775,18425955783 (padrão)
   supabase secrets set RESEND_API_KEY=... EMAIL_FROM="Agência OS <avisos@suaagencia.com.br>"
   supabase secrets set ZAPI_INSTANCE_ID=... ZAPI_TOKEN=... ZAPI_CLIENT_TOKEN=...   # ou TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_WHATSAPP_FROM
   supabase secrets set SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
   supabase secrets set META_ACCESS_TOKEN=...
   ```
   `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são fornecidas automaticamente às funções.
   Opcionais: `ALLOWED_ORIGIN` (CORS; padrão `*`), `DEFAULT_ORG_ID`, `TZ_AGENCIA` (padrão America/Sao_Paulo),
   `MONDAY_COLUMN_MAP` (JSON `{ "<boardId>": { "<colunaId>": "campo" } }`), `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS` (porta 465).
6. Primeiro Dono: veja "Criar o primeiro Dono" em `docs/DEPLOY.md` (cria o login no Auth e roda 2 inserts).
7. (Opcional) Agendamentos: edite os 3 valores no topo de `cron.sql` e rode no SQL Editor.

## Como o RLS decide

* `records.id = '<col>:<id>'`, `records.col`, `records.data` (jsonb) — exatamente o que `src/core/store.js` lê e grava.
* `profiles` liga `auth.users` → papel, org, `team_id` (escopo de clientes) e `app_user_id` (destinatário de notificações).
  Mudar o papel no app (registro `users`) atualiza `profiles` por trigger, desde que quem alterou administre usuários.
* `can_col(col, ação)` usa a matriz de permissões (padrão `perm_padrao` + diferenças salvas em `settings:perms`) e o mapa
  coleção → módulos (`col_modules`, documentado no topo de `policies.sql`). Ver = 1, Editar = 2, Total = 4; excluir exige Total,
  ou Dono/Admin com Editar — igual a `perms.can` no front.
* Escopo "seus clientes" (gestor de tráfego, CS, produção): `clients.respId`/`clients.equipe` contém o `team_id` da pessoa;
  registros com `clientId` seguem o cliente.
* Notificações: o destinatário lê e só altera `lida`; o remetente também enxerga o que enviou (exigência do upsert do front).
* Auditoria (`activity`): só inserção, sempre em nome de quem grava; ninguém altera ou apaga.
* Guardas: senha de demonstração nunca é gravada; nunca fica sem um Dono ativo; usuário comum não altera o próprio papel.

## Testar o SQL localmente (sem Supabase)

```
createdb aos_teste
psql -d aos_teste -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stub.sql -f supabase/schema.sql -f supabase/policies.sql -f supabase/tests/rls_test.sql
# termina com: TODOS OS TESTES DE RLS PASSARAM
```

## Chamar as funções

* Do app: `db.supabase.functions.invoke('admin-invite', { body: { acao: 'convidar', nome, email, papel, teamId } })`.
* Do terminal (teste): `curl -X POST https://SEU-PROJETO.supabase.co/functions/v1/routines-runner -H "Authorization: Bearer SUA_ANON_KEY" -H "x-cron-secret: $CRON_SECRET" -d '{"dryRun":true}'`.
* Todas respondem JSON; erros vêm como `{ "erro": "mensagem em português", "codigo": "..." }` com o status HTTP adequado.

## Limitações conhecidas

* `users` e `team` são diretório: todos da agência leem (inclusive `custoHora` do cadastro da equipe). Se isso for sensível,
  mova custos para uma coleção do Financeiro.
* O store carrega tudo na memória no início; com RLS, cada pessoa só recebe o que pode ver. Depois do primeiro login a página
  precisa recarregar os dados (ver "Bug conhecido do core" em `docs/DEPLOY.md`).
