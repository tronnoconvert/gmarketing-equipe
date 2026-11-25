// base.js — utilitários compartilhados por Operação e Equipe (datas relativas, clientes canônicos, tipos de tarefa).
import { db } from '../../core/store.js';

/* ---------------- datas (sempre relativas a hoje, para o demo não "envelhecer") ---------------- */
export const p2 = n => String(n).padStart(2, '0');
export function hoje0() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
export function isoDia(d) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
export function addDias(n, base) { const d = base ? new Date(base) : hoje0(); d.setDate(d.getDate() + n); return d; }
export const diaRel = n => isoDia(addDias(n));
export function dataDe(iso) { if (!iso) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); } return new Date(iso); }
/** dias corridos de hoje até a data (positivo = futuro) */
export function diasPara(iso) { const d = dataDe(iso); if (!d) return null; const x = new Date(d); x.setHours(0, 0, 0, 0); return Math.round((x - hoje0()) / 864e5); }
export const ehUtil = d => d.getDay() !== 0 && d.getDay() !== 6;
/** próximos n dias úteis a partir de hoje (inclui hoje se útil) */
export function proximosUteis(n, base) { const out = []; const d = base ? new Date(base) : hoje0(); while (out.length < n) { if (ehUtil(d)) out.push(new Date(d)); d.setDate(d.getDate() + 1); } return out; }
export function uteisEntre(a, b) { let n = 0; const d = new Date(a); d.setHours(0, 0, 0, 0); const f = new Date(b); f.setHours(0, 0, 0, 0); while (d <= f) { if (ehUtil(d)) n++; d.setDate(d.getDate() + 1); } return n; }
/** segunda-feira da semana de d */
export function segunda(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); const k = (x.getDay() + 6) % 7; x.setDate(x.getDate() - k); return x; }
/** volta o dia para o útil anterior se cair no fim de semana */
export function utilAntes(d) { const x = new Date(d); while (!ehUtil(x)) x.setDate(x.getDate() - 1); return x; }
export function utilDepois(d) { const x = new Date(d); while (!ehUtil(x)) x.setDate(x.getDate() + 1); return x; }
/** número da semana ISO */
export function semanaIso(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); }

/* ---------------- aleatório determinístico ---------------- */
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------------- clientes canônicos (fallback se o módulo Clientes ainda não semeou) ---------------- */
export const CLIENTES_BASE = {
  'c-orion': { nome: 'Grupo Orion', seg: 'Varejo', mrr: 14200, health: 41, respId: 't-ana', nps: 20, roas: 1.8 },
  'c-vida': { nome: 'Clínica Vida', seg: 'Saúde', mrr: 12800, health: 88, respId: 't-bruno', nps: 80, roas: 4.1 },
  'c-alfa': { nome: 'Construtora Alfa', seg: 'Construção', mrr: 11500, health: 82, respId: 't-ana', nps: 70, roas: 3.4 },
  'c-technova': { nome: 'TechNova', seg: 'Tecnologia', mrr: 9700, health: 63, respId: 't-bruno', nps: 40, roas: null },
  'c-imob': { nome: 'Imob Prime', seg: 'Imobiliário', mrr: 8900, health: 79, respId: 't-diego', nps: 70, roas: 3.1 },
  'c-bella': { nome: 'Bella Moda', seg: 'Moda', mrr: 6800, health: 48, respId: 't-bruno', nps: 30, roas: 2.2 },
  'c-studiofit': { nome: 'Studio Fit', seg: 'Fitness', mrr: 6100, health: 85, respId: 't-diego', nps: 80, roas: null },
  'c-autocenter': { nome: 'Auto Center Sul', seg: 'Automotivo', mrr: 5600, health: 66, respId: 't-ana', nps: 50, roas: 2.6 },
  'c-petfeliz': { nome: 'Pet Feliz', seg: 'Pet', mrr: 4900, health: 90, respId: 't-diego', nps: 90, roas: 4.4 },
  'c-otica': { nome: 'Ótica Visão', seg: 'Ótica', mrr: 4200, health: 77, respId: 't-diego', nps: 60, roas: 3.0 },
  'c-cafe': { nome: 'Café Raiz', seg: 'Alimentação', mrr: 3400, health: 61, respId: 't-bruno', nps: 50, roas: null },
};
export const CLIENTES_IDS = Object.keys(CLIENTES_BASE);
/** dados do cliente: registro real do db (módulo Clientes) com fallback para os canônicos */
export function cliente(id) {
  if (!id) return { id: null, nome: 'Interno', interno: true };
  const c = db.get('clients', id); const b = (db.dadosDemo && CLIENTES_BASE[id]) || {}; // canônicos só no modo demonstração
  if (!c) return { id, ...b, nome: b.nome || id };
  return { ...b, ...c, nome: c.nome || c.nomeFantasia || b.nome || id, health: c.health ?? c.healthScore ?? b.health, mrr: c.mrr ?? b.mrr, respId: c.respId || b.respId, nps: c.nps ?? b.nps, roas: c.roas ?? b.roas };
}
export const nomeCliente = id => cliente(id).nome;
/** lista de clientes ativos para selects (db se houver, senão canônicos) */
export function listaClientes() {
  const l = db.list('clients', c => c.ativo !== false && c.status !== 'inativo' && c.status !== 'churn');
  if (l.length || !db.dadosDemo) return l.map(c => cliente(c.id)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return CLIENTES_IDS.map(cliente).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* ---------------- tarefas ---------------- */
export const COLUNAS = [
  { id: 'afazer', rotulo: 'A fazer' }, { id: 'andamento', rotulo: 'Em andamento' }, { id: 'aprovacao', rotulo: 'Em aprovação' }, { id: 'feito', rotulo: 'Feito' },
];
export const ROT_STATUS = Object.fromEntries(COLUNAS.map(c => [c.id, c.rotulo]));
export const TIPOS = {
  criativo: { rotulo: 'Criativo', skills: ['Design', 'Criativos', 'Motion'] },
  campanha: { rotulo: 'Campanha', skills: ['Meta Ads', 'Google Ads', 'Análise de dados'] },
  post: { rotulo: 'Post / social', skills: ['Social media', 'Planejamento'] },
  copy: { rotulo: 'Copy', skills: ['Copy', 'E-mail', 'Roteiros'] },
  site: { rotulo: 'Site / dev', skills: ['Sites', 'Integrações', 'CRM'] },
  relatorio: { rotulo: 'Relatório', skills: ['Análise de dados', 'Atendimento', 'CS', 'Planejamento'] },
  reuniao: { rotulo: 'Reunião / CS', skills: ['Atendimento', 'CS', 'Onboarding'] },
};
export const rotTipo = t => (TIPOS[t] || { rotulo: t || '—' }).rotulo;
// pessoas que trabalham em clientes. Demonstração: a equipe de exemplo. Produção: lista VIVA do cadastro (team.faturavel,
// marcado em Administração › Equipe) — um Proxy relê o db a cada acesso, então .map/.includes/.filter/.length continuam valendo.
const FAT_DEMO = ['t-ana', 't-bruno', 't-felipe', 't-carla', 't-diego', 't-elisa'];
const fatReal = () => db.list('team', t => t.ativo !== false && t.faturavel).map(t => t.id);
export const FATURAVEIS = db.dadosDemo ? FAT_DEMO : new Proxy([], {
  get(_, k) { const a = fatReal(); const v = a[k]; return typeof v === 'function' ? v.bind(a) : v; },
  has(_, k) { return k in fatReal(); },
});
export const aberta = t => t.status !== 'feito';
export const atrasada = t => aberta(t) && t.prazo && diasPara(t.prazo) < 0;
export const venceHoje = t => aberta(t) && t.prazo && diasPara(t.prazo) === 0;
