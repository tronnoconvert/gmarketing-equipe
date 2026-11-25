// shell.js — layout (menu lateral + topo), período, busca global, luz mestra, notificações, perfil, tema e render das rotas.
import { db } from './store.js';
import { auth } from './auth.js';
import { perms, can } from './perms.js';
import { router } from './router.js';
import * as fmt from './fmt.js';
import { esc, norm, plural } from './fmt.js';
import { svgIc } from './icons.js';
import { ui, normEstado, popover, fecharPopovers, fecharTopo, overlaysAbertos, modal, toast, avatar } from './ui.js';
import { charts } from './charts.js';
import { notify } from './notify.js';
import { invasao } from './invasao.js';
import { configurarPaleta, abrirPaleta, fecharPaleta, paletaAberta, teclaPaleta } from './palette.js';

const GRUPOS = [['visao', 'Visão geral'], ['gestao', 'Gestão'], ['trafego', 'Tráfego'], ['marketing', 'Marketing'], ['sistema', 'Sistema']];
const GRUPO_PADRAO = { mesa: 'visao', cockpit: 'visao', financeiro: 'gestao', clientes: 'gestao', operacao: 'gestao', equipe: 'gestao', comercial: 'gestao', torre: 'trafego', campanha: 'trafego', webinars: 'marketing', alertas: 'sistema', notificacoes: 'sistema', admin: 'sistema' };
/* módulos fora do menu lateral (rota continua valendo). Flag do módulo `menu:false` faz o mesmo. */
const MENU_OCULTO = ['notificacoes'];
/* seletor de período só onde ele muda os dados. Flag do módulo `usaPeriodo: true | (path) => bool` tem prioridade. */
const PERIODO_PADRAO = { cockpit: true, financeiro: true, campanha: true, webinars: path => path === 'webinars' };
/* página inicial por papel (cai para a primeira permitida se o papel não puder ver) */
const HOME_PAPEL = { dono: 'cockpit', admin: 'cockpit', head_trafego: 'torre/voo', gestor_trafego: 'torre/voo', cs: 'mesa', producao: 'mesa', comercial: 'mesa', financeiro: 'mesa', leitura: 'mesa' };
export const PERIODOS = [{ id: 'mes', rotulo: 'Mês', meses: 1 }, { id: 'tri', rotulo: 'Trimestre', meses: 3 }, { id: '12m', rotulo: '12 meses', meses: 12 }];
const IGNORAR_RENDER = ['activity', 'notifications', 'comments'];
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ok */ } } };

const mods = [];
const contadoresExtra = new Map();
const provedores = [];
const paginasCore = new Map(); // path -> {titulo, render, mount}
let root = null, view = null, cleanup = null, ultimaRota = null, migalhaExtra = '', pendente = false, montado = false;
let periodoAtual = LS.get('aos-periodo', 'mes');
let menuTorreAberto = null;
const uidLS = () => { const r = auth.real(); return r ? r.id : 'anon'; };
const lsJSON = (k, d) => { try { const v = JSON.parse(LS.get(k, 'null')); return v == null ? d : v; } catch (e) { return d; } };

const titulo = m => m.titulo || m.title || m.id;
const icone = m => m.icone || m.icon || 'grid';
const permDe = m => m.perm || m.id;

/* ---------------- tema ---------------- */
export function tema() { return document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro'; }
export function setTema(t) {
  document.documentElement.dataset.tema = t; LS.set('aos-tema', t);
  const b = document.querySelector('[data-tema-btn]');
  if (b) { b.innerHTML = svgIc(t === 'escuro' ? 'sun' : 'moon'); b.setAttribute('aria-label', t === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'); b.title = b.getAttribute('aria-label'); b.setAttribute('aria-pressed', String(t === 'escuro')); }
  const mc = document.querySelector('meta[name=theme-color]'); if (mc) mc.content = t === 'escuro' ? '#0A1429' : '#F1F3F9';
}

/* ---------------- período ---------------- */
function periodoInfo(id = periodoAtual) {
  const p = PERIODOS.find(x => x.id === id) || PERIODOS[0];
  const fim = new Date(); const inicio = new Date(fim.getFullYear(), fim.getMonth() - (p.meses - 1), 1);
  const ant = new Date(fim.getFullYear(), fim.getMonth() - 1, 1);
  const comparacao = p.id === 'mes' ? `vs ${fmt.mesLongo(ant)}` : p.id === 'tri' ? 'vs trimestre anterior' : 'vs 12 meses anteriores';
  return { ...p, inicio, fim, comparacao };
}

/* ---------------- módulos / menu ---------------- */
function visivel(m) {
  if (m.oculto) return false;
  if (m.sub && m.sub.length) return m.sub.some(s => can(s.perm || permDe(m), 'ver'));
  return can(permDe(m), 'ver');
}
function rotaInicial(m) { if (m.sub && m.sub.length) { const s = m.sub.find(x => can(x.perm || permDe(m), 'ver')); if (s) return s.rota; } return m.rota || (m.routes && m.routes[0]) || m.id; }
function primeiraRota() { const m = mods.find(x => visivel(x) && noMenu(x)); return m ? rotaInicial(m) : 'notificacoes'; }
function noMenu(m) { return m.menu === undefined ? !MENU_OCULTO.includes(m.id) : m.menu !== false; }
/** a pessoa pode abrir este caminho? (módulo visível e, se houver submenu, o subitem permitido) */
function rotaPermitida(path) {
  const mt = router.match(path); if (!mt) return false;
  const m = mt.mod; const sub = melhorSub(m.sub || [], path);
  return sub ? can(sub.perm || permDe(m), 'ver') : visivel(m);
}
/** página inicial da pessoa (por papel), respeitando permissões */
export function rotaHome() {
  const u = auth.user(); const alvo = u && HOME_PAPEL[u.papel];
  if (alvo && rotaPermitida(alvo)) return alvo;
  if (rotaPermitida('mesa')) return 'mesa';
  return primeiraRota();
}
function contadorDe(m) {
  let c = null;
  try { const f = contadoresExtra.get(m.id) || m.contador; if (f) c = f(); } catch (e) { console.error(e); }
  if (c === null || c === undefined || c === false) return '';
  if (typeof c === 'number') c = { n: c };
  if (!c.n) return '';
  // regra: número só para o que é crítico (vermelho); atenção = ponto âmbar sem número; o resto não aparece no menu
  const e = c.estado ? normEstado(c.estado) : '';
  if (e === 'err') return `<span class="cnt s-err" aria-label="${esc(c.rotulo || `${c.n} pendências críticas`)}" title="${esc(c.rotulo || `${c.n} pendências críticas`)}">${esc(c.n)}</span>`;
  if (e === 'warn') { const r = `${c.n} ${c.n === 1 ? 'item pedindo' : 'itens pedindo'} atenção`; return `<span class="cnt-dot" role="img" aria-label="${esc(r)}" title="${esc(c.rotulo ? `${c.rotulo} — ${r}` : r)}"></span>`; }
  return '';
}
function modAtivo() { return ultimaRota && ultimaRota.mod; }
function menuHtml() {
  const atual = modAtivo(); const path = ultimaRota ? ultimaRota.path : '';
  const out = [];
  for (const [g, nome] of GRUPOS) {
    const itens = mods.filter(m => (m.grupo || GRUPO_PADRAO[m.id] || 'sistema') === g && visivel(m) && noMenu(m));
    if (!itens.length) continue;
    out.push(`<div class="nv-g"><p class="nv-gt">${esc(nome)}</p><ul>`);
    for (const m of itens) {
      const on = atual && atual.id === m.id;
      if (m.sub && m.sub.length) {
        const subs = m.sub.filter(s => can(s.perm || permDe(m), 'ver'));
        const aberto = menuTorreAberto === null ? on : menuTorreAberto;
        out.push(`<li class="nv-i has-sub${on ? ' on' : ''}" data-mod="${esc(m.id)}"><button type="button" class="nv-a" aria-expanded="${aberto}" data-sub-toggle aria-controls="sub-${esc(m.id)}">${svgIc(icone(m))}<span class="nv-l">${esc(titulo(m))}</span>${contadorDe(m)}<span class="nv-chev">${svgIc('chev-down')}</span></button>
<ul class="nv-sub" id="sub-${esc(m.id)}"${aberto ? '' : ' hidden'}>${subs.map(s => { const ms = melhorSub(m.sub, path); const sOn = ms ? ms === s : (s === subs[0] && on); return `<li><a href="#/${esc(s.rota)}" class="nv-sa"${sOn ? ' aria-current="page"' : ''} data-sub="${esc(s.id)}">${esc(s.titulo)}</a></li>`; }).join('')}</ul></li>`);
      } else {
        out.push(`<li class="nv-i${on ? ' on' : ''}" data-mod="${esc(m.id)}"><a class="nv-a" href="#/${esc(rotaInicial(m))}"${on ? ' aria-current="page"' : ''}>${svgIc(icone(m))}<span class="nv-l">${esc(titulo(m))}</span>${contadorDe(m)}</a></li>`);
      }
    }
    out.push('</ul></div>');
  }
  return out.join('');
}
function cartaoUsuario() {
  const u = auth.user(); if (!u) return '';
  return `<button type="button" class="sb-me" data-perfil aria-haspopup="menu">${avatar(u, 32)}<span class="sb-me-t"><b>${esc(u.nome)}</b><small>${esc(perms.rotuloPapel(u.papel))}</small></span>${svgIc('more')}</button>`;
}

/* ---------------- luz mestra ---------------- */
export function luzMestra() {
  const est = x => normEstado(x.estado || x.gravidade || x.nivel || 'ok');
  const abertos = db.list('alerts', a => !a.resolvido && !['resolvido', 'adiado', 'arquivado'].includes(a.status));
  const torre = [...db.list('routines'), ...db.list('integrations')].filter(x => x.ativo !== false);
  const errA = abertos.filter(a => est(a) === 'err').length;
  const errT = torre.filter(x => est(x) === 'err').length;
  const warn = abertos.filter(a => est(a) === 'warn').length + torre.filter(x => est(x) === 'warn').length;
  if (errA) return { estado: 'err', texto: plural(errA, 'alerta crítico', 'alertas críticos') };
  if (errT) return { estado: 'err', texto: `${errT} ${errT === 1 ? 'falha' : 'falhas'} na Torre` };
  if (warn) return { estado: 'warn', texto: `${warn} ${warn === 1 ? 'ponto' : 'pontos'} de atenção` };
  // sem rotina nem integração ativa não há o que estar "operando": estado neutro em vez de um "tudo ok" falso
  if (!torre.length) return { estado: 'off', texto: 'Sem rotinas configuradas' };
  return { estado: 'ok', texto: 'Tudo operando' };
}

/* ---------------- layout ---------------- */
function layoutHtml() {
  return `<a class="skip" href="#view" data-skip>Pular para o conteúdo</a>
<div class="app">
<aside class="sb" id="sb" aria-label="Menu principal">
  <div class="sb-top"><a class="brand" id="brand" href="#/${esc(rotaHome())}" aria-label="Gmarketing — ir para o início"><span class="brand-mk brand-g" aria-hidden="true">G</span><b>Gmarketing</b></a>${ui.btnIc('x', 'Fechar menu', { 'data-sb-fechar': '' }, { cls: 'sb-x' })}</div>
  <nav class="nv" id="nv" aria-label="Seções">${menuHtml()}</nav>
  <div class="sb-foot" id="sb-me">${cartaoUsuario()}</div>
</aside>
<div class="sb-scrim" data-sb-fechar></div>
<button type="button" class="sb-tg" data-sb-tg aria-controls="sb" aria-expanded="true" aria-label="Esconder menu lateral" title="Esconder menu lateral">${svgIc('arrow-left')}</button>
<div class="main-c">
  <header class="tb" id="tb">
    <div class="tb-row">
      ${ui.btnIc('menu', 'Abrir menu', { 'data-sb-abrir': '', 'aria-controls': 'sb' }, { cls: 'tb-ham' })}
      <nav class="crumb" id="crumb" aria-label="Você está em"></nav>
      <div class="tb-r">
        <div class="tb-per" id="tb-per" aria-hidden="true">${segPeriodo()}</div>
        <div class="gs" id="gs"><span class="gs-ic">${svgIc('search')}</span><input id="gs-in" type="search" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="gs-res" placeholder="Buscar cliente, pessoa…" aria-label="Busca global" autocomplete="off"><button type="button" class="gs-k" data-paleta aria-label="Abrir paleta de comandos (${esc(teclaPaleta())})" title="Paleta de comandos · ${esc(teclaPaleta())}"><kbd>${esc(teclaPaleta())}</kbd></button></div>
        ${ui.btnIc('search', 'Buscar', { 'data-gs-abrir': '' }, { cls: 'tb-sb' })}
        <a class="ml" id="ml" href="#/alertas"></a>
        <button type="button" class="ib tb-bell" id="bell" aria-haspopup="dialog" aria-label="Notificações">${svgIc('bell')}<span class="ib-badge" hidden></span></button>
        <button type="button" class="ib" data-tema-btn></button>
        <button type="button" class="tb-av" data-perfil aria-haspopup="menu" aria-label="Menu do perfil"></button>
      </div>
    </div>
    <div class="tb-per-m" id="tb-per-m" aria-hidden="true">${segPeriodo()}</div>
  </header>
  <div class="vc" id="vc" hidden></div>
  <main class="view" id="view" tabindex="-1"></main>
</div></div>
<nav class="bnav" id="bnav" aria-label="Atalhos"></nav>`;
}
function segPeriodo() {
  return `<div class="seg per" role="group" aria-label="Período" data-seg-manual>${PERIODOS.map(p => `<button type="button" data-periodo="${p.id}" aria-pressed="${p.id === periodoAtual}">${esc(p.rotulo)}</button>`).join('')}</div>`;
}
function atualizarChrome() {
  if (!montado) return;
  const nv = document.getElementById('nv'); if (nv) nv.innerHTML = menuHtml();
  const me = document.getElementById('sb-me'); if (me) me.innerHTML = cartaoUsuario();
  const u = auth.user();
  const av = document.querySelector('.tb-av'); if (av && u) av.innerHTML = avatar(u, 30);
  const br = document.getElementById('brand'); if (br) br.setAttribute('href', `#/${rotaHome()}`);
  const bn = document.getElementById('bnav'); if (bn) bn.innerHTML = barraInferiorHtml();
  // luz mestra
  const ml = document.getElementById('ml'); const l = luzMestra();
  if (ml) {
    ml.className = `ml s-${l.estado}`; ml.innerHTML = `${ui.led(l.estado, false)}<span class="ml-t">${esc(l.texto)}</span>`;
    ml.setAttribute('aria-label', `Estado geral: ${l.texto}${can('alertas') ? '. Abrir Alertas e Insights' : ''}`); ml.title = l.texto;
    if (can('alertas')) ml.setAttribute('href', '#/alertas'); else ml.removeAttribute('href');
  }
  // sino
  const n = notify.naoLidas(); const bb = document.querySelector('#bell .ib-badge');
  if (bb) { bb.hidden = !n; bb.textContent = n > 99 ? '99+' : String(n); }
  const bell = document.getElementById('bell'); if (bell) bell.setAttribute('aria-label', n ? `Notificações: ${n} não lidas` : 'Notificações');
  // ver como
  const vc = document.getElementById('vc');
  if (vc) {
    if (auth.vendoComo()) { const r = auth.real(); vc.hidden = false; vc.innerHTML = `${svgIc('eye')}<span>Vendo como <b>${esc(u.nome)}</b> <span class="vc-p">(${esc(perms.rotuloPapel(u.papel))})</span> · <b class="vc-ro">somente visualização</b></span><span class="vc-sep" aria-hidden="true">·</span><button type="button" class="vc-b" data-voltar>Voltar para ${esc(fmt.primeiro(r.nome))}</button>`; document.documentElement.classList.add('vendo-como'); }
    else { vc.hidden = true; vc.innerHTML = ''; document.documentElement.classList.remove('vendo-como'); }
  }
  document.querySelectorAll('[data-periodo]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.periodo === periodoAtual)));
  if (sinoPop) {
    const foco = document.activeElement && sinoPop.el.contains(document.activeElement);
    const abertos = Array.from(sinoPop.el.querySelectorAll('.nt-grp.aberto')).map(x => x.dataset.ngrp);
    sinoPop.el.innerHTML = painelSino();
    abertos.forEach(k => { const g = sinoPop.el.querySelector(`.nt-grp[data-ngrp="${CSS.escape(k)}"]`); if (!g) return; g.classList.add('aberto'); const b = g.querySelector('[data-nt-grp-toggle]'); b && b.setAttribute('aria-expanded', 'true'); const ul = g.querySelector('.nt-sub'); if (ul) ul.hidden = false; });
    if (foco) { const f = sinoPop.el.querySelector('button, a'); f && f.focus(); }
  }
}
function atualizarCrumb(mod) {
  const c = document.getElementById('crumb'); if (!c) return;
  const g = mod ? (GRUPOS.find(x => x[0] === (mod.grupo || GRUPO_PADRAO[mod.id])) || [])[1] : '';
  const partes = [];
  if (g) partes.push(`<span class="cr-g">${esc(g)}</span>`);
  if (mod) partes.push(migalhaExtra ? `<a href="#/${esc(rotaInicial(mod))}">${esc(titulo(mod))}</a>` : `<b>${esc(titulo(mod))}</b>`);
  else partes.push(`<b>${esc(migalhaExtra || 'Gmarketing')}</b>`);
  if (mod && migalhaExtra) partes.push(`<b>${esc(migalhaExtra)}</b>`);
  c.innerHTML = partes.join(`<span class="cr-s" aria-hidden="true">${svgIc('chev')}</span>`);
  document.title = `${migalhaExtra ? migalhaExtra + ' · ' : ''}${mod ? titulo(mod) + ' · ' : ''}Gmarketing`;
}

/* ---------------- render das rotas ---------------- */
function criarCtx(r, mod) {
  const ctx = {
    params: r.params, query: r.query, path: r.path, periodo: periodoAtual, periodoInfo: periodoInfo(), user: auth.user(), real: auth.real(),
    can: (m, a) => (a === undefined && ['ver', 'editar', 'excluir', 'admin'].includes(m) ? can(mod ? permDe(mod) : m, m) : can(m, a)),
    pode: a => can(mod ? permDe(mod) : '', a || 'ver'),
    escopoClientes: () => perms.escopoClientes(), veReceita: () => perms.veReceita(), perms, db, ui, charts, fmt, notify, router, shell,
    refresh: () => renderAtual(true), migalha: t => { migalhaExtra = t || ''; atualizarCrumb(mod); }, mod,
  };
  return ctx;
}
function paginaErro(icone, tituloT, texto, acao) {
  return `<div class="pg pg-erro">${ui.vazio({ icone, titulo: tituloT, texto, acao })}</div>`;
}
// re-render da rota ATUAL da URL (não da última salva): mudanças via router.setQuery(..., {render:false}) valem, e parâmetros de uso único já limpos não voltam
function renderAtual(manterScroll = false) { if (ultimaRota) renderRota(router.atualizar(), manterScroll); }
let contRenders = 0;
async function renderRota(r, manterScroll = false) {
  if (!montado) return;
  const mudouPath = !ultimaRota || ultimaRota.path !== r.path;
  ultimaRota = r; pendente = false; contRenders++;
  fecharPopovers(); fecharDrawerMenu();
  if (mudouPath) migalhaExtra = '';
  const qp = r.query.p; if (qp && PERIODOS.some(p => p.id === qp) && qp !== periodoAtual) { periodoAtual = qp; LS.set('aos-periodo', qp); }
  if (!r.path) { router.go(router.href(rotaHome(), {}), { replace: true }); return; }
  const y = window.scrollY;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  let mod = r.mod; let html = ''; let mountFn = null; const core = paginasCore.get(r.path);
  if (core) { mod = null; migalhaExtra = core.titulo; }
  mostrarPeriodo(usaPeriodo(mod, r, core));
  const chaveIntro = core ? `_${r.path}` : (r.pattern || r.path);
  ui.definirIntro({ chave: chaveIntro, visitas: mudouPath ? contarVisita(chaveIntro) : visitasDe(chaveIntro) });
  const ctx = criarCtx(r, mod);
  if (core) { html = core.render(ctx); mountFn = core.mount; }
  else if (!mod) { html = paginaErro('search', 'Página não encontrada', `O endereço "#/${r.path}" não existe ou foi movido. Confira o link ou volte ao início.`, { rotulo: 'Ir para o início', href: `#/${rotaHome()}` }); }
  else {
    const sub = melhorSub(mod.sub || [], r.path);
    const p = sub ? (sub.perm || permDe(mod)) : permDe(mod);
    const permitido = sub ? can(p, 'ver') : (mod.sub && mod.sub.length ? can(p, 'ver') : visivel(mod));
    if (!permitido) html = paginaErro('lock', 'Acesso restrito', 'Você não tem acesso a esta área. Peça ao administrador.', { rotulo: 'Voltar ao início', href: `#/${rotaHome()}` });
    else {
      try {
        const out = mod.render(ctx);
        if (out && typeof out.then === 'function') { view.innerHTML = ui.skeleton({ linhas: 5 }); html = await out; if (ultimaRota !== r) return; }
        else html = out;
        mountFn = mod.mount;
      } catch (e) {
        console.error(`[Gmarketing] erro ao renderizar ${mod.id}:`, e);
        html = paginaErro('alert', 'Algo deu errado nesta tela', 'Recarregue a página. Se continuar, avise o administrador com o horário do erro.', { rotulo: 'Recarregar', attrs: { onclick: 'location.reload()' } });
      }
    }
  }
  view.innerHTML = html || '';
  view.dataset.rota = r.pattern || r.path;
  if (mountFn) { try { const c = mountFn(view, ctx); if (typeof c === 'function') cleanup = c; } catch (e) { console.error(`[Gmarketing] erro no mount de ${mod ? mod.id : r.path}:`, e); } }
  atualizarChrome(); atualizarCrumb(mod);
  posRender(view);
  if (mudouPath) { window.scrollTo(0, 0); if (document.activeElement === document.body || !document.activeElement || !root.contains(document.activeElement) || document.activeElement.closest('.nv')) view.focus({ preventScroll: true }); }
  else if (manterScroll) window.scrollTo(0, y);
  reportarTeste(r);
}
/* ---------------- período visível só onde muda os dados ---------------- */
function usaPeriodo(mod, r, core) {
  if (core) return !!core.usaPeriodo;
  if (!mod) return false;
  let f = mod.usaPeriodo; if (f === undefined) f = PERIODO_PADRAO[mod.id];
  try { return typeof f === 'function' ? !!f(r.path, r) : !!f; } catch (e) { return false; }
}
function mostrarPeriodo(sim) {
  document.documentElement.classList.toggle('sem-periodo', !sim);
  ['tb-per', 'tb-per-m'].forEach(id => { const el = document.getElementById(id); if (!el) return; el.setAttribute('aria-hidden', String(!sim)); el.querySelectorAll('button').forEach(b => { b.tabIndex = sim ? 0 : -1; }); });
}
/* ---------------- visitas por página (introdução some depois da 2ª) ---------------- */
const chaveVisitas = () => `aos-visitas:${uidLS()}`;
function visitasDe(k) { return (lsJSON(chaveVisitas(), {})[k]) || 0; }
function contarVisita(k) { const m = lsJSON(chaveVisitas(), {}); m[k] = (m[k] || 0) + 1; LS.set(chaveVisitas(), JSON.stringify(m)); return m[k]; }
function posRender(el) { charts.hidratar(el); ui.hidratar(el); charts.ativarTooltips(document.body); atualizarRel(el); }
function reportarTeste(r) {
  if (typeof window.__aosReport !== 'function') return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const d = document.documentElement;
    try { window.__aosReport({ rota: r.path || '', query: r.query, scrollWidth: d.scrollWidth, innerWidth: window.innerWidth, overflow: d.scrollWidth > window.innerWidth + 1 }); } catch (e) { /* teste */ }
  }));
}
function atualizarRel(el = document) {
  el.querySelectorAll('time[data-rel="iso"]').forEach(t => { const v = fmt.rel(t.getAttribute('datetime')); t.textContent = (t.dataset.prefixo || '') + v; });
}

/* ---------------- busca global ---------------- */
function buscar(q) {
  const res = coletarBusca(q);
  const grupos = new Map(); res.forEach(r => { if (!grupos.has(r.tipo)) grupos.set(r.tipo, []); const g = grupos.get(r.tipo); if (g.length < 6 && !g.some(x => x.href === r.href && x.titulo === r.titulo)) g.push(r); });
  return Array.from(grupos.entries());
}
/** resultados crus de todas as fontes (módulos, provedores, páginas, pessoas) */
function coletarBusca(q, o = {}) {
  q = norm(q).trim(); if (q.length < 2) return [];
  const res = [];
  const add = (l, origem) => { (l || []).forEach(x => { if (x && x.titulo && x.href) res.push({ ...x, tipo: x.tipo || origem }); }); };
  for (const m of mods) { if (m.busca && visivel(m)) { try { add(m.busca(q), titulo(m)); } catch (e) { console.error(e); } } }
  for (const fn of provedores) { try { add(fn(q), 'Outros'); } catch (e) { console.error(e); } }
  // páginas
  if (o.paginas !== false) mods.filter(visivel).forEach(m => {
    if (norm(titulo(m)).includes(q)) res.push({ tipo: 'Páginas', titulo: titulo(m), sub: (GRUPOS.find(g => g[0] === (m.grupo || GRUPO_PADRAO[m.id])) || [])[1], href: `#/${rotaInicial(m)}`, icone: icone(m) });
    (m.sub || []).filter(s => can(s.perm || permDe(m), 'ver') && norm(s.titulo).includes(q)).forEach(s => res.push({ tipo: 'Páginas', titulo: `${titulo(m)} › ${s.titulo}`, href: `#/${s.rota}`, icone: icone(m) }));
  });
  // pessoas (se nenhum módulo já trouxe)
  if (!res.some(r => r.tipo === 'Pessoas')) {
    const verEquipe = can('equipe');
    db.list('team', t => t.ativo !== false && (norm(t.nome).includes(q) || norm(t.cargo).includes(q) || norm(t.area).includes(q))).forEach(t => res.push({ tipo: 'Pessoas', titulo: t.nome, sub: t.cargo, href: verEquipe ? `#/equipe/${t.id}` : '#/notificacoes', avatar: t }));
  }
  return res;
}
let gsPop = null, gsIdx = -1, gsItens = [];
function desenharBusca(inp) {
  const q = inp.value; const grupos = buscar(q);
  gsItens = grupos.flatMap(([, l]) => l); gsIdx = gsItens.length ? 0 : -1;
  let html;
  if (norm(q).trim().length < 2) html = `<div class="gs-dica">${svgIc('search')}<span>Digite pelo menos 2 letras. Busca em clientes, pessoas, tarefas, webinars e páginas.</span></div>`;
  else if (!gsItens.length) html = `<div class="gs-dica">${svgIc('info')}<span>Nada encontrado para “${esc(q)}”. Tente outro termo ou confira a grafia.</span></div>`;
  else {
    let k = 0;
    html = grupos.map(([g, l]) => `<div class="gs-g" role="group" aria-label="${esc(g)}"><p class="gs-gt">${esc(g)}</p>${l.map(r => { const i = k++; return `<a role="option" id="gs-o-${i}" class="gs-o" href="${esc(r.href)}" aria-selected="${i === gsIdx}" data-gs-i="${i}">${r.avatar ? avatar(r.avatar, 24) : `<span class="gs-oi">${svgIc(r.icone || 'arrow-right')}</span>`}<span class="gs-ot"><b>${esc(r.titulo)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>${r.led ? ui.led(r.led, false) : ''}</a>`; }).join('')}</div>`).join('');
  }
  html = `<div id="gs-res" role="listbox" aria-label="Resultados da busca">${html}</div><div class="gs-f"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div>`;
  const anc = document.getElementById('gs');
  if (!gsPop) { gsPop = popover(anc, html, { cls: 'gs-pop', role: 'presentation', largura: Math.max(anc.offsetWidth, 420), onFechar: () => { gsPop = null; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); } }); }
  else gsPop.el.innerHTML = html;
  inp.setAttribute('aria-expanded', 'true');
  marcarBusca(inp);
}
function marcarBusca(inp) {
  if (!gsPop) return;
  gsPop.el.querySelectorAll('[data-gs-i]').forEach(a => a.setAttribute('aria-selected', String(Number(a.dataset.gsI) === gsIdx)));
  if (gsIdx >= 0) { inp.setAttribute('aria-activedescendant', `gs-o-${gsIdx}`); const a = gsPop.el.querySelector(`#gs-o-${gsIdx}`); a && a.scrollIntoView({ block: 'nearest' }); }
}
function focarBusca() {
  const inp = document.getElementById('gs-in'); if (!inp) return;
  if (getComputedStyle(document.getElementById('gs')).display === 'none') document.documentElement.classList.add('gs-m');
  inp.focus(); inp.select();
}
function ligarBusca() {
  const inp = document.getElementById('gs-in'); let t = null;
  inp.addEventListener('blur', () => setTimeout(() => { if (!gsPop) document.documentElement.classList.remove('gs-m'); }, 150));
  inp.addEventListener('input', () => { clearTimeout(t); if (!inp.value.trim()) { if (gsPop) gsPop.fechar(); return; } t = setTimeout(() => desenharBusca(inp), 90); });
  inp.addEventListener('focus', () => { if (inp.value) desenharBusca(inp); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!gsPop) desenharBusca(inp); if (!gsItens.length) return; gsIdx = (gsIdx + (e.key === 'ArrowDown' ? 1 : -1) + gsItens.length) % gsItens.length; marcarBusca(inp); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = gsItens[gsIdx]; if (r) { fecharBusca(true); location.hash = r.href.replace(/^#/, ''); } }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); clearTimeout(t); if (gsPop) gsPop.fechar(); else { fecharBusca(true); } }
  });
}
function fecharBusca(limpar) {
  if (gsPop) gsPop.fechar();
  const inp = document.getElementById('gs-in'); if (inp && limpar) { inp.value = ''; inp.blur(); }
  document.documentElement.classList.remove('gs-m');
}

/* ---------------- barra inferior (celular < 700 px) ---------------- */
function barraInferiorHtml() {
  const u = auth.user(); if (!u) return '';
  const path = ultimaRota ? ultimaRota.path : '';
  const home = rotaHome();
  const base = [
    { id: 'hoje', rotulo: 'Hoje', icone: 'home', href: home, ativo: p => p === home || p.startsWith(home + '/') },
    { id: 'clientes', rotulo: 'Clientes', icone: 'building', href: 'clientes', ativo: p => p.split('/')[0] === 'clientes' },
    { id: 'tarefas', rotulo: 'Tarefas', icone: 'kanban', href: 'operacao/quadro', ativo: p => p.split('/')[0] === 'operacao' },
  ];
  const reservas = [
    { id: 'webinars', rotulo: 'Webinars', icone: 'video', href: 'webinars', ativo: p => p.split('/')[0] === 'webinars' },
    { id: 'alertas', rotulo: 'Alertas', icone: 'alert', href: 'alertas', ativo: p => p.split('/')[0] === 'alertas' },
    { id: 'comercial', rotulo: 'Comercial', icone: 'briefcase', href: 'comercial', ativo: p => p.split('/')[0] === 'comercial' },
    { id: 'equipe', rotulo: 'Equipe', icone: 'users', href: 'equipe', ativo: p => p.split('/')[0] === 'equipe' },
  ];
  const out = [];
  const usa = x => out.some(o => o.href === x.href || o.href.split('/')[0] === x.href.split('/')[0]);
  for (const c of base) {
    if (rotaPermitida(c.href) && !usa(c)) { out.push(c); continue; }
    const r = reservas.find(x => rotaPermitida(x.href) && !usa(x)); if (r) out.push(r);
  }
  const n = notify.naoLidas();
  out.push({ id: 'notificacoes', rotulo: 'Notificações', icone: 'bell', href: 'notificacoes', ativo: p => p.split('/')[0] === 'notificacoes', badge: n });
  let marcou = false;
  return out.slice(0, 4).map(i => {
    const on = !marcou && i.ativo(path); if (on) marcou = true;
    const rot = i.badge ? `${i.rotulo}: ${i.badge} não ${i.badge === 1 ? 'lida' : 'lidas'}` : i.rotulo;
    return `<a class="bn-i" href="#/${esc(i.href)}" data-bn="${esc(i.id)}"${on ? ' aria-current="page"' : ''}${i.badge ? ` aria-label="${esc(rot)}"` : ''}><span class="bn-ic">${svgIc(i.icone)}${i.badge ? `<span class="bn-b" aria-hidden="true">${i.badge > 99 ? '99+' : i.badge}</span>` : ''}</span><span class="bn-l">${esc(i.rotulo)}</span></a>`;
  }).join('');
}

/* ---------------- paleta de comandos (fontes) ---------------- */
const nomeGrupo = m => (GRUPOS.find(g => g[0] === (m.grupo || GRUPO_PADRAO[m.id])) || [])[1] || '';
function paginasPaleta() {
  const out = [];
  mods.filter(visivel).forEach(m => {
    const g = nomeGrupo(m);
    const subs = (m.sub || []).filter(s => can(s.perm || permDe(m), 'ver'));
    if (subs.length) subs.forEach(s => out.push({ k: `p:${s.rota}`, titulo: `${titulo(m)} › ${s.titulo}`, sub: g, href: `#/${s.rota}`, icone: icone(m), palavras: [s.titulo, titulo(m), ...(s.palavras || [])], tipoRotulo: 'Página' }));
    else out.push({ k: `p:${m.id}`, titulo: titulo(m), sub: g || 'Sistema', href: `#/${rotaInicial(m)}`, icone: icone(m), palavras: m.palavras || [], tipoRotulo: 'Página' });
  });
  return out;
}
function acoesPaleta() {
  const A = []; const r = auth.real(); const n = notify.naoLidas();
  const add = (cond, o) => { if (cond) A.push({ tipoRotulo: 'Ação', ...o, k: `a:${o.cmd}` }); };
  add(can('clientes', 'editar') && rotaPermitida('clientes/novo'), { cmd: 'cliente-novo', titulo: 'Cadastrar cliente', sub: 'Clientes · novo cadastro', icone: 'building', href: '#/clientes/novo', palavras: ['novo cliente', 'adicionar cliente'] });
  add(can('operacao', 'editar') && rotaPermitida('operacao/quadro'), { cmd: 'tarefa-nova', titulo: 'Nova tarefa', sub: 'Operação · abre o formulário no quadro', icone: 'plus', href: '#/operacao/quadro', gatilho: '[data-nova]', palavras: ['criar tarefa', 'adicionar tarefa'] });
  add(can('webinars', 'editar') && rotaPermitida('webinars/novo'), { cmd: 'webinar-novo', titulo: 'Novo webinar', sub: 'Webinars · planejamento', icone: 'video', href: '#/webinars/novo', palavras: ['criar webinar', 'nova live', 'lançamento'] });
  add(can('comercial', 'editar') && rotaPermitida('comercial'), { cmd: 'oportunidade-nova', titulo: 'Nova oportunidade', sub: 'Comercial · pipeline', icone: 'briefcase', href: '#/comercial', gatilho: '[data-nova]', palavras: ['novo lead', 'nova proposta', 'novo negócio'] });
  add(rotaPermitida('mesa'), { cmd: 'ir-mesa', titulo: 'Ir para Minha mesa', sub: 'Sua fila do dia', icone: 'inbox', href: '#/mesa', palavras: ['hoje', 'minha fila', 'mesa'] });
  add(true, { cmd: 'notificacoes', titulo: 'Ver notificações', sub: n ? `${n} não ${n === 1 ? 'lida' : 'lidas'}` : 'Central e preferências', icone: 'bell', href: '#/notificacoes', palavras: ['preferências de notificação', 'resumo diário', 'central'] });
  add(true, { cmd: 'tema', titulo: tema() === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro', sub: 'Alternar tema', icone: tema() === 'escuro' ? 'sun' : 'moon', acao: alternarTema, palavras: ['alternar tema', 'modo escuro', 'modo claro', 'tema'] });
  add(true, { cmd: 'densidade', titulo: densidade() === 'compacta' ? 'Densidade confortável' : 'Densidade compacta', sub: densidade() === 'compacta' ? 'Tabelas com mais respiro' : 'Mais linhas por tela nas tabelas', icone: 'list', acao: alternarDensidade, palavras: ['tabelas compactas', 'densidade', 'compacta', 'confortável'] });
  add(auth.vendoComo(), { cmd: 'voltar', titulo: `Voltar para ${r ? r.nome : 'sua visão'}`, sub: 'Sair do "ver como"', icone: 'arrow-left', acao: () => { auth.voltar(); toast('Você voltou à sua visão.', { tipo: 'info' }); } });
  add(auth.podeVerComo() && !auth.vendoComo(), { cmd: 'ver-como', titulo: 'Ver como…', sub: 'Ver o app como outra pessoa', icone: 'eye', acao: abrirVerComo, secundaria: true });
  add(true, { cmd: 'atalhos', titulo: 'Atalhos de teclado', icone: 'keyboard', acao: ajudaAtalhos, secundaria: true, atalho: '?' });
  add(true, { cmd: 'sair', titulo: 'Sair', sub: 'Encerrar a sessão', icone: 'log-out', acao: sair, secundaria: true });
  // comandos dos módulos: m.comandos() -> [{id?, titulo, sub, icone, acao: fn | '#/rota', gatilho?, palavras?}] (mesmo id substitui o embutido)
  for (const m of mods) {
    if (typeof m.comandos !== 'function' || !visivel(m)) continue;
    let l = []; try { l = m.comandos() || []; } catch (e) { console.error(e); }
    l.forEach((c, i) => {
      if (!c || !c.titulo) return;
      const id = c.id || `${m.id}:${i}`;
      const it = { tipoRotulo: 'Ação', icone: icone(m), ...c, cmd: id, k: `a:${id}`, acao: typeof c.acao === 'function' ? c.acao : undefined, href: typeof c.acao === 'string' ? c.acao : c.href };
      const ex = A.findIndex(a => a.cmd === id); if (ex >= 0) A[ex] = it; else A.push(it);
    });
  }
  return A;
}
/** comandos que dependem do texto: "cobrar bella" -> faturas em aberto da Bella */
function dinamicosPaleta(q) {
  const m = /^cobr(ar|a)?\b\s*(.*)$/.exec(q);
  if (!m || !can('financeiro', 'ver') || !rotaPermitida('financeiro/receber')) return [];
  const resto = (m[2] || '').trim(); const edita = can('financeiro', 'editar'); const valor = perms.veReceita();
  return db.list('invoices', f => f.status !== 'paga' && f.status !== 'cancelada' && (!resto || norm(f.cliente || '').includes(resto) || String(f.numero || '') === resto))
    .sort((a, b) => String(a.vencimento || '').localeCompare(String(b.vencimento || ''))).slice(0, 5)
    .map(f => { const venc = f.vencimento && fmt.diasAte(f.vencimento) < 0; return { tipo: 'Cobrar', cmd: `cobrar:${f.id}`, k: `c:${f.id}`, titulo: `Cobrar ${f.cliente || 'fatura ' + (f.numero || '')}`, sub: [f.descricao || 'Fatura', valor ? fmt.brl(f.valor) : '', f.vencimento ? `${venc ? 'venceu' : 'vence'} ${fmt.data(f.vencimento)}` : ''].filter(Boolean).join(' · '), icone: 'send', led: venc ? 'err' : 'warn', href: edita ? `#/financeiro/receber?cobrar=${f.id}` : `#/financeiro/receber?f=todas&fatura=${f.id}`, tipoRotulo: edita ? 'Cobrar' : 'Ver fatura', score: resto ? 99 : 80 }; });
}
function irPara(href, gatilho) {
  const h = String(href).startsWith('#') ? href : `#/${String(href).replace(/^\/+/, '')}`;
  router.go(h);
  if (!gatilho) return;
  const alvo = h.replace(/^#\/?/, '').split('?')[0]; let n = 0;
  const tick = () => { const b = ultimaRota && ultimaRota.path === alvo && view && view.querySelector(gatilho); if (b && !b.disabled) { b.click(); return; } if (++n < 60) setTimeout(tick, 50); };
  setTimeout(tick, 30);
}
function executarItem(it) {
  if (typeof it.acao === 'function') { it.acao(); return; }
  if (it.cmd && !it.href) { const a = acoesPaleta().find(x => x.cmd === it.cmd); if (a) { if (a.acao) { a.acao(); return; } it = a; } }
  if (it.href) irPara(it.href, it.gatilho);
}
function fontesPaleta() {
  return { usuario: () => auth.real(), paginas: paginasPaleta, acoes: acoesPaleta, busca: q => coletarBusca(q, { paginas: false }), dinamicos: dinamicosPaleta, executar: executarItem };
}

/* ---------------- painéis ---------------- */
let sinoPop = null, perfilPop = null;
function painelSino() {
  const l = notify.minhas({ limite: 40 }); const n = notify.naoLidas();
  return `<div class="np-h"><h2>Notificações</h2>${n ? `<button type="button" class="lnk" data-marcar-todas>Marcar todas como lidas</button>` : '<span class="np-ok">Tudo lido</span>'}</div>
<ul class="np-l">${l.length ? notify.listaHtml(l, { limite: 8 }) : `<li class="np-vz">${ui.vazio({ icone: 'bell', titulo: 'Sem notificações', texto: 'Quando alguém mencionar você ou um alerta disparar, aparece aqui.', compacto: true })}</li>`}</ul>
<a class="np-f" href="#/notificacoes">Ver todas as notificações${svgIc('arrow-right')}</a>`;
}
function abrirSino() {
  const b = document.getElementById('bell'); if (!b) return;
  if (sinoPop) { sinoPop.fechar(); return; }
  fecharPopovers();
  sinoPop = popover(b, painelSino(), { cls: 'ntp', rotulo: 'Notificações', largura: 400, onFechar: () => { sinoPop = null; } });
  sinoPop.el.addEventListener('click', e => {
    if (e.target.closest('[data-marcar-todas]')) { const k = notify.marcarTodas(); toast(k === 1 ? '1 notificação marcada como lida.' : `${k} notificações marcadas como lidas.`); }
    else if (e.target.closest('[data-nt-abrir], [data-nt-abrir-grupo], .np-f')) setTimeout(() => sinoPop && sinoPop.fechar(), 0);
  });
  const f = sinoPop.el.querySelector('button, a'); f && f.focus();
}
function menuPerfil(anc) {
  if (perfilPop) { perfilPop.fechar(); return; }
  fecharPopovers();
  const u = auth.user(), r = auth.real();
  const it = (icn, txt, a) => `<button type="button" role="menuitem" class="pm-i"${a}>${svgIc(icn)}<span>${esc(txt)}</span></button>`;
  const html = `<div class="pm-h">${avatar(u, 36)}<div><b>${esc(u.nome)}</b><small>${esc(u.email)}</small><small class="pm-p">${esc(perms.rotuloPapel(u.papel))}</small></div></div>
<div class="pm-l" role="menu" aria-label="Perfil">
${`<a role="menuitem" class="pm-i" href="#/equipe/${esc(u.teamId)}">${svgIc('user')}<span>Meu perfil</span></a>`}
${auth.vendoComo() ? it('arrow-left', `Voltar para ${r.nome}`, ' data-voltar') : auth.podeVerComo() ? it('eye', 'Ver como…', ' data-ver-como') : ''}
<a role="menuitem" class="pm-i" href="#/notificacoes">${svgIc('bell')}<span>Notificações e preferências</span>${notify.naoLidas() ? `<span class="pm-n">${notify.naoLidas()}</span>` : ''}</a>
<div class="pm-sep" role="separator"></div>
${it(tema() === 'escuro' ? 'sun' : 'moon', tema() === 'escuro' ? 'Tema claro' : 'Tema escuro', ' data-tema-toggle')}
<button type="button" role="menuitemcheckbox" aria-checked="${densidade() === 'compacta'}" class="pm-i" data-densidade-toggle>${svgIc('list')}<span>Tabelas compactas</span><span class="pm-sw" aria-hidden="true"></span></button>
<button type="button" role="menuitem" class="pm-i" data-paleta>${svgIc('zap')}<span>Paleta de comandos</span><kbd class="pm-k" aria-hidden="true">${esc(teclaPaleta())}</kbd></button>
${it('keyboard', 'Atalhos de teclado', ' data-atalhos')}
<div class="pm-sep" role="separator"></div>
${it('log-out', 'Sair', ' data-sair')}</div>${db.dadosDemo ? '<p class="pm-demo">Modo demonstração · dados ilustrativos</p>' : ''}`;
  perfilPop = popover(anc, html, { cls: 'pm', role: 'presentation', largura: 280, onFechar: () => { perfilPop = null; } });
  perfilPop.el.addEventListener('click', e => { const b = e.target.closest('a,button'); if (b && !b.hasAttribute('data-densidade-toggle')) setTimeout(() => perfilPop && perfilPop.fechar(), 0); });
  const f = perfilPop.el.querySelector('[role=menuitem]'); f && f.focus();
  perfilPop.el.addEventListener('keydown', e => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return; e.preventDefault();
    const l = Array.from(perfilPop.el.querySelectorAll('[role^=menuitem]')); const i = l.indexOf(document.activeElement);
    l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length].focus();
  });
}
function abrirVerComo() {
  const r = auth.real();
  const us = db.list('users', u => u.ativo !== false && u.id !== r.id).sort((a, b) => perms.PAPEIS_ORDEM.indexOf(a.papel) - perms.PAPEIS_ORDEM.indexOf(b.papel));
  const corpo = `<p class="mb-txt">Veja o app exatamente como outra pessoa vê: menus, permissões e clientes no escopo dela. Nada muda para ela.</p>
<ul class="vcl">${us.map(u => `<li><button type="button" class="vcl-b" data-vc="${esc(u.id)}">${avatar(u, 32)}<span><b>${esc(u.nome)}</b><small>${esc(perms.rotuloPapel(u.papel))} · ${esc(u.cargo || '')}</small></span>${svgIc('chev')}</button></li>`).join('')}</ul>`;
  let escolhido = null;
  modal({ titulo: 'Ver como', corpo, confirmar: false, cancelar: 'Cancelar', largura: 'sm', onAbrir: el => el.addEventListener('click', e => { const b = e.target.closest('[data-vc]'); if (b) { escolhido = b.dataset.vc; fecharTopo(); } }) })
    .then(() => { if (escolhido && auth.verComo(escolhido)) { const u = auth.user(); toast(`Agora você vê o app como ${u.nome}.`, { tipo: 'info' }); } });
}
export function ajudaAtalhos() {
  const k = (t, d) => `<tr><td>${t.split(' ').map(x => `<kbd>${esc(x)}</kbd>`).join(' ')}</td><td>${esc(d)}</td></tr>`;
  return modal({
    titulo: 'Atalhos de teclado', confirmar: false, cancelar: 'Fechar', largura: 'sm',
    corpo: `<table class="kb">${k(ehMacK(), 'Paleta de comandos (páginas, clientes e ações)')}${k('/', 'Buscar')}${k('n', 'Abrir notificações')}${k('?', 'Mostrar esta ajuda')}${k('Esc', 'Fechar janelas e menus')}${k('g c', 'Ir para o Cockpit')}${k('g f', 'Ir para o Financeiro')}${k('g l', 'Ir para Clientes')}${k('g o', 'Ir para Operação')}${k('g e', 'Ir para Equipe')}${k('g t', 'Ir para a Torre de Controle')}${k('g a', 'Ir para Alertas')}${k('g w', 'Ir para Webinars')}</table>`,
  });
}

/* ---------------- menu mobile ---------------- */
function abrirDrawerMenu() { document.documentElement.classList.add('sb-on'); const x = document.querySelector('.sb-x'); x && x.focus(); }
function fecharDrawerMenu() { if (document.documentElement.classList.contains('sb-on')) { document.documentElement.classList.remove('sb-on'); } }

/* ---------------- eventos ---------------- */
let ligou = false;
function ligarEventos() {
  if (ligou) { ligarBusca(); return; }
  ligou = true;
  root.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-sb-tg]')) { alternarMenu(); return; }
    if (t.closest('[data-sb-abrir]')) { abrirDrawerMenu(); return; }
    if (t.closest('[data-sb-fechar]')) { fecharDrawerMenu(); return; }
    if (t.closest('[data-skip]')) { e.preventDefault(); view.focus(); return; }
    const st = t.closest('[data-sub-toggle]');
    if (st) { const ab = st.getAttribute('aria-expanded') !== 'true'; menuTorreAberto = ab; st.setAttribute('aria-expanded', String(ab)); const ul = document.getElementById(st.getAttribute('aria-controls')); if (ul) ul.hidden = !ab; return; }
    if (t.closest('.nv a')) { fecharDrawerMenu(); return; }
    const pb = t.closest('[data-periodo]');
    if (pb) { setPeriodo(pb.dataset.periodo); return; }
    if (t.closest('#bell')) { abrirSino(); return; }
    if (t.closest('[data-tema-btn]')) { alternarTema(); return; }
    const pf = t.closest('[data-perfil]'); if (pf) { menuPerfil(pf); return; }
    if (t.closest('[data-gs-abrir]')) { focarBusca(); return; }
  });
  // barra inferior (celular): esconde quando o teclado virtual está aberto
  document.addEventListener('focusin', e => { if (window.innerWidth < 700 && e.target.matches && e.target.matches('input:not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable]')) document.documentElement.classList.add('kb-on'); });
  document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (!a || !a.matches || !a.matches('input:not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable]')) document.documentElement.classList.remove('kb-on'); }, 60));
  // Ctrl+K / ⌘K: paleta de comandos (funciona até dentro de campos)
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
      if (!auth.user() || !montado) return;
      e.preventDefault(); e.stopPropagation();
      if (paletaAberta()) fecharPaleta(); else { fecharBusca(false); fecharPopovers(); abrirPaleta(); }
    }
  }, true);
  document.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-voltar]')) { auth.voltar(); toast('Você voltou à sua visão.', { tipo: 'info' }); return; }
    if (t.closest('[data-ver-como]')) { abrirVerComo(); return; }
    if (t.closest('[data-tema-toggle]')) { alternarTema(); return; }
    if (t.closest('[data-atalhos]')) { ajudaAtalhos(); return; }
    if (t.closest('[data-paleta]')) { e.preventDefault(); fecharBusca(false); abrirPaleta(); return; }
    if (t.closest('[data-densidade-toggle]')) { alternarDensidade(); const b = t.closest('[data-densidade-toggle]'); b.setAttribute('aria-checked', String(densidade() === 'compacta')); return; }
    if (t.closest('[data-sair]')) { sair(); }
  });
  document.addEventListener('click', e => { if (e.target.closest('.gs-pop [data-gs-i]')) fecharBusca(true); });
  ligarBusca();
}
function alternarTema() { setTema(tema() === 'escuro' ? 'claro' : 'escuro'); renderAtual(true); }
/* ---------------- densidade (por pessoa, neste navegador) ---------------- */
export function densidade() { return document.documentElement.dataset.densidade === 'compacta' ? 'compacta' : 'confortavel'; }
export function setDensidade(d, o = {}) {
  d = d === 'compacta' ? 'compacta' : 'confortavel';
  if (d === 'compacta') document.documentElement.dataset.densidade = 'compacta'; else delete document.documentElement.dataset.densidade;
  if (o.salvar !== false) LS.set(`aos-densidade:${uidLS()}`, d);
  if (o.render !== false && montado) { renderAtual(true); }
}
function alternarDensidade() { const d = densidade() === 'compacta' ? 'confortavel' : 'compacta'; setDensidade(d); toast(d === 'compacta' ? 'Tabelas compactas: mais linhas na tela.' : 'Densidade confortável restaurada.', { tipo: 'info', desfazer: () => setDensidade(d === 'compacta' ? 'confortavel' : 'compacta') }); }
function aplicarDensidadeDoUsuario() { setDensidade(LS.get(`aos-densidade:${uidLS()}`, 'confortavel'), { salvar: false, render: false }); }
const ehMacK = () => teclaPaleta().replace('⌘K', '⌘ K');
async function sair() { const ok = await ui.confirmar('Você vai precisar entrar de novo para acessar o painel.', { titulo: 'Sair do Gmarketing?', confirmar: 'Sair', perigo: false }); if (ok) auth.logout(); }
export function setPeriodo(id) {
  if (!PERIODOS.some(p => p.id === id)) return;
  periodoAtual = id; LS.set('aos-periodo', id);
  router.setQuery({ p: id });
  document.querySelectorAll('[data-periodo]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.periodo === id)));
  if (ultimaRota) renderRota(router.atualizar(), true);
}

/* ---------------- montagem ---------------- */
function montarApp() {
  root.innerHTML = layoutHtml(); montado = true;
  aplicarMenu();
  view = document.getElementById('view');
  setTema(tema());
  ligarEventos();
  atualizarChrome();
}
function telaLogin() {
  montado = false; entrando = true; fecharPaleta('sem-foco'); if (cleanup) { try { cleanup(); } catch (e) { /* */ } cleanup = null; }
  document.title = 'Entrar · Gmarketing';
  auth.renderLogin(root, () => {});
  reportarTeste({ path: 'login', query: {} });
}
let iniciado = false, ultimoUserKey, entrando = false;
function aoMudarAuth() {
  const u = auth.user();
  const key = u ? `${auth.real().id}>${u.id}` : null;
  if (key === ultimoUserKey) return; ultimoUserKey = key;
  if (!u) { telaLogin(); return; }
  aplicarDensidadeDoUsuario();
  if (!montado) montarApp(); else atualizarChrome();
  if (!iniciado) { iniciado = true; entrando = false; const p0 = router.parse().path; if (!p0 || p0 === 'login') history.replaceState(null, '', router.href(rotaHome(), {})); router.start(r => renderRota(r)); return; }
  // depois de login / ver como: rota atual se permitida, senão a primeira
  const r = router.parse();
  const m = router.match(r.path);
  if (!r.path || r.path === 'login' || entrando) { entrando = false; router.go(router.href(rotaHome(), {}), { replace: true }); }
  else if (m && !rotaPermitida(r.path)) router.go(router.href(rotaHome(), {}), { replace: true });
  else router._fire();
}

export const shell = {
  /** registra um módulo (ver contrato em docs/CORE-API.md) */
  registrar(m) {
    if (!m || !m.id) return;
    const i = mods.findIndex(x => x.id === m.id); if (i >= 0) mods.splice(i, 1, m); else mods.push(m);
    const rs = m.routes && m.routes.length ? m.routes : [m.rota || m.id];
    rs.forEach(p => router.add(p, m));
    (m.sub || []).forEach(s => { if (!rs.includes(s.rota)) router.add(s.rota, m); });
  },
  modulos() { return mods.slice(); },
  periodo() { return periodoAtual; },
  periodoInfo,
  setPeriodo,
  PERIODOS,
  buscaProvedor(fn) { provedores.push(fn); return () => { const i = provedores.indexOf(fn); if (i >= 0) provedores.splice(i, 1); }; },
  contador(modId, fn) { contadoresExtra.set(modId, fn); atualizarChrome(); },
  /** página do core fora dos módulos (ex.: '_ui') */
  pagina(path, def) { paginasCore.set(path, def); },
  refresh() { renderAtual(true); },
  atualizarChrome,
  luzMestra,
  tema, setTema,
  focarBusca, abrirSino, ajudaAtalhos,
  primeiraRota, home: rotaHome, rotaPermitida,
  rotaAtual: () => (ultimaRota ? { ...ultimaRota, query: { ...ultimaRota.query } } : null), renders: () => contRenders,
  densidade, setDensidade,
  abrirPaleta, fecharPaleta,
  usaPeriodo: () => !document.documentElement.classList.contains('sem-periodo'),
  async iniciar(opcoes = {}) {
    root = opcoes.root || document.getElementById('app');
    const t = LS.get('aos-tema', 'claro'); setTema(t === 'escuro' ? 'escuro' : 'claro');
    ui.iniciarDelegacao(); notify.iniciarDelegacao(); charts.ativarTooltips(document.body);
    if (db.mode === 'supabase') { root.innerHTML = `<div class="boot">${ui.skeleton({ linhas: 4 })}</div>`; await db.ready; await auth.restaurar(); if (db.loadError) toast(`Não foi possível carregar os dados do servidor (${db.loadError}). Verifique a conexão e recarregue.`, { tipo: 'err', duracao: 12000 }); }
    auth.onChange(aoMudarAuth);
    // re-render quando os dados mudam (debounce)
    let tm = null; let colsMudadas = new Set();
    db.on(col => {
      colsMudadas.add(col); clearTimeout(tm);
      tm = setTimeout(() => {
        const cols = colsMudadas; colsMudadas = new Set();
        if (!montado) return;
        atualizarChrome();
        const m = modAtivo();
        const relevante = [...cols].some(c => c === '*' || (m && m.watch ? m.watch.includes(c) : !IGNORAR_RENDER.includes(c)));
        if (cols.has('users')) { const u = auth.user(); if (!u) { aoMudarAuth(); return; } }
        if (relevante) tentarRerender();
      }, 140);
    });
    setInterval(() => { atualizarRel(document); if (pendente) tentarRerender(); }, 20000);
    setInterval(() => { if (pendente) tentarRerender(); }, 900);
    router.atalhos({
      busca: () => { if (auth.user()) focarBusca(); },
      notificacoes: () => { if (auth.user()) abrirSino(); },
      ajuda: () => { if (auth.user()) ajudaAtalhos(); },
      fechar: () => { if (document.documentElement.classList.contains('sb-on')) { fecharDrawerMenu(); return; } fecharTopo(); },
      ir: dest => { if (!auth.user()) return; const m = mods.find(x => x.id === dest); router.go(m ? rotaInicial(m) : dest); },
    });
    configurarPaleta(fontesPaleta());
    aoMudarAuth();
    invasao.iniciar(); // alerta supremo de possível invasão (banner + sirene) em qualquer página
  },
};
function tentarRerender() {
  const a = document.activeElement;
  const digitando = a && view && view.contains(a) && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
  if (digitando || overlaysAbertos() > 0) { pendente = true; return; }
  pendente = false; renderAtual(true);
}
export default shell;

/** submenu ativo: rota exata primeiro; senão o prefixo mais longo (evita 'torre' capturar 'torre/voo') */
function melhorSub(subs, path) {
  const ex = subs.find(s => s.rota === path); if (ex) return ex;
  let best = null; for (const s of subs) if (s.prefixo && path.startsWith(s.rota + '/') && (!best || s.rota.length > best.rota.length)) best = s;
  return best;
}

/* menu lateral recolhível no computador: a setinha fica sempre visível para trazer o menu de volta */
function menuFechado() { try { return localStorage.getItem('aos-menu') === 'fechado'; } catch (e) { return false; } }
function aplicarMenu() {
  const f = menuFechado(); document.documentElement.classList.toggle('sb-fechado', f);
  const b = document.querySelector('[data-sb-tg]'); if (!b) return;
  const r = f ? 'Mostrar menu lateral' : 'Esconder menu lateral';
  b.setAttribute('aria-expanded', String(!f)); b.setAttribute('aria-label', r); b.title = r;
}
function alternarMenu() {
  try { localStorage.setItem('aos-menu', menuFechado() ? 'aberto' : 'fechado'); } catch (e) { /* sem armazenamento */ }
  aplicarMenu(); window.dispatchEvent(new Event('resize'));
}
