// financeiro/real.js — Financeiro em PRODUÇÃO (db.dadosDemo === false). Nada de snapshot: tudo sai das coleções reais
// (clients, cash, invoices, payables, mrrMoves). Onde ainda não há dado, o bloco vira um estado vazio que ensina o próximo
// passo — nunca um número inventado. Também usado pelo Cockpit (KPIs, Receita × Custos, caixa).
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import { estadoFatura, abertas, aging, FAIXAS_AGING, atrasoCritico } from './calc.js';
import { padrao } from '../../core/padroes/index.js';

const MES_ROT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const JANELA = { mes: 1, tri: 3, '12m': 12 };
const hojeIso = () => fmt.iso(new Date());
const mesDe = iso => String(iso || '').slice(0, 7);
const r1 = v => Math.round(v * 10) / 10;
const mil = v => `R$ ${String((Math.round(v * 10) / 10).toFixed(1)).replace('.', ',')} mil`;

/** últimos n meses terminando no mês atual: [{id:'2026-11', rot:'Nov'}] */
export function ultimosMeses(n = 12) {
  const d = new Date(); d.setDate(1);
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push({ id: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`, rot: MES_ROT[x.getMonth()] }); }
  return out;
}
export const competenciaAtual = () => { const d = new Date(); return `${MES_LONGO[d.getMonth()]}/${d.getFullYear()}`; };
export const rotuloPeriodo = periodo => { const m = ultimosMeses(JANELA[periodo] || 1); return m.length === 1 ? MES_LONGO[Number(m[0].id.slice(5)) - 1] : `${m[0].rot.toLowerCase()}–${m[m.length - 1].rot.toLowerCase()}`; };

/* ---------- clientes ---------- */
const ENCERRADO = ['encerrado', 'inativo', 'churn', 'perdido', 'cancelado'];
export const clientesAtivos = () => db.list('clients', c => c.ativo !== false && !ENCERRADO.includes(c.status));
export const mrrReal = () => clientesAtivos().reduce((a, c) => a + (Number(c.mrr) || 0), 0);
export function concentracaoReal() {
  const lst = clientesAtivos().filter(c => Number(c.mrr) > 0).map(c => ({ id: c.id, nome: c.nome || c.fantasia || 'Cliente', mrr: Number(c.mrr) })).sort((a, b) => b.mrr - a.mrr);
  const total = lst.reduce((a, c) => a + c.mrr, 0); const top3 = lst.slice(0, 3).reduce((a, c) => a + c.mrr, 0);
  return { lst, total, top3, share: total ? (top3 / total) * 100 : null };
}

/* ---------- caixa ---------- */
const sinal = l => (l.tipo === 'entrada' ? 1 : -1) * (Number(l.valor) || 0);
export const realizados = () => { const h = hojeIso(); return db.list('cash', l => l.status !== 'previsto' && l.data && l.data <= h); };
export const temLancamentos = () => realizados().length > 0;
/** saldo = saldo inicial informado (finance 'caixa'.saldoInicial, opcional) + lançamentos realizados */
export function saldoReal() {
  const ini = Number((db.get('finance', 'caixa') || {}).saldoInicial) || 0;
  return ini + realizados().reduce((a, l) => a + sinal(l), 0);
}
/** receita e custos por mês (R$ mil) a partir dos lançamentos realizados */
export function serieMensal(n = 12) {
  const meses = ultimosMeses(n); const rs = realizados();
  const soma = (id, tipo) => r1(rs.filter(l => mesDe(l.data) === id && (tipo === 'entrada' ? l.tipo === 'entrada' : l.tipo !== 'entrada')).reduce((a, l) => a + (Number(l.valor) || 0), 0) / 1000);
  return { meses, receita: meses.map(m => soma(m.id, 'entrada')), custos: meses.map(m => soma(m.id, 'saida')) };
}
/** queima média mensal (saídas) dos últimos 3 meses com lançamentos; null sem dados */
export function queimaMensal() {
  const s = serieMensal(3); const com = s.custos.filter(v => v > 0);
  return com.length ? (com.reduce((a, v) => a + v, 0) / com.length) * 1000 : null;
}
/** projeção de 13 semanas a partir de faturas em aberto, contas a pagar e lançamentos previstos */
export function projecaoReal() {
  const seg = new Date(); seg.setHours(0, 0, 0, 0); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7));
  const h = hojeIso();
  const prev = db.list('cash', l => l.status === 'previsto' || (l.data && l.data > h));
  const fat = db.list('invoices', f => f.status !== 'paga' && f.vencimento >= h);
  const pag = db.list('payables', p => p.status !== 'paga' && p.vencimento >= h);
  let saldo = saldoReal();
  return Array.from({ length: 13 }, (_, i) => {
    const ini = fmt.iso(new Date(seg.getTime() + i * 7 * 864e5)), fim = fmt.iso(new Date(seg.getTime() + (i * 7 + 6) * 864e5));
    const dentro = d => d && d >= ini && d <= fim;
    const ent = fat.filter(f => dentro(f.vencimento)).reduce((a, f) => a + (Number(f.valor) || 0), 0) + prev.filter(l => l.tipo === 'entrada' && dentro(l.data)).reduce((a, l) => a + (Number(l.valor) || 0), 0);
    const sai = pag.filter(p => dentro(p.vencimento)).reduce((a, p) => a + (Number(p.valor) || 0), 0) + prev.filter(l => l.tipo !== 'entrada' && dentro(l.data)).reduce((a, l) => a + (Number(l.valor) || 0), 0);
    saldo += ent - sai;
    return { rotulo: fmt.dataCurta(ini), inicio: ini, entradas: ent, saidas: sai, saldo };
  });
}

/* ---------- DRE a partir dos lançamentos ---------- */
const GRUPO = { Impostos: 'impostos', Pessoal: 'pessoal', Ferramentas: 'ferramentas', 'Mídia': 'midia' };
export function dreReal(periodo = 'mes') {
  const ids = ultimosMeses(JANELA[periodo] || 1).map(m => m.id);
  const rs = realizados().filter(l => ids.includes(mesDe(l.data)));
  const t = { receitaBruta: 0, impostos: 0, pessoal: 0, comissoes: 0, ferramentas: 0, midia: 0, despesas: 0, financeiras: 0, ir: 0, n: rs.length };
  for (const l of rs) {
    const v = (Number(l.valor) || 0) / 1000;
    if (l.tipo === 'entrada') t.receitaBruta += v; else t[GRUPO[l.categoria] || 'despesas'] += v;
  }
  ['receitaBruta', 'impostos', 'pessoal', 'ferramentas', 'midia', 'despesas'].forEach(k => { t[k] = r1(t[k]); });
  t.receitaLiquida = r1(t.receitaBruta - t.impostos);
  t.ebitda = r1(t.receitaLiquida - t.pessoal - t.ferramentas - t.midia - t.despesas);
  t.lucro = t.ebitda;
  t.margem = t.receitaBruta ? (t.lucro / t.receitaBruta) * 100 : null;
  t.margemEbitda = t.receitaBruta ? (t.ebitda / t.receitaBruta) * 100 : null;
  return t;
}

/* ---------- blocos de interface ---------- */
const btnLanc = (ui, pode) => (pode ? { rotulo: 'Fazer um lançamento', icone: 'plus', attrs: { 'data-f': 'lancar' } } : undefined);
/** estado vazio em card (mesmo visual em todo o app) */
export const vazioCard = (ui, titulo, v, o = {}) => ui.card({ titulo, sub: o.sub, ajuda: o.ajuda, acoes: o.acoes, cls: `mf-vz${o.cls ? ' ' + o.cls : ''}`, corpo: ui.vazio({ compacto: true, ...v }) });

/** card "Receita × Custos" (Financeiro e Cockpit) — gráfico real ou estado vazio */
export function receitaCustosCard(ctx, o = {}) {
  const { ui, charts } = ctx;
  const s = serieMensal(12);
  const acoes = o.acoes || '';
  const ajuda = 'Receita = entradas realizadas no mês. Custos = saídas realizadas no mês. Fonte: lançamentos do Fluxo de caixa e baixas de faturas e contas.';
  if (!s.receita.some(v => v > 0) && !s.custos.some(v => v > 0)) {
    return vazioCard(ui, 'Receita × Custos', { icone: 'chart', titulo: 'Sem dados financeiros ainda', texto: 'Lance receitas e custos no Financeiro para ver a evolução mês a mês. Baixas de faturas e contas pagas também entram aqui.', acao: o.acao === false ? undefined : (o.acao || { rotulo: 'Abrir Fluxo de caixa', href: '#/financeiro/caixa', icone: 'arrow-right' }) }, { ajuda, acoes });
  }
  const i0 = Math.max(0, s.receita.findIndex((v, i) => v > 0 || s.custos[i] > 0));
  const ult = s.meses.length - 1, mg = s.receita[ult] ? ((s.receita[ult] - s.custos[ult]) / s.receita[ult]) * 100 : null;
  const corpo = charts.linhas({ series: [{ nome: 'Receita', dados: s.receita.slice(i0), area: true }, { nome: 'Custos', dados: s.custos.slice(i0), cor: 'var(--c2n)' }], rotulos: s.meses.slice(i0).map(m => m.rot), formato: 'mil',
    destaque: { i: ult - i0, texto: `${s.meses[ult].rot} · ${mil(s.receita[ult])}${mg != null ? ` · margem ${fmt.pct(mg, 0)}` : ''}` }, altura: o.altura || 280 });
  return ui.card({ titulo: 'Receita × Custos', sub: 'R$ mil · lançamentos realizados', ajuda, acoes, corpo });
}

/* ============================== abas ============================== */
export function visao(ctx, pode) {
  const { ui, charts, fmt: F, periodo } = ctx;
  const mrr = mrrReal(), nCli = clientesAtivos().length, saldo = saldoReal(), temCx = temLancamentos();
  const venc = abertas().filter(f => estadoFatura(f).atraso > 0); const vencV = venc.reduce((a, f) => a + (Number(f.valor) || 0), 0);
  const AC = atrasoCritico(), crit = venc.filter(f => estadoFatura(f).atraso > AC).length;
  const d = dreReal(periodo); const qm = queimaMensal();
  const semLanc = 'sem lançamentos no período';
  const kpis = `<div class="g-kpi mf-kpis">
${ui.kpi({ rotulo: 'MRR', valor: nCli ? F.brlK(mrr) : '—', comp: nCli ? F.plural(nCli, 'cliente ativo', 'clientes ativos') : 'nenhum cliente cadastrado', href: '#/clientes', ajuda: 'Receita recorrente mensal: soma das mensalidades (MRR) dos clientes ativos no cadastro.' })}
${ui.kpi({ rotulo: 'Receita líquida', valor: d.n ? F.brlK(d.receitaLiquida * 1000) : '—', comp: d.n ? ctx.periodoInfo.rotulo : semLanc, ajuda: 'Entradas realizadas no período menos impostos lançados (categoria Impostos).' })}
${ui.kpi({ rotulo: 'Margem líquida', valor: d.margem != null ? F.pct(d.margem, 1) : '—', comp: d.margem != null ? ctx.periodoInfo.rotulo : semLanc, href: '#/financeiro/dre', ajuda: 'Resultado ÷ receita do período, calculado dos lançamentos. Detalhe na aba DRE.' })}
${ui.kpi({ rotulo: 'Caixa', valor: temCx ? F.brlK(saldo) : '—', delta: temCx && qm ? `${F.dec(saldo / qm, 1)} meses` : undefined, deltaBom: null, comp: temCx ? (qm ? 'de runway' : 'saldo dos lançamentos') : 'nenhum lançamento ainda', href: '#/financeiro/caixa', ajuda: 'Soma dos lançamentos realizados (entradas − saídas). Runway = caixa ÷ média de saídas dos últimos 3 meses.' })}
${ui.kpi({ rotulo: 'Em atraso', valor: F.brlK(vencV), delta: F.plural(venc.length, 'fatura'), deltaBom: null, comp: crit ? `${crit} há mais de ${AC} dias` : `nenhuma há mais de ${AC} dias`, alerta: crit > 0, href: '#/financeiro/receber?f=vencidas', ajuda: `Soma das faturas em aberto depois do vencimento. Fica vermelho quando alguma passa de ${AC} dias.` })}
</div>`;
  // ponte de MRR: só com movimentos registrados no período
  const ids = ultimosMeses(JANELA[periodo] || 1).map(m => m.id);
  const mv = ctx.db.list('mrrMoves', m => ids.includes(m.mes));
  let ponte;
  if (mv.length) {
    const soma = t => r1(mv.filter(m => m.tipo === t).reduce((a, m) => a + (Number(m.valor) || 0), 0) / 1000);
    const fmil = { eixo: v => F.dec(v, 1), tip: v => `R$ ${F.dec(v, 1)} mil`, unidade: 'R$ mil' };
    ponte = ui.card({ titulo: 'Ponte de MRR', sub: rotuloPeriodo(periodo), ajuda: 'Contratos novos + upsell − downgrade − churn registrados no período.', corpo: charts.cascata({ passos: [
      { rotulo: 'Novos', valor: soma('novo'), tipo: 'mais' }, { rotulo: 'Upsell', valor: soma('upsell'), tipo: 'mais' },
      { rotulo: 'Downgrade', valor: soma('downgrade'), tipo: 'menos' }, { rotulo: 'Churn', valor: soma('churn'), tipo: 'menos' }, { rotulo: 'Crescimento líquido', tipo: 'total' }], formato: fmil, altura: 250 }) });
  } else {
    ponte = vazioCard(ui, 'Ponte de MRR', { icone: 'activity', titulo: 'Nenhum movimento de MRR no período', texto: 'Contratos novos, upsells, downgrades e cancelamentos aparecem aqui conforme os clientes são cadastrados e atualizados.', acao: { rotulo: 'Abrir Clientes', href: '#/clientes', icone: 'arrow-right' } }, { sub: rotuloPeriodo(periodo) });
  }
  const ag = aging(); const totAb = Object.values(ag).reduce((a, x) => a + x.valor, 0);
  const agingMini = `<div class="mf-aging sm">${FAIXAS_AGING.map(f => `<a class="mf-ag" href="#/financeiro/receber?faixa=${f.id}"><span class="mut">${f.rotulo}</span><b class="num">${F.brl(ag[f.id].valor)}</b><span class="mut">${F.plural(ag[f.id].n, 'fatura')}</span></a>`).join('')}</div>`;
  const c = concentracaoReal(); const LC = padrao('financeiro.concentracao.limite', 40);
  const conc = c.lst.length >= 2
    ? ui.card({ titulo: 'Concentração de receita', ajuda: `Participação dos 3 maiores clientes no MRR. Acima de ${LC}% a agência fica vulnerável à saída de um deles.`, acoes: ui.led(c.share > LC ? 'err' : 'ok', c.share > LC ? 'Concentrada' : 'Saudável'), corpo: `<div class="mf-conc"><b class="num">${F.pct(c.share, 1)}</b><span class="mut sm">do MRR está nos ${Math.min(3, c.lst.length)} maiores clientes (limite ${LC}%)</span></div>${ui.barra(c.share, { faixas: [{ ate: LC, estado: 'ok' }, { ate: Infinity, estado: 'err' }], rotulo: false })}` })
    : vazioCard(ui, 'Concentração de receita', { icone: 'building', titulo: 'Poucos clientes com MRR', texto: 'Cadastre os clientes com a mensalidade (MRR) para medir quanto a receita depende dos maiores.', acao: { rotulo: 'Cadastrar cliente', href: '#/clientes/novo', icone: 'plus' } });
  return `${kpis}
<div class="g-2-1">${receitaCustosCard(ctx, { acao: btnLanc(ui, pode) || { rotulo: 'Abrir Fluxo de caixa', href: '#/financeiro/caixa', icone: 'arrow-right' } })}
<div class="stack">${ui.card({ titulo: 'Contas a receber', sub: `${F.brl(totAb)} em aberto`, acoes: ui.btn({ rotulo: 'Ver faturas', href: '#/financeiro/receber', sm: true, tipo: 'ghost', iconeDir: 'arrow-right' }), corpo: agingMini })}
${conc}</div></div>
${ponte}`;
}

export function caixa(ctx, pode, tabelaLanc) {
  const { ui, charts, fmt: F } = ctx;
  const temCx = temLancamentos(), saldo = saldoReal(), qm = queimaMensal(), pj = projecaoReal();
  const RW = padrao('financeiro.runway.alerta', 3);
  const entT = pj.reduce((a, w) => a + w.entradas, 0), saiT = pj.reduce((a, w) => a + w.saidas, 0);
  const temProj = entT > 0 || saiT > 0;
  const minimo = Math.min(...pj.map(w => w.saldo)), semanaMin = pj.find(w => w.saldo === minimo);
  const rw = qm ? saldo / qm : null;
  const kpis = `<div class="g-kpi mf-kpis mf-caixa-k">
${ui.kpi({ rotulo: 'Saldo em caixa', valor: temCx ? F.brlK(saldo) : '—', comp: temCx ? 'lançamentos realizados' : 'nenhum lançamento ainda', ajuda: 'Entradas − saídas realizadas (lançamentos, faturas pagas e contas pagas).' })}
${ui.kpi({ rotulo: 'Runway', valor: rw != null ? `${F.dec(rw, 1)} meses` : '—', comp: rw != null ? 'caixa ÷ saídas médias' : 'precisa de saídas lançadas', led: rw == null ? undefined : rw < RW ? 'err' : rw < padrao('financeiro.runway.conforto', 6) ? 'warn' : 'ok', ajuda: `Caixa ÷ média mensal de saídas dos últimos 3 meses. Alerta abaixo de ${F.dec(RW, RW % 1 ? 1 : 0)} meses.` })}
${ui.kpi({ rotulo: 'Entradas em 90 dias', valor: F.brlK(entT), comp: 'faturas a vencer + previstos', ajuda: 'Faturas em aberto que vencem nas próximas 13 semanas e receitas lançadas como previstas.' })}
${ui.kpi({ rotulo: 'Saídas em 90 dias', valor: F.brlK(saiT), comp: 'contas a pagar + previstos', ajuda: 'Contas a pagar em aberto nas próximas 13 semanas e despesas lançadas como previstas.' })}
</div>`;
  const graficos = temProj
    ? `<div class="g2">${ui.card({ titulo: 'Entradas × saídas por semana', sub: 'R$ mil · próximas 13 semanas', corpo: charts.barras({ rotulos: pj.map(w => w.rotulo), series: [{ nome: 'Entradas', dados: pj.map(w => w.entradas / 1000), cor: 'var(--c1)' }, { nome: 'Saídas', dados: pj.map(w => w.saidas / 1000), cor: 'var(--c2n)' }], formato: 'mil', altura: 220 }) })}
${ui.card({ titulo: 'Saldo projetado (90 dias)', sub: `R$ mil · menor saldo ${F.brlK(minimo)} na semana de ${semanaMin.rotulo}`, corpo: charts.linhas({ series: [{ nome: 'Saldo projetado', dados: pj.map(w => w.saldo / 1000), area: true }], rotulos: pj.map(w => w.rotulo), formato: 'mil', altura: 220 }) })}</div>`
    : vazioCard(ui, 'Projeção de 90 dias', { icone: 'calendar', titulo: 'Nada previsto para as próximas semanas', texto: 'A projeção soma faturas a vencer, contas a pagar e lançamentos marcados como "Previsto". Registre o primeiro para ver o saldo semana a semana.', acao: btnLanc(ui, pode) });
  return `${kpis}${graficos}${tabelaLanc}`;
}

export function dreAba(ctx, pode) {
  const { ui, fmt: F, periodo } = ctx;
  const M = dreReal('mes'), T = dreReal('tri'), A = dreReal('12m'), P = { mes: M, tri: T, '12m': A }[periodo];
  if (!A.n) {
    return vazioCard(ui, 'DRE simplificada', { icone: 'chart', titulo: 'Sem dados financeiros ainda', texto: 'A DRE é montada a partir dos lançamentos realizados: receitas, impostos, pessoal, ferramentas, mídia e despesas. Lance receitas e custos no Financeiro para ver o resultado do mês, do trimestre e dos 12 meses.', acao: btnLanc(ui, pode) || { rotulo: 'Abrir Fluxo de caixa', href: '#/financeiro/caixa', icone: 'arrow-right' } }, { cls: 'mf-vz-g' });
  }
  const LIN = [['receitaBruta', 'Receita bruta', 'tot'], ['impostos', '(−) Impostos sobre a receita', 'neg'], ['receitaLiquida', 'Receita líquida', 'tot'], ['pessoal', '(−) Pessoal', 'neg'], ['ferramentas', '(−) Ferramentas e software', 'neg'], ['midia', '(−) Mídia', 'neg'], ['despesas', '(−) Despesas operacionais', 'neg'], ['ebitda', 'Resultado', 'tot fim']];
  const cel = (o, k, tipo) => `<span class="${tipo.startsWith('neg') ? 'mut' : ''}">${tipo.startsWith('neg') ? '−' : ''}${F.dec(o[k] || 0, 1)}</span>`;
  const hi = id => (id === periodo ? 'mf-hi' : '');
  const tabela = ui.tabela({
    cols: [
      { k: 'l', l: 'R$ mil', sort: false, r: x => `<span class="${x.tipo.includes('tot') ? 'fw6' : ''}">${F.esc(x.l)}</span>` },
      { k: 'mes', l: 'Mês', num: true, sort: false, cls: hi('mes'), r: x => cel(M, x.k, x.tipo) },
      { k: 'tri', l: 'Trimestre', num: true, sort: false, cls: hi('tri'), r: x => cel(T, x.k, x.tipo) },
      { k: 'ano', l: '12 meses', num: true, sort: false, cls: hi('12m'), r: x => cel(A, x.k, x.tipo) },
      { k: 'pct', l: '% da receita', num: true, sort: false, r: x => `<span class="mut">${P.receitaBruta ? F.pct((P[x.k] / P.receitaBruta) * 100, 1) : '—'}</span>` },
    ],
    linhas: LIN.map(([k, l, tipo]) => ({ k, l, tipo })), rowCls: x => (x.tipo.includes('tot') ? 'mf-tot' + (x.tipo.includes('fim') ? ' mf-fim' : '') : ''), mobile: 'scroll', legenda: 'DRE simplificada', densa: true,
  });
  return `${ui.aviso({ tipo: 'info', texto: 'Montada a partir dos lançamentos realizados. Categorias: Impostos, Pessoal, Ferramentas e Mídia têm linha própria; as demais entram em Despesas operacionais.' })}
${ui.card({ titulo: 'DRE simplificada', sub: 'R$ mil', pad: false, corpo: tabela })}`;
}

export function rentabilidade(ctx) {
  const { ui, fmt: F, charts } = ctx;
  const c = concentracaoReal();
  if (!c.lst.length) return vazioCard(ui, 'Rentabilidade por cliente', { icone: 'building', titulo: 'Nenhum cliente com mensalidade cadastrada', texto: 'A rentabilidade cruza a mensalidade (MRR) de cada cliente com as horas registradas pela equipe. Cadastre os clientes com o MRR para começar.', acao: { rotulo: 'Cadastrar cliente', href: '#/clientes/novo', icone: 'plus' } }, { cls: 'mf-vz-g' });
  const ini = fmt.iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const horas = id => ctx.db.list('timeEntries', t => t.clientId === id && String(t.data || t.dia || '') >= ini).reduce((a, t) => a + (Number(t.horas) || 0), 0);
  const linhas = c.lst.map(x => ({ ...x, horas: horas(x.id), share: (x.mrr / c.total) * 100 }));
  const tabela = ui.tabela({
    cols: [
      { k: 'nome', l: 'Cliente', r: l => `<a href="#/clientes/${F.esc(l.id)}" class="fw6">${F.esc(l.nome)}</a>` },
      { k: 'mrr', l: 'Receita/mês', num: true, r: l => F.brl(l.mrr) },
      { k: 'share', l: 'Participação', num: true, r: l => F.pct(l.share, 1) },
      { k: 'horas', l: 'Horas no mês', num: true, ajuda: 'Horas registradas pela equipe para o cliente neste mês.', r: l => (l.horas ? F.num(Math.round(l.horas)) : '<span class="mut">—</span>') },
      { k: 'taxa', l: 'R$/hora efetivo', num: true, v: l => (l.horas ? l.mrr / l.horas : 0), r: l => (l.horas ? F.brl(l.mrr / l.horas) : '<span class="mut">sem horas</span>') },
    ],
    linhas, onRowHref: l => `#/clientes/${l.id}`, legenda: 'Rentabilidade por cliente',
  });
  const top = c.lst.slice(0, 6), resto = c.total - top.reduce((a, x) => a + x.mrr, 0);
  const conc = charts.barras({ horizontal: true, rotulos: [...top.map(x => x.nome), ...(resto > 0 ? [`Demais ${c.lst.length - top.length} clientes`] : [])], series: [{ nome: 'Participação no MRR', dados: [...top.map(x => (x.mrr / c.total) * 100), ...(resto > 0 ? [(resto / c.total) * 100] : [])], cores: [...top.map((_, i) => (i < 3 ? 'var(--c1)' : 'var(--c2n)')), 'var(--c2n)'] }], formato: { eixo: v => F.pct(v, 1), tip: v => F.pct(v, 1) } });
  return `${ui.card({ titulo: 'Rentabilidade por cliente', sub: 'Mensalidade × horas registradas no mês', pad: false, corpo: tabela })}
${ui.card({ titulo: 'Concentração de receita', sub: c.share != null ? `Top 3 = ${F.pct(c.share, 1)} do MRR` : '', corpo: conc })}`;
}

export function unidade(ctx) {
  const { ui, fmt: F } = ctx;
  const n = clientesAtivos().length, mrr = mrrReal();
  const kpis = n ? `<div class="g-kpi mf-ue">${ui.kpi({ rotulo: 'Ticket médio', valor: F.brl(mrr / n), comp: `MRR ÷ ${F.plural(n, 'cliente ativo', 'clientes ativos')}`, ajuda: 'Soma do MRR dos clientes ativos dividida pelo número de clientes ativos.' })}</div>` : '';
  return `${kpis}${vazioCard(ui, 'CAC, LTV e payback', { icone: 'target', titulo: 'Sem dados de aquisição ainda', texto: 'CAC, LTV e payback precisam do investimento em aquisição (mídia própria, comercial e marketing) e do histórico de clientes ganhos e encerrados. Lance as despesas de marketing no Financeiro e registre as oportunidades ganhas no Comercial.', acao: { rotulo: 'Abrir Comercial', href: '#/comercial', icone: 'arrow-right' } }, { cls: 'mf-vz-g' })}`;
}
