// data.js — semente do módulo Clientes (dono das coleções: clients, contacts, contracts, healthHistory, meetings,
// onboarding, clientResults, clientActions). Todos os nomes são FICTÍCIOS.
//
// Totais canônicos (docs/spec-dono.md §3 e §5):
//   42 clientes ativos · MRR R$ 186.400 · health médio 74 · 5 em risco = R$ 23.900 de MRR. (NPS removido a pedido do dono.)
// REGRA "em risco": health score < 60 (faixa vermelha do §6). São 5 clientes:
//   Grupo Orion 14.200 (41) + Bella Moda 6.800 (48) + Doce Encanto 1.800 (55) + Barbearia Navalha 600 (57)
//   + Floricultura Jardim Secreto 500 (58) = R$ 23.900  (12,8% do MRR).
// TechNova (63), Auto Center Sul (66) e Café Raiz (61) ficam em "atenção" (60–74), não em risco.
// Filtros da carteira: Com atraso = clientes com entregas atrasadas agora (Orion 3, Bella 2, TechNova 1, Café 1 → 4);
// Inadimplentes = pagamento vencido (Bella 9 dias, Café 3 dias → 2); Renovam em 30 dias = TechNova, Clínica Vida, Café Raiz (3).
import { db } from '../../core/store.js';
import { padrao } from '../../core/padroes/index.js';

export const HOJE = '2026-11-24';
const DIA = 864e5;
const d0 = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const isoD = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDias = (s, n) => isoD(new Date(d0(s).getTime() + n * DIA));
export const NSEM = 26;
/** segundas-feiras das 26 semanas (01/06/2026 … 23/11/2026) */
export const SEMANAS = Array.from({ length: NSEM }, (_, i) => addDias('2026-06-01', i * 7));

/* ---------- pesos e metas do health score (§6) ---------- */
// NPS removido a pedido do dono: pesos redistribuídos em Resultado 35 · Prazo 25 · Engajamento 20 · Pagamento 20.
// Pesos, metas e penalidade vêm da central "Padrões e regras" (src/core/padroes/gestao.js); padrão de fábrica = valores do §6.
const pz = (id, v) => padrao(`clientes.health.${id}`, v);
export const PESOS = { get resultado() { return pz('peso.resultado', 35); }, get prazo() { return pz('peso.prazo', 25); }, get engajamento() { return pz('peso.engajamento', 20); }, get pagamento() { return pz('peso.pagamento', 20); } };
export const COMP_META = { get resultado() { return pz('meta.resultado', 80); }, get prazo() { return pz('meta.prazo', 90); }, get engajamento() { return pz('meta.engajamento', 75); }, get pagamento() { return pz('meta.pagamento', 95); } };
export const COMP_ROT = { resultado: 'Resultado vs meta', prazo: 'Entregas no prazo', engajamento: 'Engajamento', pagamento: 'Pagamento em dia' };
/** texto curto dos pesos (usado nos "?" de explicação) */
export const pesosTxt = () => `Resultado ${PESOS.resultado}% · Prazo ${PESOS.prazo}% · Engajamento ${PESOS.engajamento}% · Pagamento ${PESOS.pagamento}%`;
/** penalidade aplicada quando o score cai mais de 15 pts em 30 dias (sinal de risco agudo) */
export const PENALIDADE_QUEDA = 5; // padrão de fábrica; valor atual: padrao('clientes.health.penalidade')

/* ---------- séries de indicadores da carteira (KPIs §5.1) ---------- */
export const KPI_SERIES = {
  ativos: [35, 36, 36, 37, 38, 38, 39, 39, 40, 39, 41, 42],
  health: [79, 78, 78, 77, 77, 76, 77, 76, 75, 76, 76, 74],
  risco: [9, 11, 10, 13, 14, 16, 15, 18, 20, 22, 23.9],
  churn: [10.4, 10.1, 9.9, 9.6, 9.4, 9.2, 9.0, 8.9, 8.7, 8.6, 8.4, 8.3],
};
export const CARTEIRA_REF = { healthDelta: -2, churn12m: 8.3, churnMeta: 10 };

/* ---------- retenção por safra (§5.5) — % de clientes da safra ainda ativos em M0..M5 ---------- */
export const SAFRAS = [
  { safra: 'jun/2026', n: 13, m: [100, 100, 92, 92, 85, 85] },
  { safra: 'jul/2026', n: 20, m: [100, 95, 95, 90, 90] },
  { safra: 'ago/2026', n: 8, m: [100, 100, 88, 88] },
  { safra: 'set/2026', n: 12, m: [100, 92, 92] },
  { safra: 'out/2026', n: 4, m: [100, 100] },
  { safra: 'nov/2026', n: 3, m: [100] },
];

/* ---------- utilidades determinísticas ---------- */
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = hashStr(seed); return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
function cnpjDe(seed) {
  const r = rng('cnpj' + seed); const b = Array.from({ length: 8 }, () => Math.floor(r() * 10)).concat([0, 0, 0, 1]);
  const dv = n => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = w.reduce((a, x, i) => a + x * b[i], 0); const m = s % 11; return m < 2 ? 0 : 11 - m; };
  b.push(dv(12)); b.push(dv(13));
  const s = b.join(''); return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}
const tel = (seed, ddd = '11') => { const r = rng('tel' + seed); const n = () => Math.floor(r() * 10); return `+55 (${ddd}) 9${n()}${n()}${n()}${n()}-${n()}${n()}${n()}${n()}`; };
const slugMail = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/* ---------- clientes canônicos (§5.2, §5.4) ---------- */
// [id, nome, razão social, segmento, desde, serviços, mrr, health, tendência6m, noPrazo, pagamento[estado, texto], renova, resp, equipe, riscoChurn, entregas atrasadas, cor, cidade/UF]
const CANON = [
  ['c-orion', 'Grupo Orion', 'Orion Comércio Varejista Ltda.', 'Varejo', '2025-09-01', ['Tráfego', 'Social'], 14200, 41, [70, 66, 63, 58, 49, 41], 62, ['ok', 'Em dia'], '2027-02-12', 't-ana', ['t-ana', 't-carla', 't-elisa', 't-diego'], 86, 3, '#C2410C', 'São Paulo/SP'],
  ['c-vida', 'Clínica Vida', 'Clínica Vida Saúde Integrada Ltda.', 'Saúde', '2024-03-01', ['Tráfego', 'Site'], 12800, 88, [82, 84, 85, 86, 87, 88], 98, ['ok', 'Em dia'], '2026-12-08', 't-bruno', ['t-bruno', 't-ana', 't-felipe'], 14, 0, '#0E9F6E', 'Campinas/SP'],
  ['c-alfa', 'Construtora Alfa', 'Alfa Construções e Incorporações S.A.', 'Construção', '2025-01-01', ['Tráfego', 'CRM'], 11500, 82, [78, 80, 79, 81, 82, 82], 95, ['ok', 'Em dia'], '2027-03-20', 't-ana', ['t-ana', 't-felipe', 't-diego'], 22, 0, '#1D4ED8', 'Curitiba/PR'],
  ['c-technova', 'TechNova', 'TechNova Soluções em Software Ltda.', 'Tecnologia', '2024-12-01', ['Social', 'Conteúdo'], 9700, 63, [74, 72, 70, 67, 65, 63], 84, ['ok', 'Em dia'], '2026-11-30', 't-bruno', ['t-bruno', 't-elisa', 't-carla'], 61, 1, '#6D28D9', 'Florianópolis/SC'],
  ['c-imob', 'Imob Prime', 'Prime Negócios Imobiliários Ltda.', 'Imobiliário', '2025-06-01', ['Tráfego'], 8900, 79, [72, 74, 75, 77, 78, 79], 93, ['ok', 'Em dia'], '2027-06-02', 't-diego', ['t-diego', 't-ana'], 30, 0, '#0F766E', 'Belo Horizonte/MG'],
  ['c-bella', 'Bella Moda', 'Bella Moda Confecções Ltda.', 'Moda', '2025-02-01', ['Social', 'Tráfego'], 6800, 48, [66, 63, 60, 55, 51, 48], 78, ['err', '9 dias de atraso'], '2027-04-18', 't-bruno', ['t-bruno', 't-ana', 't-carla'], 80, 2, '#BE185D', 'São Paulo/SP'],
  ['c-studiofit', 'Studio Fit', 'Studio Fit Academia Ltda.', 'Fitness', '2024-08-01', ['Social'], 6100, 85, [80, 82, 83, 83, 84, 85], 100, ['ok', 'Em dia'], '2027-01-09', 't-diego', ['t-diego', 't-bruno', 't-carla'], 12, 0, '#EA580C', 'Santos/SP'],
  ['c-autocenter', 'Auto Center Sul', 'Auto Center Sul Serviços Automotivos Ltda.', 'Automotivo', '2025-04-01', ['Tráfego', 'Google'], 5600, 66, [70, 69, 69, 67, 66, 66], 88, ['warn', 'Vence amanhã'], '2027-05-11', 't-ana', ['t-ana', 't-diego'], 58, 0, '#475569', 'Porto Alegre/RS'],
  ['c-petfeliz', 'Pet Feliz', 'Pet Feliz Comércio de Rações Ltda.', 'Pet', '2023-11-01', ['Tráfego', 'Social'], 4900, 90, [86, 88, 88, 89, 90, 90], 100, ['ok', 'Em dia'], '2027-02-25', 't-diego', ['t-diego', 't-ana', 't-bruno'], 8, 0, '#16A34A', 'Ribeirão Preto/SP'],
  ['c-otica', 'Ótica Visão', 'Visão Ótica e Relojoaria Ltda.', 'Ótica', '2025-07-01', ['Tráfego', 'Google'], 4200, 77, [72, 73, 74, 75, 76, 77], 92, ['ok', 'Em dia'], '2027-07-14', 't-diego', ['t-diego', 't-ana'], 34, 0, '#0369A1', 'Goiânia/GO'],
  ['c-cafe', 'Café Raiz', 'Café Raiz Torrefação Ltda.', 'Alimentação', '2025-10-01', ['Social'], 3400, 61, [68, 66, 64, 63, 62, 61], 80, ['warn', '3 dias de atraso'], '2026-12-15', 't-bruno', ['t-bruno', 't-carla', 't-elisa'], 66, 1, '#78350F', 'Poços de Caldas/MG'],
];

// demais 31 clientes ativos (R$ 98.300): [slug, nome, segmento, mrr, health, risco, serviços, resp, desde]
const OUTROS = [
  ['nutrivitta', 'Nutri Vitta Suplementos', 'E-commerce', 4100, 81, 18, ['Tráfego', 'Google'], 't-ana', '2024-05-01'],
  ['sorriso', 'Odonto Sorriso Pleno', 'Saúde', 4200, 77, 24, ['Tráfego', 'Site'], 't-diego', '2024-09-01'],
  ['pulso', 'Academia Pulso', 'Fitness', 3500, 76, 30, ['Social', 'Tráfego'], 't-bruno', '2025-03-01'],
  ['sabermais', 'Escola Saber Mais', 'Educação', 3800, 79, 20, ['Tráfego', 'Conteúdo'], 't-diego', '2024-11-01'],
  ['lumen', 'Lumen Energia Solar', 'Energia', 4000, 74, 35, ['Tráfego', 'CRM'], 't-ana', '2026-10-06'],
  ['casabela', 'Casa Bela Decor', 'Varejo', 3900, 79, 26, ['Social', 'Tráfego'], 't-bruno', '2025-08-01'],
  ['vetamigo', 'Vet Amigo Clínica Veterinária', 'Pet', 3200, 82, 14, ['Social'], 't-diego', '2024-02-01'],
  ['pontoforte', 'Ferragens Ponto Forte', 'Varejo', 3600, 71, 44, ['Tráfego', 'Google'], 't-ana', '2025-11-01'],
  ['duarte', 'Duarte Ramos Advocacia', 'Serviços jurídicos', 3500, 80, 16, ['Conteúdo', 'Site'], 't-felipe', '2024-06-01'],
  ['exata', 'Contábil Exata', 'Serviços', 3100, 78, 25, ['Social', 'Conteúdo'], 't-bruno', '2025-01-01'],
  ['marazul', 'Pousada Mar Azul', 'Turismo', 3400, 75, 33, ['Tráfego', 'Social'], 't-diego', '2025-05-01'],
  ['brasa', 'Hamburgueria Brasa', 'Alimentação', 3000, 77, 22, ['Social', 'Tráfego'], 't-bruno', '2025-07-01'],
  ['dermacare', 'Instituto Dermacare', 'Saúde', 4100, 84, 10, ['Tráfego', 'Site'], 't-ana', '2024-01-01'],
  ['mundokids', 'Mundo Kids Brinquedos', 'Varejo', 3400, 73, 40, ['Tráfego', 'Social'], 't-ana', '2025-04-01'],
  ['otimaidiomas', 'Ótima Idiomas', 'Educação', 3000, 78, 20, ['Tráfego', 'Social'], 't-diego', '2026-11-03'],
  ['verdevale', 'Verde Vale Orgânicos', 'Alimentação', 2600, 75, 30, ['Social', 'Tráfego'], 't-bruno', '2026-11-17'],
  ['solaris', 'Solaris Arquitetura', 'Construção', 3700, 78, 18, ['Tráfego', 'Site'], 't-felipe', '2025-02-01'],
  ['rotasul', 'Rota Sul Logística', 'Logística', 3900, 75, 28, ['Tráfego', 'CRM'], 't-ana', '2026-11-10'],
  ['agrocampo', 'Agro Campo Forte', 'Agronegócio', 4000, 77, 24, ['Tráfego', 'Conteúdo'], 't-diego', '2025-06-01'],
  ['prisma', 'Gráfica Prisma', 'Serviços', 2800, 70, 46, ['Google'], 't-ana', '2025-09-01'],
  ['equilibrio', 'Clínica Equilíbrio Fisioterapia', 'Saúde', 3600, 80, 15, ['Tráfego', 'Social'], 't-diego', '2024-10-01'],
  ['veloz', 'Moto Peças Veloz', 'Automotivo', 3300, 72, 38, ['Tráfego', 'Google'], 't-ana', '2025-10-01'],
  ['alecrim', 'Bistrô Alecrim', 'Alimentação', 2700, 79, 21, ['Social'], 't-bruno', '2025-06-01'],
  ['vista', 'Vista Imóveis', 'Imobiliário', 3800, 76, 27, ['Tráfego', 'CRM'], 't-diego', '2025-03-01'],
  ['ink', 'Studio Ink Tattoo', 'Serviços', 2500, 77, 19, ['Social'], 't-bruno', '2024-12-01'],
  ['horizonte', 'Colégio Horizonte', 'Educação', 4000, 82, 12, ['Tráfego', 'Social', 'Site'], 't-diego', '2023-08-01'],
  ['trigo', 'Padaria Trigo de Ouro', 'Alimentação', 2600, 81, 20, ['Social'], 't-bruno', '2024-07-01'],
  ['fornovelho', 'Pizzaria Forno Velho', 'Alimentação', 2100, 72, 42, ['Social', 'Tráfego'], 't-bruno', '2025-04-01'],
  ['doceencanto', 'Doce Encanto Confeitaria', 'Alimentação', 1800, 55, 72, ['Social'], 't-bruno', '2025-08-01'],
  ['navalha', 'Barbearia Navalha', 'Serviços', 600, 57, 64, ['Social'], 't-diego', '2026-01-05'],
  ['jardim', 'Floricultura Jardim Secreto', 'Varejo', 500, 58, 62, ['Social'], 't-diego', '2025-12-01'],
];
const CORES = ['#0B6BE8', '#7C5CFC', '#0E9F6E', '#C2700A', '#D9467A', '#0891B2', '#4F46E5', '#B45309', '#047857', '#9333EA', '#DC2626', '#0F766E'];
const SUFIXO = { 'E-commerce': 'Comércio Eletrônico Ltda.', Saúde: 'Serviços de Saúde Ltda.', Educação: 'Serviços Educacionais Ltda.', Alimentação: 'Alimentos Ltda.', Varejo: 'Comércio Ltda.', Serviços: 'Serviços Ltda.', Pet: 'Serviços Veterinários Ltda.', Fitness: 'Atividades Físicas Ltda.', Turismo: 'Hospedagem Ltda.', Construção: 'Arquitetura Ltda.', Logística: 'Transportes Ltda.', Agronegócio: 'Insumos Agrícolas Ltda.', Automotivo: 'Peças Ltda.', Imobiliário: 'Imóveis Ltda.', Energia: 'Energia Ltda.', 'Serviços jurídicos': 'Sociedade de Advogados' };
const CIDADES = ['São Paulo/SP', 'Campinas/SP', 'Sorocaba/SP', 'Curitiba/PR', 'Londrina/PR', 'Belo Horizonte/MG', 'Uberlândia/MG', 'Rio de Janeiro/RJ', 'Niterói/RJ', 'Joinville/SC', 'Vitória/ES', 'Goiânia/GO'];
const ONB = { otimaidiomas: true, verdevale: true, rotasul: true }; // novos em novembro (▲3 no mês)

function tendDe(id, health) {
  const r = rng('tend' + id); const ini = clamp(Math.round(health - 6 + r() * 9), 40, 98);
  return Array.from({ length: 6 }, (_, i) => (i === 5 ? health : Math.round(ini + ((health - ini) * i) / 5 + (r() - 0.5) * 2)));
}
function renovaDe(desde, id) {
  // aniversário do contrato no 1º ano futuro após 23/01/2027 (fora da janela de 60 dias, exceto os canônicos)
  const r = rng('ren' + id); const [, m] = desde.split('-').map(Number);
  let y = 2027; let iso = `${y}-${String(m).padStart(2, '0')}-${String(5 + Math.floor(r() * 22)).padStart(2, '0')}`;
  if (iso < '2027-01-24') iso = `${y + (m < 2 ? 0 : 0)}-${String(Math.max(m, 2)).padStart(2, '0')}-${iso.slice(8)}`;
  if (iso < '2027-01-24') iso = `2027-02-${iso.slice(8)}`;
  return iso;
}
function equipeDe(serv, resp, r) {
  const s = new Set([resp]);
  if (serv.includes('Tráfego') || serv.includes('Google')) s.add('t-ana');
  if (serv.includes('Social')) { s.add(r() < 0.5 ? 't-carla' : 't-bruno'); }
  if (serv.includes('Conteúdo')) s.add('t-elisa');
  if (serv.includes('Site') || serv.includes('CRM')) s.add('t-felipe');
  return [...s];
}

/* ---------- metas por cliente ---------- */
const METAS_CANON = {
  'c-orion': { roas: 3.0, cpl: 18, leadsMes: 1200, faturamento: 420000 },
  'c-vida': { roas: 4.5, cpl: 32, leadsMes: 600, faturamento: 380000 },
  'c-alfa': { roas: 6.0, cpl: 55, leadsMes: 420, faturamento: 2400000 },
  'c-technova': { roas: null, cpl: null, leadsMes: 260, faturamento: 310000 },
  'c-imob': { roas: 8.0, cpl: 42, leadsMes: 380, faturamento: 1800000 },
  'c-bella': { roas: 3.5, cpl: 14, leadsMes: 900, faturamento: 160000 },
  'c-studiofit': { roas: null, cpl: null, leadsMes: 180, faturamento: 95000 },
  'c-autocenter': { roas: 4.0, cpl: 22, leadsMes: 320, faturamento: 140000 },
  'c-petfeliz': { roas: 4.2, cpl: 12, leadsMes: 700, faturamento: 130000 },
  'c-otica': { roas: 5.0, cpl: 20, leadsMes: 260, faturamento: 110000 },
  'c-cafe': { roas: null, cpl: null, leadsMes: 140, faturamento: 60000 },
};
function metasDe(c, r) {
  if (METAS_CANON[c.id]) return { ...METAS_CANON[c.id] };
  const pago = c.servicos.includes('Tráfego') || c.servicos.includes('Google');
  const k = c.mrr / 3000;
  return {
    roas: pago ? r1(3 + r() * 3) : null,
    cpl: pago ? Math.round(12 + r() * 30) : null,
    leadsMes: Math.round((pago ? 220 : 90) * k * (0.8 + r() * 0.4) / 10) * 10,
    faturamento: Math.round((c.mrr * (pago ? 28 : 18) * (0.8 + r() * 0.5)) / 1000) * 1000,
  };
}

/* ---------- acessos ---------- */
function acessosDe(c) {
  const a = [];
  const s = c.servicos;
  if (s.includes('Tráfego')) a.push({ nome: 'Meta Ads — conta de anúncios', tipo: 'anuncios', estado: 'ok', obs: 'Acesso de anunciante via Business Manager' });
  if (s.includes('Google') || (s.includes('Tráfego') && c.mrr >= 4000)) a.push({ nome: 'Google Ads', tipo: 'anuncios', estado: 'ok', obs: 'Gerenciado pela MCC da agência' });
  a.push({ nome: 'Google Analytics 4', tipo: 'analytics', estado: 'ok', obs: 'Leitor + editor' });
  if (s.includes('Social')) a.push({ nome: 'Instagram e Facebook (página)', tipo: 'social', estado: 'ok', obs: 'Acesso de editor na página' });
  if (s.includes('Site')) a.push({ nome: 'Site (WordPress)', tipo: 'site', estado: 'ok', obs: 'Usuário administrador' });
  if (s.includes('CRM')) a.push({ nome: 'CRM (RD Station)', tipo: 'crm', estado: 'ok', obs: 'Integração de leads ativa' });
  a.push({ nome: 'Pasta de arquivos (Drive)', tipo: 'drive', estado: 'ok', obs: 'Compartilhada com a equipe' });
  return a;
}
const ACESSOS_ESP = {
  'c-orion': { 'Meta Ads — conta de anúncios': ['err', 'Token expirado — reconecte a integração Meta Ads'], 'Google Analytics 4': ['warn', 'Eventos de compra sem dados há 3 dias'] },
  'c-bella': { 'Instagram e Facebook (página)': ['warn', 'Permissão expira em 6 dias'] },
  'c-technova': { 'Google Analytics 4': ['warn', 'Propriedade sem acesso de editor'] },
  'c-cafe': { 'Pasta de arquivos (Drive)': ['off', 'Pasta arquivada pelo cliente'] },
  'c-lumen': { 'CRM (RD Station)': ['warn', 'Integração em teste'] },
  'c-rotasul': { 'Meta Ads — conta de anúncios': ['err', 'Cliente ainda não liberou o acesso'], 'Google Ads': ['err', 'Convite enviado, não aceito'], 'CRM (RD Station)': ['off', 'Aguardando credenciais'] },
  'c-verdevale': { 'Meta Ads — conta de anúncios': ['err', 'Cliente ainda não liberou o acesso'], 'Instagram e Facebook (página)': ['warn', 'Convite enviado há 7 dias'], 'Google Analytics 4': ['off', 'Propriedade ainda não criada'] },
  'c-otimaidiomas': { 'Google Ads': ['warn', 'Faturamento da conta pendente'] },
};

/* ---------- teto de mídia (R$/mês que o cliente aceita investir em anúncios) ---------- */
const TETO_CANON = {
  'c-orion': 45000, 'c-vida': 30000, 'c-alfa': 60000, 'c-technova': 5000, 'c-imob': 40000, 'c-bella': 15000,
  'c-studiofit': 3000, 'c-autocenter': 12000, 'c-petfeliz': 18000, 'c-otica': 9000, 'c-cafe': 1500,
};
function tetoDe(c) {
  if (TETO_CANON[c.id] != null) return TETO_CANON[c.id];
  const pago = c.servicos.includes('Tráfego') || c.servicos.includes('Google');
  return pago ? Math.round((c.mrr * 3) / 500) * 500 : null;
}

/* ---------- comissão variável por cliente (só dono/admin veem e editam; a pessoa vê as próprias em Equipe) ---------- */
const COMISSOES = {
  'c-orion': [{ id: 'cm-orion-ana', teamId: 't-ana', tipo: 'fixo', valor: 300, meses: 6, inicio: '2026-09-01', obs: 'Retenção do Grupo Orion (plano de virada)' }],
  'c-vida': [{ id: 'cm-vida-bruno', teamId: 't-bruno', tipo: 'percentual', valor: 3, meses: 12, inicio: '2026-06-01', obs: 'Renovação com upsell de Site' }],
  'c-studiofit': [{ id: 'cm-studiofit-diego', teamId: 't-diego', tipo: 'fixo', valor: 200, meses: 3, inicio: '2026-09-15', obs: 'Bônus pela indicação do cliente' }],
  'c-alfa': [{ id: 'cm-alfa-ana', teamId: 't-ana', tipo: 'percentual', valor: 2, meses: 6, inicio: '2026-11-01', obs: 'Meta de CPL batida 3 meses seguidos' }],
  'c-bella': [{ id: 'cm-bella-carla', teamId: 't-carla', tipo: 'fixo', valor: 150, meses: 3, inicio: '2026-05-01', obs: 'Campanha de coleção de inverno' }],
};

/* ---------- montagem dos clientes ---------- */
function montar(base) {
  const r = rng('cli' + base.id);
  const c = { ...base };
  c.cnpj = cnpjDe(c.id);
  c.metas = metasDe(c, r);
  c.acessos = acessosDe(c).map(a => { const e = (ACESSOS_ESP[c.id] || {})[a.nome]; return e ? { ...a, estado: e[0], obs: e[1] } : a; });
  c.logoCor = c.logoCor || CORES[hashStr(c.id) % CORES.length];
  c.ativo = true;
  c.status = ONB[c.id.slice(2)] ? 'onboarding' : 'ativo';
  // componentes do health score coerentes com o score (média ponderada − penalidade)
  c.componentes = componentesDe(c, r);
  c.delta30 = c.id === 'c-orion' ? -22 : c.tendencia[5] - c.tendencia[4];
  c.tetoMidiaMensal = tetoDe(c);
  c.comissoes = (COMISSOES[c.id] || []).map(x => ({ ...x }));
  return c;
}
function componentesDe(c, r) {
  if (c.id === 'c-orion') return { resultado: 30, prazo: 45, engajamento: 32, pagamento: 90 }; // §5.3 (46 ponderado − 5 de queda aguda = 41)
  const prazo = clamp(Math.round(c.noPrazo - 6 * (c.atrasadas || 0)), 20, 100);
  const pagamento = c.pagamento.estado === 'err' ? 35 : c.pagamento.estado === 'warn' ? (/atraso/.test(c.pagamento.texto) ? 70 : 85) : 96;
  let eng = clamp(Math.round(c.health + (r() - 0.5) * 10), 20, 100);
  let res = (c.health - 0.25 * prazo - 0.2 * eng - 0.2 * pagamento) / 0.35;
  if (res < 10 || res > 100) { res = clamp(res, 10, 100); eng = clamp(Math.round((c.health - 0.35 * res - 0.25 * prazo - 0.2 * pagamento) / 0.2), 5, 100); }
  return { resultado: Math.round(res), prazo, engajamento: eng, pagamento };
}

const BASES = [
  ...CANON.map(([id, nome, razaoSocial, segmento, desde, servicos, mrr, health, tendencia, noPrazo, pag, renova, respId, equipe, riscoChurn, atrasadas, logoCor, cidade]) =>
    ({ id, nome, razaoSocial, segmento, desde, servicos, mrr, health, tendencia, noPrazo, pagamento: { estado: pag[0], texto: pag[1] }, renova, respId, equipe, riscoChurn, atrasadas, logoCor, cidade })),
  ...OUTROS.map(([slug, nome, segmento, mrr, health, riscoChurn, servicos, respId, desde], i) => {
    const id = `c-${slug}`; const r = rng('o' + id);
    const noPrazo = health >= 80 ? 96 + Math.floor(r() * 5) : 90 + Math.floor(r() * 6);
    return {
      id, nome, razaoSocial: `${nome.split(' ').slice(0, 2).join(' ')} ${SUFIXO[segmento] || 'Ltda.'}`, segmento, desde, servicos, mrr, health,
      tendencia: tendDe(id, health), noPrazo, pagamento: { estado: 'ok', texto: 'Em dia' }, renova: renovaDe(desde, id), respId,
      equipe: equipeDe(servicos, respId, r), riscoChurn, atrasadas: 0, logoCor: null, cidade: CIDADES[i % CIDADES.length],
    };
  }),
];
export const CLIENTS = BASES.map(montar);

/* ---------- contatos ---------- */
const NOMES = ['Marcos Vieira', 'Juliana Prates', 'Renata Moraes', 'Carlos Henrique Toledo', 'Patrícia Gouveia', 'Ricardo Saldanha', 'Fernanda Arruda', 'Thiago Bastos', 'Camila Fontes', 'Rodrigo Pacheco', 'Beatriz Lacerda', 'André Quintela', 'Larissa Monteiro', 'Gustavo Amaral', 'Vanessa Rocha Lima', 'Eduardo Pires', 'Mariana Teles', 'Felipe Antunes', 'Aline Correia', 'Rafael Brandão', 'Sabrina Kato', 'Leonardo Dutra', 'Priscila Macedo', 'Otávio Nogueira'];
export const CONTACTS = CLIENTS.flatMap((c, i) => {
  const dom = slugMail(c.nome.split(' ').slice(0, 2).join('')) + '.com.br';
  const n1 = NOMES[(i * 2) % NOMES.length], n2 = NOMES[(i * 2 + 1) % NOMES.length];
  const mail = n => `${slugMail(n.split(' ')[0])}@${dom}`;
  const ultResp = c.id === 'c-orion' ? '2026-11-13' : c.id === 'c-bella' ? '2026-11-17' : addDias(HOJE, -1 - (i % 4));
  return [
    { id: `ct-${c.id.slice(2)}-1`, clientId: c.id, nome: n1, papel: 'decisor', cargo: i % 3 ? 'Sócio-diretor' : 'Diretor de marketing', email: mail(n1), telefone: tel(c.id + 'a'), whatsapp: true, ultimaResposta: ultResp, principal: true },
    { id: `ct-${c.id.slice(2)}-2`, clientId: c.id, nome: n2, papel: 'dia_a_dia', cargo: 'Coordenador(a) de marketing', email: mail(n2), telefone: tel(c.id + 'b'), whatsapp: true, ultimaResposta: addDias(HOJE, -(i % 3)), principal: false },
  ];
});

/* ---------- contratos ---------- */
export const CONTRACTS = CLIENTS.map(c => ({
  id: `ctr-${c.id.slice(2)}`, clientId: c.id, inicio: c.desde, mrr: c.mrr, indice: c.mrr >= 8000 ? 'IPCA' : 'IGP-M', reajusteData: `${c.renova.slice(0, 4)}-${c.desde.slice(5, 7)}-01` > c.renova ? c.renova : c.renova,
  reajustePct: c.mrr >= 8000 ? 4.5 : 5.0, fidelidadeMeses: 12, renovacao: c.renova, renovacaoAuto: !['c-technova', 'c-cafe'].includes(c.id),
  pdf: `contrato-${c.id.slice(2)}.pdf`, multaRescisao: 'Equivalente a 1 mensalidade', status: 'vigente',
}));

/* ---------- histórico do health score (semanal, 26 semanas) ---------- */
function historicoDe(c) {
  if (c.id === 'c-orion') return [70, 70, 69, 68, 67, 66, 66, 65, 64, 63, 63, 62, 60, 58, 57, 56, 57, 59, 61, 62, 63, 58, 52, 47, 43, 41];
  const r = rng('hh' + c.id); const t = c.tendencia;
  return SEMANAS.map((_, w) => {
    const pos = (w / (NSEM - 1)) * 5; const i = Math.floor(pos), f = pos - i;
    const v = i >= 5 ? t[5] : t[i] + (t[i + 1] - t[i]) * f;
    return w === NSEM - 1 ? c.health : Math.round(clamp(v + (r() - 0.5) * 2.4, 5, 100));
  });
}
export const HEALTH_HISTORY = CLIENTS.map(c => {
  const inicio = SEMANAS.findIndex(s => s >= c.desde);
  const v = historicoDe(c);
  return { id: `hh-${c.id.slice(2)}`, clientId: c.id, semanas: SEMANAS, valores: v.map((x, i) => (inicio > 0 && i < inicio ? null : x)) };
});

/* ---------- ações da equipe + resultados semanais ---------- */
// tipos de ação, área e métrica afetada
export const TIPOS_ACAO = {
  'Novo criativo': { area: 'producao', metrica: 'roas', icone: 'layers' },
  'Nova campanha': { area: 'trafego', metrica: 'leads', icone: 'rocket' },
  'Ajuste de público': { area: 'trafego', metrica: 'cpl', icone: 'users' },
  'Aumento de verba': { area: 'trafego', metrica: 'faturamento', icone: 'trending-up' },
  'Redução de verba': { area: 'trafego', metrica: 'roas', icone: 'trending-down' },
  'Pausa de anúncio': { area: 'trafego', metrica: 'cpl', icone: 'pause' },
  'Ajuste de lance': { area: 'trafego', metrica: 'roas', icone: 'sliders' },
  'Nova landing page': { area: 'producao', metrica: 'cpl', icone: 'globe' },
  'Novas copies': { area: 'producao', metrica: 'cpl', icone: 'edit' },
  'Calendário de conteúdo': { area: 'producao', metrica: 'leads', icone: 'calendar' },
  'Reunião de alinhamento': { area: 'cs', metrica: null, icone: 'users' },
  'Relatório de resultados': { area: 'cs', metrica: null, icone: 'file' },
  'Contato com o cliente': { area: 'cs', metrica: null, icone: 'phone' },
  'Integração / CRM': { area: 'producao', metrica: 'leads', icone: 'link' },
};
export const AREAS = { trafego: 'Tráfego', producao: 'Produção', cs: 'Atendimento (CS)', torre: 'Torre de Controle' };

const A = (clientId, w, dia, quem, tipo, descricao, extra = {}) => ({
  id: `ac-${clientId.slice(2)}-${w}-${hashStr(tipo + descricao).toString(36).slice(0, 4)}`, clientId, data: addDias(SEMANAS[w], dia), quem, tipo,
  area: extra.origem === 'torre' ? 'torre' : TIPOS_ACAO[tipo].area, metrica: extra.metrica !== undefined ? extra.metrica : TIPOS_ACAO[tipo].metrica,
  descricao, antes: extra.antes || '', depois: extra.depois || '', expectativa: extra.expectativa || '', resultado: extra.resultado || '',
  origem: extra.origem || 'manual', aprovadoPor: extra.aprovadoPor || null,
});
const ACOES_ORION = [
  A('c-orion', 4, 1, 't-ana', 'Nova campanha', 'Campanha de remarketing para quem visitou produto e não comprou (7 e 30 dias).', { metrica: 'roas', antes: 'Sem remarketing', depois: '2 conjuntos · R$ 120/dia', expectativa: 'ROAS +5% em 14 dias', resultado: 'ROAS subiu de 3,4 para 3,6 nas 2 semanas seguintes.' }),
  A('c-orion', 9, 2, null, 'Pausa de anúncio', 'Torre de Controle pausou 3 anúncios com CPA 2,4× acima da média da conta.', { origem: 'torre', aprovadoPor: 't-ana', antes: '14 anúncios ativos', depois: '11 anúncios ativos', expectativa: 'Proteger o ROAS', resultado: 'Queda de ROAS desacelerou, mas não reverteu.' }),
  A('c-orion', 12, 0, 't-ana', 'Ajuste de público', 'Lookalike de compradores ampliado de 1% para 3% e exclusão de compradores dos últimos 30 dias.', { antes: 'LAL 1%', depois: 'LAL 3% + exclusões', expectativa: 'CPL −10%', resultado: 'CPL estável; volume subiu 8%.' }),
  A('c-orion', 15, 3, 't-diego', 'Reunião de alinhamento', 'Cliente informou corte de 30% no mix de produtos e estoque baixo em categorias campeãs.', { resultado: 'Combinado priorizar categorias com estoque; decisor pediu relatório quinzenal.' }),
  A('c-orion', 17, 1, null, 'Redução de verba', 'Alerta de verba: conta passou de 90% do orçamento no dia 18; Torre reduziu orçamento diário em 20%.', { origem: 'torre', aprovadoPor: 't-ana', antes: 'R$ 1.500/dia', depois: 'R$ 1.200/dia', expectativa: 'Fechar o mês dentro do orçamento', resultado: 'Orçamento respeitado; ROAS seguiu caindo.' }),
  A('c-orion', 19, 2, 't-elisa', 'Novas copies', '12 novas copies focadas em frete grátis e parcelamento sem juros.', { antes: 'Copies de lançamento', depois: '12 copies de oferta', expectativa: 'CTR +15%', resultado: 'CTR subiu 9%; conversão não acompanhou.' }),
  A('c-orion', 21, 1, 't-carla', 'Novo criativo', '6 criativos novos em vídeo curto (UGC) para as categorias com estoque.', { antes: '3 criativos ativos há 5 semanas', depois: '9 criativos ativos', expectativa: 'ROAS de volta a 2,5', resultado: 'Fadiga reduziu, ROAS ficou em 1,8.' }),
  A('c-orion', 22, 3, 't-ana', 'Ajuste de lance', 'Troca de lance de menor custo para custo-alvo por compra (R$ 48).', { antes: 'Menor custo', depois: 'Custo-alvo R$ 48', expectativa: 'Estabilizar CPA', resultado: 'CPA estabilizou; volume caiu 12%.' }),
  A('c-orion', 24, 2, 't-diego', 'Contato com o cliente', 'Ligação e mensagem ao decisor (Marcos Vieira) para apresentar plano de resgate — sem resposta.', { resultado: 'Decisor não responde desde 13/11.' }),
  A('c-orion', 25, 1, 't-ana', 'Aumento de verba', 'Verba de teste aprovada pelo dono: +R$ 3.000 no mês para campanha de catálogo (Advantage+).', { antes: 'R$ 1.200/dia', depois: 'R$ 1.300/dia + teste', expectativa: 'ROAS 2,5 em 14 dias', resultado: '' }),
];
const ACOES_ESP = {
  'c-vida': [
    [3, 't-ana', 'Nova campanha', 'Campanha de captação para check-up executivo com formulário instantâneo.', { antes: '—', depois: 'R$ 250/dia', expectativa: '+80 leads/mês', resultado: 'Leads +18% no mês seguinte.' }],
    [8, 't-felipe', 'Nova landing page', 'Landing page de agendamento online com integração à agenda da clínica.', { antes: 'Formulário simples', depois: 'Agendamento direto', expectativa: 'CPL −15%', resultado: 'CPL caiu de R$ 34 para R$ 29.' }],
    [13, 't-carla', 'Novo criativo', '8 criativos com depoimentos de pacientes (com autorização).', { expectativa: 'CTR +10%', resultado: 'CTR +14%.' }],
    [17, null, 'Aumento de verba', 'Torre de Controle sugeriu +15% de verba (ROAS acima da meta por 3 semanas); aprovado.', { origem: 'torre', aprovadoPor: 't-bruno', antes: 'R$ 400/dia', depois: 'R$ 460/dia', expectativa: '+10% faturamento', resultado: 'Faturamento atribuído +11%.' }],
    [21, 't-bruno', 'Reunião de alinhamento', 'Alinhamento da renovação de 08/12: cliente quer incluir site novo no escopo.', { resultado: 'Proposta de expansão em elaboração.' }],
    [23, 't-ana', 'Ajuste de público', 'Segmentação por raio de 8 km das 2 unidades.', { expectativa: 'CPL −5%', resultado: 'CPL −6%.' }],
  ],
  'c-bella': [
    [5, 't-ana', 'Nova campanha', 'Campanha de catálogo para coleção de inverno.', { expectativa: 'ROAS 3,5', resultado: 'ROAS 3,2 no pico.' }],
    [11, 't-carla', 'Novo criativo', '10 criativos da coleção de primavera.', { expectativa: 'CTR +10%', resultado: 'CTR +6%.' }],
    [14, null, 'Pausa de anúncio', 'Torre pausou 4 anúncios com frequência acima de 4,5.', { origem: 'torre', aprovadoPor: 't-ana', antes: '12 anúncios', depois: '8 anúncios', expectativa: 'Reduzir fadiga', resultado: 'CPL estável.' }],
    [18, null, 'Redução de verba', 'Pagamento atrasado: verba reduzida em 30% até a regularização (regra da Torre).', { origem: 'torre', aprovadoPor: 't-bruno', antes: 'R$ 300/dia', depois: 'R$ 210/dia', expectativa: 'Limitar exposição', resultado: 'Faturamento atribuído caiu 18%.' }],
    [22, 't-bruno', 'Contato com o cliente', 'Cobrança amigável da fatura de outubro e convite para reunião de resultados.', { resultado: 'Cliente prometeu pagar até 28/11.' }],
  ],
  'c-technova': [
    [4, 't-elisa', 'Calendário de conteúdo', 'Calendário editorial do 2º semestre com 3 posts técnicos por semana.', { expectativa: '+15% leads orgânicos', resultado: 'Leads +9%.' }],
    [10, 't-carla', 'Novo criativo', 'Série de carrosséis "Mitos da nuvem".', { expectativa: 'Engajamento +20%', resultado: 'Engajamento +12%.' }],
    [16, 't-bruno', 'Relatório de resultados', 'Relatório trimestral apresentado ao cliente.', { resultado: 'Cliente pediu mais conteúdo em vídeo.' }],
    [20, 't-elisa', 'Novas copies', 'Reescrita das páginas de produto do blog para captação.', { expectativa: 'Leads +10%', resultado: 'Sem efeito claro ainda.' }],
  ],
  'c-cafe': [
    [6, 't-carla', 'Novo criativo', 'Fotos de produto em estúdio para a linha especial.', { expectativa: 'Engajamento +15%', resultado: 'Engajamento +10%.' }],
    [14, 't-bruno', 'Calendário de conteúdo', 'Calendário com receitas e bastidores da torrefação.', { expectativa: 'Leads +10%', resultado: 'Leads −3%.' }],
    [22, 't-bruno', 'Contato com o cliente', 'Lembrete da fatura vencida e proposta de reunião de renovação (15/12).', { resultado: 'Reunião marcada para 09/12.' }],
  ],
};
const GENERICAS = [
  ['trafego', 'Nova campanha', 'Campanha de conversão com público frio e remarketing.', 'Leads +15%'],
  ['trafego', 'Ajuste de público', 'Revisão de públicos: exclusão de clientes e lookalike de compradores.', 'CPL −10%'],
  ['producao', 'Novo criativo', 'Lote de 6 criativos novos (vídeo curto e carrossel).', 'CTR +10%'],
  ['trafego', 'Aumento de verba', 'Aumento de verba nas campanhas com ROAS acima da meta.', 'Faturamento +10%'],
  ['producao', 'Novas copies', 'Novas copies com foco em oferta e prova social.', 'CPL −8%'],
  ['cs', 'Reunião de alinhamento', 'Reunião mensal de resultados e próximos passos.', ''],
  ['torre', 'Pausa de anúncio', 'Torre de Controle pausou anúncios com CPA acima de 2× a média.', 'Proteger o ROAS'],
  ['producao', 'Calendário de conteúdo', 'Calendário editorial do mês aprovado.', 'Leads +5%'],
];
function acoesDe(c) {
  if (c.id === 'c-orion') return ACOES_ORION;
  if (ACOES_ESP[c.id]) return ACOES_ESP[c.id].map(([w, quem, tipo, desc, ex]) => A(c.id, w, 1 + (w % 4), quem, tipo, desc, ex));
  const r = rng('ac' + c.id);
  const inicio = Math.max(1, SEMANAS.findIndex(s => s >= c.desde) + 1 || 1);
  if (inicio > NSEM - 2) return [A(c.id, NSEM - 1, 0, c.respId, 'Reunião de alinhamento', 'Kickoff: apresentação da equipe, metas e cronograma de onboarding.', { resultado: 'Lista de acessos enviada ao cliente.' })];
  const pago = c.servicos.includes('Tráfego') || c.servicos.includes('Google');
  const opts = GENERICAS.filter(g => pago || (g[0] !== 'trafego' && g[0] !== 'torre'));
  const n = 3 + Math.floor(r() * 3);
  const out = []; const usadas = new Set();
  for (let k = 0; k < n; k++) {
    let w = Math.round(inicio + ((NSEM - 3 - inicio) * (k + 0.5)) / n + (r() - 0.5) * 2); w = clamp(w, inicio, NSEM - 3);
    if (usadas.has(w)) continue; usadas.add(w);
    const g = opts[Math.floor(r() * opts.length)];
    const quem = g[0] === 'trafego' ? 't-ana' : g[0] === 'cs' ? c.respId : g[0] === 'torre' ? null : (c.equipe.find(t => ['t-carla', 't-elisa', 't-felipe'].includes(t)) || 't-carla');
    out.push(A(c.id, w, Math.floor(r() * 5), quem, g[1], g[2], { origem: g[0] === 'torre' ? 'torre' : 'manual', aprovadoPor: g[0] === 'torre' ? 't-ana' : null, expectativa: g[3], resultado: g[0] === 'cs' ? 'Próximos passos registrados na ata.' : '' }));
  }
  return out;
}
export const CLIENT_ACTIONS = CLIENTS.flatMap(acoesDe);

// razão desempenho/meta (1 = na meta) ao fim do período, a partir do health
const razaoFim = h => 0.6 + (h - 41) * (0.55 / 49);
function resultadosDe(c) {
  const r = rng('res' + c.id); const m = c.metas;
  const inicio = Math.max(0, SEMANAS.findIndex(s => s >= c.desde));
  const acoes = CLIENT_ACTIONS.filter(a => a.clientId === c.id);
  let razao;
  if (c.id === 'c-orion') {
    const roas = [3.1, 3.2, 3.3, 3.4, 3.3, 3.6, 3.5, 3.3, 3.2, 3.1, 3.0, 2.9, 2.8, 2.7, 2.6, 2.5, 2.4, 2.3, 2.2, 2.2, 1.9, 1.8, 1.8, 1.7, 1.9, 1.8];
    razao = roas.map(v => v / m.roas);
  } else {
    const fim = razaoFim(c.health); const t = c.tendencia;
    const ini = clamp(fim - (t[5] - t[0]) * 0.012, 0.4, 1.4);
    const ws = acoes.map(a => SEMANAS.findIndex((s, i) => a.data >= s && (i === NSEM - 1 || a.data < SEMANAS[i + 1]))).filter(w => w >= 0 && w < NSEM - 1);
    const passos = ws.length ? ws.map(() => 0.4 + r()) : [];
    const tot = passos.reduce((a, b) => a + b, 0) || 1;
    const deriva = ws.length ? 0.25 : 1; // parte da mudança vem das ações (degraus), parte é tendência
    razao = SEMANAS.map((_, w) => {
      let v = ini + (fim - ini) * deriva * (w / (NSEM - 1));
      ws.forEach((aw, k) => { if (w > aw) v += ((fim - ini) * (1 - deriva) * passos[k]) / tot + Math.abs(fim - ini) * 0.04; });
      return v;
    });
    // ajuste para terminar exatamente em "fim"
    const corr = fim - razao[NSEM - 1];
    razao = razao.map((v, w) => v + (corr * w) / (NSEM - 1));
  }
  const ruido = () => 1 + (r() - 0.5) * 0.06;
  const nul = (arr) => arr.map((v, i) => (i < inicio ? null : v));
  return {
    id: `cr-${c.id.slice(2)}`, clientId: c.id, semanas: SEMANAS,
    roas: m.roas ? nul(razao.map((x, i) => r2(c.id === 'c-orion' ? x * m.roas : x * m.roas * ruido()))) : null,
    cpl: m.cpl ? nul(razao.map(x => r2(m.cpl / (x * ruido())))) : null,
    leads: nul(razao.map(x => Math.round(m.leadsMes * x * ruido()))),
    faturamento: nul(razao.map(x => Math.round((m.faturamento * x * ruido()) / 100) * 100)),
  };
}
export const CLIENT_RESULTS = CLIENTS.map(resultadosDe);

// linha de base "desde que entramos" (resultado no 1º mês de contrato)
const BASE_RAZAO = { 'c-orion': 0.73, 'c-bella': 0.78, 'c-technova': 0.8, 'c-cafe': 0.82 };
CLIENTS.forEach(c => {
  const rs = CLIENT_RESULTS.find(x => x.clientId === c.id); const m = c.metas;
  const primeiro = k => (rs[k] || []).find(v => v != null);
  const recente = c.desde >= SEMANAS[0];
  const br = BASE_RAZAO[c.id] || (0.55 + (hashStr(c.id) % 15) / 100);
  c.baseline = recente
    ? { data: c.desde, roas: m.roas ? primeiro('roas') : null, cpl: m.cpl ? primeiro('cpl') : null, leadsMes: primeiro('leads'), faturamento: primeiro('faturamento') }
    : { data: c.desde, roas: m.roas ? r2(m.roas * br) : null, cpl: m.cpl ? r2(m.cpl / br) : null, leadsMes: Math.round(m.leadsMes * br), faturamento: Math.round((m.faturamento * br) / 100) * 100 };
});

/* ---------- registros de histórico (reclamações e elogios) ---------- */
const REG = {
  'c-orion': [['reclamacao', '2026-11-05', 't-diego', 'Decisor reclamou da queda nas vendas online e cobrou mais agilidade nos criativos.'], ['reclamacao', '2026-10-14', 't-ana', 'Cliente questionou o aumento do CPL em setembro.'], ['elogio', '2026-07-08', 't-ana', 'Elogiou a campanha de remarketing de julho (ROAS 3,6).']],
  'c-vida': [['elogio', '2026-11-10', 't-bruno', 'Diretoria elogiou o novo agendamento online.'], ['elogio', '2026-09-02', 't-ana', 'Recorde de agendamentos em agosto.']],
  'c-bella': [['reclamacao', '2026-11-12', 't-bruno', 'Cliente achou o relatório de outubro "difícil de entender".'], ['reclamacao', '2026-10-03', 't-carla', 'Pediu refação de 4 artes da coleção.']],
  'c-technova': [['reclamacao', '2026-10-28', 't-bruno', 'Pediu mais vídeos e menos posts estáticos.']],
  'c-petfeliz': [['elogio', '2026-10-20', 't-diego', 'Indicou a agência para outra loja da rede.']],
};
CLIENTS.forEach(c => { c.registros = (REG[c.id] || []).map(([tipo, data, quem, texto], i) => ({ id: `rg-${c.id.slice(2)}-${i}`, tipo, data, quem, texto })); });

/* ---------- reuniões ---------- */
const M = (id, clientId, quando, titulo, tipo, participantes, status, notas = '') => ({ id, clientId, quando, titulo, tipo, participantes, status, duracao: 45, notas, local: 'Google Meet' });
export const MEETINGS = [
  M('mt-orion-1', 'c-orion', '2026-09-17T14:00:00', 'Reunião mensal de resultados', 'resultado', ['t-ana', 't-diego'], 'realizada', 'ROAS 2,3. Cliente preocupado com estoque.'),
  M('mt-orion-2', 'c-orion', '2026-10-22T10:00:00', 'Alinhamento de mix de produtos', 'alinhamento', ['t-diego', 't-ana'], 'realizada', 'Corte de 30% no mix; foco em categorias com estoque.'),
  M('mt-orion-3', 'c-orion', '2026-11-11T15:00:00', 'Revisão de criativos', 'alinhamento', ['t-carla', 't-ana'], 'realizada', 'Aprovados 6 vídeos UGC.'),
  M('mt-vida-1', 'c-vida', '2026-11-05T09:30:00', 'Pré-renovação e escopo do site', 'renovacao', ['t-bruno', 't-gabriel'], 'realizada', 'Cliente quer site novo no escopo.'),
  M('mt-vida-2', 'c-vida', '2026-12-02T10:00:00', 'Renovação do contrato', 'renovacao', ['t-bruno', 't-gabriel'], 'agendada'),
  M('mt-cafe-1', 'c-cafe', '2026-12-09T16:00:00', 'Renovação e plano 2027', 'renovacao', ['t-bruno'], 'agendada'),
  M('mt-technova-1', 'c-technova', '2026-10-15T11:00:00', 'Relatório trimestral', 'resultado', ['t-bruno', 't-elisa'], 'realizada', 'Pediram mais vídeos.'),
  M('mt-bella-1', 'c-bella', '2026-10-30T14:00:00', 'Resultados de outubro', 'resultado', ['t-bruno', 't-ana'], 'realizada', 'Cliente sinalizou dificuldade de caixa.'),
  M('mt-alfa-1', 'c-alfa', '2026-11-18T10:00:00', 'Resultados de lançamento', 'resultado', ['t-ana', 't-diego'], 'realizada', 'Lançamento com 412 leads qualificados.'),
  M('mt-alfa-2', 'c-alfa', '2026-12-16T10:00:00', 'Planejamento 2027', 'alinhamento', ['t-ana', 't-diego', 't-gabriel'], 'agendada'),
  M('mt-imob-1', 'c-imob', '2026-11-12T15:30:00', 'Resultados mensais', 'resultado', ['t-diego', 't-ana'], 'realizada'),
  M('mt-studiofit-1', 'c-studiofit', '2026-12-03T09:00:00', 'Pré-renovação', 'renovacao', ['t-diego'], 'agendada'),
  M('mt-auto-1', 'c-autocenter', '2026-11-06T14:00:00', 'Resultados de outubro', 'resultado', ['t-ana'], 'realizada'),
  M('mt-pet-1', 'c-petfeliz', '2026-11-19T10:30:00', 'Resultados e Black Friday', 'resultado', ['t-diego', 't-ana'], 'realizada'),
  M('mt-otica-1', 'c-otica', '2026-11-13T16:00:00', 'Resultados mensais', 'resultado', ['t-diego'], 'realizada'),
  M('mt-rotasul-1', 'c-rotasul', '2026-11-12T10:00:00', 'Kickoff', 'kickoff', ['t-ana', 't-diego'], 'realizada', 'Lista de acessos enviada.'),
  M('mt-otima-1', 'c-otimaidiomas', '2026-11-05T11:00:00', 'Kickoff', 'kickoff', ['t-diego', 't-ana'], 'realizada'),
  M('mt-lumen-1', 'c-lumen', '2026-10-08T10:00:00', 'Kickoff', 'kickoff', ['t-ana', 't-felipe'], 'realizada'),
  M('mt-verde-1', 'c-verdevale', '2026-11-26T10:00:00', 'Kickoff', 'kickoff', ['t-bruno', 't-ana'], 'agendada'),
];

/* ---------- onboarding (§5.6) ---------- */
// etapas: contrato → acessos → kickoff → entrega (1ª entrega) → resultado (1º resultado)
// O funil conta clientes que concluíram (feito) ou iniciaram (parcial) cada etapa: 4 · 3 · 2 · 2 · 1.
export const ETAPAS_ONB = [
  { id: 'contrato', rotulo: 'Contrato assinado' }, { id: 'acessos', rotulo: 'Acessos liberados' }, { id: 'kickoff', rotulo: 'Kickoff feito' },
  { id: 'entrega', rotulo: '1ª entrega' }, { id: 'resultado', rotulo: '1º resultado' },
];
const E = (estado, data) => ({ estado, data: data || null });
export const ONBOARDING = [
  { id: 'onb-lumen', clientId: 'c-lumen', respId: 't-ana', etapas: { contrato: E('feito', '2026-10-06'), acessos: E('feito', '2026-10-09'), kickoff: E('feito', '2026-10-08'), entrega: E('feito', '2026-10-20'), resultado: E('feito', '2026-11-10') }, etapaAtual: 'concluido', paradoDesde: null, concluido: true },
  { id: 'onb-otimaidiomas', clientId: 'c-otimaidiomas', respId: 't-diego', etapas: { contrato: E('feito', '2026-11-03'), acessos: E('feito', '2026-11-04'), kickoff: E('feito', '2026-11-05'), entrega: E('feito', '2026-11-19'), resultado: E('pendente') }, etapaAtual: 'resultado', paradoDesde: '2026-11-19', concluido: false },
  { id: 'onb-rotasul', clientId: 'c-rotasul', respId: 't-ana', etapas: { contrato: E('feito', '2026-11-10'), acessos: E('parcial', '2026-11-14'), kickoff: E('pendente'), entrega: E('pendente'), resultado: E('pendente') }, etapaAtual: 'acessos', paradoDesde: '2026-11-14', pendencia: 'Meta Ads e Google Ads não liberados; CRM sem credenciais', concluido: false },
  { id: 'onb-verdevale', clientId: 'c-verdevale', respId: 't-bruno', etapas: { contrato: E('feito', '2026-11-17'), acessos: E('pendente'), kickoff: E('pendente'), entrega: E('pendente'), resultado: E('pendente') }, etapaAtual: 'acessos', paradoDesde: '2026-11-17', pendencia: 'Nenhum acesso liberado; convite do Instagram enviado há 7 dias', concluido: false },
];
// Lumen concluiu em novembro; os outros três entraram em novembro.

/* ---------- semeadura ---------- */
db.seed('clients', CLIENTS);
db.seed('contacts', CONTACTS);
db.seed('contracts', CONTRACTS);
db.seed('healthHistory', HEALTH_HISTORY);
db.seed('meetings', MEETINGS);
db.seed('onboarding', ONBOARDING);
db.seed('clientResults', CLIENT_RESULTS);
db.seed('clientActions', CLIENT_ACTIONS);
