// Torre de Controle › Rotinas e integrações (docs/spec-dono.md §4) + Painel de Voo nativo (voo.js, item 17).
import './data.js';
import { db } from '../../core/store.js';
import * as fmtc from '../../core/fmt.js';
import { perms } from '../../core/perms.js';
import { renderVoo, mountVoo, buscaVoo } from './voo.js';
import { ROT_ESTADO, rodando, onRodando, rodar, pausar, retomar, reconectar, testar, falhasTorre } from './engine.js';

// rotinas de dinheiro que entra (MRR, conciliação de recebimentos, cobrança): só quem vê receita
const ROT_RECEITA = new Set(['r-mrr', 'r-conciliacao', 'r-cobranca']);
const rotVisivel = r => !!r && (perms.veReceita() || !(ROT_RECEITA.has(r.id) || r.receita));
const ORDEM_EST = { err: 0, warn: 1, ok: 2, off: 3 };
const FILTROS = [{ id: 'todas', rotulo: 'Todas' }, { id: 'err', rotulo: 'Falhou', estado: 'err' }, { id: 'warn', rotulo: 'Atenção', estado: 'warn' }, { id: 'ok', rotulo: 'Operando', estado: 'ok' }, { id: 'off', rotulo: 'Pausadas', estado: 'off' }];
const FREQS = [['2', 'A cada 2 min'], ['5', 'A cada 5 min'], ['15', 'A cada 15 min'], ['30', 'A cada 30 min'], ['60', 'A cada hora'], ['1440', 'Diária'], ['10080', 'Semanal'], ['43200', 'Mensal']];
const CANAIS = [['app', 'App'], ['whatsapp', 'WhatsApp'], ['slack', 'Slack'], ['email', 'E-mail']];
const SEM_PERM = 'Seu acesso à Torre é só de leitura. Peça a um administrador.';
let ultimaVerif = Date.now() - 20000; // "atualizado há 20 s"

const dur = s => (s == null ? '' : s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1).replace('.', ',')} h`);
const sucEstado = v => (v == null ? 'off' : v >= 98 ? 'ok' : v >= 90 ? 'warn' : 'err');
const ordenar = l => l.sort((a, b) => (ORDEM_EST[a.estado] ?? 9) - (ORDEM_EST[b.estado] ?? 9));
const ontemIso = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d; };
const mesmoDia = (iso, d) => { const x = new Date(iso); return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate(); };

function ultimaHtml(r, ctx) {
  const { ui } = ctx;
  if (rodando.has(r.id)) return '<span class="m-torre-run-t">rodando agora…</span>';
  if (!r.ultimaEm) return '<span class="mut">ainda não rodou</span>';
  return r.ultimaRotulo ? ctx.fmt.esc(r.ultimaRotulo) : `${ui.rel(r.ultimaEm)} · ${dur(r.duracaoS)}${r.estado === 'err' ? ' · falhou' : ''}`;
}
function proximaHtml(r, ctx) {
  if (r.estado === 'off') return '<span class="mut">—</span>';
  if (r.proximaRotulo) return ctx.fmt.esc(r.proximaRotulo);
  return r.proximaEm ? ctx.ui.rel(r.proximaEm) : '—';
}
function acoesRotina(r, ctx, o = {}) {
  const { ui } = ctx; const pode = ctx.can('torre', 'editar'); const run = rodando.has(r.id);
  const dis = pode ? {} : { title: SEM_PERM, disabled: true };
  const log = o.semLog ? '' : ui.btn({ rotulo: 'Ver log', href: `#/torre/rotina/${r.id}`, sm: true, tipo: 'ghost', icone: 'list' });
  const princ = r.estado === 'off'
    ? ui.btn({ rotulo: 'Retomar', icone: 'play', sm: !o.grande, tipo: o.grande ? 'pri' : undefined, attrs: { 'data-retomar': r.id }, ...dis })
    : ui.btn({ rotulo: run ? 'Rodando…' : 'Rodar agora', icone: run ? 'refresh' : 'play', sm: !o.grande, tipo: o.grande ? 'pri' : undefined, attrs: { 'data-rodar': r.id }, disabled: run || !pode, title: pode ? undefined : SEM_PERM, cls: run ? 'm-torre-spin' : '' });
  const pausa = r.estado !== 'off' ? (o.grande ? ui.btn({ rotulo: 'Pausar', icone: 'pause', attrs: { 'data-pausar': r.id }, ...dis }) : `<button type="button" class="ib m-torre-ib" aria-label="Pausar ${ctx.fmt.esc(r.nome)}" title="${pode ? 'Pausar rotina' : SEM_PERM}" data-pausar="${ctx.fmt.esc(r.id)}"${pode ? '' : ' disabled'}>${ui.ic('pause')}</button>`) : '';
  return o.grande ? `${pausa}${princ}` : `${log}${princ}${pausa}`;
}

function linhaRotina(r, ctx) {
  const { ui, fmt, charts } = ctx; const run = rodando.has(r.id);
  const resp = ctx.db.get('team', r.respId);
  const st = run ? '<span class="m-torre-spinner" role="img" aria-label="Rodando"></span>' : ui.led(r.estado, false);
  const rot = run ? 'Rodando…' : ROT_ESTADO[r.estado];
  const msg = r.erro ? `<p class="m-torre-e">${ui.ic('alert-circle')}<span>${fmt.esc(r.erro)}</span></p>` : (r.aviso && r.estado === 'warn' ? `<p class="m-torre-w">${ui.ic('alert')}<span>${fmt.esc(r.aviso)}</span></p>` : (r.estado === 'off' && r.pausadaPor ? `<p class="m-torre-p">Pausada por ${fmt.esc(r.pausadaPor)} ${ui.rel(r.pausadaEm)}${r.motivoPausa ? ` · ${fmt.esc(r.motivoPausa)}` : ''}</p>` : ''));
  const h30 = r.hist30 && r.hist30.length ? charts.historico30(r.hist30) : '<span class="sm mut">Sem histórico ainda</span>';
  return `<li class="m-torre-r s-${r.estado}${run ? ' is-run' : ''}" data-rot="${fmt.esc(r.id)}">
<div class="m-torre-c m-torre-nome"><span class="m-torre-led">${st}</span><div class="m-torre-nt">
<div class="m-torre-l1"><a class="m-torre-n" href="#/torre/rotina/${fmt.esc(r.id)}">${fmt.esc(r.nome)}</a><span class="m-torre-st s-${run ? 'run' : r.estado}">${rot}</span></div>
<p class="m-torre-d">${fmt.esc(r.desc)}</p>${msg}</div></div>
<div class="m-torre-c m-torre-ex"><div><span class="m-torre-k">Última</span><span class="num">${ultimaHtml(r, ctx)}</span></div><div><span class="m-torre-k">Próxima</span><span class="num">${proximaHtml(r, ctx)}</span></div></div>
<div class="m-torre-c m-torre-suc"><span class="m-torre-k">Sucesso 30d</span>${r.sucesso30 == null ? '<span class="mut">—</span>' : ui.selo(sucEstado(r.sucesso30), fmt.pct(r.sucesso30, 1).replace(',0%', '%'))}</div>
<div class="m-torre-c m-torre-h"><span class="m-torre-k">Histórico 30 dias</span>${h30}</div>
<div class="m-torre-c m-torre-rs">${resp ? ui.avatar(resp, 26) : ''}<div><span class="m-torre-k">Resp. · frequência</span><span class="m-torre-fq">${fmt.esc(r.freq)}</span></div></div>
<div class="m-torre-c m-torre-ac">${acoesRotina(r, ctx)}</div>
</li>`;
}

function resumo(rotinas, ctx) {
  const { ui, fmt } = ctx;
  const n = e => rotinas.filter(r => r.estado === e).length;
  const tot = rotinas.length || 1;
  const it = [['ok', 'Operando'], ['warn', 'Atenção'], ['err', 'Falhou'], ['off', 'Pausadas']];
  const f = ctx.query.f || 'todas';
  return `<section class="card m-torre-sum" aria-label="Resumo das rotinas">
<div class="m-torre-sum-g">${it.map(([e, l]) => `<a class="m-torre-sum-i s-${e}${f === e ? ' on' : ''}" href="${fmt.esc(ctx.router.href(null, { f: f === e ? null : e }))}" aria-label="${n(e)} ${l.toLowerCase()} — filtrar"><span class="m-torre-sum-h">${ui.led(e, false)}<span>${l}</span></span><b class="num">${n(e)}</b></a>`).join('')}
<div class="m-torre-sum-t"><span class="m-torre-sum-h"><span>Total de rotinas</span>${ui.ajuda('Operando = última execução ok. Atenção = atrasada, lenta ou com pendência. Falhou = última execução com erro (exige ação). Pausada = desligada por alguém.')}</span><b class="num">${rotinas.length}</b></div></div>
<div class="m-torre-sum-bar" aria-hidden="true">${it.map(([e]) => `<i class="s-${e}" style="flex:${n(e) / tot}"></i>`).join('')}</div>
</section>`;
}

function integracoes(ctx) {
  const { ui, fmt, db } = ctx; const pode = ctx.can('torre', 'editar');
  const l = db.list('integrations').sort((a, b) => (ORDEM_EST[a.estado] ?? 9) - (ORDEM_EST[b.estado] ?? 9));
  const rots = db.list('routines').filter(rotVisivel);
  const cards = l.map(i => {
    const usa = rots.filter(r => (r.integracoes || []).includes(i.id));
    const precisa = i.estado === 'err' || i.estado === 'warn';
    const expira = '';
    return `<article class="m-torre-int s-${i.estado}" data-int="${fmt.esc(i.id)}">
<header><span class="m-torre-int-ic">${ui.ic(i.icone || 'link')}</span><div class="m-torre-int-t"><h3>${fmt.esc(i.nome)}</h3>${ui.led(i.estado, `${i.status}${expira}`)}</div></header>
<p class="m-torre-int-d">${fmt.esc(i.detalhe)}${i.estado === 'warn' && i.expiraEm ? ` · vence em ${fmt.data(i.expiraEm)}` : ''}</p>
<p class="m-torre-int-m"><span>${fmt.esc(i.conta)}</span><span>Sincronizou ${ui.rel(i.ultimaSync)}${usa.length ? ` · ${usa.length} ${usa.length === 1 ? 'rotina' : 'rotinas'}` : ''}</span></p>
<footer>${ui.btn({ rotulo: 'Reconectar', icone: 'refresh', sm: true, tipo: precisa ? 'pri' : 'ghost', attrs: { 'data-reconectar': i.id, 'aria-label': `Reconectar ${i.nome}` }, disabled: !pode, title: pode ? undefined : SEM_PERM })}${ui.btn({ rotulo: 'Testar', icone: 'zap', sm: true, tipo: 'ghost', attrs: { 'data-testar': i.id, 'aria-label': `Testar conexão com ${i.nome}` } })}</footer>
</article>`;
  }).join('');
  const nErr = l.filter(i => i.estado === 'err').length, nWarn = l.filter(i => i.estado === 'warn').length;
  return ui.card({ titulo: 'Integrações', id: 'integracoes', sub: `${l.length} conexões · ${nErr ? `${nErr} com falha` : 'nenhuma falha'}${nWarn ? ` · ${nWarn} em atenção` : ''}`, ajuda: 'Contas externas que as rotinas usam. Os tokens ficam guardados no servidor (nunca no navegador). Reconectar abre o login do provedor.', corpo: `<div class="m-torre-ints">${cards}</div>` });
}

function linhaTempo(ctx) {
  const { db, fmt, ui } = ctx;
  const d = ontemIso();
  const runs = db.list('routineRuns', x => mesmoDia(x.inicio, d) && (x.tl || x.manual) && rotVisivel(db.get('routines', x.rotinaId)));
  const porRot = new Map();
  runs.forEach(x => { if (!porRot.has(x.rotinaId)) porRot.set(x.rotinaId, []); porRot.get(x.rotinaId).push(x); });
  const ordem = db.list('routines').map(r => r.id);
  const lanes = [...porRot.keys()].sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));
  if (!lanes.length) return ui.card({ titulo: 'Execuções de ontem', corpo: ui.vazio({ icone: 'clock', titulo: 'Nenhuma execução registrada ontem', texto: 'Quando as rotinas rodarem, cada execução aparece aqui como um ponto na linha do tempo.', compacto: true }) });
  const pos = iso => { const x = new Date(iso); return ((x.getHours() * 60 + x.getMinutes()) / 1440) * 100; };
  const marcas = [0, 3, 6, 9, 12, 15, 18, 21, 24];
  const eixo = `<div class="m-torre-tl-ax" aria-hidden="true">${marcas.map(h => `<span style="left:${(h / 24) * 100}%"${h % 6 ? ' class="m-torre-tl-mn"' : ''}>${String(h).padStart(2, '0')}h</span>`).join('')}</div>`;
  const grade = `<div class="m-torre-tl-gr" aria-hidden="true">${marcas.map(h => `<i style="left:${(h / 24) * 100}%"></i>`).join('')}</div>`;
  const linhas = lanes.map(id => {
    const r = db.get('routines', id); const l = porRot.get(id).sort((a, b) => a.inicio.localeCompare(b.inicio));
    const ruins = l.filter(x => x.estado !== 'ok');
    const resumoTxt = `${l.length} ${l.length === 1 ? 'execução' : 'execuções'}${ruins.length ? ` · ${ruins.filter(x => x.estado === 'err').length ? `${ruins.filter(x => x.estado === 'err').length} falha(s)` : ''}${ruins.filter(x => x.estado === 'warn').length ? `${ruins.filter(x => x.estado === 'err').length ? ', ' : ''}${ruins.filter(x => x.estado === 'warn').length} em atenção` : ''}` : ' · todas ok'}`;
    return `<div class="m-torre-tl-l"><a class="m-torre-tl-n" href="#/torre/rotina/${fmt.esc(id)}"><b>${fmt.esc(r ? r.nome : id)}</b><small>${fmt.esc(resumoTxt)}</small></a>
<div class="m-torre-tl-tr" role="img" aria-label="${fmt.esc(`${r ? r.nome : id}: ${resumoTxt}`)}">${grade}${l.map(x => `<i class="m-torre-dot s-${x.estado}" style="left:${pos(x.inicio).toFixed(2)}%" data-tip="${fmt.esc(`${fmt.hora(x.inicio)} · ${ROT_ESTADO[x.estado] || x.estado}\n${x.msg}${x.detalhe ? '\n' + x.detalhe : ''}`)}"></i>`).join('')}</div></div>`;
  }).join('');
  return ui.card({ titulo: 'Execuções de ontem', sub: `${fmt.diaSemana(d)}, ${fmt.data(d)} · 00h–24h · cada ponto é uma execução`, ajuda: 'Uma linha por rotina. Verde = ok, âmbar = atenção (lenta/atrasada), vermelho = falhou. Passe o mouse sobre um ponto para ver o horário e o resultado.',
    acoes: `<span class="m-torre-lg">${ui.selo('ok', 'Ok')}${ui.selo('warn', 'Atenção')}${ui.selo('err', 'Falhou')}</span>`,
    corpo: `<div class="m-torre-tl">${eixo}${linhas}</div>` });
}

function paginaRotinas(ctx) {
  const { ui, db, fmt } = ctx;
  const todas = ordenar(db.list('routines', r => r.ativo !== false).filter(rotVisivel));
  const f = FILTROS.some(x => x.id === ctx.query.f) ? ctx.query.f : 'todas';
  const lista = f === 'todas' ? todas : todas.filter(r => r.estado === f);
  const pode = ctx.can('torre', 'editar');
  const integs = db.list('integrations');
  const geral = todas.some(r => r.estado === 'err') || integs.some(i => i.estado === 'err') ? 'err' : todas.some(r => r.estado === 'warn') || integs.some(i => i.estado === 'warn') ? 'warn' : 'ok';
  const seg = Math.max(0, Math.round((Date.now() - ultimaVerif) / 1000));
  const meta = `${ui.led(geral, { ok: 'Tudo operando', warn: 'Há pontos de atenção', err: 'Há falhas que exigem ação' }[geral])}<span class="m-torre-upd" aria-live="off">atualizado <span data-upd>${seg < 5 ? 'agora' : `há ${seg} s`}</span></span>${ui.ajuda('A Torre verifica todas as rotinas e integrações a cada 30 s nesta tela (a rotina "Torre de Controle" roda a cada 5 min no servidor).')}`;
  const acoes = `${ui.btn({ rotulo: 'Configurar alertas', icone: 'sliders', href: '#/alertas/regras' })}${ui.btn({ rotulo: 'Nova rotina', icone: 'plus', tipo: 'pri', attrs: { 'data-nova-rotina': '' }, disabled: !pode, title: pode ? 'Cadastrar uma nova rotina automática' : SEM_PERM })}`;
  const falha = todas.find(r => r.estado === 'err');
  const avisoFalha = falha ? ui.aviso({ tipo: 'err', titulo: `${falha.nome} falhou${falha.falhas > 1 ? ` ${falha.falhas}×` : ''}. ${falha.guia ? falha.guia.titulo : ''}`, texto: falha.guia ? falha.guia.texto : (falha.erro || ''), acao: `${falha.guia && falha.guia.integ && pode ? ui.btn({ rotulo: 'Reconectar', icone: 'refresh', sm: true, tipo: 'pri', attrs: { 'data-reconectar': falha.guia.integ } }) : ''}${ui.btn({ rotulo: 'Ver log', sm: true, href: `#/torre/rotina/${falha.id}` })}` }) : '';
  const cab = `<div class="m-torre-hd" aria-hidden="true"><span>Rotina</span><span>Última · próxima</span><span>Sucesso 30d ${''}</span><span>Histórico 30 dias</span><span>Resp. · frequência</span><span></span></div>`;
  const corpoLista = lista.length ? `${cab}<ul class="m-torre-rl">${lista.map(r => linhaRotina(r, ctx)).join('')}</ul>`
    : ui.vazio({ icone: 'check-circle', titulo: f === 'err' ? 'Nenhuma rotina com falha' : 'Nenhuma rotina neste filtro', texto: f === 'err' ? 'Tudo rodando. Quando algo falhar, aparece aqui com o que fazer.' : 'Escolha outro filtro para ver as demais rotinas.', acao: { rotulo: 'Ver todas', href: ctx.router.href(null, { f: null }) }, compacto: true });
  const chips = ui.chips(FILTROS.map(x => ({ ...x, n: x.id === 'todas' ? todas.length : todas.filter(r => r.estado === x.id).length })), f, 'f', { rotulo: 'Filtrar rotinas por estado' });
  return `<div class="pg m-torre">
${ui.cabecalho({ titulo: 'Rotinas e integrações', sub: 'Tudo o que roda sozinho na agência — e o que precisa de você.', meta, acoes })}
${avisoFalha}
${resumo(todas, ctx)}
${ui.card({ titulo: 'Rotinas', cls: 'm-torre-rc', sub: 'Falhas primeiro. Sucesso 30d: ≥ 98% ok · 90–97,9% atenção · < 90% falha.', ajuda: 'Sucesso 30d = execuções bem-sucedidas ÷ total de execuções nos últimos 30 dias. O histórico mostra o pior resultado de cada dia (mais antigo à esquerda).', acoes: chips, corpo: corpoLista })}
${integracoes(ctx)}
${linhaTempo(ctx)}
</div>`;
}

/* ---------------- log da rotina ---------------- */
function paginaLog(ctx) {
  const { ui, db, fmt, charts } = ctx;
  const r0 = db.get('routines', ctx.params.id);
  if (r0 && !rotVisivel(r0)) return `<div class="pg">${ui.cabecalho({ titulo: 'Rotina restrita', voltar: { href: '#/torre', rotulo: 'Rotinas e integrações' } })}<div class="card">${ui.vazio({ icone: 'lock', titulo: 'Rotina financeira', texto: 'O log desta rotina mostra valores recebidos e é visível só para administradores. As demais rotinas estão na lista.', acao: { rotulo: 'Ver rotinas', href: '#/torre' } })}</div></div>`;
  const r = r0;
  if (!r) return `<div class="pg">${ui.cabecalho({ titulo: 'Rotina não encontrada', voltar: { href: '#/torre', rotulo: 'Rotinas e integrações' } })}<div class="card">${ui.vazio({ icone: 'search', titulo: 'Esta rotina não existe mais', texto: 'Ela pode ter sido excluída ou o link está incompleto. Volte para a lista e escolha outra.', acao: { rotulo: 'Ver rotinas', href: '#/torre' } })}</div></div>`;
  ctx.migalha('Log da rotina'); // nome completo no título da página (migalha longa estoura o topo em 390 px — bug do core)
  const run = rodando.has(r.id);
  const resp = db.get('team', r.respId);
  const pode = ctx.can('torre', 'editar');
  const f = ['err', 'warn', 'ok'].includes(ctx.query.f) ? ctx.query.f : 'todas';
  const todas = db.list('routineRuns', x => x.rotinaId === r.id).sort((a, b) => b.inicio.localeCompare(a.inicio));
  const runs = (f === 'todas' ? todas : todas.filter(x => x.estado === f)).slice(0, 60);
  const integs = (r.integracoes || []).map(i => db.get('integrations', i)).filter(Boolean);
  const integQuebrada = r.guia && r.guia.integ ? db.get('integrations', r.guia.integ) : null;
  const meta = `${run ? '<span class="led-w"><span class="m-torre-spinner" aria-hidden="true"></span><span>Rodando…</span></span>' : ui.led(r.estado, ROT_ESTADO[r.estado])}<span>${fmt.esc(r.freq)}</span>${resp ? `<span class="row" style="gap:6px">${ui.avatar(resp, 20)}${fmt.esc(resp.nome)}</span>` : ''}`;
  const acoes = `${ctx.notify.botaoNotificar('routines', r.id, r.nome)}${acoesRotina(r, ctx, { grande: true, semLog: true })}`;

  let oque = '';
  if ((r.estado === 'err' || r.estado === 'warn') && r.guia) {
    const btnAcao = integQuebrada && integQuebrada.estado !== 'ok' ? ui.btn({ rotulo: `Reconectar ${integQuebrada.nome}`, icone: 'refresh', tipo: 'pri', attrs: { 'data-reconectar': integQuebrada.id }, disabled: !pode, title: pode ? undefined : SEM_PERM })
      : r.guia.href ? ui.btn({ rotulo: r.guia.rotulo || 'Abrir', href: r.guia.href, icone: 'arrow-right' }) : ui.btn({ rotulo: 'Rodar agora', icone: 'play', tipo: 'pri', attrs: { 'data-rodar': r.id }, disabled: !pode || run });
    oque = `<section class="card m-torre-oq s-${r.estado}"><div class="card-b"><div class="m-torre-oq-i">${ui.ic(r.estado === 'err' ? 'alert-circle' : 'alert')}</div><div class="m-torre-oq-t"><p class="m-torre-oq-k">O que fazer</p><h2>${fmt.esc(r.guia.titulo)}</h2><p>${fmt.esc(r.guia.texto)}</p>${r.erro ? `<p class="m-torre-code"><code>${fmt.esc(r.erro)}</code> · ${r.falhas || 1} ${r.falhas === 1 ? 'falha seguida' : 'falhas seguidas'} · próxima: ${proximaHtml(r, ctx)}</p>` : ''}<div class="row">${btnAcao}</div></div></div></section>`;
  } else if (r.guia && r.guia.integ && integQuebrada && integQuebrada.estado === 'ok' && r.estado === 'ok') {
    oque = ui.aviso({ tipo: 'ok', titulo: 'Resolvido', texto: `${integQuebrada.nome} reconectado ${fmt.rel(integQuebrada.reconectadoEm || integQuebrada.ultimaSync)} e a rotina voltou a rodar normalmente.` });
  }

  const tabela = ui.tabela({
    cols: [
      { k: 'inicio', l: 'Quando', r: x => `<span class="num">${fmt.dataHora(x.inicio)}</span>`, v: x => x.inicio },
      { k: 'estado', l: 'Resultado', r: x => ui.selo(x.estado, ROT_ESTADO[x.estado] === 'Operando' ? 'Ok' : ROT_ESTADO[x.estado]), v: x => ORDEM_EST[x.estado] },
      { k: 'duracaoS', l: 'Duração', num: true, r: x => dur(x.duracaoS) },
      { k: 'msg', l: 'Mensagem', sort: false, r: x => `<span class="${x.estado === 'err' ? 't-err fw6' : ''}">${fmt.esc(x.msg)}</span>${x.detalhe ? `<span class="sub">${fmt.esc(x.detalhe)}</span>` : ''}` },
      { k: 'por', l: 'Origem', r: x => (x.manual ? `Manual · ${fmt.esc(x.por || '')}` : '<span class="mut">Agendada</span>'), mobile: false },
    ],
    linhas: runs, ordem: { k: 'inicio', dir: 'desc' }, legenda: `Log de execuções de ${r.nome}`, rowCls: x => (x.estado === 'err' ? 'm-torre-tr-err' : ''),
    vazio: { titulo: f === 'todas' ? 'Nenhuma execução registrada' : 'Nenhuma execução com este resultado', texto: f === 'todas' ? 'Use "Rodar agora" para fazer a primeira execução.' : 'Mude o filtro para ver as outras execuções.' },
  });
  const chips = ui.chips([{ id: 'todas', rotulo: 'Todas', n: todas.length }, { id: 'err', rotulo: 'Falhas', n: todas.filter(x => x.estado === 'err').length, estado: 'err' }, { id: 'warn', rotulo: 'Atenção', n: todas.filter(x => x.estado === 'warn').length, estado: 'warn' }, { id: 'ok', rotulo: 'Ok', n: todas.filter(x => x.estado === 'ok').length }], f, 'f', { rotulo: 'Filtrar execuções' });
  const canais = (r.canais || []).map(c => (CANAIS.find(x => x[0] === c) || [c, c])[1]).join(', ');
  const detalhes = ui.pares([
    ['Status', run ? 'Rodando…' : ui.led(r.estado, ROT_ESTADO[r.estado])],
    ['Descrição', fmt.esc(r.desc)],
    ['Última execução', ultimaHtml(r, ctx)],
    ['Próxima', proximaHtml(r, ctx)],
    ['Sucesso 30d', r.sucesso30 == null ? '—' : `${ui.selo(sucEstado(r.sucesso30), fmt.pct(r.sucesso30, 1))}`],
    ['Frequência', fmt.esc(r.freq)],
    ['Responsável', resp ? `<span class="row" style="gap:6px">${ui.avatar(resp, 22)}${fmt.esc(resp.nome)}</span>` : '—'],
    ['Integrações', integs.length ? integs.map(i => ui.led(i.estado, i.nome)).join('<br>') : '<span class="mut">Nenhuma</span>'],
    ['Canal de alerta', fmt.esc(canais || 'App')],
  ]);
  return `<div class="pg m-torre">
${ui.cabecalho({ titulo: r.nome, sub: r.desc, voltar: { href: '#/torre', rotulo: 'Rotinas e integrações' }, meta, acoes })}
${oque}
<div class="g-2-1">
${ui.card({ titulo: 'Log de execuções', sub: `Últimas ${runs.length} de ${todas.length} execuções registradas`, acoes: chips, pad: false, corpo: tabela })}
<div class="stack">
${ui.card({ titulo: 'Detalhes', corpo: detalhes })}
${ui.card({ titulo: 'Histórico 30 dias', ajuda: 'Pior resultado de cada dia; o último quadrado é hoje.', corpo: r.hist30 && r.hist30.length ? ctx.charts.historico30(r.hist30) : '<p class="sm mut">Sem histórico ainda.</p>' })}
${ui.card({ titulo: 'Comentários', sub: 'Use @ para chamar alguém do time', corpo: ctx.notify.comentarios('routines', r.id, { titulo: r.nome }) })}
</div></div>
</div>`;
}

/* ---------------- nova rotina ---------------- */
async function novaRotina(ctx) {
  const { ui, db, fmt } = ctx;
  const pessoas = db.list('team', t => t.ativo !== false && t.papel !== 'leitura').map(t => ({ v: t.id, l: t.nome }));
  const integs = db.list('integrations').map(i => ({ v: i.id, l: i.nome }));
  const corpo = `<form class="stack" novalidate><div class="fgrid">
${ui.campo({ nome: 'nome', rotulo: 'Nome da rotina', obrigatorio: true, cls: 'full', placeholder: 'Ex.: Sync de leads TikTok → CRM' })}
${ui.campo({ nome: 'desc', rotulo: 'O que ela faz', tipo: 'textarea', obrigatorio: true, cls: 'full', linhas: 2, placeholder: 'Ex.: Puxa os leads dos formulários e cria contatos no CRM', dica: 'Uma frase que qualquer pessoa da agência entenda.' })}
${ui.campo({ nome: 'freqMin', rotulo: 'Frequência', tipo: 'select', obrigatorio: true, placeholder: 'Escolha…', opcoes: FREQS.map(([v, l]) => ({ v, l })) })}
${ui.campo({ nome: 'horario', rotulo: 'Horário (diária/semanal)', placeholder: '08:00', dica: 'Opcional. Formato hh:mm.', attrs: { inputmode: 'numeric', maxlength: '5' } })}
${ui.campo({ nome: 'respId', rotulo: 'Responsável', tipo: 'select', obrigatorio: true, placeholder: 'Escolha…', opcoes: pessoas, ajuda: 'Quem recebe o alerta quando a rotina falhar e cuida do conserto.' })}
${ui.campo({ nome: 'integ', rotulo: 'Integração usada', tipo: 'select', placeholder: 'Nenhuma', opcoes: integs })}
<fieldset class="fld full m-torre-cn"><legend>Canal de alerta<span class="req" aria-hidden="true">*</span></legend><div class="rd-g">${CANAIS.map(([v, l]) => `<label class="ck"><input type="checkbox" name="canais" value="${v}"${v === 'app' ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>
</div></form>`;
  let criada = null;
  const ok = await ui.modal({ titulo: 'Nova rotina', sub: 'Ela entra na Torre e passa a ser monitorada.', corpo, confirmar: 'Criar rotina', largura: 'md',
    onConfirmar: box => {
      const fEl = box.querySelector('form');
      const r = ui.form.validar(fEl, {
        nome: ['obrigatorio', 'min:3', v => (db.find('routines', x => fmt.norm(x.nome) === fmt.norm(v)) ? 'Já existe uma rotina com este nome.' : '')],
        desc: 'obrigatorio|min:8',
        horario: [v => (!v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? '' : 'Horário inválido. Use hh:mm, ex.: 08:00.')],
        canais: [v => (v && v.length ? '' : 'Escolha pelo menos um canal para o alerta.')],
      });
      if (!r.ok) return false;
      const d = r.dados; const fm = Number(d.freqMin); const fl = (FREQS.find(x => x[0] === String(fm)) || [0, ''])[1];
      const freq = (fl.startsWith('A cada') ? fl.replace('A cada', 'a cada') : fl.toLowerCase()) + (d.horario && fm >= 1440 ? ` · ${d.horario}` : '');
      let prox = new Date(Date.now() + fm * 6e4);
      if (d.horario && fm >= 1440) { const [h, m] = d.horario.split(':').map(Number); prox = new Date(); prox.setHours(h, m, 0, 0); if (prox < new Date()) prox.setDate(prox.getDate() + 1); }
      criada = db.insert('routines', { nome: d.nome.trim(), desc: d.desc.trim(), estado: 'ok', ativo: true, ultimaEm: null, ultimaRotulo: null, proximaEm: prox.toISOString(), proximaRotulo: null, duracaoS: null,
        sucesso30: null, respId: d.respId, freq, freqMin: fm, horario: d.horario || null, hist30: [], integracoes: d.integ ? [d.integ] : [], canais: d.canais, falhas: 0, erro: null }, { log: `criou a rotina "${d.nome.trim()}"` });
      const resp = db.get('team', d.respId);
      if (resp && resp.userId && resp.userId !== (ctx.real && ctx.real.id)) ctx.notify.enviar({ para: [resp.userId], tipo: 'atribuicao', titulo: `Você é responsável pela rotina "${criada.nome}"`, texto: `Criada na Torre de Controle · ${freq}. Você recebe o alerta se ela falhar.`, link: `#/torre/rotina/${criada.id}`, refCol: 'routines', refId: criada.id });
      return true;
    } });
  if (ok && criada) ui.toast(`Rotina "${criada.nome}" criada.`, { desfazer: () => db.remove('routines', criada.id, { log: `desfez a criação de "${criada.nome}"` }), acao: { rotulo: 'Rodar agora', fn: () => rodar(criada.id) } });
}

/* ---------------- módulo ---------------- */
export default {
  id: 'torre',
  titulo: 'Torre de Controle',
  icone: 'radio-tower',
  grupo: 'trafego',
  rota: 'torre',
  routes: ['torre', 'torre/voo', 'torre/voo/:conta', 'torre/rotina/:id'],
  watch: ['routines', 'routineRuns', 'integrations', 'team', 'relatorios', 'clients', 'clientActions', 'recsLog', 'alerts', 'settings'],
  sub: [
    { id: 'rotinas', titulo: 'Rotinas e integrações', rota: 'torre', perm: 'torre' },
    { id: 'voo', titulo: 'Painel de Voo', rota: 'torre/voo', perm: 'torre_voo', prefixo: true },
  ],
  contador() {
    const f = falhasTorre();
    return f.n ? { n: f.n, estado: 'err', rotulo: f.n === 1 ? '1 falha na Torre' : `${f.n} falhas na Torre` } : null;
  },
  busca(q) {
    const N = s => fmtc.norm(s || '');
    const r = db.list('routines', x => rotVisivel(x) && (N(x.nome).includes(q) || N(x.desc).includes(q))).map(x => ({ tipo: 'Rotinas', titulo: x.nome, sub: `${ROT_ESTADO[x.estado]} · ${x.freq}`, href: `#/torre/rotina/${x.id}`, led: x.estado, icone: 'radio-tower' }));
    const i = db.list('integrations', x => N(x.nome).includes(q) || N('integracao').includes(q)).map(x => ({ tipo: 'Integrações', titulo: x.nome, sub: x.status, href: '#/torre', led: x.estado, icone: 'link' }));
    return [...r, ...i, ...buscaVoo(q)];
  },
  render(ctx) {
    if (ctx.path === 'torre/voo' || ctx.path.startsWith('torre/voo/')) return renderVoo(ctx);
    if (ctx.params && ctx.params.id && ctx.path.startsWith('torre/rotina/')) return paginaLog(ctx);
    return paginaRotinas(ctx);
  },
  mount(el, ctx) {
    if (ctx.path === 'torre/voo' || ctx.path.startsWith('torre/voo/')) return mountVoo(el, ctx);
    const onClick = e => {
      const b = e.target.closest('[data-rodar],[data-pausar],[data-retomar],[data-reconectar],[data-testar],[data-nova-rotina]');
      if (!b || b.disabled) return;
      if (b.dataset.rodar) rodar(b.dataset.rodar);
      else if (b.dataset.pausar) pausar(b.dataset.pausar);
      else if (b.dataset.retomar) retomar(b.dataset.retomar);
      else if (b.dataset.reconectar) reconectar(b.dataset.reconectar);
      else if (b.dataset.testar) { b.disabled = true; testar(b.dataset.testar).then(() => { b.disabled = false; }); }
      else if (b.hasAttribute('data-nova-rotina')) novaRotina(ctx);
    };
    el.addEventListener('click', onClick);
    const off = onRodando(() => ctx.refresh());
    // "atualizado há N s" ao vivo (verificação simulada a cada 30 s)
    const tick = setInterval(() => {
      const s = el.querySelector('[data-upd]'); if (!s) return;
      let seg = Math.round((Date.now() - ultimaVerif) / 1000);
      if (seg >= 30) { ultimaVerif = Date.now(); seg = 0; }
      s.textContent = seg < 5 ? 'agora' : `há ${seg} s`;
    }, 1000);
    // deep link: #/torre?reconectar=i-meta (vindo de Alertas/Insights)
    let tq = null;
    if (ctx.query.reconectar && ctx.can('torre', 'editar')) {
      const id = ctx.query.reconectar; ctx.router.setQuery({ reconectar: null });
      tq = setTimeout(() => reconectar(id), 120);
    }
    return () => { el.removeEventListener('click', onClick); off(); clearInterval(tick); void tq; };
  },
};
