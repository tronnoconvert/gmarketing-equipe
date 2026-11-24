// perms.js — papéis, matriz de permissões (PLAN §5) e escopo de clientes.
// Valor de cada célula: '' (sem acesso) | 'ver' | 'editar' | 'admin', com escopo opcional ':seus' | ':proprio'.
import { db } from './store.js';
import { auth } from './auth.js';

export const PAPEIS = {
  dono: { rotulo: 'Dono', desc: 'Acesso total, inclusive Campanha (conta própria) e "Ver como".' },
  admin: { rotulo: 'Administrador', desc: 'Sócia(o) administrador(a): mesmo acesso do Dono (Campanha, receita, "Ver como"), usuários, permissões e cadastros.' },
  head_trafego: { rotulo: 'Head de tráfego', desc: 'Tudo do gestor de tráfego em todas as contas (clientes, Torre e Painel de Voo) + edita a central Padrões e regras.' },
  gestor_trafego: { rotulo: 'Gestor de tráfego', desc: 'Edita os próprios clientes, operação, Torre e Painel de Voo das suas contas.' },
  cs: { rotulo: 'Atendimento (CS)', desc: 'Edita os próprios clientes, operação e webinars; vê a Torre.' },
  producao: { rotulo: 'Produção', desc: 'Social, design, copy e dev: vê os próprios clientes e edita as suas tarefas.' },
  financeiro: { rotulo: 'Financeiro', desc: 'Edita o Financeiro; vê Cockpit, clientes, equipe e comercial.' },
  comercial: { rotulo: 'Comercial', desc: 'Edita o Comercial (pipeline e propostas); vê clientes.' },
  leitura: { rotulo: 'Somente leitura', desc: 'Vê os painéis principais, sem editar nada.' },
};
export const PAPEIS_ORDEM = Object.keys(PAPEIS);

export const MODULOS_PERM = [
  { id: 'mesa', rotulo: 'Minha mesa' }, { id: 'cockpit', rotulo: 'Cockpit' }, { id: 'financeiro', rotulo: 'Financeiro' }, { id: 'clientes', rotulo: 'Clientes' },
  { id: 'operacao', rotulo: 'Operação' }, { id: 'equipe', rotulo: 'Equipe' }, { id: 'torre', rotulo: 'Torre › Rotinas e integrações' },
  { id: 'torre_voo', rotulo: 'Torre › Painel de Voo' }, { id: 'comercial', rotulo: 'Comercial' }, { id: 'alertas', rotulo: 'Alertas e Insights' },
  { id: 'webinars', rotulo: 'Webinars' }, { id: 'campanha', rotulo: 'Campanha (conta própria)' }, { id: 'notificacoes', rotulo: 'Notificações' },
  { id: 'admin', rotulo: 'Administração' },
  { id: 'receita', rotulo: 'Receita e faturamento (MRR, faturamento, ROAS, lucro)' },
  { id: 'padroes', rotulo: 'Padrões e regras (como a plataforma decide)' },
];

// colunas: dono, admin, head_trafego, gestor_trafego, cs, producao, financeiro, comercial, leitura
// Regra permanente do dono: "visível para mim" = Dono + Admin (Rayane Leão, sócia) — o que é só do dono vale igual para o admin.
const L = (...v) => Object.fromEntries(PAPEIS_ORDEM.map((p, i) => [p, v[i] || '']));
export const MATRIZ_PADRAO = {
  mesa: L('editar', 'editar', 'editar', 'editar', 'editar', 'editar', 'editar', 'editar', 'ver'),
  cockpit: L('admin', 'editar', '', '', '', '', '', '', ''),
  financeiro: L('admin', 'editar', '', '', '', '', '', '', ''),
  clientes: L('admin', 'editar', 'editar', 'editar:seus', 'editar:seus', 'ver:seus', 'ver', 'ver', 'ver'),
  operacao: L('admin', 'editar', 'editar', 'editar', 'editar', 'editar:seus', '', '', 'ver'),
  equipe: L('admin', 'editar', 'ver:proprio', 'ver:proprio', 'ver:proprio', 'ver:proprio', 'ver', 'ver:proprio', ''),
  torre: L('admin', 'editar', 'editar', 'ver', 'ver', '', '', '', 'ver'),
  torre_voo: L('admin', 'editar', 'editar', 'editar:seus', 'ver', '', '', '', 'ver'),
  comercial: L('admin', 'editar', '', '', '', '', 'ver', 'editar', ''),
  alertas: L('admin', 'editar', 'ver', 'ver:seus', 'ver:seus', 'ver:seus', 'ver:seus', 'ver:seus', 'ver'),
  webinars: L('admin', 'editar', 'editar', 'editar', 'editar', 'editar:seus', 'ver', 'ver', 'ver'),
  campanha: L('admin', 'admin', '', '', '', '', '', '', ''),
  notificacoes: L('editar', 'editar', 'editar', 'editar', 'editar', 'editar', 'editar', 'editar', 'ver'),
  admin: L('admin', 'editar', '', '', '', '', '', '', ''),
  // dinheiro que entra (MRR, faturamento, receita, ticket, ROAS, lucro): só Dono e Admin por padrão. Custos e volumes continuam visíveis.
  receita: L('admin', 'admin', '', '', '', '', '', '', ''),
  // central "Padrões e regras": Dono, Admin e Head de tráfego editam; os demais papéis não veem
  padroes: L('admin', 'editar', 'editar', '', '', '', '', '', ''),
};
export const NIVEIS = { '': 0, ver: 1, editar: 2, admin: 4 };
const ACOES = { ver: 1, editar: 2, excluir: 3, admin: 4 };
export const NIVEL_ROTULO = { '': 'Sem acesso', ver: 'Ver', editar: 'Editar', admin: 'Total' };
export const ESCOPO_ROTULO = { todos: '', seus: 'só os seus', proprio: 'só o próprio' };

/** matriz efetiva (padrão + alterações salvas em settings 'perms') */
export function matriz() {
  const salvo = db.config('perms', {}) || {};
  const m = {};
  for (const mod of Object.keys(MATRIZ_PADRAO)) m[mod] = Object.assign({}, MATRIZ_PADRAO[mod], salvo[mod] || {});
  for (const mod of Object.keys(salvo)) if (!m[mod]) m[mod] = Object.assign({}, salvo[mod]);
  return m;
}
/** salva a matriz inteira (ou parcial) — usado por Administração › Permissões */
export function salvarMatriz(m, opts = { log: 'alterou permissões' }) { return db.setConfig('perms', m, opts); }
export function restaurarPadrao() { return db.setConfig('perms', {}, { log: 'restaurou permissões padrão' }); }

function celula(mod, user) {
  user = user === undefined ? auth.user() : user;
  if (!user) return { nivel: '', escopo: 'todos' };
  const v = (matriz()[mod] || {})[user.papel] || '';
  const [nivel, escopo] = String(v).split(':');
  return { nivel: nivel || '', escopo: escopo || 'todos' };
}
/** nível no módulo: '' | 'ver' | 'editar' | 'admin' */
export function nivel(mod, user) { return celula(mod, user).nivel; }
/** escopo no módulo: 'todos' | 'seus' | 'proprio' */
export function escopo(mod, user) { return celula(mod, user).escopo; }

/**
 * can(modulo, acao='ver') -> bool. Ações: ver, editar, excluir, admin.
 * 'excluir' exige nível 'admin' no módulo, ou papel dono/admin com nível 'editar'.
 */
export function can(mod, acao = 'ver', user) {
  user = user === undefined ? auth.user() : user;
  if (!user) return false;
  const { nivel: n } = celula(mod, user);
  const r = NIVEIS[n] || 0, need = ACOES[acao] || 1;
  if (acao === 'excluir') return r >= 4 || (r >= 2 && (user.papel === 'dono' || user.papel === 'admin'));
  return r >= need;
}

/** 'todos' ou array de clientIds sob responsabilidade do usuário (clients.respId === teamId ou clients.equipe inclui teamId) */
export function escopoClientes(user) {
  user = user === undefined ? auth.user() : user;
  if (!user) return [];
  const limitado = ['gestor_trafego', 'cs', 'producao'].includes(user.papel) || escopo('clientes', user) === 'seus';
  if (!limitado) return 'todos';
  const t = user.teamId;
  return db.list('clients', c => c.respId === t || (Array.isArray(c.equipe) && c.equipe.includes(t))).map(c => c.id);
}
/** true se o usuário pode ver o cliente */
export function podeCliente(clientId, user) { const e = escopoClientes(user); return e === 'todos' || e.includes(clientId); }
/** filtra uma lista de objetos com clientId (ou id, para clients) pelo escopo */
export function filtrarPorEscopo(lista, campo = 'clientId', user) { const e = escopoClientes(user); return e === 'todos' ? lista : lista.filter(o => e.includes(o[campo])); }
/** pode ver dinheiro que entra (MRR, faturamento, receita, ticket, ROAS, lucro)? */
export function veReceita(user) { return can('receita', 'ver', user); }
export function rotuloPapel(p) { return (PAPEIS[p] || {}).rotulo || p; }

export const perms = { PAPEIS, PAPEIS_ORDEM, MODULOS_PERM, MATRIZ_PADRAO, NIVEL_ROTULO, ESCOPO_ROTULO, matriz, salvarMatriz, restaurarPadrao, nivel, escopo, can, escopoClientes, podeCliente, filtrarPorEscopo, rotuloPapel, veReceita };
export default perms;
