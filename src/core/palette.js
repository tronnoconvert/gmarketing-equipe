// palette.js — paleta de comandos (Ctrl+K / ⌘K): páginas, resultados da busca de todos os módulos e ações.
// O shell injeta as fontes com configurarPaleta({...}); ver docs/CORE-API.md §9 (comandos de módulo).
import { esc, norm } from './fmt.js';
import { svgIc } from './icons.js';
import { overlay, avatar, led } from './ui.js';

let fontes = null; // {paginas(), acoes(), busca(q), dinamicos(q), executar(item), usuario()}
let aberta = null; // {fechar, box}
let itens = [], idx = 0;
const LIM_GRUPO = 6, LIM_REC = 5;
const SING = { Clientes: 'Cliente', Pessoas: 'Pessoa', Faturas: 'Fatura', Tarefas: 'Tarefa', Alertas: 'Alerta', Webinars: 'Webinar', Oportunidades: 'Oportunidade', Notificações: 'Notificação', Rotinas: 'Rotina', Integrações: 'Integração', Cobrar: 'Cobrança' };
/* desempate entre fontes da busca: entidades principais antes de registros derivados */
const PESO_TIPO = { Clientes: 12, Pessoas: 10, Equipe: 10, Oportunidades: 6, Webinars: 6, Tarefas: 4, Alertas: 3, Faturas: 2, Notificações: -12 };
export const ehMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
export const teclaPaleta = () => (ehMac() ? '⌘K' : 'Ctrl K');

export function configurarPaleta(f) { fontes = f; }
export function paletaAberta() { return !!aberta; }

/* ---------- recentes (por pessoa, neste navegador) ---------- */
const chaveRec = () => { const u = fontes && fontes.usuario(); return `aos-cmd-recentes:${u ? u.id : 'anon'}`; };
function lerRecentes() { try { return JSON.parse(localStorage.getItem(chaveRec()) || '[]'); } catch (e) { return []; } }
function gravarRecente(it) {
  const r = { k: it.k, titulo: it.titulo, sub: it.sub || '', icone: it.icone || '', href: it.href || '', gatilho: it.gatilho || '', cmd: it.cmd || '', tr: it.tipoRotulo || (it.tipo && it.tipo !== 'Recentes' ? (SING[it.tipo] || it.tipo) : ''), av: it.avatar ? (it.avatar.id || it.avatar) : '' };
  if (!r.href && !r.cmd) return;
  const l = [r, ...lerRecentes().filter(x => x.k !== r.k)].slice(0, 8);
  try { localStorage.setItem(chaveRec(), JSON.stringify(l)); } catch (e) { /* ok */ }
}

/* ---------- pontuação (fuzzy simples, sem acento/caixa) ---------- */
export function pontuar(q, alvo) {
  const t = norm(alvo || ''); if (!q) return 1; if (!t) return 0;
  const i = t.indexOf(q);
  if (i === 0) return 100;
  if (i > 0) return (/[\s›·\-/(@]/.test(t[i - 1]) ? 90 : 70) - Math.min(i, 30) / 3;
  const tk = q.split(/\s+/).filter(Boolean);
  if (tk.length > 1 && tk.every(k => t.includes(k))) return 62;
  const qq = q.replace(/\s+/g, ''); if (qq.length < 3) return 0;
  let j = 0, ini = -1, fim = -1;
  for (let k = 0; k < t.length && j < qq.length; k++) if (t[k] === qq[j]) { if (ini < 0) ini = k; fim = k; j++; }
  if (j < qq.length) return 0;
  const espalhamento = fim - ini + 1 - qq.length;
  if (espalhamento > qq.length * 2) return 0;
  return Math.max(12, 40 - espalhamento * 3);
}
const pontuarItem = (q, it) => Math.max(pontuar(q, it.titulo), ...(it.palavras || []).map(p => pontuar(q, p) - 4), it.sub ? pontuar(q, it.sub) * 0.5 : 0);

/* ---------- montagem dos grupos ---------- */
function coletar(qBruto) {
  const q = norm(qBruto).trim();
  const paginas = fontes.paginas().map(x => ({ ...x, tipo: 'Páginas' }));
  const acoes = fontes.acoes().map(x => ({ ...x, tipo: x.tipo || 'Ações' }));
  if (!q) {
    const todos = [...acoes, ...paginas];
    const rec = lerRecentes().map(r => {
      const vivo = r.cmd ? todos.find(x => x.cmd === r.cmd) : null;
      if (r.cmd && !vivo) return null;
      return vivo ? { ...vivo, tipo: 'Recentes' } : { ...r, tipo: 'Recentes', tipoRotulo: r.tr, avatar: r.av || undefined, k: r.k };
    }).filter(Boolean).slice(0, LIM_REC);
    return [['Recentes', rec], ['Ações', acoes.filter(a => !a.secundaria).slice(0, 8)], ['Páginas', paginas]].filter(([, l]) => l.length);
  }
  const res = [];
  const add = (it, s) => { if (s > 0) res.push({ ...it, score: s }); };
  paginas.forEach(it => add(it, pontuarItem(q, it)));
  acoes.forEach(it => add(it, pontuarItem(q, it)));
  (fontes.dinamicos(q) || []).forEach(it => add({ tipo: 'Ações', ...it }, it.score || 95));
  (fontes.busca(q) || []).forEach(it => {
    const base = Math.max(50, pontuar(q, it.titulo), (it.sub ? pontuar(q, it.sub) * 0.6 : 0));
    const sobra = Math.max(0, norm(it.titulo).length - q.length); // título mais "exato" vem antes
    add(it, base - Math.min(12, sobra / 3) + (PESO_TIPO[it.tipo] || 0));
  });
  const grupos = new Map();
  res.sort((a, b) => b.score - a.score).forEach(it => {
    const k = it.tipo || 'Outros'; if (!grupos.has(k)) grupos.set(k, []);
    const g = grupos.get(k); if (g.length < LIM_GRUPO && !g.some(x => (x.href && x.href === it.href && x.titulo === it.titulo) || (x.cmd && x.cmd === it.cmd))) g.push(it);
  });
  return [...grupos.entries()].sort((a, b) => b[1][0].score - a[1][0].score);
}

function itemHtml(it, i) {
  const ic = it.avatar ? avatar(it.avatar, 24) : `<span class="cmdk-oi">${svgIc(it.icone || (it.href ? 'arrow-right' : 'zap'))}</span>`;
  const rot = it.tipoRotulo && (it.tipo === 'Recentes' || !['Ação', 'Página'].includes(it.tipoRotulo)) ? it.tipoRotulo : '';
  const dica = it.atalho ? `<kbd>${esc(it.atalho)}</kbd>` : (rot ? `<span class="cmdk-tp">${esc(rot)}</span>` : '');
  return `<div role="option" id="cmdk-o-${i}" class="cmdk-o" aria-selected="${i === idx}" data-cmdk-i="${i}">${ic}<span class="cmdk-ot"><b>${esc(it.titulo)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${it.led ? led(it.led, false) : ''}${dica}<span class="cmdk-enter" aria-hidden="true">${svgIc('arrow-right')}</span></div>`;
}
function desenhar() {
  if (!aberta) return;
  const inp = aberta.box.querySelector('#cmdk-in');
  const grupos = coletar(inp.value);
  itens = grupos.flatMap(([, l]) => l); idx = Math.min(idx, Math.max(0, itens.length - 1));
  const lista = aberta.box.querySelector('#cmdk-l');
  let k = 0;
  if (!itens.length) lista.innerHTML = `<div class="cmdk-vz">${svgIc('search')}<p><b>Nada encontrado para “${esc(inp.value.trim())}”.</b><span>Tente o nome de um cliente, pessoa ou página — ou um comando como “nova tarefa” ou “cobrar”.</span></p></div>`;
  else lista.innerHTML = grupos.map(([g, l], gi) => `<div role="group" class="cmdk-g" aria-labelledby="cmdk-g-${gi}"><p class="cmdk-gt" id="cmdk-g-${gi}" role="presentation">${esc(g)}</p>${l.map(it => itemHtml(it, k++)).join('')}</div>`).join('');
  const st = aberta.box.querySelector('.cmdk-st');
  if (st) st.textContent = itens.length ? `${itens.length} ${itens.length === 1 ? 'resultado' : 'resultados'}` : 'Nenhum resultado';
  marcar();
}
function marcar() {
  if (!aberta) return;
  const inp = aberta.box.querySelector('#cmdk-in');
  aberta.box.querySelectorAll('[data-cmdk-i]').forEach(o => o.setAttribute('aria-selected', String(Number(o.dataset.cmdkI) === idx)));
  if (itens.length) { inp.setAttribute('aria-activedescendant', `cmdk-o-${idx}`); const o = aberta.box.querySelector(`#cmdk-o-${idx}`); o && o.scrollIntoView({ block: 'nearest' }); }
  else inp.removeAttribute('aria-activedescendant');
}
function executar(i) {
  const it = itens[i]; if (!it) return;
  gravarRecente(it);
  fecharPaleta('sem-foco');
  setTimeout(() => fontes.executar(it), 0);
}

export function fecharPaleta(modo) { if (aberta) aberta.fechar(modo); }
export function abrirPaleta(texto = '') {
  if (!fontes) return;
  if (aberta) { const i = aberta.box.querySelector('#cmdk-in'); i.focus(); i.select(); return; }
  idx = 0;
  const html = `<div class="cmdk">
<div class="cmdk-h">${svgIc('search')}<input id="cmdk-in" type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-l" aria-autocomplete="list" aria-haspopup="listbox" autocomplete="off" spellcheck="false" placeholder="Buscar ou digitar um comando…" aria-label="Paleta de comandos: busque ou digite um comando"><kbd class="cmdk-esc">Esc</kbd></div>
<div id="cmdk-l" class="cmdk-l" role="listbox" aria-label="Resultados"></div>
<div class="cmdk-f"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span><span class="cmdk-st" role="status" aria-live="polite"></span></div></div>`;
  aberta = overlay({ html, cls: 'ov-cmdk', rotulo: 'Paleta de comandos', onFechar: () => { aberta = null; itens = []; } });
  const box = aberta.box; const inp = box.querySelector('#cmdk-in');
  inp.value = texto;
  let tm = null;
  inp.addEventListener('input', () => { clearTimeout(tm); idx = 0; tm = setTimeout(desenhar, 60); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!itens.length) return; idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length; marcar(); }
    else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); idx = 0; marcar(); }
    else if (e.key === 'End' && e.ctrlKey) { e.preventDefault(); idx = itens.length - 1; marcar(); }
    else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(tm); if (tm) { desenhar(); } executar(idx); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecharPaleta(); }
    else if (e.key === 'Tab') { e.preventDefault(); }
  });
  const lista = box.querySelector('#cmdk-l');
  lista.addEventListener('mousemove', e => { const o = e.target.closest('[data-cmdk-i]'); if (o && Number(o.dataset.cmdkI) !== idx) { idx = Number(o.dataset.cmdkI); marcar(); } });
  lista.addEventListener('mousedown', e => { if (e.target.closest('[data-cmdk-i]')) e.preventDefault(); });
  lista.addEventListener('click', e => { const o = e.target.closest('[data-cmdk-i]'); if (o) executar(Number(o.dataset.cmdkI)); });
  desenhar();
  inp.focus();
}
