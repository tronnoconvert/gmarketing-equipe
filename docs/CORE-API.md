# Agência OS — API do core (para quem escreve módulos)

Tudo em `src/core/`. Módulos usam **somente** esta API. Página de referência visual: abra o app e vá em `#/_ui`
(todos os componentes e gráficos, nos dois temas). Código-fonte da vitrine: `src/core/ui-demo.js` — copie dali.

## 1. Módulo

`src/modules/<id>/index.js` (substitua o placeholder) + opcionais `data.js` e `style.css` (prefixo `.m-<id>`; o build junta todos os `style.css`).

```js
import './data.js';                       // data.js chama db.seed(...) na importação
export default {
  id: 'clientes', titulo: 'Clientes', icone: 'building', grupo: 'gestao',   // grupos: visao|gestao|trafego|marketing|sistema
  rota: 'clientes', routes: ['clientes', 'clientes/:id', 'clientes/:id/:aba'],
  perm: 'clientes',                       // opcional (padrão = id); chave da matriz de permissões
  watch: ['clients', 'tasks'],            // opcional: só re-renderiza quando estas coleções mudam (padrão: todas menos activity/notifications/comments)
  sub: [{ id, titulo, rota, perm, prefixo }], // opcional: submenu (usado pela Torre)
  render(ctx) { return `<div class="pg">…</div>`; },      // string HTML (pode retornar Promise<string>)
  mount(el, ctx) { /* listeners */ return () => {/* cleanup */}; },  // opcional
  contador() { return { n: 5, estado: 'err', rotulo: '5 clientes em risco' }; }, // opcional — ver "Regra do menu" abaixo
  busca(q) { return [{ tipo: 'Clientes', titulo: 'Grupo Orion', sub: 'Varejo', href: '#/clientes/c-orion', led: 'err', icone: 'building' }]; }, // q já normalizado (minúsculo, sem acento)
  // ---- opcionais (novos, todos retrocompatíveis) ----
  usaPeriodo: true,                       // mostra o seletor Mês/Trimestre/12 meses nesta página (ou (path) => bool). Ver §9.
  menu: false,                            // fora do menu lateral (a rota continua valendo). Padrão: só 'notificacoes' fica fora.
  palavras: ['sinônimos'],                // termos extras para a paleta de comandos achar a página
  comandos() { return [{ id, titulo: 'Nova tarefa', sub, icone, acao: () => {…} | '#/rota', gatilho: '[data-nova]', palavras: [] }]; }, // ações na paleta (Ctrl+K). Ver §9.
};
```
**Regra do menu (contador):** número só quando `estado: 'err'` (bolinha vermelha com o número). `estado: 'warn'` vira um **ponto âmbar sem número** (`aria-label`/`title` "N itens pedindo atenção"). Qualquer outro estado (ou nenhum) **não aparece** no menu. `rotulo` vira o `title`.
`title`/`icon` também são aceitos. Ordem do menu: `src/modules/registry.js`.

**ctx** = `{ params, query, path, periodo ('mes'|'tri'|'12m'), periodoInfo {id, rotulo, meses, inicio, fim, comparacao:'vs outubro'}, user, real, can(mod, acao) | can(acao) (= módulo atual), pode(acao), escopoClientes(), perms, db, ui, charts, fmt, notify, router, shell, refresh(), migalha(texto), mod }`.
- `ctx.migalha('Grupo Orion')` adiciona o último nível do breadcrumb e o `<title>`.
- **Início por papel:** dono/admin → `#/cockpit`; head_trafego e gestor_trafego → `#/torre/voo`; cs, producao, comercial, financeiro, leitura → `#/mesa` (se o papel não puder ver o destino, cai em `#/mesa` e depois no 1º item permitido). Vale para o login, o logo, "Ir para o início" (404/acesso restrito) e o atalho "Hoje" do celular. `shell.home()` devolve a rota.
- O shell chama `render` → `mount` a cada navegação, mudança de período e mudança relevante no db (debounce 140 ms; adiado enquanto o usuário digita na página ou há modal aberto). Cleanup é chamado antes.
- Depois de cada render o shell hidrata gráficos (largura real), tooltips, `ui.embed` e textos `data-rel`.
- Os eventos devem ser delegados no `el` do `mount` (o HTML é recriado a cada render).

Layout utilitário: `.pg` (página, gap 20), `.stack`, `.row`, `.between`, `.g-kpi` (grade de KPIs), `.g2 .g3 .g4 .g-2-1 .g-1-2` (responsivas), `.fgrid` (formulário 2 colunas, `.full`), `.mut .num .sm .fw6 .trunc .t-ok .t-warn .t-err`.
Tokens CSS: `--bg --card --card-2 --card-3 --fg --fg2 --muted --faint --line --line-2 --acc --acc-soft --acc-ink --ok --warn --err --off --c1..--c6 --c2n --r --r-sm --sh`. Tema: `html[data-tema="escuro"]`.

## 2. fmt (`import * as fmt` ou `ctx.fmt`)
`brl(1234)` "R$ 1.234" · `brl2` "R$ 1.234,56" · `brlK(186400)` "R$ 186,4 mil" · `brlK(14200,{short:true})` "R$ 14,2k" · `pct(27.4)` "27,4%" · `pct(v,0)` · `pp(1.1)` "1,1 pp" · `num` · `dec(v,d)` · `compacto` · `data` "24/11/2026" · `dataCurta` "24/nov" · `mesAno` "nov/2026" · `mesLongo` · `diaSemana` · `hora` "23:42" · `dataHora` · `iso(d)` "2026-11-24" · `rel(d)` "há 4 min"/"em 18 min"/"ontem" · `diasAte(d)` · `iniciais` · `primeiro(nome)` · `plural(2,'cliente')` · `norm(s)` (busca) · `duracao(min)` · `toDate` · **`esc(s)` — sempre em texto vindo de dados.**

## 3. db (`ctx.db`)
```js
db.list(col, pred?)   // cópia; pred = função ou {campo: valor}
db.get(col, id) · db.find(col, pred) · db.count(col, pred?)
db.insert(col, obj, {log}) · db.update(col, id, patch, {log}) · db.remove(col, id, {log}) · db.upsert(col, obj, {log})
db.seed(col, arr, {chave?})  // semeia só se a coleção estiver vazia; com {chave} semeia uma vez mesmo se já houver dados (para 2 fontes na mesma coleção)
db.on((col, op, obj) => …) -> unsubscribe   // op: insert|update|remove|batch|reset|load|erro
db.batch(() => { … })                       // várias escritas, um evento
db.config(chave, padrao) · db.setConfig(chave, valor)   // coleção settings {id: chave, valor}
db.mode 'demo'|'supabase' · db.reset() (demo: apaga e ressemeia, recarrega)
db.dadosDemo                                 // true SÓ quando há dados de exemplo (modo demonstração). Ver abaixo.
```
- **Dados de exemplo × produção (`db.dadosDemo`)**: sementes (`db.seed`) e snapshots/constantes de demonstração (ex.: `cockpit/data.js`, séries de `financeiro/data.js`, `HISTORICO` do Comercial, `CLIENTES_BASE`/`FATURAVEIS` da Operação) só valem com `db.dadosDemo === true`. Produção (Supabase com `seedDemo:false`) → `false`: o módulo calcula das coleções reais e, sem dado, mostra estado vazio que ensina o próximo passo — **nunca** número fictício. Teste "produção vazia": build demo + `AOS_CONFIG.seedDemo = false` (LocalAdapter sem sementes, chave `aos-db-v1-vazio`) — `tests/producao-vazia.spec.mjs`. Não use `db.mode` para isso (`db.mode` diz só se há servidor).
- `insert` gera `id` (`cli-…`), `createdAt` (ISO), `createdBy` (usuário real). `update` grava `updatedAt/updatedBy`. `insert` com id existente substitui (use para **Desfazer** um `remove`).
- `{log: 'alterou MRR'}` grava em `activity` `{quem, quemNome, oque, col, refId, quando}`.
- Coleções: `users, team, clients, contacts, contracts, services, healthHistory, deliveries, tasks, invoices, payables, cash, deals, routines, routineRuns, integrations, alerts, alertRules, notifications, comments, activity, webinars, campaignAccount, campaignDaily, campaigns, onboarding, meetings, timeEntries, goals, settings` (+ coleções de módulos; `relatorios` = relatório semanal do gestor de tráfego `{id, clientId, semana:'2026-W48', enviadoPor, quando}`).
- **IDs canônicos** (use para ligar módulos): equipe `t-gabriel t-ana t-bruno t-felipe t-carla t-diego t-elisa t-rayane t-marina t-paulo t-helena t-lucas`; usuários `u-<mesmo nome>`; clientes `c-orion c-vida c-alfa c-technova c-imob c-bella c-studiofit c-autocenter c-petfeliz c-otica c-cafe`.
- Campos que o core lê: `clients.respId` (teamId) e `clients.equipe` ([teamId]) para escopo; `alerts.{estado|gravidade, status|resolvido}`, `routines.estado`, `integrations.estado` (`ok|warn|err|off`, `ativo:false` ignora) para a **luz mestra**.
- `team` (core): `{id, nome, iniciais, cargo, area, papel, email, userId, avatarCor, status: online|ausente|ferias, statusAte, custoHora, horasMes, faturavel, gestorId, skills, ativo, telefone, desde}`. Para acrescentar campos use `db.update` (não re-semeie).
- `users`: `{id, nome, iniciais, email, papel, teamId, avatarCor, cargo, ativo, senha (só demo), ultimoAcesso}`.
- Supabase: tabela genérica `records(id text pk = '<col>:<id>', col text, data jsonb, created_at, updated_at, org_id)`, tudo carregado na memória no boot pela função `ler_records` (já filtrada: RLS + receita); escritas por `gravar_record`/`apagar_record` (em fila por registro; o servidor preserva os valores de receita que a pessoa não vê); realtime pelo feed `records_feed` + `ler_record`. `await db._pendentes()` espera as gravações em andamento. Detalhes em `supabase/README.md`. Ativado por `window.AOS_CONFIG = {supabaseUrl, supabaseAnonKey, orgId?, seedDemo?, realtime?}` em `config.js`.

## 4. auth / perms
```js
auth.user()  // efetivo (em "ver como" = a pessoa vista) {id, nome, email, papel, teamId, avatarCor, cargo}
auth.real()  · auth.vendoComo() · auth.podeVerComo() · auth.verComo(userId) · auth.voltar()
auth.login(email, senha) -> Promise<{ok, erro} | {ok:false, trocarSenha:true, user}> · auth.trocarSenha(nova, confirmacao) (produção: senha provisória → senha pessoal, mín. 10) · auth.logout() · auth.esqueci(email) (produção: orienta pedir senha provisória ao admin) · auth.onChange(fn) · auth.demo
perms.can(mod, acao='ver')   // ações: ver | editar | excluir | admin
perms.nivel(mod) -> ''|'ver'|'editar'|'admin' · perms.escopo(mod) -> 'todos'|'seus'|'proprio'
perms.escopoClientes() -> 'todos' | [clientIds] · perms.podeCliente(id) · perms.filtrarPorEscopo(lista, 'clientId')
perms.PAPEIS (rótulo + descrição) · perms.MODULOS_PERM · perms.matriz() · perms.salvarMatriz(m) · perms.restaurarPadrao() · perms.rotuloPapel(p)
```
Matriz (PLAN §5) em `settings.perms` como `{mod: {papel: 'editar:seus'}}`. Chaves: `mesa cockpit financeiro clientes operacao equipe torre torre_voo comercial alertas webinars campanha notificacoes admin receita padroes`.
Papéis (colunas): `dono admin head_trafego gestor_trafego cs producao financeiro comercial leitura`. **Regra permanente do dono:** o que é só do Dono vale igual para o Admin (Rayane Leão) — Campanha e Receita = `admin` para os dois. `head_trafego` (Allan Vieira) = tudo do gestor de tráfego em todas as contas (clientes `editar`, torre/torre_voo `editar`, alertas `ver`) + `padroes` editar; sem receita, cockpit, financeiro nem Campanha. `gestor_trafego` (decisão do dono, 25/11/2026): clientes e torre_voo `editar` em TODOS os clientes (cobre colega ausente; Painel de Voo e Clientes abrem no filtro "Meus" com alternância "Meus / Todos"; contas sem cliente vinculado continuam só Dono/Admin/Head), nunca vê receita. `perms.meusClientes()` = ids dos clientes da pessoa.
**Decisão:** `excluir` exige nível `admin` no módulo, ou papel dono/admin com `editar`. `editar:seus`/`ver:proprio` → o módulo filtra os dados com `perms.escopo(mod)`/`escopoClientes()`.

## 5. router
`router.go('clientes/c-orion')` · `router.atualizar()` (relê a URL sem render) · `router.href(path, {f:'risco'})` (preserva `p`) · `router.params` · `router.query` · `router.path` · `router.setQuery({f:'risco'}, {render:true})` (sem recarregar; `push:true` cria histórico) · `router.back()`.
Atalhos globais: `Ctrl+K`/`⌘K` paleta de comandos · `/` busca · `n` notificações · `?` ajuda · `Esc` fecha · `g` + `c f l o e t m a w p n d` (cockpit, financeiro, clientes, operação, equipe, torre, comercial, alertas, webinars, campanha, notificações, admin).

## 6. ui (strings HTML, exceto imperativos)
```js
ui.ic('plus') · ui.led('err', 'Falhou') · ui.led('ok', false)  // só o ponto
ui.selo('warn', 'Vence amanhã')                 // modelo Marcador (ponto + texto)
ui.kpi({rotulo, valor, delta:'▲ 8,2%', deltaBom, comp, serie, ajuda, alerta, href, led, formatoSerie})  // deltaBom: true/false/null(neutro)/undefined(sobe=bom)
ui.delta('▼ 2 pp', false)
ui.card({titulo, sub, acoes, corpo, ajuda, icone, cls, pad:false (tabela encostada), rodape})
ui.cabecalho({titulo, sub, descricao, intro, acoes, voltar:{href, rotulo}, meta})  // introdução recolhe após 2 visitas (abaixo)
ui.tabela({cols:[{k, l, r(row), num, sort:false|fn, v(row) /*valor p/ ordenar*/, w, ajuda, mobile:false}], linhas, vazio, onRowHref:r=>'#/…', ordem:{k, dir}, mobile:'cards'|'scroll', altura, densa, legenda})
ui.chips([{id, rotulo, n, estado}], ativo, 'f')  // links que gravam ?f= ; param=null → botões [data-chip]
ui.tabs([{id:'', rotulo:'Visão geral'}, {id:'resultados', rotulo, n}], ativa, 'clientes/c-orion')
ui.seg([{id, rotulo}], ativo, {rotulo})          // botões [data-seg] aria-pressed
ui.btn({rotulo, icone, tipo:'pri'|'ghost'|'perigo'|'link', href, sm, attrs:{'data-x':''}}) · ui.btnIc('more', 'Mais ações', attrs)
ui.avatar(pessoaOuId, 28, {status:true}) · ui.avatares(ids, 4)   // mostra `foto` quando houver (abaixo)
ui.barra(118, {faixas:'ocupacao'|'meta'|'health'|[{ate, estado}], zona:[70,85], max, rotulo:false, fina})
ui.faixa(82, 'health') -> 'ok'                   // faixas ≥75 ok · 60–74 warn · <60 err
ui.vazio({icone, titulo, texto, acao:{rotulo, href, icone, attrs}, compacto}) · ui.aviso({tipo, titulo, texto, acao})
ui.lista([{estado, titulo, sub, meta, href, acao:{rotulo, href, attrs}}]) · ui.pares([[rotulo, html]]) · ui.skeleton({linhas, tipo:'kpi'})
ui.ajuda('Como é calculado…') · ui.rel(iso, {prefixo}) // "há 4 min" atualizado a cada 20 s
ui.embed({src, srcEscuro, titulo, altura})       // iframe com estado vazio se o arquivo não existir
ui.campo({nome, rotulo, tipo:'text|email|number|textarea|select|checkbox|radio|data|moeda|percent|cnpj|cpf|telefone|cep', valor, opcoes, obrigatorio, ajuda, dica, placeholder, multiplo, cls:'full'})
```
**Introdução da página (cabecalho):** o texto de apresentação aparece nas **2 primeiras visitas** de cada página (por pessoa, neste navegador — `localStorage aos-visitas:<userId>`, chave = padrão da rota, ex. `clientes/:id`). Da 3ª visita em diante vira um ícone **ⓘ** ao lado do título (tooltip no hover/foco/toque, `aria-label` "Sobre esta página: …" e o texto continua no DOM em `.sr` para leitores de tela). É tratado como introdução: `descricao` (sempre), ou `sub` que é frase completa (termina em `.`, `!` ou `…`). `sub` sem ponto final (status dinâmico, ex. "3 não lidas", "Varejo · cliente há 14 meses") fica sempre visível. `intro:false` força sempre visível; `intro:true` força recolher `sub`. Com `descricao` + `sub`, o `sub` fica sempre visível e só a descrição recolhe.

**Foto no avatar:** `ui.avatar` usa `foto` do registro (team ou user; resolve user→team por `teamId` e team→user por `userId`). Aceita data URL `data:image/(jpeg|png|webp);base64,…` ou `https://…`; outra coisa é ignorada. Renderiza `<img class="av-img" alt="Nome" loading="lazy">` circular (`object-fit:cover`) dentro do mesmo `.av` (tamanho, `title`, ponto de status iguais). Se a imagem falhar, um listener global remove o `<img>` e as iniciais aparecem. Todos os avatares do core (cartão do menu, perfil, sino, central, @menção, paleta, login rápido) passam por `ui.avatar`.
`await ui.lerFoto(file, {lado:256, qualidade:0.85})` → data URL JPEG 256×256 (recorte central quadrado, ~20–40 KB). Valida JPG/PNG/WebP e até 8 MB; rejeita com `Error` de mensagem em pt-BR ("Formato não suportado. Envie uma foto JPG, PNG ou WebP.", "A foto tem mais de 8 MB…", "Não foi possível ler esta imagem…"). Grave o resultado em `team.foto` com `db.update`. **Produção:** o ideal é enviar o arquivo ao Supabase Storage (bucket `avatars`, caminho `<orgId>/<teamId>.jpg`) e gravar a URL pública `https://…` em `foto`; o data URL funciona como está (fica no `records.data`), só ocupa mais espaço.

Imperativos:
```js
await ui.modal({titulo, sub, corpo, confirmar:'Salvar'|false, cancelar, perigo, largura:'sm'|'md'|'lg'|'xl', onAbrir(el), onConfirmar(el) /* false ou 'mensagem' mantém aberto */}) // -> bool
await ui.confirmar('Excluir rotina?', {titulo, confirmar:'Excluir', perigo:true})
const d = ui.drawer({titulo, sub, corpo, rodape, largura, onAbrir}); d.fechar(); await d.fechado
ui.toast('Cliente salvo.', {desfazer: () => db.insert(col, antigo), tipo:'ok'|'err'|'warn'|'info', acao:{rotulo, fn}})
ui.popover(ancora, html, {largura, alinhar, onFechar}) · ui.fecharTopo()
ui.overlay({html, cls, rotulo, onAbrir(box), onFechar}) -> {el, box, fechar}   // janela solta com fundo, foco preso e Esc (usada pela paleta)
ui.form.ler(el)            // moeda/percent → número, data → 'aaaa-mm-dd', checkbox → bool (vários → array)
ui.form.validar(el, {razao:'obrigatorio|min:3', cnpj:['obrigatorio'], x:[(v, dados) => v>0 ? '' : 'msg']}) // -> {ok, erros, dados}; usa também required/type=email/data-mask
ui.form.preencher(el, obj) · ui.form.limparErros(el) · ui.mascaras.cnpj(v) · ui.parse.moeda('R$ 1.234,56') · ui.valida.cnpj(v)
```
Modais: foco preso, Esc fecha, foco volta; em <560 px viram folha inferior. Enter num input confirma.

## 7. charts (`ctx.charts`, SVG; cores por `var(--c1..c6|--ok|--warn|--err)`)
`formato`: `'brl' | 'brlK' | 'mil' (valores já em mil; eixo "R$ mil") | 'pct' | 'dec' | 'num' | fn | {eixo, tip, unidade}`.
```js
charts.spark(serie, {cor, area, altura})
charts.linhas({series:[{nome, dados, cor, tracejado, area}], rotulos, altura, formato, projecaoDesde: 11, destaque:{i, texto, serie}, metas:[{valor, rotulo}], marcos:[{i, rotulo, cor}], rotuloMarcos, min, max})
charts.barras({rotulos, series:[{nome, dados, cor, cores:[por barra]}], empilhado, horizontal, formato, altura, destaque:i, metas, valores})
charts.dispersao({pontos:[{x, y, r, rotulo, estado, href, extra}], eixoX:{rotulo, formato, min, max}, eixoY, quadrantes:{x, y, rotulos:[supEsq, supDir, infEsq, infDir], destaque:'supDir'}, altura})
charts.rosca({fatias:[{rotulo, valor, cor}], centro:{valor, rotulo}, formato, legendaValor:'valor'})
charts.funil({etapas:[{rotulo, valor, bench}], formato}) · charts.calor({linhas, colunas, valores, formato, faixas:'ocupacao'})
charts.gauge(78, {max, faixas:'health'|[…], sub, texto}) · charts.cascata({passos:[{rotulo, valor, tipo:'base'|'mais'|'menos'|'total'}], formato})
charts.historico30(['ok','warn','err','off', …] | [{estado, rotulo, texto}])
```
Todos com `role="img"` + `aria-label`, tooltip no hover (`data-tip="Título\nlinha\nlinha"` funciona em qualquer elemento) e legenda quando há ≥2 séries. `marcos` = ações da equipe marcadas no gráfico de resultados.

## 8. notify
```js
notify.enviar({para:[userId], titulo, texto, link:'#/clientes/c-orion', tipo:'mencao'|'atribuicao'|'alerta'|'sistema'|'mensagem', de, prioridade:'normal'|'alta', canais:['app','whatsapp','email'], refCol, refId})
notify.minhas({filtro:'todas'|'nao_lidas'|'mencoes'|'atribuidas'|'alertas', limite}) · notify.naoLidas() · notify.marcarLida(id, true) · notify.marcarTodas()
notify.itemHtml(n)   // <li> pronto para a central (dentro de <ul class="np-l">)
notify.agrupar(lista) -> [{grupo:false, n} | {grupo:true, chave, tipo, itens, naoLidas, titulo:'3 menções em Grupo Orion', link, quando, alta}]
notify.listaHtml(lista, {limite}) · notify.grupoHtml(g) · notify.nomeRef(n)   // sino usa listaHtml (8 entradas; grupo conta 1)
notify.comentarios('clients', 'c-orion', {titulo:'Grupo Orion'})   // thread + caixa com @menção (gera notificação)
notify.botaoNotificar('clients', 'c-orion', 'Grupo Orion', {sm:true}) · notify.abrirNotificar({refCol, refId, titulo, para, texto})
```
Canais externos: simulados no demo (toast); em produção chamam a Edge Function `notify`.
**Aviso sonoro** (`src/core/som.js`, importado pelo notify): notificação NOVA para a pessoa logada vinda de outra pessoa (`para` = eu, `de` ≠ eu — escrita local, realtime do Supabase ou outra aba no demo via evento `storage`) toca um "plim" WebAudio de ~0,4 s, uma vez por notificação. Sem opção de desligar (decisão do dono). Não repete: ids em memória + `localStorage aos-som-tocadas:<uid>` e ignora notificações anteriores ao carregamento da página. Destrava o áudio no 1º clique/tecla; se ainda travado, toca no próximo gesto. Dispara `window` `aos:som` a cada toque (testes).
**Agrupamento:** notificações com o mesmo `refCol` + `refId` + `tipo` no mesmo dia viram um grupo no sino e na central ("3 menções em Grupo Orion"), expansível, com "marcar grupo como lido". Para agrupar, **passe `refCol`/`refId` no `notify.enviar`** (comentários com @menção já passam).
**Resumo diário:** preferência por pessoa em `settings notif:<userId>` → `{resumoDiario: bool, resumoHora: 'hh:mm' (padrão 08:00)}` (editor em `src/modules/notificacoes/prefs.js`, também na Administração). No demo, #/notificacoes mostra o card "Resumo de hoje" (não lidas por tipo + destaques). Em produção quem envia é a Edge Function `notify` chamada pela `routines-runner` (cron a cada 15 min): para cada pessoa com `resumoDiario` e `resumoHora` dentro da janela, e com não lidas, envia um resumo pelo canal preferido (WhatsApp ou e-mail), respeitando o horário de silêncio. (Implementação no servidor pendente — não altera o front.)

## 9. shell
`shell.periodo()` · `shell.periodoInfo()` · `shell.setPeriodo('tri')` · `shell.home()` · `shell.rotaPermitida(path)` · `shell.densidade()`/`setDensidade('compacta'|'confortavel')` · `shell.abrirPaleta(texto?)` · `shell.buscaProvedor(q => [...])` · `shell.contador(modId, fn)` · `shell.refresh()` · `shell.luzMestra()` · `shell.tema()`/`setTema('escuro')` · `shell.pagina(path, {titulo, render, mount})`.
Acesso negado e 404 são do shell (módulos não precisam checar `ver`). `window.AOS` expõe tudo no console.

**Seletor de período** só aparece onde muda os dados: módulos com `usaPeriodo` (bool ou `(path) => bool`) e a lista embutida `cockpit`, `financeiro`, `campanha` e `webinars` (só o painel `#/webinars`); páginas do core com `usaPeriodo:true` (`#/_ui`). No resto fica `visibility:hidden` no desktop (a busca não muda de lugar) e some no celular; `html.sem-periodo` marca o estado. `ctx.periodo` continua disponível em todas as páginas.

**Paleta de comandos** (`Ctrl+K` / `⌘K`, botão "Ctrl K/⌘K" na busca, item no perfil; `/` continua focando a busca). Junta: páginas do menu (+ `palavras`), resultados do `busca(q)` de **todos** os módulos visíveis, ações embutidas (Cadastrar cliente, Nova tarefa, Novo webinar, Nova oportunidade, Ir para Minha mesa, Ver notificações, Alternar tema, Densidade compacta/confortável, Ver como, Atalhos, Sair — cada uma só se a pessoa tiver permissão), comandos dinâmicos (`cobrar <cliente>` → faturas em aberto, abre `#/financeiro/receber?cobrar=<id>` para quem edita o Financeiro) e os `comandos()` dos módulos. Teclado: ↑ ↓ Enter Esc; vazia mostra **Recentes** (por pessoa, `localStorage aos-cmd-recentes:<userId>`), Ações e Páginas. ARIA: `combobox` + `listbox` + `option` agrupados (`group`), `aria-activedescendant`, contagem em `role=status`.
- `comandos()` roda com o usuário efetivo e deve **filtrar por permissão** (`perms.can`). Item: `{id?, titulo, sub?, icone?, acao: fn | '#/rota', gatilho?: 'seletor', palavras?: []}`. Mesmo `id` de um embutido o **substitui** (`cliente-novo`, `tarefa-nova`, `webinar-novo`, `oportunidade-nova`, `ir-mesa`, `notificacoes`, `tema`, `densidade`).
- `gatilho`: depois de navegar para `acao`/`href`, o shell espera a página renderizar e **clica** no seletor dentro de `#view` (ex.: "Nova tarefa" = `#/operacao/quadro` + `[data-nova]`, o mesmo botão do atalho `T`; "Nova oportunidade" = `#/comercial` + `[data-nova]`). Assim os módulos não precisam de `?nova=1`.

**Densidade compacta** (perfil › "Tabelas compactas", ou paleta): por pessoa (`localStorage aos-densidade:<userId>`), aplicada como `html[data-densidade="compacta"]`: linhas de tabela ~32 px (célula de 1 linha), cabeçalhos/cards/KPIs mais justos e gaps menores. Módulos com estilos próprios de tabela podem usar o mesmo seletor.

**Celular (< 700 px):** barra inferior fixa com 4 atalhos — Hoje (início do papel), Clientes, Tarefas (`#/operacao/quadro`; sem permissão → próximo permitido entre Webinars, Alertas, Comercial, Equipe) e Notificações (com contador). Respeita `safe-area-inset-bottom`, some com o teclado virtual aberto e com o menu lateral; `.view` ganha `padding-bottom` para o conteúdo não ficar atrás. Toasts no celular ficam no topo. O menu ☰ continua com o resto.

**Notificações** saiu do menu lateral (rota `#/notificacoes` mantida): acesso pelo sino ("Ver todas"), perfil ("Notificações e preferências"), barra inferior, paleta e `g n`.

## 9b. Segurança (Guardião) — `invasao.js` e `sirene.js`
`invasao.registrarIncidente(incidente, {evento:'invasao'|'reincidencia', clientId, origem})` · `invasao.assumir(id)` · `await invasao.liberar(id, {confirmacao:'SIM', checklist, selecionadas, restaurar})` · `invasao.abrirIncidente(id)` · `invasao.abrirSaida(id)` · `invasao.incidentes()/abertos()/emQuarentena()`.
`sirene.tocar(chave)` · `sirene.parar()` · `sirene.silenciar()` · `sirene.testar()` · `sirene.estado()`. Notificação `tipo:'invasao'`, `prioridade:'critica'`. Motor: `src/shared/guardiao.mjs`. Detalhes: `docs/SEGURANCA-INVASAO.md`.

## 9c. Padrões e regras — `src/core/padroes/`
Catálogo de tudo o que a plataforma usa para decidir (limites, faixas, pesos, fórmulas): `gestao.js` (Clientes, Equipe, Operação, Financeiro, Webinars, Alertas, Comercial, Acesso) e `trafego.js` (Torre, Orçamento, Recomendações, Invasão). Formato da entrada em `index.js`.
`padrao(id, fallback)` (valor atual: override em `settings.padroes` ou fábrica; entradas com `fonte:{col,id,param}` leem/gravam no registro de origem, ex. `alertRules.params`) · `valores()` · `definicao(id)` · `alterado(id)` · `definir({id: valor}, quem)` (histórico em `settings.padroesHistorico`) · `restaurar(ids, quem)` · `historico(id?)`. `window.AOS.padroes` no console.
**Módulos leem `padrao(id)` em vez de números fixos** (ex.: `ui.FAIXAS.health/ocupacao` são dinâmicas). Tela: `#/padroes`, `#/padroes/:secao` (`tudo` = página única para imprimir), permissão `padroes`. Regras dos motores ficam nas mesmas chaves `settings.motorRegras` e `settings.guardiaoRegras`.

## 10. Testes
`npm test` (build + servidor + Playwright em 1366, 1920 e 390 px; falha em erro de console, `pageerror`, requisição falha ou rolagem horizontal). Só um spec: `node tests/run.mjs clientes`; só um viewport: `VP=390 node tests/run.mjs clientes`; `SKIP_BUILD=1`, `VERBOSE=1`.
```js
// tests/clientes.spec.mjs
export default async function (t) {
  await t.login();                    // dono; t.login('ana@agencia.demo')
  t.step('carteira');
  await t.ir('#/clientes');           // navega + checa rolagem horizontal
  t.ok(await t.page.isVisible('.tbl'), 'tabela visível');
}
```

## Decisões e desvios do PLAN §4
- Contrato do módulo usa `titulo/icone/grupo/rota` (aceita `title/icon`), mais `sub`, `perm`, `watch`, `contador`, `busca`.
- `ctx.periodo` é o id (`'mes'|'tri'|'12m'`); detalhes em `ctx.periodoInfo`.
- Torre: permissões separadas `torre` (Rotinas) e `torre_voo` (Painel de Voo). **Painel de Voo nativo (item 17)**: `src/modules/torre/voo.js` (telas), `voo-modelo.js` (pacote → contas, janelas, semáforo, motor de recomendações, frases), `voo-fonte.js` (produção: Edge Functions `voo-dados`/`voo-acao`; demonstração: `voo-demo.js`, dados fictícios no mesmo formato), `window.AOS_VOO` (testes). Campos novos em `clients`: `metaContas: ['<id da conta>']` (+ `metaAdAccountId` = `act_` da 1ª, usado pelo Guardião) e `metaCustoConversa` (R$). Ações gravam `clientActions` com `origem:'torre'`, `contaMeta`, `objetoId`; decisões do motor em `recsLog` com `origem:'torre'`, `conta`.
- `db.seed(..., {chave})` permite várias sementes na mesma coleção; apagar todos os registros não ressemeia.
- `excluir` segue a regra da seção 4. Notificações têm a linha `notificacoes` (todos editam as próprias).
- Gráficos são redesenhados na largura real do contêiner (texto nunca encolhe no celular).
- Arquivo extra no core: `src/core/ui-demo.js` (página `#/_ui`). `public/config.js` é copiado para `dist/`.
- Usuários extras para teste: Helena Prado (leitura) e Lucas Prado (inativo).
- Fase 3 (UX aprovada pelo dono): contador do menu só para crítico; Notificações fora do menu; período só onde muda dados; introdução recolhe após 2 visitas; início por papel (`mesa` no grupo `visao`); paleta Ctrl+K; densidade compacta; barra inferior no celular; agrupamento de notificações e resumo diário; foto no avatar + `ui.lerFoto`. Seeds do core: notificações de menção ganharam `refCol/refId` e há 2 menções novas em Grupo Orion para o dono (n-13, n-14) + 2 comentários (cm-03, cm-04).
- Router: cada navegação renderiza 1 vez (hashchange/popstate deduplicados por hash). `ctx.refresh()`/`shell.refresh()` e mudança de período relêem a URL atual, então `router.setQuery({x:null})` sem render vale no próximo refresh e parâmetros de uso único (`?acao=`, `?cobrar=`, `?comentarios=1`) não voltam. `shell.renders()` e `shell.rotaAtual()` existem para testes.
- `ui.embed` ainda recria o iframe a cada render (o Painel de Voo da Torre hospeda o iframe fora do `#view`); quem usar embed em página que re-renderiza deve fazer o mesmo.
