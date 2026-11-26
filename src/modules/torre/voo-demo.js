// voo-demo.js — dados FICTÍCIOS do Painel de Voo para o modo demonstração (testes, Protótipo Oficial).
// Mesmo formato que a Edge Function voo-dados devolve (ver supabase/functions/_shared/voo.ts). Nenhum nome, id ou número real.
// As contas ligadas a clientes usam os mesmos ids de src/modules/clientes/data.js (META_DEMO).

/* contas fictícias: [conta, nome no Meta, cenário, meta de custo/conversa, gasto/dia de referência] */
export const CONTAS_DEMO = [
  ['9000000000000101', 'Grupo Orion · Anúncios', 'crit', 14, 420],
  ['9000000000000102', 'Clínica Vida', 'exc', 18, 260],
  ['9000000000000103', 'Construtora Alfa · Lançamentos', 'bom', 22, 380],
  ['9000000000000104', 'Imob Prime', 'aten', 16, 210],
  ['9000000000000105', 'Bella Moda', 'fadiga', 9, 180],
  ['9000000000000106', 'Auto Center Sul', 'caro', 12, 150],
  ['9000000000000107', 'Nutri Vitta Loja', 'compra', 30, 340],
  ['9000000000000108', 'Odonto Sorriso Pleno', 'bom', 15, 140],
  ['9000000000000109', 'Lumen Energia Solar', 'ins', 25, 120],
  ['9000000000000110', 'Instituto Dermacare', 'exc', 17, 230],
  ['9000000000000111', 'Mundo Kids', 'sem', 10, 160],
  ['9000000000000112', 'Ferragens Ponto Forte', 'par', 11, 110],
  ['9000000000000113', 'Pousada Mar Azul', 'bom', 20, 130],
  ['9000000000000114', 'Clínica Equilíbrio', 'aten', 13, 120],
  ['9000000000000191', 'Doceria Pão de Mel', 'bom', 0, 90],
  ['9000000000000192', 'Ateliê Linha Fina', 'exc', 0, 70],
  ['9000000000000193', 'Studio Pilates Ar Livre', 'ins', 0, 60],
];
/** índice custo÷meta por cenário (últimos dias) */
const IDX = { exc: 0.62, bom: 0.9, aten: 1.15, caro: 1.42, crit: 1.9, fadiga: 1.35, compra: 0.9, ins: 0.95, sem: 1, par: 1 };
const TEMAS = ['[MSG] Oferta principal', '[MSG] Remarketing 30d', '[LEAD] Formulário', '[MSG] Prova social', '[VENDAS] Catálogo'];
const ADS = ['Reels · depoimento', 'Carrossel · antes e depois', 'Imagem · oferta', 'Vídeo · bastidores', 'Reels · dúvidas frequentes'];

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = hash(seed); return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const p2 = n => String(n).padStart(2, '0');
const isoLocal = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const r2 = v => Math.round(v * 100) / 100;

/** pacote fictício completo (15 dias: 14 completos + hoje até agora) */
export function gerarDemo(agora = new Date()) {
  const dias = Array.from({ length: 15 }, (_, i) => isoLocal(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - (14 - i))));
  const fracHoje = Math.min(1, Math.max(0.08, (agora.getHours() * 60 + agora.getMinutes()) / 1440));
  const contas = [], camps = {}, sets = {}, ads = {}, linhas = [];
  CONTAS_DEMO.forEach(([conta, nome, cen, meta, ref], k) => {
    const R = rng(conta);
    contas.push({ id: conta, nome, status: cen === 'par' && k % 2 ? 'UNSETTLED' : 'ACTIVE', moeda: 'BRL', clientId: null });
    const nC = cen === 'ins' ? 1 : 2 + (k % 2);
    for (let ci = 0; ci < nC; ci++) {
      const cid = `${conta}${p2(ci + 1)}`;
      const lead = cen === 'sem' || (ci === 2 && k % 3 === 0);
      const venda = cen === 'compra' && ci === 0;
      const tema = venda ? TEMAS[4] : lead ? TEMAS[2] : TEMAS[ci === 2 ? 3 : ci];
      const cbo = (k + ci) % 2 === 0;
      const pausada = ci === nC - 1 && nC > 2 && cen !== 'par';
      const peso = ci === 0 ? 0.6 : 0.4 / (nC - 1);
      const orcC = Math.max(20, Math.round(ref * peso * 1.05));
      camps[cid] = { c: conta, n: tema, st: pausada ? 'PAUSED' : 'ACTIVE', obj: venda ? 'OUTCOME_SALES' : lead ? 'OUTCOME_LEADS' : 'OUTCOME_ENGAGEMENT', orc: cbo ? orcC : null };
      const nS = 1 + ((k + ci) % 2);
      for (let si = 0; si < nS; si++) {
        const sid = `${cid}${si + 1}`;
        sets[sid] = { c: cid, n: si === 0 ? 'Público amplo · 25–55' : 'Lookalike 1% · clientes', st: pausada ? 'CAMPAIGN_PAUSED' : 'ACTIVE', orc: cbo ? null : Math.max(10, Math.round(orcC / nS)) };
        const nA = 2 + ((k + si) % 2);
        for (let ai = 0; ai < nA; ai++) {
          const aid = `${sid}${ai + 1}`;
          const cansado = cen === 'fadiga' && ci === 0 && si === 0; // todos os anúncios do conjunto principal cansados
          ads[aid] = { s: sid, n: ADS[(k + ai + si) % ADS.length], st: pausada ? 'CAMPAIGN_PAUSED' : ai === nA - 1 && k % 4 === 1 ? 'PAUSED' : 'ACTIVE' };
          const pesoAd = (1 / nS) * (ai === 0 ? 0.55 : 0.45 / (nA - 1));
          const ctrB = 0.012 + R() * 0.01, cpmB = 18 + R() * 20;
          dias.forEach((d, i) => {
            const dd = 14 - i; // dias atrás
            if (ads[aid].st !== 'ACTIVE' && (pausada ? dd < 9 : dd < 4)) return;
            if (cen === 'par' && dd < 4) return;
            if (cen === 'ins' && dd > 1) return;
            if (!meta && k === 16 && dd > 1) return;
            let sp = ref * peso * pesoAd * (0.82 + R() * 0.36) * (i === 14 ? fracHoje : 1);
            if (sp < 0.5) return;
            const t = Math.max(0, 7 - dd) / 7; // piora/melhora concentrada na última semana
            const idx = (cen === 'crit' || cen === 'caro' || cen === 'aten' ? 1 + (IDX[cen] - 1) * (0.35 + 0.65 * t) : IDX[cen] || 1) * (0.9 + R() * 0.2);
            const freq = cansado ? (dd < 7 ? 4.2 + (7 - dd) * 0.08 : 2.2) : 1.05 + R() * 0.3;
            const ctr = cansado && dd < 7 ? ctrB * 0.55 : ctrB;
            const impr = Math.round((sp / cpmB) * 1000);
            const alcance = Math.round(impr / freq);
            const cliques = Math.round(impr * ctr);
            const link = Math.round(cliques * 0.78);
            const metaEf = meta || 15;
            const conv = lead || venda ? 0 : Math.max(0, Math.round(sp / (metaEf * idx)));
            const leads = lead ? Math.max(0, Math.round(sp / (metaEf * 1.8 * idx))) : 0;
            const compras = venda ? Math.max(0, Math.round(sp / (metaEf * 2.4))) : 0;
            const valor = venda ? r2(compras * (180 + R() * 60)) : null;
            linhas.push([i, aid, r2(sp), impr, alcance, cliques, link, leads, conv, compras, valor]);
          });
        }
      }
    }
  });
  return { ok: true, fonte: 'demo', dias, contas, camps, sets, ads, linhas, veReceita: true, escopo: 'todos', atualizadoEm: new Date(agora.getTime() - 3 * 60000).toISOString(), mudancasHora: {}, acoes: { configurado: true } };
}
