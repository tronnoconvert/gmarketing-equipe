// tarefa.js — formulário de nova tarefa/edição, painel de detalhes (drawer) e ações de aprovação/ajuste.
import { db } from '../../core/store.js';
import { ui } from '../../core/ui.js';
import { notify } from '../../core/notify.js';
import { router } from '../../core/router.js';
import { auth } from '../../core/auth.js';
import * as fmt from '../../core/fmt.js';
import { listaClientes, TIPOS, rotTipo, ROT_STATUS, diasPara, isoDia, hoje0, nomeCliente, cliente, FATURAVEIS, atrasada, venceHoje } from './base.js';
import { pessoa, ocupacao, estadoOcupacao, mover, desfazer, criarTarefa, reatribuir, podeEditarTarefa, podeAprovar, escopoProprio, teamDeUser, diasAtraso, statusPessoa, indisponivelAte, eu } from './lib.js';

const esc = fmt.esc;
const equipeOpcoes = () => db.list('team', t => t.ativo !== false && (FATURAVEIS.includes(t.id) || t.faturavel)).map(t => ({ v: t.id, l: `${t.nome} · ${t.area || t.cargo || ''}` }));

/** selo de prazo: atrasada (err), vence hoje (warn), entregue, ou a data */
export function seloPrazo(t, o = {}) {
  if (t.status === 'feito') return `<span class="mut sm">Entregue ${t.concluidaEm ? fmt.dataCurta(t.concluidaEm) : ''}</span>`;
  if (atrasada(t)) { const d = diasAtraso(t); return ui.selo('err', o.curto ? `${d} d de atraso` : `Atrasada há ${fmt.plural(d, 'dia')}`, { title: `Prazo: ${fmt.data(t.prazo)}` }); }
  if (venceHoje(t)) return ui.selo('warn', 'Vence hoje', { title: `Prazo: ${fmt.data(t.prazo)}` });
  const d = diasPara(t.prazo);
  return `<span class="sm mut num" title="Prazo: ${esc(fmt.data(t.prazo))}">${d === 1 ? 'Amanhã' : `${fmt.diaSemana(t.prazo)}, ${fmt.dataCurta(t.prazo)}`}</span>`;
}

function formHtml(t = {}, pre = {}) {
  const user = auth.user(); const so = escopoProprio(user); const me = teamDeUser(user);
  const v = { ...pre, ...t };
  const clientes = listaClientes().map(c => ({ v: c.id, l: c.nome }));
  const resp = so ? [{ v: me, l: `${pessoa(me).nome} (você)` }] : equipeOpcoes();
  const aprov = [{ v: '', l: 'Automático (responsável do cliente)' }].concat(db.list('team', x => x.ativo !== false && ['dono', 'admin', 'head_trafego', 'gestor_trafego', 'cs'].includes(x.papel)).map(x => ({ v: x.id, l: x.nome })));
  return `<form class="stack m-operacao tf-form" novalidate><div class="fgrid">
${ui.campo({ nome: 'titulo', rotulo: 'Título', obrigatorio: true, valor: v.titulo, placeholder: 'Ex.: 6 criativos para a campanha de Natal', cls: 'full' })}
${ui.campo({ nome: 'clientId', rotulo: 'Cliente', tipo: 'select', obrigatorio: true, placeholder: 'Escolha o cliente…', opcoes: clientes, valor: v.clientId })}
${ui.campo({ nome: 'tipo', rotulo: 'Tipo', tipo: 'select', obrigatorio: true, placeholder: 'Escolha o tipo…', opcoes: Object.entries(TIPOS).map(([k, x]) => ({ v: k, l: x.rotulo })), valor: v.tipo })}
${ui.campo({ nome: 'respId', rotulo: 'Responsável', tipo: 'select', obrigatorio: true, placeholder: so ? undefined : 'Quem vai fazer?', opcoes: resp, valor: so ? me : v.respId, dica: so ? 'Seu papel cria tarefas apenas para você.' : undefined })}
${ui.campo({ nome: 'prazo', rotulo: 'Prazo', tipo: 'data', obrigatorio: true, valor: v.prazo })}
${ui.campo({ nome: 'estimativaH', rotulo: 'Estimativa (horas)', tipo: 'number', obrigatorio: true, valor: v.estimativaH, placeholder: 'Ex.: 4', attrs: { min: '0.5', max: '80', step: '0.5' }, ajuda: 'Horas de trabalho previstas. Entra na ocupação da pessoa e no calendário de carga.' })}
${ui.campo({ nome: 'aprovadorId', rotulo: 'Quem aprova', tipo: 'select', opcoes: aprov, valor: v.aprovadorId || '' })}
${ui.campo({ nome: 'desc', rotulo: 'Descrição', tipo: 'textarea', valor: v.desc, cls: 'full', placeholder: 'Contexto, links e critérios de aceite (opcional)' })}
</div><p class="tf-carga sm" aria-live="polite"></p></form>`;
}
function ligarCarga(el) {
  const sel = el.querySelector('[name="respId"]'); const out = el.querySelector('.tf-carga'); const prazo = el.querySelector('[name="prazo"]');
  const upd = () => {
    const id = sel.value; if (!id) { out.innerHTML = ''; return; }
    const p = pessoa(id); const oc = ocupacao(id); const st = statusPessoa(p);
    const pz = ui.parse.data(prazo.value);
    const fer = indisponivelAte(p, pz || isoDia(hoje0()));
    out.innerHTML = `${ui.led(fer ? 'warn' : estadoOcupacao(oc) === 'info' ? 'ok' : estadoOcupacao(oc), false)} <span>${esc(fmt.primeiro(p.nome))} está em <b class="num">${oc == null ? '—' : fmt.pct(oc, 0)}</b> de ocupação${oc > 100 ? ' — acima da capacidade; considere outra pessoa' : oc > 85 ? ' — perto do limite' : ''}.${fer ? ` ${esc(st.rotulo)}: o prazo cai nas férias.` : ''}</span>`;
  };
  sel.addEventListener('change', upd); prazo.addEventListener('change', upd); prazo.addEventListener('blur', upd); upd();
}
const regras = {
  titulo: 'obrigatorio|min:4',
  prazo: ['obrigatorio', 'data', v => (v && v < isoDia(hoje0()) ? 'O prazo não pode ser antes de hoje.' : '')],
  estimativaH: ['obrigatorio', v => (v == null || isNaN(v) || v < 0.5 || v > 80 ? 'Informe entre 0,5 e 80 horas.' : '')],
};

/** modal "+ Nova tarefa" */
export async function novaTarefa(pre = {}) {
  let criada = null;
  await ui.modal({
    titulo: 'Nova tarefa', sub: 'Quem for atribuído recebe uma notificação.', corpo: formHtml({}, pre), confirmar: 'Criar tarefa', largura: 'lg',
    onAbrir: ligarCarga,
    onConfirmar: box => {
      const r = ui.form.validar(box.querySelector('form'), regras); if (!r.ok) return false;
      const d = r.dados; if (escopoProprio()) d.respId = teamDeUser(auth.user());
      criada = criarTarefa(d);
      return true;
    },
  });
  if (criada) {
    const p = pessoa(criada.respId); const eu0 = eu();
    ui.toast(`Tarefa criada${eu0 && p.userId === eu0.id ? '' : ` · ${fmt.primeiro(p.nome)} foi notificada`}.`, {
      desfazer: () => db.batch(() => { db.remove('tasks', criada.id); db.remove('deliveries', `en-${criada.id}`); const s = db.find('teamStats', x => x.teamId === criada.respId); if (s) db.update('teamStats', s.id, { ajusteH: (s.ajusteH || 0) - (criada.estimativaH || 0) }); }),
      acao: { rotulo: 'Abrir', fn: () => router.go(`operacao/quadro?tarefa=${criada.id}`) },
    });
  }
  return criada;
}

/** modal de edição (reatribuir notifica a pessoa nova) */
export async function editarTarefa(id, aoSalvar) {
  const t = db.get('tasks', id); if (!t) return;
  let res = null;
  await ui.modal({
    titulo: 'Editar tarefa', sub: t.titulo, corpo: formHtml(t), confirmar: 'Salvar', largura: 'lg', onAbrir: ligarCarga,
    onConfirmar: box => {
      const r = ui.form.validar(box.querySelector('form'), { ...regras, prazo: ['obrigatorio', 'data', v => (v && v < isoDia(hoje0()) && v !== t.prazo ? 'O prazo não pode ser antes de hoje.' : '')] });
      if (!r.ok) return false;
      const d = r.dados; const antes = db.get('tasks', id); const antesEnt = db.get('deliveries', `en-${id}`);
      let reat = null;
      if (d.respId && d.respId !== t.respId) reat = reatribuir(id, d.respId);
      const mud = ['titulo', 'clientId', 'tipo', 'prazo', 'estimativaH', 'desc'].filter(k => String(d[k] ?? '') !== String(t[k] ?? ''));
      const atual = db.get('tasks', id);
      db.update('tasks', id, { titulo: d.titulo, clientId: d.clientId, tipo: d.tipo, prazo: d.prazo, estimativaH: Number(d.estimativaH), desc: d.desc, aprovadorId: d.aprovadorId || t.aprovadorId, historico: mud.length ? atual.historico.concat([{ quando: new Date().toISOString(), quem: (eu() || {}).id, oque: `editou ${mud.map(k => ({ titulo: 'o título', clientId: 'o cliente', tipo: 'o tipo', prazo: `o prazo para ${fmt.data(d.prazo)}`, estimativaH: 'a estimativa', desc: 'a descrição' }[k])).join(', ')}` }]) : atual.historico }, { log: `editou a tarefa ${d.titulo}` });
      if (db.get('deliveries', `en-${id}`)) db.update('deliveries', `en-${id}`, { titulo: d.titulo, clientId: d.clientId, tipo: d.tipo, prazo: d.prazo });
      res = { antes, antesEnt, reat };
      return true;
    },
  });
  if (res) {
    ui.toast(res.reat ? `Tarefa reatribuída a ${pessoa(res.reat.para).nome}, que foi notificada.` : 'Tarefa atualizada.', {
      desfazer: () => { db.batch(() => { db.insert('tasks', res.antes); if (res.antesEnt) db.insert('deliveries', res.antesEnt); if (res.reat) { const a = db.find('teamStats', s => s.teamId === res.reat.de), b = db.find('teamStats', s => s.teamId === res.reat.para); if (a) db.update('teamStats', a.id, { ajusteH: (a.ajusteH || 0) + res.reat.horas }); if (b) db.update('teamStats', b.id, { ajusteH: (b.ajusteH || 0) - res.reat.horas }); } }); aoSalvar && aoSalvar(); },
    });
    aoSalvar && aoSalvar();
  }
}

/** pede o motivo do ajuste e devolve a tarefa para "Em andamento" (retrabalho +1) */
export async function pedirAjuste(id, aoFim) {
  const t = db.get('tasks', id); if (!t) return;
  let r = null;
  await ui.modal({
    titulo: 'Pedir ajuste', sub: t.titulo, confirmar: 'Pedir ajuste', largura: 'md',
    corpo: `<form novalidate class="stack">${ui.campo({ nome: 'motivo', rotulo: 'O que precisa ser ajustado?', tipo: 'textarea', obrigatorio: true, placeholder: 'Seja específico: o que mudar, onde e por quê.' })}<p class="sm mut">A tarefa volta para <b>Em andamento</b>, conta como retrabalho e ${esc(pessoa(t.respId).nome)} é notificada.</p></form>`,
    onConfirmar: box => { const v = ui.form.validar(box.querySelector('form'), { motivo: 'obrigatorio|min:5' }); if (!v.ok) return false; r = mover(id, 'andamento', { motivo: v.dados.motivo }); return true; },
  });
  if (r) { ui.toast('Ajuste pedido · retrabalho registrado.', { tipo: 'warn', desfazer: () => { desfazer(r); aoFim && aoFim(); } }); aoFim && aoFim(); }
}

/** executa uma transição com as regras de permissão. Retorna true se moveu. */
export async function moverComRegras(id, destino, aoFim) {
  const t = db.get('tasks', id); if (!t || t.status === destino) return false;
  const user = auth.user();
  if (!podeEditarTarefa(t, user)) { ui.toast(`Você só pode mover as suas tarefas. Peça a ${pessoa(t.respId).nome} ou à gestão.`, { tipo: 'warn' }); return false; }
  const aprova = podeAprovar(t, user);
  if (destino === 'feito' && !aprova) {
    if (t.status !== 'aprovacao') ui.toast('Envie para aprovação antes de concluir.', { tipo: 'info', acao: { rotulo: 'Pedir aprovação', fn: () => moverComRegras(id, 'aprovacao', aoFim) } });
    else ui.toast(`Só ${pessoa(t.aprovadorId).nome} (aprovador) ou a gestão pode aprovar.`, { tipo: 'warn' });
    return false;
  }
  if (t.status === 'aprovacao' && (destino === 'andamento' || destino === 'afazer')) {
    if (aprova) { await pedirAjuste(id, aoFim); return true; }
    const r = mover(id, destino, { retirar: true }); ui.toast('Tarefa retirada da aprovação.', { desfazer: () => { desfazer(r); aoFim && aoFim(); } }); aoFim && aoFim(); return true;
  }
  const r = mover(id, destino);
  const msg = destino === 'aprovacao' ? `Enviada para aprovação · ${pessoa(t.aprovadorId).nome} foi notificada.` : destino === 'feito' ? (t.status === 'aprovacao' ? 'Entrega aprovada e registrada.' : 'Tarefa concluída e entrega registrada.') : `Movida para ${ROT_STATUS[destino]}.`;
  ui.toast(msg, { desfazer: () => { desfazer(r); aoFim && aoFim(); } });
  aoFim && aoFim();
  return true;
}

/* ---------------- painel de detalhes ---------------- */
function acoesHtml(t) {
  const user = auth.user(); const edita = podeEditarTarefa(t, user); const aprova = podeAprovar(t, user);
  const B = (rot, ic, attrs, tipo, extra = {}) => ui.btn({ rotulo: rot, icone: ic, sm: true, tipo, attrs, ...extra });
  const out = [];
  if (!edita) out.push(`<span class="sm mut">${ui.ic('lock')} Somente leitura: ${escopoProprio(user) ? 'você só edita as suas tarefas' : 'seu papel não edita a Operação'}.</span>`);
  else {
    if (t.status === 'afazer') out.push(B('Iniciar', 'play', { 'data-td': 'andamento' }));
    if (t.status === 'afazer' || t.status === 'andamento') out.push(B('Pedir aprovação', 'send', { 'data-td': 'aprovacao' }, 'pri'));
    if (t.status === 'aprovacao' && aprova) { out.push(B('Aprovar', 'check', { 'data-td': 'feito' }, 'pri')); out.push(B('Pedir ajuste', 'refresh', { 'data-td': 'ajuste' })); }
    if (t.status === 'aprovacao' && !aprova) out.push(`<span class="sm mut">Aguardando aprovação de <b>${esc(pessoa(t.aprovadorId).nome)}</b>.</span>`, B('Retirar da aprovação', 'arrow-left', { 'data-td': 'andamento' }, 'ghost'));
    if (t.status === 'feito' && aprova) out.push(B('Reabrir', 'refresh', { 'data-td': 'andamento' }, 'ghost'));
    out.push(B('Editar', 'edit', { 'data-td': 'editar' }, 'ghost'));
  }
  out.push(notify.botaoNotificar('tasks', t.id, t.titulo, { sm: true }));
  return out.join('');
}
function checklistHtml(t, edita) {
  const l = t.checklist || []; const f = l.filter(c => c.feito).length;
  return `<div class="td-sec"><div class="row between"><h3 class="td-h">Checklist</h3><span class="sm mut num">${f}/${l.length}</span></div>
${l.length ? ui.barra(l.length ? Math.round((f / l.length) * 100) : 0, { rotulo: false, fina: true, estado: f === l.length ? 'ok' : 'acc' }) : ''}
<ul class="td-ck">${l.map(c => `<li><label class="ck"><input type="checkbox" data-ck="${esc(c.id)}"${c.feito ? ' checked' : ''}${edita ? '' : ' disabled'}><span${c.feito ? ' class="td-ok"' : ''}>${esc(c.texto)}</span></label>${edita ? ui.btnIc('x', `Remover item "${c.texto}"`, { 'data-ck-del': c.id }, { cls: 'sm' }) : ''}</li>`).join('') || '<li class="sm mut">Nenhum item. Quebre a tarefa em passos para mostrar o progresso.</li>'}</ul>
${edita ? `<div class="td-add"><input type="text" class="td-add-in" aria-label="Novo item do checklist" placeholder="Adicionar item e Enter"><button type="button" class="btn sm" data-ck-add>${ui.ic('plus')}<span>Adicionar</span></button></div>` : ''}</div>`;
}
function infoHtml(t) {
  const p = pessoa(t.respId); const ap = pessoa(t.aprovadorId); const proj = t.projetoId ? db.get('projects', t.projetoId) : null;
  const pz = `${seloPrazo(t)} <span class="sm mut">${esc(fmt.data(t.prazo))}</span>`;
  return ui.pares([
    ['Status', `<b>${esc(ROT_STATUS[t.status])}</b>`],
    ['Prazo', pz],
    ['Cliente', `<a href="#/clientes/${esc(t.clientId)}">${esc(nomeCliente(t.clientId))}</a>`],
    ['Tipo', esc(rotTipo(t.tipo))],
    ['Responsável', `<span class="row" style="gap:6px;flex-wrap:nowrap">${ui.avatar(p, 22)}<a href="#/equipe/${esc(p.id)}">${esc(p.nome)}</a></span>`],
    ['Aprovador', `<span class="row" style="gap:6px;flex-wrap:nowrap">${ui.avatar(ap, 22)}${esc(ap.nome)}</span>`],
    ['Horas', `<span class="num">${fmt.dec(t.horasGastas || 0, 1)} de ${fmt.dec(t.estimativaH || 0, 1)} h</span>`],
    ['Retrabalho', t.retrabalho ? ui.selo(t.retrabalho > 1 ? 'err' : 'warn', fmt.plural(t.retrabalho, 'rodada') + ' de ajuste') : '<span class="mut">Nenhum</span>'],
    ...(proj ? [['Projeto', `<a href="#/operacao/projetos">${esc(proj.nome)}</a>`]] : []),
  ], { colunas: 2 });
}
function histHtml(t) {
  const h = (t.historico || []).slice().reverse();
  return `<div class="td-sec"><h3 class="td-h">Histórico</h3><ul class="td-hist">${h.map(x => { const u = x.quem ? db.get('users', x.quem) : null; return `<li><span class="td-hd"></span><div><b>${esc(u ? u.nome : 'Sistema')}</b> ${esc(x.oque)}<span class="sm mut"> · ${ui.rel(x.quando)}</span></div></li>`; }).join('') || '<li class="sm mut">Sem registros.</li>'}</ul></div>`;
}

/** abre o painel da tarefa; fecha → limpa ?tarefa= */
export function abrirTarefa(id) {
  const t0 = db.get('tasks', id);
  if (!t0) { ui.toast('Tarefa não encontrada. Ela pode ter sido excluída.', { tipo: 'err' }); router.setQuery({ tarefa: null }); return null; }
  const corpo = `<div class="m-operacao td"><div class="td-acoes row"></div><div class="td-info"></div><div class="td-desc"></div><div class="td-check"></div>
<div class="td-sec"><h3 class="td-h">Comentários</h3>${notify.comentarios('tasks', id, { titulo: t0.titulo })}</div><div class="td-hist-w"></div></div>`;
  const d = ui.drawer({ titulo: t0.titulo, sub: `${nomeCliente(t0.clientId)} · ${rotTipo(t0.tipo)}`, corpo, largura: 580 });
  const el = d.el;
  const pintar = () => {
    const t = db.get('tasks', id); if (!t) { d.fechar(); return; }
    const edita = podeEditarTarefa(t);
    el.querySelector('.mb-h h2').textContent = t.titulo;
    el.querySelector('.td-acoes').innerHTML = acoesHtml(t);
    el.querySelector('.td-info').innerHTML = infoHtml(t);
    el.querySelector('.td-desc').innerHTML = t.desc ? `<div class="td-sec"><h3 class="td-h">Descrição</h3><p class="td-p">${esc(t.desc).replace(/\n/g, '<br>')}</p></div>` : '';
    el.querySelector('.td-check').innerHTML = checklistHtml(t, edita);
    el.querySelector('.td-hist-w').innerHTML = histHtml(t);
  };
  pintar();
  const salvarCk = (lista, oque) => { const t = db.get('tasks', id); db.update('tasks', id, { checklist: lista, historico: oque ? t.historico.concat([{ quando: new Date().toISOString(), quem: (eu() || {}).id, oque }]) : t.historico }); pintar(); };
  el.addEventListener('click', async e => {
    const a = e.target.closest('[data-td]');
    if (a) {
      const k = a.dataset.td;
      if (k === 'editar') { await editarTarefa(id, pintar); return; }
      if (k === 'ajuste') { await pedirAjuste(id, pintar); return; }
      await moverComRegras(id, k, pintar); return;
    }
    const del = e.target.closest('[data-ck-del]');
    if (del) { const t = db.get('tasks', id); const item = t.checklist.find(c => c.id === del.dataset.ckDel); const antes = t.checklist; salvarCk(t.checklist.filter(c => c.id !== del.dataset.ckDel)); ui.toast('Item removido.', { desfazer: () => { db.update('tasks', id, { checklist: antes }); pintar(); } }); return; }
    if (e.target.closest('[data-ck-add]')) adicionar();
  });
  const adicionar = () => {
    const inp = el.querySelector('.td-add-in'); const v = inp && inp.value.trim();
    if (!v) { inp && inp.focus(); ui.toast('Escreva o item antes de adicionar.', { tipo: 'warn' }); return; }
    const t = db.get('tasks', id); salvarCk((t.checklist || []).concat([{ id: `${id}-c${Date.now().toString(36)}`, texto: v, feito: false }]));
    const n = el.querySelector('.td-add-in'); n && n.focus();
  };
  el.addEventListener('change', e => {
    const c = e.target.closest('[data-ck]'); if (!c) return;
    const t = db.get('tasks', id); const item = t.checklist.find(x => x.id === c.dataset.ck);
    salvarCk(t.checklist.map(x => (x.id === c.dataset.ck ? { ...x, feito: c.checked } : x)), c.checked ? `concluiu o checklist "${item.texto}"` : `reabriu o checklist "${item.texto}"`);
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('td-add-in')) { e.preventDefault(); adicionar(); } });
  d.fechado.then(() => { if (router.query.tarefa === id) router.setQuery({ tarefa: null }); });
  return d;
}
