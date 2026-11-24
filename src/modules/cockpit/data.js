// cockpit/data.js — snapshot do Cockpit com os valores exatos de docs/spec-dono.md §3.
// O Cockpit lê clients/routines/teamStats quando existirem; sem eles, usa este snapshot.
// As séries financeiras e as faturas vêm do Financeiro (mesmo agente: coleções invoices, finance…).
import '../financeiro/data.js';

/* KPIs por período: mes = valores do documento; tri/12m = mesma base, comparação e janela coerentes */
export const KPIS = {
  mrr: {
    rotulo: 'MRR', valor: 'R$ 186,4 mil', href: '#/financeiro/visao', formatoSerie: 'mil',
    ajuda: 'Receita recorrente mensal: soma dos contratos ativos no mês, sem receitas avulsas.',
    mes: { delta: '▲ 8,2%', comp: 'vs outubro', serie: [150, 152, 151, 155, 158, 157, 160, 163, 165, 164, 168, 171, 173, 176, 175, 178, 181, 183, 186] },
    tri: { delta: '▲ 14,4%', comp: 'vs agosto', serie: [158.8, 161.7, 163.0, 167.6, 172.3, 186.4] },
    '12m': { delta: '▲ 33,6%', comp: 'vs nov/2025', serie: [139.5, 142.0, 145.1, 148.0, 146.2, 151.9, 155.3, 158.8, 161.7, 163.0, 167.6, 172.3, 186.4] },
  },
  margem: {
    rotulo: 'Margem líquida', href: '#/financeiro/dre', formatoSerie: 'pct', ajuda: 'Lucro líquido ÷ receita do período. Detalhe na DRE do Financeiro.',
    mes: { valor: '27,4%', delta: '▲ 1,1 pp', comp: 'vs outubro', serie: [22, 23, 22, 24, 25, 24, 25, 26, 25, 26, 27, 26, 27, 27.4] },
    tri: { valor: '27,1%', delta: '▲ 1,2 pp', comp: 'vs trimestre anterior', serie: [24.3, 24.8, 25.6, 25.9, 26.4, 27.1] },
    '12m': { valor: '25,6%', delta: '▲ 2,4 pp', comp: 'vs 12 meses anteriores', serie: [22, 23, 22, 24, 25, 24, 25, 26, 25, 26, 27, 27.4] },
  },
  caixa: {
    rotulo: 'Caixa', valor: 'R$ 412 mil', href: '#/financeiro/caixa', formatoSerie: 'mil', deltaBom: null,
    ajuda: 'Saldo em conta. Runway = caixa ÷ queima mensal no cenário de estresse (custos − receita com fidelidade).',
    mes: { delta: '6,8 meses', comp: 'de runway', serie: [360, 372, 368, 380, 390, 385, 395, 402, 398, 405, 412] },
    tri: { delta: '6,8 meses', comp: 'de runway', serie: [395, 402, 398, 405, 412] },
    '12m': { delta: '6,8 meses', comp: 'de runway', serie: [341, 352, 360, 372, 368, 380, 390, 385, 395, 402, 398, 405, 412] },
  },
  clientes: {
    rotulo: 'Clientes ativos', valor: '42', href: '#/clientes', ajuda: 'Clientes com contrato ativo no fim do período.',
    mes: { delta: '▲ 3', comp: 'no mês', serie: [35, 36, 36, 37, 38, 38, 39, 39, 40, 39, 41, 42] },
    tri: { delta: '▲ 4', comp: 'no trimestre', serie: [38, 39, 39, 40, 39, 41, 42] },
    '12m': { delta: '▲ 7', comp: 'em 12 meses', serie: [35, 36, 36, 37, 38, 38, 39, 39, 40, 39, 41, 42] },
  },
  risco: {
    rotulo: 'MRR em risco', valor: 'R$ 23,9 mil', href: '#/clientes?f=risco', alerta: true, formatoSerie: 'mil', deltaBom: null,
    ajuda: 'Soma do MRR dos clientes com health score abaixo de 60 ou sinal de churn (renovação sem reunião, inadimplência).',
    mes: { delta: '5 clientes', comp: '12,8% do MRR', serie: [9, 11, 10, 13, 14, 16, 15, 18, 20, 22, 23.9] },
    tri: { delta: '5 clientes', comp: '12,8% do MRR', serie: [16, 15, 18, 20, 22, 23.9] },
    '12m': { delta: '5 clientes', comp: '12,8% do MRR', serie: [7, 8, 9, 11, 10, 13, 14, 16, 15, 18, 20, 22, 23.9] },
  },
  prazo: {
    rotulo: 'Entregas no prazo', href: '#/operacao', formatoSerie: 'pct', deltaBom: false, ajuda: 'Entregas concluídas até a data combinada ÷ entregas do período. Meta 95%.',
    mes: { valor: '91%', delta: '▼ 2 pp', comp: 'meta 95%', serie: [94, 95, 93, 96, 94, 93, 95, 92, 93, 91] },
    tri: { valor: '92,3%', delta: '▼ 1,4 pp', comp: 'meta 95%', serie: [95, 94, 93, 95, 92, 93, 91] },
    '12m': { valor: '93,6%', delta: '▼ 0,8 pp', comp: 'meta 95%', serie: [95, 96, 94, 95, 93, 96, 94, 93, 95, 92, 93, 91] },
  },
};
export const ORDEM_KPI = ['mrr', 'risco', 'margem', 'caixa', 'clientes', 'prazo'];

export const SAUDE = {
  score: 78, delta: { mes: '▲ 3 pts vs outubro', tri: '▲ 5 pts vs trimestre anterior', '12m': '▲ 9 pts vs 12 meses atrás' },
  componentes: [
    { id: 'financeiro', rotulo: 'Financeiro', v: 84, href: '#/financeiro', peso: 30, txt: 'Margem 27,4%, runway 6,8 meses, 2 faturas vencidas.' },
    { id: 'clientes', rotulo: 'Clientes', v: 71, href: '#/clientes', peso: 30, txt: 'Health médio 74; 5 clientes em risco.' },
    { id: 'operacao', rotulo: 'Operação', v: 76, href: '#/operacao', peso: 20, txt: '91% das entregas no prazo (meta 95%).' },
    { id: 'equipe', rotulo: 'Equipe', v: 80, href: '#/equipe', peso: 20, txt: 'Ocupação média 86%; 1 pessoa acima de 100%.' },
  ],
};

export const CARTEIRA = [
  ['c-orion', 'Grupo Orion', 14.2, 41], ['c-vida', 'Clínica Vida', 12.8, 88], ['c-alfa', 'Construtora Alfa', 11.5, 82], ['c-technova', 'TechNova', 9.7, 63],
  ['c-imob', 'Imob Prime', 8.9, 79], ['c-bella', 'Bella Moda', 6.8, 48], ['c-studiofit', 'Studio Fit', 6.1, 85], ['c-autocenter', 'Auto Center Sul', 5.6, 66],
  ['c-petfeliz', 'Pet Feliz', 4.9, 90], ['c-otica', 'Ótica Visão', 4.2, 77], ['c-cafe', 'Café Raiz', 3.4, 61],
].map(([id, nome, mrr, health]) => ({ id, nome, mrr, health }));
export const CARTEIRA_OUTROS = { n: 31, mrr: 98.3, estado: 'ok' };

export const TORRE = [
  { id: 'r-torre', nome: 'Torre de Controle', estado: 'ok', txt: 'ok · há 4 min' },
  { id: 'r-sync-leads', nome: 'Sync leads Meta → CRM', estado: 'err', txt: 'falhou 2× · 23:42' },
  { id: 'r-relatorio-semanal', nome: 'Relatório semanal', estado: 'ok', txt: 'ok · seg 08:00' },
  { id: 'r-cobranca', nome: 'Cobrança automática', estado: 'ok', txt: 'ok · há 1 h' },
  { id: 'r-health', nome: 'Health score clientes', estado: 'warn', txt: 'atrasada 35 min' },
  { id: 'r-whatsapp', nome: 'Resumo no WhatsApp', estado: 'ok', txt: 'ok · 07:30' },
  { id: 'r-verba', nome: 'Alerta verba de mídia', estado: 'ok', txt: 'ok · há 12 min' },
  { id: 'r-backup', nome: 'Backup de criativos', estado: 'off', txt: 'pausada' },
];

export const CAPACIDADE = [
  ['t-ana', 'Ana Souza', 'Tráfego', 118], ['t-bruno', 'Bruno Lima', 'Social', 96], ['t-felipe', 'Felipe Nunes', 'Dev', 88],
  ['t-carla', 'Carla Dias', 'Design', 82], ['t-diego', 'Diego Melo', 'Atendimento', 74], ['t-elisa', 'Elisa Rocha', 'Copy', 58],
].map(([id, nome, area, v]) => ({ id, nome, area, v }));

export const RENOVACOES = [
  { data: '2026-11-30', id: 'c-technova', nome: 'TechNova', mrr: 9700, health: 63, nota: 'Sem reunião de renovação' },
  { data: '2026-12-08', id: 'c-vida', nome: 'Clínica Vida', mrr: 12800, health: 88, nota: 'Alinhada · quer incluir site' },
  { data: '2026-12-15', id: 'c-cafe', nome: 'Café Raiz', mrr: 3400, health: 61, nota: '3 dias de atraso no pagamento' },
  { data: '2027-01-09', id: 'c-studiofit', nome: 'Studio Fit', mrr: 6100, health: 85, nota: 'Renovação automática' },
];

/* Precisa de você hoje (§3.6) — o item da Bella usa a fatura real (invoices) */
export const ITENS = [
  { k: 'orion', estado: 'err', titulo: 'Grupo Orion: score caiu 22 pts', sub: '3 entregas atrasadas · ROAS 1,8 vs meta 3,0', acao: 'Abrir ficha', href: '#/clientes/c-orion', icone: 'building' },
  { k: 'sync', estado: 'err', titulo: 'Rotina "Sync de leads" falhou 2×', sub: 'Erro de token Meta · última tentativa 23:42', acao: 'Ver log', href: '#/torre/rotina/r-sync-leads', icone: 'radio-tower' },
  { k: 'bella', estado: 'warn', titulo: 'Fatura vencida: Bella Moda', sub: 'R$ 6.800 · 9 dias em atraso', acao: 'Cobrar', href: '#/financeiro/receber?cobrar=inv-2611-bella', icone: 'dollar', fatura: 'inv-2611-bella' },
  { k: 'ana', estado: 'warn', titulo: 'Ana Souza em 118% de ocupação', sub: '3ª semana seguida acima de 100%', acao: 'Redistribuir', href: '#/equipe/t-ana?acao=redistribuir', icone: 'users' },
  { k: 'technova', estado: 'warn', titulo: 'TechNova renova em 6 dias', sub: 'Nenhuma reunião de renovação marcada', acao: 'Agendar', href: '#/clientes/c-technova?acao=agendar', icone: 'calendar' },
];
