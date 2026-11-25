// cockpit/real.js — Cockpit em PRODUÇÃO (db.dadosDemo === false). Tudo calculado das coleções reais; o snapshot de
// cockpit/data.js fica só para o modo demonstração. Onde não há dado ainda, o card vira um estado vazio que ensina o próximo passo.
import { padrao } from '../../core/padroes/index.js';
import { limOcupacao, rotuloOcupacao, ocupacao, entregasNaJanela, pctNoPrazo } from '../operacao/lib.js';
import { estadoFatura, atrasoCritico, abertas } from '../financeiro/calc.js';
import * as FIN from '../financeiro/real.js';

const ROT_ESTADO = { ok: 'ok', warn: 'atenção', err: 'falhou', off: 'pausada' };
const estH = h => (h == null ? 'off' : h < padrao('clientes.health.risco', 60) ? 'err' : h < padrao('clientes.health.saudavel', 75) ? 'warn' : 'ok');
const vz = (ui, v) => ui.vazio({ compacto: true, ...v });

/** itens de "Precisa de você hoje" a partir de alertas, faturas, rotinas, clientes e equipe reais */
export function itensReais(ctx) {
  const { db, fmt } = ctx; const out = [];
  const est = a => (a.gravidade || a.estado || 'warn');
  const alertas = db.list('alerts', a => !a.resolvido && !['resolvido', 'adiado', 'arquivado'].includes(a.status) && ['err', 'warn'].includes(est(a)));
  const refsAlerta = new Set(alertas.map(a => `${a.refCol}:${a.refId}`));
  for (const a of alertas) out.push({ k: `al:${a.id}`, estado: est(a), titulo: a.titulo || 'Alerta', sub: a.detalhe || a.area || '', acao: (a.acao && a.acao.rotulo) || 'Abrir', href: (a.acao && a.acao.href) || '#/alertas', icone: 'alert' });
  for (const r of db.list('routines', r => r.ativo !== false && r.estado === 'err' && !refsAlerta.has(`routines:${r.id}`)))
    out.push({ k: `rt:${r.id}`, estado: 'err', titulo: `Rotina "${r.nome}" falhou${r.falhas > 1 ? ` ${r.falhas}×` : ''}`, sub: r.erro || r.ultimaRotulo || 'Veja o log para entender a falha', acao: 'Ver log', href: `#/torre/rotina/${r.id}`, icone: 'radio-tower' });
  const AC = atrasoCritico();
  for (const f of abertas().filter(x => estadoFatura(x).atraso > 0 && !refsAlerta.has(`invoices:${x.id}`))) {
    const e = estadoFatura(f);
    out.push({ k: `fat:${f.id}`, estado: e.atraso > AC ? 'err' : 'warn', titulo: `Fatura vencida: ${FIN.clientesAtivos().find(c => c.id === f.clientId)?.nome || f.cliente || 'cliente'}`, sub: `${fmt.brl(f.valor)} · ${e.rotulo}`, acao: 'Cobrar', href: `#/financeiro/receber?cobrar=${f.id}`, icone: 'dollar' });
  }
  const crit = limOcupacao().critico;
  for (const t of db.list('team', t => t.ativo !== false)) { const v = ocupacao(t.id); if (v != null && v > crit) out.push({ k: `oc:${t.id}`, estado: 'warn', titulo: `${t.nome} em ${v}% de ocupação`, sub: 'Acima do limite crítico da equipe', acao: 'Redistribuir', href: `#/equipe/${t.id}?acao=redistribuir`, icone: 'users' }); }
  const ordem = { err: 0, warn: 1 };
  return out.sort((a, b) => ordem[a.estado] - ordem[b.estado]).slice(0, 8);
}

function kpis(ctx) {
  const { ui, fmt, periodo } = ctx;
  const cli = FIN.clientesAtivos(); const mrr = FIN.mrrReal();
  const risco = cli.filter(c => estH(c.health) === 'err'); const mrrRisco = risco.reduce((a, c) => a + (Number(c.mrr) || 0), 0);
  const d = FIN.dreReal(periodo); const temCx = FIN.temLancamentos(); const saldo = FIN.saldoReal(); const qm = FIN.queimaMensal();
  const ent = entregasNaJanela({ mes: 30, tri: 90, '12m': 365 }[periodo] || 30); const prazo = pctNoPrazo(ent);
  const meta = padrao('operacao.prazo.meta', 95);
  const K = [
    { rotulo: 'MRR', valor: cli.length ? fmt.brlK(mrr) : '—', comp: cli.length ? fmt.plural(cli.length, 'cliente ativo', 'clientes ativos') : 'cadastre os clientes', href: '#/financeiro/visao', ajuda: 'Receita recorrente mensal: soma do MRR dos clientes ativos no cadastro.', id: 'mrr' },
    { rotulo: 'MRR em risco', valor: cli.length ? fmt.brlK(mrrRisco) : '—', comp: risco.length ? `${fmt.plural(risco.length, 'cliente')}${mrr ? ` · ${fmt.pct((mrrRisco / mrr) * 100, 1)} do MRR` : ''}` : cli.length ? 'nenhum cliente em risco' : 'sem clientes na carteira', alerta: risco.length > 0, deltaBom: null, href: '#/clientes?f=risco', ajuda: 'Soma do MRR dos clientes com health score abaixo do limite de risco.', id: 'risco' },
    { rotulo: 'Margem líquida', valor: d.margem != null ? fmt.pct(d.margem, 1) : '—', comp: d.margem != null ? ctx.periodoInfo.rotulo : 'sem lançamentos no Financeiro', href: '#/financeiro/dre', ajuda: 'Resultado ÷ receita do período, calculado dos lançamentos do Financeiro.', id: 'margem' },
    { rotulo: 'Caixa', valor: temCx ? fmt.brlK(saldo) : '—', delta: temCx && qm ? `${fmt.dec(saldo / qm, 1)} meses` : undefined, deltaBom: null, comp: temCx ? (qm ? 'de runway' : 'saldo dos lançamentos') : 'sem lançamentos no Financeiro', href: '#/financeiro/caixa', ajuda: 'Soma dos lançamentos realizados. Runway = caixa ÷ média de saídas dos últimos 3 meses.', id: 'caixa' },
    { rotulo: 'Clientes ativos', valor: String(cli.length), comp: cli.length ? 'no cadastro' : 'nenhum cadastrado ainda', href: '#/clientes', ajuda: 'Clientes com cadastro ativo.', id: 'clientes' },
    { rotulo: 'Entregas no prazo', valor: prazo != null ? fmt.pct(prazo, 0) : '—', comp: prazo != null ? `meta ${meta}%` : 'nenhuma entrega no período', led: prazo == null ? undefined : prazo >= meta ? 'ok' : 'warn', href: '#/operacao', ajuda: 'Entregas concluídas até a data combinada ÷ entregas concluídas no período.', id: 'prazo' },
  ];
  return `<div class="ck-kpis">${K.map(k => ui.kpi({ ...k, id: `ck-kpi-${k.id}` })).join('')}</div>`;
}

/** componentes da saúde que têm dado real; null = sem dados suficientes */
function saude(ctx) {
  const { ui, fmt, charts } = ctx;
  const cli = FIN.clientesAtivos().filter(c => typeof c.health === 'number');
  const ent = entregasNaJanela(30); const prazo = pctNoPrazo(ent);
  const ocs = ctx.db.list('team', t => t.ativo !== false).map(t => ocupacao(t.id)).filter(v => v != null);
  const L = limOcupacao();
  const comp = [
    { rotulo: 'Clientes', href: '#/clientes', peso: 40, v: cli.length ? Math.round(cli.reduce((a, c) => a + c.health, 0) / cli.length) : null, txt: cli.length ? `Health médio de ${fmt.plural(cli.length, 'cliente')}.` : 'Sem health score nos clientes.' },
    { rotulo: 'Operação', href: '#/operacao', peso: 30, v: prazo != null ? Math.round(prazo) : null, txt: prazo != null ? `${fmt.pct(prazo, 0)} das entregas no prazo (30 dias).` : 'Nenhuma entrega concluída em 30 dias.' },
    { rotulo: 'Equipe', href: '#/equipe', peso: 30, v: ocs.length ? Math.round(Math.max(0, 100 - ocs.reduce((a, v) => a + (v > L.max ? v - L.max : v < L.min ? L.min - v : 0), 0) / ocs.length * 2)) : null, txt: ocs.length ? 'Distância média da zona ideal de ocupação.' : 'Sem ocupação registrada.' },
  ];
  const com = comp.filter(c => c.v != null);
  const ajuda = 'Média ponderada dos componentes com dado: Clientes (health médio), Operação (entregas no prazo) e Equipe (ocupação na zona ideal). Faixas: ≥75 ok · 60–74 atenção · <60 crítico.';
  if (!com.length) return ui.card({ titulo: 'Saúde da agência', cls: 'ck-saude', ajuda, corpo: vz(ui, { icone: 'gauge', titulo: 'Ainda sem dados para medir', texto: 'A saúde da agência combina o health score dos clientes, as entregas no prazo e a ocupação da equipe. Cadastre clientes e registre entregas para ver o índice.', acao: { rotulo: 'Cadastrar cliente', href: '#/clientes/novo', icone: 'plus' } }) });
  const peso = com.reduce((a, c) => a + c.peso, 0); const score = Math.round(com.reduce((a, c) => a + c.v * c.peso, 0) / peso);
  return ui.card({ titulo: 'Saúde da agência', cls: 'ck-saude', ajuda,
    corpo: `${charts.gauge(score, { rotulo: 'Saúde da agência', sub: com.length < comp.length ? `com ${com.length} de ${comp.length} componentes` : 'todos os componentes', tamanho: 190 })}
<ul class="ck-comp">${comp.map(c => `<li><a href="${c.href}" data-tip="${fmt.esc(`${c.rotulo}: ${c.v != null ? `${c.v}/100` : 'sem dados'}\n${c.txt}`)}"><span class="row between sm"><span>${fmt.esc(c.rotulo)}</span><b class="num${c.v == null ? ' mut' : ''}">${c.v != null ? c.v : 'sem dados'}</b></span>${c.v != null ? ui.barra(c.v, { faixas: 'health', rotulo: false, fina: true }) : ''}</a></li>`).join('')}</ul>` });
}

function torre(ctx) {
  const { ui, fmt, db } = ctx;
  const rs = db.list('routines', r => r.ativo !== false);
  const acoes = ui.btn({ rotulo: 'Abrir', href: '#/torre', sm: true, tipo: 'ghost', iconeDir: 'arrow-right' });
  if (!rs.length) return ui.card({ titulo: 'Torre de Controle', acoes, corpo: vz(ui, { icone: 'radio-tower', titulo: 'Sem rotinas configuradas', texto: 'Rotinas automáticas (sincronizações, relatórios, cobranças) aparecem aqui com o estado da última execução.', acao: ctx.can('torre', 'ver') ? { rotulo: 'Ir para a Torre', href: '#/torre', icone: 'arrow-right' } : undefined }) });
  const ord = { err: 0, warn: 1, ok: 2, off: 3 };
  const tr = rs.map(r => ({ id: r.id, nome: r.nome, estado: r.estado || 'off', txt: r.ultimaEm ? `${ROT_ESTADO[r.estado] || ''} · ${fmt.rel(r.ultimaEm)}` : 'sem execução' })).sort((a, b) => (ord[a.estado] ?? 4) - (ord[b.estado] ?? 4)).slice(0, 8);
  const cnt = e => rs.filter(t => t.estado === e).length;
  return ui.card({ titulo: 'Torre de Controle', sub: [cnt('err') ? `${cnt('err')} falha` : '', cnt('warn') ? `${cnt('warn')} atenção` : '', `${cnt('ok')} ok`].filter(Boolean).join(' · '), acoes,
    corpo: `<ul class="ck-torre">${tr.map(t => `<li><a href="${t.estado === 'err' || t.estado === 'warn' ? `#/torre/rotina/${t.id}` : '#/torre'}">${ui.led(t.estado, false)}<span class="trunc">${fmt.esc(t.nome)}</span><span class="ck-tt ${t.estado === 'err' ? 't-err' : t.estado === 'warn' ? 't-warn' : 'mut'}">${fmt.esc(t.txt)}</span></a></li>`).join('')}</ul>` });
}

function mapa(ctx) {
  const { ui, fmt, charts } = ctx;
  const acoes = ui.btn({ rotulo: 'Carteira', href: '#/clientes', sm: true, tipo: 'ghost', iconeDir: 'arrow-right' });
  const cart = FIN.clientesAtivos().filter(c => typeof c.health === 'number').map(c => ({ id: c.id, nome: c.nome || c.fantasia || 'Cliente', health: c.health, mrr: (Number(c.mrr) || 0) / 1000 }));
  if (!cart.length) return ui.card({ titulo: 'Mapa da carteira', sub: 'MRR × health score', acoes, corpo: vz(ui, { icone: 'building', titulo: 'Nenhum cliente na carteira ainda', texto: 'Cada cliente vira uma bolha (MRR × health score) para mostrar quem pesa mais e corre mais risco.', acao: ctx.can('clientes', 'editar') ? { rotulo: 'Cadastrar cliente', href: '#/clientes/novo', icone: 'plus' } : undefined }) });
  const maxY = Math.max(1, ...cart.map(c => c.mrr)) * 1.15;
  return ui.card({ titulo: 'Mapa da carteira', sub: 'MRR × health score · tamanho = MRR', acoes, ajuda: 'Cada bolha é um cliente, com a luz pelo health score. Clique para abrir a ficha.',
    corpo: `${charts.dispersao({ pontos: cart.map(c => ({ x: c.health, y: c.mrr, r: Math.max(c.mrr, 0.5), rotulo: c.nome, estado: estH(c.health), href: `#/clientes/${c.id}` })),
      eixoX: { rotulo: 'Health score', formato: 'num', min: 0, max: 100 }, eixoY: { rotulo: 'MRR (R$ mil)', formato: 'dec', min: 0, max: Math.ceil(maxY) },
      quadrantes: { x: padrao('clientes.health.risco', 60), y: Math.ceil(maxY) / 2, rotulos: ['Agir já', 'Proteger', 'Acompanhar', 'Manter'], destaque: 'supEsq' }, altura: 340, legenda: false })}
<div class="ck-leds">${cart.slice().sort((a, b) => a.health - b.health).slice(0, 14).map(c => `<a href="#/clientes/${fmt.esc(c.id)}">${ui.led(estH(c.health), false)}<span>${fmt.esc(c.nome)}</span><b class="num">${c.health}</b></a>`).join('')}</div>` });
}

function capacidade(ctx) {
  const { ui, fmt, db } = ctx; const LO = limOcupacao();
  const cap = db.list('team', t => t.ativo !== false).map(t => ({ id: t.id, nome: t.nome, area: t.area || t.cargo || '', v: ocupacao(t.id) })).filter(p => p.v != null).sort((a, b) => b.v - a.v).slice(0, 6);
  const acoes = ui.btn({ rotulo: 'Equipe', href: '#/equipe', sm: true, tipo: 'ghost', iconeDir: 'arrow-right' });
  if (!cap.length) return ui.card({ titulo: 'Capacidade do time', sub: `Zona ideal ${LO.min}–${LO.max}%`, acoes, corpo: vz(ui, { icone: 'users', titulo: 'Sem ocupação registrada', texto: 'A ocupação de cada pessoa aparece quando há tarefas com estimativa ou horas lançadas na Operação.', acao: { rotulo: 'Abrir Operação', href: '#/operacao', icone: 'arrow-right' } }) });
  const rotOc = v => rotuloOcupacao(v).toLowerCase();
  return ui.card({ titulo: 'Capacidade do time', sub: `Zona ideal ${LO.min}–${LO.max}%`, acoes,
    corpo: `<ul class="ck-cap">${cap.map(p => `<li><a href="#/equipe/${fmt.esc(p.id)}">${ui.avatar(p.id, 28)}<span class="ck-cap-n"><b class="trunc">${fmt.esc(p.nome)}</b><span class="mut sm">${fmt.esc(p.area)} · ${rotOc(p.v)}</span></span><span class="ck-cap-b">${ui.barra(p.v, { faixas: 'ocupacao', zona: [LO.min, LO.max], max: 120, aria: `${p.nome}: ${p.v}% de ocupação` })}</span></a></li>`).join('')}</ul>` });
}

function renovacoes(ctx) {
  const { ui, fmt } = ctx;
  const hRen = padrao('clientes.renovacao.cockpit', 60);
  const ren = FIN.clientesAtivos().map(c => ({ c, d: fmt.diasAte(c.renova) })).filter(x => x.d != null && x.d >= 0 && x.d <= hRen).sort((a, b) => a.d - b.d).slice(0, 5);
  if (!ren.length) return ui.card({ titulo: 'Renovações', sub: `próximos ${hRen} dias`, corpo: vz(ui, { icone: 'calendar', titulo: 'Nenhuma renovação à vista', texto: `Contratos com data de renovação nos próximos ${hRen} dias aparecem aqui. Informe a renovação no cadastro do cliente.` }) });
  return ui.card({ titulo: 'Renovações', sub: `próximos ${hRen} dias`,
    corpo: `<ul class="ck-ren">${ren.map(({ c }) => { const dc = fmt.dataCurta(c.renova).split('/'); return `<li><a href="#/clientes/${fmt.esc(c.id)}"><span class="ck-ren-d num"><b>${fmt.esc(dc[0])}</b><span>${fmt.esc(dc[1] || '')}</span></span><span class="ck-ren-n"><b class="trunc">${fmt.esc(c.nome || 'Cliente')}</b><span class="sm mut trunc">${fmt.esc(c.segmento || '')}</span></span><span class="ck-ren-v">${c.mrr ? `<span class="num">R$ ${fmt.dec(c.mrr / 1000, 1)}k</span>` : ''}${typeof c.health === 'number' ? ui.selo(estH(c.health), String(c.health), { title: `Health score ${c.health}` }) : ''}</span></a></li>`; }).join('')}</ul>` });
}

/** "Primeiros passos": aparece enquanto a base real ainda não tem o essencial para o Cockpit fazer sentido */
function primeirosPassos(ctx) {
  const { ui, fmt, db } = ctx;
  const P = [
    { ok: db.count('clients') > 0, t: 'Cadastre seus clientes', d: 'MRR, health score e renovação alimentam MRR, risco e o mapa da carteira.', a: 'Cadastrar cliente', href: '#/clientes/novo', perm: ['clientes', 'editar'] },
    { ok: db.count('cash') > 0 || db.count('invoices') > 0, t: 'Lance receitas e custos', d: 'Lançamentos e faturas geram caixa, margem e o gráfico Receita × Custos.', a: 'Abrir Financeiro', href: '#/financeiro/caixa', perm: ['financeiro', 'ver'] },
    { ok: db.count('team', t => t.ativo !== false && t.faturavel) > 0, t: 'Monte a equipe', d: 'Marque quem trabalha em clientes para medir ocupação e capacidade.', a: 'Abrir equipe', href: '#/admin/equipe', perm: ['admin', 'ver'] },
    { ok: db.count('routines') > 0, t: 'Ligue as rotinas', d: 'Sincronizações e relatórios automáticos aparecem na Torre de Controle.', a: 'Abrir Torre', href: '#/torre', perm: ['torre', 'ver'] },
  ];
  const feitos = P.filter(p => p.ok).length;
  if (feitos === P.length) return '';
  const prox = P.findIndex(p => !p.ok);
  return `<section class="card ck-passos" aria-labelledby="ck-passos-t"><header class="ck-ps-h"><div><h2 id="ck-passos-t">Primeiros passos</h2><p class="mut sm">Seu Cockpit é montado com os dados reais da agência. Complete estes passos para os indicadores ganharem vida.</p></div>
<div class="ck-ps-pr"><span class="num"><b>${feitos}</b> de ${P.length}</span>${ui.barra((feitos / P.length) * 100, { rotulo: false, fina: true, faixas: [{ ate: Infinity, estado: 'ok' }], aria: `${feitos} de ${P.length} passos concluídos` })}</div></header>
<ol class="ck-ps">${P.map((p, i) => { const pode = ctx.can(p.perm[0], p.perm[1]); return `<li class="${p.ok ? 'ok' : i === prox ? 'prox' : ''}"><span class="ck-ps-n" aria-hidden="true">${p.ok ? ui.ic('check') : i + 1}</span><div class="ck-ps-m"><b>${fmt.esc(p.t)}</b><span>${fmt.esc(p.d)}</span>${p.ok ? '<span class="ck-ps-f">Concluído</span>' : pode ? ui.btn({ rotulo: p.a, href: p.href, sm: true, tipo: i === prox ? 'pri' : '', iconeDir: 'arrow-right' }) : ''}</div></li>`; }).join('')}</ol></section>`;
}

/** página inteira (produção). `head` e `precisa` vêm do index (mesma marcação do demo). */
export function renderReal(ctx, head, precisa) {
  const rc = FIN.receitaCustosCard(ctx, { altura: 286, acoes: ctx.ui.btn({ rotulo: 'DRE', href: '#/financeiro/dre', sm: true, tipo: 'ghost', iconeDir: 'arrow-right' }), acao: ctx.can('financeiro', 'ver') ? undefined : false });
  return `<div class="pg m-cockpit ck-real">${head}${primeirosPassos(ctx)}${kpis(ctx)}
<div class="ck-r1">${precisa}${saude(ctx)}</div>
<div class="g-2-1">${rc}${torre(ctx)}</div>
<div class="g-2-1">${mapa(ctx)}<div class="stack ck-st">${capacidade(ctx)}${renovacoes(ctx)}</div></div></div>`;
}
