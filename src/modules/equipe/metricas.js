// metricas.js — indicadores por pessoa e do time (Productive/Float/Harvest/Teamwork/Asana/Scoro), a partir de timeEntries, deliveries, teamStats e clientes.
import { db } from '../../core/store.js';
import { perms } from '../../core/perms.js';
import { padrao } from '../../core/padroes/index.js';
import { addDias, hoje0, isoDia, uteisEntre, CLIENTES_IDS, cliente, FATURAVEIS, aberta, atrasada, diasPara } from '../operacao/base.js';
import { pessoa, stats, ocupacao, capSemanal, entregasNaJanela, pctNoPrazo, semanasAcima } from '../operacao/lib.js';

export const ativosFat = () => FATURAVEIS.map(pessoa).filter(p => p.ativo !== false && p.nome !== 'Sem responsável');
export const media = l => { const v = l.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

export function horasNaJanela(teamId, dias, pred) {
  const ini = isoDia(addDias(-dias));
  return db.list('timeEntries', e => (!teamId || e.teamId === teamId) && e.data >= ini && (!pred || pred(e)));
}
/** clientes sob responsabilidade (respId) */
export function clientesResp(teamId) {
  const db0 = db.list('clients');
  if (db0.length) return db0.filter(c => c.respId === teamId && c.ativo !== false).map(c => cliente(c.id));
  return CLIENTES_IDS.map(cliente).filter(c => c.respId === teamId);
}
/** carteira = clientes em que a pessoa trabalha (teamStats.carteira) + os sob responsabilidade */
export function carteira(teamId) {
  const s = stats(teamId) || {}; const map = new Map();
  (s.carteira || []).forEach(c => map.set(c.clientId, { clientId: c.clientId, horasContratadas: c.horasContratadas }));
  clientesResp(teamId).forEach(c => { if (!map.has(c.id)) map.set(c.id, { clientId: c.id, horasContratadas: null }); });
  const ini = new Date(hoje0().getFullYear(), hoje0().getMonth(), 1); const fimMes = new Date(ini.getFullYear(), ini.getMonth() + 1, 0);
  const passados = uteisEntre(ini, addDias(-1)); const totalMes = uteisEntre(ini, fimMes) || 21;
  const fr = Math.max(passados, 1) / totalMes;
  const iniIso = isoDia(ini);
  return [...map.values()].map(c => {
    const cl = cliente(c.clientId);
    const real = db.list('timeEntries', e => e.teamId === teamId && e.clientId === c.clientId && e.data >= iniIso).reduce((a, e) => a + e.horas, 0);
    const prop = c.horasContratadas != null ? c.horasContratadas * fr : null;
    const ratio = prop ? (real / prop) * 100 : null;
    return { ...c, cliente: cl, resp: cl.respId === teamId, real, prop, ratio, estado: ratio == null ? 'off' : ratio > padrao('equipe.overservicing.critico', 130) ? 'err' : ratio > padrao('equipe.overservicing.atencao', 110) ? 'warn' : 'ok' };
  }).sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1));
}

/** indicadores de uma pessoa (janela de 4 semanas para horas/fluxo; 12 semanas para qualidade) */
export function metricas(teamId) {
  const cap = capSemanal(teamId);
  const h4 = horasNaJanela(teamId, 28); const tot = h4.reduce((a, e) => a + e.horas, 0), fat = h4.filter(e => e.faturavel).reduce((a, e) => a + e.horas, 0);
  const p = pessoa(teamId); const ferias = p.status === 'ferias' ? 7 : 0; // dias úteis de férias na janela (aprox.)
  const capJ = cap * 4 * ((20 - Math.min(ferias, 20)) / 20) || cap * 4;
  const ent12 = entregasNaJanela(83, 0, d => d.respId === teamId);
  const ent4 = entregasNaJanela(27, 0, d => d.respId === teamId);
  const semReun = ent12.filter(d => d.tipo !== 'reuniao');
  const lead = media(ent12.map(d => (new Date(d.entregueEm) - new Date(d.criadaEm)) / 864e5));
  const aprovaveis = semReun.filter(d => d.aprovacaoH != null);
  const cr = clientesResp(teamId); const cart = carteira(teamId);
  const base = cr.length ? cr : cart.map(c => c.cliente);
  const s = stats(teamId) || {};
  return {
    teamId, ocupacao: ocupacao(teamId), semanasAcima: semanasAcima(teamId),
    util: (tot / capJ) * 100, utilFat: (fat / capJ) * 100, horas4: tot, fat4: fat,
    noPrazo: pctNoPrazo(ent12), noPrazo4: pctNoPrazo(ent4), entregas12: ent12.length,
    throughput: ent4.length / 4, lead,
    retrabalho: semReun.length ? (semReun.reduce((a, d) => a + (d.ajustes || 0), 0) / semReun.length) * 100 : null,
    primeira: aprovaveis.length ? (aprovaveis.filter(d => !d.ajustes).length / aprovaveis.length) * 100 : null,
    sla: s.sla ? s.sla.mediaH : null, slaDentro: s.sla ? s.sla.dentroPct : null,
    mrr: cr.reduce((a, c) => a + (c.mrr || 0), 0), nResp: cr.length, nCarteira: cart.length,
    health: media(base.map(c => c.health)), roas: p.area === 'Tráfego' ? media(base.map(c => c.roas)) : null,
    abertas: db.count('tasks', t => t.respId === teamId && aberta(t)), atrasadas: db.count('tasks', t => t.respId === teamId && atrasada(t)),
    semana: entregasNaJanela(6, 0, d => d.respId === teamId).length,
  };
}
export function metricasTime() {
  const ppl = ativosFat(); const ms = ppl.map(p => metricas(p.id));
  return { ppl, ms, por: Object.fromEntries(ms.map(m => [m.teamId, m])) };
}
/** faixa do time para um indicador: {min, max, media} */
export function faixaTime(ms, k) { const v = ms.map(m => m[k]).filter(x => x != null && !isNaN(x)); if (!v.length) return null; return { min: Math.min(...v), max: Math.max(...v), media: media(v) }; }
export function mrrTotal() { const l = db.list('clients', c => c.ativo !== false && c.mrr); return l.length ? l.reduce((a, c) => a + Number(c.mrr || 0), 0) : 186400; }
/** pessoas que veem só o próprio perfil */
export const soProprio = user => perms.escopo('equipe', user) === 'proprio';
export { diasPara };
