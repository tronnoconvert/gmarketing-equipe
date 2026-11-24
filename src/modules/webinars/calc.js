// calc.js — métricas, status, pendências e permissões dos webinars (funções puras + leitura do db).
import { db } from '../../core/store.js';
import { auth } from '../../core/auth.js';
import { can, veReceita as veReceitaCore } from '../../core/perms.js';

/** dinheiro que entra (faturamento, ticket, ROAS, lucro, reembolsos, pendentes): só quem tem a permissão "receita" */
export const veReceita = () => veReceitaCore();
import * as fmt from '../../core/fmt.js';
import { padrao } from '../../core/padroes/index.js';

/* referências de mercado: mínimo/topo vêm da central "Padrões e regras" (webinars.bench.<k>.min|max) */
const B = (k, min, max, rot) => ({ get min() { return padrao(`webinars.bench.${k}.min`, min); }, get max() { return padrao(`webinars.bench.${k}.max`, max); }, get rot() { return rot(fmt.dec(this.min, this.min % 1 ? 1 : 0), fmt.dec(this.max, this.max % 1 ? 1 : 0)); } });
export const BENCH = {
  ctr: B('ctr', 0.8, 1.5, (a, b) => `CTR ${a}–${b}%`),
  inscricao: B('inscricao', 25, 40, (a, b) => `página ${a}–${b}%`),
  grupo: B('grupo', 50, 70, (a, b) => `grupo ${a}–${b}%`),
  comparecimento: B('comparecimento', 25, 35, (a, b) => `comparecimento ${a}–${b}%`),
  retencao: B('retencao', 50, 65, (a, b) => `retenção até a oferta ${a}–${b}%`),
  checkout: B('checkout', 15, 30, (a, b) => `cliques no checkout ${a}–${b}% de quem viu a oferta`),
  fechamento: B('fechamento', 20, 40, (a, b) => `checkout → venda ${a}–${b}%`),
  convLive: B('convLive', 3, 8, (a, b) => `conversão da live ${a}–${b}%`),
};
export const SECOES = [
  { id: 'planejamento', rotulo: 'Planejamento' }, { id: 'captacao', rotulo: 'Captação' }, { id: 'aovivo', rotulo: 'Ao vivo' },
  { id: 'vendas', rotulo: 'Vendas' }, { id: 'pos', rotulo: 'Pós' },
];
export const CANAIS = { ao_vivo: 'Ao vivo', carrinho: 'Carrinho', replay: 'Replay' };
export const ORIGENS = [['meta', 'Meta Ads'], ['google', 'Google Ads'], ['organico', 'Orgânico'], ['lista', 'Lista de e-mails'], ['indicacao', 'Indicação']];
export const PLATAFORMAS = ['YouTube', 'Zoom', 'StreamYard + YouTube', 'Google Meet', 'Vimeo', 'Outra'];

const n = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const div = (a, b) => (n(a) === null || !n(b) ? null : (Number(a) / Number(b)));
const soma = (l, k) => l.reduce((a, x) => a + (Number(x[k]) || 0), 0);
export const temValor = v => v !== null && v !== undefined && v !== '';

export const hojeISO = () => fmt.iso(new Date());

/** linhas diárias do webinar */
export function diario(id) {
  const l = db.list('webinarDaily', d => d.webinarId === id).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  return { captacao: l.filter(d => d.tipo === 'captacao'), vendas: l.filter(d => d.tipo === 'venda') };
}

/** métricas completas a partir do webinar + linhas (captação diária e vendas por dia) */
export function metricas(w, cap, ven) {
  if (!cap || !ven) { const d = diario(w.id); cap = cap || d.captacao; ven = ven || d.vendas; }
  const av = w.aovivo || {}, vd = w.vendas || {};
  const t = {
    investimento: cap.length ? soma(cap, 'investimento') : null, impressoes: cap.length ? soma(cap, 'impressoes') : null,
    cliques: cap.length ? soma(cap, 'cliques') : null, inscritos: cap.length ? soma(cap, 'inscritos') : null, grupo: cap.length ? soma(cap, 'grupo') : null,
    pico: n(av.pico), presentes: n(av.presentes), naOferta: n(av.naOferta), tempoMedio: n(av.tempoMedio), chat: n(av.chat),
    checkout: n(vd.checkout), reembolsos: n(vd.reembolsos), pendentes: n(vd.pendentes), custos: n(vd.custos),
  };
  const porCanal = { ao_vivo: 0, carrinho: 0, replay: 0 };
  ven.forEach(v => { porCanal[v.canal] = (porCanal[v.canal] || 0) + (Number(v.vendas) || 0); });
  t.vendas = ven.length ? soma(ven, 'vendas') : null;
  t.faturamento = ven.length ? soma(ven, 'faturamento') : null;
  if (n(vd.taxa) && t.faturamento) t.custos = (t.custos || 0) + t.faturamento * (n(vd.taxa) / 100);
  t.porCanal = porCanal;
  const m = {
    ...t,
    cpl: div(t.investimento, t.inscritos),
    ctr: div(t.cliques, t.impressoes) != null ? div(t.cliques, t.impressoes) * 100 : null,
    inscricao: div(t.inscritos, t.cliques) != null ? div(t.inscritos, t.cliques) * 100 : null,
    taxaGrupo: div(t.grupo, t.inscritos) != null ? div(t.grupo, t.inscritos) * 100 : null,
    comparecimento: div(t.presentes, t.inscritos) != null ? div(t.presentes, t.inscritos) * 100 : null,
    retencao: div(t.naOferta, t.pico) != null ? div(t.naOferta, t.pico) * 100 : null,
    convLive: div(t.vendas, t.presentes) != null ? div(t.vendas, t.presentes) * 100 : null,
    convGeral: div(t.vendas, t.inscritos) != null ? div(t.vendas, t.inscritos) * 100 : null,
    cac: div(t.investimento, t.vendas),
    roas: div(t.faturamento, t.investimento),
  };
  m.lucro = t.faturamento == null ? null : t.faturamento - (t.reembolsos || 0) - (t.investimento || 0) - (t.custos || 0);
  return m;
}

/** soma várias métricas (consolidado) */
export function consolidar(lista) {
  const keys = ['investimento', 'impressoes', 'cliques', 'inscritos', 'grupo', 'pico', 'presentes', 'naOferta', 'checkout', 'vendas', 'faturamento', 'reembolsos', 'custos'];
  const t = {}; keys.forEach(k => { t[k] = lista.reduce((a, m) => a + (Number(m[k]) || 0), 0); });
  const r = (a, b) => (b ? a / b : null);
  return {
    ...t, n: lista.length,
    cpl: r(t.investimento, t.inscritos), comparecimento: r(t.presentes, t.inscritos) != null ? r(t.presentes, t.inscritos) * 100 : null,
    retencao: r(t.naOferta, t.pico) != null ? r(t.naOferta, t.pico) * 100 : null, convLive: r(t.vendas, t.presentes) != null ? r(t.vendas, t.presentes) * 100 : null,
    cac: r(t.investimento, t.vendas), convGeral: r(t.vendas, t.inscritos) != null ? r(t.vendas, t.inscritos) * 100 : null,
    roas: r(t.faturamento, t.investimento), lucro: t.faturamento - t.reembolsos - t.investimento - t.custos,
  };
}

/** status: planejado | captacao | aovivo | realizado | encerrado */
export function status(w, cap) {
  const dd = fmt.diasAte(w.data);
  if (dd === null) return 'planejado';
  if (dd > 0) { if (!cap) cap = diario(w.id).captacao; return cap.length ? 'captacao' : 'planejado'; }
  if (dd === 0) return 'aovivo';
  if (dd >= -padrao('webinars.perto.depois', 7)) return 'realizado';
  return 'encerrado';
}
export const STATUS = {
  planejado: { rot: 'Planejado', e: 'off' }, captacao: { rot: 'Captação', e: 'info' }, aovivo: { rot: 'Ao vivo hoje', e: 'warn' },
  realizado: { rot: 'Realizado', e: 'ok' }, encerrado: { rot: 'Encerrado', e: 'off' },
};

/** pendências de preenchimento: [{secao, texto}] */
export function pendencias(w, m) {
  const out = []; const st = status(w); const dd = fmt.diasAte(w.data);
  m = m || metricas(w);
  const plan = [['tema', 'tema'], ['data', 'data'], ['hora', 'horário'], ['oferta', 'oferta'], ...(veReceita() ? [['ticket', 'ticket']] : []), ['metaInscritos', 'meta de inscritos'], ['metaVendas', 'meta de vendas']].filter(([k]) => !temValor(w[k])).map(([, l]) => l);
  if (plan.length) out.push({ secao: 'planejamento', texto: `Planejamento sem ${plan.join(', ')}` });
  if (st === 'captacao') {
    const cap = diario(w.id).captacao; const ult = cap.length ? cap[cap.length - 1].data : null; const sem = ult ? -fmt.diasAte(ult) : null;
    if (sem !== null && sem >= padrao('webinars.captacao.semLancamento', 2)) out.push({ secao: 'captacao', texto: `Captação diária sem lançamento há ${sem} dias (último: ${fmt.dataCurta(ult)})` });
  }
  if (['realizado', 'encerrado', 'aovivo'].includes(st) || (dd !== null && dd < 0)) {
    if (m.inscritos == null) out.push({ secao: 'captacao', texto: 'Captação sem dados' });
    const av = ['pico', 'presentes', 'naOferta'].filter(k => m[k] == null);
    if (av.length && st !== 'aovivo') out.push({ secao: 'aovivo', texto: 'Dados ao vivo incompletos (pico, presentes ou na oferta)' });
    if (st !== 'aovivo') {
      if (m.vendas == null || m.checkout == null) out.push({ secao: 'vendas', texto: 'Vendas sem lançamento' });
      else if (!m.porCanal.replay && dd < -2) out.push({ secao: 'vendas', texto: 'Vendas do replay não lançadas' });
      if (dd <= -3 && (!temValor((w.pos || {}).replayViews) || !temValor((w.pos || {}).nps))) out.push({ secao: 'pos', texto: 'Pós-live sem visualizações do replay e NPS' });
    }
  }
  const atrasados = (w.checklist || []).filter(c => !c.feito && c.prazo && c.prazo < hojeISO());
  if (atrasados.length && st !== 'encerrado') out.push({ secao: 'checklist', texto: `Checklist: ${fmt.plural(atrasados.length, 'item atrasado', 'itens atrasados')} (${atrasados.map(c => c.item).join(', ')})` });
  return out;
}

/** perto da data = live nos próximos 21 dias ou nos últimos 7 */
export function pertoDaData(w) { const dd = fmt.diasAte(w.data); return dd !== null && dd <= padrao('webinars.perto.antes', 21) && dd >= -padrao('webinars.perto.depois', 7); }

/** quem preenche cada seção: team ids */
export function responsaveis(w, secao) {
  const eq = w.equipe || [];
  if (secao === 'checklist') return [...new Set((w.checklist || []).filter(c => !c.feito && c.prazo && c.prazo < hojeISO()).map(c => c.resp))];
  if (secao === 'planejamento') return [w.apresentador].filter(Boolean);
  const r = eq.filter(e => (e.secoes || []).includes(secao)).map(e => e.id);
  return r.length ? r : eq.map(e => e.id);
}
export const userDoTime = tid => { const t = db.get('team', tid); return t ? t.userId : null; };

/* ---------------- permissões ---------------- */
const chefe = u => u && (u.papel === 'dono' || u.papel === 'admin');
export function podeEditar(w) {
  const u = auth.user(); if (!u || !can('webinars', 'editar')) return false;
  if (chefe(u)) return true;
  return !!(w && (w.equipe || []).some(e => e.id === u.teamId) || (w && w.apresentador === u.teamId));
}
export function podeCriar() { const u = auth.user(); return !!u && can('webinars', 'editar') && (chefe(u) || ['head_trafego', 'gestor_trafego', 'cs'].includes(u.papel)); }
export function podeExcluir() { return can('webinars', 'excluir'); }
export function motivoSemEdicao(w) {
  const u = auth.user();
  if (!can('webinars', 'editar')) return 'Seu perfil só pode ver os webinars.';
  if (!podeEditar(w)) return `Só quem está escalado neste webinar pode preencher. Peça a ${nomeTime(w.apresentador) || 'quem organiza'} para incluir você na equipe.`;
  return u ? '' : 'Entre novamente.';
}
export const nomeTime = id => (db.get('team', id) || {}).nome || '';

/** estado do LED vs meta (maior é melhor): ≥100% ok, ≥85% warn, abaixo err */
const tol = () => padrao('webinars.meta.tolerancia', 85) / 100;
export function ledMeta(valor, meta) { if (valor == null || !meta) return 'off'; const r = valor / meta; return r >= 1 ? 'ok' : r >= tol() ? 'warn' : 'err'; }
/** estado vs faixa de referência {min,max} */
export function ledBench(valor, b) { if (valor == null || !b) return 'off'; if (valor >= b.min) return 'ok'; if (valor >= b.min * tol()) return 'warn'; return 'err'; }
