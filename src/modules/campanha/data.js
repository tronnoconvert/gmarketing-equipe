// data.js — semente do módulo Campanha (conta própria de tráfego do dono, Meta Ads via Windsor.ai).
// Coleções: campaignAccount (1 registro 'demo'), campaigns (campanha/conjunto/anúncio), creatives, campaignDaily (90 dias por anúncio).
// campaignDaily usa os MESMOS nomes de campo do conector "facebook" do Windsor.ai, para a troca por dados reais ser direta:
//   date, campaign_id, adset_id, ad_id, spend, impressions, clicks, reach, frequency, actions_lead,
//   actions_onsite_conversion_messaging_conversation_started_7d, actions_purchase, action_values_purchase, actions_post_engagement, actions_video_view
import { db } from '../../core/store.js';

export const F_CONVERSA = 'actions_onsite_conversion_messaging_conversation_started_7d';
// duas contas FICTÍCIAS na demonstração (em produção: CA01 e CA02 · HOF reais, em engine.js)
export const CONTAS_DEMO = [
  { k: 'ca01', id: 'act_1000000001', nome: 'CA01 · Conta demonstração', curto: 'CA01' },
  { k: 'ca02', id: 'act_1000000002', nome: 'CA02 · HOF (demonstração)', curto: 'CA02 · HOF' },
];
export const CONTA_DE = { 'cp-lead-web': 'ca01', 'cp-msg-diag': 'ca01', 'cp-lead-isca': 'ca01', 'cp-rmk-pv': 'ca02', 'cp-vendas-escala': 'ca02', 'cp-engaj': 'ca02' };
const ACT_DE = k => (CONTAS_DEMO.find(c => c.k === k) || CONTAS_DEMO[0]).id;
export const CAMPO_RESULTADO = { lead: 'actions_lead', conversa: F_CONVERSA, compra: 'actions_purchase', engaj: 'actions_post_engagement' };

// gerador pseudoaleatório determinístico (mesmos dados em todo navegador)
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20261124);
const ruido = (a = 0.15) => 1 + (rnd() * 2 - 1) * a;
const r2 = v => Math.round(v * 100) / 100;
const pois = v => { const b = Math.floor(v); return b + (rnd() < v - b ? 1 : 0); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// [id, nome, tipo, status, conjuntos:[id, nome, orçamento/dia, status, anúncios:[id, nome, formato, cpm, ctr%, conv/clique, hook, inicio(dias atrás), fadiga, cores, título, texto, cta]]]
const ESTRUTURA = [
  ['cp-lead-web', '[LEAD] Webinar Tráfego que Vende', 'lead', 'ativo', [
    ['cj-lw-int', 'Interesses · marketing e agências 25–45', 220, 'ativo', [
      ['ad-01', 'Vídeo · 3 erros que travam sua agência', 'video', 32, 1.45, 0.205, 0.34, 40, 0.55, ['#0B6BE8', '#7C5CFC'], '3 erros que travam sua agência', 'Aula gratuita e ao vivo: o que muda quando o tráfego vira processo.', 'Inscrever-se'],
      ['ad-02', 'Vídeo · Depoimento Renata (antigo)', 'video', 30, 1.55, 0.2, 0.29, 90, 1.05, ['#C2410C', '#F59E0B'], 'De 3 para 11 clientes em 6 meses', 'Depoimento de aluna da turma de junho.', 'Inscrever-se'],
      ['ad-03', 'Imagem · Aula gratuita 10/12', 'imagem', 34, 1.05, 0.22, 0, 26, 0.35, ['#0F766E', '#14B8A6'], 'Aula gratuita · 10/12 às 20h', 'Vagas limitadas na sala ao vivo.', 'Inscrever-se'],
    ]],
    ['cj-lw-lal', 'Lookalike 1% · compradores', 180, 'ativo', [
      ['ad-04', 'Carrossel · 5 slides do método', 'carrossel', 29, 1.7, 0.42, 0, 30, 0.3, ['#4F46E5', '#06B6D4'], 'O método em 5 slides', 'Arraste para ver o passo a passo que usamos com 40 clientes.', 'Inscrever-se'],
      ['ad-05', 'Vídeo · Convite do Gabriel', 'video', 31, 1.3, 0.21, 0.31, 30, 0.4, ['#1E293B', '#0B6BE8'], 'Te espero ao vivo', 'Convite de 30 segundos para a aula.', 'Inscrever-se'],
    ]],
  ]],
  ['cp-msg-diag', '[MSG] Diagnóstico gratuito', 'conversa', 'ativo', [
    ['cj-md-donos', 'Donos de agência · 25–45', 150, 'ativo', [
      ['ad-06', 'Vídeo · Diagnóstico em 15 min', 'video', 38, 1.25, 0.075, 0.3, 75, 0.45, ['#047857', '#34D399'], 'Diagnóstico gratuito em 15 min', 'Chame no WhatsApp e receba um raio-x da sua operação.', 'Enviar mensagem'],
      ['ad-07', 'Imagem · Sua agência dá lucro?', 'imagem', 36, 0.95, 0.08, 0, 60, 0.5, ['#B45309', '#FBBF24'], 'Sua agência dá lucro?', 'Descubra em uma conversa rápida.', 'Enviar mensagem'],
    ]],
    ['cj-md-adv', 'Advantage+ · público amplo', 120, 'ativo', [
      ['ad-08', 'Carrossel · Antes e depois de clientes', 'carrossel', 27, 1.15, 0.07, 0, 50, 0.4, ['#7C3AED', '#EC4899'], 'Antes e depois', 'Resultados reais de clientes (com autorização).', 'Enviar mensagem'],
      ['ad-09', 'Imagem · Agenda aberta', 'imagem', 28, 0.7, 0.055, 0, 50, 0.6, ['#475569', '#94A3B8'], 'Agenda aberta para diagnósticos', 'Poucos horários nesta semana.', 'Enviar mensagem'],
    ]],
  ]],
  ['cp-rmk-pv', '[REMARKETING] Página de vendas', 'compra', 'ativo', [
    ['cj-rk-vis', 'Visitantes da página · 30 dias', 90, 'ativo', [
      ['ad-10', 'Vídeo · Últimas vagas', 'video', 62, 1.9, 0.034, 0.38, 60, 1.6, ['#B91C1C', '#F97316'], 'Últimas vagas do lote', 'O bônus de implementação acaba domingo.', 'Comprar agora'],
      ['ad-11', 'Imagem · Bônus do lote', 'imagem', 58, 1.4, 0.03, 0, 45, 1.2, ['#0E7490', '#22D3EE'], 'Bônus: 3 meses de mentoria', 'Só para quem entrar neste lote.', 'Comprar agora'],
    ]],
    ['cj-rk-eng', 'Engajados Instagram · 60 dias', 60, 'ativo', [
      ['ad-12', 'Carrossel · Perguntas frequentes', 'carrossel', 48, 1.2, 0.026, 0, 45, 0.9, ['#1D4ED8', '#93C5FD'], 'Ficou com dúvida?', '7 respostas antes de você entrar no programa.', 'Saiba mais'],
    ]],
  ]],
  ['cp-vendas-escala', '[VENDAS] Programa Escala 12 meses', 'compra', 'ativo', [
    ['cj-vd-quente', 'Lista quente + Lookalike 2%', 160, 'ativo', [
      ['ad-13', 'Vídeo · Aula de 7 min (método completo)', 'video', 41, 1.35, 0.024, 0.36, 60, 0.45, ['#0B6BE8', '#22C55E'], 'O método completo em 7 min', 'Assista e decida se o programa é para você.', 'Comprar agora'],
      ['ad-14', 'Imagem · Oferta Escala 12 meses', 'imagem', 44, 1.0, 0.02, 0, 60, 0.5, ['#111827', '#F59E0B'], 'Escala 12 meses', '12x de R$ 199,70 · garantia de 15 dias.', 'Comprar agora'],
    ]],
    ['cj-vd-amplo', 'Público amplo · Advantage+', 140, 'ativo', [
      ['ad-15', 'Vídeo · Case: de 4 para 18 clientes', 'video', 30, 0.85, 0.0014, 0.27, 40, 0.5, ['#9333EA', '#F472B6'], 'De 4 para 18 clientes', 'Como a agência do Paulo dobrou de tamanho.', 'Comprar agora'],
    ]],
  ]],
  ['cp-engaj', '[ENGAJ] Conteúdo', 'engaj', 'ativo', [
    ['cj-en-seg', 'Seguidores + semelhantes', 40, 'ativo', [
      ['ad-16', 'Reels · Bastidores da agência', 'video', 9, 2.4, 3.2, 0.41, 90, 0.35, ['#DB2777', '#F59E0B'], 'Bastidores', 'Um dia na rotina da equipe.', 'Ver perfil'],
      ['ad-17', 'Carrossel · Checklist de onboarding', 'carrossel', 11, 1.9, 2.6, 0, 70, 0.3, ['#0891B2', '#A78BFA'], 'Checklist de onboarding', 'Salve para usar com o próximo cliente.', 'Ver perfil'],
    ]],
  ]],
  ['cp-lead-isca', '[LEAD] Isca · Planilha de precificação', 'lead', 'pausado', [
    ['cj-li-int', 'Interesses · freelancers e agências', 80, 'pausado', [
      ['ad-18', 'Imagem · Planilha grátis', 'imagem', 26, 1.2, 0.18, 0, 90, 0.6, ['#15803D', '#86EFAC'], 'Planilha de precificação grátis', 'Calcule o preço certo do seu serviço.', 'Baixar'],
      ['ad-19', 'Vídeo · Como precificar em 3 passos', 'video', 27, 1.1, 0.17, 0.28, 90, 0.6, ['#1E3A8A', '#60A5FA'], 'Precifique em 3 passos', 'Tutorial rápido + planilha.', 'Baixar'],
    ]],
  ]],
];
const PAUSADA_HA = 20; // a isca foi pausada há 20 dias
const TICKET = { 'cp-rmk-pv': 1997, 'cp-vendas-escala': 1997 };
// sinais da última semana para o motor de recomendações (src/shared/motor-recs.js):
// anúncios que cansaram de repente (CTR despenca e frequência sobe), conjunto com CPM mais caro e conjunto em aprendizado limitado
const CHOQUE = { 'ad-02': { ctr: 0.55, freq: 0.5 }, 'ad-10': { ctr: 0.6, freq: 0.3 }, 'ad-11': { ctr: 0.62, freq: 0.9 } };
const CPM_ALTA = { 'cj-md-adv': 1.55 };
const APRENDIZADO = { 'cj-rk-eng': 'limitado' };

const CAMPAIGNS = [], CREATIVES = [], DAILY = [];
const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
const DIAS = 90;
ESTRUTURA.forEach(([cid, cnome, tipo, cst, conjuntos]) => {
  const ct = CONTA_DE[cid];
  CAMPAIGNS.push({ id: cid, nivel: 'campanha', nome: cnome, tipo, status: cst, campanhaId: cid, conta: ct });
  conjuntos.forEach(([sid, snome, orc, sst, ads]) => {
    CAMPAIGNS.push({ id: sid, nivel: 'conjunto', nome: snome, paiId: cid, campanhaId: cid, conta: ct, tipo, status: sst, orcamentoDia: orc, ...(APRENDIZADO[sid] ? { aprendizado: APRENDIZADO[sid] } : {}) });
    const peso = ads.map((a, i) => 1 + (ads.length - i) * 0.15);
    ads.forEach(([aid, anome, formato, cpm, ctr, conv, hook, inicio, fadiga, cores, titulo, texto, cta], k) => {
      CAMPAIGNS.push({ id: aid, nivel: 'anuncio', nome: anome, paiId: sid, campanhaId: cid, conta: ct, tipo, status: sst === 'pausado' ? 'pausado' : 'ativo', criativoId: `cr-${aid}` });
      CREATIVES.push({ id: `cr-${aid}`, anuncioId: aid, nome: anome, formato, cores, titulo, texto, cta });
      for (let d = DIAS; d >= 1; d--) {
        const idade = inicio - d; if (idade < 0) continue; // ainda não existia
        if (sst === 'pausado' && d <= PAUSADA_HA) continue;
        const dt = new Date(hoje); dt.setDate(dt.getDate() - d);
        const fds = [0, 6].includes(dt.getDay()) ? 0.86 : 1;
        // o melhor conjunto melhora na última semana; o amplo de vendas piora
        const tend = sid === 'cj-lw-lal' && d <= 9 ? 1.18 : sid === 'cj-vd-amplo' && d <= 14 ? 0.8 : 1;
        const vivos = ads.filter(a => a[7] - d >= 0).length || 1;
        const share = peso[k] / ads.filter(a => a[7] - d >= 0).reduce((s, a) => s + peso[ads.indexOf(a)], 0);
        const spend = r2(orc * share * fds * ruido(0.12) * (vivos ? 1 : 0));
        const ch = CHOQUE[aid] && d <= 7 ? CHOQUE[aid] : null; const cpmF = CPM_ALTA[sid] && d <= 7 ? CPM_ALTA[sid] : 1;
        const frequency = r2((Math.min(6.5, 1.08 + (idade / 30) * fadiga) + (ch ? ch.freq : 0)) * ruido(0.04));
        const impressions = Math.round((spend / (cpm * cpmF * (1 + (frequency - 1.1) * 0.06))) * 1000 * ruido(0.06));
        const ctrD = Math.max(0.2, ctr * (1 - Math.max(0, frequency - 1.6) * 0.11) * ruido(0.1) * (tend > 1 ? 1.06 : 1)) * (ch ? ch.ctr : 1) / 100;
        const clicks = Math.round(impressions * ctrD);
        const row = { id: `cd-${aid}-${d}`, conta: ct, account_id: ACT_DE(ct), date: iso(dt), campaign_id: cid, adset_id: sid, ad_id: aid, spend, impressions, clicks, reach: Math.round(impressions / frequency), frequency };
        const convD = conv * tend * (1 - Math.max(0, frequency - 2.2) * 0.12) * ruido(0.18);
        if (tipo === 'engaj') row.actions_post_engagement = Math.round(impressions * (conv / 100) * ruido(0.15));
        else if (tipo === 'lead') row.actions_lead = pois(clicks * convD);
        else if (tipo === 'conversa') row[F_CONVERSA] = pois(clicks * convD);
        else { const c = pois(clicks * convD); row.actions_purchase = c; row.action_values_purchase = c * TICKET[cid]; }
        if (formato === 'video') row.actions_video_view = Math.round(impressions * hook * ruido(0.08) * (1 - Math.max(0, frequency - 2) * 0.05));
        DAILY.push(row);
      }
    });
  });
});

const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
export const CONTA_DEMO = {
  id: 'demo', nome: 'Conta própria (demonstração)', plataforma: 'Meta Ads', fonte: 'Windsor.ai', accountId: null, conectada: false,
  ultimaSync: new Date(Math.min(hoje.getTime() + 6 * 3600e3 + 12 * 60e3, Date.now() - 47 * 60e3)).toISOString(), moeda: 'BRL', fuso: 'America/Sao_Paulo',
  metas: { lead: 9, conversa: 45, compra: 300, engaj: 0.3, roas: 3 },
  // distribuição do período por quebra (Windsor: publisher_platform/platform_position, age/gender, device_platform)
  quebras: {
    posicionamento: [['Feed do Instagram', 0.34, 0.92, 1.1], ['Stories do Instagram', 0.22, 1.08, 0.85], ['Reels do Instagram', 0.18, 0.84, 1.25], ['Feed do Facebook', 0.16, 1.15, 0.9], ['Audience Network', 0.04, 1.9, 0.55], ['Messenger e outros', 0.06, 1.35, 0.7]],
    idade: [['18–24', 0.07, 1.7, 0.8], ['25–34', 0.36, 0.9, 1.1], ['35–44', 0.33, 0.86, 1.08], ['45–54', 0.16, 1.12, 0.92], ['55+', 0.08, 1.5, 0.7]],
    genero: [['Mulheres', 0.47, 0.95], ['Homens', 0.51, 1.04], ['Não informado', 0.02, 1.2]],
    dispositivo: [['Celular (Android)', 0.48, 1.04, 0.96], ['Celular (iOS)', 0.41, 0.9, 1.08], ['Computador', 0.09, 1.25, 0.9], ['Tablet', 0.02, 1.4, 0.8]],
  },
  decisoes: {}, ultimoDia: iso(ontem),
};

db.seed('campaignAccount', [CONTA_DEMO]);
db.seed('campaigns', CAMPAIGNS);
db.seed('creatives', CREATIVES);
db.seed('campaignDaily', DAILY);

// recsLog — registro de aprendizado do motor de recomendações (decisões dos últimos 30 dias, com o resultado medido 7 dias depois).
// Histórico ILUSTRATIVO para a aba "Regras da IA" mostrar taxa de aceite e de acerto por regra.
// [regraId, alvo {nivel,id,nome}, dias atrás, decisão, métrica, antes, depois]
const NOMES = Object.fromEntries(CAMPAIGNS.map(c => [c.id, c]));
const LOG = [
  ['escalar-verba', 'cj-md-donos', 27, 'aceita', 'resultados', 31, 38],
  ['escalar-verba', 'cj-vd-quente', 22, 'aceita', 'resultados', 9, 11],
  ['escalar-verba', 'cj-lw-int', 18, 'aceita', 'resultados', 142, 139],
  ['escalar-verba', 'cj-md-adv', 12, 'aceita', 'resultados', 24, 29],
  ['escalar-verba', 'cj-en-seg', 4, 'adiada'],
  ['reduzir-verba', 'cj-rk-eng', 25, 'aceita', 'custo', 410, 288],
  ['reduzir-verba', 'cj-md-adv', 16, 'aceita', 'custo', 71.4, 52.9],
  ['reduzir-verba', 'cj-lw-int', 9, 'recusada'],
  ['pausar-anuncio', 'ad-05', 26, 'aceita', 'custo', 8.9, 7.6],
  ['pausar-anuncio', 'ad-09', 20, 'aceita', 'custo', 49.8, 44.1],
  ['pausar-anuncio', 'ad-14', 15, 'aceita', 'custo', 318, 335],
  ['pausar-anuncio', 'ad-17', 10, 'aceita', 'custo', 0.31, 0.27],
  ['trocar-criativo', 'cj-vd-quente', 21, 'aceita', 'ctr', 0.92, 1.31],
  ['trocar-criativo', 'cj-md-donos', 6, 'adiada'],
  ['revisar-publico', 'cj-lw-int', 19, 'aceita', 'cpm', 31.2, 34.8],
  ['revisar-publico', 'cj-en-seg', 8, 'recusada'],
  ['aprendizado-limitado', 'cj-vd-amplo', 14, 'recusada'],
  ['conta-parada', 'demo', 23, 'aceita', 'gasto', 0, 812],
];
const ALVO_CUSTO = { lead: 9, conversa: 45, compra: 300 };
const RECS_LOG = LOG.map(([regraId, alvoId, atras, decisao, metrica, antes, depois], i) => {
  const e = NOMES[alvoId]; const quando = new Date(hoje.getTime() - atras * 864e5 + (9 + (i % 8)) * 3600e3 + i * 7 * 60e3);
  const alvo = e ? { nivel: e.nivel, id: e.id, nome: e.nome, campanhaId: e.campanhaId, conjuntoId: e.nivel === 'anuncio' ? e.paiId : e.nivel === 'conjunto' ? e.id : null } : { nivel: 'conta', id: 'demo', nome: 'Conta própria', campanhaId: null, conjuntoId: null };
  const avaliarEm = decisao === 'aceita' ? new Date(quando.getTime() + 7 * 864e5).toISOString() : null;
  const melhorou = metrica ? (['custo', 'cpm'].includes(metrica) ? depois < antes : depois > antes) : null;
  return {
    id: `rl-demo-${i + 1}`, recId: `${regraId}:${alvoId}@${iso(quando)}`, regraId, decisao, quem: 'u-gabriel', quando: quando.toISOString(), alvo, origem: 'campanha', contaId: 'demo', demo: true,
    antes: metrica ? { [metrica]: antes } : null, alvoCusto: e ? ALVO_CUSTO[e.tipo] || null : null, avaliarEm,
    resultado: metrica && decisao === 'aceita' ? { metrica, antes, depois, melhorou, avaliadoEm: avaliarEm } : null,
  };
});
db.seed('recsLog', RECS_LOG);
