// perfil.js — perfil da pessoa: abas agora, performance, evolucao, clientes, horas, acesso.
import { db } from '../../core/store.js';
import { podeTrocarFoto } from './foto.js';
import { ui } from '../../core/ui.js';
import { charts } from '../../core/charts.js';
import { perms } from '../../core/perms.js';
import { notify } from '../../core/notify.js';
import * as fmt from '../../core/fmt.js';
import { padrao } from '../../core/padroes/index.js';
import { nomeCliente, rotTipo, ROT_STATUS, aberta, atrasada, venceHoje, addDias, isoDia, hoje0, segunda, diasPara } from '../operacao/base.js';
import { limOcupacao, limBurnout, pessoa, stats, ocupacao, estadoOcupacao, rotuloOcupacao, statusPessoa, serieSemanal, projecao, teamDeUser } from '../operacao/lib.js';
import { seloPrazo } from '../operacao/tarefa.js';
import { metricas, metricasTime, faixaTime, carteira, clientesResp, media } from './metricas.js';
import { comissoesDe } from '../clientes/calc.js';

const esc = fmt.esc;
export const ABAS_PERFIL = [{ id: '', rotulo: 'Agora' }, { id: 'performance', rotulo: 'Performance' }, { id: 'evolucao', rotulo: 'Evolução' }, { id: 'clientes', rotulo: 'Clientes' }, { id: 'horas', rotulo: 'Horas' }, { id: 'comissoes', rotulo: 'Comissões' }, { id: 'acesso', rotulo: 'Acesso' }];
/** Comissões: a própria pessoa (só as dela) e quem vê receita (dono/admin, de qualquer pessoa) */
export const podeVerComissoes = (ctx, p) => perms.veReceita() || teamDeUser(ctx.user) === p.id;
export const abasPerfil = (ctx, p) => ABAS_PERFIL.filter(a => a.id !== 'comissoes' || podeVerComissoes(ctx, p));

/* ---------------- cabeçalho ---------------- */
const CAMERA = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';
export function cabecalhoPessoa(ctx, p, o) {
  const st = statusPessoa(p); const oc = ocupacao(p.id); const me = teamDeUser(ctx.user) === p.id;
  const u = db.get('users', p.userId) || {};
  const acoes = [];
  if (o.editor && oc != null && oc > 85) acoes.push(ui.btn({ rotulo: 'Redistribuir', icone: 'users', tipo: oc > 100 ? 'pri' : undefined, attrs: { 'data-eq': 'redistribuir' } }));
  if (!me) acoes.push(ui.btn({ rotulo: 'Enviar elogio', icone: 'star', attrs: { 'data-eq': 'elogio' } }));
  if (me) acoes.push(ui.btn({ rotulo: 'Fazer check-in', icone: 'check-circle', attrs: { 'data-eq': 'checkin' } }));
  acoes.push(notify.botaoNotificar('team', p.id, p.nome));
  return `<div class="ph m-eq-ph">${o.gestor ? `<a class="ph-back" href="#/equipe">${ui.ic('chev-left')}Equipe</a>` : ''}
<div class="ph-row"><div class="m-eq-id"><span class="m-eq-avw">${ui.avatar({ ...p, status: st.chave }, 56, { status: true })}${podeTrocarFoto(ctx.real || ctx.user, p.id) ? `<button type="button" class="m-eq-cam" data-eq="foto" aria-label="${me ? 'Trocar minha foto' : `Trocar a foto de ${esc(p.nome)}`}" title="${p.foto ? 'Trocar foto' : 'Adicionar foto'}">${CAMERA}</button>` : ''}</span><div class="ph-t"><h1>${esc(me && !o.gestor ? 'Meu perfil' : p.nome)}</h1><p>${esc(me && !o.gestor ? `${p.nome} · ${p.cargo}` : `${p.cargo} · ${p.area}`)}${p.desde ? ` · desde ${esc(fmt.mesAno(p.desde))}` : ''}</p>
<div class="ph-meta">${ui.led(st.estado, st.rotulo)}${oc != null ? `<span class="sm">Ocupação <b class="num t-${estadoOcupacao(oc) === 'info' ? 'ok' : estadoOcupacao(oc)}">${fmt.pct(oc, 0)}</b> <span class="mut">(${esc(rotuloOcupacao(oc).toLowerCase())})</span></span>` : ''}<span class="sm mut">Último acesso ${ui.rel(u.ultimoAcesso)}</span></div></div></div>
<div class="ph-a">${acoes.join('')}</div></div></div>`;
}

/* ---------------- Agora ---------------- */
function itemTarefa(t) {
  return { estado: atrasada(t) ? 'err' : venceHoje(t) ? 'warn' : t.status === 'aprovacao' ? 'ok' : 'off', titulo: t.titulo, href: `#/operacao/quadro?tarefa=${t.id}`, sub: `${nomeCliente(t.clientId)} · ${rotTipo(t.tipo)}`, meta: seloPrazo(t, { curto: true }), metaHtml: true };
}
function agora(ctx, p, o) {
  const ts = db.list('tasks', t => t.respId === p.id && aberta(t)).sort((a, b) => a.prazo.localeCompare(b.prazo));
  const and = ts.filter(t => t.status === 'andamento' && !atrasada(t)), apr = ts.filter(t => t.status === 'aprovacao'), atr = ts.filter(atrasada), fila = ts.filter(t => t.status === 'afazer' && !atrasada(t));
  const ck = db.list('checkins', c => c.teamId === p.id).sort((a, b) => String(b.quando).localeCompare(String(a.quando)))[0];
  const me = teamDeUser(ctx.user) === p.id;
  const m = metricas(p.id); const st = stats(p.id);
  const burn = m.semanasAcima;
  const lst = (titulo, l, vz, ajuda) => ui.card({ titulo, sub: String(l.length), ajuda, corpo: ui.lista(l.map(itemTarefa), { vazio: vz }) });
  const ckCard = ui.card({
    titulo: 'Último check-in', icone: 'check-circle', acoes: me ? ui.btn({ rotulo: ck && ck.data === isoDia(hoje0()) ? 'Editar' : 'Fazer check-in', sm: true, attrs: { 'data-eq': 'checkin' } }) : '',
    corpo: ck ? `<div class="m-eq-ck"><p class="sm mut">${ck.data === isoDia(hoje0()) ? 'Hoje' : fmt.data(ck.data)} · ${ui.rel(ck.quando)}</p>${ui.pares([['O que fiz', esc(ck.fiz)], ['O que farei', esc(ck.farei)], ['Bloqueios', ck.bloqueios ? `<span class="t-warn fw6">${esc(ck.bloqueios)}</span>` : '<span class="mut">Nenhum</span>']], { colunas: 1 })}</div>`
      : ui.vazio({ icone: 'check-circle', titulo: 'Nenhum check-in ainda', texto: me ? 'Conte o que fez, o que fará e se há bloqueios. Leva 1 minuto.' : 'A pessoa ainda não fez check-in.', compacto: true, acao: me ? { rotulo: 'Fazer check-in', attrs: { 'data-eq': 'checkin' } } : null }),
  });
  const resumo = `<div class="g-kpi m-eq-kpi4">
${ui.kpi({ rotulo: 'Ocupação', valor: m.ocupacao == null ? '—' : fmt.pct(m.ocupacao, 0), comp: `zona ideal ${limOcupacao().min}–${limOcupacao().max}%`, led: estadoOcupacao(m.ocupacao) === 'info' ? 'off' : estadoOcupacao(m.ocupacao), serie: st ? st.historico.slice(-6, -1).concat([m.ocupacao]) : null, formatoSerie: 'pct', ajuda: 'Horas planejadas na semana ÷ capacidade (horas contratadas ÷ 4). >100% crítico · 86–100% atenção · 70–85% ideal · <70% ociosa.' })}
${ui.kpi({ rotulo: 'Em andamento', valor: fmt.num(and.length), comp: `${fmt.num(ts.length)} abertas no total` })}
${ui.kpi({ rotulo: 'Atrasadas', valor: fmt.num(atr.length), comp: 'prazo vencido', alerta: atr.length > 0, led: atr.length ? null : 'ok' })}
${ui.kpi({ rotulo: 'Entregas na semana', valor: fmt.num(m.semana), comp: 'últimos 7 dias', ajuda: 'Entregas concluídas (aprovadas) nos últimos 7 dias.' })}
</div>`;
  const burnAv = burn >= limBurnout().atencao ? ui.aviso({ tipo: burn >= limBurnout().critico ? 'err' : 'warn', titulo: `Risco de burnout: ${burn}ª semana seguida acima de ${limOcupacao().critico}%.`, texto: 'Redistribua tarefas ou renegocie prazos. Converse no próximo 1:1.', acao: o.editor ? ui.btn({ rotulo: 'Redistribuir', sm: true, tipo: 'pri', attrs: { 'data-eq': 'redistribuir' } }) : '' }) : '';
  const ferias = p.status === 'ferias' ? ui.aviso({ tipo: 'info', titulo: `${fmt.primeiro(p.nome)} está de férias até ${fmt.data(p.statusAte)}.`, texto: atr.length || fila.some(t => t.prazo <= p.statusAte) ? 'Há tarefas com prazo durante as férias: redistribua para não atrasar.' : 'Nenhuma tarefa vence durante as férias.', acao: o.editor && ts.length ? ui.btn({ rotulo: 'Redistribuir', sm: true, attrs: { 'data-eq': 'redistribuir' } }) : '' }) : '';
  return `${burnAv}${ferias}${resumo}<div class="g2">${lst('Em andamento', and, 'Nada em andamento no prazo.', 'O que a pessoa está fazendo agora (as atrasadas ficam ao lado).')}${lst('Atrasadas', atr, { icone: 'check-circle', titulo: 'Nenhuma tarefa atrasada', compacto: true })}</div>
<div class="g2">${lst('Em aprovação', apr, 'Nada aguardando aprovação.')}${ckCard}</div>
${ui.card({ titulo: 'Próximas na fila', sub: String(fila.length), corpo: ui.lista(fila.slice(0, 8).map(itemTarefa), { vazio: 'Fila vazia.' }), acoes: ui.btn({ rotulo: 'Ver no quadro', sm: true, tipo: 'ghost', href: `#/operacao/quadro?pessoa=${p.id}`, iconeDir: 'arrow-right' }) })}`;
}

/* ---------------- Performance ---------------- */
function faixaHtml(f, v, fmtV, melhorAlto = true) {
  if (!f || v == null) return '';
  if (f.max - f.min < 1e-9) return `<div class="m-eq-fx"><span class="sm mut">Só esta pessoa tem este indicador no time.</span></div>`;
  const lo = Math.min(f.min, v), hi = Math.max(f.max, v); const sp = hi - lo || 1;
  const P = x => ((x - lo) / sp) * 100;
  return `<div class="m-eq-fx" title="Faixa do time: ${esc(fmtV(f.min))} a ${esc(fmtV(f.max))} · média ${esc(fmtV(f.media))}"><div class="m-eq-fx-t"><i class="m-eq-fx-r" style="left:${P(f.min)}%;width:${Math.max(2, P(f.max) - P(f.min))}%"></i><i class="m-eq-fx-m" style="left:${P(f.media)}%"></i><i class="m-eq-fx-v" style="left:${P(v)}%"></i></div><span class="sm mut">Time: ${esc(fmtV(f.min))}–${esc(fmtV(f.max))} · média ${esc(fmtV(f.media))}</span></div>`;
}
function performance(ctx, p) {
  const { ms } = metricasTime(); const m = metricas(p.id);
  const P0 = v => fmt.pct(v, 0), H = v => `${fmt.dec(v, 1)} h`, D = v => `${fmt.dec(v, 1)} d`, N = v => fmt.dec(v, 1);
  const est = (v, ok, warn, alto = true) => (v == null ? 'off' : alto ? (v >= ok ? 'ok' : v >= warn ? 'warn' : 'err') : (v <= ok ? 'ok' : v <= warn ? 'warn' : 'err'));
  const cards = [
    ['Utilização', m.util, P0, 'util', 'Horas lançadas ÷ capacidade nas últimas 4 semanas.', estOcup(m.util), true],
    ['Utilização faturável', m.utilFat, P0, 'utilFat', 'Horas faturáveis (em clientes) ÷ capacidade, 4 semanas. Meta 75–80%.', m.utilFat == null ? 'off' : m.utilFat >= 75 && m.utilFat <= 85 ? 'ok' : m.utilFat >= 65 ? 'warn' : 'err', true],
    ['Entregas no prazo', m.noPrazo, P0, 'noPrazo', `Entregas concluídas até o prazo ÷ entregas, 12 semanas. Meta ${padrao('operacao.prazo.meta', 95)}%.`, est(m.noPrazo, padrao('operacao.prazo.meta', 95), padrao('operacao.prazo.minimo', 90)), true],
    ['Throughput', m.throughput, v => `${N(v)}/sem`, 'throughput', 'Entregas concluídas por semana (média de 4 semanas).', 'off', true],
    ['Lead time médio', m.lead, D, 'lead', 'Dias entre a criação da tarefa e a entrega aprovada.', est(m.lead, 6, 9, false), false],
    ['Retrabalho', m.retrabalho, P0, 'retrabalho', `Rodadas de ajuste ÷ entregas (12 semanas). Meta ≤ ${padrao('operacao.retrabalho.meta', 15)}%.`, est(m.retrabalho, padrao('operacao.retrabalho.meta', 15), padrao('operacao.retrabalho.critico', 25), false), false],
    ['Aprovação na 1ª tentativa', m.primeira, P0, 'primeira', 'Entregas aprovadas sem nenhum pedido de ajuste.', est(m.primeira, 85, 70), true],
    ...(m.sla != null ? [['SLA de 1ª resposta', m.sla, H, 'sla', 'Horas úteis até a 1ª resposta ao cliente. Meta < 2 h.', est(m.sla, 2, 2.5, false), false]] : []),
    perms.veReceita() ? ['Receita gerida', m.mrr, v => fmt.brlK(v), 'mrr', 'MRR dos clientes sob responsabilidade da pessoa.', 'off', true]
      : ['Clientes sob responsabilidade', m.nResp, v => fmt.num(v), 'nResp', 'Clientes em que a pessoa é a responsável principal.', 'off', true],
    ['Health médio dos clientes', m.health, v => fmt.num(Math.round(v)), 'health', 'Média do health score dos clientes da carteira. ≥75 ok · 60–74 atenção · <60 risco.', m.health == null ? 'off' : ui.faixa(m.health, 'health'), true],
    ...(m.roas != null ? [['ROAS médio', m.roas, v => `${fmt.dec(v, 1)}x`, 'roas', 'ROAS médio das contas de tráfego da pessoa. Meta 3,0.', est(m.roas, 3, 2.5), true]] : []),
  ];
  const grid = `<div class="m-eq-perf">${cards.map(([rot, v, f, k, aj, e]) => `<article class="kpi"><header class="kpi-h">${e !== 'off' ? ui.led(e, false) : ''}<span class="kpi-l">${esc(rot)}</span>${ui.ajuda(aj)}</header><div class="kpi-v num">${v == null ? '—' : esc(f(v))}</div>${faixaHtml(faixaTime(ms, k), v, f)}</article>`).join('')}</div>`;
  const st = stats(p.id) || {};
  const hist = (st.historico || []).slice(0, -1).concat([ocupacao(p.id)]);
  const sem = serieSemanal(d => d.respId === p.id);
  const chart = charts.linhas({ series: [{ nome: 'Ocupação', dados: hist }, { nome: 'Entregas no prazo', dados: sem.map(s => (s.pct == null ? null : Math.round(s.pct))), cor: 'var(--c3)' }], rotulos: sem.map(s => s.rotulo), formato: 'pct', metas: [{ valor: 95, rotulo: 'Meta prazo 95%' }, { valor: 85, rotulo: 'Limite ideal 85%' }], altura: 240 });
  return `${ui.aviso({ tipo: 'info', texto: 'Sem ranking: cada indicador mostra a faixa do time (barra cinza), a média (traço) e a pessoa (ponto). Medimos resultado e fluxo, não cliques.' })}
${grid}${ui.card({ titulo: 'Últimas 12 semanas', sub: 'ocupação × entregas no prazo', ajuda: 'Ocupação semanal planejada e % de entregas no prazo da pessoa em cada janela de 7 dias.', corpo: chart })}`;
}
const estOcup = v => { if (v == null) return 'off'; const l = limOcupacao(); return v > l.critico ? 'err' : v > l.max ? 'warn' : v >= l.min ? 'ok' : 'warn'; };

/* ---------------- Evolução ---------------- */
function progresso(g) { const span = g.alvo - g.inicio; if (!span) return 100; return Math.max(0, Math.min(100, ((g.atual - g.inicio) / span) * 100)); }
function evolucao(ctx, p, o) {
  const me = teamDeUser(ctx.user) === p.id; const podeMeta = o.editor || me;
  const goals = db.list('goals', g => g.teamId === p.id);
  const st = stats(p.id) || {};
  const metas = goals.length ? `<ul class="m-eq-goals">${goals.map(g => {
    const pr = progresso(g); const decorr = Math.min(100, Math.max(0, 100 - (diasPara(g.prazo) / 90) * 100));
    const e = pr >= 100 ? 'ok' : pr + 15 >= decorr ? 'ok' : pr + 35 >= decorr ? 'warn' : 'err';
    const f = v => `${fmt.dec(v, v % 1 ? 1 : 0)}${['x', '%'].includes(g.unidade) ? '' : ' '}${g.unidade}`;
    return `<li><div class="row between"><div class="trunc"><b>${esc(g.titulo)}</b><small class="mut">${g.tipo === 'okr' ? `OKR · ${esc(g.kr)}` : 'Meta individual'} · até ${esc(fmt.data(g.prazo))}</small></div>${podeMeta ? ui.btn({ rotulo: 'Atualizar', sm: true, tipo: 'ghost', attrs: { 'data-meta': g.id } }) : ''}</div>
<div class="m-eq-gb">${ui.barra(Math.round(pr), { estado: pr >= 100 ? 'ok' : 'acc', rotulo: false })}<span class="num sm"><b>${fmt.pct(pr, 0)}</b></span></div><div class="row between sm"><span class="mut num">${esc(f(g.inicio))} → <b class="fw6" style="color:var(--fg)">${esc(f(g.atual))}</b> → alvo ${esc(f(g.alvo))}</span>${ui.selo(e, pr >= 100 ? 'Concluída' : e === 'ok' ? 'No ritmo' : e === 'warn' ? 'Um pouco atrás' : 'Atrasada')}</div></li>`;
  }).join('')}</ul>` : ui.vazio({ icone: 'target', titulo: 'Sem metas definidas', texto: 'Combine 2 ou 3 metas no próximo 1:1.', compacto: true });
  const pdi = (st.pdi || []).length ? `<ul class="m-eq-pdi">${st.pdi.map(c => `<li><span>${esc(c.comp)}</span><span class="m-eq-dots" role="img" aria-label="${esc(`${c.comp}: nível ${c.nivel} de 5, alvo ${c.alvo}`)}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= c.nivel ? 'on' : i <= c.alvo ? 'alvo' : ''}"></i>`).join('')}</span><span class="sm mut num">${c.nivel}/${c.alvo}</span></li>`).join('')}</ul><p class="sm mut m-eq-leg"><i class="m-eq-dot on"></i> nível atual <i class="m-eq-dot alvo"></i> alvo do PDI</p>` : ui.vazio({ titulo: 'PDI ainda não definido', compacto: true });
  const fbs = (st.feedbacks || []).slice().sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  const fbHtml = fbs.length ? `<ul class="m-eq-fb">${fbs.map(f => { const de = f.de ? db.get('users', f.de) : null; return `<li class="t-${f.tipo}">${de ? ui.avatar(de, 28) : '<span class="m-eq-clap" aria-hidden="true">👏</span>'}<div><p>${esc(f.texto)}</p><small class="mut">${f.tipo === 'cliente' ? 'Elogio de cliente' : f.tipo === 'elogio' ? `Elogio de ${esc(de ? de.nome : 'colega')}` : `Feedback de ${esc(de ? de.nome : 'gestão')}`} · ${ui.rel(f.quando)}</small></div></li>`; }).join('')}</ul>` : ui.vazio({ icone: 'star', titulo: 'Nenhum reconhecimento ainda', texto: 'Seja o primeiro a reconhecer um bom trabalho.', compacto: true });
  const oos = db.list('oneOnOnes', x => x.teamId === p.id).sort((a, b) => b.data.localeCompare(a.data));
  const podeOo = o.editor || me;
  const ooHtml = oos.length ? `<ul class="m-eq-oo">${oos.map(x => `<li><div class="row between"><b>${esc(fmt.data(x.data))}</b>${x.humor ? `<span class="sm mut">Humor: ${esc(x.humor)}</span>` : ''}</div><p class="sm">${esc(x.notas)}</p>${(x.combinados || []).length ? `<ul class="m-eq-comb">${x.combinados.map(c => `<li><label class="ck"><input type="checkbox" data-comb="${esc(x.id)}|${esc(c.id)}"${c.feito ? ' checked' : ''}${podeOo ? '' : ' disabled'}><span${c.feito ? ' class="m-eq-ok"' : ''}>${esc(c.texto)}</span></label></li>`).join('')}</ul>` : ''}</li>`).join('')}</ul>` : ui.vazio({ icone: 'message', titulo: 'Nenhum 1:1 registrado', texto: 'Registre conversas para acompanhar combinados.', compacto: true });
  const pend = oos.flatMap(x => (x.combinados || []).filter(c => !c.feito)).length;
  return `<div class="g2">${ui.card({ titulo: 'Metas e OKRs', icone: 'target', sub: `${goals.length}`, ajuda: 'Progresso = (atual − início) ÷ (alvo − início). "No ritmo" compara o progresso com o tempo já decorrido até o prazo.', corpo: metas })}
${ui.card({ titulo: 'PDI — competências', icone: 'trending-up', ajuda: 'Plano de desenvolvimento individual: nível atual de 1 a 5 e o alvo combinado.', acoes: o.editor ? ui.btn({ rotulo: 'Avaliar', sm: true, tipo: 'ghost', attrs: { 'data-eq': 'pdi' } }) : '', corpo: pdi })}</div>
<div class="g2">${ui.card({ titulo: 'Feedbacks e reconhecimentos', icone: 'star', sub: `${fbs.length}`, acoes: me ? '' : ui.btn({ rotulo: 'Enviar elogio', icone: 'star', sm: true, attrs: { 'data-eq': 'elogio' } }), corpo: fbHtml })}
${ui.card({ titulo: 'Histórico de 1:1', icone: 'message', sub: pend ? `${pend} combinado${pend > 1 ? 's' : ''} pendente${pend > 1 ? 's' : ''}` : 'em dia', acoes: o.editor ? ui.btn({ rotulo: 'Registrar 1:1', icone: 'plus', sm: true, attrs: { 'data-eq': 'umaum' } }) : '', corpo: ooHtml })}</div>`;
}

/* ---------------- Clientes ---------------- */
function clientes(ctx, p) {
  const c = carteira(p.id);
  const over = c.filter(x => x.estado === 'err' || x.estado === 'warn');
  const tbl = ui.tabela({
    cols: [
      { k: 'nome', l: 'Cliente', v: x => x.cliente.nome, r: x => `<a href="#/clientes/${esc(x.clientId)}"><b>${esc(x.cliente.nome)}</b></a><span class="sub">${x.resp ? 'Responsável' : 'Apoio'}${x.cliente.seg ? ` · ${esc(x.cliente.seg)}` : ''}</span>` },
      { k: 'health', l: 'Health', num: true, v: x => x.cliente.health ?? -1, r: x => (x.cliente.health == null ? '—' : ui.selo(ui.faixa(x.cliente.health, 'health'), String(x.cliente.health))) },
      ...(perms.veReceita() ? [{ k: 'mrr', l: 'MRR', num: true, v: x => x.cliente.mrr || 0, r: x => (x.cliente.mrr ? fmt.brl(x.cliente.mrr) : '—'), mobile: false }] : []),
      { k: 'real', l: 'Horas no mês', num: true, r: x => `<span class="num">${fmt.dec(x.real, 1)} h</span>${x.prop != null ? `<span class="sub">de ${fmt.dec(x.prop, 1)} h previstas</span>` : ''}` },
      { k: 'ratio', l: 'Real × contratado', v: x => x.ratio ?? -1, ajuda: `Horas lançadas no mês ÷ horas contratadas proporcionais aos dias úteis já passados. >${padrao('equipe.overservicing.atencao', 110)}% atenção (overservicing) · >${padrao('equipe.overservicing.critico', 130)}% crítico.`, r: x => (x.ratio == null ? '<span class="mut sm">sem horas contratadas</span>' : `<div class="m-eq-ov">${ui.barra(Math.round(x.ratio), { estado: x.estado, max: 150, zona: [90, 110], texto: fmt.pct(x.ratio, 0) })}</div>`) },
      { k: 'ct', l: 'Contratadas/mês', num: true, v: x => x.horasContratadas ?? -1, r: x => (x.horasContratadas == null ? '—' : `${fmt.num(x.horasContratadas)} h`), mobile: false },
    ], linhas: c, vazio: { titulo: 'Sem clientes na carteira', texto: 'Defina o responsável no cadastro do cliente ou as horas contratadas por pessoa.' }, legenda: 'Carteira',
  });
  const resp = clientesResp(p.id);
  return `${over.length ? ui.aviso({ tipo: over.some(x => x.estado === 'err') ? 'err' : 'warn', titulo: `Overservicing em ${over.map(x => x.cliente.nome).join(', ')}.`, texto: 'Horas reais acima das contratadas: revise escopo, renegocie ou redistribua.' }) : ''}
<div class="g-kpi m-eq-kpi4">${ui.kpi({ rotulo: 'Clientes sob responsabilidade', valor: fmt.num(resp.length), comp: `${fmt.num(c.length)} na carteira` })}${perms.veReceita() ? ui.kpi({ rotulo: 'MRR gerido', valor: fmt.brlK(resp.reduce((a, x) => a + (x.mrr || 0), 0)), comp: 'clientes em que é responsável' }) : ui.kpi({ rotulo: 'Clientes em risco', valor: fmt.num(resp.filter(x => x.health != null && x.health < 60).length), comp: 'health abaixo de 60', alerta: resp.some(x => x.health != null && x.health < 60), led: resp.some(x => x.health != null && x.health < 60) ? null : 'ok' })}${ui.kpi({ rotulo: 'Health médio', valor: resp.length ? fmt.num(Math.round(media(resp.map(x => x.health)))) : '—', led: resp.length ? ui.faixa(media(resp.map(x => x.health)), 'health') : null })}${ui.kpi({ rotulo: 'Horas no mês', valor: `${fmt.dec(c.reduce((a, x) => a + x.real, 0), 0)} h`, comp: 'em clientes' })}</div>
${ui.card({ titulo: 'Carteira', sub: 'horas reais × contratadas', pad: false, corpo: tbl })}`;
}

/* ---------------- Horas ---------------- */
function horas(ctx, p, o) {
  const me = teamDeUser(ctx.user) === p.id;
  const cap = (p.horasMes || 160) / 4;
  const seg0 = segunda(hoje0()); const sem = Array.from({ length: 8 }, (_, i) => addDias(-(7 * (7 - i)), seg0));
  const es = db.list('timeEntries', e => e.teamId === p.id);
  const fat = sem.map(s => { const a = isoDia(s), b = isoDia(addDias(7, s)); return es.filter(e => e.data >= a && e.data < b && e.faturavel).reduce((x, e) => x + e.horas, 0); });
  const int = sem.map(s => { const a = isoDia(s), b = isoDia(addDias(7, s)); return es.filter(e => e.data >= a && e.data < b && !e.faturavel).reduce((x, e) => x + e.horas, 0); });
  const chart = charts.barras({ rotulos: sem.map(s => fmt.dataCurta(s)), series: [{ nome: 'Faturável', dados: fat.map(v => Math.round(v * 10) / 10) }, { nome: 'Interno', dados: int.map(v => Math.round(v * 10) / 10), cor: 'var(--c2n)' }], empilhado: true, formato: { eixo: v => `${fmt.num(v)} h`, tip: v => `${fmt.dec(v, 1)} h` }, metas: [{ valor: cap, rotulo: `Capacidade ${fmt.num(cap)} h` }], altura: 230, destaque: 7 });
  const recentes = es.sort((a, b) => b.data.localeCompare(a.data) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 15);
  const tbl = ui.tabela({
    cols: [
      { k: 'data', l: 'Data', r: e => fmt.data(e.data) },
      { k: 'cli', l: 'Cliente', v: e => nomeCliente(e.clientId), r: e => (e.clientId ? esc(nomeCliente(e.clientId)) : '<span class="mut">Interno</span>') },
      { k: 'desc', l: 'Atividade', mobile: false },
      { k: 'horas', l: 'Horas', num: true, r: e => `${fmt.dec(e.horas, 1)} h` },
      { k: 'fat', l: 'Faturável', v: e => (e.faturavel ? 1 : 0), r: e => (e.faturavel ? ui.selo('ok', 'Sim') : ui.selo('off', 'Não')) },
    ], linhas: recentes, densa: true, vazio: { titulo: 'Nenhum lançamento', texto: 'Lance horas para acompanhar utilização e rentabilidade.' }, legenda: 'Lançamentos recentes',
  });
  const tot4 = fat.slice(-4).reduce((a, b) => a + b, 0) + int.slice(-4).reduce((a, b) => a + b, 0);
  return `<div class="g-kpi m-eq-kpi4">${ui.kpi({ rotulo: 'Horas em 4 semanas', valor: `${fmt.num(Math.round(tot4))} h`, comp: `de ${fmt.num(cap * 4)} h de capacidade` })}${ui.kpi({ rotulo: 'Faturáveis', valor: tot4 ? fmt.pct((fat.slice(-4).reduce((a, b) => a + b, 0) / tot4) * 100, 0) : '—', comp: 'das horas lançadas', ajuda: 'Horas em clientes ÷ total lançado nas últimas 4 semanas.' })}${ui.kpi({ rotulo: 'Custo/hora', valor: p.custoHora ? fmt.brl(p.custoHora) : '—', comp: 'cadastro da equipe' })}${ui.kpi({ rotulo: 'Contratadas', valor: `${fmt.num(p.horasMes || 0)} h/mês`, comp: `${fmt.num(cap)} h por semana` })}</div>
${ui.card({ titulo: 'Horas por semana', sub: '8 semanas', ajuda: 'Soma dos lançamentos por semana (segunda a domingo). A linha tracejada é a capacidade semanal.', corpo: chart, acoes: o.editor || me ? ui.btn({ rotulo: 'Lançar horas', icone: 'plus', sm: true, attrs: { 'data-eq': 'horas' } }) : '' })}
${ui.card({ titulo: 'Lançamentos recentes', pad: false, corpo: tbl })}`;
}

/* ---------------- Comissões ---------------- */
// A pessoa vê só as próprias e só o valor em R$ (sem MRR nem %); dono/admin veem de qualquer pessoa, com o tipo.
const ROT_COM = { ativa: ['ok', 'Ativa'], encerrando: ['warn', 'Encerra em ≤ 1 mês'], encerrada: ['off', 'Encerrada'], futura: ['info', 'Começa depois'] };
function comissoes(ctx, p) {
  const adm = perms.veReceita(); const me = teamDeUser(ctx.user) === p.id;
  const l = comissoesDe(p.id, db);
  const ativas = l.filter(x => x.ativa);
  const total = ativas.reduce((a, x) => a + x.mensal, 0);
  const prox = ativas.slice().sort((a, b) => a.termina.localeCompare(b.termina))[0];
  const R = v => fmt.brl2(v).replace(/,00$/, '');
  const kp = `<div class="g-kpi m-eq-kpi4">
${ui.kpi({ rotulo: 'Total mensal ativo', valor: R(total), comp: `${fmt.plural(ativas.length, 'comissão ativa', 'comissões ativas')}`, ajuda: 'Soma do valor mensal das comissões variáveis ativas neste mês. Entra junto com o pagamento do mês.' })}
${ui.kpi({ rotulo: 'Próximo término', valor: prox ? fmt.data(prox.termina) : '—', comp: prox ? esc(prox.cliente) : 'nenhuma ativa', led: prox && prox.mesesRestantes <= 1 ? 'warn' : null, ajuda: 'Última data de vigência da comissão ativa que termina primeiro.' })}
${ui.kpi({ rotulo: 'Já encerradas', valor: fmt.num(l.filter(x => x.status === 'encerrada').length), comp: 'histórico' })}
</div>`;
  const tbl = ui.tabela({
    cols: [
      { k: 'cliente', l: 'Cliente', v: x => x.cliente, r: x => `<a href="#/clientes/${esc(x.clientId)}"><b>${esc(x.cliente)}</b></a>${x.com.obs ? `<span class="sub">${esc(x.com.obs)}</span>` : ''}${adm ? `<span class="sub">${x.com.tipo === 'percentual' ? `${fmt.pct(x.com.valor, x.com.valor % 1 ? 1 : 0)} do MRR` : 'Valor fixo'} · desde ${fmt.data(x.com.inicio)}</span>` : ''}` },
      { k: 'mensal', l: 'Valor/mês', num: true, v: x => x.mensal, r: x => `<b class="num">${R(x.mensal)}</b>` },
      { k: 'rest', l: 'Meses restantes · término', v: x => x.termina, r: x => (x.status === 'encerrada' ? `<span class="mut">terminou em ${fmt.data(x.termina)}</span>` : `<span class="num">${fmt.plural(x.mesesRestantes, 'mês', 'meses')}</span><span class="sub">até ${fmt.data(x.termina)}</span>`) },
      { k: 'st', l: 'Status', v: x => ({ encerrando: 0, ativa: 1, futura: 2, encerrada: 3 }[x.status]), r: x => ui.selo(...(ROT_COM[x.status] || ROT_COM.ativa)) },
      ...(adm ? [{ k: 'ed', l: '', sort: false, mobile: false, r: x => `<a class="sm" href="#/clientes/${esc(x.clientId)}/cadastro?editar=1">Editar</a>` }] : []),
    ],
    linhas: l, legenda: 'Comissões variáveis', ordem: { k: 'st', dir: 'asc' },
    vazio: { icone: 'dollar', titulo: me ? 'Você ainda não tem comissões variáveis' : 'Sem comissões variáveis', texto: adm ? 'Cadastre no cliente: Clientes › ficha › Cadastro › Editar › Comissão variável.' : 'Quando a direção cadastrar uma comissão para você, ela aparece aqui e você recebe uma notificação.' },
  });
  return `${kp}${ui.card({ titulo: me && !adm ? 'Minhas comissões variáveis' : `Comissões variáveis de ${esc(fmt.primeiro(p.nome))}`, sub: 'valor por mês em R$', pad: l.length ? false : undefined, ajuda: 'Bônus por cliente combinado com a direção: vale por um número de meses a partir do início. "Encerra em ≤ 1 mês" avisa que este é o último mês.', acoes: adm ? ui.btn({ rotulo: 'Financeiro › Comissões', sm: true, tipo: 'ghost', href: '#/financeiro/comissoes', iconeDir: 'arrow-right' }) : '', corpo: tbl })}`;
}

/* ---------------- Acesso ---------------- */
function acesso(ctx, p, o) {
  const u = db.get('users', p.userId);
  if (!u) return ui.card({ corpo: ui.vazio({ icone: 'lock', titulo: 'Sem usuário de acesso', texto: 'Esta pessoa ainda não tem login. Convide em Administração › Usuários.', acao: { rotulo: 'Abrir Administração', href: '#/admin/usuarios' } }) });
  const papel = perms.PAPEIS[u.papel] || { rotulo: u.papel, desc: '' };
  const esc0 = perms.escopoClientes(u);
  const real = ctx.real || {};
  const linhas = perms.MODULOS_PERM.map(m => ({ m, n: perms.nivel(m.id, u), e: perms.escopo(m.id, u) }));
  const tbl = ui.tabela({
    cols: [
      { k: 'mod', l: 'Módulo', v: x => x.m.rotulo, r: x => esc(x.m.rotulo) },
      { k: 'n', l: 'Nível', v: x => ({ '': 0, ver: 1, editar: 2, admin: 3 }[x.n]), r: x => (x.n ? ui.selo(x.n === 'ver' ? 'info' : 'ok', perms.NIVEL_ROTULO[x.n]) : ui.selo('off', 'Sem acesso')) },
      { k: 'e', l: 'Escopo', r: x => (x.n ? esc(perms.ESCOPO_ROTULO[x.e] || 'tudo') || 'tudo' : '<span class="mut">—</span>') },
    ], linhas, densa: true, legenda: 'Permissões efetivas',
  });
  const podeAtivar = o.editor && u.id !== real.id && u.papel !== 'dono';
  return `<div class="g-2-1">${ui.card({ titulo: 'Permissões efetivas', sub: `papel ${papel.rotulo}`, pad: false, ajuda: 'Somente leitura. Lido da matriz de permissões em Administração › Permissões; mudanças lá refletem aqui na hora.', acoes: ctx.can('admin', 'ver') ? ui.btn({ rotulo: 'Editar em Administração', sm: true, tipo: 'ghost', href: '#/admin/permissoes', iconeDir: 'arrow-right' }) : '', corpo: tbl })}
${ui.card({ titulo: 'Login', icone: 'key', corpo: `${ui.pares([['Papel', `<b>${esc(papel.rotulo)}</b><br><span class="sm mut">${esc(papel.desc)}</span>`], ['E-mail', esc(u.email)], ['Situação', u.ativo === false ? ui.led('off', 'Inativo') : ui.led('ok', 'Ativo')], ['Último acesso', u.ultimoAcesso ? `${esc(fmt.dataHora(u.ultimoAcesso))} <span class="sm mut">(${ui.rel(u.ultimoAcesso)})</span>` : '—'], ['Clientes no escopo', esc0 === 'todos' ? 'Todos os clientes' : esc0.length ? `<b>${fmt.plural(esc0.length, 'cliente')}</b><br><span class="sm">${esc(esc0.slice(0, 6).map(nomeCliente).join(', '))}${esc0.length > 6 ? ` e mais ${esc0.length - 6}` : ''}</span>` : '<span class="mut">Nenhum (defina o responsável no cadastro do cliente)</span>']], { colunas: 1 })}
<div class="row m-eq-ac">${podeAtivar ? ui.btn({ rotulo: u.ativo === false ? 'Reativar acesso' : 'Desativar acesso', icone: u.ativo === false ? 'check' : 'lock', tipo: u.ativo === false ? 'pri' : 'perigo', sm: true, attrs: { 'data-eq': 'ativo' } }) : `<span class="sm mut">${o.editor ? (u.id === real.id ? 'Você não pode desativar o próprio acesso.' : 'O acesso do dono não pode ser desativado.') : 'Somente dono e administradores alteram o acesso.'}</span>`}${o.editor ? ui.btn({ rotulo: 'Alterar papel', sm: true, tipo: 'ghost', href: '#/admin/usuarios' }) : ''}</div>` })}</div>`;
}

export function renderPerfil(ctx, p, aba, o) {
  const corpo = aba === 'performance' ? performance(ctx, p) : aba === 'evolucao' ? evolucao(ctx, p, o) : aba === 'clientes' ? clientes(ctx, p) : aba === 'horas' ? horas(ctx, p, o) : aba === 'comissoes' ? comissoes(ctx, p) : aba === 'acesso' ? acesso(ctx, p, o) : agora(ctx, p, o);
  return `${cabecalhoPessoa(ctx, p, o)}${ui.tabs(abasPerfil(ctx, p), aba, `equipe/${p.id}`)}${corpo}`;
}
export { projecao };
