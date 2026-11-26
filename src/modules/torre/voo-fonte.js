// voo-fonte.js — Painel de Voo: de onde vêm os dados e como as ações vão para o Meta.
//  - Produção (db.mode 'supabase'): Edge Function voo-dados (visão geral pelo cache do servidor, no máximo 5 min; detalhe do
//    cliente AO VIVO, sem cache) e voo-acao (pausar / orçamento, com SIM obrigatório, sem limite por hora, auditoria no servidor).
//  - Demonstração (testes, Protótipo Oficial): dados fictícios de voo-demo.js, com as mesmas regras simuladas aqui
//    (escopo, receita, limite por hora, atraso do Meta/Windsor para confirmar a ação).
// Frescor (regra do dono): o detalhe do cliente sempre busca ao vivo ao abrir, atualiza a cada 2 min com a aba visível,
// tem "Atualizar agora" (mínimo de 20 s entre buscas) e, depois de cada ação, busca de novo e mostra o valor aplicado
// como "aplicado — aguardando confirmação do Meta" até a busca confirmar.
import { db } from '../../core/store.js';
import { auth } from '../../core/auth.js';
import { perms } from '../../core/perms.js';
import { gerarDemo } from './voo-demo.js';

export const AUTO_MS = 120000;      // detalhe aberto: busca ao vivo a cada 2 min (aba visível)
export const VIVO_MIN_MS = 20000;   // "Atualizar agora": no mínimo 20 s entre buscas da mesma conta
export const GERAL_TTL_MS = 5 * 60000;
const PENDENTE_MAX_MS = 30 * 60000;

const est = {
  geral: null, geralEm: 0, carregandoGeral: false, erroGeral: null,
  contas: new Map(),       // contaId → {pac, em (iso), carregando, erro, proxima (ms)}
  pendentes: new Map(),    // objId → {st?, orc?, quando, conta, rotulo}
  ouvintes: new Set(),
};
export const estado = est;
export function ouvir(fn) { est.ouvintes.add(fn); return () => est.ouvintes.delete(fn); }
// avisa fora da pilha atual (o ouvinte re-renderiza a página, que se inscreve de novo) e junta avisos seguidos
let avisoAgendado = false;
const avisar = () => { if (avisoAgendado) return; avisoAgendado = true; setTimeout(() => { avisoAgendado = false; [...est.ouvintes].forEach(f => { try { f(); } catch (e) { console.error(e); } }); }, 0); };
const demo = () => db.mode !== 'supabase';

/* ------------------------------------------------------------------ demonstração */
const DEMO_KEY = 'aos-voo-demo';
let demoBase = null;
const demoEst = { mut: {}, mudancas: {} }; // mut: objId → {st?, orc?, visivelEm}; mudancas: objId → [ms]
try { const s = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); if (s && s.mut) Object.assign(demoEst, s); } catch (e) { /* sem storage */ }
const salvarDemo = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(demoEst)); } catch (e) { /* sem storage */ } };
/** atraso simulado do Meta/Windsor para mostrar a alteração (ms) — testes podem mudar via window.AOS_VOO_ATRASO */
const atrasoDemo = () => (typeof window !== 'undefined' && window.AOS_VOO_ATRASO != null ? window.AOS_VOO_ATRASO : 3000);
export function demoReset() { demoBase = null; demoEst.mut = {}; demoEst.mudancas = {}; est.geral = null; est.contas.clear(); est.pendentes.clear(); salvarDemo(); avisar(); }
function pacoteDemo(soConta) {
  if (!demoBase) demoBase = gerarDemo(new Date());
  const b = JSON.parse(JSON.stringify(demoBase));
  const agora = Date.now();
  for (const [id, m] of Object.entries(demoEst.mut)) if (m.novaCamp && !b.camps[id]) b.camps[id] = m.novaCamp;
  for (const [id, m] of Object.entries(demoEst.mut)) {
    if (m.visivelEm > agora) continue;
    const x = b.camps[id] || b.sets[id] || b.ads[id]; if (!x) continue;
    if (m.st) x.st = m.st;
    if (m.orc != null) x.orc = m.orc;
  }
  // escopo e receita como o servidor faz
  const clientes = db.list('clients');
  const ligada = new Map(); clientes.forEach(c => (c.metaContas || []).forEach(a => ligada.set(String(a).replace(/\D/g, ''), c)));
  const esc = perms.escopoClientes();
  // gestor de tráfego: todas as contas VINCULADAS a cliente; sem cliente só Dono/Admin/Head
  const soVinc = esc === 'todos' && !['dono', 'admin', 'head_trafego'].includes((auth.user() || {}).papel);
  const ok = id => (esc === 'todos' ? (!soVinc || ligada.has(id)) : (ligada.has(id) && esc.includes(ligada.get(id).id))) && (!soConta || id === soConta);
  b.contas = b.contas.filter(c => ok(c.id)).map(c => ({ ...c, clientId: ligada.has(c.id) ? ligada.get(c.id).id : null }));
  const cs = new Set(Object.keys(b.camps).filter(id => ok(String(b.camps[id].c))));
  for (const k of Object.keys(b.camps)) if (!cs.has(k)) delete b.camps[k];
  for (const k of Object.keys(b.sets)) if (!cs.has(String(b.sets[k].c))) delete b.sets[k];
  for (const k of Object.keys(b.ads)) if (!b.sets[String(b.ads[k].s)]) delete b.ads[k];
  b.linhas = b.linhas.filter(l => b.ads[String(l[1])]);
  b.veReceita = perms.veReceita(); if (!b.veReceita) b.linhas.forEach(l => { l[10] = null; });
  b.escopo = esc === 'todos' ? 'todos' : 'seus';
  const hora = agora - 36e5; b.mudancasHora = {};
  for (const [id, l] of Object.entries(demoEst.mudancas)) { const x = l.filter(t => t > hora); if (x.length) b.mudancasHora[id] = x.map(t => new Date(t).toISOString()); }
  const semToken = typeof localStorage !== 'undefined' && (() => { try { return localStorage.getItem('aos-voo-demo-semtoken') === '1'; } catch (e) { return false; } })();
  b.acoes = { configurado: !semToken };
  return b;
}
const espera = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------------ chamadas ao servidor */
async function invocar(nome, body) {
  const { data, error } = await db.supabase.functions.invoke(nome, { body });
  if (error) {
    let msg = 'Não foi possível falar com o servidor. Confira a internet e tente de novo.'; let codigo = 'rede';
    try { const j = await error.context.json(); if (j && j.erro) { msg = j.erro; codigo = j.codigo || codigo; } } catch (e) { /* sem corpo */ }
    const err = new Error(msg); err.codigo = codigo; throw err;
  }
  return data;
}

/* ------------------------------------------------------------------ visão geral */
export function precisaGeral() { return !est.geral || Date.now() - est.geralEm > GERAL_TTL_MS; }
export async function carregarGeral(o = {}) {
  if (est.carregandoGeral) return;
  est.carregandoGeral = true; est.erroGeral = null; avisar();
  try {
    if (demo()) { await espera(o.rapido ? 0 : 250); est.geral = pacoteDemo(); }
    else {
      const r = await invocar('voo-dados', { acao: o.forcar ? 'atualizar' : 'ler' });
      est.geral = r;
      if (r && (r.carregando || r.atualizando)) setTimeout(() => { if (est.ouvintes.size) carregarGeral({}); }, r.carregando ? 15000 : 30000);
    }
    est.geralEm = Date.now();
  } catch (e) { est.erroGeral = e.message || String(e); }
  finally { est.carregandoGeral = false; avisar(); }
}

/* ------------------------------------------------------------------ detalhe do cliente (sempre ao vivo) */
export function infoConta(id) { return est.contas.get(id) || null; }
export async function carregarConta(id, o = {}) {
  const atual = est.contas.get(id) || {};
  if (atual.carregando) return;
  if (!o.forcar && atual.proxima && Date.now() < atual.proxima && atual.pac) return; // respeita os 20 s
  est.contas.set(id, { ...atual, carregando: true, erro: null }); avisar();
  try {
    let pac;
    if (demo()) { await espera(o.rapido ? 0 : 450); pac = { ...pacoteDemo(id), atualizadoEm: new Date().toISOString(), fonte: 'vivo' }; }
    else pac = await invocar('voo-dados', { acao: 'conta', conta: id });
    resolverPendentes(id, pac);
    est.contas.set(id, { pac, em: pac.atualizadoEm, carregando: false, erro: null, proxima: Date.now() + VIVO_MIN_MS, fonte: pac.fonte });
  } catch (e) {
    est.contas.set(id, { ...atual, carregando: false, erro: e.message || String(e) });
  }
  avisar();
}
/** a busca confirmou o valor aplicado? então tira o "aguardando confirmação" */
function resolverPendentes(conta, pac) {
  const agora = Date.now();
  for (const [id, p] of est.pendentes) {
    if (p.conta !== conta) continue;
    const x = (pac.camps || {})[id] || (pac.sets || {})[id] || (pac.ads || {})[id];
    const ok = x && (p.st == null || x.st === p.st) && (p.orc == null || Math.abs((x.orc || 0) - p.orc) < 0.005);
    if (ok || agora - p.quando > PENDENTE_MAX_MS) est.pendentes.delete(id);
  }
}

/** pacote usado no detalhe: o ao vivo da conta (se houver) ou o recorte da visão geral */
export function pacoteDaConta(id) {
  const c = est.contas.get(id); if (c && c.pac) return c.pac;
  return null;
}

/* ------------------------------------------------------------------ ações no Meta */
export const acoesConfiguradas = () => { const g = est.geral || [...est.contas.values()].map(x => x.pac).find(Boolean); return !!(g && g.acoes && g.acoes.configurado); };
export function mudancasNaHora(objId, pac) {
  const l = ((pac && pac.mudancasHora) || (est.geral && est.geral.mudancasHora) || {})[objId] || [];
  return l.map(t => Date.parse(t)).filter(t => Date.now() - t < 36e5).sort();
}

/**
 * envia a ação (já confirmada com SIM na tela). a = {acao:'pausar'|'orcamento', nivel, id, conta, valor?, via?}
 * @returns {ok, quando, antes, depois} — lança Error com mensagem pt-BR
 */
export async function executarAcao(a) {
  if (auth.vendoComo()) { const e = new Error('"Ver como" é só visualização: nenhuma ação no Meta.'); e.codigo = 'ver_como'; throw e; }
  let r;
  if (demo()) {
    await espera(500);
    if (!acoesConfiguradas()) { const e = new Error('Ações no Meta aguardando o token do usuário do sistema — peça ao administrador.'); e.codigo = 'nao_configurado'; throw e; }
    if (a.acao === 'orcamento') {
      const l = (demoEst.mudancas[a.id] || []).filter(t => Date.now() - t < 36e5);
      demoEst.mudancas[a.id] = [...l, Date.now()];
    }
    demoEst.mut[a.id] = { ...(demoEst.mut[a.id] || {}), ...(a.acao === 'pausar' ? { st: 'PAUSED' } : { orc: a.valor }), visivelEm: Date.now() + atrasoDemo() };
    salvarDemo();
    r = { ok: true, quando: new Date().toISOString() };
  } else {
    r = await invocar('voo-acao', { ...a, confirmacao: 'SIM', vendoComo: false });
  }
  est.pendentes.set(a.id, { ...(a.acao === 'pausar' ? { st: 'PAUSED' } : { orc: a.valor }), quando: Date.now(), conta: a.conta });
  if (est.geral && est.geral.mudancasHora && a.acao === 'orcamento') (est.geral.mudancasHora[a.id] ||= []).push(new Date().toISOString());
  const info = est.contas.get(a.conta); if (info && info.pac && a.acao === 'orcamento') ((info.pac.mudancasHora ||= {})[a.id] ||= []).push(new Date().toISOString());
  avisar();
  // busca de novo AO VIVO para refletir o novo status/orçamento
  carregarConta(a.conta, { forcar: true });
  return r;
}

/* ------------------------------------------------------------------ Guardião (demonstração): estrutura mexida pelo "invasor" */
/** demonstração/testes: o Meta/Windsor "confirma" agora tudo o que foi aplicado */
export function demoConfirmarTudo() { Object.values(demoEst.mut).forEach(m => { m.visivelEm = 0; }); salvarDemo(); }
export function demoMutar(id, m) { if (!demo()) return; demoEst.mut[id] = { ...(demoEst.mut[id] || {}), ...m, visivelEm: 0 }; salvarDemo(); }
export function demoNovaCampanha(id, camp) { if (!demo()) return; demoEst.mut[id] = { novaCamp: camp, visivelEm: 0 }; salvarDemo(); }
export function demoAtualizarTudo() { est.geral = demo() ? pacoteDemo() : est.geral; for (const id of est.contas.keys()) { const c = est.contas.get(id); if (c && c.pac && demo()) est.contas.set(id, { ...c, pac: { ...pacoteDemo(id), atualizadoEm: new Date().toISOString(), fonte: 'vivo' } }); } avisar(); }
