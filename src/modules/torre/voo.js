// voo.js — Torre › Painel de Voo: a Torre de Controle (public/torre/*.html) embutida em iframe no modo ?embed=1.
// O iframe fica FORA do #view (posicionado sobre um espaço reservado na página) para não recarregar a cada
// re-render do shell (troca de tema, período, dados): o tema vai por postMessage e o estado da Torre se mantém.
// Host → Torre: tema, equipe, motorRegras, padroes (central "Padrões e regras"), usuario, guardiaoRegras/Sync/Liberar.
// A Torre conversa com o app por postMessage: pedidoCriativo / clienteAvisado → tarefa na Operação, notificação e registro no cliente.
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import { ui } from '../../core/ui.js';
import { notify } from '../../core/notify.js';
import { auth } from '../../core/auth.js';
import { invasao } from '../../core/invasao.js';
import { situacaoSemana } from '../mesa/relatorios.js';
import { valores as padroesValores } from '../../core/padroes/index.js';

const SRC = 'torre/torre-controle.html';
const SRC_ESCURO = 'torre/torre-controle-escuro.html';
const CRIATIVOS = ['t-carla', 't-elisa']; // quem produz criativo (design e copy)
const temaAtual = () => (document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro');
const srcEmbed = t => `${SRC}?embed=1&tema=${t}`;

let host = null;       // {wrap, frame, carregado}
let verificado = null; // null | 'ok' | 'falhou'
const pedidos = new Map(); // ref -> {taskId, notifIds, acaoId}

/* ---------------- página ---------------- */
export function renderVoo(ctx) {
  const { ui: u } = ctx;
  const abrir = `<a class="btn sm m-torre-voo-ext" href="${temaAtual() === 'escuro' ? SRC_ESCURO : SRC}" target="_blank" rel="noopener">${u.ic('ext')}Abrir em nova aba</a>`;
  return `<div class="pg m-torre-voo">${u.cabecalho({ titulo: 'Painel de Voo', sub: 'Gestão das contas Meta Ads (Torre de Controle). Alertas e notificações chegam pelo sino do app.', acoes: abrir })}
${faixaRelatorio(ctx)}<div class="m-torre-voo-slot" data-voo-slot aria-busy="true">${u.skeleton({ linhas: 6 })}</div></div>`;
}

/** "Mostrar no visor dele": faixa compacta para o gestor de tráfego, de terça até enviar todos os relatórios da semana */
export function faixaRelatorio(ctx) {
  const s = situacaoSemana(ctx.user);
  if (!s.ativo || !s.pendentes.length) return '';
  const atraso = s.momento === 'depois'; const pct = s.total ? (s.enviados / s.total) * 100 : 0;
  const titulo = atraso ? 'Relatórios da semana atrasados' : 'Terça é dia de relatório';
  return `<div class="m-torre-rel${atraso ? ' atraso' : ''}" data-voo-rel role="status">
<span class="m-torre-rel-i">${ui.ic('file')}</span>
<div class="m-torre-rel-t"><b>${titulo}</b><span aria-hidden="true">·</span><span class="num"><b>${s.enviados}</b> de ${s.total} enviados</span></div>
<div class="m-torre-rel-b" role="progressbar" aria-label="Relatórios enviados" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${s.enviados}"><i style="width:${pct.toFixed(1)}%"></i></div>
${ui.btn({ rotulo: 'Ver pendentes', iconeDir: 'arrow-right', sm: true, tipo: atraso ? 'pri' : undefined, href: '#/mesa?o=relatorio', attrs: { 'data-voo-rel-ir': '' } })}</div>`;
}

function falhar(slot) {
  slot.removeAttribute('aria-busy');
  slot.classList.add('vazio');
  slot.innerHTML = ui.vazio({ icone: 'plane', titulo: 'Painel de Voo indisponível neste arquivo', texto: `Não encontramos "${SRC}". Ao publicar, mantenha a pasta "torre/" ao lado do arquivo do app (a versão em pasta, dist/, já inclui). No arquivo único de prévia este painel não vem embutido.` });
}

function criarHost() {
  const wrap = document.createElement('div');
  wrap.className = 'm-torre-voo-host';
  wrap.hidden = true;
  const frame = document.createElement('iframe');
  frame.title = 'Painel de Voo — Torre de Controle';
  frame.setAttribute('referrerpolicy', 'same-origin');
  frame.src = srcEmbed(temaAtual());
  wrap.appendChild(frame);
  document.body.appendChild(wrap);
  host = { wrap, frame, carregado: false, tema: temaAtual() };
  frame.addEventListener('load', () => { host.carregado = true; enviarContexto(); });
  window.addEventListener('message', aoReceber);
  return host;
}

function posicionar(slot) {
  if (!host || !slot || !slot.isConnected) return;
  const r = slot.getBoundingClientRect();
  const op = host.wrap.offsetParent; const pr = op && op !== document.body ? op.getBoundingClientRect() : { top: -window.scrollY, left: -window.scrollX };
  const topo = r.top - pr.top, esq = r.left - pr.left;
  // ocupa do topo do espaço até o fim da janela (sem rolagem dupla): a página não rola, quem rola é a Torre
  const v = slot.closest('.view'); const pb = v ? parseFloat(getComputedStyle(v).paddingBottom) || 0 : 16;
  const alt = Math.max(420, Math.floor(window.innerHeight - (r.top + window.scrollY) - pb));
  slot.style.height = `${alt}px`;
  Object.assign(host.wrap.style, { top: `${topo}px`, left: `${esq}px`, width: `${r.width}px`, height: `${alt}px` });
}

function enviar(msg) {
  if (!host || !host.frame.contentWindow) return;
  try { host.frame.contentWindow.postMessage(msg, location.protocol === 'file:' ? '*' : location.origin); } catch (e) { /* iframe ainda carregando */ }
}
function enviarContexto() {
  enviar({ tipo: 'tema', tema: temaAtual() }); host.tema = temaAtual();
  const time = db.list('team', t => t.ativo !== false);
  const ordem = t => (CRIATIVOS.includes(t.id) ? CRIATIVOS.indexOf(t.id) : 10);
  const pessoas = time.sort((a, b) => ordem(a) - ordem(b) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    .map(t => ({ id: t.id, nome: t.nome, papel: t.cargo || t.area || '', criativo: CRIATIVOS.includes(t.id) }));
  enviar({ tipo: 'equipe', pessoas });
  enviarRegras();
  enviarPadroes();
  enviarGuardiao();
}
/** Guardião de segurança: papel de quem está logado (simulação e liberação só Dono/Admin), regras e incidentes (a Torre reaplica a quarentena) */
function enviarGuardiao() {
  const u = auth.real() || auth.user();
  enviar({ tipo: 'usuario', papel: u ? u.papel : null, nome: u ? u.nome : '' });
  try { enviar({ tipo: 'guardiaoRegras', regras: db.config('guardiaoRegras', {}) || {} }); } catch (e) { /* sem regras salvas */ }
  enviar({ tipo: 'guardiaoSync', incidentes: invasao.incidentes().map(a => a.incidente) });
}
if (typeof window !== 'undefined') window.addEventListener('aos:guardiao', e => { const d = e.detail || {}; if (d.tipo === 'liberar' && host) enviar({ tipo: 'guardiaoLiberar', incidenteId: d.incidenteId, contaId: d.contaId, plano: d.plano, quem: quemSou() }); });
auth.onChange && auth.onChange(() => { if (host && host.carregado) enviarGuardiao(); });
/** motor único de recomendações (item 18): regras editadas em Campanha › Regras da IA valem também na Torre */
function enviarRegras() { try { enviar({ tipo: 'motorRegras', regras: db.config('motorRegras', {}) || {} }); } catch (e) { /* sem regras salvas */ } }
/** central "Padrões e regras": limites do semáforo, da fila e de orçamento (ids 'torre.*' e 'orcamento.*') que a Torre usa para decidir */
export function padroesTorre() { const v = padroesValores(); const r = {}; for (const id of Object.keys(v)) if (id.startsWith('torre.') || id.startsWith('orcamento.')) r[id] = v[id]; return r; }
function enviarPadroes() { try { enviar({ tipo: 'padroes', valores: padroesTorre() }); } catch (e) { /* catálogo indisponível */ } }
db.on(col => { if (col === 'settings' && host) { enviarRegras(); enviarPadroes(); try { enviar({ tipo: 'guardiaoRegras', regras: db.config('guardiaoRegras', {}) || {} }); } catch (e) { /* idem */ } } if (col === 'alerts' && host && host.carregado) enviar({ tipo: 'guardiaoSync', incidentes: invasao.incidentes().map(a => a.incidente) }); });
function recDecisao(d) {
  const e = d.entrada; if (!e || typeof e !== 'object') return;
  const q = quemSou();
  db.insert('recsLog', { recId: str(e.recId, 120), regraId: str(e.regraId, 60), decisao: str(e.decisao || e.status, 20), alvo: e.alvo && typeof e.alvo === 'object' ? { nivel: str(e.alvo.nivel, 20), id: str(e.alvo.id, 80), nome: str(e.alvo.nome, 160) } : null,
    conta: str(e.conta, 160), metricaAntes: typeof e.metricaAntes === 'number' ? e.metricaAntes : null, origem: 'torre', quem: q.teamId, quando: new Date().toISOString() });
}

export function mountVoo(el, ctx) {
  const slot = el.querySelector('[data-voo-slot]');
  if (!slot) return undefined;
  const mostrar = () => {
    if (!host) criarHost();
    slot.innerHTML = ''; slot.removeAttribute('aria-busy');
    host.wrap.hidden = false;
    posicionar(slot);
    if (host.carregado && host.tema !== temaAtual()) enviarContexto();
  };
  if (verificado === 'ok' || host) mostrar();
  else if (location.protocol === 'file:') { if (window.AOS_SINGLE) { verificado = 'falhou'; falhar(slot); } else { verificado = 'ok'; mostrar(); } }
  else if (verificado === 'falhou') falhar(slot);
  else {
    fetch(SRC, { method: 'HEAD', cache: 'no-store' }).then(r => { verificado = r.ok ? 'ok' : 'falhou'; }).catch(() => { verificado = 'ok'; /* verificação bloqueada pelo ambiente (CSP): tenta carregar mesmo assim */ })
      .then(() => { if (!slot.isConnected) return; if (verificado === 'ok') mostrar(); else falhar(slot); });
  }
  // reposiciona quando o layout muda (menu recolhido, faixa "ver como", rotação do celular)
  const re = () => posicionar(slot);
  const ro = new ResizeObserver(re); ro.observe(document.body); ro.observe(slot.parentElement || slot);
  window.addEventListener('resize', re);
  const tick = setInterval(re, 700);
  // tema do app mudou → manda para a Torre sem recarregar
  const mo = new MutationObserver(() => { if (host && host.carregado && host.tema !== temaAtual()) enviarContexto(); const a = el.querySelector('.m-torre-voo-ext'); if (a) a.href = temaAtual() === 'escuro' ? SRC_ESCURO : SRC; });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
  return () => {
    ro.disconnect(); mo.disconnect(); clearInterval(tick); window.removeEventListener('resize', re);
    if (host) host.wrap.hidden = true; // fica guardado (estado da Torre preservado ao voltar)
  };
}

/* ---------------- mensagens da Torre ---------------- */
const str = (v, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '');
const isoValido = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
function clientePorNome(nome) {
  const n = fmt.norm(nome); if (!n) return null;
  return db.find('clients', c => fmt.norm(c.nome) === n || fmt.norm(c.nomeFantasia || '') === n || fmt.norm(c.razao || '') === n) || null;
}
function quemSou() { const u = auth.real() || auth.user(); return u ? { userId: u.id, teamId: u.teamId, nome: u.nome } : { userId: null, teamId: null, nome: 'Alguém' }; }

function aoReceber(e) {
  if (!host || e.source !== host.frame.contentWindow) return;
  if (location.protocol !== 'file:' && e.origin !== location.origin) return;
  const d = e.data; if (!d || typeof d !== 'object' || typeof d.tipo !== 'string') return;
  if (d.tipo === 'pronto') { enviarContexto(); return; }
  if (d.tipo === 'pedidoCriativo') { pedidoCriativo(d); return; }
  if (d.tipo === 'pedidoCriativoDesfazer') { desfazerPedido(str(d.ref, 80)); return; }
  if (d.tipo === 'clienteAvisado') { clienteAvisado(d); return; }
  if (d.tipo === 'recDecisao') { recDecisao(d); return; }
  if (d.tipo === 'invasao') { guardiaoInvasao(d); return; }
  if (d.tipo === 'quarentenaEncerrada') { guardiaoEncerrada(d); }
}

/** a Torre pediu um criativo: tarefa na Operação + notificação para quem produz + registro no cliente */
export function pedidoCriativo(d) {
  const ref = str(d.ref, 80) || `pc-${Date.now().toString(36)}`;
  const para = db.get('team', str(d.para, 60));
  const cliente = str(d.cliente, 160).trim(); const briefing = str(d.briefing, 4000).trim();
  if (!para || !cliente || !briefing) { enviar({ tipo: 'pedidoCriativoErro', ref, erro: 'Pedido incompleto: escolha quem produz e escreva o briefing.' }); return null; }
  const prazo = isoValido(d.prazo) ? d.prazo : fmt.iso(new Date(Date.now() + 864e5));
  const prioridade = ['normal', 'alta', 'urgente'].includes(d.prioridade) ? d.prioridade : 'alta';
  const formato = { video: 'Vídeo', imagem: 'Imagem', carrossel: 'Carrossel' }[d.formato] || 'Criativo';
  const c = clientePorNome(cliente);
  const eu = quemSou();
  const agora = new Date().toISOString();
  const anuncio = str(d.anuncio, 200);
  let tarefa, acao, notifs = [];
  db.batch(() => {
    tarefa = db.insert('tasks', {
      titulo: `Novo criativo · ${cliente}`, clientId: c ? c.id : null, clienteNome: c ? c.nome : cliente, respId: para.id,
      tipo: para.id === 't-elisa' ? 'copy' : 'criativo', status: 'afazer', prazo, prioridade: prioridade === 'normal' ? 'normal' : 'alta',
      desc: briefing, descricao: briefing, origem: 'torre', formato, anuncio, contaMeta: str(d.conta, 60),
      estimativaH: formato === 'Vídeo' ? 4 : 2, horasGastas: 0, checklist: [], retrabalho: 0, projetoId: null, aprovadorId: eu.teamId || null,
      criadaEm: agora, historico: [{ quando: agora, quem: eu.userId, oque: `criou pelo Painel de Voo (pedido de ${eu.nome})` }],
    }, { log: `pediu criativo novo a ${para.nome} para ${cliente} (Painel de Voo)` });
    if (c) acao = db.insert('clientActions', { clientId: c.id, data: prazo < agora.slice(0, 10) ? prazo : agora.slice(0, 10), quem: eu.teamId, tipo: 'Novo criativo pedido', area: 'trafego', metrica: 'CPL', descricao: `${formato} novo pedido a ${para.nome} (prazo ${fmt.data(prazo)})${anuncio ? ` para substituir o anúncio "${anuncio}"` : ''}.`, antes: anuncio ? `Anúncio cansado: ${anuncio}` : 'Anúncio cansado', depois: '', expectativa: 'Custo por conversa de volta à meta', resultado: '', origem: 'torre', taskId: tarefa.id });
  });
  if (para.userId) notifs = notify.enviar({ para: [para.userId], tipo: 'atribuicao', prioridade: prioridade === 'normal' ? 'normal' : 'alta', titulo: `${fmt.primeiro(eu.nome)} pediu um criativo novo: ${cliente}`, texto: `${formato} · prazo ${fmt.data(prazo)}${anuncio ? ` · substitui "${anuncio}"` : ''}. Briefing na tarefa.`, link: `#/operacao/quadro?tarefa=${tarefa.id}`, refCol: 'tasks', refId: tarefa.id }) || [];
  pedidos.set(ref, { taskId: tarefa.id, acaoId: acao ? acao.id : null, notifIds: (Array.isArray(notifs) ? notifs : []).map(n => n && n.id).filter(Boolean) });
  enviar({ tipo: 'pedidoCriativoOk', ref, tarefaId: tarefa.id, paraNome: para.nome });
  return tarefa;
}
function desfazerPedido(ref) {
  const p = pedidos.get(ref); if (!p) return;
  pedidos.delete(ref);
  db.batch(() => {
    if (db.get('tasks', p.taskId)) db.remove('tasks', p.taskId, { log: 'desfez o pedido de criativo (Painel de Voo)' });
    if (p.acaoId && db.get('clientActions', p.acaoId)) db.remove('clientActions', p.acaoId);
    p.notifIds.forEach(id => { if (db.get('notifications', id)) db.remove('notifications', id); });
  });
}
/** a Torre marcou "cliente avisado": registra na atividade (e no cliente, se ele existir no app) */
export function clienteAvisado(d) {
  const cliente = str(d.cliente, 160).trim(); if (!cliente) return null;
  const c = clientePorNome(cliente); const eu = quemSou(); const anuncio = str(d.anuncio, 200);
  const oque = `avisou ${cliente} para trocar o criativo${anuncio ? ` ("${anuncio}")` : ''} pelo WhatsApp (Painel de Voo)`;
  if (c) return db.insert('clientActions', { clientId: c.id, data: fmt.iso(new Date()), quem: eu.teamId, tipo: 'Cliente avisado: trocar criativo', area: 'trafego', metrica: null, descricao: str(d.mensagem, 2000), antes: anuncio ? `Anúncio cansado: ${anuncio}` : '', depois: 'Cliente avisado', expectativa: 'Material novo do cliente', resultado: '', origem: 'torre' }, { log: oque });
  return db.insert('activity', { quem: eu.userId, quemNome: eu.nome, oque, col: 'torre', refId: null, quando: new Date().toISOString() });
}

/* ---------------- Guardião de segurança (possível invasão) ---------------- */
const incValido = i => i && typeof i === 'object' && typeof i.id === 'string' && /^inc-[\w-]{1,80}$/.test(i.id) && Array.isArray(i.pausados) && Array.isArray(i.achados);
/** a Torre pausou uma conta (invasão ou reincidência): alerta + notificação crítica para todos os alvos + rotina + sirene (core/invasao.js) */
export function guardiaoInvasao(d) {
  if (!incValido(d.incidente)) return null;
  const inc = { ...d.incidente, contaNome: str(d.incidente.contaNome, 160) || str(d.conta && d.conta.nome, 160) || 'conta' };
  const c = clientePorNome(inc.contaNome);
  return invasao.registrarIncidente(inc, { evento: d.evento === 'reincidencia' ? 'reincidencia' : 'invasao', clientId: c ? c.id : null, origem: 'torre', pausadas: typeof d.pausadas === 'number' ? d.pausadas : undefined });
}
/** a conta foi liberada dentro da Torre (Dono/Admin + SIM + checklist): encerra o incidente no app */
export function guardiaoEncerrada(d) {
  const inc = d.incidente; if (!inc || typeof inc.id !== 'string') return null;
  const a = db.get('alerts', inc.id); if (!a || !a.incidente || a.incidente.estado === 'encerrado') return null;
  const u = auth.real() || auth.user();
  if (!u || !invasao.podeLiberar(u)) return null; // a Torre também confere; aqui vale o papel do app
  const reat = Array.isArray(inc.reativadas) ? inc.reativadas.length : 0;
  const novo = db.update('alerts', inc.id, { incidente: { ...a.incidente, ...inc, estado: 'encerrado' }, status: 'resolvido', resolvido: true, resolvidoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() }, { log: `liberou a quarentena de ${a.incidente.contaNome} pelo Painel de Voo (SIM + checklist) e reativou ${reat} campanha(s)` });
  db.setConfig(`guardiaoEstado:${a.incidente.contaId}`, { contaId: a.incidente.contaId, quarentena: false, liberadaEm: new Date().toISOString() });
  return novo;
}
