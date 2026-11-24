# Como colocar o Agência OS no ar

Guia para o dono da agência. Não precisa saber programar: são cópias, colagens e alguns comandos no terminal.
Se preferir, entregue este documento a um freelancer — leva de 2 a 4 horas na primeira vez.

Hoje o app roda em **modo demonstração**: os dados ficam só no navegador de quem abre. Para a equipe usar de verdade
(cada um com seu login, dados compartilhados e protegidos), ele precisa de um servidor — o **Supabase** — e de um
endereço na internet — a **hospedagem estática**.

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
| **E-mail** (opcional) | Convites, redefinição de senha e notificações | **Resend** (3.000 e-mails/mês grátis) ou o SMTP do seu e-mail | R$ 0 a US$ 20 |
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
supabase functions deploy admin-invite windsor-proxy monday-sync notify routines-runner guardiao
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

Para o e-mail de convite sair com o seu domínio, configure também o SMTP do Supabase Auth
(**Authentication › Emails › SMTP Settings**) com os dados do Resend.

### 2.5 Criar o primeiro Dono
1. **Authentication › Users › Add user › Create new user**: seu e-mail e uma senha forte, marque *Auto Confirm User*.
2. No **SQL Editor**, rode (troque o e-mail, o nome e o id da agência):
```sql
insert into public.profiles (user_id, org_id, papel, team_id, app_user_id)
select id, 'agencia-leao', 'dono', 't-gabriel', 'u-gabriel' from auth.users where email = 'voce@suaagencia.com.br';

insert into public.records (id, col, data, org_id) values
('users:u-gabriel', 'users', jsonb_build_object('id','u-gabriel','nome','Gabriel Leão','email','voce@suaagencia.com.br','papel','dono',
  'ativo',true,'teamId','t-gabriel','iniciais','GL','avatarCor','#0B6BE8','cargo','Fundador e CEO',
  'authId',(select id::text from auth.users where email = 'voce@suaagencia.com.br')), 'agencia-leao'),
('team:t-gabriel', 'team', jsonb_build_object('id','t-gabriel','nome','Gabriel Leão','email','voce@suaagencia.com.br','cargo','Fundador e CEO',
  'area','Diretoria','papel','dono','userId','u-gabriel','ativo',true,'status','online','custoHora',0,'horasMes',0,'skills','[]'::jsonb), 'agencia-leao');
```
3. As demais pessoas você convida pelo próprio app: **Administração › Usuários › Convidar usuário** (cada uma recebe um
   e-mail para criar a senha). Antes, cadastre-as em **Administração › Equipe**.

### 2.6 Ligar o app ao Supabase
Abra `public/config.js` e preencha (são valores públicos):
```js
window.AOS_CONFIG = Object.assign({
  supabaseUrl: 'https://abcd1234.supabase.co',
  supabaseAnonKey: 'eyJ...anon...',
  orgId: 'agencia-leao',
  seedDemo: false,     // não grava os dados fictícios do modo demonstração no banco real
  realtime: true,
}, window.AOS_CONFIG || {});
```
**Nunca** coloque a service_role key, a chave da Windsor, tokens do monday/Meta ou do WhatsApp neste arquivo.

### 2.7 Gerar e publicar o site
```bash
npm install
npm run build          # cria a pasta dist/
```
* **Netlify:** app.netlify.com › Add new site › Deploy manually › arraste a pasta `dist/`.
* **Render:** New › Static Site › conecte o repositório › Build command `npm install && npm run build` › Publish directory `dist`.
* **Vercel:** New Project › importe o repositório › Build command `npm run build` › Output directory `dist`.

Depois aponte o domínio (ex.: `painel.suaagencia.com.br`) no painel da hospedagem (ela mostra o registro CNAME para
criar no Registro.br) e atualize `APP_URL` e a *Site URL* do Supabase se o endereço mudar.

### 2.8 Agendamentos (opcional, recomendado)
Para os alertas rodarem sozinhos a cada 15 min e o monday sincronizar de hora em hora: edite os 3 valores no topo de
`supabase/cron.sql` (endereço do projeto, anon key e o mesmo `CRON_SECRET`) e rode no SQL Editor.

---

## 3. Checklist de teste (15 minutos)

- [ ] Abrir o endereço do app: aparece a tela de login **sem** o selo "Modo demonstração".
- [ ] Entrar com o Dono criado no passo 2.5.
- [ ] Administração › Integrações › Verificar agora: LEDs verdes nas integrações configuradas.
- [ ] Administração › Equipe: cadastrar uma pessoa · Usuários: convidá-la · ela recebe o e-mail e consegue entrar.
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

## 5. Antes de usar com dados reais (o que ainda não foi testado)

- **Login no modo servidor:** o ajuste de recarregar os dados logo após o login já foi feito (`db.reload()` em `src/core/store.js`, chamado por `auth.login`). Mesmo assim, o modo servidor **nunca rodou contra um projeto Supabase de verdade** — faça o checklist da seção 3 com um usuário de teste antes de convidar a equipe.
- **Funções do servidor:** passaram na checagem de tipos (`deno check`) e as regras de segurança passaram em 48 testes num PostgreSQL 16 local, mas as chamadas reais ao Windsor, monday.com, WhatsApp e e-mail só podem ser testadas com as chaves de vocês.
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
