// voo.js — Torre › Painel de Voo NATIVO (item 17): contas Meta Ads dos clientes com dados reais (Windsor, Edge Function
// voo-dados) ou fictícios no modo demonstração (voo-demo.js).
//   #/torre/voo                → visão geral: semáforo por cliente, fila "Comece por aqui", contas sem cliente vinculado
//   #/torre/voo/:conta?aba=    → detalhe do cliente (sempre AO VIVO): KPIs, "por quê", investimento × teto, recomendações do
//                                motor único, campanhas › conjuntos › anúncios (pausar e orçamento com SIM), histórico
// Regras do dono: SIM em toda alteração; máx. 4 mudanças de orçamento por conjunto/hora (também no servidor); só pausar (nunca
// excluir); sem links para o Gerenciador ("Criar ou subir campanha: somente pelo Gerenciador, via 4G."); "Ver como" = só ver;
// receita só para Dono/Admin (o servidor já tira). A única alteração sem SIM é a pausa automática do Guardião (invasão).
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import { ui } from '../../core/ui.js';
import { notify } from '../../core/notify.js';
import { auth } from '../../core/auth.js';
import { perms } from '../../core/perms.js';
import { invasao } from '../../core/invasao.js';
import { situacaoSemana } from '../mesa/relatorios.js';
import { padrao, valores as padroesValores } from '../../core/padroes/index.js';
import MotorRecs from '../../shared/motor-recs.mjs';
import Guardiao from '../../shared/guardiao.mjs';
import { montarModelo, fraseInvestimento, SEMAFORO, STATUS_META, ATIVO, normConta, orcamentoDia } from './voo-modelo.js';
import * as F from './voo-fonte.js';
import { tetoDiarioCliente } from '../clientes/calc.js';

const CRIATIVOS = ['t-carla', 't-elisa']; // quem produz criativo (design e copy)
const AVISO_4G = 'Criar ou subir campanha: somente pelo Gerenciador, via 4G.';
const AVISO_ATRASO = 'Gasto e resultados do Meta podem ter alguns minutos de atraso (a própria API do Meta atrasa); status e orçamento refletem as ações na hora.';
const SEM_TOKEN = 'Ações no Meta aguardando o token do usuário do sistema — peça ao administrador.';
const PRIO = { agora: ['err', 'Agora'], hoje: ['warn', 'Hoje'], semana: ['off', 'Esta semana'] };
const NIVEL_ROT = { campanha: 'campanha', conjunto: 'conjunto', anuncio: 'anúncio' };
const str = (v, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '');
const isoValido = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const quemSou = () => { const u = auth.real() || auth.user(); return u ? { userId: u.id, teamId: u.teamId, nome: u.nome, papel: u.papel } : { userId: null, teamId: null, nome: 'Alguém', papel: null }; };
const podeVincular = () => !auth.vendoComo() && ['dono', 'admin', 'head_trafego'].includes((auth.user() || {}).papel) && perms.can('clientes', 'editar');

/* ------------------------------------------------------------------ modelo */
function incidentesPorConta() { const m = new Map(); invasao.emQuarentena().forEach(a => m.set(normConta(a.incidente.contaId), a.incidente)); return m; }
function opcModelo() {
  const acoes = db.list('clientActions', a => a.origem === 'torre');
  return {
    clientes: db.list('clients', c => c.ativo !== false), tetoDia: tetoDiarioCliente, pendentes: F.estado.pendentes, padrao, regras: db.config('motorRegras', {}) || {}, incidentes: incidentesPorConta(),
    ultimaMsg: cid => { const l = db.list('clientActions', a => a.clientId === cid && /avisad|mensagem/i.test(a.tipo || '')).map(a => a.data || a.createdAt).sort(); return l.length ? l[l.length - 1] : null; },
    alteradoEm: id => { const l = acoes.filter(a => a.objetoId === id).map(a => a.createdAt).sort(); return l.length ? l[l.length - 1] : null; },
  };
}
const modeloGeral = () => montarModelo(F.estado.geral, opcModelo());
function modeloConta(id) { const p = F.pacoteDaConta(id); return p ? montarModelo(p, opcModelo()).porId.get(id) || null : null; }

/* ------------------------------------------------------------------ faixas e textos */
/** "Mostrar no visor dele": faixa compacta para o gestor de tráfego, de terça até enviar todos os relatórios da semana */
export function faixaRelatorio(ctx) {
  const s = situacaoSemana(ctx.user);
  if (!s.ativo || !s.pendentes.length) return '';
  const atraso = s.momento === 'depois'; const pct = s.total ? (s.enviados / s.total) * 100 : 0;
  const titulo = atraso ? 'Relatórios da semana atrasados' : 'Terça é dia de relatório';
  return `<div class="m-torre-rel${atraso ? ' atraso' : ''}" data-voo-rel role="status">
<span class="m-torre-rel-i">${ui.ic('file')}</span>
<div class="m-torre-rel-t"><b>${titulo}</b><span aria-hidden="true">·</span><span class="num"><b>${s.enviados}</b> de ${s.total} enviados</span></div>
<div class="m-torre-rel-b" role="progressbar" aria-label="Relatórios enviados" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${s.enviados}"><i style="width:${pct.toFixed(1)}%"></i></div>
${ui.btn({ rotulo: 'Ver pendentes', iconeDir: 'arrow-right', sm: true, tipo: atraso ? 'pri' : undefined, href: '#/mesa?o=relatorio', attrs: { 'data-voo-rel-ir': '' } })}</div>`;
}
/** central "Padrões e regras": limites ('torre.*' e 'orcamento.*') usados aqui */
export function padroesTorre() { const v = padroesValores(); const r = {}; for (const id of Object.keys(v)) if (id.startsWith('torre.') || id.startsWith('orcamento.')) r[id] = v[id]; return r; }

const selo = c => ui.selo(SEMAFORO[c.sem.estado].led, SEMAFORO[c.sem.estado].rotulo, { cls: `m-voo-sem s-${c.sem.estado}` });
const nomeCliente = c => (c.cliente ? c.cliente.nome : c.nome);
const brlOu = v => (v ? fmt.brl2(v) : '—');
/** por que o botão de ação está desligado (ou '' se pode agir) */
function bloqueio(ctx, c) {
  if (auth.vendoComo()) return '"Ver como" é só visualização: nenhuma ação no Meta.';
  if (!ctx.can('torre_voo', 'editar')) return 'Seu acesso ao Painel de Voo é só de leitura.';
  if (c && c.incidente) return 'Conta em quarentena (possível invasão): só a liberação pelo Dono/Admin mexe nela.';
  if (!F.acoesConfiguradas()) return SEM_TOKEN;
  return '';
}
function frescor(iso, o = {}) {
  if (!iso) return '<span class="mut">sem dados ainda</span>';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  return `<span class="m-voo-fr${o.vivo && s < 60 ? ' agora' : ''}" data-voo-fr>${o.vivo && s < 60 ? 'atualizado agora' : ui.rel(iso, { prefixo: 'atualizado ' })}</span>`;
}

/* ================================================================== VISÃO GERAL */
const FILTROS = [
  { id: 'todas', rotulo: 'Todas' }, { id: 'atencao', rotulo: 'Precisa de atenção', estado: 'err' }, { id: 'meus', rotulo: 'Meus clientes' },
  { id: 'semmsg', rotulo: 'Sem CP de MSG' }, { id: 'silenciosas', rotulo: 'Silenciosas' }, { id: 'semcliente', rotulo: 'Sem cliente vinculado' },
];
const atencao = c => ['crit', 'par', 'caro'].includes(c.sem.estado) || !!c.avisoConta || !!c.incidente || c.prioridade === 'agora';
const silenciosa = c => (c.msg.d3.conv === 0 && c.m.d3.gasto > 0) || ['par', 'ins'].includes(c.sem.estado);
function filtrar(lista, f, ctx) {
  const eu = (ctx.user || {}).teamId;
  return f === 'atencao' ? lista.filter(atencao) : f === 'meus' ? lista.filter(c => c.cliente && (c.cliente.respId === eu || (c.cliente.equipe || []).includes(eu)))
    : f === 'semmsg' ? lista.filter(c => c.sem.estado === 'sem') : f === 'silenciosas' ? lista.filter(silenciosa) : f === 'semcliente' ? lista.filter(c => !c.cliente) : lista;
}

function renderGeral(ctx) {
  const g = F.estado.geral; const mod = g && !g.carregando ? modeloGeral() : null;
  const at = g && g.atualizadoEm;
  const meta = `${ui.led(F.estado.erroGeral ? 'err' : F.estado.carregandoGeral || (g && g.atualizando) ? 'warn' : 'ok', F.estado.erroGeral ? 'Falha ao atualizar' : F.estado.carregandoGeral ? 'Atualizando…' : g && g.atualizando ? 'Atualizando em segundo plano' : 'Dados do Meta')}${frescor(at)}${ui.ajuda(`Visão geral: cache do servidor de no máximo 5 minutos (atualiza sozinho). Ao abrir um cliente, os dados dele são buscados ao vivo. ${AVISO_ATRASO}`)}`;
  const acoes = ui.btn({ rotulo: 'Atualizar', icone: 'refresh', attrs: { 'data-voo-geral-atualizar': '' }, disabled: F.estado.carregandoGeral, cls: F.estado.carregandoGeral ? 'm-voo-spin' : '' });
  const cab = ui.cabecalho({ titulo: 'Painel de Voo', descricao: 'Contas Meta Ads dos clientes: semáforo de custo por conversa, recomendações e ações com confirmação SIM.', meta, acoes });
  let corpo;
  if (!g && F.estado.erroGeral) corpo = `<div class="card">${ui.vazio({ icone: 'alert-circle', titulo: 'Não foi possível carregar o Painel de Voo', texto: `${F.estado.erroGeral} Tente de novo em instantes.`, acao: { rotulo: 'Tentar de novo', attrs: { 'data-voo-geral-atualizar': '' } } })}</div>`;
  else if (!g || g.carregando) corpo = `<p class="m-voo-ld" role="status">${ui.ic('refresh')}<span>${fmt.esc((g && g.mensagem) || 'Buscando as contas no Meta…')}</span></p>${ui.skeleton({ tipo: 'kpi', linhas: 4 })}${ui.skeleton({ linhas: 6 })}`;
  else corpo = conteudoGeral(ctx, mod, g);
  return `<div class="pg m-torre-voo m-voo">${cab}${faixaRelatorio(ctx)}${corpo}</div>`;
}

function conteudoGeral(ctx, mod, g) {
  const todas = mod.contas;
  const vinculaveis = podeVincular() ? todas.filter(c => !c.cliente) : [];
  const soma = k => todas.reduce((s, c) => s + c.m[k].gasto, 0);
  const conv7 = todas.reduce((s, c) => s + c.msg.d7.conv, 0), conv7a = todas.reduce((s, c) => s + c.msg.d7ant.conv, 0);
  const vm7 = todas.reduce((s, c) => s + c.msg.d7.gasto, 0), vm7a = todas.reduce((s, c) => s + c.msg.d7ant.gasto, 0);
  const dl = (a, b) => (b ? `${a >= b ? '▲' : '▼'} ${fmt.dec(Math.abs((a / b - 1) * 100), 1)}%` : undefined);
  const nAt = todas.filter(atencao).length;
  const kpis = `<div class="g-kpi m-voo-kpis">
${ui.kpi({ rotulo: 'Investimento hoje', valor: fmt.brl(soma('hoje')), comp: `ontem ${fmt.brl(soma('ontem'))}`, ajuda: 'Soma do gasto de hoje (até agora) em todas as contas que você vê. O Meta pode levar alguns minutos para contabilizar.' })}
${ui.kpi({ rotulo: 'Investimento 7 dias', valor: fmt.brl(soma('d7')), delta: dl(soma('d7'), soma('d7ant')), deltaBom: null, comp: 'vs 7 dias anteriores', serie: mod.dias.slice(0, 14).map((_, i) => todas.reduce((s, c) => s + c.dias[i].gasto, 0)), formatoSerie: 'brl' })}
${ui.kpi({ rotulo: 'Conversas 7 dias', valor: fmt.num(conv7), delta: dl(conv7, conv7a), comp: 'vs 7 dias anteriores', ajuda: 'Conversas iniciadas por mensagem (WhatsApp, Messenger, Direct) nas campanhas de mensagem.' })}
${ui.kpi({ rotulo: 'Custo/conversa 7d', valor: conv7 ? fmt.brl2(vm7 / conv7) : '—', delta: conv7 && conv7a ? dl(vm7 / conv7, vm7a / conv7a) : undefined, deltaBom: conv7 && conv7a ? vm7 / conv7 <= vm7a / conv7a : null, comp: 'média ponderada' })}
${ui.kpi({ rotulo: 'Pedindo ação', valor: String(nAt), alerta: nAt > 0, href: ctx.router.href(null, { f: 'atencao' }), comp: `de ${todas.length} contas`, ajuda: 'Crítico, Caro, Conta parada, pagamento pendente, quarentena ou recomendação "Agora".' })}</div>`;

  // fila "Comece por aqui"
  const fila = todas.filter(c => c.prioridade === 'agora' || c.prioridade === 'hoje').sort((a, b) => (a.prioridade === 'agora' ? 0 : 1) - (b.prioridade === 'agora' ? 0 : 1)).slice(0, 6);
  const filaHtml = fila.length ? `<ol class="m-voo-fila">${fila.map(c => { const r = c.recs[0]; const p = PRIO[c.prioridade];
    const txt = c.incidente ? 'Conta em quarentena: possível invasão' : c.avisoConta ? c.avisoConta : c.sem.estado === 'par' ? 'Conta parada: sem gasto nos últimos dias' : r ? r.titulo : c.porque[0];
    return `<li class="m-voo-fi p-${c.prioridade}"><span class="m-voo-fi-p">${ui.selo(p[0], p[1])}</span><div class="m-voo-fi-t"><a href="#/torre/voo/${c.id}"><b>${fmt.esc(nomeCliente(c))}</b></a><span>${fmt.esc(txt)}</span></div>${selo(c)}${ui.btn({ rotulo: 'Abrir', sm: true, iconeDir: 'arrow-right', href: `#/torre/voo/${c.id}` })}</li>`; }).join('')}</ol>`
    : ui.vazio({ icone: 'check-circle', titulo: 'Nada urgente agora', texto: 'Nenhuma conta com ação para agora ou hoje. As demais recomendações estão dentro de cada cliente.', compacto: true });

  const f = FILTROS.some(x => x.id === ctx.query.f) ? ctx.query.f : 'todas';
  const filtros = FILTROS.filter(x => x.id !== 'semcliente' || todas.some(c => !c.cliente)).map(x => ({ ...x, n: filtrar(todas, x.id, ctx).length }));
  const lista = filtrar(todas, f, ctx);
  const tabela = ui.tabela({
    cols: [
      { k: 'nome', l: 'Cliente · conta', r: c => `<div class="m-voo-cn">${c.cliente ? ui.avatar(c.gestorId, 24) : `<span class="m-voo-nc" title="Sem cliente vinculado">${ui.ic('link')}</span>`}<div><b>${fmt.esc(nomeCliente(c))}</b><span class="sub">${c.cliente ? fmt.esc(c.nome) : 'Sem cliente vinculado'} · <span class="num">act_${fmt.esc(c.id)}</span></span></div></div>`, v: c => nomeCliente(c) },
      { k: 'sem', l: 'Semáforo', r: c => `${selo(c)}${c.incidente ? `<span class="sub t-err">${ui.ic('shield')}Quarentena</span>` : c.avisoConta ? `<span class="sub t-err">${fmt.esc(c.avisoConta)}</span>` : c.recs.length ? `<span class="sub">${fmt.plural(c.recs.length, 'recomendação', 'recomendações')}</span>` : ''}`, v: c => SEMAFORO[c.sem.estado].ordem * 100 - (c.sem.indice || 0) },
      { k: 'cpc', l: 'Custo/conversa 3d', num: true, r: c => (c.msg.d3.conv ? `<b>${fmt.brl2(c.msg.d3.gasto / c.msg.d3.conv)}</b>${c.meta ? `<span class="sub">meta ${fmt.brl2(c.meta)}</span>` : ''}` : '—'), v: c => c.sem.indice || 0, ajuda: 'Verba das campanhas de mensagem ÷ conversas nos últimos 3 dias completos. O semáforo compara com a meta do cliente.' },
      { k: 'conv', l: 'Conversas 7d', num: true, r: c => (c.msg.d7.conv ? fmt.num(c.msg.d7.conv) : '—'), v: c => c.msg.d7.conv },
      { k: 'leads', l: 'Leads 7d', num: true, r: c => (c.m.d7.leads ? fmt.num(c.m.d7.leads) : '—'), v: c => c.m.d7.leads, mobile: false },
      { k: 'hoje', l: 'Gasto hoje', num: true, r: c => fmt.brl(c.m.hoje.gasto), v: c => c.m.hoje.gasto },
      { k: 'g7', l: 'Gasto 7d', num: true, r: c => fmt.brl(c.m.d7.gasto), v: c => c.m.d7.gasto, mobile: false },
      { k: 'orc', l: 'Verba/dia', num: true, r: c => { const fi = fraseInvestimento(c); return `${fmt.brl(c.orcDia)}${c.tetoDia ? `<span class="sub ${fi.acima ? 't-err' : ''}">teto ${fmt.brl(c.tetoDia)}</span>` : ''}`; }, v: c => c.orcDia, ajuda: 'Soma dos orçamentos diários ativos (campanhas CBO + conjuntos ABO). Teto = teto de mídia mensal do cliente ÷ 30,4.' },
    ],
    linhas: lista, onRowHref: c => `#/torre/voo/${c.id}`, legenda: 'Contas Meta Ads', rowCls: c => (c.incidente ? 'm-voo-q' : ''),
    vazio: { titulo: todas.length ? 'Nenhuma conta neste filtro' : 'Nenhuma conta para mostrar', texto: todas.length ? 'Escolha outro filtro.' : (g.escopo === 'seus' ? 'Nenhuma conta Meta está vinculada aos seus clientes ainda. Peça ao Head de Tráfego ou a um administrador para vincular em Clientes › Cadastro.' : 'Nenhuma conta ativa conectada à Windsor.') },
  });
  const busca = `<label class="m-voo-busca">${ui.ic('search')}<input type="search" data-voo-q placeholder="Buscar cliente ou conta" aria-label="Buscar cliente ou conta"></label>`;
  const contasCard = ui.card({ titulo: 'Contas', sub: `${lista.length} de ${todas.length}`, cls: 'm-voo-contas', pad: false, acoes: busca,
    corpo: `<div class="m-voo-chips">${ui.chips(filtros, f, 'f', { rotulo: 'Filtrar contas' })}</div>${tabela}` });
  const vinc = vinculaveis.length ? cardVincular(ctx, vinculaveis) : '';
  const nota = `<p class="m-voo-nota">${ui.ic('info')}<span>${AVISO_4G} ${AVISO_ATRASO}</span></p>`;
  const avisoAcoes = !F.acoesConfiguradas() && ctx.can('torre_voo', 'editar') && !auth.vendoComo() ? ui.aviso({ tipo: 'info', titulo: 'Leitura liberada; ações no Meta ainda não', texto: `${SEM_TOKEN} Até lá, os botões de pausar e orçamento ficam desligados.` }) : '';
  const verComo = auth.vendoComo() ? ui.aviso({ tipo: 'info', titulo: 'Você está vendo como outra pessoa', texto: 'Somente visualização: nenhuma ação no Meta é enviada.' }) : '';
  return `${verComo}${avisoAcoes}${kpis}
${ui.card({ titulo: 'Comece por aqui', sub: fila.length ? `${fila.length} conta(s) para agora e hoje` : 'tudo em dia', ajuda: 'Agora: conta parada, pagamento pendente, quarentena ou recomendação urgente. Hoje: Crítico ou recomendação do dia. Ordem pela gravidade.', corpo: filaHtml })}
${contasCard}${vinc}${nota}`;
}

function cardVincular(ctx, contas) {
  const clientes = db.list('clients', c => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const opts = `<option value="">Escolha o cliente…</option>${clientes.map(c => `<option value="${fmt.esc(c.id)}">${fmt.esc(c.nome)}${(c.metaContas || []).length ? ' · já tem conta' : ''}</option>`).join('')}`;
  const linhas = contas.slice(0, 40).map(c => `<li class="m-voo-vl"><div><b>${fmt.esc(c.nome)}</b><span class="sub num">act_${fmt.esc(c.id)} · gasto 7d ${fmt.brl(c.m.d7.gasto)}</span></div>
<div class="m-voo-vf"><select data-voo-vinc-sel="${fmt.esc(c.id)}" aria-label="Cliente para a conta ${fmt.esc(c.nome)}">${opts}</select>${ui.btn({ rotulo: 'Vincular', sm: true, icone: 'link', attrs: { 'data-voo-vinc': c.id } })}</div></li>`).join('');
  return ui.card({ titulo: 'Contas sem cliente vinculado', sub: `${contas.length} conta(s)`, icone: 'link', ajuda: 'Ligue cada conta de anúncios ao cliente do app: assim o gestor responsável passa a ver a conta, o semáforo usa a meta de custo do cliente e o teto de mídia vale para os avisos de verba. Também dá para editar em Clientes › Cadastro.',
    corpo: `<ul class="m-voo-vincs">${linhas}</ul>${contas.length > 40 ? `<p class="sm mut">+ ${contas.length - 40} contas. Use o filtro "Sem cliente vinculado".</p>` : ''}` });
}

/* ================================================================== DETALHE */
function renderConta(ctx) {
  const id = normConta(ctx.params.conta);
  const info = F.infoConta(id) || {};
  const c = modeloConta(id);
  const voltar = { href: '#/torre/voo', rotulo: 'Painel de Voo' };
  if (!c) {
    if (info.erro) return `<div class="pg m-voo">${ui.cabecalho({ titulo: 'Conta de anúncios', voltar })}<div class="card">${ui.vazio({ icone: 'alert-circle', titulo: 'Não foi possível buscar esta conta', texto: `${info.erro}`, acao: { rotulo: 'Tentar de novo', attrs: { 'data-voo-atualizar': '' } } })}</div></div>`;
    if (info.pac && !info.carregando) return `<div class="pg m-voo">${ui.cabecalho({ titulo: 'Conta não encontrada', voltar })}<div class="card">${ui.vazio({ icone: 'search', titulo: 'Esta conta não está no seu Painel de Voo', texto: 'Ela pode não estar vinculada a um cliente seu ou não estar ativa na Windsor.', acao: { rotulo: 'Ver todas as contas', href: '#/torre/voo' } })}</div></div>`;
    const g = F.estado.geral && modeloGeral().porId.get(id);
    ctx.migalha(g ? nomeCliente(g) : 'Conta');
    return `<div class="pg m-voo">${ui.cabecalho({ titulo: g ? nomeCliente(g) : 'Carregando conta…', voltar })}<p class="m-voo-ld" role="status" data-voo-carregando>${ui.ic('refresh')}<span>Buscando os dados ao vivo no Meta…</span></p>${ui.skeleton({ tipo: 'kpi', linhas: 4 })}${ui.skeleton({ linhas: 8 })}</div>`;
  }
  ctx.migalha(nomeCliente(c));
  const bq = bloqueio(ctx, c);
  const aba = ['campanhas', 'historico'].includes(ctx.query.aba) ? ctx.query.aba : 'visao';
  const gestor = c.gestorId ? db.get('team', c.gestorId) : null;
  const meta = `${selo(c)}${info.carregando ? '<span class="m-voo-fr">atualizando…</span>' : frescor(info.em, { vivo: true })}${ui.ajuda(`Ao abrir o cliente, os dados são buscados ao vivo no Meta (via Windsor) e atualizam sozinhos a cada 2 minutos com a aba visível. ${AVISO_ATRASO}`)}${c.cliente ? `<a href="#/clientes/${fmt.esc(c.cliente.id)}" class="m-voo-cli">${ui.ic('building')}${fmt.esc(c.cliente.nome)}</a>` : '<span class="t-warn">Sem cliente vinculado</span>'}${gestor ? `<span class="row m-voo-gs">${ui.avatar(gestor, 20)}${fmt.esc(gestor.nome)}</span>` : ''}<span class="num mut">act_${fmt.esc(c.id)}</span>`;
  const espera = info.proxima && Date.now() < info.proxima;
  const acoes = `${ui.btn({ rotulo: info.carregando ? 'Atualizando…' : 'Atualizar agora', icone: 'refresh', attrs: { 'data-voo-atualizar': '' }, disabled: info.carregando || espera, title: espera ? 'Aguarde alguns segundos entre uma busca e outra.' : 'Buscar de novo no Meta', cls: info.carregando ? 'm-voo-spin' : '' })}
${ui.btn({ rotulo: 'Avisar cliente', icone: 'chat', attrs: { 'data-voo-avisar': '' }, disabled: !c.cliente || auth.vendoComo() || !ctx.can('torre_voo', 'editar'), title: !c.cliente ? 'Vincule a conta a um cliente primeiro.' : undefined })}
${ui.btn({ rotulo: 'Pedir criativo', icone: 'users', tipo: 'pri', attrs: { 'data-voo-criativo': '' }, disabled: auth.vendoComo() || !ctx.can('torre_voo', 'editar') })}`;
  const cab = ui.cabecalho({ titulo: nomeCliente(c), sub: c.cliente ? c.nome : 'Conta de anúncios sem cliente vinculado', intro: false, voltar, meta, acoes });
  const avisos = [];
  if (info.erro) avisos.push(ui.aviso({ tipo: 'warn', titulo: 'A última atualização falhou', texto: `${info.erro} Mostrando os dados de ${info.em ? fmt.dataHora(info.em) : 'antes'}.` }));
  if (c.incidente) avisos.push(blocoQuarentena(c));
  if (c.avisoConta) avisos.push(ui.aviso({ tipo: 'err', titulo: `Conta no Meta: ${c.avisoConta}`, texto: 'Os anúncios podem parar. Confira a forma de pagamento e avise o cliente.' }));
  if (auth.vendoComo()) avisos.push(ui.aviso({ tipo: 'info', titulo: 'Somente visualização', texto: '"Ver como": nenhuma ação no Meta é enviada.' }));
  else if (bq && bq === SEM_TOKEN && ctx.can('torre_voo', 'editar')) avisos.push(ui.aviso({ tipo: 'info', titulo: 'Ações no Meta desligadas', texto: `${SEM_TOKEN} Leitura, recomendações, pedido de criativo e aviso ao cliente funcionam normalmente.` }));
  if (!c.cliente && podeVincular()) avisos.push(ui.aviso({ tipo: 'warn', titulo: 'Conta sem cliente vinculado', texto: 'Vincule para usar a meta de custo e o teto de mídia do cliente.', acao: `<div class="m-voo-vf"><select data-voo-vinc-sel="${fmt.esc(c.id)}" aria-label="Cliente"><option value="">Escolha o cliente…</option>${db.list('clients', x => x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(x => `<option value="${fmt.esc(x.id)}">${fmt.esc(x.nome)}</option>`).join('')}</select>${ui.btn({ rotulo: 'Vincular', sm: true, attrs: { 'data-voo-vinc': c.id } })}</div>` }));
  const nPend = c.camps.reduce((s, cp) => s + (cp.pendente ? 1 : 0) + cp.sets.reduce((t, st) => t + (st.pendente ? 1 : 0) + st.ads.filter(a => a.pendente).length, 0), 0);
  if (nPend) avisos.push(ui.aviso({ tipo: 'info', titulo: `${nPend} alteração(ões) aplicada(s) — aguardando confirmação do Meta`, texto: 'O Meta já recebeu. A Windsor pode levar alguns minutos para mostrar o valor novo; até lá a Torre mostra o valor aplicado marcado com o relógio.' }));
  const nAcoes = db.count('clientActions', a => a.origem === 'torre' && (a.contaMeta === c.id || (c.cliente && a.clientId === c.cliente.id)));
  const tabs = `<nav class="tabs m-voo-tabs" aria-label="Seções da conta"><div class="tabs-in">${[['visao', 'Visão geral'], ['campanhas', 'Campanhas', c.camps.filter(x => ATIVO(x.st)).length], ['historico', 'Histórico', nAcoes]].map(([k, r, n]) => `<a class="tab" href="${fmt.esc(ctx.router.href(null, { aba: k === 'visao' ? null : k }))}"${aba === k ? ' aria-current="page"' : ''}>${r}${n ? `<span class="n num">${n}</span>` : ''}</a>`).join('')}</div></nav>`;
  const corpo = aba === 'campanhas' ? abaCampanhas(ctx, c, bq) : aba === 'historico' ? abaHistorico(ctx, c) : abaVisao(ctx, c, bq);
  return `<div class="pg m-torre-voo m-voo m-voo-det${c.incidente ? ' is-q' : ''}" data-voo-conta="${fmt.esc(c.id)}">${cab}${avisos.join('')}${tabs}${corpo}${guardiaoDemo(c)}</div>`;
}

function kpisConta(c) {
  const m7 = c.m.d7, a7 = c.m.d7ant, ms = c.msg.d7, ma = c.msg.d7ant;
  const dl = (a, b) => (b ? `${a >= b ? '▲' : '▼'} ${fmt.dec(Math.abs((a / b - 1) * 100), 1)}%` : undefined);
  const k = [
    ui.kpi({ rotulo: 'Gasto hoje', valor: fmt.brl2(c.m.hoje.gasto), comp: `ontem ${fmt.brl2(c.m.ontem.gasto)}`, ajuda: 'Até agora. O Meta pode levar alguns minutos para contabilizar o gasto.' }),
    ui.kpi({ rotulo: 'Gasto 7 dias', valor: fmt.brl(m7.gasto), delta: dl(m7.gasto, a7.gasto), deltaBom: null, comp: 'vs 7 dias anteriores', serie: c.serie.slice(0, 14).map(x => x.gasto), formatoSerie: 'brl' }),
    ui.kpi({ rotulo: 'Conversas 7 dias', valor: fmt.num(ms.conv), delta: dl(ms.conv, ma.conv), comp: 'vs 7 dias anteriores', serie: c.serie.slice(0, 14).map(x => x.conv) }),
    ui.kpi({ rotulo: 'Custo/conversa 7d', valor: brlOu(ms.custoConv), delta: ms.custoConv && ma.custoConv ? dl(ms.custoConv, ma.custoConv) : undefined, deltaBom: ms.custoConv && ma.custoConv ? ms.custoConv <= ma.custoConv : null, comp: c.meta ? `meta ${fmt.brl2(c.meta)}` : 'sem meta no cadastro', alerta: !!(c.meta && ms.custoConv && ms.custoConv > c.meta * 1.25) }),
    m7.leads || c.tipo === 'lead' ? ui.kpi({ rotulo: 'Leads 7 dias', valor: fmt.num(m7.leads), comp: m7.cpl ? `${fmt.brl2(m7.cpl)} por lead` : 'formulários e cadastros' }) : ui.kpi({ rotulo: 'Impressões 7 dias', valor: fmt.num(m7.impr), comp: `${fmt.num(m7.link)} cliques no link` }),
    ui.kpi({ rotulo: 'CTR · CPM 7d', valor: m7.ctr != null ? fmt.pct(m7.ctr, 2) : '—', comp: m7.cpm != null ? `CPM ${fmt.brl2(m7.cpm)} · freq. ${m7.freq ? fmt.dec(m7.freq, 1) : '—'}` : '', ajuda: 'CTR = cliques ÷ impressões. CPM = custo por mil impressões. Frequência estimada (o alcance chega por dia; a semana é estimada).' }),
  ];
  if (perms.veReceita() && m7.temValor) k.push(ui.kpi({ rotulo: 'Faturamento 7d (Meta)', valor: fmt.brl(m7.valor), comp: m7.roas ? `ROAS ${fmt.dec(m7.roas, 2)} · ${fmt.num(m7.compras)} compras` : '', ajuda: 'Valor das compras atribuídas pelo Meta. Visível só para Dono e Admin.' }));
  return `<div class="g-kpi m-voo-kpis">${k.join('')}</div>`;
}

function abaVisao(ctx, c, bq) {
  const ruim = ['crit', 'caro', 'par', 'aten'].includes(c.sem.estado);
  const pq = `<details class="m-voo-pq"${ruim ? ' open' : ''}><summary>${ui.ic('help')}<span>Por que <b>${SEMAFORO[c.sem.estado].rotulo}</b>?</span>${ui.ic('chev-down', 'm-voo-pq-c')}</summary><ul>${c.porque.map(l => `<li>${fmt.esc(l)}</li>`).join('')}</ul></details>`;
  const fi = fraseInvestimento(c);
  const inv = `<div class="m-voo-inv${fi.acima ? ' acima' : ''}">${ui.ic(fi.acima ? 'alert' : 'wallet')}<p><b>${fmt.esc(fi.texto)}</b> <span>${fmt.esc(fi.textoTeto)}</span></p></div>`;
  const rot = ctx.charts ? null : null; void rot;
  const grafico = ctx.charts.barras({ rotulos: c.serie.map(x => fmt.dataCurta(x.data + 'T12:00:00')), series: [{ nome: 'Gasto', dados: c.serie.map(x => Math.round(x.gasto * 100) / 100), cor: 'var(--c1)' }], formato: 'brl', altura: 190, destaque: 14 });
  const grafConv = ctx.charts.barras({ rotulos: c.serie.map(x => fmt.dataCurta(x.data + 'T12:00:00')), series: [{ nome: 'Conversas', dados: c.serie.map(x => x.conv), cor: 'var(--c2)' }, { nome: 'Leads', dados: c.serie.map(x => x.leads), cor: 'var(--c3)' }], formato: 'num', altura: 190, destaque: 14 });
  const msg = ui.card({ titulo: 'Mensagem para o cliente', sub: 'rascunho — nunca é enviado sozinho', icone: 'chat', corpo: `<pre class="m-voo-wa">${fmt.esc(c.mensagem)}</pre><div class="row">${ui.btn({ rotulo: 'Copiar para WhatsApp', icone: 'copy', sm: true, attrs: { 'data-voo-copiar': '' } })}${ui.btn({ rotulo: 'Marcar como avisado', icone: 'check', sm: true, tipo: 'ghost', attrs: { 'data-voo-avisar': '' }, disabled: !c.cliente || auth.vendoComo() || !ctx.can('torre_voo', 'editar') })}</div>` });
  return `${kpisConta(c)}
<div class="g2 m-voo-g">${`<div class="stack">${ui.card({ titulo: 'Diagnóstico', cls: 'm-voo-diag', corpo: `${pq}${inv}` })}${msg}</div>`}
${ui.card({ titulo: 'Recomendações', sub: c.recs.length ? `${c.recs.length} do motor de recomendações` : 'nenhuma agora', ajuda: 'Motor único de recomendações (as mesmas regras de Campanha › Regras da IA e da central Padrões e regras). Cada sugestão mostra o porquê e o impacto esperado; aceitar ou recusar fica registrado para medir o resultado em 7 dias.', corpo: recsHtml(ctx, c, bq) })}</div>
<div class="g2">${ui.card({ titulo: 'Investimento por dia', sub: '14 dias + hoje (parcial)', corpo: grafico })}${ui.card({ titulo: 'Resultados por dia', sub: 'conversas e leads', corpo: grafConv })}</div>
<p class="m-voo-nota">${ui.ic('info')}<span>${AVISO_4G} ${AVISO_ATRASO}</span></p>`;
}

function recsHtml(ctx, c, bq) {
  if (!c.recs.length) return ui.vazio({ icone: 'check-circle', compacto: true, titulo: c.sem.estado === 'ins' ? 'Aguardando dados' : c.sem.estado === 'meta' ? 'Sem meta de custo' : 'Nada a mudar agora', texto: c.sem.estado === 'meta' ? 'Informe a meta de custo por conversa no cadastro do cliente para o motor avaliar custo.' : 'A conta está dentro das regras. Novas sugestões aparecem quando algo mudar.' });
  const log = db.list('recsLog', x => x.origem === 'torre' && x.conta === c.id);
  return `<ul class="m-voo-recs">${c.recs.map(r => {
    const dec = log.filter(x => x.recId === r.id).sort((a, b) => String(b.quando).localeCompare(String(a.quando)))[0];
    const aberta = !dec || (dec.decisao === 'adiada' && dec.ate && dec.ate < fmt.iso(new Date()));
    const p = PRIO[r.prioridade];
    const t = r.acao.tipo;
    const exige = ['orcamento', 'pausar'].includes(t);
    const fazer = t === 'orcamento' ? 'Ajustar orçamento' : t === 'pausar' ? 'Pausar' : t === 'pedirCriativo' ? 'Pedir criativo' : t === 'mensagemCliente' ? 'Avisar cliente' : t === 'publico' ? 'Ciente, vou revisar' : t === 'aguardar' ? 'Ciente, aguardar' : 'Já verifiquei';
    const dis = exige && bq ? { disabled: true, title: bq } : (auth.vendoComo() || !ctx.can('torre_voo', 'editar')) ? { disabled: true, title: bloqueio(ctx) || 'Somente leitura' } : {};
    const decTxt = dec ? { aceita: 'Feita', recusada: 'Recusada', adiada: 'Adiada' }[dec.decisao] : '';
    return `<li class="m-voo-rec p-${r.prioridade}${aberta ? '' : ' feita'}" data-rec="${fmt.esc(r.id)}">
<div class="m-voo-rec-h">${ui.selo(p[0], p[1])}<b>${fmt.esc(r.titulo)}</b>${!aberta ? ui.selo(dec.decisao === 'aceita' ? 'ok' : 'off', decTxt) : ''}</div>
<p class="m-voo-rec-p">${fmt.esc(r.porque)}</p>
${r.impactoEsperado ? `<p class="m-voo-rec-i"><span>Impacto esperado</span>${fmt.esc(r.impactoEsperado)}</p>` : ''}
${r.de != null ? `<div class="m-voo-ba"><div><span>Antes</span><b class="num">${fmt.brl2(r.de)}/dia</b></div>${ui.ic('arrow-right')}<div><span>Depois</span><b class="num">${fmt.brl2(r.para)}/dia</b></div></div>` : ''}
${r.aviso ? `<p class="m-voo-rec-a">${ui.ic('alert')}<span>${fmt.esc(r.aviso)}</span></p>` : ''}
<details class="m-voo-rec-d"><summary>Regras usadas</summary><ul>${(r.detalhes || []).map(d => `<li>${fmt.esc(d)}</li>`).join('')}<li>Confiança: ${fmt.esc(r.confianca)}.</li></ul></details>
${aberta ? `<div class="row m-voo-rec-b">${ui.btn({ rotulo: fazer, sm: true, tipo: 'pri', attrs: { 'data-rec-fazer': r.id }, ...dis })}${ui.btn({ rotulo: 'Adiar 3 dias', sm: true, attrs: { 'data-rec-adiar': r.id }, disabled: !!dis.disabled })}${ui.btn({ rotulo: 'Recusar', sm: true, tipo: 'ghost', attrs: { 'data-rec-recusar': r.id }, disabled: !!dis.disabled })}</div>` : ''}</li>`;
  }).join('')}</ul>`;
}

function stHtml(x) {
  const ok = ATIVO(x.st); const r = STATUS_META[x.st] || x.st || '—';
  const pend = x.pendente ? `<span class="m-voo-pend" title="O Meta já recebeu. Aguardando a confirmação na próxima leitura.">${ui.ic('clock')}aplicado — aguardando confirmação do Meta</span>` : '';
  return `${ui.selo(ok ? 'ok' : /DISAPPROVED|WITH_ISSUES/.test(x.st) ? 'err' : 'off', r)}${pend}`;
}
function metr(x, c) {
  const m = x.m.d7; const res = c.tipo === 'lead' ? m.leads : c.tipo === 'compra' ? m.compras : m.conv; const cr = res ? m.gasto / res : null;
  return `<dl class="m-voo-mt"><div><dt>Gasto 7d</dt><dd class="num">${fmt.brl2(m.gasto)}</dd></div><div><dt>${c.tipo === 'lead' ? 'Leads' : c.tipo === 'compra' ? 'Compras' : 'Conversas'}</dt><dd class="num">${fmt.num(res)}</dd></div><div><dt>Custo/result.</dt><dd class="num">${brlOu(cr)}</dd></div><div><dt>CTR</dt><dd class="num">${m.ctr != null ? fmt.pct(m.ctr, 2) : '—'}</dd></div></dl>`;
}
function abaCampanhas(ctx, c, bq) {
  const dis = bq ? { disabled: true, title: bq } : {};
  const mud = id => F.mudancasNaHora(id, F.pacoteDaConta(c.id)).length;
  const bPausar = (x, nivel) => (ATIVO(x.st) && !(x.pendente && x.pendente.st) ? ui.btn({ rotulo: 'Pausar', icone: 'pause', sm: true, cls: 'm-voo-bp', attrs: { 'data-voo-pausar': x.id, 'data-nivel': nivel, 'aria-label': `Pausar ${NIVEL_ROT[nivel]} ${x.n}` }, ...dis }) : '');
  const bOrc = (x, nivel) => (x.orc != null && ATIVO(x.st) ? ui.btn({ rotulo: `Orçamento ${fmt.brl2(x.orc)}/dia`, icone: 'wallet', sm: true, attrs: { 'data-voo-orc': x.id, 'data-nivel': nivel, 'aria-label': `Mudar orçamento de ${x.n}` }, ...dis }) + (mud(x.id) ? `<span class="m-voo-lim num" title="Mudanças de orçamento nesta hora">${mud(x.id)}/${F.limiteHora()} nesta hora</span>` : '') : '');
  const aberto = (id, padrao) => (abertos.has(id) ? abertos.get(id) : padrao) ? ' open' : '';
  const arvore = c.camps.map(cp => `<details class="m-voo-nd lv-c${ATIVO(cp.st) ? '' : ' off'}" data-nd="${fmt.esc(cp.id)}"${aberto(cp.id, ATIVO(cp.st))}>
<summary><span class="m-voo-lv">${ui.ic('layers')}Campanha</span><div class="m-voo-nt"><b>${fmt.esc(cp.n)}</b><small>${fmt.esc(objetivo(cp.obj))} · ${cp.cbo ? `CBO · ${fmt.brl2(cp.orc)}/dia na campanha` : 'ABO · orçamento nos conjuntos'}</small></div>${stHtml(cp)}${metr(cp, c)}</summary>
<div class="m-voo-na">${bPausar(cp, 'campanha')}${cp.cbo ? bOrc(cp, 'campanha') : ''}</div>
<div class="m-voo-ch">${cp.sets.map(s => `<details class="m-voo-nd lv-s${ATIVO(s.st) ? '' : ' off'}" data-nd="${fmt.esc(s.id)}"${aberto(s.id, false)}>
<summary><span class="m-voo-lv">${ui.ic('users')}Conjunto</span><div class="m-voo-nt"><b>${fmt.esc(s.n)}</b><small>${cp.cbo ? 'orçamento da campanha' : s.orc != null ? `${fmt.brl2(s.orc)}/dia` : ''} · ${s.ads.length} anúncio(s)</small></div>${stHtml(s)}${metr(s, c)}</summary>
<div class="m-voo-na">${bPausar(s, 'conjunto')}${!cp.cbo ? bOrc(s, 'conjunto') : ''}</div>
<ul class="m-voo-ads">${s.ads.map(a => `<li class="m-voo-ad${ATIVO(a.st) ? '' : ' off'}"><span class="m-voo-lv">${ui.ic('eye')}Anúncio</span><div class="m-voo-nt"><b>${fmt.esc(a.n)}</b><small>freq. 7d ${a.m.d7.freq ? fmt.dec(a.m.d7.freq, 1) : '—'}</small></div>${stHtml(a)}${metr(a, c)}<div class="m-voo-na">${bPausar(a, 'anuncio')}${ui.btn({ rotulo: 'Pedir criativo novo', icone: 'users', sm: true, tipo: 'ghost', attrs: { 'data-voo-criativo': a.id }, disabled: auth.vendoComo() || !ctx.can('torre_voo', 'editar') })}</div></li>`).join('')}</ul>
</details>`).join('')}</div></details>`).join('');
  return `${ui.card({ titulo: 'Campanhas, conjuntos e anúncios', sub: `${c.camps.length} campanha(s) com veiculação nos últimos 14 dias`, ajuda: 'Cada botão age só no nível da caixa em que está. Pausar e mudar orçamento pedem SIM. Máximo de 4 mudanças de orçamento por conjunto (ou campanha CBO) por hora. Reativar e excluir não são feitos por aqui.',
    corpo: `<p class="m-voo-4g">${ui.ic('lock')}<span><b>${AVISO_4G}</b> Aqui você pausa e ajusta o orçamento do que já existe. Toda alteração pede SIM.</span></p><div class="m-voo-inv">${ui.ic('wallet')}<p><b>${fmt.esc(fraseInvestimento(c).texto)}</b> <span>${fmt.esc(fraseInvestimento(c).textoTeto)}</span></p></div>${arvore || ui.vazio({ titulo: 'Nenhuma campanha com veiculação', texto: 'Nos últimos 14 dias esta conta não teve gasto.', compacto: true })}` })}`;
}
const objetivo = o => ({ OUTCOME_ENGAGEMENT: 'Engajamento / mensagens', OUTCOME_LEADS: 'Cadastros', OUTCOME_SALES: 'Vendas', OUTCOME_TRAFFIC: 'Tráfego', OUTCOME_AWARENESS: 'Reconhecimento', MESSAGES: 'Mensagens' }[o] || o || 'Objetivo não informado');

function abaHistorico(ctx, c) {
  const l = db.list('clientActions', a => a.origem === 'torre' && (a.contaMeta === c.id || (c.cliente && a.clientId === c.cliente.id))).sort((a, b) => String(b.createdAt || b.data).localeCompare(String(a.createdAt || a.data)));
  const decs = db.list('recsLog', x => x.origem === 'torre' && x.conta === c.id).sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  const lista = l.length ? `<ul class="m-voo-hist">${l.slice(0, 40).map(a => `<li>${ui.avatar(a.quem, 26)}<div><b>${fmt.esc((db.get('team', a.quem) || {}).nome || 'Alguém')}</b> · ${fmt.esc(a.tipo)}<small>${fmt.esc(a.createdAt ? fmt.dataHora(a.createdAt) : fmt.data(a.data))}</small><p>${fmt.esc(a.descricao || '')}</p>${a.antes || a.depois ? `<span class="m-voo-hba num">${fmt.esc(a.antes || '—')} → ${fmt.esc(a.depois || '—')}</span>` : ''}</div></li>`).join('')}</ul>`
    : ui.vazio({ icone: 'clock', compacto: true, titulo: 'Nenhuma alteração registrada ainda', texto: 'Toda ação feita pelo Painel de Voo fica aqui e em Clientes › Resultados e ações: quem, o quê, quando e antes → depois.' });
  const dl = decs.length ? ui.lista(decs.slice(0, 20).map(d => ({ estado: d.decisao === 'aceita' ? 'ok' : d.decisao === 'recusada' ? 'off' : 'warn', titulo: d.titulo || d.regraId, sub: `${{ aceita: 'Aceita', recusada: 'Recusada', adiada: 'Adiada' }[d.decisao]} · ${fmt.dataHora(d.quando)}` }))) : '<p class="sm mut">Nenhuma decisão sobre recomendações ainda.</p>';
  return `<div class="g-2-1">${ui.card({ titulo: 'Quem mexeu aqui', sub: c.cliente ? 'também em Clientes › Resultados e ações' : '', corpo: lista })}${ui.card({ titulo: 'Decisões sobre recomendações', corpo: dl })}</div>`;
}

function blocoQuarentena(c) {
  const inc = c.incidente; const pode = invasao.podeLiberar(auth.real() || auth.user()) && !auth.vendoComo();
  return `<div class="m-voo-qb" role="alert">${ui.ic('shield')}<div><b>Conta em quarentena — possível invasão</b><span>O Guardião pausou ${fmt.plural((inc.pausados || []).length, 'campanha')} automaticamente${inc.assumidoPor && inc.assumidoPor.length ? ` · assumido por ${fmt.esc(inc.assumidoPor[inc.assumidoPor.length - 1].nome)}` : ''}. Nenhuma alteração pela Torre até a liberação (Dono/Admin, checklist e SIM).</span></div><div class="row">${ui.btn({ rotulo: 'Ver incidente', sm: true, attrs: { 'data-voo-inc': inc.id } })}${ui.btn({ rotulo: 'Liberar conta…', sm: true, tipo: 'pri', attrs: { 'data-voo-liberar': inc.id }, disabled: !pode, title: pode ? undefined : 'Só Dono ou Admin liberam a quarentena.' })}</div></div>`;
}

/* ------------------------------------------------------------------ Guardião (demonstração): simular invasão e reativação */
const gt = { est: {}, snap: {} };
try { const g = JSON.parse(localStorage.getItem('aos-voo-gt') || 'null'); if (g && g.snap) Object.assign(gt, g); } catch (e) { /* sem storage */ }
const salvarGt = () => { try { localStorage.setItem('aos-voo-gt', JSON.stringify(gt)); } catch (e) { /* sem storage */ } };
function guardiaoDemo(c) {
  if (db.mode === 'supabase' || auth.vendoComo()) return '';
  const u = auth.real() || auth.user(); if (!u || !['dono', 'admin'].includes(u.papel)) return '';
  const q = !!c.incidente;
  return `<section class="m-voo-gt"><p>${ui.ic('shield')}<span><b>Guardião de segurança · demonstração</b> Simule uma invasão para ver a pausa automática, a sirene e a quarentena (só Dono/Admin, só no modo demonstração).</span></p>${q ? ui.btn({ rotulo: 'Simular reativação pelo invasor', sm: true, attrs: { 'data-gt': 'reativar' } }) : ui.btn({ rotulo: 'Simular invasão (demonstração)', sm: true, tipo: 'perigo', icone: 'shield', attrs: { 'data-gt': 'simular' } })}</section>`;
}
function snapGuardiao(c) {
  return { conta: { id: c.id, nome: nomeCliente(c), clientId: c.cliente ? c.cliente.id : null }, agora: Date.now(), fusoMin: -180,
    campanhas: c.camps.map(cp => ({ id: cp.id, nome: cp.n, status: ATIVO(cp.st) ? 'ativo' : 'pausado', cbo: cp.cbo, orc: cp.orc || 0, objetivo: cp.obj, conjuntos: cp.sets.map(s => ({ id: s.id, nome: s.n, status: ATIVO(s.st) ? 'ativo' : 'pausado', orc: s.orc || 0 })) })),
    eventos: [], gastoHoras: null, autorizados: db.list('team').map(t => t.id), paisesUsados: ['BR'], tetoMensal: c.cliente ? c.cliente.tetoMidiaMensal || null : null };
}
function processarGuardiao(c, snap, evento0) {
  const chave = `guardiaoEstado:${c.id}`;
  snap.agora = Date.now();
  const inc0 = c.incidente || null;
  const r = Guardiao.processar(snap, gt.est[c.id] || db.config(chave, null), { overrides: db.config('guardiaoRegras', {}) || {}, incidente: inc0 });
  gt.est[c.id] = r.estado; db.setConfig(chave, r.estado); salvarGt();
  r.acoes.forEach(x => { if (x.tipo !== 'pausar') return; F.demoMutar(x.id, { st: 'PAUSED' }); const cp = snap.campanhas.find(k => k.id === x.id); if (cp) cp.status = 'pausado'; });
  if (r.evento === 'invasao' || r.evento === 'reincidencia') invasao.registrarIncidente({ ...r.incidente, contaNome: nomeCliente(c) }, { evento: r.evento, clientId: c.cliente ? c.cliente.id : null, origem: 'torre', pausadas: r.acoes.length });
  F.demoAtualizarTudo();
  return r || evento0;
}
function simularInvasao(c) {
  const base = snapGuardiao(c);
  const sim = Guardiao.simularInvasao(base, { mediaHora: Math.max(1, orcamentoDia(c) / 24) });
  // o "invasor" mexe na conta (demo): orçamento ×5 e campanha nova ativa
  sim.campanhas.forEach(cp => { const o = base.campanhas.find(x => x.id === cp.id); if (!o) { F.demoNovaCampanha(cp.id, { c: c.id, n: cp.nome, st: 'ACTIVE', obj: 'OUTCOME_SALES', orc: cp.orc }); return; } if (cp.cbo && cp.orc !== o.orc) F.demoMutar(cp.id, { orc: cp.orc }); cp.conjuntos.forEach(s => { const so = o.conjuntos.find(x => x.id === s.id); if (so && so.orc !== s.orc) F.demoMutar(s.id, { orc: s.orc }); }); });
  gt.snap[c.id] = sim;
  return processarGuardiao(c, sim);
}
function simularReativacao(c) {
  const snap = gt.snap[c.id]; const inc = c.incidente; if (!snap || !inc) { ui.toast('Nada pausado pelo Guardião nesta sessão para reativar.', { tipo: 'info' }); return; }
  const p = (inc.pausados || []).map(x => snap.campanhas.find(k => k.id === x.id)).find(k => k && k.status === 'pausado');
  if (!p) { ui.toast('Nada pausado para reativar.', { tipo: 'info' }); return; }
  p.status = 'ativo'; F.demoMutar(p.id, { st: 'ACTIVE' });
  snap.eventos = (snap.eventos || []).concat([{ id: `sim-${c.id}-${Date.now().toString(36)}-reat`, quando: new Date().toISOString(), atorId: 'meta-9912', atorNome: 'Jhon Ads Pro', via: 'api', tipo: 'status', nivel: 'campanha', alvoId: p.id, alvoNome: p.nome, depois: 'ativo' }]);
  salvarGt(); F.demoAtualizarTudo();
  ui.toast(`"${p.nome}" foi reativada por alguém de fora. O Guardião confere a conta a cada poucos segundos…`, { tipo: 'warn' });
}
// vigilância das contas em quarentena (demonstração: a cada 4 s; produção: Edge Function guardiao a cada 2 min)
if (typeof window !== 'undefined') {
  setInterval(() => {
    if (db.mode === 'supabase') return;
    for (const id of Object.keys(gt.snap)) {
      const g = F.estado.geral || null; void g;
      const inc = invasao.incidenteDaConta(id); if (!inc) { delete gt.snap[id]; salvarGt(); continue; }
      const c = (F.pacoteDaConta(id) ? modeloConta(id) : null) || (F.estado.geral ? modeloGeral().porId.get(id) : null);
      if (c) processarGuardiao(c, gt.snap[id]);
    }
  }, 4000);
  window.addEventListener('aos:guardiao', e => {
    const d = e.detail || {}; if (d.tipo !== 'liberar' || db.mode === 'supabase' || !d.plano) return;
    (d.plano.acoes || []).forEach(x => { if (x.tipo === 'orcamento') F.demoMutar(x.id, { orc: x.para }); else if (x.tipo === 'ativar') F.demoMutar(x.id, { st: 'ACTIVE' }); });
    delete gt.snap[normConta(d.contaId)]; delete gt.est[normConta(d.contaId)]; salvarGt();
    F.demoAtualizarTudo();
  });
}

/* ------------------------------------------------------------------ confirmação SIM e ações */
function modalSIM({ titulo, acao, onde, antes, depois, avisos = '', confirmar, perigo, executar }) {
  const corpo = `<div class="stack m-voo-sim"><p><b>${fmt.esc(acao)}</b><br><span class="mut">${fmt.esc(onde)}</span></p>
<div class="m-voo-ba"><div><span>Antes</span><b class="num">${fmt.esc(antes)}</b></div>${ui.ic('arrow-right')}<div class="${perigo ? 'off' : 'ok'}"><span>Depois</span><b class="num">${fmt.esc(depois)}</b></div></div>${avisos}
<label class="fld"><span>Para confirmar, digite <b>SIM</b></span><input name="sim" autocomplete="off" maxlength="3" placeholder="SIM" aria-describedby="m-voo-sim-d"><small id="m-voo-sim-d" class="mut">A alteração vai direto para o Meta. Toda alteração pede SIM.</small></label></div>`;
  return ui.modal({ titulo: titulo || 'Deseja mesmo fazer isso?', sub: 'Confirmação obrigatória', corpo, confirmar: confirmar || 'Confirmar', perigo, largura: 'sm',
    onAbrir: box => { const inp = box.closest('.ov').querySelector('[name="sim"]'); const ok = box.closest('.ov').querySelector('[data-ok]'); const upd = () => { ok.disabled = inp.value.trim() !== 'SIM'; }; ok.disabled = true; inp.addEventListener('input', upd); },
    onConfirmar: async box => { const v = box.querySelector('[name="sim"]').value.trim(); if (v !== 'SIM') return 'Digite SIM (em maiúsculas) para confirmar.'; try { await executar(); return true; } catch (e) { return e.message || 'O Meta não aceitou a alteração. Tente de novo.'; } } });
}
function acharItem(c, id) { for (const cp of c.camps) { if (cp.id === id) return { x: cp, nivel: 'campanha', cp }; for (const s of cp.sets) { if (s.id === id) return { x: s, nivel: 'conjunto', cp, s }; for (const a of s.ads) if (a.id === id) return { x: a, nivel: 'anuncio', cp, s, a }; } } return null; }
const rotAcao = (n, x) => `${NIVEL_ROT[n][0].toUpperCase()}${NIVEL_ROT[n].slice(1)} "${x.n}"`;

async function pausar(ctx, c, id, via) {
  const b = bloqueio(ctx, c); if (b) { ui.toast(b, { tipo: 'info' }); return false; }
  const it = acharItem(c, id); if (!it) return false;
  const ok = await modalSIM({ acao: `Pausar ${NIVEL_ROT[it.nivel]}`, onde: `${nomeCliente(c)} · ${it.x.n}`, antes: STATUS_META[it.x.st] || it.x.st, depois: 'Pausado', perigo: true, confirmar: 'Confirmar pausa',
    avisos: `<p class="m-voo-av">${ui.ic('info')}<span>Pausar é reversível, mas reativar não é feito pela Torre. ${AVISO_4G}</span></p>`,
    executar: () => F.executarAcao({ acao: 'pausar', nivel: it.nivel, id, conta: c.id, via: via ? via.titulo : null }) });
  if (!ok) return false;
  registrarLocal(c, { tipo: `Pausou ${it.nivel}`, descricao: `Pausou ${rotAcao(it.nivel, it.x).toLowerCase()} pelo Painel de Voo${via ? ' (recomendação do motor)' : ''}.`, antes: STATUS_META[it.x.st] || it.x.st, depois: 'Pausado', objetoId: id });
  ui.toast(`Aplicado às ${fmt.hora(new Date())} · ${rotAcao(it.nivel, it.x)} pausado. Aguardando confirmação do Meta.`, { tipo: 'ok' });
  return true;
}

async function orcamento(ctx, c, id, sugerido, via) {
  const b = bloqueio(ctx, c); if (b) { ui.toast(b, { tipo: 'info' }); return false; }
  const it = acharItem(c, id); if (!it || it.x.orc == null) return false;
  const atual = it.x.orc; const LIM = F.limiteHora(); const usados = F.mudancasNaHora(id, F.pacoteDaConta(c.id));
  if (usados.length >= LIM) { const lib = new Date(usados[0] + 36e5); ui.toast(`Limite de alterações: no máximo ${LIM} mudanças de orçamento por conjunto por hora. Este já teve ${usados.length}. Próxima liberação às ${fmt.hora(lib)}.`, { tipo: 'warn', duracao: 7000 }); return false; }
  const minimo = Math.max(6, Number(padrao('orcamento.minimoDia', 6)) || 6); const maxPct = Number(padrao('orcamento.aumentoMaxPct', 20)) || 20;
  const nivelTxt = it.nivel === 'conjunto' ? `conjunto "${it.x.n}" (ABO: cada conjunto tem o próprio orçamento)` : `campanha "${it.x.n}" (CBO: o Meta distribui entre os conjuntos)`;
  let valor = null;
  const corpo = `<div class="stack m-voo-orc"><p class="sm mut">Aplica no nível certo: ${fmt.esc(nivelTxt)}. Mudanças nesta hora: <b class="num">${usados.length}/${LIM}</b>.</p>
<div class="row m-voo-q">${[-20, -10, 10, 20].map(p => `<button type="button" class="chip" data-q="${p}">${p > 0 ? '+' : '−'}${Math.abs(p)}%</button>`).join('')}</div>
${ui.campo({ nome: 'valor', rotulo: `Novo orçamento diário · atual ${fmt.brl2(atual)}`, tipo: 'moeda', valor: sugerido ?? atual, obrigatorio: true })}
<p class="sm" data-o-p aria-live="polite"></p><div data-o-w></div></div>`;
  const ok = await ui.modal({ titulo: 'Orçamento diário', sub: `${nomeCliente(c)} · ${it.x.n}`, corpo, confirmar: 'Continuar', largura: 'sm',
    onAbrir: box => {
      const inp = box.querySelector('[name="valor"]');
      const upd = () => {
        const v = ui.parse.moeda(inp.value); const pEl = box.querySelector('[data-o-p]'), wEl = box.querySelector('[data-o-w]');
        if (v == null || !(v > 0)) { pEl.textContent = 'Informe o valor em reais, ex.: 120,00.'; wEl.innerHTML = ''; return; }
        const d = ((v - atual) / atual) * 100; const fi = fraseInvestimento(c, { id, v });
        pEl.innerHTML = `De <b>${fmt.brl2(atual)}</b> para <b>${fmt.brl2(v)}</b> (${d > 0 ? '+' : '−'}${fmt.dec(Math.abs(d), 0)}%) · impacto estimado ${d > 0 ? '+' : '−'}${fmt.brl(Math.abs(v - atual) * 30.4)}/mês`;
        wEl.innerHTML = `<div class="m-voo-inv${fi.acima ? ' acima' : ''}">${ui.ic(fi.acima ? 'alert' : 'wallet')}<p><b>${fmt.esc(fi.texto)}</b> <span>${fmt.esc(fi.textoTeto)}</span></p></div>${d > maxPct ? `<p class="m-voo-av">${ui.ic('alert')}<span><b>Aumento acima de ${fmt.dec(maxPct, 0)}%.</b> Pode reiniciar o aprendizado do Meta e deixar o custo instável por 3 a 7 dias. O mais seguro é subir até ${fmt.dec(maxPct, 0)}% a cada 48 horas.</span></p>` : ''}`;
      };
      box.querySelectorAll('[data-q]').forEach(bq => bq.addEventListener('click', () => { inp.value = ui.mascaras.moeda(Math.round(atual * (1 + Number(bq.dataset.q) / 100) * 100) / 100); upd(); }));
      inp.addEventListener('input', upd); upd();
    },
    onConfirmar: box => {
      const v = ui.parse.moeda(box.querySelector('[name="valor"]').value);
      if (v == null || !(v > 0)) return 'Informe o valor em reais, ex.: 120,00.';
      if (v < minimo) return `O mínimo é ${fmt.brl2(minimo)} por dia.`;
      if (v > 100000) return 'Valor alto demais para o Painel de Voo. Confira o número.';
      if (Math.abs(v - atual) < 0.01) return 'O valor é igual ao atual.';
      valor = v; return true;
    } });
  if (!ok || valor == null) return false;
  const d = ((valor - atual) / atual) * 100; const fi = fraseInvestimento(c, { id, v: valor });
  const avisos = `<div class="m-voo-inv${fi.acima ? ' acima' : ''}">${ui.ic(fi.acima ? 'alert' : 'wallet')}<p><b>${fmt.esc(fi.texto)}</b> <span>${fmt.esc(fi.textoTeto)}</span></p></div>${fi.acima ? `<p class="m-voo-av err">${ui.ic('alert')}<span><b>Atenção: passa do teto combinado com o cliente.</b> Confirme com o cliente antes.</span></p>` : ''}`;
  const feito = await modalSIM({ acao: `Orçamento diário ${it.nivel === 'conjunto' ? 'do conjunto' : 'da campanha'}`, onde: `${nomeCliente(c)} · ${it.x.n}`, antes: `${fmt.brl2(atual)}/dia`, depois: `${fmt.brl2(valor)}/dia (${d > 0 ? '+' : '−'}${fmt.dec(Math.abs(d), 0)}%)`, avisos,
    executar: () => F.executarAcao({ acao: 'orcamento', nivel: it.nivel, id, conta: c.id, valor, via: via ? via.titulo : null }) });
  if (!feito) return false;
  registrarLocal(c, { tipo: 'Orçamento alterado', metrica: 'Verba', descricao: `Mudou o orçamento diário de ${rotAcao(it.nivel, it.x).toLowerCase()} de ${fmt.brl2(atual)} para ${fmt.brl2(valor)} pelo Painel de Voo${via ? ' (recomendação do motor)' : ''}.`, antes: `${fmt.brl2(atual)}/dia`, depois: `${fmt.brl2(valor)}/dia`, objetoId: id });
  ui.toast(`Aplicado às ${fmt.hora(new Date())} · orçamento ${fmt.brl2(atual)} → ${fmt.brl2(valor)}/dia. Aguardando confirmação do Meta.`, { tipo: 'ok' });
  return true;
}
/** demonstração: o histórico é gravado aqui (em produção quem grava é a Edge Function voo-acao) */
function registrarLocal(c, a) {
  if (db.mode === 'supabase') return;
  const eu = quemSou(); const agora = new Date().toISOString();
  const oque = `${a.descricao.replace(/\.$/, '').replace(/^\w/, x => x.toLowerCase())} (${nomeCliente(c)})`;
  if (c.cliente) db.insert('clientActions', { clientId: c.cliente.id, data: agora.slice(0, 10), quem: eu.teamId, area: 'trafego', metrica: a.metrica || null, expectativa: '', resultado: '', origem: 'torre', contaMeta: c.id, ...a }, { log: oque });
  else db.insert('activity', { quem: eu.userId, quemNome: eu.nome, oque, col: 'torre', refId: null, quando: agora });
}

/* ------------------------------------------------------------------ recomendações: decisões */
function decidir(c, rec, decisao, extra = {}) {
  const q = quemSou();
  const e = MotorRecs.registrarDecisao(rec, decisao, q.teamId);
  db.insert('recsLog', { ...e, origem: 'torre', conta: c.id, contaNome: nomeCliente(c), clientId: c.cliente ? c.cliente.id : null, ...extra });
}
async function fazerRec(ctx, c, rec) {
  const t = rec.acao.tipo;
  if (t === 'orcamento') { const id = rec.alvo.nivel === 'campanha' ? rec.alvo.id : rec.alvo.id; if (await orcamento(ctx, c, id, rec.para, rec)) decidir(c, rec, 'aceita'); return; }
  if (t === 'pausar') { if (await pausar(ctx, c, rec.alvo.id, rec)) decidir(c, rec, 'aceita'); return; }
  if (t === 'pedirCriativo') { if (await abrirCriativo(ctx, c, null, rec)) decidir(c, rec, 'aceita'); return; }
  if (t === 'mensagemCliente') { if (await abrirAvisar(ctx, c)) decidir(c, rec, 'aceita'); return; }
  decidir(c, rec, 'aceita'); ui.toast('Registrado. O resultado é medido em 7 dias.', { tipo: 'ok' });
}

/* ------------------------------------------------------------------ pedir criativo / avisar cliente */
async function abrirCriativo(ctx, c, adId, rec) {
  const it = adId ? acharItem(c, adId) : null;
  const pessoas = db.list('team', t => t.ativo !== false && t.papel !== 'leitura').sort((a, b) => (CRIATIVOS.includes(a.id) ? CRIATIVOS.indexOf(a.id) : 9) - (CRIATIVOS.includes(b.id) ? CRIATIVOS.indexOf(b.id) : 9) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const m7 = it ? it.x.m.d7 : c.m.d7;
  const briefing = `${rec ? `${rec.titulo}. ${rec.porque} ` : ''}${it ? `Anúncio "${it.x.n}": ` : ''}CTR 7d ${m7.ctr != null ? fmt.pct(m7.ctr, 2) : '—'}, frequência ${m7.freq ? fmt.dec(m7.freq, 1) : '—'}. Novo gancho nos 3 primeiros segundos, mesma oferta.`;
  const amanha = fmt.iso(new Date(Date.now() + 2 * 864e5));
  let res = null;
  const ok = await ui.modal({ titulo: 'Pedir criativo novo', sub: nomeCliente(c), largura: 'md', confirmar: 'Pedir criativo',
    corpo: `<div class="fgrid">${ui.campo({ nome: 'para', rotulo: 'Para quem', tipo: 'select', valor: CRIATIVOS[0], opcoes: pessoas.map(t => ({ v: t.id, l: `${t.nome} · ${t.cargo || t.area || ''}` })), obrigatorio: true })}
${ui.campo({ nome: 'prazo', rotulo: 'Prazo', tipo: 'data', valor: amanha, obrigatorio: true })}
${ui.campo({ nome: 'formato', rotulo: 'Formato', tipo: 'select', valor: 'video', opcoes: [{ v: 'video', l: 'Vídeo' }, { v: 'imagem', l: 'Imagem' }, { v: 'carrossel', l: 'Carrossel' }] })}
${ui.campo({ nome: 'prioridade', rotulo: 'Prioridade', tipo: 'select', valor: 'alta', opcoes: [{ v: 'normal', l: 'Normal' }, { v: 'alta', l: 'Alta' }, { v: 'urgente', l: 'Urgente' }] })}
${ui.campo({ nome: 'briefing', rotulo: 'Briefing', tipo: 'textarea', valor: briefing, obrigatorio: true, cls: 'full', linhas: 4 })}</div>`,
    onConfirmar: box => {
      const r = ui.form.validar(box, { para: 'obrigatorio', prazo: 'obrigatorio', briefing: 'obrigatorio|min:10' }); if (!r.ok) return false;
      res = pedidoCriativo({ ref: `pc-${Date.now().toString(36)}`, para: r.dados.para, cliente: nomeCliente(c), clientId: c.cliente ? c.cliente.id : null, conta: c.id, anuncio: it ? it.x.n : '', prazo: r.dados.prazo, formato: r.dados.formato, prioridade: r.dados.prioridade, briefing: r.dados.briefing });
      return res ? true : 'Escolha quem produz e escreva o briefing.';
    } });
  if (ok && res) ui.toast(`Criativo pedido a ${(db.get('team', res.respId) || {}).nome || 'equipe'} · tarefa criada.`, { tipo: 'ok', acao: { rotulo: 'Ver tarefa', fn: () => ctx.router.go(`operacao/quadro?tarefa=${res.id}`) } });
  return !!(ok && res);
}
async function abrirAvisar(ctx, c) {
  if (!c.cliente) { ui.toast('Vincule a conta a um cliente primeiro.', { tipo: 'info' }); return false; }
  const ok = await ui.modal({ titulo: 'Avisar cliente', sub: `${c.cliente.nome} · pelo WhatsApp`, largura: 'md', confirmar: 'Marquei como avisado',
    corpo: `<p class="sm mut">Copie a mensagem, envie pelo WhatsApp do cliente e confirme aqui. Nada é enviado automaticamente.</p>${ui.campo({ nome: 'mensagem', rotulo: 'Mensagem', tipo: 'textarea', valor: c.mensagem, linhas: 6, cls: 'full' })}<div class="row">${ui.btn({ rotulo: 'Copiar', icone: 'copy', sm: true, attrs: { 'data-copiar-msg': '' } })}</div>`,
    onAbrir: box => { const b = box.querySelector('[data-copiar-msg]'); b && b.addEventListener('click', () => copiar(box.querySelector('[name="mensagem"]').value)); },
    onConfirmar: box => { clienteAvisado({ cliente: c.cliente.nome, clientId: c.cliente.id, mensagem: box.querySelector('[name="mensagem"]').value, conta: c.id }); return true; } });
  if (ok) ui.toast(`${c.cliente.nome}: aviso registrado no histórico do cliente.`, { tipo: 'ok' });
  return !!ok;
}
function copiar(txt) {
  const ok = () => ui.toast('Mensagem copiada. Cole no WhatsApp do cliente.', { tipo: 'ok' });
  try { navigator.clipboard.writeText(txt).then(ok, () => ui.toast('Não foi possível copiar automaticamente. Selecione o texto e copie.', { tipo: 'warn' })); } catch (e) { ui.toast('Não foi possível copiar automaticamente. Selecione o texto e copie.', { tipo: 'warn' }); }
}

function clientePorNome(nome) { const n = fmt.norm(nome); if (!n) return null; return db.find('clients', c => fmt.norm(c.nome) === n || fmt.norm(c.nomeFantasia || '') === n || fmt.norm(c.razao || '') === n) || null; }
/** pedido de criativo: tarefa na Operação + notificação para quem produz + registro no cliente */
export function pedidoCriativo(d) {
  const para = db.get('team', str(d.para, 60));
  const cliente = str(d.cliente, 160).trim(); const briefing = str(d.briefing, 4000).trim();
  if (!para || !cliente || !briefing) return null;
  const prazo = isoValido(d.prazo) ? d.prazo : fmt.iso(new Date(Date.now() + 864e5));
  const prioridade = ['normal', 'alta', 'urgente'].includes(d.prioridade) ? d.prioridade : 'alta';
  const formato = { video: 'Vídeo', imagem: 'Imagem', carrossel: 'Carrossel' }[d.formato] || 'Criativo';
  const c = (d.clientId && db.get('clients', d.clientId)) || clientePorNome(cliente);
  const eu = quemSou(); const agora = new Date().toISOString(); const anuncio = str(d.anuncio, 200);
  let tarefa;
  db.batch(() => {
    tarefa = db.insert('tasks', {
      titulo: `Novo criativo · ${cliente}`, clientId: c ? c.id : null, clienteNome: c ? c.nome : cliente, respId: para.id,
      tipo: para.id === 't-elisa' ? 'copy' : 'criativo', status: 'afazer', prazo, prioridade: prioridade === 'normal' ? 'normal' : 'alta',
      desc: briefing, descricao: briefing, origem: 'torre', formato, anuncio, contaMeta: str(d.conta, 60),
      estimativaH: formato === 'Vídeo' ? 4 : 2, horasGastas: 0, checklist: [], retrabalho: 0, projetoId: null, aprovadorId: eu.teamId || null,
      criadaEm: agora, historico: [{ quando: agora, quem: eu.userId, oque: `criou pelo Painel de Voo (pedido de ${eu.nome})` }],
    }, { log: `pediu criativo novo a ${para.nome} para ${cliente} (Painel de Voo)` });
    if (c) db.insert('clientActions', { clientId: c.id, data: agora.slice(0, 10), quem: eu.teamId, tipo: 'Novo criativo pedido', area: 'trafego', metrica: 'CPL', descricao: `${formato} novo pedido a ${para.nome} (prazo ${fmt.data(prazo)})${anuncio ? ` para substituir o anúncio "${anuncio}"` : ''}.`, antes: anuncio ? `Anúncio cansado: ${anuncio}` : 'Anúncio cansado', depois: '', expectativa: 'Custo por conversa de volta à meta', resultado: '', origem: 'torre', contaMeta: str(d.conta, 60), taskId: tarefa.id });
  });
  if (para.userId) notify.enviar({ para: [para.userId], tipo: 'atribuicao', prioridade: prioridade === 'normal' ? 'normal' : 'alta', titulo: `${fmt.primeiro(eu.nome)} pediu um criativo novo: ${cliente}`, texto: `${formato} · prazo ${fmt.data(prazo)}${anuncio ? ` · substitui "${anuncio}"` : ''}. Briefing na tarefa.`, link: `#/operacao/quadro?tarefa=${tarefa.id}`, refCol: 'tasks', refId: tarefa.id });
  return tarefa;
}
/** "cliente avisado": registra no cliente (Resultados e ações) e na atividade */
export function clienteAvisado(d) {
  const cliente = str(d.cliente, 160).trim(); if (!cliente) return null;
  const c = (d.clientId && db.get('clients', d.clientId)) || clientePorNome(cliente); const eu = quemSou();
  const oque = `avisou ${cliente} pelo WhatsApp (Painel de Voo)`;
  if (c) return db.insert('clientActions', { clientId: c.id, data: fmt.iso(new Date()), quem: eu.teamId, tipo: 'Cliente avisado (mensagem)', area: 'trafego', metrica: null, descricao: str(d.mensagem, 2000), antes: '', depois: 'Cliente avisado', expectativa: '', resultado: '', origem: 'torre', contaMeta: str(d.conta, 60) }, { log: oque });
  return db.insert('activity', { quem: eu.userId, quemNome: eu.nome, oque, col: 'torre', refId: null, quando: new Date().toISOString() });
}
/** compatibilidade: invasão vinda de outra fonte (ex.: teste) → alerta, notificações, rotina e sirene */
const incValido = i => i && typeof i === 'object' && typeof i.id === 'string' && /^inc-[\w-]{1,80}$/.test(i.id) && Array.isArray(i.pausados) && Array.isArray(i.achados);
export function guardiaoInvasao(d) {
  if (!incValido(d.incidente)) return null;
  const inc = { ...d.incidente, contaNome: str(d.incidente.contaNome, 160) || 'conta' };
  const c = clientePorNome(inc.contaNome);
  return invasao.registrarIncidente(inc, { evento: d.evento === 'reincidencia' ? 'reincidencia' : 'invasao', clientId: c ? c.id : null, origem: 'torre', pausadas: typeof d.pausadas === 'number' ? d.pausadas : undefined });
}

/* ------------------------------------------------------------------ vincular conta ao cliente */
function vincular(ctx, conta, clientId) {
  if (!podeVincular()) { ui.toast('Só Dono, Admin e Head de Tráfego vinculam contas.', { tipo: 'info' }); return; }
  const c = db.get('clients', clientId); if (!c) { ui.toast('Escolha o cliente.', { tipo: 'warn' }); return; }
  const antes = (c.metaContas || []).slice();
  const outro = db.find('clients', x => x.id !== c.id && (x.metaContas || []).map(normConta).includes(conta));
  db.batch(() => {
    if (outro) db.update('clients', outro.id, { metaContas: (outro.metaContas || []).filter(a => normConta(a) !== conta) });
    db.update('clients', c.id, { metaContas: [...new Set([...antes.map(normConta), conta])], ...(c.metaAdAccountId ? {} : { metaAdAccountId: `act_${conta}` }) }, { log: `vinculou a conta Meta act_${conta} ao cliente ${c.nome} (Painel de Voo)` });
  });
  ui.toast(`Conta act_${conta} vinculada a ${c.nome}.`, { tipo: 'ok', desfazer: () => db.update('clients', c.id, { metaContas: antes }) });
}

/* ================================================================== render / mount */
export function renderVoo(ctx) { return ctx.params && ctx.params.conta ? renderConta(ctx) : renderGeral(ctx); }

const abertos = new Map(); // caixas da árvore abertas/fechadas pela pessoa (sobrevivem ao re-render)
let aberta = null; // conta cujo detalhe foi aberto (busca ao vivo só ao abrir, não a cada re-render)
let tentativaGeral = 0;
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { const m = /^#\/torre\/voo\/(\d+)/.exec(location.hash); if (!m || m[1] !== aberta) aberta = null; });

export function mountVoo(el, ctx) {
  const id = ctx.params && ctx.params.conta ? normConta(ctx.params.conta) : null;
  const off = F.ouvir(() => ctx.refresh());
  const timers = [];
  if (!id) {
    if (F.precisaGeral() && !F.estado.carregandoGeral && Date.now() - tentativaGeral > 20000) { tentativaGeral = Date.now(); F.carregarGeral(); }
    timers.push(setInterval(() => { if (document.visibilityState === 'visible' && F.precisaGeral() && !F.estado.carregandoGeral) { tentativaGeral = Date.now(); F.carregarGeral(); } }, 30000));
  } else {
    if (aberta !== id) { aberta = id; F.carregarConta(id, { forcar: true }); }
    if (!F.estado.geral && !F.estado.carregandoGeral && Date.now() - tentativaGeral > 20000) { tentativaGeral = Date.now(); F.carregarGeral({ rapido: true }); }
    const auto = () => { const i = F.infoConta(id); if (document.visibilityState === 'visible' && i && !i.carregando && (!i.em || Date.now() - Date.parse(i.em) >= F.AUTO_MS)) F.carregarConta(id, { forcar: true }); };
    timers.push(setInterval(auto, 10000));
    document.addEventListener('visibilitychange', auto); timers.push({ vis: auto });
    // "Atualizar agora" volta a ficar disponível depois dos 20 s
    const i0 = F.infoConta(id); if (i0 && i0.proxima && i0.proxima > Date.now()) timers.push(setTimeout(() => ctx.refresh(), i0.proxima - Date.now() + 50));
  }
  const conta = () => (id ? modeloConta(id) : null);
  const onClick = e => {
    const t = e.target.closest('button,[data-voo-copiar]'); if (!t || t.disabled) return;
    const c = conta(); const ds = t.dataset;
    if ('vooGeralAtualizar' in ds) { tentativaGeral = Date.now(); F.carregarGeral({ forcar: true }); }
    else if ('vooAtualizar' in ds) F.carregarConta(id, { forcar: true });
    else if (ds.vooVinc) { const sel = el.querySelector(`[data-voo-vinc-sel="${ds.vooVinc}"]`); vincular(ctx, ds.vooVinc, sel && sel.value); }
    else if (!c) return;
    else if (ds.vooPausar) pausar(ctx, c, ds.vooPausar);
    else if (ds.vooOrc) orcamento(ctx, c, ds.vooOrc);
    else if ('vooCriativo' in ds) abrirCriativo(ctx, c, ds.vooCriativo || null);
    else if ('vooAvisar' in ds) abrirAvisar(ctx, c);
    else if ('vooCopiar' in ds) copiar(c.mensagem);
    else if (ds.vooInc) invasao.abrirIncidente(ds.vooInc);
    else if (ds.vooLiberar) invasao.abrirSaida(ds.vooLiberar);
    else if (ds.recFazer || ds.recAdiar || ds.recRecusar) {
      const r = c.recs.find(x => x.id === (ds.recFazer || ds.recAdiar || ds.recRecusar)); if (!r) return;
      if (ds.recFazer) fazerRec(ctx, c, r);
      else if (ds.recAdiar) { decidir(c, r, 'adiada', { ate: fmt.iso(new Date(Date.now() + 3 * 864e5)) }); ui.toast('Adiada por 3 dias.', { tipo: 'info' }); }
      else { decidir(c, r, 'recusada'); ui.toast('Recomendação recusada. Fica registrado para o motor aprender.', { tipo: 'info', desfazer: () => { const l = db.list('recsLog', x => x.recId === r.id && x.conta === c.id && x.decisao === 'recusada'); const u = l[l.length - 1]; if (u) db.remove('recsLog', u.id); } }); }
    } else if (ds.gt === 'simular') simularInvasao(c);
    else if (ds.gt === 'reativar') simularReativacao(c);
  };
  el.addEventListener('click', onClick);
  // busca na lista (sem re-render)
  const onInput = e => { if (!e.target.matches('[data-voo-q]')) return; const q = fmt.norm(e.target.value.trim()); el.querySelectorAll('.m-voo-contas tbody tr').forEach(tr => { tr.hidden = !!q && !fmt.norm(tr.textContent).includes(q); }); };
  el.addEventListener('input', onInput);
  const onToggle = e => { const d = e.target; if (d && d.dataset && d.dataset.nd) abertos.set(d.dataset.nd, d.open); };
  el.addEventListener('toggle', onToggle, true);
  return () => {
    off(); el.removeEventListener('click', onClick); el.removeEventListener('input', onInput); el.removeEventListener('toggle', onToggle, true);
    timers.forEach(t => { if (t && t.vis) document.removeEventListener('visibilitychange', t.vis); else { clearInterval(t); clearTimeout(t); } });
  };
}

/** busca global: contas e clientes do Painel de Voo */
export function buscaVoo(q) {
  if (!F.estado.geral || !perms.can('torre_voo')) return [];
  return modeloGeral().contas.filter(c => fmt.norm(`${nomeCliente(c)} ${c.nome} ${c.id}`).includes(q)).slice(0, 8)
    .map(c => ({ tipo: 'Painel de Voo', titulo: nomeCliente(c), sub: `${SEMAFORO[c.sem.estado].rotulo} · act_${c.id}`, href: `#/torre/voo/${c.id}`, led: SEMAFORO[c.sem.estado].led, icone: 'plane' }));
}

/* ganchos para testes e console (o mesmo estado da tela; ações continuam passando pelas regras) */
if (typeof window !== 'undefined') window.AOS_VOO = {
  estado: F.estado, carregarGeral: F.carregarGeral, carregarConta: F.carregarConta, executarAcao: F.executarAcao, demoReset: F.demoReset, demoConfirmarTudo: F.demoConfirmarTudo, guardiaoInvasao,
  modelo: id => (id ? modeloConta(id) || (F.estado.geral ? modeloGeral().porId.get(id) : null) : modeloGeral()),
  statusCampanhas: id => { const c = modeloConta(id) || (F.estado.geral ? modeloGeral().porId.get(id) : null); return c ? c.camps.map(x => ({ id: x.id, n: x.n, st: x.st })) : []; },
};
