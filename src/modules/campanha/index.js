// Campanha — conta própria de tráfego do dono (Meta Ads via Windsor.ai). Abas: visao, campanhas, criativos, regras (Regras da IA), conexao.
// Recomendações: motor único src/shared/motor-recs.js (o mesmo da Torre de Controle), adaptador em engine.js.
// Regra de segurança do dono: NENHUM link para o Gerenciador de Anúncios do Meta. Criar ou subir campanha: somente pelo Gerenciador, via 4G.
// Ações de mudança (pausar, orçamento) exigem digitar "SIM"; no modo demonstração apenas simulam.
import './data.js';
import { db } from '../../core/store.js';
import { auth } from '../../core/auth.js';
import * as fmt from '../../core/fmt.js';
import { TIPOS, conta, linhas, entidades, limites, janela, noIntervalo, agregar, porChave, doTipo, serieDiaria, orcamentoConta, estaAtivo, recomendacoes, pendentes, quebra, MotorRecs, logar, COL_LOG, estatisticas, avaliarPendentes, overrides, regrasAtuais, CONTAS, SOMA, selecionar, selecao, contaSel, vivo, carregarVivo, ouvirVivo, garantirConta, porConta, DIAS_VIVO } from './engine.js';
import { regrasAba, montarRegras } from './regras.js';
import { padrao } from '../../core/padroes/index.js';

const esc = fmt.esc;
const nz = (v, f) => (v === null || v === undefined || Number.isNaN(v) ? '—' : f(v));
const NOTA_4G = 'Criar ou subir campanha: somente pelo Gerenciador, via 4G.';
const CAMPOS_WINDSOR = ['date', 'account_id', 'account_name', 'campaign_id', 'campaign', 'campaign_status', 'adset_id', 'adset_name', 'adset_status', 'adset_daily_budget', 'ad_id', 'ad_name', 'effective_status', 'spend', 'impressions', 'clicks', 'reach', 'frequency', 'actions_lead', 'actions_onsite_conversion_messaging_conversation_started_7d', 'actions_purchase', 'action_values_purchase', 'actions_post_engagement', 'actions_video_view', 'thumbnail_url'];
const CAMPOS_QUEBRA = ['publisher_platform', 'platform_position', 'age', 'gender', 'device_platform'];
const abertos = new Set(); // linhas expandidas na aba Campanhas
const porques = new Set(); // "Por quê" abertos (ficam abertos depois de abertos)
try { JSON.parse(sessionStorage.getItem('aos-cp-porque') || '[]').forEach(x => porques.add(x)); } catch (e) { /* sem storage */ }
const salvarPorques = () => { try { sessionStorage.setItem('aos-cp-porque', JSON.stringify([...porques])); } catch (e) { /* */ } };

function delta(a, b, invertido) {
  if (a == null || b == null || !b) return {};
  const d = ((a - b) / Math.abs(b)) * 100; if (Math.abs(d) < 0.05) return { delta: '0%', deltaBom: null };
  return { delta: `${d > 0 ? '▲' : '▼'} ${fmt.pct(Math.abs(d), 1)}`, deltaBom: invertido ? d < 0 : d > 0 };
}
const NIVEL = { campanha: 'Campanha', conjunto: 'Conjunto', anuncio: 'Anúncio' };
const STATUS = s => (s === 'ativo' ? ['ok', 'Ativo'] : ['off', 'Pausado']);
const podeAlterar = ctx => ctx.can('campanha', 'editar');
const SEM_PERM = 'Só o dono altera a conta. Seu perfil pode apenas ver.';

/* ---------------- miniatura do criativo (SVG inline) ---------------- */
let thumbSeq = 0;
export function thumb(cr, o = {}) {
  if (!cr) return '';
  const id = `cpg${++thumbSeq}`; const [a, b] = cr.cores || ['#0B6BE8', '#7C5CFC'];
  const palavras = String(cr.titulo || cr.nome || '').split(/\s+/); const ln = []; let cur = '';
  palavras.forEach(p => { if ((cur + ' ' + p).trim().length > 16) { ln.push(cur.trim()); cur = p; } else cur += ' ' + p; }); if (cur.trim()) ln.push(cur.trim());
  const tx = ln.slice(0, 3).map((l, i) => `<text x="22" y="${196 + i * 30 - (Math.min(ln.length, 3) - 1) * 15}" font-size="25" font-weight="700" fill="#fff" font-family="Inter,system-ui,sans-serif">${esc(l)}</text>`).join('');
  const badge = cr.formato === 'video' ? `<circle cx="160" cy="98" r="30" fill="rgba(255,255,255,.22)"/><path d="M151 83 L175 98 L151 113 Z" fill="#fff"/>`
    : cr.formato === 'carrossel' ? `<g fill="rgba(255,255,255,.9)"><circle cx="146" cy="292" r="4"/><circle cx="160" cy="292" r="4" opacity=".5"/><circle cx="174" cy="292" r="4" opacity=".5"/></g><rect x="252" y="22" width="46" height="26" rx="13" fill="rgba(0,0,0,.28)"/><text x="275" y="40" font-size="14" font-weight="600" fill="#fff" text-anchor="middle" font-family="Inter,system-ui,sans-serif">1/5</text>`
      : '';
  return `<svg class="m-campanha-th${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 320 320" role="img" aria-label="${esc(`Miniatura (${cr.formato}): ${cr.titulo}`)}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${esc(a)}"/><stop offset="1" stop-color="${esc(b)}"/></linearGradient></defs>
<rect width="320" height="320" fill="url(#${id})"/><circle cx="270" cy="250" r="120" fill="rgba(255,255,255,.08)"/><circle cx="40" cy="30" r="90" fill="rgba(255,255,255,.07)"/>${badge}${tx}
<rect x="22" y="246" width="${Math.min(260, String(cr.cta || '').length * 10 + 28)}" height="30" rx="6" fill="rgba(255,255,255,.95)"/><text x="36" y="266" font-size="14" font-weight="600" fill="#0E1726" font-family="Inter,system-ui,sans-serif">${esc(cr.cta || '')}</text></svg>`;
}

/* ---------------- cabeçalho / abas ---------------- */
function topo(ctx, aba) {
  const { ui } = ctx; const c = conta() || {}; const lim = limites();
  const cs = contaSel();
  const ledC = !db.dadosDemo ? (vivo.erro ? ui.led('err', 'Falha ao buscar no Windsor') : vivo.carregando && !vivo.rows ? ui.led('off', 'Buscando no Windsor…') : ui.led('ok', `Ao vivo · ${cs ? cs.curto : 'CA01 + CA02 · HOF'}`))
    : ui.led('off', `Demonstração · ${cs ? cs.nome : 'duas contas fictícias somadas'}`);
  const n = pendentes().length;
  return `${ui.cabecalho({
    titulo: 'Campanha', sub: 'Sua conta própria de tráfego (Meta Ads via Windsor.ai): resultado, criativos e as decisões que valem a pena tomar hoje.',
    meta: `${ledC}<span class="mut">Última sincronização ${ui.rel(c.ultimaSync)}</span>${lim ? `<span class="mut">Dados até ${fmt.data(lim.max)}</span>` : ''}`,
    acoes: `<span class="m-campanha-4g" title="Regra de segurança da conta">${ui.ic('shield')}${esc(NOTA_4G)}</span>`,
  })}
${seletorConta(ctx)}
${ui.tabs([{ id: '', rotulo: 'Visão geral', n: n || undefined }, { id: 'campanhas', rotulo: 'Campanhas' }, { id: 'criativos', rotulo: 'Criativos' }, { id: 'regras', rotulo: 'Regras da IA' }, { id: 'conexao', rotulo: 'Conexão' }], aba === 'visao' ? '' : aba, 'campanha')}`;
}

/** seletor de conta (fica na URL: ?conta=ca01|ca02; sem o parâmetro = as duas somadas) */
function seletorConta(ctx) {
  const { ui } = ctx; const s = selecao();
  return `<div class="row m-campanha-contas">${ui.chips([{ id: SOMA, rotulo: 'As duas (somadas)' }, ...CONTAS.map(c => ({ id: c.k, rotulo: c.curto }))], s, 'conta', { rotulo: 'Conta de anúncios' })}<span class="sm mut">${esc(s === SOMA ? CONTAS.map(c => c.nome).join(' + ') : (contaSel() || {}).nome || '')}</span></div>`;
}
/** comparativo CA01 × CA02 (só na visão "As duas") */
function comparativoContas(ctx, j) {
  const { ui } = ctx; if (selecao() !== SOMA) return '';
  const l = porConta(j.ini, j.fim); const tot = l.reduce((a, x) => a + (x.m.spend || 0), 0);
  const linha = x => `<tr><td><a href="${esc(ctx.router.href(null, { conta: x.k }))}"><b>${esc(x.curto)}</b></a><div class="sm mut">${esc(x.nome)}</div></td><td class="n num">${fmt.brl(x.m.spend)}</td><td class="n num">${tot ? fmt.pct((x.m.spend / tot) * 100, 0) : '—'}</td><td class="n num">${fmt.num(x.m.resultados)}</td><td class="n num">${nz(x.m.cpr, fmt.brl2)}</td><td class="n num">${nz(x.m.ctr, v => fmt.pct(v, 2))}</td><td class="n num">${nz(x.m.roas, v => fmt.dec(v, 2) + '×')}</td></tr>`;
  return ui.card({ titulo: 'Por conta', sub: `${fmt.data(j.ini)} a ${fmt.data(j.fim)} · clique numa conta para ver só ela`, ajuda: 'Os indicadores acima somam as duas contas. Aqui está a parte de cada uma no mesmo período.',
    corpo: `<div class="tbl-w" data-mobile="scroll"><table class="tbl densa m-campanha-pc"><thead><tr><th>Conta</th><th class="n">Invest.</th><th class="n">% verba</th><th class="n">Result.</th><th class="n">Custo/result.</th><th class="n">CTR</th><th class="n">ROAS</th></tr></thead><tbody>${l.map(linha).join('')}</tbody></table></div>` });
}
/** produção: aviso quando a última veiculação é antiga (a janela termina no último dia com dados) */
function avisoParada(ctx) {
  if (db.dadosDemo) return ''; const lim = limites(); if (!lim) return '';
  const dias = Math.round((fmt.toDate(fmt.iso(new Date())) - fmt.toDate(lim.max)) / 864e5);
  return dias > 2 ? ctx.ui.aviso({ tipo: 'warn', titulo: `Sem veiculação desde ${fmt.data(lim.max)}`, texto: `Nenhum gasto ${selecao() === SOMA ? 'nas duas contas' : 'nesta conta'} nos últimos ${dias} dias. Os números abaixo são dos últimos dias com dados.` }) : '';
}
function filtros(ctx, j) {
  const { ui, router } = ctx;
  const d = String(ctx.query.dias || '');
  const comparar = ctx.query.comparar !== '0';
  return `<div class="row between m-campanha-fil">${ui.chips([{ id: '', rotulo: `Período do topo (${ctx.periodoInfo.rotulo})` }, { id: '7', rotulo: '7 dias' }, { id: '14', rotulo: '14 dias' }, { id: '30', rotulo: '30 dias' }], d, 'dias', { rotulo: 'Período' })}
<a class="chip m-campanha-cmp" href="${esc(router.href(null, { comparar: comparar ? '0' : null }))}" aria-pressed="${comparar}"${comparar ? ' aria-current="true"' : ''} role="switch" aria-checked="${comparar}">${ui.ic(comparar ? 'check' : 'minus')}vs período anterior</a></div>
<p class="sm mut m-campanha-jan">${esc(j.rotulo)} · ${fmt.data(j.ini)} a ${fmt.data(j.fim)}${comparar ? (j.comparavel ? ` · comparado com ${fmt.data(j.iniAnt)} a ${fmt.data(j.fimAnt)}` : ' · sem período anterior no histórico (a conta tem 90 dias)') : ''}</p>`;
}

/* ---------------- VISÃO ---------------- */
function visao(ctx) {
  const { ui, charts } = ctx; const j = janela(ctx); const c = conta();
  if (!j) return ui.card({ corpo: ui.vazio({ icone: 'megaphone', titulo: selecao() === SOMA ? 'Sem dados nas contas' : `Sem dados na ${(contaSel() || {}).curto}`, texto: db.dadosDemo ? 'Conecte a conta na aba Conexão para puxar os dados do Windsor.ai.' : `Nenhuma veiculação nos últimos ${DIAS_VIVO} dias${selecao() === SOMA ? ' nas duas contas' : ' nesta conta'}. Quando houver gasto, os números aparecem aqui sozinhos.`, acao: { rotulo: 'Ver Conexão', href: '#/campanha/conexao' } }) });
  const todas = linhas(); const rows = todas.filter(noIntervalo(j.ini, j.fim));
  const m = agregar(rows); const comparar = ctx.query.comparar !== '0' && j.comparavel;
  const a = comparar ? agregar(todas.filter(noIntervalo(j.iniAnt, j.fimAnt))) : {};
  const comp = comparar ? 'vs período anterior' : '';
  const serie = serieDiaria(rows, j.ini, j.fim);
  const sp = k => serie.map(d => d[k] ?? 0);
  const metas = (c && c.metas) || {};
  const kpis = `<div class="g-kpi">
${ui.kpi({ rotulo: 'Investimento', valor: fmt.brl(m.spend), ...delta(m.spend, a.spend, null), deltaBom: comparar ? null : undefined, comp, serie: sp('spend'), formatoSerie: 'brl', ajuda: 'Soma de spend (valor gasto) no período.' })}
${ui.kpi({ rotulo: 'Resultados', valor: fmt.num(m.resultados), ...delta(m.resultados, a.resultados), comp: `${fmt.num(m.lead)} leads · ${fmt.num(m.conversa)} conversas · ${fmt.num(m.compra)} compras`, serie: sp('resultados'), ajuda: 'Leads (actions_lead) + conversas no WhatsApp/Direct + compras (actions_purchase). Engajamento não conta como resultado.' })}
${ui.kpi({ rotulo: 'Custo por resultado', valor: nz(m.cpr, fmt.brl2), ...delta(m.cpr, a.cpr, true), comp, serie: serie.map(d => d.cpr ?? null).map(v => v ?? 0), formatoSerie: 'brl', ajuda: `Investimento das campanhas de lead, conversa e compra ÷ resultados. Metas por tipo: lead ${fmt.brl(metas.lead)}, conversa ${fmt.brl(metas.conversa)}, compra ${fmt.brl(metas.compra)}.` })}
${ui.kpi({ rotulo: 'CTR', valor: nz(m.ctr, v => fmt.pct(v, 2)), ...delta(m.ctr, a.ctr), comp, serie: sp('ctr'), formatoSerie: 'pct', ajuda: 'Cliques ÷ impressões.' })}
${ui.kpi({ rotulo: 'CPM', valor: nz(m.cpm, fmt.brl2), ...delta(m.cpm, a.cpm, true), comp, serie: sp('cpm'), formatoSerie: 'brl', ajuda: 'Custo por mil impressões = investimento ÷ impressões × 1.000.' })}
${ui.kpi({ rotulo: 'CPC', valor: nz(m.cpc, fmt.brl2), ...delta(m.cpc, a.cpc, true), comp, serie: sp('cpc'), formatoSerie: 'brl', ajuda: 'Custo por clique = investimento ÷ cliques.' })}
${ui.kpi({ rotulo: 'Frequência', valor: nz(m.freq, v => fmt.dec(v, 2)), ...delta(m.freq, a.freq, true), comp: `alcance ${fmt.compacto(m.reach)}`, serie: sp('freq'), formatoSerie: 'dec', led: m.freq >= 3.5 ? 'warn' : undefined, ajuda: 'Média de vezes que cada pessoa viu os anúncios (frequency ponderada pelas impressões). Acima de 3,5 indica fadiga.' })}
${ui.kpi({ rotulo: 'ROAS', valor: nz(m.roas, v => fmt.dec(v, 2) + '×'), ...delta(m.roas, a.roas), comp: `meta ${fmt.dec(metas.roas || 3, 1)}×`, serie: sp('roas'), formatoSerie: 'dec', ajuda: 'Faturamento atribuído (action_values_purchase) ÷ investimento total da conta.' })}
${ui.kpi({ rotulo: 'Faturamento atribuído', valor: fmt.brlK(m.valor), ...delta(m.valor, a.valor), comp, serie: sp('valor'), formatoSerie: 'brl', ajuda: 'Valor das compras atribuídas pelo pixel do Meta (janela padrão: 7 dias após o clique, 1 dia após a visualização).' })}
</div>`;

  const rot = serie.map(d => fmt.dataCurta(d.d));
  const diario = `<div class="m-campanha-mult">
<div><h3>Investimento</h3>${charts.barras({ rotulos: rot, series: [{ nome: 'Investimento', dados: sp('spend'), cor: 'var(--c2n)' }], formato: 'brl', altura: 170 })}</div>
<div><h3>Resultados</h3>${charts.linhas({ rotulos: rot, series: [{ nome: 'Leads', dados: sp('lead') }, { nome: 'Conversas', dados: sp('conversa'), cor: 'var(--c3)' }, { nome: 'Compras', dados: sp('compra'), cor: 'var(--c4)' }], formato: 'num', altura: 170, min: 0 })}</div>
<div><h3>CPL (campanhas de lead)</h3>${charts.linhas({ series: [{ nome: 'CPL', dados: serie.map(d => (d.lead ? rows.filter(r => r.date === d.d && r.actions_lead !== undefined).reduce((s, r) => s + r.spend, 0) / d.lead : null)), cor: 'var(--c2)' }], rotulos: rot, formato: 'brl', altura: 170, metas: [{ valor: metas.lead || 7, rotulo: `Meta ${fmt.brl2(metas.lead || 7)}` }], min: 0 })}</div></div>`;

  const funil = charts.funil({ etapas: [{ rotulo: 'Impressões', valor: m.impressions }, { rotulo: 'Cliques', valor: m.clicks, bench: 'CTR 0,9–1,5%' }, { rotulo: 'Leads e conversas', valor: m.lead + m.conversa }, { rotulo: 'Vendas', valor: m.compra }], formato: 'num' });

  const qb = ['posicionamento', 'idade', 'genero', 'dispositivo'];
  const qRot = { posicionamento: 'Posicionamento', idade: 'Idade', genero: 'Gênero', dispositivo: 'Dispositivo' };
  const qAtiva = qb.includes(ctx.query.quebra) ? ctx.query.quebra : 'posicionamento';
  const quebras = qb.map(k => {
    const l = quebra(k, m);
    const graf = l.length ? charts.barras({ horizontal: true, rotulos: l.map(x => x.rot), series: [{ nome: 'Custo por resultado', dados: l.map(x => Math.round((x.cpr || 0) * 100) / 100), cores: l.map(x => (x.cpr && m.cpr && x.cpr > m.cpr * 1.3 ? 'var(--err)' : x.cpr && m.cpr && x.cpr < m.cpr * 0.92 ? 'var(--ok)' : 'var(--c1)')) }], formato: 'brl' }) : '';
    const tab = `<table class="tbl densa m-campanha-qt"><thead><tr><th>${esc(qRot[k])}</th><th class="n">Invest.</th><th class="n">% verba</th><th class="n">Result.</th><th class="n">Custo/result.</th></tr></thead><tbody>${l.map(x => `<tr><td>${esc(x.rot)}</td><td class="n num">${fmt.brl(x.spend)}</td><td class="n num">${fmt.pct((x.spend / m.spend) * 100, 0)}</td><td class="n num">${fmt.num(Math.round(x.resultados))}</td><td class="n num">${nz(x.cpr, fmt.brl2)}</td></tr>`).join('')}</tbody></table>`;
    return `<div data-qb="${k}"${k === qAtiva ? '' : ' hidden'}>${graf}<div class="tbl-w" data-mobile="scroll">${tab}</div></div>`;
  }).join('');

  return `${filtros(ctx, j)}
${avisoParada(ctx)}
${j.limitado ? ui.aviso({ tipo: 'info', texto: 'A conta tem 90 dias de histórico na demonstração: "12 meses" mostra todo o histórico disponível, sem comparação.' }) : ''}
${kpis}
${comparativoContas(ctx, j)}
${decisoesCard(ctx)}
${ui.card({ titulo: 'Dia a dia', sub: 'Investimento × resultados × CPL', ajuda: 'Linha tracejada no CPL = meta da conta. Passe o mouse para ver cada dia.', corpo: diario })}
<div class="g2">${ui.card({ titulo: 'Funil da conta', sub: 'Impressões → cliques → leads e conversas → vendas', corpo: funil })}
${!db.dadosDemo ? ui.card({ titulo: 'Quebras', sub: 'Posicionamento, idade, gênero e dispositivo', corpo: ui.vazio({ icone: 'chart', titulo: 'Em breve com dados reais', texto: 'As quebras por segmento precisam de consultas separadas no Windsor; por enquanto ficam só na demonstração.', compacto: true }) }) : ui.card({ titulo: 'Quebras', sub: `Custo por resultado por segmento · verde abaixo da média, vermelho 30% acima`, ajuda: 'Distribuição do período por publisher_platform/platform_position, age/gender e device_platform (Windsor). Na demonstração os percentuais são ilustrativos.', acoes: ui.seg(qb.map(k => ({ id: k, rotulo: qRot[k] })), qAtiva, { rotulo: 'Quebra', cls: 'm-campanha-qs' }), corpo: quebras })}</div>`;
}

const PRIO_LED = { agora: 'err', hoje: 'warn', semana: 'ok' };
const CONF_TXT = { alta: 'confiança alta', 'média': 'confiança média', baixa: 'confiança baixa' };
/** texto "Ação" de cada tipo de ação do motor (o motor dá título, impacto e porquê; a tela diz o que acontece aqui) */
function textoAcao(r) {
  const t = r.acao.tipo;
  if (t === 'orcamento') return `Orçamento diário de "${r.alvo.nome}": ${fmt.brl(r.de)} → ${fmt.brl(r.para)}. ${r.orcamentoDiarioContaDepois ? r.orcamentoDiarioContaDepois.frase : ''}`;
  if (t === 'pausar') return 'Pausar o anúncio. O orçamento do conjunto continua o mesmo e passa a ir para os outros anúncios.';
  if (t === 'pedirCriativo') return 'Pedir à Design 2 variações (novo gancho nos 3 primeiros segundos ou nova capa). Nada muda na conta agora.';
  if (t === 'aguardar') return 'Nada a fazer agora: o motor volta a avaliar quando houver dados suficientes.';
  if (t === 'mensagemCliente') return 'Mandar mensagem ao cliente com o resumo e a proposta.';
  return 'Ajuste feito somente pelo Gerenciador, via 4G. Depois, marque como feita aqui.';
}
const botaoDe = r => (r.acao.tipo === 'pedirCriativo' ? 'Pedir à Design' : ['publico', 'verificar', 'mensagemCliente'].includes(r.acao.tipo) ? 'Marcar como feita' : r.rotuloAcao);
function decisoesCard(ctx) {
  const { ui } = ctx; const recs = recomendacoes(); const pend = recs.filter(r => r.estado === 'pendente'); const feitas = recs.filter(r => r.estado !== 'pendente');
  const pode = podeAlterar(ctx); const lim = limites();
  const ROT_EST = { aplicada: 'Aplicada', ignorada: 'Ignorada', adiada: 'Adiada' };
  const item = r => {
    const aberto = porques.has(r.id); const p = r.estado === 'pendente' ? r.prioridade : null;
    const dis = { disabled: !pode, title: pode ? '' : SEM_PERM };
    const btns = r.estado === 'pendente'
      ? `${ui.btn({ rotulo: botaoDe(r), tipo: r.acao.tipo === 'pausar' ? 'perigo' : 'pri', sm: true, attrs: { 'data-aplicar': r.id }, ...dis })}${r.acao.tipo === 'aguardar' ? '' : ui.btn({ rotulo: 'Adiar 3 dias', sm: true, tipo: 'ghost', attrs: { 'data-adiar': r.id }, ...dis })}${ui.btn({ rotulo: 'Ignorar', sm: true, tipo: 'ghost', attrs: { 'data-ignorar': r.id }, ...dis })}`
      : `${ui.selo(r.estado === 'aplicada' ? 'ok' : 'off', `${ROT_EST[r.estado] || 'Decidida'}${r.decisao && r.decisao.simulado ? ' (simulado)' : ''} ${r.decisao ? fmt.dataCurta(r.decisao.em) : ''}${r.estado === 'adiada' && r.decisao && r.decisao.ate ? ` · volta em ${fmt.dataCurta(r.decisao.ate)}` : ''}`)}${pode ? ui.btn({ rotulo: 'Reabrir', sm: true, tipo: 'ghost', attrs: { 'data-reabrir': r.id } }) : ''}`;
    const prio = p ? `<span class="m-campanha-pr">${ui.selo(PRIO_LED[p], MotorRecs.ROTULO_PRIO[p])}</span>` : '';
    return `<li class="m-campanha-rec p-${p ? PRIO_LED[p] : 'off'}${r.estado !== 'pendente' ? ' feita' : ''}" data-rec="${esc(r.id)}" data-regra="${esc(r.regraId)}">
<div class="m-campanha-rh"><div class="m-campanha-rt"><div class="m-campanha-rtt"><b>${esc(r.titulo)}</b>${prio}</div>
<dl class="m-campanha-ri"><div><dt>Ação</dt><dd>${esc(textoAcao(r))}</dd></div><div><dt>Impacto esperado</dt><dd>${esc(r.impactoEsperado)}</dd></div></dl>
${r.aviso && r.estado === 'pendente' ? `<p class="m-campanha-av">${ui.ic('alert-triangle')}<span>${esc(r.aviso)}</span></p>` : ''}</div></div>
<details class="m-campanha-pq" data-porque="${esc(r.id)}"${aberto ? ' open' : ''}><summary>${ui.ic('chev-down')}Por quê</summary><p class="m-campanha-pqt">${esc(r.porque)}</p>${r.detalhes && r.detalhes.length ? `<ul>${r.detalhes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<p class="sm mut">Regra "${esc(r.regraNome || r.regraId)}" · ${esc(CONF_TXT[r.confianca] || '')} · dados até ${lim ? fmt.data(lim.max) : '—'} · <a href="#/campanha/regras?regra=${esc(r.regraId)}">ajustar a regra</a></p></details>
<div class="m-campanha-ra">${btns}</div></li>`;
  };
  const total = orcamentoConta();
  return ui.card({
    titulo: 'Decisões recomendadas', icone: 'bulb', sub: `${pend.length ? fmt.plural(pend.length, 'decisão pendente', 'decisões pendentes') : 'Nenhuma decisão pendente'} · orçamento diário atual da conta: ${fmt.brl(total)}`,
    ajuda: 'Motor único de recomendações (o mesmo da Torre de Controle): regras transparentes sobre os últimos 3, 7 e 14 dias — custo vs alvo, frequência, CTR, CPM e aprendizado. Ajuste os limites em "Regras da IA". Ações que mudam a conta pedem que você digite SIM.',
    acoes: ui.btn({ rotulo: 'Regras da IA', icone: 'sliders', sm: true, tipo: 'ghost', href: '#/campanha/regras' }),
    corpo: `${recs.length ? `<ul class="m-campanha-recs">${pend.map(item).join('')}</ul>${!pend.length ? ui.vazio({ icone: 'check-circle', titulo: 'Nada a decidir agora', texto: 'Todas as recomendações já foram decididas. Novas aparecem aqui quando os dados mudarem.', compacto: true }) : ''}${feitas.length ? `<details class="m-campanha-hist"><summary>${ui.ic('chev-down')}Decisões já tomadas (${feitas.length})</summary><ul class="m-campanha-recs">${feitas.map(item).join('')}</ul></details>` : ''}` : ui.vazio({ icone: 'check-circle', titulo: 'Nada a decidir agora', texto: 'Quando um anúncio cansar, um conjunto ficar bem abaixo do alvo ou o custo disparar, a recomendação aparece aqui com o motivo.', compacto: true })}
${pode ? '' : `<p class="sm mut">${esc(SEM_PERM)}</p>`}`,
  });
}

function campanhas(ctx) {
  const { ui } = ctx; const j = janela(ctx); const ent = entidades(); const c = conta() || {};
  if (!j) return ui.vazio({ titulo: 'Sem dados' });
  const rows = linhas().filter(noIntervalo(j.ini, j.fim));
  const ag = { campanha: porChave(rows, 'campaign_id'), conjunto: porChave(rows, 'adset_id'), anuncio: porChave(rows, 'ad_id') };
  if (ctx.query.abrir) ctx.query.abrir.split(',').forEach(x => { abertos.add(x); const e = ent.get(x); if (e && e.paiId) abertos.add(e.paiId); if (e && e.campanhaId) abertos.add(e.campanhaId); });
  const ordem = ['spend', 'resultados', 'cpr', 'ctr', 'cpm', 'freq', 'roas'].includes(ctx.query.ordem) ? ctx.query.ordem : 'spend';
  const dir = ctx.query.dir === 'asc' ? 1 : -1;
  const val = (e, k) => { const m = ag[e.nivel].get(e.id) || agregar([]); const t = doTipo(m, e.tipo); return k === 'resultados' ? t.n : k === 'cpr' ? t.cpr : m[k]; };
  const ord = l => l.sort((a, b) => ((val(a, ordem) ?? -Infinity) - (val(b, ordem) ?? -Infinity)) * dir || a.nome.localeCompare(b.nome));
  const filhos = id => ord([...ent.values()].filter(e => e.paiId === id));
  const pode = podeAlterar(ctx);
  const metas = c.metas || {};
  const linha = e => {
    const m = ag[e.nivel].get(e.id) || agregar([]); const t = doTipo(m, e.tipo); const T = TIPOS[e.tipo];
    const [st, stR] = STATUS(e.status); const efetivo = estaAtivo(e);
    const temFilhos = e.nivel !== 'anuncio'; const aberto = abertos.has(e.id);
    const meta = metas[e.tipo]; const eCpr = t.cpr == null || !meta ? '' : t.cpr <= meta ? 'ok' : t.cpr <= meta * 1.5 ? 'warn' : 'err';
    const orc = e.nivel === 'conjunto' ? fmt.brl(e.orcamentoDia) : e.nivel === 'campanha' ? fmt.brl([...ent.values()].filter(x => x.paiId === e.id && x.status === 'ativo').reduce((s, x) => s + (x.orcamentoDia || 0), 0)) : '<span class="mut">—</span>';
    const acoes = `${ui.btnIc(e.status === 'ativo' ? 'pause' : 'play', pode ? `${e.status === 'ativo' ? 'Pausar' : 'Ativar'} ${NIVEL[e.nivel].toLowerCase()} (pede SIM)` : SEM_PERM, { 'data-status': e.id, disabled: pode ? null : true })}${e.nivel === 'conjunto' ? ui.btnIc('sliders', pode ? 'Alterar orçamento diário (pede SIM)' : SEM_PERM, { 'data-orc': e.id, disabled: pode ? null : true }) : ''}`;
    return `<tr class="m-campanha-n ${e.nivel}${e.nivel !== 'campanha' && !(abertos.has(e.paiId) && (e.nivel === 'conjunto' || abertos.has(e.campanhaId))) ? ' oculto' : ''}" data-id="${esc(e.id)}" data-pai="${esc(e.paiId || '')}">
<td class="m-campanha-nm"><div class="m-campanha-nmi">${temFilhos ? `<button type="button" class="m-campanha-exp" data-exp="${esc(e.id)}" aria-expanded="${aberto}" aria-label="${aberto ? 'Recolher' : 'Expandir'} ${esc(e.nome)}">${ui.ic('chev')}</button>` : '<span class="m-campanha-exp-v"></span>'}<span class="m-campanha-lv">${NIVEL[e.nivel]}</span><span class="m-campanha-nmt" title="${esc(e.nome)}">${esc(e.nome)}</span>${e.simulado ? '<span class="m-campanha-sim" title="Alteração simulada no modo demonstração">simulado</span>' : ''}</div></td>
<td>${ui.led(efetivo ? 'ok' : st, efetivo ? stR : (e.status === 'ativo' ? 'Pausado (nível acima)' : stR))}</td>
<td class="n num">${orc}</td>
<td class="n num">${fmt.brl(m.spend)}</td>
<td class="n num">${t.n ? `${fmt.num(t.n)} <span class="sub">${esc(T.curto)}</span>` : '<span class="mut">0</span>'}</td>
<td class="n num">${t.cpr != null ? (eCpr ? ui.selo(eCpr, fmt.brl2(t.cpr), { title: `Meta ${fmt.brl2(meta)}` }) : fmt.brl2(t.cpr)) : '—'}</td>
<td class="n num">${nz(m.ctr, v => fmt.pct(v, 2))}</td>
<td class="n num m-campanha-xl">${nz(m.cpm, fmt.brl2)}</td>
<td class="n num">${m.freq ? `<span class="${m.freq >= 3.5 ? 't-err fw6' : m.freq >= 2.5 ? 't-warn' : ''}">${fmt.dec(m.freq, 2)}</span>` : '—'}</td>
<td class="n num">${e.tipo === 'compra' ? nz(m.roas, v => fmt.dec(v, 2) + '×') : '<span class="mut">—</span>'}</td>
<td class="m-campanha-ac">${acoes}</td></tr>`;
  };
  const corpo = ord([...ent.values()].filter(e => e.nivel === 'campanha')).map(cp => [linha(cp), ...filhos(cp.id).map(cj => [linha(cj), ...filhos(cj.id).map(linha)].join(''))].join('')).join('');
  const th = (k, l, ajuda) => { const on = ordem === k; return `<th class="n" aria-sort="${on ? (dir > 0 ? 'ascending' : 'descending') : 'none'}"><a class="th-b" href="${esc(ctx.router.href(null, { ordem: k, dir: on && dir < 0 ? 'asc' : null }))}">${esc(l)}${ajuda ? ui.ajuda(ajuda) : ''}<span class="th-s" aria-hidden="true"></span></a></th>`; };
  const total = orcamentoConta();
  return `${filtros(ctx, j)}
<p class="sm mut">Aqui você acompanha e decide (pausar, ativar, orçamento). Toda alteração pede que você digite SIM; no modo demonstração ela é apenas simulada.</p>
${ui.card({
    titulo: 'Campanhas, conjuntos e anúncios', sub: `${fmt.plural([...ent.values()].filter(e => e.nivel === 'campanha').length, 'campanha')} · orçamento diário da conta ${fmt.brl(total)} · clique na seta para abrir os níveis`, pad: false,
    acoes: `${ui.btn({ rotulo: 'Expandir tudo', sm: true, tipo: 'ghost', attrs: { 'data-exp-tudo': '1' } })}${ui.btn({ rotulo: 'Recolher', sm: true, tipo: 'ghost', attrs: { 'data-exp-tudo': '0' } })}`,
    corpo: `<div class="tbl-w m-campanha-tw" data-mobile="scroll"><table class="tbl m-campanha-tb" aria-label="Campanhas, conjuntos e anúncios"><thead><tr><th>Nome</th><th>Status</th><th class="n">Orçam./dia</th>${th('spend', 'Investimento')}${th('resultados', 'Resultados')}${th('cpr', 'Custo/result.', 'Custo por resultado do tipo da campanha (lead, conversa, compra ou engajamento). Cor vs meta: verde dentro, âmbar até 50% acima, vermelho acima disso.')}${th('ctr', 'CTR')}${th('cpm', 'CPM').replace('<th class="n"', '<th class="n m-campanha-xl"')}${th('freq', 'Freq.', 'Frequência média. Âmbar a partir de 2,5; vermelho a partir de 3,5.')}${th('roas', 'ROAS')}<th><span class="sr">Ações</span></th></tr></thead><tbody>${corpo}</tbody></table></div>`,
    rodape: `<span class="m-campanha-lgd"><i class="campanha"></i>Campanha</span><span class="m-campanha-lgd"><i class="conjunto"></i>Conjunto</span><span class="m-campanha-lgd"><i class="anuncio"></i>Anúncio</span>`,
  })}`;
}

/* ---------------- CRIATIVOS ---------------- */
function dadosCriativos(ctx, j) {
  const ent = entidades(); const rows = linhas().filter(noIntervalo(j.ini, j.fim)); const ag = porChave(rows, 'ad_id');
  const r7 = linhas().filter(noIntervalo(fmt.iso(new Date(fmt.toDate(j.fim).getTime() - 6 * 864e5)), j.fim)); const ag7 = porChave(r7, 'ad_id');
  return db.list('creatives').map(cr => {
    const ad = ent.get(cr.anuncioId) || {}; const m = ag.get(cr.anuncioId) || agregar([]); const t = doTipo(m, ad.tipo); const f7 = (ag7.get(cr.anuncioId) || {}).freq || m.freq || 0;
    const fad = f7 >= 3.5 ? 'err' : f7 >= 2.5 ? 'warn' : 'ok';
    return { cr, ad, m, t, f7, fad, campanha: (ent.get(ad.campanhaId) || {}).nome || '' };
  }).filter(x => x.m.spend > 0);
}
function criativos(ctx) {
  const { ui } = ctx; const j = janela(ctx); if (!j) return '';
  const rank = ['cpr', 'ctr', 'hook'].includes(ctx.query.rank) ? ctx.query.rank : 'cpr';
  const tipoF = ['lead', 'conversa', 'compra', 'engaj'].includes(ctx.query.tipo) ? ctx.query.tipo : '';
  let l = dadosCriativos(ctx, j); if (tipoF) l = l.filter(x => x.ad.tipo === tipoF);
  if (rank === 'hook') l = l.filter(x => x.m.hook != null);
  const v = x => (rank === 'cpr' ? x.t.cpr : rank === 'ctr' ? x.m.ctr : x.m.hook);
  // custo por resultado só é comparável dentro do mesmo tipo: ordena pelo índice vs meta do tipo
  const metas = (conta() || {}).metas || {};
  const chave = x => (rank === 'cpr' ? (x.t.cpr == null ? Infinity : x.t.cpr / (metas[x.ad.tipo] || 1)) : -(v(x) ?? -Infinity));
  l.sort((a, b) => chave(a) - chave(b));
  const FAD = { ok: 'Saudável', warn: 'Cansando', err: 'Saturado' };
  const FMT = { video: 'Vídeo', imagem: 'Imagem', carrossel: 'Carrossel' };
  const cards = l.map((x, i) => {
    const T = TIPOS[x.ad.tipo] || TIPOS.lead; const meta = metas[x.ad.tipo];
    return `<button type="button" class="m-campanha-cc" data-cr="${esc(x.cr.id)}" aria-label="Ver prévia de ${esc(x.cr.nome)}">
<div class="m-campanha-ct">${thumb(x.cr)}<span class="m-campanha-rk num">#${i + 1}</span><span class="m-campanha-fmt">${esc(FMT[x.cr.formato] || x.cr.formato)}</span></div>
<div class="m-campanha-cb"><b class="m-campanha-cn">${esc(x.cr.nome)}</b><span class="sm mut trunc">${esc(x.campanha)}</span>
<div class="row between">${ui.led(x.fad, `${FAD[x.fad]} · freq. ${fmt.dec(x.f7, 1)}`)}${x.ad.status !== 'ativo' ? '<span class="sm mut">pausado</span>' : ''}</div>
<dl class="m-campanha-cm"><div><dt>${esc(T.cpr)}</dt><dd class="num${meta && x.t.cpr > meta * 1.2 ? ' t-err' : ''}">${nz(x.t.cpr, fmt.brl2)}</dd></div><div><dt>CTR</dt><dd class="num">${nz(x.m.ctr, v2 => fmt.pct(v2, 2))}</dd></div><div><dt>Hook rate</dt><dd class="num">${x.m.hook != null ? fmt.pct(x.m.hook, 1) : '<span class="mut">—</span>'}</dd></div><div><dt>Investido</dt><dd class="num">${fmt.brl(x.m.spend)}</dd></div></dl></div></button>`;
  }).join('');
  return `${filtros(ctx, j)}
<div class="row between m-campanha-fil"><div class="row">${ui.chips([{ id: 'cpr', rotulo: 'Custo por resultado' }, { id: 'ctr', rotulo: 'CTR' }, { id: 'hook', rotulo: 'Hook rate (vídeos)' }], rank, 'rank', { rotulo: 'Ordenar ranking por' })}</div>
${ui.chips([{ id: '', rotulo: 'Todos os tipos' }, { id: 'lead', rotulo: 'Leads' }, { id: 'conversa', rotulo: 'Conversas' }, { id: 'compra', rotulo: 'Compras' }, { id: 'engaj', rotulo: 'Engajamento' }], tipoF, 'tipo', { rotulo: 'Tipo de resultado' })}</div>
<p class="sm mut">${rank === 'cpr' ? 'Ranking pelo custo por resultado relativo à meta do tipo (lead, conversa, compra), para comparar criativos de objetivos diferentes.' : rank === 'ctr' ? 'Ranking pela taxa de cliques.' : 'Hook rate = visualizações de 3 segundos (actions_video_view) ÷ impressões. Só vídeos.'} LED de fadiga pela frequência dos últimos 7 dias: verde &lt; 2,5 · âmbar 2,5–3,5 · vermelho ≥ 3,5.</p>
${l.length ? `<div class="m-campanha-cg">${cards}</div>` : ui.card({ corpo: ui.vazio({ titulo: 'Nenhum criativo neste filtro', texto: 'Troque o tipo de resultado ou o período.', compacto: true }) })}`;
}
function previa(ctx, crId) {
  const { ui } = ctx; const j = janela(ctx); const x = dadosCriativos(ctx, j).find(y => y.cr.id === crId); if (!x) return;
  const T = TIPOS[x.ad.tipo] || TIPOS.lead; const metas = (conta() || {}).metas || {};
  const corpo = `<div class="m-campanha-pv"><div class="m-campanha-post"><div class="m-campanha-ph"><span class="m-campanha-pav">A</span><div><b>Agência (página)</b><span class="sm mut">Patrocinado</span></div></div><p class="m-campanha-ptx">${esc(x.cr.texto)}</p>${thumb(x.cr, { cls: 'grande' })}<div class="m-campanha-pf"><div><span class="sm mut">agencia.demo</span><b>${esc(x.cr.titulo)}</b></div><span class="btn sm">${esc(x.cr.cta)}</span></div></div>
<div class="stack">${ui.pares([['Anúncio', esc(x.cr.nome)], ['Campanha', esc(x.campanha)], ['Formato', esc(x.cr.formato)], ['Fadiga', ui.led(x.fad, `frequência ${fmt.dec(x.f7, 2)} (7 dias)`)], [T.cpr, `${nz(x.t.cpr, fmt.brl2)}${metas[x.ad.tipo] ? ` <span class="mut">meta ${fmt.brl2(metas[x.ad.tipo])}</span>` : ''}`], [T.rot, fmt.num(x.t.n)], ['CTR', nz(x.m.ctr, v => fmt.pct(v, 2))], ['Hook rate', x.m.hook != null ? fmt.pct(x.m.hook, 1) : '—'], ['CPM', nz(x.m.cpm, fmt.brl2)], ['Investido', fmt.brl(x.m.spend)]], { colunas: 2 })}
${x.fad === 'err' ? ui.aviso({ tipo: 'warn', titulo: 'Criativo saturado.', texto: 'Veja a decisão recomendada na Visão geral: pausar ou pedir variação.' }) : ''}
<p class="sm mut">Prévia ilustrativa. A miniatura real vem do campo thumbnail_url do Windsor quando a conta estiver conectada.</p></div></div>`;
  ui.modal({ titulo: x.cr.nome, sub: 'Prévia do anúncio', corpo, confirmar: false, cancelar: 'Fechar', largura: 'lg' });
}

/* ---------------- CONEXÃO ---------------- */
/** produção: as duas contas reais, status na Windsor e atualização manual */
function conexaoReal(ctx) {
  const { ui } = ctx; const lim = limites();
  const linha = c => {
    const st = vivo.contas[c.k]; const n = (vivo.rows || []).filter(r => r.conta === c.k).length;
    const ult = (vivo.rows || []).filter(r => r.conta === c.k && r.spend > 0).map(r => r.date).sort().pop();
    const led = st ? (String(st.status).toUpperCase() === 'ACTIVE' ? ['ok', 'Ativa na Windsor'] : ['warn', `Status: ${st.status}`]) : ['off', 'Sem retorno da Windsor'];
    return `<tr><td><b>${esc(c.curto)}</b><div class="sm mut">${esc((st && st.nome) || c.nome)}</div></td><td><code>${esc(c.id)}</code></td><td>${ui.led(led[0], led[1])}</td><td class="n num">${fmt.num(n)}</td><td>${ult ? fmt.data(ult) : '<span class="mut">sem gasto no período</span>'}</td></tr>`;
  };
  return `${ui.card({
    titulo: 'Contas conectadas', icone: 'link', sub: `Meta Ads via Windsor.ai · últimos ${DIAS_VIVO} dias, por anúncio · atualizado ${ui.rel(vivo.em)}`,
    acoes: ui.btn({ rotulo: vivo.carregando ? 'Atualizando…' : 'Atualizar agora', icone: 'refresh', sm: true, attrs: { 'data-recarregar': '' }, disabled: vivo.carregando }),
    corpo: `<div class="tbl-w" data-mobile="scroll"><table class="tbl densa"><thead><tr><th>Conta</th><th>ID</th><th>Situação</th><th class="n">Linhas</th><th>Último gasto</th></tr></thead><tbody>${CONTAS.map(linha).join('')}</tbody></table></div>
${vivo.erro ? ui.aviso({ tipo: 'err', titulo: 'A última busca falhou', texto: vivo.erro }) : ''}
<p class="sm mut">Histórico carregado: ${lim ? `${fmt.data(lim.min)} a ${fmt.data(lim.max)}` : 'sem linhas'}.</p>
${ui.aviso({ tipo: 'info', titulo: 'A chave do Windsor nunca passa pelo navegador.', texto: 'WINDSOR_API_KEY fica só no servidor (Edge Function windsor-proxy). A função confere se quem pede é Dono ou Admin e devolve apenas os números das duas contas.' })}
${ui.aviso({ tipo: 'warn', titulo: NOTA_4G, texto: 'Por segurança este app não tem nenhum link para o Gerenciador de Anúncios.' })}`,
  })}`;
}
function conexao(ctx) {
  if (!db.dadosDemo) return conexaoReal(ctx);
  const { ui } = ctx; const c = conta() || {}; const pode = podeAlterar(ctx);
  const est = c.conectada ? ['ok', 'Conectada'] : c.accountId ? ['warn', 'Conta informada · aguardando a chave no servidor'] : ['off', 'Não conectada · dados de demonstração'];
  const exemplo = `GET ${'${SUPABASE_URL}'}/functions/v1/windsor-proxy?account=${c.accountId || 'act_1234567890'}&date_from=AAAA-MM-DD&date_to=AAAA-MM-DD
Authorization: Bearer <token da sessão do usuário (Supabase Auth)>`;
  return `<div class="g-2-1">
${ui.card({
    titulo: 'Conta conectada', icone: 'link', corpo: `<div class="stack">
<div class="row between">${ui.led(est[0], est[1])}<span class="sm mut">Última sincronização ${ui.rel(c.ultimaSync)}</span></div>
${ui.pares([['Conta', esc(c.nome || '—')], ['Plataforma', esc(c.plataforma || 'Meta Ads')], ['Fonte dos dados', esc(c.fonte || 'Windsor.ai')], ['ID da conta', c.accountId ? `<code>${esc(c.accountId)}</code>` : '<span class="mut">não informado</span>'], ['Fuso e moeda', `${esc(c.fuso || 'America/Sao_Paulo')} · ${esc(c.moeda || 'BRL')}`], ['Histórico', limites() ? `${fmt.data(limites().min)} a ${fmt.data(limites().max)}` : '—']], { colunas: 2 })}
<form class="stack m-campanha-cx" novalidate>${ui.campo({ nome: 'accountId', rotulo: 'ID da conta de anúncios (account_id)', valor: c.accountId || '', placeholder: 'act_1234567890', dica: 'Formato act_ seguido de números. Você encontra no topo da sua conta de anúncios; não é preciso colar nenhum link.', desabilitado: !pode })}
<div class="row">${ui.btn({ rotulo: 'Conectar via Windsor', icone: 'link', tipo: 'pri', attrs: { 'data-conectar': '' }, disabled: !pode, title: pode ? '' : SEM_PERM })}${ui.btn({ rotulo: 'Testar conexão', icone: 'refresh', attrs: { 'data-testar': '' } })}${c.accountId && pode ? ui.btn({ rotulo: 'Desconectar', tipo: 'ghost', attrs: { 'data-desconectar': '' } }) : ''}</div>
<div class="m-campanha-teste sm" data-teste-out aria-live="polite"></div></form>
${ui.aviso({ tipo: 'info', titulo: 'A chave do Windsor nunca passa pelo navegador.', texto: 'WINDSOR_API_KEY fica guardada só no servidor, como segredo da Edge Function windsor-proxy do Supabase. O app chama /functions/v1/windsor-proxy?account=… com a sessão do usuário; a função confere se é o dono, busca no Windsor e devolve só os dados.' })}
${ui.aviso({ tipo: 'warn', titulo: NOTA_4G, texto: 'Por segurança este app não tem nenhum link para o Gerenciador de Anúncios. Aqui você só acompanha e toma decisões de pausa e orçamento.' })}
</div>`,
  })}
${ui.card({
    titulo: 'Como funciona', icone: 'info', corpo: `<ol class="m-campanha-pass"><li><b>Você informa o account_id</b> da conta (act_…).</li><li><b>O administrador cadastra a chave</b> WINDSOR_API_KEY nos segredos do Supabase (nunca no app).</li><li><b>A Edge Function windsor-proxy</b> busca os campos abaixo, por dia e por anúncio, e guarda em campaignDaily.</li><li><b>A sincronização roda todo dia às 06:00</b> (rotina na Torre) e quando você clica em "Testar conexão".</li></ol>
<h3 class="m-campanha-h3">Chamada do front</h3><pre class="m-campanha-code"><code>${esc(exemplo)}</code></pre>`,
  })}</div>
${ui.card({
    titulo: 'Campos puxados do Windsor.ai', sub: 'Conector "facebook" (Meta Ads) · nomes exatos dos campos', corpo: `<p class="sm">Principais: <b>date, campaign, adset, ad, spend, impressions, clicks, actions, action_values, frequency, reach</b>. Lista exata enviada em <code>fields=</code>:</p>
<div class="m-campanha-fl">${CAMPOS_WINDSOR.map(f => `<code>${esc(f)}</code>`).join('')}</div>
<p class="sm mut">Quebras (consultas separadas, por período): ${CAMPOS_QUEBRA.map(f => `<code>${esc(f)}</code>`).join(' ')}. "actions" e "action_values" chegam no Windsor como campos por tipo de ação (actions_lead, actions_purchase, action_values_purchase…).</p>
<pre class="m-campanha-code"><code>fields=${esc(CAMPOS_WINDSOR.join(','))}</code></pre>`,
  })}`;
}

/* ---------------- ações (sempre com SIM) ---------------- */
async function confirmarSIM(ctx, { titulo, resumo, detalhe }) {
  const { ui } = ctx; const demo = !(conta() || {}).conectada;
  return ui.modal({
    titulo, perigo: true, confirmar: 'Confirmar alteração', largura: 'sm',
    corpo: `<form class="stack" novalidate><p class="mb-txt"><b>${esc(resumo)}</b></p>${detalhe ? `<p class="sm mut">${esc(detalhe)}</p>` : ''}
${demo ? ui.aviso({ tipo: 'info', texto: 'Modo demonstração: a alteração será apenas simulada aqui. Nada é enviado ao Meta Ads.' }) : ''}
${ui.campo({ nome: 'sim', rotulo: 'Digite SIM para confirmar', obrigatorio: true, placeholder: 'SIM', attrs: { autocomplete: 'off', 'data-sim': '' } })}</form>`,
    onConfirmar: box => { const v = String(box.querySelector('[data-sim]').value || '').trim(); if (v !== 'SIM') { const i = box.querySelector('[data-sim]'); i.setAttribute('aria-invalid', 'true'); i.focus(); return 'Digite SIM (em maiúsculas) para confirmar. Nada foi alterado.'; } return true; },
  });
}
const LOG_DE = { aplicada: 'aceita', ignorada: 'recusada', adiada: 'adiada' };
/** grava o estado da recomendação (campaignAccount.decisoes) e a entrada de aprendizado (recsLog). Devolve as decisões anteriores (Desfazer). */
function registrarDecisao(id, estado, extra = {}, recObj = null) {
  garantirConta();
  const c = conta(); const u = auth.real() || auth.user();
  const dec = { ...(c.decisoes || {}) }; const antes = c.decisoes || {};
  const rec = recObj || recomendacoes().find(x => x.id === id);
  if (estado) {
    let logId = null;
    if (rec && LOG_DE[estado]) logId = logar(rec, LOG_DE[estado], u ? u.id : null);
    const copia = rec ? (({ decisao, estado: _e, historico, ...resto }) => resto)(rec) : null;
    dec[id] = { estado, em: new Date().toISOString(), por: u ? u.id : null, simulado: !c.conectada, rec: copia, logId, ...extra };
  } else { const d = dec[id]; if (d && d.logId) db.remove(COL_LOG, d.logId); delete dec[id]; }
  db.update('campaignAccount', c.id, { decisoes: dec });
  return antes;
}
/** Desfazer: volta as decisões e remove a entrada de aprendizado criada */
function desfazerDecisao(decAntes, id) {
  const d = ((conta() || {}).decisoes || {})[id]; if (d && d.logId && !(decAntes[id] && decAntes[id].logId === d.logId)) db.remove(COL_LOG, d.logId);
  db.update('campaignAccount', conta().id, { decisoes: decAntes });
}
async function mudarStatus(ctx, id, novo, decisaoId, recObj) {
  if (!db.dadosDemo) { ctx.ui.toast('Nas contas reais, pausar e mudar orçamento por aqui ainda não está ligado. ' + NOTA_4G, { tipo: 'warn' }); return; }
  const { ui } = ctx; const e = db.get('campaigns', id); if (!e) return false;
  novo = novo || (e.status === 'ativo' ? 'pausado' : 'ativo');
  const total = orcamentoConta(); let depois = total;
  if (e.nivel === 'conjunto') depois = total + (novo === 'ativo' ? 1 : -1) * (e.orcamentoDia || 0);
  if (e.nivel === 'campanha') { const s = db.list('campaigns', x => x.paiId === e.id && x.status === 'ativo').reduce((a, x) => a + (x.orcamentoDia || 0), 0); depois = total + (novo === 'ativo' ? s : -s); }
  const ok = await confirmarSIM(ctx, { titulo: `${novo === 'pausado' ? 'Pausar' : 'Ativar'} ${NIVEL[e.nivel].toLowerCase()}?`, resumo: `${novo === 'pausado' ? 'Pausar' : 'Ativar'} "${e.nome}".`, detalhe: depois === total ? `O orçamento diário da conta continua ${fmt.brl(total)}.` : `A conta passa a investir ${fmt.brl(depois)} por dia (hoje ${fmt.brl(total)}).` });
  if (!ok) return false;
  const antes = db.get('campaigns', id); const decAntes = (conta().decisoes || {});
  db.update('campaigns', id, { status: novo, alteradoEm: new Date().toISOString(), simulado: !(conta() || {}).conectada }, { log: `${novo === 'pausado' ? 'pausou' : 'ativou'} ${NIVEL[e.nivel].toLowerCase()} "${e.nome}" na conta própria${(conta() || {}).conectada ? '' : ' (simulado)'}` });
  if (decisaoId) registrarDecisao(decisaoId, 'aplicada', {}, recObj);
  ui.toast(`${NIVEL[e.nivel]} ${novo === 'pausado' ? 'pausado' : 'ativado'}${(conta() || {}).conectada ? '' : ' (simulado — nada foi enviado ao Meta Ads)'}.`, { desfazer: () => { db.insert('campaigns', antes); desfazerDecisao(decAntes, decisaoId); } });
  return true;
}
async function mudarOrcamento(ctx, id, novoValor, decisaoId, recObj) {
  if (!db.dadosDemo) { ctx.ui.toast('Nas contas reais, pausar e mudar orçamento por aqui ainda não está ligado. ' + NOTA_4G, { tipo: 'warn' }); return; }
  const { ui } = ctx; const e = db.get('campaigns', id); if (!e) return false;
  let valor = novoValor;
  if (valor == null) {
    // limites da central "Padrões e regras" (Orçamento): mínimo por dia, aviso de aumento e teto que exige o financeiro
    const minimo = padrao('orcamento.minimoDia', 6), maxPct = padrao('orcamento.aumentoMaxPct', 20), maxDia = padrao('orcamento.confirmarFinanceiroAcima', 5000);
    const r = await ui.modal({
      titulo: 'Alterar orçamento diário', sub: e.nome, confirmar: 'Continuar',
      corpo: `<form class="stack" novalidate>${ui.campo({ nome: 'v', rotulo: 'Novo orçamento diário', tipo: 'moeda', valor: e.orcamentoDia, obrigatorio: true, dica: `Atual: ${fmt.brl(e.orcamentoDia)}. Mudanças acima de ${fmt.num(maxPct)}% podem reiniciar o aprendizado do Meta.` })}</form>`,
      onConfirmar: box => { const f = box.querySelector('form'); const x = ui.form.validar(f, { v: ['obrigatorio', v => (v >= minimo ? '' : `O mínimo é ${fmt.brl2(minimo)} por dia.`), v => (v <= maxDia ? '' : `Acima de ${fmt.brl(maxDia)}/dia: confirme com o financeiro antes.`)] }); if (!x.ok) return false; valor = Math.round(x.dados.v * 100) / 100; return true; },
    });
    if (!r) return false;
  }
  const total = orcamentoConta(); const depois = total - (e.status === 'ativo' ? e.orcamentoDia : 0) + (e.status === 'ativo' ? valor : 0);
  const teto = (conta() || {}).tetoDiario;
  const aum = e.orcamentoDia ? ((valor - e.orcamentoDia) / e.orcamentoDia) * 100 : 0; const lim = padrao('orcamento.aumentoMaxPct', 20);
  const ok = await confirmarSIM(ctx, { titulo: 'Confirmar novo orçamento?', resumo: `"${e.nome}": ${fmt.brl(e.orcamentoDia)} → ${fmt.brl(valor)} por dia.`, detalhe: `A conta passa a investir ${fmt.brl(depois)} por dia (hoje ${fmt.brl(total)}).${teto && depois > teto ? ` Atenção: passa do teto diário de ${fmt.brl(teto)}.` : ''}${aum > lim ? ` Aumento de ${fmt.num(Math.round(aum))}%, acima de ${fmt.num(lim)}%: pode reiniciar o aprendizado do Meta.` : ''}` });
  if (!ok) return false;
  const antes = db.get('campaigns', id); const decAntes = (conta().decisoes || {});
  db.update('campaigns', id, { orcamentoDia: valor, alteradoEm: new Date().toISOString(), simulado: !(conta() || {}).conectada }, { log: `alterou o orçamento de "${e.nome}" de ${fmt.brl(e.orcamentoDia)} para ${fmt.brl(valor)}/dia${(conta() || {}).conectada ? '' : ' (simulado)'}` });
  if (decisaoId) registrarDecisao(decisaoId, 'aplicada', { de: e.orcamentoDia, para: valor }, recObj);
  ui.toast(`Orçamento alterado para ${fmt.brl(valor)}/dia. A conta passa a investir ${fmt.brl(depois)} por dia${(conta() || {}).conectada ? '' : ' (simulado)'}.`, { desfazer: () => { db.insert('campaigns', antes); desfazerDecisao(decAntes, decisaoId); } });
  return true;
}
async function aplicar(ctx, recId) {
  const { ui, notify } = ctx; const r = recomendacoes().find(x => x.id === recId); if (!r) return;
  const tipo = r.acao.tipo;
  if (tipo === 'pausar') return mudarStatus(ctx, r.alvo.id, 'pausado', r.id, r);
  if (tipo === 'orcamento') return mudarOrcamento(ctx, r.alvo.id, r.para, r.id, r);
  if (tipo === 'pedirCriativo') {
    const design = db.find('team', t => t.area === 'Design' && t.ativo !== false) || db.get('team', 't-carla');
    const ok = await ui.modal({ titulo: 'Pedir criativo novo', sub: r.alvo.nome, confirmar: `Enviar para ${design ? fmt.primeiro(design.nome) : 'Design'}`, corpo: `<form class="stack" novalidate>${ui.campo({ nome: 'msg', rotulo: 'Pedido', tipo: 'textarea', linhas: 4, valor: `Criar 2 variações de criativo para o conjunto "${r.alvo.nome}" (novo gancho nos 3 primeiros segundos ou nova capa). ${r.porque}`, obrigatorio: true })}<p class="sm mut">${esc(NOTA_4G)}</p></form>`, onConfirmar: box => { const x = ui.form.validar(box.querySelector('form')); if (!x.ok) return false; if (design && design.userId) notify.enviar({ para: [design.userId], tipo: 'atribuicao', prioridade: 'normal', titulo: 'Criativo novo para a conta própria', texto: x.dados.msg, link: '#/notificacoes', refCol: 'campaigns', refId: r.alvo.id }); return true; } });
    if (!ok) return;
    const decAntes = registrarDecisao(r.id, 'aplicada', { simulado: false }, r);
    db.update('campaigns', r.alvo.id, {}, { log: `pediu criativo novo para "${r.alvo.nome}" à Design` });
    ui.toast(`Pedido enviado para ${design ? design.nome : 'Design'}.`, { desfazer: () => desfazerDecisao(decAntes, r.id) });
    return;
  }
  const aguardar = tipo === 'aguardar';
  const ok = await ui.modal({ titulo: aguardar ? 'Aguardar mais dados?' : 'Marcar como feita?', corpo: `<p class="mb-txt">${esc(textoAcao(r))}</p>`, confirmar: aguardar ? 'Ciente' : 'Já fiz no Gerenciador' });
  if (!ok) return;
  const decAntes = registrarDecisao(r.id, 'aplicada', { simulado: false });
  ui.toast('Decisão registrada.', { desfazer: () => desfazerDecisao(decAntes, r.id) });
}
async function ignorar(ctx, recId) {
  const { ui } = ctx; const r = recomendacoes().find(x => x.id === recId); if (!r) return;
  let motivo = '';
  const ok = await ui.modal({ titulo: 'Ignorar recomendação?', sub: r.titulo, confirmar: 'Ignorar', corpo: `<form class="stack" novalidate>${ui.campo({ nome: 'motivo', rotulo: 'Motivo (opcional)', tipo: 'textarea', placeholder: 'Ex.: criativo novo entra amanhã', dica: 'O motivo ajuda a calibrar a regra em "Regras da IA".' })}</form>`, onConfirmar: box => { motivo = box.querySelector('[name="motivo"]').value.trim(); return true; } });
  if (!ok) return;
  const decAntes = registrarDecisao(r.id, 'ignorada', { motivo, simulado: false });
  db.update('campaignAccount', conta().id, {}, { log: `ignorou a recomendação "${r.titulo}"${motivo ? `: ${motivo}` : ''}` });
  ui.toast('Recomendação ignorada.', { tipo: 'info', desfazer: () => desfazerDecisao(decAntes, r.id) });
}
function adiar(ctx, recId) {
  const r = recomendacoes().find(x => x.id === recId); if (!r) return;
  const ate = new Date(); ate.setDate(ate.getDate() + 3);
  const decAntes = registrarDecisao(r.id, 'adiada', { ate: fmt.iso(ate), simulado: false });
  ctx.ui.toast(`Recomendação adiada até ${fmt.data(ate)}.`, { tipo: 'info', desfazer: () => desfazerDecisao(decAntes, r.id) });
}

/* ---------------- módulo ---------------- */
export default {
  id: 'campanha', titulo: 'Campanha', icone: 'megaphone', grupo: 'trafego', rota: 'campanha', routes: ['campanha', 'campanha/:aba'],
  watch: ['campaignAccount', 'campaigns', 'campaignDaily', 'creatives', 'settings', 'recsLog'],
  render(ctx) {
    const aba = ctx.params.aba || 'visao';
    selecionar(ctx.query.conta);
    if (!db.dadosDemo) {
      const r = auth.real() || auth.user();
      if (!r || !['dono', 'admin'].includes(r.papel)) return `<div class="pg m-campanha">${ctx.ui.cabecalho({ titulo: 'Campanha', sub: 'Contas próprias do dono (CA01 e CA02 · HOF).' })}${ctx.ui.card({ corpo: ctx.ui.vazio({ icone: 'lock', titulo: 'Só Dono e Admin', texto: 'Os números das contas próprias ficam visíveis só para o dono e a administradora.' }) })}</div>`;
      if (!vivo.rows) {
        carregarVivo();
        const corpo = vivo.erro ? ctx.ui.vazio({ icone: 'alert', titulo: 'Não foi possível buscar as contas', texto: `${vivo.erro} Tente de novo em instantes.`, acao: { rotulo: 'Tentar de novo', attrs: { 'data-recarregar': '' } } })
          : ctx.ui.vazio({ icone: 'refresh', titulo: 'Buscando CA01 e CA02 · HOF no Windsor…', texto: `Últimos ${DIAS_VIVO} dias, por anúncio. Leva alguns segundos.` });
        return `<div class="pg m-campanha">${topo(ctx, aba)}${ctx.ui.card({ corpo })}</div>`;
      }
      carregarVivo(); // atualiza em segundo plano depois de 5 min
    }
    const ABAS = { visao, campanhas, criativos, regras: regrasAba, conexao };
    try { avaliarPendentes(); } catch (e) { /* sem dados para avaliar */ }
    if (!ABAS[aba]) return `<div class="pg m-campanha">${topo(ctx, 'visao')}${ctx.ui.vazio({ icone: 'search', titulo: 'Aba não encontrada', texto: 'Escolha uma das abas acima.', acao: { rotulo: 'Visão geral', href: '#/campanha' } })}</div>`;
    if (aba !== 'visao') ctx.migalha({ campanhas: 'Campanhas', criativos: 'Criativos', regras: 'Regras da IA', conexao: 'Conexão' }[aba]);
    return `<div class="pg m-campanha">${topo(ctx, aba)}${ABAS[aba](ctx)}</div>`;
  },
  mount(el, ctx) {
    const onClick = e => {
      const t = e.target;
      const ap = t.closest('[data-aplicar]'); if (ap) { aplicar(ctx, ap.dataset.aplicar); return; }
      const ig = t.closest('[data-ignorar]'); if (ig) { ignorar(ctx, ig.dataset.ignorar); return; }
      const ad = t.closest('[data-adiar]'); if (ad) { adiar(ctx, ad.dataset.adiar); return; }
      const re = t.closest('[data-reabrir]'); if (re) { registrarDecisao(re.dataset.reabrir, null); ctx.ui.toast('Recomendação reaberta.', { tipo: 'info' }); return; }
      const st = t.closest('[data-status]'); if (st) { mudarStatus(ctx, st.dataset.status); return; }
      const oc = t.closest('[data-orc]'); if (oc) { mudarOrcamento(ctx, oc.dataset.orc); return; }
      const ex = t.closest('[data-exp]');
      if (ex) {
        const id = ex.dataset.exp; const abrir = !abertos.has(id); if (abrir) abertos.add(id); else abertos.delete(id);
        ex.setAttribute('aria-expanded', String(abrir)); ex.setAttribute('aria-label', `${abrir ? 'Recolher' : 'Expandir'} ${ex.closest('tr').querySelector('.m-campanha-nmt').textContent}`);
        sincronizarLinhas(el); return;
      }
      const et = t.closest('[data-exp-tudo]');
      if (et) { const on = et.dataset.expTudo === '1'; el.querySelectorAll('[data-exp]').forEach(b => { if (on) abertos.add(b.dataset.exp); else abertos.delete(b.dataset.exp); b.setAttribute('aria-expanded', String(on)); }); sincronizarLinhas(el); return; }
      const cr = t.closest('[data-cr]'); if (cr) { previa(ctx, cr.dataset.cr); return; }
      const sg = t.closest('.m-campanha-qs [data-seg]');
      if (sg) { el.querySelectorAll('[data-qb]').forEach(d => { d.hidden = d.dataset.qb !== sg.dataset.seg; }); ctx.router.setQuery({ quebra: sg.dataset.seg === 'posicionamento' ? null : sg.dataset.seg }); return; }
      if (t.closest('[data-recarregar]')) { carregarVivo({ forcar: true }); return; }
      if (t.closest('[data-testar]')) { testar(el, ctx); return; }
      if (t.closest('[data-conectar]')) { conectar(el, ctx); return; }
      if (t.closest('[data-desconectar]')) { desconectar(ctx); }
    };
    const onToggle = e => { const d = e.target; if (d.matches && d.matches('[data-porque]') && d.open) { porques.add(d.dataset.porque); salvarPorques(); } };
    const onSub = e => { if (e.target.closest('.m-campanha-cx')) { e.preventDefault(); conectar(el, ctx); } };
    el.addEventListener('click', onClick); el.addEventListener('toggle', onToggle, true); el.addEventListener('submit', onSub);
    const off = (ctx.params.aba === 'regras') ? montarRegras(el, ctx) : null;
    const offVivo = db.dadosDemo ? null : ouvirVivo(() => ctx.refresh());
    return () => { if (offVivo) offVivo(); el.removeEventListener('click', onClick); el.removeEventListener('toggle', onToggle, true); el.removeEventListener('submit', onSub); if (off) off(); };
  },
  contador() {
    const p = pendentes(); const n = p.length; if (!n) return null;
    return { n, estado: p.some(r => r.prioridade === 'agora') ? 'err' : 'warn', rotulo: `${fmt.plural(n, 'decisão recomendada pendente', 'decisões recomendadas pendentes')}` };
  },
  busca(q) {
    return db.list('campaigns', c => c.nivel !== 'anuncio' && fmt.norm(c.nome).includes(q)).slice(0, 6).map(c => ({
      tipo: 'Campanha', titulo: c.nome, sub: `${NIVEL[c.nivel]} · ${c.status === 'ativo' ? 'ativo' : 'pausado'}`, href: `#/campanha/campanhas?abrir=${c.id}`, led: c.status === 'ativo' ? 'ok' : 'off', icone: 'megaphone',
    }));
  },
};

function sincronizarLinhas(el) {
  el.querySelectorAll('tr.m-campanha-n').forEach(tr => {
    if (tr.classList.contains('campanha')) return;
    const pai = tr.dataset.pai; const paiTr = el.querySelector(`tr[data-id="${CSS.escape(pai)}"]`);
    const visivelPai = paiTr && !paiTr.classList.contains('oculto');
    tr.classList.toggle('oculto', !(abertos.has(pai) && visivelPai));
  });
  // segunda passada: anúncios dependem do conjunto já atualizado
  el.querySelectorAll('tr.m-campanha-n.anuncio').forEach(tr => { const paiTr = el.querySelector(`tr[data-id="${CSS.escape(tr.dataset.pai)}"]`); tr.classList.toggle('oculto', !(abertos.has(tr.dataset.pai) && paiTr && !paiTr.classList.contains('oculto'))); });
}

const ACT = /^act_\d{6,20}$/;
function conectar(el, ctx) {
  const { ui } = ctx; if (!podeAlterar(ctx)) { ui.toast(SEM_PERM, { tipo: 'warn' }); return; }
  const inp = el.querySelector('.m-campanha-cx [name="accountId"]'); const f = inp.closest('form'); ui.form.limparErros(f);
  const v = String(inp.value || '').trim();
  const r = ui.form.validar(f, { accountId: ['obrigatorio', x => (ACT.test(String(x).trim()) ? '' : 'Use o formato act_ seguido de 6 a 20 números, ex.: act_1234567890.')] });
  if (!r.ok) return;
  const c = conta();
  db.update('campaignAccount', c.id, { accountId: v, conectada: false, conectadaEm: null }, { log: `informou a conta de anúncios ${v} para conexão via Windsor` });
  ui.toast(db.mode === 'demo' ? `Conta ${v} salva. No modo demonstração os dados continuam simulados; em produção a Edge Function windsor-proxy faz a primeira sincronização.` : `Conta ${v} salva. Sincronizando pela Edge Function windsor-proxy…`, { tipo: 'info' });
}
function desconectar(ctx) {
  const c = conta(); const antes = { accountId: c.accountId, conectada: c.conectada };
  db.update('campaignAccount', c.id, { accountId: null, conectada: false }, { log: 'desconectou a conta de anúncios própria' });
  ctx.ui.toast('Conta desconectada. Voltamos aos dados de demonstração.', { desfazer: () => db.update('campaignAccount', c.id, antes) });
}
async function testar(el, ctx) {
  const out = el.querySelector('[data-teste-out]'); const c = conta(); const b = el.querySelector('[data-testar]');
  const passo = (txt, e = 'ok') => { out.insertAdjacentHTML('beforeend', `<div class="row">${ctx.ui.led(e, false)}<span>${esc(txt)}</span></div>`); };
  out.innerHTML = ''; b.disabled = true;
  const espera = ms => new Promise(r => setTimeout(r, ms));
  if (db.mode !== 'demo' && db.supabase && db.supabase.functions && c.accountId) {
    try {
      const { data, error } = await db.supabase.functions.invoke(`windsor-proxy?account=${encodeURIComponent(c.accountId)}&teste=1`, { method: 'GET' });
      if (error) throw error;
      passo(`Conexão ok: ${data && data.linhas != null ? `${fmt.num(data.linhas)} linhas` : 'resposta recebida'}.`);
      db.update('campaignAccount', c.id, { conectada: true, ultimaSync: new Date().toISOString() }, { log: 'testou a conexão com o Windsor (ok)' });
    } catch (e) { passo(`Falhou: ${e.message || e}. Confira se a chave WINDSOR_API_KEY está nos segredos da função e se o account_id está certo.`, 'err'); }
    b.disabled = false; return;
  }
  passo('Simulação (modo demonstração) · chamando /functions/v1/windsor-proxy…', 'off'); await espera(350);
  passo('Função respondeu em 0,4 s (simulado).'); await espera(250);
  passo(c.accountId ? `Conta ${c.accountId} encontrada no Windsor (simulado).` : 'Nenhum account_id informado: usando a conta de demonstração.', c.accountId ? 'ok' : 'warn'); await espera(250);
  const lim = limites(); passo(`${fmt.num(linhas().length)} linhas diárias por anúncio${lim ? ` de ${fmt.data(lim.min)} a ${fmt.data(lim.max)}` : ''}.`);
  ctx.ui.toast(`Teste concluído (simulado): ${fmt.num(linhas().length)} linhas disponíveis. Última sincronização atualizada.`);
  db.update('campaignAccount', c.id, { ultimaSync: new Date().toISOString() }, { log: 'testou a conexão com o Windsor (simulado)' });
  b.disabled = false;
}
