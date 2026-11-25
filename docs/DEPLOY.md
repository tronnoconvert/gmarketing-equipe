# Como colocar o Agência OS no ar

Guia para o dono da agência. Não precisa saber programar: são cópias, colagens e alguns comandos no terminal.
Se preferir, entregue este documento a um freelancer — leva de 2 a 4 horas na primeira vez.

Hoje o app roda em **modo demonstração**: os dados ficam só no navegador de quem abre. Para a equipe usar de verdade
(cada um com seu login, dados compartilhados e protegidos), ele precisa de um servidor — o **Supabase** — e de um
endereço na internet — a **hospedagem estática**.

---

## 0. Situação do projeto Gmarketing (25/11/2026)

Já está pronto no Supabase **gmarketing-equipe** (ref `hzonfbqsjxiwfmjywdlw`, us-east-1):

| Item | Situação |
|---|---|
| Banco (`schema.sql` + `policies.sql`) | ✅ aplicado, org `gmarketing`, matriz de permissões padrão. **Sem dados** (nenhum usuário, nenhum registro). |
| Receita protegida no banco | ✅ quem não tem a permissão **receita** (padrão: só Dono e Admin) não recebe MRR, faturamento, ticket, valores de contrato, comissões alheias, faturas/caixa/DRE — nem pela tela, nem pela rede, nem pelo realtime (seção 7). |
| Login sem e-mail | ✅ senha provisória criada pelo admin + troca obrigatória no 1º acesso (seção 2.5). |
| Edge Functions | ✅ publicadas: `admin-invite`, `notify`, `routines-runner`, `windsor-proxy`, `monday-sync`, `guardiao`, `voo-dados`, `voo-acao` (todas ativas; sem chave de provedor respondem "não configurado"). |
| Segredos gerados | ✅ `CRON_SECRET`, `BOOTSTRAP_SECRET`, `DEFAULT_ORG_ID=gmarketing` (Edge Functions › Secrets). |
| `public/config.js` | ✅ preenchido com a URL e a anon key (públicas), `orgId: 'gmarketing'`, `seedDemo: false`. |
| Agendamentos (pg_cron) | ⏸ infraestrutura pronta (Vault + `aos_chamar_funcao`), **nenhum job ligado** — ver 2.8. |
| Teste de ponta a ponta | ✅ `tests/live/producao.mjs` passou contra o projeto real (35 verificações) e apagou tudo no final. |

**Falta o dono:** (1) mandar os e-mails reais de Gabriel e Rayane para criar os dois primeiros acessos (2.5);
(2) hospedar a pasta `dist/` na Hostinger com o domínio (2.7); (3) colar as chaves dos provedores (2.4) quando for ligar
Windsor, monday, WhatsApp e Meta.

---

## 1. O que você vai contratar e por quê

| Serviço | Para que serve | Plano sugerido | Custo mensal estimado* |
|---|---|---|---|
| **Supabase** | Banco de dados, logins e as "funções do servidor" (onde ficam as chaves secretas) | Free para testar; **Pro** para usar com a equipe (backups diários, não pausa) | Free: R$ 0 · Pro: US$ 25 (≈ R$ 130–150) |
| **Hospedagem estática** | Publica as telas do app (a pasta `dist/`) | **Netlify** Free, **Render** Static Site Free ou **Vercel** (o plano grátis da Vercel é só para uso não comercial; para a agência use o Pro) | Netlify/Render: R$ 0 · Vercel Pro: US$ 20 (≈ R$ 110) |
| **Domínio** | Endereço próprio, ex.: `painel.suaagencia.com.br` | Registro.br (se já tem o domínio da agência, só cria o subdomínio) | ≈ R$ 40 por **ano** (≈ R$ 3,50/mês) |
| **Windsor.ai** | Puxa os dados da conta de anúncios da agência (tela Campanha) | Plano básico | US$ 19–99 (≈ R$ 100–550), conforme nº de contas |
| **monday.com** | Já usado pela agência; o app importa o cadastro de clientes | Plano atual (a API já vem incluída) | R$ 0 a mais |
| **WhatsApp** (opcional) | Notificações e resumo diário no WhatsApp | **Z-API** (simples, número próprio) ou **Twilio** (API oficial) | Z-API ≈ R$ 100/instância · Twilio: por mensagem (centavos) + taxa da Meta |
| **E-mail** (opcional) | Notificações por e-mail (os logins usam senha provisória, sem e-mail) | **Resend** (3.000 e-mails/mês grátis) ou o SMTP do seu e-mail | R$ 0 a US$ 20 |
| **Slack** (opcional) | Alertas no canal da equipe | Webhook do Slack | R$ 0 |

\*Estimativas de novembro/2026, com dólar entre R$ 5,20 e R$ 5,80. Preços mudam: confirme no site de cada serviço.

**Total típico:** começar testando por **R$ 0** (Supabase Free + Netlify + Resend grátis). Em produção com a equipe:
**≈ R$ 250 a R$ 400/mês** (Supabase Pro + Windsor + Z-API), mais o domínio por ano.

---

## 2. Passo a passo

### 2.1 Criar o projeto no Supabase
1. Crie uma conta em supabase.com → **New project**. Região: **South America (São Paulo)**. Anote a senha do banco num gerenciador de senhas.
2. Em **Settings › API**, copie e guarde:
   * **Project URL** (ex.: `https://abcd1234.supabase.co`) — é público.
   * **anon public key** — é pública por design (os dados são protegidos pelas regras do banco).
   * **service_role key** — **SECRETA**. Nunca coloque no app, em e-mail ou no WhatsApp. Ela já fica disponível só dentro das funções.
3. Em **Authentication › Providers › Email**, deixe "Confirm email" ligado. Em **Authentication › URL Configuration**, coloque
   o endereço final do app em *Site URL* (ex.: `https://painel.suaagencia.com.br`).

### 2.2 Criar as tabelas e as regras de segurança
1. No painel do Supabase, abra **SQL Editor › New query**.
2. Abra o arquivo `supabase/schema.sql`, troque no final `'minha-agencia', 'Minha Agência'` pelo identificador e nome da
   sua agência (ex.: `'agencia-leao', 'Agência Leão'`), copie tudo, cole e clique **Run**.
3. Faça o mesmo com `supabase/policies.sql` (sem alterar nada). Pode rodar os dois de novo quando houver atualização.
4. Confira em **Database › Tables**: devem existir `records`, `profiles`, `orgs`, `perm_padrao`, `col_modules`, todas com o
   cadeado **RLS enabled**.

### 2.3 Publicar as funções do servidor
No computador (com Node.js instalado), na pasta do projeto:
```bash
npm install -g supabase
supabase login
supabase link --project-ref abcd1234          # o código que aparece na URL do projeto
supabase functions deploy admin-invite windsor-proxy monday-sync notify routines-runner guardiao voo-dados voo-acao
```

### 2.4 Guardar as chaves no servidor (segredos)
Cada chave vai **só** para o servidor, com `supabase secrets set`. Grave apenas as que for usar:
```bash
supabase secrets set APP_URL=https://painel.suaagencia.com.br
supabase secrets set CRON_SECRET=escreva-aqui-uma-frase-longa-e-aleatoria
supabase secrets set WINDSOR_API_KEY=sua-chave WINDSOR_ACCOUNT_ID=act_123456789
supabase secrets set MONDAY_API_TOKEN=seu-token
supabase secrets set RESEND_API_KEY=sua-chave EMAIL_FROM="Agência OS <avisos@suaagencia.com.br>"
supabase secrets set ZAPI_INSTANCE_ID=... ZAPI_TOKEN=... ZAPI_CLIENT_TOKEN=...
supabase secrets set SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
supabase secrets set META_ACCESS_TOKEN=...
```
Depois, no app, **Administração › Integrações › Verificar agora** mostra um LED verde para cada integração configurada
(só mostra se existe — o valor nunca aparece). Onde pegar cada chave: botão "Como configurar" na mesma tela.

#### Lembretes de vencimento por WhatsApp para os clientes (Financeiro › Automação)
A rotina `routines-runner` (agendada a cada 15 min no passo 2.8) também manda, no horário escolhido na tela, um lembrete
de mensalidade para o WhatsApp do contato **financeiro** do cliente (sem financeiro, o **decisor**), com o rodapé fixo
"⚠️ Mensagem automática — por favor, não responda. Dúvidas: fale com <responsável>". Uma vez por fatura + regra
(3 dias antes / no dia / 3 dias depois) + dia — o envio fica registrado na própria fatura (`lembretes`), e é isso que
impede repetir. Começa **desligado** em produção: ligue em Financeiro › Automação.

| Variável | Para quê |
|---|---|
| `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN` (+ `ZAPI_CLIENT_TOKEN` se a conta exigir) | WhatsApp pela Z-API (preferido se as duas existirem) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (ex.: `+5511999990000`) | WhatsApp pela Twilio (alternativa) |
| `TZ_AGENCIA` (opcional, padrão `America/Sao_Paulo`) | fuso usado para "hoje" e para o horário de envio |
| `PAGAMENTO_URL_BASE` (opcional, ex.: `https://pagar.suaagencia.com.br/fatura`) | monta `{link_boleto}` como `<base>/<nº da fatura>` quando a fatura não tem `linkBoleto` |

```bash
supabase secrets set ZAPI_INSTANCE_ID=... ZAPI_TOKEN=... TZ_AGENCIA=America/Sao_Paulo PAGAMENTO_URL_BASE=https://pagar.suaagencia.com.br/fatura
```
Sem provedor de WhatsApp configurado nada é enviado: a fatura recebe o registro "falhou (WhatsApp não configurado)" e não
há nova tentativa no mesmo dia. Para testar sem enviar: chame a função com `{"dryRun": true}` (conta quantos sairiam);
para rodar só os alertas: `{"lembretes": false}`.

Os logins **não dependem de e-mail** (senha provisória, seção 2.5). Resend/SMTP só são usados para notificações por e-mail.

### 2.5 Criar os primeiros donos (Gabriel e Rayane) — sem e-mail
O login funciona **sem envio de e-mail**: quem administra cria o acesso e recebe uma **senha provisória** (mostrada uma
única vez) para mandar à pessoa por WhatsApp. No primeiro acesso o app obriga a criar a senha pessoal
(mínimo 10 caracteres, confirmação e indicador de força). A senha provisória nunca fica gravada no banco do app.

Os **dois primeiros** acessos (Dono e Admin) são criados uma única vez com o script `scripts/criar-dono.mjs`, que chama a
função `admin-invite` (ação `bootstrap`) protegida pelo segredo `BOOTSTRAP_SECRET`:

1. **Defina o valor do segredo** (o valor gerado na instalação não pode ser lido de volta — o painel do Supabase só mostra o
   resumo/digest dos segredos): Supabase › **Edge Functions › Secrets** › `BOOTSTRAP_SECRET` › editar › cole uma frase
   longa e aleatória sua (mínimo 32 caracteres; ex.: gere em um gerenciador de senhas) › **Save**.
   Pelo terminal: `supabase secrets set BOOTSTRAP_SECRET=...`.
2. No computador, na pasta do projeto (Node 18+):
   ```bash
   BOOTSTRAP_SECRET='a-mesma-frase' node scripts/criar-dono.mjs --nome "Gabriel Leão" --email EMAIL-DO-GABRIEL --papel dono
   BOOTSTRAP_SECRET='a-mesma-frase' node scripts/criar-dono.mjs --nome "Rayane Leão" --email EMAIL-DA-RAYANE --papel admin
   ```
   Cada comando mostra a **senha provisória** uma vez. Envie a cada pessoa no privado.
3. Cada um entra no app com o e-mail + senha provisória → tela **"Crie sua nova senha"** → pronto.
4. **Desligue o bootstrap:** apague o segredo `BOOTSTRAP_SECRET` (Edge Functions › Secrets › excluir).

Regras de segurança do bootstrap: só funciona com o segredo certo e **enquanto a agência tiver menos de 2 donos/admins**;
cria o login no Auth (e-mail já confirmado), o perfil, o registro `users` e o colaborador em `team`. Rodar de novo com o
mesmo e-mail, antes da pessoa criar a senha, gera outra senha provisória (se ela se perdeu). Para conferir no SQL Editor:
```sql
select u.email, p.papel, p.trocar_senha from public.profiles p join auth.users u on u.id = p.user_id;
```

**Demais pessoas:** Administração › Usuários › **Convidar usuário** (antes, cadastre a pessoa em Administração › Equipe e
vincule). O app mostra a senha provisória com botão **Copiar** e o aviso "envie por WhatsApp".
**Esqueceu a senha?** Na tela de login, "Esqueci minha senha" orienta a pedir ao administrador; o admin usa
Administração › Usuários › ⋯ › **Redefinir senha** (gera nova senha provisória; só um Dono redefine a senha de outro Dono).

### 2.6 Ligar o app ao Supabase
**Já feito** para o projeto Gmarketing: `public/config.js` tem `supabaseUrl`, a anon key (pública), `orgId: 'gmarketing'`,
`seedDemo: false` e `realtime: true`. **Nunca** coloque a service_role key, a chave da Windsor, tokens do monday/Meta ou do
WhatsApp neste arquivo.

### 2.7 Gerar e publicar o site
```bash
npm install
npm run build              # PRODUÇÃO: cria dist/ usando public/config.js (Supabase)
AOS_DEMO=1 npm run build   # DEMONSTRAÇÃO: mesmo app, config vazio → dados fictícios no navegador
```
`npm test` sempre gera o build de demonstração. O arquivo único de prévia (`dist/agencia-os.html`, "Protótipo Oficial")
nunca carrega `config.js`, então continua em modo demonstração mesmo no build de produção.
O app carrega a biblioteca do Supabase de `cdn.jsdelivr.net` (supabase-js 2.45.4); para não depender do CDN, copie o
arquivo para a hospedagem e aponte `supabaseEsm` em `config.js`.

* **Hostinger (escolha do dono):** hPanel › Gerenciador de arquivos › `public_html` (ou a pasta do subdomínio, ex.:
  `painel.seudominio.com.br`) › envie o **conteúdo** de `dist/` (index.html, app.js, app.css, config.js).
* **Netlify:** app.netlify.com › Add new site › Deploy manually › arraste a pasta `dist/`.
* **Render:** New › Static Site › conecte o repositório › Build command `npm install && npm run build` › Publish directory `dist`.
* **Vercel:** New Project › importe o repositório › Build command `npm run build` › Output directory `dist`.

Depois aponte o domínio (ex.: `painel.suaagencia.com.br`) no painel da hospedagem (ela mostra o registro CNAME para
criar no Registro.br) e atualize `APP_URL` e a *Site URL* do Supabase se o endereço mudar.

### 2.8 Agendamentos (opcional, recomendado)
No projeto Gmarketing a infraestrutura já está pronta: extensões `pg_cron`/`pg_net`, os 3 valores no **Vault**
(`aos_functions_url`, `aos_anon_key`, `aos_cron_secret` = o mesmo `CRON_SECRET` das funções) e a função
`public.aos_chamar_funcao` (testada: o `routines-runner` respondeu 200). **Nenhum job está ligado**, porque o monday-sync e o
Guardião precisam das chaves dos provedores e o routines-runner ainda não tem regras de alerta cadastradas
(produção começa vazia). Ligue no SQL Editor quando for a hora:
```sql
-- regras de alerta a cada 15 min (depois de cadastrar as regras em Alertas)
select cron.schedule('aos-routines-runner', '*/15 * * * *', $$select public.aos_chamar_funcao('routines-runner')$$);
-- monday.com de hora em hora (depois de MONDAY_API_TOKEN)
select cron.schedule('aos-monday-sync', '7 * * * *', $$select public.aos_chamar_funcao('monday-sync')$$);
-- Guardião a cada 2 min (depois de META_SYSTEM_USER_TOKEN ou WINDSOR_API_KEY)
select cron.schedule('aos-guardiao', '*/2 * * * *', $$select public.aos_chamar_funcao('guardiao')$$);
```
Em outro projeto: edite os 3 valores no topo de `supabase/cron.sql` e rode no SQL Editor.

---

## 3. Checklist de teste (15 minutos)

- [ ] Abrir o endereço do app: aparece a tela de login **sem** o selo "Modo demonstração".
- [ ] Entrar com o Dono criado no passo 2.5 (senha provisória → tela "Crie sua nova senha").
- [ ] Administração › Integrações › Verificar agora: LEDs verdes nas integrações configuradas.
- [ ] Administração › Equipe: cadastrar uma pessoa · Usuários: convidá-la · copiar a senha provisória · ela entra e cria a senha dela.
- [ ] Entrar como essa pessoa (ou usar "Ver como"): ela vê só os módulos do papel e só os clientes dela.
- [ ] Notificações › Enviar mensagem para ela com WhatsApp/e-mail marcados: chega (se os provedores estiverem configurados).
- [ ] Administração › Permissões: mudar uma célula, salvar, e confirmar que a pessoa passa a ver/não ver o módulo.
- [ ] Clientes: cadastrar um cliente e conferir em outro navegador que ele aparece (dados compartilhados).
- [ ] Torre de Controle: "Rodar agora" nas regras (ou aguardar o agendamento) gera alertas em Alertas.
- [ ] Financeiro › Automação: ligar os lembretes com o horário de daqui a 15 min e uma fatura de teste vencendo em 3 dias para um contato seu: chega o WhatsApp com o rodapé "não responda" e a fatura mostra "Lembrete WhatsApp enviado".
- [ ] Administração › Auditoria: as ações acima aparecem com quem fez e quando.

## 4. Checklist de segurança

- [ ] **RLS ligado** em todas as tabelas (cadeado em Database › Tables). Os arquivos `policies.sql` já fazem isso.
- [ ] **Nenhum segredo no front:** `public/config.js` só tem URL, anon key e orgId. Chaves só via `supabase secrets set`.
- [ ] **Verificação em duas etapas (2FA)** ligada no Supabase, na hospedagem, no monday, na Windsor e no e-mail de quem é Dono/Admin.
  (No app, o 2FA por usuário aparece como "Não ativado" até ligarmos o MFA do Supabase Auth — próximo passo recomendado.)
- [ ] **Backups:** no plano Pro, backups diários automáticos (Database › Backups). No Free, exporte periodicamente
  (`supabase db dump > backup.sql`).
- [ ] Senha do banco e service_role key guardadas num gerenciador de senhas, nunca em planilha ou chat.
- [ ] Desativar o acesso de quem sai da agência no mesmo dia (Administração › Usuários › Desativar acesso).
- [ ] Revisar Administração › Auditoria uma vez por mês.
- [ ] Se uma chave vazar: gere outra no serviço, rode `supabase secrets set` de novo e publique as funções.

## 5. Antes de usar com dados reais (o que já foi e o que ainda não foi testado)

- **Login no modo servidor: testado de verdade** em 25/11/2026 contra o projeto gmarketing-equipe com
  `tests/live/producao.mjs` (bootstrap do dono, troca obrigatória de senha, criação de gestor pela tela, leitura sem receita,
  edição preservando o MRR, realtime, notificações) — 35 verificações, e o teste apagou tudo no final.
- **Funções do servidor:** publicadas e respondendo (401 sem sessão; "não configurado" sem chave de provedor). As chamadas
  reais ao Windsor, monday.com, WhatsApp e e-mail só podem ser testadas com as chaves de vocês.
- **Regras de segurança:** `supabase/tests/rls_test.sql` — 92 verificações num PostgreSQL 16 local.
- **Alertas essenciais e catálogo de rotinas:** a produção começa vazia (os 7 alertas e as rotinas do modo demonstração
  usam pessoas fictícias). Cadastre as regras em Alertas depois que a equipe existir.
- **Conta da tela Campanha:** informe o ID da conta de anúncios (formato `act_...`) em Campanha › Conexão depois de configurar o `WINDSOR_API_KEY`.

## 6. Guardião de segurança (possível invasão nas contas Meta Ads)
Detalhes em `docs/SEGURANCA-INVASAO.md`. A função `guardiao` roda a cada 2 minutos (última linha de `supabase/cron.sql`),
pausa sozinha as campanhas de uma conta com sinal forte de invasão e avisa todos os gestores de tráfego, o dono e os admins.

1. No Business Manager do Meta: **Configurações do negócio › Usuários do sistema › Adicionar** (papel Admin), atribua as contas de
   anúncios dos clientes com controle total e gere um token **sem expiração** com as permissões **ads_management**, **ads_read** e
   **business_management**.
2. Grave os segredos:
   ```bash
   supabase secrets set META_SYSTEM_USER_TOKEN=token-do-usuario-do-sistema
   supabase secrets set META_SYSTEM_USER_ID=id-do-usuario-do-sistema      # as pausas do próprio Guardião não contam como alteração
   # opcionais
   supabase secrets set META_GRAPH_VERSION=v21.0 GUARDIAO_FUSO_MIN=-180
   supabase secrets set GUARDIAO_PAUSA_VIA=meta                            # ou windsor (+ WINDSOR_API_KEY e WINDSOR_ACTIONS_URL)
   ```
   Sem `META_SYSTEM_USER_TOKEN` a função usa a Windsor (`WINDSOR_API_KEY`) só para gasto do dia: não lê o registro de atividades.
   WhatsApp e e-mail usam os mesmos segredos do `notify` (Z-API/Twilio, Resend/SMTP).
3. No app, em cada cliente: preencha o **ID da conta de anúncios** (`metaAdAccountId`, `act_…`) e o **teto de mídia mensal**.
   Em cada pessoa da equipe que mexe nas contas: o **ID de usuário do Meta** (`metaUserId`) — quem não estiver na lista é "fora da equipe".
4. Publique e agende: `supabase functions deploy guardiao` e rode o trecho final de `supabase/cron.sql`.
5. Teste sem pausar nada:
   `curl -X POST https://SEU-PROJETO.supabase.co/functions/v1/guardiao -H "Authorization: Bearer SUA_ANON_KEY" -H "x-cron-secret: $CRON_SECRET" -d '{"dryRun":true}'`

## 7. Receita protegida no banco (regra do dono)
"Dinheiro que entra (MRR, faturamento, receita, ticket, ROAS da agência, lucro, valores de contrato, comissões) só para Dono e
Admin" vale **no banco**, não só na tela. Quem não tem a permissão **receita** (linha "Receita e faturamento" em
Administração › Permissões; padrão: só Dono e Admin):

- **não lê** faturas, contas a pagar, caixa, movimentos de MRR, DRE e custos (`invoices payables cash mrrMoves finance costs`);
- recebe **sem as chaves de receita**: `clients.mrr`, `contracts.mrr/valor`, `webinars.ticket/faturamento/vendas.{reembolsos,pendentes,custos,taxa}`,
  `webinarDaily.faturamento`, `campaignDaily/campaigns.action_values_purchase`; `deals.valor` e a meta de novo MRR só para quem
  edita o Comercial; das comissões (`clients.comissoes`) só a **própria**, já em R$/mês;
- não recebe alertas com MRR/faturamento no título (o trecho com R$ sai do detalhe), insights de receita, regras de alerta do
  Financeiro e as rotinas de MRR/cobrança; notificações e auditoria chegam com "valor restrito" no lugar de R$; o WhatsApp/e-mail
  das funções segue a mesma regra;
- **ao gravar**, o servidor preserva os valores que a pessoa não vê (ela edita o segmento do cliente e o MRR continua igual).

Como funciona: o app lê pela função `ler_records`/`ler_record` e grava por `gravar_record`/`apagar_record`
(`supabase/policies.sql`); o SELECT direto na tabela `records` dessas coleções é bloqueado para quem não vê receita; o realtime
avisa só "o registro X mudou" (`records_feed`) e o app busca de novo pela função segura. Mudar a matriz em Administração ›
Permissões (ex.: liberar receita para o Financeiro) vale na hora, também no banco.

## 8. Painel de Voo (item 17) — Meta Ads dos clientes com dados reais

Telas: **Torre de Controle › Painel de Voo** (`#/torre/voo`) e o detalhe de cada conta (`#/torre/voo/<id da conta>`).
Em produção os dados vêm do Meta pela **Windsor.ai** (`WINDSOR_API_KEY`, já gravada); no modo demonstração (testes, arquivo
único "Protótipo Oficial") os dados são fictícios (`src/modules/torre/voo-demo.js`) — a produção nunca mostra dados de demonstração.

### 8.1 Como os dados chegam (frescor)
| Onde | De onde | Frescor |
|---|---|---|
| Visão geral (todas as contas) | Edge Function `voo-dados` `{acao:'ler'}` → cache no servidor (tabela `voo_cache`) | no máximo **5 min**: se passou, devolve o que tem e atualiza em segundo plano; a tela mostra "atualizado há X min" |
| Detalhe de um cliente | `voo-dados` `{acao:'conta', conta}` → busca **ao vivo** só daquela conta (hoje + 14 dias, campanha/conjunto/anúncio, status e orçamento) e grava no cache | ao abrir; a cada **2 min** com a aba visível; botão "Atualizar agora" (mínimo de **20 s** entre buscas da mesma conta pela mesma pessoa, conferido no servidor) |
| Depois de pausar/mudar orçamento | o app busca a conta ao vivo de novo | o valor aplicado aparece com "aplicado — aguardando confirmação do Meta" até a leitura confirmar |

- A Windsor guarda uma cópia dos dados do Meta e a própria API do Meta atrasa alguns minutos o **gasto e os resultados**. Com
  `META_ACCESS_TOKEN`, o **status e o orçamento** do detalhe vêm direto do Meta (Graph API), em tempo real.
- Só as **contas ativas** da Windsor aparecem (decisão do dono). 1ª busca de todas as contas leva até ~2 min; depois é incremental
  (hoje e ontem; dias antigos 1×/dia). Alcance/frequência da semana são estimados (a Windsor manda alcance por dia).
- Quem vê o quê (no servidor): Dono, Admin e Head de Tráfego veem **todas** as contas, inclusive as sem cliente; gestor de tráfego vê só
  as contas ligadas aos **clientes dele**. Faturamento/ROAS (`action_values_purchase`) só para quem tem a permissão **receita**.

### 8.2 Ligar cada conta ao cliente
Clientes › (cliente) › Cadastro › Editar › **Metas**: "Contas de anúncios (Meta)" (`act_…`, várias separadas por vírgula — só Dono,
Admin e Head de Tráfego) e "Meta de custo por conversa" (o semáforo compara com ela) — mais o "Teto de mídia por mês" (aviso de verba).
Atalho: no Painel de Voo, card **"Contas sem cliente vinculado"** › escolha o cliente › **Vincular**.

### 8.3 Ações no Meta (pausar e orçamento) — token do usuário do sistema (`META_ACCESS_TOKEN`)
Sem o token o painel funciona só para leitura e mostra "Ações no Meta aguardando o token do usuário do sistema — peça ao administrador".
Passo a passo (feito uma vez pelo dono, no computador, logado no Facebook que administra o Business Manager da agência):
1. Abra **https://business.facebook.com/settings** e escolha o Business Manager da agência (canto superior esquerdo).
2. Menu da esquerda › **Usuários** › **Usuários do sistema** › botão **Adicionar**.
3. Nome: `Agencia OS Painel de Voo` · Função: **Administrador** › **Criar usuário do sistema**.
4. Com o usuário selecionado › **Atribuir ativos** › **Contas de anúncios** › marque **todas as contas dos clientes** › ative
   **Gerenciar contas de anúncios (controle total)** › **Salvar alterações**. (Contas que estão em outro BM: peça ao cliente para
   compartilhar a conta com o BM da agência como parceiro antes.)
5. Ainda no usuário › **Gerar novo token** › App: escolha o app da agência (se não houver, crie em https://developers.facebook.com/apps ›
   **Criar app** › tipo **Empresa** › vincule ao mesmo Business Manager e volte a este passo) › Validade: **Nunca** ›
   Permissões: marque **ads_management**, **ads_read** e **business_management** › **Gerar token** › **Copiar**.
   (O token aparece uma vez só. Não mande por WhatsApp nem e-mail.)
6. Abra **https://supabase.com/dashboard/project/hzonfbqsjxiwfmjywdlw/functions/secrets** › **Add new secret** ›
   Name: `META_ACCESS_TOKEN` › Value: cole o token › **Save**. (O Guardião usa o mesmo token: se quiser, grave também como
   `META_SYSTEM_USER_TOKEN`; o painel aceita qualquer um dos dois.)
7. Pronto: em até 1 minuto os botões **Pausar** e **Orçamento** do Painel de Voo ficam ativos. Teste pausando um anúncio de teste
   (digite **SIM**).

Regras que valem no servidor (`voo-acao`), não só na tela: **SIM** obrigatório em toda alteração; só **pausar** e **orçamento diário**
(reativar, arquivar e excluir não existem pelo painel; "Criar ou subir campanha: somente pelo Gerenciador, via 4G."); no máximo
**4 mudanças de orçamento por conjunto (ou campanha CBO) por hora** (tabela `voo_mudancas`, função `voo_reservar_mudanca`);
só contas do escopo da pessoa e o item precisa ser da conta (conferido no Meta); "ver como" recusado; conta em quarentena do Guardião
recusada; tudo registrado em Administração › Auditoria e em Clientes › Resultados e ações. A única alteração sem SIM continua sendo a
pausa automática do Guardião (invasão).

### 8.4 Agendamento (recomendado)
Mantém a visão geral fresca mesmo sem ninguém com a tela aberta (SQL Editor; já está no fim de `supabase/cron.sql`):
```sql
select cron.schedule('aos-voo-dados', '*/5 * * * *', $$select public.aos_chamar_funcao('voo-dados', '{"acao":"atualizar"}'::jsonb)$$);
```
Para desligar: `select cron.unschedule('aos-voo-dados');`.

### 8.5 Teste real
`SQL_CMD=/caminho/q.sh node tests/live/voo.mjs` cria 2 logins e 1 cliente de teste, confere escopo, receita, busca ao vivo, regras das
ações e o limite por hora, e apaga tudo no final; com `OUT=<build de produção>` e `SUPABASE_ESM_FILE` também abre a tela com o gestor de teste (25/11/2026: 30/30).
