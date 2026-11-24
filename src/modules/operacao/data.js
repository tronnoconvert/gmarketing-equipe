// data.js — sementes de Operação: tasks (quadro), deliveries (entregas ao cliente, histórico de 12 semanas + abertas) e projects (marcos).
// Datas relativas a hoje. Invariantes: toda tarefa tem uma entrega 'en-<taskId>'; Grupo Orion tem 3 entregas atrasadas;
// entregas no prazo nas últimas 4 semanas = 91/100 (meta 95%).
import { db } from '../../core/store.js';
import { diaRel, addDias, isoDia, ehUtil, rng, CLIENTES_BASE, utilAntes, utilDepois } from './base.js';

// prazos caem em dias úteis (o de hoje fica hoje)
const prazoIso = d => isoDia(d < 0 ? utilAntes(addDias(d)) : d === 0 ? addDias(0) : utilDepois(addDias(d)));

const agora = Date.now();
const atras = min => new Date(agora - min * 60000).toISOString();
const emDia = (n, h = 10, m = 0) => { const d = addDias(n); d.setHours(h, m, 0, 0); return d.toISOString(); };
const U = t => t.replace('t-', 'u-');

// aprovador padrão: responsável do cliente (se não for a própria pessoa), senão o dono
const aprovadorDe = (clientId, respId) => { const r = (CLIENTES_BASE[clientId] || {}).respId; return r && r !== respId ? r : 't-gabriel'; };

// [id, título, cliente, resp, tipo, status, prazo(dias), estimativa h, extras]
const T = [
  ['tk-01', 'Relatório de performance de outubro', 'c-orion', 't-ana', 'relatorio', 'andamento', -6, 4, { gastas: 2, proj: 'pj-resgate-orion', check: ['Exportar dados do Meta Ads', 'Comparar ROAS com a meta', 'Escrever recomendações'], feitos: 1 }],
  ['tk-02', '6 criativos da campanha de resgate', 'c-orion', 't-carla', 'criativo', 'aprovacao', -4, 10, { gastas: 11, proj: 'pj-resgate-orion', retrabalho: 1, check: ['Briefing com a Ana', '3 estáticos', '3 vídeos curtos', 'Versões para stories'], feitos: 4 }],
  ['tk-03', 'Ajuste de públicos e remarketing', 'c-orion', 't-ana', 'campanha', 'andamento', -2, 5, { gastas: 3, proj: 'pj-resgate-orion', check: ['Excluir compradores dos últimos 30 dias', 'Criar público semelhante 1%', 'Subir remarketing de carrinho'], feitos: 2 }],
  ['tk-04', 'Calendário editorial de dezembro', 'c-bella', 't-bruno', 'post', 'andamento', -3, 6, { gastas: 5, proj: 'pj-verao-bella', retrabalho: 1, check: ['Pautas de Natal', 'Pautas da coleção verão', 'Aprovação do cliente'], feitos: 2 }],
  ['tk-05', 'Roteiro de 4 vídeos curtos', 'c-technova', 't-elisa', 'copy', 'afazer', -5, 6, { check: ['Entender o produto novo', '4 roteiros de 30 s'] }],
  ['tk-06', 'Carrossel de lançamento do blend', 'c-cafe', 't-carla', 'criativo', 'andamento', -1, 4, { gastas: 3, check: ['Fotos do produto', '8 lâminas', 'Legenda'], feitos: 1 }],
  ['tk-07', 'Landing page do check-up', 'c-vida', 't-felipe', 'site', 'aprovacao', 0, 12, { gastas: 12, proj: 'pj-site-vida', check: ['Layout aprovado', 'Formulário integrado', 'Teste no celular', 'Pixel instalado'], feitos: 4 }],
  ['tk-08', 'Revisão de palavras-chave no Google Ads', 'c-autocenter', 't-ana', 'campanha', 'andamento', 0, 3, { gastas: 1.5, check: ['Negativar termos irrelevantes', 'Ajustar lances'], feitos: 1 }],
  ['tk-09', 'Relatório mensal de leads', 'c-alfa', 't-ana', 'relatorio', 'afazer', 2, 3, { check: ['Puxar leads do CRM', 'Custo por lead por campanha'] }],
  ['tk-10', 'Integração formulário → CRM', 'c-alfa', 't-felipe', 'site', 'andamento', 3, 8, { gastas: 4, proj: 'pj-crm-alfa', check: ['Webhook do formulário', 'Mapear campos', 'Teste com lead real'], feitos: 1 }],
  ['tk-11', 'Planejamento de posts de dezembro', 'c-orion', 't-ana', 'post', 'afazer', 4, 5, { proj: 'pj-resgate-orion', check: ['12 pautas', 'Datas comemorativas'] }],
  ['tk-12', 'Briefing de criativos para ofertas', 'c-autocenter', 't-ana', 'criativo', 'afazer', 3, 3, { check: ['Ofertas de revisão', 'Referências visuais'] }],
  ['tk-13', 'Copy dos anúncios de Natal', 'c-orion', 't-ana', 'copy', 'afazer', 7, 4, { proj: 'pj-resgate-orion' }],
  ['tk-14', 'Campanha de pré-lançamento Residencial Aurora', 'c-imob', 't-ana', 'campanha', 'andamento', 5, 8, { gastas: 3, proj: 'pj-aurora-imob', check: ['Estrutura de campanhas', 'Formulário de leads', 'Públicos por região'], feitos: 1 }],
  ['tk-15', 'Posts da semana', 'c-petfeliz', 't-bruno', 'post', 'afazer', 2, 4, { check: ['3 posts no feed', '5 stories'] }],
  ['tk-16', 'Reels de depoimentos de alunos', 'c-studiofit', 't-carla', 'criativo', 'andamento', 4, 6, { gastas: 2, check: ['Selecionar 3 depoimentos', 'Edição', 'Legendas'], feitos: 1 }],
  ['tk-17', 'Relatório de resultados de novembro', 'c-vida', 't-bruno', 'relatorio', 'afazer', 6, 3, {}],
  ['tk-18', 'Pauta da reunião de renovação', 'c-technova', 't-diego', 'reuniao', 'afazer', 1, 2, { proj: 'pj-renov-technova', check: ['Resultados do ano', 'Proposta de escopo 2027'] }],
  ['tk-19', 'Onboarding: checklist de acessos', 'c-otica', 't-diego', 'reuniao', 'andamento', 2, 3, { gastas: 1, proj: 'pj-onb-otica', check: ['Business Manager', 'Google Analytics', 'Instagram', 'Site'], feitos: 2 }],
  ['tk-20', 'Banners da coleção verão', 'c-bella', 't-carla', 'criativo', 'afazer', 5, 8, { proj: 'pj-verao-bella' }],
  ['tk-21', 'Campanha de Black Friday', 'c-petfeliz', 't-ana', 'campanha', 'aprovacao', 1, 6, { gastas: 6, proj: 'pj-bf-pet', check: ['Ofertas', 'Criativos', 'Orçamento diário', 'Agendamento'], feitos: 4 }],
  ['tk-22', 'E-mail marketing do lançamento', 'c-imob', 't-elisa', 'copy', 'afazer', 8, 4, { proj: 'pj-aurora-imob' }],
  ['tk-23', 'Copy da bio e dos destaques', 'c-cafe', 't-elisa', 'copy', 'afazer', 9, 2, {}],
  ['tk-24', 'Ajustes no site (grade de horários)', 'c-studiofit', 't-felipe', 'site', 'afazer', 6, 4, {}],
  ['tk-25', 'Vídeo do apartamento decorado', 'c-alfa', 't-carla', 'criativo', 'afazer', 10, 10, {}],
  ['tk-26', 'Ligação com o decisor', 'c-orion', 't-diego', 'reuniao', 'andamento', 1, 1, { proj: 'pj-resgate-orion' }],
  ['tk-27', 'Relatório de social de novembro', 'c-bella', 't-bruno', 'relatorio', 'aprovacao', 2, 3, { gastas: 3 }],
  ['tk-28', 'Revisão do site no celular', 'c-autocenter', 't-felipe', 'site', 'afazer', 12, 6, {}],
  ['tk-29', 'Teste A/B de criativos (verba de teste)', 'c-orion', 't-ana', 'campanha', 'afazer', 8, 4, { proj: 'pj-resgate-orion' }],
  ['tk-30', 'Posts de novembro (semana 4)', 'c-technova', 't-bruno', 'post', 'andamento', 3, 5, { gastas: 2 }],
  // concluídas nos últimos dias (coluna Feito)
  ['tk-31', 'Criativos de Black Friday', 'c-petfeliz', 't-carla', 'criativo', 'feito', -2, 6, { gastas: 6, conc: -2, proj: 'pj-bf-pet' }],
  ['tk-32', 'Relatório semanal Clínica Vida', 'c-vida', 't-bruno', 'relatorio', 'feito', -1, 2, { gastas: 2, conc: -1 }],
  ['tk-33', 'Ajuste de orçamento Construtora Alfa', 'c-alfa', 't-ana', 'campanha', 'feito', -1, 2, { gastas: 2.5, conc: -1 }],
  ['tk-34', 'Wireframe da página de planos', 'c-studiofit', 't-felipe', 'site', 'feito', -3, 5, { gastas: 5, conc: -3 }],
  ['tk-35', 'Posts de novembro (semana 3)', 'c-cafe', 't-bruno', 'post', 'feito', -4, 4, { gastas: 4, conc: -4 }],
  ['tk-36', 'Kickoff com Ótica Visão', 'c-otica', 't-diego', 'reuniao', 'feito', -5, 2, { gastas: 2, conc: -5, proj: 'pj-onb-otica' }],
  ['tk-37', 'Diagnóstico de contas Grupo Orion', 'c-orion', 't-ana', 'relatorio', 'feito', -5, 4, { gastas: 5, conc: -5, proj: 'pj-resgate-orion' }],
  ['tk-38', 'Anúncios de captação Imob Prime', 'c-imob', 't-carla', 'criativo', 'feito', -2, 4, { gastas: 4, conc: -2 }],
];

// histórico de hoje (minutos atrás) para o feed de atividade
const HIST_HOJE = {
  'tk-02': [[95, 'u-carla', 'enviou para aprovação'], [96, 'u-carla', 'concluiu o checklist "Versões para stories"']],
  'tk-03': [[40, 'u-ana', 'concluiu o checklist "Criar público semelhante 1%"']],
  'tk-07': [[130, 'u-felipe', 'enviou para aprovação']],
  'tk-08': [[25, 'u-ana', 'moveu para Em andamento']],
  'tk-19': [[70, 'u-diego', 'concluiu o checklist "Google Analytics"']],
  'tk-21': [[180, 'u-ana', 'enviou para aprovação']],
  'tk-26': [[55, 'u-diego', 'moveu para Em andamento']],
  'tk-16': [[210, 'u-carla', 'moveu para Em andamento']],
  'tk-10': [[150, 'u-felipe', 'concluiu o checklist "Webhook do formulário"']],
};

const tasks = [], deliveries = [];
T.forEach(([id, titulo, clientId, respId, tipo, status, prazoD, est, x], i) => {
  const criada = Math.min(prazoD - 6, -3) - (i % 4);
  const hist = [{ quando: emDia(criada, 9, 10 + i), quem: 'u-gabriel', oque: `criou a tarefa e atribuiu a ${{ 't-ana': 'Ana Souza', 't-bruno': 'Bruno Lima', 't-felipe': 'Felipe Nunes', 't-carla': 'Carla Dias', 't-diego': 'Diego Melo', 't-elisa': 'Elisa Rocha' }[respId]}` }];
  if (status !== 'afazer') hist.push({ quando: emDia(Math.min(criada + 2, -1), 10, 5), quem: U(respId), oque: 'moveu para Em andamento' });
  if (x.retrabalho) hist.push({ quando: emDia(-2, 16, 20), quem: U(aprovadorDe(clientId, respId)), oque: 'pediu ajuste: "Ajustar a identidade visual ao manual do cliente."' });
  if (status === 'feito') { hist.push({ quando: emDia(x.conc - 1, 15, 0), quem: U(respId), oque: 'enviou para aprovação' }); hist.push({ quando: emDia(x.conc, 11, 30), quem: U(aprovadorDe(clientId, respId)), oque: 'aprovou a entrega' }); }
  (HIST_HOJE[id] || []).forEach(([min, quem, oque]) => hist.push({ quando: atras(min), quem, oque }));
  if (status === 'aprovacao' && !HIST_HOJE[id]) hist.push({ quando: emDia(-1, 17, 40), quem: U(respId), oque: 'enviou para aprovação' });
  hist.sort((a, b) => a.quando.localeCompare(b.quando));
  const check = (x.check || []).map((texto, k) => ({ id: `${id}-c${k + 1}`, texto, feito: k < (x.feitos || 0) || status === 'feito' }));
  const enviada = hist.filter(h => h.oque === 'enviou para aprovação').pop();
  tasks.push({
    id, titulo, clientId, respId, tipo, status, prazo: prazoIso(prazoD), estimativaH: est, horasGastas: x.gastas || 0,
    aprovadorId: aprovadorDe(clientId, respId), checklist: check, retrabalho: x.retrabalho || 0, historico: hist, projetoId: x.proj || null,
    desc: '', prioridade: prazoD < 0 ? 'alta' : 'normal', criadaEm: emDia(criada, 9, 10 + i),
    iniciadaEm: status !== 'afazer' ? emDia(Math.min(criada + 2, -1), 10, 5) : null,
    enviadaAprovEm: status === 'aprovacao' || status === 'feito' ? (enviada ? enviada.quando : emDia(-1, 17, 40)) : null,
    concluidaEm: status === 'feito' ? emDia(x.conc, 11, 30) : null, createdBy: 'u-gabriel',
  });
  deliveries.push({
    id: `en-${id}`, taskId: id, titulo, clientId, respId, tipo, prazo: prazoIso(prazoD), criadaEm: emDia(criada, 9, 0),
    entregueEm: status === 'feito' ? emDia(x.conc, 11, 30) : null, noPrazo: status === 'feito' ? x.conc <= prazoD : null,
    ajustes: x.retrabalho || 0, aprovacaoH: status === 'feito' ? 20 : null, status: status === 'feito' ? 'entregue' : 'pendente',
  });
});

/* ---------- histórico de entregas: 12 janelas de 7 dias (a mais antiga primeiro) ---------- */
const TOT = [24, 26, 22, 25, 27, 23, 26, 24, 25, 26, 24, 25];
const OK = [23, 25, 20, 24, 25, 22, 24, 22, 24, 24, 21, 22];
const PESO = { 'c-orion': 3, 'c-vida': 3, 'c-alfa': 3, 'c-technova': 2, 'c-imob': 2, 'c-bella': 2, 'c-studiofit': 2, 'c-autocenter': 2, 'c-petfeliz': 2, 'c-otica': 1, 'c-cafe': 1 };
const ATRASO = { 'c-orion': 0.95, 'c-bella': 0.75, 'c-technova': 0.6, 'c-cafe': 0.65, 'c-autocenter': 0.5 };
const AJUSTE = { 'c-orion': 0.42, 'c-bella': 0.3, 'c-technova': 0.22, 'c-cafe': 0.2, 'c-autocenter': 0.14 };
const APROV = { 'c-orion': 46, 'c-bella': 38, 'c-technova': 30, 'c-cafe': 26, 'c-autocenter': 22, 'c-vida': 10, 'c-alfa': 14, 'c-imob': 16, 'c-studiofit': 9, 'c-petfeliz': 8, 'c-otica': 18 };
const TIPO_AJ = { criativo: 1.5, copy: 1.3, site: 1.2, post: 1, campanha: 0.8, relatorio: 0.4, reuniao: 0 };
const TIPO_AP = { criativo: 1.1, copy: 1, site: 1.5, post: 0.8, campanha: 0.9, relatorio: 0.5, reuniao: 0.3 };
const TITULOS = {
  criativo: ['Peças para feed', 'Criativos de remarketing', 'Banner do site', 'Arte para stories', 'Vídeo curto para anúncio'],
  campanha: ['Subida de campanha', 'Otimização semanal', 'Campanha de conversão', 'Nova campanha de leads'],
  post: ['Posts da semana', 'Carrossel educativo', 'Stories da semana', 'Calendário quinzenal'],
  copy: ['Copy dos anúncios', 'Roteiro de vídeo', 'E-mail de nutrição', 'Textos da landing page'],
  site: ['Ajuste na landing page', 'Formulário integrado', 'Página de oferta', 'Correção de pixel'],
  relatorio: ['Relatório semanal', 'Relatório mensal', 'Análise de resultados'],
  reuniao: ['Reunião de alinhamento', 'Apresentação de resultados'],
};
const respPorTipo = (tipo, clientId, d) => {
  if (tipo === 'campanha') return 't-ana';
  if (tipo === 'criativo') return 't-carla';
  if (tipo === 'post') return 't-bruno';
  if (tipo === 'copy') return d >= -10 ? 't-bruno' : 't-elisa'; // Elisa de férias
  if (tipo === 'site') return 't-felipe';
  if (tipo === 'reuniao') return 't-diego';
  return (CLIENTES_BASE[clientId] || {}).respId || 't-diego';
};
const r = rng(4242);
const pick = arr => arr[Math.floor(r() * arr.length)];
const clientesPeso = Object.entries(PESO).flatMap(([c, p]) => Array(p).fill(c));
const tiposPeso = ['criativo', 'criativo', 'criativo', 'campanha', 'campanha', 'campanha', 'post', 'post', 'post', 'copy', 'copy', 'site', 'relatorio', 'relatorio', 'reuniao'];
const feitosRecentes = tasks.filter(t => t.status === 'feito').length; // entram na janela mais recente (todas no prazo)
for (let w = 0; w < 12; w++) {
  const k = 11 - w; // 0 = janela mais recente (dias -6..0)
  let total = TOT[w], ok = OK[w];
  if (k === 0) { total -= feitosRecentes; ok -= feitosRecentes; }
  const dias = []; for (let d = -(7 * k + 6); d <= -7 * k; d++) { if (d < 0 && ehUtil(addDias(d))) dias.push(d); }
  const lote = Array.from({ length: total }, () => { const clientId = pick(clientesPeso); return { clientId, tipo: pick(tiposPeso), dia: pick(dias), p: (ATRASO[clientId] || 0.12) + r() * 0.5 }; });
  lote.sort((a, b) => b.p - a.p).forEach((e, j) => { e.atraso = j < total - ok; });
  lote.forEach((e, j) => {
    const resp = respPorTipo(e.tipo, e.clientId, e.dia);
    const atrasoD = e.atraso ? 1 + Math.floor(r() * 4) : 0;
    const prazoD = e.dia - atrasoD - (e.atraso ? 0 : Math.floor(r() * 2) * 0);
    const prazo = isoDia(utilAntes(addDias(prazoD)));
    const pa = (AJUSTE[e.clientId] || 0.06) * (TIPO_AJ[e.tipo] ?? 1);
    const ajustes = r() < pa ? (r() < 0.3 ? 2 : 1) : 0;
    const aprovH = Math.max(1, Math.round((APROV[e.clientId] || 12) * (TIPO_AP[e.tipo] ?? 1) * (0.6 + r() * 0.8) * (1 + ajustes * 0.3)));
    const lead = 3 + Math.floor(r() * 6) + ajustes * 2;
    const ent = addDias(e.dia); ent.setHours(9 + Math.floor(r() * 9), Math.floor(r() * 60), 0, 0);
    deliveries.push({
      id: `en-h${w}-${j}`, taskId: null, titulo: `${pick(TITULOS[e.tipo])}`, clientId: e.clientId, respId: resp, tipo: e.tipo, prazo,
      criadaEm: addDias(e.dia - lead).toISOString(), entregueEm: ent.toISOString(), noPrazo: !e.atraso, ajustes, aprovacaoH: e.tipo === 'reuniao' ? null : aprovH, status: 'entregue',
    });
  });
}

/* ---------- projetos e marcos ---------- */
const M = (id, titulo, d, feito) => ({ id, titulo, data: prazoIso(d), feito: !!feito });
const projects = [
  { id: 'pj-resgate-orion', nome: 'Plano de resgate', clientId: 'c-orion', respId: 't-ana', inicio: diaRel(-10), fim: diaRel(20), marcos: [M('m1', 'Diagnóstico das contas', -7, 1), M('m2', 'Novos criativos aprovados', -2), M('m3', 'Teste com verba nova', 5), M('m4', 'Revisão com o decisor', 14)] },
  { id: 'pj-site-vida', nome: 'Site novo', clientId: 'c-vida', respId: 't-felipe', inicio: diaRel(-40), fim: diaRel(18), marcos: [M('m1', 'Wireframes', -30, 1), M('m2', 'Layout aprovado', -15, 1), M('m3', 'Landing do check-up no ar', 0), M('m4', 'Publicação do site', 18)] },
  { id: 'pj-crm-alfa', nome: 'Integração com CRM', clientId: 'c-alfa', respId: 't-felipe', inicio: diaRel(-20), fim: diaRel(12), marcos: [M('m1', 'Mapeamento do funil', -14, 1), M('m2', 'Formulário → CRM', 3), M('m3', 'Treinamento do time de vendas', 12)] },
  { id: 'pj-verao-bella', nome: 'Coleção verão', clientId: 'c-bella', respId: 't-bruno', inicio: diaRel(-5), fim: diaRel(25), marcos: [M('m1', 'Briefing da coleção', -3, 1), M('m2', 'Banners e peças', 5), M('m3', 'Lançamento', 21)] },
  { id: 'pj-onb-otica', nome: 'Onboarding', clientId: 'c-otica', respId: 't-diego', inicio: diaRel(-12), fim: diaRel(10), marcos: [M('m1', 'Contrato assinado', -12, 1), M('m2', 'Kickoff', -5, 1), M('m3', 'Acessos liberados', -4), M('m4', 'Primeira entrega', 10)] },
  { id: 'pj-bf-pet', nome: 'Black Friday', clientId: 'c-petfeliz', respId: 't-ana', inicio: diaRel(-15), fim: diaRel(4), marcos: [M('m1', 'Estratégia de ofertas', -12, 1), M('m2', 'Criativos', -2, 1), M('m3', 'Campanha no ar', 1)] },
  { id: 'pj-aurora-imob', nome: 'Lançamento Residencial Aurora', clientId: 'c-imob', respId: 't-ana', inicio: diaRel(-8), fim: diaRel(35), marcos: [M('m1', 'Planejamento', -5, 1), M('m2', 'Pré-lançamento no ar', 5), M('m3', 'Evento de lançamento', 30)] },
  { id: 'pj-renov-technova', nome: 'Renovação de contrato', clientId: 'c-technova', respId: 't-diego', inicio: diaRel(-3), fim: diaRel(6), marcos: [M('m1', 'Pauta da reunião', 1), M('m2', 'Reunião de renovação', 5)] },
];

db.seed('tasks', tasks);
db.seed('deliveries', deliveries);
db.seed('projects', projects);

export const SEED = { tasks, deliveries, projects };
