// cockpit — tela inicial do dono (docs/spec-dono.md §3). Mais acionável no topo: KPIs (MRR em risco em alerta) e
// "Precisa de você hoje" com ações reais; abaixo saúde, receita × custos, torre, mapa da carteira, capacidade e renovações.
import './data.js';
import { KPIS, ORDEM_KPI, SAUDE, CARTEIRA, CARTEIRA_OUTROS, TORRE, CAPACIDADE, RENOVACOES, ITENS } from './data.js';
import { MESES, MESES_PROJ, RECEITA, CUSTOS, PROJECAO } from '../financeiro/data.js';
import { estadoFatura } from '../financeiro/calc.js';
import { padrao } from '../../core/padroes/index.js';
import { limOcupacao, rotuloOcupacao } from '../operacao/lib.js';
import { itensReais, renderReal } from './real.js'; // produção (db.dadosDemo false): tudo das coleções reais

const RES_ID = 'cockpit-resolvidos';
const SEM_EDICAO = 'Seu perfil só visualiza o Cockpit. Peça acesso de edição para marcar itens como resolvidos.';

function resolvidos(db) { const r = db.get('finance', RES_ID); return (r && r.itens) || {}; }
function salvarResolvidos(db, itens, log) { db.upsert('finance', { id: RES_ID, itens }, { log }); }

/** itens de "Precisa de você hoje" com dados vivos quando existirem */
function itensHoje(ctx) {
  const { db, fmt } = ctx; const res = resolvidos(db);
  if (!db.dadosDemo) return itensReais(ctx).map(it => (res[it.k] ? { ...it, resolvido: res[it.k] } : it));
  return ITENS.map(it => {
    const o = { ...it };
    if (it.fatura) {
      const f = db.get('invoices', it.fatura);
      if (f) {
        const e = estadoFatura(f);
        if (f.status === 'paga') { o.auto = `Paga em ${fmt.data(f.pagoEm)}`; }
        else { o.sub = `${fmt.brl(f.valor)} · ${e.atraso ? `${e.atraso} ${e.atraso === 1 ? 'dia' : 'dias'} em atraso` : e.rotulo}${f.cobrancas && f.cobrancas.length ? ` · cobrada ${fmt.rel(f.cobrancas[f.cobrancas.length - 1].quando)}` : ''}`; o.estado = e.atraso > 7 ? 'warn' : e.estado === 'ok' ? 'ok' : 'warn'; }
      }
    }
    if (it.k === 'sync') { const r = db.get('routines', 'r-sync-leads'); if (r && r.estado === 'ok') o.auto = 'Rotina voltou a operar'; }
    const rr = res[it.k]; if (rr) o.resolvido = rr;
    return o;
  });
}

/* ============================== render ============================== */
function render(ctx) {
  const { ui, fmt, db, periodo } = ctx;
  const pode = ctx.can('editar');
  const itens = itensHoje(ctx);
  const pend = itens.filter(i => !i.resolvido && !i.auto), feitos = itens.filter(i => i.resolvido || i.auto);
  const nErr = pend.filter(i => i.estado === 'err').length, nWarn = pend.filter(i => i.estado === 'warn').length;
  const h = new Date().getHours(); const saud = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const resumo = !pend.length ? 'Nada pendente para você hoje. Bom trabalho.' : [nErr ? `${fmt.plural(nErr, 'item crítico', 'itens críticos')}` : '', nWarn ? `${nWarn} de atenção` : ''].filter(Boolean).join(' e ') + ' hoje.';
  const hoje = new Date();
  const head = `<header class="ck-hd">
<div class="ck-hd-t"><h1>${fmt.esc(saud)}, ${fmt.esc(fmt.primeiro(ctx.user.nome))}.</h1>
<p>${pend.length ? `${ui.led(nErr ? 'err' : 'warn', false)}<span>Você tem <b>${fmt.esc(resumo)}</b></span>` : `${ui.led('ok', false)}<span>${fmt.esc(resumo)}</span>`}</p></div>
<div class="ck-hd-m sm mut"><span>${fmt.esc(fmt.diaSemana(hoje))}, ${fmt.data(hoje)}</span><span aria-hidden="true">·</span><span>${fmt.esc(ctx.periodoInfo.rotulo)} ${fmt.esc(ctx.periodoInfo.comparacao)}</span><span aria-hidden="true">·</span><span>atualizado ${ui.rel(new Date(Date.now() - (db.dadosDemo ? 4 * 60000 : 0)).toISOString())}</span></div></header>`;

  const kpis = `<div class="ck-kpis">${ORDEM_KPI.map(k => { const K = KPIS[k], P = K[periodo] || K.mes; return ui.kpi({ rotulo: K.rotulo, valor: P.valor || K.valor, delta: P.delta, deltaBom: K.deltaBom, comp: P.comp, serie: P.serie, ajuda: K.ajuda, alerta: K.alerta, href: K.href, formatoSerie: K.formatoSerie, id: `ck-kpi-${k}` }); }).join('')}</div>`;

  /* Precisa de você hoje */
  const linha = it => `<li class="lst-i ck-it${it.estado === 'err' ? ' is-err' : ''}" data-item="${it.k}">
<span class="lst-led">${ui.led(it.estado, false)}</span>
<div class="lst-m"><b class="lst-t">${fmt.esc(it.titulo)}</b><span class="lst-s">${fmt.esc(it.sub)}</span></div>
<span class="ck-it-a">${ui.btn({ rotulo: it.acao, href: it.href, sm: true, tipo: it.estado === 'err' ? 'pri' : '', attrs: { 'data-acao': it.k } })}${ui.btnIc('check', pode ? 'Marcar como resolvido' : SEM_EDICAO, { 'data-resolver': it.k, disabled: !pode })}</span></li>`;
  const feitosHtml = feitos.length ? `<details class="ck-feitos"${ctx.query.resolvidos ? ' open' : ''}><summary>${ui.ic('check-circle')}<span>${fmt.plural(feitos.length, 'item resolvido', 'itens resolvidos')}</span></summary><ul class="ck-fl">${feitos.map(it => `<li>${ui.led('ok', false)}<span class="trunc"><s>${fmt.esc(it.titulo)}</s> <span class="mut sm">· ${fmt.esc(it.auto || `resolvido por ${it.resolvido.por || '—'} ${fmt.rel(it.resolvido.em)}`)}</span></span>${it.auto ? '' : ui.btn({ rotulo: 'Desfazer', sm: true, tipo: 'link', disabled: !pode, attrs: { 'data-reabrir': it.k } })}</li>`).join('')}</ul></details>` : '';
  const precisa = ui.card({
    titulo: 'Precisa de você hoje', id: 'ck-hoje', cls: `ck-hoje${pend.length ? '' : ' ck-ok'}`, sub: pend.length ? fmt.plural(pend.length, 'item', 'itens') : 'tudo resolvido',
    ajuda: 'Itens que dependem de uma decisão sua, do mais crítico para o menos. Use a ação para resolver na hora ou marque como resolvido (✓) — dá para desfazer.',
    acoes: ui.btn({ rotulo: 'Alertas', href: '#/alertas', sm: true, tipo: 'ghost', iconeDir: 'arrow-right' }),
    corpo: `${pend.length ? `<ul class="lst ck-lst">${pend.map(linha).join('')}</ul>` : ui.vazio({ icone: 'check-circle', titulo: 'Tudo em ordem por hoje', texto: 'Quando algo precisar de você — cliente em risco, rotina falhando, fatura vencida — aparece aqui.', compacto: true })}${feitosHtml}`,
  });
  // produção: o resto da página sai das coleções reais (cockpit/real.js); o snapshot abaixo é só do modo demonstração
  if (!db.dadosDemo) return renderReal(ctx, head, precisa);

  /* Saúde da agência */
  const saude = ui.card({
    titulo: 'Saúde da agência', cls: 'ck-saude', ajuda: `Média ponderada de 4 componentes (0–100): ${SAUDE.componentes.map(c => `${c.rotulo} ${c.peso}%`).join(' · ')}. Faixas: ≥75 ok · 60–74 atenção · <60 crítico.`,
    corpo: `${ctx.charts.gauge(SAUDE.score, { rotulo: 'Saúde da agência', sub: SAUDE.delta[periodo] || SAUDE.delta.mes, tamanho: 190 })}
<ul class="ck-comp">${SAUDE.componentes.map(c => `<li><a href="${c.href}" data-tip="${fmt.esc(`${c.rotulo}: ${c.v}/100\n${c.txt}\nPeso ${c.peso}% · clique para abrir`)}"><span class="row between sm"><span>${fmt.esc(c.rotulo)}</span><b class="num">${c.v}</b></span>${ui.barra(c.v, { faixas: 'health', rotulo: false, fina: true })}</a></li>`).join('')}</ul>`,
  });

  /* Receita × Custos */
  const rc = receitaCustos(ctx);

  /* Torre resumo */
  const tr = TORRE.map(t => { const r = db.get('routines', t.id); return r && r.estado ? { ...t, estado: r.estado } : t; });
  const cnt = e => tr.filter(t => t.estado === e).length;
  const torre = ui.card({
    titulo: 'Torre de Controle', sub: [cnt('err') ? `${cnt('err')} falha` : '', cnt('warn') ? `${cnt('warn')} atenção` : '', `${cnt('ok')} ok`].filter(Boolean).join(' · '),
    acoes: ui.btn({ rotulo: 'Abrir', href: '#/torre', sm: true, tipo: 'ghost', iconeDir: 'arrow-right' }),
    corpo: `<ul class="ck-torre">${tr.map(t => `<li><a href="${t.estado === 'err' || t.estado === 'warn' ? `#/torre/rotina/${t.id}` : '#/torre'}">${ui.led(t.estado, false)}<span class="trunc">${fmt.esc(t.nome)}</span><span class="ck-tt ${t.estado === 'err' ? 't-err' : t.estado === 'warn' ? 't-warn' : 'mut'}">${fmt.esc(t.txt)}</span></a></li>`).join('')}</ul>`,
  });

  /* Mapa da carteira */
  const cart = CARTEIRA.map(c => { const x = db.get('clients', c.id); return x && typeof x.health === 'number' ? { ...c, nome: x.nome || c.nome, health: x.health, mrr: typeof x.mrr === 'number' ? x.mrr / 1000 : c.mrr } : c; });
  const est = h => ui.faixa(h, 'health');
  const mapa = ui.card({
    titulo: 'Mapa da carteira', sub: 'MRR × health score · tamanho = MRR', ajuda: 'Cada bolha é um cliente, com a luz pelo health score (≥75 ok · 60–74 atenção · <60 crítico). No canto superior esquerdo estão os clientes que mais pesam e correm mais risco. Clique para abrir a ficha.',
    acoes: ui.btn({ rotulo: 'Carteira', href: '#/clientes', sm: true, tipo: 'ghost', iconeDir: 'arrow-right' }),
    corpo: `${ctx.charts.dispersao({
      pontos: cart.map(c => ({ x: c.health, y: c.mrr, r: c.mrr, rotulo: c.nome, estado: est(c.health), href: `#/clientes/${c.id}`, extra: `${{ ok: 'Saudável', warn: 'Atenção', err: 'Em risco' }[est(c.health)]} · clique para abrir` })),
      eixoX: { rotulo: 'Health score', formato: 'num', min: 30, max: 100 }, eixoY: { rotulo: 'MRR (R$ mil)', formato: 'dec', min: 0, max: 16 },
      quadrantes: { x: 60, y: 8, rotulos: ['Agir já', 'Proteger', 'Acompanhar', 'Manter'], destaque: 'supEsq' }, altura: 360, legenda: false,
    })}
<div class="ck-leds">${cart.slice().sort((a, b) => a.health - b.health).map(c => `<a href="#/clientes/${c.id}" title="${fmt.esc(`${c.nome}: health ${c.health}, MRR R$ ${fmt.dec(c.mrr, 1)} mil`)}">${ui.led(est(c.health), false)}<span>${fmt.esc(c.nome)}</span><b class="num">${c.health}</b></a>`).join('')}
<a href="#/clientes" class="ck-outros">${ui.led(CARTEIRA_OUTROS.estado, false)}<span>+${CARTEIRA_OUTROS.n} clientes</span><b class="num">R$ ${fmt.dec(CARTEIRA_OUTROS.mrr, 1)}k</b></a></div>`,
  });

  /* Capacidade */
  const cap = CAPACIDADE.map(p => { const s = db.find('teamStats', x => x.teamId === p.id); const t = db.get('team', p.id); return { ...p, nome: (t && t.nome) || p.nome, v: s && typeof s.ocupacao === 'number' ? s.ocupacao : p.v }; });
  const rotOc = v => rotuloOcupacao(v).toLowerCase(); const LO = limOcupacao();
  const capacidade = ui.card({
    titulo: 'Capacidade do time', sub: `Zona ideal ${LO.min}–${LO.max}%`, ajuda: `Horas alocadas ÷ horas disponíveis na semana. >${LO.critico}% crítico · ${LO.max + 1}–${LO.critico}% atenção · ${LO.min}–${LO.max}% ideal (faixa sombreada) · <${LO.min}% ociosa.`,
    acoes: ui.btn({ rotulo: 'Equipe', href: '#/equipe', sm: true, tipo: 'ghost', iconeDir: 'arrow-right' }),
    corpo: `<ul class="ck-cap">${cap.map(p => `<li><a href="#/equipe/${p.id}">${ui.avatar(p.id, 28)}<span class="ck-cap-n"><b class="trunc">${fmt.esc(p.nome)}</b><span class="mut sm">${fmt.esc(p.area)} · ${rotOc(p.v)}</span></span><span class="ck-cap-b">${ui.barra(p.v, { faixas: 'ocupacao', zona: [LO.min, LO.max], max: 120, aria: `${p.nome}: ${p.v}% de ocupação (${rotOc(p.v)})` })}</span></a></li>`).join('')}</ul>`,
  });

  /* Renovações (horizonte da central "Padrões e regras", padrão 60 dias) */
  const hRen = padrao('clientes.renovacao.cockpit', 60), jRen = padrao('clientes.renovacao.janela', 30);
  const renovs = RENOVACOES.filter(r => { const d = fmt.diasAte(r.data); return d == null || d <= hRen; });
  const renov = ui.card({
    titulo: 'Renovações', sub: `próximos ${hRen} dias`, ajuda: `Contratos que renovam nos próximos ${hRen} dias, com o health score atual. Renovação em menos de ${jRen} dias sem reunião marcada vira alerta.`,
    corpo: `<ul class="ck-ren">${renovs.map(r => { const x = db.get('clients', r.id); const hh = x && typeof x.health === 'number' ? x.health : r.health; const urg = r.id === 'c-technova'; return `<li><a href="#/clientes/${r.id}"><span class="ck-ren-d num"><b>${fmt.esc(fmt.dataCurta(r.data).split('/')[0])}</b><span>${fmt.esc(fmt.dataCurta(r.data).split('/')[1])}</span></span><span class="ck-ren-n"><b class="trunc">${fmt.esc(r.nome)}</b><span class="sm ${urg ? 't-warn' : 'mut'} trunc">${fmt.esc(r.nota)}</span></span><span class="ck-ren-v"><span class="num">R$ ${fmt.dec(r.mrr / 1000, 1)}k</span>${ui.selo(ui.faixa(hh, 'health'), String(hh), { title: `Health score ${hh}` })}</span></a></li>`; }).join('')}</ul>`,
  });

  return `<div class="pg m-cockpit">${head}${kpis}
<div class="ck-r1">${precisa}${saude}</div>
<div class="g-2-1">${rc}${torre}</div>
<div class="g-2-1">${mapa}<div class="stack ck-st">${capacidade}${renov}</div></div></div>`;
}

function receitaCustos(ctx) {
  const { ui, charts, periodo } = ctx;
  let corpo, sub;
  if (periodo === 'tri') {
    const soma = (a, i) => Math.round((a[i] + a[i + 1] + a[i + 2]) * 10) / 10;
    const rec = [0, 3, 6, 9].map(i => soma(RECEITA, i)), cus = [0, 3, 6, 9].map(i => soma(CUSTOS, i));
    const pj = Math.round((PROJECAO[0] + PROJECAO[1] + PROJECAO[2]) * 10) / 10;
    corpo = charts.linhas({ series: [{ nome: 'Receita', dados: [...rec, pj], area: true }, { nome: 'Custos', dados: [...cus, null], cor: 'var(--c2n)' }], rotulos: ['Dez–Fev', 'Mar–Mai', 'Jun–Ago', 'Set–Nov', 'Dez–Fev'], formato: 'mil', projecaoDesde: 3, destaque: { i: 3, texto: 'Set–Nov · R$ 543,4 mil · margem 27%' }, altura: 286 });
    sub = 'R$ mil por trimestre · + projeção do próximo';
  } else {
    const txt = periodo === '12m' ? '12 meses · R$ 1,98 mi · margem 26%' : 'Nov · R$ 186,4 mil · margem 27%';
    corpo = charts.linhas({ series: [{ nome: 'Receita', dados: [...RECEITA, ...PROJECAO], area: true }, { nome: 'Custos', dados: [...CUSTOS, null, null, null], cor: 'var(--c2n)' }], rotulos: [...MESES, ...MESES_PROJ], formato: 'mil', projecaoDesde: 11, destaque: { i: 11, texto: txt }, altura: 286 });
    sub = 'R$ mil · 12 meses + projeção de 3';
  }
  return ui.card({ titulo: 'Receita × Custos', sub, ajuda: 'Receita = faturamento do mês (MRR + projetos). Custos = pessoal + ferramentas + mídia + despesas + impostos. Projeção tracejada pela tendência dos últimos 6 meses.', acoes: ui.btn({ rotulo: 'DRE', href: '#/financeiro/dre', sm: true, tipo: 'ghost', iconeDir: 'arrow-right' }), corpo });
}

/* ============================== ações ============================== */
function mount(el, ctx) {
  const { db, ui } = ctx;
  const onClick = e => {
    const r = e.target.closest('[data-resolver]');
    if (r && !r.disabled) {
      const k = r.dataset.resolver; const it = itensHoje(ctx).find(x => x.k === k) || { titulo: k };
      const itens = resolvidos(db); const antes = { ...itens };
      itens[k] = { em: new Date().toISOString(), por: ctx.user.nome };
      salvarResolvidos(db, itens, `marcou como resolvido no Cockpit: ${it.titulo}`);
      ui.toast(`"${it.titulo}" marcado como resolvido.`, { desfazer: () => salvarResolvidos(db, antes, `reabriu no Cockpit: ${it.titulo}`) });
      return;
    }
    const d = e.target.closest('[data-reabrir]');
    if (d && !d.disabled) {
      const k = d.dataset.reabrir; const it = itensHoje(ctx).find(x => x.k === k) || { titulo: k };
      const itens = resolvidos(db); const antes = { ...itens }; delete itens[k];
      salvarResolvidos(db, itens, `reabriu no Cockpit: ${it.titulo}`);
      ui.toast(`"${it.titulo}" voltou para a lista.`, { tipo: 'info', desfazer: () => salvarResolvidos(db, antes, `marcou como resolvido no Cockpit: ${it.titulo}`) });
    }
  };
  el.addEventListener('click', onClick);
  return () => el.removeEventListener('click', onClick);
}

export default {
  id: 'cockpit', titulo: 'Cockpit', icone: 'gauge', grupo: 'visao', rota: 'cockpit', routes: ['cockpit'],
  watch: ['finance', 'invoices', 'clients', 'routines', 'teamStats', 'team', 'alerts', 'cash', 'deliveries'],
  render, mount,
};
