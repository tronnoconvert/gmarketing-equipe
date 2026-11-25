// financeiro — Visão geral (ponte de MRR), Caixa (projeção 90 dias), DRE, Contas a receber/pagar, Rentabilidade, Unit economics.
import './data.js';
import { db as DB } from '../../core/store.js';
import { brl, data as dataF, norm } from '../../core/fmt.js';
import {
  CLIENTES, OUTROS, MRR_MENSAL, MESES, MESES_PROJ, RECEITA, CUSTOS, PROJECAO, QUEIMA_ESTRESSE, RECEITA_FIDELIDADE, UNIT, RENTAB, RENTAB_OUTROS, CUSTO_HORA, SERVICOS, nomeCliente,
} from './data.js';
import {
  estadoFatura, atrasoCritico, abertas, vencidasMais7, aging, FAIXAS_AGING, nomeFatura, saldoAtual, runway, projecao90, dre, ponte, mrrCliente, concentracao, JANELA, ROT_PER,
} from './calc.js';
import { abaComissoes, csvComissoes } from './comissoes.js';
import * as LEM from './lembretes.js';
import * as REAL from './real.js'; // produção: cálculos das coleções reais (sem snapshot de demonstração)
import { padrao } from '../../core/padroes/index.js';
/* limites da central "Padrões e regras" */
const LC = () => padrao('financeiro.concentracao.limite', 40);
const RW = () => padrao('financeiro.runway.alerta', 3);

const ABAS = [
  { id: 'visao', rotulo: 'Visão geral' }, { id: 'caixa', rotulo: 'Fluxo de caixa' }, { id: 'dre', rotulo: 'DRE' },
  { id: 'receber', rotulo: 'Receber e pagar' }, { id: 'rentabilidade', rotulo: 'Rentabilidade' }, { id: 'unidade', rotulo: 'Unit economics' },
  { id: 'comissoes', rotulo: 'Comissões' }, { id: 'automacao', rotulo: 'Automação' },
];
const SEM_EDICAO = 'Seu perfil só pode visualizar o Financeiro. Peça acesso de edição ao administrador.';
const CAT = {
  entrada: ['Mensalidade', 'Projeto avulso', 'Reembolso de mídia', 'Outras receitas'],
  saida: ['Pessoal', 'Ferramentas', 'Mídia', 'Estrutura', 'Impostos', 'Marketing', 'Outras despesas'],
};
const mil = v => `R$ ${String((Math.round(v * 10) / 10).toFixed(1)).replace('.', ',')} mil`;

/* ============================== render ============================== */
function render(ctx) {
  const { ui, fmt, params } = ctx;
  const aba = ABAS.some(a => a.id === params.aba) ? params.aba : 'visao';
  const pode = ctx.can('editar');
  if (aba !== 'visao') ctx.migalha(ABAS.find(a => a.id === aba).rotulo);
  const acoes = ui.btn({ rotulo: 'Lançamento', icone: 'plus', tipo: 'pri', disabled: !pode, title: pode ? 'Registrar receita ou despesa (atalho: L)' : SEM_EDICAO, attrs: { 'data-f': 'lancar' } });
  const ultimo = ctx.db.list('cash').concat(ctx.db.list('invoices')).map(x => x.updatedAt || x.createdAt).filter(Boolean).sort().pop();
  const demo = ctx.db.dadosDemo;
  const head = ui.cabecalho({
    titulo: 'Financeiro', sub: `Competência ${demo ? 'novembro/2026' : REAL.competenciaAtual()} · comparando ${ctx.periodoInfo.comparacao.replace(/^vs /, 'com ')}`, acoes,
    meta: demo ? `${ui.led('ok', 'Conciliação bancária em dia')}<span class="mut sm">Atualizado ${ui.rel(ultimo || new Date().toISOString())}</span>`
      : `<span class="mut sm">${ultimo ? `Último lançamento ${ui.rel(ultimo)}` : 'Nenhum lançamento ainda'}</span>`,
  });
  // produção: abas calculadas das coleções reais (Receber e pagar, Comissões e Automação já leem só dados reais)
  const corpo = (demo ? { visao, caixa, dre: dreAba, receber, rentabilidade, unidade, comissoes: abaComissoes, automacao: LEM.abaAutomacao }
    : { visao: REAL.visao, caixa: (c, p) => REAL.caixa(c, p, tabelaLancamentos(c, p)), dre: REAL.dreAba, receber, rentabilidade: REAL.rentabilidade, unidade: REAL.unidade, comissoes: abaComissoes, automacao: LEM.abaAutomacao })[aba](ctx, pode);
  return `<div class="pg m-financeiro">${head}${ui.tabs(ABAS, aba, 'financeiro')}${corpo}</div>`;
}

/* ---------- Visão geral ---------- */
function visao(ctx) {
  const { ui, charts, fmt, periodo } = ctx;
  const p = ponte(periodo), d = dre(periodo), saldo = saldoAtual(), venc = abertas().filter(f => estadoFatura(f).atraso > 0);
  const vencV = venc.reduce((a, f) => a + f.valor, 0), crit = venc.filter(f => estadoFatura(f).atraso > atrasoCritico()).length; const AC = atrasoCritico();
  const ltvcac = (UNIT.ticket * UNIT.margemContrib / 100 * UNIT.vidaMeses) / UNIT.cac;
  const comp = ctx.periodoInfo.comparacao;
  const kpis = `<div class="g-kpi mf-kpis">
${ui.kpi({ rotulo: 'MRR', valor: mil(p.final), delta: `${p.variacao >= 0 ? '▲' : '▼'} ${fmt.dec(Math.abs(p.variacao), 1)}%`, comp: { mes: comp, tri: 'vs agosto', '12m': 'vs nov/2025' }[ctx.periodo] || comp, serie: ctx.periodo === '12m' ? [139.5, ...MRR_MENSAL] : MRR_MENSAL.slice(ctx.periodo === 'tri' ? -7 : -5), formatoSerie: 'mil', ajuda: 'Receita recorrente mensal: soma das mensalidades ativas no fim do mês, sem projetos avulsos.' })}
${ui.kpi({ rotulo: 'Receita líquida', valor: mil(d.receitaLiquida), delta: ctx.periodo === 'mes' ? '▲ 3,0%' : ctx.periodo === 'tri' ? '▲ 6,8%' : '▲ 26,4%', comp, serie: RECEITA.slice(-Math.max(4, JANELA[ctx.periodo] * 2)).map(v => v * 0.92), formatoSerie: 'mil', ajuda: 'Receita bruta faturada no período menos impostos sobre a nota (Simples Nacional).' })}
${ui.kpi({ rotulo: 'Margem líquida', valor: fmt.pct(d.margem, 1), delta: ctx.periodo === 'mes' ? '▲ 1,1 pp' : ctx.periodo === 'tri' ? '▲ 1,2 pp' : '▲ 2,4 pp', comp, serie: RECEITA.map((r, i) => ((r - CUSTOS[i]) / r) * 100), formatoSerie: 'pct', href: '#/financeiro/dre', ajuda: 'Lucro líquido ÷ receita bruta do período. Detalhe na aba DRE.' })}
${ui.kpi({ rotulo: 'Caixa', valor: fmt.brlK(saldo), delta: `${fmt.dec(runway(saldo), 1)} meses`, deltaBom: null, comp: 'de runway', serie: [360, 372, 368, 380, 390, 385, 395, 402, 398, 405, saldo / 1000], formatoSerie: 'mil', href: '#/financeiro/caixa', ajuda: `Saldo em conta. Runway = caixa ÷ queima no cenário de estresse (${fmt.brlK(QUEIMA_ESTRESSE)}/mês: custos do mês menos a receita com fidelidade vigente).` })}
${ui.kpi({ rotulo: 'Em atraso', valor: fmt.brlK(vencV), delta: fmt.plural(venc.length, 'fatura'), deltaBom: null, comp: crit ? `${crit} há mais de ${AC} dias` : `nenhuma há mais de ${AC} dias`, alerta: crit > 0, href: '#/financeiro/receber?f=vencidas', ajuda: `Soma das faturas em aberto depois do vencimento. Fica vermelho quando alguma passa de ${AC} dias.` })}
${ui.kpi({ rotulo: 'LTV/CAC', valor: `${fmt.dec(ltvcac, 1)}×`, delta: '▲ 0,6', comp: 'vs trimestre anterior', serie: [5.9, 6.2, 6.4, 6.8, 7.1, 7.7], formatoSerie: 'dec', href: '#/financeiro/unidade', ajuda: 'Quanto cada cliente devolve (margem ao longo da vida) para cada R$ 1 gasto para conquistá-lo. Acima de 3× é saudável.' })}
</div>`;
  const fmil = { eixo: v => fmt.dec(v, 1), tip: v => `R$ ${fmt.dec(v, 1)} mil`, unidade: 'R$ mil' };
  const cascata = charts.cascata({ passos: [
    { rotulo: 'Novos', valor: p.novos, tipo: 'mais' }, { rotulo: 'Upsell', valor: p.upsell, tipo: 'mais' },
    { rotulo: 'Downgrade', valor: p.downgrade, tipo: 'menos' }, { rotulo: 'Churn', valor: p.churn, tipo: 'menos' }, { rotulo: 'Crescimento líquido', tipo: 'total' },
  ], formato: fmil, altura: 250 });
  const resumoPonte = `<div class="mf-ponte-r">${[['Inicial', p.inicial, ''], ['Novos', p.novos, '+'], ['Upsell', p.upsell, '+'], ['Downgrade', p.downgrade, '−'], ['Churn', p.churn, '−'], ['Final', p.final, '']].map(([k, v, s]) => `<div><span>${k}</span><b class="num${s === '−' ? ' t-err' : ''}">${s}${s && s !== '=' ? ' ' : ''}${fmt.dec(v, 1)}</b></div>`).join('')}</div>`;
  const novMov = p.movimentos.filter(m => !m.consolidado).sort((a, b) => b.valor - a.valor);
  const ROT = { novo: ['ok', 'Novo'], upsell: ['ok', 'Upsell'], downgrade: ['warn', 'Downgrade'], churn: ['err', 'Churn'] };
  const movs = novMov.length ? ui.lista(novMov.map(m => ({
    titulo: m.cliente, sub: `${ROT[m.tipo][1]} · ${m.motivo || ''}`, href: m.clientId ? `#/clientes/${m.clientId}` : undefined,
    meta: `<span class="${m.tipo === 'downgrade' || m.tipo === 'churn' ? 'mf-neg' : 'mf-in'}">${m.tipo === 'downgrade' || m.tipo === 'churn' ? '−' : '+'}${fmt.brl(m.valor)}</span>`, metaHtml: true,
  })), { cls: 'mf-movs' }) : ui.vazio({ compacto: true, icone: 'activity', titulo: 'Sem movimentos detalhados', texto: 'Os meses anteriores a novembro estão consolidados. Escolha "Mês" no topo para ver cliente a cliente.' });
  const linhas = charts.linhas({
    series: [{ nome: 'Receita', dados: [...RECEITA, ...PROJECAO], area: true }, { nome: 'Custos', dados: [...CUSTOS, null, null, null], cor: 'var(--c2n)' }],
    rotulos: [...MESES, ...MESES_PROJ], formato: 'mil', projecaoDesde: 11, destaque: { i: 11, texto: 'Nov · R$ 186,4 mil · margem 27%' }, altura: 280,
  });
  const ag = aging(); const totAb = Object.values(ag).reduce((a, x) => a + x.valor, 0);
  const agingMini = `<div class="mf-aging sm">${FAIXAS_AGING.map(f => `<a class="mf-ag" href="#/financeiro/receber?faixa=${f.id}"><span class="mut">${f.rotulo}</span><b class="num">${ctx.fmt.brl(ag[f.id].valor)}</b><span class="mut">${ctx.fmt.plural(ag[f.id].n, 'fatura')}</span></a>`).join('')}</div>`;
  const c = concentracao();
  return `${kpis}
<div class="g-2-1">${ui.card({ titulo: 'Ponte de MRR', sub: `${ROT_PER[ctx.periodo]} · de ${mil(p.inicial)} para ${mil(p.final)}`, ajuda: 'Como o MRR saiu do valor inicial e chegou ao final: + contratos novos + upsell (aumento de escopo) − downgrade (redução) − churn (cancelamentos).', corpo: cascata + resumoPonte })}
${ui.card({ titulo: ctx.periodo === 'mes' ? 'Movimentos de novembro' : 'Movimentos do período', sub: ctx.periodo === 'mes' ? `${novMov.length} contratos` : '', corpo: movs, cls: 'mf-movc' })}</div>
<div class="g-2-1">${ui.card({ titulo: 'Receita × Custos', sub: 'R$ mil · 12 meses + projeção de 3', ajuda: 'Receita = faturamento do mês (MRR + projetos). Custos = pessoal + ferramentas + mídia + despesas + impostos. Projeção pela tendência dos últimos 6 meses.', corpo: linhas })}
<div class="stack">${ui.card({ titulo: 'Contas a receber', sub: `${ctx.fmt.brl(totAb)} em aberto`, acoes: ui.btn({ rotulo: 'Ver faturas', href: '#/financeiro/receber', sm: true, tipo: 'ghost', iconeDir: 'arrow-right' }), corpo: agingMini })}
${ui.card({ titulo: 'Concentração de receita', ajuda: `Participação dos 3 maiores clientes no MRR. Acima de ${LC()}% a agência fica vulnerável à saída de um deles.`, acoes: ui.led(c.share > LC() ? 'err' : 'ok', c.share > LC() ? 'Concentrada' : 'Saudável'), corpo: `<div class="mf-conc"><b class="num">${ctx.fmt.pct(c.share, 1)}</b><span class="mut sm">do MRR está nos 3 maiores clientes (limite ${LC()}%)</span></div>${ui.barra(c.share, { faixas: [{ ate: LC(), estado: 'ok' }, { ate: Infinity, estado: 'err' }], rotulo: false })}` })}</div></div>`;
}

/* ---------- Caixa ---------- */
function caixa(ctx, pode) {
  const { ui, charts, fmt, db } = ctx;
  const saldo = saldoAtual(), rw = runway(saldo), pj = projecao90();
  const limite = QUEIMA_ESTRESSE * RW(), minimo = Math.min(...pj.map(w => w.saldo)), semanaMin = pj.find(w => w.saldo === minimo);
  const entT = pj.reduce((a, w) => a + w.entradas, 0), saiT = pj.reduce((a, w) => a + w.saidas, 0);
  const kpis = `<div class="g-kpi mf-kpis mf-caixa-k">
${ui.kpi({ rotulo: 'Saldo em caixa', valor: fmt.brlK(saldo), delta: '▲ R$ 7 mil', comp: 'vs outubro', serie: [360, 372, 368, 380, 390, 385, 395, 402, 398, 405, saldo / 1000], formatoSerie: 'mil', ajuda: 'Saldo somado das contas da agência, já conciliado com o extrato.' })}
${ui.kpi({ rotulo: 'Runway', valor: `${fmt.dec(rw, 1)} meses`, delta: rw < RW() ? 'abaixo do limite' : `acima de ${fmt.dec(RW(), RW() % 1 ? 1 : 0)} meses`, deltaBom: rw >= RW(), comp: 'cenário de estresse', led: rw < RW() ? 'err' : rw < padrao('financeiro.runway.conforto', 6) ? 'warn' : 'ok', ajuda: `Caixa ÷ queima mensal no cenário de estresse: custos do mês (R$ 135,3 mil) − receita com fidelidade vigente (${fmt.brlK(RECEITA_FIDELIDADE)}) = ${fmt.brlK(QUEIMA_ESTRESSE)}/mês. Alerta abaixo de ${fmt.dec(RW(), RW() % 1 ? 1 : 0)} meses.` })}
${ui.kpi({ rotulo: 'Entradas em 90 dias', valor: fmt.brlK(entT), comp: 'mensalidades + projetos previstos', ajuda: 'Faturas a vencer, mensalidades recorrentes e lançamentos previstos nas próximas 13 semanas.' })}
${ui.kpi({ rotulo: 'Saídas em 90 dias', valor: fmt.brlK(saiT), comp: 'inclui 13º salário', ajuda: 'Folha, impostos, ferramentas, aluguel e lançamentos previstos nas próximas 13 semanas.' })}
${ui.kpi({ rotulo: 'Menor saldo projetado', valor: fmt.brlK(minimo), comp: `semana de ${semanaMin.rotulo}`, led: minimo < limite ? 'err' : 'ok', ajuda: `Menor saldo semanal nos próximos 90 dias. A linha de alerta (${fmt.brlK(limite)}) equivale a 3 meses de queima no cenário de estresse.` })}
</div>`;
  const rot = pj.map(w => w.rotulo);
  const barras = charts.barras({ rotulos: rot, series: [{ nome: 'Entradas', dados: pj.map(w => w.entradas / 1000), cor: 'var(--c1)' }, { nome: 'Saídas', dados: pj.map(w => w.saidas / 1000), cor: 'var(--c2n)' }], formato: 'mil', altura: 220 });
  const saldoCh = charts.linhas({ series: [{ nome: 'Saldo projetado', dados: pj.map(w => w.saldo / 1000), area: true }], rotulos: rot, formato: 'mil', altura: 220, min: 0,
    metas: [{ valor: limite / 1000, rotulo: `Alerta: runway < ${fmt.dec(RW(), RW() % 1 ? 1 : 0)} meses (${fmt.brlK(limite)})` }],
    marcos: pj.map((w, i) => (w.nota ? { i, rotulo: w.nota, cor: 'var(--c2n)' } : null)).filter(Boolean), rotuloMarcos: 'Pagamentos grandes' });
  const aviso = minimo < limite
    ? ui.aviso({ tipo: 'err', titulo: `O saldo fica abaixo da linha de alerta na semana de ${semanaMin.rotulo}.`, texto: 'Antecipe recebíveis, renegocie pagamentos grandes ou adie despesas não essenciais.' })
    : ui.aviso({ tipo: 'ok', titulo: 'Sem risco de caixa nos próximos 90 dias.', texto: `O menor saldo projetado (${fmt.brlK(minimo)}) fica acima da linha de alerta de ${fmt.brlK(limite)}, mesmo com o 13º salário em dezembro.` });
  return `${kpis}${aviso}
<div class="g2">${ui.card({ titulo: 'Entradas × saídas por semana', sub: 'R$ mil · próximas 13 semanas', ajuda: 'Semanas começam na segunda-feira. Inclui lançamentos previstos que você registrar.', corpo: barras })}
${ui.card({ titulo: 'Saldo projetado (90 dias)', sub: 'R$ mil', ajuda: `Saldo atual + entradas − saídas, semana a semana. A linha tracejada é o limite de alerta de runway (${fmt.dec(RW(), RW() % 1 ? 1 : 0)} meses).`, corpo: saldoCh })}</div>
${tabelaLancamentos(ctx, pode)}`;
}
/** tabela de lançamentos de caixa (demonstração e produção) */
function tabelaLancamentos(ctx, pode) {
  const { ui, fmt, db } = ctx;
  const hoje = fmt.iso(new Date());
  const lanc = db.list('cash').sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const tabela = ui.tabela({
    cols: [
      { k: 'data', l: 'Data', r: l => fmt.data(l.data), w: '104px' },
      { k: 'descricao', l: 'Descrição', r: l => `<b>${fmt.esc(l.descricao)}</b><span class="sub">${fmt.esc(l.categoria || '')}${l.clientId && nomeCliente(l.clientId) ? ' · ' + fmt.esc(nomeCliente(l.clientId)) : ''}</span>` },
      { k: 'status', l: 'Situação', r: l => (l.status === 'previsto' || l.data > hoje ? ui.selo('info', 'Previsto') : ui.selo('ok', 'Realizado')), v: l => l.status },
      { k: 'valor', l: 'Valor', num: true, v: l => (l.tipo === 'entrada' ? 1 : -1) * l.valor, r: l => `<span class="${l.tipo === 'entrada' ? 'mf-in' : 'mf-out'}">${l.tipo === 'entrada' ? '+' : '−'}${fmt.brl(l.valor)}</span>` },
      { k: 'acoes', l: '', sort: false, r: l => (l.base || l.invoiceId || l.payableId ? '' : ui.btnIc('trash', 'Excluir lançamento', { 'data-f': 'exc-lanc', 'data-id': l.id, disabled: !pode })), w: '48px' },
    ],
    linhas: lanc, legenda: 'Lançamentos de caixa', altura: 460,
    vazio: { icone: 'wallet', titulo: 'Nenhum lançamento', texto: 'Use "+ Lançamento" para registrar uma receita ou despesa. Faturas pagas e contas quitadas entram aqui sozinhas.' },
  });
  return ui.card({ titulo: 'Lançamentos', sub: `${lanc.length} registros`, pad: false, acoes: ui.btn({ rotulo: 'Lançamento', icone: 'plus', sm: true, disabled: !pode, title: pode ? '' : SEM_EDICAO, attrs: { 'data-f': 'lancar' } }), corpo: tabela });
}

/* ---------- DRE ---------- */
function dreAba(ctx) {
  const { ui, fmt, periodo, charts, db } = ctx;
  const M = dre('mes'), T = dre('tri'), A = dre('12m'), P = { mes: M, tri: T, '12m': A }[periodo];
  const LIN = [
    ['receitaBruta', 'Receita bruta', 'tot'], ['impostos', '(−) Impostos sobre a receita', 'neg'], ['receitaLiquida', 'Receita líquida', 'tot'],
    ['pessoal', '(−) Custos de pessoal', 'neg'], ...(M.comissoes || T.comissoes || A.comissoes ? [['comissoes', '(−) Comissões variáveis', 'neg sub']] : []), ['ferramentas', '(−) Ferramentas e software', 'neg'], ['midia', '(−) Mídia repassada', 'neg'], ['despesas', '(−) Despesas operacionais', 'neg'],
    ['ebitda', 'EBITDA', 'tot'], ['financeiras', '(−) Financeiras e depreciação', 'neg'], ['ir', '(−) IR e CSLL', 'neg'], ['lucro', 'Lucro líquido', 'tot fim'],
  ];
  const cel = (o, k, tipo) => `<span class="${tipo.startsWith('neg') ? 'mut' : ''}">${tipo.startsWith('neg') ? '−' : ''}${fmt.dec(o[k] || 0, 1)}</span>`;
  const hi = id => (id === periodo ? ' mf-hi' : '');
  const linhas = LIN.map(([k, l, tipo]) => ({ k, l, tipo }));
  const tabela = ui.tabela({
    cols: [
      { k: 'l', l: 'R$ mil', sort: false, r: x => `<span class="${x.tipo.includes('tot') ? 'fw6' : x.tipo.includes('sub') ? 'mf-dre-sub' : ''}">${fmt.esc(x.l)}</span>${x.k === 'comissoes' ? ui.ajuda('Comissões variáveis por cliente (Financeiro › Comissões), separadas da folha. Já faziam parte do custo de pessoal: a linha acima mostra só o fixo, então EBITDA e lucro não mudam.') : ''}` },
      { k: 'mes', l: 'Mês (nov)', num: true, sort: false, cls: hi('mes').trim(), r: x => cel(M, x.k, x.tipo) },
      { k: 'tri', l: 'Trimestre', num: true, sort: false, cls: hi('tri').trim(), r: x => cel(T, x.k, x.tipo) },
      { k: 'ano', l: '12 meses', num: true, sort: false, cls: hi('12m').trim(), r: x => cel(A, x.k, x.tipo) },
      { k: 'pct', l: '% da receita', num: true, sort: false, r: x => `<span class="mut">${fmt.pct((P[x.k] / P.receitaBruta) * 100, 1)}</span>` },
    ],
    linhas, rowCls: x => (x.tipo.includes('tot') ? 'mf-tot' + (x.tipo.includes('fim') ? ' mf-fim' : '') : ''), mobile: 'scroll', legenda: 'DRE simplificada', densa: true,
    rodape: `<tr class="mf-tot"><td class="t1"><span class="fw6">Margem líquida</span></td><td class="n num${hi('mes')}"><b>${fmt.pct(M.margem, 1)}</b></td><td class="n num${hi('tri')}"><b>${fmt.pct(T.margem, 1)}</b></td><td class="n num${hi('12m')}"><b>${fmt.pct(A.margem, 1)}</b></td><td class="n num"><span class="mut">margem EBITDA ${fmt.pct(P.margemEbitda, 1)}</span></td></tr>`,
  });
  const grupos = [['pessoal', 'Pessoal'], ['despesas', 'Despesas operacionais'], ['ferramentas', 'Ferramentas'], ['midia', 'Mídia repassada']];
  const custos = db.list('costs');
  const rosca = charts.rosca({ fatias: grupos.map(([g, l], i) => ({ rotulo: l, valor: custos.filter(c => c.grupo === g).reduce((a, c) => a + c.valor, 0) / 1000, cor: ['var(--c1)', 'var(--c2n)', 'var(--c3)', 'var(--c4)'][i] })), centro: { valor: fmt.brlK(custos.reduce((a, c) => a + c.valor, 0)).replace(',0 mil', ' mil'), rotulo: 'por mês' }, formato: 'mil', legendaValor: 'valor' });
  const top = custos.sort((a, b) => b.valor - a.valor).slice(0, 4);
  return `${ui.aviso({ tipo: 'info', texto: `Coluna em destaque: ${{ mes: 'Mês', tri: 'Trimestre', '12m': '12 meses' }[periodo]} (troque no seletor de período do topo). Novembro é o fechamento real; meses anteriores vêm dos fechamentos mensais.` })}
<div class="g-2-1">${ui.card({ titulo: 'DRE simplificada', sub: 'Demonstração do resultado · R$ mil', ajuda: 'Receita bruta − impostos = receita líquida. Menos pessoal, ferramentas, mídia repassada e despesas = EBITDA. Menos financeiras e IR = lucro líquido.', pad: false, corpo: tabela })}
${ui.card({ titulo: 'Para onde vai o dinheiro', sub: 'Custos operacionais de novembro', corpo: `${rosca}<div class="mf-top">${ui.lista(top.map(c => ({ titulo: c.item, sub: { pessoal: 'Pessoal', ferramentas: 'Ferramentas', midia: 'Mídia', despesas: 'Despesas' }[c.grupo], meta: fmt.brl(c.valor) })))}</div>` })}</div>`;
}

/* ---------- Receber e pagar ---------- */
function receber(ctx, pode) {
  const { ui, fmt, db, query } = ctx;
  const ag = aging(); const f = query.f || 'abertas'; const faixa = query.faixa || '';
  let lst = db.list('invoices');
  const filtros = {
    abertas: x => x.status !== 'paga', vencidas: x => estadoFatura(x).atraso > 0, pagas: x => x.status === 'paga', todas: () => true,
  };
  const cont = Object.fromEntries(Object.entries(filtros).map(([k, fn]) => [k, lst.filter(fn).length]));
  lst = lst.filter(filtros[f] || filtros.abertas);
  if (faixa) lst = lst.filter(x => x.status !== 'paga' && estadoFatura(x).faixa === faixa);
  const ordem = x => { const e = estadoFatura(x); return x.status === 'paga' ? 1e6 - fmt.toDate(x.pagoEm).getTime() / 864e5 : (e.dias ?? 0); };
  lst.sort((a, b) => ordem(a) - ordem(b));
  const cards = `<div class="mf-agc">${FAIXAS_AGING.map(fx => {
    const v = ag[fx.id]; const est = fx.id === 'avencer' ? 'ok' : v.n ? (fx.id === 'f1' ? 'warn' : 'err') : 'off';
    return `<a class="mf-agi${faixa === fx.id ? ' on' : ''}" href="${fmt.esc(ctx.router.href(null, { faixa: faixa === fx.id ? null : fx.id, f: 'abertas' }))}" aria-current="${faixa === fx.id}">
<span class="mf-agl">${ui.led(est, false)}${fx.rotulo}</span><b class="num">${fmt.brl(v.valor)}</b><span class="mut sm">${v.n ? fmt.plural(v.n, 'fatura') : 'nenhuma fatura'}</span></a>`;
  }).join('')}</div>`;
  const acoesF = x => {
    if (x.status === 'paga') return `<span class="mut sm">${x.canal || ''}</span>`;
    const dis = !pode ? { disabled: true, title: SEM_EDICAO } : {};
    return `<div class="mf-acts">${ui.btn({ rotulo: 'Cobrar', icone: 'send', sm: true, attrs: { 'data-f': 'cobrar', 'data-id': x.id }, ...dis })}${ui.btn({ rotulo: 'Marcar como paga', icone: 'check', sm: true, tipo: 'ghost', attrs: { 'data-f': 'pagar', 'data-id': x.id }, ...dis })}${ui.btn({ rotulo: 'Renegociar', icone: 'calendar', sm: true, tipo: 'ghost', attrs: { 'data-f': 'reneg', 'data-id': x.id }, ...dis })}</div>`;
  };
  const tabela = ui.tabela({
    cols: [
      { k: 'cliente', l: 'Cliente', v: x => nomeFatura(x), r: x => `${x.clientId ? `<a href="#/clientes/${fmt.esc(x.clientId)}/financeiro" class="fw6">${fmt.esc(nomeFatura(x))}</a>` : `<b>${fmt.esc(nomeFatura(x))}</b>`}<span class="sub">${fmt.esc(x.descricao)} · nº ${fmt.esc(x.numero)}</span>` },
      { k: 'vencimento', l: 'Vencimento', r: x => fmt.data(x.vencimento) },
      { k: 'valor', l: 'Valor', num: true, r: x => fmt.brl(x.valor) },
      { k: 'st', l: 'Pagamento', v: x => estadoFatura(x).atraso * 1000 - (estadoFatura(x).dias ?? 0), r: x => { const e = estadoFatura(x); const lem = LEM.ultimoLembrete(x); return `${ui.led(e.estado, e.rotulo)}${x.cobrancas && x.cobrancas.length ? `<span class="sub">${fmt.plural(x.cobrancas.length, 'cobrança')} · última ${fmt.rel(x.cobrancas[x.cobrancas.length - 1].quando)}</span>` : ''}${lem ? `<span class="sub mf-lem-s" data-tip="${fmt.esc(`Para ${lem.paraNome || ''} ${lem.para || ''}\n${lem.status || ''}`)}">${ui.ic('message')}${fmt.esc(LEM.rotLembrete(lem))}</span>` : ''}`; } },
      { k: 'acoes', l: 'Ações', sort: false, r: acoesF },
    ],
    linhas: lst, legenda: 'Faturas', rowCls: x => (x.id === query.fatura ? 'mf-sel' : ''),
    vazio: { titulo: f === 'vencidas' ? 'Nenhuma fatura vencida' : 'Nenhuma fatura neste filtro', texto: f === 'vencidas' ? 'Tudo em dia. Quando uma fatura passar do vencimento ela aparece aqui com a ação Cobrar.' : 'Troque o filtro acima ou limpe a faixa selecionada.' },
  });
  const chips = ui.chips([{ id: 'abertas', rotulo: 'Em aberto', n: cont.abertas }, { id: 'vencidas', rotulo: 'Vencidas', n: cont.vencidas, estado: cont.vencidas ? 'err' : undefined }, { id: 'pagas', rotulo: 'Pagas', n: cont.pagas }, { id: 'todas', rotulo: 'Todas', n: cont.todas }], f, 'f');
  const limpar = faixa ? ui.btn({ rotulo: `Faixa: ${FAIXAS_AGING.find(x => x.id === faixa).rotulo}`, icone: 'x', sm: true, tipo: 'ghost', href: ctx.router.href(null, { faixa: null }), title: 'Limpar faixa' }) : '';
  // contas a pagar
  const hoje = fmt.iso(new Date());
  const pays = db.list('payables').sort((a, b) => (a.status === 'paga') - (b.status === 'paga') || a.vencimento.localeCompare(b.vencimento));
  const estP = x => { if (x.status === 'paga') return ['ok', `Paga em ${fmt.dataCurta(x.pagoEm)}`]; const d = fmt.diasAte(x.vencimento); return d < 0 ? ['err', `Vencida há ${-d} ${-d === 1 ? 'dia' : 'dias'}`] : d <= 3 ? ['warn', d === 0 ? 'Vence hoje' : d === 1 ? 'Vence amanhã' : `Vence em ${d} dias`] : ['ok', `Vence em ${d} dias`]; };
  const aPagar = pays.filter(x => x.status !== 'paga');
  const tabP = ui.tabela({
    cols: [
      { k: 'descricao', l: 'Conta', r: x => `<b>${fmt.esc(x.descricao)}</b><span class="sub">${fmt.esc(x.categoria)}</span>` },
      { k: 'vencimento', l: 'Vencimento', r: x => fmt.data(x.vencimento) },
      { k: 'valor', l: 'Valor', num: true, r: x => fmt.brl(x.valor) },
      { k: 'st', l: 'Situação', v: x => x.vencimento, r: x => ui.led(...estP(x)) },
      { k: 'a', l: '', sort: false, r: x => (x.status === 'paga' ? '' : ui.btn({ rotulo: 'Pagar', icone: 'check', sm: true, tipo: 'ghost', disabled: !pode, title: pode ? 'Registrar pagamento' : SEM_EDICAO, attrs: { 'data-f': 'pagar-conta', 'data-id': x.id } })) },
    ],
    linhas: pays, legenda: 'Contas a pagar',
  });
  void hoje;
  const lc = LEM.config(db);
  const lemLink = `<a class="mf-lem-lnk sm" href="#/financeiro/automacao" title="Configurar lembretes automáticos de vencimento por WhatsApp">${ui.led(lc.ativo ? 'ok' : 'off', false)}<span>Lembretes WhatsApp ${lc.ativo ? 'ligados' : 'desligados'}</span></a>`;
  return `${cards}
${ui.card({ titulo: 'Contas a receber', sub: `${fmt.brl(abertas().reduce((a, x) => a + x.valor, 0))} em aberto`, ajuda: `Faturas emitidas para clientes. LED verde = em dia ou paga; âmbar = vence em até 1 dia ou até ${atrasoCritico()} dias de atraso; vermelho = mais de ${atrasoCritico()} dias de atraso.`, pad: false,
    acoes: `${limpar}${lemLink}`, corpo: `<div class="mf-fil">${chips}</div>${tabela}` })}
${ui.card({ titulo: 'Contas a pagar', sub: `${fmt.brl(aPagar.reduce((a, x) => a + x.valor, 0))} nos próximos 30 dias`, pad: false, corpo: tabP })}`;
}

/* ---------- Rentabilidade ---------- */
function rentabilidade(ctx) {
  const { ui, fmt, charts } = ctx;
  const linhas = RENTAB.map(r => {
    const receita = mrrCliente(r.clientId), custo = r.reais * CUSTO_HORA + r.direto;
    return { ...r, nome: nomeCliente(r.clientId), receita, custo, margem: ((receita - custo) / receita) * 100, taxa: receita / r.reais, excesso: ((r.reais - r.contratadas) / r.contratadas) * 100 };
  });
  const o = RENTAB_OUTROS; const oc = o.reais * CUSTO_HORA + o.direto;
  linhas.push({ clientId: null, nome: `Outros ${OUTROS.n} clientes`, receita: OUTROS.mrr, contratadas: o.contratadas, reais: o.reais, custo: oc, margem: ((OUTROS.mrr - oc) / OUTROS.mrr) * 100, taxa: OUTROS.mrr / o.reais, excesso: ((o.reais - o.contratadas) / o.contratadas) * 100, outros: true });
  const OA = padrao('financeiro.overservicing.atencao', 15), OC = padrao('financeiro.overservicing.critico', 40);
  const over = linhas.filter(l => !l.outros && l.excesso > OA);
  const tabela = ui.tabela({
    cols: [
      { k: 'nome', l: 'Cliente', r: l => (l.clientId ? `<a href="#/clientes/${fmt.esc(l.clientId)}" class="fw6">${fmt.esc(l.nome)}</a>` : `<b>${fmt.esc(l.nome)}</b>`) },
      { k: 'receita', l: 'Receita/mês', num: true, r: l => fmt.brl(l.receita) },
      { k: 'reais', l: 'Horas', num: true, ajuda: 'Horas consumidas no mês ÷ horas previstas no escopo do contrato.', r: l => `${fmt.num(l.reais)}<span class="mut"> / ${fmt.num(l.contratadas)} h</span>` },
      { k: 'excesso', l: 'Overservicing', num: true, ajuda: `Horas acima do escopo. Acima de ${OA}% a equipe está entregando mais do que o contrato paga.`, r: l => (l.excesso > OA && !l.outros ? ui.led(l.excesso > OC ? 'err' : 'warn', `+${fmt.pct(l.excesso, 0)}`) : l.excesso > 0 ? `<span class="mut">+${fmt.pct(l.excesso, 0)}</span>` : `<span class="mut">${fmt.pct(l.excesso, 0)}</span>`) },
      { k: 'taxa', l: 'R$/hora efetivo', num: true, ajuda: `Receita ÷ horas consumidas. Custo médio da hora da equipe: ${fmt.brl(CUSTO_HORA)}.`, r: l => `<span class="${l.taxa < 100 ? 't-err fw6' : ''}">${fmt.brl(l.taxa)}</span>` },
      { k: 'margem', l: 'Margem', num: true, ajuda: 'Margem de contribuição: (receita − horas × custo da hora − custos diretos do cliente) ÷ receita.', r: l => `<div class="mf-mg">${ui.barra(Math.max(0, l.margem), { faixas: [{ ate: 20, estado: 'err' }, { ate: 35, estado: 'warn' }, { ate: Infinity, estado: 'ok' }], texto: fmt.pct(l.margem, 0), max: 60 })}</div>` },
    ],
    linhas, onRowHref: l => (l.clientId ? `#/clientes/${l.clientId}` : null), legenda: 'Rentabilidade por cliente', rowCls: l => (l.excesso > OC && !l.outros ? 'mf-over' : ''),
  });
  const c = concentracao();
  const conc = charts.barras({ horizontal: true, rotulos: [...c.lst.slice(0, 6).map(x => x.nome), `Demais ${OUTROS.n + 5} clientes`], series: [{ nome: 'Participação no MRR', dados: [...c.lst.slice(0, 6).map(x => (x.mrr / c.total) * 100), ((c.total - c.lst.slice(0, 6).reduce((a, x) => a + x.mrr, 0)) / c.total) * 100], cores: [...c.lst.slice(0, 6).map((_, i) => (i < 3 ? 'var(--c1)' : 'var(--c2n)')), 'var(--c2n)'] }], formato: { eixo: v => fmt.pct(v, 1), tip: v => fmt.pct(v, 1) } });
  const serv = charts.barras({ horizontal: true, rotulos: SERVICOS.map(s => s.nome), series: [{ nome: 'Margem de contribuição', dados: SERVICOS.map(s => s.margem), cores: SERVICOS.map(s => (s.margem < padrao('financeiro.margemServico.atencao', 25) ? 'var(--warn)' : 'var(--c1)')) }], formato: { eixo: v => fmt.pct(v, 0), tip: v => `${fmt.pct(v, 0)} de margem` } });
  const servLista = `<ul class="mf-serv sm">${SERVICOS.map(s => `<li><span>${fmt.esc(s.nome)}</span><span class="mut num">${mil(s.receita)}</span><b class="num">${fmt.pct(s.margem, 0)}</b></li>`).join('')}</ul>`;
  return `${over.length ? ui.aviso({ tipo: 'warn', titulo: `${fmt.plural(over.length, 'cliente consome', 'clientes consomem')} mais de ${OA}% acima das horas do escopo.`, texto: `${over.map(l => l.nome).join(', ')}. Revise o escopo ou reprecifique na renovação.` }) : ''}
${ui.card({ titulo: 'Rentabilidade por cliente', sub: 'Novembro · receita × horas × margem', pad: false, corpo: tabela })}
<div class="g2">${ui.card({ titulo: 'Concentração de receita', sub: `Top 3 = ${fmt.pct(c.share, 1)} do MRR`, ajuda: `Participação dos maiores clientes no MRR. Alerta (LED vermelho) quando os 3 maiores passam de ${LC()}%.`, acoes: ui.led(c.share > LC() ? 'err' : 'ok', c.share > LC() ? `Acima de ${LC()}%` : `Abaixo de ${LC()}%`), corpo: conc })}
${ui.card({ titulo: 'Margem por serviço', sub: 'Margem de contribuição · novembro', ajuda: 'Receita do serviço menos horas da equipe e custos diretos alocados ao serviço. Âmbar abaixo de 25%.', corpo: serv + servLista })}</div>`;
}

/* ---------- Unit economics ---------- */
function unidade(ctx) {
  const { ui, fmt, charts } = ctx;
  const u = UNIT; const margemMes = u.ticket * u.margemContrib / 100; const ltv = margemMes * u.vidaMeses; const razao = ltv / u.cac; const payback = u.cac / margemMes;
  const kpis = `<div class="g-kpi mf-ue">
${ui.kpi({ rotulo: 'CAC', valor: fmt.brl(u.cac), delta: '▼ 3,0%', deltaBom: true, comp: 'vs trimestre anterior', serie: u.cacSerie, formatoSerie: 'brl', ajuda: `Custo de aquisição: (mídia de captação + comercial + marketing do trimestre = ${fmt.brl(u.investTri)}) ÷ ${u.novosTri} clientes novos no trimestre.` })}
${ui.kpi({ rotulo: 'LTV', valor: fmt.brlK(ltv), delta: '▲ 4,2%', comp: 'vs trimestre anterior', ajuda: `Valor do cliente ao longo da vida: ticket médio (${fmt.brl(u.ticket)}) × margem de contribuição (${u.margemContrib}%) × permanência média (${u.vidaMeses} meses).` })}
${ui.kpi({ rotulo: 'LTV/CAC', valor: `${fmt.dec(razao, 1)}×`, delta: '▲ 0,6', comp: `meta ≥ ${fmt.dec(padrao('financeiro.ltvcac.meta', 3), 1).replace(',0', '')}×`, led: razao >= padrao('financeiro.ltvcac.meta', 3) ? 'ok' : 'err', ajuda: `Quanto cada R$ 1 investido em aquisição retorna em margem. Abaixo de ${fmt.dec(padrao('financeiro.ltvcac.meta', 3), 1).replace(',0', '')}× a aquisição está cara; acima de 8× talvez valha investir mais em crescimento.` })}
${ui.kpi({ rotulo: 'Payback do CAC', valor: `${fmt.dec(payback, 1)} meses`, delta: '▼ 0,3 mês', deltaBom: true, comp: `meta ≤ ${padrao('financeiro.payback.meta', 6)} meses`, led: payback <= padrao('financeiro.payback.meta', 6) ? 'ok' : 'warn', ajuda: `Meses de margem para recuperar o CAC: CAC ÷ (ticket × margem de contribuição) = ${fmt.brl(u.cac)} ÷ ${fmt.brl(margemMes)}.` })}
</div>`;
  const cacCh = charts.linhas({ series: [{ nome: 'CAC', dados: u.cacSerie, area: true }], rotulos: ['Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov'], formato: 'brl', altura: 220, metas: [{ valor: padrao('financeiro.cac.teto', 5000), rotulo: `Teto ${fmt.brl(padrao('financeiro.cac.teto', 5000))}` }] });
  const pay = charts.barras({ rotulos: Array.from({ length: 8 }, (_, i) => `M${i + 1}`), series: [{ nome: 'Margem acumulada', dados: Array.from({ length: 8 }, (_, i) => margemMes * (i + 1)), cores: Array.from({ length: 8 }, (_, i) => (margemMes * (i + 1) >= u.cac ? 'var(--ok)' : 'var(--c2n)')) }], formato: 'brl', altura: 220, metas: [{ valor: u.cac, rotulo: `CAC ${fmt.brl(u.cac)}` }] });
  const formulas = ui.pares([
    ['Ticket médio', `${fmt.brl(u.ticket)} <span class="mut sm">MRR ÷ 42 clientes</span>`],
    ['Margem de contribuição', `${fmt.pct(u.margemContrib, 0)} <span class="mut sm">média ponderada dos serviços</span>`],
    ['Permanência média', `${u.vidaMeses} meses <span class="mut sm">histórico de clientes encerrados</span>`],
    ['Investimento em aquisição', `${fmt.brl(u.investTri)} <span class="mut sm">no trimestre</span>`],
    ['Clientes novos', `${u.novosTri} <span class="mut sm">no trimestre</span>`],
    ['Margem por cliente/mês', fmt.brl(margemMes)],
  ], { colunas: 2 });
  return `${kpis}
<div class="g2">${ui.card({ titulo: 'CAC por mês', sub: 'Custo para conquistar um cliente', corpo: cacCh })}
${ui.card({ titulo: 'Payback do CAC', sub: 'Margem acumulada de um cliente novo × CAC', ajuda: 'Cada barra é a margem acumulada de um cliente novo mês a mês. Quando passa da linha tracejada (CAC), a aquisição está paga.', corpo: pay })}</div>
${ui.card({ titulo: 'Como os números são calculados', corpo: formulas })}`;
}

/* ============================== ações ============================== */
function contatoCliente(ctx, clientId) {
  const ct = ctx.db.list('contacts', c => c.clientId === clientId);
  const fin = ct.find(c => /financ/i.test(c.papel || c.cargo || '')) || ct[0];
  return { nome: fin ? fin.nome : 'Financeiro do cliente', tel: (fin && (fin.whatsapp || fin.telefone)) || '', email: (fin && fin.email) || '' };
}
function mensagemPadrao(ctx, f) {
  const { fmt } = ctx; const e = estadoFatura(f); const nome = nomeFatura(f).replace(/ \(ex-cliente\)$/, '');
  const quando = e.atraso ? `venceu em ${fmt.data(f.vencimento)} (${e.atraso} ${e.atraso === 1 ? 'dia' : 'dias'} de atraso)` : `vence em ${fmt.data(f.vencimento)}`;
  return `Olá, equipe ${nome}! Tudo bem? Passando para lembrar que a fatura nº ${f.numero} (${f.descricao}), no valor de ${fmt.brl2(f.valor)}, ${quando}. Segue o link para pagamento por Pix ou boleto. Se já pagou, pode desconsiderar e nos enviar o comprovante. Obrigado!`;
}
async function cobrar(ctx, id) {
  const { ui, fmt, db, notify } = ctx;
  const f = db.get('invoices', id); if (!f) { ui.toast('Fatura não encontrada. Ela pode ter sido removida.', { tipo: 'err' }); return; }
  if (f.status === 'paga') { ui.toast(`Esta fatura já foi paga em ${fmt.data(f.pagoEm)}.`, { tipo: 'info' }); return; }
  if (!ctx.can('financeiro', 'editar')) { ui.toast(SEM_EDICAO, { tipo: 'warn' }); return; }
  const e = estadoFatura(f); const ct = contatoCliente(ctx, f.clientId);
  const corpo = `<form class="stack mf-cob" novalidate>
<div class="mf-cob-h">${ui.led(e.estado, false)}<div><b>${fmt.esc(nomeFatura(f))}</b><span class="mut sm">${fmt.brl(f.valor)} · ${fmt.esc(e.rotulo)} · nº ${fmt.esc(f.numero)}</span></div></div>
${ui.campo({ nome: 'canal', rotulo: 'Canal', tipo: 'radio', opcoes: [{ v: 'whatsapp', l: 'WhatsApp' }, { v: 'email', l: 'E-mail' }], valor: 'whatsapp' })}
${ui.campo({ nome: 'para', rotulo: 'Enviar para', valor: ct.tel || ct.email, placeholder: 'WhatsApp ou e-mail do financeiro do cliente', dica: `${ct.nome}. O envio é simulado no modo demonstração.` })}
${ui.campo({ nome: 'mensagem', rotulo: 'Mensagem', tipo: 'textarea', linhas: 6, valor: mensagemPadrao(ctx, f), obrigatorio: true, dica: 'Mensagem pronta — edite à vontade antes de enviar.' })}
${f.cobrancas && f.cobrancas.length ? `<p class="sm mut">Já cobrada ${fmt.plural(f.cobrancas.length, 'vez', 'vezes')}; última ${fmt.rel(f.cobrancas[f.cobrancas.length - 1].quando)} por ${fmt.esc(f.cobrancas[f.cobrancas.length - 1].canal === 'whatsapp' ? 'WhatsApp' : 'e-mail')}.</p>` : ''}
</form>`;
  let enviado = null;
  const ok = await ui.modal({ titulo: 'Cobrar fatura', sub: nomeFatura(f), corpo, confirmar: 'Enviar cobrança', largura: 'md',
    onAbrir: box => {
      box.addEventListener('change', ev => {
        if (ev.target.name !== 'canal') return; const p = box.querySelector('[name=para]');
        p.value = ev.target.value === 'email' ? (ct.email || '') : (ct.tel || ''); p.placeholder = ev.target.value === 'email' ? 'financeiro@cliente.com.br' : '+55 (11) 91234-5678';
      });
    },
    onConfirmar: box => {
      const r = ui.form.validar(box.querySelector('form'), { mensagem: 'obrigatorio|min:20', para: [v => (!v ? 'Informe para quem enviar.' : ''), (v, d) => (d.canal === 'email' ? ui.valida.email(v) : ui.valida.telefone(v))] });
      if (!r.ok) return false;
      enviado = r.dados; return true;
    } });
  if (!ok || !enviado) return;
  const canal = enviado.canal === 'email' ? 'e-mail' : 'WhatsApp';
  const antes = f.cobrancas || [];
  db.update('invoices', f.id, { cobrancas: [...antes, { quando: new Date().toISOString(), canal: enviado.canal, para: enviado.para, mensagem: enviado.mensagem, por: ctx.user.nome }] }, { log: `cobrou a fatura nº ${f.numero} de ${nomeFatura(f)} (${fmt.brl(f.valor)}) por ${canal}` });
  const resp = f.clientId && (db.get('clients', f.clientId) || {}).respId || (db.dadosDemo ? (CLIENTES.find(c => c.id === f.clientId) || {}).resp : null);
  const respUser = resp && (db.get('team', resp) || {}).userId;
  const fin = db.dadosDemo ? ['u-paulo'] : db.list('users', u => u.papel === 'financeiro' && u.ativo !== false).map(u => u.id);
  const para = [...new Set([respUser, ...fin])].filter(u => u && u !== ctx.real.id);
  if (para.length) notify.enviar({ para, de: ctx.real.id, tipo: 'mensagem', titulo: `Cobrança enviada: ${nomeFatura(f)}`, texto: `${fmt.brl(f.valor)} · ${estadoFatura(f).rotulo}. Enviada por ${canal} por ${ctx.user.nome}.`, link: `#/financeiro/receber?fatura=${f.id}`, refCol: 'invoices', refId: f.id });
  ui.toast(`Cobrança enviada por ${canal} para ${nomeFatura(f)}.`, { desfazer: () => db.update('invoices', f.id, { cobrancas: antes }, { log: `desfez a cobrança da fatura nº ${f.numero}` }) });
}
async function marcarPaga(ctx, id) {
  const { ui, fmt, db } = ctx;
  const f = db.get('invoices', id); if (!f || f.status === 'paga') return;
  let dados = null;
  const ok = await ui.modal({ titulo: 'Marcar fatura como paga?', sub: `${nomeFatura(f)} · ${fmt.brl(f.valor)}`, confirmar: 'Confirmar pagamento', largura: 'sm',
    corpo: `<form class="stack" novalidate><p class="mb-txt">A fatura sai de contas a receber e o valor entra no caixa. Você pode desfazer logo em seguida.</p>
${ui.campo({ nome: 'data', rotulo: 'Data do pagamento', tipo: 'data', valor: fmt.iso(new Date()), obrigatorio: true })}
${ui.campo({ nome: 'forma', rotulo: 'Forma', tipo: 'select', opcoes: ['Pix', 'Boleto', 'Transferência', 'Cartão'], valor: f.canal === 'Pix' ? 'Pix' : 'Boleto' })}</form>`,
    onConfirmar: box => { const r = ui.form.validar(box.querySelector('form'), { data: [v => (v && v > fmt.iso(new Date()) ? 'O pagamento não pode estar no futuro.' : '')] }); if (!r.ok) return false; dados = r.dados; return true; } });
  if (!ok) return;
  const antes = { status: f.status, pagoEm: f.pagoEm, canal: f.canal };
  let lanc;
  db.batch(() => {
    db.update('invoices', f.id, { status: 'paga', pagoEm: dados.data, canal: dados.forma }, { log: `marcou como paga a fatura nº ${f.numero} de ${nomeFatura(f)} (${fmt.brl(f.valor)})` });
    lanc = db.insert('cash', { data: dados.data, tipo: 'entrada', descricao: `Recebimento — ${nomeFatura(f)}`, categoria: f.descricao.includes('projeto') ? 'Projeto avulso' : 'Mensalidade', valor: f.valor, clientId: f.clientId, status: 'realizado', invoiceId: f.id });
  });
  ui.toast(`Fatura de ${nomeFatura(f)} marcada como paga. ${fmt.brl(f.valor)} entrou no caixa.`, { desfazer: () => db.batch(() => { db.update('invoices', f.id, antes, { log: `desfez a baixa da fatura nº ${f.numero}` }); db.remove('cash', lanc.id); }) });
}
async function renegociar(ctx, id) {
  const { ui, fmt, db } = ctx;
  const f = db.get('invoices', id); if (!f || f.status === 'paga') return;
  let d = null;
  const ok = await ui.modal({ titulo: 'Renegociar fatura', sub: `${nomeFatura(f)} · ${fmt.brl(f.valor)} · ${estadoFatura(f).rotulo}`, confirmar: 'Salvar acordo', largura: 'md',
    corpo: `<form class="stack" novalidate><div class="fgrid">
${ui.campo({ nome: 'vencimento', rotulo: 'Novo vencimento', tipo: 'data', obrigatorio: true, valor: fmt.iso(new Date(Date.now() + 7 * 864e5)) })}
${ui.campo({ nome: 'parcelas', rotulo: 'Parcelas', tipo: 'select', opcoes: [1, 2, 3, 4, 5, 6].map(n => ({ v: n, l: n === 1 ? 'À vista' : `${n}×` })), valor: 1 })}
${ui.campo({ nome: 'desconto', rotulo: 'Desconto', tipo: 'percent', valor: 0, dica: 'Use 0 para manter o valor. Máximo 30%.' })}
${ui.campo({ nome: 'juros', rotulo: 'Multa e juros', tipo: 'percent', valor: 0, dica: 'Multa de atraso combinada (opcional).' })}
${ui.campo({ nome: 'obs', rotulo: 'Acordo combinado', tipo: 'textarea', cls: 'full', obrigatorio: true, placeholder: 'Ex.: cliente pediu para pagar dia 05 por fluxo de caixa; combinado com o decisor por telefone.' })}
</div></form>`,
    onConfirmar: box => {
      const r = ui.form.validar(box.querySelector('form'), { vencimento: [v => (v && v <= fmt.iso(new Date()) ? 'Escolha uma data a partir de amanhã.' : '')], desconto: [v => (v > 30 ? 'O desconto máximo é 30%.' : v < 0 ? 'Valor inválido.' : '')], juros: [v => (v > 20 ? 'Máximo 20%.' : '')], obs: 'obrigatorio|min:10' });
      if (!r.ok) return false; d = r.dados; return true;
    } });
  if (!ok) return;
  const novo = Math.round(f.valor * (1 - (d.desconto || 0) / 100) * (1 + (d.juros || 0) / 100));
  const antes = { status: f.status, vencimento: f.vencimento, valor: f.valor, acordo: f.acordo || null };
  db.update('invoices', f.id, { status: 'renegociada', vencimento: d.vencimento, valor: novo, acordo: { parcelas: Number(d.parcelas), desconto: d.desconto || 0, juros: d.juros || 0, obs: d.obs, por: ctx.user.nome, quando: new Date().toISOString(), valorOriginal: f.valor, vencimentoOriginal: f.vencimento } }, { log: `renegociou a fatura nº ${f.numero} de ${nomeFatura(f)}: ${fmt.brl(novo)}${Number(d.parcelas) > 1 ? ` em ${d.parcelas}×` : ''}, vence ${fmt.data(d.vencimento)}` });
  ui.toast(`Acordo salvo: ${fmt.brl(novo)}${Number(d.parcelas) > 1 ? ` em ${d.parcelas}×` : ''}, vencimento ${fmt.data(d.vencimento)}.`, { desfazer: () => db.update('invoices', f.id, antes, { log: `desfez a renegociação da fatura nº ${f.numero}` }) });
}
async function pagarConta(ctx, id) {
  const { ui, fmt, db } = ctx;
  const p = db.get('payables', id); if (!p || p.status === 'paga') return;
  const ok = await ui.confirmar(`Registrar o pagamento de ${p.descricao} (${fmt.brl(p.valor)}) com data de hoje? O valor sai do caixa.`, { titulo: 'Pagar conta?', confirmar: 'Registrar pagamento', perigo: false });
  if (!ok) return;
  let lanc;
  const hoje = fmt.iso(new Date());
  db.batch(() => {
    db.update('payables', p.id, { status: 'paga', pagoEm: hoje }, { log: `pagou ${p.descricao} (${fmt.brl(p.valor)})` });
    lanc = db.insert('cash', { data: hoje, tipo: 'saida', descricao: p.descricao, categoria: p.categoria, valor: p.valor, status: 'realizado', payableId: p.id });
  });
  ui.toast(`${p.descricao} paga.`, { desfazer: () => db.batch(() => { db.update('payables', p.id, { status: 'aberta', pagoEm: null }, { log: `desfez o pagamento de ${p.descricao}` }); db.remove('cash', lanc.id); }) });
}
async function lancar(ctx) {
  const { ui, fmt, db } = ctx;
  if (!ctx.can('financeiro', 'editar')) { ui.toast(SEM_EDICAO, { tipo: 'warn' }); return; }
  const clientes = (db.list('clients').length || !db.dadosDemo ? db.list('clients').map(c => ({ v: c.id, l: c.nome || c.fantasia || c.id })) : CLIENTES.map(c => ({ v: c.id, l: c.nome }))).sort((a, b) => a.l.localeCompare(b.l, 'pt-BR'));
  const opts = t => CAT[t].map(c => `<option value="${fmt.esc(c)}">${fmt.esc(c)}</option>`).join('');
  let dados = null;
  const ok = await ui.modal({ titulo: 'Novo lançamento', sub: 'Receita ou despesa que entra no fluxo de caixa', confirmar: 'Salvar lançamento', largura: 'md',
    corpo: `<form class="stack" novalidate><div class="fgrid">
${ui.campo({ nome: 'tipo', rotulo: 'Tipo', tipo: 'radio', opcoes: [{ v: 'entrada', l: 'Receita' }, { v: 'saida', l: 'Despesa' }], valor: 'entrada', cls: 'full' })}
${ui.campo({ nome: 'descricao', rotulo: 'Descrição', obrigatorio: true, placeholder: 'Ex.: Projeto de site — Pet Feliz', cls: 'full' })}
${ui.campo({ nome: 'valor', rotulo: 'Valor', tipo: 'moeda', obrigatorio: true })}
${ui.campo({ nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, valor: fmt.iso(new Date()) })}
${ui.campo({ nome: 'categoria', rotulo: 'Categoria', tipo: 'select', opcoes: CAT.entrada, obrigatorio: true })}
${ui.campo({ nome: 'clientId', rotulo: 'Cliente (opcional)', tipo: 'select', placeholder: 'Nenhum', opcoes: clientes })}
${ui.campo({ nome: 'status', rotulo: 'Situação', tipo: 'radio', opcoes: [{ v: 'realizado', l: 'Já aconteceu' }, { v: 'previsto', l: 'Previsto (entra na projeção)' }], valor: 'realizado', cls: 'full' })}
</div></form>`,
    onAbrir: box => box.addEventListener('change', ev => {
      if (ev.target.name !== 'tipo') return;
      box.querySelector('[name=categoria]').innerHTML = opts(ev.target.value);
      const cli = box.querySelector('[name=clientId]').closest('.fld'); cli.hidden = ev.target.value !== 'entrada';
    }),
    onConfirmar: box => {
      const r = ui.form.validar(box.querySelector('form'), {
        descricao: 'obrigatorio|min:3', valor: [v => (!v || v <= 0 ? 'Informe um valor maior que zero.' : v > 5e6 ? 'Valor acima do limite de R$ 5 milhões. Confira os dígitos.' : '')],
        data: [(v, d2) => (d2.status === 'realizado' && v > fmt.iso(new Date()) ? 'Lançamento já realizado não pode ter data futura. Marque como "Previsto".' : d2.status === 'previsto' && v < fmt.iso(new Date()) ? 'Lançamento previsto precisa de data a partir de hoje.' : '')],
      });
      if (!r.ok) return false; dados = r.dados; return true;
    } });
  if (!ok) return;
  const o = db.insert('cash', { data: dados.data, tipo: dados.tipo, descricao: dados.descricao, categoria: dados.categoria, valor: dados.valor, clientId: dados.tipo === 'entrada' ? dados.clientId || null : null, status: dados.status }, { log: `lançou ${dados.tipo === 'entrada' ? 'receita' : 'despesa'} de ${fmt.brl(dados.valor)}: ${dados.descricao}` });
  ui.toast(`${dados.tipo === 'entrada' ? 'Receita' : 'Despesa'} de ${fmt.brl(dados.valor)} lançada${dados.status === 'previsto' ? ' na projeção' : ''}.`, { desfazer: () => db.remove('cash', o.id, { log: `desfez o lançamento ${dados.descricao}` }) });
}
async function excluirLanc(ctx, id) {
  const { ui, fmt, db } = ctx; const l = db.get('cash', id); if (!l) return;
  const ok = await ui.confirmar(`O lançamento "${l.descricao}" (${fmt.brl(l.valor)}) será excluído do caixa.`, { titulo: 'Excluir lançamento?', confirmar: 'Excluir' });
  if (!ok) return;
  const rem = db.remove('cash', id, { log: `excluiu o lançamento ${l.descricao}` });
  ui.toast('Lançamento excluído.', { desfazer: () => db.insert('cash', rem) });
}

function mount(el, ctx) {
  const onClick = e => {
    const b = e.target.closest('[data-f]'); if (!b || b.disabled) return;
    const id = b.dataset.id;
    ({ cobrar: () => cobrar(ctx, id), pagar: () => marcarPaga(ctx, id), reneg: () => renegociar(ctx, id), 'pagar-conta': () => pagarConta(ctx, id), lancar: () => lancar(ctx), 'exc-lanc': () => excluirLanc(ctx, id),
      'com-csv': () => { const n = csvComissoes(ctx); ctx.ui.toast(n ? `CSV com ${ctx.fmt.plural(n, 'comissão', 'comissões')} baixado.` : 'Nenhuma comissão no filtro atual: o CSV saiu só com o cabeçalho.', { tipo: n ? 'ok' : 'info' }); },
      'lem-simular': () => simularLembretes(ctx), 'lem-padrao': () => padraoLembrete(el, ctx) }[b.dataset.f] || (() => {}))();
  };
  el.addEventListener('click', onClick);
  const offLem = montarLembretes(el, ctx);
  const onKey = e => { if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !e.target.isContentEditable && !ctx.ui.overlaysAbertos()) { e.preventDefault(); lancar(ctx); } };
  document.addEventListener('keydown', onKey);
  // ação vinda de outro módulo: #/financeiro/receber?cobrar=<id>
  if (ctx.query.cobrar) {
    const id = ctx.query.cobrar;
    ctx.router.setQuery({ cobrar: null, fatura: id });
    setTimeout(() => cobrar(ctx, id), 60);
  } else if (ctx.query.fatura) {
    const r = el.querySelector('tr.mf-sel'); if (r) setTimeout(() => r.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
  }
  return () => { el.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); offLem(); };
}

/* ---------- Automação: lembretes de vencimento ---------- */
function montarLembretes(el, ctx) {
  const f = el.querySelector('[data-lem-form]'); if (!f) return () => {};
  const prev = el.querySelector('[data-lem-previa]');
  let invPrev = null;
  const atualizar = () => { if (prev) prev.innerHTML = LEM.previaHtml(ctx, f.querySelector('[name=modelo]').value, invPrev); };
  const onInput = e => { if (e.target.name === 'modelo') atualizar(); };
  const onChange = e => { if (e.target.matches('[data-previa-fatura]')) { invPrev = e.target.value; atualizar(); } };
  const onVar = e => {
    const b = e.target.closest('[data-lem-var]'); if (!b || b.disabled) return;
    const ta = f.querySelector('[name=modelo]'); const ins = `{${b.dataset.lemVar}}`;
    const i = ta.selectionStart ?? ta.value.length, j = ta.selectionEnd ?? i;
    ta.value = ta.value.slice(0, i) + ins + ta.value.slice(j); ta.focus(); ta.setSelectionRange(i + ins.length, i + ins.length); atualizar();
  };
  const onSubmit = e => { e.preventDefault(); salvarLembretes(f, ctx); };
  f.addEventListener('input', onInput); el.addEventListener('change', onChange); f.addEventListener('click', onVar); f.addEventListener('submit', onSubmit);
  return () => { f.removeEventListener('input', onInput); el.removeEventListener('change', onChange); f.removeEventListener('click', onVar); f.removeEventListener('submit', onSubmit); };
}
function salvarLembretes(f, ctx) {
  const { ui, db } = ctx;
  if (!ctx.can('financeiro', 'editar')) { ui.toast(SEM_EDICAO, { tipo: 'warn' }); return; }
  const r = ui.form.validar(f, {
    modelo: ['obrigatorio', v => (String(v || '').trim().length < 20 ? 'Escreva uma mensagem com pelo menos 20 caracteres.' : ''), v => { const inv = LEM.varsInvalidas(v); return inv.length ? `Variável desconhecida: {${inv[0]}}. Use só {cliente}, {valor}, {vencimento} e {link_boleto}.` : ''; }],
    hora: [v => (/^\d{2}:\d{2}$/.test(v || '') ? '' : 'Informe o horário no formato hh:mm.')],
  });
  if (!r.ok) return;
  const quando = [].concat(r.dados.quando || []).filter(Boolean);
  if (r.dados.ativo && !quando.length) { ui.toast('Marque pelo menos um momento de envio (antes, no dia ou depois).', { tipo: 'warn' }); return; }
  const antes = db.config(LEM.CHAVE, null);
  const novo = { ativo: !!r.dados.ativo, quando, hora: r.dados.hora, modelo: String(r.dados.modelo).trim(), atualizadoEm: new Date().toISOString(), atualizadoPor: ctx.real.id };
  db.setConfig(LEM.CHAVE, novo, { log: `${novo.ativo ? 'ligou' : 'desligou'} os lembretes automáticos de vencimento por WhatsApp (${quando.map(q => LEM.TIPOS.find(t => t.id === q).curto).join(', ') || 'nenhum momento'} · ${novo.hora})` });
  ui.toast(novo.ativo ? `Lembretes ligados: ${quando.length === 3 ? 'antes, no dia e depois' : quando.map(q => LEM.TIPOS.find(t => t.id === q).curto).join(' e ')}, às ${novo.hora}.` : 'Lembretes automáticos desligados. Nenhuma mensagem será enviada aos clientes.', { tipo: 'ok', desfazer: () => (antes ? db.setConfig(LEM.CHAVE, antes) : db.remove('settings', LEM.CHAVE)) });
}
async function padraoLembrete(el, ctx) {
  const ta = el.querySelector('[data-lem-form] [name=modelo]'); if (!ta) return;
  if (ta.value.trim() === LEM.MODELO_PADRAO) { ctx.ui.toast('A mensagem já é a padrão.', { tipo: 'info' }); return; }
  const ok = await ctx.ui.confirmar('O texto atual da mensagem será substituído pelo padrão. Você ainda precisa clicar em Salvar.', { titulo: 'Restaurar mensagem padrão?', confirmar: 'Restaurar', perigo: false });
  if (!ok) return;
  ta.value = LEM.MODELO_PADRAO; ta.dispatchEvent(new Event('input', { bubbles: true }));
}
function simularLembretes(ctx) {
  const { ui, db, fmt } = ctx;
  if (!ctx.can('financeiro', 'editar')) { ui.toast(SEM_EDICAO, { tipo: 'warn' }); return; }
  if (!LEM.config(db).ativo) { ui.toast('Ligue os lembretes automáticos e salve antes de simular.', { tipo: 'warn' }); return; }
  const r = LEM.simularHoje(ctx);
  const partes = [];
  if (r.enviados.length) partes.push(`${fmt.plural(r.enviados.length, 'lembrete enviado', 'lembretes enviados')} (simulado): ${r.enviados.map(x => nomeFatura(x.f)).join(', ')}.`);
  if (r.semContato.length) partes.push(`${fmt.plural(r.semContato.length, 'cliente', 'clientes')} sem WhatsApp no cadastro: ${r.semContato.map(x => nomeFatura(x.f)).join(', ')}.`);
  if (!r.enviados.length && !r.semContato.length) partes.push(r.jaEnviados ? 'Os lembretes de hoje já foram enviados. Nada a reenviar.' : 'Nenhuma fatura se encaixa nas regras hoje.');
  ui.toast(partes.join(' '), { tipo: r.enviados.length ? 'ok' : r.semContato.length ? 'warn' : 'info', desfazer: r.antes.length ? () => db.batch(() => r.antes.forEach(a => db.update('invoices', a.id, { lembretes: a.lembretes }, { log: 'desfez o lembrete automático simulado' }))) : undefined });
}

/* ============================== busca e contador ============================== */
function busca(q) { return buscaFaturas(q, norm); }
function buscaFaturas(q, norm) {
  if (!q || q.length < 2) return [];
  return DB.list('invoices').filter(f => norm(nomeFatura(f)).includes(q) || String(f.numero).includes(q) || (q.length >= 4 && norm('fatura').startsWith(q)))
    .sort((a, b) => (a.status === 'paga') - (b.status === 'paga') || (b.vencimento || '').localeCompare(a.vencimento || ''))
    .slice(0, 6).map(f => { const e = estadoFatura(f); return { tipo: 'Faturas', titulo: `${nomeFatura(f)} · ${brl(f.valor)}`, sub: `${f.descricao} · vence ${dataF(f.vencimento)} · ${e.rotulo}`, href: `#/financeiro/receber?f=todas&fatura=${f.id}`, led: e.neutro ? 'off' : e.estado, icone: 'dollar' }; });
}
function contador() {
  const v = vencidasMais7(); if (!v.length) return null;
  return { n: v.length, estado: 'err', rotulo: `${v.length} ${v.length === 1 ? 'fatura vencida' : 'faturas vencidas'} há mais de ${atrasoCritico()} dias` };
}

export default {
  id: 'financeiro', titulo: 'Financeiro', icone: 'dollar', grupo: 'gestao', rota: 'financeiro', routes: ['financeiro', 'financeiro/:aba'],
  watch: ['invoices', 'payables', 'cash', 'mrrMoves', 'finance', 'costs', 'clients', 'contacts', 'settings', 'team'],
  render, mount, busca, contador,
};
