// fila.js — regras da "Minha mesa": monta a fila pessoal (Agora / Hoje / Esta semana) a partir de tarefas, aprovações,
// menções/atribuições, alertas, clientes sob responsabilidade, webinars escalados e check-in diário. Sem HTML.
import { db } from '../../core/store.js';
import { auth } from '../../core/auth.js';
import { perms } from '../../core/perms.js';
import * as fmt from '../../core/fmt.js';
import { diasPara, isoDia, hoje0, nomeCliente, cliente, ROT_STATUS, rotTipo } from '../operacao/base.js';
import { pessoa, podeAprovar, podeEditarTarefa, ocupacao, estadoOcupacao, rotuloOcupacao, entregasNaJanela, pctNoPrazo } from '../operacao/lib.js';
import { pendencias, responsaveis, podeEditar as podeEditarWebinar, status as statusWebinar } from '../webinars/calc.js';
import { situacaoSemana, nomeDiaRelatorio } from './relatorios.js';
import * as RES from '../clientes/resultados.js';
import { padrao } from '../../core/padroes/index.js';

export const SECOES = [
  { id: 'agora', rotulo: 'Agora', estado: 'err', sub: 'Atrasado ou crítico: resolva primeiro.' },
  { id: 'hoje', rotulo: 'Hoje', estado: 'warn', sub: 'Vence hoje ou espera uma resposta sua.' },
  { id: 'semana', rotulo: 'Esta semana', estado: 'off', sub: 'Próximos 7 dias. Adiante o que der.' },
];
export const ORIGENS = {
  tarefa: { rotulo: 'Tarefa', icone: 'kanban', grupo: 'tarefas' },
  aprovacao: { rotulo: 'Aprovação', icone: 'check-circle', grupo: 'tarefas' },
  mencao: { rotulo: 'Menção', icone: 'at-sign', grupo: 'mencoes' },
  atribuicao: { rotulo: 'Atribuição', icone: 'user-plus', grupo: 'mencoes' },
  alerta: { rotulo: 'Alerta', icone: 'alert', grupo: 'alertas' },
  cliente: { rotulo: 'Cliente', icone: 'building', grupo: 'clientes' },
  webinar: { rotulo: 'Webinar', icone: 'video', grupo: 'webinars' },
  checkin: { rotulo: 'Check-in', icone: 'list-checks', grupo: 'rotina' },
  relatorio: { rotulo: 'Relatório semanal', icone: 'file', grupo: 'relatorio' },
};
export const GRUPOS = [
  { id: 'tarefas', rotulo: 'Tarefas' }, { id: 'mencoes', rotulo: 'Menções' }, { id: 'alertas', rotulo: 'Alertas' },
  { id: 'clientes', rotulo: 'Clientes' }, { id: 'webinars', rotulo: 'Webinars' }, { id: 'relatorio', rotulo: 'Relatórios' }, { id: 'rotina', rotulo: 'Check-in' },
];

/* ---------------- dinheiro: só quem vê receita ---------------- */
const DINHEIRO = /R\$|\bMRR\b|faturamento|\breceita\b|\bticket\b/i;
export const semValores = txt => String(txt || '').split(' · ').filter(p => !DINHEIRO.test(p)).join(' · ');
const limpa = (txt, rec) => (rec ? String(txt || '') : semValores(txt).replace(/R\$\s?[\d.,]+(\s?(mil|k))?/gi, 'valor restrito'));

/* ---------------- datas ---------------- */
export const hojeIso = () => isoDia(hoje0());
const quando = d => { if (d === 0) return 'hoje'; if (d === 1) return 'amanhã'; const x = hoje0(); x.setDate(x.getDate() + d); return `${fmt.diaSemana(x).slice(0, 3)}, ${fmt.dataCurta(x)}`; };
const atrasoTxt = d => `${fmt.plural(d, 'dia')} de atraso`;
const secPorPrazo = d => (d < 0 ? 'agora' : d === 0 ? 'hoje' : d <= padrao('operacao.mesa.janelaSemana', 7) ? 'semana' : null);

/* ---------------- "feito por hoje" (itens sem conclusão própria: clientes e pendências de webinar) ---------------- */
const chaveCfg = teamId => `mesa-feitos-${teamId}`;
export function dispensados(teamId) {
  const v = db.config(chaveCfg(teamId), {}) || {}; const h = hojeIso();
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x && x.data === h));
}
export function dispensar(teamId, item) {
  const atual = dispensados(teamId);
  atual[item.k] = { data: hojeIso(), sig: item.sig || '', titulo: item.titulo, origem: item.origem, quando: new Date().toISOString() };
  db.setConfig(chaveCfg(teamId), atual, { log: `marcou como feito na mesa: ${item.titulo}` });
}
export function trazerDeVolta(teamId, k) {
  const atual = dispensados(teamId); delete atual[k];
  db.setConfig(chaveCfg(teamId), atual);
}

/* ---------------- pessoa da mesa ---------------- */
export function contexto(user = auth.user()) {
  if (!user) return null;
  const me = user.teamId || String(user.id || '').replace(/^u-/, 't-');
  const real = auth.real() || user;
  const vendoComo = !!(auth.vendoComo && auth.vendoComo());
  const leitura = !perms.can('mesa', 'editar', user);
  return { user, me, real, vendoComo, leitura, rec: perms.veReceita(user), pessoa: db.get('team', me) };
}

/* ---------------- fontes ---------------- */
function itensTarefas(c) {
  const out = [];
  db.list('tasks', t => t.respId === c.me && t.status !== 'feito' && t.status !== 'aprovacao' && t.prazo).forEach(t => {
    const d = diasPara(t.prazo); const sec = secPorPrazo(d); if (!sec) return;
    const edita = !c.leitura && podeEditarTarefa(t, c.user);
    const aprovaSozinho = podeAprovar(t, c.user);
    out.push({
      k: `tk:${t.id}`, origem: 'tarefa', sec, estado: d < 0 ? 'err' : d === 0 ? 'warn' : 'off', ord: d,
      titulo: t.titulo, href: `#/operacao/quadro?tarefa=${t.id}`,
      detalhe: [nomeCliente(t.clientId), rotTipo(t.tipo), ROT_STATUS[t.status]].filter(Boolean).join(' · '),
      meta: d < 0 ? atrasoTxt(-d) : d === 0 ? 'Vence hoje' : `Vence ${quando(d)}`, metaEstado: d < 0 ? 'err' : d === 0 ? 'warn' : '',
      pri: { rotulo: 'Abrir tarefa', href: `#/operacao/quadro?tarefa=${t.id}`, icone: 'arrow-up-right' },
      sec2: edita ? { rotulo: 'Feito', acao: 'tarefa-feito', title: aprovaSozinho ? 'Concluir a tarefa (registra a entrega)' : `Envia para aprovação de ${pessoa(t.aprovadorId).nome}` } : null,
      ref: t.id,
    });
  });
  return out;
}
function itensAprovacao(c) {
  return db.list('tasks', t => t.status === 'aprovacao' && t.aprovadorId === c.me).map(t => {
    const d = diasPara(t.prazo); const espera = t.enviadaAprovEm ? Math.round((Date.now() - new Date(t.enviadaAprovEm).getTime()) / 36e5) : null;
    const aprova = !c.leitura && podeAprovar(t, c.user);
    const sec = d != null && d < 0 ? 'agora' : d != null && d <= 1 ? 'hoje' : (espera != null && espera >= padrao('operacao.mesa.aprovacaoEspera', 24) ? 'hoje' : 'semana');
    return {
      k: `ap:${t.id}`, origem: 'aprovacao', sec, estado: sec === 'agora' ? 'err' : sec === 'hoje' ? 'warn' : 'off', ord: d ?? 99,
      titulo: `Aprovar: ${t.titulo}`, href: `#/operacao/quadro?tarefa=${t.id}`,
      detalhe: `${pessoa(t.respId).nome} enviou · ${nomeCliente(t.clientId)}${espera != null ? ` · aguardando há ${espera < 1 ? 'menos de 1 h' : espera < 48 ? `${espera} h` : fmt.plural(Math.round(espera / 24), 'dia')}` : ''}`,
      meta: d < 0 ? atrasoTxt(-d) : d === 0 ? 'Prazo hoje' : d != null ? `Prazo ${quando(d)}` : '', metaEstado: d < 0 ? 'err' : d === 0 ? 'warn' : '',
      pri: aprova ? { rotulo: 'Aprovar', acao: 'aprovar', icone: 'check' } : { rotulo: 'Abrir tarefa', href: `#/operacao/quadro?tarefa=${t.id}`, icone: 'arrow-up-right' },
      sec2: aprova ? { rotulo: 'Pedir ajuste', acao: 'ajuste', title: 'Devolve para Em andamento com o motivo (conta como retrabalho)' } : null,
      ref: t.id,
    };
  });
}
/** link de resposta: abre a thread de comentários da entidade */
export function linkResposta(n) {
  if (n.refCol === 'tasks' && n.refId) return `#/operacao/quadro?tarefa=${n.refId}`;
  if (n.refCol === 'clients' && n.refId) return `#/clientes/${n.refId}?comentarios=1`;
  const m = /^#\/clientes\/([\w-]+)$/.exec(n.link || '');
  if (m) return `#/clientes/${m[1]}?comentarios=1`;
  return n.link || '#/notificacoes';
}
function itensNotificacoes(c, tarefasNaFila) {
  const lista = db.list('notifications', n => n.para === c.user.id && !n.lida && (n.tipo === 'mencao' || n.tipo === 'atribuicao'))
    .filter(n => !(n.refCol === 'tasks' && tarefasNaFila.has(n.refId)))
    .sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  const grupos = new Map();
  lista.forEach(n => {
    const g = n.refCol && n.refId ? `${n.refCol}:${n.refId}` : (n.link || n.id);
    const chave = `${n.tipo}|${g}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(n);
  });
  return [...grupos.values()].map(ns => {
    const n = ns[0]; const alta = ns.some(x => x.prioridade === 'alta');
    const mencao = n.tipo === 'mencao';
    const de = n.de ? db.get('users', n.de) : null;
    const titulo = limpa(n.titulo, c.rec);
    return {
      k: `nt:${ns.map(x => x.id).join(',')}`, origem: n.tipo, sec: alta ? 'agora' : 'hoje', estado: alta ? 'err' : 'warn', ord: -new Date(n.quando).getTime() / 1e12,
      titulo: ns.length > 1 ? `${titulo} (+${ns.length - 1})` : titulo, href: linkResposta(n),
      detalhe: limpa(n.texto, c.rec), detalheCitacao: mencao,
      meta: fmt.rel(n.quando), avatar: de, ids: ns.map(x => x.id),
      pri: mencao ? { rotulo: 'Responder', acao: 'abrir-notif', href: linkResposta(n), icone: 'message' } : { rotulo: 'Abrir', acao: 'abrir-notif', href: linkResposta(n), icone: 'arrow-up-right' },
      sec2: c.leitura ? null : { rotulo: 'Lida', acao: 'lida', title: ns.length > 1 ? `Marcar as ${ns.length} notificações como lidas` : 'Marcar como lida' },
    };
  });
}
const statusAlerta = a => (a.status === 'adiado' && a.adiadoAte && new Date(a.adiadoAte) <= new Date() ? 'aberto' : (a.status || (a.resolvido ? 'resolvido' : 'aberto')));
function hrefAlerta(a) {
  let h = a.acao && a.acao.href;
  if (!h) return null;
  const mod = h.replace(/^#\//, '').split(/[/?]/)[0];
  if (mod && !perms.can(mod)) return null;
  if (/cobrar=$/.test(h)) {
    const inv = db.list('invoices', i => i.clientId === a.refId && !i.pago && !['pago', 'paga', 'recebido'].includes(String(i.status || '').toLowerCase()))
      .sort((x, y) => String(x.vencimento || '').localeCompare(String(y.vencimento || '')))[0];
    h = inv ? h + encodeURIComponent(inv.id) : '#/financeiro/receber';
  }
  return h;
}
function itensAlertas(c) {
  return db.list('alerts', a => statusAlerta(a) === 'aberto' && (a.atribuidoA === c.me || (!a.atribuidoA && (a.para || []).includes(c.me))))
    .filter(a => c.rec || !DINHEIRO.test(a.titulo || ''))
    .map(a => {
      const g = a.gravidade === 'err' ? 'err' : a.gravidade === 'warn' ? 'warn' : 'off';
      const h = hrefAlerta(a); const resolve = !c.leitura && perms.can('alertas', 'editar', c.user);
      return {
        k: `al:${a.id}`, origem: 'alerta', sec: g === 'err' ? 'agora' : g === 'warn' ? 'hoje' : 'semana', estado: g, ord: -new Date(a.quando || 0).getTime() / 1e12,
        titulo: a.titulo, href: `#/alertas?alerta=${a.id}`, detalhe: limpa(a.detalhe, c.rec) + (a.atribuidoA === c.me ? ' · atribuído a você' : ''),
        meta: a.quando ? fmt.rel(a.quando) : '', refCol: a.refCol, refId: a.refId,
        pri: h ? { rotulo: a.acao.rotulo, href: h, icone: 'arrow-up-right' } : { rotulo: 'Abrir alerta', href: `#/alertas?alerta=${a.id}`, icone: 'arrow-up-right' },
        sec2: resolve ? { rotulo: 'Resolvido', acao: 'resolver-alerta', title: 'Marca o alerta como resolvido para todos' } : null,
        ref: a.id,
      };
    });
}
/** clientes da pessoa: responsável primeiro, depois os em que está na equipe (respeitando o escopo) */
export function meusClientes(c) {
  const esc = perms.escopoClientes(c.user);
  const l = db.list('clients', x => x.ativo !== false && x.status !== 'churn' && x.status !== 'inativo' && (x.respId === c.me || (x.equipe || []).includes(c.me)) && (esc === 'todos' || esc.includes(x.id)));
  return l.map(x => ({ ...cliente(x.id), resp: x.respId === c.me })).sort((a, b) => (b.resp - a.resp) || ((a.health ?? 100) - (b.health ?? 100)) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
const diasCli = iso => { if (!iso) return null; return diasPara(String(iso).slice(0, 10)); };
function itensClientes(c, alertasPorCliente) {
  const out = [];
  const pode = !c.leitura && perms.can('clientes', 'editar', c.user);
  const onb = db.list('onboarding', o => !o.concluido);
  meusClientes(c).forEach(cl => {
    const probs = []; // {estado, sec, texto, acao}
    const h = cl.health; const lh = { ok: padrao('clientes.health.saudavel', 75), risco: padrao('clientes.health.risco', 60) };
    if (cl.resp) {
      if (h != null && h < lh.risco) probs.push({ estado: 'err', sec: 'agora', texto: `Health ${h} · em risco`, acao: !cl.planoResgate && pode ? { rotulo: 'Plano de resgate', href: `#/clientes/${cl.id}?acao=resgate`, icone: 'shield' } : null });
      else if (h != null && h < lh.ok) probs.push({ estado: 'warn', sec: 'semana', texto: `Health ${h} · atenção` });
      const pg = cl.pagamento || {};
      if (/atraso/i.test(pg.texto || '')) {
        const err = pg.estado === 'err';
        probs.push({ estado: err ? 'err' : 'warn', sec: err ? 'agora' : 'hoje', texto: `Pagamento: ${String(pg.texto).toLowerCase()}${c.rec ? '' : ' · alinhe com o Financeiro'}`, acao: c.rec && perms.can('financeiro', 'ver', c.user) ? { rotulo: 'Cobrar', href: '#/financeiro/receber', icone: 'wallet' } : null });
      }
      const dr = diasCli(cl.renova);
      if (dr != null && dr >= 0 && dr <= padrao('clientes.renovacao.janela', 30)) {
        const reuniao = db.find('meetings', m => m.clientId === cl.id && m.status === 'agendada' && diasCli(m.quando) >= 0);
        if (!reuniao) probs.push({ estado: 'warn', sec: dr <= padrao('clientes.renovacao.urgente', 7) ? 'hoje' : 'semana', texto: `Renova ${dr === 0 ? 'hoje' : `em ${fmt.plural(dr, 'dia')}`} sem reunião marcada`, acao: pode ? { rotulo: 'Agendar reunião', href: `#/clientes/${cl.id}?acao=agendar`, icone: 'calendar' } : null });
      }
    } else if (h != null && h < lh.risco) {
      probs.push({ estado: 'err', sec: 'semana', texto: `Health ${h} · em risco · você está na equipe` });
    }
    const o = onb.find(x => x.clientId === cl.id && x.respId === c.me);
    if (o && o.paradoDesde) {
      const parado = -diasCli(o.paradoDesde);
      if (parado > padrao('clientes.onboarding.parado', 5)) probs.push({ estado: 'warn', sec: 'hoje', texto: `Onboarding parado há ${fmt.plural(parado, 'dia')} em ${o.etapaAtual === 'acessos' ? 'acessos' : o.etapaAtual}${o.pendencia ? `: ${o.pendencia}` : ''}` });
    }
    if (!probs.length) return;
    const rank = { agora: 0, hoje: 1, semana: 2 };
    probs.sort((a, b) => rank[a.sec] - rank[b.sec] || (a.estado === 'err' ? -1 : 1));
    const top = probs[0];
    const al = alertasPorCliente.get(cl.id);
    const acao = probs.find(p => p.acao);
    const sig = probs.map(p => p.texto).join('|');
    out.push({
      k: `cl:${cl.id}`, origem: 'cliente', sec: top.sec, estado: top.estado, ord: h ?? 100, sig,
      titulo: cl.nome, href: `#/clientes/${cl.id}`,
      detalhe: probs.map(p => p.texto).join(' · ') + (al ? ` · alerta: ${al.titulo}` : ''),
      meta: cl.resp ? 'Você é responsável' : 'Na equipe',
      pri: acao ? acao.acao : { rotulo: 'Abrir cliente', href: `#/clientes/${cl.id}`, icone: 'arrow-up-right' },
      pri2: acao ? { rotulo: 'Abrir cliente', href: `#/clientes/${cl.id}` } : null,
      sec2: c.leitura ? null : { rotulo: 'Feito', acao: 'dispensar', title: 'Já tratei hoje: some da mesa até amanhã (volta se algo mudar)' },
    });
  });
  return out;
}
const ROT_SECAO = { planejamento: 'Planejamento', captacao: 'Captação', aovivo: 'Ao vivo', vendas: 'Vendas', pos: 'Pós-live' };
function itensWebinars(c) {
  const out = [];
  db.list('webinars', w => (w.equipe || []).some(e => e.id === c.me) || w.apresentador === c.me).forEach(w => {
    const st = statusWebinar(w); if (st === 'encerrado') return;
    const dd = fmt.diasAte(w.data);
    const edita = !c.leitura && podeEditarWebinar(w);
    const quandoLive = dd == null ? 'sem data' : dd === 0 ? 'live hoje' : dd > 0 ? `live em ${fmt.plural(dd, 'dia')} (${fmt.dataCurta(w.data)})` : `live foi ${fmt.dataCurta(w.data)}`;
    // checklist: itens meus ainda não feitos
    (w.checklist || []).filter(x => !x.feito && x.resp === c.me && x.prazo).forEach(x => {
      const d = diasPara(x.prazo); const sec = secPorPrazo(d); if (!sec) return;
      out.push({
        k: `wc:${w.id}:${x.id}`, origem: 'webinar', sec, estado: d < 0 ? 'err' : d === 0 ? 'warn' : 'off', ord: d,
        titulo: x.item, href: `#/webinars/${w.id}`, detalhe: `Checklist de "${w.tema}" · ${quandoLive}`,
        meta: d < 0 ? atrasoTxt(-d) : d === 0 ? 'Vence hoje' : `Vence ${quando(d)}`, metaEstado: d < 0 ? 'err' : d === 0 ? 'warn' : '',
        pri: { rotulo: 'Abrir webinar', href: `#/webinars/${w.id}`, icone: 'arrow-up-right' },
        sec2: edita ? { rotulo: 'Feito', acao: 'webinar-check', title: 'Marca o item do checklist como feito' } : null,
        ref: w.id, refItem: x.id,
      });
    });
    // dados faltando nas seções que eu preencho
    const minhas = pendencias(w).filter(p => p.secao !== 'checklist' && responsaveis(w, p.secao).includes(c.me));
    if (!minhas.length) return;
    const urgente = dd != null && dd <= padrao('operacao.mesa.webinarUrgente', 7);
    const secao = minhas[0].secao;
    out.push({
      k: `wp:${w.id}`, origem: 'webinar', sec: urgente ? 'hoje' : 'semana', estado: urgente ? 'warn' : 'off', ord: dd ?? 99, sig: minhas.map(p => p.texto).join('|'),
      titulo: `Preencher dados: ${w.tema}`, href: `#/webinars/${w.id}`,
      detalhe: `${minhas.map(p => p.texto).join(' · ')} · ${quandoLive}`,
      meta: ROT_SECAO[secao] || '',
      pri: edita ? { rotulo: 'Preencher', href: `#/webinars/${w.id}/preencher?etapa=${secao}`, icone: 'edit' } : { rotulo: 'Abrir webinar', href: `#/webinars/${w.id}`, icone: 'arrow-up-right' },
      sec2: c.leitura ? null : { rotulo: 'Feito', acao: 'dispensar', title: 'Já tratei hoje: some da mesa até amanhã (volta se algo mudar)' },
    });
  });
  return out;
}
/** check-in diário: quem tem gestor e está trabalhando hoje */
export function precisaCheckin(c) {
  const p = c.pessoa; if (!p || c.leitura || !p.gestorId || p.ativo === false) return false;
  if (p.status === 'ferias' || p.status === 'folga') return false;
  const dia = hoje0().getDay(); if (dia === 0 || dia === 6) return false;
  return true;
}
export const checkinDeHoje = me => db.find('checkins', x => x.teamId === me && x.data === hojeIso());
function itemCheckin(c) {
  if (!precisaCheckin(c) || checkinDeHoje(c.me)) return [];
  const ontem = db.list('checkins', x => x.teamId === c.me).sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
  return [{
    k: 'ck', origem: 'checkin', sec: 'hoje', estado: 'warn', ord: -1,
    titulo: 'Fazer check-in', href: null,
    detalhe: `O que fiz · o que farei · bloqueios. Leva 1 minuto e ${pessoa(c.pessoa.gestorId).nome} lê.${ontem && ontem.farei ? ` Ontem você planejou: "${ontem.farei}"` : ''}`,
    meta: '', checkin: true, ontem,
    pri: { rotulo: 'Fazer check-in', acao: 'checkin', icone: 'edit' }, sec2: null,
  }];
}

/** terça é dia de relatório: um item por cliente do gestor de tráfego ainda sem relatório nesta semana */
export const temResumo = () => typeof RES.resumoMensal === 'function';
function itensRelatorios(c) {
  if (c.leitura) return [];
  const s = situacaoSemana(c.user); if (!s.ativo || !s.pendentes.length) return [];
  const atrasado = s.momento === 'depois';
  const desde = fmt.dataCurta(s.terca);
  return s.pendentes.map((cl, i) => ({
    k: `rl:${cl.id}`, origem: 'relatorio', sec: atrasado ? 'agora' : 'hoje', estado: atrasado ? 'err' : 'warn', ord: i / 1000,
    titulo: `Relatório semanal: ${cl.nome}`, href: `#/clientes/${cl.id}/resultados-acoes`,
    detalhe: `${atrasado ? `Era para ${nomeDiaRelatorio()} (${desde})` : 'Envie hoje os resultados da semana'} · ${s.enviados} de ${s.total} enviados`,
    meta: cl.respId === c.me ? 'Você é responsável' : 'Você faz o tráfego', metaEstado: '',
    pri: { rotulo: 'Marcar como enviado', acao: 'relatorio-enviado', icone: 'check', title: `Registra o relatório da semana ${s.semana.slice(-2)} de ${cl.nome} como enviado` },
    sec2: { rotulo: 'Abrir resultados', href: `#/clientes/${cl.id}/resultados-acoes` },
    extra: temResumo() ? { rotulo: 'Copiar resumo', acao: 'relatorio-copiar', title: 'Copia um resumo de resultados pronto para colar no WhatsApp do cliente' } : null,
    ref: cl.id, relatorio: true,
  }));
}

/* ---------------- fila completa ---------------- */
export function fila(user = auth.user()) {
  const c = contexto(user); if (!c) return { c: null, itens: [], porSecao: {}, dispensados: [] };
  const tarefas = itensTarefas(c);
  const aprov = itensAprovacao(c);
  const naFila = new Set([...tarefas, ...aprov].map(i => i.ref));
  const alertas = itensAlertas(c);
  const porCliente = new Map(alertas.filter(a => a.refCol === 'clients').map(a => [a.refId, a]));
  const clientes = itensClientes(c, porCliente);
  const comCliente = new Set(clientes.map(i => i.k.slice(3)));
  const alertasSoltos = alertas.filter(a => !(a.refCol === 'clients' && comCliente.has(a.refId)));
  // alerta ligado a um cliente da mesa: o item do cliente herda a gravidade e a ação "Resolvido" do alerta
  clientes.forEach(i => { const a = porCliente.get(i.k.slice(3)); if (a) { if (a.estado === 'err' && i.sec !== 'agora') { i.sec = 'agora'; i.estado = 'err'; } i.alertaId = a.ref; } });
  const todos = [...itemCheckin(c), ...tarefas, ...aprov, ...itensNotificacoes(c, naFila), ...alertasSoltos, ...clientes, ...itensWebinars(c), ...itensRelatorios(c)];
  const disp = dispensados(c.me);
  const itens = []; const fora = [];
  todos.forEach(i => { const d = disp[i.k]; if (d && (i.sig || '') === (d.sig || '')) fora.push({ ...i, dispensado: d }); else itens.push(i); });
  const peso = { err: 0, warn: 1, off: 2, ok: 3 };
  const ordem = { checkin: -1, relatorio: 1 };
  itens.sort((a, b) => (peso[a.estado] - peso[b.estado]) || ((ordem[a.origem] || 0) - (ordem[b.origem] || 0)) || (a.ord - b.ord) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  const porSecao = Object.fromEntries(SECOES.map(s => [s.id, itens.filter(i => i.sec === s.id)]));
  return { c, itens, porSecao, dispensados: fora };
}

/* ---------------- minha semana ---------------- */
export function semana(c) {
  const ent = entregasNaJanela(6, 0, d => d.respId === c.me);
  const conc = db.count('tasks', t => t.respId === c.me && t.status === 'feito' && t.concluidaEm && Date.now() - new Date(t.concluidaEm).getTime() < 7 * 864e5);
  const abertas = db.count('tasks', t => t.respId === c.me && t.status !== 'feito');
  const oc = ocupacao(c.me);
  return {
    noPrazo: pctNoPrazo(ent), entregas: ent.length, entregasOk: ent.filter(d => d.noPrazo).length,
    concluidas: conc, abertas, ocupacao: oc, ocEstado: estadoOcupacao(oc), ocRotulo: rotuloOcupacao(oc),
  };
}
