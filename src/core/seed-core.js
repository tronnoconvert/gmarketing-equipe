// seed-core.js — dados do core: equipe de exemplo (docs/spec-dono.md), usuários de demonstração, notificações e comentários.
// IDs canônicos (use-os nos módulos para ligar dados): team 't-<nome>', users 'u-<nome>'.
// Clientes (semeados pelo módulo clientes) devem usar: c-orion, c-vida, c-alfa, c-technova, c-imob, c-bella, c-studiofit,
// c-autocenter, c-petfeliz, c-otica, c-cafe.
import { db } from './store.js';

const P = [
  // id,        nome,            ini,  cargo,                     área,          papel,            cor
  ['gabriel', 'Gabriel Leão', 'GL', 'Fundador e CEO', 'Diretoria', 'dono', '#0B6BE8'],
  ['allan', 'Allan Vieira', 'AV', 'Head de Tráfego', 'Tráfego', 'head_trafego', '#2563EB'],
  ['ana', 'Ana Souza', 'AS', 'Gestora de tráfego', 'Tráfego', 'gestor_trafego', '#7C5CFC'],
  ['bruno', 'Bruno Lima', 'BL', 'Social media e contas', 'Social', 'cs', '#0E9F6E'],
  ['felipe', 'Felipe Nunes', 'FN', 'Desenvolvedor', 'Dev', 'producao', '#475569'],
  ['carla', 'Carla Dias', 'CD', 'Designer', 'Design', 'producao', '#D9467A'],
  ['diego', 'Diego Melo', 'DM', 'Atendimento', 'Atendimento', 'cs', '#C2700A'],
  ['elisa', 'Elisa Rocha', 'EU', 'Copywriter', 'Copy', 'producao', '#0891B2'],
  ['rayane', 'Rayane Leão', 'RL', 'Administradora', 'Diretoria', 'admin', '#4F46E5'],
  ['marina', 'Marina Costa', 'MC', 'Comercial', 'Comercial', 'comercial', '#B45309'],
  ['paulo', 'Paulo Reis', 'PR', 'Financeiro', 'Financeiro', 'financeiro', '#047857'],
  ['helena', 'Helena Prado', 'HP', 'Sócia investidora', 'Diretoria', 'leitura', '#64748B'],
  ['lucas', 'Lucas Prado', 'LP', 'Ex-estagiário de social', 'Social', 'leitura', '#94A3B8'],
];
const CUSTO = { gabriel: 0, allan: 110, ana: 85, bruno: 62, felipe: 90, carla: 70, diego: 55, elisa: 58, rayane: 75, marina: 60, paulo: 65, helena: 0, lucas: 30 };
const SKILLS = {
  allan: ['Meta Ads', 'Google Ads', 'Gestão de equipe', 'Estratégia de mídia'], ana: ['Meta Ads', 'Google Ads', 'Análise de dados'], bruno: ['Social media', 'Atendimento', 'Planejamento'], felipe: ['Sites', 'Integrações', 'CRM'],
  carla: ['Design', 'Criativos', 'Motion'], diego: ['Atendimento', 'CS', 'Onboarding'], elisa: ['Copy', 'E-mail', 'Roteiros'], gabriel: ['Estratégia', 'Vendas'],
  rayane: ['Administração', 'Processos'], marina: ['Vendas', 'Propostas'], paulo: ['Financeiro', 'Cobrança'], helena: [], lucas: ['Social media'],
};
const FATURAVEL = ['ana', 'bruno', 'felipe', 'carla', 'diego', 'elisa'];

export const TEAM = P.map(([k, nome, ini, cargo, area, papel, cor]) => ({
  id: `t-${k}`, nome, iniciais: ini, cargo, area, papel, email: `${k}@agencia.demo`, userId: `u-${k}`, avatarCor: cor,
  status: k === 'carla' ? 'ausente' : k === 'elisa' ? 'ferias' : 'online', statusAte: k === 'elisa' ? '2026-11-28' : null,
  custoHora: CUSTO[k], horasMes: k === 'helena' || k === 'gabriel' ? 0 : 160, faturavel: FATURAVEL.includes(k),
  gestorId: k === 'gabriel' || k === 'helena' ? null : k === 'ana' ? 't-allan' : 't-gabriel', skills: SKILLS[k] || [], ativo: k !== 'lucas',
  telefone: '+55 11 9' + String(4000 + k.length * 731).padStart(4, '0') + '-' + String(1000 + k.charCodeAt(0) * 37).slice(0, 4),
  desde: { gabriel: '2019-03-01', allan: '2021-04-05', ana: '2022-02-14', bruno: '2023-05-02', felipe: '2021-08-09', carla: '2023-01-16', diego: '2024-03-04', elisa: '2024-07-01', rayane: '2020-01-06', marina: '2024-10-01', paulo: '2022-09-12', helena: '2021-01-01', lucas: '2025-02-03' }[k],
}));

const agora = Date.now();
const atras = min => new Date(agora - min * 60000).toISOString();

export const USERS = P.map(([k, nome, ini, cargo, area, papel, cor]) => ({
  id: `u-${k}`, nome, iniciais: ini, email: `${k}@agencia.demo`, papel, teamId: `t-${k}`, avatarCor: cor, cargo,
  ativo: k !== 'lucas', senha: 'demo123', ultimoAcesso: k === 'lucas' ? '2026-06-30T18:20:00.000Z' : atras(30 + k.length * 47),
}));

const N = (id, para, de, tipo, titulo, texto, link, min, lida = false, prioridade = 'normal') =>
  ({ id, para, de, tipo, titulo, texto, link, lida, prioridade, quando: atras(min) });

export const NOTIFICATIONS = [
  N('n-01', 'u-gabriel', null, 'alerta', 'Rotina "Sync de leads Meta → CRM" falhou 2×', 'OAuthException 190: token de acesso expirado. Reconecte o Meta Ads em Integrações.', '#/torre', 18, false, 'alta'),
  N('n-02', 'u-gabriel', 'u-ana', 'mencao', 'Ana Souza mencionou você em Grupo Orion', '@Gabriel o ROAS caiu para 1,8 (meta 3,0). Proponho um plano de resgate com nova verba de teste — pode aprovar?', '#/clientes/c-orion', 42, false, 'alta'),
  N('n-13', 'u-gabriel', 'u-diego', 'mencao', 'Diego Melo mencionou você em Grupo Orion', '@Gabriel o decisor pediu uma call amanhã às 10h para falar do resgate. Você participa?', '#/clientes/c-orion', 64),
  N('n-14', 'u-gabriel', 'u-carla', 'mencao', 'Carla Dias mencionou você em Grupo Orion', '@Gabriel subi as 6 peças do resgate no drive. Preciso do seu ok até amanhã.', '#/clientes/c-orion', 96),
  N('n-03', 'u-gabriel', null, 'alerta', 'Fatura vencida: Bella Moda', 'R$ 6.800 · 9 dias em atraso. O lembrete automático já foi enviado 2×.', '#/financeiro', 125),
  N('n-04', 'u-gabriel', 'u-diego', 'atribuicao', 'Diego Melo atribuiu a você: reunião de renovação da TechNova', 'Renova em 6 dias e ainda não há reunião marcada.', '#/clientes/c-technova', 190),
  N('n-05', 'u-gabriel', null, 'alerta', 'Ana Souza em 118% de ocupação', '3ª semana seguida acima de 100%. Considere redistribuir tarefas.', '#/equipe/t-ana', 310),
  N('n-06', 'u-gabriel', 'u-paulo', 'mensagem', 'Paulo Reis: conciliação com 3 itens sem par', 'Três lançamentos do extrato de ontem não bateram com contas a receber. Estou verificando.', '#/financeiro', 480, true),
  N('n-07', 'u-gabriel', 'u-bruno', 'mencao', 'Bruno Lima mencionou você em Clínica Vida', '@Gabriel renovação de 08/12 alinhada. Eles querem incluir um site novo no escopo.', '#/clientes/c-vida', 1380, true),
  N('n-08', 'u-gabriel', null, 'sistema', 'Health score dos clientes atrasou 35 min', 'A rotina das 23:25 terminou com atraso. A próxima execução é às 00:00.', '#/torre', 1460, true),
  N('n-09', 'u-gabriel', 'u-marina', 'mensagem', 'Marina Costa: proposta enviada para Rede Sabor', 'Proposta de R$ 7.500/mês (tráfego + social). Retorno prometido para sexta.', '#/comercial', 1720, true),
  N('n-10', 'u-gabriel', 'u-rayane', 'atribuicao', 'Rayane Leão adicionou você ao webinar "Tráfego que Vende 2.0"', 'Você é o apresentador. Ensaio marcado para quinta, 19h.', '#/webinars', 2900, true),
  N('n-11', 'u-gabriel', null, 'alerta', 'Café Raiz renova em 21 dias com health 61', '3 dias de atraso no pagamento e tendência de queda nos últimos 6 meses.', '#/clientes/c-cafe', 3100, true),
  N('n-12', 'u-gabriel', null, 'sistema', 'Backup de criativos está pausado há 5 dias', 'Retome a rotina para voltar a copiar as artes aprovadas para o drive.', '#/torre', 4400, true),
  // outras pessoas
  N('n-20', 'u-ana', 'u-gabriel', 'mencao', 'Gabriel Leão mencionou você em Grupo Orion', '@Ana aprovado o teste com nova verba. Me mande o resultado na sexta.', '#/clientes/c-orion', 25),
  N('n-21', 'u-ana', null, 'alerta', 'Alerta de verba: Construtora Alfa passou de 90% do orçamento', 'Investimento do mês em 92% com 6 dias restantes.', '#/torre', 140),
  N('n-22', 'u-ana', 'u-carla', 'mensagem', 'Carla Dias: criativos do Grupo Orion prontos para aprovação', '6 peças novas no drive, pasta "Resgate nov".', '#/operacao', 600, true),
  N('n-23', 'u-diego', null, 'alerta', 'Rotina "Sync de leads Meta → CRM" falhou 2×', 'Você é o responsável. Erro: token de acesso expirado.', '#/torre', 18, false, 'alta'),
  N('n-24', 'u-diego', 'u-gabriel', 'atribuicao', 'Gabriel Leão atribuiu a você: ligar para o decisor do Grupo Orion', 'Decisor não responde há 11 dias.', '#/clientes/c-orion', 220),
  N('n-25', 'u-paulo', null, 'alerta', 'Fatura vencida: Bella Moda', 'R$ 6.800 · 9 dias em atraso.', '#/financeiro', 125),
  N('n-26', 'u-paulo', null, 'sistema', 'Conciliação bancária: 3 itens sem par', 'Extrato de ontem 22:00.', '#/financeiro', 500),
  N('n-27', 'u-carla', 'u-ana', 'atribuicao', 'Ana Souza atribuiu a você: 6 criativos para o Grupo Orion', 'Prazo: quinta-feira.', '#/operacao', 900),
  N('n-28', 'u-bruno', 'u-gabriel', 'mensagem', 'Gabriel Leão: ótimo trabalho na Clínica Vida', 'Health 88 e renovação encaminhada. Obrigado!', '#/clientes/c-vida', 1300),
  N('n-29', 'u-rayane', null, 'sistema', 'Novo acesso: Marina Costa entrou pela primeira vez no celular', 'Se não reconhece este acesso, redefina a senha.', '#/admin', 2000, true),
];

// referência da entidade (agrupa no sino: "3 menções em Grupo Orion")
const REF = { 'n-02': 'c-orion', 'n-13': 'c-orion', 'n-14': 'c-orion', 'n-07': 'c-vida', 'n-20': 'c-orion', 'n-04': 'c-technova', 'n-24': 'c-orion', 'n-11': 'c-cafe', 'n-28': 'c-vida' };
NOTIFICATIONS.forEach(n => { if (REF[n.id]) { n.refCol = 'clients'; n.refId = REF[n.id]; } });

export const COMMENTS = [
  { id: 'cm-01', refCol: 'clients', refId: 'c-orion', autor: 'u-ana', texto: '@Gabriel o ROAS caiu para 1,8 (meta 3,0). Proponho um plano de resgate com nova verba de teste — pode aprovar?', mencoes: ['u-gabriel'], quando: atras(42) },
  { id: 'cm-03', refCol: 'clients', refId: 'c-orion', autor: 'u-carla', texto: '@Gabriel subi as 6 peças do resgate no drive. Preciso do seu ok até amanhã.', mencoes: ['u-gabriel'], quando: atras(96) },
  { id: 'cm-04', refCol: 'clients', refId: 'c-orion', autor: 'u-diego', texto: '@Gabriel o decisor pediu uma call amanhã às 10h para falar do resgate. Você participa?', mencoes: ['u-gabriel'], quando: atras(64) },
  { id: 'cm-02', refCol: 'clients', refId: 'c-orion', autor: 'u-gabriel', texto: '@Ana aprovado o teste com nova verba. Me mande o resultado na sexta.', mencoes: ['u-ana'], quando: atras(25) },
];

export function seedCore() {
  db.seed('team', TEAM);
  db.seed('users', USERS);
  db.seed('notifications', NOTIFICATIONS);
  db.seed('comments', COMMENTS);
}
seedCore();
