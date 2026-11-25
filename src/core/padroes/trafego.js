// padroes/trafego.js — catálogo das seções de tráfego (dono: agente de tráfego). Ver formato em index.js.
// Seções: 'torre' (Torre de Controle — semáforo das contas, fila, alertas), 'orcamento' (limites de verba),
// 'recomendacoes' (motor único de recomendações) e 'invasao' (Guardião de segurança).
//
// O que é editavel:true aqui é lido de verdade:
//  - Torre (iframe torre2): voo.js envia {tipo:'padroes', valores} com os ids 'torre.*' e 'orcamento.*' (torre2/padroes.js aplica).
//  - Campanha: lê padrao('orcamento.*') ao validar orçamento e no snapshot do motor.
// Motor e Guardião têm editor próprio (editor:'motor' → settings.motorRegras; editor:'guardiao' → settings.guardiaoRegras);
// as subentradas deles (pai: '<id do editor>') só explicam cada regra com os valores de fábrica.
import MotorRecs from '../../shared/motor-recs.mjs';
import Guardiao from '../../shared/guardiao.mjs';

const n = (v, d) => Number(v).toLocaleString('pt-BR', d == null ? { maximumFractionDigits: 2 } : { minimumFractionDigits: d, maximumFractionDigits: d });
const reais = v => `R$ ${n(v, 2)}`;

const TORRE = '#/torre/voo';
const ONDE_SEMAFORO = ['Torre de Controle › Painel de Voo (coluna Semáforo)', 'Torre › Clientes críticos', 'Torre › Fila "Comece por aqui"'];

/* ============================== Torre de Controle ============================== */
const torre = [
  // --- semáforo
  { id: 'torre.semaforo.indice', grupo: 'Semáforo das contas', nome: 'Índice do semáforo (custo por conversa ÷ meta)',
    significa: 'Número que diz quão longe da meta está o custo por conversa da conta. 1,00 = exatamente na meta; 1,30 = 30% mais caro que a meta; 0,70 = 30% mais barato.',
    calculo: 'Índice = (verba das campanhas de mensagem ÷ conversas na janela-base) ÷ meta de custo por conversa do cliente. A janela-base é a de 3 dias (ou 7 dias, ver "Janela-base"). Campanhas de cadastro/formulário não entram.',
    valor: 'custo ÷ meta', unidade: 'texto', editavel: false, ondeUsa: ONDE_SEMAFORO, link: TORRE },
  { id: 'torre.semaforo.excelente', grupo: 'Semáforo das contas', nome: 'Excelente até',
    significa: 'Conta muito abaixo da meta de custo: candidata a escalar verba.',
    calculo: 'Excelente quando índice ≤ este valor. Ex.: com 0,75 e meta de R$ 10,00, até R$ 7,50 por conversa é Excelente.',
    valor: 0.75, unidade: 'x', min: 0.3, max: 1, passo: 0.01, editavel: true, ordem: 1, ondeUsa: ONDE_SEMAFORO, link: TORRE },
  { id: 'torre.semaforo.bom', grupo: 'Semáforo das contas', nome: 'Bom até',
    significa: 'Conta dentro da meta. Não pede ação.',
    calculo: 'Bom quando índice > limite de Excelente e ≤ este valor (padrão: até 1,00 = até a meta).',
    valor: 1, unidade: 'x', min: 0.5, max: 1.5, passo: 0.01, editavel: true, ordem: 2, ondeUsa: ONDE_SEMAFORO, link: TORRE },
  { id: 'torre.semaforo.atencao', grupo: 'Semáforo das contas', nome: 'Atenção até',
    significa: 'Custo um pouco acima da meta: acompanhar e revisar público ou criativo.',
    calculo: 'Atenção quando índice > limite de Bom e ≤ este valor (padrão 1,25 = até 25% acima da meta).',
    valor: 1.25, unidade: 'x', min: 0.8, max: 2, passo: 0.01, editavel: true, ordem: 3, ondeUsa: ONDE_SEMAFORO, link: TORRE },
  { id: 'torre.semaforo.caro', grupo: 'Semáforo das contas', nome: 'Caro até',
    significa: 'Custo bem acima da meta: ação hoje (trocar criativo, reduzir verba).',
    calculo: 'Caro quando índice > limite de Atenção e ≤ este valor (padrão 1,50 = até 50% acima da meta). Acima disso a conta é Crítica.',
    valor: 1.5, unidade: 'x', min: 1, max: 3, passo: 0.01, editavel: true, ordem: 4, ondeUsa: ONDE_SEMAFORO, link: TORRE },
  { id: 'torre.semaforo.critico', grupo: 'Semáforo das contas', nome: 'Crítico',
    significa: 'Custo por conversa muito acima da meta. A conta aparece em "Clientes críticos", em "Precisa de atenção" e no topo da fila.',
    calculo: 'Crítico quando índice > limite de Caro (padrão: mais de 1,50 × a meta). Não tem valor próprio: muda junto com o limite de Caro.',
    valor: '> limite de Caro', unidade: 'texto', editavel: false, ondeUsa: ONDE_SEMAFORO, link: TORRE },
  { id: 'torre.semaforo.ordem', grupo: 'Semáforo das contas', nome: 'Ordem de verificação do semáforo',
    significa: 'Antes de olhar o custo, a Torre confere se a conta está parada, sem campanha de mensagem ou com poucos dados. Esses estados têm prioridade sobre a régua.',
    calculo: '1º Conta parada → 2º Sem campanhas de mensagem → 3º Dados insuficientes → 4º régua do índice (Excelente, Bom, Atenção, Caro, Crítico). Os limites da régua precisam ser crescentes (Excelente < Bom < Atenção < Caro); se não forem, a Torre usa os de fábrica.',
    valor: 'parada › sem MSG › poucos dados › régua', unidade: 'texto', editavel: false, ondeUsa: ONDE_SEMAFORO, link: TORRE },
  { id: 'torre.base3d.minConversas', grupo: 'Semáforo das contas', nome: 'Janela-base de 3 dias: mínimo de conversas',
    significa: 'O semáforo usa os últimos 3 dias (reage rápido). Se os 3 dias tiverem poucas conversas ou pouca verba, usa os últimos 7 dias para não oscilar à toa.',
    calculo: 'Base 3 dias quando conversas em 3 dias ≥ este valor E verba de mensagem em 3 dias ≥ "verba mínima da janela". Senão, base 7 dias (se verba em 7 dias ≥ verba mínima e houver conversa). Sem nenhuma das duas: Dados insuficientes.',
    valor: 3, unidade: 'n', min: 1, max: 50, passo: 1, editavel: true, ondeUsa: ONDE_SEMAFORO.concat('Torre › Cadastrar cliente (1ª leitura)'), link: TORRE },
  { id: 'torre.base.minVerba', grupo: 'Semáforo das contas', nome: 'Verba mínima da janela-base',
    significa: 'Verba de mensagem mínima na janela (3 ou 7 dias) para o custo por conversa valer como sinal.',
    calculo: 'Usada nas duas janelas: 3 dias (com o mínimo de conversas) e 7 dias (com ao menos 1 conversa).',
    valor: 20, unidade: 'R$', min: 0, max: 1000, passo: 5, editavel: true, ondeUsa: ONDE_SEMAFORO.concat('Torre › Cadastrar cliente (1ª leitura)'), link: TORRE },
  { id: 'torre.contaParada.dias', grupo: 'Semáforo das contas', nome: 'Conta parada: dias sem gasto',
    significa: 'A conta já veiculava e parou de gastar (cartão recusado, conta bloqueada, anúncios reprovados ou pausa combinada). Vai para "Agora" na fila.',
    calculo: 'Conta parada quando os últimos N dias têm gasto R$ 0 e a conta já teve gasto antes. A recomendação "Verificar pagamento / conta parada" do motor tem o próprio limite (Recomendações › Conta parada).',
    valor: 2, unidade: 'dias', min: 1, max: 14, passo: 1, editavel: true, ondeUsa: ONDE_SEMAFORO.concat('Torre › Contas silenciosas'), link: TORRE },
  { id: 'torre.semCampanhaMensagem', grupo: 'Semáforo das contas', nome: 'Sem campanhas de mensagem',
    significa: 'A conta gasta só em campanhas de cadastro/formulário. Como o semáforo mede custo por conversa, ela não entra na régua e aparece como "Sem CP de MSG".',
    calculo: 'Verba de mensagem nos últimos 7 dias = R$ 0 e verba total da conta nos 7 dias > R$ 0.',
    valor: 'verba MSG 7d = 0', unidade: 'texto', editavel: false, ondeUsa: ONDE_SEMAFORO, link: TORRE },
  { id: 'torre.dadosInsuficientes.minDias', grupo: 'Semáforo das contas', nome: 'Dados insuficientes: mínimo de dias com gasto',
    significa: 'Conta nova ou que voltou agora: com poucos dias de veiculação o custo ainda não diz nada. A Torre mostra "Dados insuficientes" e não sugere mexer.',
    calculo: 'Dados insuficientes quando os dias com gasto nos últimos 7 dias < este valor OU as conversas em 7 dias < "mínimo de conversas".',
    valor: 3, unidade: 'dias', min: 1, max: 7, passo: 1, editavel: true, ondeUsa: ONDE_SEMAFORO.concat('Torre › Contas silenciosas'), link: TORRE },
  { id: 'torre.dadosInsuficientes.minConversas', grupo: 'Semáforo das contas', nome: 'Dados insuficientes: mínimo de conversas em 7 dias',
    significa: 'Com menos conversas que isso na semana, o custo por conversa é instável demais para classificar.',
    calculo: 'Ver "mínimo de dias com gasto": basta um dos dois abaixo do mínimo para a conta ficar em Dados insuficientes.',
    valor: 10, unidade: 'n', min: 1, max: 100, passo: 1, editavel: true, ondeUsa: ONDE_SEMAFORO, link: TORRE },

  // --- fila, filtros e alertas
  { id: 'torre.fila.prioridade', grupo: 'Fila "Comece por aqui"', nome: 'Como a fila decide Agora / Hoje / Esta semana',
    significa: 'Cada conta com algo a fazer entra em um dos três grupos. Dentro do grupo, a ordem é pela gravidade do semáforo e depois pelo índice (mais caro primeiro).',
    calculo: 'Agora: conta parada, pagamento pendente, revisão das 06:00 com erro, alertas ≥ "alertas para ir para Agora" ou recomendação do motor com prioridade "agora". Hoje: problema operacional (anúncio reprovado etc.) ou recomendação "hoje". Esta semana: recomendação "semana". Contrato pausado com conta parada fica em Esta semana. Sem recomendação aberta e sem problema: fora da fila.',
    valor: 'Agora › Hoje › Semana', unidade: 'texto', editavel: false, ondeUsa: ['Torre › Visão do dia (fila)'], link: TORRE },
  { id: 'torre.fila.alertasAgora', grupo: 'Fila "Comece por aqui"', nome: 'Alertas para ir para "Agora"',
    significa: 'Conta que já recebeu esta quantidade de alertas na semana sobe para o topo da fila, mesmo que o motor não veja urgência.',
    calculo: 'Prioridade Agora quando alertas da conta ≥ este valor.',
    valor: 2, unidade: 'n', min: 1, max: 3, passo: 1, editavel: true, ondeUsa: ['Torre › Visão do dia (fila)'], link: TORRE },
  { id: 'torre.fila.atrasadaDias', grupo: 'Fila "Comece por aqui"', nome: 'Pendência atrasada a partir de',
    significa: 'Conta com ação pendente e sem otimização há mais dias que isso conta como "atrasada" no card "Pendências por gestor".',
    calculo: 'Atrasada quando a conta está na fila e dias sem otimizar > este valor.',
    valor: 5, unidade: 'dias', min: 1, max: 30, passo: 1, editavel: true, ondeUsa: ['Torre › Pendências por gestor'], link: TORRE },
  { id: 'torre.diasSemOtimizar.alerta', grupo: 'Fila "Comece por aqui"', nome: 'Dias sem otimizar em vermelho',
    significa: 'Destaca na tabela as contas em que ninguém mexe há muitos dias.',
    calculo: 'Dias sem otimizar = dias desde a última alteração registrada na conta (qualquer pessoa, inclusive "Fazer agora" da IA). Fica vermelho quando > este valor. Zera a cada alteração confirmada.',
    valor: 7, unidade: 'dias', min: 1, max: 60, passo: 1, editavel: true, ondeUsa: ['Torre › Painel de Voo (coluna Dias sem otimização)'], link: TORRE },
  { id: 'torre.atencao.alertas', grupo: 'Fila "Comece por aqui"', nome: 'Filtro "Precisa de atenção": alertas',
    significa: 'O filtro "Precisa de atenção" junta as contas que pedem olhar humano agora.',
    calculo: 'Entra no filtro: semáforo Crítico ou Conta parada; status operacional diferente de OK (exceto "Sem campanha de mensagem"); revisão das 06:00 com erro; ou alertas ≥ este valor.',
    valor: 2, unidade: 'n', min: 1, max: 3, passo: 1, editavel: true, ondeUsa: ['Torre › Precisa de atenção (filtro e botão)'], link: TORRE },
  { id: 'torre.silenciosas', grupo: 'Fila "Comece por aqui"', nome: 'Contas silenciosas',
    significa: 'Contas que não trouxeram conversa nenhuma recentemente: risco de o cliente achar que nada está acontecendo.',
    calculo: 'Silenciosa quando conversas nos últimos 3 dias = 0, ou semáforo Dados insuficientes, ou Conta parada.',
    valor: '0 conversas em 3 dias', unidade: 'texto', editavel: false, ondeUsa: ['Torre › Contas silenciosas'], link: TORRE },
  { id: 'torre.revisaoDiaria', grupo: 'Alertas da Torre', nome: 'Revisão diária das contas',
    significa: 'Toda manhã a Torre lê o Meta, recalcula semáforo, diagnóstico, fadiga e recomendações de todas as contas.',
    calculo: 'Rotina às 06:00. Conta cuja revisão falhou (ex.: token do Meta expirado) vai para "Agora" e não aceita alterações até um Admin reconectar.',
    valor: '06:00', unidade: 'texto', editavel: false, ondeUsa: ['Torre › Revisão diária', 'Torre › Rotinas e integrações'], link: '#/torre' },
  { id: 'torre.alertas.escalonamento', grupo: 'Alertas da Torre', nome: 'Escalonamento de alertas da conta',
    significa: 'Quando a conta piora e continua piorando, o alerta sobe de nível para alguém com mais poder de decisão ver.',
    calculo: '1º alerta → gestor da conta; 2º → coordenação; 3º → Head de Tráfego. Só chega alerta quando a conta performa mal, um dado fica crítico ou há uma surpresa (ex.: gasto do dia muito acima da média sem aumento de orçamento, ou nenhuma conversa em horas com gasto normal). Mudanças normais não notificam.',
    valor: 'gestor › coordenação › Head', unidade: 'texto', editavel: false, ondeUsa: ['Torre › Sino de alertas', 'Torre › Diagnóstico'], link: TORRE },
  { id: 'torre.alertas.som', grupo: 'Alertas da Torre', nome: 'Alerta sonoro',
    significa: 'Quem recebe alertas (Head de Tráfego e Admins) pode ativar o som: alerta crítico não visto toca até alguém clicar em "Vi / Ciente".',
    calculo: 'Bipe curto repetido a cada ~2,6 s enquanto houver alerta crítico não visto e o som estiver ativado neste aparelho. A sirene de possível invasão é outra coisa (ver Invasão).',
    valor: 'até "Vi / Ciente"', unidade: 'texto', editavel: false, ondeUsa: ['Torre › Sino de alertas'], link: TORRE },
  { id: 'torre.fadiga', grupo: 'Alertas da Torre', nome: 'Fadiga de criativo (Sinal inicial / Saturado)',
    significa: 'O público já viu demais os mesmos anúncios: a frequência sobe, o CTR cai e o custo sobe.',
    calculo: 'Sinal inicial: frequência começando a subir. Saturado: frequência subindo + CTR caindo + CPC subindo. Para o motor, "cansado" = frequência 7d acima de 3,5 e CTR 30% abaixo da semana anterior (limites em Recomendações › Pausar anúncio cansado / Trocar criativo). Saturado leva a "Trocar criativo" e ao fluxo "Pedir criativo / Avisar cliente".',
    valor: 'freq. > 3,5 e CTR −30%', unidade: 'texto', editavel: false, ondeUsa: ['Torre › coluna Fadiga', 'Torre › Pedir criativo'], link: TORRE },
  { id: 'torre.relatorioTerca', grupo: 'Alertas da Torre', nome: 'Faixa "Terça é dia de relatório"',
    significa: 'Lembra o gestor de tráfego de enviar o relatório semanal de cada cliente.',
    calculo: 'Aparece no Painel de Voo a partir de terça (notificação às 08:00) para o gestor com clientes, até todos os relatórios da semana serem marcados como enviados. Depois de terça vira "Relatórios da semana atrasados".',
    valor: 'terça, 08:00', unidade: 'texto', editavel: false, ondeUsa: ['Torre › Painel de Voo (faixa)', 'Minha mesa › Relatório'], link: '#/mesa?o=relatorio' },
];

/* ============================== Orçamento ============================== */
const orcamento = [
  { id: 'orcamento.maxMudancasHora', grupo: 'Limites de alteração de verba', nome: 'Mudanças de orçamento por conjunto por hora',
    significa: 'Quantas vezes o orçamento do mesmo conjunto (ou da campanha, em CBO) pode ser alterado em 1 hora. Regra do dono: no máximo 10; dá para deixar mais rígido.',
    calculo: 'Conta as alterações do mesmo item nos últimos 60 minutos. Ao atingir o limite, a Torre bloqueia e mostra a hora da próxima liberação (1ª alteração da janela + 1 h).',
    valor: 10, unidade: 'n', min: 1, max: 10, passo: 1, editavel: true, ondeUsa: ['Torre › Orçamento diário', 'Torre › Fazer agora (IA)'], link: TORRE },
  { id: 'orcamento.aumentoMaxPct', grupo: 'Limites de alteração de verba', nome: 'Aumento máximo por mudança (aviso)',
    significa: 'Aumentos grandes de uma vez podem reiniciar a fase de aprendizado do Meta e deixar o custo instável por 3 a 7 dias.',
    calculo: 'Aumento = (novo − atual) ÷ atual × 100. Acima deste valor a tela avisa antes da confirmação SIM (não bloqueia). O motor de recomendações nunca sugere mais que o "Limite por mudança" da regra Escalar verba.',
    valor: 20, unidade: '%', min: 5, max: 100, passo: 1, editavel: true, ondeUsa: ['Torre › Orçamento diário', 'Torre › Fazer agora (IA)', 'Campanha › Alterar orçamento'], link: TORRE },
  { id: 'orcamento.minimoDia', grupo: 'Limites de alteração de verba', nome: 'Orçamento mínimo por dia',
    significa: 'Menor orçamento diário aceito para um conjunto/campanha. O Meta não aceita menos que R$ 6,00; a agência pode exigir mais.',
    calculo: 'Novo orçamento < este valor → erro, não deixa continuar. Também é o piso das reduções sugeridas pelo motor (Torre e Campanha) e do impulsionamento.',
    valor: 6, unidade: 'R$', min: 6, max: 1000, passo: 1, editavel: true, ondeUsa: ['Torre › Orçamento diário', 'Torre › Impulsionar publicação', 'Campanha › Alterar orçamento', 'Motor de recomendações (piso)'], link: TORRE },
  { id: 'orcamento.confirmarFinanceiroAcima', grupo: 'Limites de alteração de verba', nome: 'Orçamento diário que exige o financeiro (conta própria)',
    significa: 'Na conta de anúncios própria da agência, orçamentos acima deste valor por dia precisam ser combinados com o financeiro antes.',
    calculo: 'Novo orçamento > este valor → a tela de Campanha não deixa salvar e pede para confirmar com o financeiro.',
    valor: 5000, unidade: 'R$', min: 100, max: 1000000, passo: 100, editavel: true, ondeUsa: ['Campanha › Alterar orçamento'], link: '#/campanha/campanhas' },
  { id: 'orcamento.tetoGastoMin', grupo: 'Limites de alteração de verba', nome: 'Teto de gasto da campanha: valor mínimo',
    significa: 'Menor "gastar no máximo" (teto total) que pode ser definido numa campanha pela Torre.',
    calculo: 'Teto informado < este valor → erro. Em branco remove o teto.',
    valor: 100, unidade: 'R$', min: 6, max: 100000, passo: 10, editavel: true, ondeUsa: ['Torre › Teto de gasto da campanha'], link: TORRE },
  { id: 'orcamento.tetoDiarioCliente', grupo: 'Teto do cliente', nome: 'Teto diário de mídia do cliente',
    significa: 'Quanto o cliente combinou investir por dia. Aumentos de verba que passam do teto são avisados antes de confirmar.',
    calculo: 'Teto diário = teto de mídia mensal do cadastro do cliente ÷ 30,4. Investimento diário da conta = soma dos orçamentos ativos (campanhas CBO + conjuntos ABO). Se depois da mudança a soma passar do teto, a confirmação mostra "Passa do teto do cliente em R$ X". O motor não sugere aumento além do teto.',
    valor: 'mensal ÷ 30,4', unidade: 'texto', editavel: false, ondeUsa: ['Torre › Orçamento diário', 'Torre › Fila (IA sugere)', 'Clientes › Cadastro (teto de mídia)', 'Invasão › Gasto do dia acima do teto'], link: '#/clientes' },
  { id: 'orcamento.confirmacaoSIM', grupo: 'Confirmação', nome: 'Confirmação "SIM" em toda alteração',
    significa: 'Nada vai para o Meta sem a pessoa digitar SIM: pausar, reativar, orçamento, teto, público, texto, impulsionar e "Fazer agora" da IA. Desfazer também pede SIM.',
    calculo: 'O botão de confirmar só libera quando o campo contém exatamente SIM. Única exceção: a pausa automática do Guardião em possível invasão (ver Invasão). Criar ou subir campanha: somente pelo Gerenciador, via 4G.',
    valor: 'SIM', unidade: 'texto', editavel: false, ondeUsa: ['Torre › todas as alterações', 'Campanha › todas as alterações'], link: TORRE },
];

/* ============================== Recomendações (motor único) ============================== */
const PRIO = { agora: 'Agora', hoje: 'Hoje', semana: 'Esta semana' };
const NIVEL = { conta: 'conta', campanha: 'campanha', conjunto: 'conjunto (ou campanha CBO)', anuncio: 'anúncio' };
const ACAO = { orcamento: 'mudar orçamento', pausar: 'pausar', pedirCriativo: 'pedir criativo novo', mensagemCliente: 'mensagem ao cliente', verificar: 'verificar', aguardar: 'aguardar', publico: 'revisar público' };
const fp = p => `${n(p.valor)}${p.unidade === '%' ? '%' : p.unidade === '×' ? '×' : p.unidade === 'R$' ? '' : ` ${p.unidade === 'n' ? '' : p.unidade}`}`.trim();
function pv(r, chave) { const p = r.params.find(x => x.chave === chave); return p ? (p.unidade === 'R$' ? reais(p.valor) : fp(p)) : '?'; }
const CALC_MOTOR = {
  'escalar-verba': r => `Sugere +${pv(r, 'aumento')} quando: custo por resultado em 7 dias ≤ ${pv(r, 'fatorAlvo')} do custo-alvo, ≥ ${pv(r, 'minResultados')} resultados em 7 dias, fora do aprendizado, custo em 3 dias ≤ alvo e sem mudança há ${pv(r, 'esperaDias')}. Nunca passa de ${pv(r, 'limiteMudanca')} por mudança nem do teto diário do cliente.`,
  'reduzir-verba': r => `Sugere −${pv(r, 'reducao')} quando o custo em 3 dias ≥ ${pv(r, 'fatorAlvo')} do alvo, com gasto em 3 dias ≥ ${pv(r, 'minGasto')} o alvo e sem mudança há ${pv(r, 'esperaDias')}. Prioridade Hoje; Agora quando o custo ≥ ${pv(r, 'fatorUrgente')} do alvo ou não houve resultado. Nunca abaixo do orçamento mínimo por dia.`,
  'pausar-anuncio': r => `Pausa o anúncio com frequência 7d > ${pv(r, 'frequenciaMax')}, CTR ${pv(r, 'quedaCtr')} abaixo da semana anterior, custo acima da média do conjunto e ≥ ${pv(r, 'minImpressoes')} impressões, desde que o conjunto tenha outro anúncio ativo.`,
  'trocar-criativo': r => `Quando TODOS os anúncios ativos do conjunto têm frequência > ${pv(r, 'frequenciaMax')} e CTR ${pv(r, 'quedaCtr')} abaixo da semana anterior: pedir criativo novo (pausar não resolve).`,
  'conta-parada': r => `Gasto R$ 0 nos últimos ${pv(r, 'dias')} com campanha ativa → verificar pagamento, bloqueio ou reprovação.`,
  'dados-insuficientes': r => `Menos de ${pv(r, 'minDias')} com gasto ou menos de ${pv(r, 'minResultados')} resultados em 7 dias → aguardar. Enquanto valer, bloqueia as regras de verba, anúncio e público.`,
  'sem-campanha-mensagem': r => `Meta da conta = conversa, há campanha ativa, mas nenhuma de mensagem (gasto da conta em 7 dias ≥ ${pv(r, 'gastoMin')}) → propor campanha de mensagem ao cliente.`,
  'aprendizado-limitado': r => `Conjunto com status "aprendizado limitado", ou aprendendo há ≥ ${pv(r, 'diasMin')} com menos de ${pv(r, 'minResultados')} resultados por semana → juntar conjuntos ou ampliar público.`,
  'revisar-publico': r => `CPM 7d ${pv(r, 'altaCpm')} acima da semana anterior com CTR variando no máximo ${pv(r, 'variacaoCtr')} e ≥ ${pv(r, 'minImpressoes')} impressões → o público encareceu, revisar.`,
  'conversar-cliente': r => `Resultados caíram ${pv(r, 'quedaResultado')} (ou custo subiu ${pv(r, 'quedaResultado')}) na semana e o cliente está há ≥ ${pv(r, 'diasSemMensagem')} sem mensagem → avisar antes que ele perceba.`,
};
const motorRegras = (MotorRecs && MotorRecs.REGRAS_PADRAO) || [];
const recomendacoes = [
  { id: 'recomendacoes.motor', grupo: 'Motor de recomendações', nome: 'Regras do motor de recomendações (IA)',
    significa: 'Um só motor gera as sugestões da Torre de Controle (contas dos clientes) e da Campanha (conta própria). Cada regra pode ser ligada/desligada e ter os limites ajustados.',
    calculo: 'Lê os últimos 3, 7 e 14 dias de cada conta, campanha, conjunto e anúncio e compara com o custo-alvo (meta do cliente). As regras abaixo explicam cada sugestão com os valores de fábrica. Alterações valem na Torre e na Campanha ao mesmo tempo.',
    valor: `${motorRegras.length} regras`, unidade: 'texto', editavel: true, editor: 'motor',
    ondeUsa: ['Torre › Fila e "IA sugere"', 'Campanha › Recomendações', 'Campanha › Regras da IA'], link: '#/campanha/regras' },
  ...motorRegras.map(r => ({
    id: `recomendacoes.motor.${r.id}`, pai: 'recomendacoes.motor', grupo: 'Motor de recomendações', nome: r.nome,
    significa: r.descricao,
    calculo: `${(CALC_MOTOR[r.id] || (() => ''))(r)} Nível: ${NIVEL[r.nivel] || r.nivel} · ação: ${ACAO[r.acao] || r.acao} · prioridade: ${PRIO[r.prioridade] || r.prioridade}.${r.sucesso ? ' Sucesso medido 7 dias depois.' : ''}`.trim(),
    valor: r.ativo === false ? 'desligada' : 'ligada', unidade: 'texto', editavel: false,
    ondeUsa: ['Torre › Fila e "IA sugere"', 'Campanha › Recomendações'], link: '#/campanha/regras',
  })),
  { id: 'recomendacoes.causaAntesDoCorte', pai: 'recomendacoes.motor', grupo: 'Como o motor decide', nome: 'Causa antes do corte',
    significa: 'Se o conjunto está caro por causa de anúncio cansado ou público saturado, cortar verba não resolve: a sugestão passa a ser resolver a causa.',
    calculo: 'Quando "Reduzir verba" e uma regra de causa (Pausar anúncio, Trocar criativo, Revisar público) apontam para o mesmo conjunto, a redução some; a sugestão da causa herda a urgência e ganha o aviso "Resolva a causa primeiro".',
    valor: 'automático', unidade: 'texto', editavel: false, ondeUsa: ['Torre › Fila', 'Campanha › Recomendações'], link: '#/campanha/regras' },
  { id: 'recomendacoes.confianca', pai: 'recomendacoes.motor', grupo: 'Como o motor decide', nome: 'Confiança da sugestão',
    significa: 'Quanto volume de dados apoia a sugestão.',
    calculo: 'Alta: ≥ 30 resultados na janela; média: ≥ 10; baixa: menos. Regras de anúncio e público usam impressões: alta ≥ 20.000, média ≥ 5.000.',
    valor: '30 / 10 resultados', unidade: 'texto', editavel: false, ondeUsa: ['Torre › detalhe da recomendação', 'Campanha › Recomendações'], link: '#/campanha/regras' },
  { id: 'recomendacoes.umaPorRegra', pai: 'recomendacoes.motor', grupo: 'Como o motor decide', nome: 'Uma sugestão por regra por conta (Torre)',
    significa: 'Na fila da Torre cada conta mostra a sugestão mais urgente; as demais ficam no detalhe da conta.',
    calculo: 'Por conta, fica a 1ª sugestão de cada regra (a mais urgente / do conjunto principal). A fila usa a prioridade da 1ª sugestão aberta (Agora, Hoje, Esta semana). Pedido de criativo já feito conta como resolvido.',
    valor: '1 por regra', unidade: 'texto', editavel: false, ondeUsa: ['Torre › Fila'], link: TORRE },
  { id: 'recomendacoes.aprendizado', pai: 'recomendacoes.motor', grupo: 'Como o motor decide', nome: 'Registro de aprendizado (deu certo?)',
    significa: 'Cada sugestão aceita, recusada ou adiada fica registrada. 7 dias depois de aceita, a plataforma mede se melhorou.',
    calculo: 'Aceita → mede o alvo nos 7 dias seguintes e compara com o "antes" (custo, CTR, CPM ou resultados, conforme a regra). Taxa de aceite e de sucesso por regra nos últimos 30 dias aparecem em Campanha › Regras da IA.',
    valor: '7 dias', unidade: 'texto', editavel: false, ondeUsa: ['Campanha › Regras da IA'], link: '#/campanha/regras' },
];

/* ============================== Invasão (Guardião de segurança) ============================== */
const SEV = { critica: 'crítica', alta: 'alta', media: 'média' };
function gv(r, chave) { const p = (r.params || []).find(x => x.chave === chave); if (!p) return '?'; return p.unidade === 'R$' ? reais(p.valor) : p.unidade === 'h' ? `${p.valor}h` : `${n(p.valor)}${p.unidade === '%' ? '%' : p.unidade === '×' ? '×' : p.unidade === 'min' ? ' min' : ''}`; }
const CALC_GUARDIAO = {
  'orcamento-salto': r => `Uma alteração sobe o orçamento de campanha/conjunto em mais de ${gv(r, 'aumentoPct')} ou mais de ${gv(r, 'aumentoAbs')}/dia; ou alterações seguidas no mesmo item somam mais de ${gv(r, 'acumuladoPct')} em ${gv(r, 'janelaMin')}.`,
  'fora-horario': r => `Qualquer alteração entre ${gv(r, 'inicio')} e ${gv(r, 'fim')} (horário de Brasília).`,
  'ator-desconhecido': () => 'Alteração feita por usuário do Meta fora da lista de autorizados da equipe. Sem lista cadastrada a regra fica de fora.',
  'gasto-pico': r => `Gasto da última hora > ${gv(r, 'fator')} a média por hora dos últimos 7 dias E > ${gv(r, 'minimo')} (sem gasto em 7 dias e acima do mínimo também dispara).`,
  'campanha-nova': () => 'Campanha criada por usuário fora da lista de autorizados, ou por canal que não seja o app ou o Gerenciador.',
  'destino-alterado': () => 'Objetivo, URL de destino ou número de WhatsApp trocado em anúncio ativo.',
  'admin-novo': () => 'Administrador ou parceiro adicionado à conta de anúncios ou ao Business Manager (mesmo que seja da equipe: confirme).',
  'pagamento-alterado': () => 'Forma de pagamento ou limite de gastos alterado ou removido.',
  'pais-novo': () => 'Segmentação passa a incluir país nunca usado pela conta (padrão: só Brasil).',
  'teto-projetado': r => `Investimento projetado de hoje (orçamentos ativos ou ritmo do gasto de hoje) > teto diário do cliente + ${gv(r, 'excessoPct')}. Teto diário = teto mensal ÷ 30,4.`,
  rajada: r => `Mais de ${gv(r, 'maxAlteracoes')} alterações em ${gv(r, 'janelaMin')}.`,
};
const gRegras = (Guardiao && Guardiao.REGRAS_PADRAO) || [];
const ag = (Guardiao && Guardiao.AGREGACAO_PADRAO) || { params: [] };
const checklist = ((Guardiao && Guardiao.CHECKLIST) || []).map((c, i) => `${i + 1}) ${c.rotulo}`).join('; ');
const ONDE_INV = ['Banner "Possível invasão" (todas as páginas)', 'Alertas › Segurança', 'Torre › Quarentena'];
const invasao = [
  { id: 'invasao.guardiao', grupo: 'Guardião de segurança', nome: 'Regras de detecção de possível invasão',
    significa: 'O Guardião vigia as contas de anúncios dos clientes (a cada 2 minutos em produção). Quando vê sinais de invasão, pausa a conta na hora e avisa todo mundo com sirene.',
    calculo: `${gRegras.length} sinais, cada um com severidade crítica ou alta, + a regra que decide quando vira incidente SUPREMO. Só as alterações dos últimos ${gv(ag, 'janelaEventosMin')} são avaliadas; ações do próprio Guardião e eventos automáticos do Meta não contam.`,
    valor: `${gRegras.length} sinais`, unidade: 'texto', editavel: true, editor: 'guardiao', ondeUsa: ONDE_INV.concat('Alertas › Regras › Possível invasão'), link: '#/alertas/regras' },
  ...gRegras.map(r => ({
    id: `invasao.guardiao.${r.id}`, pai: 'invasao.guardiao', grupo: 'Sinais de invasão', nome: r.nome,
    significa: r.descricao,
    calculo: `${(CALC_GUARDIAO[r.id] || (() => ''))(r)} Severidade ${SEV[r.severidade] || r.severidade}: ${r.severidade === 'critica' ? 'sozinha já vira incidente SUPREMO (pausa automática).' : 'sozinha vira alerta comum (sem pausa); junto com outra alta diferente vira SUPREMO.'}`,
    valor: `severidade ${SEV[r.severidade] || r.severidade}`, unidade: 'texto', editavel: false, ondeUsa: ONDE_INV, link: '#/alertas/regras',
  })),
  { id: 'invasao.supremo', pai: 'invasao.guardiao', grupo: 'Resposta automática', nome: 'Quando vira incidente SUPREMO',
    significa: ag.descricao || 'Qualquer regra crítica, ou várias regras altas diferentes dentro da janela, vira incidente SUPREMO.',
    calculo: `SUPREMO = qualquer sinal crítico, OU ${gv(ag, 'altasParaSupremo')} ou mais sinais altos diferentes dentro de ${gv(ag, 'janelaAltasMin')} (também entre verificações: o estado guarda os achados das últimas 2 h). Olha alterações dos últimos ${gv(ag, 'janelaEventosMin')}.`,
    valor: `crítica ou ${gv(ag, 'altasParaSupremo')} altas`, unidade: 'texto', editavel: false, ondeUsa: ONDE_INV, link: '#/alertas/regras' },
  { id: 'invasao.pausaAutomatica', pai: 'invasao.guardiao', grupo: 'Resposta automática', nome: 'Pausa automática sem SIM (exceção autorizada pelo dono)',
    significa: 'Em invasão cada minuto custa dinheiro do cliente. Por isso esta é a ÚNICA alteração que a plataforma faz sem a confirmação "SIM". Pausar é reversível; nada é excluído.',
    calculo: 'SUPREMO → pausa todas as campanhas ativas da conta (status pausado; nunca exclui nem arquiva) e guarda o orçamento atual e o anterior ao incidente de cada campanha/conjunto, e quais campanhas foram criadas durante o incidente. A reativação sempre pede SIM.',
    valor: 'pausar tudo, nunca excluir', unidade: 'texto', editavel: false, ondeUsa: ONDE_INV, link: '#/alertas/regras' },
  { id: 'invasao.quarentena', pai: 'invasao.guardiao', grupo: 'Resposta automática', nome: 'Quarentena e vigilância (reincidência)',
    significa: 'Depois da pausa a conta fica em quarentena (preto/vermelho na Torre) e continua vigiada.',
    calculo: 'A cada verificação, se algo na conta em quarentena voltar a ficar ativo ou aparecer alteração nova (exceto pausas) → pausa de novo e avisa "REINCIDÊNCIA" (a sirene volta a tocar, inclusive para quem silenciou). A mesma situação verificada de novo não gera ação nem aviso repetido.',
    valor: 'a cada 2 min', unidade: 'texto', editavel: false, ondeUsa: ONDE_INV, link: '#/alertas' },
  { id: 'invasao.avisos', pai: 'invasao.guardiao', grupo: 'Resposta automática', nome: 'Quem é avisado e sirene',
    significa: 'Todos os gestores de tráfego, o Dono e os Admins são avisados ao mesmo tempo, com sirene até alguém assumir.',
    calculo: 'Notificação crítica para todo usuário ativo com papel gestor de tráfego, dono ou admin (em produção também WhatsApp e e-mail, ignorando horário de silêncio). Banner vermelho em tela cheia + sirene de dois tons repetindo a cada ~10 s até alguém clicar "Assumir incidente" (para para todos) ou "Silenciar neste aparelho" (só local).',
    valor: 'tráfego + dono + admin', unidade: 'texto', editavel: false, ondeUsa: ONDE_INV.concat('Notificações'), link: '#/alertas' },
  { id: 'invasao.saida', pai: 'invasao.guardiao', grupo: 'Saída da quarentena', nome: 'Liberar a conta (Dono ou Admin + checklist + SIM)',
    significa: 'Só Dono ou Admin tiram a conta da quarentena, depois de garantir que o invasor perdeu o acesso.',
    calculo: `Digitar SIM e marcar todo o checklist: ${checklist || 'senha, dois fatores, administradores, pagamento e orçamentos revisados'}. Reativação seletiva: só campanhas pausadas pelo Guardião neste incidente, com "Restaurar orçamento anterior ao incidente" ligado por padrão; campanhas criadas durante o incidente vêm desmarcadas.`,
    valor: 'Dono/Admin + SIM', unidade: 'texto', editavel: false, ondeUsa: ONDE_INV, link: '#/alertas' },
];

export default [...torre, ...orcamento, ...recomendacoes, ...invasao].map(p => ({
  secao: p.id.startsWith('torre.') ? 'torre' : p.id.startsWith('orcamento.') ? 'orcamento' : p.id.startsWith('recomendacoes.') ? 'recomendacoes' : 'invasao', ...p,
}));
