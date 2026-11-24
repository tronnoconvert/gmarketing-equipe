// Webinars (lançamentos): painel #/webinars, detalhe #/webinars/:id, preencher #/webinars/novo e #/webinars/:id/preencher.
import './data.js';
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import {
  metricas, consolidar, status, STATUS, pendencias, pertoDaData, responsaveis, userDoTime, podeEditar, podeCriar, podeExcluir, motivoSemEdicao,
  nomeTime, ledMeta, ledBench, BENCH, diario, CANAIS, ORIGENS, SECOES, hojeISO, veReceita,
} from './calc.js';
import { renderForm, mountForm } from './form.js';
import { podeLancar, lancarDia, comandosLancar, modoLancamento } from './rapido.js';

const esc = fmt.esc;
// migalha curta: o topo do core não encolhe bem com textos longos (ver relatório)
export const curto = (t, n = 14) => (String(t || '').length > n ? String(t).slice(0, n - 1).trimEnd() + '…' : String(t || ''));
const nz = (v, f) => (v === null || v === undefined || Number.isNaN(v) ? '—' : f(v));
const ordemData = (a, b) => String(a.data || '9999').localeCompare(String(b.data || '9999'));

function deltaPct(a, b, invertido = false) {
  if (a == null || b == null || !b) return { delta: undefined };
  const d = ((a - b) / Math.abs(b)) * 100; if (Math.abs(d) < 0.05) return { delta: '0%', deltaBom: null };
  return { delta: `${d > 0 ? '▲' : '▼'} ${fmt.pct(Math.abs(d), 1)}`, deltaBom: invertido ? d < 0 : d > 0 };
}
function deltaPp(a, b) {
  if (a == null || b == null) return { delta: undefined };
  const d = a - b; if (Math.abs(d) < 0.05) return { delta: '0 pp', deltaBom: null };
  return { delta: `${d > 0 ? '▲' : '▼'} ${fmt.pp(Math.abs(d))}`, deltaBom: d > 0 };
}

/** "último lançamento: hoje/ontem/22/nov" ao lado do botão Lançar dia */
function ultimoLanc(ui, w) {
  const tipo = modoLancamento(w) === 'captacao' ? 'captacao' : 'venda';
  const l = db.list('webinarDaily', d => d.webinarId === w.id && d.tipo === tipo).map(d => d.data).sort();
  const u = l[l.length - 1]; if (!u) return '<span class="sm mut">Nenhum dia lançado</span>';
  const dd = -fmt.diasAte(u); const e = dd <= 1 ? 'ok' : dd === 2 ? 'warn' : 'err';
  return `<span class="sm mut">${ui.led(e, false)} Último dia: <b class="num">${dd === 0 ? 'hoje' : dd === 1 ? 'ontem' : fmt.dataCurta(u)}</b></span>`;
}

/* ======================= PAINEL ======================= */
function painel(ctx) {
  const { ui, charts } = ctx;
  const todos = db.list('webinars').sort(ordemData);
  const comM = todos.map(w => ({ w, m: metricas(w), st: status(w) }));
  const realizados = comM.filter(x => ['realizado', 'encerrado'].includes(x.st));
  const p = ctx.periodoInfo; const ini = fmt.iso(p.inicio); const hoje = hojeISO();
  const iniAnt = fmt.iso(new Date(p.inicio.getFullYear(), p.inicio.getMonth() - p.meses, 1));
  const noPer = realizados.filter(x => x.w.data >= ini && x.w.data < hoje);
  const ant = realizados.filter(x => x.w.data >= iniAnt && x.w.data < ini);
  const c = consolidar(noPer.map(x => x.m)), ca = ant.length ? consolidar(ant.map(x => x.m)) : null;
  const serie = k => realizados.map(x => x.m[k]).filter(v => v != null);
  const g = ca || {};
  const rec = veReceita();
  const kpis = `<div class="g-kpi m-webinars-k8">
${ui.kpi({ rotulo: 'Webinars realizados', valor: fmt.num(c.n), ...(ca ? { delta: `${c.n - ca.n >= 0 ? '▲' : '▼'} ${Math.abs(c.n - ca.n)}`, deltaBom: null } : {}), comp: ca ? p.comparacao : p.rotulo.toLowerCase(), ajuda: 'Lives que já aconteceram dentro do período escolhido no topo.' })}
${ui.kpi({ rotulo: 'Inscritos', valor: fmt.num(c.inscritos), ...deltaPct(c.inscritos, g.inscritos), comp: ca ? p.comparacao : '', serie: serie('inscritos'), ajuda: 'Soma dos inscritos lançados na captação diária.' })}
${rec ? '' : ui.kpi({ rotulo: 'Investimento em tráfego', valor: fmt.brlK(c.investimento), ...deltaPct(c.investimento, g.investimento), deltaBom: null, comp: ca ? p.comparacao : '', serie: serie('investimento'), formatoSerie: 'brl', ajuda: 'Soma do investimento em anúncios lançado na captação diária.' })}
${ui.kpi({ rotulo: 'Custo por inscrito', valor: nz(c.cpl, fmt.brl2), ...deltaPct(c.cpl, g.cpl, true), comp: ca ? p.comparacao : '', serie: serie('cpl'), formatoSerie: 'brl', ajuda: 'Investimento em tráfego ÷ inscritos.' })}
${ui.kpi({ rotulo: 'Comparecimento', valor: nz(c.comparecimento, v => fmt.pct(v)), ...deltaPp(c.comparecimento, g.comparecimento), comp: 'ref. 25–35%', serie: serie('comparecimento'), formatoSerie: 'pct', ajuda: 'Presentes únicos ÷ inscritos. Referência de mercado: 25–35%.' })}
${rec ? '' : ui.kpi({ rotulo: 'Conversão da live', valor: nz(c.convLive, v => fmt.pct(v)), ...deltaPp(c.convLive, g.convLive), comp: 'ref. 3–8%', serie: serie('convLive'), formatoSerie: 'pct', ajuda: 'Vendas ÷ presentes únicos. Referência de mercado: 3–8%.' })}
${ui.kpi({ rotulo: 'Vendas', valor: fmt.num(c.vendas), ...deltaPct(c.vendas, g.vendas), comp: ca ? p.comparacao : '', serie: serie('vendas'), ajuda: 'Quantidade de vendas: ao vivo + carrinho + replay.' })}
${rec ? '' : ui.kpi({ rotulo: 'Custo por venda', valor: nz(c.cac, fmt.brl), ...deltaPct(c.cac, g.cac, true), comp: ca ? p.comparacao : '', serie: serie('cac'), formatoSerie: 'brl', ajuda: 'Investimento em tráfego ÷ quantidade de vendas (CAC).' })}
${!rec ? '' : ui.kpi({ rotulo: 'Faturamento', valor: fmt.brlK(c.faturamento), ...deltaPct(c.faturamento, g.faturamento), comp: ca ? p.comparacao : '', serie: serie('faturamento'), formatoSerie: 'brl', ajuda: 'Faturamento bruto das vendas lançadas (antes de reembolsos).' })}
${!rec ? '' : ui.kpi({ rotulo: 'ROAS', valor: nz(c.roas, v => fmt.dec(v, 1) + '×'), ...deltaPct(c.roas, g.roas), comp: ca ? p.comparacao : '', serie: serie('roas'), formatoSerie: 'dec', ajuda: 'Faturamento ÷ investimento em tráfego.' })}
${!rec ? '' : ui.kpi({ rotulo: 'Lucro', valor: fmt.brlK(c.lucro), ...deltaPct(c.lucro, g.lucro), comp: ca ? p.comparacao : '', serie: serie('lucro'), formatoSerie: 'brl', ajuda: 'Faturamento − reembolsos − investimento em tráfego − custos da live (equipe, ferramentas).' })}
</div>`;

  // pendências perto da data
  const pend = comM.filter(x => pertoDaData(x.w)).map(x => ({ ...x, p: pendencias(x.w, x.m) })).filter(x => x.p.length);
  const avisoPend = pend.length ? ui.card({
    titulo: 'Dados faltando perto da data', icone: 'alert', sub: 'Quem está escalado recebe o pedido de preenchimento por notificação.',
    corpo: ui.lista(pend.map(x => ({
      estado: 'warn', titulo: x.w.tema, href: `#/webinars/${x.w.id}`, sub: x.p.map(y => y.texto).join(' · '),
      meta: `${fmt.dataCurta(x.w.data)} · ${STATUS[x.st].rot}`,
      acao: podeEditar(x.w) ? { rotulo: 'Pedir preenchimento', icone: 'send', attrs: { 'data-pedir': x.w.id } } : null,
    }))),
  }) : '';

  // tendência por webinar
  const rot = realizados.map(x => fmt.dataCurta(x.w.data));
  const tend = realizados.length ? `${charts.barras({ rotulos: rot, series: [{ nome: 'Investimento', dados: realizados.map(x => x.m.investimento || 0), cor: rec ? 'var(--c2n)' : 'var(--c1)' }, ...(rec ? [{ nome: 'Faturamento', dados: realizados.map(x => x.m.faturamento || 0) }] : [])], formato: 'brlK', altura: 210 })}
<div class="m-webinars-sep"></div>${charts.linhas({ series: [{ nome: 'Comparecimento %', dados: realizados.map(x => x.m.comparecimento) }, { nome: 'Retenção até a oferta %', dados: realizados.map(x => x.m.retencao), cor: 'var(--c3)' }, { nome: 'Conversão da live %', dados: realizados.map(x => x.m.convLive), cor: 'var(--c4)' }], rotulos: rot, formato: 'pct', altura: 170, min: 0 })}` : ui.vazio({ titulo: 'Nenhum webinar realizado ainda', texto: 'Depois da primeira live, a tendência aparece aqui.', compacto: true });

  // próximos
  const prox = comM.filter(x => ['planejado', 'captacao', 'aovivo'].includes(x.st));
  const proxHtml = prox.length ? `<div class="stack m-webinars-prox">${prox.map(x => {
    const dd = fmt.diasAte(x.w.data);
    return `<div class="m-webinars-piw"><a class="m-webinars-pi" href="#/webinars/${esc(x.w.id)}"><div class="row between"><b class="trunc">${esc(x.w.tema)}</b>${ui.selo(STATUS[x.st].e, STATUS[x.st].rot)}</div>
<div class="sm mut">${fmt.data(x.w.data)}${x.w.hora ? ' às ' + esc(x.w.hora) : ''} · ${dd > 0 ? `em ${fmt.plural(dd, 'dia')}` : 'hoje'}</div>
${x.w.metaInscritos ? `<div class="m-webinars-pb"><div class="row between sm"><span>Inscritos</span><span class="num"><b>${fmt.num(x.m.inscritos || 0)}</b> <span class="mut">/ ${fmt.num(x.w.metaInscritos)}</span></span></div>${ui.barra(((x.m.inscritos || 0) / x.w.metaInscritos) * 100, { faixas: 'meta', rotulo: false, fina: true })}</div>` : ''}
${x.m.cpl != null ? `<div class="sm mut">CPL ${fmt.brl2(x.m.cpl)} · investido ${fmt.brl(x.m.investimento)}${x.w.orcamento ? ` de ${fmt.brl(x.w.orcamento)}` : ''}</div>` : ''}</a>${podeLancar(x.w) ? `<div class="m-webinars-pil">${ultimoLanc(ui, x.w)}${ui.btn({ rotulo: 'Lançar dia', icone: 'plus', sm: true, attrs: { 'data-lancar': x.w.id } })}</div>` : ''}</div>`;
  }).join('')}</div>` : ui.vazio({ titulo: 'Nenhum webinar agendado', texto: 'Planeje a próxima live para a equipe começar a captação.', acao: podeCriar() ? { rotulo: 'Novo webinar', href: '#/webinars/novo', icone: 'plus' } : null, compacto: true });

  // funil consolidado (todos realizados no período; se vazio, todos os realizados)
  const baseFunil = noPer.length ? noPer : realizados;
  const cf = consolidar(baseFunil.map(x => x.m));
  const funil = funilHtml(ctx, cf);

  // comparativo
  const tabela = comparativo(ctx, realizados);
  const melhores = melhoresPiores(ctx, realizados);

  const proximo = prox[0];
  const lancaveis = todos.filter(podeLancar).sort((a, b) => (modoLancamento(a) === 'captacao' ? 0 : 1) - (modoLancamento(b) === 'captacao' ? 0 : 1) || ordemData(a, b));
  return `<div class="pg m-webinars">
${ui.cabecalho({
    titulo: 'Webinars', sub: 'Lançamentos: captação, ao vivo e vendas. A equipe escalada preenche; você acompanha a performance e onde o funil vaza.',
    acoes: [lancaveis.length ? ui.btn({ rotulo: 'Lançar dia', icone: 'plus', tipo: podeCriar() ? undefined : 'pri', attrs: lancaveis.length === 1 ? { 'data-lancar': lancaveis[0].id, title: `Lançar o dia de ${lancaveis[0].tema}` } : { 'data-lancar-menu': '', 'aria-haspopup': 'menu' } }) : '',
      podeCriar() ? ui.btn({ rotulo: 'Novo webinar', icone: 'plus', tipo: 'pri', href: '#/webinars/novo', attrs: { 'data-novo': '' } }) : ''].join(''),
    meta: `${proximo ? `<span>${ui.led(STATUS[proximo.st].e === 'off' ? 'off' : 'ok', false)} Próximo: <a href="#/webinars/${esc(proximo.w.id)}"><b>${esc(proximo.w.tema)}</b></a> · ${fmt.data(proximo.w.data)}</span>` : ''}<span>Período: <b>${esc(p.rotulo)}</b></span>`,
  })}
${avisoPend}
${kpis}
<div class="g-2-1">${ui.card({ titulo: 'Tendência por webinar', sub: rec ? 'Investimento × faturamento e taxas do funil, live a live' : 'Investimento em tráfego e taxas do funil, live a live', corpo: tend })}${ui.card({ titulo: 'Próximos webinars', corpo: proxHtml })}</div>
${ui.card({ titulo: 'Funil consolidado', sub: `${fmt.plural(baseFunil.length, 'webinar')} · ${noPer.length ? p.rotulo.toLowerCase() : 'todos os realizados'} · taxa de cada etapa vs referência de mercado`, ajuda: 'Referências ilustrativas do mercado brasileiro de lançamentos. Verde: dentro ou acima da faixa · âmbar: até 15% abaixo · vermelho: abaixo disso.', corpo: funil })}
${ui.card({ titulo: 'Comparativo entre webinars', sub: 'LED por meta: verde bateu · âmbar perto (≥85%) · vermelho abaixo. Clique para abrir.', pad: false, corpo: tabela })}
${melhores}
</div>`;
}

/** funil (gráfico + tabela de conversão por etapa vs referência) */
export function funilHtml(ctx, m, o = {}) {
  const { ui, charts } = ctx;
  const et = [
    ['Impressões', m.impressoes, null], ['Cliques', m.cliques, BENCH.ctr], ['Inscritos', m.inscritos, BENCH.inscricao], ['Confirmados no grupo', m.grupo, BENCH.grupo],
    ['Ao vivo (pico)', m.pico, BENCH.comparecimento], ['Ficaram até a oferta', m.naOferta, BENCH.retencao], ['Cliques no checkout', m.checkout, BENCH.checkout], ['Vendas', m.vendas, BENCH.fechamento],
  ];
  if (!m.impressoes && !m.inscritos) return ui.vazio({ titulo: 'Funil sem dados', texto: 'Lance a captação diária (investimento, impressões, cliques e inscritos) para o funil aparecer.', compacto: true });
  const validas = et.filter(e => e[1] != null && e[1] > 0);
  const graf = charts.funil({ etapas: validas.map(([rotulo, valor, b]) => ({ rotulo, valor, bench: b ? b.rot : undefined })), formato: 'num' });
  const linhas = et.map(([rotulo, valor, b], i) => {
    let anterior = null; for (let j = i - 1; j >= 0; j--) if (et[j][1]) { anterior = et[j][1]; break; }
    if (rotulo === 'Ao vivo (pico)') anterior = m.inscritos; // comparecimento é medido sobre os inscritos
    const conv = i && valor != null && anterior ? (valor / anterior) * 100 : null;
    const e = conv == null ? 'off' : ledBench(conv, b);
    return `<tr><td>${esc(rotulo)}</td><td class="n num">${nz(valor, fmt.num)}</td><td class="n num">${i ? nz(conv, v => fmt.pct(v)) : '<span class="mut">topo</span>'}${rotulo === 'Ao vivo (pico)' ? '<span class="sub">sobre inscritos</span>' : ''}</td><td class="m-hide sm mut">${b ? `${fmt.pct(b.min, 1)}–${fmt.pct(b.max, 1)}` : ''}</td><td>${i ? (conv == null ? '<span class="mut sm">sem dado</span>' : ui.selo(e, e === 'ok' ? 'Na faixa' : e === 'warn' ? 'Perto' : 'Abaixo')) : ''}</td></tr>`;
  }).join('');
  return `<div class="${o.empilhado ? 'stack' : 'g2'} m-webinars-funil">${graf}<div class="tbl-w" data-mobile="scroll"><table class="tbl densa" aria-label="Conversão por etapa"><thead><tr><th>Etapa</th><th class="n">Volume</th><th class="n">Conversão</th><th class="m-hide">Referência</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table></div></div>`;
}

function comparativo(ctx, lista) {
  const { ui } = ctx; const rec = veReceita();
  const cel = (txt, e) => `<span class="m-webinars-c num" title="${{ ok: 'Bateu a meta', warn: 'Perto da meta', err: 'Abaixo da meta', off: 'Sem meta' }[e]}">${ui.selo(e, txt)}</span>`;
  return ui.tabela({
    legenda: 'Comparativo entre webinars', onRowHref: x => `#/webinars/${x.w.id}`, ordem: { k: 'data', dir: 'desc' },
    linhas: lista,
    cols: [
      { k: 'data', l: 'Webinar', v: x => x.w.data, r: x => `<b>${esc(x.w.tema)}</b><span class="sub">${fmt.data(x.w.data)} · ${esc(STATUS[x.st].rot)}</span>` },
      { k: 'ins', l: 'Inscritos', num: true, v: x => x.m.inscritos, r: x => cel(nz(x.m.inscritos, fmt.num), ledMeta(x.m.inscritos, x.w.metaInscritos)), ajuda: 'LED vs meta de inscritos do webinar.' },
      { k: 'cpl', l: 'CPL', num: true, v: x => x.m.cpl, r: x => nz(x.m.cpl, fmt.brl2), ajuda: 'Custo por inscrito = investimento ÷ inscritos.' },
      { k: 'comp', l: 'Comparec.', num: true, v: x => x.m.comparecimento, r: x => cel(nz(x.m.comparecimento, v => fmt.pct(v)), ledBench(x.m.comparecimento, BENCH.comparecimento)), ajuda: 'Presentes únicos ÷ inscritos (ref. 25–35%).' },
      { k: 'ret', l: 'Retenção', num: true, v: x => x.m.retencao, r: x => cel(nz(x.m.retencao, v => fmt.pct(v)), ledBench(x.m.retencao, BENCH.retencao)), ajuda: 'Presentes na oferta ÷ pico (ref. 50–65%).', mobile: false },
      { k: 'conv', l: 'Conv. live', num: true, v: x => x.m.convLive, r: x => cel(nz(x.m.convLive, v => fmt.pct(v)), ledBench(x.m.convLive, BENCH.convLive)), ajuda: 'Vendas ÷ presentes únicos (ref. 3–8%).' },
      { k: 'vendas', l: 'Vendas', num: true, v: x => x.m.vendas, r: x => cel(nz(x.m.vendas, fmt.num), ledMeta(x.m.vendas, x.w.metaVendas)), ajuda: 'LED vs meta de vendas.' },
      ...(rec ? [] : [
        { k: 'inv', l: 'Investimento', num: true, v: x => x.m.investimento, r: x => nz(x.m.investimento, fmt.brl), ajuda: 'Investimento em tráfego lançado na captação.' },
        { k: 'cac', l: 'Custo/venda', num: true, v: x => x.m.cac, r: x => nz(x.m.cac, fmt.brl), ajuda: 'Investimento ÷ quantidade de vendas (CAC).', mobile: false },
      ]),
      ...(!rec ? [] : [{ k: 'fat', l: 'Faturamento', num: true, v: x => x.m.faturamento, r: x => nz(x.m.faturamento, fmt.brl) },
      { k: 'roas', l: 'ROAS', num: true, v: x => x.m.roas, r: x => cel(nz(x.m.roas, v => fmt.dec(v, 1) + '×'), ledMeta(x.m.roas, 5)), ajuda: 'Faturamento ÷ investimento. Meta da agência para lançamentos: 5×.' },
      { k: 'lucro', l: 'Lucro', num: true, v: x => x.m.lucro, r: x => `<span class="${x.m.lucro < 0 ? 't-err fw6' : ''}">${nz(x.m.lucro, fmt.brl)}</span>`, mobile: false }]),
    ],
  });
}

function melhoresPiores(ctx, lista) {
  const { ui } = ctx;
  if (lista.length < 2) return '';
  const crit = [
    ['Comparecimento', 'comparecimento', v => fmt.pct(v), 1], ['Retenção até a oferta', 'retencao', v => fmt.pct(v), 1], ['Conversão da live', 'convLive', v => fmt.pct(v), 1],
    ['Custo por inscrito', 'cpl', fmt.brl2, -1],
    ...(veReceita() ? [['ROAS', 'roas', v => fmt.dec(v, 1) + '×', 1], ['Lucro', 'lucro', fmt.brl, 1]] : [['Conversão geral', 'convGeral', v => fmt.pct(v, 2), 1], ['Custo por venda', 'cac', fmt.brl, -1]]),
  ];
  const itens = crit.map(([rot, k, f, dir]) => {
    const l = lista.filter(x => x.m[k] != null).sort((a, b) => (a.m[k] - b.m[k]) * dir);
    if (l.length < 2) return '';
    const pior = l[0], melhor = l[l.length - 1];
    return `<div class="m-webinars-mp"><span class="m-webinars-mpt">${esc(rot)}</span>
<a href="#/webinars/${esc(melhor.w.id)}" class="m-webinars-mpl"><span class="m-webinars-tag ok">Melhor</span><span class="trunc">${esc(melhor.w.tema)}</span><b class="num">${esc(f(melhor.m[k]))}</b></a>
<a href="#/webinars/${esc(pior.w.id)}" class="m-webinars-mpl"><span class="m-webinars-tag err">Pior</span><span class="trunc">${esc(pior.w.tema)}</span><b class="num">${esc(f(pior.m[k]))}</b></a></div>`;
  }).join('');
  return ui.card({ titulo: 'Melhores e piores', sub: 'Entre os webinars realizados — use para repetir o que funcionou', corpo: `<div class="m-webinars-mpg">${itens}</div>` });
}

/* ======================= DETALHE ======================= */
function detalhe(ctx, w) {
  const { ui, charts, notify } = ctx;
  ctx.migalha(curto(w.tema));
  const { captacao: cap, vendas: ven } = diario(w.id);
  const m = metricas(w, cap, ven); const st = status(w, cap); const pend = pendencias(w, m);
  const editar = podeEditar(w); const motivo = motivoSemEdicao(w);
  const ap = db.get('team', w.apresentador);
  const passou = fmt.diasAte(w.data) !== null && fmt.diasAte(w.data) < 0;

  const acoes = [
    podeLancar(w) ? ui.btn({ rotulo: 'Lançar dia', icone: 'plus', tipo: 'pri', attrs: { 'data-lancar': w.id, title: modoLancamento(w) === 'captacao' ? 'Investimento, impressões, cliques e inscritos do dia' : 'Vendas e cliques no checkout do dia' } }) : '',
    editar ? ui.btn({ rotulo: 'Preencher dados', icone: 'edit', tipo: podeLancar(w) ? undefined : 'pri', href: `#/webinars/${w.id}/preencher` }) : ui.btn({ rotulo: 'Preencher dados', icone: 'edit', disabled: true, title: motivo }),
    pend.length ? ui.btn({ rotulo: 'Pedir preenchimento', icone: 'send', attrs: { 'data-pedir': w.id }, disabled: !editar, title: editar ? 'Notifica quem é responsável pelos dados que faltam' : motivo }) : '',
    notify.botaoNotificar('webinars', w.id, w.tema),
    podeExcluir() ? ui.btnIc('trash', 'Excluir webinar', { 'data-excluir': w.id }) : '',
  ].join('');

  const avisoPend = pend.length ? ui.aviso({ tipo: 'warn', titulo: `${fmt.plural(pend.length, 'pendência')} de preenchimento`, texto: pend.map(x => x.texto).join(' · ') }) : '';

  const kp = (o) => ui.kpi(o); const rec = veReceita();
  const kpis = `<div class="g-kpi m-webinars-k8">
${kp({ rotulo: 'Inscritos', valor: nz(m.inscritos, fmt.num), comp: w.metaInscritos ? `meta ${fmt.num(w.metaInscritos)}` : 'sem meta', led: ledMeta(m.inscritos, w.metaInscritos), ajuda: 'Soma da captação diária. LED vs meta de inscritos.' })}
${kp({ rotulo: 'Custo por inscrito', valor: nz(m.cpl, fmt.brl2), comp: m.investimento != null ? `${fmt.brl(m.investimento)} investidos` : '', ajuda: 'Investimento ÷ inscritos.' })}
${kp({ rotulo: 'Comparecimento', valor: nz(m.comparecimento, v => fmt.pct(v)), comp: 'ref. 25–35%', led: m.comparecimento != null ? ledBench(m.comparecimento, BENCH.comparecimento) : undefined, ajuda: 'Presentes únicos ÷ inscritos.' })}
${kp({ rotulo: 'Retenção até a oferta', valor: nz(m.retencao, v => fmt.pct(v)), comp: 'ref. 50–65%', led: m.retencao != null ? ledBench(m.retencao, BENCH.retencao) : undefined, ajuda: 'Presentes no momento da oferta ÷ pico simultâneo.' })}
${kp({ rotulo: 'Conversão da live', valor: nz(m.convLive, v => fmt.pct(v)), comp: `geral ${nz(m.convGeral, v => fmt.pct(v, 2))}`, led: m.convLive != null ? ledBench(m.convLive, BENCH.convLive) : undefined, ajuda: 'Vendas ÷ presentes únicos (ref. 3–8%). Conversão geral = vendas ÷ inscritos.' })}
${kp({ rotulo: 'Vendas', valor: nz(m.vendas, fmt.num), comp: w.metaVendas ? `meta ${fmt.num(w.metaVendas)}${rec ? ` · CAC ${nz(m.cac, fmt.brl)}` : ''}` : '', led: ledMeta(m.vendas, w.metaVendas), ajuda: 'Ao vivo + carrinho + replay. CAC = investimento ÷ vendas.' })}
${rec ? '' : kp({ rotulo: 'Investimento em tráfego', valor: nz(m.investimento, fmt.brl), comp: w.orcamento ? `orçamento ${fmt.brl(w.orcamento)}` : 'sem orçamento definido', led: m.investimento != null && w.orcamento ? (m.investimento > w.orcamento ? 'warn' : 'ok') : undefined, ajuda: 'Soma do investimento em anúncios lançado na captação diária. LED âmbar: passou do orçamento.' })}
${rec ? '' : kp({ rotulo: 'Custo por venda', valor: nz(m.cac, fmt.brl), comp: m.checkout != null ? `${fmt.num(m.checkout)} cliques no checkout` : '', ajuda: 'Investimento em tráfego ÷ quantidade de vendas (CAC).' })}
${!rec ? '' : kp({ rotulo: 'Faturamento', valor: nz(m.faturamento, fmt.brl), comp: m.pendentes ? `${fmt.brl(m.pendentes)} em boletos/Pix pendentes` : '', ajuda: 'Faturamento bruto das vendas lançadas.' })}
${!rec ? '' : kp({ rotulo: 'ROAS · Lucro', valor: `${nz(m.roas, v => fmt.dec(v, 1) + '×')}`, comp: m.lucro != null ? `lucro ${fmt.brl(m.lucro)}` : '', led: m.roas != null ? ledMeta(m.roas, 5) : undefined, ajuda: 'ROAS = faturamento ÷ investimento (meta 5×). Lucro = faturamento − reembolsos − investimento − custos.' })}
</div>`;

  const vazioSec = (titulo, secao, texto) => {
    const quem = responsaveis(w, secao).map(nomeTime).filter(Boolean).join(', ');
    return ui.vazio({ titulo, texto: `${texto}${quem ? ` Quem preenche: ${quem}.` : ''}`, compacto: true, acao: editar ? { rotulo: 'Preencher agora', href: `#/webinars/${w.id}/preencher?etapa=${secao}`, icone: 'edit' } : null });
  };

  const capHtml = cap.length ? `${charts.barras({ rotulos: cap.map(d => fmt.dataCurta(d.data)), series: [{ nome: 'Inscritos', dados: cap.map(d => d.inscritos) }], formato: 'num', altura: 190 })}
<div class="m-webinars-sep"></div>${charts.linhas({ series: [{ nome: 'Investimento por dia', dados: cap.map(d => d.investimento), cor: 'var(--c2)', area: true }], rotulos: cap.map(d => fmt.dataCurta(d.data)), formato: 'brl', altura: 140, min: 0 })}
<div class="row sm mut m-webinars-leg"><span>Investimento por dia</span><span>CPL médio <b class="num">${nz(m.cpl, fmt.brl2)}</b></span><span>Último dia <b class="num">${nz(cap[cap.length - 1].inscritos ? cap[cap.length - 1].investimento / cap[cap.length - 1].inscritos : null, fmt.brl2)}</b> (${fmt.dataCurta(cap[cap.length - 1].data)})</span></div>` : vazioSec('Captação ainda sem lançamentos', 'captacao', 'Lance por dia o investimento, as impressões, os cliques e os inscritos.');

  const curva = ((w.aovivo || {}).curva || []);
  const io = curva.findIndex(p => p[0] >= Number(w.aovivo.minOferta));
  const retHtml = curva.length > 1 ? charts.linhas({ series: [{ nome: 'Pessoas ao vivo', dados: curva.map(p => p[1]), area: true }], rotulos: curva.map(p => `min ${p[0]}`), formato: 'num', altura: 220, min: 0, marcos: io >= 0 ? [{ i: io, rotulo: `Oferta (min ${w.aovivo.minOferta}): ${fmt.num(curva[io][1])} pessoas`, cor: 'var(--c2)' }] : [], rotuloMarcos: 'Momento da oferta' })
    : vazioSec(passou ? 'Curva de audiência não lançada' : 'A curva aparece depois da live', 'aovivo', 'Cole as linhas "minuto;pessoas" exportadas da plataforma.');

  const vendasDias = [...new Set(ven.map(v => v.data))].sort();
  const venHtml = ven.length ? `${charts.barras({ rotulos: vendasDias.map(d => fmt.dataCurta(d)), series: ['ao_vivo', 'carrinho', 'replay'].map((c, i) => ({ nome: CANAIS[c], dados: vendasDias.map(d => ven.filter(v => v.data === d && v.canal === c).reduce((a, v) => a + v.vendas, 0)), cor: ['var(--c1)', 'var(--c3)', 'var(--c4)'][i] })), empilhado: true, formato: 'num', altura: 200 })}
<div class="row sm mut m-webinars-leg">${Object.entries(m.porCanal).map(([k, v]) => `<span>${esc(CANAIS[k])}: <b class="num">${fmt.num(v)}</b></span>`).join('')}${rec ? `<span>Reembolsos: <b class="num">${nz(m.reembolsos, fmt.brl)}</b></span>` : ''}</div>` : vazioSec(passou ? 'Vendas ainda não lançadas' : 'Vendas abrem na live', 'vendas', 'Lance as vendas por dia de carrinho (ao vivo, carrinho e replay).');

  const org = (w.captacao || {}).origem || {};
  const totOrg = ORIGENS.reduce((a, [k]) => a + (Number(org[k]) || 0), 0);
  const orgHtml = totOrg ? charts.rosca({ fatias: ORIGENS.filter(([k]) => org[k]).map(([k, l], i) => ({ rotulo: l, valor: Number(org[k]), cor: `var(--c${[1, 5, 3, 4, 6][i]})` })), centro: { valor: fmt.num(totOrg), rotulo: 'inscritos' } })
    : vazioSec('Origem não informada', 'captacao', 'Informe quantos inscritos vieram de cada canal.');

  const equipe = (w.equipe || []);
  const eqHtml = equipe.length ? `<ul class="m-webinars-eq">${equipe.map(e => { const t = db.get('team', e.id) || { nome: e.id }; return `<li>${ui.avatar(t, 30, { status: true })}<div class="trunc"><b>${esc(t.nome)}</b><span class="sm mut">${esc(e.funcao || t.cargo || '')}${(e.secoes || []).length ? ` · preenche ${e.secoes.map(s => (SECOES.find(x => x.id === s) || {}).rotulo || s).join(', ').toLowerCase()}` : ''}</span></div></li>`; }).join('')}</ul>`
    : ui.vazio({ titulo: 'Ninguém escalado', texto: 'Escale a equipe no planejamento: cada pessoa recebe uma notificação.', compacto: true });

  const ck = checklistHtml(ctx, w, editar, motivo);
  const pos = w.pos || {};
  const notas = `${ui.pares([['Replay', nz(pos.replayViews, v => `${fmt.num(v)} visualizações`)], ['NPS da live', nz(pos.nps, fmt.num)], ['Tempo médio assistido', nz((w.aovivo || {}).tempoMedio, v => `${fmt.num(v)} min`)], ['Mensagens no chat', nz((w.aovivo || {}).chat, fmt.num)]], { colunas: 2 })}
<div class="m-webinars-txt"><h3>Aprendizados</h3>${pos.aprendizados ? `<p>${esc(pos.aprendizados)}</p>` : '<p class="mut">Nenhum aprendizado registrado ainda. Anote o que funcionou e o que mudar na próxima live.</p>'}</div>
${w.notas ? `<div class="m-webinars-txt"><h3>Notas</h3><p>${esc(w.notas)}</p></div>` : ''}`;

  return `<div class="pg m-webinars">
${ui.cabecalho({
    voltar: { href: '#/webinars', rotulo: 'Webinars' }, titulo: w.tema || 'Webinar sem tema',
    sub: `${w.data ? fmt.data(w.data) : 'Sem data'}${w.hora ? ` às ${esc(w.hora)}` : ''} · ${esc(w.plataforma || 'plataforma a definir')} · apresentador ${esc(ap ? ap.nome : '—')}`,
    acoes, meta: `${ui.selo(STATUS[st].e, STATUS[st].rot)}<span>Oferta: <b>${esc(w.oferta || '—')}</b>${w.ticket && rec ? ` · ticket ${fmt.brl(w.ticket)}` : ''}</span><span class="mut">Atualizado ${ui.rel(w.updatedAt || w.createdAt)}</span>`,
  })}
${avisoPend}
${kpis}
<div class="g2">${ui.card({ titulo: 'Funil do webinar', sub: 'Conversão entre etapas vs referência', corpo: funilHtml(ctx, m, { empilhado: true }) })}${ui.card({ titulo: 'Captação diária', sub: 'Inscritos por dia × investimento', corpo: capHtml })}</div>
<div class="g2">${ui.card({ titulo: 'Retenção ao vivo', sub: 'Pessoas assistindo por minuto · ponto = momento da oferta', ajuda: 'Curva de audiência exportada da plataforma. A queda até a oferta mostra se o conteúdo segurou o público.', corpo: retHtml })}${ui.card({ titulo: 'Vendas por dia de carrinho', corpo: venHtml })}</div>
<div class="g3">${ui.card({ titulo: 'Origem dos inscritos', corpo: orgHtml })}${ui.card({ titulo: 'Equipe escalada', sub: 'Quem preenche cada parte', corpo: eqHtml, acoes: editar ? ui.btn({ rotulo: 'Editar', sm: true, tipo: 'ghost', href: `#/webinars/${w.id}/preencher?etapa=planejamento` }) : '' })}${ui.card({ titulo: 'Pós-live', corpo: notas })}</div>
${ck}
${ui.card({ titulo: 'Comentários', sub: 'Digite @ para mencionar alguém da equipe', corpo: notify.comentarios('webinars', w.id, { titulo: w.tema }) })}
</div>`;
}

/** ordem do checklist: manual depois que alguém reordena; antes disso, por prazo */
function ordemChecklist(w) {
  const l = (w.checklist || []).slice();
  return w.ckManual ? l : l.sort((a, b) => String(a.prazo || '9').localeCompare(String(b.prazo || '9')));
}
function moverItem(ctx, w, id, destino) {
  const atual = db.get('webinars', w.id); const l = ordemChecklist(atual); const de = l.findIndex(c => c.id === id);
  if (de < 0) return; const para = Math.max(0, Math.min(l.length - 1, destino)); if (para === de) return;
  const antes = { checklist: atual.checklist, ckManual: !!atual.ckManual };
  const [it] = l.splice(de, 1); l.splice(para, 0, it);
  db.update('webinars', w.id, { checklist: l, ckManual: true }, { log: `reordenou o checklist do webinar "${w.tema}" ("${it.item}" para a posição ${para + 1})` });
  ctx.ui.toast(`"${it.item}" movido para a posição ${para + 1}.`, { desfazer: () => db.update('webinars', w.id, antes) });
  focoPendente = { id, dir: para > de ? 1 : -1 };
  requestAnimationFrame(focarMovido);
}
/** o shell re-renderiza a página depois do db.update (debounce): o foco volta ao botão do item movido no próximo mount */
let focoPendente = null;
function focarMovido() {
  if (!focoPendente) return;
  const { id, dir } = focoPendente;
  const b = document.querySelector(`[data-ck-mv="${CSS.escape(id)}"][data-dir="${dir}"]:not([disabled])`) || document.querySelector(`[data-ck-mv="${CSS.escape(id)}"]:not([disabled])`);
  if (b) b.focus();
}
function checklistHtml(ctx, w, editar, motivo) {
  const { ui } = ctx; const hoje = hojeISO();
  const l = ordemChecklist(w);
  const feitos = l.filter(c => c.feito).length;
  const itens = l.map(c => {
    const t = db.get('team', c.resp); const atras = !c.feito && c.prazo && c.prazo < hoje; const dd = c.prazo ? fmt.diasAte(c.prazo) : null;
    const e = c.feito ? 'ok' : atras ? 'err' : dd !== null && dd <= 2 ? 'warn' : 'off';
    const txtPrazo = c.feito ? `feito ${c.feitoEm ? fmt.dataCurta(c.feitoEm) : ''}` : !c.prazo ? 'sem prazo' : atras ? `atrasado ${fmt.plural(-dd, 'dia')}` : dd === 0 ? 'vence hoje' : `até ${fmt.dataCurta(c.prazo)}`;
    const i = l.indexOf(c);
    const mover = editar && l.length > 1 ? `<span class="m-webinars-mv"><button type="button" class="ib sm" data-ck-mv="${esc(c.id)}" data-dir="-1" aria-label="Mover “${esc(c.item)}” para cima" title="Mover para cima (Alt+↑)"${i === 0 ? ' disabled' : ''}>${ui.ic('arrow-up')}</button><button type="button" class="ib sm" data-ck-mv="${esc(c.id)}" data-dir="1" aria-label="Mover “${esc(c.item)}” para baixo" title="Mover para baixo (Alt+↓)"${i === l.length - 1 ? ' disabled' : ''}>${ui.ic('arrow-down')}</button></span>` : '<span></span>';
    return `<li class="m-webinars-ck${c.feito ? ' feito' : ''}${editar && l.length > 1 ? ' mov' : ''}" data-ck-li="${esc(c.id)}">${editar && l.length > 1 ? `<span class="m-webinars-grip" draggable="true" data-ck-grip="${esc(c.id)}" title="Arraste para reordenar" aria-hidden="true">${ui.ic('grip-vertical')}</span>` : '<span></span>'}<label class="ck"><input type="checkbox" data-ck="${esc(c.id)}"${c.feito ? ' checked' : ''}${editar ? '' : ` disabled title="${esc(motivo)}"`}><span>${esc(c.item)}</span></label>
<span class="m-webinars-ckr">${t ? ui.avatar(t, 22) : ''}<span class="sm mut trunc">${esc(t ? fmt.primeiro(t.nome) : 'sem responsável')}</span></span>
<span class="m-webinars-ckp">${ui.selo(e, txtPrazo)}</span>${mover}</li>`;
  }).join('');
  return ui.card({
    titulo: 'Checklist do lançamento', sub: `${feitos} de ${l.length} feitos · marcar um item registra na atividade da equipe${editar && l.length > 1 ? ' · arraste ⋮⋮ ou use ↑ ↓ para mudar a ordem' : ''}`,
    acoes: editar ? ui.btn({ rotulo: 'Adicionar item', icone: 'plus', sm: true, attrs: { 'data-ck-add': '' } }) : '',
    corpo: l.length ? `${ui.barra(l.length ? (feitos / l.length) * 100 : 0, { rotulo: false, fina: true, estado: feitos === l.length ? 'ok' : 'acc' })}<ul class="m-webinars-ckl">${itens}</ul>` : ui.vazio({ titulo: 'Checklist vazio', texto: 'Adicione as etapas do lançamento com responsável e prazo.', compacto: true }),
  });
}

/* ======================= AÇÕES ======================= */
async function pedirPreenchimento(ctx, w) {
  const { ui, notify } = ctx;
  const pend = pendencias(w);
  if (!pend.length) { ui.toast('Nada pendente neste webinar.', { tipo: 'info' }); return; }
  const porPessoa = new Map();
  pend.forEach(p => responsaveis(w, p.secao).forEach(tid => { if (!porPessoa.has(tid)) porPessoa.set(tid, []); porPessoa.get(tid).push(p); }));
  const pessoas = [...porPessoa.entries()].filter(([tid]) => userDoTime(tid));
  const corpo = `<form class="stack" novalidate><p class="sm mut">Cada pessoa recebe uma notificação com o link direto para a parte que falta.</p>
<fieldset class="fld"><legend>Notificar</legend><div class="stack m-webinars-pp">${pessoas.map(([tid, ps]) => `<label class="ck"><input type="checkbox" name="para" value="${esc(tid)}" checked><span><b>${esc(nomeTime(tid))}</b> <span class="sm mut">— ${esc(ps.map(p => p.texto).join('; '))}</span></span></label>`).join('')}</div></fieldset>
${ui.campo({ nome: 'msg', rotulo: 'Mensagem', tipo: 'textarea', valor: `Faltam dados do webinar "${w.tema}" (${fmt.data(w.data)}). Pode preencher hoje?`, obrigatorio: true })}
${ui.campo({ nome: 'urgente', rotulo: 'Prioridade alta', tipo: 'checkbox', valor: pertoDaData(w) })}</form>`;
  await ui.modal({
    titulo: 'Pedir preenchimento', sub: w.tema, corpo, confirmar: 'Enviar pedido',
    onConfirmar: box => {
      const f = box.querySelector('form'); const r = ui.form.validar(f, { msg: 'obrigatorio|min:5' }); if (!r.ok) return false;
      const sel = [].concat(r.dados.para || []).filter(Boolean);
      if (!sel.length) return 'Escolha pelo menos uma pessoa.';
      sel.forEach(tid => {
        const ps = porPessoa.get(tid) || []; const sec = (ps.find(p => p.secao !== 'checklist') || {}).secao;
        notify.enviar({ para: [userDoTime(tid)], tipo: 'atribuicao', prioridade: r.dados.urgente ? 'alta' : 'normal', titulo: `Preencher dados do webinar "${w.tema}"`, texto: `${r.dados.msg} Falta: ${ps.map(p => p.texto).join('; ')}.`, link: sec ? `#/webinars/${w.id}/preencher?etapa=${sec}` : `#/webinars/${w.id}`, refCol: 'webinars', refId: w.id });
      });
      db.update('webinars', w.id, { ultimoPedido: new Date().toISOString() }, { log: `pediu preenchimento do webinar "${w.tema}" a ${sel.map(nomeTime).join(', ')}` });
      ui.toast(`Pedido enviado para ${sel.map(t => fmt.primeiro(nomeTime(t))).join(', ')}.`);
      return true;
    },
  });
}

async function addItem(ctx, w) {
  const { ui, notify } = ctx;
  const time = db.list('team', t => t.ativo !== false);
  await ui.modal({
    titulo: 'Adicionar item ao checklist', sub: w.tema, confirmar: 'Adicionar',
    corpo: `<form class="fgrid" novalidate>${ui.campo({ nome: 'item', rotulo: 'Item', obrigatorio: true, cls: 'full', placeholder: 'Ex.: Teste de som com o convidado' })}
${ui.campo({ nome: 'resp', rotulo: 'Responsável', tipo: 'select', obrigatorio: true, placeholder: 'Escolha…', opcoes: time.map(t => ({ v: t.id, l: t.nome })) })}
${ui.campo({ nome: 'prazo', rotulo: 'Prazo', tipo: 'data', obrigatorio: true, valor: w.data && w.data > hojeISO() ? w.data : '' })}</form>`,
    onConfirmar: box => {
      const r = ui.form.validar(box.querySelector('form'), { item: 'obrigatorio|min:3' }); if (!r.ok) return false;
      const atual = db.get('webinars', w.id);
      const item = { id: `ck-${Date.now().toString(36)}`, item: r.dados.item, resp: r.dados.resp, prazo: r.dados.prazo, feito: false };
      db.update('webinars', w.id, { checklist: [...(atual.checklist || []), item] }, { log: `adicionou "${item.item}" ao checklist do webinar "${w.tema}"` });
      const u = userDoTime(item.resp);
      if (u) notify.enviar({ para: [u], tipo: 'atribuicao', titulo: `Novo item no checklist: ${item.item}`, texto: `Webinar "${w.tema}" · prazo ${fmt.data(item.prazo)}.`, link: `#/webinars/${w.id}`, refCol: 'webinars', refId: w.id });
      ui.toast(`Item adicionado e ${nomeTime(item.resp)} notificado.`);
      return true;
    },
  });
}

function toggleItem(ctx, w, id, feito) {
  const { ui, notify } = ctx;
  const atual = db.get('webinars', w.id); const antes = atual.checklist || [];
  const it = antes.find(c => c.id === id); if (!it) return;
  const real = ctx.real || ctx.user;
  const novo = antes.map(c => (c.id === id ? { ...c, feito, feitoEm: feito ? new Date().toISOString() : null, feitoPor: feito ? (ctx.user && ctx.user.teamId) : null } : c));
  db.update('webinars', w.id, { checklist: novo }, { log: `${feito ? 'concluiu' : 'reabriu'} "${it.item}" no checklist do webinar "${w.tema}"` });
  if (feito && it.resp && ctx.user && it.resp !== ctx.user.teamId) {
    const u = userDoTime(it.resp); if (u) notify.enviar({ para: [u], tipo: 'sistema', titulo: `"${it.item}" marcado como feito`, texto: `${real ? real.nome : 'Alguém'} concluiu no webinar "${w.tema}".`, link: `#/webinars/${w.id}`, refCol: 'webinars', refId: w.id });
  }
  ui.toast(feito ? `"${it.item}" concluído.` : `"${it.item}" reaberto.`, { desfazer: () => db.update('webinars', w.id, { checklist: antes }) });
}

async function excluir(ctx, w) {
  const { ui } = ctx;
  const ok = await ui.confirmar(`O webinar "${w.tema}", a captação diária e as vendas lançadas serão excluídos. Você pode desfazer logo em seguida.`, { titulo: 'Excluir webinar?', confirmar: 'Excluir webinar' });
  if (!ok) return;
  const linhas = db.list('webinarDaily', d => d.webinarId === w.id);
  db.batch(() => { linhas.forEach(d => db.remove('webinarDaily', d.id)); });
  const antigo = db.remove('webinars', w.id, { log: `excluiu o webinar "${w.tema}"` });
  ctx.router.go('webinars');
  ui.toast('Webinar excluído.', { desfazer: () => { db.batch(() => { db.insert('webinars', antigo); linhas.forEach(d => db.insert('webinarDaily', d)); }); } });
}

function menuLancar(ctx, ancora) {
  const l = db.list('webinars').filter(podeLancar).sort(ordemData);
  ctx.ui.popover(ancora, `<div class="m-webinars-lm" role="menu">${l.map(w => `<button type="button" role="menuitem" class="m-webinars-lmi" data-lancar="${esc(w.id)}"><b class="trunc">${esc(w.tema)}</b><span class="sm mut">${modoLancamento(w) === 'captacao' ? 'Captação' : 'Carrinho'} · live ${fmt.dataCurta(w.data)}</span></button>`).join('')}</div>`, { largura: 300, alinhar: 'fim' });
  const pop = document.querySelector('.m-webinars-lm');
  if (pop) pop.addEventListener('click', e => { const b = e.target.closest('[data-lancar]'); if (!b) return; ctx.ui.fecharTopo(); const w = db.get('webinars', b.dataset.lancar); if (w) lancarDia(ctx, w); });
}

/* ======================= MÓDULO ======================= */
export default {
  id: 'webinars', titulo: 'Webinars', icone: 'video', grupo: 'marketing', rota: 'webinars',
  routes: ['webinars', 'webinars/novo', 'webinars/:id', 'webinars/:id/:aba'],
  watch: ['webinars', 'webinarDaily', 'team', 'users', 'comments'],
  render(ctx) {
    const { ui } = ctx; const id = ctx.path === 'webinars/novo' ? 'novo' : ctx.params.id;
    if (!id) return painel(ctx);
    if (id === 'novo') {
      if (!podeCriar()) return `<div class="pg">${ui.vazio({ icone: 'lock', titulo: 'Você não pode criar webinars', texto: 'Criar webinars é para dono, administração, tráfego e atendimento. Peça para alguém te escalar em um webinar existente.', acao: { rotulo: 'Voltar aos webinars', href: '#/webinars' } })}</div>`;
      return renderForm(ctx, null);
    }
    const w = db.get('webinars', id);
    if (!w) return `<div class="pg">${ui.vazio({ icone: 'search', titulo: 'Webinar não encontrado', texto: 'Ele pode ter sido excluído. Volte à lista e escolha outro.', acao: { rotulo: 'Ver webinars', href: '#/webinars' } })}</div>`;
    if (ctx.params.aba === 'preencher') {
      if (!podeEditar(w)) { ctx.migalha(curto(w.tema)); return `<div class="pg">${ui.vazio({ icone: 'lock', titulo: 'Você não está escalado neste webinar', texto: motivoSemEdicao(w), acao: { rotulo: 'Ver o webinar', href: `#/webinars/${w.id}` } })}</div>`; }
      return renderForm(ctx, w);
    }
    if (ctx.params.aba) return `<div class="pg">${ui.vazio({ icone: 'search', titulo: 'Página não encontrada', texto: 'Este endereço do webinar não existe.', acao: { rotulo: 'Abrir o webinar', href: `#/webinars/${w.id}` } })}</div>`;
    return detalhe(ctx, w);
  },
  mount(el, ctx) {
    if (el.querySelector('[data-wf]')) return mountForm(el, ctx);
    const onClick = e => {
      const lz = e.target.closest('[data-lancar]'); if (lz) { const w = db.get('webinars', lz.dataset.lancar); if (w) lancarDia(ctx, w); return; }
      const lm = e.target.closest('[data-lancar-menu]'); if (lm) { menuLancar(ctx, lm); return; }
      const p = e.target.closest('[data-pedir]'); if (p) { const w = db.get('webinars', p.dataset.pedir); if (w) pedirPreenchimento(ctx, w); return; }
      const x = e.target.closest('[data-excluir]'); if (x) { const w = db.get('webinars', x.dataset.excluir); if (w) excluir(ctx, w); return; }
      if (e.target.closest('[data-ck-add]')) { const w = db.get('webinars', ctx.params.id); if (w) addItem(ctx, w); }
      const mv = e.target.closest('[data-ck-mv]'); if (mv && !mv.disabled) { const w = db.get('webinars', ctx.params.id); if (w && podeEditar(w)) { const l = ordemChecklist(w); moverItem(ctx, w, mv.dataset.ckMv, l.findIndex(c => c.id === mv.dataset.ckMv) + Number(mv.dataset.dir)); } }
    };
    const onKey = e => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      const li = e.target.closest('[data-ck-li]'); if (!li || !li.classList.contains('mov')) return;
      e.preventDefault(); const w = db.get('webinars', ctx.params.id); if (!w || !podeEditar(w)) return;
      const id = li.dataset.ckLi; const l = ordemChecklist(w); moverItem(ctx, w, id, l.findIndex(c => c.id === id) + (e.key === 'ArrowUp' ? -1 : 1));
    };
    let arrastando = null;
    const onDragStart = e => { const g = e.target.closest('[data-ck-grip]'); if (!g) return; arrastando = g.dataset.ckGrip; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', arrastando); } catch (_) {} const li = g.closest('li'); li.classList.add('arrastando'); try { e.dataTransfer.setDragImage(li, 20, 20); } catch (_) {} };
    const limparMarcas = () => el.querySelectorAll('.m-webinars-ck.alvo-cima,.m-webinars-ck.alvo-baixo').forEach(x => x.classList.remove('alvo-cima', 'alvo-baixo'));
    const onDragOver = e => { if (!arrastando) return; const li = e.target.closest('[data-ck-li]'); if (!li) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; limparMarcas(); const r = li.getBoundingClientRect(); li.classList.add(e.clientY < r.top + r.height / 2 ? 'alvo-cima' : 'alvo-baixo'); };
    const onDrop = e => {
      if (!arrastando) return; const li = e.target.closest('[data-ck-li]'); e.preventDefault();
      const id = arrastando; arrastando = null; limparMarcas(); el.querySelectorAll('.arrastando').forEach(x => x.classList.remove('arrastando'));
      if (!li) return; const w = db.get('webinars', ctx.params.id); if (!w || !podeEditar(w)) return;
      const l = ordemChecklist(w); const de = l.findIndex(c => c.id === id); let alvo = l.findIndex(c => c.id === li.dataset.ckLi);
      const r = li.getBoundingClientRect(); if (e.clientY >= r.top + r.height / 2) alvo += 1; if (de < alvo) alvo -= 1;
      moverItem(ctx, w, id, alvo);
    };
    const onDragEnd = () => { arrastando = null; limparMarcas(); el.querySelectorAll('.arrastando').forEach(x => x.classList.remove('arrastando')); };
    el.addEventListener('keydown', onKey); el.addEventListener('dragstart', onDragStart); el.addEventListener('dragover', onDragOver); el.addEventListener('drop', onDrop); el.addEventListener('dragend', onDragEnd);
    const onChange = e => {
      const c = e.target.closest('[data-ck]'); if (!c) return;
      const w = db.get('webinars', ctx.params.id); if (w && podeEditar(w)) { c.blur(); toggleItem(ctx, w, c.dataset.ck, c.checked); }
    };
    el.addEventListener('click', onClick); el.addEventListener('change', onChange);
    if (focoPendente) { focarMovido(); setTimeout(() => { focoPendente = null; }, 400); }
    // #/webinars/:id?lancar=1 (paleta de comandos, notificações): abre o lançamento do dia direto
    let tl = null;
    if (ctx.query.lancar && ctx.params.id && !ctx.params.aba) {
      ctx.router.setQuery({ lancar: null });
      const w = db.get('webinars', ctx.params.id);
      if (w && podeLancar(w)) tl = setTimeout(() => lancarDia(ctx, w), 60);
      else if (w) ctx.ui.toast(podeEditar(w) ? 'Este webinar não está em captação nem com carrinho aberto. Use “Preencher dados”.' : motivoSemEdicao(w), { tipo: 'info' });
    }
    void tl; // não cancela no cleanup: tirar ?lancar da URL re-renderiza a página
    return () => { el.removeEventListener('click', onClick); el.removeEventListener('change', onChange); el.removeEventListener('keydown', onKey); el.removeEventListener('dragstart', onDragStart); el.removeEventListener('dragover', onDragOver); el.removeEventListener('drop', onDrop); el.removeEventListener('dragend', onDragEnd); };
  },
  comandos() { return comandosLancar(); },
  contador() {
    const l = db.list('webinars').filter(w => pertoDaData(w) && pendencias(w).length);
    if (!l.length) return null;
    return { n: l.length, estado: 'warn', rotulo: `${fmt.plural(l.length, 'webinar')} com dados faltando perto da data` };
  },
  busca(q) {
    return db.list('webinars').filter(w => fmt.norm(w.tema).includes(q) || fmt.norm(w.oferta).includes(q)).slice(0, 6).map(w => {
      const st = status(w);
      return { tipo: 'Webinars', titulo: w.tema, sub: `${fmt.data(w.data)} · ${STATUS[st].rot}`, href: `#/webinars/${w.id}`, led: STATUS[st].e, icone: 'video' };
    });
  },
};
