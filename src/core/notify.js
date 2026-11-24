// notify.js — notificações in-app, comentários com @menção e modal "Notificar alguém".
import { db } from './store.js';
import { auth } from './auth.js';
import { esc, rel as relFmt, primeiro, norm, dataHora, iso } from './fmt.js';
import { svgIc } from './icons.js';
import { avatar, avatares, modal, toast, form, rel } from './ui.js';
import './som.js'; // aviso sonoro de notificação nova (sempre ligado)

export const TIPOS = {
  mencao: { rotulo: 'Menção', icone: 'at-sign' }, atribuicao: { rotulo: 'Atribuição', icone: 'user-plus' },
  alerta: { rotulo: 'Alerta', icone: 'alert' }, sistema: { rotulo: 'Sistema', icone: 'settings' }, mensagem: { rotulo: 'Mensagem', icone: 'message' },
  invasao: { rotulo: 'Segurança', icone: 'shield' },
};
const CANAIS = { app: 'no app', whatsapp: 'por WhatsApp', email: 'por e-mail', slack: 'no Slack' };
const eu = () => auth.user();
const quem = () => auth.real() || auth.user();
const ordem = (a, b) => String(b.quando).localeCompare(String(a.quando));
const usuariosAtivos = () => db.list('users', u => u.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

/**
 * enviar({para:[userId]|userId, titulo, texto, link, tipo, de, prioridade, canais:['app','whatsapp','email']}) -> notificações criadas
 */
export function enviar(o = {}) {
  const para = [...new Set([].concat(o.para || []))].filter(Boolean);
  const de = o.de === undefined ? (quem() ? quem().id : null) : o.de;
  const criadas = para.map(p => db.insert('notifications', {
    para: p, de, titulo: o.titulo || 'Nova notificação', texto: o.texto || '', link: o.link || '', tipo: TIPOS[o.tipo] ? o.tipo : 'mensagem',
    lida: false, prioridade: ['alta', 'critica'].includes(o.prioridade) ? o.prioridade : 'normal', quando: new Date().toISOString(), canais: o.canais || ['app'], refCol: o.refCol, refId: o.refId,
  }));
  const ext = (o.canais || []).filter(c => c !== 'app');
  if (ext.length && criadas.length) {
    if (db.mode === 'supabase' && db.supabase && db.supabase.functions) {
      db.supabase.functions.invoke('notify', { body: { ids: criadas.map(c => c.id), canais: ext } }).catch(e => console.warn('[Agência OS] notify', e && e.message));
    } else if (o.silencioso !== true) {
      ext.forEach(c => toast(`Enviado ${CANAIS[c]} (simulado no modo demonstração).`, { tipo: 'info' }));
    }
  }
  return criadas;
}
/** minhas({filtro:'todas'|'nao_lidas'|'mencoes'|'atribuidas'|'alertas', limite}) — do usuário efetivo, mais recentes primeiro */
export function minhas(o = {}) {
  const u = eu(); if (!u) return [];
  let l = db.list('notifications', n => n.para === u.id).sort(ordem);
  const f = o.filtro || 'todas';
  if (f === 'nao_lidas') l = l.filter(n => !n.lida);
  else if (f === 'mencoes') l = l.filter(n => n.tipo === 'mencao');
  else if (f === 'atribuidas') l = l.filter(n => n.tipo === 'atribuicao');
  else if (f === 'alertas') l = l.filter(n => n.tipo === 'alerta');
  return o.limite ? l.slice(0, o.limite) : l;
}
export function naoLidas() { const u = eu(); return u ? db.count('notifications', n => n.para === u.id && !n.lida) : 0; }
export function marcarLida(id, lida = true) { return db.update('notifications', id, { lida }); }
export function marcarTodas() { const u = eu(); if (!u) return 0; const l = db.list('notifications', n => n.para === u.id && !n.lida); db.batch(() => l.forEach(n => db.update('notifications', n.id, { lida: true }))); return l.length; }
/** HTML de um item de notificação (painel do sino e central) */
export function itemHtml(n, o = {}) {
  const t = TIPOS[n.tipo] || TIPOS.mensagem; const de = n.de ? db.get('users', n.de) : null;
  const ico = de ? avatar(de, 32) : `<span class="nt-ic t-${esc(n.tipo)}">${svgIc(t.icone)}</span>`;
  return `<li class="nt${n.lida ? '' : ' un'}${n.prioridade === 'alta' || n.prioridade === 'critica' ? ' alta' : ''}${n.prioridade === 'critica' ? ' critica' : ''}" data-nid="${esc(n.id)}">
<a class="nt-a" href="${esc(n.link || '#/notificacoes')}" data-nt-abrir="${esc(n.id)}">${ico}<span class="nt-m"><b>${esc(n.titulo)}</b>${n.texto && o.texto !== false ? `<span class="nt-x">${esc(n.texto)}</span>` : ''}<span class="nt-meta">${n.prioridade === 'critica' ? '<span class="nt-pr">Crítico · segurança</span> · ' : n.prioridade === 'alta' ? '<span class="nt-pr">Prioridade alta</span> · ' : ''}${esc(t.rotulo)} · ${rel(n.quando)}</span></span></a>
${n.lida ? '' : `<button type="button" class="nt-dot" data-nt-lida="${esc(n.id)}" aria-label="Marcar como lida" title="Marcar como lida"></button>`}</li>`;
}

/* ---------------- agrupamento ----------------
   Mesma entidade (refCol + refId) + mesmo tipo + mesmo dia = um grupo ("3 menções em Grupo Orion"). */
const PLURAL = { mencao: ['menção', 'menções'], atribuicao: ['atribuição', 'atribuições'], alerta: ['alerta', 'alertas'], sistema: ['aviso do sistema', 'avisos do sistema'], mensagem: ['mensagem', 'mensagens'], invasao: ['alerta de segurança', 'alertas de segurança'] };
/** nome legível da entidade de uma notificação (cliente, tarefa, webinar…) */
export function nomeRef(n) {
  if (!n || !n.refCol || !n.refId) return '';
  const r = db.get(n.refCol, n.refId);
  if (r) return r.nome || r.titulo || r.tema || r.empresa || r.descricao || '';
  const m = /\bem (.+)$/.exec(n.titulo || ''); return m ? m[1] : '';
}
/** agrupar(lista) -> [{grupo:false, n} | {grupo:true, chave, tipo, itens, naoLidas, titulo, link, quando}] (ordem preservada) */
export function agrupar(lista = []) {
  const out = []; const idx = new Map();
  for (const n of lista) {
    if (!n.refCol || !n.refId) { out.push({ grupo: false, n }); continue; }
    const k = `${n.refCol}:${n.refId}:${n.tipo}:${iso(n.quando)}`;
    if (idx.has(k)) { out[idx.get(k)].itens.push(n); continue; }
    idx.set(k, out.length); out.push({ grupo: true, chave: k, tipo: n.tipo, itens: [n] });
  }
  return out.map(g => {
    if (!g.grupo) return g;
    if (g.itens.length < 2) return { grupo: false, n: g.itens[0] };
    const p = PLURAL[g.tipo] || PLURAL.mensagem; const nome = nomeRef(g.itens[0]);
    return { ...g, naoLidas: g.itens.filter(x => !x.lida).length, titulo: `${g.itens.length} ${p[1]}${nome ? ` em ${nome}` : ''}`, link: g.itens[0].link, quando: g.itens[0].quando, alta: g.itens.some(x => x.prioridade === 'alta' && !x.lida) };
  });
}
/** HTML de um grupo para o painel do sino (expansível; "marcar grupo como lido") */
export function grupoHtml(g) {
  const t = TIPOS[g.tipo] || TIPOS.mensagem; const ids = g.itens.map(x => x.id).join(',');
  const pessoas = [...new Set(g.itens.map(x => x.de).filter(Boolean))];
  const ico = pessoas.length ? `<span class="nt-avs">${avatares(pessoas, 2, 22)}</span>` : `<span class="nt-ic t-${esc(g.tipo)}">${svgIc(t.icone)}</span>`;
  const sid = `ntg-${g.chave.replace(/[^a-z0-9]/gi, '')}`;
  const nomes = [...new Set(g.itens.map(x => { const u = x.de ? db.get('users', x.de) : null; return u ? primeiro(u.nome) : ''; }).filter(Boolean))];
  return `<li class="nt nt-grp${g.naoLidas ? ' un' : ''}${g.alta ? ' alta' : ''}" data-ngrp="${esc(g.chave)}">
<a class="nt-a" href="${esc(g.link || '#/notificacoes')}" data-nt-abrir-grupo="${esc(ids)}">${ico}<span class="nt-m"><b>${esc(g.titulo)}</b><span class="nt-x">${nomes.length ? esc(nomes.join(', ')) : esc(g.itens[0].texto || '')}</span><span class="nt-meta">${g.alta ? '<span class="nt-pr">Prioridade alta</span> · ' : ''}${g.naoLidas ? `${g.naoLidas} não ${g.naoLidas === 1 ? 'lida' : 'lidas'} · ` : ''}${esc(t.rotulo)} · ${rel(g.quando)}</span></span></a>
<button type="button" class="nt-exp" data-nt-grp-toggle aria-expanded="false" aria-controls="${sid}" aria-label="Ver as ${g.itens.length} notificações" title="Ver cada uma">${svgIc('chev-down')}</button>
${g.naoLidas ? `<button type="button" class="nt-dot" data-nt-lida-grupo="${esc(ids)}" aria-label="Marcar as ${g.itens.length} como lidas" title="Marcar grupo como lido"></button>` : ''}
<ul class="nt-sub" id="${sid}" hidden>${g.itens.map(x => itemHtml(x)).join('')}</ul></li>`;
}
/** lista agrupada pronta para <ul class="np-l">: limite = nº de entradas (grupos contam 1) */
export function listaHtml(lista, o = {}) {
  let g = agrupar(lista); if (o.limite) g = g.slice(0, o.limite);
  return g.map(x => (x.grupo ? grupoHtml(x) : itemHtml(x.n, o))).join('');
}

/* ---------------- comentários ---------------- */
function textoComMencoes(t) {
  let h = esc(t);
  const nomes = usuariosAtivos().map(u => primeiro(u.nome)).sort((a, b) => b.length - a.length);
  nomes.forEach(n => { h = h.replace(new RegExp(`@${n}(?![\\wÀ-ú])`, 'g'), `<span class="mn">@${n}</span>`); });
  return h.replace(/\n/g, '<br>');
}
function extrairMencoes(t) { return usuariosAtivos().filter(u => new RegExp(`@${primeiro(u.nome)}(?![\\wÀ-ú])`, 'i').test(t)).map(u => u.id); }
function listaComentarios(refCol, refId) {
  const l = db.list('comments', c => c.refCol === refCol && c.refId === refId).sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
  const me = quem();
  if (!l.length) return '<li class="cmt-vz">Nenhum comentário ainda. Escreva o primeiro e use @ para chamar alguém.</li>';
  return l.map(c => { const a = db.get('users', c.autor) || { nome: 'Alguém' }; return `<li class="cmt-i" data-cid="${esc(c.id)}">${avatar(a, 30)}<div class="cmt-c"><div class="cmt-h"><b>${esc(a.nome)}</b><span title="${esc(dataHora(c.quando))}">${rel(c.quando)}</span>${me && c.autor === me.id ? `<button type="button" class="lnk sm" data-cmt-del="${esc(c.id)}">Excluir</button>` : ''}</div><p>${textoComMencoes(c.texto)}</p></div></li>`; }).join('');
}
/** comentarios(refCol, refId, {titulo}) -> HTML da thread com caixa de comentário e autocomplete de @menção */
export function comentarios(refCol, refId, o = {}) {
  const me = quem();
  return `<div class="cmt" data-cmt-col="${esc(refCol)}" data-cmt-id="${esc(refId)}" data-cmt-titulo="${esc(o.titulo || '')}">
<ul class="cmt-l">${listaComentarios(refCol, refId)}</ul>
<form class="cmt-f" novalidate>${me ? avatar(me, 30) : ''}<div class="cmt-in"><div class="cmt-box"><textarea name="texto" rows="2" aria-label="Escrever comentário" placeholder="Escreva um comentário… use @ para mencionar alguém" autocomplete="off"></textarea>
<ul class="mn-l" role="listbox" aria-label="Pessoas" hidden></ul></div>
<div class="cmt-a"><small>@ menciona e notifica · Ctrl+Enter envia</small><button type="submit" class="btn pri sm">${svgIc('send')}<span>Comentar</span></button></div></div></form></div>`;
}
function atualizarThread(box) { box.querySelector('.cmt-l').innerHTML = listaComentarios(box.dataset.cmtCol, box.dataset.cmtId); }
function publicar(box) {
  const ta = box.querySelector('textarea'); const texto = ta.value.trim();
  if (!texto) { ta.focus(); toast('Escreva algo antes de comentar.', { tipo: 'warn' }); return; }
  const me = quem(); if (!me) return;
  const mencoes = extrairMencoes(texto);
  const c = db.insert('comments', { refCol: box.dataset.cmtCol, refId: box.dataset.cmtId, autor: me.id, texto, mencoes, quando: new Date().toISOString() });
  const titulo = box.dataset.cmtTitulo || 'um comentário';
  const alvo = mencoes.filter(id => id !== me.id);
  if (alvo.length) enviar({ para: alvo, tipo: 'mencao', titulo: `${me.nome} mencionou você em ${titulo}`, texto, link: location.hash || '#/', refCol: c.refCol, refId: c.refId });
  ta.value = ''; atualizarThread(box);
  toast(alvo.length ? `Comentário publicado · ${alvo.length === 1 ? '1 pessoa notificada' : alvo.length + ' pessoas notificadas'}.` : 'Comentário publicado.', { desfazer: () => { db.remove('comments', c.id); atualizarThread(box); } });
}
/* autocomplete de @menção */
let mnEstado = null; // {box, ta, ini, itens, idx}
function fecharMn() { if (mnEstado) { mnEstado.lista.hidden = true; mnEstado.ta.removeAttribute('aria-activedescendant'); mnEstado.ta.setAttribute('aria-expanded', 'false'); } mnEstado = null; }
function abrirMn(box, ta) {
  const pos = ta.selectionStart; const antes = ta.value.slice(0, pos); const m = /(^|\s)@([\wÀ-ú]*)$/.exec(antes);
  const lista = box.querySelector('.mn-l');
  if (!m) { fecharMn(); return; }
  const q = norm(m[2]);
  const itens = usuariosAtivos().filter(u => !q || norm(u.nome).split(' ').some(p => p.startsWith(q))).slice(0, 6);
  if (!itens.length) { fecharMn(); return; }
  const idx = mnEstado && mnEstado.ta === ta ? Math.min(mnEstado.idx, itens.length - 1) : 0;
  mnEstado = { box, ta, lista, ini: pos - m[2].length - 1, itens, idx };
  ta.setAttribute('aria-expanded', 'true'); ta.setAttribute('aria-controls', lista.id || (lista.id = 'mn-' + Math.random().toString(36).slice(2, 7)));
  desenharMn();
}
function desenharMn() {
  const s = mnEstado; s.lista.hidden = false;
  s.lista.innerHTML = s.itens.map((u, i) => `<li role="option" id="${s.lista.id}-${i}" aria-selected="${i === s.idx}" data-mn="${i}">${avatar(u, 22)}<b>${esc(u.nome)}</b><small>${esc(u.cargo || '')}</small></li>`).join('');
  s.ta.setAttribute('aria-activedescendant', `${s.lista.id}-${s.idx}`);
}
function escolherMn(i) {
  const s = mnEstado; if (!s) return; const u = s.itens[i]; const ta = s.ta;
  const fim = ta.selectionStart; const ins = `@${primeiro(u.nome)} `;
  ta.value = ta.value.slice(0, s.ini) + ins + ta.value.slice(fim);
  const p = s.ini + ins.length; ta.setSelectionRange(p, p); ta.focus(); fecharMn();
}

/* ---------------- notificar alguém ---------------- */
/** botaoNotificar(refCol, refId, titulo, {rotulo, sm, tipo}) -> HTML de botão que abre o modal */
export function botaoNotificar(refCol, refId, titulo, o = {}) {
  return `<button type="button" class="btn${o.sm ? ' sm' : ''}${o.tipo ? ' ' + o.tipo : ''}" data-notificar data-ref-col="${esc(refCol || '')}" data-ref-id="${esc(refId || '')}" data-ref-titulo="${esc(titulo || '')}">${svgIc('bell')}<span>${esc(o.rotulo || 'Notificar alguém')}</span></button>`;
}
/** abre o modal "Notificar alguém": abrirNotificar({refCol, refId, titulo, para:[ids], texto}) -> Promise<bool> */
export function abrirNotificar(o = {}) {
  const me = quem();
  const pessoas = usuariosAtivos().filter(u => !me || u.id !== me.id);
  const pre = new Set(o.para || []);
  const corpo = `<form class="ntf" novalidate>
${o.titulo ? `<p class="ntf-ref">${svgIc('link')}Sobre: <b>${esc(o.titulo)}</b></p>` : ''}
<fieldset class="fld"><legend>Pessoas<span class="req" aria-hidden="true">*</span></legend>
<input type="search" class="ntf-q" placeholder="Buscar pessoa…" aria-label="Buscar pessoa">
<div class="ntf-p" role="group" aria-label="Pessoas">${pessoas.map(u => `<label class="ntf-pi" data-nome="${esc(norm(u.nome))}"><input type="checkbox" name="para" value="${esc(u.id)}"${pre.has(u.id) ? ' checked' : ''}>${avatar(u, 26)}<span><b>${esc(u.nome)}</b><small>${esc(u.cargo || '')}</small></span></label>`).join('')}</div></fieldset>
<div class="fld"><label for="ntf-msg">Mensagem<span class="req" aria-hidden="true">*</span></label><textarea id="ntf-msg" name="texto" rows="3" required placeholder="O que a pessoa precisa saber ou fazer?">${esc(o.texto || '')}</textarea></div>
<div class="ntf-row"><fieldset class="fld"><legend>Prioridade</legend><div class="seg" role="radiogroup"><label><input type="radio" name="prioridade" value="normal" checked><span>Normal</span></label><label><input type="radio" name="prioridade" value="alta"><span>Alta</span></label></div></fieldset>
<fieldset class="fld"><legend>Canais</legend><div class="ntf-c"><label class="ck"><input type="checkbox" name="canais" value="app" checked><span>App</span></label><label class="ck"><input type="checkbox" name="canais" value="whatsapp"><span>WhatsApp</span></label><label class="ck"><input type="checkbox" name="canais" value="email"><span>E-mail</span></label></div></fieldset></div>
</form>`;
  return modal({
    titulo: 'Notificar alguém', corpo, confirmar: 'Enviar notificação', largura: 'md',
    onAbrir: el => {
      const q = el.querySelector('.ntf-q');
      q.addEventListener('input', () => { const v = norm(q.value); el.querySelectorAll('.ntf-pi').forEach(l => { l.hidden = v && !l.dataset.nome.includes(v); }); });
    },
    onConfirmar: el => {
      const f = el.querySelector('form');
      const r = form.validar(f, { para: [v => (!v || !v.length ? 'Escolha pelo menos uma pessoa.' : '')], canais: [v => (!v || !v.length ? 'Escolha pelo menos um canal.' : '')] });
      if (!r.ok) return false;
      const d = r.dados;
      enviar({ para: d.para, texto: d.texto, prioridade: d.prioridade, canais: d.canais, tipo: 'mensagem', titulo: `${me ? me.nome : 'Alguém'}${o.titulo ? ` sobre ${o.titulo}` : ' enviou uma mensagem'}`, link: o.link || location.hash || '#/', refCol: o.refCol, refId: o.refId });
      toast(d.para.length === 1 ? `Notificação enviada para ${(db.get('users', d.para[0]) || {}).nome}.` : `Notificação enviada para ${d.para.length} pessoas.`);
      return true;
    },
  });
}

/* ---------------- delegação ---------------- */
let delegou = false;
export function iniciarDelegacao() {
  if (delegou) return; delegou = true;
  document.addEventListener('submit', e => { const f = e.target.closest('.cmt-f'); if (f) { e.preventDefault(); publicar(f.closest('.cmt')); } });
  document.addEventListener('input', e => { const ta = e.target.closest && e.target.closest('.cmt textarea'); if (ta) abrirMn(ta.closest('.cmt'), ta); });
  document.addEventListener('keydown', e => {
    const ta = e.target.closest && e.target.closest('.cmt textarea'); if (!ta) return;
    if (mnEstado && mnEstado.ta === ta) {
      if (e.key === 'ArrowDown') { e.preventDefault(); mnEstado.idx = (mnEstado.idx + 1) % mnEstado.itens.length; desenharMn(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); mnEstado.idx = (mnEstado.idx - 1 + mnEstado.itens.length) % mnEstado.itens.length; desenharMn(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); escolherMn(mnEstado.idx); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecharMn(); return; }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); publicar(ta.closest('.cmt')); }
  }, true);
  document.addEventListener('mousedown', e => { const li = e.target.closest('.mn-l [data-mn]'); if (li) { e.preventDefault(); escolherMn(Number(li.dataset.mn)); } });
  document.addEventListener('focusout', e => { if (e.target.closest && e.target.closest('.cmt textarea')) setTimeout(() => { if (mnEstado && document.activeElement !== mnEstado.ta) fecharMn(); }, 120); });
  document.addEventListener('click', async e => {
    const d = e.target.closest('[data-cmt-del]');
    if (d) { const box = d.closest('.cmt'); const c = db.remove('comments', d.dataset.cmtDel); atualizarThread(box); toast('Comentário excluído.', { desfazer: () => { db.insert('comments', c); atualizarThread(box); } }); return; }
    const b = e.target.closest('[data-notificar]');
    if (b) { abrirNotificar({ refCol: b.dataset.refCol, refId: b.dataset.refId, titulo: b.dataset.refTitulo }); return; }
    const gt = e.target.closest('[data-nt-grp-toggle]');
    if (gt) { e.preventDefault(); const ul = document.getElementById(gt.getAttribute('aria-controls')); const ab = gt.getAttribute('aria-expanded') !== 'true'; gt.setAttribute('aria-expanded', String(ab)); if (ul) ul.hidden = !ab; gt.closest('.nt-grp') && gt.closest('.nt-grp').classList.toggle('aberto', ab); return; }
    const lg = e.target.closest('[data-nt-lida-grupo]');
    if (lg) { e.preventDefault(); const ids = lg.dataset.ntLidaGrupo.split(','); db.batch(() => ids.forEach(id => marcarLida(id, true))); toast(`${ids.length} notificações marcadas como lidas.`, { desfazer: () => db.batch(() => ids.forEach(id => marcarLida(id, false))) }); return; }
    const ag = e.target.closest('[data-nt-abrir-grupo]');
    if (ag) { const ids = ag.dataset.ntAbrirGrupo.split(',').filter(id => { const n = db.get('notifications', id); return n && !n.lida; }); if (ids.length) db.batch(() => ids.forEach(id => marcarLida(id, true))); return; }
    const l = e.target.closest('[data-nt-lida]');
    if (l) { e.preventDefault(); marcarLida(l.dataset.ntLida); return; }
    const a = e.target.closest('[data-nt-abrir]');
    if (a) { const n = db.get('notifications', a.dataset.ntAbrir); if (n && !n.lida) marcarLida(n.id); }
  });
}

export const notify = { enviar, minhas, naoLidas, marcarLida, marcarTodas, itemHtml, agrupar, grupoHtml, listaHtml, nomeRef, comentarios, botaoNotificar, abrirNotificar, TIPOS, iniciarDelegacao, relTexto: relFmt };
export default notify;
