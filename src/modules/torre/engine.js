// torre/engine.js — simulação das rotinas e integrações (Rodar agora, Pausar/Retomar, Reconectar, Testar)
// e a ligação com Alertas: rotina vermelha abre/atualiza alerta (regra rg-torre) e notifica; sucesso resolve.
import { db } from '../../core/store.js';
import { ui } from '../../core/ui.js';
import { notify } from '../../core/notify.js';
import { auth } from '../../core/auth.js';
import * as fmt from '../../core/fmt.js';

export const ROT_ESTADO = { ok: 'Operando', warn: 'Atenção', err: 'Falhou', off: 'Pausada' };
export const rodando = new Set();        // ids de rotinas executando agora (estado só de interface)
const ouvintes = new Set();
export const onRodando = fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const avisar = () => [...ouvintes].forEach(f => { try { f(); } catch (e) { console.error(e); } });
const MIN = 6e4;
const quemNome = () => { const u = auth.real(); return u ? u.nome : 'Sistema'; };
const usuarioDe = teamId => { const t = db.get('team', teamId); return t && t.userId ? t.userId : null; };

/** destinatários (userIds) de uma regra + responsável */
function destinatariosRegra(regraId, respTeamId) {
  const r = db.get('alertRules', regraId);
  if (r && r.ativo === false) return { ativo: false, para: [], canais: [] };
  const times = new Set((r && r.destinatarios) || (db.dadosDemo ? ['t-gabriel'] : db.list('users', u => u.papel === 'dono' && u.ativo !== false).map(u => u.teamId).filter(Boolean)));
  if ((!r || r.resp) && respTeamId) times.add(respTeamId);
  return { ativo: true, para: [...times].map(usuarioDe).filter(Boolean), canais: (r && r.canais) || ['app'], times: [...times], regra: r };
}

/** abre ou atualiza o alerta de uma rotina que falhou */
export function alertarFalha(rot) {
  const regra = db.get('alertRules', 'rg-torre');
  const minFalhas = regra && regra.params && regra.params.falhas ? Number(regra.params.falhas) : 2;
  if (rot.falhas < minFalhas) return null;
  const dest = destinatariosRegra('rg-torre', rot.respId);
  if (!dest.ativo) return null;
  const aberto = db.find('alerts', a => a.refCol === 'routines' && a.refId === rot.id && a.gravidade === 'err' && a.status !== 'resolvido');
  const titulo = `Rotina "${curto(rot.nome)}" falhou ${rot.falhas}×`;
  const detalhe = `${rot.erro || 'Erro na execução'} · última tentativa ${fmt.hora(rot.ultimaEm)}`;
  let a;
  if (aberto) a = db.update('alerts', aberto.id, { titulo, detalhe, quando: rot.ultimaEm, status: aberto.status === 'adiado' ? 'adiado' : 'aberto' });
  else {
    a = db.insert('alerts', { gravidade: 'err', area: 'Torre', titulo, detalhe, quando: rot.ultimaEm, status: 'aberto', resolvido: false, atribuidoA: null, adiadoAte: null,
      regraId: 'rg-torre', refCol: 'routines', refId: rot.id, para: dest.times, acao: { rotulo: 'Ver log', href: `#/torre/rotina/${rot.id}` } }, { log: `alerta: ${titulo}` });
  }
  if (regra) db.update('alertRules', regra.id, { ultimoDisparo: new Date().toISOString(), disparos30: (regra.disparos30 || 0) + 1 });
  notify.enviar({ para: dest.para, de: null, tipo: 'alerta', prioridade: 'alta', titulo, texto: `${detalhe}. ${rot.guia ? rot.guia.titulo : 'Abra o log para ver o que fazer.'}`, link: `#/torre/rotina/${rot.id}`, refCol: 'routines', refId: rot.id, canais: ['app'] });
  return a;
}
const curto = nome => String(nome).replace(/ Meta → CRM$/, '').replace(/ dos clientes$/, ' dos clientes');

/** resolve alertas abertos ligados a uma referência */
export function resolverAlertas(refCol, refId, por = 'Torre (automático)', nota = '') {
  const l = db.list('alerts', a => a.refCol === refCol && a.refId === refId && a.status !== 'resolvido');
  l.forEach(a => db.update('alerts', a.id, { status: 'resolvido', resolvido: true, resolvidoEm: new Date().toISOString(), resolvidoPor: por, nota }, { log: `resolveu alerta: ${a.titulo}` }));
  return l.length;
}

/** decide o resultado simulado de uma execução */
function resultado(rot) {
  const integs = (rot.integracoes || []).map(i => db.get('integrations', i)).filter(Boolean);
  const quebrada = integs.find(i => i.estado === 'err');
  if (quebrada) {
    const code = quebrada.id === 'i-meta' ? 'OAuthException 190: token de acesso expirado' : `${quebrada.nome}: ${quebrada.status.toLowerCase()}`;
    return { estado: 'err', dur: 2, msg: code, detalhe: `Nenhum registro processado · ${quebrada.nome} recusou a conexão. Reconecte em Integrações.`, erro: code };
  }
  const M = {
    'r-sync-leads': () => ({ estado: 'ok', dur: 7, msg: `${(rot.pendentes || 37)} leads sincronizados com o CRM (inclui os que estavam parados desde 23:12)` }),
    'r-health': () => ({ estado: 'ok', dur: 44, msg: '42 clientes recalculados no tempo normal' }),
    'r-conciliacao': () => ({ estado: 'warn', dur: 38, msg: 'Ainda há 3 lançamentos sem par', detalhe: 'Vincule manualmente em Financeiro › Contas a receber.' }),
    'r-torre': () => ({ estado: 'ok', dur: 3, msg: `${db.count('routines')} rotinas e ${db.count('integrations')} integrações verificadas` }),
    'r-cobranca': () => ({ estado: 'ok', dur: 11, msg: 'Nenhum boleto pendente de envio · 2 lembretes enviados' }),
    'r-whatsapp': () => ({ estado: 'ok', dur: 8, msg: 'Resumo extra enviado para Gabriel Leão' }),
  };
  return (M[rot.id] || (() => ({ estado: 'ok', dur: Math.max(2, Math.round((rot.duracaoS || 6) * 0.9)), msg: 'Execução concluída sem erros' })))();
}

/** Rodar agora: LED "rodando" por ~1,6 s e então grava resultado, execução, alerta. -> Promise<rotina> */
export function rodar(id, o = {}) {
  const rot0 = db.get('routines', id);
  if (!rot0 || rodando.has(id)) return Promise.resolve(rot0);
  rodando.add(id); avisar();
  return new Promise(res => setTimeout(() => {
    const rot = db.get('routines', id);
    const r = resultado(rot);
    const agora = new Date();
    const hist = (rot.hist30 || []).slice(); const sev = { ok: 0, off: 0, warn: 1, err: 2 };
    if (hist.length) { const u = hist[hist.length - 1]; hist[hist.length - 1] = r.estado === 'err' ? 'err' : (u === 'err' ? 'warn' : (sev[r.estado] > sev[u] || u === 'off' ? r.estado : u)); }
    const falhas = r.estado === 'err' ? (rot.falhas || 0) + 1 : 0;
    const patch = {
      estado: r.estado, ultimaEm: agora.toISOString(), ultimaRotulo: null, duracaoS: r.dur, hist30: hist, falhas,
      erro: r.estado === 'err' ? r.erro : null, aviso: r.estado === 'warn' ? (r.msg + '.') : null,
      proximaEm: new Date(agora.getTime() + (r.estado === 'err' ? 30 : (rot.freqMin || 60)) * MIN).toISOString(),
      proximaRotulo: r.estado === 'err' ? `retry ${fmt.hora(new Date(agora.getTime() + 30 * MIN))}` : null,
    };
    rodando.delete(id);
    let novo;
    db.batch(() => {
      novo = db.update('routines', id, patch, { log: `rodou "${rot.nome}" manualmente (${ROT_ESTADO[r.estado].toLowerCase()})` });
      db.insert('routineRuns', { rotinaId: id, inicio: agora.toISOString(), estado: r.estado, duracaoS: r.dur, msg: r.msg, detalhe: r.detalhe || null, manual: true, por: quemNome() });
      if (r.estado === 'err') alertarFalha(novo);
      else if (r.estado === 'ok') resolverAlertas('routines', id, o.por || quemNome(), 'Execução manual bem-sucedida.');
    });
    avisar();
    if (!o.silencioso) {
      if (r.estado === 'err') ui.toast(`${rot.nome} falhou de novo: ${r.msg}.`, { tipo: 'err', acao: rot.guia && rot.guia.integ ? { rotulo: 'Reconectar', fn: () => reconectar(rot.guia.integ) } : undefined });
      else if (r.estado === 'warn') ui.toast(`${rot.nome}: ${r.msg}.`, { tipo: 'warn' });
      else ui.toast(`${rot.nome} rodou com sucesso · ${r.msg}.`, { tipo: 'ok' });
    }
    res(novo);
  }, o.demora ?? 1600));
}

/** Pausar (com confirmação e Desfazer) */
export async function pausar(id) {
  const rot = db.get('routines', id); if (!rot) return false;
  const ok = await ui.confirmar(`"${rot.nome}" não vai rodar até alguém retomar. Os alertas dela ficam silenciados enquanto estiver pausada.`, { titulo: 'Pausar rotina?', confirmar: 'Pausar rotina', perigo: true });
  if (!ok) return false;
  const antes = { estado: rot.estado, freq: rot.freq, proximaEm: rot.proximaEm, proximaRotulo: rot.proximaRotulo, pausadaEm: rot.pausadaEm || null, pausadaPor: rot.pausadaPor || null };
  db.update('routines', id, { estado: 'off', estadoAntes: rot.estado, freq: rot.freq.includes('pausada') ? rot.freq : `${rot.freq} · pausada`, proximaEm: null, proximaRotulo: '—', pausadaEm: new Date().toISOString(), pausadaPor: quemNome() }, { log: `pausou a rotina "${rot.nome}"` });
  ui.toast(`Rotina "${rot.nome}" pausada.`, { desfazer: () => db.update('routines', id, antes, { log: `desfez a pausa de "${rot.nome}"` }) });
  return true;
}
/** Retomar (com confirmação) */
export async function retomar(id) {
  const rot = db.get('routines', id); if (!rot) return false;
  const ok = await ui.confirmar(`"${rot.nome}" volta a rodar ${rot.freq.replace(' · pausada', '')}. A primeira execução acontece agora.`, { titulo: 'Retomar rotina?', confirmar: 'Retomar e rodar', perigo: false });
  if (!ok) return false;
  db.update('routines', id, { estado: rot.estadoAntes && rot.estadoAntes !== 'off' ? rot.estadoAntes : 'ok', freq: rot.freq.replace(' · pausada', ''), pausadaEm: null, pausadaPor: null, motivoPausa: null, proximaRotulo: null, proximaEm: new Date(Date.now() + (rot.freqMin || 60) * MIN).toISOString() }, { log: `retomou a rotina "${rot.nome}"` });
  ui.toast(`Rotina "${rot.nome}" retomada. Rodando a primeira execução…`, { tipo: 'info' });
  rodar(id);
  return true;
}

/** Reconectar integração: OAuth simulado. Em produção abre o login do provedor e o token fica no servidor. */
export async function reconectar(integId) {
  const it = db.get('integrations', integId); if (!it) return false;
  const deps = db.list('routines', r => (r.integracoes || []).includes(integId));
  const corpo = `<div class="stack m-torre-oauth">
<div class="m-torre-oauth-h"><span class="m-torre-oauth-ic">${ui.ic(it.icone || 'link')}</span><span class="m-torre-oauth-arrow">${ui.ic('arrow-right')}</span><span class="m-torre-oauth-ic acc">${ui.ic('radar')}</span></div>
<p class="mb-txt">A <b>Gmarketing</b> vai pedir acesso a <b>${fmt.esc(it.nome)}</b> (${fmt.esc(it.conta)}).</p>
${ui.aviso({ tipo: 'info', titulo: 'Como funciona em produção', texto: `Este botão abre a tela de login do ${it.nome} em uma janela segura. Depois que você autoriza, o token é guardado no servidor (Supabase Edge Function), criptografado — nunca no navegador nem no código do app. Neste modo demonstração a autorização é simulada.` })}
<div class="m-torre-oauth-p"><b>Permissões pedidas</b><ul>${(ESCOPOS[integId] || ['Leitura dos dados da conta', 'Atualização automática do token']).map(s => `<li>${ui.ic('check')}${fmt.esc(s)}</li>`).join('')}</ul></div>
${deps.length ? `<p class="sm mut">Rotinas que usam esta conexão: ${deps.map(d => fmt.esc(d.nome)).join(', ')}.</p>` : ''}
</div>`;
  const ok = await ui.modal({ titulo: `Reconectar ${it.nome}`, sub: it.estado === 'err' ? `Hoje: ${it.status.toLowerCase()} · ${it.detalhe}` : `Hoje: ${it.status.toLowerCase()}`, corpo, confirmar: `Autorizar ${it.nome} (simulado)`, largura: 'md',
    onConfirmar: () => new Promise(r => setTimeout(() => r(true), 700)) });
  if (!ok) return false;
  const antes = { estado: it.estado, status: it.status, detalhe: it.detalhe, expiraEm: it.expiraEm, ultimaSync: it.ultimaSync };
  db.batch(() => {
    db.update('integrations', integId, { estado: 'ok', status: 'Conectado', detalhe: `Reconectado por ${quemNome()} · token válido por 60 dias`, expiraEm: new Date(Date.now() + 60 * 1440 * MIN).toISOString(), ultimaSync: new Date().toISOString(), reconectadoEm: new Date().toISOString() }, { log: `reconectou a integração ${it.nome}` });
    resolverAlertas('integrations', integId, quemNome(), 'Integração reconectada.');
  });
  const quebradas = deps.filter(d => d.estado === 'err' && d.ativo !== false);
  ui.toast(quebradas.length ? `${it.nome} reconectado. Rodando ${quebradas.map(q => `"${q.nome}"`).join(', ')} para confirmar…` : `${it.nome} reconectado. Token válido por 60 dias.`, { tipo: 'ok' });
  quebradas.forEach(q => rodar(q.id, { demora: 1400 }));
  if (!quebradas.length && antes.estado !== 'ok') { /* nada a reexecutar */ }
  return true;
}
const ESCOPOS = {
  'i-meta': ['Ler contas de anúncio e campanhas (ads_read)', 'Ler leads dos formulários (leads_retrieval)', 'Gerenciar páginas vinculadas (pages_manage_ads)'],
  'i-crm': ['Criar e atualizar contatos', 'Ler funis e etapas', 'Renovar o token automaticamente'],
  'i-google-ads': ['Ler contas da MCC', 'Ler gastos e conversões'],
  'i-banco': ['Ler extrato da conta PJ', 'Emitir boletos'],
  'i-whatsapp': ['Enviar mensagens de modelo aprovadas'],
  'i-monday': ['Ler e atualizar quadros e itens'],
  'i-ga4': ['Ler relatórios das propriedades'],
  'i-drive': ['Criar arquivos na pasta "Criativos aprovados"'],
};

/** Testar conexão (ping simulado) */
export function testar(integId) {
  const it = db.get('integrations', integId); if (!it) return Promise.resolve(false);
  const t = ui.toast(`Testando conexão com ${it.nome}…`, { tipo: 'info', duracao: 1500 });
  return new Promise(res => setTimeout(() => {
    t.fechar();
    const ms = 120 + (integId.length * 37) % 260;
    if (it.estado === 'err') ui.toast(`${it.nome}: falhou. ${it.detalhe}. Reconecte para voltar a funcionar.`, { tipo: 'err', acao: { rotulo: 'Reconectar', fn: () => reconectar(integId) } });
    else if (it.estado === 'warn') ui.toast(`${it.nome}: conexão ok (${ms} ms), mas ${it.status.toLowerCase()}. Reconecte para renovar.`, { tipo: 'warn', acao: { rotulo: 'Reconectar', fn: () => reconectar(integId) } });
    else { ui.toast(`${it.nome}: conexão ok · respondeu em ${ms} ms.`, { tipo: 'ok' }); db.update('integrations', integId, { ultimoTeste: new Date().toISOString() }); }
    res(true);
  }, 900));
}

/** contador do menu: rotinas em falha + integrações em falha que não derrubaram nenhuma rotina (evita contar a mesma falha 2×) */
export function falhasTorre() {
  const rot = db.list('routines', r => r.ativo !== false && r.estado === 'err');
  const integ = db.list('integrations', i => i.ativo !== false && i.estado === 'err' && !rot.some(r => (r.integracoes || []).includes(i.id)));
  return { n: rot.length + integ.length, rot, integ };
}
