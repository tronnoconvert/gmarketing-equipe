// data.js — sementes de Equipe: teamStats (ocupação/histórico/projeção/carteira/PDI/feedbacks/SLA por pessoa — complementa `team` do core
// sem alterá-lo, chave teamId), timeEntries (8 semanas), goals (metas/OKRs), checkins (check-in diário) e oneOnOnes (1:1).
import { db } from '../../core/store.js';
import { addDias, isoDia, ehUtil, rng, diaRel } from '../operacao/base.js';

const agora = Date.now();
const atras = min => new Date(agora - min * 60000).toISOString();
const emDia = (n, h = 10, m = 0) => { const d = addDias(n); d.setHours(h, m, 0, 0); return d.toISOString(); };

// [teamId, util. diária, carteira [[clientId, horas contratadas/mês, fator real]]]
const CART = {
  't-ana': [1.12, [['c-orion', 40, 1.32], ['c-alfa', 32, 0.92], ['c-autocenter', 20, 1.16], ['c-imob', 24, 1.0], ['c-petfeliz', 16, 0.95], ['c-vida', 12, 0.9], ['c-bella', 12, 1.05]]],
  't-bruno': [0.97, [['c-vida', 24, 0.9], ['c-technova', 30, 1.06], ['c-bella', 28, 1.18], ['c-cafe', 20, 1.14], ['c-petfeliz', 16, 0.95], ['c-orion', 14, 1.0]]],
  't-felipe': [0.9, [['c-vida', 40, 1.02], ['c-alfa', 30, 0.95], ['c-studiofit', 16, 0.9], ['c-autocenter', 12, 0.8]]],
  't-carla': [0.84, [['c-orion', 28, 1.22], ['c-bella', 20, 1.1], ['c-studiofit', 18, 0.9], ['c-cafe', 12, 1.0], ['c-petfeliz', 16, 0.95], ['c-alfa', 20, 0.85], ['c-imob', 12, 1.0]]],
  't-diego': [0.8, [['c-imob', 16, 0.9], ['c-studiofit', 16, 0.85], ['c-petfeliz', 14, 0.8], ['c-otica', 24, 1.0], ['c-technova', 12, 1.05], ['c-orion', 10, 1.2]]],
  't-elisa': [0.72, [['c-technova', 16, 0.9], ['c-imob', 16, 0.8], ['c-orion', 14, 1.0], ['c-cafe', 10, 0.8], ['c-bella', 12, 0.9]]],
};
const OCUP = {
  't-ana': [118, [92, 95, 98, 96, 99, 97, 94, 98, 99, 104, 109, 118], [112, 104, 96, 90]],
  't-bruno': [96, [84, 86, 88, 90, 87, 89, 92, 90, 94, 93, 95, 96], [92, 88, 84, 84]],
  't-felipe': [88, [80, 82, 85, 84, 86, 88, 85, 87, 86, 88, 90, 88], [90, 86, 80, 78]],
  't-carla': [82, [78, 80, 79, 83, 81, 84, 82, 80, 83, 85, 84, 82], [78, 84, 88, 80]],
  't-diego': [74, [70, 72, 71, 74, 73, 72, 75, 74, 73, 76, 74, 74], [76, 72, 70, 70]],
  't-elisa': [58, [72, 70, 74, 75, 73, 71, 70, 68, 66, 64, 61, 58], [62, 64, 66, 68]],
};
const PDI = {
  't-ana': [['Estratégia de mídia', 4, 5], ['Análise de dados', 4, 5], ['Comunicação com o cliente', 3, 4], ['Gestão do tempo e delegação', 2, 4], ['Liderança', 2, 3]],
  't-bruno': [['Planejamento de conteúdo', 4, 5], ['Relacionamento com o cliente', 4, 5], ['Análise de métricas de social', 3, 4], ['Negociação', 2, 3]],
  't-felipe': [['Desenvolvimento front-end', 5, 5], ['Integrações e automações', 4, 5], ['Comunicação de prazos', 3, 4], ['Documentação', 2, 4]],
  't-carla': [['Direção de arte', 4, 5], ['Motion design', 2, 4], ['Entendimento de briefing', 3, 4], ['Organização de arquivos', 3, 4]],
  't-diego': [['Atendimento e CS', 4, 5], ['Onboarding de clientes', 4, 4], ['Leitura de resultados', 2, 4], ['Negociação de renovação', 3, 4]],
  't-elisa': [['Copy para anúncios', 4, 5], ['Roteiro de vídeo', 3, 4], ['E-mail marketing', 3, 4], ['Pesquisa de público', 2, 4]],
};
const FB = {
  't-ana': [['cliente', null, 'Construtora Alfa: "A Ana entendeu nosso funil melhor que a gente. Custo por lead caiu 18%."', -9], ['elogio', 'u-carla', 'Briefings muito claros nos criativos do Orion, facilitou demais.', -4], ['feedback', 'u-gabriel', 'Excelente leitura de dados. Ponto de atenção: avisar antes quando a carga passar de 100%.', -14]],
  't-bruno': [['cliente', null, 'Clínica Vida: "O Bruno é rápido e sempre traz ideias novas."', -6], ['feedback', 'u-gabriel', 'Ótima renovação da Clínica Vida. Vamos trabalhar previsibilidade no calendário da Bella Moda.', -21]],
  't-felipe': [['elogio', 'u-ana', 'A integração do formulário da Alfa vai salvar horas de trabalho manual!', -3], ['feedback', 'u-gabriel', 'Qualidade técnica excelente. Comunicar riscos de prazo mais cedo.', -20]],
  't-carla': [['cliente', null, 'Pet Feliz: "Os criativos de Black Friday ficaram lindos!"', -2], ['feedback', 'u-gabriel', 'Criatividade em alta; foco em reduzir rodadas de ajuste no Orion.', -16]],
  't-diego': [['elogio', 'u-bruno', 'Kickoff da Ótica Visão super organizado.', -5], ['cliente', null, 'Imob Prime: "Atendimento impecável, sempre responde rápido."', -11]],
  't-elisa': [['elogio', 'u-bruno', 'As copies do Café Raiz bombaram no engajamento.', -18], ['feedback', 'u-gabriel', 'Ótimo texto. Vamos combinar a cobertura das tarefas antes das próximas férias.', -10]],
};
const SLA = {
  't-bruno': { mediaH: 1.4, dentroPct: 91, serie: [1.8, 1.7, 1.6, 1.9, 1.5, 1.4, 1.6, 1.3, 1.5, 1.4, 1.2, 1.4] },
  't-diego': { mediaH: 1.9, dentroPct: 84, serie: [2.6, 2.4, 2.5, 2.2, 2.3, 2.1, 2.0, 2.2, 1.9, 2.0, 1.8, 1.9] },
};

const teamStats = Object.keys(CART).map(tid => {
  const [util, cart] = CART[tid]; const [oc, hist, proj] = OCUP[tid];
  return {
    id: `ts-${tid.slice(2)}`, teamId: tid, ocupacao: oc, historico: hist, projecao: proj, ajusteH: 0, utilDia: util,
    carteira: cart.map(([clientId, horasContratadas]) => ({ clientId, horasContratadas })),
    pdi: (PDI[tid] || []).map(([comp, nivel, alvo], i) => ({ id: `pdi-${i + 1}`, comp, nivel, alvo })),
    feedbacks: (FB[tid] || []).map(([tipo, de, texto, d], i) => ({ id: `fb-${tid.slice(2)}-${i + 1}`, tipo, de, texto, quando: emDia(d, 15, 10) })),
    sla: SLA[tid] || null,
  };
});
teamStats.push({
  id: 'ts-agencia', teamId: null, agencia: true, slaMetaH: 2,
  slaSerie: [2.2, 2.0, 2.0, 2.0, 1.9, 1.7, 1.8, 1.7, 1.7, 1.7, 1.5, 1.6],
  slaPorCliente: [['c-orion', 2.6, 71], ['c-bella', 2.3, 78], ['c-technova', 1.9, 86], ['c-cafe', 2.1, 82], ['c-vida', 1.1, 97], ['c-alfa', 1.3, 95], ['c-imob', 1.5, 92], ['c-studiofit', 1.2, 96], ['c-autocenter', 1.8, 88], ['c-petfeliz', 0.9, 98], ['c-otica', 1.6, 90]].map(([clientId, mediaH, dentroPct]) => ({ clientId, mediaH, dentroPct })),
});

/* ---------- lançamentos de horas (8 semanas, dias úteis até ontem) ---------- */
const DESC = {
  't-ana': ['Otimização de campanhas', 'Análise de métricas', 'Ajuste de públicos', 'Relatório de performance', 'Reunião com o cliente'],
  't-bruno': ['Produção de posts', 'Planejamento de conteúdo', 'Atendimento ao cliente', 'Aprovação com o cliente', 'Relatório de social'],
  't-felipe': ['Desenvolvimento', 'Integração', 'Correções no site', 'Testes e publicação'],
  't-carla': ['Criação de peças', 'Edição de vídeo', 'Ajustes de arte', 'Direção de arte'],
  't-diego': ['Atendimento', 'Reunião de alinhamento', 'Onboarding', 'Follow-up com o cliente'],
  't-elisa': ['Copy de anúncios', 'Roteiros', 'E-mail marketing', 'Revisão de textos'],
};
const INTERNO = ['Reunião interna', 'Processos e organização', 'Treinamento', 'Planejamento da semana'];
const r = rng(777);
const timeEntries = [];
const ferias = { 't-elisa': [-7, 4] };
for (const tid of Object.keys(CART)) {
  const [util, cart] = CART[tid];
  const acc = {}; let n = 0;
  const flush = (dia, forcar) => {
    for (const k of Object.keys(acc)) {
      const h = Math.round(acc[k] * 2) / 2;
      if (h >= (forcar ? 0.5 : 1.5)) {
        const interno = k === '_';
        timeEntries.push({ id: `te-${tid.slice(2)}-${++n}`, teamId: tid, clientId: interno ? null : k, data: isoDia(dia), horas: h, faturavel: !interno, desc: interno ? INTERNO[n % INTERNO.length] : DESC[tid][n % DESC[tid].length] });
        acc[k] -= h;
      }
    }
  };
  for (let d = -56; d <= -1; d++) {
    const dia = addDias(d); if (!ehUtil(dia)) continue;
    const f = ferias[tid]; if (f && d >= f[0] && d <= f[1]) continue;
    const total = 8 * util * (0.9 + r() * 0.2);
    let cli = 0;
    for (const [c, h, fator] of cart) { const v = (h / 21) * fator * (0.85 + r() * 0.3); acc[c] = (acc[c] || 0) + v; cli += v; }
    acc._ = (acc._ || 0) + Math.max(0.3, total - cli);
    flush(dia, dia.getDay() === 5 || d === -1);
  }
}

/* ---------- metas / OKRs ---------- */
const G = (id, teamId, titulo, tipo, inicio, atual, alvo, unidade, prazoD, kr) => ({ id, teamId, titulo, tipo, inicio, atual, alvo, unidade, prazo: diaRel(prazoD), kr: kr || '' });
const goals = [
  G('g-ana-1', 't-ana', 'ROAS médio da carteira de tráfego', 'okr', 2.4, 2.7, 3.2, 'x', 37, 'Objetivo: recuperar resultado dos clientes de tráfego'),
  G('g-ana-2', 't-ana', 'Certificação Google Ads (Search + Performance Max)', 'meta', 0, 50, 100, '%', 50),
  G('g-ana-3', 't-ana', 'Horas extras por semana', 'meta', 8, 6, 2, 'h', 30, 'Delegar relatórios e briefings'),
  G('g-bruno-1', 't-bruno', 'Health médio dos clientes de social', 'okr', 68, 72, 78, 'pts', 37, 'Objetivo: encantar os clientes de social'),
  G('g-bruno-2', 't-bruno', 'Calendários editoriais entregues até o dia 25', 'meta', 0, 2, 3, 'meses', 37),
  G('g-felipe-1', 't-felipe', 'Site novo da Clínica Vida publicado', 'okr', 0, 70, 100, '%', 18, 'Objetivo: entregar os projetos de site no prazo'),
  G('g-felipe-2', 't-felipe', 'Relatórios automatizados', 'meta', 0, 1, 3, 'relatórios', 60),
  G('g-carla-1', 't-carla', 'Aprovação na 1ª tentativa', 'okr', 64, 72, 80, '%', 37, 'Objetivo: menos retrabalho nos criativos'),
  G('g-carla-2', 't-carla', 'Curso de motion design', 'meta', 0, 40, 100, '%', 60),
  G('g-diego-1', 't-diego', 'SLA de 1ª resposta', 'okr', 2.6, 1.9, 2, 'h', 37, 'Objetivo: responder o cliente em menos de 2 h úteis'),
  G('g-diego-2', 't-diego', 'Onboardings concluídos em até 15 dias', 'meta', 0, 2, 4, 'clientes', 60),
  G('g-elisa-1', 't-elisa', 'Roteiros de vídeo no trimestre', 'okr', 0, 9, 20, 'roteiros', 37, 'Objetivo: ampliar a produção de vídeo'),
  G('g-elisa-2', 't-elisa', 'Biblioteca de copies por segmento', 'meta', 0, 30, 100, '%', 60),
];

/* ---------- check-ins diários ---------- */
const C = (id, teamId, quando, data, fiz, farei, bloqueios) => ({ id, teamId, quando, data, fiz, farei, bloqueios });
const checkins = [
  C('ck-ana-0', 't-ana', atras(150), diaRel(0), 'Ajustei públicos do Grupo Orion e revisei palavras-chave do Auto Center.', 'Fechar o relatório de outubro do Orion (atrasado) e subir o teste A/B.', 'Aguardando o cliente aprovar os 6 criativos do Orion.'),
  C('ck-bruno-0', 't-bruno', atras(170), diaRel(0), 'Aprovei os posts da TechNova e respondi a Clínica Vida.', 'Calendário de dezembro da Bella Moda.', ''),
  C('ck-felipe-0', 't-felipe', atras(200), diaRel(0), 'Landing do check-up enviada para aprovação.', 'Integração do formulário da Alfa com o CRM.', 'Esperando acesso de administrador ao CRM da Construtora Alfa.'),
  C('ck-diego-0', 't-diego', atras(120), diaRel(0), 'Checklist de acessos da Ótica Visão (2 de 4).', 'Ligar para o decisor do Grupo Orion e montar a pauta da TechNova.', ''),
  C('ck-ana-1', 't-ana', emDia(-1, 9, 5), diaRel(-1), 'Ajuste de orçamento da Construtora Alfa.', 'Públicos do Orion.', 'Muitas demandas em paralelo — preciso de ajuda com relatórios.'),
  C('ck-bruno-1', 't-bruno', emDia(-1, 9, 20), diaRel(-1), 'Relatório semanal da Clínica Vida.', 'Posts da TechNova.', ''),
  C('ck-carla-1', 't-carla', emDia(-1, 9, 40), diaRel(-1), 'Criativos do Imob Prime aprovados.', 'Carrossel do Café Raiz.', 'Amanhã estarei fora (consulta médica), volto quarta.'),
  C('ck-felipe-1', 't-felipe', emDia(-1, 8, 55), diaRel(-1), 'Testes da landing no celular.', 'Enviar landing para aprovação.', ''),
  C('ck-diego-1', 't-diego', emDia(-1, 9, 15), diaRel(-1), 'Follow-up com Pet Feliz.', 'Acessos da Ótica Visão.', 'Cliente Ótica Visão ainda não liberou o Business Manager.'),
];

/* ---------- 1:1 ---------- */
const O = (id, teamId, d, notas, combinados, humor) => ({ id, teamId, gestorId: 't-gabriel', data: diaRel(d), notas, humor, combinados: combinados.map(([texto, feito], i) => ({ id: `${id}-k${i + 1}`, texto, feito })) });
const oneOnOnes = [
  O('oo-ana-1', 't-ana', -7, 'Ana relatou cansaço com o volume do Grupo Orion e da Black Friday. Terceira semana acima de 100%.', [['Passar os relatórios mensais para o Diego', false], ['Bloquear 2 h por dia sem reuniões', true], ['Rever escopo do Orion com o Gabriel', false]], 'cansada'),
  O('oo-ana-2', 't-ana', -21, 'Certificação Google Ads em andamento. Quer liderar o time de tráfego em 2027.', [['Reservar 3 h/semana para estudo', true], ['Definir PDI de liderança', true]], 'bem'),
  O('oo-bruno-1', 't-bruno', -10, 'Renovação da Clínica Vida encaminhada. Bella Moda pede muitos ajustes.', [['Alinhar fluxo de aprovação com a Bella Moda', false], ['Testar formato de carrossel educativo', true]], 'bem'),
  O('oo-felipe-1', 't-felipe', -12, 'Projeto do site da Clínica Vida no prazo. Pediu acesso a um ambiente de testes.', [['Contratar ambiente de homologação', true], ['Documentar a integração do CRM', false]], 'bem'),
  O('oo-carla-1', 't-carla', -9, 'Muitas rodadas de ajuste no Orion. Combinamos briefing mais fechado com a Ana.', [['Checklist de briefing antes de começar', true], ['Mostrar rascunho antes da arte final', false]], 'ok'),
  O('oo-diego-1', 't-diego', -8, 'SLA melhorou. Quer aprender a ler resultados de tráfego para conversar com clientes.', [['Sessão de 1 h com a Ana sobre métricas', false]], 'bem'),
  O('oo-elisa-1', 't-elisa', -16, 'Antes das férias: deixar copies adiantadas e combinar cobertura.', [['Deixar 2 semanas de copy pronta', true], ['Combinar cobertura com o Bruno', false]], 'bem'),
];

db.seed('teamStats', teamStats);
db.seed('timeEntries', timeEntries);
db.seed('goals', goals);
db.seed('checkins', checkins);
db.seed('oneOnOnes', oneOnOnes);
