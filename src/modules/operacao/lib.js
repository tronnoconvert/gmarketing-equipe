// lib.js — regras de negócio de Operação (usadas também por Equipe): tarefas, entregas, ocupação, mover/criar/atribuir com notificação.
import { db } from '../../core/store.js';
import { auth } from '../../core/auth.js';
import { perms } from '../../core/perms.js';
import { notify } from '../../core/notify.js';
import * as fmt from '../../core/fmt.js';
import { padrao } from '../../core/padroes/index.js';
import { addDias, diasPara, dataDe, hoje0, isoDia, ROT_STATUS, aberta, atrasada, FATURAVEIS, nomeCliente, rotTipo, cliente } from './base.js';

/* ---------------- pessoas ---------------- */
export const pessoa = id => db.get('team', id) || { id, nome: 'Sem responsável', iniciais: '?' };
export const userDe = teamId => (pessoa(teamId).userId || String(teamId || '').replace(/^t-/, 'u-'));
export const teamDeUser = u => (u && (u.teamId || String(u.id || '').replace(/^u-/, 't-'))) || null;
export const eu = () => auth.real() || auth.user();
export const stats = teamId => db.find('teamStats', s => s.teamId === teamId);
export const capSemanal = teamId => ((pessoa(teamId).horasMes || 160) / 4);

/** ocupação atual (%) = planejado na semana ÷ capacidade; o ajuste vem de redistribuições/novas tarefas */
export function ocupacao(teamId) {
  const s = stats(teamId); if (!s) return null;
  return Math.max(0, Math.round(s.ocupacao + ((s.ajusteH || 0) / capSemanal(teamId)) * 100));
}
/** projeção de 4 semanas: [esta semana, +1, +2, +3] */
export function projecao(teamId) {
  const s = stats(teamId); if (!s) return [];
  const aj = ((s.ajusteH || 0) / capSemanal(teamId)) * 100;
  const p = s.projecao || [];
  return [ocupacao(teamId), p[0] != null ? Math.max(0, Math.round(p[0] + aj * 0.5)) : null, p[1] ?? null, p[2] ?? null];
}
/** faixas de ocupação da central "Padrões e regras": {min (início da zona ideal), max (fim da zona ideal), critico} */
export const limOcupacao = () => ({ min: padrao('equipe.ocupacao.idealMin', 70), max: padrao('equipe.ocupacao.idealMax', 85), critico: padrao('equipe.ocupacao.critico', 100) });
/** semanas de burnout: {atencao, critico} */
export const limBurnout = () => ({ atencao: padrao('equipe.burnout.atencao', 2), critico: padrao('equipe.burnout.critico', 3) });
/** acima do limite crítico de ocupação? */
export const sobrecarga = v => v != null && v > limOcupacao().critico;
/** semanas seguidas acima do limite crítico (contando a atual) */
export function semanasAcima(teamId) {
  const s = stats(teamId); if (!s) return 0;
  const h = (s.historico || []).slice(0, -1).concat([ocupacao(teamId)]); const lim = limOcupacao().critico;
  let n = 0; for (let i = h.length - 1; i >= 0 && h[i] > lim; i--) n++;
  return n;
}
export function estadoOcupacao(v) { if (v == null) return 'off'; const l = limOcupacao(); return v > l.critico ? 'err' : v > l.max ? 'warn' : v >= l.min ? 'ok' : 'info'; }
export function rotuloOcupacao(v) { if (v == null) return 'Sem dados'; const l = limOcupacao(); return v > l.critico ? 'Crítico' : v > l.max ? 'Atenção' : v >= l.min ? 'Ideal' : 'Ociosa'; }
/** texto das faixas: "70–85% ideal · 86–100% atenção · >100% crítico · <70% ociosa" */
export const faixasOcupacaoTxt = () => { const l = limOcupacao(); return `${l.min}–${l.max}% ideal · ${l.max + 1}–${l.critico}% atenção · >${l.critico}% crítico · <${l.min}% ociosa`; };
/** status com LED: online ok · ausente warn · férias/folga off · sobrecarga err (online e >100%) */
export function statusPessoa(t) {
  const st = t.status || 'online'; const oc = ocupacao(t.id);
  if (st === 'ferias' || st === 'folga') return { estado: 'off', rotulo: t.statusAte ? `Férias até ${fmt.dataCurta(t.statusAte)}` : 'Férias', chave: 'ferias' };
  if (st === 'ausente') return { estado: 'warn', rotulo: 'Ausente', chave: 'ausente' };
  if (sobrecarga(oc)) return { estado: 'err', rotulo: 'Sobrecarga', chave: 'sobrecarga' };
  return { estado: 'ok', rotulo: 'Online', chave: 'online' };
}
export const indisponivelAte = (t, prazoIso) => (t.status === 'ferias' || t.status === 'folga') && t.statusAte && (!prazoIso || t.statusAte >= prazoIso);

/* ---------------- permissões ---------------- */
export function podeEditarTarefa(t, user = auth.user()) {
  if (!perms.can('operacao', 'editar', user)) return false;
  if (perms.escopo('operacao', user) === 'seus') return !t || t.respId === teamDeUser(user);
  return true;
}
export const escopoProprio = (user = auth.user()) => perms.escopo('operacao', user) === 'seus';
/** pode aprovar: aprovador, dono/admin ou quem edita tudo (não a própria pessoa responsável, exceto dono/admin) */
export function podeAprovar(t, user = auth.user()) {
  if (!user || !perms.can('operacao', 'editar', user)) return false;
  const me = teamDeUser(user);
  if (t.aprovadorId === me) return true;
  if (['dono', 'admin'].includes(user.papel)) return true;
  return perms.escopo('operacao', user) !== 'seus' && t.respId !== me;
}
/** tarefas visíveis: escopo de clientes do usuário (se houver clientes cadastrados) + as atribuídas a ele */
export function tarefasVisiveis(pred) {
  const user = auth.user(); const me = teamDeUser(user);
  let l = db.list('tasks', pred);
  const esc = perms.escopoClientes();
  if (esc !== 'todos' && db.count('clients') > 0) l = l.filter(t => t.respId === me || esc.includes(t.clientId));
  return l;
}

/* ---------------- entregas / indicadores ---------------- */
export function entregasNaJanela(diasIni, diasFim = 0, pred) {
  const a = addDias(-diasIni).getTime(), b = addDias(diasFim + 1).getTime();
  return db.list('deliveries', d => d.entregueEm && (!pred || pred(d)) && (() => { const t = new Date(d.entregueEm).getTime(); return t >= a && t < b; })());
}
export function pctNoPrazo(lista) { if (!lista.length) return null; return (lista.filter(d => d.noPrazo).length / lista.length) * 100; }
/** % no prazo por janela de 7 dias, 12 janelas (mais antiga primeiro) */
export function serieSemanal(pred, n = 12) {
  const out = [];
  for (let k = n - 1; k >= 0; k--) {
    const l = entregasNaJanela(7 * k + 6, -7 * k, pred);
    out.push({ rotulo: fmt.dataCurta(addDias(-7 * k)), pct: pctNoPrazo(l), total: l.length, ok: l.filter(d => d.noPrazo).length, lista: l });
  }
  return out;
}
export const diasAtraso = t => Math.max(0, -diasPara(t.prazo));

/* ---------------- histórico ---------------- */
function hist(t, oque) { const u = eu(); return (t.historico || []).concat([{ quando: new Date().toISOString(), quem: u ? u.id : null, oque }]); }
function syncEntrega(t, patch) { const id = `en-${t.id}`; if (db.get('deliveries', id)) db.update('deliveries', id, patch); }

/**
 * mover(taskId, status, {motivo}) — aplica a regra de cada transição:
 * → aprovacao: notifica o aprovador · aprovacao → feito: aprova, registra entrega, notifica responsável
 * aprovacao → andamento/afazer: "pedir ajuste" (retrabalho +1, motivo, notifica responsável)
 * Retorna {antes, depois} para Desfazer.
 */
export function mover(taskId, status, o = {}) {
  const t = db.get('tasks', taskId); if (!t || t.status === status) return null;
  const antes = t; const antesEnt = db.get('deliveries', `en-${taskId}`);
  const u = eu(); const de = u ? u.nome : 'Alguém';
  const cli = nomeCliente(t.clientId);
  const link = `#/operacao/quadro?tarefa=${t.id}`;
  const patch = { status };
  let oque = `moveu para ${ROT_STATUS[status]}`;
  if (status === 'andamento' && !t.iniciadaEm) patch.iniciadaEm = new Date().toISOString();
  if (status === 'aprovacao') {
    patch.enviadaAprovEm = new Date().toISOString(); oque = 'enviou para aprovação';
    const ap = userDe(t.aprovadorId);
    if (ap && ap !== (u && u.id)) notify.enviar({ para: [ap], tipo: 'atribuicao', titulo: `${de} pediu sua aprovação: ${t.titulo}`, texto: `${cli} · prazo ${fmt.data(t.prazo)}`, link, refCol: 'tasks', refId: t.id });
  }
  if (t.status === 'aprovacao' && status === 'feito') oque = 'aprovou a entrega';
  if (status === 'feito') {
    patch.concluidaEm = new Date().toISOString();
    const noPrazo = diasPara(t.prazo) >= 0;
    const aprovH = t.enviadaAprovEm ? Math.max(1, Math.round((Date.now() - new Date(t.enviadaAprovEm).getTime()) / 36e5)) : null;
    syncEntrega(t, { entregueEm: patch.concluidaEm, noPrazo, status: 'entregue', aprovacaoH: aprovH });
    const r = userDe(t.respId);
    if (r && r !== (u && u.id)) notify.enviar({ para: [r], tipo: 'mensagem', titulo: `${de} aprovou: ${t.titulo}`, texto: `${cli} · entrega registrada${noPrazo ? ' no prazo' : ` com ${diasAtraso(t)} dia(s) de atraso`}.`, link, refCol: 'tasks', refId: t.id });
  } else if (t.status === 'feito') { patch.concluidaEm = null; syncEntrega(t, { entregueEm: null, noPrazo: null, status: 'pendente' }); }
  if (t.status === 'aprovacao' && (status === 'andamento' || status === 'afazer') && o.retirar) oque = 'retirou da aprovação';
  if (t.status === 'aprovacao' && (status === 'andamento' || status === 'afazer') && !o.retirar) {
    patch.retrabalho = (t.retrabalho || 0) + 1;
    oque = `pediu ajuste${o.motivo ? `: "${o.motivo}"` : ''}`;
    syncEntrega(t, { ajustes: (antesEnt && antesEnt.ajustes || 0) + 1 });
    const r = userDe(t.respId);
    if (r && r !== (u && u.id)) notify.enviar({ para: [r], tipo: 'mensagem', prioridade: 'alta', titulo: `${de} pediu ajuste: ${t.titulo}`, texto: o.motivo || 'Veja os comentários da tarefa.', link, refCol: 'tasks', refId: t.id });
  }
  patch.historico = hist(t, oque);
  const depois = db.update('tasks', taskId, patch, { log: `${oque} — ${t.titulo}` });
  return { antes, antesEnt, depois, oque };
}
/** desfaz uma movimentação (restaura tarefa e entrega) */
export function desfazer(r) { if (!r) return; db.batch(() => { db.insert('tasks', r.antes); if (r.antesEnt) db.insert('deliveries', r.antesEnt); }); }

/** cria tarefa + entrega e notifica o responsável (tipo atribuicao) */
export function criarTarefa(d) {
  const u = eu();
  const rc = cliente(d.clientId).respId;
  const dono = db.dadosDemo ? 't-gabriel' : (db.find('users', x => x.papel === 'dono' && x.ativo !== false) || {}).teamId || null;
  const aprovadorId = d.aprovadorId || (rc && rc !== d.respId ? rc : dono);
  const t = db.insert('tasks', {
    titulo: d.titulo, clientId: d.clientId, respId: d.respId, tipo: d.tipo, status: 'afazer', prazo: d.prazo, estimativaH: Number(d.estimativaH) || 0, horasGastas: 0,
    aprovadorId, checklist: [], retrabalho: 0, projetoId: d.projetoId || null, desc: d.desc || '', prioridade: diasPara(d.prazo) <= 1 ? 'alta' : 'normal',
    criadaEm: new Date().toISOString(), historico: [{ quando: new Date().toISOString(), quem: u ? u.id : null, oque: `criou a tarefa e atribuiu a ${pessoa(d.respId).nome}` }],
  }, { log: `criou a tarefa ${d.titulo}` });
  db.insert('deliveries', { id: `en-${t.id}`, taskId: t.id, titulo: t.titulo, clientId: t.clientId, respId: t.respId, tipo: t.tipo, prazo: t.prazo, criadaEm: t.criadaEm, entregueEm: null, noPrazo: null, ajustes: 0, aprovacaoH: null, status: 'pendente' });
  ajustarCarga(d.respId, Number(d.estimativaH) || 0);
  const para = userDe(d.respId);
  if (para && para !== (u && u.id)) notify.enviar({ para: [para], tipo: 'atribuicao', titulo: `${u ? u.nome : 'Alguém'} atribuiu a você: ${t.titulo}`, texto: `${nomeCliente(t.clientId)} · ${rotTipo(t.tipo)} · prazo ${fmt.data(t.prazo)} · ${fmt.dec(t.estimativaH, 0)} h estimadas`, link: `#/operacao/quadro?tarefa=${t.id}`, refCol: 'tasks', refId: t.id });
  return t;
}
/** reatribui uma tarefa (e a entrega), ajusta a carga e notifica quem recebe e quem perde */
export function reatribuir(taskId, novoResp, o = {}) {
  const t = db.get('tasks', taskId); if (!t || t.respId === novoResp) return null;
  const u = eu(); const de = u ? u.nome : 'Alguém';
  const antes = t, antesEnt = db.get('deliveries', `en-${taskId}`);
  const depois = db.update('tasks', taskId, { respId: novoResp, historico: hist(t, `reatribuiu de ${pessoa(t.respId).nome} para ${pessoa(novoResp).nome}${o.motivo ? ` (${o.motivo})` : ''}`) }, { log: `reatribuiu ${t.titulo} para ${pessoa(novoResp).nome}` });
  syncEntrega(t, { respId: novoResp });
  const h = aberta(t) ? Math.max(0, (t.estimativaH || 0) - (t.horasGastas || 0)) || (t.estimativaH || 0) : 0;
  ajustarCarga(t.respId, -h); ajustarCarga(novoResp, h);
  if (!o.silencioso) {
    const pr = userDe(novoResp);
    if (pr && pr !== (u && u.id)) notify.enviar({ para: [pr], tipo: 'atribuicao', titulo: `${de} atribuiu a você: ${t.titulo}`, texto: `${nomeCliente(t.clientId)} · prazo ${fmt.data(t.prazo)}${o.motivo ? ` · ${o.motivo}` : ''}`, link: `#/operacao/quadro?tarefa=${t.id}`, refCol: 'tasks', refId: t.id });
  }
  return { antes, antesEnt, depois, horas: h, de: t.respId, para: novoResp };
}
export function ajustarCarga(teamId, horas) {
  const s = stats(teamId); if (!s || !horas) return;
  db.update('teamStats', s.id, { ajusteH: Math.round(((s.ajusteH || 0) + horas) * 10) / 10 });
}
/** horas restantes estimadas de uma tarefa aberta */
export const horasRestantes = t => (aberta(t) ? Math.max(0.5, (t.estimativaH || 0) - (t.horasGastas || 0)) : 0);

/* ---------------- calendário de carga ---------------- */
/** carga diária (%) por pessoa nos dias dados: média = ocupação atual, variando conforme os prazos das tarefas */
export function cargaDiaria(teamId, dias) {
  const t = pessoa(teamId); const oc = ocupacao(teamId); const capDia = capSemanal(teamId) / 5;
  const tarefas = db.list('tasks', x => x.respId === teamId && aberta(x));
  const h = dias.map(() => 0);
  for (const x of tarefas) {
    const rest = horasRestantes(x); const fim = dataDe(x.prazo);
    const idx = dias.map((d, i) => (d <= fim ? i : -1)).filter(i => i >= 0);
    const alvo = idx.length ? idx.slice(-Math.min(idx.length, 5)) : [0, 1, 2, 3, 4].filter(i => i < dias.length);
    alvo.forEach(i => { h[i] += rest / alvo.length; });
  }
  const media = h.reduce((a, b) => a + b, 0) / dias.length;
  const base = Math.max(0, ((oc ?? 0) / 100) * capDia - media);
  return dias.map((d, i) => (indisponivelAte(t, isoDia(d)) ? null : Math.round(((base + h[i]) / capDia) * 100)));
}
export { hoje0, FATURAVEIS, atrasada, aberta };
