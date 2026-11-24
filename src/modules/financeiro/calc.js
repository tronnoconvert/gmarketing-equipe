// financeiro/calc.js — cálculos puros do Financeiro (também usados pelo Cockpit).
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import {
  CLIENTES, OUTROS, RECEITA, CUSTOS, MRR_MENSAL, MRR_INICIO, DRE_NOV, CAIXA_BASE, QUEIMA_ESTRESSE, FLUXO, nomeCliente, diaRel,
} from './data.js';
import { totalComissoesEm } from './comissoes.js';
import { padrao } from '../../core/padroes/index.js';
/** dias de atraso a partir dos quais a fatura fica vermelha (central "Padrões e regras", padrão 7) */
export const atrasoCritico = () => padrao('financeiro.fatura.atrasoCritico', 7);

export const JANELA = { mes: 1, tri: 3, '12m': 12 };
export const MES_IDS = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
export const ROT_PER = { mes: 'novembro', tri: 'set–nov', '12m': 'dez/2025–nov/2026' };

/* ---------- faturas ---------- */
/** estado de uma fatura: {estado, rotulo, faixa, atraso, dias} */
export function estadoFatura(f) {
  if (f.status === 'paga') return { estado: 'ok', rotulo: `Paga em ${fmt.dataCurta(f.pagoEm)}`, faixa: 'paga', atraso: 0, dias: null };
  const dias = fmt.diasAte(f.vencimento);
  const reneg = f.status === 'renegociada';
  if (dias >= 0) {
    const faixa = 'avencer';
    if (reneg) return { estado: 'warn', rotulo: `Renegociada · vence ${fmt.dataCurta(f.vencimento)}`, faixa, atraso: 0, dias };
    if (dias === 0) return { estado: 'warn', rotulo: 'Vence hoje', faixa, atraso: 0, dias };
    if (dias === 1) return { estado: 'warn', rotulo: 'Vence amanhã', faixa, atraso: 0, dias };
    return { estado: 'ok', rotulo: `Vence em ${dias} dias`, faixa, atraso: 0, dias, neutro: true };
  }
  const atraso = -dias;
  const faixa = atraso <= 15 ? 'f1' : atraso <= 30 ? 'f16' : 'f30';
  return { estado: atraso > atrasoCritico() ? 'err' : 'warn', rotulo: `${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso${reneg ? ' · renegociada' : ''}`, faixa, atraso, dias };
}
export const abertas = () => db.list('invoices', f => f.status !== 'paga');
export const vencidasMais7 = () => abertas().filter(f => estadoFatura(f).atraso > atrasoCritico());
export const FAIXAS_AGING = [
  { id: 'avencer', rotulo: 'A vencer' }, { id: 'f1', rotulo: '1–15 dias' }, { id: 'f16', rotulo: '16–30 dias' }, { id: 'f30', rotulo: 'Mais de 30 dias' },
];
export function aging() {
  const out = Object.fromEntries(FAIXAS_AGING.map(f => [f.id, { valor: 0, n: 0 }]));
  for (const f of abertas()) { const e = estadoFatura(f); if (out[e.faixa]) { out[e.faixa].valor += f.valor; out[e.faixa].n++; } }
  return out;
}
export const nomeFatura = f => (f.clientId && nomeCliente(f.clientId)) || f.cliente || 'Cliente';

/* ---------- caixa ---------- */
const sinal = l => (l.tipo === 'entrada' ? 1 : -1) * (Number(l.valor) || 0);
/** saldo atual = saldo de referência + lançamentos realizados depois dele (manuais ou baixas de faturas) */
export function saldoAtual() {
  const hoje = fmt.iso(new Date());
  return CAIXA_BASE + db.list('cash', l => !l.base && l.status !== 'previsto' && (!l.data || l.data <= hoje)).reduce((a, l) => a + sinal(l), 0);
}
export const runway = (saldo = saldoAtual()) => saldo / QUEIMA_ESTRESSE;
/** projeção de 13 semanas: [{rotulo, inicio, entradas, saidas, saldo, nota}] (R$) */
export function projecao90() {
  const seg = new Date(); seg.setHours(0, 0, 0, 0); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7));
  const previstos = db.list('cash', l => !l.base && (l.status === 'previsto' || (l.data && l.data > fmt.iso(new Date()))));
  let saldo = saldoAtual();
  return FLUXO.entradas.map((e, i) => {
    const ini = new Date(seg.getTime() + i * 7 * 864e5), fim = new Date(ini.getTime() + 6 * 864e5);
    const extras = previstos.filter(l => { const d = fmt.toDate(l.data); return d && d >= ini && d <= fim; });
    const ent = e * 1000 + extras.filter(l => l.tipo === 'entrada').reduce((a, l) => a + l.valor, 0);
    const sai = FLUXO.saidas[i] * 1000 + extras.filter(l => l.tipo !== 'entrada').reduce((a, l) => a + l.valor, 0);
    saldo += ent - sai;
    return { rotulo: fmt.dataCurta(ini), inicio: fmt.iso(ini), entradas: ent, saidas: sai, saldo, nota: FLUXO.notas[i] || '', extras: extras.length };
  });
}

/* ---------- DRE ---------- */
const r1 = v => Math.round(v * 10) / 10;
/** DRE do período (R$ mil). Novembro é o fechamento real; meses anteriores escalam as linhas pelos custos de cada mês. */
export function dre(periodo = 'mes') {
  const k = JANELA[periodo] || 1;
  const t = { receitaBruta: 0, impostos: 0, pessoal: 0, ferramentas: 0, midia: 0, despesas: 0, financeiras: 0, ir: 0 };
  const semImp = CUSTOS[11] - DRE_NOV.impostos;
  for (let i = 12 - k; i < 12; i++) {
    const R = RECEITA[i], C = CUSTOS[i];
    const imp = DRE_NOV.impostos / RECEITA[11] * R, fator = (C - imp) / semImp;
    t.receitaBruta += R; t.impostos += imp;
    for (const c of ['pessoal', 'ferramentas', 'midia', 'despesas', 'financeiras', 'ir']) t[c] += DRE_NOV[c] * fator;
  }
  // comissões variáveis (client.comissoes): separadas DENTRO de pessoal — o fechamento de pessoal já as inclui, então EBITDA e lucro não mudam
  t.comissoes = 0;
  for (let i = 12 - k; i < 12; i++) {
    const ref = i === 11 ? new Date() : new Date(Number(MES_IDS[i].slice(0, 4)), Number(MES_IDS[i].slice(5, 7)) - 1, 15);
    t.comissoes += totalComissoesEm(ref) / 1000;
  }
  Object.keys(t).forEach(c => { t[c] = r1(t[c]); });
  t.comissoes = Math.min(t.comissoes, t.pessoal); t.pessoal = r1(t.pessoal - t.comissoes);
  t.receitaLiquida = r1(t.receitaBruta - t.impostos);
  t.ebitda = r1(t.receitaLiquida - t.pessoal - t.comissoes - t.ferramentas - t.midia - t.despesas);
  t.lucro = r1(t.ebitda - t.financeiras - t.ir);
  t.margem = (t.lucro / t.receitaBruta) * 100;
  t.margemEbitda = (t.ebitda / t.receitaBruta) * 100;
  return t;
}

/* ---------- ponte de MRR ---------- */
export function ponte(periodo = 'mes') {
  const k = JANELA[periodo] || 1;
  const meses = MES_IDS.slice(12 - k);
  const inicial = k === 12 ? MRR_INICIO : MRR_MENSAL[11 - k];
  const mv = db.list('mrrMoves', m => meses.includes(m.mes));
  const soma = t => r1(mv.filter(m => m.tipo === t).reduce((a, m) => a + m.valor, 0) / 1000);
  const p = { inicial, novos: soma('novo'), upsell: soma('upsell'), downgrade: soma('downgrade'), churn: soma('churn'), movimentos: mv };
  p.final = r1(p.inicial + p.novos + p.upsell - p.downgrade - p.churn);
  p.variacao = ((p.final - p.inicial) / p.inicial) * 100;
  p.rotIni = k === 12 ? 'MRR nov/2025' : `MRR ${['dez', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov'][11 - k]}`;
  return p;
}

/* ---------- clientes / rentabilidade ---------- */
export function mrrCliente(id) { const c = db.get('clients', id); if (c && typeof c.mrr === 'number') return c.mrr; const k = CLIENTES.find(x => x.id === id); return k ? k.mrr : 0; }
export function concentracao() {
  const lst = CLIENTES.map(c => ({ id: c.id, nome: nomeCliente(c.id) || c.nome, mrr: mrrCliente(c.id) })).sort((a, b) => b.mrr - a.mrr);
  const total = lst.reduce((a, c) => a + c.mrr, 0) + OUTROS.mrr;
  const top3 = lst.slice(0, 3).reduce((a, c) => a + c.mrr, 0);
  return { lst, total, top3, share: (top3 / total) * 100 };
}
export { diaRel };
