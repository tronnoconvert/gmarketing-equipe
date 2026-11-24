// som.js — aviso sonoro de notificação nova (decisão do dono: sempre ligado, sem opção de desligar).
// Toca um "plim" curto (WebAudio sintetizado, ~0,4 s, volume moderado) UMA vez por notificação quando a pessoa logada
// recebe uma notificação NOVA de outra pessoa (para === eu, de !== eu) — escrita local, realtime do Supabase ou outra aba (demo).
// Nunca repete: ids tocados em memória + localStorage `aos-som-tocadas:<uid>`, e ignora notificações anteriores ao início da sessão
// (login/recarregar não toca nada antigo). Navegadores exigem um gesto antes de tocar áudio: o AudioContext é destravado no
// primeiro clique/tecla; se ainda estiver travado quando chegar a notificação, toca uma vez no próximo gesto.
import { db } from './store.js';
import { auth } from './auth.js';

const INICIO = Date.now() - 1500;     // início da sessão (carregamento da página), com folga para relógio
const MAX_IDS = 300;
let ctx = null;
let pendente = false;
const tocadas = new Map();            // uid -> Set(ids)

function chave(uid) { return `aos-som-tocadas:${uid}`; }
function setDe(uid) {
  if (!tocadas.has(uid)) {
    let l = [];
    try { l = JSON.parse(localStorage.getItem(chave(uid)) || '[]'); } catch (e) { l = []; }
    tocadas.set(uid, new Set(Array.isArray(l) ? l : []));
  }
  return tocadas.get(uid);
}
function guardar(uid) {
  try { localStorage.setItem(chave(uid), JSON.stringify([...setDe(uid)].slice(-MAX_IDS))); } catch (e) { /* memória */ }
}

function contexto() {
  if (ctx) return ctx;
  if (typeof window !== 'undefined' && window.__aosAudioCtx) { ctx = window.__aosAudioCtx; return ctx; } // compartilhado com a sirene (sirene.js)
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try { ctx = new AC(); window.__aosAudioCtx = ctx; } catch (e) { ctx = null; }
  return ctx;
}
/** plim: duas notas (Mi6 → Si6) com envelope suave */
function plim() {
  const c = contexto(); if (!c) return false;
  try {
    const t0 = c.currentTime + 0.01;
    const master = c.createGain(); master.gain.value = 0.18; master.connect(c.destination);
    [[1318.5, 0, 0.32], [1975.5, 0.09, 0.34]].forEach(([f, atraso, dur]) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + atraso);
      g.gain.exponentialRampToValueAtTime(1, t0 + atraso + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + atraso + dur);
      o.connect(g); g.connect(master);
      o.start(t0 + atraso); o.stop(t0 + atraso + dur + 0.02);
    });
    try { window.dispatchEvent(new CustomEvent('aos:som')); } catch (e) { /* sem DOM */ }
    return true;
  } catch (e) { return false; }
}
function tocar() {
  const c = contexto(); if (!c) return;
  if (c.state === 'running') { plim(); return; }
  pendente = true; // toca no próximo gesto
  try { const p = c.resume && c.resume(); if (p && p.then) p.then(() => { if (pendente && c.state === 'running') { pendente = false; plim(); } }).catch(() => {}); } catch (e) { /* travado */ }
}
function destravar() {
  const c = contexto(); if (!c) return;
  const depois = () => { if (pendente && c.state === 'running') { pendente = false; plim(); } };
  try { const p = c.state !== 'running' && c.resume ? c.resume() : null; if (p && p.then) p.then(depois).catch(() => {}); else depois(); } catch (e) { /* ignora */ }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', destravar, true);
  window.addEventListener('keydown', destravar, true);
}

/** procura notificações novas para a pessoa logada e toca uma vez (várias de uma vez = um plim só) */
export function verificar() {
  const u = auth.real(); if (!u) return 0;
  const set = setDe(u.id);
  const novas = db.list('notifications', n => n.para === u.id && n.de !== u.id && !n.lida && !n.sirene && !set.has(n.id) && new Date(n.quando || n.createdAt || 0).getTime() >= INICIO);
  if (!novas.length) return 0;
  novas.forEach(n => set.add(n.id)); guardar(u.id);
  tocar();
  return novas.length;
}
db.on((col, op) => {
  if (col === 'notifications' && (op === 'insert' || op === 'update')) verificar();
  else if (col === '*' && (op === 'batch' || op === 'reload' || op === 'load')) verificar();
});
// ao entrar: o que já existe não toca (marca como visto)
auth.onChange(() => {
  const u = auth.real(); if (!u) return;
  const set = setDe(u.id); let mudou = false;
  db.list('notifications', n => n.para === u.id && new Date(n.quando || 0).getTime() < Date.now() - 1000).forEach(n => { if (!set.has(n.id)) { set.add(n.id); mudou = true; } });
  if (mudou) guardar(u.id);
});

export const som = { verificar, tocar, _inicio: INICIO };
export default som;
