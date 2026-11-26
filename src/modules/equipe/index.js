// Equipe — controle, monitoramento e performance: visão do time, perfil (abas), atividade + check-in e matriz de permissões.
import './data.js';
import '../operacao/data.js';
import { db } from '../../core/store.js';
import { ui } from '../../core/ui.js';
import { charts } from '../../core/charts.js';
import { perms } from '../../core/perms.js';
import { auth } from '../../core/auth.js';
import { router } from '../../core/router.js';
import { notify } from '../../core/notify.js';
import * as fmt from '../../core/fmt.js';
import { padrao } from '../../core/padroes/index.js';
import { nomeCliente, aberta, atrasada, isoDia, hoje0, addDias, FATURAVEIS } from '../operacao/base.js';
import { limOcupacao, limBurnout, sobrecarga, faixasOcupacaoTxt, pessoa, stats, ocupacao, projecao, estadoOcupacao, rotuloOcupacao, statusPessoa, semanasAcima, teamDeUser, userDe, entregasNaJanela, pctNoPrazo, eu } from '../operacao/lib.js';
import { metricasTime, mrrTotal, media, soProprio, carteira, clientesResp, horasNaJanela } from './metricas.js';
import { renderPerfil, ABAS_PERFIL, podeVerComissoes } from './perfil.js';
import { comissoesAtivas } from '../clientes/calc.js';
import { trocarFoto } from './foto.js';
import { redistribuir, elogio, registrarUmAUm, checkin, lancarHoras, atualizarMeta, avaliarPdi } from './acoes.js';

const esc = fmt.esc;
const ESPECIAIS = ['atividade', 'acessos'];
const opts = ctx => ({ gestor: ctx.can('equipe', 'ver') && !soProprio(ctx.user), editor: ctx.can('equipe', 'editar') });
const restrito = (txt, me) => `<div class="pg m-equipe">${ui.vazio({ icone: 'lock', titulo: 'Acesso restrito', texto: txt, acao: me ? { rotulo: 'Ver meu perfil', href: `#/equipe/${me}` } : { rotulo: 'Voltar ao início', href: '#/' } })}</div>`;

/* ---------------- Visão do time ---------------- */
function visaoTime(ctx, o) {
  const { ppl, ms, por } = metricasTime();
  const ocs = ppl.map(p => ocupacao(p.id)).filter(v => v != null);
  const ocMed = media(ocs);
  const acima = ppl.filter(p => sobrecarga(ocupacao(p.id))); const LO = limOcupacao(), LB = limBurnout();
  const ent4 = entregasNaJanela(27, 0), ent4a = entregasNaJanela(55, -28);
  const np = pctNoPrazo(ent4), npa = pctNoPrazo(ent4a);
  const fatH = horasNaJanela(null, 28, e => e.faturavel && FATURAVEIS.includes(e.teamId)).reduce((a, e) => a + e.horas, 0);
  const capT = ppl.reduce((a, p) => a + ((p.horasMes || 160) / 4) * 4 * (p.status === 'ferias' ? 0.65 : 1), 0);
  const utilFat = capT ? (fatH / capT) * 100 : null;
  const entr12 = entregasNaJanela(83, 0).filter(d => d.tipo !== 'reuniao');
  const retr = entr12.length ? (entr12.filter(d => d.ajustes > 0).length / entr12.length) * 100 : null;
  const receita = mrrTotal() / Math.max(1, ppl.length);
  const histMed = Array.from({ length: 12 }, (_, i) => Math.round(media(ppl.map(p => { const s = stats(p.id); return s ? (i === 11 ? ocupacao(p.id) : s.historico[i]) : null; }))));
  const kpis = `<div class="g-kpi m-eq-kpis">
${ui.kpi({ rotulo: 'Ocupação média', valor: ocMed == null ? '—' : fmt.pct(ocMed, 0), comp: `zona ideal ${LO.min}–${LO.max}%`, led: estadoOcupacao(ocMed) === 'info' ? 'off' : estadoOcupacao(ocMed), serie: ocMed == null ? null : histMed, formatoSerie: 'pct', ajuda: 'Média da ocupação planejada da semana das pessoas faturáveis (horas planejadas ÷ capacidade).' })}
${ui.kpi({ rotulo: 'Entregas no prazo', valor: np == null ? '—' : fmt.pct(np, 0), delta: np != null && npa != null ? `${np >= npa ? '▲' : '▼'} ${fmt.pp(Math.abs(np - npa), 0)}` : '', comp: `meta ${padrao('operacao.prazo.meta', 95)}% · 4 semanas`, led: np == null ? undefined : np >= padrao('operacao.prazo.meta', 95) ? 'ok' : np >= padrao('operacao.prazo.minimo', 90) ? 'warn' : 'err', href: '#/operacao', ajuda: 'Entregas do time concluídas até o prazo ÷ entregas concluídas nas últimas 4 semanas.' })}
${ui.kpi({ rotulo: `Pessoas acima de ${LO.critico}%`, valor: fmt.num(acima.length), comp: acima.length ? acima.map(p => fmt.primeiro(p.nome)).join(', ') : 'ninguém sobrecarregado', alerta: acima.length > 0, led: acima.length ? null : 'ok', ajuda: `Pessoas com ocupação planejada acima da capacidade nesta semana. ≥${LB.atencao} semanas seguidas = risco de burnout.` })}
${perms.veReceita() ? ui.kpi({ rotulo: 'Receita por colaborador', valor: ppl.length ? fmt.brlK(receita) : '—', comp: ppl.length ? `MRR ÷ ${ppl.length} faturáveis` : 'nenhuma pessoa faturável', ajuda: 'MRR total ÷ número de pessoas faturáveis ativas.' })
    : ui.kpi({ rotulo: 'Clientes por pessoa', valor: ppl.length ? fmt.dec(db.count('clients', c => c.ativo !== false) / ppl.length, 1) : '—', comp: `${fmt.num(db.count('clients', c => c.ativo !== false))} clientes ÷ ${ppl.length} faturáveis`, ajuda: 'Clientes ativos ÷ número de pessoas faturáveis ativas.' })}
${ui.kpi({ rotulo: 'Utilização faturável', valor: utilFat == null ? '—' : fmt.pct(utilFat, 0), comp: 'meta 75–80%', led: utilFat == null ? undefined : utilFat >= 75 && utilFat <= 85 ? 'ok' : 'warn', ajuda: 'Horas em clientes ÷ capacidade do time nas últimas 4 semanas (descontando férias).' })}
${ui.kpi({ rotulo: 'Taxa de retrabalho', valor: retr == null ? '—' : fmt.pct(retr, 0), comp: `meta ≤ ${padrao('operacao.retrabalho.meta', 15)}% · 12 semanas`, led: retr == null ? undefined : retr <= padrao('operacao.retrabalho.meta', 15) ? 'ok' : retr <= padrao('operacao.retrabalho.critico', 25) ? 'warn' : 'err', href: '#/operacao', ajuda: 'Entregas que voltaram com pedido de ajuste ÷ entregas (12 semanas).' })}
</div>`;

  const risco = ppl.map(p => ({ p, n: semanasAcima(p.id) })).filter(x => x.n >= LB.atencao).sort((a, b) => b.n - a.n);
  const burn = risco.length ? ui.card({
    titulo: 'Risco de burnout', icone: 'alert', cls: 'm-eq-burn', ajuda: `≥${LB.atencao} semanas seguidas acima de ${LO.critico}% = atenção; ≥${LB.critico} = crítico.`,
    corpo: ui.lista(risco.map(x => ({ estado: x.n >= LB.critico ? 'err' : 'warn', titulo: `${x.p.nome} em ${fmt.pct(ocupacao(x.p.id), 0)} de ocupação`, href: `#/equipe/${x.p.id}`, sub: `${x.n}ª semana seguida acima de ${LO.critico}% · ${fmt.plural(db.count('tasks', t => t.respId === x.p.id && aberta(t)), 'tarefa aberta', 'tarefas abertas')}`, acao: o.editor ? { rotulo: 'Redistribuir', href: `#/equipe/${x.p.id}?acao=redistribuir` } : null }))),
  }) : '';

  const ord = ppl.slice().sort((a, b) => (ocupacao(b.id) ?? 0) - (ocupacao(a.id) ?? 0));
  const barras = `<div class="stack m-eq-cap">${ord.map(p => { const oc = ocupacao(p.id); const st = statusPessoa(p); return `<a class="m-eq-capr" href="#/equipe/${esc(p.id)}">${ui.avatar({ ...p, status: st.chave }, 28, { status: true })}<span class="trunc"><b>${esc(p.nome)}</b><small class="mut">${esc(p.area)} · ${esc(st.rotulo)}</small></span>${ui.barra(oc ?? 0, { faixas: 'ocupacao', zona: [LO.min, LO.max], max: Math.max(130, LO.critico + 30), aria: `${p.nome}: ${oc}% de ocupação, ${rotuloOcupacao(oc)}` })}</a>`; }).join('')}</div>
<div class="m-eq-leg sm">${[['info', `Ociosa < ${LO.min}%`], ['ok', `Ideal ${LO.min}–${LO.max}%`], ['warn', `Atenção ${LO.max + 1}–${LO.critico}%`], ['err', `Crítico > ${LO.critico}%`]].map(([e, r]) => `<span><i class="m-eq-sw s-${e}"></i>${r}</span>`).join('')}</div>`;
  const proj = ord.map(p => projecao(p.id));
  const calor = charts.calor({ linhas: ord.map(p => p.nome), colunas: ['Atual', '+1 sem', '+2 sem', '+3 sem'], valores: ord.map((p, i) => proj[i].map((v, j) => (j === 0 && p.status === 'ferias' ? null : v))), formato: { eixo: v => `${v}%`, tip: v => `${v}% de ocupação planejada` }, faixas: 'ocupacao' });
  // sem ninguém marcado como faturável (produção recém-configurada): um estado vazio no lugar dos gráficos
  const semTime = !ppl.length ? ui.card({ titulo: 'Capacidade do time', corpo: ui.vazio({ icone: 'users', titulo: 'Ninguém na capacidade produtiva ainda', texto: 'Marque em Administração › Equipe quem trabalha em clientes (faturável). A ocupação, a projeção de 4 semanas e os cartões de cada pessoa aparecem aqui.', acao: ctx.can('admin', 'ver') ? { rotulo: 'Abrir Administração › Equipe', href: '#/admin/equipe', icone: 'arrow-right' } : undefined }) }) : '';
  const cap = semTime || `<div class="g2">${ui.card({ titulo: 'Mapa de capacidade', sub: 'esta semana', ajuda: `Barra = ocupação planejada; faixa sombreada = zona ideal ${LO.min}–${LO.max}%; traço = 100%. Ociosa aparece em azul (não é problema, é espaço livre).`, corpo: barras })}
${ui.card({ titulo: 'Próximas 4 semanas', sub: 'ocupação planejada', ajuda: 'Projeção a partir das tarefas e da alocação por cliente. Células vazias = férias.', corpo: calor, acoes: ui.btn({ rotulo: 'Calendário de carga', sm: true, tipo: 'ghost', href: '#/operacao/calendario', iconeDir: 'arrow-right' }) })}</div>`;

  const cards = `<div class="g3 m-eq-cards">${ord.map(p => {
    const m = por[p.id]; const st = statusPessoa(p); const s = stats(p.id);
    const agora = db.list('tasks', t => t.respId === p.id && t.status === 'andamento').sort((a, b) => a.prazo.localeCompare(b.prazo))[0];
    const tend = s ? s.historico.slice(-6, -1).concat([ocupacao(p.id)]) : [];
    const oc = ocupacao(p.id);
    return `<article class="card m-eq-pc"><a class="m-eq-pc-a" href="#/equipe/${esc(p.id)}" aria-label="Abrir perfil de ${esc(p.nome)}"></a>
<header>${ui.avatar({ ...p, status: st.chave }, 40, { status: true })}<div class="trunc"><b class="trunc">${esc(p.nome)}</b><small class="mut trunc">${esc(p.cargo)}</small></div>${ui.led(st.estado, st.rotulo)}</header>
<div class="m-eq-now"><span class="sm mut">Fazendo agora</span>${p.status === 'ferias' ? `<p class="mut">De férias até ${esc(fmt.data(p.statusAte))}</p>` : agora ? `<p><b>${esc(agora.titulo)}</b><span class="mut"> · ${esc(nomeCliente(agora.clientId))}</span></p>` : '<p class="mut">Nada em andamento</p>'}</div>
<div class="m-eq-nums"><div><b class="num">${fmt.num(m.semana)}</b><span>entregas na semana</span></div><div><b class="num${m.atrasadas ? ' t-err' : ''}">${fmt.num(m.atrasadas)}</b><span>atrasos</span></div><div><b class="num">${fmt.num(m.nCarteira)}</b><span>clientes</span></div></div>
<div class="m-eq-oc"><div class="row between sm"><span class="mut">Ocupação · 6 semanas</span><b class="num t-${estadoOcupacao(oc) === 'info' ? 'ok' : estadoOcupacao(oc)}">${fmt.pct(oc, 0)}</b></div><div class="m-eq-sp">${charts.spark(tend, { cor: sobrecarga(oc) ? 'var(--err)' : 'var(--acc)', altura: 30, rotulo: 'Ocupação', formato: 'pct' })}</div></div></article>`;
  }).join('')}</div>`;

  const outros = db.list('team', t => t.ativo !== false && !FATURAVEIS.includes(t.id) && t.papel !== 'leitura');
  const apoio = ui.card({ titulo: 'Gestão e apoio', sub: `${outros.length} pessoas · não entram na capacidade produtiva`, corpo: `<div class="m-eq-apoio">${outros.map(t => { const st = statusPessoa(t); return `<a href="#/equipe/${esc(t.id)}" class="m-eq-ap">${ui.avatar({ ...t, status: st.chave }, 30, { status: true })}<span class="trunc"><b>${esc(t.nome)}</b><small class="mut">${esc(t.cargo)}</small></span></a>`; }).join('')}</div>` });
  const nCk = db.count('checkins', c => c.data === isoDia(hoje0()));
  return `${ui.cabecalho({ titulo: 'Equipe', sub: 'Quem está sobrecarregado, quem tem espaço e o que cada pessoa está fazendo agora.', meta: `${ui.led(acima.length ? 'err' : ppl.length ? 'ok' : 'off', acima.length ? `${fmt.plural(acima.length, 'pessoa')} acima de ${LO.critico}%` : ppl.length ? 'Carga saudável' : 'Sem pessoas faturáveis')}<span class="sm mut">${nCk} de ${ppl.filter(p => p.status !== 'ferias').length} check-ins hoje</span>`, acoes: `${ui.btn({ rotulo: 'Atividade e check-ins', icone: 'activity', href: '#/equipe/atividade' })}` })}
${kpis}${comissoesCard()}${burn}${cap}${ppl.length ? `<h2 class="m-eq-h2">Pessoas</h2>${cards}` : ''}${outros.length ? apoio : ''}`;
}

/** resumo das comissões variáveis do mês (só dono/admin — é dinheiro) → Financeiro › Comissões */
function comissoesCard() {
  if (!perms.veReceita()) return '';
  const a = comissoesAtivas(db);
  const nomes = [...a.pessoas].map(id => fmt.primeiro((pessoa(id) || {}).nome || '')).filter(Boolean);
  return `<a class="card m-eq-com" href="#/financeiro/comissoes">${ui.ic('dollar')}<span class="m-eq-com-t">Comissões variáveis do mês: <b class="num">${esc(fmt.brl2(a.total).replace(/,00$/, ''))}</b> · ${fmt.plural(a.pessoas.size, 'pessoa')}${nomes.length ? `<small class="mut"> (${esc(nomes.join(', '))})</small>` : ''}</span><span class="m-eq-com-l sm">Ver em Financeiro › Comissões ${ui.ic('arrow-right')}</span></a>`;
}

/* ---------------- Atividade + check-in ---------------- */
function atividade(ctx, o) {
  const me = teamDeUser(ctx.user); const meP = db.get('team', me);
  const ppl = o.gestor ? FATURAVEIS.map(pessoa).concat(db.list('team', t => !FATURAVEIS.includes(t.id) && t.ativo !== false && t.papel !== 'leitura')) : [pessoa(me)];
  const filtro = o.gestor ? (ctx.query.pessoa || '') : me;
  const lim = addDias(-1).getTime();
  const userTeam = uid => { const u = db.get('users', uid); return u ? u.teamId : String(uid || '').replace(/^u-/, 't-'); };
  const itens = [];
  db.list('tasks').forEach(t => (t.historico || []).forEach(h => { if (new Date(h.quando).getTime() >= lim && h.quem) itens.push({ quando: h.quando, teamId: userTeam(h.quem), txt: `${h.oque}`, alvo: t.titulo, sub: nomeCliente(t.clientId), href: `#/operacao/quadro?tarefa=${t.id}`, tipo: /aprovou|concluiu|enviou/.test(h.oque) ? 'ok' : /ajuste/.test(h.oque) ? 'warn' : 'acc' }); }));
  db.list('deliveries', d => !d.taskId && d.entregueEm && new Date(d.entregueEm).getTime() >= lim).forEach(d => itens.push({ quando: d.entregueEm, teamId: d.respId, txt: 'concluiu a entrega', alvo: d.titulo, sub: nomeCliente(d.clientId), href: `#/clientes/${d.clientId}`, tipo: 'ok' }));
  db.list('comments', c => new Date(c.quando).getTime() >= lim).forEach(c => itens.push({ quando: c.quando, teamId: userTeam(c.autor), txt: 'comentou', alvo: `"${String(c.texto).slice(0, 90)}${c.texto.length > 90 ? '…' : ''}"`, sub: c.refCol === 'tasks' ? (db.get('tasks', c.refId) || {}).titulo : c.refCol === 'clients' ? nomeCliente(c.refId) : '', href: c.refCol === 'tasks' ? `#/operacao/quadro?tarefa=${c.refId}` : c.refCol === 'clients' ? `#/clientes/${c.refId}?comentarios=1` : null, tipo: 'acc' }));
  db.list('checkins', c => new Date(c.quando).getTime() >= lim).forEach(c => itens.push({ quando: c.quando, teamId: c.teamId, txt: 'fez check-in', alvo: c.farei ? `Hoje: ${c.farei}` : '', sub: c.bloqueios ? `Bloqueio: ${c.bloqueios}` : '', tipo: c.bloqueios ? 'warn' : 'ok', href: `#/equipe/${c.teamId}` }));
  db.list('activity', a => a.col !== 'tasks' && a.col !== 'deliveries' && new Date(a.quando).getTime() >= lim && a.quem).forEach(a => itens.push({ quando: a.quando, teamId: userTeam(a.quem), txt: a.oque, alvo: '', tipo: a.deOutroGestor ? 'warn' : 'acc', sub: a.deOutroGestor ? `Cliente de outro gestor (${a.respNome || ''})` : '', outro: !!a.deOutroGestor, href: a.deOutroGestor && a.clientId ? `#/clientes/${a.clientId}/resultados-acoes` : null }));
  const soOutro = ctx.query.outro === '1';
  let feed = itens.filter(x => x.teamId && (!filtro || x.teamId === filtro) && (!soOutro || x.outro)).sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  const hojeIso = isoDia(hoje0());
  const grupo = l => l.map(x => { const p = pessoa(x.teamId); return `<li class="m-eq-fi">${ui.avatar(p, 30)}<div><p><b>${esc(p.nome)}</b> ${esc(x.txt)}${x.alvo ? ` ${x.href ? `<a href="${esc(x.href)}">${esc(x.alvo)}</a>` : `<span>${esc(x.alvo)}</span>`}` : ''}</p><small class="${x.tipo === 'warn' ? 't-warn' : 'mut'}">${x.sub ? `${esc(x.sub)} · ` : ''}${ui.rel(x.quando)}</small></div><span class="m-eq-fd s-${x.tipo}" aria-hidden="true"></span></li>`; }).join('');
  const hoje = feed.filter(x => isoDia(new Date(x.quando)) === hojeIso), ontem = feed.filter(x => isoDia(new Date(x.quando)) !== hojeIso);
  const feedHtml = feed.length ? `${hoje.length ? `<h3 class="td-h m-eq-fh">Hoje</h3><ul class="m-eq-feed">${grupo(hoje)}</ul>` : ''}${ontem.length ? `<h3 class="td-h m-eq-fh">Ontem</h3><ul class="m-eq-feed">${grupo(ontem)}</ul>` : ''}` : ui.vazio({ icone: 'activity', titulo: 'Nenhuma atividade no período', texto: 'Entregas, comentários e check-ins de hoje e ontem aparecem aqui.', compacto: true });
  const chips = (o.gestor ? ui.chips([{ id: '', rotulo: 'Todos' }].concat(ppl.map(p => ({ id: p.id, rotulo: fmt.primeiro(p.nome) }))), filtro, 'pessoa') : '')
    + ui.chips([{ id: '', rotulo: 'Todas as alterações' }, { id: '1', rotulo: 'Alterações em clientes de outro gestor', estado: 'warn', n: itens.filter(x => x.outro && x.teamId && (!filtro || x.teamId === filtro)).length }], soOutro ? '1' : '', 'outro', { rotulo: 'Tipo de alteração' });
  // check-in
  const meu = meP ? db.find('checkins', c => c.teamId === me && c.data === hojeIso) : null;
  const meuCard = meP ? ui.card({
    titulo: 'Seu check-in de hoje', icone: 'check-circle', acoes: ui.btn({ rotulo: meu ? 'Editar' : 'Fazer check-in', tipo: meu ? 'ghost' : 'pri', sm: true, attrs: { 'data-eq': 'checkin' } }),
    corpo: meu ? ui.pares([['O que fiz', esc(meu.fiz)], ['O que farei', esc(meu.farei)], ['Bloqueios', meu.bloqueios ? `<span class="t-warn fw6">${esc(meu.bloqueios)}</span>` : '<span class="mut">Nenhum</span>']], { colunas: 1 }) : `<p class="sm mut">O que fiz · o que farei · bloqueios. Leva 1 minuto e seu gestor lê aqui.</p>`,
  }) : '';
  let painel = '';
  if (o.gestor) {
    const time = FATURAVEIS.map(pessoa);
    const pend = time.filter(p => p.status !== 'ferias' && !db.find('checkins', c => c.teamId === p.id && c.data === hojeIso));
    painel = ui.card({
      titulo: 'Check-ins de hoje', sub: `${time.length - pend.length - time.filter(p => p.status === 'ferias').length} de ${time.filter(p => p.status !== 'ferias').length}`, ajuda: 'Cada pessoa responde: o que fez, o que fará e bloqueios. Bloqueios avisam o gestor.',
      acoes: o.editor && pend.length ? ui.btn({ rotulo: `Lembrar pendentes (${pend.length})`, icone: 'bell', sm: true, attrs: { 'data-eq': 'lembrar' } }) : '',
      corpo: `<ul class="m-eq-cks">${time.map(p => { const c = db.find('checkins', x => x.teamId === p.id && x.data === hojeIso); const e = p.status === 'ferias' ? 'off' : c ? (c.bloqueios ? 'warn' : 'ok') : 'off'; return `<li>${ui.avatar(p, 30)}<div class="trunc"><div class="row between"><a href="#/equipe/${esc(p.id)}"><b>${esc(p.nome)}</b></a>${ui.selo(e, p.status === 'ferias' ? 'Férias' : c ? (c.bloqueios ? 'Com bloqueio' : 'Feito') : 'Pendente')}</div>${c ? `<p class="sm">${esc(c.farei)}</p>${c.bloqueios ? `<p class="sm t-warn">Bloqueio: ${esc(c.bloqueios)}</p>` : ''}<small class="mut">${ui.rel(c.quando)}</small>` : ''}</div></li>`; }).join('')}</ul>`,
    });
  }
  return `${ui.cabecalho({ titulo: o.gestor ? 'Atividade do time' : 'Minha atividade', sub: 'O que foi feito hoje e ontem, e os check-ins diários.', voltar: o.gestor ? { href: '#/equipe', rotulo: 'Equipe' } : null, meta: `<span class="sm mut">${fmt.plural(feed.length, 'registro')} · atualizado ${ui.rel(new Date().toISOString())}</span>` })}
<div class="g-1-2 m-eq-atv"><div class="stack">${meuCard}${painel}</div>${ui.card({ titulo: 'Feed', sub: 'hoje e ontem', corpo: `${chips}${feedHtml}` })}</div>`;
}

/* ---------------- Permissões: mudaram para Administração › Permissões ---------------- */
// #/equipe/acessos é rota antiga: quem pode abrir a Administração é redirecionado; os demais veem onde ficou.
const podeAdmin = ctx => ctx.can('admin', 'ver');
function mudouDeLugar(ctx) {
  const me = teamDeUser(ctx.user);
  const adm = podeAdmin(ctx);
  return ui.card({ corpo: ui.vazio({ icone: 'shield', titulo: 'Permissões mudaram de lugar', texto: adm ? 'A matriz de papéis × módulos agora fica só em Administração › Permissões. Levando você para lá…' : 'A matriz de papéis × módulos agora fica em Administração › Permissões (só dono e administradores). O que você pode acessar aparece na aba Acesso do seu perfil.', acao: adm ? { rotulo: 'Abrir Administração › Permissões', href: '#/admin/permissoes', icone: 'arrow-right' } : me ? { rotulo: 'Ver meu acesso', href: `#/equipe/${me}/acesso` } : { rotulo: 'Voltar ao início', href: '#/' } }) });
}

/* ---------------- módulo ---------------- */
export default {
  id: 'equipe', titulo: 'Equipe', icone: 'users', grupo: 'gestao', rota: 'equipe',
  routes: ['equipe', 'equipe/atividade', 'equipe/acessos', 'equipe/:id', 'equipe/:id/:aba'],
  watch: ['team', 'teamStats', 'tasks', 'deliveries', 'timeEntries', 'goals', 'checkins', 'oneOnOnes', 'users', 'settings', 'clients', 'activity', 'comments'],
  render(ctx) {
    const o = opts(ctx); const me = teamDeUser(ctx.user);
    const seg = ctx.path.split('/');
    if (seg.length === 1) {
      if (o.gestor) return `<div class="pg m-equipe">${visaoTime(ctx, o)}</div>`;
      if (!db.get('team', me)) return restrito('Você não tem um perfil na equipe.');
      ctx.migalha('Meu perfil');
      return `<div class="pg m-equipe">${renderPerfil(ctx, pessoa(me), '', o)}</div>`;
    }
    if (seg[1] === 'atividade' && seg.length === 2) { ctx.migalha('Atividade'); return `<div class="pg m-equipe">${atividade(ctx, o)}</div>`; }
    if (seg[1] === 'acessos' && seg.length === 2) { ctx.migalha('Permissões'); return `<div class="pg m-equipe">${mudouDeLugar(ctx)}</div>`; }
    const id = ctx.params.id; const p = db.get('team', id);
    if (!p) return `<div class="pg m-equipe">${ui.vazio({ icone: 'search', titulo: 'Pessoa não encontrada', texto: `Não existe ninguém na equipe com o código "${id}".`, acao: { rotulo: o.gestor ? 'Ver a equipe' : 'Ver meu perfil', href: o.gestor ? '#/equipe' : `#/equipe/${me}` } })}</div>`;
    if (!o.gestor && id !== me) return restrito('Seu papel permite ver apenas o próprio perfil.', me);
    const aba = ctx.params.aba === 'agora' ? '' : (ctx.params.aba || '');
    if (aba === 'comissoes' && !podeVerComissoes(ctx, p)) return restrito('Comissões são visíveis só para a própria pessoa e para a direção.', me);
    if (!ABAS_PERFIL.some(a => a.id === aba)) return `<div class="pg m-equipe">${ui.vazio({ icone: 'search', titulo: 'Aba não encontrada', acao: { rotulo: 'Voltar ao perfil', href: `#/equipe/${id}` } })}</div>`;
    ctx.migalha(id === me && !o.gestor ? 'Meu perfil' : p.nome);
    return `<div class="pg m-equipe">${renderPerfil(ctx, p, aba, o)}</div>`;
  },
  mount(el, ctx) {
    if (ctx.path === 'equipe/acessos') { if (podeAdmin(ctx)) setTimeout(() => { if (router.path === 'equipe/acessos') router.go('admin/permissoes', { replace: true }); }, 0); return undefined; }
    const o = opts(ctx); const me = teamDeUser(ctx.user);
    const alvo = () => (ctx.params.id && !ESPECIAIS.includes(ctx.params.id) ? ctx.params.id : me);
    const click = async e => {
      const b = e.target.closest('[data-eq]');
      if (b) {
        const k = b.dataset.eq;
        if (k === 'redistribuir') { if (!o.editor) { ui.toast('Só dono e administradores redistribuem tarefas.', { tipo: 'warn' }); return; } await redistribuir(alvo()); }
        else if (k === 'elogio') await elogio(alvo());
        else if (k === 'checkin') await checkin(me);
        else if (k === 'umaum') await registrarUmAUm(alvo());
        else if (k === 'horas') await lancarHoras(alvo());
        else if (k === 'pdi') await avaliarPdi(alvo());
        else if (k === 'ativo') await alternarAtivo(alvo());
        else if (k === 'lembrar') lembrar();
        else if (k === 'foto') await trocarFoto(ctx, alvo());
        return;
      }
      const g = e.target.closest('[data-meta]'); if (g) { await atualizarMeta(g.dataset.meta); }
    };
    const change = async e => {
      const c = e.target.closest('[data-comb]');
      if (c) {
        const [oid, cid] = c.dataset.comb.split('|'); const x = db.get('oneOnOnes', oid); const antes = x.combinados;
        db.update('oneOnOnes', oid, { combinados: x.combinados.map(k => (k.id === cid ? { ...k, feito: c.checked } : k)) });
        ui.toast(c.checked ? 'Combinado concluído.' : 'Combinado reaberto.', { desfazer: () => db.update('oneOnOnes', oid, { combinados: antes }) });
        return;
      }
    };
    el.addEventListener('click', click); el.addEventListener('change', change);
    if (router.query.acao === 'redistribuir' && ctx.params.id) {
      if (o.editor) setTimeout(() => { if (router.query.acao === 'redistribuir' && !document.querySelector('.ov-modal')) redistribuir(ctx.params.id); }, 0);
      else { router.setQuery({ acao: null }); ui.toast('Só dono e administradores redistribuem tarefas.', { tipo: 'warn' }); }
    }
    return () => { el.removeEventListener('click', click); el.removeEventListener('change', change); };
  },
  contador() {
    const ppl = FATURAVEIS.map(id => db.get('team', id)).filter(p => p && p.ativo !== false);
    const acima = ppl.filter(p => sobrecarga(ocupacao(p.id)));
    if (!acima.length) return null;
    const crit = acima.some(p => semanasAcima(p.id) >= limBurnout().critico);
    return { n: acima.length, estado: crit ? 'err' : 'warn', rotulo: `${fmt.plural(acima.length, 'pessoa')} acima de ${limOcupacao().critico}% de ocupação` };
  },
  busca(q) {
    const user = auth.user(); const me = teamDeUser(user);
    const so = soProprio(user);
    return db.list('team', t => t.ativo !== false && (!so || t.id === me) && fmt.norm(`${t.nome} ${t.cargo} ${t.area} ${(t.skills || []).join(' ')}`).includes(q)).slice(0, 8)
      .map(t => { const st = statusPessoa(t); const oc = ocupacao(t.id); return { tipo: 'Pessoas', titulo: t.nome, sub: `${t.cargo} · ${st.rotulo}${oc != null ? ` · ${oc}% de ocupação` : ''}`, href: `#/equipe/${t.id}`, led: st.estado, icone: 'user' }; });
  },
};

async function alternarAtivo(teamId) {
  const p = pessoa(teamId); const u = db.get('users', p.userId); if (!u) return;
  const ativar = u.ativo === false;
  const ok = await ui.confirmar(ativar ? `${p.nome} voltará a entrar no Gmarketing com o papel ${perms.rotuloPapel(u.papel)}.` : `${p.nome} não conseguirá mais entrar. Tarefas e histórico são mantidos.`, { titulo: ativar ? 'Reativar acesso?' : 'Desativar acesso?', confirmar: ativar ? 'Reativar' : 'Desativar', perigo: !ativar });
  if (!ok) return;
  db.update('users', u.id, { ativo: ativar }, { log: `${ativar ? 'reativou' : 'desativou'} o acesso de ${p.nome}` });
  ui.toast(ativar ? 'Acesso reativado.' : 'Acesso desativado.', { desfazer: () => db.update('users', u.id, { ativo: !ativar }) });
}
function lembrar() {
  const hojeIso = isoDia(hoje0());
  const pend = FATURAVEIS.map(pessoa).filter(p => p.status !== 'ferias' && !db.find('checkins', c => c.teamId === p.id && c.data === hojeIso));
  if (!pend.length) return;
  notify.enviar({ para: pend.map(p => userDe(p.id)), tipo: 'mensagem', titulo: 'Lembrete: check-in de hoje', texto: 'O que fiz, o que farei e bloqueios — leva 1 minuto.', link: '#/equipe/atividade' });
  ui.toast(`Lembrete enviado para ${pend.map(p => fmt.primeiro(p.nome)).join(', ')}.`);
}
