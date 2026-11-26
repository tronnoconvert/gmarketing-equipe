// lista.js — #/clientes: KPIs, matriz risco × valor, carteira, retenção por safra e onboarding.
import * as K from './calc.js';
import { KPI_SERIES, CARTEIRA_REF, SAFRAS, pesosTxt } from './data.js';
import { padrao } from '../../core/padroes/index.js';
import { importarClientes } from './importar.js';

const iniCli = c => String(c.nome || '?').split(/\s+/).filter(w => w.length > 2 || /^[A-ZÁ-Ú]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const logo = (c, tam = 28) => `<span class="m-clientes-logo" style="--lc:${c.logoCor || '#64748B'};width:${tam}px;height:${tam}px;font-size:${Math.round(tam * 0.38)}px" aria-hidden="true">${iniCli(c)}</span>`;

export function renderLista(ctx) {
  const { ui, charts, fmt, db, query } = ctx;
  const todos = K.visiveis();
  const k = K.kpis(todos);
  const f = K.filtroAtual(query.f);
  const q = fmt.norm(query.q || '').trim();
  let linhas = todos.filter(f.fn);
  if (q) linhas = linhas.filter(c => fmt.norm(`${c.nome} ${c.razaoSocial} ${c.segmento} ${(c.servicos || []).join(' ')} ${c.cnpj}`).includes(q) || (q.replace(/\D/g, '').length >= 4 && String(c.cnpj).replace(/\D/g, '').includes(q.replace(/\D/g, ''))));
  const podeEditar = ctx.can('clientes', 'editar');
  const escopo = ctx.escopoClientes();
  const rec = K.veReceita();
  // séries históricas, churn e safras de referência são do modo demonstração; produção calcula do cadastro real
  const D = db.dadosDemo, serieOk = escopo === 'todos' && D;
  const churn = D ? null : churnReal(db);

  const kpis = `<div class="g-kpi m-clientes-kpis">
${ui.kpi({ rotulo: 'Clientes ativos', valor: fmt.num(k.n), delta: k.novosMes ? `▲ ${k.novosMes}` : '0', comp: 'no mês', serie: serieOk ? KPI_SERIES.ativos : null, ajuda: 'Clientes com contrato vigente (inclui os que estão em onboarding). Variação = entradas no mês.', href: '#/clientes' })}
${ui.kpi({ rotulo: 'Health médio', valor: k.healthMedio == null ? '—' : String(k.healthMedio), delta: serieOk ? `▼ ${Math.abs(CARTEIRA_REF.healthDelta)} pts` : null, deltaBom: false, comp: serieOk ? 'vs outubro' : (k.healthMedio == null ? 'sem clientes ativos' : 'carteira atual'), serie: serieOk ? KPI_SERIES.health : null, ajuda: 'Média simples do health score (0–100) dos clientes ativos. Faixas: ≥75 saudável · 60–74 atenção · <60 em risco.', led: K.estH(k.healthMedio) })}
${rec ? ui.kpi({ rotulo: 'Em risco', valor: String(k.risco.length), delta: fmt.brlK(k.mrrRisco), deltaBom: null, comp: `de MRR · ${fmt.pct(k.pctRisco)} do total`, serie: serieOk ? KPI_SERIES.risco : null, formatoSerie: 'mil', alerta: k.risco.length > 0, ajuda: 'Clientes com health score abaixo de 60. O valor é a soma do MRR deles (MRR em risco).', href: ctx.router.href('clientes', { f: 'risco' }) })
    : ui.kpi({ rotulo: 'Em risco', valor: String(k.risco.length), comp: k.n ? `${fmt.pct((k.risco.length / k.n) * 100, 0)} dos clientes` : '', alerta: k.risco.length > 0, ajuda: 'Clientes com health score abaixo de 60. Clique para ver a lista.', href: ctx.router.href('clientes', { f: 'risco' }) })}
${ui.kpi({ rotulo: 'Renovam em 30 dias', valor: String(k.renovam.length), comp: k.renovam.length ? (k.renovamSemReuniao.length ? `${fmt.plural(k.renovamSemReuniao.length, 'sem reunião marcada', 'sem reunião marcada')}` : 'todas com reunião marcada') : 'nenhuma renovação próxima', delta: rec && k.renovam.length ? fmt.brlK(k.mrrRenova) : null, deltaBom: null, led: k.renovam.length ? (k.renovamSemReuniao.length ? 'warn' : 'ok') : null, ajuda: `Contratos que renovam nos próximos 30 dias${rec ? ' (o valor é a soma do MRR deles)' : ''}. Âmbar quando algum ainda não tem reunião de renovação marcada. Clique para ver a lista.`, href: ctx.router.href('clientes', { f: 'renovam' }) })}
${D ? ui.kpi({ rotulo: 'Churn 12 meses', valor: fmt.pct(CARTEIRA_REF.churn12m), delta: `meta < ${CARTEIRA_REF.churnMeta}%`, deltaBom: true, comp: 'dentro da meta', serie: KPI_SERIES.churn, corSerie: 'var(--c2n)', formatoSerie: 'pct', ajuda: 'Clientes que cancelaram nos últimos 12 meses ÷ média de clientes ativos no período.' })
    : ui.kpi({ rotulo: 'Churn 12 meses', valor: churn.pct == null ? '—' : fmt.pct(churn.pct), comp: churn.pct == null ? 'nenhum cancelamento registrado' : fmt.plural(churn.n, 'cancelamento'), ajuda: 'Clientes encerrados nos últimos 12 meses ÷ (ativos + encerrados no período), a partir do cadastro.' })}
</div>`;

  // matriz risco × valor
  const modo = query.m === 'todos' ? 'todos' : 'principais';
  const CAN = ['c-orion', 'c-vida', 'c-alfa', 'c-technova', 'c-imob', 'c-bella', 'c-studiofit', 'c-autocenter', 'c-petfeliz', 'c-otica', 'c-cafe'];
  const princ = [...todos].sort((a, b) => (CAN.includes(b.id) ? 1 : 0) - (CAN.includes(a.id) ? 1 : 0) || b.mrr - a.mrr).slice(0, 11);
  todos.filter(c => K.emRisco(c) && !princ.includes(c)).forEach(c => princ.push(c));
  const pts = (modo === 'todos' ? todos : princ.slice(0, 16)).map(c => (rec ? { x: c.riscoChurn, y: Math.round(c.mrr / 100) / 10, r: c.mrr, rotulo: c.nome, estado: K.estH(c.health), href: `#/clientes/${c.id}`, extra: `Health ${c.health} · ${K.rotH(c.health)}` }
    : { x: c.riscoChurn, y: c.health, rotulo: c.nome, estado: K.estH(c.health), href: `#/clientes/${c.id}`, extra: `Health ${c.health} · ${K.rotH(c.health)} · ${fmt.pct(c.noPrazo, 0)} no prazo` }));
  const matriz = !rec ? ui.card({
    titulo: 'Matriz risco × health', sub: modo === 'todos' ? `${todos.length} clientes · passe o mouse para ver o nome` : 'Maiores contas e clientes em risco · clique para abrir a ficha',
    ajuda: 'Eixo X: probabilidade de cancelamento (modelo com health, tendência, pagamento e engajamento). Eixo Y: health score (0–100). Quadrante "Ação imediata" = risco alto e health abaixo de 60.',
    acoes: `<div data-seg-manual>${ui.seg([{ id: 'principais', rotulo: 'Principais' }, { id: 'todos', rotulo: `Todos (${todos.length})` }], modo, { rotulo: 'Pontos exibidos', cls: 'm-clientes-segm' })}</div>`,
    corpo: todos.length ? charts.dispersao({ pontos: pts, eixoX: { rotulo: 'Risco de churn (%)', formato: 'pct', min: 0, max: 100 }, eixoY: { rotulo: 'Health score', formato: 'num', min: 0, max: 100 }, quadrantes: { x: 50, y: 60, rotulos: ['Manter', 'Observar de perto', 'Revisar entregas', 'Ação imediata'], destaque: 'infDir' }, altura: 340, legendaEstados: { ok: 'Saudável (≥75)', warn: 'Atenção (60–74)', err: 'Em risco (<60)' } }) : ui.vazio({ titulo: 'Sem clientes para exibir', compacto: true }),
  }) : ui.card({
    titulo: 'Matriz risco × valor', sub: modo === 'todos' ? `${todos.length} clientes · passe o mouse para ver o nome` : 'Maiores contas e clientes em risco · clique para abrir a ficha',
    ajuda: 'Eixo X: probabilidade de cancelamento (modelo com health, tendência, pagamento e engajamento). Eixo Y: MRR. Cor = health score. Quadrante "Ação imediata" = valor alto e risco alto.',
    acoes: `<div data-seg-manual>${ui.seg([{ id: 'principais', rotulo: 'Principais' }, { id: 'todos', rotulo: `Todos (${todos.length})` }], modo, { rotulo: 'Pontos exibidos', cls: 'm-clientes-segm' })}</div>`,
    corpo: todos.length ? charts.dispersao({ pontos: pts, eixoX: { rotulo: 'Risco de churn (%)', formato: 'pct', min: 0, max: 100 }, eixoY: { rotulo: 'MRR (R$ mil)', formato: 'dec', min: 0, max: Math.max(16, Math.ceil(Math.max(...todos.map(c => c.mrr)) / 1000) + 1) }, quadrantes: { x: 50, y: 7.5, rotulos: ['Proteger e expandir', 'Ação imediata', 'Manter', 'Revisar escopo'], destaque: 'supDir' }, altura: 340, legendaEstados: { ok: 'Saudável (≥75)', warn: 'Atenção (60–74)', err: 'Em risco (<60)' } }) : ui.vazio({ titulo: 'Sem clientes para exibir', compacto: true }),
  });

  // carteira
  const chips = ui.chips(K.filtros().map(x => ({ id: x.id, rotulo: x.rotulo, n: todos.filter(x.fn).length, estado: x.estado })), f.id, 'f', { rotulo: 'Filtrar carteira', primeiroLimpa: false });
  const tabela = ui.tabela({
    cols: [
      { k: 'nome', l: 'Cliente', r: c => `<div class="m-clientes-cl">${logo(c, 28)}<div class="m-clientes-cln"><b class="trunc">${fmt.esc(c.nome)}</b><span class="sub">${fmt.esc(c.segmento)}${c.status === 'onboarding' ? ' · em onboarding' : ''}</span></div></div>` },
      { k: 'desde', l: 'Desde', r: c => fmt.mesAno(c.desde), mobile: false },
      { k: 'servicos', l: 'Serviços', v: c => (c.servicos || []).join(', '), r: c => `<span class="m-clientes-serv">${fmt.esc((c.servicos || []).join(', '))}</span>`, mobile: false },
      ...(rec ? [{ k: 'mrr', l: 'MRR', num: true, r: c => fmt.brl(c.mrr) }] : []),
      { k: 'health', l: 'Health', num: true, ajuda: `${pesosTxt()}. ${K.faixasHTxt()}.`, r: c => `<span class="m-clientes-h">${ui.led(K.estH(c.health), false, { aria: K.rotH(c.health) })}<b class="num">${c.health}</b></span>` },
      { k: 'tend', l: 'Tendência 6m', sort: false, mobile: false, r: c => `<div class="m-clientes-sp" title="${fmt.esc((c.tendencia || []).join(' → '))}">${charts.spark(c.tendencia || [], { cor: (c.tendencia || [])[5] < (c.tendencia || [])[0] - 2 ? 'var(--err)' : (c.tendencia || [])[5] > (c.tendencia || [])[0] + 2 ? 'var(--ok)' : 'var(--c2n)', area: false, altura: 22, rotulo: 'Health' })}</div>` },
      { k: 'noPrazo', l: 'No prazo', num: true, ajuda: `Entregas no prazo nos últimos 90 dias. ≥${padrao('clientes.noPrazo.ok', 90)}% ok · ${padrao('clientes.noPrazo.critico', 75)}–${padrao('clientes.noPrazo.ok', 90) - 1}% atenção · <${padrao('clientes.noPrazo.critico', 75)}% crítico.`, r: c => { const e = K.estPrazo(c.noPrazo); return `<span class="${e === 'err' ? 't-err fw6' : e === 'warn' ? 't-warn' : ''}">${fmt.pct(c.noPrazo, 0)}</span>`; } },
      { k: 'pag', l: 'Pagamento', v: c => ({ err: 0, warn: 1, ok: 2 }[c.pagamento.estado] ?? 3), r: c => ui.led(c.pagamento.estado, c.pagamento.texto) },
      { k: 'renova', l: 'Renova', r: c => { const d = K.dias(c.renova); return `<span class="nowrap${d >= 0 && d <= K.janelaRenova() ? ' t-warn fw6' : ''}" title="${fmt.esc(fmt.data(c.renova))}">${fmt.dataCurta(c.renova)}${d >= 0 && d <= 30 ? ` <small class="mut">· ${d} d</small>` : ''}</span>`; } },
      { k: 'respId', l: 'Resp.', v: c => K.nomePessoa(c.respId), r: c => ui.avatar(c.respId, 24) },
    ],
    linhas, onRowHref: c => `#/clientes/${c.id}`, ordem: rec ? { k: 'mrr', dir: 'desc' } : { k: 'health', dir: 'asc' }, legenda: 'Carteira de clientes', id: 'm-clientes-tbl',
    vazio: !todos.length && !q ? { icone: 'building', titulo: 'Nenhum cliente cadastrado ainda', texto: 'Cadastre o primeiro cliente (ou importe uma planilha) para acompanhar health score, entregas, pagamento e renovação.', acao: podeEditar ? { rotulo: 'Cadastrar cliente', href: '#/clientes/novo', icone: 'plus' } : undefined } : { titulo: q ? `Nenhum cliente encontrado para “${query.q}”` : 'Nenhum cliente neste filtro', texto: q ? 'Confira a grafia ou busque pelo CNPJ ou segmento.' : 'Escolha outro filtro acima ou cadastre um cliente.', acao: q ? { rotulo: 'Limpar busca', href: ctx.router.href('clientes', { q: null }) } : null },
  });
  const carteira = ui.card({
    titulo: 'Carteira', sub: rec ? `${fmt.plural(linhas.length, 'cliente')} · ${fmt.brlK(linhas.reduce((a, c) => a + c.mrr, 0))} de MRR` : `${fmt.plural(linhas.length, 'cliente')} · ordenada pelo health (menor primeiro)`, pad: false, cls: 'm-clientes-cart',
    acoes: `${ui.btn({ rotulo: 'Exportar CSV', icone: 'download', sm: true, attrs: { 'data-csv': '' } })}`,
    corpo: `<div class="m-clientes-tools">${chips}<label class="m-clientes-q"><span class="sr">Buscar na carteira</span>${ui.ic('search')}<input type="search" id="m-clientes-q" placeholder="Buscar nome, CNPJ, segmento…" value="${fmt.esc(query.q || '')}" autocomplete="off"></label></div>${tabela}`,
  });

  // retenção por safra
  const cols = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'];
  const ret = !D ? safrasReal(ctx) : ui.card({
    titulo: 'Retenção por safra', sub: '% de clientes de cada mês de entrada ainda ativos',
    ajuda: 'Cada linha é uma safra (mês em que os clientes entraram). M0 = mês de entrada; M1 = um mês depois, e assim por diante. Cores mais fortes = retenção maior.',
    corpo: charts.calor({ linhas: SAFRAS.map(s => `${s.safra} · ${s.n}`), colunas: cols, valores: SAFRAS.map(s => cols.map((_, i) => s.m[i] ?? null)), formato: { eixo: v => `${v}%`, tip: v => `${v}% ainda ativos` }, min: 70, max: 100 }) + `<p class="sm mut m-clientes-nota">Média em M3: ${fmt.pct((92 + 90 + 88) / 3, 0)} · safra de junho estabilizou em 85%.</p>`,
  });

  // onboarding
  const ob = K.funilOnboarding(todos);
  const paradosHtml = ob.parados.length ? `${ui.aviso({ tipo: 'warn', titulo: `${fmt.plural(ob.parados.length, 'cliente parado', 'clientes parados')} em "Acessos" há mais de 5 dias.`, texto: 'Cobre os acessos para não atrasar o kickoff e a 1ª entrega.' })}
${ui.lista(ob.parados.map(o => { const c = db.get('clients', o.clientId) || { nome: o.clientId }; return { estado: 'warn', titulo: c.nome, href: `#/clientes/${o.clientId}/cadastro`, sub: `Parado há ${-K.dias(o.paradoDesde)} dias · resp. ${K.nomePessoa(o.respId)} · ${o.pendencia || 'aguardando acessos'}`, acao: podeEditar ? { rotulo: 'Cobrar acessos', icone: 'send', attrs: { 'data-cobrar': o.id } } : null }; }))}` : ui.aviso({ tipo: 'ok', texto: 'Nenhum cliente parado em Acessos.' });
  const onb = ui.card({
    titulo: 'Onboarding', sub: `${fmt.plural(ob.recs.length, 'cliente')} nos últimos 60 dias`,
    ajuda: 'Quantos clientes novos já concluíram (ou começaram, no caso de acessos parciais) cada etapa. Alerta quando alguém fica mais de 5 dias parado em Acessos.',
    corpo: ob.recs.length ? `${charts.funil({ etapas: ob.etapas, formato: 'num' })}<div class="stack m-clientes-onb">${paradosHtml}</div>` : ui.vazio({ titulo: 'Nenhum cliente em onboarding', texto: 'Ao cadastrar um cliente, ele entra aqui com as etapas de contrato, acessos, kickoff, 1ª entrega e 1º resultado.', acao: podeEditar ? { rotulo: 'Cadastrar cliente', href: '#/clientes/novo', icone: 'plus' } : null, compacto: true }),
  });

  // renovações (60 dias)
  const hRen = padrao('clientes.renovacao.cockpit', 60);
  const prox = todos.filter(c => { const d = K.dias(c.renova); return d >= 0 && d <= hRen; }).sort((a, b) => String(a.renova).localeCompare(String(b.renova)));
  const renov = ui.card({
    titulo: 'Renovações', sub: `Próximos ${hRen} dias`, ajuda: `Contratos que renovam nos próximos ${hRen} dias. Sem reunião marcada a menos de ${K.janelaRenova()} dias da data = atenção.`,
    corpo: ui.lista(prox.map(c => { const d = K.dias(c.renova); const r = K.proximaReuniao(c); const sem = !r && d <= K.janelaRenova(); return {
      estado: sem ? 'warn' : K.estH(c.health) === 'err' ? 'err' : 'ok', titulo: rec ? `${c.nome} · ${fmt.brlK(c.mrr, { short: true })}` : c.nome, href: `#/clientes/${c.id}`,
      sub: `Renova em ${fmt.dataCurta(c.renova)} (${d === 0 ? 'hoje' : fmt.plural(d, 'dia')}) · health ${c.health} · ${r ? `reunião ${fmt.dataCurta(r.quando)}` : 'nenhuma reunião marcada'}`,
      acao: sem && podeEditar ? { rotulo: 'Agendar', icone: 'calendar', href: `#/clientes/${c.id}?acao=agendar` } : null }; }), { vazio: { titulo: 'Nenhuma renovação nos próximos 60 dias', compacto: true } }),
  });

  const semPermCad = 'Sem permissão para cadastrar clientes. Peça ao administrador.';
  const acoes = podeEditar ? `${ui.btn({ rotulo: 'Importar planilha (CSV)', icone: 'upload', attrs: { 'data-importar': '' } })}${ui.btn({ rotulo: 'Cadastrar cliente', icone: 'plus', tipo: 'pri', href: '#/clientes/novo' })}`
    : `${ui.btn({ rotulo: 'Importar planilha (CSV)', icone: 'upload', disabled: true, title: semPermCad })}${ui.btn({ rotulo: 'Cadastrar cliente', icone: 'plus', disabled: true, title: semPermCad })}`;
  const mrrSub = rec ? ` · MRR ${fmt.brlK(k.mrr)}` : ` · ${k.risco.length} em risco`;
  const sub = escopo === 'todos' ? `${fmt.plural(k.n, 'cliente ativo', 'clientes ativos')}${mrrSub}` : `Seus clientes: ${fmt.plural(k.n, 'cliente')}${mrrSub}`;
  return `<div class="pg m-clientes">
${ui.cabecalho({ titulo: 'Clientes', sub, acoes, meta: D ? `${ui.led('ok', 'Health recalculado')}<span class="mut">${ui.rel(new Date(Date.now() - 35 * 60000).toISOString(), { prefixo: '' })}</span>` : metaHealthReal(ctx) })}
${kpis}
<div class="g-2-1 m-clientes-top">${matriz}${onb}</div>
${carteira}
<div class="g2">${ret}${renov}</div>
</div>`;
}

export function mountLista(el, ctx) {
  const { router, ui, db, fmt, notify } = ctx;
  const inp = el.querySelector('#m-clientes-q');
  let t = null;
  const filtrarDom = () => {
    const v = fmt.norm(inp.value).trim();
    clearTimeout(t);
    t = setTimeout(() => { router.setQuery({ q: v ? inp.value.trim() : null }, { render: true }); }, 350);
  };
  inp && inp.addEventListener('input', filtrarDom);
  inp && inp.addEventListener('keydown', e => { if (e.key === 'Escape' && inp.value) { e.stopPropagation(); inp.value = ''; router.setQuery({ q: null }, { render: true }); } });
  if (inp && ctx.query.q) { inp.focus(); const n = inp.value.length; inp.setSelectionRange(n, n); }
  const onClick = e => {
    const sg = e.target.closest('.m-clientes-segm [data-seg]');
    if (sg) { router.setQuery({ m: sg.dataset.seg === 'todos' ? 'todos' : null }, { render: true }); return; }
    if (e.target.closest('[data-importar]')) { if (ctx.can('clientes', 'editar')) importarClientes(ctx); return; }
    if (e.target.closest('[data-csv]')) {
      const todos = K.visiveis(); const f = K.filtroAtual(ctx.query.f);
      const q = fmt.norm(ctx.query.q || '');
      const l = todos.filter(f.fn).filter(c => !q || fmt.norm(`${c.nome} ${c.razaoSocial} ${c.segmento} ${c.cnpj}`).includes(q)).sort((a, b) => (K.veReceita() ? b.mrr - a.mrr : a.health - b.health));
      const blob = new Blob([K.csv(l)], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `carteira-${f.id}-${fmt.iso(new Date())}.csv`;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      ui.toast(`CSV exportado com ${fmt.plural(l.length, 'cliente')}.`);
      return;
    }
    const cb = e.target.closest('[data-cobrar]');
    if (cb) {
      const o = db.get('onboarding', cb.dataset.cobrar); if (!o) return;
      const c = db.get('clients', o.clientId);
      const para = [K.userDe(o.respId)].filter(Boolean);
      notify.enviar({ para, titulo: `Cobrar acessos: ${c.nome}`, texto: `Parado em "Acessos" há ${-K.dias(o.paradoDesde)} dias. Pendência: ${o.pendencia || 'acessos não liberados'}.`, link: `#/clientes/${c.id}/cadastro`, tipo: 'atribuicao', prioridade: 'alta', refCol: 'clients', refId: c.id });
      db.update('onboarding', o.id, { ultimaCobranca: new Date().toISOString() }, { log: `cobrou acessos de ${c.nome}` });
      ui.toast(`${K.nomePessoa(o.respId)} foi notificado(a) para cobrar os acessos de ${c.nome}.`);
    }
  };
  el.addEventListener('click', onClick);
  return () => { el.removeEventListener('click', onClick); clearTimeout(t); };
}

/* ---------- produção (db.dadosDemo false): churn e safras a partir do cadastro real ---------- */
const ENCERRADO = ['encerrado', 'inativo', 'churn', 'perdido', 'cancelado'];
const encerrado = c => c.ativo === false || ENCERRADO.includes(c.status);
function churnReal(db) {
  const desde = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const todos = db.list('clients'); const fim = c => String(c.encerradoEm || c.dataEncerramento || c.updatedAt || '').slice(0, 10);
  const n = todos.filter(c => encerrado(c) && fim(c) >= desde).length; const base = todos.filter(c => !encerrado(c)).length + n;
  return { n, pct: n && base ? (n / base) * 100 : null };
}
function safrasReal(ctx) {
  const { ui, charts, fmt, db } = ctx;
  const titulo = 'Retenção por safra';
  const meses = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); return fmt.iso(d).slice(0, 7); });
  const todos = db.list('clients', c => c.desde && meses.includes(String(c.desde).slice(0, 7)));
  if (!todos.length) return ui.card({ titulo, sub: 'clientes de cada mês de entrada ainda ativos', corpo: ui.vazio({ compacto: true, icone: 'layers', titulo: 'Sem safras para comparar ainda', texto: 'Cada mês de entrada de clientes vira uma safra. Cadastre os clientes com a data de início do contrato para acompanhar quantos continuam ativos.' }) });
  const linhas = meses.map(m => { const l = todos.filter(c => String(c.desde).slice(0, 7) === m); return { m, n: l.length, ativos: l.filter(c => !encerrado(c)).length }; }).filter(x => x.n);
  return ui.card({ titulo, sub: '% de cada safra ainda ativa hoje', ajuda: 'Cada linha é uma safra (mês em que os clientes entraram), com a parcela que continua ativa hoje.',
    corpo: charts.calor({ linhas: linhas.map(x => `${fmt.mesAno(x.m + '-01')} · ${x.n}`), colunas: ['Hoje'], valores: linhas.map(x => [Math.round((x.ativos / x.n) * 100)]), formato: { eixo: v => `${v}%`, tip: v => `${v}% ainda ativos` }, min: 0, max: 100 }) });
}
/** produção: status do health a partir da rotina real "Health score" (se existir) — nunca um horário inventado */
function metaHealthReal(ctx) {
  const { ui, db } = ctx;
  const r = db.list('routines').find(x => /health/i.test(`${x.id} ${x.nome}`));
  if (!r) return `<span class="mut sm">${db.count('clients') ? 'Health score atualizado no cadastro' : 'Nenhum cliente cadastrado'}</span>`;
  return `${ui.led(r.estado || 'off', 'Health recalculado')}${r.ultimaEm ? `<span class="mut">${ui.rel(r.ultimaEm, { prefixo: '' })}</span>` : ''}`;
}
