// relatorios.js — "Terça é dia de relatório": todo gestor de tráfego envia um relatório semanal por cliente que atende.
// Clientes do gestor: só os clientes em que ele é o responsável (client.respId === eu) — pedido do dono.
// Terça → item em "Hoje" da Minha mesa; quarta a domingo, se não enviado → "Agora". Segunda: nada (a semana começa).
// "Marcar como enviado" grava na coleção `relatorios` {id, clientId, semana (ISO, ex. 2026-W48), enviadoPor (teamId), quando}.
// Na terça o gestor recebe (uma vez por semana) a notificação "Hoje é dia de relatório: N clientes" (08:00).
import { db } from '../../core/store.js';
import { auth } from '../../core/auth.js';
import * as fmt from '../../core/fmt.js';
import { padrao } from '../../core/padroes/index.js';

const DIA = 864e5;
const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
/** semana ISO 8601: '2026-W48' */
export function semanaIso(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - dia);
  const ini = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return `${x.getUTCFullYear()}-W${String(Math.ceil(((x - ini) / DIA + 1) / 7)).padStart(2, '0')}`;
}
/** dia da semana do relatório (1 = segunda … 5 = sexta; padrão 2 = terça) — central "Padrões e regras" */
export const DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** nome do dia do relatório: 'terça' */
export const nomeDiaRelatorio = () => DIAS_LONGOS[diaRelatorio()];
export const diaRelatorio = () => { const v = Number(padrao('operacao.relatorio.dia', 2)); return v >= 1 && v <= 5 ? v : 2; };
/** dia do relatório na semana atual (Date, 00:00) — nome mantido por compatibilidade */
export function tercaDaSemana(d = hoje0()) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + diaRelatorio() - 1); return x; }
/** 'antes' (antes do dia) | 'terca' (o dia do relatório) | 'depois' (depois, até domingo) */
export function momento(d = new Date()) { const w = d.getDay(); const r = diaRelatorio(); return w === r ? 'terca' : (w >= 1 && w < r) ? 'antes' : 'depois'; }

export const ehGestor = u => !!u && (u.papel === 'gestor_trafego' || u.papel === 'head_trafego');
const teamDe = u => (u && (u.teamId || String(u.id || '').replace(/^u-/, 't-'))) || null;
/** clientes ativos sob o gestor (responsável primeiro, depois equipe) */
export function clientesDoGestor(u) {
  const me = teamDe(u); if (!me || !ehGestor(u)) return [];
  return db.list('clients', c => c.ativo !== false && !['churn', 'inativo', 'encerrado'].includes(c.status) && c.respId === me)
    .sort((a, b) => ((b.respId === me) - (a.respId === me)) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}
export const relatorioDe = (clientId, semana = semanaIso()) => db.find('relatorios', r => r.clientId === clientId && r.semana === semana);

/** situação da semana para o gestor: {ativo, momento, semana, total, enviados, pendentes:[clients], terca} */
export function situacaoSemana(u = auth.user()) {
  const sem = semanaIso(); const m = momento();
  const cl = clientesDoGestor(u);
  const pend = cl.filter(c => !relatorioDe(c.id, sem));
  return { ativo: ehGestor(u) && cl.length > 0 && m !== 'antes', momento: m, semana: sem, total: cl.length, enviados: cl.length - pend.length, pendentes: pend, terca: tercaDaSemana() };
}

export function marcarEnviado(clientId, u = auth.user()) {
  const sem = semanaIso(); const c = db.get('clients', clientId); if (!c) return null;
  const ja = relatorioDe(clientId, sem); if (ja) return { r: ja, novo: false };
  const r = db.insert('relatorios', { id: `rel-${clientId}-${sem}`, clientId, semana: sem, enviadoPor: teamDe(u), quando: new Date().toISOString() }, { log: `enviou o relatório semanal de ${c.nome} (${sem})` });
  return { r, novo: true };
}
export function desfazerEnvio(id) { if (db.get('relatorios', id)) db.remove('relatorios', id, { log: 'desfez o envio do relatório semanal' }); }

/** notificação de terça 08:00 (uma por semana por gestor). Idempotente: id fixo + marca em settings. */
export function garantirAvisoTerca(u = auth.real()) {
  try {
    if (!u || !ehGestor(u) || momento() !== 'terca' || !db.loaded) return null;
    const s = situacaoSemana(u); if (!s.total) return null;
    const id = `n-rel-${u.id}-${s.semana}`; const chave = `relatorio-aviso:${u.id}`;
    if (db.get('notifications', id) || db.config(chave, null) === s.semana) return null;
    const oito = hoje0(); oito.setHours(8, 0, 0, 0);
    const quando = new Date(Math.min(Date.now(), oito.getTime())).toISOString();
    let n;
    db.batch(() => {
      n = db.insert('notifications', { id, para: u.id, de: null, tipo: 'sistema', titulo: `Hoje é dia de relatório: ${fmt.plural(s.total, 'cliente')}`, texto: `Envie o relatório semanal de cada cliente e marque como enviado na Minha mesa${s.enviados ? ` (${s.enviados} já ${s.enviados === 1 ? 'enviado' : 'enviados'})` : ''}.`, link: '#/mesa?o=relatorio', lida: false, prioridade: 'normal', quando, canais: ['app'], refCol: 'relatorios', refId: s.semana });
      db.setConfig(chave, s.semana);
    });
    return n;
  } catch (e) { console.warn('[Agência OS] aviso de relatório', e && e.message); return null; }
}
// no login (ou ao abrir o app já logado) numa terça, o gestor recebe o aviso
auth.onChange(() => setTimeout(() => garantirAvisoTerca(), 0));
if (db.ready) db.ready.then(() => setTimeout(() => garantirAvisoTerca(), 0));
