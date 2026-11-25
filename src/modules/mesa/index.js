// mesa/index.js — "Minha mesa" (#/mesa): a fila pessoal "Precisa de você hoje" de cada pessoa do time.
// Agora / Hoje / Esta semana, cada item com LED, origem, ação primária real e "Feito" com Desfazer; coluna "Minha semana" e "Meus clientes".
import { db } from '../../core/store.js';
import { auth } from '../../core/auth.js';
import { perms } from '../../core/perms.js';
import { notify } from '../../core/notify.js';
import { ui } from '../../core/ui.js';
import * as fmt from '../../core/fmt.js';
import { mover, desfazer, pessoa, podeAprovar, userDe } from '../operacao/lib.js';
import { pedirAjuste } from '../operacao/tarefa.js';
import { fila, semana, meusClientes, SECOES, ORIGENS, GRUPOS, dispensar, trazerDeVolta, hojeIso, checkinDeHoje, precisaCheckin } from './fila.js';
import { marcarEnviado, desfazerEnvio, situacaoSemana, nomeDiaRelatorio } from './relatorios.js';
import { comissoesDe } from '../financeiro/comissoes.js';
import * as RES from '../clientes/resultados.js';

const esc = fmt.esc;
let ckAberto = false; // formulário de check-in aberto (sobrevive a re-render)
let relAbertos = false; // lista completa de relatórios semanais aberta
const REL_VISIVEIS = 3; // na visão "Tudo", mostra só os 3 primeiros relatórios de cada seção (o resto abre em "Mostrar mais")

const saudacao = () => { const h = new Date().getHours(); return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const MUTA = new Set(['tarefa-feito', 'aprovar', 'ajuste', 'lida', 'resolver-alerta', 'webinar-check', 'dispensar', 'checkin', 'relatorio-enviado']);

function resumo(ps) {
  const a = ps.agora.length, h = ps.hoje.length, s = ps.semana.length;
  if (!a && !h && !s) return '';
  const partes = [];
  if (a) partes.push(`${fmt.plural(a, 'item', 'itens')} para agora`);
  if (h) partes.push(`${a ? h : fmt.plural(h, 'item', 'itens')} para hoje`);
  if (s) partes.push(`${a || h ? s : fmt.plural(s, 'item', 'itens')} esta semana`);
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : partes[0];
}

/* ---------------- item ---------------- */
function botao(a, c, o = {}) {
  if (!a) return '';
  const bloqueado = a.acao && MUTA.has(a.acao) && c.vendoComo;
  const title = bloqueado ? `Você está vendo como ${fmt.primeiro(c.user.nome)}. Só ${fmt.primeiro(c.user.nome)} pode fazer isso.` : a.title;
  const attrs = { ...(a.acao ? { 'data-acao': a.acao } : {}), ...(o.k ? { 'data-k': o.k } : {}) };
  if (a.href && !bloqueado) return ui.btn({ rotulo: a.rotulo, href: a.href, icone: o.icone === false ? null : a.icone, sm: true, tipo: o.tipo, title, attrs });
  return ui.btn({ rotulo: a.rotulo, icone: o.icone === false ? null : a.icone, sm: true, tipo: o.tipo, title, disabled: bloqueado, attrs });
}
function formCheckin(c, it) {
  const atual = checkinDeHoje(c.me);
  return `<form class="m-mesa-ck" data-ck-form novalidate${ckAberto ? '' : ' hidden'}>
<div class="m-mesa-ck-g">
${ui.campo({ nome: 'fiz', rotulo: 'O que fiz', tipo: 'textarea', obrigatorio: true, valor: atual && atual.fiz, linhas: 2, placeholder: 'Ex.: Subi a campanha de remarketing do cliente.' })}
${ui.campo({ nome: 'farei', rotulo: 'O que farei', tipo: 'textarea', obrigatorio: true, valor: (atual && atual.farei) || '', linhas: 2, placeholder: 'Ex.: Fechar o relatório de outubro.' })}
${ui.campo({ nome: 'bloqueios', rotulo: 'Bloqueios', tipo: 'textarea', valor: atual && atual.bloqueios, linhas: 2, placeholder: 'Deixe em branco se não houver', dica: 'Se houver bloqueio, seu gestor é avisado.' })}
</div>
<div class="m-mesa-ck-a">${ui.btn({ rotulo: 'Cancelar', sm: true, tipo: 'ghost', attrs: { 'data-ck-cancelar': '' } })}${ui.btn({ rotulo: 'Salvar check-in', icone: 'check', sm: true, tipo: 'pri', submit: true })}</div></form>`;
}
function itemHtml(it, c, oculto = false) {
  const o = ORIGENS[it.origem] || ORIGENS.tarefa;
  const tit = it.href ? `<a class="m-mesa-t" href="${esc(it.href)}"${it.ids ? ` data-acao="abrir-notif" data-k="${esc(it.k)}"` : ''}>${esc(it.titulo)}</a>` : `<b class="m-mesa-t">${esc(it.titulo)}</b>`;
  const det = it.detalhe ? `<p class="m-mesa-d${it.detalheCitacao ? ' is-cit' : ''}">${esc(it.detalhe)}</p>` : '';
  const meta = `<div class="m-mesa-m"><span class="m-mesa-o">${ui.ic(o.icone)}${esc(o.rotulo)}</span>${it.avatar ? `<span class="m-mesa-de">${ui.avatar(it.avatar, 16)}${esc(fmt.primeiro(it.avatar.nome))}</span>` : ''}${it.meta ? `<span class="m-mesa-q num${it.metaEstado ? ` t-${it.metaEstado}` : ''}">${esc(it.meta)}</span>` : ''}</div>`;
  const pri = botao(it.pri, c, { k: it.k, tipo: (it.sec === 'agora' && it.estado === 'err') || it.origem === 'aprovacao' || it.origem === 'checkin' ? 'pri' : '' });
  const sec = (it.extra ? botao(it.extra, c, { k: it.k, tipo: 'ghost', icone: false }) : '') + (it.sec2 ? botao(it.sec2, c, { k: it.k, tipo: 'ghost', icone: false }) : '');
  return `<li class="m-mesa-i s-${esc(it.estado)}" data-k="${esc(it.k)}" data-origem="${esc(it.origem)}"${oculto ? ' hidden data-rel-oculto' : ''}>
<span class="m-mesa-led">${ui.led(it.estado, false, { aria: it.estado === 'err' ? 'Crítico' : it.estado === 'warn' ? 'Atenção' : 'Planejado' })}</span>
<div class="m-mesa-b">${tit}${det}${meta}</div>
<div class="m-mesa-a">${sec}${pri}</div>
${it.checkin ? formCheckin(c, it) : ''}</li>`;
}

/* ---------------- coluna lateral ---------------- */
function lateral(c, ctx) {
  const s = semana(c);
  const stat = (rotulo, valor, sub, estado, ajuda) => `<div class="m-mesa-st"><span class="m-mesa-st-r">${esc(rotulo)}${ui.ajuda(ajuda)}</span><b class="num">${valor}</b><span class="m-mesa-st-s">${estado ? ui.led(estado, false) : ''}${esc(sub)}</span></div>`;
  const temCarga = s.ocupacao != null;
  const semanaHtml = `<div class="m-mesa-sts">
${stat('Entregas no prazo', s.noPrazo == null ? '—' : fmt.pct(s.noPrazo, 0), s.entregas ? `${s.entregasOk} de ${s.entregas} nos últimos 7 dias` : 'Nenhuma entrega em 7 dias', s.noPrazo == null ? '' : s.noPrazo >= 95 ? 'ok' : s.noPrazo >= 85 ? 'warn' : 'err', 'Entregas suas concluídas nos últimos 7 dias dentro do prazo ÷ total entregue. Meta da agência: 95%.')}
${stat('Tarefas concluídas', fmt.num(s.concluidas), `${fmt.plural(s.abertas, 'aberta', 'abertas')} no quadro`, '', 'Tarefas suas que foram para Feito nos últimos 7 dias.')}
${stat('Ocupação', temCarga ? fmt.pct(s.ocupacao, 0) : '—', temCarga ? s.ocRotulo + ' · zona ideal 70–85%' : 'Sem carga planejada', temCarga ? (s.ocEstado === 'info' ? 'off' : s.ocEstado) : '', 'Horas planejadas na semana ÷ capacidade semanal (horas do mês ÷ 4). Zona ideal: 70–85%.')}
</div>`;
  const cli = meusClientes(c);
  const cliHtml = cli.length ? `<ul class="m-mesa-cl">${cli.map(x => `<li><a href="#/clientes/${esc(x.id)}">${ui.led(x.health == null ? 'off' : ui.faixa(x.health, 'health'), false)}<span class="trunc">${esc(x.nome)}</span><span class="m-mesa-cl-r">${x.resp ? 'Resp.' : 'Equipe'}</span><b class="num">${x.health ?? '—'}</b></a></li>`).join('')}</ul>`
    : ui.vazio({ icone: 'building', titulo: 'Nenhum cliente sob você', texto: perms.can('clientes', 'ver', c.user) ? 'Clientes em que você é responsável ou está na equipe aparecem aqui com o health score.' : 'Seu papel não acompanha clientes.', compacto: true, acao: perms.can('clientes', 'ver', c.user) ? { rotulo: 'Ver carteira', href: '#/clientes' } : null });
  const semDados = s.noPrazo == null && !s.concluidas && !s.abertas && s.ocupacao == null;
  const coms = comissoesDe(c.me).filter(x => x.ativa).sort((a, b) => a.restantes - b.restantes || b.mensal - a.mensal);
  const totCom = coms.reduce((a, x) => a + x.mensal, 0);
  const comHtml = coms.length ? ui.card({ titulo: 'Minhas comissões variáveis', icone: 'dollar', cls: 'm-mesa-com', pad: false,
    ajuda: 'Valor extra que você recebe por mês por cliente, combinado com a diretoria, enquanto durar o prazo. Dúvidas: fale com o financeiro.',
    corpo: `<ul class="m-mesa-coms">${coms.map(x => `<li><span class="trunc">${esc(x.cliente)}</span><b class="num">${fmt.brl(x.mensal)}<span class="mut">/mês</span></b><span class="m-mesa-com-r${x.restantes <= 1 ? ' t-warn' : ''}">${x.restantes <= 1 ? 'último mês' : `${x.restantes} meses restantes`}</span></li>`).join('')}</ul>
<div class="m-mesa-com-t"><span>Total por mês</span><b class="num">${fmt.brl(totCom)}</b></div>` }) : '';
  return `<aside class="m-mesa-lat stack">
${semDados ? '' : ui.card({ titulo: 'Minha semana', icone: 'activity', corpo: semanaHtml, acoes: perms.can('equipe', 'ver', c.user) && c.pessoa ? ui.btn({ rotulo: 'Meu perfil', href: `#/equipe/${c.me}`, sm: true, tipo: 'link' }) : '' })}
${comHtml}
${ui.card({ titulo: 'Meus clientes', icone: 'building', sub: cli.length ? fmt.plural(cli.length, 'cliente') : '', ajuda: 'Responsável primeiro, depois os clientes em que você está na equipe. LED pelo health score: ≥75 saudável · 60–74 atenção · <60 em risco.', corpo: cliHtml, pad: cli.length ? false : undefined })}
</aside>`;
}

/* ---------------- próximo passo útil (estado vazio) ---------------- */
function proximoPasso(c) {
  if (c.leitura && perms.can('cockpit', 'ver', c.user)) return { texto: 'Seu acesso é de leitura. Os números da agência estão no cockpit.', acao: { rotulo: 'Abrir o cockpit', href: '#/cockpit', icone: 'gauge' } };
  if (perms.can('operacao', 'ver', c.user)) {
    const prox = db.list('tasks', t => t.respId === c.me && t.status !== 'feito' && t.prazo).sort((a, b) => a.prazo.localeCompare(b.prazo))[0];
    if (prox) return { texto: `Próxima entrega: "${prox.titulo}" em ${fmt.data(prox.prazo)}. Dá para adiantar.`, acao: { rotulo: 'Adiantar a próxima tarefa', href: `#/operacao/quadro?tarefa=${prox.id}`, icone: 'kanban' } };
    return { texto: 'Nenhuma tarefa aberta com você. Veja o quadro do time e puxe a próxima.', acao: { rotulo: 'Abrir o quadro', href: '#/operacao/quadro', icone: 'kanban' } };
  }
  if (perms.can('cockpit', 'ver', c.user)) return { texto: 'Aproveite para olhar os números da agência.', acao: { rotulo: 'Abrir o cockpit', href: '#/cockpit', icone: 'gauge' } };
  if (perms.can('comercial', 'ver', c.user)) return { texto: 'Aproveite para avançar o pipeline.', acao: { rotulo: 'Abrir o comercial', href: '#/comercial', icone: 'target' } };
  return { texto: 'Quando algo precisar de você, aparece aqui.', acao: { rotulo: 'Ver notificações', href: '#/notificacoes', icone: 'bell' } };
}

/* ---------------- render ---------------- */
function render(ctx) {
  const f = fila(ctx.user); const c = f.c;
  if (!c) return `<div class="pg">${ui.vazio({ titulo: 'Entre para ver sua mesa' })}</div>`;
  const filtro = GRUPOS.some(g => g.id === ctx.query.o) ? ctx.query.o : '';
  const ps = f.porSecao; const total = f.itens.length;
  const nome = fmt.primeiro(c.user.nome);
  const hoje = new Date();
  const txt = resumo(ps);
  const ledTopo = ps.agora.length ? 'err' : ps.hoje.length ? 'warn' : 'ok';
  const head = `<header class="m-mesa-hd">
<div><h1>${esc(saudacao())}, ${esc(nome)}.</h1>
<p class="m-mesa-res">${ui.led(ledTopo, false)}<span>${total ? `<b>${esc(txt)}</b>.` : 'Tudo em dia. Nada precisa de você agora.'}</span></p></div>
<div class="m-mesa-hd-m sm mut"><span>${esc(fmt.diaSemana(hoje))}, ${fmt.data(hoje)}</span><span aria-hidden="true">·</span><span>atualizado ${ui.rel(new Date().toISOString())}</span>${c.leitura ? `<span aria-hidden="true">·</span><span>${ui.ic('eye')} somente leitura</span>` : ''}</div></header>`;
  const contaGrupo = g => f.itens.filter(i => (ORIGENS[i.origem] || {}).grupo === g).length;
  const gruposComItens = GRUPOS.filter(g => contaGrupo(g.id));
  const chips = total && gruposComItens.length > 1 ? ui.chips([{ id: '', rotulo: 'Tudo', n: total }].concat(gruposComItens.map(g => ({ id: g.id, rotulo: g.rotulo, n: contaGrupo(g.id) }))), filtro, 'o', { rotulo: 'Filtrar por origem', cls: 'm-mesa-chips' }) : '';
  const vis = i => !filtro || (ORIGENS[i.origem] || {}).grupo === filtro;

  let corpo;
  if (!total) {
    const p = proximoPasso(c);
    corpo = `<section class="card m-mesa-vazio"><div class="m-mesa-vz-i">${ui.ic('check-circle')}</div><h2>Tudo em dia, ${esc(nome)}.</h2>
<p>Nenhuma tarefa atrasada, nada esperando sua aprovação, nenhuma menção sem resposta${precisaCheckin(c) ? ' e o check-in de hoje está feito' : ''}.</p><p class="mut">${esc(p.texto)}</p>
${ui.btn({ rotulo: p.acao.rotulo, href: p.acao.href, icone: p.acao.icone, tipo: 'pri' })}</section>`;
  } else {
    const secoes = SECOES.map(s => {
      const l = ps[s.id].filter(vis);
      if (!l.length) return '';
      // muitos relatórios semanais: na visão "Tudo" mostra os primeiros e recolhe o resto
      const rels = l.filter(i => i.origem === 'relatorio');
      const recolhe = !filtro && !relAbertos && rels.length > REL_VISIVEIS + 1;
      const ocultos = recolhe ? new Set(rels.slice(REL_VISIVEIS).map(i => i.k)) : new Set();
      const mais = ocultos.size ? `<li class="m-mesa-mais"><button type="button" class="btn sm ghost" data-rel-mais aria-expanded="false">${ui.ic('chev-down')}<span>Mostrar mais ${fmt.plural(ocultos.size, 'relatório semanal', 'relatórios semanais')}</span></button><a class="btn sm link" href="${esc(ctx.router.href(null, { o: 'relatorio' }))}">Ver só relatórios</a></li>` : '';
      return `<section class="card np m-mesa-sec sec-${s.id}" aria-labelledby="mesa-h-${s.id}">
<header class="m-mesa-sh">${ui.led(s.estado, false)}<h2 id="mesa-h-${s.id}">${esc(s.rotulo)}</h2><span class="m-mesa-n num">${l.length}</span><span class="m-mesa-ss">${esc(s.sub)}</span></header>
<ul class="m-mesa-l">${l.map(i => itemHtml(i, c, ocultos.has(i.k))).join('')}${mais}</ul></section>`;
    }).join('');
    corpo = secoes || `<section class="card">${ui.vazio({ icone: 'filter', titulo: 'Nada desta origem na sua mesa', texto: 'Os outros itens continuam na fila.', compacto: true, acao: { rotulo: 'Ver tudo', href: ctx.router.href(null, { o: null }) } })}</section>`;
  }
  const disp = f.dispensados.length ? `<details class="m-mesa-disp"><summary>${ui.ic('check-circle')}<span>${fmt.plural(f.dispensados.length, 'item marcado', 'itens marcados')} como feito hoje</span></summary><ul>${f.dispensados.map(i => `<li>${ui.led('ok', false)}<span class="trunc"><s>${esc(i.titulo)}</s> <span class="mut sm">· ${esc((ORIGENS[i.origem] || {}).rotulo || '')} · ${esc(fmt.rel(i.dispensado.quando))}</span></span>${c.leitura ? '' : ui.btn({ rotulo: 'Trazer de volta', sm: true, tipo: 'link', disabled: c.vendoComo, attrs: { 'data-voltar-item': i.k } })}</li>`).join('')}</ul></details>` : '';
  const relS = filtro === 'relatorio' ? situacaoSemana(c.user) : null;
  const relTopo = relS && relS.total ? `<div class="card m-mesa-relp"><div><b>${relS.momento === 'depois' && relS.pendentes.length ? 'Relatórios da semana atrasados' : `${nomeDiaRelatorio().replace(/^./, x => x.toUpperCase())} é dia de relatório`}</b><span class="mut sm">${relS.enviados} de ${relS.total} enviados · semana ${esc(relS.semana.slice(-2))}</span></div>${ui.barra((relS.enviados / relS.total) * 100, { faixas: [{ ate: 99.9, estado: relS.momento === 'depois' ? 'err' : 'warn' }, { ate: Infinity, estado: 'ok' }], rotulo: false, fina: true })}</div>` : '';
  const aviso = c.vendoComo ? ui.aviso({ tipo: 'info', titulo: `Esta é a mesa de ${c.user.nome}.`, texto: 'Você vê exatamente a fila dessa pessoa. Ações que concluem itens ficam com ela.' }) : '';
  return `<div class="pg m-mesa">${head}${aviso}${chips}${relTopo}<div class="m-mesa-g"><div class="m-mesa-fila stack">${corpo}${disp}</div>${lateral(c, ctx)}</div></div>`;
}

/* ---------------- ações ---------------- */
function achar(k) { return fila().itens.find(i => i.k === k) || null; }

async function executar(acao, k, el) {
  const c = fila().c; const it = achar(k); if (!it && acao !== 'checkin') return;
  if (c.vendoComo && MUTA.has(acao)) return;
  if (acao === 'tarefa-feito') {
    const t = db.get('tasks', it.ref); if (!t) return;
    if (podeAprovar(t)) { const r = mover(t.id, 'feito'); if (r) ui.toast('Tarefa concluída · entrega registrada.', { tipo: 'ok', desfazer: () => desfazer(r) }); }
    else { const r = mover(t.id, 'aprovacao'); if (r) ui.toast(`Enviada para aprovação de ${pessoa(t.aprovadorId).nome}.`, { tipo: 'ok', desfazer: () => desfazer(r) }); }
    return;
  }
  if (acao === 'aprovar') {
    const t = db.get('tasks', it.ref); if (!t) return;
    if (!podeAprovar(t)) { ui.toast(`Só ${pessoa(t.aprovadorId).nome} (aprovador) ou a gestão pode aprovar.`, { tipo: 'warn' }); return; }
    const r = mover(t.id, 'feito');
    if (r) ui.toast(`Aprovada · ${fmt.primeiro(pessoa(t.respId).nome)} foi avisada.`, { tipo: 'ok', desfazer: () => desfazer(r) });
    return;
  }
  if (acao === 'ajuste') { await pedirAjuste(it.ref); return; }
  if (acao === 'lida') {
    db.batch(() => it.ids.forEach(id => notify.marcarLida(id, true)));
    ui.toast(it.ids.length > 1 ? `${it.ids.length} notificações marcadas como lidas.` : 'Marcada como lida.', { desfazer: () => db.batch(() => it.ids.forEach(id => notify.marcarLida(id, false))) });
    return;
  }
  if (acao === 'resolver-alerta') {
    const a = db.get('alerts', it.ref); if (!a) return;
    const antes = { status: a.status, resolvido: !!a.resolvido, resolvidoEm: a.resolvidoEm || null, resolvidoPor: a.resolvidoPor || null };
    const eu = auth.real() || auth.user();
    db.update('alerts', a.id, { status: 'resolvido', resolvido: true, resolvidoEm: new Date().toISOString(), resolvidoPor: eu ? eu.nome : '' }, { log: `resolveu o alerta "${a.titulo}"` });
    if (a.atribuidoA && a.atribuidoA !== c.me) { const u = userDe(a.atribuidoA); if (u) notify.enviar({ para: [u], tipo: 'sistema', titulo: `Alerta resolvido: ${a.titulo}`, texto: `Marcado como resolvido por ${eu ? eu.nome : 'alguém'}.`, link: `#/alertas?alerta=${a.id}` }); }
    ui.toast(`"${a.titulo}" resolvido.`, { tipo: 'ok', desfazer: () => db.update('alerts', a.id, antes) });
    return;
  }
  if (acao === 'webinar-check') {
    const w = db.get('webinars', it.ref); if (!w) return;
    const antes = w.checklist || [];
    const novo = antes.map(x => (x.id === it.refItem ? { ...x, feito: true, feitoEm: new Date().toISOString(), feitoPor: c.me } : x));
    db.update('webinars', w.id, { checklist: novo }, { log: `concluiu "${it.titulo}" no checklist de ${w.tema}` });
    ui.toast(`Checklist: "${it.titulo}" feito.`, { tipo: 'ok', desfazer: () => db.update('webinars', w.id, { checklist: antes }) });
    return;
  }
  if (acao === 'relatorio-enviado') {
    const r = marcarEnviado(it.ref, c.user); if (!r) return;
    const s = situacaoSemana(c.user);
    ui.toast(`Relatório de ${(db.get('clients', it.ref) || {}).nome} marcado como enviado · ${s.enviados} de ${s.total} nesta semana.`, { tipo: 'ok', desfazer: r.novo ? () => desfazerEnvio(r.r.id) : undefined });
    return;
  }
  if (acao === 'relatorio-copiar') {
    const cl = db.get('clients', it.ref); if (!cl) return;
    let txt = '';
    try { txt = RES.resumoMensal({ fmt, db, ui }, cl); } catch (e) { txt = ''; }
    if (!txt) { ui.toast('Não foi possível montar o resumo deste cliente. Abra os resultados e copie de lá.', { tipo: 'warn' }); return; }
    const ok = await copiar(txt);
    ui.toast(ok ? 'Resumo copiado. Cole no WhatsApp do cliente e depois marque como enviado.' : 'Não foi possível copiar automaticamente. Abra os resultados do cliente.', { tipo: ok ? 'ok' : 'warn', acao: ok && !c.vendoComo ? { rotulo: 'Marcar como enviado', fn: () => executar('relatorio-enviado', k) } : undefined });
    return;
  }
  if (acao === 'dispensar') {
    dispensar(c.me, it);
    ui.toast(`"${it.titulo}" saiu da mesa por hoje.`, { tipo: 'ok', desfazer: () => trazerDeVolta(c.me, it.k) });
    return;
  }
  if (acao === 'checkin') {
    ckAberto = true;
    const li = el.closest('.m-mesa-i'); const f = li && li.querySelector('[data-ck-form]');
    if (f) { f.hidden = false; const ta = f.querySelector('textarea'); ta && ta.focus(); }
  }
}

async function copiar(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch (e) {
    try { const ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e2) { return false; }
  }
}

function salvarCheckin(form) {
  const c = fila().c; if (!c || c.leitura || c.vendoComo) return;
  const r = ui.form.validar(form, { fiz: 'obrigatorio|min:3', farei: 'obrigatorio|min:3' }); if (!r.ok) return;
  const atual = checkinDeHoje(c.me);
  const d = { fiz: String(r.dados.fiz || '').trim(), farei: String(r.dados.farei || '').trim(), bloqueios: String(r.dados.bloqueios || '').trim() };
  const novo = db.upsert('checkins', { id: atual ? atual.id : `ck-${c.me.slice(2)}-${Date.now().toString(36)}`, teamId: c.me, data: hojeIso(), quando: new Date().toISOString(), ...d }, { log: 'fez o check-in do dia' });
  const ges = c.pessoa && c.pessoa.gestorId;
  if (d.bloqueios && ges && (!atual || atual.bloqueios !== d.bloqueios)) notify.enviar({ para: [userDe(ges)], tipo: 'alerta', titulo: `${c.pessoa.nome} informou um bloqueio`, texto: d.bloqueios, link: '#/equipe/atividade', refCol: 'checkins', refId: novo.id });
  ckAberto = false;
  ui.toast(d.bloqueios ? `Check-in salvo · ${fmt.primeiro(pessoa(ges).nome)} foi avisado sobre o bloqueio.` : 'Check-in salvo. Bom trabalho hoje.', { tipo: 'ok', desfazer: () => { if (atual) db.insert('checkins', atual); else db.remove('checkins', novo.id); } });
}

function mount(el) {
  const onClick = e => {
    const v = e.target.closest('[data-voltar-item]');
    if (v) { const c = fila().c; if (c && !c.vendoComo) { trazerDeVolta(c.me, v.dataset.voltarItem); ui.toast('Item de volta na mesa.', { tipo: 'info' }); } return; }
    const mais = e.target.closest('[data-rel-mais]');
    if (mais) { relAbertos = true; const ul = mais.closest('.m-mesa-l'); ul.querySelectorAll('[data-rel-oculto]').forEach(li => { li.hidden = false; }); mais.closest('.m-mesa-mais').remove(); return; }
    if (e.target.closest('[data-ck-cancelar]')) { ckAberto = false; const f = e.target.closest('[data-ck-form]'); if (f) { f.hidden = true; ui.form.limparErros(f); } return; }
    const b = e.target.closest('[data-acao]'); if (!b || b.disabled) return;
    const acao = b.dataset.acao; const k = b.dataset.k || (b.closest('[data-k]') || {}).dataset?.k;
    if (acao === 'abrir-notif') { const it = achar(k); if (it && it.ids && !fila().c.vendoComo) db.batch(() => it.ids.forEach(id => notify.marcarLida(id, true))); return; }
    if (b.tagName === 'A') return;
    e.preventDefault();
    executar(acao, k, b);
  };
  const onSubmit = e => { const f = e.target.closest('[data-ck-form]'); if (!f) return; e.preventDefault(); salvarCheckin(f); };
  const onKey = e => { if (e.key === 'Escape' && e.target.closest && e.target.closest('[data-ck-form]')) { e.stopPropagation(); ckAberto = false; e.target.closest('[data-ck-form]').hidden = true; } };
  el.addEventListener('click', onClick); el.addEventListener('submit', onSubmit); el.addEventListener('keydown', onKey);
  return () => { el.removeEventListener('click', onClick); el.removeEventListener('submit', onSubmit); el.removeEventListener('keydown', onKey); };
}

export default {
  id: 'mesa', titulo: 'Minha mesa', icone: 'inbox', grupo: 'visao', rota: 'mesa', routes: ['mesa'],
  watch: ['tasks', 'deliveries', 'notifications', 'alerts', 'clients', 'meetings', 'onboarding', 'webinars', 'checkins', 'teamStats', 'settings', 'team', 'users', 'relatorios'],
  render, mount,
  contador() {
    if (!auth.user()) return null;
    const f = fila(); const a = f.porSecao.agora.length, h = f.porSecao.hoje.length;
    if (a) return { n: a, estado: 'err', rotulo: `${fmt.plural(a, 'item', 'itens')} para agora na sua mesa` };
    if (h) return { n: h, estado: 'warn', rotulo: `${fmt.plural(h, 'item', 'itens')} para hoje na sua mesa` };
    return null;
  },
};
