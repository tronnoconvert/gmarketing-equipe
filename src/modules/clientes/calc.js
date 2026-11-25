// calc.js — regras de negócio do módulo Clientes (puras, sem HTML).
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import { perms } from '../../core/perms.js';
import { auth } from '../../core/auth.js';
import { padrao } from '../../core/padroes/index.js';
import { HOJE, PESOS, COMP_META, PENALIDADE_QUEDA, SEMANAS, NSEM, TIPOS_ACAO, ETAPAS_ONB } from './data.js';

export const DIA = 864e5;
/** MRR, valor de contrato, faturas e margem da agência: só quem tem a permissão "receita" (dono/admin por padrão) */
export const veReceita = () => perms.veReceita();
/** usuários ativos que veem receita (para pedir o preenchimento do MRR) */
export const usuariosReceita = () => db.list('users', u => u.ativo !== false && perms.veReceita(u)).map(u => u.id);
export const hojeD = () => fmt.toDate(HOJE);
/** dias entre HOJE (data de referência do demo) e d; positivo = futuro */
export const dias = d => { const x = fmt.toDate(d); if (!x) return null; x.setHours(0, 0, 0, 0); return Math.round((x - hojeD()) / DIA); };
export const addDias = (iso, n) => fmt.iso(new Date(fmt.toDate(iso).getTime() + n * DIA));
export const mesesDesde = d => { const a = fmt.toDate(d), b = hojeD(); return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(); };

/* ---------- faixas ---------- */
/* limites vindos da central "Padrões e regras" */
export const limH = () => ({ ok: padrao('clientes.health.saudavel', 75), risco: padrao('clientes.health.risco', 60) });
export const janelaRenova = () => padrao('clientes.renovacao.janela', 30);
export const estH = h => { if (h == null) return 'off'; const l = limH(); return h < l.risco ? 'err' : h < l.ok ? 'warn' : 'ok'; };
export const estPrazo = v => (v >= padrao('clientes.noPrazo.ok', 90) ? 'ok' : v >= padrao('clientes.noPrazo.critico', 75) ? 'warn' : 'err');
export const faixasHTxt = () => { const l = limH(); return `≥${l.ok} saudável · ${l.risco}–${l.ok - 1} atenção · <${l.risco} em risco`; };
export const rotH = h => ({ ok: 'Saudável', warn: 'Atenção', err: 'Em risco', off: 'Sem dados' })[estH(h)];
export const emRisco = c => c.health != null && c.health < limH().risco;
export const inadimplente = c => c.pagamento && /atraso/i.test(c.pagamento.texto || '');
export const comAtraso = c => (c.atrasadas || 0) > 0;
export const renovaEm30 = c => { const d = dias(c.renova); return d != null && d >= 0 && d <= janelaRenova(); };

/* ---------- escopo ---------- */
export function visiveis() {
  const e = perms.escopoClientes();
  const l = db.list('clients', c => c.ativo !== false);
  return e === 'todos' ? l : l.filter(c => e.includes(c.id));
}
export const podeVer = id => perms.podeCliente(id);

export const FILTROS = [
  { id: 'todos', rotulo: 'Todos', fn: () => true },
  { id: 'risco', rotulo: 'Em risco', fn: emRisco, estado: 'err' },
  { id: 'atraso', rotulo: 'Com atraso', fn: comAtraso },
  { id: 'inadimplentes', rotulo: 'Inadimplentes', fn: inadimplente },
  { id: 'renovam', get rotulo() { return `Renovam em ${janelaRenova()} dias`; }, fn: renovaEm30 },
];

// gestor de tráfego vê todos os clientes (cobre colega ausente), mas a carteira abre em "Meus clientes" (decisão do dono, 25/11/2026)
const ehGestorTrafego = () => (auth.user() || {}).papel === 'gestor_trafego';
const FILTRO_MEUS = { id: 'meus', rotulo: 'Meus clientes', fn: c => perms.meusClientes().includes(c.id) };
export const filtros = () => (ehGestorTrafego() ? [FILTROS[0], FILTRO_MEUS, ...FILTROS.slice(1)] : FILTROS);
export const filtroAtual = f => filtros().find(x => x.id === f) || (ehGestorTrafego() && perms.meusClientes().length ? FILTRO_MEUS : FILTROS[0]);

/* ---------- KPIs da carteira ---------- */
export function kpis(lista) {
  const n = lista.length;
  const mrr = lista.reduce((a, c) => a + (c.mrr || 0), 0);
  const hs = lista.filter(c => c.health != null);
  const healthMedio = hs.length ? Math.round(hs.reduce((a, c) => a + c.health, 0) / hs.length) : null;
  const risco = lista.filter(emRisco);
  const mrrRisco = risco.reduce((a, c) => a + c.mrr, 0);
  const novosMes = lista.filter(c => String(c.desde).slice(0, 7) === HOJE.slice(0, 7)).length;
  const renovam = lista.filter(renovaEm30);
  const renovamSemReuniao = renovam.filter(c => !proximaReuniao(c));
  return { n, mrr, healthMedio, risco, mrrRisco, novosMes, renovam, renovamSemReuniao, mrrRenova: renovam.reduce((a, c) => a + (c.mrr || 0), 0), pctRisco: mrr ? (mrrRisco / mrr) * 100 : 0 };
}

/* ---------- health score ---------- */
export function score(c) {
  const k = c.componentes || {};
  const bruto = Object.keys(PESOS).reduce((a, x) => a + ((k[x] ?? 0) * PESOS[x]) / 100, 0);
  const pen = (c.delta30 ?? 0) <= -padrao('clientes.health.quedaPenalidade', 15) ? padrao('clientes.health.penalidade', PENALIDADE_QUEDA) : 0;
  return { bruto: Math.round(bruto * 10) / 10, penalidade: pen, final: Math.round(bruto) - pen };
}
export function componentes(c) {
  const k = c.componentes || {};
  return Object.keys(PESOS).map(id => ({ id, atual: k[id] ?? null, meta: COMP_META[id], peso: PESOS[id], pontos: k[id] != null ? Math.round((k[id] * PESOS[id]) / 10) / 10 : null }));
}

/* ---------- resultados ---------- */
export const METRICAS = {
  roas: { rotulo: 'ROAS', fmt: v => fmt.dec(v, 1), melhor: 'maior', meta: 'roas', curta: 'ROAS', ajuda: 'Receita atribuída aos anúncios ÷ investimento. Fonte: Meta Ads e Google Ads, semanal.' },
  cpl: { rotulo: 'CPL', fmt: v => fmt.brl2(v), melhor: 'menor', meta: 'cpl', curta: 'CPL', ajuda: 'Custo por lead = investimento ÷ leads. Quanto menor, melhor.' },
  leads: { rotulo: 'Leads/mês', fmt: v => fmt.num(v), melhor: 'maior', meta: 'leadsMes', curta: 'Leads', ajuda: 'Leads dos últimos 30 dias (janela móvel), de anúncios e orgânico.' },
  faturamento: { rotulo: 'Faturamento', fmt: v => fmt.brlK(v), melhor: 'maior', meta: 'faturamento', curta: 'Faturamento', ajuda: 'Faturamento do cliente atribuído ao marketing nos últimos 30 dias (janela móvel), informado pelo cliente/CRM.' },
};
export function resultados(c) { return db.get('clientResults', `cr-${c.id.slice(2)}`) || db.find('clientResults', r => r.clientId === c.id) || null; }
export function metricasDe(c) { const rs = resultados(c); return Object.keys(METRICAS).filter(k => c.metas && c.metas[METRICAS[k].meta] != null && rs && Array.isArray(rs[k]) && rs[k].some(v => v != null)); }
export const ultimo = arr => (arr || []).filter(v => v != null).slice(-1)[0] ?? null;
export function melhoria(k, de, para) { if (de == null || para == null || !de) return null; const p = ((para - de) / Math.abs(de)) * 100; return METRICAS[k].melhor === 'menor' ? -p : p; }
/** razão desempenho/meta (1 = na meta; >1 = melhor que a meta) */
export function razao(k, v, meta) { if (v == null || !meta) return null; return METRICAS[k].melhor === 'menor' ? meta / v : v / meta; }
/** semanas seguidas (até a última) abaixo de 75% da meta */
export const LIMIAR_RISCO = 0.7; // padrão de fábrica; valor atual: padrao('clientes.resultado.limiar') ÷ 100
export function semanasAbaixo(k, serie, meta) { const lim = padrao('clientes.resultado.limiar', 70) / 100; let n = 0; for (let i = serie.length - 1; i >= 0; i--) { const r = razao(k, serie[i], meta); if (r == null || r >= lim) break; n++; } return n; }
export const semanaDe = iso => { for (let i = NSEM - 1; i >= 0; i--) if (iso >= SEMANAS[i]) return i; return -1; };

/** impacto da ação: média das 2 semanas antes × 2 semanas depois (≈14 dias) */
export function impacto(a, c, rs) {
  rs = rs || resultados(c); if (!rs) return null;
  const mets = metricasDe(c);
  const k = a.metrica && mets.includes(a.metrica) ? a.metrica : (mets.includes('roas') ? 'roas' : mets[0]);
  if (!k) return null;
  const w = semanaDe(a.data); const s = rs[k];
  if (w < 0) return { k, pendente: false, foraJanela: true };
  const media = arr => { const v = arr.filter(x => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  const antes = media([s[w - 2], s[w - 1]]);
  if (w + 2 > NSEM - 1) return { k, antes, pendente: true, faltam: Math.max(1, 14 - Math.max(0, -dias(a.data))) };
  const depois = media([s[w + 1], s[w + 2]]);
  return { k, antes, depois, pct: melhoria(k, antes, depois), pendente: false, inferido: !a.metrica || a.metrica !== k };
}

/* ---------- entregas / tarefas (coleções de Operação) ---------- */
const FEITO = /^(feito|feita|concluid|entregue|done|aprovad)/i;
export function entregasDe(c) {
  const d = db.list('deliveries', x => x.clientId === c.id).map(x => ({ ...x, _col: 'deliveries' }));
  const t = db.list('tasks', x => x.clientId === c.id).map(x => ({ ...x, _col: 'tasks' }));
  const vistos = new Set();
  return [...d, ...t].filter(x => { const k = `${String(x.titulo || x.nome || '').toLowerCase()}|${String(x.prazo || '').slice(0, 10)}`; if (vistos.has(k)) return false; vistos.add(k); return true; }).map(x => {
    const feito = FEITO.test(String(x.status || '')) || !!x.entregueEm || !!x.concluidaEm;
    const quando = x.entregueEm || x.concluidaEm || null;
    const atrasada = !feito && x.prazo && dias(x.prazo) < 0;
    const noPrazo = feito ? (!x.prazo || !quando || String(quando).slice(0, 10) <= String(x.prazo).slice(0, 10)) : null;
    return { ...x, feito, atrasada, noPrazo, quando };
  }).sort((a, b) => String(b.prazo || '').localeCompare(String(a.prazo || '')));
}

/* ---------- motivos de risco e próximos passos ---------- */
export function contatos(c) { return db.list('contacts', x => x.clientId === c.id).sort((a, b) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0)); }
export function decisor(c) { const l = contatos(c); return l.find(x => x.papel === 'decisor') || l[0] || null; }
export function reunioes(c) { return db.list('meetings', m => m.clientId === c.id).sort((a, b) => String(b.quando).localeCompare(String(a.quando))); }
export function proximaReuniao(c) { return reunioes(c).filter(m => m.status === 'agendada' && dias(m.quando) >= 0).sort((a, b) => String(a.quando).localeCompare(String(b.quando)))[0] || null; }

export function motivos(c) {
  const out = [];
  const rs = resultados(c);
  if (rs) {
    let primeiro = true;
    metricasDe(c).forEach(k => {
      const meta = c.metas[METRICAS[k].meta]; const s = rs[k]; const v = ultimo(s); const n = semanasAbaixo(k, s, meta);
      if (n >= padrao('clientes.resultado.semanas', 2)) { out.push({ p: primeiro ? 1 : 9, estado: primeiro ? 'err' : 'warn', tipo: primeiro ? 'resultado' : 'resultado2', texto: `${METRICAS[k].curta} ${METRICAS[k].fmt(v)} vs meta ${METRICAS[k].fmt(meta)} há ${n} semanas`, link: 'resultados-acoes' }); primeiro = false; }
    });
  }
  if (comAtraso(c)) out.push({ p: 2, estado: c.atrasadas >= 2 ? 'err' : 'warn', tipo: 'prazo', texto: `${fmt.plural(c.atrasadas, 'entrega atrasada', 'entregas atrasadas')} no mês`, link: 'entregas' });
  const dc = decisor(c);
  if (dc && dc.ultimaResposta) { const d = -dias(dc.ultimaResposta); if (d >= padrao('clientes.decisor.atencao', 7)) out.push({ p: 3, estado: d >= padrao('clientes.decisor.critico', 10) ? 'err' : 'warn', tipo: 'engajamento', texto: `Decisor não responde há ${d} dias`, link: 'cadastro' }); }
  if (inadimplente(c)) out.push({ p: 4, estado: c.pagamento.estado, tipo: 'pagamento', texto: `Pagamento: ${c.pagamento.texto.toLowerCase()}`, link: veReceita() ? 'financeiro' : null });
  if ((c.delta30 ?? 0) <= -padrao('clientes.health.quedaMotivo', 10)) out.push({ p: 5, estado: 'err', tipo: 'score', texto: `Health score caiu ${Math.abs(c.delta30)} pts em 30 dias`, link: '?calc=1&foco=saude' });
  if (renovaEm30(c) && !proximaReuniao(c)) out.push({ p: 6, estado: 'warn', tipo: 'renovacao', texto: `Renova em ${fmt.plural(dias(c.renova), 'dia')} sem reunião marcada`, link: null, acao: 'agendar' });
  (c.acessos || []).filter(a => a.estado === 'err').forEach(a => out.push({ p: 7, estado: 'err', tipo: 'acesso', texto: `${a.nome}: ${a.obs}`, link: 'cadastro' }));
  return out.sort((a, b) => a.p - b.p);
}

export function proximosPassos(c) {
  const p = [];
  const m = motivos(c);
  if (emRisco(c) && !c.planoResgate) p.push({ estado: 'err', titulo: 'Montar e aprovar o plano de resgate', sub: 'Tarefas com responsável e prazo para virar o jogo', acao: 'resgate' });
  if (c.planoResgate) p.push({ estado: 'warn', titulo: 'Acompanhar o plano de resgate', sub: `Aprovado em ${fmt.data(c.planoResgate.data)} · ${fmt.plural((c.planoResgate.tarefas || []).length, 'tarefa')}`, link: '#/operacao/quadro' });
  if (m.some(x => x.tipo === 'engajamento')) p.push({ estado: 'warn', titulo: 'Retomar contato com o decisor', sub: 'Ligação + WhatsApp; propor reunião de resultados', acao: 'agendar' });
  if (renovaEm30(c) && !proximaReuniao(c)) p.push({ estado: 'warn', titulo: 'Agendar reunião de renovação', sub: `Renova em ${fmt.data(c.renova)}`, acao: 'agendar' });
  if (inadimplente(c)) p.push(veReceita() ? { estado: c.pagamento.estado, titulo: 'Cobrar fatura em atraso', sub: c.pagamento.texto, link: '#/financeiro/receber' } : { estado: c.pagamento.estado, titulo: 'Pagamento em atraso: alinhar com o Financeiro', sub: c.pagamento.texto, link: null });
  if ((c.acessos || []).some(a => a.estado === 'err')) p.push({ estado: 'err', titulo: 'Regularizar acessos com erro', sub: (c.acessos.filter(a => a.estado === 'err').map(a => a.nome)).join(', '), link: `#/clientes/${c.id}/cadastro` });
  if (comAtraso(c)) p.push({ estado: 'warn', titulo: 'Colocar entregas em dia', sub: fmt.plural(c.atrasadas, 'entrega atrasada', 'entregas atrasadas'), link: `#/clientes/${c.id}/entregas` });
  const pr = proximaReuniao(c);
  if (pr) p.push({ estado: 'ok', titulo: pr.titulo, sub: `${fmt.dataHora(pr.quando)} · ${pr.local || 'online'}`, link: null });
  if (!p.length) p.push({ estado: 'ok', titulo: 'Enviar o resumo mensal de resultados', sub: 'Em Resultados e ações, use "Resumo para o cliente"', link: `#/clientes/${c.id}/resultados-acoes` });
  return p;
}

/* ---------- onboarding ---------- */
export function funilOnboarding(lista) {
  const ids = new Set(lista.map(c => c.id));
  const recs = db.list('onboarding', o => ids.has(o.clientId));
  const etapas = ETAPAS_ONB.map(e => ({ rotulo: e.rotulo, valor: recs.filter(o => o.etapas && o.etapas[e.id] && ['feito', 'parcial'].includes(o.etapas[e.id].estado)).length }));
  const parados = recs.filter(o => !o.concluido && o.etapaAtual === 'acessos' && o.paradoDesde && -dias(o.paradoDesde) > padrao('clientes.onboarding.parado', 5));
  return { recs, etapas, parados };
}

/* ---------- histórico ---------- */
export function historicoHealth(c) { return db.get('healthHistory', `hh-${c.id.slice(2)}`) || db.find('healthHistory', h => h.clientId === c.id); }

/* ---------- ações da equipe ---------- */
export function acoes(c) { return db.list('clientActions', a => a.clientId === c.id).sort((a, b) => String(b.data).localeCompare(String(a.data))); }
export const tipoInfo = t => TIPOS_ACAO[t] || { area: 'cs', metrica: null, icone: 'activity' };

/* ---------- busca ---------- */
export function buscar(q) {
  const dq = q.replace(/\D/g, '');
  return visiveis().filter(c => fmt.norm(c.nome).includes(q) || fmt.norm(c.razaoSocial).includes(q) || fmt.norm(c.segmento).includes(q) || (dq.length >= 4 && String(c.cnpj || '').replace(/\D/g, '').includes(dq)));
}

/* ---------- CSV ---------- */
export function csv(linhas) {
  const rec = veReceita();
  const cab = ['Cliente', 'Razão social', 'CNPJ', 'Segmento', 'Desde', 'Serviços', ...(rec ? ['MRR'] : []), 'Health', 'Tendência 6m', 'No prazo (%)', 'Pagamento', 'Renova', 'Responsável'];
  const q = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = linhas.map(c => [c.nome, c.razaoSocial, c.cnpj, c.segmento, fmt.data(c.desde), (c.servicos || []).join(', '), ...(rec ? [String(c.mrr).replace('.', ',')] : []), c.health, (c.tendencia || []).join(' '), c.noPrazo, c.pagamento ? c.pagamento.texto : '', fmt.data(c.renova), (db.get('team', c.respId) || {}).nome || '']);
  return '﻿' + [cab, ...rows].map(r => r.map(q).join(';')).join('\n');
}

/* ---------- teto de mídia (orçamento de anúncios do cliente, não é receita da agência) ---------- */
/** dias médios por mês usados para converter o teto mensal em diário */
export const DIAS_MES = 30.4;
/** teto diário de investimento em mídia (R$/dia) = teto mensal ÷ 30,4; null se não informado */
export function tetoDiarioCliente(c) {
  const m = Number(c && c.tetoMidiaMensal);
  return m > 0 ? Math.round((m / DIAS_MES) * 100) / 100 : null;
}

/* ---------- comissão variável por cliente ----------
   client.comissoes = [{ id, teamId, tipo: 'fixo'|'percentual', valor, meses, inicio: 'aaaa-mm-dd', obs }]
   fixo → valor em R$/mês · percentual → % do MRR do cliente. Vale do início até inicio + meses (exclusivo). */
const ymd = iso => String(iso || '').slice(0, 10).split('-').map(Number);
const isoDe = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** soma n meses a uma data ISO (dia ajustado ao fim do mês quando preciso) */
export function addMeses(iso, n) {
  const [y, m, d] = ymd(iso); const t = new Date(y, m - 1 + n, 1);
  const ult = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return isoDe(t.getFullYear(), t.getMonth() + 1, Math.min(d, ult));
}
const hojeIso = hoje => (hoje ? (typeof hoje === 'string' ? hoje.slice(0, 10) : fmt.iso(hoje)) : HOJE);
/** valor mensal da comissão em R$ (percentual = % do MRR atual do cliente, 2 casas) */
export function comissaoMensal(c, com) {
  if (!com) return 0;
  const v = Number(com.valor) || 0;
  return com.tipo === 'percentual' ? Math.round((v / 100) * (Number(c && c.mrr) || 0) * 100) / 100 : v;
}
/** data (exclusiva) em que a comissão deixa de valer = início + meses */
export const fimComissao = com => addMeses(com.inicio, Number(com.meses) || 0);
/** último dia de vigência (ISO) */
export const terminoComissao = com => { const f = fimComissao(com); const d = fmt.toDate(f); d.setDate(d.getDate() - 1); return fmt.iso(d); };
/** ativa: já começou e hoje < início + meses */
export function comissaoAtiva(com, hoje) { const h = hojeIso(hoje); return !!com && String(com.inicio) <= h && h < fimComissao(com); }
/** meses de pagamento que ainda faltam, contando o mês corrente (0 se encerrada; total se ainda não começou) */
export function mesesRestantes(com, hoje) {
  const meses = Number(com && com.meses) || 0; const h = hojeIso(hoje);
  if (h >= fimComissao(com)) return 0;
  const [iy, im, id] = ymd(com.inicio); const [hy, hm, hd] = ymd(h);
  const decorridos = (hy - iy) * 12 + (hm - im) - (hd < id ? 1 : 0);
  return Math.max(0, Math.min(meses, meses - Math.max(0, decorridos)));
}
/** situação para exibir: ativa | encerrando (≤ 1 mês) | encerrada | futura */
export function statusComissao(com, hoje) {
  const h = hojeIso(hoje);
  if (String(com.inicio) > h) return 'futura';
  if (!comissaoAtiva(com, h)) return 'encerrada';
  return mesesRestantes(com, h) <= 1 ? 'encerrando' : 'ativa';
}
/** comissões de uma pessoa em todos os clientes → [{cliente (nome), clientId, com, mensal, mesesRestantes, termina, ativa, status}] */
export function comissoesDe(teamId, base = db, hoje) {
  const out = [];
  base.list('clients').forEach(c => (c.comissoes || []).forEach(com => {
    if (com.teamId !== teamId) return;
    out.push({ cliente: c.nome, clientId: c.id, com, mensal: comissaoMensal(c, com), mesesRestantes: mesesRestantes(com, hoje), termina: terminoComissao(com), ativa: comissaoAtiva(com, hoje), status: statusComissao(com, hoje) });
  }));
  return out.sort((a, b) => (b.ativa - a.ativa) || String(a.termina).localeCompare(String(b.termina)));
}
/** todas as comissões ativas no mês (para o resumo do time) → {total, pessoas: Set, itens} */
export function comissoesAtivas(base = db, hoje) {
  const itens = [];
  base.list('clients', c => c.ativo !== false).forEach(c => (c.comissoes || []).forEach(com => { if (comissaoAtiva(com, hoje)) itens.push({ c, com, mensal: comissaoMensal(c, com) }); }));
  return { itens, total: Math.round(itens.reduce((a, x) => a + x.mensal, 0) * 100) / 100, pessoas: new Set(itens.map(x => x.com.teamId)) };
}

/* ---------- utilidades ---------- */
export const pessoa = id => db.get('team', id) || null;
export const nomePessoa = id => (id ? (pessoa(id) || {}).nome || id : 'Torre de Controle');
export const userDe = teamId => (pessoa(teamId) || {}).userId || null;
export const mediaArr = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
