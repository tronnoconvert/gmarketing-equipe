// data.js — semente do módulo Webinars: coleções `webinars` e `webinarDaily` (dados ilustrativos, nomes genéricos).
// webinarDaily: {id, webinarId, tipo:'captacao', data, investimento, impressoes, cliques, inscritos, grupo}
//               {id, webinarId, tipo:'venda', data, canal:'ao_vivo'|'carrinho'|'replay', vendas, faturamento}
import { db } from '../../core/store.js';

const dISO = (base, delta) => { const [y, m, d] = base.split('-').map(Number); const x = new Date(y, m - 1, d + delta); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const hoje = (() => { const x = new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; })();

/** divide um total inteiro segundo pesos, somando exatamente o total */
function dividir(total, pesos) {
  const s = pesos.reduce((a, b) => a + b, 0) || 1;
  const v = pesos.map(p => Math.floor((total * p) / s));
  let resto = total - v.reduce((a, b) => a + b, 0);
  for (let i = v.length - 1; resto > 0; i = (i - 1 + v.length) % v.length) { v[i]++; resto--; }
  return v;
}
// pesos de captação de 14 dias: começo forte, vale no meio, reta final forte
const PESOS14 = [6, 7, 7, 6, 5, 5, 5, 6, 6, 7, 8, 9, 11, 12];

export const EQUIPE_PADRAO = [
  { id: 't-ana', funcao: 'Tráfego (captação)', secoes: ['captacao'] },
  { id: 't-bruno', funcao: 'Moderação ao vivo e grupo', secoes: ['aovivo'] },
  { id: 't-diego', funcao: 'Vendas e carrinho', secoes: ['vendas'] },
  { id: 't-elisa', funcao: 'Copy, e-mails e pós', secoes: ['pos'] },
  { id: 't-carla', funcao: 'Design dos criativos', secoes: [] },
];
export const CHECKLIST_PADRAO = [
  ['Página de inscrição no ar', 't-felipe', -21], ['Anúncios aprovados', 't-ana', -18], ['Sequência de e-mails agendada', 't-elisa', -14],
  ['Grupo de WhatsApp e mensagens prontas', 't-bruno', -10], ['Ensaio técnico', 't-gabriel', -2], ['Link da live enviado', 't-bruno', 0], ['Replay publicado', 't-felipe', 1],
];
export function checklistPadrao(data, feitoAte) {
  return CHECKLIST_PADRAO.map(([item, resp, d], i) => {
    const prazo = data ? dISO(data, d) : null; const feito = !!(feitoAte && prazo && prazo <= feitoAte);
    if (!db.dadosDemo && !db.get('team', resp)) resp = null; // produção: responsável de exemplo que não existe fica em aberto
    return { id: `ck-${i + 1}`, item, resp, prazo, feito, feitoEm: feito ? `${prazo}T18:00:00.000Z` : null, feitoPor: feito ? resp : null };
  });
}

// [id, tema, data, oferta, ticket, metaIns, metaVendas, orcamento, cap{inv, impr, cliques, ins, grupo}, vivo{pico, presentes, tempo, oferta, chat, minOferta}, vendas{checkout, aoVivo, carrinho, replay, reemb, pend, custos}, pos{replay, nps}, aprendizados]
const BASE = [
  ['wb-01', 'Tráfego que Vende', '2026-06-16', 'Curso Tráfego que Vende', 997, 2000, 25, 6500, [6200, 520000, 7800, 2050, 1150], [560, 640, 48, 330, 1250, 72], [118, 12, 7, 3, 997, 1994, 2500], [890, 71],
    'Oferta entrou tarde (min 72): muita gente saiu antes. Testar oferta perto do min 60.'],
  ['wb-02', 'Método Agência Lucrativa', '2026-07-21', 'Mentoria Agência Lucrativa', 1497, 2200, 35, 7500, [7400, 610000, 9150, 2310, 1390], [690, 790, 55, 402, 1680, 64], [160, 22, 12, 7, 2994, 2994, 3000], [1240, 78],
    'Grupo de WhatsApp com aquecimento de 5 dias aumentou o comparecimento. Repetir.'],
  ['wb-03', 'Funil de Webinar na Prática', '2026-08-18', 'Mentoria Agência Lucrativa', 1497, 2500, 40, 8000, [8100, 640000, 8700, 2480, 1300], [590, 650, 41, 280, 990, 70], [104, 14, 9, 4, 1497, 2994, 3000], [760, 62],
    'Tema técnico demais atraiu público iniciante; comparecimento e conversão abaixo da média. Ajustar a promessa da página.'],
  ['wb-04', 'Agência no Piloto Automático', '2026-09-22', 'Programa Escala 12 meses', 1997, 2800, 50, 10000, [9800, 760000, 11400, 2950, 1820], [930, 1060, 58, 590, 2410, 61], [236, 31, 17, 8, 3994, 5991, 3500], [1580, 84],
    'Melhor live até agora: oferta no min 61 com bônus por tempo limitado e depoimentos ao vivo.'],
  ['wb-05', 'Escala sem Caos: Agência com Processos', '2026-10-20', 'Programa Escala 12 meses', 1997, 3200, 55, 10500, [10500, 790000, 10900, 3120, 1700], [820, 960, 51, 470, 1890, 66], [190, 24, 15, 6, 3994, 3994, 3500], [1320, 76],
    'CPL subiu na última semana (público saturado). Renovar criativos antes da próxima captação.'],
  ['wb-06', 'Método Agência Lucrativa 2.0', '2026-11-19', 'Programa Escala 12 meses', 1997, 3300, 60, 11500, [11200, 840000, 12600, 3380, 2010], [1010, 1180, 54, 560, 2280, 62], [245, 33, 14, null, 0, 7988, 3800], [null, null],
    ''],
];

function curva(pico, naOferta, minOferta) {
  const pts = [];
  for (let m = 0; m <= minOferta + 35; m += 5) {
    let v;
    if (m <= 25) v = pico * (0.35 + 0.65 * Math.sin((m / 25) * Math.PI / 2));
    else if (m <= minOferta) v = pico - (pico - naOferta) * ((m - 25) / (minOferta - 25)) ** 1.1;
    else v = naOferta * (1 - 0.55 * ((m - minOferta) / 35));
    pts.push([m, Math.round(v)]);
  }
  return pts;
}
function origem(ins) {
  const [meta, google, organico, lista, indicacao] = dividir(ins, [62, 12, 11, 10, 5]);
  return { meta, google, organico, lista, indicacao };
}

const WEBINARS = [], DAILY = [];
BASE.forEach(([id, tema, data, oferta, ticket, metaInscritos, metaVendas, orcamento, cap, vivo, vend, pos, aprendizados], k) => {
  const [inv, impr, cliques, ins, grupo] = cap;
  const [pico, presentes, tempoMedio, naOferta, chat, minOferta] = vivo;
  const [checkout, aoVivo, carrinho, replay, reembolsos, pendentes, custos] = vend;
  const encerrado = data < dISO(hoje, -7);
  WEBINARS.push({
    id, tema, data, hora: '20:00', apresentador: 't-gabriel', plataforma: k % 2 ? 'YouTube' : 'StreamYard + YouTube', oferta, ticket, metaInscritos, metaVendas, orcamento,
    equipe: EQUIPE_PADRAO.map(e => ({ ...e })), captacao: { origem: origem(ins) },
    aovivo: { pico, presentes, tempoMedio, naOferta, chat, minOferta, curva: curva(pico, naOferta, minOferta) },
    vendas: { checkout, reembolsos, pendentes, custos },
    pos: { replayViews: pos[0], nps: pos[1], aprendizados },
    notas: id === 'wb-06' ? 'Carrinho aberto até 26/11. Diego acompanha boletos e Pix pendentes.' : '',
    checklist: checklistPadrao(data, encerrado ? dISO(data, 2) : dISO(data, 0)),
    createdAt: `${dISO(data, -30)}T12:00:00.000Z`, createdBy: 'u-rayane', updatedAt: `${dISO(data, encerrado ? 8 : 1)}T22:00:00.000Z`,
  });
  // captação: 14 dias antes da live
  const iv = dividir(Math.round(inv), PESOS14), im = dividir(impr, PESOS14), cl = dividir(cliques, PESOS14), is = dividir(ins, PESOS14), gr = dividir(grupo, PESOS14);
  PESOS14.forEach((_, i) => DAILY.push({ id: `wd-${id}-c${i}`, webinarId: id, tipo: 'captacao', data: dISO(data, i - 14), investimento: iv[i], impressoes: im[i], cliques: cl[i], inscritos: is[i], grupo: gr[i] }));
  // vendas: ao vivo no dia, carrinho em 6 dias (ou até hoje), replay
  DAILY.push({ id: `wd-${id}-v0`, webinarId: id, tipo: 'venda', data, canal: 'ao_vivo', vendas: aoVivo, faturamento: aoVivo * ticket });
  const diasCarr = Math.max(1, Math.min(6, Math.round((new Date(hoje) - new Date(data)) / 864e5) - 1));
  dividir(carrinho, [5, 3, 2, 2, 3, 6].slice(0, diasCarr)).forEach((v, i) => { if (v) DAILY.push({ id: `wd-${id}-v${i + 1}`, webinarId: id, tipo: 'venda', data: dISO(data, i + 1), canal: 'carrinho', vendas: v, faturamento: v * ticket }); });
  if (replay) DAILY.push({ id: `wd-${id}-vr`, webinarId: id, tipo: 'venda', data: dISO(data, 3), canal: 'replay', vendas: replay, faturamento: replay * ticket });
});

// Em captação para dezembro (dados lançados até anteontem)
const W7 = '2026-12-10';
const ck7 = checklistPadrao(W7, '2026-11-22');
ck7[2].prazo = '2026-11-23'; // e-mails: venceu ontem e não foi feito
WEBINARS.push({
  id: 'wb-07', tema: 'Tráfego que Vende 2.0', data: W7, hora: '20:00', apresentador: 't-gabriel', plataforma: 'YouTube', oferta: 'Curso Tráfego que Vende 2.0 + mentoria em grupo', ticket: 1997,
  metaInscritos: 3500, metaVendas: 65, orcamento: 14000, equipe: EQUIPE_PADRAO.map(e => ({ ...e })), captacao: { origem: origem(1236) },
  aovivo: {}, vendas: {}, pos: {}, notas: 'Ensaio marcado para quinta, 19h. Testar oferta no minuto 60.', checklist: ck7,
  createdAt: '2026-10-28T14:00:00.000Z', createdBy: 'u-rayane', updatedAt: '2026-11-22T21:10:00.000Z',
});
{
  const dias = 13; const iv = dividir(7480, Array(dias).fill(1).map((_, i) => 8 + (i % 4))), is = dividir(1236, Array(dias).fill(1).map((_, i) => 9 + ((i * 3) % 5)));
  for (let i = 0; i < dias; i++) {
    const impr = Math.round(iv[i] * 72 + i * 310); const cl = Math.round(impr * 0.0151);
    DAILY.push({ id: `wd-wb-07-c${i}`, webinarId: 'wb-07', tipo: 'captacao', data: dISO('2026-11-10', i), investimento: iv[i], impressoes: impr, cliques: cl, inscritos: is[i], grupo: Math.round(is[i] * 0.58) });
  }
}
// Planejado (dados de planejamento incompletos)
WEBINARS.push({
  id: 'wb-08', tema: 'Planejamento 2027 para Agências', data: '2027-01-28', hora: '', apresentador: 't-gabriel', plataforma: 'YouTube', oferta: '', ticket: null,
  metaInscritos: 3000, metaVendas: null, orcamento: 12000, equipe: [{ id: 't-ana', funcao: 'Tráfego (captação)', secoes: ['captacao'] }, { id: 't-elisa', funcao: 'Copy, e-mails e pós', secoes: ['pos'] }],
  captacao: {}, aovivo: {}, vendas: {}, pos: {}, notas: '', checklist: checklistPadrao('2027-01-28', null),
  createdAt: '2026-11-18T10:00:00.000Z', createdBy: 'u-gabriel', updatedAt: '2026-11-18T10:00:00.000Z',
});

db.seed('webinars', WEBINARS);
db.seed('webinarDaily', DAILY);
