// voo-modelo.js — Painel de Voo: transforma o pacote compacto (voo-dados ou voo-demo) em contas com árvore
// campanha › conjunto › anúncio, janelas de métricas, semáforo, orçamento diário × teto do cliente, diagnóstico ("por quê"),
// recomendações do motor único (src/shared/motor-recs.js) e mensagem sugerida ao cliente. Sem DOM.
import MotorRecs from '../../shared/motor-recs.mjs';

/* layout de uma linha do pacote */
const L = { dia: 0, ad: 1, gasto: 2, impr: 3, alcance: 4, cliques: 5, link: 6, leads: 7, conv: 8, compras: 9, valor: 10 };
const ZERO = () => ({ gasto: 0, impr: 0, alcance: 0, alcMax: 0, cliques: 0, link: 0, leads: 0, conv: 0, compras: 0, valor: 0, temValor: false });
export const ATIVO = st => st === 'ACTIVE';
export const normConta = v => String(v ?? '').replace(/^act_/i, '').replace(/\D/g, '');

/** janelas (índices no array de 15 dias; o último é hoje, parcial): métricas de 3/7/14 dias usam só dias completos */
export const JANELAS = { hoje: [14, 14], ontem: [13, 13], d3: [11, 13], d7: [7, 13], d7ant: [0, 6], d14: [0, 13] };

export const SEMAFORO = {
  crit: { rotulo: 'Crítico', led: 'err', ordem: 0 },
  par: { rotulo: 'Conta parada', led: 'err', ordem: 1 },
  caro: { rotulo: 'Caro', led: 'warn', ordem: 2 },
  aten: { rotulo: 'Atenção', led: 'warn', ordem: 3 },
  ins: { rotulo: 'Dados insuficientes', led: 'off', ordem: 4 },
  sem: { rotulo: 'Sem CP de MSG', led: 'off', ordem: 5 },
  meta: { rotulo: 'Sem meta de custo', led: 'off', ordem: 6 },
  bom: { rotulo: 'Bom', led: 'ok', ordem: 7 },
  exc: { rotulo: 'Excelente', led: 'ok', ordem: 8 },
  off: { rotulo: 'Sem veiculação', led: 'off', ordem: 9 },
};
export const STATUS_META = { ACTIVE: 'Ativo', PAUSED: 'Pausado', CAMPAIGN_PAUSED: 'Campanha pausada', ADSET_PAUSED: 'Conjunto pausado', DISAPPROVED: 'Reprovado', WITH_ISSUES: 'Com problema', ARCHIVED: 'Arquivado', DELETED: 'Excluído', IN_PROCESS: 'Em análise', PENDING_REVIEW: 'Em análise', PENDING_BILLING_INFO: 'Pagamento pendente' };
export const STATUS_CONTA = { ACTIVE: null, UNSETTLED: 'Pagamento pendente', IN_GRACE_PERIOD: 'Pagamento em atraso (carência)', DISABLED: 'Conta desativada', PENDING_RISK_REVIEW: 'Em análise de risco', PENDING_CLOSURE: 'Encerrando' };

function somar(a, l) {
  a.gasto += l[L.gasto]; a.impr += l[L.impr]; a.alcance += l[L.alcance]; a.alcMax = Math.max(a.alcMax, l[L.alcance]);
  a.cliques += l[L.cliques]; a.link += l[L.link]; a.leads += l[L.leads]; a.conv += l[L.conv]; a.compras += l[L.compras];
  if (l[L.valor] != null) { a.valor += l[L.valor]; a.temValor = true; }
}
function juntar(lst) { const a = ZERO(); for (const x of lst) { a.gasto += x.gasto; a.impr += x.impr; a.alcance += x.alcance; a.alcMax = Math.max(a.alcMax, x.alcMax); a.cliques += x.cliques; a.link += x.link; a.leads += x.leads; a.conv += x.conv; a.compras += x.compras; a.valor += x.valor; a.temValor = a.temValor || x.temValor; } return a; }
/** derivadas: CTR, CPM, CPC, frequência (alcance da janela ESTIMADO: maior alcance diário + 50% dos demais — a Windsor manda alcance por dia) */
export function derivar(m) {
  const alc = m.alcMax + 0.5 * Math.max(0, m.alcance - m.alcMax);
  return { ...m, alcanceEst: alc, ctr: m.impr ? (m.cliques / m.impr) * 100 : null, cpm: m.impr ? (m.gasto / m.impr) * 1000 : null, cpc: m.link ? m.gasto / m.link : null,
    freq: alc ? m.impr / alc : null, custoConv: m.conv ? m.gasto / m.conv : null, cpl: m.leads ? m.gasto / m.leads : null, cpa: m.compras ? m.gasto / m.compras : null, roas: m.temValor && m.gasto ? m.valor / m.gasto : null };
}
const r2 = v => Math.round(v * 100) / 100;

/**
 * monta o modelo. o = {clientes: [clients], pendentes: Map(objId → {st?, orc?}), padrao(id, fallback), mudancas: {objId: [iso]},
 *   tetoDia(cliente) → R$/dia (tetoDiarioCliente), regras (overrides do motor), incidentes: Map(contaId → incidente), ultimaMsg(clientId) → iso|null, alteradoEm(objId) → iso|null}
 */
export function montarModelo(pac, o = {}) {
  if (!pac || !Array.isArray(pac.linhas)) return { contas: [], porId: new Map(), dias: [] };
  const P = (id, f) => (o.padrao ? o.padrao(id, f) : f);
  const pend = o.pendentes || new Map();
  const cliPorConta = new Map();
  for (const c of o.clientes || []) for (const id of [...(Array.isArray(c.metaContas) ? c.metaContas : []), c.metaAdAccountId].map(normConta).filter(Boolean)) if (!cliPorConta.has(id)) cliPorConta.set(id, c);
  // estrutura com os valores otimistas (ação aplicada, aguardando confirmação do Meta/Windsor)
  const ap = (col, id, x) => { const p = pend.get(id); if (!p) return { ...x, id, pendente: null }; const conf = (p.st == null || p.st === x.st) && (p.orc == null || Math.abs((x.orc || 0) - p.orc) < 0.005); return { ...x, id, st: p.st ?? x.st, orc: p.orc ?? x.orc, pendente: conf ? null : p }; };
  const camps = new Map(Object.entries(pac.camps || {}).map(([id, x]) => [id, { ...ap('camps', id, x), sets: [], dias: Array.from({ length: 15 }, ZERO) }]));
  const sets = new Map(Object.entries(pac.sets || {}).map(([id, x]) => [id, { ...ap('sets', id, x), ads: [], dias: Array.from({ length: 15 }, ZERO) }]));
  const ads = new Map(Object.entries(pac.ads || {}).map(([id, x]) => [id, { ...ap('ads', id, x), dias: Array.from({ length: 15 }, ZERO) }]));
  for (const s of sets.values()) { const c = camps.get(String(s.c)); if (c) { c.sets.push(s); s.camp = c; } }
  for (const a of ads.values()) { const s = sets.get(String(a.s)); if (s) { s.ads.push(a); a.set = s; } }
  // status efetivo: campanha pausada pausa os conjuntos e anúncios; conjunto pausado pausa os anúncios
  for (const s of sets.values()) if (s.camp && !ATIVO(s.camp.st) && ATIVO(s.st)) s.st = 'CAMPAIGN_PAUSED';
  for (const a of ads.values()) if (a.set && !ATIVO(a.set.st) && ATIVO(a.st)) a.st = a.set.st === 'CAMPAIGN_PAUSED' ? 'CAMPAIGN_PAUSED' : 'ADSET_PAUSED';
  for (const l of pac.linhas) { const a = ads.get(String(l[L.ad])); if (!a) continue; somar(a.dias[l[L.dia]], l); if (a.set) { somar(a.set.dias[l[L.dia]], l); if (a.set.camp) somar(a.set.camp.dias[l[L.dia]], l); } }
  const jan = (dias, [i, j]) => derivar(juntar(dias.slice(i, j + 1)));
  const janelas = x => { x.m = {}; for (const k of Object.keys(JANELAS)) x.m[k] = jan(x.dias, JANELAS[k]); };
  [...camps.values(), ...sets.values(), ...ads.values()].forEach(janelas);

  const contas = (pac.contas || []).map(ct => {
    const id = normConta(ct.id);
    const cliente = (ct.clientId && (o.clientes || []).find(c => c.id === ct.clientId)) || cliPorConta.get(id) || null;
    const cs = [...camps.values()].filter(c => String(c.c) === id).sort((a, b) => (ATIVO(b.st) - ATIVO(a.st)) || b.m.d7.gasto - a.m.d7.gasto);
    cs.forEach(c => { c.cbo = c.orc != null; c.sets.sort((a, b) => (ATIVO(b.st) - ATIVO(a.st)) || b.m.d7.gasto - a.m.d7.gasto); c.sets.forEach(s => s.ads.sort((a, b) => (ATIVO(b.st) - ATIVO(a.st)) || b.m.d7.gasto - a.m.d7.gasto)); });
    const dias = Array.from({ length: 15 }, (_, i) => juntar(cs.map(c => c.dias[i])));
    const msgCs = cs.filter(c => c.m.d14.conv > 0 || /MESSAG/i.test(c.obj || ''));
    const msgDias = Array.from({ length: 15 }, (_, i) => juntar(msgCs.map(c => c.dias[i])));
    const conta = { id, nome: ct.nome || `Conta ${id}`, statusConta: ct.status || 'ACTIVE', avisoConta: STATUS_CONTA[ct.status] ?? (ct.status && ct.status !== 'ACTIVE' ? ct.status : null), moeda: ct.moeda || 'BRL', cliente, camps: cs, dias };
    janelas(conta);
    conta.msg = {}; for (const k of Object.keys(JANELAS)) conta.msg[k] = jan(msgDias, JANELAS[k]);
    conta.meta = cliente ? Number(cliente.metaCustoConversa) || (cliente.metas && Number(cliente.metas.cpl)) || null : null;
    conta.tetoDia = cliente && o.tetoDia ? o.tetoDia(cliente) : null; // tetoDiarioCliente (clientes/calc.js), injetado pelo voo.js
    conta.gestorId = cliente ? cliente.respId : null;
    conta.tipo = conta.m.d14.conv > 0 ? 'conversa' : conta.m.d14.compras > 0 && conta.m.d14.leads === 0 ? 'compra' : conta.m.d14.leads > 0 ? 'lead' : 'conversa';
    conta.orcDia = orcamentoDia(conta);
    conta.sem = classificar(conta, P);
    conta.incidente = o.incidentes ? o.incidentes.get(id) || null : null;
    conta.porque = porque(conta, P);
    conta.serie = dias.map((d, i) => ({ data: pac.dias[i], gasto: d.gasto, conv: d.conv, leads: d.leads, compras: d.compras }));
    conta.mudancas = o.mudancas || {};
    try { conta.recs = MotorRecs.recomendar(snapshot(conta, pac, o, P), { overrides: o.regras || {} }); } catch (e) { conta.recs = []; }
    conta.prioridade = prioridade(conta);
    conta.mensagem = mensagemCliente(conta);
    return conta;
  });
  contas.sort((a, b) => SEMAFORO[a.sem.estado].ordem - SEMAFORO[b.sem.estado].ordem || (b.sem.indice || 0) - (a.sem.indice || 0) || b.m.d7.gasto - a.m.d7.gasto);
  return { contas, porId: new Map(contas.map(c => [c.id, c])), dias: pac.dias || [] };
}

/** orçamento diário ativo da conta = campanhas CBO ativas + conjuntos ativos de campanhas ativas sem CBO */
export function orcamentoDia(conta, troca) {
  let t = 0;
  for (const c of conta.camps) {
    if (!ATIVO(c.st)) continue;
    if (c.cbo) t += troca && troca.id === c.id ? troca.v : c.orc || 0;
    else for (const s of c.sets) if (ATIVO(s.st)) t += troca && troca.id === s.id ? troca.v : s.orc || 0;
  }
  return r2(t);
}

/** semáforo (padrões da central: torre.*) — ordem: parada › sem MSG › sem meta › poucos dados › régua do índice */
export function classificar(c, P) {
  const N = Math.max(1, Math.round(P('torre.contaParada.dias', 2)));
  const comp = c.dias.slice(0, 14);
  const ult = comp.slice(-N);
  const dias7 = comp.slice(-7).filter(x => x.gasto > 0).length;
  if (!comp.some(x => x.gasto > 0) && !c.dias[14].gasto) return { estado: 'off', indice: null, base: null, dias7 };
  if (ult.every(x => !x.gasto) && comp.some(x => x.gasto > 0) && !c.dias[14].gasto) return { estado: 'par', indice: null, base: null, dias7 };
  if (!c.msg.d7.gasto && c.m.d7.gasto > 0) return { estado: 'sem', indice: null, base: null, dias7 };
  if (!c.meta) return { estado: 'meta', indice: null, base: null, dias7 };
  if (dias7 < P('torre.dadosInsuficientes.minDias', 3) || c.msg.d7.conv < P('torre.dadosInsuficientes.minConversas', 10)) return { estado: 'ins', indice: c.msg.d7.custoConv ? c.msg.d7.custoConv / c.meta : null, base: null, dias7 };
  const mv = P('torre.base.minVerba', 20); let base = null, ix = null;
  if (c.msg.d3.conv >= P('torre.base3d.minConversas', 3) && c.msg.d3.gasto >= mv) { base = '3d'; ix = c.msg.d3.gasto / c.msg.d3.conv / c.meta; }
  else if (c.msg.d7.gasto >= mv && c.msg.d7.conv > 0) { base = '7d'; ix = c.msg.d7.gasto / c.msg.d7.conv / c.meta; }
  if (ix == null) return { estado: 'ins', indice: null, base: null, dias7 };
  let lim = [P('torre.semaforo.excelente', 0.75), P('torre.semaforo.bom', 1), P('torre.semaforo.atencao', 1.25), P('torre.semaforo.caro', 1.5)];
  if (!(lim[0] < lim[1] && lim[1] < lim[2] && lim[2] < lim[3])) lim = [0.75, 1, 1.25, 1.5];
  const estado = ix <= lim[0] ? 'exc' : ix <= lim[1] ? 'bom' : ix <= lim[2] ? 'aten' : ix <= lim[3] ? 'caro' : 'crit';
  return { estado, indice: ix, base, dias7, lim };
}

const brl2 = v => `R$ ${Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const dec = (v, d = 2) => Number(v).toFixed(d).replace('.', ',');
const n0 = v => Math.round(v).toLocaleString('pt-BR');

/** "por quê" do semáforo, em linguagem da agência, com os números */
export function porque(c, P) {
  const s = c.sem; const linhas = [];
  if (s.estado === 'off') linhas.push('Nenhum gasto nos últimos 14 dias. A conta está conectada, mas sem anúncios rodando.');
  else if (s.estado === 'par') { let i = 13; while (i > 0 && !c.dias[i].gasto) i--; linhas.push(`Sem gasto há ${13 - i + 1} dia(s) completos e nada hoje. Verifique pagamento, conta bloqueada ou anúncios reprovados no Meta.`); }
  else if (s.estado === 'sem') linhas.push(`Nenhuma campanha de mensagem nos últimos 7 dias. A conta investiu ${brl2(c.m.d7.gasto)} em outros objetivos (cadastro, vendas, tráfego), que não entram no semáforo de custo por conversa.`);
  else if (s.estado === 'meta') linhas.push(c.cliente ? 'O cliente não tem meta de custo por conversa no cadastro. Sem meta, a Torre não classifica a conta — informe em Clientes › Cadastro › Metas.' : 'A conta ainda não está vinculada a um cliente: sem meta de custo e sem teto, a Torre não classifica.');
  else if (s.estado === 'ins') linhas.push(`Poucos dados: ${s.dias7} dia(s) com gasto e ${n0(c.msg.d7.conv)} conversa(s) em 7 dias. A Torre só classifica a partir de ${P('torre.dadosInsuficientes.minDias', 3)} dias e ${P('torre.dadosInsuficientes.minConversas', 10)} conversas.`);
  else {
    const j = s.base === '3d' ? c.msg.d3 : c.msg.d7;
    linhas.push(`Custo por conversa (${s.base === '3d' ? '3 dias' : '7 dias'}): ${brl2(j.gasto / j.conv)} vs meta ${brl2(c.meta)} → índice ${dec(s.indice)} (${SEMAFORO[s.estado].rotulo}). Conversas: ${n0(c.msg.d3.conv)} em 3 dias, ${n0(c.msg.d7.conv)} em 7 dias.`);
    if (s.lim) linhas.push(`Régua: Excelente até ${dec(s.lim[0])} · Bom até ${dec(s.lim[1])} · Atenção até ${dec(s.lim[2])} · Caro até ${dec(s.lim[3])} · acima disso, Crítico.`);
  }
  const a = c.msg.d7, b = c.msg.d7ant;
  if (a.custoConv && b.custoConv) { const v = (a.custoConv / b.custoConv - 1) * 100; if (Math.abs(v) >= 5) linhas.push(`Custo por conversa ${v > 0 ? 'subiu' : 'caiu'} ${dec(Math.abs(v), 0)}% na semana (${brl2(b.custoConv)} → ${brl2(a.custoConv)}).`); }
  if (c.m.d7.freq && c.m.d7.freq > 3) linhas.push(`Frequência estimada em 7 dias: ${dec(c.m.d7.freq, 1)} — o público pode estar cansado dos anúncios.`);
  if (c.avisoConta) linhas.push(`Status da conta no Meta: ${c.avisoConta}.`);
  return linhas;
}

function snapshot(c, pac, o, P) {
  const W = { metricas3d: 'd3', metricas7d: 'd7', metricas14d: 'd14' };
  const res = (m, t) => (t === 'lead' ? m.leads : t === 'compra' ? m.compras : m.conv);
  const met = (x, t = c.tipo) => { const r = {}; for (const [k, w] of Object.entries(W)) { const m = x.m[w]; r[k] = { gasto: m.gasto, impressoes: m.impr, cliques: m.cliques, resultados: res(m, t), alcance: m.alcanceEst, valor: m.temValor ? m.valor : undefined }; } return r; };
  const st = x => (ATIVO(x.st) ? 'ativo' : 'pausado');
  const alt = id => (o.alteradoEm ? o.alteradoEm(id) : null);
  // meta de custo por tipo de resultado: conversa = meta do cliente; lead = meta de CPL do cadastro; compra = sem meta (sem regras de custo)
  const alvo = t => (t === 'conversa' ? c.meta || null : t === 'lead' ? (c.cliente && c.cliente.metas && Number(c.cliente.metas.cpl)) || null : null);
  const tipoCamp = cp => (cp.m.d14.conv > 0 ? 'conversa' : cp.m.d14.compras > 0 || /SALES/.test(cp.obj || '') ? 'compra' : cp.m.d14.leads > 0 || /LEAD/.test(cp.obj || '') ? 'lead' : c.tipo);
  return {
    conta: { id: c.id, nome: c.nome }, hoje: pac.dias[13] || undefined,
    meta: { tipoResultado: c.tipo, custoAlvo: alvo(c.tipo), roasAlvo: null },
    tetoDiario: c.tetoDia, orcamentoMinimo: P('orcamento.minimoDia', 6),
    campanhas: c.camps.map(cp => ({ id: cp.id, nome: cp.n, status: st(cp), cbo: cp.cbo, orc: cp.orc || 0, objetivo: cp.m.d14.conv > 0 ? 'mensagem' : /LEAD/.test(cp.obj) ? 'lead' : /SALES/.test(cp.obj) ? 'compra' : 'outro', aprendizado: null, alteradoEm: alt(cp.id), ...(tipoCamp(cp) !== c.tipo ? { meta: { tipoResultado: tipoCamp(cp), custoAlvo: alvo(tipoCamp(cp)), roasAlvo: null } } : {}), ...met(cp, tipoCamp(cp)),
      conjuntos: cp.sets.map(s => ({ id: s.id, nome: s.n, status: st(s), orc: s.orc || 0, aprendizado: null, alteradoEm: alt(s.id), ...met(s, tipoCamp(cp)),
        anuncios: s.ads.map(a => ({ id: a.id, nome: a.n, status: st(a), formato: null, alteradoEm: alt(a.id), ...met(a, tipoCamp(cp)) })) })) })),
    gastoPorDia: c.dias.slice(0, 14).map((d, i) => ({ data: pac.dias[i], gasto: d.gasto })),
    diasComDados: c.dias.slice(0, 14).filter(d => d.gasto > 0).length,
    ultimaMensagemCliente: c.cliente ? (o.ultimaMsg ? o.ultimaMsg(c.cliente.id) : null) || undefined : null,
    statusConta: c.avisoConta || null,
  };
}

/** Agora / Hoje / Esta semana (padrão torre.fila.prioridade) */
export function prioridade(c) {
  if (c.incidente) return 'agora';
  if (c.sem.estado === 'par' || c.avisoConta) return 'agora';
  const r = (c.recs || [])[0];
  if (r && r.prioridade === 'agora') return 'agora';
  if (c.sem.estado === 'crit' || (r && r.prioridade === 'hoje')) return 'hoje';
  if (r) return 'semana';
  return null;
}

/** rascunho da mensagem ao cliente (nunca é enviado sozinho) */
export function mensagemCliente(c) {
  const nome = c.cliente ? c.cliente.nome : c.nome;
  const m = c.msg.d7;
  if (c.avisoConta) return `Oi! Tudo bem?\nO Meta está mostrando "${c.avisoConta}" na conta de anúncios de ${nome}, e os anúncios podem parar.\nConsegue conferir a forma de pagamento? Assim que normalizar, seguimos normalmente.`;
  if (c.sem.estado === 'par') return `Oi! Tudo bem?\nOs anúncios de ${nome} estão sem veicular desde os últimos dias. Estamos verificando com o Meta; se for pagamento, pode conferir o cartão cadastrado?`;
  if (c.sem.estado === 'sem') return `Oi! Resumo da semana: as campanhas investiram ${brl2(c.m.d7.gasto)} nos últimos 7 dias${c.m.d7.leads ? ` e trouxeram ${n0(c.m.d7.leads)} cadastro(s)` : ''}.\nQue tal testarmos também uma campanha de mensagens no WhatsApp?`;
  if (c.sem.estado === 'ins' || c.sem.estado === 'off' || c.sem.estado === 'meta') return `Oi! Os anúncios estão no ar e acompanhando de perto. ${m.conv ? `Já chegaram ${n0(m.conv)} conversa(s) nesta semana. ` : ''}Na sexta te mando o resumo com os números.`;
  if (['exc', 'bom'].includes(c.sem.estado)) return `Oi! Resumo da semana:\nForam ${n0(m.conv)} conversas no WhatsApp, com custo médio de ${brl2(m.custoConv)} por conversa${c.meta ? ` (meta: ${brl2(c.meta)})` : ''}.\nSeguimos acompanhando de perto. Qualquer dúvida, é só chamar.`;
  return `Oi! Tudo bem?\nEssa semana o custo por conversa subiu para ${brl2(c.msg.d3.custoConv || m.custoConv)}${c.meta ? ` (a meta é ${brl2(c.meta)})` : ''}. Já estamos ajustando os anúncios para trazer o custo de volta.\nConsegue confirmar se as conversas estão chegando e sendo respondidas no WhatsApp? Isso ajuda muito o resultado.`;
}

/** frase do investimento diário com o teto do cliente (antes de confirmar mudança de verba) */
export function fraseInvestimento(c, troca) {
  const antes = orcamentoDia(c), dep = troca ? orcamentoDia(c, troca) : antes, T = c.tetoDia;
  const over = T && dep > T + 0.001;
  const base = !troca ? `A conta investe ${brl2(antes)} por dia (soma dos orçamentos ativos).` : Math.abs(dep - antes) < 0.005 ? `Este item está pausado: o investimento diário da conta continua em ${brl2(antes)}.` : `${dep > antes ? 'Subindo' : 'Reduzindo'} ${brl2(Math.abs(dep - antes))} por dia, a conta passa a investir ${brl2(dep)} por dia (hoje ${brl2(antes)}).`;
  const teto = over ? `Passa do teto do cliente (${brl2(T)}/dia) em ${brl2(dep - T)}.` : T ? `Teto do cliente: ${brl2(T)}/dia.` : 'Cliente sem teto de mídia no cadastro.';
  return { antes, depois: dep, teto: T, acima: !!over, texto: base, textoTeto: teto };
}
