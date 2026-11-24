// invasao.js — alerta SUPREMO de possível invasão (Guardião de segurança) no nível do shell, em qualquer página.
// Para quem recebe (gestor de tráfego, dono e admin): banner vermelho em tela cheia + SIRENE (src/core/sirene.js) enquanto houver
// incidente "aberto" (ninguém assumiu). "Assumir incidente" para a sirene para todos; "Silenciar neste aparelho" só local.
// Depois de assumido, fica um aviso compacto "Conta em quarentena" até alguém (Dono/Admin) liberar com SIM + checklist.
// Fonte da verdade: coleção `alerts` (tipo 'invasao', area 'seguranca', campo `incidente` no formato do motor Guardiao).
// Produção: o insert/atualização chega pelo realtime do Supabase (db.on). Demonstração: db.on na mesma aba + evento `storage`
// (chave aos-guardiao-sinal) entre abas. Regras e motor: src/shared/guardiao.js · docs/SEGURANCA-INVASAO.md.
import { db } from './store.js';
import { auth } from './auth.js';
import * as fmt from './fmt.js';
import { esc } from './fmt.js';
import { ui, modal, drawer, toast } from './ui.js';
import { sirene } from './sirene.js';
import Guardiao from '../shared/guardiao.mjs';

const SINAL = 'aos-guardiao-sinal';
const ROT_SIL = uid => `aos-sirene-silenciada:${uid}`;
let iniciado = false;
let detalhesAbertos = false;
let ultimaChave = null;

/* ------------------------------------------------------------------ dados */
export const ehAlvo = u => !!u && u.ativo !== false && Guardiao.PAPEIS_ALVO.includes(u.papel);
export const podeLiberar = u => !!u && Guardiao.PAPEIS_SAIDA.includes(u.papel);
export function incidentes() {
  return db.list('alerts', a => a.tipo === 'invasao' && a.incidente && typeof a.incidente === 'object')
    .sort((a, b) => String(b.atualizadoEm || b.quando || '').localeCompare(String(a.atualizadoEm || a.quando || '')));
}
export const abertos = () => incidentes().filter(a => a.incidente.estado === 'aberto');
export const emQuarentena = () => incidentes().filter(a => a.incidente.estado !== 'encerrado');
export const incidenteDaConta = contaId => emQuarentena().find(a => String(a.incidente.contaId) === String(contaId)) || null;
const chaveSirene = a => `${a.id}:${(a.incidente.reincidencias || []).length}`;
const quem = () => { const u = auth.real() || auth.user(); return u ? { userId: u.id, nome: u.nome, teamId: u.teamId, papel: u.papel } : null; };
const destinatarios = () => Guardiao.destinatarios(db.list('users'));

/** espelha o alerta entre abas (demonstração; em produção o realtime cuida) */
function sinalizar(alerta) {
  if (db.mode !== 'demo') return;
  try {
    const m = JSON.parse(localStorage.getItem(SINAL) || '{}') || {};
    m[alerta.id] = alerta; Object.keys(m).slice(0, -20).forEach(k => delete m[k]);
    localStorage.setItem(SINAL, JSON.stringify(m));
  } catch (e) { /* armazenamento indisponível: só esta aba */ }
}

/**
 * Registra um incidente vindo da Torre (ou de outra origem): alerta, notificações críticas para TODOS os alvos ao mesmo tempo,
 * execução da rotina r-guardiao e auditoria. `evento`: 'invasao' | 'reincidencia'. Idempotente por (incidente.id, nº de reincidências).
 */
export function registrarIncidente(incidente, o = {}) {
  if (!incidente || typeof incidente !== 'object' || !incidente.id) return null;
  const evento = o.evento === 'reincidencia' ? 'reincidencia' : 'invasao';
  const agora = new Date().toISOString();
  const ant = db.get('alerts', incidente.id);
  const nReinc = (incidente.reincidencias || []).length;
  if (ant && ant.incidente && (ant.incidente.reincidencias || []).length === nReinc && evento === (ant.ultimoEvento || 'invasao') && ant.incidente.estado === incidente.estado) return ant; // repetido
  const alvos = destinatarios().map(u => u.id);
  const alvosTeam = destinatarios().map(u => u.teamId).filter(Boolean); // alerts.para = ids de team (escopo do módulo Alertas)
  const nomeConta = incidente.contaNome || 'conta';
  const titulo = o.titulo || (evento === 'reincidencia' ? `REINCIDÊNCIA — ${nomeConta} foi mexida de novo e pausada outra vez` : `POSSÍVEL INVASÃO — Conta ${nomeConta} pausada automaticamente`);
  const texto = o.texto || (incidente.achados || []).slice(0, 3).map(a => a.titulo).join(' · ');
  const link = `#/alertas?incidente=${encodeURIComponent(incidente.id)}`;
  // quem assumiu antes continua listado, mas reincidência reabre o incidente (sirene volta)
  const inc = { ...incidente, assumidoPor: incidente.assumidoPor || (ant && ant.incidente && ant.incidente.assumidoPor) || [] };
  let alerta;
  db.batch(() => {
    alerta = db.upsert('alerts', {
      ...(ant || {}), id: incidente.id, tipo: 'invasao', area: 'Segurança', gravidade: 'err', severidade: 'err', estado: 'err',
      titulo, detalhe: texto, quando: (ant && ant.quando) || agora, atualizadoEm: agora, status: 'aberto', resolvido: false,
      clientId: o.clientId || inc.clientId || null, para: alvosTeam, paraUsers: alvos, incidente: inc, ultimoEvento: evento, regraId: 'guardiao', origem: o.origem || 'torre',
      acao: { rotulo: 'Ver incidente', href: link },
    }, { log: evento === 'reincidencia' ? `Guardião: reincidência em ${nomeConta} (pausou de novo)` : `Guardião: possível invasão em ${nomeConta} — conta pausada automaticamente` });
    alvos.forEach(uid => db.insert('notifications', {
      para: uid, de: null, tipo: 'invasao', subtipo: evento, titulo, texto, link, lida: false, prioridade: 'critica', quando: agora,
      canais: ['app', 'whatsapp', 'email'], refCol: 'alerts', refId: incidente.id, sirene: true,
    }));
    db.insert('routineRuns', { routineId: 'r-guardiao', inicio: agora, fim: agora, estado: 'err', resumo: `${evento === 'reincidencia' ? 'Reincidência' : 'Possível invasão'} em ${nomeConta}: ${(o.pausadas != null ? o.pausadas : (inc.pausados || []).length)} campanha(s) pausada(s) · ${alvos.length} pessoas avisadas`, origem: o.origem || 'torre', incidenteId: incidente.id });
    if (alerta.clientId && db.get('clients', alerta.clientId)) db.insert('clientActions', { clientId: alerta.clientId, data: fmt.iso(new Date()), quem: null, tipo: 'Pausa de segurança', area: 'trafego', metrica: null, descricao: `${titulo}. ${texto}`, antes: 'Campanhas ativas', depois: 'Conta pausada (quarentena)', origem: 'guardiao' });
  });
  if (db.mode === 'demo') {
    // canais externos simulados no demo (em produção a Edge Function guardiao envia WhatsApp + e-mail)
    toast(`Alerta de invasão enviado por WhatsApp e e-mail para ${alvos.length} pessoas (simulado no modo demonstração).`, { tipo: 'info' });
  }
  sinalizar(alerta);
  atualizar();
  return alerta;
}

/** assume o incidente: a sirene para para todos; quem assumiu aparece para todo mundo */
export function assumir(id) {
  const a = db.get('alerts', id); const eu = quem();
  if (!a || !a.incidente || !eu) return null;
  const inc = Guardiao.assumir(a.incidente, { userId: eu.userId, nome: eu.nome }, Date.now());
  const outros = (a.paraUsers || destinatarios().map(u => u.id)).filter(u => u !== eu.userId);
  let novo;
  db.batch(() => {
    novo = db.update('alerts', id, { incidente: inc, status: 'aberto', atribuidoA: eu.teamId || null, atualizadoEm: new Date().toISOString() }, { log: `assumiu o incidente de possível invasão em ${inc.contaNome}` });
    outros.forEach(uid => db.insert('notifications', { para: uid, de: eu.userId, tipo: 'invasao', subtipo: 'assumido', titulo: `${fmt.primeiro(eu.nome)} assumiu o incidente de ${inc.contaNome}`, texto: 'A sirene foi desligada para todos. A conta continua pausada e em quarentena.', link: `#/alertas?incidente=${encodeURIComponent(id)}`, lida: false, prioridade: 'alta', quando: new Date().toISOString(), refCol: 'alerts', refId: id }));
  });
  sinalizar(novo);
  atualizar();
  return novo;
}

/**
 * Sai da quarentena (Dono/Admin): valida SIM + checklist, monta o plano de reativação seletiva e encerra o incidente.
 * Em produção chama a Edge Function guardiao {acao:'liberar'} (que mexe no Meta); no demo avisa a Torre (evento aos:guardiao).
 * @returns {ok, erro?, plano?}
 */
export async function liberar(id, p = {}) {
  const a = db.get('alerts', id); const eu = quem();
  if (!a || !a.incidente) return { ok: false, erro: 'Incidente não encontrado.' };
  if (a.incidente.estado === 'encerrado') return { ok: false, erro: 'Este incidente já foi encerrado.' };
  const v = Guardiao.validarSaida({ papel: eu && eu.papel, confirmacao: p.confirmacao, checklist: p.checklist });
  if (!v.ok) return { ok: false, erro: v.erros.papel || v.erros.checklist || v.erros.confirmacao };
  const plano = Guardiao.planoReativacao(a.incidente, { selecionadas: p.selecionadas || [], restaurar: p.restaurar });
  if (!plano.ok) return { ok: false, erro: plano.erros.join(' ') };
  if (db.mode === 'supabase' && db.supabase) {
    const { error } = await db.supabase.functions.invoke('guardiao', { body: { acao: 'liberar', incidenteId: id, confirmacao: p.confirmacao, checklist: p.checklist, selecionadas: p.selecionadas, restaurar: p.restaurar } });
    if (error) return { ok: false, erro: 'Não foi possível liberar no Meta agora. Tente de novo; se persistir, veja os logs da função guardiao.' };
  }
  const chave = `guardiaoEstado:${a.incidente.contaId}`;
  const s = Guardiao.sairQuarentena(db.config(chave, null), a.incidente, { quem: eu, quando: Date.now(), checklist: p.checklist, plano });
  const reat = plano.acoes.filter(x => x.tipo === 'ativar').length;
  let novo;
  db.batch(() => {
    db.setConfig(chave, s.estado);
    novo = db.update('alerts', id, { incidente: s.incidente, status: 'resolvido', resolvido: true, resolvidoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() }, { log: `liberou a quarentena de ${a.incidente.contaNome} (SIM + checklist) e reativou ${reat} campanha(s)` });
    destinatarios().filter(u => !eu || u.id !== eu.userId).forEach(u => db.insert('notifications', { para: u.id, de: eu ? eu.userId : null, tipo: 'invasao', subtipo: 'liberado', titulo: `${a.incidente.contaNome} saiu da quarentena`, texto: `${eu ? eu.nome : 'Dono/Admin'} conferiu o checklist de segurança e reativou ${reat} campanha(s)${plano.acoes.some(x => x.tipo === 'orcamento') ? ' com o orçamento de antes do incidente' : ''}.`, link: `#/alertas?incidente=${encodeURIComponent(id)}`, lida: false, prioridade: 'normal', quando: new Date().toISOString(), refCol: 'alerts', refId: id }));
    if (a.clientId && db.get('clients', a.clientId)) db.insert('clientActions', { clientId: a.clientId, data: fmt.iso(new Date()), quem: eu ? eu.teamId : null, tipo: 'Conta liberada da quarentena', area: 'trafego', metrica: null, descricao: `Checklist de segurança confirmado. ${reat} campanha(s) reativada(s).`, antes: 'Quarentena', depois: 'Campanhas reativadas', origem: 'guardiao' });
  });
  try { window.dispatchEvent(new CustomEvent('aos:guardiao', { detail: { tipo: 'liberar', incidenteId: id, contaId: a.incidente.contaId, plano } })); } catch (e) { /* sem DOM */ }
  sinalizar(novo);
  atualizar();
  return { ok: true, plano };
}

/* ------------------------------------------------------------------ interface */
const hora = iso => (iso ? `${fmt.dataCurta(iso)} ${fmt.hora(iso)}` : '');
const brl = v => (v == null ? '—' : fmt.brl2 ? fmt.brl2(v) : fmt.brl(v));
const SEV = { critica: ['err', 'Crítica'], alta: ['warn', 'Alta'], media: ['off', 'Média'] };
function listaAchados(inc, max = 6) {
  const l = (inc.achados || []).slice(0, max);
  return l.length ? `<ul class="inv-l">${l.map(x => `<li><span class="inv-sev s-${esc(x.severidade)}">${esc((SEV[x.severidade] || SEV.media)[1])}</span><span><b>${esc(x.titulo)}</b><small>${esc(x.detalhe || '')}</small></span></li>`).join('')}</ul>${(inc.achados || []).length > max ? `<p class="inv-mais">+ ${(inc.achados || []).length - max} sinais</p>` : ''}` : '<p class="inv-mais">—</p>';
}
function orcTxt(p) {
  if (p.cbo) return p.orcAntes !== p.orcAtual ? `${brl(p.orcAntes)} → <b>${brl(p.orcAtual)}</b>/dia` : `${brl(p.orcAtual)}/dia`;
  const at = (p.conjuntos || []).filter(s => s.ativo); const t = k => at.reduce((s, x) => s + (x[k] || 0), 0);
  return t('orcAntes') !== t('orcAtual') ? `${brl(t('orcAntes'))} → <b>${brl(t('orcAtual'))}</b>/dia` : `${brl(t('orcAtual'))}/dia`;
}
function listaPausados(inc) {
  const l = inc.pausados || [];
  return l.length ? `<ul class="inv-l inv-p">${l.map(p => `<li><span class="inv-pz" aria-hidden="true"></span><span><b>${esc(p.nome)}</b><small>${orcTxt(p)}${p.criadaNoIncidente ? ' · <em>criada durante o incidente</em>' : ''}</small></span></li>`).join('')}</ul>` : '<p class="inv-mais">Nenhuma campanha estava ativa.</p>';
}
const nomesAssumiu = inc => (inc.assumidoPor || []).map(x => x.nome || 'Alguém').join(', ');

function bannerHtml(lista) {
  const a = lista[0], inc = a.incidente, nR = (inc.reincidencias || []).length;
  const alvos = (a.paraUsers || a.para || []).length || destinatarios().length;
  return `<div class="inv-bx">
<div class="inv-top"><span class="inv-tag"><i aria-hidden="true"></i>Alerta supremo · Segurança</span><span class="inv-qd">${nR ? `Reincidência nº ${nR} · ` : ''}${esc(fmt.rel(a.atualizadoEm || a.quando))}</span></div>
<h1 id="inv-t">${nR ? 'REINCIDÊNCIA' : 'POSSÍVEL INVASÃO'} — Conta ${esc(inc.contaNome)} pausada automaticamente</h1>
<p id="inv-d" class="inv-sub">${nR ? `Alguém mexeu de novo na conta em quarentena. O Guardião pausou outra vez. ` : ''}Todas as campanhas ativas foram <b>pausadas</b> (nenhuma excluída) e a conta está em <b>quarentena</b>. Assuma o incidente para parar a sirene de todos e começar a resolver.</p>
<div class="inv-g"><section><h2>O que foi detectado</h2>${listaAchados(inc, 4)}</section><section><h2>O que foi pausado</h2>${listaPausados(inc)}</section></div>
<div class="inv-det" ${detalhesAbertos ? '' : 'hidden'}><h2>Próximos passos</h2><ol class="inv-ol"><li>Troque a senha do Business Manager e de quem tem acesso; ative a autenticação em dois fatores.</li><li>Revise administradores e parceiros da conta e do BM; remova quem não é da equipe.</li><li>Confira forma de pagamento, limite de gastos e os orçamentos.</li><li>Dono ou Admin libera a conta em Alertas › incidente (SIM + checklist) e reativa só o que for seguro, com o orçamento de antes.</li></ol>
${nR ? `<h2>Reincidências</h2><ul class="inv-l">${inc.reincidencias.map(r => `<li><span class="inv-sev s-critica">${esc(hora(r.quando))}</span><span><b>${esc(r.motivo || '')}</b><small>${(r.pausadas || []).length} campanha(s) pausada(s) de novo</small></span></li>`).join('')}</ul>` : ''}</div>
<div class="inv-ac"><button type="button" class="btn inv-assumir" data-inv-assumir="${esc(a.id)}">${ui.ic('check')}Assumir incidente</button><button type="button" class="btn inv-sec" data-inv-detalhes aria-expanded="${detalhesAbertos}">${ui.ic('info')}${detalhesAbertos ? 'Ocultar detalhes' : 'Ver detalhes'}</button><button type="button" class="btn inv-link" data-inv-silenciar ${sirene.estado().silenciadaLocal ? 'disabled' : ''}>${ui.ic('bell-off')}${sirene.estado().silenciadaLocal ? 'Silenciado neste aparelho' : 'Silenciar neste aparelho'}</button></div>
<p class="inv-who">Avisados ao mesmo tempo: ${alvos} pessoas (gestores de tráfego, dono e admins) por app, WhatsApp e e-mail · ${nomesAssumiu(inc) ? `Já assumiram antes: ${esc(nomesAssumiu(inc))}` : 'Ninguém assumiu ainda'}${lista.length > 1 ? ` · <b>Mais ${lista.length - 1} incidente(s) aberto(s)</b>` : ''}</p>
</div>`;
}
function faixaHtml(lista) {
  const a = lista[0], inc = a.incidente;
  return `<span class="inv-fx-i" aria-hidden="true">${ui.ic('shield')}</span><span class="inv-fx-m"><b>${esc(inc.contaNome)} em quarentena</b><small>${inc.assumidoPor && inc.assumidoPor.length ? `Assumido por ${esc(nomesAssumiu(inc))}` : 'Aguardando'}${lista.length > 1 ? ` · +${lista.length - 1}` : ''}</small></span><a class="btn sm" href="#/alertas?incidente=${encodeURIComponent(a.id)}" data-inv-abrir="${esc(a.id)}">Abrir</a>`;
}

/** recalcula banner, faixa e sirene para quem está logado */
export function atualizar() {
  if (typeof document === 'undefined') return;
  const u = auth.real();
  let bx = document.getElementById('aos-inv'), fx = document.getElementById('aos-inv-fx');
  if (!u || !ehAlvo(u)) { if (bx) bx.remove(); if (fx) fx.remove(); document.documentElement.classList.remove('inv-on'); sirene.parar(); ultimaChave = null; return; }
  const ab = abertos();
  if (ab.length) {
    if (!bx) { bx = document.createElement('div'); bx.id = 'aos-inv'; bx.className = 'inv-tk'; bx.setAttribute('role', 'alertdialog'); bx.setAttribute('aria-modal', 'true'); bx.setAttribute('aria-labelledby', 'inv-t'); bx.setAttribute('aria-describedby', 'inv-d'); document.body.appendChild(bx); }
    const chave = chaveSirene(ab[0]);
    const silenciada = (() => { try { return localStorage.getItem(ROT_SIL(u.id)) === chave; } catch (e) { return false; } })();
    if (chave !== ultimaChave) { ultimaChave = chave; if (silenciada) { sirene.tocar(chave); sirene.silenciar(); } else sirene.tocar(chave); }
    const foco = document.activeElement && bx.contains(document.activeElement) ? document.activeElement.getAttribute('data-inv-assumir') !== null ? '[data-inv-assumir]' : document.activeElement.hasAttribute('data-inv-detalhes') ? '[data-inv-detalhes]' : null : '[data-inv-assumir]';
    bx.innerHTML = bannerHtml(ab);
    document.documentElement.classList.add('inv-on');
    const f = foco && bx.querySelector(foco); if (f) f.focus({ preventScroll: true });
  } else {
    if (bx) bx.remove(); document.documentElement.classList.remove('inv-on');
    sirene.parar(); ultimaChave = null;
  }
  const q = emQuarentena().filter(a => a.incidente.estado !== 'aberto');
  if (q.length && !ab.length) {
    if (!fx) { fx = document.createElement('div'); fx.id = 'aos-inv-fx'; fx.className = 'inv-fx'; fx.setAttribute('role', 'status'); document.body.appendChild(fx); }
    fx.innerHTML = faixaHtml(q);
  } else if (fx) fx.remove();
}

/** gaveta com o incidente (Alertas ?incidente=, faixa, "Abrir") */
export function abrirIncidente(id) {
  const a = db.get('alerts', id);
  if (!a || !a.incidente) { toast('Incidente não encontrado. Ele pode ter sido apagado.', { tipo: 'warn' }); return null; }
  const inc = a.incidente, eu = quem(), enc = inc.estado === 'encerrado';
  const tabela = `<table class="inv-tb"><thead><tr><th>Campanha</th><th class="num">Antes do incidente</th><th class="num">No incidente</th><th>Situação</th></tr></thead><tbody>${(inc.pausados || []).map(p => {
    const at = p.cbo ? [p.orcAntes, p.orcAtual] : [(p.conjuntos || []).filter(s => s.ativo).reduce((s, x) => s + (x.orcAntes || 0), 0), (p.conjuntos || []).filter(s => s.ativo).reduce((s, x) => s + (x.orcAtual || 0), 0)];
    const volta = (inc.reativadas || []).includes(p.id);
    return `<tr><td>${esc(p.nome)}${p.criadaNoIncidente ? '<br><small class="t-err">Criada durante o incidente</small>' : ''}</td><td class="num">${brl(at[0])}</td><td class="num${at[1] > at[0] ? ' t-err fw6' : ''}">${brl(at[1])}</td><td>${ui.led(volta ? 'ok' : 'err', volta ? 'Reativada' : 'Pausada pelo Guardião')}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="mut">Nenhuma campanha estava ativa.</td></tr>'}</tbody></table>`;
  const estado = enc ? ui.led('ok', `Encerrado ${hora(inc.encerradoEm)}${inc.encerradoPor ? ` por ${esc(inc.encerradoPor.nome || '')}` : ''}`) : inc.estado === 'assumido' ? ui.led('warn', `Em quarentena · assumido por ${esc(nomesAssumiu(inc))}`) : ui.led('err', 'Em quarentena · ninguém assumiu');
  const corpo = `<div class="stack inv-dr">
<div class="inv-dr-h">${estado}<span class="mut sm">Aberto ${esc(hora(inc.abertoEm))} · ${esc(inc.motivo || '')}</span></div>
<section><h3>O que foi detectado</h3>${listaAchados(inc, 20)}</section>
<section><h3>O que foi pausado</h3><div class="inv-tbw">${tabela}</div><p class="mut sm">Nenhuma campanha foi excluída. Ao liberar, só estas campanhas podem ser reativadas — com o orçamento de antes do incidente, se você quiser.</p></section>
${(inc.reincidencias || []).length ? `<section><h3>Reincidências</h3><ul class="inv-l">${inc.reincidencias.map(r => `<li><span class="inv-sev s-critica">${esc(hora(r.quando))}</span><span><b>${esc(r.motivo || '')}</b><small>${(r.pausadas || []).length} campanha(s) pausada(s) de novo${(r.eventos || []).length ? ' · ' + r.eventos.map(e => esc(`${e.atorNome || ''}: ${Guardiao.TIPOS[e.tipo] || e.tipo}`)).join(' · ') : ''}</small></span></li>`).join('')}</ul></section>` : ''}
${enc && inc.checklist ? `<section><h3>Checklist confirmado na liberação</h3><ul class="inv-ck">${Guardiao.CHECKLIST.map(c => `<li>${ui.led(inc.checklist[c.id] ? 'ok' : 'off', false)}${esc(c.rotulo)}</li>`).join('')}</ul></section>` : ''}
</div>`;
  const pode = podeLiberar(auth.real());
  const jaAssumi = eu && (inc.assumidoPor || []).some(x => x.userId === eu.userId);
  const rodape = enc ? '' : `${!jaAssumi && ehAlvo(auth.real()) ? `<button type="button" class="btn" data-inv-assumir="${esc(id)}">Assumir incidente</button>` : ''}<button type="button" class="btn pri" data-inv-liberar="${esc(id)}" ${pode ? '' : `disabled data-tip="Só Dono ou Admin podem tirar a conta da quarentena."`}>${ui.ic('unlock')}Liberar conta…</button>`;
  const d = drawer({ titulo: `Incidente de segurança · ${inc.contaNome}`, sub: enc ? 'Encerrado' : 'Possível invasão — conta pausada automaticamente', corpo, rodape, largura: 640 });
  d.el.addEventListener('click', e => {
    const as = e.target.closest('[data-inv-assumir]'); if (as) { assumir(as.dataset.invAssumir); d.fechar(); abrirIncidente(id); toast('Você assumiu o incidente. A sirene parou para todos.', { tipo: 'ok' }); return; }
    const lb = e.target.closest('[data-inv-liberar]'); if (lb && !lb.disabled) { d.fechar(); abrirSaida(id); }
  });
  return d;
}

/** modal de saída da quarentena: checklist + seleção de campanhas (orçamento antes → atual) + SIM */
export function abrirSaida(id) {
  const a = db.get('alerts', id); if (!a || !a.incidente) return Promise.resolve(false);
  const inc = a.incidente;
  const linhas = Guardiao.planoReativacao(inc, { selecionadas: (inc.pausados || []).map(p => p.id), restaurar: true }).linhas;
  const corpo = `<div class="stack inv-sq">
<p class="mut">A conta só sai da quarentena depois de confirmar a segurança. Só as campanhas que o Guardião pausou podem voltar — escolha quais e com qual orçamento.</p>
<fieldset class="inv-fs"><legend>1. Checklist de segurança (obrigatório)</legend>${Guardiao.CHECKLIST.map(c => `<label class="inv-ckl"><input type="checkbox" name="ck" value="${esc(c.id)}"><span>${esc(c.rotulo)}</span></label>`).join('')}</fieldset>
<fieldset class="inv-fs"><legend>2. Campanhas para reativar</legend><div class="inv-tbw"><table class="inv-tb"><thead><tr><th>Reativar</th><th>Campanha</th><th class="num">Antes → no incidente</th><th>Orçamento ao reativar</th></tr></thead><tbody>${linhas.map(l => `<tr><td><input type="checkbox" name="sel" value="${esc(l.id)}" ${l.criadaNoIncidente ? '' : 'checked'} aria-label="Reativar ${esc(l.nome)}"></td><td>${esc(l.nome)}${l.criadaNoIncidente ? '<br><small class="t-err">Criada durante o incidente — confirme com o cliente</small>' : ''}</td><td class="num">${brl(l.orcAntes)} → <span class="${l.alterado ? 't-err fw6' : ''}">${brl(l.orcAtual)}</span></td><td>${l.alterado ? `<label class="inv-ckl sm"><input type="checkbox" name="rest" value="${esc(l.id)}" checked><span>Restaurar orçamento anterior ao incidente (${brl(l.orcAntes)})</span></label>` : '<span class="mut sm">Sem mudança</span>'}</td></tr>`).join('') || '<tr><td colspan="4" class="mut">Nenhuma campanha para reativar.</td></tr>'}</tbody></table></div></fieldset>
<label class="fld inv-sim"><span>3. Digite <b>SIM</b> para confirmar</span><input name="sim" autocomplete="off" inputmode="text" aria-describedby="inv-sim-d" placeholder="SIM"><small id="inv-sim-d" class="mut">Confirmação obrigatória: a liberação reativa campanhas no Meta.</small></label>
</div>`;
  return modal({
    titulo: `Liberar ${inc.contaNome} da quarentena`, sub: 'Só Dono ou Admin', corpo, confirmar: 'Liberar e reativar', largura: 'lg',
    onConfirmar: async el => {
      const ck = Object.fromEntries(Guardiao.CHECKLIST.map(c => [c.id, !!el.querySelector(`input[name="ck"][value="${c.id}"]:checked`)]));
      const sel = [...el.querySelectorAll('input[name="sel"]:checked')].map(x => x.value);
      const rest = Object.fromEntries(linhas.map(l => [l.id, !l.alterado || !!el.querySelector(`input[name="rest"][value="${l.id}"]:checked`)]));
      const r = await liberar(id, { confirmacao: el.querySelector('input[name="sim"]').value, checklist: ck, selecionadas: sel, restaurar: rest });
      if (!r.ok) return r.erro;
      toast(`${inc.contaNome} saiu da quarentena. ${r.plano.acoes.filter(x => x.tipo === 'ativar').length} campanha(s) reativada(s).`, { tipo: 'ok' });
      return true;
    },
  });
}

/* ------------------------------------------------------------------ ciclo de vida */
const CSS = `
.inv-tk{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:24px;overflow:auto;background:radial-gradient(120% 90% at 50% 0%,#5b0b12 0%,#2a0509 55%,#12030a 100%);color:#fff;animation:inv-in .18s ease-out}
.inv-tk::before{content:"";position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 0 6px #ef4444,inset 0 0 120px rgba(239,68,68,.45);animation:inv-pulso 1.1s ease-in-out infinite}
@keyframes inv-pulso{50%{box-shadow:inset 0 0 0 6px #7f1d1d,inset 0 0 60px rgba(239,68,68,.15)}}
@keyframes inv-in{from{opacity:0}}
@media (prefers-reduced-motion:reduce){.inv-tk::before,.inv-tag i{animation:none}}
.inv-bx{position:relative;width:min(920px,100%);display:grid;gap:18px}
.inv-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;color:#fecaca}
.inv-tag{display:inline-flex;align-items:center;gap:8px;font-weight:700}
.inv-tag i{width:10px;height:10px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 4px rgba(239,68,68,.3);animation:inv-pulso2 .8s steps(2) infinite}
@keyframes inv-pulso2{50%{background:#fff}}
.inv-qd{font-variant-numeric:tabular-nums;letter-spacing:0;text-transform:none}
.inv-bx h1{margin:0;font-size:clamp(24px,3.6vw,40px);line-height:1.1;letter-spacing:-.02em;font-weight:750;text-wrap:balance}
.inv-sub{margin:0;font-size:16px;line-height:1.5;color:#fde2e2;max-width:72ch}
.inv-g{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.inv-g section,.inv-det{background:rgba(0,0,0,.32);border:1px solid rgba(254,202,202,.18);border-radius:12px;padding:14px 16px;min-width:0}
.inv-bx h2{margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#fecaca;font-weight:650}
.inv-l{list-style:none;margin:0;padding:0;display:grid;gap:9px}
.inv-l li{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;min-width:0}
.inv-l b{display:block;font-weight:600;overflow-wrap:anywhere}
.inv-l small{display:block;opacity:.78;font-size:12.5px;line-height:1.4;overflow-wrap:anywhere}
.inv-l small b{display:inline;font-weight:700}
.inv-sev{font-size:11px;font-weight:700;padding:2px 6px;border-radius:5px;background:rgba(255,255,255,.12);white-space:nowrap;margin-top:1px;font-variant-numeric:tabular-nums}
.inv-sev.s-critica{background:#ef4444;color:#fff}.inv-sev.s-alta{background:#f59e0b;color:#1a1200}
.inv-pz{width:10px;height:10px;margin-top:5px;border-left:3px solid #fecaca;border-right:3px solid #fecaca}
.inv-mais{margin:6px 0 0;font-size:12.5px;opacity:.75}
.inv-ol{margin:0 0 10px;padding-left:20px;display:grid;gap:6px;line-height:1.45}
.inv-ac{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.inv-ac .btn{min-height:44px;padding:0 18px;font-size:15px;border-radius:10px}
.inv-assumir{background:#fff;color:#7f1d1d;border-color:#fff;font-weight:700}
.inv-assumir:hover{background:#fee2e2}
.inv-sec{background:transparent;color:#fff;border-color:rgba(255,255,255,.45)}
.inv-sec:hover{background:rgba(255,255,255,.1)}
.inv-link{background:transparent;border-color:transparent;color:#fecaca;text-decoration:underline;text-underline-offset:3px}
.inv-link[disabled]{opacity:.7;text-decoration:none}
.inv-ac .btn:focus-visible{outline:3px solid #fde68a;outline-offset:2px}
.inv-who{margin:0;font-size:13px;color:#fecaca;line-height:1.5}
html.inv-on body{overflow:hidden}
html.inv-on .m-torre-voo-host{visibility:hidden}
.inv-fx{position:fixed;left:calc(var(--sb-w,260px) + 20px);bottom:16px;z-index:58;display:flex;align-items:center;gap:12px;max-width:min(420px,calc(100vw - 32px));padding:10px 10px 10px 12px;border-radius:12px;background:#1a0509;color:#fff;box-shadow:0 0 0 1px #7f1d1d,0 12px 32px -10px rgba(127,29,29,.6)}
.inv-fx-i{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:#b91c1c;flex:none}
.inv-fx-m{display:grid;min-width:0}.inv-fx-m b{font-size:13.5px}.inv-fx-m small{font-size:12px;color:#fecaca;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.inv-fx .btn{margin-left:auto;background:#fff;color:#7f1d1d;border-color:#fff}
.inv-dr h3{margin:0 0 8px;font-size:13px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.inv-dr .inv-l small{color:var(--muted);opacity:1}.inv-dr .inv-sev{background:var(--card-3)}
.inv-dr .inv-sev.s-critica{background:var(--err);color:#fff}.inv-dr .inv-sev.s-alta{background:var(--warn);color:#1a1200}
.inv-dr-h{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}
.inv-tbw{overflow-x:auto;border:1px solid var(--line);border-radius:10px}
.inv-tb{width:100%;border-collapse:collapse;font-size:13px}
.inv-tb th{font-weight:500;color:var(--muted);text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.inv-tb td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.inv-tb tr:last-child td{border-bottom:0}.inv-tb .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.inv-ck{list-style:none;margin:0;padding:0;display:grid;gap:6px}.inv-ck li{display:flex;gap:8px;align-items:center}
.inv-fs{border:0;padding:0;margin:0;display:grid;gap:8px}.inv-fs legend{font-weight:600;margin-bottom:6px}
.inv-ckl{display:flex;gap:10px;align-items:flex-start;line-height:1.4;cursor:pointer}.inv-ckl input{margin-top:3px;width:16px;height:16px;flex:none}
.nt-ic.t-invasao{color:var(--err)}
.inv-sim{display:grid;gap:6px}.inv-sim input{max-width:160px;font-weight:700;letter-spacing:.1em}
html.sb-fechado .inv-fx{left:24px}
@media (max-width:560px){.inv-sq .inv-tbw{overflow:visible}.inv-sq .inv-tb thead{display:none}.inv-sq .inv-tb tr{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px;padding:10px 12px;border-bottom:1px solid var(--line)}.inv-sq .inv-tb tr:last-child{border-bottom:0}.inv-sq .inv-tb td{border:0;padding:0}.inv-sq .inv-tb td:nth-child(n+3){grid-column:2;text-align:left}}
@media (max-width:900px){.inv-fx{left:16px}}
@media (max-width:700px){.inv-tk{padding:16px;place-items:start center}.inv-g{grid-template-columns:1fr}.inv-ac{position:sticky;bottom:-16px;z-index:1;margin:0 -16px;padding:14px 16px calc(14px + env(safe-area-inset-bottom,0px));background:linear-gradient(rgba(18,3,10,0),#12030a 22%)}.inv-ac .btn{flex:1 1 100%;justify-content:center}.inv-bx h1{font-size:24px}.inv-fx{left:12px;right:12px;bottom:calc(68px + env(safe-area-inset-bottom,0px));max-width:none}}
`;

/** chame uma vez no boot do app (shell) */
export function iniciar() {
  if (iniciado || typeof document === 'undefined') return;
  iniciado = true;
  const st = document.createElement('style'); st.id = 'aos-invasao-css'; st.textContent = CSS; document.head.appendChild(st);
  sirene.instalarDesbloqueio();
  db.on(col => { if (col === 'alerts' || col === 'users' || col === 'reset' || col === 'load') atualizar(); });
  auth.onChange && auth.onChange(() => { detalhesAbertos = false; ultimaChave = null; atualizar(); });
  window.addEventListener('storage', e => {
    if (e.key !== SINAL || !e.newValue) return;
    try {
      const m = JSON.parse(e.newValue) || {};
      db.batch(() => Object.values(m).forEach(al => { const ant = db.get('alerts', al.id); if (!ant || String(ant.atualizadoEm || '') < String(al.atualizadoEm || '')) db.upsert('alerts', al); }));
    } catch (err) { /* JSON parcial */ }
    atualizar();
  });
  document.addEventListener('click', e => {
    const as = e.target.closest('#aos-inv [data-inv-assumir]');
    if (as) { const a = assumir(as.dataset.invAssumir); if (a) toast(`Você assumiu o incidente de ${a.incidente.contaNome}. A sirene parou para todos.`, { tipo: 'ok', acao: { rotulo: 'Ver incidente', fn: () => abrirIncidente(a.id) } }); return; }
    if (e.target.closest('#aos-inv [data-inv-detalhes]')) { detalhesAbertos = !detalhesAbertos; atualizar(); return; }
    if (e.target.closest('#aos-inv [data-inv-silenciar]')) {
      const u = auth.real(); const ab = abertos()[0];
      if (u && ab) { try { localStorage.setItem(ROT_SIL(u.id), chaveSirene(ab)); } catch (er) { /* memória */ } }
      sirene.silenciar(); atualizar(); toast('Sirene silenciada neste aparelho. O alerta continua até alguém assumir.', { tipo: 'info' }); return;
    }
    const ab = e.target.closest('#aos-inv-fx [data-inv-abrir]'); if (ab) { e.preventDefault(); abrirIncidente(ab.dataset.invAbrir); }
  });
  // Esc não fecha o alerta supremo (só "Assumir" tira o banner); Tab fica preso dentro dele
  document.addEventListener('keydown', e => {
    const bx = document.getElementById('aos-inv'); if (!bx) return;
    if (e.key === 'Escape') { e.stopPropagation(); return; }
    if (e.key === 'Tab') {
      const f = [...bx.querySelectorAll('button:not([disabled]),a[href]')]; if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
    }
  }, true);
  setInterval(() => { if (abertos().length) atualizar(); }, 60000); // "há X min"
  atualizar();
}

export const invasao = { iniciar, atualizar, registrarIncidente, assumir, liberar, abrirIncidente, abrirSaida, incidentes, abertos, emQuarentena, incidenteDaConta, ehAlvo, podeLiberar };
if (typeof window !== 'undefined') window.AOS_INVASAO = invasao;
export default invasao;
