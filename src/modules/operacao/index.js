// Operação — visão (contadores, atrasadas, % no prazo, retrabalho/aprovação, SLA), quadro kanban, calendário de carga e projetos/marcos.
import './data.js';
import '../equipe/data.js';
import { db } from '../../core/store.js';
import { ui } from '../../core/ui.js';
import { charts } from '../../core/charts.js';
import { router } from '../../core/router.js';
import { auth } from '../../core/auth.js';
import * as fmt from '../../core/fmt.js';
import { padrao } from '../../core/padroes/index.js';
import { COLUNAS, ROT_STATUS, TIPOS, rotTipo, listaClientes, nomeCliente, cliente, diasPara, dataDe, hoje0, addDias, isoDia, proximosUteis, segunda, atrasada, venceHoje, aberta, FATURAVEIS } from './base.js';
import { pessoa, tarefasVisiveis, entregasNaJanela, pctNoPrazo, serieSemanal, diasAtraso, podeEditarTarefa, escopoProprio, teamDeUser, cargaDiaria, statusPessoa } from './lib.js';
import { novaTarefa, abrirTarefa, moverComRegras, seloPrazo } from './tarefa.js';

const esc = fmt.esc;
const ABAS = [{ id: '', rotulo: 'Visão geral' }, { id: 'quadro', rotulo: 'Quadro' }, { id: 'calendario', rotulo: 'Calendário de carga' }, { id: 'projetos', rotulo: 'Projetos e marcos' }];
// metas e limites da central "Padrões e regras" (src/core/padroes/gestao.js)
const META_PRAZO = () => padrao('operacao.prazo.meta', 95), MIN_PRAZO = () => padrao('operacao.prazo.minimo', 90), META_SLA = () => padrao('operacao.sla.meta', 2);
const RT_META = () => padrao('operacao.retrabalho.meta', 15), RT_CRIT = () => padrao('operacao.retrabalho.critico', 25);

/* ---------------- helpers ---------------- */
const ultimaAtualizacao = () => { const l = db.list('tasks').map(t => t.updatedAt || (t.historico || []).map(h => h.quando).sort().pop() || t.createdAt).filter(Boolean).sort(); return l.pop() || new Date().toISOString(); };
const estRetrab = v => (v > RT_CRIT() ? 'err' : v > RT_META() ? 'warn' : 'ok');
const estAprov = v => (v > 36 ? 'err' : v > 24 ? 'warn' : 'ok');
const estSla = v => (v > META_SLA() * 1.25 ? 'err' : v > META_SLA() ? 'warn' : 'ok');
function retrabalhoDe(lista) { const l = lista.filter(d => d.tipo !== 'reuniao'); if (!l.length) return null; return (l.filter(d => d.ajustes > 0).length / l.length) * 100; }
function aprovMedia(lista) { const l = lista.filter(d => d.aprovacaoH != null); if (!l.length) return null; return l.reduce((a, d) => a + d.aprovacaoH, 0) / l.length; }
function projEstado(p) {
  const ms = p.marcos || []; const feitos = ms.filter(m => m.feito).length;
  if (ms.length && feitos === ms.length) return { estado: 'ok', rotulo: 'Concluído' };
  if (ms.some(m => !m.feito && diasPara(m.data) < 0)) return { estado: 'err', rotulo: 'Marco atrasado' };
  if (ms.some(m => !m.feito && diasPara(m.data) <= 1)) return { estado: 'warn', rotulo: 'Marco vence já' };
  const tot = Math.max(1, diasPara(p.fim) - diasPara(p.inicio)); const dec = Math.min(100, Math.max(0, (-diasPara(p.inicio) / tot) * 100));
  if (dec - (feitos / Math.max(1, ms.length)) * 100 > 30) return { estado: 'warn', rotulo: 'Atrás do ritmo' };
  return { estado: 'ok', rotulo: 'No ritmo' };
}
const marcoEstado = m => (m.feito ? 'ok' : diasPara(m.data) < 0 ? 'err' : diasPara(m.data) <= 1 ? 'warn' : 'off');

/* ---------------- Visão geral ---------------- */
function visao(ctx) {
  const ts = tarefasVisiveis();
  const n = s => ts.filter(t => t.status === s).length;
  const atr = ts.filter(atrasada).sort((a, b) => diasAtraso(b) - diasAtraso(a));
  const sem = serieSemanal();
  const l4 = entregasNaJanela(27, 0), l4a = entregasNaJanela(55, -28);
  const p4 = pctNoPrazo(l4), p4a = pctNoPrazo(l4a);
  const agencia = db.find('teamStats', s => s.agencia) || {};
  const slaSerie = agencia.slaSerie || [];
  const sla = slaSerie.length ? slaSerie[slaSerie.length - 1] : null;
  const edita = ctx.can('operacao', 'editar');

  const kpis = `<div class="g-kpi">
${ui.kpi({ rotulo: 'A fazer', valor: fmt.num(n('afazer')), comp: 'tarefas na fila', href: '#/operacao/quadro', ajuda: 'Tarefas criadas que ainda não começaram.' })}
${ui.kpi({ rotulo: 'Em andamento', valor: fmt.num(n('andamento')), comp: 'sendo produzidas', href: '#/operacao/quadro', ajuda: 'Tarefas que alguém está fazendo agora.' })}
${ui.kpi({ rotulo: 'Em aprovação', valor: fmt.num(n('aprovacao')), comp: 'aguardando aprovador', href: '#/operacao/quadro', ajuda: 'Tarefas enviadas para aprovação interna ou do cliente.' })}
${ui.kpi({ rotulo: 'Atrasadas', valor: fmt.num(atr.length), delta: atr.length ? `${new Set(atr.map(t => t.clientId)).size} clientes` : '', deltaBom: null, comp: 'prazo vencido', alerta: atr.length > 0, led: atr.length ? null : 'ok', href: '#/operacao/quadro?atraso=1', ajuda: 'Tarefas não concluídas com prazo antes de hoje. LED vermelho quando houver qualquer atraso.' })}
${ui.kpi({ rotulo: 'Entregas no prazo', valor: p4 == null ? '—' : fmt.pct(p4, 0), delta: p4 != null && p4a != null ? `${p4 >= p4a ? '▲' : '▼'} ${fmt.pp(Math.abs(p4 - p4a), 0)}` : '', comp: `meta ${META_PRAZO()}% · 4 semanas`, serie: sem.map(s => s.pct ?? 0), formatoSerie: 'pct', led: p4 >= META_PRAZO() ? 'ok' : p4 >= MIN_PRAZO() ? 'warn' : 'err', ajuda: `Entregas concluídas até o prazo ÷ entregas concluídas nas últimas 4 semanas (${l4.length} entregas). Faixa-alvo ${MIN_PRAZO()}–${META_PRAZO()}%.` })}
${ui.kpi({ rotulo: 'SLA de 1ª resposta', valor: sla == null ? '—' : `${fmt.dec(sla, 1)} h`, delta: slaSerie.length > 1 ? `${sla <= slaSerie[slaSerie.length - 2] ? '▼' : '▲'} ${fmt.dec(Math.abs(sla - slaSerie[slaSerie.length - 2]), 1)} h` : '', deltaBom: slaSerie.length > 1 ? sla <= slaSerie[slaSerie.length - 2] : null, comp: `meta < ${META_SLA()} h úteis`, serie: slaSerie, formatoSerie: 'dec', led: estSla(sla), ajuda: 'Tempo médio, em horas úteis, entre a mensagem do cliente e a primeira resposta do atendimento (CS) na última semana.' })}
</div>`;

  // atrasadas
  const porCli = {}; atr.forEach(t => { porCli[t.clientId] = (porCli[t.clientId] || 0) + 1; });
  const pior = Object.entries(porCli).sort((a, b) => b[1] - a[1])[0];
  const listaAtr = ui.lista(atr.map(t => {
    const p = pessoa(t.respId); const d = diasAtraso(t);
    return { estado: d > padrao('operacao.atraso.critico', 2) ? 'err' : 'warn', titulo: t.titulo, href: `#/operacao/quadro?tarefa=${t.id}`, sub: `${nomeCliente(t.clientId)} · ${p.nome} · ${ROT_STATUS[t.status]} · prazo ${fmt.dataCurta(t.prazo)}`, meta: `${d} ${d === 1 ? 'dia' : 'dias'}`, acao: { rotulo: 'Abrir', href: `#/operacao/quadro?tarefa=${t.id}` } };
  }), { vazio: { icone: 'check-circle', titulo: 'Nenhuma entrega atrasada', texto: 'Quando uma tarefa passar do prazo, ela aparece aqui com o responsável e os dias de atraso.', compacto: true } });
  const cardAtr = ui.card({
    titulo: 'Entregas atrasadas', sub: atr.length ? `${atr.length} no total` : 'tudo em dia', icone: 'alert-circle', ajuda: 'Tarefas abertas com prazo vencido. Mais de 2 dias de atraso = vermelho (alerta essencial "entrega atrasada > 2 dias").',
    corpo: `${pior && pior[1] >= 2 ? ui.aviso({ tipo: 'err', titulo: `${nomeCliente(pior[0])} concentra ${pior[1]} das ${atr.length} atrasadas.`, texto: 'Priorize estas entregas e avise o cliente sobre os novos prazos.', acao: ui.btn({ rotulo: 'Abrir ficha', sm: true, href: `#/clientes/${pior[0]}` }) }) : ''}${listaAtr}`,
    acoes: atr.length ? ui.btn({ rotulo: 'Ver no quadro', sm: true, tipo: 'ghost', href: '#/operacao/quadro?atraso=1' }) : '',
  });
  const cardSem = ui.card({
    titulo: '% no prazo por semana', sub: `12 semanas · faixa-alvo ${MIN_PRAZO()}–${META_PRAZO()}%`, ajuda: `Entregas concluídas até o prazo ÷ entregas concluídas em cada janela de 7 dias. Linhas tracejadas: mínimo aceitável (${MIN_PRAZO()}%) e meta (${META_PRAZO()}%).`,
    corpo: charts.linhas({ series: [{ nome: 'No prazo', dados: sem.map(s => (s.pct == null ? null : Math.round(s.pct * 10) / 10)), area: true }], rotulos: sem.map(s => s.rotulo), formato: 'pct', min: 70, max: 100, metas: [{ valor: META_PRAZO(), rotulo: `Meta ${META_PRAZO()}%` }, { valor: MIN_PRAZO(), rotulo: `Mínimo ${MIN_PRAZO()}%` }], destaque: { i: sem.length - 1, texto: `${fmt.pct(sem[sem.length - 1].pct, 0)} na última semana` }, altura: 240 })
      + `<p class="sm mut m-op-nota">${sem.filter(s => s.pct != null && s.pct < MIN_PRAZO()).length} de 12 semanas abaixo do mínimo · últimas 4 semanas: <b class="num">${fmt.pct(p4, 0)}</b> (${l4.filter(d => d.noPrazo).length} de ${l4.length} entregas).</p>`,
  });

  // retrabalho e aprovação
  const dim = ctx.query.rt === 'tipo' ? 'tipo' : 'cliente';
  const hist = entregasNaJanela(83, 0);
  const grupos = {};
  hist.forEach(d => { const k = dim === 'tipo' ? d.tipo : d.clientId; (grupos[k] || (grupos[k] = [])).push(d); });
  const linhasRt = Object.entries(grupos).map(([k, l]) => ({ k, nome: dim === 'tipo' ? rotTipo(k) : nomeCliente(k), n: l.length, rt: retrabalhoDe(l), ap: aprovMedia(l), href: dim === 'cliente' ? `#/clientes/${k}` : null }));
  const rtGeral = retrabalhoDe(hist), apGeral = aprovMedia(hist);
  const cardRt = ui.card({
    titulo: 'Retrabalho e tempo de aprovação', sub: '12 semanas', pad: false, ajuda: `Retrabalho = entregas que voltaram com pedido de ajuste ÷ entregas (sem reuniões). Tempo de aprovação = horas entre "Pedir aprovação" e "Aprovar". Metas: retrabalho ≤ ${RT_META()}%, aprovação ≤ 24 h.`,
    acoes: `<div class="seg" role="group" aria-label="Agrupar por" data-seg-manual>${[['cliente', 'Por cliente'], ['tipo', 'Por tipo']].map(([id, r]) => `<a class="m-op-seg" href="${esc(router.href(null, { rt: id === 'cliente' ? null : id }))}" aria-pressed="${dim === id}">${r}</a>`).join('')}</div>`,
    corpo: `<div class="m-op-resumo"><div><span class="sm mut">Retrabalho geral</span><b class="num">${fmt.pct(rtGeral, 0)}</b>${ui.selo(estRetrab(rtGeral), rtGeral > RT_META() ? `acima da meta de ${RT_META()}%` : 'dentro da meta')}</div><div><span class="sm mut">Aprovação média</span><b class="num">${apGeral == null ? '—' : fmt.dec(apGeral, 0) + ' h'}</b>${ui.selo(estAprov(apGeral), apGeral > 24 ? 'acima de 24 h' : 'dentro da meta')}</div></div>`
      + ui.tabela({
        cols: [
          { k: 'nome', l: dim === 'tipo' ? 'Tipo' : 'Cliente', r: x => (x.href ? `<a href="${esc(x.href)}">${esc(x.nome)}</a>` : esc(x.nome)) },
          { k: 'n', l: 'Entregas', num: true, r: x => fmt.num(x.n) },
          { k: 'rt', l: 'Retrabalho', num: true, r: x => (x.rt == null ? '—' : ui.selo(estRetrab(x.rt), fmt.pct(x.rt, 0))), v: x => x.rt ?? -1 },
          { k: 'ap', l: 'Aprovação', num: true, r: x => (x.ap == null ? '<span class="mut">—</span>' : ui.selo(estAprov(x.ap), `${fmt.dec(x.ap, 0)} h`)), v: x => x.ap ?? -1 },
        ], linhas: linhasRt, ordem: { k: 'rt', dir: 'desc' }, densa: true, legenda: 'Retrabalho e aprovação', altura: 330,
      }),
  });
  const slaCli = (agencia.slaPorCliente || []).slice().sort((a, b) => b.mediaH - a.mediaH);
  const cardSla = ui.card({
    titulo: 'SLA de 1ª resposta (CS)', sub: `meta < ${META_SLA()} h úteis`, ajuda: `Horas úteis até a primeira resposta do atendimento a cada mensagem de cliente (WhatsApp/e-mail). LED: verde ≤ ${fmt.dec(META_SLA(), 1)} h · âmbar até ${fmt.dec(META_SLA() * 1.25, 1)} h · vermelho acima.`,
    corpo: `<div class="row between m-op-sla"><div class="row">${ui.led(estSla(sla), false)}<b class="num m-op-big">${sla == null ? '—' : fmt.dec(sla, 1) + ' h'}</b><span class="sm mut">média da última semana</span></div>${ui.btn({ rotulo: 'Ver atendimento', href: '#/equipe/t-diego/performance', sm: true, tipo: 'ghost' })}</div>
${charts.linhas({ series: [{ nome: 'SLA (h)', dados: slaSerie, cor: 'var(--c4)' }], rotulos: sem.map(s => s.rotulo), formato: { eixo: v => `${fmt.dec(v, 1)} h`, tip: v => `${fmt.dec(v, 1)} h úteis` }, metas: [{ valor: META_SLA(), rotulo: `Meta ${META_SLA()} h` }], min: 0, altura: 160 })}
<h3 class="td-h m-op-sub">Clientes com resposta mais lenta</h3>${ui.lista(slaCli.slice(0, 4).map(c => ({ estado: estSla(c.mediaH), titulo: nomeCliente(c.clientId), href: `#/clientes/${c.clientId}`, sub: `${fmt.pct(c.dentroPct, 0)} das mensagens respondidas dentro da meta`, meta: `${fmt.dec(c.mediaH, 1)} h` })))}`,
  });

  // próximos marcos
  const marcos = db.list('projects').flatMap(p => (p.marcos || []).filter(m => !m.feito).map(m => ({ ...m, p }))).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 5);
  const cardMarcos = ui.card({
    titulo: 'Próximos marcos', acoes: ui.btn({ rotulo: 'Projetos', sm: true, tipo: 'ghost', href: '#/operacao/projetos', iconeDir: 'arrow-right' }),
    corpo: ui.lista(marcos.map(m => ({ estado: marcoEstado(m) === 'off' ? 'ok' : marcoEstado(m), titulo: `${m.titulo}`, sub: `${m.p.nome} · ${nomeCliente(m.p.clientId)}`, meta: diasPara(m.data) < 0 ? `${-diasPara(m.data)} d atrasado` : diasPara(m.data) === 0 ? 'hoje' : fmt.dataCurta(m.data), href: '#/operacao/projetos' })), { vazio: 'Nenhum marco pendente.' }),
  });

  return `${kpis}<div class="g2">${cardAtr}${cardSem}</div><div class="g2">${cardRt}${cardSla}</div><div class="g2">${cardMarcos}${cargaResumo()}</div>`;
}
function cargaResumo() {
  const ppl = FATURAVEIS.map(pessoa).filter(p => p.ativo !== false);
  return ui.card({
    titulo: 'Carga do time hoje', ajuda: 'Horas planejadas para hoje ÷ capacidade do dia (8 h). Zona ideal 70–85%.', acoes: ui.btn({ rotulo: 'Calendário', sm: true, tipo: 'ghost', href: '#/operacao/calendario', iconeDir: 'arrow-right' }),
    corpo: `<div class="stack m-op-carga">${ppl.map(p => { const st = statusPessoa(p); const d = cargaDiaria(p.id, proximosUteis(10))[0]; return `<a class="m-op-cg" href="#/equipe/${esc(p.id)}">${ui.avatar({ ...p, status: st.chave }, 26, { status: true })}<span class="trunc"><b>${esc(p.nome)}</b><small class="mut">${esc(st.rotulo)}</small></span>${d == null ? '<span class="sm mut">de férias</span>' : ui.barra(d, { faixas: 'ocupacao', zona: [70, 85], max: 140 })}</a>`; }).join('')}</div>`,
  });
}

/* ---------------- Quadro ---------------- */
function filtrosQuadro(ctx) { const q = ctx.query; return { pessoa: q.pessoa || '', cliente: q.cliente || '', tipo: q.tipo || '', atraso: q.atraso === '1' }; }
function quadro(ctx) {
  const f = filtrosQuadro(ctx);
  const user = auth.user(); const me = teamDeUser(user);
  let ts = tarefasVisiveis();
  const lim = addDias(-14).getTime();
  ts = ts.filter(t => t.status !== 'feito' || (t.concluidaEm && new Date(t.concluidaEm).getTime() >= lim));
  if (f.pessoa) ts = ts.filter(t => t.respId === f.pessoa);
  if (f.cliente) ts = ts.filter(t => t.clientId === f.cliente);
  if (f.tipo) ts = ts.filter(t => t.tipo === f.tipo);
  if (f.atraso) ts = ts.filter(atrasada);
  const ativos = [f.pessoa, f.cliente, f.tipo, f.atraso].filter(Boolean).length;
  const sel = (nome, rot, ops, v) => `<label class="m-op-f"><span>${esc(rot)}</span><select data-filtro="${nome}" aria-label="Filtrar por ${esc(rot.toLowerCase())}"><option value="">Todos</option>${ops.map(o => `<option value="${esc(o.v)}"${o.v === v ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>`;
  const pessoasOp = FATURAVEIS.map(pessoa).map(p => ({ v: p.id, l: p.id === me ? `${p.nome} (você)` : p.nome }));
  const barra = `<div class="m-op-filtros card"><div class="row">${sel('pessoa', 'Pessoa', pessoasOp, f.pessoa)}${sel('cliente', 'Cliente', listaClientes().map(c => ({ v: c.id, l: c.nome })), f.cliente)}${sel('tipo', 'Tipo', Object.entries(TIPOS).map(([k, x]) => ({ v: k, l: x.rotulo })), f.tipo)}
<label class="ck m-op-ck"><input type="checkbox" data-filtro="atraso"${f.atraso ? ' checked' : ''}><span>Só atrasadas</span></label>
${me && FATURAVEIS.includes(me) && f.pessoa !== me ? `<a class="btn sm ghost" href="${esc(router.href(null, { pessoa: me }))}">${ui.ic('user')}<span>Minhas tarefas</span></a>` : ''}
${ativos ? `<a class="btn sm ghost" href="${esc(router.href(null, { pessoa: null, cliente: null, tipo: null, atraso: null }))}">${ui.ic('x')}<span>Limpar filtros (${ativos})</span></a>` : ''}</div>
<p class="sm mut m-op-dica">${ui.ic('mouse')} Arraste os cartões entre colunas ou use <b>Mover para…</b> (teclado: Tab até o cartão, Enter abre). ${podeEditarTarefa(null) ? '' : escopoProprio(user) ? 'Você só move as suas tarefas.' : 'Seu papel só visualiza.'}</p></div>`;
  const cols = COLUNAS.map(c => {
    let l = ts.filter(t => t.status === c.id);
    l.sort(c.id === 'feito' ? (a, b) => String(b.concluidaEm).localeCompare(String(a.concluidaEm)) : (a, b) => (atrasada(b) - atrasada(a)) || a.prazo.localeCompare(b.prazo));
    const h = l.reduce((a, t) => a + (t.estimativaH || 0), 0);
    return `<section class="kb-col" data-col="${c.id}" aria-label="${esc(c.rotulo)}"><header class="kb-ch"><h2>${esc(c.rotulo)}</h2><span class="kb-n num">${l.length}</span>${c.id !== 'feito' ? `<span class="kb-h num" title="Horas estimadas">${fmt.dec(h, 0)} h</span>` : '<span class="kb-h">últimos 14 dias</span>'}</header>
<div class="kb-list">${l.map(cartao).join('') || `<p class="kb-vz">${c.id === 'afazer' && !ativos ? 'Fila vazia. Crie uma tarefa para começar.' : ativos ? 'Nada com estes filtros.' : 'Arraste tarefas para cá.'}</p>`}</div></section>`;
  }).join('');
  return `${barra}<div class="kb" role="region" aria-label="Quadro de tarefas">${cols}</div>`;
}
function cartao(t) {
  const p = pessoa(t.respId); const edita = podeEditarTarefa(t);
  const ck = t.checklist || []; const ckf = ck.filter(c => c.feito).length;
  const atr = atrasada(t);
  return `<article class="kb-card${atr ? ' is-late' : ''}${edita ? ' can-drag' : ''}" data-id="${esc(t.id)}">
<div class="kb-top"><span class="kb-cli trunc">${esc(nomeCliente(t.clientId))}</span>${edita ? `<span class="kb-grip" data-grip title="Arrastar" aria-hidden="true"></span>` : ''}${ui.btnIc('more', `Mover "${t.titulo}" para…`, { 'data-mover': t.id, ...(edita ? {} : { disabled: true, title: escopoProprio() ? 'Você só pode mover as suas tarefas' : 'Seu papel não edita a Operação' }) }, { cls: 'kb-mv' })}</div>
<button type="button" class="kb-tit" data-abrir="${esc(t.id)}">${esc(t.titulo)}</button>
<div class="kb-meta"><span>${esc(rotTipo(t.tipo))}</span>${ck.length ? `<span title="Checklist" class="num">${ui.ic('list-checks')}${ckf}/${ck.length}</span>` : ''}${t.retrabalho ? `<span class="kb-rt num" title="${esc(fmt.plural(t.retrabalho, 'rodada'))} de ajuste">${ui.ic('refresh')}${t.retrabalho}</span>` : ''}</div>
<div class="kb-foot">${seloPrazo(t, { curto: true })}${ui.avatar(p, 24)}</div></article>`;
}

/* ---------------- Calendário de carga ---------------- */
function calendario(ctx) {
  const dias = proximosUteis(10);
  const ppl = FATURAVEIS.map(pessoa).filter(p => p.ativo !== false);
  const valores = ppl.map(p => cargaDiaria(p.id, dias));
  const crit = ppl.map((p, i) => ({ p, n: valores[i].filter(v => v != null && v > 100).length })).filter(x => x.n);
  const calor = charts.calor({ linhas: ppl.map(p => p.nome), colunas: dias.map(d => `${fmt.diaSemana(d)} ${String(d.getDate()).padStart(2, '0')}`), valores, formato: { eixo: v => `${v}%`, tip: v => `${v}% da capacidade do dia` }, faixas: 'ocupacao' });
  const leg = `<div class="m-op-leg sm">${[['info', 'Ociosa < 70%'], ['ok', 'Ideal 70–85%'], ['warn', 'Atenção 86–100%'], ['err', 'Crítico > 100%']].map(([e, r]) => `<span><i class="m-op-sw s-${e}"></i>${r}</span>`).join('')}<span><i class="m-op-sw s-vazio"></i>Férias</span></div>`;
  const cardCalor = ui.card({
    titulo: 'Carga por pessoa', sub: 'próximos 10 dias úteis', ajuda: 'Horas planejadas ÷ capacidade do dia (8 h). Combina a rotina da pessoa com as tarefas abertas, concentradas nos dias antes de cada prazo. Passe o mouse nas células.',
    corpo: `${crit.length ? ui.aviso({ tipo: 'warn', titulo: `${crit.map(x => fmt.primeiro(x.p.nome)).join(', ')} com dias acima de 100%.`, texto: 'Redistribua tarefas ou negocie prazos antes que virem atraso.', acao: crit.some(x => x.p.id === 't-ana') ? ui.btn({ rotulo: 'Redistribuir', sm: true, href: '#/equipe/t-ana?acao=redistribuir' }) : '' }) : ''}${calor}${leg}`,
  });
  // semana de prazos
  const prox = ctx.query.sem === '1';
  const ini = segunda(addDias(prox ? 7 : 0));
  const semana = Array.from({ length: 5 }, (_, i) => addDias(i, ini));
  const ts = tarefasVisiveis(aberta);
  const antes = ts.filter(t => diasPara(t.prazo) < 0 && dataDe(t.prazo) < ini);
  const diasHtml = semana.map(d => {
    const iso = isoDia(d); const l = ts.filter(t => t.prazo === iso);
    const hoje = iso === isoDia(hoje0());
    return `<div class="m-op-dia${hoje ? ' hoje' : ''}${d < hoje0() ? ' passado' : ''}"><header><b>${esc(fmt.diaSemana(d))}</b><span class="num">${esc(fmt.dataCurta(d))}</span>${l.length ? `<span class="kb-n num">${l.length}</span>` : ''}</header>
${l.map(t => `<a class="m-op-pz${atrasada(t) ? ' is-late' : ''}" href="#/operacao/quadro?tarefa=${esc(t.id)}">${ui.led(atrasada(t) ? 'err' : venceHoje(t) ? 'warn' : t.status === 'aprovacao' ? 'ok' : 'off', false)}<span class="trunc"><b>${esc(t.titulo)}</b><small>${esc(nomeCliente(t.clientId))} · ${esc(ROT_STATUS[t.status])}</small></span>${ui.avatar(t.respId, 22)}</a>`).join('') || '<p class="sm mut m-op-livre">Sem prazos</p>'}</div>`;
  }).join('');
  const cardSem = ui.card({
    titulo: prox ? 'Prazos da próxima semana' : 'Prazos desta semana', sub: `${fmt.dataCurta(semana[0])} a ${fmt.dataCurta(semana[4])}`,
    acoes: `<div class="seg" role="group" aria-label="Semana" data-seg-manual><a class="m-op-seg" href="${esc(router.href(null, { sem: null }))}" aria-pressed="${!prox}">Esta semana</a><a class="m-op-seg" href="${esc(router.href(null, { sem: '1' }))}" aria-pressed="${prox}">Próxima</a></div>`,
    corpo: `${!prox && antes.length ? ui.aviso({ tipo: 'err', titulo: `${fmt.plural(antes.length, 'tarefa atrasada', 'tarefas atrasadas')} de semanas anteriores.`, acao: ui.btn({ rotulo: 'Ver no quadro', sm: true, href: '#/operacao/quadro?atraso=1' }) }) : ''}<div class="m-op-semana">${diasHtml}</div>`,
  });
  return `${cardCalor}${cardSem}`;
}

/* ---------------- Projetos e marcos ---------------- */
function projetos(ctx) {
  const ps = db.list('projects');
  if (!ps.length) return ui.card({ corpo: ui.vazio({ icone: 'flag', titulo: 'Nenhum projeto cadastrado', texto: 'Projetos agrupam tarefas e marcos de um cliente (ex.: site novo, lançamento). Eles aparecem aqui com a linha do tempo.' }) });
  const ini = Math.max(-45, Math.min(...ps.map(p => diasPara(p.inicio)))) - 2, fim = Math.min(75, Math.max(...ps.map(p => diasPara(p.fim)))) + 3;
  const span = fim - ini; const pos = d => Math.min(100, Math.max(0, ((d - ini) / span) * 100));
  const ticks = []; for (let d = ini; d <= fim; d++) { const dt = addDias(d); if (dt.getDay() === 1 && Math.abs(d) > 3) ticks.push(d); }
  const edita = ctx.can('operacao', 'editar') && !escopoProprio();
  const ord = ps.slice().sort((a, b) => ({ err: 0, warn: 1, ok: 2 }[projEstado(a).estado] - { err: 0, warn: 1, ok: 2 }[projEstado(b).estado]) || a.fim.localeCompare(b.fim));
  const linhas = ord.map(p => {
    const e = projEstado(p); const ms = p.marcos || []; const pr = ms.length ? Math.round((ms.filter(m => m.feito).length / ms.length) * 100) : 0;
    const abertas = db.count('tasks', t => t.projetoId === p.id && aberta(t)); const atr = db.count('tasks', t => t.projetoId === p.id && atrasada(t));
    const a = pos(diasPara(p.inicio)), b = pos(diasPara(p.fim));
    return `<div class="gt-row"><div class="gt-lbl">${ui.led(e.estado, false)}<div class="trunc"><b class="trunc">${esc(p.nome)}</b><small class="mut trunc">${esc(nomeCliente(p.clientId))} · ${esc(e.rotulo)} · ${pr}%</small></div>${ui.avatar(p.respId, 22)}</div>
<div class="gt-trk"><i class="gt-bar s-${e.estado}" style="left:${a}%;width:${Math.max(1, b - a)}%"><i style="width:${pr}%"></i></i>${ms.map(m => `<button type="button" class="gt-m s-${marcoEstado(m)}" style="left:${pos(diasPara(m.data))}%" data-tip="${esc(`${m.titulo}\n${fmt.data(m.data)} · ${m.feito ? 'concluído' : diasPara(m.data) < 0 ? `${-diasPara(m.data)} dia(s) de atraso` : diasPara(m.data) === 0 ? 'vence hoje' : `em ${diasPara(m.data)} dia(s)`}`)}" aria-label="${esc(`Marco ${m.titulo}, ${fmt.data(m.data)}, ${m.feito ? 'concluído' : 'pendente'}`)}"></button>`).join('')}</div>
<div class="gt-x sm mut num">${fmt.plural(abertas, 'tarefa aberta', 'tarefas abertas')}${atr ? ` · <span class="t-err fw6">${atr} atrasada${atr > 1 ? 's' : ''}</span>` : ''}</div></div>`;
  }).join('');
  const hojeX = pos(0);
  const gantt = `<div class="gt" style="--hoje:${hojeX}%"><div class="gt-row gt-head"><div class="gt-lbl sm mut">Projeto</div><div class="gt-trk gt-ticks">${ticks.map(d => `<span style="left:${pos(d)}%">${esc(fmt.dataCurta(addDias(d)))}</span>`).join('')}<span class="gt-hoje-l" style="left:${hojeX}%">hoje</span></div><div class="gt-x"></div></div>${linhas}</div>
<div class="m-op-leg sm">${[['ok', 'Marco concluído'], ['warn', 'Vence hoje/amanhã'], ['err', 'Marco atrasado'], ['off', 'Próximo marco']].map(([e, r]) => `<span><i class="gt-m s-${e} lg"></i>${r}</span>`).join('')}</div>`;
  const pend = ps.flatMap(p => (p.marcos || []).filter(m => !m.feito).map(m => ({ ...m, p }))).sort((a, b) => a.data.localeCompare(b.data));
  const tabela = ui.tabela({
    cols: [
      { k: 'titulo', l: 'Marco', r: m => `<b>${esc(m.titulo)}</b><span class="sub">${esc(m.p.nome)}</span>` },
      { k: 'cli', l: 'Cliente', v: m => nomeCliente(m.p.clientId), r: m => `<a href="#/clientes/${esc(m.p.clientId)}">${esc(nomeCliente(m.p.clientId))}</a>` },
      { k: 'data', l: 'Data', r: m => `${ui.led(marcoEstado(m) === 'off' ? 'ok' : marcoEstado(m), diasPara(m.data) < 0 ? `${fmt.dataCurta(m.data)} · ${-diasPara(m.data)} d atraso` : diasPara(m.data) === 0 ? 'Hoje' : fmt.dataCurta(m.data))}` },
      { k: 'resp', l: 'Resp.', v: m => pessoa(m.p.respId).nome, r: m => ui.avatar(m.p.respId, 24) },
      { k: 'ac', l: '', sort: false, r: m => (edita ? ui.btn({ rotulo: 'Concluir', icone: 'check', sm: true, attrs: { 'data-marco': `${m.p.id}|${m.id}` } }) : '') },
    ], linhas: pend, vazio: { titulo: 'Todos os marcos concluídos', texto: 'Novos marcos aparecem aqui conforme os projetos avançam.' }, legenda: 'Marcos pendentes',
  });
  const n = { err: ps.filter(p => projEstado(p).estado === 'err').length, warn: ps.filter(p => projEstado(p).estado === 'warn').length };
  return `${ui.card({ titulo: 'Linha do tempo', sub: `${ps.length} projetos · ${n.err} com marco atrasado · ${n.warn} em atenção`, ajuda: 'Barras = duração do projeto (preenchimento = % de marcos concluídos). Losangos = marcos; passe o mouse para ver data e situação. A linha azul marca hoje.', corpo: gantt })}
${ui.card({ titulo: 'Marcos pendentes', sub: `${pend.length}`, pad: false, corpo: tabela })}`;
}

/* ---------------- módulo ---------------- */
export default {
  id: 'operacao', titulo: 'Operação', icone: 'kanban', grupo: 'gestao', rota: 'operacao',
  routes: ['operacao', 'operacao/:aba'],
  watch: ['tasks', 'deliveries', 'projects', 'teamStats', 'clients', 'team', 'settings', 'users'],
  render(ctx) {
    const aba = ctx.params.aba === 'visao' ? '' : (ctx.params.aba || '');
    const ab = ABAS.find(a => a.id === aba);
    if (!ab) return `<div class="pg">${ui.vazio({ icone: 'search', titulo: 'Aba não encontrada', texto: `"${aba}" não existe em Operação.`, acao: { rotulo: 'Ir para a visão geral', href: '#/operacao' } })}</div>`;
    if (aba) ctx.migalha(ab.rotulo);
    const edita = ctx.can('operacao', 'editar');
    const nAtr = tarefasVisiveis(atrasada).length;
    const acoes = edita ? ui.btn({ rotulo: 'Nova tarefa', icone: 'plus', tipo: 'pri', attrs: { 'data-nova': '', 'aria-keyshortcuts': 't' }, title: 'Nova tarefa (atalho: T)' }) : ui.btn({ rotulo: 'Nova tarefa', icone: 'plus', disabled: true, title: 'Seu papel só visualiza a Operação.' });
    const corpo = aba === 'quadro' ? quadro(ctx) : aba === 'calendario' ? calendario(ctx) : aba === 'projetos' ? projetos(ctx) : visao(ctx);
    return `<div class="pg m-operacao">${ui.cabecalho({ titulo: 'Operação', sub: 'Fluxo de entregas, prazos e carga do time.', acoes, meta: `${ui.led(nAtr ? 'err' : 'ok', nAtr ? `${fmt.plural(nAtr, 'tarefa atrasada', 'tarefas atrasadas')}` : 'Tudo no prazo')}<span class="sm mut">Atualizado ${ui.rel(ultimaAtualizacao())}</span>` })}
${ui.tabs(ABAS.map(a => (a.id === 'quadro' ? { ...a, n: tarefasVisiveis(aberta).length } : a)), aba, 'operacao')}
${corpo}</div>`;
  },
  mount(el, ctx) {
    const offs = [];
    const on = (tipo, fn, opt) => { el.addEventListener(tipo, fn, opt); offs.push(() => el.removeEventListener(tipo, fn, opt)); };
    const onDoc = (tipo, fn, opt) => { document.addEventListener(tipo, fn, opt); offs.push(() => document.removeEventListener(tipo, fn, opt)); };
    on('click', async e => {
      if (e.target.closest('[data-nova]')) { const q = router.query; await novaTarefa({ clientId: q.cliente, respId: q.pessoa, tipo: q.tipo }); return; }
      const ab = e.target.closest('[data-abrir]'); if (ab) { router.setQuery({ tarefa: ab.dataset.abrir }, { push: true }); abrirTarefa(ab.dataset.abrir); return; }
      const mv = e.target.closest('[data-mover]'); if (mv && !mv.disabled) { menuMover(mv); return; }
      const mc = e.target.closest('[data-marco]');
      if (mc) {
        const [pid, mid] = mc.dataset.marco.split('|'); const p = db.get('projects', pid); const m = p.marcos.find(x => x.id === mid);
        const antes = p.marcos;
        db.update('projects', pid, { marcos: p.marcos.map(x => (x.id === mid ? { ...x, feito: true, concluidoEm: new Date().toISOString() } : x)) }, { log: `concluiu o marco "${m.titulo}" de ${p.nome}` });
        ui.toast(`Marco "${m.titulo}" concluído.`, { desfazer: () => db.update('projects', pid, { marcos: antes }) });
      }
    });
    on('change', e => {
      const f = e.target.closest('[data-filtro]'); if (!f) return;
      const k = f.dataset.filtro; router.setQuery({ [k]: f.type === 'checkbox' ? (f.checked ? '1' : null) : (f.value || null) }, { render: true });
    });
    on('keydown', e => {
      const c = e.target.closest && e.target.closest('.kb-card');
      if (c && e.target === c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); c.querySelector('[data-abrir]').click(); }
    });
    onDoc('keydown', e => {
      if (e.key !== 't' && e.key !== 'T') return; if (e.ctrlKey || e.metaKey || e.altKey) return;
      const a = e.target; if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
      if (document.querySelector('.ov')) return;
      const b = el.querySelector('[data-nova]'); if (b) { e.preventDefault(); b.click(); }
    });
    // arrastar e soltar (pointer events): mouse em qualquer parte do cartão; toque/caneta pela alça
    let drag = null;
    on('pointerdown', e => {
      const card = e.target.closest('.kb-card.can-drag'); if (!card || e.button !== 0) return;
      if (e.pointerType !== 'mouse' && !e.target.closest('[data-grip]')) return;
      if (e.pointerType === 'mouse' && e.target.closest('button:not(.kb-tit),a,input,select')) return;
      drag = { card, id: card.dataset.id, x: e.clientX, y: e.clientY, pid: e.pointerId, ativo: false, ghost: null, alvo: null, origem: card.closest('.kb-col').dataset.col };
      if (e.pointerType !== 'mouse') { try { card.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } e.preventDefault(); }
    });
    const mover = e => {
      if (!drag || e.pointerId !== drag.pid) return;
      if (!drag.ativo) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
        drag.ativo = true; const r = drag.card.getBoundingClientRect();
        drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top;
        drag.ghost = drag.card.cloneNode(true); drag.ghost.classList.add('kb-ghost'); drag.ghost.style.width = `${r.width}px`;
        document.body.appendChild(drag.ghost); drag.card.classList.add('kb-src'); document.body.classList.add('kb-dragging');
      }
      e.preventDefault();
      drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(1.5deg)`;
      const alvo = document.elementFromPoint(e.clientX, e.clientY); const col = alvo && alvo.closest && alvo.closest('.m-operacao .kb-col');
      if (drag.alvo && drag.alvo !== col) drag.alvo.classList.remove('kb-drop');
      drag.alvo = col; if (col && col.dataset.col !== drag.origem) col.classList.add('kb-drop');
    };
    const soltar = e => {
      if (!drag || (e && e.pointerId !== drag.pid)) return;
      const d = drag; drag = null;
      if (d.ghost) d.ghost.remove(); d.card.classList.remove('kb-src'); document.body.classList.remove('kb-dragging');
      if (d.alvo) d.alvo.classList.remove('kb-drop');
      if (!d.ativo) return;
      const bloq = ev => { ev.stopPropagation(); ev.preventDefault(); }; d.card.addEventListener('click', bloq, { capture: true, once: true }); setTimeout(() => d.card.removeEventListener('click', bloq, { capture: true }), 50);
      if (e && e.type === 'pointerup' && d.alvo && d.alvo.dataset.col !== d.origem) moverComRegras(d.id, d.alvo.dataset.col);
    };
    onDoc('pointermove', mover, { passive: false });
    onDoc('pointerup', soltar); onDoc('pointercancel', soltar);
    onDoc('keydown', e => { if (e.key === 'Escape' && drag && drag.ativo) { e.stopPropagation(); soltar(null); } }, true);
    // ?tarefa= abre o painel
    const q = router.query.tarefa;
    if (q && (ctx.params.aba === 'quadro' || !ctx.params.aba || true)) setTimeout(() => { if (router.query.tarefa === q && !document.querySelector('.ov-drawer')) abrirTarefa(q); }, 0);
    return () => { offs.forEach(f => f()); if (drag && drag.ghost) drag.ghost.remove(); document.body.classList.remove('kb-dragging'); };
  },
  contador() {
    const n = db.count('tasks', atrasada);
    return n ? { n, estado: 'err', rotulo: `${n} tarefas atrasadas` } : null;
  },
  busca(q) {
    return db.list('tasks', t => fmt.norm(`${t.titulo} ${nomeCliente(t.clientId)} ${pessoa(t.respId).nome}`).includes(q))
      .sort((a, b) => aberta(b) - aberta(a) || atrasada(b) - atrasada(a)).slice(0, 8)
      .map(t => ({ tipo: 'Tarefas', titulo: t.titulo, sub: `${nomeCliente(t.clientId)} · ${pessoa(t.respId).nome} · ${t.status === 'feito' ? 'concluída' : `prazo ${fmt.dataCurta(t.prazo)}`}`, href: `#/operacao/quadro?tarefa=${t.id}`, led: atrasada(t) ? 'err' : venceHoje(t) ? 'warn' : t.status === 'feito' ? 'ok' : undefined, icone: 'kanban' }));
  },
};

/** menu acessível "Mover para…" */
function menuMover(btn) {
  const t = db.get('tasks', btn.dataset.mover); if (!t) return;
  const DESC = { afazer: 'voltar para a fila', andamento: t.status === 'aprovacao' ? 'pedir ajuste' : 'começar a fazer', aprovacao: 'pedir aprovação', feito: t.status === 'aprovacao' ? 'aprovar' : 'concluir' };
  const html = `<div class="m-operacao kb-menu" role="menu" aria-label="Mover para"><p class="kb-menu-t">Mover para…</p>${COLUNAS.filter(c => c.id !== t.status).map(c => `<button type="button" role="menuitem" data-para="${c.id}"><b>${esc(c.rotulo)}</b><small>${esc(DESC[c.id])}</small></button>`).join('')}</div>`;
  const pop = ui.popover(btn, html, { largura: 220 });
  const itens = Array.from(pop.el.querySelectorAll('[data-para]')); itens[0] && itens[0].focus();
  pop.el.addEventListener('keydown', e => {
    const i = itens.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); itens[(i + 1) % itens.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); itens[(i - 1 + itens.length) % itens.length].focus(); }
  });
  pop.el.addEventListener('click', e => { const b = e.target.closest('[data-para]'); if (!b) return; pop.fechar(); btn.focus(); moverComRegras(t.id, b.dataset.para); });
}
