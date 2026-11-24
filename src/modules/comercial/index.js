// Comercial — pipeline (kanban com arrastar e teclado), receita ponderada, conversão e ciclo, propostas, metas e origem dos leads.
import './data.js';
import { ETAPAS, ORIGENS, SERVICOS, HISTORICO } from './data.js';
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import { perms } from '../../core/perms.js';

/** valores das oportunidades (MRR, ponderado, novo MRR): quem vê receita ou trabalha no Comercial (edita). Os demais veem volumes, etapas e prazos. */
const VV = () => perms.veReceita() || perms.can('comercial', 'editar');

const ABERTAS = ['lead', 'qualificado', 'diagnostico', 'proposta', 'negociacao'];
const E = Object.fromEntries(ETAPAS.map(e => [e.id, e]));
const SEM_PERM = 'Seu acesso ao Comercial é só de leitura.';
const DIA = 864e5;
const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const isoHoje = () => fmt.iso(new Date());
const atrasada = d => ABERTAS.includes(d.etapa) && d.proximaData && d.proximaData < isoHoje();
const doMes = (iso, off = 0) => { if (!iso) return false; const x = new Date(iso); const h = new Date(); h.setDate(1); h.setMonth(h.getMonth() - off); return x.getFullYear() === h.getFullYear() && x.getMonth() === h.getMonth(); };
const diasDesde = iso => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / DIA));
const metas = () => Object.assign({ novoMrr: 20000, propostas: 18, ganhos: 7 }, db.config('comercialMetas', {}) || {});
const mrr = v => `${fmt.brl(v)}/mês`;
const nomeT = id => (db.get('team', id) || {}).nome || '';

function calc() {
  const all = db.list('deals');
  const abertas = all.filter(d => ABERTAS.includes(d.etapa));
  const ganhosMes = all.filter(d => d.etapa === 'ganho' && doMes(d.ganhoEm));
  const propMes = all.filter(d => doMes(d.propostaEm));
  const ponderada = abertas.reduce((s, d) => s + d.valor * (E[d.etapa].prob / 100), 0);
  const ganhos = all.filter(d => d.etapa === 'ganho');
  const ciclo = ganhos.length ? Math.round(ganhos.reduce((s, d) => s + (new Date(d.ganhoEm) - new Date(d.criadoEm)) / DIA, 0) / ganhos.length) : null;
  return { all, abertas, ganhosMes, propMes, ponderada, ganhos, ciclo, perdidos: all.filter(d => d.etapa === 'perdido'), novoMrr: ganhosMes.reduce((s, d) => s + d.valor, 0), atrasadas: abertas.filter(atrasada) };
}

function kpis(ctx, c) {
  const { ui } = ctx; const m = metas();
  const serieNovo = [...HISTORICO.map(h => h.novoMrr / 1000), c.novoMrr / 1000];
  const taxa = c.propMes.length ? (c.ganhosMes.length / c.propMes.length) * 100 : 0;
  return `<div class="g-kpi m-comercial-kpi">
${!VV() ? kpisSemValor(ctx, c, taxa) : `${ui.kpi({ rotulo: 'Pipeline aberto', valor: fmt.brlK(c.abertas.reduce((s, d) => s + d.valor, 0)), delta: fmt.plural(c.abertas.length, 'oportunidade'), deltaBom: null, comp: 'em MRR', ajuda: 'Soma do MRR (valor mensal) das oportunidades de Lead a Negociação.', href: '#/comercial/pipeline' })}
${ui.kpi({ rotulo: 'Receita ponderada', valor: fmt.brlK(c.ponderada), delta: `${fmt.pct((c.ponderada / (c.abertas.reduce((s, d) => s + d.valor, 0) || 1)) * 100, 0)} do pipeline`, deltaBom: null, ajuda: `MRR × probabilidade da etapa: ${ETAPAS.filter(e => ABERTAS.includes(e.id)).map(e => `${e.rotulo} ${e.prob}%`).join(' · ')}.`, href: '#/comercial/desempenho' })}
${ui.kpi({ rotulo: 'Novo MRR no mês', valor: fmt.brl(c.novoMrr), delta: `${fmt.pct((c.novoMrr / m.novoMrr) * 100, 0)} da meta`, deltaBom: c.novoMrr >= m.novoMrr ? true : null, comp: `meta ${fmt.brl(m.novoMrr)}`, serie: serieNovo, formatoSerie: 'mil', ajuda: 'Soma do MRR dos negócios ganhos no mês. Entra na ponte de MRR como "Novos".' })}
${ui.kpi({ rotulo: 'Taxa de ganho', valor: fmt.pct(taxa, 1), delta: `${c.ganhosMes.length} de ${c.propMes.length} propostas`, deltaBom: null, comp: 'no mês', ajuda: 'Negócios ganhos no mês ÷ propostas enviadas no mês.', href: '#/comercial/propostas' })}
${ui.kpi({ rotulo: 'Ciclo de venda', valor: c.ciclo == null ? '—' : `${c.ciclo} dias`, comp: 'do lead ao ganho', ajuda: 'Média de dias entre a criação da oportunidade e o ganho, nos negócios ganhos.' })}
${ui.kpi({ rotulo: 'Ações vencidas', valor: String(c.atrasadas.length), comp: c.atrasadas.length ? fmt.brlK(c.atrasadas.reduce((s, d) => s + d.valor, 0)) + ' em MRR parado' : 'tudo em dia', alerta: c.atrasadas.length > 0, href: '#/comercial/pipeline?f=atrasadas', ajuda: 'Oportunidades abertas cuja próxima ação passou da data.' })}`}
</div>`;
}
/** KPIs sem valores (para quem não vê receita): volumes e prazos */
function kpisSemValor(ctx, c, taxa) {
  const { ui } = ctx; const m = metas();
  return `${ui.kpi({ rotulo: 'Abertas', valor: fmt.num(c.abertas.length), comp: 'oportunidades de lead a negociação', href: '#/comercial/pipeline', ajuda: 'Oportunidades de Lead a Negociação.' })}
${ui.kpi({ rotulo: 'Em negociação', valor: fmt.num(c.abertas.filter(d => d.etapa === 'negociacao' || d.etapa === 'proposta').length), comp: 'proposta enviada ou negociando' })}
${ui.kpi({ rotulo: 'Ganhos no mês', valor: fmt.num(c.ganhosMes.length), comp: `meta ${fmt.num(m.ganhos)}`, deltaBom: c.ganhosMes.length >= m.ganhos ? true : null, ajuda: 'Negócios fechados no mês.' })}
${ui.kpi({ rotulo: 'Taxa de ganho', valor: fmt.pct(taxa, 1), delta: `${c.ganhosMes.length} de ${c.propMes.length} propostas`, deltaBom: null, comp: 'no mês', ajuda: 'Negócios ganhos no mês ÷ propostas enviadas no mês.', href: '#/comercial/propostas' })}
${ui.kpi({ rotulo: 'Ciclo de venda', valor: c.ciclo == null ? '—' : `${c.ciclo} dias`, comp: 'do lead ao ganho', ajuda: 'Média de dias entre a criação da oportunidade e o ganho, nos negócios ganhos.' })}
${ui.kpi({ rotulo: 'Ações vencidas', valor: String(c.atrasadas.length), comp: c.atrasadas.length ? 'próxima ação passou da data' : 'tudo em dia', alerta: c.atrasadas.length > 0, href: '#/comercial/pipeline?f=atrasadas', ajuda: 'Oportunidades abertas cuja próxima ação passou da data.' })}`;
}

/* ---------------- pipeline ---------------- */
const ui_ic_clock = '';
function proxHtml(d) {
  if (!d.proximaAcao) return '<span class="m-comercial-px mut">Sem próxima ação</span>';
  const dd = fmt.diasAte(d.proximaData);
  const st = dd < 0 ? 'err' : dd === 0 ? 'warn' : '';
  const quando = dd < 0 ? `vencida há ${fmt.plural(-dd, 'dia')}` : dd === 0 ? 'hoje' : dd === 1 ? 'amanhã' : fmt.dataCurta(d.proximaData);
  return `<div class="m-comercial-px${st ? ' s-' + st : ''}"><span class="trunc" title="${fmt.esc(d.proximaAcao)}">${fmt.esc(d.proximaAcao)}</span><b>${st === 'err' ? '<i class="led err" aria-hidden="true"></i>' : ui_ic_clock}${quando}</b></div>`;
}
function cartao(d, ctx) {
  const { ui } = ctx; const pode = ctx.can('comercial', 'editar');
  const fechado = !ABERTAS.includes(d.etapa);
  return `<article class="m-comercial-cd${atrasada(d) ? ' is-atr' : ''}" data-id="${fmt.esc(d.id)}"${pode ? ' draggable="true"' : ''} aria-label="${fmt.esc(`${d.empresa}, ${VV() ? `${mrr(d.valor)}, ` : ''}${E[d.etapa].rotulo}`)}">
<div class="m-comercial-cd-h"><button type="button" class="m-comercial-cd-t" data-deal="${fmt.esc(d.id)}">${fmt.esc(d.empresa)}</button>${pode ? `<button type="button" class="ib m-comercial-mv" data-mover-menu="${fmt.esc(d.id)}" aria-label="Mover ${fmt.esc(d.empresa)} para outra etapa" title="Mover para…" aria-haspopup="menu">${ui.ic('more')}</button>` : ''}</div>
<div class="m-comercial-cd-v">${VV() ? `<b class="num">${fmt.brl(d.valor)}</b><span>/mês</span>` : ''}<small>${fmt.esc(d.servicos.join(' · '))}</small></div>
${fechado ? `<p class="m-comercial-cd-f">${d.etapa === 'ganho' ? `${ui.ic('check-circle')}Ganho ${fmt.dataCurta(d.ganhoEm)}${d.clienteId ? ' · cliente cadastrado' : ''}` : `${ui.ic('x-circle')}${fmt.esc(d.motivoPerda || 'Perdido')}`}</p>` : proxHtml(d)}
<div class="m-comercial-cd-b">${ui.avatar(d.respId, 22)}<span class="mut">${fmt.esc(d.origem)}</span><span class="m-comercial-dias" title="Dias nesta etapa">${diasDesde(d.etapaDesde)} d</span></div>
${d.etapa === 'ganho' && !d.clienteId && pode ? ui.btn({ rotulo: 'Cadastrar como cliente', icone: 'user-plus', sm: true, tipo: 'pri', href: `#/clientes/novo?deal=${encodeURIComponent(d.id)}`, cls: 'm-comercial-cad' }) : ''}
</article>`;
}
function paginaPipeline(ctx, c) {
  const { ui, query } = ctx;
  const f = query.f === 'atrasadas' ? 'atrasadas' : query.f === 'meus' ? 'meus' : 'todas';
  const resp = query.resp || ''; const origem = ORIGENS.includes(query.origem) ? query.origem : '';
  let l = c.all;
  if (f === 'atrasadas') l = l.filter(atrasada);
  if (f === 'meus') l = l.filter(d => d.respId === (ctx.user && ctx.user.teamId));
  if (resp) l = l.filter(d => d.respId === resp);
  if (origem) l = l.filter(d => d.origem === origem);
  const resps = [...new Set(c.all.map(d => d.respId))];
  const filtros = `<div class="m-comercial-fl">${ui.chips([{ id: 'todas', rotulo: 'Todas' }, { id: 'atrasadas', rotulo: 'Ação vencida', n: c.atrasadas.length, estado: c.atrasadas.length ? 'err' : undefined }, { id: 'meus', rotulo: 'Minhas' }], f, 'f', { rotulo: 'Filtrar oportunidades' })}
<select data-q="resp" aria-label="Responsável"><option value="">Todos os responsáveis</option>${resps.map(id => `<option value="${id}"${id === resp ? ' selected' : ''}>${fmt.esc(nomeT(id))}</option>`).join('')}</select>
<select data-q="origem" aria-label="Origem"><option value="">Todas as origens</option>${ORIGENS.map(o => `<option${o === origem ? ' selected' : ''}>${o}</option>`).join('')}</select>
<span class="m-comercial-dica">${ui.ic('mouse')}Arraste os cartões entre etapas ou use ${ui.ic('more')} para mover pelo teclado.</span></div>`;
  const cols = ETAPAS.map(e => {
    let it = l.filter(d => d.etapa === e.id);
    const fech = e.id === 'ganho' || e.id === 'perdido';
    if (fech) it = it.filter(d => diasDesde(d.ganhoEm || d.perdidoEm) <= 45);
    it.sort((a, b) => (atrasada(b) - atrasada(a)) || String(a.proximaData || '').localeCompare(String(b.proximaData || '')) || b.valor - a.valor);
    const soma = it.reduce((s, d) => s + d.valor, 0);
    return `<section class="m-comercial-col s-${e.id}" data-etapa="${e.id}" aria-label="${fmt.esc(`${e.rotulo}: ${it.length} oportunidades${VV() ? `, ${fmt.brl(soma)}` : ''}`)}">
<header><div class="m-comercial-col-t"><b>${e.rotulo}</b><span class="n num">${it.length}</span></div><div class="m-comercial-col-v">${VV() ? `<span class="num">${fmt.brlK(soma, { short: true })}</span>${fech ? `<small>últimos 45 dias</small>` : `<small title="Probabilidade de fechamento">${e.prob}% · pond. ${fmt.brlK(soma * e.prob / 100, { short: true })}</small>`}` : `<small>${fech ? 'últimos 45 dias' : `${e.prob}% de chance`}</small>`}</div></header>
<div class="m-comercial-col-b">${it.length ? it.map(d => cartao(d, ctx)).join('') : `<p class="m-comercial-col-vz">${fech ? 'Nada nos últimos 45 dias' : 'Arraste uma oportunidade para cá'}</p>`}</div></section>`;
  }).join('');
  return `${filtros}<div class="m-comercial-kb" role="region" aria-label="Pipeline por etapa" tabindex="0">${cols}</div>`;
}

/* ---------------- desempenho ---------------- */
function alcancou(d, etapa) {
  const i = ABERTAS.concat('ganho').indexOf(etapa);
  if (d.etapa === 'perdido') return (d.historico || []).some(h => h.etapa === etapa);
  const j = ABERTAS.concat('ganho').indexOf(d.etapa);
  return j >= i;
}
function paginaDesempenho(ctx, c) {
  const { ui, charts } = ctx; const m = metas(); const pode = ctx.can('comercial', 'editar');
  const abertasE = ETAPAS.filter(e => ABERTAS.includes(e.id));
  const brutos = abertasE.map(e => c.abertas.filter(d => d.etapa === e.id).reduce((s, d) => s + d.valor, 0));
  const forecast = ui.card({ titulo: 'Receita ponderada por etapa', sub: `${fmt.brl(c.ponderada)}/mês previstos de ${fmt.brl(brutos.reduce((a, b) => a + b, 0))} em aberto`, ajuda: 'Barra azul = MRR × probabilidade da etapa (o que se espera fechar; valor à direita). Barra cinza = MRR total da etapa.',
    corpo: charts.barras({ horizontal: true, linha: 44, rotulos: abertasE.map(e => `${e.rotulo} · ${e.prob}%`), series: [{ nome: 'Ponderado (valor à direita)', dados: abertasE.map((e, i) => Math.round(brutos[i] * e.prob / 100)), cor: 'var(--c1)' }, { nome: 'MRR em aberto', dados: brutos, cor: 'var(--c2n)' }], formato: 'brl' }) });
  const funilEt = ['lead', 'qualificado', 'diagnostico', 'proposta', 'negociacao', 'ganho'].map(id => ({ rotulo: E[id].rotulo, valor: c.all.filter(d => alcancou(d, id)).length }));
  const tempos = ['lead', 'qualificado', 'diagnostico', 'proposta', 'negociacao'].map((id, i, arr) => {
    const prox = i < arr.length - 1 ? arr[i + 1] : 'ganho';
    const ds = c.all.map(d => { const h = d.historico || []; const a = h.find(x => x.etapa === id), b = h.find(x => x.etapa === prox); return a && b ? (new Date(b.em) - new Date(a.em)) / DIA : null; }).filter(x => x != null);
    return { id, prox, media: ds.length ? Math.round(ds.reduce((s, x) => s + x, 0) / ds.length) : null, conv: funilEt[i].valor ? (funilEt[i + 1].valor / funilEt[i].valor) * 100 : 0 };
  });
  const conversao = ui.card({ titulo: 'Conversão e ciclo por etapa', sub: 'Oportunidades dos últimos 90 dias', ajuda: 'Quantas oportunidades chegaram a cada etapa, a conversão para a seguinte e quantos dias, em média, ficam em cada uma.',
    corpo: `${charts.funil({ etapas: funilEt, formato: 'num' })}<table class="m-comercial-ct"><thead><tr><th>Etapa</th><th class="n">Conversão</th><th class="n">Tempo médio</th></tr></thead><tbody>${tempos.map(t => `<tr><td>${E[t.id].rotulo} → ${E[t.prox].rotulo}</td><td class="n num ${t.conv < 50 ? 't-warn' : ''}">${fmt.pct(t.conv, 0)}</td><td class="n num">${t.media == null ? '—' : fmt.plural(t.media, 'dia')}</td></tr>`).join('')}<tr class="m-comercial-ct-t"><td>Ciclo completo (lead → ganho)</td><td class="n num">${fmt.pct(funilEt[0].valor ? funilEt[5].valor / funilEt[0].valor * 100 : 0, 1)}</td><td class="n num">${c.ciclo == null ? '—' : fmt.plural(c.ciclo, 'dia')}</td></tr></tbody></table>` });
  const pNovo = (c.novoMrr / m.novoMrr) * 100, pProp = (c.propMes.length / m.propostas) * 100, pGan = (c.ganhosMes.length / m.ganhos) * 100;
  const diaMes = new Date().getDate(), diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const ritmo = (diaMes / diasMes) * 100;
  const metaL = (rot, atual, alvo, p, fmtV) => `<div class="m-comercial-mt"><div class="row between"><span>${rot}</span><span class="num"><b>${fmtV(atual)}</b> <span class="mut">de ${fmtV(alvo)}</span></span></div>${ui.barra(Math.round(p), { faixas: [{ ate: ritmo * 0.8, estado: 'err' }, { ate: ritmo - 0.001, estado: 'warn' }, { ate: Infinity, estado: 'ok' }], max: 100, texto: fmt.pct(p, 0) })}</div>`;
  const metasCard = ui.card({ titulo: `Metas de ${fmt.mesLongo ? fmt.mesLongo(new Date()) : 'do mês'}`, sub: `Dia ${diaMes} de ${diasMes} · ritmo esperado ${fmt.pct(ritmo, 0)}`, ajuda: 'Verde = no ritmo do mês ou acima. Âmbar = um pouco abaixo do ritmo. Vermelho = mais de 20% abaixo do ritmo esperado para hoje.',
    acoes: pode ? ui.btn({ rotulo: 'Editar metas', icone: 'edit', sm: true, tipo: 'ghost', attrs: { 'data-metas': '' } }) : '',
    corpo: `<div class="stack">${VV() ? metaL('Novo MRR', c.novoMrr, m.novoMrr, pNovo, fmt.brl) : ''}${metaL('Propostas enviadas', c.propMes.length, m.propostas, pProp, fmt.num)}${metaL('Negócios ganhos', c.ganhosMes.length, m.ganhos, pGan, fmt.num)}
${!VV() ? '' : `<p class="sm mut">Faltam <b>${fmt.brl(Math.max(0, m.novoMrr - c.novoMrr))}</b> de novo MRR. Em negociação: ${fmt.brl(c.abertas.filter(d => d.etapa === 'negociacao').reduce((s, d) => s + d.valor, 0))} (${fmt.plural(c.abertas.filter(d => d.etapa === 'negociacao').length, 'oportunidade')}).</p>`}</div>` });
  const porOrig = ORIGENS.map(o => { const ds = c.all.filter(d => d.origem === o); const g = ds.filter(d => d.etapa === 'ganho'); const fechados = ds.filter(d => ['ganho', 'perdido'].includes(d.etapa)); return { o, n: ds.length, g: g.length, mrr: g.reduce((s, d) => s + d.valor, 0), conv: fechados.length ? (g.length / fechados.length) * 100 : null }; }).filter(x => x.n).sort((a, b) => b.n - a.n);
  const origens = ui.card({ titulo: 'Origem dos leads', sub: 'Oportunidades dos últimos 90 dias', ajuda: 'Conversão = ganhos ÷ negócios fechados (ganhos + perdidos) daquela origem.',
    corpo: `<div class="m-comercial-or">${charts.rosca({ fatias: porOrig.map(x => ({ rotulo: x.o, valor: x.n })), centro: { valor: String(c.all.length), rotulo: 'oportunidades' }, formato: 'num', legendaValor: 'valor' })}
${ui.tabela({ densa: true, mobile: 'scroll', cols: [{ k: 'o', l: 'Origem' }, { k: 'n', l: 'Leads', num: true }, { k: 'g', l: 'Ganhos', num: true }, { k: 'conv', l: 'Conversão', num: true, r: x => (x.conv == null ? '—' : fmt.pct(x.conv, 0)) }, ...(VV() ? [{ k: 'mrr', l: 'MRR ganho', num: true, r: x => fmt.brl(x.mrr) }] : [])], linhas: porOrig, ordem: { k: 'n', dir: 'desc' }, legenda: 'Origem dos leads' })}</div>` });
  const resps = [...new Set(c.all.map(d => d.respId))].map(id => { const ds = c.all.filter(d => d.respId === id); const ab = ds.filter(d => ABERTAS.includes(d.etapa)); const gm = ds.filter(d => d.etapa === 'ganho' && doMes(d.ganhoEm)); return { id, ab: ab.length, pipe: ab.reduce((s, d) => s + d.valor, 0), pond: ab.reduce((s, d) => s + d.valor * E[d.etapa].prob / 100, 0), gm: gm.length, mrr: gm.reduce((s, d) => s + d.valor, 0), atr: ab.filter(atrasada).length }; });
  const porResp = ui.card({ titulo: 'Por responsável', pad: false, corpo: ui.tabela({ cols: [{ k: 'id', l: 'Pessoa', r: x => `<span class="row" style="gap:8px;flex-wrap:nowrap">${ui.avatar(x.id, 24)}<b>${fmt.esc(nomeT(x.id))}</b></span>`, v: x => nomeT(x.id) }, { k: 'ab', l: 'Abertas', num: true }, ...(VV() ? [{ k: 'pipe', l: 'Pipeline', num: true, r: x => fmt.brl(x.pipe) }, { k: 'pond', l: 'Ponderado', num: true, r: x => fmt.brl(x.pond) }] : []), { k: 'gm', l: 'Ganhos no mês', num: true }, ...(VV() ? [{ k: 'mrr', l: 'Novo MRR', num: true, r: x => fmt.brl(x.mrr) }] : []), { k: 'atr', l: 'Ações vencidas', num: true, r: x => (x.atr ? `<span class="t-err fw6">${x.atr}</span>` : '0') }], linhas: resps, ordem: VV() ? { k: 'pipe', dir: 'desc' } : { k: 'ab', dir: 'desc' }, legenda: 'Desempenho por responsável' }) });
  if (!VV()) return `<div class="g2">${metasCard}${conversao}</div>${origens}${porResp}`;
  return `<div class="g2">${forecast}${metasCard}</div><div class="g2">${conversao}${origens}</div>${porResp}`;
}

/* ---------------- propostas ---------------- */
function paginaPropostas(ctx, c) {
  const { ui, charts } = ctx;
  const meses = [...HISTORICO.map(h => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - h.mesesAtras); return { rot: fmt.MESES_CURTOS[d.getMonth()], env: h.enviadas, gan: h.ganhas }; }), { rot: fmt.MESES_CURTOS[new Date().getMonth()], env: c.propMes.length, gan: c.ganhosMes.length }];
  const rot = meses.map(x => x.rot.charAt(0).toUpperCase() + x.rot.slice(1));
  const grafico = ui.card({ titulo: 'Propostas enviadas × ganhas', sub: 'Últimos 6 meses · mês atual até hoje', ajuda: 'Enviadas = propostas com data de envio no mês. Ganhas = negócios fechados no mês (podem ter proposta de meses anteriores).',
    corpo: charts.barras({ rotulos: rot, series: [{ nome: 'Enviadas', dados: meses.map(x => x.env) }, { nome: 'Ganhas', dados: meses.map(x => x.gan), cor: 'var(--c3)' }], formato: 'num', altura: 240, destaque: meses.length - 1 }) });
  const taxas = ui.card({ titulo: 'Taxa de ganho por mês', corpo: charts.linhas({ series: [{ nome: 'Taxa de ganho', dados: meses.map(x => Math.round((x.gan / (x.env || 1)) * 1000) / 10), area: true }], rotulos: rot, formato: 'pct', altura: 240, min: 0, metas: [{ valor: 35, rotulo: 'Referência 35%' }] }) });
  const props = c.all.filter(d => d.propostaEm).sort((a, b) => b.propostaEm.localeCompare(a.propostaEm));
  const st = d => (d.etapa === 'ganho' ? ui.selo('ok', 'Ganha') : d.etapa === 'perdido' ? ui.selo('off', `Perdida · ${d.motivoPerda || ''}`) : ui.selo(atrasada(d) ? 'err' : 'info', atrasada(d) ? `${E[d.etapa].rotulo} · ação vencida` : E[d.etapa].rotulo));
  const tabela = ui.card({ titulo: 'Propostas enviadas', sub: `${props.length} propostas · ${c.propMes.length} no mês`, pad: false,
    corpo: ui.tabela({ cols: [
      { k: 'empresa', l: 'Empresa', r: d => `<b>${fmt.esc(d.empresa)}</b><span class="sub">${fmt.esc(d.servicos.join(' · '))}</span>` },
      { k: 'propostaEm', l: 'Enviada em', r: d => fmt.data(d.propostaEm) },
      ...(VV() ? [{ k: 'valor', l: 'MRR', num: true, r: d => fmt.brl(d.valor) }] : []),
      { k: 'etapa', l: 'Situação', r: st, v: d => ETAPAS.findIndex(e => e.id === d.etapa) },
      { k: 'dias', l: 'Dias desde o envio', num: true, v: d => diasDesde(d.propostaEm), r: d => (ABERTAS.includes(d.etapa) ? fmt.plural(diasDesde(d.propostaEm), 'dia') : '<span class="mut">—</span>'), mobile: false },
      { k: 'respId', l: 'Resp.', r: d => ui.avatar(d.respId, 24), v: d => nomeT(d.respId) },
    ], linhas: props, ordem: { k: 'propostaEm', dir: 'desc' }, onRowHref: d => ctx.router.href('comercial/propostas', { deal: d.id }), legenda: 'Propostas enviadas', vazio: { titulo: 'Nenhuma proposta enviada', texto: 'Mova uma oportunidade para "Proposta enviada" para ela aparecer aqui.' } }) });
  return `<div class="g2">${grafico}${taxas}</div>${tabela}`;
}

/* ---------------- ações ---------------- */
function registrarEtapa(d, etapa, extra = {}) {
  const agora = new Date().toISOString();
  const patch = { etapa, etapaDesde: agora, historico: [...(d.historico || []), { etapa, em: agora }], ...extra };
  if (etapa === 'proposta' && !d.propostaEm) patch.propostaEm = agora;
  if (etapa === 'ganho') { patch.ganhoEm = agora; patch.perdidoEm = null; patch.motivoPerda = null; }
  if (etapa !== 'ganho') patch.ganhoEm = null;
  if (etapa !== 'perdido') { patch.perdidoEm = null; if (etapa !== 'ganho') patch.motivoPerda = null; }
  return patch;
}
async function mover(id, etapa, ctx) {
  const { ui } = ctx; const d = db.get('deals', id);
  if (!d || d.etapa === etapa || !E[etapa]) return;
  if (!ctx.can('comercial', 'editar')) { ui.toast(SEM_PERM, { tipo: 'warn' }); return; }
  const antes = { etapa: d.etapa, etapaDesde: d.etapaDesde, historico: d.historico, propostaEm: d.propostaEm, ganhoEm: d.ganhoEm, perdidoEm: d.perdidoEm, motivoPerda: d.motivoPerda, etapaPerda: d.etapaPerda };
  let extra = {};
  if (etapa === 'perdido') {
    let motivo = null;
    const ok = await ui.modal({ titulo: `Marcar ${d.empresa} como perdido?`, sub: `${mrr(d.valor)} · ${E[d.etapa].rotulo}`, largura: 'sm', confirmar: 'Marcar como perdido', perigo: true,
      corpo: `<form class="stack" novalidate>${ui.campo({ nome: 'motivo', rotulo: 'Motivo da perda', tipo: 'select', obrigatorio: true, placeholder: 'Escolha…', opcoes: ['Preço acima do orçamento', 'Escolheu outra agência', 'Projeto adiado', 'Sem orçamento', 'Sem fit com nossos serviços', 'Parou de responder', 'Outro'] })}${ui.campo({ nome: 'obs', rotulo: 'Observação', tipo: 'textarea', linhas: 2, placeholder: 'O que aprendemos com esta perda?' })}</form>`,
      onConfirmar: box => { const v = ui.form.validar(box.querySelector('form'), { motivo: 'obrigatorio' }); if (!v.ok) return false; motivo = v.dados.obs ? `${v.dados.motivo} — ${v.dados.obs}` : v.dados.motivo; return true; } });
    if (!ok) return;
    extra = { motivoPerda: motivo, etapaPerda: ABERTAS.includes(d.etapa) ? d.etapa : d.etapaPerda };
  } else if (etapa === 'ganho') {
    const ok = await ui.confirmar(`${d.empresa} vira cliente: ${mrr(d.valor)} entram no novo MRR de ${fmt.mesLongo ? fmt.mesLongo(new Date()) : 'este mês'}. Em seguida você pode cadastrar o cliente com os dados já preenchidos.`, { titulo: 'Marcar como ganho?', confirmar: 'Marcar como ganho', perigo: false });
    if (!ok) return;
  }
  const novo = db.update('deals', id, registrarEtapa(d, etapa, extra), { log: `moveu "${d.empresa}" para ${E[etapa].rotulo}` });
  const me = ctx.real || ctx.user; const resp = db.get('team', d.respId);
  if (resp && resp.userId && me && resp.userId !== me.id) ctx.notify.enviar({ para: [resp.userId], tipo: 'mensagem', titulo: `${fmt.primeiro(me.nome)} moveu ${d.empresa} para ${E[etapa].rotulo}`, texto: `${mrr(d.valor)} · antes: ${E[d.etapa].rotulo}`, link: `#/comercial/pipeline?deal=${id}`, refCol: 'deals', refId: id });
  if (etapa === 'ganho') {
    ctx.notify.enviar({ para: ['u-gabriel', 'u-paulo'].filter(u => !me || u !== me.id), tipo: 'sistema', titulo: `Negócio ganho: ${d.empresa}`, texto: `${mrr(d.valor)} · ${d.servicos.join(', ')}. Falta cadastrar como cliente.`, link: `#/comercial/pipeline?deal=${id}`, refCol: 'deals', refId: id });
    ui.toast(`${d.empresa} ganho! ${mrr(d.valor)} no novo MRR do mês.`, { desfazer: () => db.update('deals', id, antes), acao: { rotulo: 'Cadastrar como cliente', fn: () => { location.hash = `#/clientes/novo?deal=${encodeURIComponent(id)}`; } }, duracao: 10000 });
  } else ui.toast(`${novo.empresa} movido para ${E[etapa].rotulo}.`, { desfazer: () => db.update('deals', id, antes) });
}

function menuMover(btn, id, ctx) {
  const d = db.get('deals', id); if (!d) return;
  // o popover do core abre sempre abaixo da âncora: garante espaço na tela antes de abrir
  const r = btn.getBoundingClientRect(); if (r.bottom + 330 > innerHeight) window.scrollBy(0, r.bottom + 330 - innerHeight);
  const pop = ctx.ui.popover(btn, `<div class="m-comercial-pop" role="menu" aria-label="Mover ${fmt.esc(d.empresa)} para"><p>Mover para</p>${ETAPAS.map(e => `<button type="button" role="menuitem" data-para="${e.id}"${e.id === d.etapa ? ' aria-current="true" disabled' : ''}><i class="m-comercial-pd s-${e.id}"></i>${e.rotulo}${e.id === d.etapa ? '<small>atual</small>' : ''}</button>`).join('')}</div>`, { largura: 220 });
  const itens = () => Array.from(pop.el.querySelectorAll('[data-para]:not([disabled])'));
  (itens()[0] || pop.el).focus && itens()[0] && itens()[0].focus();
  pop.el.addEventListener('keydown', e => { if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return; e.preventDefault(); const l = itens(); const i = l.indexOf(document.activeElement); l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length].focus(); });
  pop.el.addEventListener('click', e => { const b = e.target.closest('[data-para]'); if (!b) return; pop.fechar(); mover(id, b.dataset.para, ctx); });
}

function formDeal(ctx, d = {}) {
  const { ui } = ctx;
  const pessoas = db.list('team', t => t.ativo !== false && ['comercial', 'dono', 'admin', 'cs'].includes(t.papel)).map(t => ({ v: t.id, l: t.nome }));
  return `<form class="stack" novalidate><div class="fgrid">
${ui.campo({ nome: 'empresa', rotulo: 'Empresa', obrigatorio: true, valor: d.empresa, placeholder: 'Ex.: Padaria Bom Grão' })}
${ui.campo({ nome: 'valor', rotulo: 'Valor (MRR)', tipo: 'moeda', obrigatorio: true, valor: d.valor, ajuda: 'Valor mensal recorrente estimado do contrato.' })}
${ui.campo({ nome: 'contato', rotulo: 'Contato', obrigatorio: true, valor: d.contato, placeholder: 'Nome do decisor' })}
${ui.campo({ nome: 'cargo', rotulo: 'Cargo do contato', valor: d.cargo, placeholder: 'Ex.: Sócia' })}
${ui.campo({ nome: 'email', rotulo: 'E-mail', tipo: 'email', valor: d.email, placeholder: 'nome@empresa.com.br' })}
${ui.campo({ nome: 'telefone', rotulo: 'WhatsApp', tipo: 'telefone', valor: d.telefone })}
<fieldset class="fld full m-comercial-fs"><legend>Serviços<span class="req" aria-hidden="true">*</span></legend><div class="rd-g">${SERVICOS.map(s => `<label class="ck"><input type="checkbox" name="servicos" value="${s}"${(d.servicos || []).includes(s) ? ' checked' : ''}><span>${s}</span></label>`).join('')}</div></fieldset>
${ui.campo({ nome: 'origem', rotulo: 'Origem', tipo: 'select', obrigatorio: true, placeholder: 'Escolha…', opcoes: ORIGENS, valor: d.origem })}
${ui.campo({ nome: 'respId', rotulo: 'Responsável', tipo: 'select', obrigatorio: true, opcoes: pessoas, valor: d.respId || 't-marina' })}
${d.id ? '' : ui.campo({ nome: 'etapa', rotulo: 'Etapa', tipo: 'select', opcoes: ETAPAS.filter(e => ABERTAS.includes(e.id)).map(e => ({ v: e.id, l: `${e.rotulo} (${e.prob}%)` })), valor: 'lead' })}
${ui.campo({ nome: 'proximaAcao', rotulo: 'Próxima ação', obrigatorio: true, valor: d.proximaAcao, placeholder: 'Ex.: Ligar para qualificar', cls: d.id ? '' : '' })}
${ui.campo({ nome: 'proximaData', rotulo: 'Data da próxima ação', tipo: 'data', obrigatorio: true, valor: d.proximaData || fmt.iso(new Date(Date.now() + DIA)) })}
${ui.campo({ nome: 'notas', rotulo: 'Notas', tipo: 'textarea', linhas: 2, valor: d.notas, cls: 'full', placeholder: 'Contexto, dores, concorrentes…' })}
</div></form>`;
}
const regrasDeal = editando => ({
  empresa: ['obrigatorio', 'min:2', v => (!editando && db.find('deals', x => fmt.norm(x.empresa) === fmt.norm(v) && ABERTAS.includes(x.etapa)) ? 'Já existe uma oportunidade aberta para esta empresa.' : '')],
  contato: 'obrigatorio|min:3',
  valor: ['obrigatorio', v => (v > 0 ? '' : 'Informe o MRR (maior que zero).'), v => (v > 500000 ? 'Valor alto demais para MRR — confira.' : '')],
  servicos: [v => (v && v.length ? '' : 'Escolha pelo menos um serviço.')],
  proximaData: [v => (v && v < isoHoje() ? 'A próxima ação não pode ficar no passado.' : '')],
});
async function novaOportunidade(ctx) {
  const { ui } = ctx; let criada = null;
  const ok = await ui.modal({ titulo: 'Nova oportunidade', sub: 'Entra no pipeline e aparece no forecast pela probabilidade da etapa.', corpo: formDeal(ctx), confirmar: 'Criar oportunidade', largura: 'lg',
    onConfirmar: box => {
      const v = ui.form.validar(box.querySelector('form'), regrasDeal(false)); if (!v.ok) return false;
      const x = v.dados; const agora = new Date().toISOString(); const etapa = x.etapa || 'lead';
      const ate = ABERTAS.indexOf(etapa);
      criada = db.insert('deals', { empresa: x.empresa.trim(), contato: x.contato.trim(), cargo: x.cargo, email: x.email, telefone: x.telefone || null, valor: x.valor, servicos: x.servicos, origem: x.origem, respId: x.respId, etapa,
        criadoEm: agora, etapaDesde: agora, propostaEm: etapa === 'proposta' || etapa === 'negociacao' ? agora : null, ganhoEm: null, perdidoEm: null, motivoPerda: null, etapaPerda: null,
        proximaAcao: x.proximaAcao, proximaData: x.proximaData, notas: x.notas, historico: ABERTAS.slice(0, ate + 1).map(e => ({ etapa: e, em: agora })), clienteId: null }, { log: `criou a oportunidade "${x.empresa.trim()}"` });
      const me = ctx.real || ctx.user; const resp = db.get('team', x.respId);
      if (resp && resp.userId && me && resp.userId !== me.id) ctx.notify.enviar({ para: [resp.userId], tipo: 'atribuicao', titulo: `Nova oportunidade para você: ${criada.empresa}`, texto: `${mrr(criada.valor)} · próxima ação: ${criada.proximaAcao} (${fmt.data(criada.proximaData)})`, link: `#/comercial/pipeline?deal=${criada.id}`, refCol: 'deals', refId: criada.id });
      return true;
    } });
  if (ok && criada) ui.toast(`Oportunidade "${criada.empresa}" criada em ${E[criada.etapa].rotulo}.`, { desfazer: () => db.remove('deals', criada.id), acao: { rotulo: 'Abrir', fn: () => ctx.router.setQuery({ deal: criada.id }, { render: true }) } });
}
async function editarDeal(id, ctx) {
  const { ui } = ctx; const d = db.get('deals', id); if (!d) return;
  const ok = await ui.modal({ titulo: 'Editar oportunidade', sub: d.empresa, corpo: formDeal(ctx, d), confirmar: 'Salvar', largura: 'lg',
    onConfirmar: box => {
      const v = ui.form.validar(box.querySelector('form'), regrasDeal(true)); if (!v.ok) return false;
      const x = v.dados; delete x.etapa;
      db.update('deals', id, { ...x, empresa: x.empresa.trim(), contato: x.contato.trim() }, { log: `editou a oportunidade "${d.empresa}"` });
      return true;
    } });
  if (ok) ui.toast('Oportunidade salva.', { desfazer: () => db.update('deals', id, d) });
  return ok;
}

let dwAtual = null, dwRef = null;
function abrirDeal(id, ctx) {
  const { ui } = ctx; const d = db.get('deals', id);
  if (!d) { ui.toast('Oportunidade não encontrada. Ela pode ter sido excluída.', { tipo: 'warn' }); ctx.router.setQuery({ deal: null }); return; }
  const pode = ctx.can('comercial', 'editar'); const podeExc = ctx.can('comercial', 'excluir');
  const resp = db.get('team', d.respId);
  const aviso = d.etapa === 'ganho' && !d.clienteId ? ui.aviso({ tipo: 'ok', titulo: 'Negócio ganho!', texto: 'Cadastre como cliente para iniciar o onboarding — empresa, contato, serviços e MRR já vão preenchidos.', acao: pode ? ui.btn({ rotulo: 'Cadastrar como cliente', icone: 'user-plus', tipo: 'pri', sm: true, href: `#/clientes/novo?deal=${encodeURIComponent(d.id)}`, attrs: { 'data-fechar': '' } }) : '' })
    : atrasada(d) ? ui.aviso({ tipo: 'err', titulo: `Próxima ação vencida há ${fmt.plural(-fmt.diasAte(d.proximaData), 'dia')}`, texto: `"${d.proximaAcao}" era para ${fmt.data(d.proximaData)}. Faça o contato ou reagende.` }) : '';
  const corpo = `<div class="stack m-comercial-dw">${aviso}
${VV() ? `<div class="m-comercial-dw-top"><div><span class="m-comercial-k">MRR</span><b class="num">${fmt.brl(d.valor)}<small>/mês</small></b></div><div><span class="m-comercial-k">Probabilidade</span><b class="num">${E[d.etapa].prob}%</b></div><div><span class="m-comercial-k">Ponderado</span><b class="num">${fmt.brl(d.valor * E[d.etapa].prob / 100)}</b></div></div>` : ''}
<label class="fld"><span class="m-comercial-k">Etapa</span><select data-dw-etapa${pode ? '' : ` disabled title="${SEM_PERM}"`}>${ETAPAS.map(e => `<option value="${e.id}"${e.id === d.etapa ? ' selected' : ''}>${e.rotulo}</option>`).join('')}</select></label>
${ui.pares([
    ['Contato', `${fmt.esc(d.contato)}${d.cargo ? ` <span class="mut">· ${fmt.esc(d.cargo)}</span>` : ''}`],
    ['E-mail', d.email ? `<a href="mailto:${fmt.esc(d.email)}">${fmt.esc(d.email)}</a>` : ''],
    ['WhatsApp', fmt.esc(d.telefone || '')],
    ['Serviços', fmt.esc(d.servicos.join(', '))],
    ['Origem', fmt.esc(d.origem)],
    ['Responsável', resp ? `<span class="row" style="gap:6px">${ui.avatar(resp, 20)}${fmt.esc(resp.nome)}</span>` : ''],
    ['Próxima ação', ABERTAS.includes(d.etapa) ? `${fmt.esc(d.proximaAcao || '—')}<br><span class="${atrasada(d) ? 't-err fw6' : 'mut'}">${d.proximaData ? fmt.data(d.proximaData) : ''}</span>` : '<span class="mut">—</span>'],
    ['Criada em', `${fmt.data(d.criadoEm)} <span class="mut">· ${fmt.plural(diasDesde(d.criadoEm), 'dia')}</span>`],
    ['Proposta enviada', d.propostaEm ? fmt.data(d.propostaEm) : ''],
    [d.etapa === 'perdido' ? 'Motivo da perda' : 'Na etapa há', d.etapa === 'perdido' ? fmt.esc(d.motivoPerda || '') : fmt.plural(diasDesde(d.etapaDesde), 'dia')],
  ], { colunas: 2 })}
${d.notas ? `<div><span class="m-comercial-k">Notas</span><p class="m-comercial-nt">${fmt.esc(d.notas)}</p></div>` : ''}
<div><span class="m-comercial-k">Histórico de etapas</span><ol class="m-comercial-hi">${(d.historico || []).slice().reverse().map(h => `<li><i class="m-comercial-pd s-${h.etapa}"></i><b>${E[h.etapa] ? E[h.etapa].rotulo : h.etapa}</b><span class="mut num">${fmt.data(h.em)}</span></li>`).join('')}</ol></div>
<div><div class="row between"><span class="m-comercial-k">Comentários</span>${ctx.notify.botaoNotificar('deals', d.id, d.empresa, { sm: true })}</div>${ctx.notify.comentarios('deals', d.id, { titulo: d.empresa })}</div>
</div>`;
  const rodape = `${podeExc ? ui.btn({ rotulo: 'Excluir', icone: 'trash', tipo: 'perigo', sm: true, attrs: { 'data-dw-excluir': '' } }) : ''}<span style="flex:1"></span>${pode ? ui.btn({ rotulo: 'Editar', icone: 'edit', attrs: { 'data-dw-editar': '' } }) : ''}${ui.btn({ rotulo: 'Fechar', tipo: 'pri', attrs: { 'data-fechar': '' } })}`;
  dwAtual = id;
  const dw = dwRef = ui.drawer({ titulo: d.empresa, sub: `${E[d.etapa].rotulo} · ${d.origem}`, corpo, rodape, largura: 520 });
  dw.el.addEventListener('change', e => { const s = e.target.closest('[data-dw-etapa]'); if (!s) return; const v = s.value; dw.fechar(); mover(id, v, ctx); });
  dw.el.addEventListener('click', async e => {
    if (e.target.closest('[data-dw-editar]')) { dw.fechar(); if (await editarDeal(id, ctx)) setTimeout(() => abrirDeal(id, ctx), 200); }
    else if (e.target.closest('[data-dw-excluir]')) {
      const ok = await ui.confirmar(`"${d.empresa}" sai do pipeline e dos relatórios. Você pode desfazer logo em seguida.`, { titulo: 'Excluir oportunidade?', confirmar: 'Excluir' });
      if (!ok) return; dw.fechar(); const rem = db.remove('deals', id, { log: `excluiu a oportunidade "${d.empresa}"` });
      ui.toast(`"${d.empresa}" excluída.`, { desfazer: () => db.insert('deals', rem) });
    }
  });
  dw.fechado.then(() => { dwAtual = null; dwRef = null; if (ctx.router.query.deal === id) ctx.router.setQuery({ deal: null }); });
}

async function editarMetas(ctx) {
  const { ui } = ctx; const m = metas();
  const ok = await ui.modal({ titulo: 'Metas do mês', largura: 'sm', confirmar: 'Salvar metas',
    corpo: `<form class="stack" novalidate>${ui.campo({ nome: 'novoMrr', rotulo: 'Novo MRR', tipo: 'moeda', obrigatorio: true, valor: m.novoMrr })}${ui.campo({ nome: 'propostas', rotulo: 'Propostas enviadas', tipo: 'number', obrigatorio: true, valor: m.propostas, attrs: { min: 1 } })}${ui.campo({ nome: 'ganhos', rotulo: 'Negócios ganhos', tipo: 'number', obrigatorio: true, valor: m.ganhos, attrs: { min: 1 } })}</form>`,
    onConfirmar: box => {
      const pos = v => (v > 0 ? '' : 'Informe um valor maior que zero.');
      const v = ui.form.validar(box.querySelector('form'), { novoMrr: ['obrigatorio', pos], propostas: ['obrigatorio', pos], ganhos: ['obrigatorio', pos] }); if (!v.ok) return false;
      db.setConfig('comercialMetas', { novoMrr: v.dados.novoMrr, propostas: Math.round(v.dados.propostas), ganhos: Math.round(v.dados.ganhos) }, { log: 'alterou as metas comerciais do mês' });
      return true;
    } });
  if (ok) ui.toast('Metas atualizadas.', { desfazer: () => db.setConfig('comercialMetas', m) });
}

/* ---------------- módulo ---------------- */
const ABAS = [{ id: 'pipeline', rotulo: 'Pipeline' }, { id: 'desempenho', rotulo: 'Desempenho' }, { id: 'propostas', rotulo: 'Propostas' }];
export default {
  id: 'comercial',
  titulo: 'Comercial',
  icone: 'target',
  grupo: 'gestao',
  rota: 'comercial',
  routes: ['comercial', 'comercial/:aba'],
  watch: ['deals', 'settings', 'team'],
  contador() {
    const n = db.count('deals', atrasada);
    return n ? { n, estado: 'warn', rotulo: `${n} oportunidade${n > 1 ? 's' : ''} com próxima ação vencida` } : null;
  },
  busca(q) {
    return db.list('deals', d => fmt.norm(d.empresa).includes(q) || fmt.norm(d.contato).includes(q))
      .map(d => ({ tipo: 'Oportunidades', titulo: d.empresa, sub: VV() ? `${E[d.etapa].rotulo} · ${mrr(d.valor)}` : `${E[d.etapa].rotulo} · ${d.servicos.join(', ')}`, href: `#/comercial/pipeline?deal=${d.id}`, led: atrasada(d) ? 'err' : d.etapa === 'ganho' ? 'ok' : undefined, icone: 'target' }));
  },
  render(ctx) {
    const { ui } = ctx;
    const aba = ABAS.some(a => a.id === ctx.params.aba) ? ctx.params.aba : (ctx.params.aba ? null : 'pipeline');
    if (!aba) return `<div class="pg">${ui.cabecalho({ titulo: 'Comercial' })}<div class="card">${ui.vazio({ icone: 'search', titulo: 'Aba não encontrada', texto: 'Escolha Pipeline, Desempenho ou Propostas.', acao: { rotulo: 'Ir para o pipeline', href: '#/comercial' } })}</div></div>`;
    if (aba !== 'pipeline') ctx.migalha(ABAS.find(a => a.id === aba).rotulo);
    const c = calc(); const pode = ctx.can('comercial', 'editar');
    const marina = db.get('team', 't-marina');
    const meta = `${marina ? `<span class="row" style="gap:6px">${ui.avatar(marina, 20)}Responsável: ${fmt.esc(marina.nome)}</span>` : ''}<span>${fmt.plural(c.abertas.length, 'oportunidade aberta', 'oportunidades abertas')}</span>`;
    const corpo = aba === 'pipeline' ? paginaPipeline(ctx, c) : aba === 'desempenho' ? paginaDesempenho(ctx, c) : paginaPropostas(ctx, c);
    return `<div class="pg m-comercial">
${ui.cabecalho({ titulo: 'Comercial', sub: VV() ? 'Pipeline de novos clientes, previsão de receita e propostas.' : 'Pipeline de novos clientes, conversão e propostas.', meta, acoes: ui.btn({ rotulo: 'Nova oportunidade', icone: 'plus', tipo: 'pri', attrs: { 'data-nova': '' }, disabled: !pode, title: pode ? 'Cadastrar uma nova oportunidade' : SEM_PERM }) })}
${kpis(ctx, c)}
${ui.tabs(ABAS.map(a => ({ ...a, id: a.id === 'pipeline' ? '' : a.id, n: a.id === 'pipeline' ? c.abertas.length : a.id === 'propostas' ? c.propMes.length : undefined })), aba === 'pipeline' ? '' : aba, 'comercial')}
${corpo}
</div>`;
  },
  mount(el, ctx) {
    const onClick = e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.deal) ctx.router.setQuery({ deal: b.dataset.deal }, { push: true, render: true });
      else if (b.dataset.moverMenu) menuMover(b, b.dataset.moverMenu, ctx);
      else if ('nova' in b.dataset) novaOportunidade(ctx);
      else if ('metas' in b.dataset) editarMetas(ctx);
    };
    const onChange = e => { const s = e.target.closest('[data-q]'); if (s) ctx.router.setQuery({ [s.dataset.q]: s.value || null }, { render: true }); };
    // arrastar e soltar
    let arrast = null;
    const onDragStart = e => { const c = e.target.closest('.m-comercial-cd[draggable]'); if (!c) return; arrast = c.dataset.id; c.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', arrast); } catch (x) { /* ok */ } };
    const onDragEnd = e => { const c = e.target.closest('.m-comercial-cd'); if (c) c.classList.remove('is-drag'); el.querySelectorAll('.m-comercial-col.is-over').forEach(x => x.classList.remove('is-over')); };
    const onDragOver = e => { const col = e.target.closest('.m-comercial-col'); if (!col || !arrast) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.querySelectorAll('.m-comercial-col.is-over').forEach(x => x !== col && x.classList.remove('is-over')); col.classList.add('is-over'); };
    const onDrop = e => { const col = e.target.closest('.m-comercial-col'); if (!col || !arrast) return; e.preventDefault(); const id = arrast; arrast = null; col.classList.remove('is-over'); mover(id, col.dataset.etapa, ctx); };
    el.addEventListener('click', onClick); el.addEventListener('change', onChange);
    el.addEventListener('dragstart', onDragStart); el.addEventListener('dragend', onDragEnd); el.addEventListener('dragover', onDragOver); el.addEventListener('drop', onDrop);
    let t = null;
    if (ctx.query.deal && dwAtual !== ctx.query.deal) t = setTimeout(() => abrirDeal(ctx.query.deal, ctx), 60);
    return () => { el.removeEventListener('click', onClick); el.removeEventListener('change', onChange); el.removeEventListener('dragstart', onDragStart); el.removeEventListener('dragend', onDragEnd); el.removeEventListener('dragover', onDragOver); el.removeEventListener('drop', onDrop); clearTimeout(t); if (dwRef) dwRef.fechar(); };
  },
};
