// financeiro/data.js — semente das coleções do Financeiro (invoices, payables, cash, mrrMoves, finance, costs)
// e constantes compartilhadas com o Cockpit. Números ilustrativos, coerentes com docs/spec-dono.md:
// MRR nov R$ 186,4 mil (out 172,3 → ▲ 8,2%), custos 135,3, margem 27,4%, caixa R$ 412 mil, runway 6,8 meses.
import { db } from '../../core/store.js';

const DIA = 864e5;
/** data ISO (aaaa-mm-dd) relativa a hoje — os vencimentos acompanham o dia em que o demo é aberto */
export function diaRel(n) { const d = new Date(Date.now() + n * DIA); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

/* ---------- clientes canônicos (nome/MRR de referência; a fonte oficial é a coleção clients) ---------- */
export const CLIENTES = [
  { id: 'c-orion', nome: 'Grupo Orion', mrr: 14200, health: 41, resp: 't-ana', serv: ['Tráfego', 'Social'] },
  { id: 'c-vida', nome: 'Clínica Vida', mrr: 12800, health: 88, resp: 't-bruno', serv: ['Tráfego', 'Sites'] },
  { id: 'c-alfa', nome: 'Construtora Alfa', mrr: 11500, health: 82, resp: 't-ana', serv: ['Tráfego', 'CRM'] },
  { id: 'c-technova', nome: 'TechNova', mrr: 9700, health: 63, resp: 't-bruno', serv: ['Social', 'Conteúdo'] },
  { id: 'c-imob', nome: 'Imob Prime', mrr: 8900, health: 79, resp: 't-diego', serv: ['Tráfego'] },
  { id: 'c-bella', nome: 'Bella Moda', mrr: 6800, health: 48, resp: 't-bruno', serv: ['Social', 'Tráfego'] },
  { id: 'c-studiofit', nome: 'Studio Fit', mrr: 6100, health: 85, resp: 't-diego', serv: ['Social'] },
  { id: 'c-autocenter', nome: 'Auto Center Sul', mrr: 5600, health: 66, resp: 't-ana', serv: ['Tráfego', 'Google'] },
  { id: 'c-petfeliz', nome: 'Pet Feliz', mrr: 4900, health: 90, resp: 't-diego', serv: ['Tráfego', 'Social'] },
  { id: 'c-otica', nome: 'Ótica Visão', mrr: 4200, health: 77, resp: 't-diego', serv: ['Tráfego'] },
  { id: 'c-cafe', nome: 'Café Raiz', mrr: 3400, health: 61, resp: 't-bruno', serv: ['Social'] },
];
export const OUTROS = { n: 31, mrr: 98300, health: 81 };
export const nomeCliente = id => { const c = db.get('clients', id); if (c && (c.nome || c.fantasia)) return c.nome || c.fantasia; const k = CLIENTES.find(x => x.id === id); return k ? k.nome : null; };

/* ---------- séries mensais (R$ mil) ---------- */
export const MESES = ['Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov'];
export const MESES_PROJ = ['Dez', 'Jan', 'Fev'];
export const RECEITA = [148, 152, 155, 151, 160, 164, 168, 171, 170, 176, 181, 186.4];
export const CUSTOS = [112, 114, 118, 117, 120, 121, 124, 126, 127, 129, 132, 135.3];
export const PROJECAO = [190, 194, 199];
export const MRR_MENSAL = [142.0, 145.1, 148.0, 146.2, 151.9, 155.3, 158.8, 161.7, 163.0, 167.6, 172.3, 186.4];
export const MRR_INICIO = 139.5; // fim de nov/2025
export const CAIXA_MENSAL = [360, 372, 368, 380, 390, 385, 395, 402, 398, 405, 412];
export const CAIXA_BASE = 412000;
// Runway (cenário de estresse): custos do mês (135,3) − receita com fidelidade vigente (74,7) = queima de 60,6 mil/mês
export const QUEIMA_ESTRESSE = 60600;
export const RECEITA_FIDELIDADE = 74700;

/* ---------- DRE de novembro (R$ mil) — soma dos custos = 135,3; lucro 51,1 (27,4%) ---------- */
export const DRE_NOV = { impostos: 14.9, pessoal: 72.6, ferramentas: 9.8, midia: 6.2, despesas: 21.4, financeiras: 2.1, ir: 8.3 };

/* ---------- unit economics ---------- */
export const UNIT = { cac: 4850, ticket: 4438, margemContrib: 30, vidaMeses: 28, novosTri: 9, investTri: 43650, cacSerie: [5600, 5400, 5900, 5100, 4950, 4700, 4850] };

/* ---------- rentabilidade (horas/mês) ---------- */
export const CUSTO_HORA = 68; // custo médio carregado da hora da equipe (salário + encargos + estrutura de produção)
export const RENTAB = [
  { clientId: 'c-orion', contratadas: 110, reais: 168, direto: 900 },
  { clientId: 'c-vida', contratadas: 95, reais: 92, direto: 700 },
  { clientId: 'c-alfa', contratadas: 85, reais: 88, direto: 800 },
  { clientId: 'c-technova', contratadas: 80, reais: 96, direto: 500 },
  { clientId: 'c-imob', contratadas: 60, reais: 58, direto: 400 },
  { clientId: 'c-bella', contratadas: 55, reais: 79, direto: 300 },
  { clientId: 'c-studiofit', contratadas: 45, reais: 44, direto: 200 },
  { clientId: 'c-autocenter', contratadas: 40, reais: 47, direto: 350 },
  { clientId: 'c-petfeliz', contratadas: 38, reais: 36, direto: 250 },
  { clientId: 'c-otica', contratadas: 32, reais: 33, direto: 150 },
  { clientId: 'c-cafe', contratadas: 28, reais: 34, direto: 100 },
];
export const RENTAB_OUTROS = { contratadas: 720, reais: 742, direto: 5200 };
export const SERVICOS = [
  { nome: 'Tráfego', receita: 92.4, margem: 34 }, { nome: 'Social', receita: 48.1, margem: 22 }, { nome: 'Sites', receita: 22.6, margem: 31 },
  { nome: 'CRM', receita: 14.2, margem: 38 }, { nome: 'Conteúdo', receita: 9.1, margem: 18 },
];

/* ---------- fluxo de caixa: 13 semanas (R$ mil) ---------- */
export const FLUXO = {
  entradas: [46.2, 41.8, 44.5, 40.1, 47.9, 42.3, 43.6, 39.8, 45.2, 44.1, 46.8, 42.0, 45.5],
  saidas: [52.4, 18.6, 24.1, 21.3, 50.8, 19.2, 70.4, 22.0, 54.6, 20.1, 23.5, 21.8, 53.9],
  notas: { 0: 'Folha de novembro', 4: 'Folha de dezembro', 6: '13º salário', 8: 'Folha de janeiro', 12: 'Folha de fevereiro' },
};

export const BELLA_INVOICE_ID = 'inv-2611-bella';

/* ---------- faturas ---------- */
function faturas() {
  const out = [];
  // novembro (competência atual) — deslocamento do vencimento em dias relativo a hoje; null = em aberto
  const nov = { 'c-orion': [-14, -14], 'c-vida': [-14, -15], 'c-alfa': [-4, -4], 'c-technova': [-9, -9], 'c-imob': [-4, -5], 'c-bella': [-9, null], 'c-studiofit': [-14, -14], 'c-autocenter': [1, null], 'c-petfeliz': [-4, -4], 'c-otica': [-4, -3], 'c-cafe': [-3, null] };
  let n = 1180;
  for (const c of CLIENTES) {
    for (const [mes, desl] of [['set', -61], ['out', -31]]) {
      const v = nov[c.id][0] + desl;
      out.push({ id: `inv-26${mes === 'set' ? '09' : '10'}-${c.id.slice(2)}`, numero: String(n++), clientId: c.id, cliente: c.nome, descricao: `Mensalidade ${mes}/2026`, competencia: mes === 'set' ? '2026-09' : '2026-10', valor: c.id === 'c-vida' && mes === 'set' ? 10400 : c.mrr, emissao: diaRel(v - 10), vencimento: diaRel(v), pagoEm: diaRel(v + (c.id === 'c-bella' ? 6 : c.id === 'c-cafe' ? 4 : 0)), status: 'paga', canal: 'Boleto', cobrancas: [] });
    }
  }
  for (const c of CLIENTES) {
    const [v, p] = nov[c.id];
    out.push({ id: `inv-2611-${c.id.slice(2)}`, numero: String(n++), clientId: c.id, cliente: c.nome, descricao: 'Mensalidade nov/2026', competencia: '2026-11', valor: c.mrr, emissao: diaRel(v - 10), vencimento: diaRel(v), pagoEm: p == null ? null : diaRel(p), status: p == null ? 'aberta' : 'paga', canal: c.id === 'c-cafe' ? 'Pix' : 'Boleto',
      cobrancas: c.id === 'c-bella' ? [{ quando: new Date(Date.now() - 6 * DIA).toISOString(), canal: 'email', por: 'Cobrança automática', mensagem: 'Lembrete automático de vencimento.' }, { quando: new Date(Date.now() - 2 * DIA).toISOString(), canal: 'email', por: 'Cobrança automática', mensagem: 'Segundo lembrete automático.' }] : [] });
  }
  // projetos avulsos de dezembro (a vencer) e dívida de ex-cliente (churn de novembro)
  out.push({ id: 'inv-2612-vida-site', numero: String(n++), clientId: 'c-vida', cliente: 'Clínica Vida', descricao: 'Site novo — 1ª parcela (projeto)', competencia: '2026-12', valor: 7500, emissao: diaRel(-2), vencimento: diaRel(8), pagoEm: null, status: 'aberta', canal: 'Boleto', cobrancas: [] });
  out.push({ id: 'inv-2612-alfa-lp', numero: String(n++), clientId: 'c-alfa', cliente: 'Construtora Alfa', descricao: 'Landing page de lançamento (projeto)', competencia: '2026-12', valor: 4800, emissao: diaRel(-1), vencimento: diaRel(12), pagoEm: null, status: 'aberta', canal: 'Boleto', cobrancas: [] });
  out.push({ id: 'inv-2610-docelar', numero: '1162', clientId: null, cliente: 'Doce Lar Decor (ex-cliente)', descricao: 'Mensalidade out/2026 — contrato encerrado', competencia: '2026-10', valor: 3100, emissao: diaRel(-48), vencimento: diaRel(-38), pagoEm: null, status: 'aberta', canal: 'Boleto',
    cobrancas: [{ quando: new Date(Date.now() - 20 * DIA).toISOString(), canal: 'whatsapp', por: 'Paulo Reis', mensagem: 'Cobrança da última mensalidade.' }] });
  return out;
}

/* ---------- contas a pagar ---------- */
const PAYABLES = [
  ['pay-folha-dez', 'Folha de pagamento (CLT)', 'Pessoal', 48200, 6], ['pay-prolabore', 'Pró-labore dos sócios', 'Pessoal', 12000, 6],
  ['pay-freela', 'Freelancers de design e vídeo', 'Pessoal', 7400, 3], ['pay-beneficios', 'Plano de saúde e vale-refeição', 'Pessoal', 5000, 8],
  ['pay-das', 'Simples Nacional (DAS)', 'Impostos', 14900, 26], ['pay-aluguel', 'Aluguel e condomínio', 'Estrutura', 8600, 11],
  ['pay-contab', 'Contabilidade e jurídico', 'Estrutura', 3400, 16], ['pay-ferr-ads', 'Ferramentas de gestão de anúncios', 'Ferramentas', 3200, -2, true],
  ['pay-crm', 'CRM e automação', 'Ferramentas', 2400, 4], ['pay-design', 'Licenças de design', 'Ferramentas', 1900, -6, true],
  ['pay-internet', 'Energia e internet', 'Estrutura', 1600, -1, true], ['pay-workspace', 'E-mail e armazenamento', 'Ferramentas', 1100, 9],
  ['pay-midia-teste', 'Mídia de testes (clientes)', 'Mídia', 3800, 2],
].map(([id, descricao, categoria, valor, d, pago]) => ({ id, descricao, categoria, valor, vencimento: diaRel(d), status: pago ? 'paga' : 'aberta', pagoEm: pago ? diaRel(d) : null, fornecedor: categoria === 'Pessoal' ? 'Equipe' : null }));

/* ---------- lançamentos de caixa (últimos dias; já contidos no saldo de R$ 412 mil) ---------- */
function caixa() {
  const L = (d, tipo, descricao, categoria, valor, clientId) => ({ id: `cx-${Math.abs(d)}-${descricao.slice(0, 8).toLowerCase().replace(/[^a-z]/g, '')}`, data: diaRel(d), tipo, descricao, categoria, valor, clientId: clientId || null, status: 'realizado', base: true });
  return [
    L(-3, 'entrada', 'Recebimento — Ótica Visão', 'Mensalidade', 4200, 'c-otica'), L(-4, 'entrada', 'Recebimento — Construtora Alfa', 'Mensalidade', 11500, 'c-alfa'),
    L(-4, 'entrada', 'Recebimento — Pet Feliz', 'Mensalidade', 4900, 'c-petfeliz'), L(-5, 'entrada', 'Recebimento — Imob Prime', 'Mensalidade', 8900, 'c-imob'),
    L(-2, 'saida', 'Ferramentas de gestão de anúncios', 'Ferramentas', 3200), L(-6, 'saida', 'Licenças de design', 'Ferramentas', 1900),
    L(-1, 'saida', 'Energia e internet', 'Estrutura', 1600), L(-9, 'entrada', 'Recebimento — TechNova', 'Mensalidade', 9700, 'c-technova'),
    L(-14, 'entrada', 'Recebimento — Grupo Orion', 'Mensalidade', 14200, 'c-orion'), L(-14, 'entrada', 'Recebimento — Studio Fit', 'Mensalidade', 6100, 'c-studiofit'),
    L(-15, 'entrada', 'Recebimento — Clínica Vida', 'Mensalidade', 12800, 'c-vida'), L(-18, 'saida', 'Folha de pagamento (CLT)', 'Pessoal', 48200),
    L(-18, 'saida', 'Pró-labore dos sócios', 'Pessoal', 12000), L(-20, 'saida', 'Aluguel e condomínio', 'Estrutura', 8600),
  ];
}

/* ---------- movimentos de MRR ---------- */
function movimentos() {
  const out = [];
  const nov = [
    ['novo', 'Vinícola Serra Alta', 4600], ['novo', 'Clínica Sorriso Pleno', 3800], ['novo', 'Academia Movimento', 2600], ['novo', 'Escola Pequeno Saber', 2100], ['novo', 'Floricultura Jardim Real', 1700],
    ['upsell', 'Clínica Vida', 2400, 'c-vida', 'Manutenção do site'], ['upsell', 'Imob Prime', 1900, 'c-imob', 'Google Ads'], ['upsell', 'Pet Feliz', 1800, 'c-petfeliz', 'Social'],
    ['downgrade', 'TechNova', 1500, 'c-technova', 'Reduziu pacote de conteúdo'], ['downgrade', 'Café Raiz', 900, 'c-cafe', 'Pausou stories'],
    ['churn', 'Doce Lar Decor', 3100, null, 'Encerrou contrato'], ['churn', 'Mercado Bom Preço', 1300, null, 'Internalizou o social'],
  ];
  nov.forEach(([tipo, cliente, valor, clientId, motivo], i) => out.push({ id: `mrr-2611-${i}`, mes: '2026-11', tipo, cliente, clientId: clientId || null, valor, motivo: motivo || (tipo === 'novo' ? 'Contrato novo' : '') }));
  // meses anteriores: consolidados que fecham com MRR_MENSAL
  const churn = [2.0, 1.6, 2.1, 4.2, 1.2, 1.9, 1.4, 2.2, 3.1, 1.5, 2.4];
  const upsell = [1.2, 1.6, 0.9, 1.1, 2.3, 1.4, 1.8, 1.3, 0.8, 2.1, 1.7];
  const down = [0.6, 0.4, 0.9, 0.8, 0.5, 0.7, 0.3, 0.9, 0.6, 0.4, 0.8];
  const anos = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  anos.forEach((mes, i) => {
    const ini = i ? MRR_MENSAL[i - 1] : MRR_INICIO; const delta = MRR_MENSAL[i] - ini;
    const novos = Math.round((delta - upsell[i] + down[i] + churn[i]) * 10) / 10;
    [['novo', novos], ['upsell', upsell[i]], ['downgrade', down[i]], ['churn', churn[i]]].forEach(([tipo, v]) => out.push({ id: `mrr-${mes.replace('-', '').slice(2)}-${tipo}`, mes, tipo, cliente: null, clientId: null, valor: Math.round(v * 1000), motivo: 'Consolidado do mês', consolidado: true }));
  });
  return out;
}

/* ---------- custos (linhas do mês) ---------- */
const COSTS = [
  ['pessoal', 'Folha CLT (com encargos)', 48.2], ['pessoal', 'Pró-labore', 12.0], ['pessoal', 'Freelancers', 7.4], ['pessoal', 'Benefícios', 5.0],
  ['ferramentas', 'Gestão de anúncios e relatórios', 3.2], ['ferramentas', 'CRM e automação', 2.4], ['ferramentas', 'Design e criativos', 1.9], ['ferramentas', 'Servidores e domínios', 1.2], ['ferramentas', 'E-mail e armazenamento', 1.1],
  ['midia', 'Mídia de testes para clientes (não reembolsada)', 3.8], ['midia', 'Mídia de captação própria', 2.4],
  ['despesas', 'Aluguel e condomínio', 8.6], ['despesas', 'Marketing e eventos', 4.1], ['despesas', 'Contabilidade e jurídico', 3.4], ['despesas', 'Outras despesas', 2.5], ['despesas', 'Energia e internet', 1.6], ['despesas', 'Viagens', 1.2],
].map(([grupo, item, valor], i) => ({ id: `cst-${i + 1}`, grupo, item, valor: Math.round(valor * 1000), mes: '2026-11' }));

/* ---------- finance: séries, DRE e snapshot do cockpit ---------- */
const FINANCE = [
  { id: 'series', meses: MESES, receita: RECEITA, custos: CUSTOS, projecao: PROJECAO, mrr: MRR_MENSAL, caixa: CAIXA_MENSAL },
  { id: 'dre-nov', mes: '2026-11', receitaBruta: 186.4, ...DRE_NOV },
  { id: 'caixa', saldoBase: CAIXA_BASE, queimaEstresse: QUEIMA_ESTRESSE, receitaFidelidade: RECEITA_FIDELIDADE, base: new Date().toISOString() },
  { id: 'cockpit-resolvidos', itens: {} },
];

db.seed('invoices', faturas());
db.seed('payables', PAYABLES);
db.seed('cash', caixa());
db.seed('mrrMoves', movimentos());
db.seed('costs', COSTS);
db.seed('finance', FINANCE);
// lembretes automáticos de vencimento (WhatsApp para o cliente): ligados no demo; em produção começam desligados
db.seed('settings', [{ id: 'financeiro.lembretes', valor: { ativo: true, quando: ['antes', 'dia', 'depois'], hora: '09:00' } }], { chave: 'financeiro-lembretes' });
