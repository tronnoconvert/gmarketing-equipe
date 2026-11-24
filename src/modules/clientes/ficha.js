// ficha.js — #/clientes/:id — cabeçalho, abas Visão geral (com o cálculo do health score), Entregas, Financeiro,
// painel lateral de Comentários e as ações rápidas (Plano de resgate, Agendar reunião).
import * as K from './calc.js';
import { logo } from './lista.js';
import { COMP_ROT, PESOS, pesosTxt, SEMANAS, HOJE } from './data.js';
import { padrao } from '../../core/padroes/index.js';

/** aba que une "Resultados" e "Ações da equipe" */
export const ABA_RA = 'resultados-acoes';
export const ABAS = [
  { id: '', rotulo: 'Visão geral' }, { id: ABA_RA, rotulo: 'Resultados e ações' }, { id: 'entregas', rotulo: 'Entregas' },
  { id: 'cadastro', rotulo: 'Cadastro' }, { id: 'financeiro', rotulo: 'Financeiro' },
];
/** abas antigas → destino (a query é preservada e somada a estes parâmetros) */
export const ABAS_ANTIGAS = {
  visao: { aba: '' }, resultados: { aba: ABA_RA }, acoes: { aba: ABA_RA, q: { foco: 'acoes' } },
  saude: { aba: '', q: { calc: '1', foco: 'saude' } }, comentarios: { aba: '', q: { comentarios: '1' } },
};
/** estado do painel de comentários (lembrado por navegador) */
const LS_COM = 'aos-clientes-comentarios';
export const comAberto = () => { try { return localStorage.getItem(LS_COM) === '1'; } catch (e) { return false; } };
export const setComAberto = v => { try { localStorage.setItem(LS_COM, v ? '1' : '0'); } catch (e) { /* sem armazenamento: só nesta tela */ } };
export const nComentarios = (db, c) => db.count('comments', x => x.refCol === 'clients' && x.refId === c.id);
const semPerm = 'Sem permissão para editar este cliente. Peça ao administrador.';

export function cabecalhoFicha(ctx, c, aba) {
  const { ui, fmt, notify, db } = ctx;
  const pode = ctx.can('clientes', 'editar');
  const d = K.dias(c.renova);
  const nCom = nComentarios(db, c);
  const rec = K.veReceita();
  const dl = c.delta30 ?? 0;
  const meta = `<div class="m-clientes-hm">
<div><span class="m-clientes-hk">Health</span><span class="m-clientes-hv">${ui.led(K.estH(c.health), false, { aria: K.rotH(c.health) })}<b class="num">${c.health}</b><small class="mut">${K.rotH(c.health)}</small></span></div>
${rec ? `<div><span class="m-clientes-hk">MRR</span><span class="m-clientes-hv"><b class="num">${fmt.brl(c.mrr)}</b></span></div>` : `<div><span class="m-clientes-hk">No prazo ${ui.ajuda('Entregas no prazo nos últimos 90 dias.')}</span><span class="m-clientes-hv">${ui.led(K.estPrazo(c.noPrazo), false)}<b class="num">${fmt.pct(c.noPrazo, 0)}</b></span></div>`}
<div><span class="m-clientes-hk">Renovação</span><span class="m-clientes-hv"><b class="num">${fmt.data(c.renova)}</b>${d >= 0 && d <= K.janelaRenova() ? `<small class="t-warn fw6">em ${fmt.plural(d, 'dia')}</small>` : ''}</span></div>
<div><span class="m-clientes-hk">Score 30d ${ui.ajuda('Variação do health score nos últimos 30 dias.')}</span><span class="m-clientes-hv">${ui.delta(dl === 0 ? '0 pts' : `${dl > 0 ? '▲' : '▼'} ${Math.abs(dl)} pts`, dl === 0 ? null : dl > 0)}</span></div>
<div><span class="m-clientes-hk">Responsável</span><span class="m-clientes-hv">${ui.avatar(c.respId, 22)}<span class="trunc">${fmt.esc(K.nomePessoa(c.respId))}</span></span></div>
</div>`;
  const aberto = comAberto();
  const acoes = `<button type="button" class="btn m-clientes-comb${aberto ? ' on' : ''}" data-com-toggle aria-expanded="${aberto}" aria-controls="m-clientes-com" title="Comentários da equipe sobre ${fmt.esc(c.nome)} (@ menciona)">${ui.ic('message')}<span>Comentários <span class="num">(${nCom})</span></span></button>
${notify.botaoNotificar('clients', c.id, c.nome, { sm: false })}
${pode ? ui.btn({ rotulo: 'Agendar reunião', icone: 'calendar', attrs: { 'data-agendar': '' } }) : ui.btn({ rotulo: 'Agendar reunião', icone: 'calendar', disabled: true, title: semPerm })}
${pode ? ui.btn({ rotulo: 'Plano de resgate', icone: 'shield', tipo: K.emRisco(c) ? 'pri' : '', attrs: { 'data-resgate': '' } }) : ui.btn({ rotulo: 'Plano de resgate', icone: 'shield', disabled: true, title: semPerm })}`;
  return `${ui.cabecalho({ voltar: { href: '#/clientes', rotulo: 'Carteira' }, titulo: c.nome, sub: `${c.segmento} · cliente há ${fmt.plural(Math.max(0, K.mesesDesde(c.desde)), 'mês', 'meses')} (desde ${fmt.mesAno(c.desde)}) · ${c.cidade || ''}${c.status === 'onboarding' ? ' · em onboarding' : ''}`, acoes })}
<div class="m-clientes-hd">${logo(c, 44)}${meta}</div>`;
}
export function tabsFicha(ctx, c, aba) {
  const rec = K.veReceita();
  const nAcoes = K.acoes(c).length;
  const nEnt = K.entregasDe(c).filter(x => !x.feito).length;
  return ctx.ui.tabs(ABAS.filter(t => rec || t.id !== 'financeiro').map(t => ({ ...t, n: t.id === ABA_RA ? nAcoes : t.id === 'entregas' ? (nEnt || null) : null })), aba, `clientes/${c.id}`);
}

/* ================= Comentários (painel lateral / gaveta) ================= */
export function corpoComentarios(ctx, c) {
  return ctx.notify.comentarios('clients', c.id, { titulo: c.nome });
}
export function painelComentarios(ctx, c) {
  const { ui, db, notify } = ctx;
  const n = nComentarios(db, c);
  return `<aside class="m-clientes-com" id="m-clientes-com" aria-label="Comentários">${ui.card({ titulo: `Comentários (${n})`, sub: 'Digite @ para mencionar — a pessoa é notificada', cls: 'm-clientes-comc',
    acoes: `${notify.botaoNotificar('clients', c.id, c.nome, { sm: true })}${ui.btnIc('x', 'Recolher comentários', { 'data-com-fechar': '' })}`, corpo: corpoComentarios(ctx, c) })}</aside>`;
}

/* ================= Visão geral ================= */
const hrefMotivo = (c, link) => (link[0] === '?' ? `#/clientes/${c.id}${link}` : `#/clientes/${c.id}/${link}`);
export function abaVisao(ctx, c) {
  const { ui, fmt, charts } = ctx;
  const comps = K.componentes(c);
  const mot = K.motivos(c);
  const principais = mot.slice(0, 3), outros = mot.slice(3);
  const pode = ctx.can('clientes', 'editar');
  const compHtml = `<div class="m-clientes-comp">${comps.map(x => `<div class="m-clientes-ci">
<div class="row between sm"><span>${fmt.esc(COMP_ROT[x.id])} <span class="mut">· ${x.peso}%</span></span><span class="num"><b class="${x.atual < x.meta * 0.75 ? 't-err' : x.atual < x.meta ? 't-warn' : ''}">${x.atual}</b> <span class="mut">/ meta ${x.meta}</span></span></div>
<div class="m-clientes-bm" role="meter" aria-valuenow="${x.atual}" aria-valuemin="0" aria-valuemax="100" aria-label="${fmt.esc(COMP_ROT[x.id])}: ${x.atual} de meta ${x.meta}"><i class="s-${x.atual < x.meta * 0.75 ? 'err' : x.atual < x.meta ? 'warn' : 'ok'}" style="width:${x.atual}%"></i><em style="left:${x.meta}%" title="Meta ${x.meta}"></em></div></div>`).join('')}</div>`;
  const s = K.score(c);
  const calcAberto = ctx.query.calc === '1';
  const dl = c.delta30 ?? 0;
  const topo = `<div class="m-clientes-hs"><span class="m-clientes-hsv">${ui.led(K.estH(c.health), false, { aria: K.rotH(c.health) })}<b class="num">${c.health}</b><span class="mut">/ 100</span></span><span class="m-clientes-hsm"><b>${K.rotH(c.health)}</b><span class="sm">${ui.delta(dl === 0 ? '0 pts' : `${dl > 0 ? '▲' : '▼'} ${Math.abs(dl)} pts`, dl === 0 ? null : dl > 0)} <span class="mut">em 30 dias</span></span></span></div>`;
  const compCard = ui.card({ titulo: 'Health score', sub: s.penalidade ? `inclui −${s.penalidade} por queda aguda` : 'atual × meta por componente', cls: 'm-clientes-hsc', ajuda: `Cada componente vai de 0 a 100. A barra mostra o valor atual e o traço vertical, a meta. Pesos: ${pesosTxt()}.`, corpo: `${topo}${compHtml}`,
    rodape: `<button type="button" class="btn sm ghost m-clientes-calcb" data-calc aria-expanded="${calcAberto}" aria-controls="m-clientes-calc">${ui.ic(calcAberto ? 'chev-up' : 'chev-down')}<span>${calcAberto ? 'Ocultar cálculo' : 'Ver cálculo'}</span></button><span class="sm mut">pesos, pontos e histórico</span>` });
  const calc = calcAberto ? `<div id="m-clientes-calc" data-foco="saude">${calculoHealth(ctx, c)}</div>` : '';

  const motHtml = mot.length ? `<ul class="m-clientes-mot">${principais.map(m => `<li>${ui.led(m.estado, false)}<span><b>${fmt.esc(m.texto)}</b>${m.link ? ` <a href="${hrefMotivo(c, m.link)}" class="sm">ver</a>` : ''}</span></li>`).join('')}${outros.map(m => `<li class="sec"><i class="m-clientes-pt s-${m.estado}" aria-hidden="true"></i><span>${fmt.esc(m.texto)}${m.link ? ` <a href="${hrefMotivo(c, m.link)}" class="sm">ver</a>` : ''}</span></li>`).join('')}</ul>` : ui.vazio({ icone: 'check-circle', titulo: 'Nenhum sinal de risco', texto: 'Resultado, prazos, pagamento e engajamento dentro do esperado.', compacto: true });
  const motCard = ui.card({ titulo: K.emRisco(c) ? 'Por que está em risco' : 'Sinais de atenção', ajuda: 'Calculado a partir dos dados: resultado abaixo de 70% da meta por 2+ semanas, entregas atrasadas, decisor sem responder há 7+ dias, pagamento em atraso, queda do score, renovação sem reunião e acessos com erro.', cls: K.emRisco(c) ? 'm-clientes-risco' : '', corpo: motHtml,
    acoes: pode && K.emRisco(c) ? ui.btn({ rotulo: 'Plano de resgate', icone: 'shield', sm: true, tipo: 'pri', attrs: { 'data-resgate': '' } }) : '' });

  const pp = K.proximosPassos(c).map(p => ({ estado: p.estado, titulo: p.titulo, sub: p.sub, acao: p.acao && pode ? { rotulo: p.acao === 'resgate' ? 'Montar plano' : 'Agendar', attrs: p.acao === 'resgate' ? { 'data-resgate': '' } : { 'data-agendar': '' }, icone: p.acao === 'resgate' ? 'shield' : 'calendar' } : p.link ? { rotulo: 'Abrir', href: p.link } : null }));
  const ppCard = ui.card({ titulo: 'Próximos passos', corpo: ui.lista(pp) });

  const reun = K.reunioes(c).slice(0, 4);
  const reunCard = ui.card({ titulo: 'Reuniões', sub: reun.length ? `${fmt.plural(K.reunioes(c).length, 'reunião', 'reuniões')} registradas` : '', acoes: pode ? ui.btn({ rotulo: 'Agendar', icone: 'plus', sm: true, attrs: { 'data-agendar': '' } }) : '',
    corpo: ui.lista(reun.map(m => ({ estado: m.status === 'agendada' ? 'ok' : null, avatar: m.status === 'agendada' ? null : (m.participantes || [])[0], titulo: m.titulo, sub: `${fmt.dataHora(m.quando)} · ${m.status === 'agendada' ? 'agendada' : 'realizada'}${m.notas ? ` · ${m.notas}` : ''}`, meta: K.dias(m.quando) >= 0 ? fmt.rel(m.quando) : '' })), { vazio: { titulo: 'Nenhuma reunião registrada', texto: 'Agende a primeira reunião de resultados com o cliente.', compacto: true } }) });

  const rs = K.resultados(c); const mets = K.metricasDe(c);
  const mini = mets.length ? `<div class="m-clientes-mini">${mets.map(k => { const meta = c.metas[K.METRICAS[k].meta]; const v = K.ultimo(rs[k]); const r = K.razao(k, v, meta); const e = r == null ? 'off' : r >= 1 ? 'ok' : r >= 0.75 ? 'warn' : 'err';
    return `<a class="m-clientes-mi" href="#/clientes/${c.id}/${ABA_RA}?m=${k}"><span class="sm mut">${fmt.esc(K.METRICAS[k].rotulo)}</span><b class="num">${K.METRICAS[k].fmt(v)}</b><span class="sm">${ui.selo(e, `meta ${K.METRICAS[k].fmt(meta)}`, { cls: 'm-clientes-selo' })}</span><div class="m-clientes-mis">${charts.spark(rs[k].filter(x => x != null), { cor: e === 'err' ? 'var(--err)' : 'var(--acc)', area: false, altura: 26, rotulo: K.METRICAS[k].rotulo })}</div></a>`; }).join('')}</div>` : ui.vazio({ titulo: 'Sem metas cadastradas', texto: 'Cadastre as metas do cliente (ROAS, CPL, leads, faturamento) para acompanhar os resultados.', acao: { rotulo: 'Abrir cadastro', href: `#/clientes/${c.id}/cadastro` }, compacto: true });
  const resCard = ui.card({ titulo: 'Resultados vs metas', sub: 'Última semana', corpo: `${tetoLinha(ctx, c, pode)}${mini}`, acoes: ui.btn({ rotulo: 'Resultados e ações', href: `#/clientes/${c.id}/${ABA_RA}`, sm: true, tipo: 'ghost', iconeDir: 'arrow-right' }) });

  const rapidas = `<div class="m-clientes-rap">${pode ? `${ui.btn({ rotulo: 'Plano de resgate', icone: 'shield', attrs: { 'data-resgate': '' } })}${ui.btn({ rotulo: 'Agendar reunião', icone: 'calendar', attrs: { 'data-agendar': '' } })}${ui.btn({ rotulo: 'Registrar ação', icone: 'plus', attrs: { 'data-reg-acao': '' } })}` : ''}${ui.btn({ rotulo: 'Abrir cadastro', icone: 'file', href: `#/clientes/${c.id}/cadastro` })}</div>`;

  return `<div class="g-2-1">${motCard}${compCard}</div>${calc}
<div class="g2">${resCard}${ppCard}</div>
<div class="g-2-1">${reunCard}${ui.card({ titulo: 'Ações rápidas', corpo: rapidas })}</div>`;
}

/** "Teto de mídia: R$ X/mês (≈ R$ Y/dia)" — orçamento de anúncios do cliente (não é receita da agência: visível a toda a equipe do cliente) */
export function tetoLinha(ctx, c, pode) {
  const { ui, fmt } = ctx;
  const m = Number(c.tetoMidiaMensal) || 0; const d = K.tetoDiarioCliente(c);
  const pago = (c.servicos || []).some(s => s === 'Tráfego' || s === 'Google');
  const aj = ui.ajuda('Teto máximo que o cliente aceita investir em anúncios por mês (Meta Ads + Google Ads). Diário = mensal ÷ 30,4. A Torre usa este valor para avisar quando a verba programada passa do teto.');
  if (m > 0) return `<p class="m-clientes-teto">${ui.ic('wallet')}<span>Teto de mídia: <b class="num">${fmt.brl(m)}/mês</b> <span class="mut num">(≈ ${fmt.brl(d)}/dia)</span></span>${aj}</p>`;
  if (!pago) return '';
  return `<p class="m-clientes-teto sem">${ui.ic('wallet')}<span>Teto de mídia não informado${pode ? ` · <a href="#/clientes/${c.id}/cadastro?editar=1">informar no cadastro</a>` : ''}</span>${aj}</p>`;
}

/* ================= Entregas ================= */
export function abaEntregas(ctx, c) {
  const { ui, fmt } = ctx;
  const l = K.entregasDe(c);
  const feitas = l.filter(x => x.feito);
  const noPrazo = feitas.length ? Math.round((feitas.filter(x => x.noPrazo).length / feitas.length) * 100) : c.noPrazo;
  const atrasadas = l.filter(x => x.atrasada);
  const STATUS = { a_fazer: 'A fazer', afazer: 'A fazer', andamento: 'Em andamento', em_andamento: 'Em andamento', aprovacao: 'Em aprovação', feito: 'Feito', concluida: 'Concluída', entregue: 'Entregue' };
  const kp = `<div class="g-kpi">
${ui.kpi({ rotulo: 'Entregas no prazo', valor: fmt.pct(noPrazo, 0), comp: feitas.length ? `${feitas.length} concluídas` : 'últimos 90 dias', led: K.estPrazo(noPrazo), ajuda: 'Concluídas até a data de prazo ÷ total concluído. ≥90% ok · 75–89% atenção · <75% crítico.' })}
${ui.kpi({ rotulo: 'Atrasadas agora', valor: String(l.length ? atrasadas.length : c.atrasadas || 0), alerta: (l.length ? atrasadas.length : c.atrasadas) > 0, comp: 'abertas e com prazo vencido' })}
${ui.kpi({ rotulo: 'Em aberto', valor: String(l.filter(x => !x.feito).length), comp: 'tarefas e entregas' })}
</div>`;
  const tbl = l.length ? ui.tabela({
    cols: [
      { k: 'titulo', l: 'Entrega / tarefa', r: x => `<b>${fmt.esc(x.titulo || x.nome || 'Sem título')}</b><span class="sub">${x._col === 'tasks' ? 'Tarefa' : 'Entrega'}${x.origem === 'plano-resgate' ? ' · plano de resgate' : ''}</span>` },
      { k: 'respId', l: 'Responsável', v: x => K.nomePessoa(x.respId || x.responsavel), r: x => `<span class="row" style="flex-wrap:nowrap">${ui.avatar(x.respId || x.responsavel, 22)}<span class="trunc">${fmt.esc(K.nomePessoa(x.respId || x.responsavel))}</span></span>` },
      { k: 'prazo', l: 'Prazo', r: x => (x.prazo ? fmt.data(x.prazo) : '—') },
      { k: 'status', l: 'Status', r: x => (x.atrasada ? ui.selo('err', `Atrasada ${-K.dias(x.prazo)} d`) : x.feito ? ui.selo(x.noPrazo ? 'ok' : 'warn', x.noPrazo ? 'No prazo' : 'Entregue com atraso') : ui.selo('info', STATUS[x.status] || x.status || 'Aberta')) },
    ], linhas: l, legenda: 'Entregas do cliente', ordem: { k: 'prazo', dir: 'desc' },
    onRowHref: x => (x._col === 'tasks' ? `#/operacao/quadro?tarefa=${x.id}` : null),
  }) : ui.vazio({ icone: 'list-checks', titulo: 'Nenhuma entrega registrada para este cliente', texto: `As entregas e tarefas criadas em Operação com o cliente ${c.nome} aparecem aqui, com a regra de prazo. ${c.atrasadas ? `O último cálculo do health score apontou ${fmt.plural(c.atrasadas, 'entrega atrasada', 'entregas atrasadas')}.` : ''}`, acao: { rotulo: 'Abrir Operação', href: '#/operacao/quadro', icone: 'kanban' } });
  return `${kp}${ui.card({ titulo: 'Entregas e tarefas', sub: 'Fonte: Operação', pad: l.length ? false : undefined, ajuda: 'Regra de prazo: entregue até a data = no prazo; aberta após a data = atrasada (vermelho, exige ação).', corpo: tbl })}`;
}

/* ================= Cálculo do health score (expansor da Visão geral) ================= */
function calculoHealth(ctx, c) {
  const { ui, fmt, charts } = ctx;
  const comps = K.componentes(c); const s = K.score(c);
  const hh = K.historicoHealth(c);
  const tabela = `<table class="tbl densa m-clientes-calc" aria-label="Cálculo do health score"><thead><tr><th scope="col">Componente</th><th scope="col" class="n">Peso</th><th scope="col" class="n">Atual</th><th scope="col" class="n">Meta</th><th scope="col" class="n">Pontos</th></tr></thead><tbody>
${comps.map(x => `<tr><td>${fmt.esc(COMP_ROT[x.id])}</td><td class="n num">${x.peso}%</td><td class="n num"><b class="${x.atual < x.meta * 0.75 ? 't-err' : x.atual < x.meta ? 't-warn' : ''}">${x.atual}</b></td><td class="n num mut">${x.meta}</td><td class="n num">${fmt.dec(x.pontos, 1)}</td></tr>`).join('')}
${s.penalidade ? `<tr><td colspan="4">Penalidade por queda aguda (−${padrao('clientes.health.quedaPenalidade', 15)} pts ou mais em 30 dias)</td><td class="n num t-err">−${s.penalidade}</td></tr>` : ''}
</tbody><tfoot><tr><th scope="row" colspan="4">Health score</th><td class="n num"><b>${c.health}</b></td></tr></tfoot></table>`;
  const como = `<div class="m-clientes-como sm"><p><b>Como é calculado.</b> Cada componente vai de 0 a 100 e tem um peso: Resultado vs meta ${PESOS.resultado}% · Entregas no prazo ${PESOS.prazo}% · Engajamento ${PESOS.engajamento}% · Pagamento em dia ${PESOS.pagamento}%. Pontos = atual × peso. Se o score cair ${padrao('clientes.health.quedaPenalidade', 15)} pts ou mais em 30 dias, aplicamos −${padrao('clientes.health.penalidade', 5)} para destacar o risco agudo.</p>
<p class="mut">Resultado: média das metas (ROAS, CPL, leads, faturamento) atingidas · Prazo: entregas no prazo menos atrasos abertos · Engajamento: respostas, presença em reuniões e aprovações · Pagamento: atraso das faturas. Faixas: ${K.faixasHTxt().replace('<', '&lt;')}. Pesos e faixas: Padrões e regras. Recalculado de hora em hora pela rotina "Health score dos clientes" (Torre de Controle).</p></div>`;
  const vals = hh ? hh.valores : [];
  const hist = hh && vals.some(v => v != null) ? charts.linhas({ series: [{ nome: 'Health score', dados: vals, area: true, cor: K.estH(c.health) === 'err' ? 'var(--err)' : K.estH(c.health) === 'warn' ? 'var(--warn)' : 'var(--c1)' }], rotulos: SEMANAS.map(fmt.dataCurta), formato: 'num', min: 0, max: 100, metas: [{ valor: K.limH().ok, rotulo: `Saudável ≥ ${K.limH().ok}` }, { valor: K.limH().risco, rotulo: `Risco < ${K.limH().risco}` }], altura: 240, destaque: { i: vals.length - 1, texto: `Hoje · ${c.health}` } }) : ui.vazio({ titulo: 'Sem histórico ainda', texto: 'O histórico começa a ser gravado no primeiro cálculo do score.', compacto: true });
  return ui.card({ titulo: 'Cálculo do health score', sub: `Score ${c.health} · ${K.rotH(c.health)}`, cls: 'm-clientes-calcc', icone: 'activity',
    acoes: ui.btnIc('x', 'Ocultar cálculo', { 'data-calc': '' }),
    corpo: `<div class="m-clientes-calcg"><div class="stack"><h3 class="m-clientes-h3">Componentes, pesos e pontos</h3>${tabela}</div><div class="stack"><h3 class="m-clientes-h3">Histórico (26 semanas) ${ui.ajuda('Score semanal. Linhas tracejadas: limite de saudável (75) e de risco (60).')}</h3>${hist}</div></div>${como}` });
}

/* ================= Financeiro ================= */
export function abaFinanceiro(ctx, c) {
  const { ui, fmt, charts, db } = ctx;
  const inv = db.list('invoices', x => x.clientId === c.id).sort((a, b) => String(b.vencimento || b.venc || '').localeCompare(String(a.vencimento || a.venc || '')));
  const ctr = db.find('contracts', x => x.clientId === c.id) || {};
  const ST = { paga: ['ok', 'Paga'], pago: ['ok', 'Paga'], aberta: ['info', 'Em aberto'], aberto: ['info', 'Em aberto'], a_vencer: ['info', 'A vencer'], vencida: ['err', 'Vencida'], atrasada: ['err', 'Vencida'], cancelada: ['off', 'Cancelada'] };
  const tbl = inv.length ? ui.tabela({
    cols: [
      { k: 'competencia', l: 'Competência', v: x => x.competencia || x.vencimento || x.venc, r: x => fmt.esc(x.competencia ? fmt.mesAno(x.competencia.length === 7 ? x.competencia + '-01' : x.competencia) : fmt.mesAno(x.vencimento || x.venc)) },
      { k: 'valor', l: 'Valor', num: true, r: x => fmt.brl2(x.valor) },
      { k: 'vencimento', l: 'Vencimento', v: x => x.vencimento || x.venc, r: x => fmt.data(x.vencimento || x.venc) },
      { k: 'status', l: 'Status', r: x => { const st = ST[String(x.status || '').toLowerCase()] || ['info', x.status || '—']; return ui.led(st[0], st[1]); } },
      { k: 'acao', l: '', sort: false, r: x => (/venc|atras/.test(String(x.status)) && ctx.can('financeiro', 'editar') ? ui.btn({ rotulo: 'Cobrar', sm: true, href: `#/financeiro/receber?cobrar=${x.id}` }) : '') },
    ], linhas: inv.slice(0, 12), legenda: 'Faturas do cliente', ordem: { k: 'vencimento', dir: 'desc' },
  }) : ui.vazio({ icone: 'file', titulo: 'Nenhuma fatura encontrada', texto: `As faturas do contrato aparecem aqui quando o Financeiro emitir. Situação atual informada pelo cadastro: ${c.pagamento.texto}.`, acao: ctx.can('financeiro') ? { rotulo: 'Abrir contas a receber', href: '#/financeiro/receber' } : null, compacto: true });
  // MRR (12 meses) — reajuste no aniversário do contrato
  const meses = Array.from({ length: 12 }, (_, i) => { const d = fmt.toDate(HOJE); d.setDate(1); d.setMonth(d.getMonth() - 11 + i); return d; });
  const ini = fmt.toDate(c.desde); const aniv = ini ? ini.getMonth() : 0;
  const hj = fmt.toDate(HOJE); const ultAniv = new Date(aniv <= hj.getMonth() ? hj.getFullYear() : hj.getFullYear() - 1, aniv, 1);
  const teveReajuste = ini && ultAniv.getFullYear() > ini.getFullYear();
  const serie = meses.map(d => { if (ini && d < new Date(ini.getFullYear(), ini.getMonth(), 1)) return null; return teveReajuste && d < ultAniv ? Math.round(c.mrr / (1 + (ctr.reajustePct || 0) / 100)) : c.mrr; });
  const mrrChart = serie.some(v => v != null) ? charts.barras({ rotulos: meses.map(d => fmt.mesAno(d).slice(0, 3)), series: [{ nome: 'MRR', dados: serie.map(v => v ?? 0) }], formato: 'brl', altura: 200, destaque: 11 }) : '';
  // rentabilidade
  const ini30 = K.addDias(HOJE, -30);
  const te = db.list('timeEntries', x => x.clientId === c.id && String(x.data || x.quando || '').slice(0, 10) >= ini30);
  const hrs = x => Number(x.horas) || (Number(x.minutos) || 0) / 60;
  const horasReais = te.reduce((a, x) => a + hrs(x), 0);
  const custoReal = te.reduce((a, x) => a + hrs(x) * ((K.pessoa(x.teamId) || {}).custoHora || 70), 0);
  const eq = (c.equipe || []).map(K.pessoa).filter(Boolean);
  const horasEst = Math.round(c.mrr / 95);
  const horas = te.length ? Math.round(horasReais) : horasEst;
  const custoHora = eq.length ? eq.reduce((a, p) => a + (p.custoHora || 0), 0) / eq.length : 70;
  const custo = Math.round(te.length ? custoReal : horas * custoHora);
  const margem = c.mrr ? ((c.mrr - custo) / c.mrr) * 100 : 0;
  const rent = `<div class="g-kpi m-clientes-rent">
${ui.kpi({ rotulo: 'Receita (MRR)', valor: fmt.brl(c.mrr), comp: 'por mês' })}
${ui.kpi({ rotulo: 'Custo da equipe', valor: fmt.brl(custo), comp: te.length ? `${horas} h lançadas nos últimos 30 dias` : `${horas} h × ${fmt.brl(custoHora)}/h (estimado)`, ajuda: te.length ? 'Horas lançadas nos últimos 30 dias × custo/hora de cada pessoa (Equipe).' : 'Sem horas lançadas: estimativa de 1 h a cada R$ 95 de MRR × custo/hora médio da equipe do cliente.' })}
${ui.kpi({ rotulo: 'Margem de contribuição', valor: fmt.pct(margem, 0), led: margem >= 40 ? 'ok' : margem >= 25 ? 'warn' : 'err', comp: margem >= 40 ? 'saudável (meta ≥ 40%)' : 'abaixo da meta de 40%' })}
</div>`;
  const pares = ui.pares([['Início', fmt.data(ctr.inicio || c.desde)], ['MRR do contrato', fmt.brl(ctr.mrr || c.mrr)], ['Índice de reajuste', `${fmt.esc(ctr.indice || '—')}${ctr.reajustePct ? ` · ${fmt.pct(ctr.reajustePct)}` : ''}`], ['Fidelidade', ctr.fidelidadeMeses ? `${ctr.fidelidadeMeses} meses` : '—'], ['Renovação', `${fmt.data(c.renova)}${ctr.renovacaoAuto === false ? ' · manual' : ' · automática'}`], ['Pagamento', ui.led(c.pagamento.estado, c.pagamento.texto)], ['Multa rescisória', fmt.esc(ctr.multaRescisao || '—')], ['Contrato (PDF)', ctr.pdf ? `<span class="row">${ui.ic('file')}${fmt.esc(ctr.pdf)}</span>` : '—']]);
  return `${rent}<div class="g2">${ui.card({ titulo: 'Contrato', corpo: pares, acoes: ui.btn({ rotulo: 'Editar', href: `#/clientes/${c.id}/cadastro`, sm: true, tipo: 'ghost' }) })}${ui.card({ titulo: 'MRR — 12 meses', ajuda: 'Valor mensal do contrato; muda no reajuste anual (aniversário do contrato).', corpo: mrrChart || ui.vazio({ titulo: 'Sem histórico', compacto: true }) })}</div>
${ui.card({ titulo: 'Faturas', sub: 'Fonte: Financeiro', pad: inv.length ? false : undefined, corpo: tbl })}`;
}

/* ================= Plano de resgate ================= */
function sugestoesResgate(c) {
  const mot = K.motivos(c);
  const temTrafego = (c.servicos || []).some(s => /Tráfego|Google/.test(s));
  const producao = (c.equipe || []).find(t => ['t-carla', 't-elisa'].includes(t)) || 't-carla';
  const l = [];
  if (mot.some(m => m.tipo === 'resultado')) {
    if (temTrafego) l.push({ titulo: 'Revisar estrutura de campanhas e testar campanha de catálogo', respId: 't-ana', prazo: 3 });
    l.push({ titulo: 'Produzir novo lote de criativos focado nas ofertas que mais vendem', respId: producao, prazo: 5 });
  }
  if (mot.some(m => m.tipo === 'engajamento')) l.push({ titulo: 'Ligar para o decisor e marcar reunião de resgate', respId: c.respId === 't-ana' ? 't-diego' : c.respId, prazo: 1 });
  if (comAtraso(c)) l.push({ titulo: `Colocar em dia as ${c.atrasadas} entregas atrasadas`, respId: c.respId, prazo: 2 });
  if (mot.some(m => m.tipo === 'pagamento')) l.push({ titulo: 'Negociar a fatura em atraso com o financeiro do cliente', respId: 't-paulo', prazo: 2 });
  if (mot.some(m => m.tipo === 'acesso')) l.push({ titulo: 'Regularizar acessos com erro (token/permissões)', respId: 't-diego', prazo: 1 });
  l.push({ titulo: 'Apresentar o plano de resgate e as metas de 30 dias ao cliente', respId: c.respId, prazo: 7 });
  return l;
}
const comAtraso = c => (c.atrasadas || 0) > 0;

export async function planoResgate(ctx, c) {
  const { ui, fmt, db, notify } = ctx;
  const time = db.list('team', t => t.ativo !== false && t.papel !== 'leitura').map(t => ({ v: t.id, l: t.nome }));
  const sug = sugestoesResgate(c);
  const mot = K.motivos(c).slice(0, 3);
  const linha = (s, i) => `<div class="m-clientes-rg" data-i="${i}">
<label class="ck"><input type="checkbox" name="usar-${i}" checked><span class="sr">Incluir tarefa</span></label>
<div class="m-clientes-rgc"><input type="text" name="titulo-${i}" value="${fmt.esc(s.titulo)}" aria-label="Tarefa ${i + 1}" required>
<div class="m-clientes-rgm"><select name="resp-${i}" aria-label="Responsável da tarefa ${i + 1}">${time.map(t => `<option value="${t.v}"${t.v === s.respId ? ' selected' : ''}>${fmt.esc(t.l)}</option>`).join('')}</select>
<input type="text" name="prazo-${i}" data-mask="data" inputmode="numeric" value="${fmt.data(K.addDias(HOJE, s.prazo))}" aria-label="Prazo da tarefa ${i + 1}" placeholder="dd/mm/aaaa"></div></div></div>`;
  const corpo = `<form class="stack m-clientes-rgf" novalidate>
${mot.length ? `<div class="m-clientes-rgmot"><span class="sm mut">Motivos detectados</span><ul>${mot.map(m => `<li>${ui.led(m.estado, false)}${fmt.esc(m.texto)}</li>`).join('')}</ul></div>` : ''}
<div class="m-clientes-rgl"><div class="row between"><b class="sm">Tarefas (vão para o quadro da Operação)</b><span class="sm mut">desmarque o que não fizer sentido</span></div>${sug.map(linha).join('')}</div>
<button type="button" class="btn sm ghost" data-add-rg>${ui.ic('plus')}<span>Adicionar tarefa</span></button>
${ui.campo({ nome: 'obs', rotulo: 'Objetivo do plano', tipo: 'textarea', valor: K.emRisco(c) ? `Voltar o health score para 60+ em 30 dias.` : 'Proteger a conta e antecipar riscos.', linhas: 2 })}
${ui.campo({ nome: 'avisar', rotulo: 'Notificar os responsáveis (app + WhatsApp)', tipo: 'checkbox', valor: true })}
</form>`;
  let criadas = [];
  const ok = await ui.modal({
    titulo: 'Plano de resgate', sub: `${c.nome} · health ${c.health}${K.veReceita() ? ` · MRR ${fmt.brl(c.mrr)}` : ''}`, corpo, confirmar: 'Criar tarefas e notificar', largura: 'lg',
    onAbrir: box => {
      box.querySelector('[data-add-rg]').addEventListener('click', () => {
        const wrap = box.querySelector('.m-clientes-rgl'); const i = wrap.querySelectorAll('.m-clientes-rg').length;
        wrap.insertAdjacentHTML('beforeend', linha({ titulo: '', respId: c.respId, prazo: 5 }, i));
        wrap.querySelector(`[name="titulo-${i}"]`).focus();
      });
    },
    onConfirmar: box => {
      const f = box.querySelector('form'); ui.form.limparErros(f);
      const d = ui.form.ler(f);
      const n = box.querySelectorAll('.m-clientes-rg').length;
      const tarefas = [];
      for (let i = 0; i < n; i++) {
        if (!d[`usar-${i}`]) continue;
        const titulo = (d[`titulo-${i}`] || '').trim(); const prazo = d[`prazo-${i}`];
        if (!titulo) { const inp = f.querySelector(`[name="titulo-${i}"]`); inp.setAttribute('aria-invalid', 'true'); inp.focus(); return 'Descreva a tarefa ou desmarque a linha vazia.'; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo || '')) { const inp = f.querySelector(`[name="prazo-${i}"]`); inp.setAttribute('aria-invalid', 'true'); inp.focus(); return `Prazo inválido na tarefa "${titulo}". Use dd/mm/aaaa.`; }
        tarefas.push({ titulo, respId: d[`resp-${i}`], prazo });
      }
      if (!tarefas.length) return 'Inclua pelo menos uma tarefa no plano.';
      db.batch(() => {
        criadas = tarefas.map(t => db.insert('tasks', { titulo: t.titulo, clientId: c.id, respId: t.respId, status: 'a_fazer', prazo: t.prazo, origem: 'plano-resgate', prioridade: 'alta' }));
        const acao = db.insert('clientActions', { clientId: c.id, data: HOJE, quem: ctx.user && ctx.user.teamId, tipo: 'Reunião de alinhamento', area: 'cs', metrica: null, descricao: `Plano de resgate aprovado: ${tarefas.length} tarefas (${tarefas.map(t => t.titulo).slice(0, 2).join('; ')}${tarefas.length > 2 ? '…' : ''}).`, antes: `Health ${c.health}`, depois: '', expectativa: d.obs || '', resultado: '', origem: 'manual', planoResgate: true });
        db.update('clients', c.id, { planoResgate: { data: HOJE, tarefas: criadas.map(x => x.id), acaoId: acao.id, objetivo: d.obs || '' } }, { log: `criou plano de resgate para ${c.nome}` });
        criadas._acao = acao.id;
      });
      if (d.avisar) {
        const porResp = {};
        tarefas.forEach(t => { (porResp[t.respId] = porResp[t.respId] || []).push(t); });
        Object.entries(porResp).forEach(([tid, ts]) => {
          const u = K.userDe(tid); if (!u) return;
          notify.enviar({ para: [u], titulo: `Plano de resgate: ${c.nome}`, texto: ts.map(t => `• ${t.titulo} (até ${fmt.data(t.prazo)})`).join('\n'), link: `#/clientes/${c.id}`, tipo: 'atribuicao', prioridade: 'alta', canais: ['app', 'whatsapp'], refCol: 'clients', refId: c.id, silencioso: true });
        });
      }
      return true;
    },
  });
  if (ok) {
    const ids = criadas.map(x => x.id); const acaoId = criadas._acao;
    ui.toast(`Plano criado: ${fmt.plural(ids.length, 'tarefa')} no quadro da Operação${''}. Responsáveis notificados.`, {
      desfazer: () => db.batch(() => { ids.forEach(id => db.remove('tasks', id)); if (acaoId) db.remove('clientActions', acaoId); db.update('clients', c.id, { planoResgate: null }); }),
      acao: { rotulo: 'Ver no quadro', fn: () => ctx.router.go('operacao/quadro') },
    });
  }
  return ok;
}

/* ================= Agendar reunião ================= */
export async function agendarReuniao(ctx, c) {
  const { ui, fmt, db, notify } = ctx;
  const renov = K.renovaEm30(c) && !K.proximaReuniao(c);
  const time = db.list('team', t => t.ativo !== false && t.papel !== 'leitura');
  const pre = new Set([c.respId, ...(renov ? ['t-gabriel'] : []), ...(c.equipe || []).slice(0, 2)]);
  const data0 = renov ? K.addDias(HOJE, Math.max(1, Math.min(3, K.dias(c.renova) - 2))) : K.addDias(HOJE, 2);
  const dc = K.decisor(c);
  const corpo = `<form class="stack" novalidate><div class="fgrid">
${ui.campo({ nome: 'titulo', rotulo: 'Assunto', valor: renov ? 'Reunião de renovação do contrato' : 'Reunião de resultados', obrigatorio: true, cls: 'full' })}
${ui.campo({ nome: 'tipo', rotulo: 'Tipo', tipo: 'select', valor: renov ? 'renovacao' : 'resultado', opcoes: [{ v: 'renovacao', l: 'Renovação' }, { v: 'resultado', l: 'Resultados' }, { v: 'alinhamento', l: 'Alinhamento' }, { v: 'resgate', l: 'Plano de resgate' }, { v: 'kickoff', l: 'Kickoff' }] })}
${ui.campo({ nome: 'data', rotulo: 'Data', tipo: 'data', valor: data0, obrigatorio: true })}
${ui.campo({ nome: 'hora', rotulo: 'Horário', valor: '10:00', obrigatorio: true, placeholder: 'hh:mm', attrs: { inputmode: 'numeric', maxlength: 5 } })}
${ui.campo({ nome: 'duracao', rotulo: 'Duração', tipo: 'select', valor: '45', opcoes: [{ v: '30', l: '30 min' }, { v: '45', l: '45 min' }, { v: '60', l: '1 h' }, { v: '90', l: '1 h 30 min' }] })}
${ui.campo({ nome: 'pauta', rotulo: 'Pauta', tipo: 'textarea', cls: 'full', valor: renov ? `Resultados do ano, proposta de renovação${K.veReceita() ? ` (${fmt.brl(c.mrr)}/mês)` : ''} e próximos 12 meses.` : 'Resultados do mês, ações da equipe e próximos passos.' })}
</div>
<fieldset class="fld"><legend>Participantes da agência</legend><div class="m-clientes-part">${time.map(t => `<label class="ck"><input type="checkbox" name="participantes" value="${t.id}"${pre.has(t.id) ? ' checked' : ''}><span>${fmt.esc(t.nome)}</span></label>`).join('')}</div></fieldset>
${dc ? ui.campo({ nome: 'convidarCliente', rotulo: `Enviar convite ao cliente (${dc.nome} · ${dc.email})`, tipo: 'checkbox', valor: true }) : ''}
</form>`;
  let criada = null;
  const ok = await ui.modal({
    titulo: 'Agendar reunião', sub: renov ? `${c.nome} renova em ${fmt.plural(K.dias(c.renova), 'dia')} (${fmt.data(c.renova)}) e não há reunião marcada.` : c.nome, corpo, confirmar: 'Agendar e notificar', largura: 'md',
    onConfirmar: box => {
      const f = box.querySelector('form');
      const r = ui.form.validar(f, {
        titulo: 'obrigatorio|min:3',
        data: ['obrigatorio', v => (v && K.dias(v) < 0 ? 'Escolha uma data a partir de hoje.' : '')],
        hora: ['obrigatorio', v => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? '' : 'Horário inválido. Use hh:mm, ex.: 14:30.')],
        participantes: [v => (!v || !v.length ? 'Escolha pelo menos uma pessoa da agência.' : '')],
      });
      if (!r.ok) return false;
      const d = r.dados;
      criada = db.insert('meetings', { clientId: c.id, titulo: d.titulo, tipo: d.tipo, quando: `${d.data}T${d.hora}:00`, duracao: Number(d.duracao), participantes: d.participantes, status: 'agendada', pauta: d.pauta, local: 'Google Meet', convidouCliente: !!d.convidarCliente }, { log: `agendou "${d.titulo}" com ${c.nome}` });
      const para = d.participantes.map(K.userDe).filter(u => u && (!ctx.real || u !== ctx.real.id));
      if (para.length) notify.enviar({ para, titulo: `Reunião agendada: ${c.nome}`, texto: `${d.titulo} · ${fmt.data(d.data)} às ${d.hora} (${d.duracao} min).`, link: `#/clientes/${c.id}`, tipo: 'atribuicao', refCol: 'clients', refId: c.id });
      return true;
    },
  });
  if (ok && criada) {
    const id = criada.id;
    ui.toast(`Reunião agendada para ${fmt.dataHora(criada.quando)}. Participantes notificados${criada.convidouCliente ? ' e convite enviado ao cliente' : ''}.`, { desfazer: () => db.remove('meetings', id) });
  }
  return ok;
}

export const ABA_IDS = ABAS.map(a => a.id);
export { SEMANAS };
