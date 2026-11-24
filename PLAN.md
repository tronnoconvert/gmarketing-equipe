# Agência OS — plano de implementação

App único para a agência (pt-BR, R$, dd/mm/aaaa). Une: Painel do Dono (Cockpit), Financeiro, Clientes, Operação, Equipe,
Torre de Controle (rotinas/integrações + Painel de Voo Meta Ads já existente), Comercial, Alertas e Insights,
Webinars (lançamentos), Campanha (conta própria de tráfego via Windsor), Notificações entre a equipe, Administração
(usuários, logins, permissões, cadastro de equipe e clientes).

Todos os dados são ILUSTRATIVOS (nomes fictícios). Nunca usar nomes reais de clientes.

## 1. Decisões (brainstorm resolvido, sem perguntas pendentes)

| Dúvida | Decisão |
|---|---|
| Stack | SPA sem framework: ES modules em `src/`, empacotado com esbuild em `dist/` (hospedagem estática) e `dist/agencia-os.html` (arquivo único para preview). Sem dependências de runtime além de `@supabase/supabase-js` carregado por CDN **somente** quando configurado. |
| Backend | Supabase (Auth + Postgres + RLS + Edge Functions). Sem Supabase configurado o app roda em **modo demonstração** (localStorage, dados semeados, login com usuários de teste). Mesmo código, troca de adapter em `src/core/store.js`. |
| Segredos | `WINDSOR_API_KEY`, `MONDAY_API_TOKEN`, `META_*`, `SUPABASE_SERVICE_ROLE_KEY` só em Edge Functions. Front só conhece `SUPABASE_URL` + `SUPABASE_ANON_KEY` (públicos por design, protegidos por RLS). |
| Torre de Controle (gestor Meta Ads) já pronta | Entra no menu como "Torre de Controle › Painel de Voo", carregada em iframe (`public/torre/torre-controle.html`). A seção "Torre de Controle" do documento do dono (rotinas e integrações) vira "Torre de Controle › Rotinas e integrações". |
| Conta de Campanha (Windsor) | Dono informa a conta depois. Tela pronta com dados simulados + tela de configuração "Conta conectada" (account_id), e Edge Function `windsor-proxy` pronta para ligar. |
| Tema | Claro por padrão (mesma família visual da Torre: azul #0B6BE8, fundo tingido #F1F3F9, janelas brancas flutuando com sombra suave), com tema escuro azul-marinho. LEDs exatamente como o documento. |
| Selos | Modelo "A · Marcador" (ponto + texto, sem caixa) como padrão do app novo. Nada de pílulas pastel. |
| Gráficos | Biblioteca própria em SVG (`src/core/charts.js`), sem dependências. Tooltips, eixos legíveis, sem 3D. |
| Notificações | In-app (sino + central), menções `@nome` em comentários, botão "Notificar alguém" em qualquer entidade, preferências por pessoa (app / WhatsApp / e-mail — canais externos simulados no demo, via Edge Function `notify` em produção). |
| Permissões | Papéis + matriz por módulo (ver §5). "Ver como" para Dono/Admin. Escopo "só meus clientes" para tráfego/CS/produção. |
| Testes | Playwright (Chromium já instalado). `npm test` roda smoke + e2e em 1366, 1920 e 390 px: sem erros de console, sem rolagem horizontal, todas as rotas, fluxos críticos. (agent-browser da Vercel não está disponível neste ambiente; Playwright cobre o mesmo.) |

## 2. Heurísticas de Nielsen — checklist obrigatório para TODO módulo
1. **Visibilidade do status**: LED + rótulo em texto (nunca só cor), "atualizado há X", skeleton/loading, toasts após ações.
2. **Correspondência com o mundo real**: vocabulário de agência (MRR, churn, ROAS, CPL, inscritos, comparecimento), R$, datas dd/mm.
3. **Controle e liberdade**: Cancelar em todo modal, "Desfazer" no toast após editar/excluir, Esc fecha, voltar do navegador funciona (rotas por hash).
4. **Consistência**: mesmos componentes de `src/core/ui.js`; mesma posição de ações (primária à direita), mesmos LEDs.
5. **Prevenção de erros**: validação inline antes de salvar, confirmação para excluir/ações destrutivas, campos com máscara (CNPJ, telefone, R$), limites.
6. **Reconhecer em vez de lembrar**: filtros visíveis como chips, busca global, recentes, avatares com nome no title, legendas nos gráficos.
7. **Flexibilidade e eficiência**: atalhos (`/` busca, `g c` cockpit, `n` notificações, `?` ajuda), ações em lote, filtros salvos na URL.
8. **Estética minimalista**: o vermelho só para o que exige ação; verde não chama atenção; nada de decoração sem função.
9. **Recuperação de erros**: mensagens dizem o que houve + o que fazer ("Token do Meta expirou. Reconecte em Integrações.").
10. **Ajuda e documentação**: ícone `?` com explicação em cada indicador (como é calculado), estados vazios que ensinam o próximo passo.

## 3. Estrutura de arquivos e dono de cada arquivo (evita conflito entre subagentes)

```
src/
  index.html            (core)
  main.js               (core)  — boot, registra módulos
  core/                 (core)  — NÃO editar fora da fase core
    store.js  auth.js  perms.js  router.js  ui.js  charts.js  led.css  base.css  notify.js  shell.js  fmt.js  seed-core.js
  modules/<mod>/        (um subagente por módulo)
    index.js   — export default { id, title, icon, routes, render, mount? }
    data.js    — dados de exemplo do módulo (semente)
    style.css  — estilos com prefixo .m-<mod>
public/torre/torre-controle.html (cópia da Torre já publicada)
supabase/ schema.sql, policies.sql, functions/<nome>/index.ts
tests/ <mod>.spec.mjs + e2e.spec.mjs + run.mjs
build.mjs  README.md  DEPLOY.md
```

## 4. Contratos do core (os módulos usam SOMENTE isto)

### fmt.js
`brl(v)` "R$ 1.234", `brl2(v)` "R$ 1.234,56", `brlK(v)` "R$ 186,4 mil" / "R$ 14,2k" curto via `brlK(v,{short:true})`, `pct(v,d=1)` "27,4%", `pp(v)` "1,1 pp", `num(v)`, `dec(v,d)`, `data(d)` "24/11/2026", `dataCurta(d)` "24/nov", `hora(d)` "23:42", `rel(d)` "há 4 min" / "em 18 min", `iniciais(nome)`, `esc(s)` (escape HTML — usar SEMPRE em texto vindo de dados).

### store.js
Coleções (arrays de objetos com `id` string): `users, team, clients, contacts, contracts, services, healthHistory, deliveries, tasks, invoices, payables, cash, deals, routines, routineRuns, integrations, alerts, alertRules, notifications, comments, activity, webinars, campaignAccount, campaignDaily, campaigns, onboarding, meetings, timeEntries, goals, settings`.
```
db.list(col, pred?) -> array (cópia)       db.get(col, id) -> obj|null
db.insert(col, obj) -> obj (gera id, createdAt, createdBy)   db.update(col, id, patch) -> obj (updatedAt)
db.remove(col, id) -> obj removido         db.seed(col, arr) (só se vazio; usado pelos data.js)
db.on(fn) -> unsubscribe  (fn(col, op, obj) após qualquer escrita)
db.mode -> 'demo' | 'supabase'             db.reset() (demo: limpa e ressemeia)
```
Toda escrita registra em `activity` ({quem, oque, col, refId, quando}) quando `opts.log` for texto: `db.update(col,id,patch,{log:'alterou MRR'})`.

### auth.js / perms.js
`auth.user()` → usuário logado `{id, nome, email, papel, teamId, avatarCor}`; `auth.login(email, senha)`, `auth.logout()`, `auth.verComo(userId)` (só dono/admin), `auth.real()` (usuário real mesmo em "ver como").
`can(modulo, acao='ver')` → bool. Ações: `ver`, `editar`, `excluir`, `admin`. `escopoClientes()` → `'todos'` ou array de clientIds.
Papéis: `dono`, `admin`, `head_trafego`, `gestor_trafego`, `cs`, `producao` (social/design/copy/dev), `financeiro`, `comercial`, `leitura`.

### router.js
Rotas por hash: `#/cockpit`, `#/clientes`, `#/clientes/:id`, `#/clientes/:id/resultados`... `router.go(path)`, `router.params`, `router.query` (lê/escreve `?f=...`). Módulo declara `routes: ['clientes', 'clientes/:id', 'clientes/:id/:aba']`.

### ui.js (componentes — retornam strings HTML, exceto os imperativos)
`led(estado, rotulo?)` estado ∈ ok|warn|err|off → `<span class="led-w"><i class="led ok"></i>Operando</span>`
`kpi({rotulo, valor, delta, deltaBom, comp, serie, ajuda, alerta, href})` — card de indicador com sparkline.
`card({titulo, acoes, corpo, ajuda, cls})`, `tabela({cols:[{k,l,r(row),num,sort}], linhas, vazio, onRowHref})`,
`chips(lista, ativo, param)`, `tabs(lista, ativa, base)`, `selo(estado, texto)` (modelo Marcador),
`avatar(pessoa, tam)`, `barra(pct, faixas)`, `vazio({titulo, texto, acao})`, `ajuda(texto)` (ícone ? com tooltip), `ic(nome)` (ícones lucide inline).
Imperativos: `modal({titulo, corpo, confirmar, cancelar, perigo, onConfirmar}) -> Promise<bool>`, `form(el)` helpers de validação,
`toast(msg, {desfazer, tipo})`, `drawer({titulo, corpo})`, `confirmar(texto)`.

### charts.js (SVG, responsivo, tema claro/escuro via currentColor/var)
`spark(serie, {cor})`, `linhas({series:[{nome, dados, cor, tracejado}], rotulos, alturas, formato, destaque})`,
`barras({rotulos, series, empilhado, horizontal, formato})`, `dispersao({pontos:[{x,y,r,rotulo,estado}], eixoX, eixoY, quadrantes})`,
`rosca({fatias, centro})`, `funil({etapas:[{rotulo, valor}]})`, `calor({linhas, colunas, valores, formato})`, `gauge(valor, {max, faixas})`,
`cascata({passos:[{rotulo, valor, tipo:'base'|'mais'|'menos'|'total'}]})`, `historico30(estados[])` (30 quadradinhos ok/warn/err/off).
Todos com `<title>`/aria-label e tooltip no hover.

### notify.js
`notify.enviar({para:[userId], titulo, texto, link, tipo, de})`, `notify.minhas()`, `notify.naoLidas()`, `notify.marcarLida(id)`,
`comentarios(refCol, refId)` → HTML de thread com caixa de comentário com autocomplete de `@nome` (menção gera notificação),
`botaoNotificar(refCol, refId, titulo)` → botão que abre modal "Notificar alguém" (pessoas, mensagem, prioridade, canal).

### shell.js
Layout: menu lateral (grupos, contadores de pendência, item ativo), topo global com **seletor de período (Mês/Trimestre/12 meses)** (`shell.periodo()`), **busca global** (clientes, pessoas, tarefas, webinars — cada módulo registra provedores via `shell.buscaProvedor(fn)`), **luz mestra** (estado geral = pior LED de alerts/routines/integrations, com texto "2 alertas críticos"), notificações (sino + painel), perfil (ver como, tema, sair). Contadores: `shell.contador(modId, fn)`.

## 5. Papéis e permissões (padrão; editável em Administração › Permissões)

| Módulo | dono | admin | head_trafego | gestor_trafego | cs | producao | financeiro | comercial | leitura |
|---|---|---|---|---|---|---|---|---|---|
| Cockpit | admin | editar | — | — | — | — | — | — | — |
| Financeiro | admin | editar | — | — | — | — | — | — | — |
| Clientes | admin | editar | editar | editar (seus) | editar (seus) | ver (seus) | ver | ver | ver |
| Operação | admin | editar | editar | editar | editar | editar (suas tarefas) | — | — | ver |
| Equipe | admin | editar | ver (próprio) | ver (próprio perfil) | ver (próprio) | ver (próprio) | ver | ver (próprio) | — |
| Torre › Rotinas | admin | editar | editar | ver | ver | — | — | — | ver |
| Torre › Painel de Voo | admin | editar | editar | editar (suas contas) | ver | — | — | — | ver |
| Comercial | admin | editar | — | — | — | — | ver | editar | — |
| Alertas | admin | editar | ver | ver (seus) | ver (seus) | ver (seus) | ver (seus) | ver (seus) | ver |
| Webinars | admin | editar | editar | editar | editar | editar (preencher) | ver | ver | ver |
| Campanha (conta própria) | admin | admin | — | — | — | — | — | — | — |
| Receita (MRR, faturamento) | admin | admin | — | — | — | — | — | — | — |
| Padrões e regras | admin | editar | editar | — | — | — | — | — | — |
| Administração | admin | editar | — | — | — | — | — | — | — |

## 6. Módulos (especificação resumida — o documento do dono está em `docs/spec-dono.md`, seguir valores exatos)

1. **cockpit** — §3 do documento: 6 KPIs com sparkline (MRR em risco destacado), Saúde da agência 78 com 4 componentes, Receita×Custos 12m + projeção 3m, Mapa da carteira (MRR × health, LED por cliente), Torre resumo (8 rotinas), Precisa de você hoje (5 itens com ação), Capacidade do time (zona 70–85%), Renovações 60 dias.
2. **financeiro** — §8: Ponte de MRR, Fluxo de caixa com projeção 90d, DRE simplificada, Contas a receber por faixa, Rentabilidade por cliente (receita × margem × horas), Concentração (alerta top3 > 40%), Margem por serviço, CAC/LTV/LTV:CAC/payback, lista de faturas com ação Cobrar.
3. **clientes** — §5, §6, §7: KPIs, matriz risco×valor, carteira (filtros), retenção por safra, onboarding. **Ficha do cliente** com abas: Visão geral · **Resultados** (metas × real ao longo do tempo com as AÇÕES da equipe marcadas no gráfico — liga o resultado do cliente ao trabalho da agência) · **Ações da equipe** (linha do tempo: tráfego, CS, produção; filtros por pessoa/tipo; inclui alterações vindas da Torre) · Entregas · Health score (componentes × meta, histórico) · Financeiro do cliente · Cadastro (todos os campos do §7, com acessos e LEDs) · Comentários (menções). Cadastrar/editar cliente com validação (CNPJ, e-mail, telefone).
4. **operacao** — contadores, atrasadas, % no prazo por semana, calendário de carga, projetos e marcos, retrabalho e tempo de aprovação, SLA de 1ª resposta; quadro de tarefas (a fazer/andamento/aprovação/feito) com responsável, cliente, prazo; criar tarefa; comentar e notificar.
5. **equipe** — ver `docs/equipe-prompt.md` (prompt detalhado).
6. **torre** — §4: resumo, rotinas (todos os campos, histórico 30d, Ver log, Rodar agora / Retomar), integrações (Reconectar), execuções de ontem em linha do tempo 00–24h, "atualizado há 20 s" ao vivo, Configurar alertas, + Nova rotina. Submenu Painel de Voo = iframe da Torre Meta Ads.
7. **comercial** — pipeline por etapa (kanban com valores), receita ponderada, conversão e ciclo, propostas enviadas × ganhas, metas do mês, origem dos leads.
8. **alertas** — feed acionável (filtro por gravidade/área, resolver, atribuir, adiar), regras configuráveis (limite, canal WhatsApp/Slack/e-mail/app, destinatário), os 7 alertas essenciais pré-criados, insights automáticos em linguagem simples.
9. **webinars** — ver `docs/webinars-prompt.md`.
10. **campanha** — conta de tráfego do dono (Windsor): KPIs (investimento, resultados, custo por resultado, CTR, CPM, frequência, ROAS), gráfico diário, tabela por campanha/conjunto/anúncio, ranking de criativos, recomendações com "Por quê", comparação de períodos, tela "Conexão" (account_id, status LED, última sincronização). Visível só para dono (e admin ver).
11. **admin** — Usuários (convidar, papel, ativo/inativo, redefinir senha, último acesso), Equipe (cadastro de colaborador: cargo, custo/hora, horas contratadas, skills, gestor), Permissões (matriz editável), Clientes (atalho para cadastro), Integrações e chaves (só status — chaves ficam no servidor), Preferências de notificação, Auditoria (activity).
12. **notificacoes** — central (todas / não lidas / menções / atribuídas a mim), marcar lidas, preferências.

## 7. Fases
1. **Core** (1 subagente): core completo + shell + login demo + página exemplo + testes do core.
2. **Módulos em paralelo** (subagentes, cada um só nos seus arquivos): A cockpit+financeiro · B clientes · C equipe+operacao · D torre+alertas+comercial · E webinars+campanha · F admin+notificacoes+supabase/edge functions.
3. **Integração e revisão** (eu): rodar tudo, e2e, revisão de Nielsen e visual, correções, build único, publicar preview, DEPLOY.md.
