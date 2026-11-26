// engine.js — agregação dos dados diários (Windsor) e motor de "Decisões recomendadas" (regras transparentes).
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import { CAMPO_RESULTADO, F_CONVERSA, CONTA_DE, CONTAS_DEMO } from './data.js';
import MotorRecs from '../../shared/motor-recs.mjs';
import { padrao } from '../../core/padroes/index.js';

export const TIPOS = {
  lead: { rot: 'Leads', curto: 'leads', um: 'lead', cpr: 'CPL', custo: 'custo por lead' },
  conversa: { rot: 'Conversas', curto: 'conv.', um: 'conversa', cpr: 'Custo/conversa', custo: 'custo por conversa' },
  compra: { rot: 'Compras', curto: 'compras', um: 'compra', cpr: 'CPA', custo: 'custo por compra' },
  engaj: { rot: 'Engajamentos', curto: 'engaj.', um: 'engajamento', cpr: 'Custo/engaj.', custo: 'custo por engajamento' },
};

/* ---------------- contas: CA01 e CA02 · HOF (seletor "CA01 / CA02 / As duas (somadas)", ?conta= na URL) ---------------- */
// Produção: as duas contas reais do dono (dados AO VIVO pela Edge Function windsor-proxy, só Dono/Admin).
// Demonstração: duas contas FICTÍCIAS (data.js). A produção nunca mostra dados de demonstração.
const CONTAS_REAIS = [
  { k: 'ca01', id: 'act_1906477940242386', nome: 'CA01 (conta principal)', curto: 'CA01' },
  { k: 'ca02', id: 'act_848802707655510', nome: 'CA02 · HOF', curto: 'CA02 · HOF' },
];
export const CONTAS = db.dadosDemo ? CONTAS_DEMO : CONTAS_REAIS;
export const SOMA = 'soma';
let sel = SOMA;
/** escolhe a conta pela query (?conta=ca01|ca02; ausente = as duas somadas) */
export function selecionar(q) { sel = CONTAS.some(c => c.k === q) ? q : SOMA; return sel; }
export const selecao = () => sel;
export const contaSel = () => CONTAS.find(c => c.k === sel) || null;
const normAct = v => String(v == null ? '' : v).replace(/^act_/i, '').replace(/\D/g, '');
const kDeAct = v => { const n = normAct(v); const c = CONTAS.find(x => normAct(x.id) === n); return c ? c.k : null; };
/** conta (ca01|ca02) de uma linha ou entidade; dados antigos do demo sem o campo caem pelo mapa da campanha */
export const contaDe = r => r.conta || kDeAct(r.account_id) || CONTA_DE[r.campaign_id || r.campanhaId] || 'ca01';
const daSel = r => sel === SOMA || contaDe(r) === sel;

/* ---------------- cache por versão dos dados ---------------- */
let versao = 0; const cache = new Map();
db.on(col => { if (['campaignDaily', 'campaigns', 'campaignAccount', 'creatives', 'settings', 'recsLog', '*'].includes(col)) { versao++; cache.clear(); } });
const memo = (k, fn) => { const kk = `${versao}:${sel}:${k}`; if (!cache.has(kk)) cache.set(kk, fn()); return cache.get(kk); };

/* ---------------- produção: dados ao vivo (memória, nunca gravados no banco) ---------------- */
export const vivo = { rows: null, ents: null, contas: {}, carregando: false, erro: null, em: null, ouvintes: new Set() };
let avisoAg = false;
const avisarVivo = () => { versao++; cache.clear(); if (avisoAg) return; avisoAg = true; setTimeout(() => { avisoAg = false; [...vivo.ouvintes].forEach(f => { try { f(); } catch (e) { console.error(e); } }); }, 0); };
export const ouvirVivo = fn => { vivo.ouvintes.add(fn); return () => vivo.ouvintes.delete(fn); };
export const DIAS_VIVO = 180;
const CAMPOS_VIVO = ['date', 'account_id', 'campaign_id', 'campaign', 'campaign_effective_status', 'campaign_objective', 'adset_id', 'adset_name', 'adset_effective_status', 'adset_daily_budget',
  'ad_id', 'ad_name', 'effective_status', 'spend', 'impressions', 'clicks', 'reach', 'frequency', 'actions_lead', F_CONVERSA, 'actions_purchase', 'action_values_purchase', 'actions_post_engagement', 'actions_video_view'];
const num = v => (v == null || v === '' ? 0 : Number(v) || 0);
const stDe = v => (/^(ACTIVE|IN_PROCESS|WITH_ISSUES)$/i.test(String(v || '')) ? 'ativo' : 'pausado');
/** tipo de resultado da campanha: objetivo do Meta; sem objetivo, o que a campanha gerou */
function tipoDe(obj, soma) {
  const o = String(obj || '').toUpperCase();
  if (/LEAD/.test(o)) return 'lead';
  if (/MESSAG|CONVERSA/.test(o)) return 'conversa';
  if (/SALES|CONVERSIONS|PURCHASE|PRODUCT/.test(o)) return 'compra';
  if (/ENGAGEMENT|AWARENESS|TRAFFIC|VIDEO|REACH|POST/.test(o) && !soma.lead && !soma.conversa && !soma.compra) return 'engaj';
  if (soma.compra) return 'compra'; if (soma.conversa) return 'conversa'; if (soma.lead) return 'lead';
  return 'engaj';
}
/** linhas do Windsor (anúncio × dia) → linhas no formato de campaignDaily + entidades campanha/conjunto/anúncio */
export function converterWindsor(data) {
  const somaCamp = new Map(); const ents = new Map(); const ult = new Map();
  for (const r of data) {
    const k = kDeAct(r.account_id); const cid = String(r.campaign_id || ''), sid = String(r.adset_id || ''), aid = String(r.ad_id || '');
    if (!k || !cid || !sid || !aid || !r.date) continue;
    const s = somaCamp.get(cid) || { lead: 0, conversa: 0, compra: 0 }; s.lead += num(r.actions_lead); s.conversa += num(r[F_CONVERSA]); s.compra += num(r.actions_purchase); somaCamp.set(cid, s);
    const d = String(r.date).slice(0, 10); const novo = !ult.has(aid) || d >= ult.get(aid); if (novo) ult.set(aid, d);
    if (novo || !ents.has(cid)) ents.set(cid, { id: cid, nivel: 'campanha', nome: String(r.campaign || cid), status: stDe(r.campaign_effective_status), campanhaId: cid, conta: k, objetivo: r.campaign_objective || null });
    if (novo || !ents.has(sid)) ents.set(sid, { id: sid, nivel: 'conjunto', nome: String(r.adset_name || sid), paiId: cid, campanhaId: cid, status: stDe(r.adset_effective_status), orcamentoDia: r.adset_daily_budget == null || r.adset_daily_budget === '' ? 0 : Math.round(num(r.adset_daily_budget)) / 100, conta: k });
    if (novo || !ents.has(aid)) ents.set(aid, { id: aid, nivel: 'anuncio', nome: String(r.ad_name || aid), paiId: sid, campanhaId: cid, status: stDe(r.effective_status), conta: k });
  }
  const tipo = new Map([...ents.values()].filter(e => e.nivel === 'campanha').map(e => [e.id, tipoDe(e.objetivo, somaCamp.get(e.id) || {})]));
  ents.forEach(e => { e.tipo = tipo.get(e.campanhaId) || 'engaj'; });
  const rows = [];
  for (const r of data) {
    const k = kDeAct(r.account_id); const aid = String(r.ad_id || ''); if (!k || !aid || !r.date || !ents.has(aid)) continue;
    const t = tipo.get(String(r.campaign_id)); const impressions = num(r.impressions);
    const row = { id: `vv-${aid}-${String(r.date).slice(0, 10)}`, conta: k, account_id: `act_${normAct(r.account_id)}`, date: String(r.date).slice(0, 10), campaign_id: String(r.campaign_id), adset_id: String(r.adset_id), ad_id: aid,
      spend: num(r.spend), impressions, clicks: num(r.clicks), reach: num(r.reach), frequency: num(r.frequency) || (num(r.reach) ? impressions / num(r.reach) : 0) };
    if (t === 'lead') row.actions_lead = num(r.actions_lead);
    else if (t === 'conversa') row[F_CONVERSA] = num(r[F_CONVERSA]);
    else if (t === 'compra') { row.actions_purchase = num(r.actions_purchase); row.action_values_purchase = num(r.action_values_purchase); }
    else row.actions_post_engagement = num(r.actions_post_engagement);
    if (r.actions_video_view != null) row.actions_video_view = num(r.actions_video_view);
    rows.push(row);
  }
  return { rows, ents };
}
/** busca as duas contas ao vivo (só produção; a Edge Function confere Dono/Admin) */
export async function carregarVivo(o = {}) {
  if (db.dadosDemo || vivo.carregando) return;
  if (!db.supabase) { if (!vivo.erro) { vivo.erro = 'Sem conexão com o servidor.'; avisarVivo(); } return; }
  if (!o.forcar && vivo.rows && Date.now() - Date.parse(vivo.em) < 5 * 60e3) return;
  vivo.carregando = true; vivo.erro = null; avisarVivo();
  const ids = CONTAS.map(c => c.id).join(',');
  const chamar = async body => {
    const { data, error } = await db.supabase.functions.invoke('windsor-proxy', { body });
    if (error) { let msg = error.message || 'Falha ao buscar os dados.'; try { const j = await error.context.json(); if (j && j.erro) msg = j.erro; } catch (e) { /* sem corpo */ } throw new Error(msg); }
    return data;
  };
  try {
    const [dados, est] = await Promise.all([
      chamar({ date_preset: `last_${DIAS_VIVO - 1}dT`, select_accounts: ids, fields: CAMPOS_VIVO }),
      chamar({ date_preset: 'last_730d', select_accounts: ids, fields: ['account_id', 'account_name', 'account_status'] }).catch(() => null),
    ]);
    const { rows, ents } = converterWindsor((dados && dados.data) || []);
    const contas = {};
    ((est && est.data) || []).forEach(r => { const k = kDeAct(r.account_id); if (k) contas[k] = { nome: r.account_name || null, status: r.account_status || null }; });
    Object.assign(vivo, { rows, ents, contas, em: (dados && dados.atualizadoEm) || new Date().toISOString() });
  } catch (e) { vivo.erro = e.message || String(e); }
  finally { vivo.carregando = false; avisarVivo(); }
}

const METAS_PADRAO = { lead: 9, conversa: 45, compra: 300, engaj: 0.3, roas: 3 };
/** registro da conta: demo = 'demo' (semente); produção = registro 'propria' (decisões, metas) + estado ao vivo */
export const conta = () => {
  if (db.dadosDemo) return db.get('campaignAccount', 'demo') || db.list('campaignAccount')[0] || null;
  const r = db.get('campaignAccount', 'propria') || {};
  const cs = contaSel();
  return { id: 'propria', plataforma: 'Meta Ads', fonte: 'Windsor.ai', moeda: 'BRL', fuso: 'America/Sao_Paulo', decisoes: {}, ...r, metas: { ...METAS_PADRAO, ...(r.metas || {}) },
    nome: cs ? cs.nome : 'CA01 + CA02 · HOF (somadas)', accountId: cs ? cs.id : CONTAS.map(c => c.id).join(', '), conectada: !!vivo.rows, ultimaSync: vivo.em, quebras: null };
};
/** produção: cria o registro 'propria' antes da primeira decisão gravada */
export function garantirConta() {
  if (db.dadosDemo || db.get('campaignAccount', 'propria')) return;
  db.insert('campaignAccount', { id: 'propria', nome: 'Contas próprias (CA01 e CA02 · HOF)', decisoes: {}, metas: { ...METAS_PADRAO } });
}
const baseRows = () => (db.dadosDemo ? db.list('campaignDaily') : vivo.rows || []);
const baseEnts = () => (db.dadosDemo ? db.list('campaigns') : vivo.ents ? [...vivo.ents.values()] : []);
export const linhas = () => memo('linhas', () => baseRows().filter(daSel).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));
export const entidades = () => memo('ent', () => { const m = new Map(); baseEnts().filter(daSel).forEach(c => m.set(c.id, c)); return m; });
export const limites = () => memo('lim', () => { const l = linhas(); return l.length ? { min: l[0].date, max: l[l.length - 1].date } : null; });
/** totais por conta (comparativo CA01 × CA02 na visão "As duas") */
export function porConta(ini, fim) {
  return CONTAS.map(c => ({ ...c, m: agregar(baseRows().filter(r => contaDe(r) === c.k && r.date >= ini && r.date <= fim)) }));
}

const addDias = (iso, n) => { const d = fmt.toDate(iso); d.setDate(d.getDate() + n); return fmt.iso(d); };
const diff = (a, b) => Math.round((fmt.toDate(b) - fmt.toDate(a)) / 864e5) + 1;

/** janela do período: query.dias (7|14|30) ou período global do app */
export function janela(ctx) {
  const lim = limites(); if (!lim) return null;
  const fim = lim.max; let ini, rotulo;
  const d = Number(ctx.query.dias);
  if ([7, 14, 30].includes(d)) { ini = addDias(fim, -(d - 1)); rotulo = `Últimos ${d} dias`; }
  else if (ctx.periodo === 'mes') { const f = fmt.toDate(fim); ini = fmt.iso(new Date(f.getFullYear(), f.getMonth(), 1)); if (ini > fim) ini = addDias(fim, -29); rotulo = `${fmt.mesLongo(fim)} até ${fmt.dataCurta(fim)}`; rotulo = rotulo[0].toUpperCase() + rotulo.slice(1); }
  else { ini = lim.min; rotulo = `Últimos ${diff(lim.min, fim)} dias (todo o histórico)`; }
  if (ini < lim.min) ini = lim.min;
  const n = diff(ini, fim); const fimAnt = addDias(ini, -1); const iniAnt = addDias(ini, -n);
  return { ini, fim, n, iniAnt, fimAnt, rotulo, comparavel: iniAnt >= lim.min, limitado: ctx.periodo === '12m' && ![7, 14, 30].includes(d) };
}
export const noIntervalo = (ini, fim) => r => r.date >= ini && r.date <= fim;

/** soma linhas e calcula métricas */
export function agregar(rows) {
  const t = { spend: 0, spendRes: 0, impressions: 0, clicks: 0, lead: 0, conversa: 0, compra: 0, engaj: 0, valor: 0, video: 0, fImp: 0, dias: new Set() };
  for (const r of rows) {
    t.spend += r.spend || 0; if (r.actions_lead !== undefined || r[F_CONVERSA] !== undefined || r.actions_purchase !== undefined) t.spendRes += r.spend || 0; t.impressions += r.impressions || 0; t.clicks += r.clicks || 0;
    t.lead += r.actions_lead || 0; t.conversa += r[F_CONVERSA] || 0; t.compra += r.actions_purchase || 0; t.engaj += r.actions_post_engagement || 0;
    t.valor += r.action_values_purchase || 0; t.video += r.actions_video_view || 0; t.fImp += (r.frequency || 0) * (r.impressions || 0); t.dias.add(r.date);
  }
  const m = { ...t, dias: t.dias.size };
  m.resultados = t.lead + t.conversa + t.compra;
  m.cpr = m.resultados ? t.spendRes / m.resultados : null;
  m.ctr = t.impressions ? (t.clicks / t.impressions) * 100 : null;
  m.cpm = t.impressions ? (t.spend / t.impressions) * 1000 : null;
  m.cpc = t.clicks ? t.spend / t.clicks : null;
  m.freq = t.impressions ? t.fImp / t.impressions : null;
  m.reach = m.freq ? Math.round(t.impressions / m.freq) : 0;
  m.roas = t.spend ? t.valor / t.spend : null;
  m.hook = t.video && t.impressions ? (t.video / t.impressions) * 100 : null;
  return m;
}
/** resultado e custo por resultado de uma entidade conforme o tipo da campanha */
export function doTipo(m, tipo) {
  const n = m[tipo] || 0; return { n, cpr: n ? m.spend / n : null };
}
/** agregação por chave (campaign_id | adset_id | ad_id) */
export function porChave(rows, chave) {
  const g = new Map(); rows.forEach(r => { const k = r[chave]; if (!g.has(k)) g.set(k, []); g.get(k).push(r); });
  const out = new Map(); g.forEach((l, k) => out.set(k, agregar(l))); return out;
}
/** série diária */
export function serieDiaria(rows, ini, fim) {
  const dias = []; for (let d = ini; d <= fim; d = addDias(d, 1)) dias.push(d);
  const g = new Map(dias.map(d => [d, []])); rows.forEach(r => { if (g.has(r.date)) g.get(r.date).push(r); });
  return dias.map(d => ({ d, ...agregar(g.get(d)) }));
}

/** orçamento diário total da conta (conjuntos ativos de campanhas ativas) */
export function orcamentoConta() {
  const ent = entidades();
  return [...ent.values()].filter(e => e.nivel === 'conjunto' && e.status === 'ativo' && (ent.get(e.campanhaId) || {}).status === 'ativo').reduce((a, e) => a + (e.orcamentoDia || 0), 0);
}
const ativo = e => { const ent = entidades(); if (!e || e.status !== 'ativo') return false; const p = e.paiId ? ent.get(e.paiId) : null; const c = ent.get(e.campanhaId); return (!p || p.status === 'ativo') && (!c || c.status === 'ativo'); };
export { ativo as estaAtivo };

/* ---------------- recomendações (motor único: src/shared/motor-recs.js) ---------------- */
// Regras ajustáveis em settings 'motorRegras' (aba "Regras da IA"; a mesma configuração vale para a Torre).
// Decisões: estado da tela em campaignAccount.decisoes; aprendizado (aceita/recusada/adiada + resultado 7 dias depois) em recsLog.
export { MotorRecs };
export const overrides = () => db.config('motorRegras', {}) || {};
export const regrasAtuais = () => MotorRecs.regras(overrides());

const metr = (m, tipo) => {
  if (!m) return null;
  const res = tipo ? m[tipo] || 0 : m.resultados;
  return { gasto: m.spend, impressoes: m.impressions, cliques: m.clicks, resultados: res, valor: m.valor, frequencia: m.freq, alcance: m.reach };
};
/** snapshot normalizado da conta própria para o motor (esquema em docs/MOTOR-RECS.md) */
export function snapshot() {
  return memo('snap', () => {
    const lim = limites(); const c = conta(); if (!lim || !c) return null;
    const metas = c.metas || {}; const ent = entidades(); const todas = linhas(); const fim = lim.max;
    const W = { d3: addDias(fim, -2), d7: addDias(fim, -6), d14: addDias(fim, -13) };
    const por = {}; const conta3 = {};
    Object.entries(W).forEach(([k, ini]) => {
      const rows = todas.filter(noIntervalo(ini, fim));
      por[k] = { ad: porChave(rows, 'ad_id'), set: porChave(rows, 'adset_id'), camp: porChave(rows, 'campaign_id') }; conta3[k] = agregar(rows);
    });
    const jan = (mapa, id, tipo) => ({ metricas3d: metr(por.d3[mapa].get(id), tipo), metricas7d: metr(por.d7[mapa].get(id), tipo), metricas14d: metr(por.d14[mapa].get(id), tipo) });
    const lista = [...ent.values()];
    const campanhas = lista.filter(e => e.nivel === 'campanha').map(cp => {
      const tipo = cp.tipo; const alvo = tipo === 'engaj' ? null : metas[tipo] || null;
      return {
        id: cp.id, nome: cp.nome, status: cp.status, alteradoEm: cp.alteradoEm || null, cbo: false, orc: 0, objetivo: tipo === 'conversa' ? 'mensagem' : tipo,
        meta: { tipoResultado: tipo, custoAlvo: alvo, roasAlvo: tipo === 'compra' ? metas.roas || null : null }, ...jan('camp', cp.id, tipo),
        conjuntos: lista.filter(e => e.nivel === 'conjunto' && e.paiId === cp.id).map(s => ({
          id: s.id, nome: s.nome, status: s.status, alteradoEm: s.alteradoEm || null, orc: s.orcamentoDia || 0, aprendizado: s.aprendizado || null, ...jan('set', s.id, tipo),
          anuncios: lista.filter(e => e.nivel === 'anuncio' && e.paiId === s.id).map(a => ({ id: a.id, nome: a.nome, status: a.status, alteradoEm: a.alteradoEm || null, formato: (db.get('creatives', a.criativoId) || {}).formato || null, ...jan('ad', a.id, tipo) })),
        })),
      };
    });
    const dias = serieDiaria(todas.filter(noIntervalo(W.d14, fim)), W.d14, fim);
    return {
      conta: { id: c.id, nome: c.nome }, hoje: fim,
      meta: { tipoResultado: 'lead', custoAlvo: metas.lead || null, roasAlvo: metas.roas || null },
      orcamentoDiarioConta: orcamentoConta(), tetoDiario: c.tetoDiario || null, orcamentoMinimo: padrao('orcamento.minimoDia', 6), arredondarOrcamento: 1,
      campanhas, metricas3d: metr(conta3.d3), metricas7d: metr(conta3.d7), metricas14d: metr(conta3.d14),
      gastoPorDia: dias.map(d => ({ data: d.d, gasto: d.spend })), diasComDados: new Set(todas.filter(r => r.spend > 0).map(r => r.date)).size,
      diasSemOtimizar: null, ultimaMensagemCliente: null,
    };
  });
}
const hojeIso = () => fmt.iso(new Date());
/** estado de cada recomendação: pendente | aplicada | ignorada | adiada (até a data) */
function estadoDe(d) { if (!d) return 'pendente'; if (d.estado === 'adiada' && d.ate && d.ate <= hojeIso()) return 'pendente'; return d.estado; }
export function recomendacoes() {
  return memo('recs', () => {
    const snap = snapshot(); const c = conta(); if (!snap || !c) return [];
    const ativas = MotorRecs.recomendar(snap, { regras: regrasAtuais() });
    const dec = c.decisoes || {}; const ids = new Set(ativas.map(r => r.id));
    // decidida: mostra a cópia guardada na decisão (números do momento em que foi decidida)
    const out = ativas.map(r => { const d = dec[r.id] || null; const estado = estadoDe(d); return estado !== 'pendente' && d && d.rec ? { ...d.rec, decisao: d, estado } : { ...r, decisao: d, estado }; });
    // decisões já tomadas cuja condição não vale mais (ex.: anúncio já pausado) continuam no histórico com a cópia guardada
    Object.entries(dec).forEach(([id, d]) => { if (!ids.has(id) && d && d.rec) out.push({ ...d.rec, decisao: d, estado: d.estado === 'adiada' ? 'adiada' : d.estado, historico: true }); });
    const P = MotorRecs.PRIO;
    return out.sort((a, b) => (a.estado === 'pendente' ? 0 : 1) - (b.estado === 'pendente' ? 0 : 1) || P[a.prioridade] - P[b.prioridade]);
  });
}
export const pendentes = () => recomendacoes().filter(r => r.estado === 'pendente');

/* ---------------- registro de aprendizado (recsLog) ---------------- */
export const COL_LOG = 'recsLog';
export function logar(rec, decisao, quem) {
  const e = MotorRecs.registrarDecisao(rec, decisao, quem);
  db.insert(COL_LOG, { ...e, origem: 'campanha', contaId: (conta() || {}).id || null });
  return e.id;
}
/** mede a métrica do alvo nos 7 dias depois da decisão (quando já houver dados) e grava o resultado */
export function avaliarPendentes() {
  const lim = limites(); if (!lim) return 0;
  const pend = MotorRecs.pendentesDeAvaliacao(db.list(COL_LOG, e => e.origem === 'campanha'), new Date());
  let n = 0;
  pend.forEach(e => {
    const dia = String(e.quando).slice(0, 10); const ini = addDias(dia, 1), fim = addDias(dia, 7); if (fim > lim.max) return;
    const chave = { anuncio: 'ad_id', conjunto: 'adset_id', campanha: 'campaign_id' }[e.alvo && e.alvo.nivel];
    const rows = linhas().filter(r => r.date >= ini && r.date <= fim && (!chave || r[chave] === e.alvo.id));
    const ent = e.alvo && entidades().get(e.alvo.campanhaId || e.alvo.id); const m = agregar(rows);
    const tipo = ent ? ent.tipo : null; const d = doTipo(m, tipo);
    const depois = { gasto: m.spend, resultados: tipo ? d.n : m.resultados, custo: tipo ? d.cpr : m.cpr, ctr: m.ctr, cpm: m.cpm, frequencia: m.freq };
    const res = MotorRecs.avaliarResultado(e, depois); if (!res) return;
    db.update(COL_LOG, e.id, { resultado: res }); n++;
  });
  return n;
}
export function estatisticas(dias = 30) {
  return MotorRecs.estatisticas(db.list(COL_LOG), { dias, hoje: new Date(), pendentes: pendentes() });
}

/* ---------------- quebras ---------------- */
export function quebra(tipo, total) {
  const c = conta(); const q = ((c || {}).quebras || {})[tipo]; if (!q || !total.spend) return [];
  const base = q.map(([rot, share, fCpr, fCtr]) => { const spend = total.spend * share; return { rot, spend, bruto: total.resultados ? spend / ((total.cpr || 1) * fCpr) : 0, ctr: total.ctr ? total.ctr * (fCtr || 1) : null }; });
  const soma = base.reduce((a, x) => a + x.bruto, 0) || 1;
  return base.map(x => { const res = (x.bruto / soma) * total.resultados; return { ...x, resultados: res, cpr: res ? x.spend / res : null }; });
}
export { CAMPO_RESULTADO };
