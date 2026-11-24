// Alertas e Insights — feed acionável, regras configuráveis (7 essenciais pré-criadas) e insights automáticos.
import './data.js';
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import { perms } from '../../core/perms.js';
import { invasao } from '../../core/invasao.js';
import Guardiao from '../../shared/guardiao.mjs';
import { sirene } from '../../core/sirene.js';

/* ---------------- dinheiro que entra: só quem tem a permissão "receita" ----------------
   Quem não vê receita recebe os alertas sem os valores (R$/MRR saem do detalhe), não vê os insights
   que só fazem sentido com valores e não vê as regras de área Financeiro. */
const veReceita = () => perms.veReceita();
const DINHEIRO = /R\$|\bMRR\b|faturamento|\breceita\b/i;
const semValores = txt => String(txt || '').split(' · ').filter(p => !DINHEIRO.test(p)).join(' · ');
function alertaEquipe(a) {
  if (veReceita()) return a;
  if (DINHEIRO.test(a.titulo || '')) return null;
  return { ...a, detalhe: semValores(a.detalhe) };
}
function insightEquipe(i) {
  if (veReceita() || (i.area === 'Comercial' && perms.can('comercial', 'editar'))) return i;
  const titulo = i.tituloEquipe || i.titulo, texto = i.textoEquipe || i.texto;
  if (i.area === 'Financeiro' && DINHEIRO.test(`${titulo} ${texto}`)) return null;
  if (DINHEIRO.test(`${titulo} ${texto}`)) return null;
  if (i.acao && /^#\/(financeiro|cockpit)/.test(i.acao.href || '')) return { ...i, titulo, texto, acao: null };
  return { ...i, titulo, texto };
}
const REGRA_EQUIPE = { 'rg-mrr-score': 'Cliente estratégico com score caindo' };
const regraVisivel = r => veReceita() || r.area !== 'Financeiro';
const nomeRegra = r => (veReceita() ? r.nome : REGRA_EQUIPE[r.id] || r.nome);

const GRAV = { err: 'Crítico', warn: 'Atenção', info: 'Info' };
const AREAS = ['Segurança', 'Clientes', 'Torre', 'Financeiro', 'Equipe', 'Operação', 'Comercial', 'Tráfego'];
const CANAIS = [['app', 'App', 'bell'], ['whatsapp', 'WhatsApp', 'message'], ['slack', 'Slack', 'hash'], ['email', 'E-mail', 'mail']];
const SEM_PERM = 'Seu acesso a Alertas é só de leitura. Peça a um administrador.';
const ORD = { err: 0, warn: 1, info: 2 };
const METRICAS = [
  { id: 'health', rotulo: 'Health score do cliente', un: ' pts', area: 'Clientes' },
  { id: 'roas', rotulo: 'ROAS do cliente', un: '', area: 'Tráfego' },
  { id: 'cpl', rotulo: 'CPL do cliente (R$)', un: '', area: 'Tráfego' },
  { id: 'verba', rotulo: 'Verba de mídia consumida', un: '%', area: 'Tráfego' },
  { id: 'atraso_fatura', rotulo: 'Dias de atraso da fatura', un: ' dias', area: 'Financeiro' },
  { id: 'ocupacao', rotulo: 'Ocupação da pessoa', un: '%', area: 'Equipe' },
  { id: 'sucesso', rotulo: 'Sucesso 30d da rotina', un: '%', area: 'Torre' },
  { id: 'proposta_parada', rotulo: 'Dias sem próxima ação na oportunidade', un: ' dias', area: 'Comercial' },
];
const OPS = [['>', 'maior que'], ['>=', 'maior ou igual a'], ['<', 'menor que'], ['<=', 'menor ou igual a']];
const PARAMS = {
  'rg-mrr-score': [{ k: 'mrrMin', l: 'MRR mínimo do cliente', tipo: 'moeda' }, { k: 'queda', l: 'Queda do health em 30 dias (pts)', tipo: 'number', min: 1, max: 100 }],
  'rg-entrega': [{ k: 'dias', l: 'Dias de atraso da entrega', tipo: 'number', min: 1, max: 60 }],
  'rg-fatura': [{ k: 'dias', l: 'Dias de atraso da fatura', tipo: 'number', min: 1, max: 120 }],
  'rg-torre': [{ k: 'falhas', l: 'Falhas seguidas da rotina', tipo: 'number', min: 1, max: 10 }],
  'rg-ocupacao': [{ k: 'limite', l: 'Ocupação acima de (%)', tipo: 'number', min: 50, max: 200 }, { k: 'semanas', l: 'Por quantas semanas seguidas', tipo: 'number', min: 1, max: 8 }],
  'rg-renovacao': [{ k: 'dias', l: 'Renovação em menos de (dias)', tipo: 'number', min: 1, max: 120 }],
  'rg-runway': [{ k: 'meses', l: 'Runway abaixo de (meses)', tipo: 'number', min: 1, max: 24 }],
};

/* ---------------- helpers ---------------- */
export function condicao(r, equipe = !veReceita()) {
  const p = r.params || {};
  switch (r.id) {
    case 'rg-mrr-score': return !equipe ? `MRR ≥ ${fmt.brl(p.mrrMin)} e health caiu ${p.queda} pts ou mais em 30 dias` : `Cliente estratégico e health caiu ${p.queda} pts ou mais em 30 dias`;
    case 'rg-entrega': return `Entrega passou ${fmt.plural(p.dias, 'dia')} do prazo`;
    case 'rg-fatura': return `Fatura vencida há mais de ${fmt.plural(p.dias, 'dia')}`;
    case 'rg-torre': return `Rotina falhou ${p.falhas}× seguidas ou integração ficou vermelha`;
    case 'rg-ocupacao': return `Ocupação acima de ${p.limite}% por ${fmt.plural(p.semanas, 'semana seguida', 'semanas seguidas')}`;
    case 'rg-renovacao': return `Renovação em menos de ${p.dias} dias sem reunião marcada`;
    case 'rg-runway': return `Runway (caixa ÷ custo fixo) abaixo de ${fmt.plural(p.meses, 'mês', 'meses')}`;
    default: {
      const m = METRICAS.find(x => x.id === r.metrica) || { rotulo: r.metrica || 'Indicador', un: '' };
      const op = (OPS.find(o => o[0] === r.op) || ['', r.op])[1];
      return `${m.rotulo} ${op} ${String(p.valor).replace('.', ',')}${m.un}`;
    }
  }
}
const statusEf = a => (a.status === 'adiado' && a.adiadoAte && new Date(a.adiadoAte) <= new Date() ? 'aberto' : (a.status || (a.resolvido ? 'resolvido' : 'aberto')));
function visiveis(ctx) {
  const l = db.list('alerts').map(alertaEquipe).filter(Boolean);
  const esc = ctx.perms.escopo('alertas');
  if (esc !== 'seus') return l;
  const t = ctx.user && ctx.user.teamId;
  return l.filter(a => (a.para || []).includes(t) || a.atribuidoA === t);
}
function hrefAcao(a) {
  if (!a.acao) return null;
  let h = a.acao.href || '';
  if (/^#\/(financeiro|cockpit)/.test(h) && !perms.can(h.slice(2).split(/[/?]/)[0])) return null;
  if (/cobrar=$/.test(h)) {
    const inv = db.list('invoices', i => i.clientId === a.refId).sort((x, y) => String(x.vencimento || '').localeCompare(String(y.vencimento || '')))
      .find(i => !i.pago && !['pago', 'paga', 'recebido'].includes(String(i.status || '').toLowerCase()));
    h = inv ? h + encodeURIComponent(inv.id) : '#/financeiro/receber';
  }
  return h;
}
const pessoaNome = id => { const t = db.get('team', id); return t ? t.nome : ''; };
const lista = arr => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} e ${arr[arr.length - 1]}`);

/* ---------------- feed ---------------- */
/** incidente de segurança (Guardião): estado da quarentena, quem assumiu, "Ver incidente" (gaveta com liberação) */
function itemIncidente(a, ctx, foco) {
  const { ui } = ctx; const inc = a.incidente; const enc = inc.estado === 'encerrado';
  const ass = (inc.assumidoPor || []).map(x => fmt.primeiro(x.nome || '')).filter(Boolean);
  const est = enc ? ui.led('ok', 'Encerrado') : inc.estado === 'aberto' ? ui.led('err', 'Em quarentena · ninguém assumiu') : ui.led('warn', `Em quarentena · assumido por ${lista(ass)}`);
  const meta = [`<span class="m-alertas-g s-err">Supremo</span>`, `<span>Segurança</span>`, ui.rel(a.atualizadoEm || a.quando), (inc.reincidencias || []).length ? `<span class="t-err">${fmt.plural(inc.reincidencias.length, 'reincidência', 'reincidências')}</span>` : ''].filter(Boolean).join('<span class="m-alertas-sep" aria-hidden="true">·</span>');
  const eu = ctx.real || ctx.user; const jaAssumi = eu && (inc.assumidoPor || []).some(x => x.userId === eu.id);
  const acoes = `${ui.btn({ rotulo: 'Ver incidente', sm: true, tipo: enc ? undefined : 'pri', icone: 'shield', attrs: { 'data-incidente': a.id } })}${!enc && !jaAssumi && invasao.ehAlvo(ctx.real) ? ui.btn({ rotulo: 'Assumir incidente', sm: true, tipo: 'ghost', icone: 'check', attrs: { 'data-seg-assumir': a.id } }) : ''}${!enc ? `<span class="m-alertas-k">${est}</span>` : ''}`;
  return `<li class="m-alertas-i is-seg s-${enc ? 'res' : 'err'}${foco ? ' is-foco' : ''}" id="alerta-${fmt.esc(a.id)}">
<span class="m-alertas-led">${enc ? ui.led('off', false, { aria: 'Encerrado' }) : `<span class="m-alertas-seg-ic" aria-label="Incidente de segurança">${ui.ic('shield')}</span>`}</span>
<div class="m-alertas-m"><div class="m-alertas-meta">${meta}</div><h3>${fmt.esc(a.titulo)}</h3><p>${fmt.esc(a.detalhe || '')} · ${fmt.plural((inc.pausados || []).length, 'campanha pausada', 'campanhas pausadas')} automaticamente (nenhuma excluída)${enc ? ` · liberada ${fmt.esc(fmt.rel(inc.encerradoEm))}` : ''}</p><div class="m-alertas-a">${acoes}</div></div></li>`;
}
function itemAlerta(a, ctx, foco) {
  if (a.tipo === 'invasao' && a.incidente) return itemIncidente(a, ctx, foco);
  const { ui } = ctx; const st = statusEf(a); const pode = ctx.can('alertas', 'editar');
  const g = ui.normEstado(a.gravidade);
  const resolvido = st === 'resolvido';
  const href = hrefAcao(a);
  const meta = [
    `<span class="m-alertas-g s-${g}">${GRAV[g] || 'Info'}</span>`, `<span>${fmt.esc(a.area)}</span>`, ui.rel(a.quando),
    a.atribuidoA ? `<span class="m-alertas-at">${ui.avatar(a.atribuidoA, 18)}${fmt.esc(fmt.primeiro(pessoaNome(a.atribuidoA)))}</span>` : '',
    st === 'adiado' ? `<span class="m-alertas-ad">${ui.ic('clock')}adiado até ${fmt.esc(fmt.dataCurta(a.adiadoAte))} ${fmt.hora(a.adiadoAte)}</span>` : '',
  ].filter(Boolean).join('<span class="m-alertas-sep" aria-hidden="true">·</span>');
  const dis = pode ? {} : { disabled: true, title: SEM_PERM };
  const acoes = resolvido
    ? `<span class="m-alertas-res">${ui.ic('check-circle')}Resolvido ${fmt.esc(fmt.rel(a.resolvidoEm))}${a.resolvidoPor ? ` por ${fmt.esc(a.resolvidoPor)}` : ''}${a.nota ? ` · ${fmt.esc(a.nota)}` : ''}</span>${ui.btn({ rotulo: 'Reabrir', sm: true, tipo: 'ghost', icone: 'refresh', attrs: { 'data-reabrir': a.id }, ...dis })}`
    : `${href ? ui.btn({ rotulo: a.acao.rotulo, href, sm: true, tipo: g === 'err' ? 'pri' : undefined, iconeDir: 'arrow-right' }) : ''}
${ui.btn({ rotulo: a.atribuidoA ? 'Reatribuir' : 'Atribuir', icone: 'user-plus', sm: true, tipo: 'ghost', attrs: { 'data-atribuir': a.id }, ...dis })}
${ui.btn({ rotulo: 'Adiar', icone: 'clock', sm: true, tipo: 'ghost', attrs: { 'data-adiar': a.id, 'aria-haspopup': 'menu' }, ...dis })}
${ui.btn({ rotulo: 'Resolver', icone: 'check', sm: true, tipo: 'ghost', attrs: { 'data-resolver': a.id }, ...dis })}`;
  return `<li class="m-alertas-i s-${resolvido ? 'res' : g}${foco ? ' is-foco' : ''}" id="alerta-${fmt.esc(a.id)}">
<span class="m-alertas-led">${resolvido ? ui.led('off', false, { aria: 'Resolvido' }) : ui.led(g, false, { aria: GRAV[g] })}</span>
<div class="m-alertas-m"><div class="m-alertas-meta">${meta}</div><h3>${fmt.esc(a.titulo)}</h3><p>${fmt.esc(a.detalhe || '')}</p><div class="m-alertas-a">${acoes}</div></div></li>`;
}

function insightsCard(ctx) {
  const { ui } = ctx;
  const l = db.list('insights', i => !i.dispensado).map(insightEquipe).filter(Boolean).filter(i => {
    if (i.refId && i.refId.startsWith('i-')) { const it = db.get('integrations', i.refId); if (it && it.estado === 'ok') return false; }
    return true;
  }).sort((a, b) => (ORD[a.estado] ?? 3) - (ORD[b.estado] ?? 3));
  const pode = ctx.can('alertas', 'editar');
  const corpo = l.length ? `<ul class="m-alertas-ins">${l.map(i => `<li class="s-${ui.normEstado(i.estado)}"><p class="m-alertas-ins-k">${ui.led(i.estado, false)}<span>${fmt.esc(i.area)}</span></p><h3>${fmt.esc(i.titulo)}</h3><p>${fmt.esc(i.texto)}</p><div class="row">${i.acao ? ui.btn({ rotulo: i.acao.rotulo, href: i.acao.href, sm: true, iconeDir: 'arrow-right' }) : ''}${ui.btn({ rotulo: 'Dispensar', sm: true, tipo: 'ghost', attrs: { 'data-dispensar': i.id }, disabled: !pode, title: pode ? 'Esconder este insight' : SEM_PERM })}</div></li>`).join('')}</ul>`
    : ui.vazio({ icone: 'bulb', titulo: 'Nenhum insight novo', texto: 'Os insights são gerados todo dia a partir dos números da agência. Volte amanhã.', compacto: true });
  return ui.card({ titulo: 'Insights', icone: 'bulb', sub: 'Leituras automáticas dos números, em linguagem simples', ajuda: 'Gerados cruzando carteira, equipe, financeiro, Torre e comercial. Cada um traz a ação sugerida.', corpo, cls: 'm-alertas-insc' });
}

function paginaFeed(ctx) {
  const { ui, query } = ctx;
  const todos = visiveis(ctx).map(a => ({ ...a, _st: statusEf(a) }));
  const foco = query.alerta || null;
  const s = foco ? 'todos' : (['abertos', 'adiados', 'resolvidos', 'todos'].includes(query.s) ? query.s : 'abertos');
  const g = ['err', 'warn'].includes(query.g) ? query.g : 'todas';
  const area = AREAS.includes(query.area) ? query.area : '';
  const meus = query.meus === '1';
  const abertos = todos.filter(a => a._st === 'aberto');
  const porStatus = { abertos: abertos, adiados: todos.filter(a => a._st === 'adiado'), resolvidos: todos.filter(a => a._st === 'resolvido'), todos };
  let l = porStatus[s].slice();
  if (g !== 'todas') l = l.filter(a => ui.normEstado(a.gravidade) === g);
  if (area) l = l.filter(a => a.area === area);
  if (meus) l = l.filter(a => a.atribuidoA === (ctx.user && ctx.user.teamId));
  l.sort((a, b) => (a._st === 'resolvido') - (b._st === 'resolvido') || (ORD[a.gravidade] ?? 3) - (ORD[b.gravidade] ?? 3) || String(b.quando).localeCompare(String(a.quando)));
  const crit = abertos.filter(a => a.gravidade === 'err').length, warn = abertos.filter(a => a.gravidade === 'warn').length;
  const base = porStatus[s];
  const filtros = `<div class="m-alertas-f">
${ui.chips([{ id: 'abertos', rotulo: 'Abertos', n: abertos.length }, { id: 'adiados', rotulo: 'Adiados', n: porStatus.adiados.length }, { id: 'resolvidos', rotulo: 'Resolvidos', n: porStatus.resolvidos.length }, { id: 'todos', rotulo: 'Todos', n: todos.length }], s, 's', { rotulo: 'Status' })}
<div class="m-alertas-f2">${ui.chips([{ id: 'todas', rotulo: 'Todas' }, { id: 'err', rotulo: 'Críticos', n: base.filter(a => a.gravidade === 'err').length, estado: 'err' }, { id: 'warn', rotulo: 'Atenção', n: base.filter(a => a.gravidade === 'warn').length, estado: 'warn' }], g, 'g', { rotulo: 'Gravidade' })}
<label class="m-alertas-sel"><span class="sr-only">Área</span><select data-area aria-label="Filtrar por área"><option value="">Todas as áreas</option>${AREAS.filter(x => x !== 'Financeiro' || veReceita() || todos.some(a => a.area === x)).map(x => `<option${x === area ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
<a class="chip" href="${fmt.esc(ctx.router.href(null, { meus: meus ? null : '1' }))}"${meus ? ' aria-current="true"' : ''}>${ui.ic('user')}Atribuídos a mim</a></div></div>`;
  const vz = s === 'abertos' && !g.length ? null : null; // (mantido simples)
  const corpo = l.length ? `<ul class="m-alertas-l">${l.map(a => itemAlerta(a, ctx, a.id === foco)).join('')}</ul>`
    : ui.vazio({ icone: s === 'abertos' ? 'check-circle' : 'inbox', titulo: s === 'abertos' && g === 'todas' && !area && !meus ? 'Nenhum alerta aberto' : 'Nenhum alerta com estes filtros', texto: s === 'abertos' && g === 'todas' && !area && !meus ? 'Tudo sob controle. Quando uma regra disparar, o alerta aparece aqui com a ação sugerida.' : 'Limpe os filtros para ver todos os alertas.', acao: { rotulo: 'Limpar filtros', href: ctx.router.href(null, { s: null, g: null, area: null, meus: null, alerta: null }) }, compacto: true });
  void vz;
  const meta = `${ui.led(crit ? 'err' : warn ? 'warn' : 'ok', crit ? fmt.plural(crit, 'alerta crítico', 'alertas críticos') : warn ? `${warn} em atenção` : 'Tudo sob controle')}${crit && warn ? `<span>${warn} em atenção</span>` : ''}<span>atualizado ${ui.rel(new Date().toISOString())}</span>`;
  return `<div class="pg m-alertas">
${ui.cabecalho({ titulo: 'Alertas e Insights', sub: 'O que precisa de ação agora, em ordem de gravidade — e o que os números estão dizendo.', meta, acoes: ui.btn({ rotulo: 'Regras de alerta', icone: 'sliders', href: '#/alertas/regras' }) })}
${ui.tabs([{ id: '', rotulo: 'Feed', n: abertos.length }, { id: 'regras', rotulo: 'Regras', n: db.list('alertRules').filter(regraVisivel).length }], '', 'alertas')}
<div class="g-2-1">
${ui.card({ titulo: 'Feed de alertas', sub: `${fmt.plural(l.length, 'alerta')} neste filtro`, ajuda: 'Cada alerta nasce de uma regra (aba Regras). Resolver tira do feed; Adiar esconde até a data escolhida; Atribuir avisa a pessoa.', corpo: `${filtros}${corpo}`, cls: 'm-alertas-feed' })}
${insightsCard(ctx)}
</div></div>`;
}

/* ---------------- regras ---------------- */
function linhaRegra(r, ctx) {
  const { ui } = ctx; const pode = ctx.can('alertas', 'editar');
  const dest = (r.destinatarios || []).map(pessoaNome).filter(Boolean);
  const g = ui.normEstado(r.gravidade);
  return `<li class="m-alertas-rg${r.ativo ? '' : ' is-off'}" data-rg="${fmt.esc(r.id)}">
<button type="button" class="m-alertas-sw" role="switch" aria-checked="${!!r.ativo}" aria-label="Regra ${fmt.esc(nomeRegra(r))} ${r.ativo ? 'ativa' : 'desativada'}" data-rg-ativo="${fmt.esc(r.id)}"${pode ? '' : ` disabled title="${SEM_PERM}"`}><i></i></button>
<div class="m-alertas-rg-m"><div class="m-alertas-rg-t"><h3>${fmt.esc(nomeRegra(r))}</h3><span class="m-alertas-g s-${g}">${GRAV[g]}</span>${r.custom ? '<span class="m-alertas-tag">Personalizada</span>' : ''}</div>
<p class="m-alertas-rg-c">${ui.ic('filter')}<span>${fmt.esc(condicao(r))}</span></p>
<p class="m-alertas-rg-s">${r.ativo ? `Disparou ${fmt.plural(r.disparos30 || 0, 'vez', 'vezes')} em 30 dias${r.ultimoDisparo ? ` · último ${fmt.rel(r.ultimoDisparo)}` : ''}` : 'Desativada — não dispara alertas'}${r.ultimoTeste ? ` · testada ${fmt.rel(r.ultimoTeste)}` : ''}</p></div>
<div class="m-alertas-rg-cn" role="group" aria-label="Canais">${CANAIS.map(([c, l, i]) => `<button type="button" class="m-alertas-cn" aria-pressed="${(r.canais || []).includes(c)}" data-rg-canal="${fmt.esc(r.id)}" data-canal="${c}" title="${l}" aria-label="${l}"${pode ? '' : ' disabled'}>${ui.ic(i)}<span>${l}</span></button>`).join('')}</div>
<div class="m-alertas-rg-d"><span class="m-alertas-k">Destinatários</span><span class="row" style="gap:6px;flex-wrap:nowrap">${ui.avatares(r.destinatarios || [], 3, 22)}<span class="sm trunc" title="${fmt.esc(lista(dest))}${r.resp ? ' + responsável' : ''}">${fmt.esc(dest.map(fmt.primeiro).join(', '))}${r.resp ? ' + resp.' : ''}</span></span></div>
<div class="m-alertas-rg-a">${ui.btn({ rotulo: 'Testar regra', icone: 'send', sm: true, tipo: 'ghost', attrs: { 'data-rg-testar': r.id }, disabled: !pode || !r.ativo, title: !pode ? SEM_PERM : !r.ativo ? 'Ative a regra para testar' : 'Envia um alerta de teste para os destinatários' })}${ui.btn({ rotulo: 'Editar', icone: 'edit', sm: true, attrs: { 'data-rg-editar': r.id }, disabled: !pode, title: pode ? undefined : SEM_PERM })}</div>
</li>`;
}
function paginaRegras(ctx) {
  const { ui } = ctx; const pode = ctx.can('alertas', 'editar');
  ctx.migalha('Regras');
  const l = db.list('alertRules').filter(regraVisivel);
  const ess = l.filter(r => !r.custom), cus = l.filter(r => r.custom);
  const ativas = l.filter(r => r.ativo).length;
  return `<div class="pg m-alertas">
${ui.cabecalho({ titulo: 'Alertas e Insights', sub: 'Defina quando um alerta dispara, com que gravidade, por qual canal e para quem.', meta: `${ui.led(ativas === l.length ? 'ok' : 'warn', `${ativas} de ${l.length} regras ativas`)}`, acoes: ui.btn({ rotulo: 'Nova regra', icone: 'plus', tipo: 'pri', attrs: { 'data-rg-nova': '' }, disabled: !pode, title: pode ? 'Criar uma regra personalizada' : SEM_PERM }) })}
${ui.tabs([{ id: '', rotulo: 'Feed', n: db.count('alerts', a => statusEf(a) === 'aberto') }, { id: 'regras', rotulo: 'Regras', n: l.length }], 'regras', 'alertas')}
${ui.aviso({ tipo: 'info', texto: 'As regras são avaliadas pela rotina "Torre de Controle" a cada 5 min. WhatsApp, Slack e e-mail são simulados no modo demonstração; em produção saem pela Edge Function de notificações.' })}
${cardGuardiao(ctx)}
${ui.card({ titulo: 'Alertas essenciais', sub: veReceita() ? 'Os 7 alertas que toda agência precisa — já configurados. Ajuste limite, canais e destinatários.' : 'Os alertas que toda agência precisa — já configurados. Os de área Financeiro ficam com a administração.', pad: false, corpo: `<ul class="m-alertas-rgl">${ess.map(r => linhaRegra(r, ctx)).join('')}</ul>` })}
${ui.card({ titulo: 'Regras personalizadas', pad: false, acoes: pode ? ui.btn({ rotulo: 'Nova regra', icone: 'plus', sm: true, attrs: { 'data-rg-nova': '' } }) : '', corpo: cus.length ? `<ul class="m-alertas-rgl">${cus.map(r => linhaRegra(r, ctx)).join('')}</ul>` : `<div class="card-b">${ui.vazio({ icone: 'sliders', titulo: 'Nenhuma regra personalizada', texto: 'Crie regras para o que é específico da sua agência — ex.: ROAS de um cliente abaixo de 2 ou verba acima de 95%.', acao: pode ? { rotulo: 'Criar regra', icone: 'plus', attrs: { 'data-rg-nova': '' } } : null, compacto: true })}</div>` })}
</div>`;
}

/* ---------------- ações ---------------- */
function pessoasOpcoes() { return db.list('team', t => t.ativo !== false && t.papel !== 'leitura').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); }
function camposComuns(ui, r) {
  const pes = pessoasOpcoes();
  return `<fieldset class="fld full m-alertas-fs"><legend>Canais<span class="req" aria-hidden="true">*</span></legend><div class="rd-g">${CANAIS.map(([c, l]) => `<label class="ck"><input type="checkbox" name="canais" value="${c}"${(r.canais || []).includes(c) ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>
<fieldset class="fld full m-alertas-fs"><legend>Destinatários<span class="req" aria-hidden="true">*</span></legend><div class="rd-g m-alertas-pes">${pes.map(t => `<label class="ck"><input type="checkbox" name="destinatarios" value="${t.id}"${(r.destinatarios || []).includes(t.id) ? ' checked' : ''}><span>${ui.avatar(t, 20)} ${fmt.esc(t.nome)}</span></label>`).join('')}</div></fieldset>
${ui.campo({ nome: 'resp', rotulo: 'Incluir também o responsável pelo cliente/rotina', tipo: 'checkbox', valor: !!r.resp, cls: 'full' })}
${ui.campo({ nome: 'ativo', rotulo: 'Regra ativa', tipo: 'checkbox', valor: r.ativo !== false, cls: 'full' })}`;
}
const regrasComuns = {
  canais: [v => (v && v.length ? '' : 'Escolha pelo menos um canal.')],
  destinatarios: [(v, d) => (v && v.length) || d.resp ? '' : 'Escolha pelo menos uma pessoa (ou inclua o responsável).'],
};

async function editarRegra(id, ctx) {
  const { ui } = ctx; const r = db.get('alertRules', id); if (!r) return;
  const defs = r.custom ? [{ k: 'valor', l: 'Limite', tipo: 'number' }] : (PARAMS[r.id] || []);
  const corpo = `<form class="stack" novalidate><p class="m-alertas-prev" data-prev>${ui.ic('filter')}<span>${fmt.esc(condicao(r))}</span></p><div class="fgrid">
${r.custom ? ui.campo({ nome: 'op', rotulo: 'Condição', tipo: 'select', opcoes: OPS.map(([v, l]) => ({ v, l })), valor: r.op }) : ''}
${defs.map(d => ui.campo({ nome: d.k, rotulo: d.l, tipo: d.tipo === 'moeda' ? 'moeda' : 'number', valor: r.params[d.k], obrigatorio: true, attrs: d.tipo === 'number' ? { min: d.min ?? '', max: d.max ?? '', step: 'any' } : null })).join('')}
${ui.campo({ nome: 'gravidade', rotulo: 'Gravidade', tipo: 'select', opcoes: [{ v: 'err', l: 'Crítico (vermelho, exige ação)' }, { v: 'warn', l: 'Atenção (âmbar)' }], valor: r.gravidade })}
${camposComuns(ui, r)}</div></form>`;
  const antes = JSON.parse(JSON.stringify(r));
  const ok = await ui.modal({ titulo: 'Editar regra', sub: r.nome, corpo, confirmar: 'Salvar regra', largura: 'lg',
    onAbrir: box => {
      const f = box.querySelector('form'); const prev = box.querySelector('[data-prev] span');
      f.addEventListener('input', () => { const d = ui.form.ler(f); const params = { ...r.params }; defs.forEach(x => { if (d[x.k] != null && d[x.k] !== '') params[x.k] = Number(d[x.k]); }); prev.textContent = condicao({ ...r, op: d.op || r.op, params }); });
    },
    onConfirmar: box => {
      const regras = { ...regrasComuns };
      defs.forEach(d => { regras[d.k] = ['obrigatorio', v => (v == null || isNaN(v) ? 'Informe um número.' : d.min != null && v < d.min ? `O mínimo é ${d.min}.` : d.max != null && v > d.max ? `O máximo é ${d.max}.` : (d.tipo === 'moeda' && v <= 0 ? 'Informe um valor maior que zero.' : ''))]; });
      const v = ui.form.validar(box.querySelector('form'), regras); if (!v.ok) return false;
      const d = v.dados; const params = { ...r.params }; defs.forEach(x => { params[x.k] = Number(d[x.k]); });
      db.update('alertRules', id, { params, gravidade: d.gravidade, canais: d.canais, destinatarios: d.destinatarios, resp: !!d.resp, ativo: !!d.ativo, ...(r.custom ? { op: d.op } : {}) }, { log: `editou a regra de alerta "${r.nome}"` });
      return true;
    } });
  if (ok) ui.toast(`Regra "${r.nome}" salva.`, { desfazer: () => db.update('alertRules', id, antes) });
}

async function novaRegra(ctx) {
  const { ui } = ctx;
  const r0 = { canais: ['app'], destinatarios: [ctx.user && ctx.user.teamId].filter(Boolean), resp: true, ativo: true };
  const corpo = `<form class="stack" novalidate><p class="m-alertas-prev" data-prev>${ui.ic('filter')}<span>Escolha o indicador e o limite para ver a regra aqui.</span></p><div class="fgrid">
${ui.campo({ nome: 'nome', rotulo: 'Nome da regra', obrigatorio: true, cls: 'full', placeholder: 'Ex.: ROAS abaixo de 2 em cliente de tráfego' })}
${ui.campo({ nome: 'metrica', rotulo: 'Indicador', tipo: 'select', obrigatorio: true, placeholder: 'Escolha…', opcoes: METRICAS.map(m => ({ v: m.id, l: m.rotulo })) })}
${ui.campo({ nome: 'op', rotulo: 'Condição', tipo: 'select', opcoes: OPS.map(([v, l]) => ({ v, l })), valor: '<' })}
${ui.campo({ nome: 'valor', rotulo: 'Limite', tipo: 'number', obrigatorio: true, placeholder: 'Ex.: 2', attrs: { step: 'any' } })}
${ui.campo({ nome: 'gravidade', rotulo: 'Gravidade', tipo: 'select', opcoes: [{ v: 'warn', l: 'Atenção (âmbar)' }, { v: 'err', l: 'Crítico (vermelho, exige ação)' }], valor: 'warn' })}
${camposComuns(ui, r0)}</div></form>`;
  let criada = null;
  const ok = await ui.modal({ titulo: 'Nova regra de alerta', sub: 'Quando o indicador cruzar o limite, o alerta entra no feed e vai para os canais escolhidos.', corpo, confirmar: 'Criar regra', largura: 'lg',
    onAbrir: box => {
      const f = box.querySelector('form'); const prev = box.querySelector('[data-prev] span');
      f.addEventListener('input', () => { const d = ui.form.ler(f); if (!d.metrica) return; const quem = (d.destinatarios || []).map(pessoaNome).map(fmt.primeiro); prev.textContent = `Quando: ${condicao({ metrica: d.metrica, op: d.op, params: { valor: d.valor ?? '…' } })} → avisar ${lista(quem.concat(d.resp ? ['o responsável'] : [])) || 'ninguém'} por ${lista((d.canais || []).map(c => CANAIS.find(x => x[0] === c)[1])) || '—'}.`; });
    },
    onConfirmar: box => {
      const v = ui.form.validar(box.querySelector('form'), { nome: ['obrigatorio', 'min:4', x => (db.find('alertRules', y => fmt.norm(y.nome) === fmt.norm(x)) ? 'Já existe uma regra com este nome.' : '')], valor: ['obrigatorio', x => (x == null || isNaN(x) ? 'Informe um número.' : '')], ...regrasComuns });
      if (!v.ok) return false;
      const d = v.dados; const m = METRICAS.find(x => x.id === d.metrica);
      criada = db.insert('alertRules', { nome: d.nome.trim(), custom: true, metrica: d.metrica, op: d.op, params: { valor: Number(d.valor) }, area: m ? m.area : 'Clientes', gravidade: d.gravidade, canais: d.canais, destinatarios: d.destinatarios, resp: !!d.resp, ativo: !!d.ativo, disparos30: 0, ultimoDisparo: null }, { log: `criou a regra de alerta "${d.nome.trim()}"` });
      return true;
    } });
  if (ok && criada) ui.toast(`Regra "${criada.nome}" criada.`, { desfazer: () => db.remove('alertRules', criada.id), acao: { rotulo: 'Testar', fn: () => testarRegra(criada.id, ctx) } });
}

function testarRegra(id, ctx) {
  const r = db.get('alertRules', id); if (!r) return;
  const users = (r.destinatarios || []).map(t => (db.get('team', t) || {}).userId).filter(Boolean);
  ctx.notify.enviar({ para: users, tipo: 'alerta', titulo: `[Teste] ${REGRA_EQUIPE[r.id] || r.nome}`, texto: `Teste da regra: ${condicao(r, true)}. Nenhuma ação é necessária.`, link: '#/alertas/regras', refCol: 'alertRules', refId: id, canais: ['app'] });
  db.update('alertRules', id, { ultimoTeste: new Date().toISOString() }, { log: `testou a regra de alerta "${r.nome}"` });
  const nomes = (r.destinatarios || []).map(pessoaNome).map(fmt.primeiro);
  ctx.ui.toast(`Teste enviado para ${lista(nomes)} por ${lista((r.canais || []).map(c => (CANAIS.find(x => x[0] === c) || [c, c])[1]))} (externos simulados).`, { tipo: 'info' });
}

async function atribuir(id, ctx) {
  const { ui } = ctx; const a = db.get('alerts', id); if (!a) return;
  const pes = pessoasOpcoes();
  const sug = a.atribuidoA || (a.para || []).find(t => t !== (ctx.user && ctx.user.teamId)) || '';
  const corpo = `<form class="stack" novalidate>${ui.campo({ nome: 'pessoa', rotulo: 'Atribuir a', tipo: 'select', obrigatorio: true, placeholder: 'Escolha a pessoa…', opcoes: pes.map(t => ({ v: t.id, l: `${t.nome} · ${t.cargo}` })), valor: sug })}
${ui.campo({ nome: 'msg', rotulo: 'Mensagem (opcional)', tipo: 'textarea', linhas: 3, placeholder: 'Ex.: Consegue resolver ainda hoje? Me avisa quando terminar.' })}
<p class="sm mut">A pessoa recebe uma notificação com o link para o alerta.</p></form>`;
  const antes = { atribuidoA: a.atribuidoA || null };
  let quem = null;
  const ok = await ui.modal({ titulo: 'Atribuir alerta', sub: a.titulo, corpo, confirmar: 'Atribuir e avisar', largura: 'sm',
    onConfirmar: box => {
      const v = ui.form.validar(box.querySelector('form'), { pessoa: 'obrigatorio' }); if (!v.ok) return false;
      quem = db.get('team', v.dados.pessoa);
      db.update('alerts', id, { atribuidoA: quem.id, atribuidoEm: new Date().toISOString() }, { log: `atribuiu o alerta "${a.titulo}" a ${quem.nome}` });
      const me = ctx.real || ctx.user;
      if (quem.userId) ctx.notify.enviar({ para: [quem.userId], tipo: 'atribuicao', prioridade: a.gravidade === 'err' ? 'alta' : 'normal', titulo: `${me ? fmt.primeiro(me.nome) : 'Alguém'} atribuiu a você: ${a.titulo}`, texto: v.dados.msg || a.detalhe, link: `#/alertas?alerta=${id}`, refCol: 'alerts', refId: id });
      return true;
    } });
  if (ok && quem) ui.toast(`Alerta atribuído a ${quem.nome}. ${fmt.primeiro(quem.nome)} foi avisado(a).`, { desfazer: () => db.update('alerts', id, antes) });
}

function adiar(btn, id, ctx) {
  const { ui } = ctx; const a = db.get('alerts', id); if (!a) return;
  const amanha = new Date(); amanha.setDate(amanha.getDate() + 1); amanha.setHours(8, 0, 0, 0);
  const ops = [['1h', 'Por 1 hora', new Date(Date.now() + 36e5)], ['amanha', 'Até amanhã, 08:00', amanha], ['semana', 'Por 1 semana', new Date(Date.now() + 7 * 864e5)]];
  const r = btn.getBoundingClientRect(); if (r.bottom + 170 > innerHeight) window.scrollBy(0, r.bottom + 170 - innerHeight);
  const pop = ui.popover(btn, `<div class="m-alertas-pop" role="menu" aria-label="Adiar alerta">${ops.map(([k, l, d]) => `<button type="button" role="menuitem" data-ate="${d.toISOString()}"><span>${l}</span><small>${fmt.dataCurta(d)} ${fmt.hora(d)}</small></button>`).join('')}</div>`, { largura: 240, alinhar: 'start' });
  const f = pop.el.querySelector('button'); f && f.focus();
  pop.el.addEventListener('click', e => {
    const b = e.target.closest('[data-ate]'); if (!b) return;
    pop.fechar();
    const antes = { status: a.status, adiadoAte: a.adiadoAte || null };
    db.update('alerts', id, { status: 'adiado', adiadoAte: b.dataset.ate }, { log: `adiou o alerta "${a.titulo}"` });
    ui.toast(`Alerta adiado até ${fmt.dataCurta(b.dataset.ate)} ${fmt.hora(b.dataset.ate)}. Ele volta ao feed sozinho.`, { desfazer: () => db.update('alerts', id, antes) });
  });
}

function resolver(id, ctx) {
  const a = db.get('alerts', id); if (!a) return;
  const me = ctx.real || ctx.user;
  const antes = { status: a.status, resolvido: !!a.resolvido, resolvidoEm: a.resolvidoEm || null, resolvidoPor: a.resolvidoPor || null };
  db.update('alerts', id, { status: 'resolvido', resolvido: true, resolvidoEm: new Date().toISOString(), resolvidoPor: me ? me.nome : '' }, { log: `resolveu o alerta "${a.titulo}"` });
  if (a.atribuidoA) { const t = db.get('team', a.atribuidoA); if (t && t.userId && (!me || t.userId !== me.id)) ctx.notify.enviar({ para: [t.userId], tipo: 'sistema', titulo: `Alerta resolvido: ${a.titulo}`, texto: `Marcado como resolvido por ${me ? me.nome : 'alguém'}.`, link: `#/alertas?alerta=${id}` }); }
  ctx.ui.toast(`"${a.titulo}" resolvido.`, { desfazer: () => db.update('alerts', id, antes) });
}

/* reabre adiados vencidos (a luz mestra lê o status gravado) */
function reabrirVencidos() {
  try { db.list('alerts', a => a.status === 'adiado' && a.adiadoAte && new Date(a.adiadoAte) <= new Date()).forEach(a => db.update('alerts', a.id, { status: 'aberto', adiadoAte: null })); } catch (e) { /* db ainda não pronto */ }
}
if (typeof window !== 'undefined') setInterval(reabrirVencidos, 30000);

export default {
  id: 'alertas',
  titulo: 'Alertas e Insights',
  icone: 'bell-ring',
  grupo: 'sistema',
  rota: 'alertas',
  routes: ['alertas', 'alertas/regras'],
  watch: ['alerts', 'alertRules', 'insights', 'integrations', 'team'],
  contador() {
    const n = db.count('alerts', a => statusEf(a) === 'aberto' && a.gravidade === 'err');
    return n ? { n, estado: 'err', rotulo: fmt.plural(n, 'alerta crítico aberto', 'alertas críticos abertos') } : null;
  },
  busca(q) {
    return db.list('alerts').map(alertaEquipe).filter(a => a && statusEf(a) !== 'resolvido' && (fmt.norm(a.titulo).includes(q) || fmt.norm(a.detalhe).includes(q) || fmt.norm(a.area).includes(q)))
      .map(a => ({ tipo: 'Alertas', titulo: a.titulo, sub: `${GRAV[a.gravidade] || ''} · ${a.area}`, href: `#/alertas?alerta=${a.id}`, led: a.gravidade, icone: 'bell-ring' }));
  },
  render(ctx) {
    reabrirVencidos();
    return ctx.path === 'alertas/regras' ? paginaRegras(ctx) : paginaFeed(ctx);
  },
  mount(el, ctx) {
    const onClick = e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const d = b.dataset;
      if (d.resolver) resolver(d.resolver, ctx);
      else if (d.reabrir) { const a = db.get('alerts', d.reabrir); db.update('alerts', d.reabrir, { status: 'aberto', resolvido: false, adiadoAte: null }, { log: `reabriu o alerta "${a.titulo}"` }); ctx.ui.toast('Alerta reaberto.', { tipo: 'info' }); }
      else if (d.atribuir) atribuir(d.atribuir, ctx);
      else if (d.incidente) invasao.abrirIncidente(d.incidente);
      else if (d.segAssumir) { const a = invasao.assumir(d.segAssumir); if (a) ctx.ui.toast(`Você assumiu o incidente de ${a.incidente.contaNome}. A sirene parou para todos.`, { tipo: 'ok' }); }
      else if ('segEditar' in d) editarGuardiao(ctx);
      else if ('segTestar' in d) { sirene.testar(); ctx.ui.toast('Toque de teste da sirene (só neste aparelho).', { tipo: 'info' }); }
      else if (d.adiar) adiar(b, d.adiar, ctx);
      else if (d.dispensar) { db.update('insights', d.dispensar, { dispensado: true }, { log: 'dispensou um insight' }); ctx.ui.toast('Insight dispensado.', { desfazer: () => db.update('insights', d.dispensar, { dispensado: false }) }); }
      else if (d.rgAtivo) { const r = db.get('alertRules', d.rgAtivo); db.update('alertRules', r.id, { ativo: !r.ativo }, { log: `${r.ativo ? 'desativou' : 'ativou'} a regra "${r.nome}"` }); ctx.ui.toast(`Regra "${r.nome}" ${r.ativo ? 'desativada' : 'ativada'}.`, { desfazer: () => db.update('alertRules', r.id, { ativo: r.ativo }) }); }
      else if (d.rgCanal) {
        const r = db.get('alertRules', d.rgCanal); const c = d.canal; const on = (r.canais || []).includes(c);
        if (on && r.canais.length === 1) { ctx.ui.toast('A regra precisa de pelo menos um canal.', { tipo: 'warn' }); return; }
        const canais = on ? r.canais.filter(x => x !== c) : [...(r.canais || []), c];
        db.update('alertRules', r.id, { canais }, { log: `alterou os canais da regra "${r.nome}"` });
        ctx.ui.toast(`${(CANAIS.find(x => x[0] === c) || [])[1]} ${on ? 'desligado' : 'ligado'} em "${r.nome}".`, { desfazer: () => db.update('alertRules', r.id, { canais: r.canais }) });
      } else if (d.rgTestar) testarRegra(d.rgTestar, ctx);
      else if (d.rgEditar) editarRegra(d.rgEditar, ctx);
      else if ('rgNova' in d) novaRegra(ctx);
    };
    const onChange = e => { const s = e.target.closest('[data-area]'); if (s) ctx.router.setQuery({ area: s.value || null }, { render: true }); };
    el.addEventListener('click', onClick); el.addEventListener('change', onChange);
    let t = null;
    if (ctx.query.incidente) { const id = ctx.query.incidente; ctx.router.setQuery({ incidente: null }); setTimeout(() => invasao.abrirIncidente(id), 60); }
    if (ctx.query.alerta) t = setTimeout(() => { const x = el.querySelector('.is-foco'); if (x) x.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 80);
    return () => { el.removeEventListener('click', onClick); el.removeEventListener('change', onChange); clearTimeout(t); };
  },
};

/* ---------------- Guardião de segurança: regra "Possível invasão (pausa automática)" ----------------
   Limites em settings 'guardiaoRegras' (os mesmos que o motor Guardiao, a Torre e a Edge Function guardiao leem). */
const SEV_EST = { critica: 'err', alta: 'warn', media: 'info' };
const valorTxt = p => `${p.unidade === 'R$' ? 'R$ ' : ''}${fmt.num ? fmt.num(p.valor) : p.valor}${p.unidade === '%' ? '%' : p.unidade === '×' ? '×' : p.unidade === 'min' ? ' min' : p.unidade === 'h' ? 'h' : ''}`;
function cardGuardiao(ctx) {
  const { ui } = ctx; const pode = ctx.can('alertas', 'editar') && ['dono', 'admin'].includes((ctx.real || ctx.user || {}).papel);
  const rs = Guardiao.regras(db.config('guardiaoRegras', {}) || {}); const ag = rs.find(r => r.id === 'agregacao'); const det = rs.filter(r => r.id !== 'agregacao');
  const ativas = det.filter(r => r.ativo).length;
  const inc = db.list('alerts', a => a.tipo === 'invasao' && a.incidente);
  const lis = det.map(r => `<li class="${r.ativo ? '' : 'is-off'}"><span class="m-alertas-g s-${SEV_EST[r.severidade]}">${Guardiao.ROTULO_SEV[r.severidade]}</span><span><b>${fmt.esc(r.nome)}</b>${r.params.length && veReceita() ? `<small>${r.params.map(p => `${fmt.esc(p.rotulo)} ${valorTxt(p)}`).join(' · ')}</small>` : ''}</span>${r.ativo ? '' : '<span class="mut sm">desligada</span>'}</li>`).join('');
  const corpo = `<div class="m-alertas-seg">
<div class="m-alertas-seg-h"><span class="m-alertas-seg-ic">${ui.ic('shield')}</span><div><h3>Possível invasão (pausa automática)</h3><p>Qualquer regra crítica, ou ${ag.params[0].valor} regras altas diferentes em ${ag.params[1].valor} min, viram incidente SUPREMO: <b>todas as campanhas ativas da conta são pausadas na hora</b> (nunca excluídas), a conta entra em quarentena e todos os gestores de tráfego, o dono e os admins recebem o alerta com sirene ao mesmo tempo, por app, WhatsApp e e-mail.</p>
<p class="mut sm">Esta pausa automática é a única alteração feita sem a confirmação "SIM" — autorizada pelo dono. Liberar a conta exige Dono/Admin, SIM e checklist de segurança.</p></div></div>
<p class="m-alertas-rg-s">${ui.led(ativas === det.length ? 'ok' : 'warn', `${ativas} de ${det.length} sinais ativos`)} · ${fmt.plural(inc.length, 'incidente', 'incidentes')} registrado${inc.length === 1 ? '' : 's'} · verificação a cada 2 min (rotina Guardião de segurança)</p>
<ul class="m-alertas-segl">${lis}</ul></div>`;
  const acoes = `${ui.btn({ rotulo: 'Testar sirene', icone: 'bell-ring', sm: true, tipo: 'ghost', attrs: { 'data-seg-testar': '' } })}${ui.btn({ rotulo: 'Editar limites', icone: 'sliders', sm: true, attrs: { 'data-seg-editar': '' }, disabled: !pode, title: pode ? undefined : 'Só Dono ou Admin ajustam os limites do Guardião.' })}`;
  return ui.card({ titulo: 'Segurança das contas Meta', sub: 'Guardião de segurança — detecção de possível invasão', acoes, corpo, cls: 'm-alertas-segc' });
}
async function editarGuardiao(ctx) {
  const { ui } = ctx;
  const ov = db.config('guardiaoRegras', {}) || {};
  const rs = Guardiao.regras(ov);
  const campo = (r, p) => `<label class="m-alertas-segf"><span>${fmt.esc(p.rotulo)}${p.ajuda ? ` <small class="mut">(${fmt.esc(p.ajuda)})</small>` : ''}</span><span class="m-alertas-segv"><input type="number" inputmode="decimal" name="${r.id}:${p.chave}" value="${p.valor}" min="${p.min}" max="${p.max}" step="${p.passo}" aria-label="${fmt.esc(r.nome + ' — ' + p.rotulo)}"><em>${fmt.esc(p.unidade)}</em></span><small class="m-alertas-segerr t-err" data-err="${r.id}:${p.chave}"></small></label>`;
  const corpo = `<form class="stack m-alertas-sege" novalidate>${rs.map(r => `<fieldset><legend>${r.id === 'agregacao' ? '' : `<label class="m-alertas-segon"><input type="checkbox" name="${r.id}:ativo" ${r.ativo ? 'checked' : ''}>`}<b>${fmt.esc(r.nome)}</b>${r.id === 'agregacao' ? '' : `</label><select name="${r.id}:severidade" aria-label="Severidade de ${fmt.esc(r.nome)}">${Guardiao.SEVERIDADES.map(v => `<option value="${v}" ${v === r.severidade ? 'selected' : ''}>${Guardiao.ROTULO_SEV[v]}</option>`).join('')}</select>`}</legend><p class="mut sm">${fmt.esc(r.descricao)}</p>${r.params.length ? `<div class="m-alertas-segp">${r.params.map(p => campo(r, p)).join('')}</div>` : ''}</fieldset>`).join('')}</form>`;
  await ui.modal({
    titulo: 'Limites do Guardião de segurança', sub: 'Valem para a Torre (demonstração) e para a verificação a cada 2 min em produção.', corpo, largura: 'lg', confirmar: 'Salvar limites',
    onConfirmar: box => {
      const novo = {}; let erro = false;
      box.querySelectorAll('[data-err]').forEach(x => { x.textContent = ''; });
      rs.forEach(r => {
        const o = {}; const params = {};
        r.params.forEach(p => { const v = Number(box.querySelector(`[name="${r.id}:${p.chave}"]`).value.replace(',', '.')); params[p.chave] = v; });
        const v = Guardiao.validar(r.id, params);
        if (!v.ok) { erro = true; Object.entries(v.erros).forEach(([k, m]) => { const e = box.querySelector(`[data-err="${r.id}:${k}"]`); if (e) e.textContent = m; }); }
        const pad = Guardiao.regras({}).find(x => x.id === r.id);
        const dif = Object.fromEntries(Object.entries(params).filter(([k, x]) => pad.params.find(p => p.chave === k).valor !== x));
        if (Object.keys(dif).length) o.params = dif;
        const at = box.querySelector(`[name="${r.id}:ativo"]`); if (at && at.checked !== pad.ativo) o.ativo = at.checked;
        const sv = box.querySelector(`[name="${r.id}:severidade"]`); if (sv && sv.value !== pad.severidade) o.severidade = sv.value;
        if (Object.keys(o).length) novo[r.id] = o;
      });
      if (erro) return 'Corrija os valores destacados.';
      db.setConfig('guardiaoRegras', novo);
      db.insert('activity', { quem: (ctx.real || ctx.user || {}).id, quemNome: (ctx.real || ctx.user || {}).nome, oque: 'alterou os limites do Guardião de segurança', col: 'settings', refId: 'guardiaoRegras', quando: new Date().toISOString() });
      ui.toast('Limites do Guardião salvos. A Torre já usa os novos valores.', { tipo: 'ok', desfazer: () => db.setConfig('guardiaoRegras', ov) });
      return true;
    },
  });
}
