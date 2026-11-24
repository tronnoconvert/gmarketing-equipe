// engine.js — agregação dos dados diários (Windsor) e motor de "Decisões recomendadas" (regras transparentes).
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import { CAMPO_RESULTADO, F_CONVERSA } from './data.js';
import MotorRecs from '../../shared/motor-recs.mjs';
import { padrao } from '../../core/padroes/index.js';

export const TIPOS = {
  lead: { rot: 'Leads', curto: 'leads', um: 'lead', cpr: 'CPL', custo: 'custo por lead' },
  conversa: { rot: 'Conversas', curto: 'conv.', um: 'conversa', cpr: 'Custo/conversa', custo: 'custo por conversa' },
  compra: { rot: 'Compras', curto: 'compras', um: 'compra', cpr: 'CPA', custo: 'custo por compra' },
  engaj: { rot: 'Engajamentos', curto: 'engaj.', um: 'engajamento', cpr: 'Custo/engaj.', custo: 'custo por engajamento' },
};

/* ---------------- cache por versão dos dados ---------------- */
let versao = 0; const cache = new Map();
db.on(col => { if (['campaignDaily', 'campaigns', 'campaignAccount', 'creatives', 'settings', 'recsLog', '*'].includes(col)) { versao++; cache.clear(); } });
const memo = (k, fn) => { const kk = `${versao}:${k}`; if (!cache.has(kk)) cache.set(kk, fn()); return cache.get(kk); };

export const conta = () => db.get('campaignAccount', 'demo') || db.list('campaignAccount')[0] || null;
export const linhas = () => memo('linhas', () => db.list('campaignDaily').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));
export const entidades = () => memo('ent', () => { const m = new Map(); db.list('campaigns').forEach(c => m.set(c.id, c)); return m; });
export const limites = () => memo('lim', () => { const l = linhas(); return l.length ? { min: l[0].date, max: l[l.length - 1].date } : null; });

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
