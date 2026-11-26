// padroes/gestao.js — catálogo das seções de gestão (dono: agente de gestão). Ver formato em index.js.
// Tudo o que a plataforma usa para decidir em Clientes, Equipe, Operação (+ Minha mesa e Cockpit), Financeiro, Webinars,
// Alertas (+ Notificações), Comercial e Acesso e visibilidade. editavel:true = o módulo lê padrao(id) (mudar aqui muda a tela).
// editavel:false = regra fixa, fórmula ou valor que vem dos dados — explicado para a equipe saber o que deixa e o que tira.
// fonte: {col, id, param} = o valor mora em outro registro (ex.: regra de alerta em alertRules) — a central lê e grava lá.

const E = (secao, grupo, id, nome, valor, unidade, o = {}) => ({ id: `${secao}.${id}`, secao, grupo, nome, valor, unidade, editavel: false, ondeUsa: [], ...o });

/* ============================================================ CLIENTES */
const HS = 'Health score do cliente';
const clientes = [
  E('clientes', HS, 'health.peso.resultado', 'Peso: resultado vs meta', 35, '%', { editavel: true, min: 0, max: 100, passo: 5, grupoSoma: 'clientes.health.peso',
    significa: 'Quanto o resultado do cliente (ROAS, CPL, leads ou faturamento contra a meta combinada) pesa no health score.',
    calculo: 'Health = Resultado × 35% + Prazo × 25% + Engajamento × 20% + Pagamento × 20% − penalidade. Cada componente vale de 0 a 100. Os 4 pesos somam 100%.',
    ondeUsa: ['Clientes › ficha › Health score (como calculamos)', 'Rotina noturna "Health score dos clientes"'], link: '#/clientes/c-orion?calc=1&foco=saude' }),
  E('clientes', HS, 'health.peso.prazo', 'Peso: entregas no prazo', 25, '%', { editavel: true, min: 0, max: 100, passo: 5, grupoSoma: 'clientes.health.peso',
    significa: 'Quanto a pontualidade das entregas da agência para o cliente pesa no health score.',
    calculo: '% de entregas concluídas até o prazo (últimos 90 dias) × 25%.', ondeUsa: ['Clientes › ficha › Health score'], link: '#/clientes/c-orion?calc=1&foco=saude' }),
  E('clientes', HS, 'health.peso.engajamento', 'Peso: engajamento do cliente', 20, '%', { editavel: true, min: 0, max: 100, passo: 5, grupoSoma: 'clientes.health.peso',
    significa: 'Quanto a proximidade do cliente (responde mensagens, vai às reuniões, aprova rápido) pesa no health score.',
    calculo: 'Nota de engajamento 0–100 (respostas do decisor, reuniões realizadas, tempo de aprovação) × 20%.', ondeUsa: ['Clientes › ficha › Health score'], link: '#/clientes/c-orion?calc=1&foco=saude' }),
  E('clientes', HS, 'health.peso.pagamento', 'Peso: pagamento em dia', 20, '%', { editavel: true, min: 0, max: 100, passo: 5, grupoSoma: 'clientes.health.peso',
    significa: 'Quanto o histórico de pagamento pesa no health score.',
    calculo: '% de faturas pagas até o vencimento (12 meses) × 20%.', ondeUsa: ['Clientes › ficha › Health score'], link: '#/clientes/c-orion?calc=1&foco=saude' }),
  E('clientes', HS, 'health.saudavel', 'Saudável a partir de', 75, 'pts', { editavel: true, min: 50, max: 100, passo: 1,
    significa: 'Health score a partir do qual o cliente aparece em verde ("Saudável"). Entre o limite de risco e este valor o cliente fica em "Atenção" (âmbar).',
    calculo: 'Health ≥ 75 → Saudável (verde) · 60 a 74 → Atenção (âmbar) · abaixo de 60 → Em risco (vermelho).',
    ondeUsa: ['Clientes › carteira e ficha', 'Cockpit › Mapa da carteira', 'Minha mesa (clientes em atenção)', 'Indicadores de health em todo o app'], link: '#/clientes' }),
  E('clientes', HS, 'health.risco', 'Em risco abaixo de', 60, 'pts', { editavel: true, min: 0, max: 99, passo: 1, menorQue: 'clientes.health.saudavel',
    significa: 'Health score abaixo do qual o cliente é considerado EM RISCO de cancelar (vermelho). É a regra "em risco" da carteira.',
    calculo: 'Em risco = health < 60. Entra no filtro "Em risco", no KPI "MRR em risco", em "Agora" na Minha mesa do responsável (com botão Plano de resgate) e no contador do menu.',
    ondeUsa: ['Clientes › filtro Em risco', 'Clientes › KPI MRR em risco', 'Minha mesa › Agora', 'Contador do menu Clientes'], link: '#/clientes?f=risco' }),
  E('clientes', HS, 'health.quedaPenalidade', 'Queda aguda (gatilho da penalidade)', 15, 'pts', { editavel: true, min: 5, max: 50, passo: 1,
    significa: 'Queda do health score em 30 dias que conta como sinal de risco agudo.',
    calculo: 'Se o health caiu 15 pontos ou mais nos últimos 30 dias, aplica a penalidade abaixo.', ondeUsa: ['Clientes › ficha › Health score'], link: '#/clientes/c-orion?calc=1&foco=saude' }),
  E('clientes', HS, 'health.penalidade', 'Penalidade por queda aguda', 5, 'pts', { editavel: true, min: 0, max: 30, passo: 1,
    significa: 'Pontos descontados do health quando houve queda aguda — antecipa o risco antes da média ponderada mostrar.',
    calculo: 'Health final = média ponderada − 5 (só quando a queda em 30 dias ≥ 15 pts).', ondeUsa: ['Clientes › ficha › Health score'], link: '#/clientes/c-orion?calc=1&foco=saude' }),
  E('clientes', HS, 'health.meta.resultado', 'Meta do componente Resultado', 80, 'pts', { editavel: true, min: 0, max: 100, passo: 5,
    significa: 'Nota de referência do componente Resultado (barra "meta" na ficha).', calculo: 'Componente abaixo da meta aparece em âmbar/vermelho no detalhamento.', ondeUsa: ['Clientes › ficha › Health score'], link: '#/clientes/c-orion?calc=1&foco=saude' }),
  E('clientes', HS, 'health.meta.prazo', 'Meta do componente Prazo', 90, 'pts', { editavel: true, min: 0, max: 100, passo: 5,
    significa: 'Nota de referência do componente Entregas no prazo.', calculo: 'Comparada à nota atual no detalhamento do health.', ondeUsa: ['Clientes › ficha › Health score'], link: '#/clientes/c-orion?calc=1&foco=saude' }),
  E('clientes', HS, 'health.meta.engajamento', 'Meta do componente Engajamento', 75, 'pts', { editavel: true, min: 0, max: 100, passo: 5,
    significa: 'Nota de referência do componente Engajamento.', calculo: 'Comparada à nota atual no detalhamento do health.', ondeUsa: ['Clientes › ficha › Health score'], link: '#/clientes/c-orion?calc=1&foco=saude' }),
  E('clientes', HS, 'health.meta.pagamento', 'Meta do componente Pagamento', 95, 'pts', { editavel: true, min: 0, max: 100, passo: 5,
    significa: 'Nota de referência do componente Pagamento em dia.', calculo: 'Comparada à nota atual no detalhamento do health.', ondeUsa: ['Clientes › ficha › Health score'], link: '#/clientes/c-orion?calc=1&foco=saude' }),
  E('clientes', HS, 'health.recalculo', 'Quando o health é recalculado', 'Pela rotina da Torre', 'texto', {
    significa: 'O health score gravado no cliente é recalculado pela rotina noturna da Torre com os pesos e limites desta central.',
    calculo: 'Rotina "Health score dos clientes" da Torre de Controle. As faixas (verde/âmbar/vermelho) e o detalhamento da ficha mudam na hora; o número gravado muda na próxima execução da rotina.',
    ondeUsa: ['Torre › Rotinas'], link: '#/torre/rotina/r-health' }),

  E('clientes', 'Sinais de risco (motivos na ficha)', 'resultado.limiar', 'Resultado abaixo da meta', 70, '%', { editavel: true, min: 10, max: 100, passo: 5,
    significa: 'Quando o resultado semanal do cliente fica abaixo deste percentual da meta, a semana conta como "abaixo da meta".',
    calculo: 'Razão = resultado ÷ meta (para CPL, meta ÷ resultado). Semana abaixo quando razão < 70%.', ondeUsa: ['Clientes › ficha › motivos de risco'], link: '#/clientes/c-orion' }),
  E('clientes', 'Sinais de risco (motivos na ficha)', 'resultado.semanas', 'Semanas seguidas abaixo da meta', 2, 'semanas', { editavel: true, min: 1, max: 12, passo: 1,
    significa: 'Quantas semanas seguidas abaixo da meta viram motivo de risco ("ROAS 1,8 vs meta 3,0 há 3 semanas").',
    calculo: 'Conta as semanas mais recentes seguidas abaixo do limiar; ≥ 2 → motivo de risco (o 1º em vermelho).', ondeUsa: ['Clientes › ficha › motivos de risco'], link: '#/clientes/c-orion' }),
  E('clientes', 'Sinais de risco (motivos na ficha)', 'decisor.atencao', 'Decisor sem responder (atenção)', 7, 'dias', { editavel: true, min: 1, max: 60, passo: 1,
    significa: 'Dias sem resposta do decisor do cliente que viram motivo de risco em âmbar e o próximo passo "Retomar contato com o decisor".',
    calculo: 'Dias desde a última resposta do contato decisor ≥ 7 → atenção.', ondeUsa: ['Clientes › ficha › motivos e próximos passos'], link: '#/clientes/c-orion' }),
  E('clientes', 'Sinais de risco (motivos na ficha)', 'decisor.critico', 'Decisor sem responder (crítico)', 10, 'dias', { editavel: true, min: 1, max: 90, passo: 1, maiorQue: 'clientes.decisor.atencao',
    significa: 'Dias sem resposta do decisor que deixam o motivo em vermelho.', calculo: '≥ 10 dias → vermelho.', ondeUsa: ['Clientes › ficha › motivos de risco'], link: '#/clientes/c-orion' }),
  E('clientes', 'Sinais de risco (motivos na ficha)', 'health.quedaMotivo', 'Queda do health que vira motivo', 10, 'pts', { editavel: true, min: 1, max: 50, passo: 1,
    significa: 'Queda do health em 30 dias que aparece como motivo de risco ("Health score caiu 20 pts em 30 dias").',
    calculo: 'Variação de 30 dias ≤ −10 pts → motivo vermelho.', ondeUsa: ['Clientes › ficha › motivos de risco'], link: '#/clientes/c-orion' }),
  E('clientes', 'Sinais de risco (motivos na ficha)', 'inadimplente', 'Inadimplente', 'Fatura do cliente em atraso', 'texto', {
    significa: 'Cliente com pagamento vencido e não pago. Entra no filtro "Inadimplentes" e vira motivo de risco.',
    calculo: 'Situação de pagamento do cliente marcada "em atraso" (vem do Financeiro › Contas a receber). Atraso > 7 dias fica vermelho (ver Financeiro).',
    ondeUsa: ['Clientes › filtro Inadimplentes', 'Minha mesa'], link: '#/clientes?f=inadimplentes' }),
  E('clientes', 'Sinais de risco (motivos na ficha)', 'atrasadas', 'Entregas atrasadas do cliente', '1 = atenção · 2 ou mais = crítico', 'texto', {
    significa: 'Entregas da agência para o cliente com prazo vencido e não concluídas.',
    calculo: 'Filtro "Com atraso" = pelo menos 1 entrega atrasada agora. Motivo âmbar com 1, vermelho com 2 ou mais.', ondeUsa: ['Clientes › filtro Com atraso', 'Clientes › ficha'], link: '#/clientes?f=atraso' }),
  E('clientes', 'Sinais de risco (motivos na ficha)', 'noPrazo.ok', 'Entregas no prazo: saudável a partir de', 90, '%', { editavel: true, min: 50, max: 100, passo: 1,
    significa: 'Percentual de entregas no prazo (90 dias) a partir do qual a coluna "No prazo" do cliente fica verde.',
    calculo: '≥ 90% verde · 75–89% âmbar · < 75% vermelho.', ondeUsa: ['Clientes › carteira (coluna No prazo)', 'Clientes › ficha › Entregas'], link: '#/clientes' }),
  E('clientes', 'Sinais de risco (motivos na ficha)', 'noPrazo.critico', 'Entregas no prazo: crítico abaixo de', 75, '%', { editavel: true, min: 0, max: 99, passo: 1, menorQue: 'clientes.noPrazo.ok',
    significa: 'Abaixo deste percentual a pontualidade com o cliente fica vermelha.', calculo: '< 75% → vermelho.', ondeUsa: ['Clientes › carteira', 'Clientes › ficha › Entregas'], link: '#/clientes' }),

  E('clientes', 'Renovação', 'renovacao.janela', 'Janela "renova em breve"', 30, 'dias', { editavel: true, min: 7, max: 120, passo: 1, fonte: { col: 'alertRules', id: 'rg-renovacao', param: 'dias' },
    significa: 'Contratos que renovam dentro desta janela entram no filtro "Renovam em 30 dias"; sem reunião marcada viram motivo, item na Minha mesa e o alerta essencial "Renovação sem reunião".',
    calculo: 'Dias até a renovação entre 0 e 30 → "renova em breve". Sem reunião agendada → alerta e passo "Agendar reunião de renovação". Mesmo valor da regra de alerta.',
    ondeUsa: ['Clientes › filtro Renovam', 'Clientes › ficha', 'Minha mesa', 'Alertas › Renovação em menos de 30 dias sem reunião'], link: '#/clientes?f=renovam' }),
  E('clientes', 'Renovação', 'renovacao.urgente', 'Renovação urgente (vai para "Hoje")', 7, 'dias', { editavel: true, min: 0, max: 30, passo: 1,
    significa: 'Renovação sem reunião a menos de N dias sobe de "Esta semana" para "Hoje" na Minha mesa do responsável.',
    calculo: 'Dias até renovar ≤ 7 e sem reunião → seção Hoje; senão Esta semana.', ondeUsa: ['Minha mesa'], link: '#/mesa' }),
  E('clientes', 'Renovação', 'renovacao.cockpit', 'Horizonte do card "Renovações"', 60, 'dias', { editavel: true, min: 15, max: 180, passo: 5,
    significa: 'Quantos dias à frente os cards "Renovações" do Cockpit e da carteira de Clientes mostram.', calculo: 'Lista os contratos com renovação entre hoje e hoje + 60 dias.', ondeUsa: ['Cockpit › Renovações', 'Clientes › Renovações'], link: '#/cockpit' }),

  E('clientes', 'Onboarding', 'onboarding.parado', 'Onboarding parado', 5, 'dias', { editavel: true, min: 1, max: 30, passo: 1,
    significa: 'Cliente novo parado na etapa de acessos por mais de N dias aparece como "parado" no funil e na Minha mesa do responsável.',
    calculo: 'Dias desde que a etapa parou > 5 → parado (âmbar, seção Hoje).', ondeUsa: ['Clientes › Onboarding', 'Minha mesa'], link: '#/clientes' }),
  E('clientes', 'Onboarding', 'onboarding.etapas', 'Etapas do onboarding', 'Contrato → Acessos → Kickoff → Setup → 1ª entrega', 'texto', {
    significa: 'Etapas que todo cliente novo percorre. O funil conta quantos clientes concluíram (ou concluíram parcialmente) cada etapa.',
    calculo: 'Etapa conta como feita quando está "feito" ou "parcial".', ondeUsa: ['Clientes › Onboarding'], link: '#/clientes' }),

  E('clientes', 'Resultados e ações', 'impacto.janela', 'Impacto de uma ação da equipe', '2 semanas antes × 2 depois', 'texto', {
    significa: 'Como a plataforma mede se uma ação (troca de criativo, nova verba, reunião…) melhorou o resultado do cliente.',
    calculo: 'Média das 2 semanas antes da ação × média das 2 semanas depois (≈14 dias). Antes de 14 dias aparece "aguardando".', ondeUsa: ['Clientes › Resultados e ações'], link: '#/clientes/c-orion/resultados-acoes' }),
  E('clientes', 'Resultados e ações', 'tetoDiario', 'Teto diário de mídia', 'Teto mensal ÷ 30,4', 'texto', {
    significa: 'Limite de investimento em anúncios por dia combinado com o cliente (não é receita da agência).',
    calculo: 'Teto diário = teto de mídia mensal do cadastro ÷ 30,4 (dias médios do mês). Usado no aviso de teto da Torre e no Guardião.', ondeUsa: ['Clientes › Cadastro', 'Torre › Painel de Voo', 'Guardião (teto projetado)'], link: '#/clientes/c-orion/cadastro' }),
  E('clientes', 'Resultados e ações', 'comissao', 'Comissão variável por cliente', 'Fixo R$/mês ou % do MRR, por N meses', 'texto', {
    significa: 'Bônus de uma pessoa da equipe atrelado a um cliente.',
    calculo: 'Fixo = valor em R$ por mês · Percentual = % × MRR atual do cliente. Vale do início até início + meses (exclusivo). "Encerrando" quando falta 1 mês ou menos. Entra no DRE dentro de Pessoal.',
    ondeUsa: ['Clientes › Financeiro › Comissões', 'Financeiro › DRE', 'Equipe › perfil'], link: '#/clientes/c-orion/financeiro' }),
];

/* ============================================================ EQUIPE */
const OC = 'Ocupação';
const equipe = [
  E('equipe', OC, 'ocupacao.idealMin', 'Zona ideal: começa em', 70, '%', { editavel: true, min: 10, max: 100, passo: 1, menorQue: 'equipe.ocupacao.idealMax',
    significa: 'Ocupação mínima da zona ideal. Abaixo dela a pessoa aparece como "Ociosa" (azul — não é problema, é capacidade livre).',
    calculo: 'Ocupação = horas planejadas na semana ÷ capacidade semanal (horas do mês ÷ 4). < 70% ociosa.', ondeUsa: ['Equipe', 'Cockpit › Capacidade do time', 'Operação › Calendário de carga'], link: '#/equipe' }),
  E('equipe', OC, 'ocupacao.idealMax', 'Zona ideal: termina em', 85, '%', { editavel: true, min: 20, max: 150, passo: 1, menorQue: 'equipe.ocupacao.critico',
    significa: 'Ocupação máxima da zona ideal. Acima dela a pessoa fica em "Atenção" (âmbar).', calculo: '70–85% ideal (verde) · 86% até o limite crítico → atenção.', ondeUsa: ['Equipe', 'Cockpit › Capacidade do time'], link: '#/equipe' }),
  E('equipe', OC, 'ocupacao.critico', 'Crítico (sobrecarga) acima de', 100, '%', { editavel: true, min: 50, max: 200, passo: 1,
    significa: 'Ocupação acima da qual a pessoa está em SOBRECARGA (vermelho): status "Sobrecarga", KPI "Pessoas acima do limite" e contagem de semanas para risco de burnout.',
    calculo: 'Ocupação > 100% → Crítico. Também é a linha usada para contar semanas seguidas acima do limite.', ondeUsa: ['Equipe', 'Cockpit › Capacidade do time', 'Minha mesa › Minha semana', 'Contador do menu Equipe'], link: '#/equipe' }),
  E('equipe', OC, 'burnout.atencao', 'Risco de burnout (atenção)', 2, 'semanas', { editavel: true, min: 1, max: 12, passo: 1,
    significa: 'Semanas seguidas acima do limite crítico de ocupação que acendem o aviso "Risco de burnout".',
    calculo: 'Conta as semanas seguidas (até a atual) acima do limite crítico. ≥ 2 → atenção.', ondeUsa: ['Equipe › Risco de burnout', 'Equipe › perfil'], link: '#/equipe' }),
  E('equipe', OC, 'burnout.critico', 'Risco de burnout (crítico)', 3, 'semanas', { editavel: true, min: 1, max: 20, passo: 1, maiorQue: 'equipe.burnout.atencao',
    significa: 'Semanas seguidas acima do limite que deixam o risco de burnout em vermelho e o contador do menu Equipe vermelho.', calculo: '≥ 3 semanas → crítico.', ondeUsa: ['Equipe', 'Contador do menu Equipe'], link: '#/equipe' }),
  E('equipe', OC, 'capacidade', 'Capacidade semanal', 'Horas do mês ÷ 4', 'texto', {
    significa: 'Quantas horas por semana a pessoa tem disponíveis (cadastro da equipe: horas contratadas por mês).',
    calculo: 'Capacidade = horas/mês ÷ 4. Redistribuir ou criar tarefa ajusta a ocupação pelas horas estimadas.', ondeUsa: ['Equipe', 'Administração › Equipe'], link: '#/admin/equipe' }),

  E('equipe', 'Horas por cliente (overservicing)', 'overservicing.atencao', 'Horas acima do contratado (atenção)', 110, '%', { editavel: true, min: 100, max: 300, passo: 5,
    significa: 'Quando a pessoa lança mais horas num cliente do que o contrato prevê até agora no mês.',
    calculo: 'Real × contratado = horas lançadas no mês ÷ (horas contratadas × dias úteis passados ÷ dias úteis do mês). > 110% atenção.', ondeUsa: ['Equipe › perfil › Clientes'], link: '#/equipe/t-ana/clientes' }),
  E('equipe', 'Horas por cliente (overservicing)', 'overservicing.critico', 'Horas acima do contratado (crítico)', 130, '%', { editavel: true, min: 100, max: 400, passo: 5, maiorQue: 'equipe.overservicing.atencao',
    significa: 'A partir daqui o cliente consome bem mais tempo do que paga (vermelho).', calculo: '> 130% → crítico.', ondeUsa: ['Equipe › perfil › Clientes'], link: '#/equipe/t-ana/clientes' }),

  E('equipe', 'Indicadores por pessoa', 'utilFat', 'Utilização faturável (meta)', '75–85%', 'texto', {
    significa: 'Parte da capacidade gasta em clientes (horas faturáveis).', calculo: 'Horas faturáveis nas últimas 4 semanas ÷ capacidade das 4 semanas. Verde entre 75% e 85%.', ondeUsa: ['Equipe', 'Equipe › perfil'], link: '#/equipe' }),
  E('equipe', 'Indicadores por pessoa', 'janelas', 'Janelas de cálculo', 'Horas: 4 semanas · qualidade: 12 semanas', 'texto', {
    significa: 'Período usado nos indicadores de cada pessoa.', calculo: 'Utilização e throughput: últimas 4 semanas. No prazo, retrabalho e lead time: últimas 12 semanas.', ondeUsa: ['Equipe › perfil › Performance'], link: '#/equipe/t-ana/performance' }),
  E('equipe', 'Indicadores por pessoa', 'leadTime', 'Lead time', 'Criação → entrega (dias)', 'texto', {
    significa: 'Tempo médio entre criar a tarefa e entregar.', calculo: 'Média de (entregue em − criada em) das entregas das últimas 12 semanas.', ondeUsa: ['Equipe › perfil › Performance'], link: '#/equipe/t-ana/performance' }),
  E('equipe', 'Indicadores por pessoa', 'primeira', 'Aprovação de primeira', 'Entregas sem ajuste ÷ entregas', 'texto', {
    significa: 'Quanto do trabalho é aprovado sem pedido de ajuste.', calculo: 'Entregas com aprovação e 0 ajustes ÷ entregas com aprovação (12 semanas).', ondeUsa: ['Equipe › perfil › Performance'], link: '#/equipe/t-ana/performance' }),
  E('equipe', 'Rotina da equipe', 'checkin', 'Check-in diário', 'Dias úteis, quem tem gestor', 'texto', {
    significa: 'Pedido de 1 minuto na Minha mesa: o que fiz · o que farei · bloqueios. O gestor da pessoa lê.',
    calculo: 'Aparece em "Hoje" para quem tem gestor cadastrado, está ativo, não está de férias/folga, de segunda a sexta, até fazer o check-in do dia.', ondeUsa: ['Minha mesa', 'Equipe › perfil'], link: '#/mesa' }),
  E('equipe', 'Rotina da equipe', 'redistribuir', 'Sugestão de redistribuição', 'Menor ocupação + skill', 'texto', {
    significa: 'Como a plataforma sugere para quem passar tarefas de alguém sobrecarregado.',
    calculo: 'Sugere quem tem a menor ocupação projetada e a skill da tarefa; evita quem está de férias no prazo e quem passaria do limite crítico.', ondeUsa: ['Equipe › Redistribuir'], link: '#/equipe/t-ana?acao=redistribuir' }),
];

/* ============================================================ OPERAÇÃO (+ Minha mesa, Cockpit, relatório) */
const operacao = [
  E('operacao', 'Entregas', 'prazo.meta', 'Meta de entregas no prazo', 95, '%', { editavel: true, min: 50, max: 100, passo: 1,
    significa: 'Percentual de entregas concluídas até o prazo que a agência persegue.', calculo: 'Entregas concluídas até o prazo ÷ entregas concluídas (4 semanas no KPI, por semana no gráfico). Verde ≥ 95%.',
    ondeUsa: ['Operação › Visão', 'Equipe', 'Equipe › perfil', 'Cockpit › Entregas no prazo'], link: '#/operacao' }),
  E('operacao', 'Entregas', 'prazo.minimo', 'Mínimo aceitável de entregas no prazo', 90, '%', { editavel: true, min: 0, max: 99, passo: 1, menorQue: 'operacao.prazo.meta',
    significa: 'Abaixo deste percentual a pontualidade fica vermelha; entre o mínimo e a meta, âmbar.', calculo: '90–94% âmbar · < 90% vermelho.', ondeUsa: ['Operação › Visão', 'Equipe › perfil'], link: '#/operacao' }),
  E('operacao', 'Entregas', 'atraso.critico', 'Tarefa atrasada fica vermelha após', 2, 'dias', { editavel: true, min: 0, max: 30, passo: 1,
    significa: 'Dias de atraso a partir dos quais a tarefa atrasada aparece em vermelho na lista de atrasadas (antes, âmbar).',
    calculo: 'Atraso > 2 dias → vermelho. Mesmo critério do alerta essencial "Entrega atrasada".', ondeUsa: ['Operação › Visão › Atrasadas'], link: '#/operacao' }),
  E('operacao', 'Entregas', 'retrabalho.meta', 'Meta de retrabalho', 15, '%', { editavel: true, min: 0, max: 100, passo: 1,
    significa: 'Máximo aceitável de entregas que voltam com pedido de ajuste.', calculo: 'Retrabalho = entregas com pedido de ajuste ÷ entregas (sem reuniões, 12 semanas). ≤ 15% verde.', ondeUsa: ['Operação › Retrabalho', 'Equipe'], link: '#/operacao' }),
  E('operacao', 'Entregas', 'retrabalho.critico', 'Retrabalho crítico acima de', 25, '%', { editavel: true, min: 1, max: 100, passo: 1, maiorQue: 'operacao.retrabalho.meta',
    significa: 'Acima deste percentual o retrabalho fica vermelho.', calculo: '16–25% âmbar · > 25% vermelho.', ondeUsa: ['Operação › Retrabalho', 'Equipe'], link: '#/operacao' }),
  E('operacao', 'Entregas', 'sla.meta', 'SLA de 1ª resposta (meta)', 2, 'h', { editavel: true, min: 0.5, max: 48, passo: 0.5,
    significa: 'Tempo máximo, em horas úteis, para o atendimento dar a primeira resposta a uma mensagem de cliente (WhatsApp/e-mail).',
    calculo: 'Média de horas úteis até a 1ª resposta. Verde ≤ 2 h · âmbar até 2,5 h (meta × 1,25) · vermelho acima.', ondeUsa: ['Operação › SLA de 1ª resposta'], link: '#/operacao' }),
  E('operacao', 'Entregas', 'aprovador', 'Quem aprova uma tarefa', 'Responsável do cliente (ou o dono)', 'texto', {
    significa: 'Aprovador automático de uma tarefa nova.', calculo: 'Responsável do cliente, se não for a própria pessoa que executa; senão o Dono. Pode ser trocado na tarefa.', ondeUsa: ['Operação › Nova tarefa'], link: '#/operacao/quadro' }),
  E('operacao', 'Entregas', 'prioridadeAlta', 'Prioridade alta automática', 'Prazo em até 1 dia', 'texto', {
    significa: 'Tarefa criada com prazo para hoje ou amanhã nasce com prioridade alta.', calculo: 'Dias até o prazo ≤ 1 → prioridade alta.', ondeUsa: ['Operação › Nova tarefa'], link: '#/operacao/quadro' }),

  E('operacao', 'Minha mesa (prioridades)', 'mesa.secoes', 'Agora · Hoje · Esta semana', 'Atrasado/crítico · vence hoje · próximos dias', 'texto', {
    significa: 'Como a Minha mesa ordena o trabalho de cada pessoa.',
    calculo: 'Agora = atrasado ou crítico (vermelho). Hoje = vence hoje ou espera resposta sua (âmbar). Esta semana = próximos dias. Dentro de cada seção: crítico → atenção → resto, depois o prazo.', ondeUsa: ['Minha mesa'], link: '#/mesa' }),
  E('operacao', 'Minha mesa (prioridades)', 'mesa.janelaSemana', 'Horizonte de "Esta semana"', 7, 'dias', { editavel: true, min: 1, max: 30, passo: 1,
    significa: 'Até quantos dias à frente tarefas e itens de checklist entram na Minha mesa.', calculo: 'Prazo vencido → Agora · hoje → Hoje · até 7 dias → Esta semana · depois disso não aparece.', ondeUsa: ['Minha mesa'], link: '#/mesa' }),
  E('operacao', 'Minha mesa (prioridades)', 'mesa.aprovacaoEspera', 'Aprovação esperando vira "Hoje"', 24, 'h', { editavel: true, min: 1, max: 168, passo: 1,
    significa: 'Uma entrega aguardando a sua aprovação há mais tempo que isto sobe para "Hoje".', calculo: 'Prazo vencido → Agora · prazo até amanhã ou espera ≥ 24 h → Hoje · senão Esta semana.', ondeUsa: ['Minha mesa'], link: '#/mesa' }),
  E('operacao', 'Minha mesa (prioridades)', 'mesa.alertas', 'Alertas na mesa', 'Crítico → Agora · Atenção → Hoje', 'texto', {
    significa: 'Alertas atribuídos a você (ou endereçados a você, sem dono) entram na mesa pela gravidade.', calculo: 'Crítico → Agora · atenção → Hoje · informativo → Esta semana. Alerta ligado a um cliente da mesa vai junto do cliente.', ondeUsa: ['Minha mesa'], link: '#/mesa' }),
  E('operacao', 'Minha mesa (prioridades)', 'mesa.mencoes', 'Menções e atribuições', 'Alta prioridade → Agora · demais → Hoje', 'texto', {
    significa: 'Notificações não lidas de menção/atribuição viram itens da mesa (agrupadas por assunto).', calculo: 'Prioridade alta → Agora; senão Hoje. Somem quando marcadas como lidas.', ondeUsa: ['Minha mesa'], link: '#/mesa' }),
  E('operacao', 'Minha mesa (prioridades)', 'mesa.webinarUrgente', 'Webinar perto da live', 7, 'dias', { editavel: true, min: 0, max: 30, passo: 1,
    significa: 'Dados de webinar faltando a menos de N dias da live sobem para "Hoje".', calculo: 'Live em até 7 dias com pendência de preenchimento → Hoje; senão Esta semana.', ondeUsa: ['Minha mesa'], link: '#/mesa' }),
  E('operacao', 'Minha mesa (prioridades)', 'relatorio.dia', 'Dia do relatório semanal', 2, 'dia', { editavel: true, min: 1, max: 5, passo: 1, opcoes: [[1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta'], [5, 'Sexta']],
    significa: 'Dia da semana em que o gestor de tráfego envia o relatório semanal de cada cliente sob sua responsabilidade.',
    calculo: 'No dia → item em "Hoje" + aviso às 08:00 ("Hoje é dia de relatório"). Depois do dia, sem envio → "Agora" (vermelho). Antes do dia, nada aparece.', ondeUsa: ['Minha mesa', 'Clientes › Resultados e ações'], link: '#/mesa' }),

  E('operacao', 'Saúde da agência (Cockpit)', 'saude.pesos', 'Pesos da saúde da agência', 'Financeiro 30 · Clientes 30 · Operação 20 · Equipe 20', 'texto', {
    significa: 'Nota única (0–100) que resume a agência no Cockpit.', calculo: 'Média ponderada de 4 notas: Financeiro 30%, Clientes 30%, Operação 20%, Equipe 20%. Faixas iguais às do health: ≥ 75 ok · 60–74 atenção · < 60 risco.', ondeUsa: ['Cockpit › Saúde da agência'], link: '#/cockpit' }),
  E('operacao', 'Saúde da agência (Cockpit)', 'cockpit.mapa', 'Mapa da carteira', 'MRR × health · corte em 60', 'texto', {
    significa: 'Bolhas por cliente: eixo horizontal = health, vertical = MRR. O canto "Agir já" = MRR alto com health abaixo do limite de risco.', calculo: 'Quadrantes: health 60 e MRR R$ 8 mil.', ondeUsa: ['Cockpit › Mapa da carteira'], link: '#/cockpit' }),
  E('operacao', 'Saúde da agência (Cockpit)', 'luzMestra', 'Luz mestra (topo)', 'Pior LED do momento', 'texto', {
    significa: 'O LED do topo resume o estado da agência.', calculo: 'Pior estado entre alertas em aberto, rotinas e integrações ativas (vermelho > âmbar > verde). Texto: "2 alertas críticos".', ondeUsa: ['Topo do app'], link: '#/alertas' }),
];

/* ============================================================ FINANCEIRO */
const financeiro = [
  E('financeiro', 'Contas a receber', 'fatura.atrasoCritico', 'Fatura vencida fica vermelha após', 7, 'dias', { editavel: true, min: 0, max: 60, passo: 1,
    significa: 'Dias de atraso a partir dos quais uma fatura vencida fica vermelha (antes, âmbar) e conta em "vencidas há mais de N dias".',
    calculo: 'Atraso > 7 dias → vermelho. "Vence hoje" e "Vence amanhã" ficam em âmbar.', ondeUsa: ['Financeiro › A receber', 'Cockpit › Precisa de você hoje'], link: '#/financeiro/receber' }),
  E('financeiro', 'Contas a receber', 'aging', 'Faixas de atraso (aging)', 'A vencer · 1–15 · 16–30 · mais de 30 dias', 'texto', {
    significa: 'Como as faturas em aberto são agrupadas por tempo de atraso.', calculo: 'Soma do valor e da quantidade de faturas em cada faixa.', ondeUsa: ['Financeiro › A receber'], link: '#/financeiro/receber' }),
  E('financeiro', 'Contas a receber', 'lembrete.antes', 'Lembrete WhatsApp antes do vencimento', 3, 'dias', { editavel: true, min: 1, max: 15, passo: 1,
    significa: 'Quantos dias antes do vencimento o cliente recebe o lembrete automático de mensalidade.',
    calculo: 'Mensalidade em aberto que vence em exatamente 3 dias → lembrete "antes". Também há o lembrete no dia. Liga/desliga e horário em Financeiro › Automação.', ondeUsa: ['Financeiro › Automação (lembretes)'], link: '#/financeiro/automacao' }),
  E('financeiro', 'Contas a receber', 'lembrete.depois', 'Lembrete WhatsApp depois do vencimento', 3, 'dias', { editavel: true, min: 1, max: 30, passo: 1,
    significa: 'Quantos dias depois do vencimento, se ainda em aberto, o cliente recebe o 3º lembrete.',
    calculo: 'Vencida há exatamente 3 dias e não paga → lembrete "depois". Destinatário: contato financeiro com WhatsApp → decisor → principal.', ondeUsa: ['Financeiro › Automação (lembretes)'], link: '#/financeiro/automacao' }),

  E('financeiro', 'Caixa e runway', 'runway.alerta', 'Runway mínimo (alerta)', 3, 'meses', { editavel: true, min: 1, max: 24, passo: 0.5, fonte: { col: 'alertRules', id: 'rg-runway', param: 'meses' },
    significa: 'Meses de caixa abaixo dos quais o Financeiro acende vermelho e o alerta essencial "Runway abaixo de 3 meses" dispara.',
    calculo: 'Runway = caixa atual ÷ queima mensal no cenário de estresse (R$ 60.600/mês). < 3 meses → vermelho + alerta. Mesmo valor da regra de alerta.', ondeUsa: ['Financeiro › Caixa', 'Financeiro › Visão', 'Alertas'], link: '#/financeiro/caixa' }),
  E('financeiro', 'Caixa e runway', 'runway.conforto', 'Runway confortável a partir de', 6, 'meses', { editavel: true, min: 1, max: 36, passo: 0.5, maiorQue: 'financeiro.runway.alerta',
    significa: 'Entre o mínimo e este valor o runway fica em âmbar; acima, verde.', calculo: '3–6 meses âmbar · ≥ 6 meses verde.', ondeUsa: ['Financeiro › Caixa'], link: '#/financeiro/caixa' }),
  E('financeiro', 'Caixa e runway', 'queima', 'Queima no cenário de estresse', 'R$ 60.600/mês', 'texto', {
    significa: 'Quanto a agência gastaria por mês se a receita parasse (custos fixos + folha).', calculo: 'Definido no fechamento do Financeiro. Base do cálculo de runway.', ondeUsa: ['Financeiro › Caixa'], link: '#/financeiro/caixa' }),

  E('financeiro', 'Receita e rentabilidade', 'concentracao.limite', 'Concentração: limite dos 3 maiores clientes', 40, '%', { editavel: true, min: 10, max: 100, passo: 1,
    significa: 'Se os 3 maiores clientes passam deste percentual do MRR, a agência fica vulnerável à saída de um deles (LED vermelho).',
    calculo: 'Concentração = MRR dos 3 maiores ÷ MRR total. > 40% → vermelho.', ondeUsa: ['Financeiro › Visão', 'Financeiro › Rentabilidade', 'Alertas › Insights'], link: '#/financeiro/rentabilidade' }),
  E('financeiro', 'Receita e rentabilidade', 'overservicing.atencao', 'Overservicing do cliente (atenção)', 15, '%', { editavel: true, min: 0, max: 200, passo: 1,
    significa: 'Horas reais do mês acima do escopo contratado do cliente (a equipe entrega mais do que o contrato paga).',
    calculo: 'Excesso = (horas reais − horas contratadas) ÷ horas contratadas. > 15% → âmbar e aviso no topo da Rentabilidade.', ondeUsa: ['Financeiro › Rentabilidade'], link: '#/financeiro/rentabilidade' }),
  E('financeiro', 'Receita e rentabilidade', 'overservicing.critico', 'Overservicing do cliente (crítico)', 40, '%', { editavel: true, min: 1, max: 400, passo: 1, maiorQue: 'financeiro.overservicing.atencao',
    significa: 'Acima deste excesso a linha do cliente fica vermelha.', calculo: '> 40% → vermelho.', ondeUsa: ['Financeiro › Rentabilidade'], link: '#/financeiro/rentabilidade' }),
  E('financeiro', 'Receita e rentabilidade', 'margemServico.atencao', 'Margem mínima por serviço', 25, '%', { editavel: true, min: 0, max: 100, passo: 1,
    significa: 'Serviço com margem de contribuição abaixo disso aparece em âmbar.', calculo: 'Margem do serviço = (receita − horas × custo da hora − custos diretos) ÷ receita.', ondeUsa: ['Financeiro › Rentabilidade › Margem por serviço'], link: '#/financeiro/rentabilidade' }),
  E('financeiro', 'Receita e rentabilidade', 'margemCliente', 'Margem por cliente', '(receita − horas × custo/hora − diretos) ÷ receita', 'texto', {
    significa: 'Quanto sobra de cada cliente depois de pagar as horas da equipe e os custos diretos.', calculo: 'Custo da hora = custo/hora cadastrado de cada pessoa (Administração › Equipe).', ondeUsa: ['Financeiro › Rentabilidade'], link: '#/financeiro/rentabilidade' }),
  E('financeiro', 'Receita e rentabilidade', 'ponte', 'Ponte de MRR', 'Inicial + novos + upsell − downgrade − churn', 'texto', {
    significa: 'De onde veio a variação do MRR no período.', calculo: 'MRR final = inicial + novos + upsell − downgrade − churn.', ondeUsa: ['Financeiro › Visão'], link: '#/financeiro' }),
  E('financeiro', 'Receita e rentabilidade', 'dre', 'DRE simplificada', 'Receita − impostos − pessoal − ferramentas − mídia − despesas', 'texto', {
    significa: 'Resultado do período.', calculo: 'EBITDA = receita líquida − pessoal (comissões separadas dentro de pessoal) − ferramentas − mídia − despesas. Lucro = EBITDA − financeiras − IR. Margem = lucro ÷ receita bruta.', ondeUsa: ['Financeiro › DRE'], link: '#/financeiro/dre' }),

  E('financeiro', 'Aquisição (unidade)', 'cac', 'CAC', '(mídia + comercial + marketing) ÷ clientes novos', 'texto', {
    significa: 'Quanto custa conquistar um cliente novo.', calculo: 'Investimento em aquisição do trimestre ÷ clientes novos do trimestre.', ondeUsa: ['Financeiro › Unidade'], link: '#/financeiro/unidade' }),
  E('financeiro', 'Aquisição (unidade)', 'cac.teto', 'Teto de CAC', 5000, 'R$', { editavel: true, min: 0, max: 100000, passo: 100,
    significa: 'Linha de referência no gráfico de CAC por mês.', calculo: 'Mês acima do teto pede revisão do investimento em aquisição.', ondeUsa: ['Financeiro › Unidade'], link: '#/financeiro/unidade' }),
  E('financeiro', 'Aquisição (unidade)', 'ltv', 'LTV', 'Ticket × margem de contribuição × vida média', 'texto', {
    significa: 'Margem que um cliente deixa ao longo da relação.', calculo: 'LTV = ticket médio × margem de contribuição × vida média em meses.', ondeUsa: ['Financeiro › Unidade'], link: '#/financeiro/unidade' }),
  E('financeiro', 'Aquisição (unidade)', 'ltvcac.meta', 'LTV/CAC mínimo', 3, 'x', { editavel: true, min: 1, max: 20, passo: 0.5,
    significa: 'Quanto cada R$ 1 investido em aquisição precisa voltar em margem.', calculo: 'LTV ÷ CAC. ≥ 3× verde; abaixo, vermelho.', ondeUsa: ['Financeiro › Unidade', 'Financeiro › Visão'], link: '#/financeiro/unidade' }),
  E('financeiro', 'Aquisição (unidade)', 'payback.meta', 'Payback máximo do CAC', 6, 'meses', { editavel: true, min: 1, max: 36, passo: 1,
    significa: 'Em quantos meses a margem de um cliente novo precisa pagar o CAC.', calculo: 'Payback = CAC ÷ margem mensal por cliente. ≤ 6 meses verde; acima, âmbar.', ondeUsa: ['Financeiro › Unidade'], link: '#/financeiro/unidade' }),
];

/* ============================================================ WEBINARS */
const BENCH = [
  ['ctr', 'CTR dos anúncios', 0.8, 1.5, 0.1, 'Cliques ÷ impressões dos anúncios de captação.'],
  ['inscricao', 'Conversão da página de inscrição', 25, 40, 1, 'Inscritos ÷ cliques.'],
  ['grupo', 'Entrada no grupo', 50, 70, 1, 'Pessoas no grupo (WhatsApp/Telegram) ÷ inscritos.'],
  ['comparecimento', 'Comparecimento', 25, 35, 1, 'Presentes ao vivo ÷ inscritos.'],
  ['retencao', 'Retenção até a oferta', 50, 65, 1, 'Pessoas na hora da oferta ÷ pico ao vivo.'],
  ['checkout', 'Cliques no checkout', 15, 30, 1, 'Cliques no checkout ÷ quem viu a oferta.'],
  ['fechamento', 'Checkout → venda', 20, 40, 1, 'Vendas ÷ cliques no checkout.'],
  ['convLive', 'Conversão da live', 3, 8, 0.5, 'Vendas ÷ presentes ao vivo.'],
];
const webinars = [
  ...BENCH.flatMap(([k, nome, min, max, passo, calc]) => [
    E('webinars', 'Referências de mercado (benchmarks)', `bench.${k}.min`, `${nome}: mínimo saudável`, min, '%', { editavel: true, min: 0, max: 100, passo, menorQue: `webinars.bench.${k}.max`,
      significa: `Valor de referência abaixo do qual "${nome.toLowerCase()}" fica em âmbar (até 85% do mínimo) ou vermelho.`, calculo: `${calc} ≥ mínimo verde · ≥ 85% do mínimo âmbar · abaixo vermelho.`, ondeUsa: ['Webinars › painel do webinar (funil)'], link: '#/webinars' }),
    E('webinars', 'Referências de mercado (benchmarks)', `bench.${k}.max`, `${nome}: topo da faixa`, max, '%', { editavel: true, min: 0, max: 100, passo,
      significa: `Topo da faixa de referência de "${nome.toLowerCase()}" (aparece no rótulo "faixa ${min}–${max}%").`, calculo: calc, ondeUsa: ['Webinars › painel do webinar (funil)'], link: '#/webinars' }),
  ]),
  E('webinars', 'Metas e prazos', 'meta.tolerancia', 'Tolerância para "perto da meta"', 85, '%', { editavel: true, min: 50, max: 100, passo: 1,
    significa: 'Quanto da meta (inscritos, vendas) já conta como "perto" (âmbar) em vez de vermelho. Também vale para os benchmarks.',
    calculo: 'Realizado ÷ meta: ≥ 100% verde · ≥ 85% âmbar · abaixo vermelho.', ondeUsa: ['Webinars'], link: '#/webinars' }),
  E('webinars', 'Metas e prazos', 'captacao.semLancamento', 'Captação sem lançamento diário', 2, 'dias', { editavel: true, min: 1, max: 14, passo: 1,
    significa: 'Durante a captação, dias sem lançar os números do dia que viram pendência de preenchimento.', calculo: 'Dias desde o último lançamento ≥ 2 → pendência na Minha mesa de quem preenche a captação.', ondeUsa: ['Webinars', 'Minha mesa'], link: '#/webinars' }),
  E('webinars', 'Metas e prazos', 'perto.antes', 'Webinar "perto da data" (antes)', 21, 'dias', { editavel: true, min: 1, max: 90, passo: 1,
    significa: 'Quantos dias antes da live o webinar passa a aparecer em destaque como "perto da data".', calculo: 'Live nos próximos 21 dias ou nos últimos 7 → perto da data.', ondeUsa: ['Webinars'], link: '#/webinars' }),
  E('webinars', 'Metas e prazos', 'perto.depois', 'Webinar "perto da data" (depois)', 7, 'dias', { editavel: true, min: 0, max: 60, passo: 1,
    significa: 'Quantos dias depois da live o webinar continua em destaque (período de vendas do replay).', calculo: 'Até 7 dias depois da live → status Realizado; depois → Encerrado.', ondeUsa: ['Webinars'], link: '#/webinars' }),
  E('webinars', 'Fórmulas', 'formulas', 'Indicadores do webinar', 'CPL · CAC · ROAS · lucro', 'texto', {
    significa: 'Como cada número do painel do webinar é calculado.',
    calculo: 'CPL = investimento ÷ inscritos · CAC = investimento ÷ vendas · ROAS = faturamento ÷ investimento · Conversão geral = vendas ÷ inscritos · Lucro = faturamento − reembolsos − investimento − custos (inclui a taxa da plataforma de pagamento).', ondeUsa: ['Webinars'], link: '#/webinars' }),
  E('webinars', 'Fórmulas', 'pendencias', 'Pendências de preenchimento', 'Por seção e por responsável', 'texto', {
    significa: 'O que a plataforma cobra de quem preenche o webinar.',
    calculo: 'Planejamento sem tema/data/hora/oferta/metas · captação sem dados · ao vivo sem pico/presentes/na oferta · vendas sem lançamento · replay não lançado (2 dias após) · pós-live sem visualizações e NPS (3 dias após) · checklist atrasado.', ondeUsa: ['Webinars', 'Minha mesa'], link: '#/webinars' }),
];

/* ============================================================ ALERTAS (+ Notificações) */
const AR = (id, param, nome, valor, unidade, o) => E('alertas', 'Os 7 alertas essenciais', `regra.${id}.${param}`, nome, valor, unidade, { editavel: true, fonte: { col: 'alertRules', id, param }, link: '#/alertas/regras', ...o });
const alertas = [
  AR('rg-mrr-score', 'mrrMin', 'Cliente de MRR alto: MRR mínimo', 10000, 'R$', { min: 0, max: 1000000, passo: 500,
    significa: 'MRR a partir do qual um cliente é "de MRR alto" para o alerta crítico de queda do health.', calculo: 'Cliente com MRR ≥ R$ 10.000 e health caindo ≥ 15 pts → alerta crítico para o Dono e o responsável (app + WhatsApp).', ondeUsa: ['Alertas', 'Minha mesa', 'Cockpit'] }),
  AR('rg-mrr-score', 'queda', 'Cliente de MRR alto: queda do health', 15, 'pts', { min: 1, max: 60, passo: 1,
    significa: 'Queda do health score (30 dias) que dispara o alerta crítico em cliente de MRR alto.', calculo: 'Queda ≥ 15 pts.', ondeUsa: ['Alertas'] }),
  AR('rg-entrega', 'dias', 'Entrega atrasada há mais de', 2, 'dias', { min: 0, max: 30, passo: 1,
    significa: 'Dias de atraso de uma entrega que geram alerta para o atendimento e o responsável.', calculo: 'Entrega não concluída com prazo vencido há mais de 2 dias → alerta (app + Slack).', ondeUsa: ['Alertas', 'Operação'] }),
  AR('rg-fatura', 'dias', 'Fatura vencida há mais de', 7, 'dias', { min: 0, max: 90, passo: 1,
    significa: 'Dias de atraso de uma fatura que geram alerta para o Financeiro e o Dono.', calculo: 'Fatura em aberto vencida há mais de 7 dias → alerta (app, e-mail e WhatsApp).', ondeUsa: ['Alertas', 'Financeiro'] }),
  AR('rg-torre', 'falhas', 'Rotina ou integração vermelha: falhas seguidas', 2, 'n', { min: 1, max: 10, passo: 1,
    significa: 'Quantas falhas seguidas de uma rotina (ou integração com erro) geram alerta crítico.', calculo: '2 falhas seguidas → alerta crítico (app, WhatsApp e Slack) para o Dono, o Dev e o responsável da rotina.', ondeUsa: ['Alertas', 'Torre › Rotinas'] }),
  AR('rg-ocupacao', 'limite', 'Pessoa sobrecarregada: ocupação acima de', 100, '%', { min: 50, max: 200, passo: 1,
    significa: 'Ocupação acima da qual a pessoa entra na contagem do alerta de sobrecarga.', calculo: 'Ocupação > 100% por 2 semanas seguidas → alerta para o Dono (app + e-mail).', ondeUsa: ['Alertas', 'Equipe'] }),
  AR('rg-ocupacao', 'semanas', 'Pessoa sobrecarregada: semanas seguidas', 2, 'semanas', { min: 1, max: 12, passo: 1,
    significa: 'Semanas seguidas acima do limite que disparam o alerta de sobrecarga.', calculo: '≥ 2 semanas.', ondeUsa: ['Alertas', 'Equipe'] }),
  E('alertas', 'Os 7 alertas essenciais', 'essenciais.outros', 'Renovação sem reunião e Runway', 'Ver Clientes › Renovação e Financeiro › Caixa', 'texto', {
    significa: 'Os outros 2 alertas essenciais usam os mesmos números das telas: janela de renovação (Clientes) e runway mínimo (Financeiro).', calculo: 'Mudar o padrão lá muda o alerta também.', ondeUsa: ['Alertas › Regras'], link: '#/alertas/regras' }),
  E('alertas', 'Os 7 alertas essenciais', 'canais', 'Canais e destinatários', 'Por regra, em Alertas › Regras', 'texto', {
    significa: 'Cada regra tem gravidade, canais (app, WhatsApp, e-mail, Slack) e destinatários; "incluir o responsável" manda também para o responsável do cliente/rotina.', calculo: 'Editáveis na tela da regra (botão Editar).', ondeUsa: ['Alertas › Regras'], link: '#/alertas/regras' }),
  E('alertas', 'Os 7 alertas essenciais', 'adiar', 'Alerta adiado', 'Volta a abrir na data escolhida', 'texto', {
    significa: 'Alerta adiado some do feed até a data e reabre sozinho.', calculo: 'Status adiado + data → ao passar a data volta para aberto.', ondeUsa: ['Alertas', 'Minha mesa'], link: '#/alertas' }),

  E('alertas', 'Notificações', 'notif.som', 'Aviso sonoro', 'Sempre ligado', 'texto', {
    significa: 'Toda notificação nova vinda de outra pessoa toca um "plim" curto, uma vez por notificação.', calculo: 'Sem opção de desligar (decisão do dono). Invasão usa a sirene do Guardião, que repete até alguém assumir.', ondeUsa: ['Sino', 'Central de notificações'], link: '#/notificacoes' }),
  E('alertas', 'Notificações', 'notif.agrupar', 'Agrupamento no sino', 'Mesmo assunto + tipo no mesmo dia', 'texto', {
    significa: 'Notificações sobre o mesmo cliente/tarefa, do mesmo tipo e no mesmo dia viram um grupo ("3 menções em Grupo Orion").', calculo: 'Chave = coleção + registro + tipo + dia.', ondeUsa: ['Sino', 'Central de notificações'], link: '#/notificacoes' }),
  E('alertas', 'Notificações', 'notif.silencio', 'Horário de silêncio (padrão)', '22:00 às 07:00', 'texto', {
    significa: 'Fora do horário, WhatsApp e e-mail esperam (o app continua). Prioridade alta fura o silêncio.', calculo: 'Padrão para todos; cada pessoa ajusta nas preferências.', ondeUsa: ['Notificações › Preferências'], link: '#/notificacoes' }),
  E('alertas', 'Notificações', 'notif.resumo', 'Resumo diário (padrão)', '08:00 · ligado para Dono e Admin', 'texto', {
    significa: 'Resumo das não lidas enviado uma vez por dia pelo canal preferido.', calculo: 'Ligado por padrão para Dono e Admin; os demais ligam nas preferências.', ondeUsa: ['Notificações › Preferências'], link: '#/notificacoes' }),
  E('alertas', 'Notificações', 'notif.alertasFortes', 'Alertas no WhatsApp/Slack (padrão)', 'Dono e Admin', 'texto', {
    significa: 'Quem recebe alertas também por WhatsApp e Slack sem precisar configurar.', calculo: 'Papéis Dono e Admin: alertas em app + WhatsApp + Slack. Demais: só app (e-mail para menções e atribuições).', ondeUsa: ['Notificações › Preferências'], link: '#/notificacoes' }),
];

/* ============================================================ COMERCIAL */
const PR = [['lead', 'Lead', 10], ['qualificado', 'Qualificado', 20], ['diagnostico', 'Diagnóstico', 35], ['proposta', 'Proposta enviada', 50], ['negociacao', 'Negociação', 70]];
const comercial = [
  ...PR.map(([id, rot, v]) => E('comercial', 'Probabilidade de fechar por etapa', `prob.${id}`, `${rot}`, v, '%', { editavel: true, min: 0, max: 100, passo: 5,
    significa: `Chance de uma oportunidade na etapa "${rot}" virar cliente. Usada na receita ponderada (forecast).`,
    calculo: `Receita ponderada = MRR da oportunidade × ${v}% (soma de todas as oportunidades abertas).`, ondeUsa: ['Comercial › Pipeline', 'Comercial › Receita ponderada'], link: '#/comercial' })),
  E('comercial', 'Probabilidade de fechar por etapa', 'prob.fechadas', 'Ganho e Perdido', 'Ganho 100% · Perdido 0%', 'texto', {
    significa: 'Etapas finais têm probabilidade fixa.', calculo: 'Ganho entra no MRR novo do mês; perdido pede o motivo da perda.', ondeUsa: ['Comercial'], link: '#/comercial' }),
  E('comercial', 'Pipeline', 'acaoVencida', 'Próxima ação vencida', 'Data da próxima ação no passado', 'texto', {
    significa: 'Oportunidade aberta cuja próxima ação passou da data: aparece em vermelho, no KPI "Ações vencidas" e como ponto âmbar no menu.', calculo: 'Data da próxima ação < hoje → vencida; = hoje → âmbar.', ondeUsa: ['Comercial', 'Menu'], link: '#/comercial/pipeline?f=atrasadas' }),
  E('comercial', 'Pipeline', 'fechadas', 'Colunas Ganho/Perdido', 'Últimos 45 dias', 'texto', {
    significa: 'O quadro mostra só oportunidades fechadas recentemente.', calculo: 'Fechadas há até 45 dias.', ondeUsa: ['Comercial › Pipeline'], link: '#/comercial/pipeline' }),
  E('comercial', 'Pipeline', 'conversao', 'Conversão e ciclo', 'Ganhas ÷ propostas · dias até fechar', 'texto', {
    significa: 'Eficiência do comercial.', calculo: 'Conversão = propostas ganhas ÷ propostas enviadas no mês. Ciclo = média de dias entre criação e ganho.', ondeUsa: ['Comercial › Desempenho'], link: '#/comercial/desempenho' }),
];

/* ============================================================ ACESSO E VISIBILIDADE */
const acesso = [
  E('acesso', 'Quem vê o quê', 'regraDono', '"Visível para mim" = Dono + Rayane', 'Dono e Admin iguais', 'texto', {
    significa: 'Regra permanente do dono: tudo o que é só do Dono vale igual para a Admin (Rayane Leão, sócia).', calculo: 'Campanha (conta própria), receita, "Ver como", liberar conta do Guardião e esta central: Dono e Admin.', ondeUsa: ['Administração › Permissões'], link: '#/admin/permissoes' }),
  E('acesso', 'Quem vê o quê', 'receita', 'Receita e faturamento', 'Só Dono e Admin', 'texto', {
    significa: 'MRR, faturamento, ticket, ROAS do cliente e lucro só aparecem para quem tem a permissão "Receita". Os demais veem volumes, prazos e custos.', calculo: 'Linha "Receita e faturamento" da matriz de permissões. Nos textos, valores viram "valor restrito".', ondeUsa: ['Clientes', 'Minha mesa', 'Alertas', 'Webinars', 'Comercial'], link: '#/admin/permissoes' }),
  E('acesso', 'Quem vê o quê', 'escopo', 'Escopo "só os seus clientes"', 'Gestor de tráfego, CS e Produção', 'texto', {
    significa: 'Esses papéis veem apenas clientes em que são responsáveis ou estão na equipe do cliente. Head de tráfego vê todos.', calculo: 'Cliente visível se responsável = a pessoa ou a pessoa está na equipe do cliente.', ondeUsa: ['Clientes', 'Operação', 'Torre', 'Alertas'], link: '#/admin/permissoes' }),
  E('acesso', 'Quem vê o quê', 'excluir', 'Quem pode excluir', 'Nível Total, ou Dono/Admin com Editar', 'texto', {
    significa: 'Excluir é mais restrito que editar.', calculo: 'Excluir exige nível "Total" no módulo, ou papel Dono/Admin com "Editar".', ondeUsa: ['Todos os módulos'], link: '#/admin/permissoes' }),
  E('acesso', 'Quem vê o quê', 'verComo', '"Ver como"', 'Dono e Admin', 'texto', {
    significa: 'Ver o app exatamente como outra pessoa vê, para conferir permissões.', calculo: 'Disponível para Dono e Admin; ações continuam registradas no nome de quem está logado.', ondeUsa: ['Perfil', 'Administração › Usuários'], link: '#/admin/usuarios' }),
  E('acesso', 'Quem vê o quê', 'head', 'Head de tráfego', 'Allan Vieira', 'texto', {
    significa: 'Tudo do gestor de tráfego, em todas as contas (clientes, Torre e Painel de Voo), e edita esta central de padrões. Não vê receita nem a Campanha (conta própria).', calculo: 'Papel head_trafego na matriz de permissões. Início em Torre › Painel de Voo.', ondeUsa: ['Administração › Permissões'], link: '#/admin/permissoes?papel=head_trafego' }),
  E('acesso', 'Quem vê o quê', 'padroes', 'Quem altera estes padrões', 'Dono, Admin e Head de tráfego', 'texto', {
    significa: 'Só esses papéis veem e editam a central "Padrões e regras". Toda mudança fica no histórico (quem, quando, de → para) e na Auditoria.', calculo: 'Linha "Padrões e regras" da matriz de permissões.', ondeUsa: ['Padrões e regras', 'Administração › Auditoria'], link: '#/admin/auditoria' }),
  E('acesso', 'Quem vê o quê', 'inicio', 'Página inicial por papel', 'Dono/Admin → Cockpit · Tráfego → Painel de Voo · demais → Minha mesa', 'texto', {
    significa: 'Onde cada pessoa cai ao entrar.', calculo: 'Se o papel não puder ver o destino, cai na Minha mesa e depois no 1º item permitido.', ondeUsa: ['Login', 'Logo', 'Atalho Hoje no celular'], link: '#/admin/permissoes' }),
  E('acesso', 'Quem vê o quê', 'confirmacaoSim', 'Confirmação "SIM"', 'Toda alteração nas contas de anúncios', 'texto', {
    significa: 'Pausar, mudar verba ou criativo pede digitar SIM. Única exceção: a pausa automática do Guardião em possível invasão.', calculo: 'Liberar a conta depois de uma invasão exige Dono/Admin, SIM e checklist.', ondeUsa: ['Torre › Painel de Voo', 'Campanha', 'Guardião'], link: '#/torre/voo' }),
];

export default [...clientes, ...equipe, ...operacao, ...financeiro, ...webinars, ...alertas, ...comercial, ...acesso];
