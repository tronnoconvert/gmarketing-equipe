// Notificações — central (#/notificacoes): abas, agrupamento por dia, lida/não lida, envio de mensagens e preferências.
import { abrirPrefs, lerPrefs, resumoCanais } from './prefs.js';
import { db as DB } from '../../core/store.js';
import { auth } from '../../core/auth.js';
import { notify as NOTIFY } from '../../core/notify.js';
import * as FMT from '../../core/fmt.js';
import { perms } from '../../core/perms.js';

/* ---------- dinheiro que entra só para quem vê receita ----------
   Notificações com valores em R$ (faturas, MRR, propostas) que chegam a quem não tem a permissão "receita"
   perdem os valores: o trecho com R$ sai do texto e, no título, o número vira "valor restrito".
   Exceção: avisos do Comercial para quem edita o Comercial (pipeline é o trabalho dessa pessoa). */
const RS = /R\$\s?[\d.,]+(\s?(mil|k))?(\/m[eê]s)?/gi;
const temRS = t => /R\$\s?\d/.test(String(t || ''));
function redigir(n) {
  const partes = String(n.texto || '').split(' · ');
  let texto = partes.filter(p => !temRS(p)).join(' · ');
  if (!texto.trim()) texto = 'Valores visíveis só para administradores.';
  else if (temRS(texto)) texto = texto.replace(RS, 'valor restrito');
  return { titulo: String(n.titulo || '').replace(RS, 'valor restrito'), texto, semValores: true };
}
export function protegerReceita() {
  if (DB.mode === 'supabase') return; // produção: o banco já entrega as notificações sem valores (filtrar_receita)
  try {
    const users = new Map(DB.list('users').map(u => [u.id, u]));
    DB.list('notifications', n => !n.semValores && n.valorProprio !== 'comissao' && (temRS(n.titulo) || temRS(n.texto))).forEach(n => {
      const u = users.get(n.para); if (!u || perms.veReceita(u)) return;
      if (/^#\/comercial/.test(n.link || '') && perms.can('comercial', 'editar', u)) return;
      DB.update('notifications', n.id, redigir(n));
    });
  } catch (e) { /* db ainda carregando */ }
}
let protTmr = null;
DB.on((col, op) => { if ((col === 'notifications' && op === 'insert') || ['load', 'reset', 'batch'].includes(op) || col === '*') { clearTimeout(protTmr); protTmr = setTimeout(protegerReceita, 0); } });
protegerReceita();

const ABAS = [
  { id: '', rotulo: 'Todas', filtro: 'todas' },
  { id: 'nao-lidas', rotulo: 'Não lidas', filtro: 'nao_lidas' },
  { id: 'mencoes', rotulo: 'Menções', filtro: 'mencoes' },
  { id: 'atribuidas', rotulo: 'Atribuídas a mim', filtro: 'atribuidas' },
  { id: 'alertas', rotulo: 'Alertas', filtro: 'alertas' },
];
const VAZIO = {
  todas: ['inbox', 'Nenhuma notificação ainda', 'Quando alguém mencionar você, atribuir uma tarefa ou um alerta disparar, aparece aqui.'],
  nao_lidas: ['check-circle', 'Tudo lido por aqui', 'Você está em dia. Novas notificações aparecem com um ponto azul.'],
  mencoes: ['at-sign', 'Nenhuma menção', 'Quando alguém escrever @ seguido do seu nome num comentário, você recebe aqui.'],
  atribuidas: ['user-plus', 'Nada atribuído a você', 'Tarefas, reuniões e clientes atribuídos a você aparecem nesta aba.'],
  alertas: ['alert', 'Nenhum alerta', 'Alertas das regras e da Torre de Controle chegam aqui. Configure regras em Alertas.'],
};
const GRUPOS = [
  { id: 'todos', rotulo: 'Toda a equipe', f: () => true },
  { id: 'gestao', rotulo: 'Gestão (dono e administração)', f: u => ['dono', 'admin'].includes(u.papel) },
  { id: 'gestor_trafego', rotulo: 'Tráfego', f: u => ['head_trafego', 'gestor_trafego'].includes(u.papel) },
  { id: 'cs', rotulo: 'Atendimento (CS)', f: u => u.papel === 'cs' },
  { id: 'producao', rotulo: 'Produção (social, design, copy, dev)', f: u => u.papel === 'producao' },
  { id: 'financeiro', rotulo: 'Financeiro', f: u => u.papel === 'financeiro' },
  { id: 'comercial', rotulo: 'Comercial', f: u => u.papel === 'comercial' },
];

function abaAtual(ctx) { return ABAS.find(a => a.id === (ctx.params.aba || '')) || ABAS[0]; }

function rotuloDia(iso, fmt) {
  const d = fmt.toDate(iso); const dd = fmt.diasAte(d);
  if (dd === 0) return 'Hoje';
  if (dd === -1) return 'Ontem';
  if (dd > -7) return `${fmt.diaSemana(d)[0].toUpperCase()}${fmt.diaSemana(d).slice(1)} · ${fmt.data(d)}`;
  return fmt.data(d);
}

function itemHtml(n, ctx) {
  const { ui, fmt, db, notify } = ctx; const esc = fmt.esc;
  const t = notify.TIPOS[n.tipo] || notify.TIPOS.mensagem;
  const de = n.de ? db.get('users', n.de) : null;
  const ico = de ? ui.avatar(de, 34) : `<span class="nt-ic t-${esc(n.tipo)}">${ui.ic(t.icone)}</span>`;
  const meta = [`<span>${esc(t.rotulo)}</span>`, de ? `<span>${esc(de.nome)}</span>` : '<span>Automático</span>', `<span title="${esc(fmt.dataHora(n.quando))}">${fmt.hora(n.quando)}</span>`];
  return `<li class="m-nt-i${n.lida ? '' : ' un'}${n.prioridade === 'alta' ? ' alta' : ''}" data-nid="${esc(n.id)}">
<span class="m-nt-ic">${ico}</span>
<a class="m-nt-m" href="${esc(n.link || '#/notificacoes')}" data-nt-abrir="${esc(n.id)}">
<span class="m-nt-t">${n.prioridade === 'alta' ? `<span class="m-nt-pr">${ui.led(n.lida ? 'off' : 'err', false, { aria: 'Prioridade alta' })}Prioridade alta</span>` : ''}<b>${esc(n.titulo)}</b></span>
${n.texto ? `<span class="m-nt-x">${esc(n.texto)}</span>` : ''}
<span class="m-nt-meta">${meta.join('<i aria-hidden="true">·</i>')}</span></a>
<span class="m-nt-a">${n.link ? ui.btn({ rotulo: 'Abrir', href: n.link, sm: true, tipo: 'ghost', attrs: { 'data-nt-abrir': n.id } }) : ''}
${ui.btnIc(n.lida ? 'eye-off' : 'check', n.lida ? 'Marcar como não lida' : 'Marcar como lida', { 'data-m-nt-toggle': n.id })}</span></li>`;
}

/* ---------- grupos (mesma entidade + tipo + dia) ---------- */
const abertos = new Set();
function grupoHtml(g, ctx) {
  const { ui, fmt, db, notify } = ctx; const esc = fmt.esc;
  const t = notify.TIPOS[g.tipo] || notify.TIPOS.mensagem;
  const pessoas = [...new Set(g.itens.map(n => n.de).filter(Boolean))];
  const ico = pessoas.length ? ui.avatares(pessoas, 2, 24) : `<span class="nt-ic t-${esc(g.tipo)}">${ui.ic(t.icone)}</span>`;
  const nomes = pessoas.map(id => (db.get('users', id) || {}).nome).filter(Boolean).map(fmt.primeiro);
  const ab = abertos.has(g.chave); const sid = `mntg-${g.chave.replace(/[^a-z0-9]/gi, '')}`;
  const ids = g.itens.map(n => n.id).join(',');
  const meta = [`<span>${esc(t.rotulo)}</span>`, nomes.length ? `<span>${esc(nomes.join(', '))}</span>` : '<span>Automático</span>', `<span>${fmt.hora(g.itens[g.itens.length - 1].quando)}–${fmt.hora(g.quando)}</span>`];
  return `<li class="m-nt-grp${g.naoLidas ? ' un' : ''}${ab ? ' aberto' : ''}" data-m-nt-grp="${esc(g.chave)}">
<div class="m-nt-i m-nt-gi${g.naoLidas ? ' un' : ''}${g.alta ? ' alta' : ''}">
<span class="m-nt-ic m-nt-avs">${ico}</span>
<button type="button" class="m-nt-m m-nt-gb" data-m-nt-grp-toggle aria-expanded="${ab}" aria-controls="${sid}">
<span class="m-nt-t"><b>${esc(g.titulo)}</b><span class="m-nt-cnt">${g.naoLidas ? `${g.naoLidas} não ${g.naoLidas === 1 ? 'lida' : 'lidas'}` : 'lidas'}</span></span>
<span class="m-nt-x">${esc(g.itens[0].texto || '')}</span>
<span class="m-nt-meta">${meta.join('<i aria-hidden="true">·</i>')}<span class="m-nt-ver">${ab ? 'Ocultar' : `Ver as ${g.itens.length}`}${ui.ic('chev-down')}</span></span></button>
<span class="m-nt-a">${g.link ? ui.btn({ rotulo: 'Abrir', href: g.link, sm: true, tipo: 'ghost', attrs: { 'data-nt-abrir-grupo': ids } }) : ''}
${g.naoLidas ? ui.btnIc('check', `Marcar as ${g.itens.length} como lidas`, { 'data-m-nt-grp-lida': ids }) : ui.btnIc('eye-off', 'Marcar grupo como não lido', { 'data-m-nt-grp-naolida': ids })}</span></div>
<ul class="m-nt-l m-nt-sub" id="${sid}"${ab ? '' : ' hidden'}>${g.itens.map(n => itemHtml(n, ctx)).join('')}</ul></li>`;
}
function listaDia(itens, ctx) {
  return ctx.notify.agrupar(itens).map(x => (x.grupo ? grupoHtml(x, ctx) : itemHtml(x.n, ctx))).join('');
}
/* ---------- "Resumo de hoje" (prévia do resumo diário) ---------- */
function resumoHoje(ctx, naoLidas, prefs) {
  const { ui, fmt, notify, db } = ctx; const esc = fmt.esc;
  if (!naoLidas.length) return '';
  const PL = { alerta: ['alerta', 'alertas'], mencao: ['menção', 'menções'], atribuicao: ['atribuição', 'atribuições'], mensagem: ['mensagem', 'mensagens'], sistema: ['aviso do sistema', 'avisos do sistema'] };
  const ORD = ['alerta', 'mencao', 'atribuicao', 'mensagem', 'sistema'];
  const por = ORD.map(t => [t, naoLidas.filter(n => n.tipo === t)]).filter(([, l]) => l.length);
  const altas = naoLidas.filter(n => n.prioridade === 'alta');
  const destaques = [...altas, ...naoLidas.filter(n => n.prioridade !== 'alta')].slice(0, 3);
  const canal = (prefs.tipos.mencao && (prefs.tipos.mencao.whatsapp || prefs.tipos.alerta.whatsapp)) ? 'WhatsApp' : 'e-mail';
  const quando = prefs.resumoDiario ? `Chega todo dia às ${esc(prefs.resumoHora)} por ${canal}${db.mode === 'demo' ? ' (simulado no modo demonstração)' : ''}.` : 'O envio diário está desligado.';
  const chips = por.map(([t, l]) => `<li><span class="m-nt-rk num">${l.length}</span> <span>${esc(PL[t][l.length === 1 ? 0 : 1])}</span></li>`).join('');
  const lista = destaques.map(n => `<li>${n.prioridade === 'alta' ? ui.led('err', false, { aria: 'Prioridade alta' }) : ui.led('off', false, { aria: 'Normal' })}<a href="${esc(n.link || '#/notificacoes')}" data-nt-abrir="${esc(n.id)}">${esc(n.titulo)}</a></li>`).join('');
  return ui.card({
    cls: 'm-nt-resumo', icone: 'inbox', titulo: 'Resumo de hoje', sub: `${fmt.plural(naoLidas.length, 'notificação sem leitura', 'notificações sem leitura')}${altas.length ? ` · ${fmt.plural(altas.length, 'de prioridade alta', 'de prioridade alta')}` : ''}`,
    ajuda: 'Prévia do resumo diário: tudo o que ainda não foi lido, por tipo, com os itens mais importantes primeiro. Em produção a rotina do servidor (função notify) envia no horário escolhido.',
    acoes: ctx.can('notificacoes', 'editar') ? ui.btn({ rotulo: prefs.resumoDiario ? `Horário: ${prefs.resumoHora}` : 'Ligar resumo diário', icone: 'clock', sm: true, tipo: 'ghost', attrs: { 'data-m-nt-prefs': '' } }) : '',
    corpo: `<ul class="m-nt-rt">${chips}</ul>${lista ? `<ul class="m-nt-rd">${lista}</ul>` : ''}<p class="mut sm m-nt-rq">${ui.ic(prefs.resumoDiario ? 'send' : 'info')}<span>${quando}</span></p>`,
  });
}

function render(ctx) {
  const { ui, fmt, notify, db } = ctx; const esc = fmt.esc;
  const me = ctx.user;
  const aba = abaAtual(ctx);
  ctx.migalha(aba.id ? aba.rotulo : '');
  const todas = notify.minhas({ filtro: 'todas' });
  const cont = f => notify.minhas({ filtro: f }).filter(n => !n.lida).length;
  const naoLidas = todas.filter(n => !n.lida);
  const altas = naoLidas.filter(n => n.prioridade === 'alta');
  const lista = notify.minhas({ filtro: aba.filtro });
  const podeEditar = ctx.can('notificacoes', 'editar');

  // agrupar por dia
  const grupos = []; const idx = new Map();
  for (const n of lista) { const k = fmt.iso(n.quando); if (!idx.has(k)) { idx.set(k, grupos.length); grupos.push({ k, rot: rotuloDia(n.quando, fmt), itens: [] }); } grupos[idx.get(k)].itens.push(n); }
  const [vi, vt, vx] = VAZIO[aba.filtro];
  const corpoLista = lista.length ? grupos.map(g => `<section class="m-nt-g" aria-label="${esc(g.rot)}"><h3 class="m-nt-gh"><span>${esc(g.rot)}</span><span class="mut num">${g.itens.length}</span></h3><ul class="m-nt-l">${listaDia(g.itens, ctx)}</ul></section>`).join('')
    : ui.vazio({ icone: vi, titulo: vt, texto: vx, acao: aba.id ? { rotulo: 'Ver todas', href: '#/notificacoes' } : null });

  const tabs = ui.tabs(ABAS.map(a => ({ id: a.id, rotulo: a.rotulo, n: a.filtro === 'todas' ? undefined : (cont(a.filtro) || undefined) })), aba.id, 'notificacoes');
  const naoLidasAba = lista.filter(n => !n.lida).length;

  const prefs = lerPrefs(me.id);
  const canais = resumoCanais(prefs);
  const lateral = `<div class="stack m-nt-side">
${ui.card({ titulo: 'Resumo', corpo: `<div class="m-nt-res">
<div><span class="m-nt-k num">${naoLidas.length}</span><span class="mut sm">não lidas</span></div>
<div><span class="m-nt-k num${altas.length ? ' t-err' : ''}">${altas.length}</span><span class="mut sm">prioridade alta</span></div>
<div><span class="m-nt-k num">${todas.length}</span><span class="mut sm">no total</span></div></div>
${altas.length ? ui.aviso({ tipo: 'err', titulo: `${fmt.plural(altas.length, 'notificação de prioridade alta', 'notificações de prioridade alta')} sem leitura`, texto: 'Abra para ver o que precisa de você.' }) : ''}` })}
${ui.card({ titulo: 'Como você recebe', acoes: podeEditar ? ui.btn({ rotulo: 'Editar', icone: 'sliders', sm: true, attrs: { 'data-m-nt-prefs': '' } }) : '', corpo: ui.pares([
    ['Canais ativos', esc(canais.join(', ') || 'Só no app')],
    ['Silêncio', prefs.silencio.ativo ? `${esc(prefs.silencio.de)} às ${esc(prefs.silencio.ate)}${prefs.silencio.furarAlta ? ' <span class="mut">· prioridade alta passa</span>' : ''}` : 'Desligado'],
    ['Resumo diário', prefs.resumoDiario ? `Todo dia às ${esc(prefs.resumoHora)}` : 'Desligado'],
  ], { colunas: 1 }) })}
<p class="mut sm m-nt-dica">${ui.ic('keyboard')}<span>Tecla <kbd>n</kbd> abre o painel rápido de qualquer tela.</span></p></div>`;

  const acoes = [
    naoLidas.length ? ui.btn({ rotulo: 'Marcar todas como lidas', icone: 'check', attrs: { 'data-m-nt-todas': '' } }) : '',
    podeEditar ? ui.btn({ rotulo: 'Enviar mensagem', icone: 'send', tipo: 'pri', attrs: { 'data-m-nt-enviar': '' } }) : '',
  ].join('');

  return `<div class="pg m-notificacoes">
${ui.cabecalho({ titulo: 'Notificações', intro: false, sub: naoLidas.length ? `${fmt.plural(naoLidas.length, 'não lida', 'não lidas')}${altas.length ? ` · ${fmt.plural(altas.length, 'de prioridade alta', 'de prioridade alta')}` : ''}` : 'Tudo em dia.', acoes })}
${aba.id ? '' : resumoHoje(ctx, naoLidas, prefs)}
${tabs}
<div class="m-nt-grid">
${ui.card({ cls: 'm-nt-card', titulo: aba.rotulo, sub: lista.length ? `${fmt.plural(lista.length, 'notificação', 'notificações')}${naoLidasAba ? ` · ${naoLidasAba} não lidas` : ''}` : '', acoes: naoLidasAba && aba.id ? ui.btn({ rotulo: 'Marcar estas como lidas', sm: true, tipo: 'ghost', attrs: { 'data-m-nt-aba': '' } }) : '', corpo: corpoLista })}
${lateral}
</div></div>`;
}

async function enviarMensagem(ctx) {
  const { ui, fmt, db, notify } = ctx; const esc = fmt.esc;
  const me = ctx.real || ctx.user;
  const pessoas = db.list('users', u => u.ativo !== false && u.id !== me.id).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const corpo = `<form class="m-nt-env stack" novalidate>
<fieldset class="fld"><legend>Enviar para</legend><div class="seg" role="radiogroup" aria-label="Destino"><label><input type="radio" name="modo" value="pessoas" checked><span>Pessoas</span></label><label><input type="radio" name="modo" value="grupo"><span>Grupo</span></label></div></fieldset>
<div data-modo="pessoas"><fieldset class="fld"><legend>Pessoas<span class="req" aria-hidden="true">*</span></legend>
<input type="search" class="m-nt-q" placeholder="Buscar pessoa…" aria-label="Buscar pessoa">
<div class="ntf-p m-nt-pp">${pessoas.map(u => `<label class="ntf-pi" data-nome="${esc(fmt.norm(u.nome))}"><input type="checkbox" name="para" value="${esc(u.id)}">${ui.avatar(u, 26)}<span><b>${esc(u.nome)}</b><small>${esc(u.cargo || '')}</small></span></label>`).join('')}</div></fieldset></div>
<div data-modo="grupo" hidden>${ui.campo({ nome: 'grupo', rotulo: 'Grupo', tipo: 'select', opcoes: GRUPOS.map(g => ({ v: g.id, l: `${g.rotulo} (${pessoas.filter(g.f).length})` })) })}</div>
${ui.campo({ nome: 'titulo', rotulo: 'Assunto', placeholder: 'Ex.: Reunião geral sexta às 10h', obrigatorio: true })}
${ui.campo({ nome: 'texto', rotulo: 'Mensagem', tipo: 'textarea', obrigatorio: true, placeholder: 'O que as pessoas precisam saber ou fazer?' })}
<div class="ntf-row"><fieldset class="fld"><legend>Prioridade</legend><div class="seg" role="radiogroup"><label><input type="radio" name="prioridade" value="normal" checked><span>Normal</span></label><label><input type="radio" name="prioridade" value="alta"><span>Alta</span></label></div></fieldset>
<fieldset class="fld"><legend>Canais</legend><div class="ntf-c"><label class="ck"><input type="checkbox" name="canais" value="app" checked><span>App</span></label><label class="ck"><input type="checkbox" name="canais" value="whatsapp"><span>WhatsApp</span></label><label class="ck"><input type="checkbox" name="canais" value="email"><span>E-mail</span></label></div></fieldset></div>
${ui.campo({ nome: 'link', rotulo: 'Link (opcional)', placeholder: '#/clientes/c-orion', dica: 'Página que abre ao clicar na notificação.' })}
</form>`;
  let enviados = [];
  const ok = await ui.modal({
    titulo: 'Enviar mensagem', sub: 'Chega na central de notificações de cada pessoa', corpo, confirmar: 'Enviar', largura: 'md',
    onAbrir: el => {
      el.addEventListener('change', e => { if (e.target.name === 'modo') el.querySelectorAll('[data-modo]').forEach(d => { d.hidden = d.dataset.modo !== e.target.value; }); });
      const q = el.querySelector('.m-nt-q'); q.addEventListener('input', () => { const v = fmt.norm(q.value); el.querySelectorAll('.ntf-pi').forEach(l => { l.hidden = v && !l.dataset.nome.includes(v); }); });
    },
    onConfirmar: el => {
      const f = el.querySelector('form');
      const modo = f.querySelector('[name="modo"]:checked').value;
      const r = ui.form.validar(f, {
        titulo: 'obrigatorio|min:3|max:120', texto: 'obrigatorio|min:3|max:1000',
        para: [v => (modo === 'pessoas' && (!v || !v.length) ? 'Escolha pelo menos uma pessoa.' : '')],
        canais: [v => (!v || !v.length ? 'Escolha pelo menos um canal.' : '')],
        link: [v => (v && !/^#\//.test(v) ? 'Use um endereço do app começando com #/ (ex.: #/clientes).' : '')],
      });
      if (!r.ok) return false;
      const d = r.dados; const g = GRUPOS.find(x => x.id === d.grupo) || GRUPOS[0];
      const para = modo === 'grupo' ? pessoas.filter(g.f).map(u => u.id) : d.para;
      if (!para.length) return `O grupo "${g.rotulo}" não tem ninguém ativo além de você.`;
      enviados = notify.enviar({ para, titulo: `${me.nome}: ${d.titulo}`, texto: d.texto, prioridade: d.prioridade, canais: d.canais, tipo: 'mensagem', link: d.link || '#/notificacoes' });
      db.insert('activity', { quem: me.id, quemNome: me.nome, oque: `enviou mensagem "${d.titulo}" para ${modo === 'grupo' ? g.rotulo : fmt.plural(para.length, 'pessoa')}`, col: 'notifications', refId: enviados[0] && enviados[0].id, quando: new Date().toISOString() });
      return true;
    },
  });
  if (ok) ui.toast(enviados.length === 1 ? `Mensagem enviada para ${(db.get('users', enviados[0].para) || {}).nome}.` : `Mensagem enviada para ${enviados.length} pessoas.`, { desfazer: () => db.batch(() => enviados.forEach(n => db.remove('notifications', n.id))) });
}

function mount(el, ctx) {
  const { notify, ui, db } = ctx;
  const onClick = e => {
    const tg = e.target.closest('[data-m-nt-toggle]');
    if (tg) {
      e.preventDefault(); const n = db.get('notifications', tg.dataset.mNtToggle); if (!n) return;
      notify.marcarLida(n.id, !n.lida); ctx.refresh();
      ui.toast(n.lida ? 'Marcada como não lida.' : 'Marcada como lida.', { tipo: 'info', desfazer: () => { notify.marcarLida(n.id, n.lida); ctx.refresh(); } });
      return;
    }
    if (e.target.closest('[data-m-nt-todas]')) {
      const ids = notify.minhas({ filtro: 'nao_lidas' }).map(n => n.id);
      const k = notify.marcarTodas(); ctx.refresh();
      ui.toast(k === 1 ? '1 notificação marcada como lida.' : `${k} notificações marcadas como lidas.`, { desfazer: () => { db.batch(() => ids.forEach(id => notify.marcarLida(id, false))); ctx.refresh(); } });
      return;
    }
    if (e.target.closest('[data-m-nt-aba]')) {
      const ids = notify.minhas({ filtro: abaAtual(ctx).filtro }).filter(n => !n.lida).map(n => n.id);
      db.batch(() => ids.forEach(id => notify.marcarLida(id, true))); ctx.refresh();
      ui.toast(`${ids.length === 1 ? '1 notificação marcada' : ids.length + ' notificações marcadas'} como lida.`, { desfazer: () => { db.batch(() => ids.forEach(id => notify.marcarLida(id, false))); ctx.refresh(); } });
      return;
    }
    const gt = e.target.closest('[data-m-nt-grp-toggle]');
    if (gt) {
      const li = gt.closest('[data-m-nt-grp]'); const k = li.dataset.mNtGrp; const ab = !abertos.has(k);
      if (ab) abertos.add(k); else abertos.delete(k);
      li.classList.toggle('aberto', ab); gt.setAttribute('aria-expanded', String(ab));
      const ul = document.getElementById(gt.getAttribute('aria-controls')); if (ul) ul.hidden = !ab;
      const v = gt.querySelector('.m-nt-ver'); if (v) v.firstChild.textContent = ab ? 'Ocultar' : `Ver as ${ul ? ul.children.length : ''}`;
      return;
    }
    const gl = e.target.closest('[data-m-nt-grp-lida], [data-m-nt-grp-naolida]');
    if (gl) {
      const lida = gl.hasAttribute('data-m-nt-grp-lida'); const ids = (gl.dataset.mNtGrpLida || gl.dataset.mNtGrpNaolida).split(',');
      db.batch(() => ids.forEach(id => notify.marcarLida(id, lida))); ctx.refresh();
      ui.toast(lida ? `${ids.length} notificações marcadas como lidas.` : `${ids.length} notificações marcadas como não lidas.`, { desfazer: () => { db.batch(() => ids.forEach(id => notify.marcarLida(id, !lida))); ctx.refresh(); } });
      return;
    }
    if (e.target.closest('[data-m-nt-enviar]')) { enviarMensagem(ctx); return; }
    if (e.target.closest('[data-m-nt-prefs]')) { abrirPrefs(ctx.user.id).then(ok => ok && ctx.refresh()); }
  };
  el.addEventListener('click', onClick);
  return () => el.removeEventListener('click', onClick);
}

export default {
  id: 'notificacoes', titulo: 'Notificações', icone: 'bell', grupo: 'sistema', rota: 'notificacoes',
  menu: false, // fora do menu lateral: acesso pelo sino ("Ver todas"), perfil, barra inferior e paleta
  palavras: ['preferências de notificação', 'resumo diário', 'menções'],
  routes: ['notificacoes', 'notificacoes/:aba'],
  watch: ['notifications', 'users', 'settings'],
  render, mount,
  contador() {
    const u = auth.user(); if (!u) return null;
    const l = DB.list('notifications', n => n.para === u.id && !n.lida);
    if (!l.length) return null;
    const altas = l.filter(n => n.prioridade === 'alta').length;
    return { n: l.length, estado: altas ? 'err' : undefined, rotulo: `${l.length} não lidas${altas ? `, ${altas} de prioridade alta` : ''}` };
  },
  busca(q) {
    return NOTIFY.minhas({ filtro: 'todas' }).filter(n => FMT.norm(`${n.titulo} ${n.texto || ''}`).includes(q)).slice(0, 5)
      .map(n => ({ tipo: 'Notificações', titulo: n.titulo, sub: FMT.rel(n.quando), href: n.link || '#/notificacoes', icone: 'bell', led: n.lida ? undefined : (n.prioridade === 'alta' ? 'err' : 'ok') }));
  },
};
