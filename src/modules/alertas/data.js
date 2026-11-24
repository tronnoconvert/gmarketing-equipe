// alertas/data.js — semente de alertas, regras (os 7 essenciais do documento, §8) e insights automáticos.
// A luz mestra do topo lê alerts.{gravidade,status}: 2 críticos em aberto = "2 alertas críticos".
import { db } from '../../core/store.js';

const H0 = new Date(); H0.setHours(0, 0, 0, 0);
const T0 = H0.getTime();
const MIN = 6e4, DIA = 864e5;
const ontem = (h, m = 0) => new Date(T0 - DIA + (h * 60 + m) * MIN).toISOString();
const atras = min => new Date(Date.now() - min * MIN).toISOString();

const A = o => ({ status: 'aberto', resolvido: false, atribuidoA: null, adiadoAte: null, ...o });

export const ALERTS = [
  A({ id: 'a-orion', gravidade: 'err', area: 'Clientes', titulo: 'Grupo Orion: score caiu 22 pts', detalhe: 'Health 41 · 3 entregas atrasadas · ROAS 1,8 vs meta 3,0 · MRR R$ 14.200', quando: atras(95),
    regraId: 'rg-mrr-score', refCol: 'clients', refId: 'c-orion', para: ['t-gabriel', 't-ana'], acao: { rotulo: 'Abrir plano de resgate', href: '#/clientes/c-orion?acao=resgate' } }),
  A({ id: 'a-sync', gravidade: 'err', area: 'Torre', titulo: 'Rotina "Sync de leads" falhou 2×', detalhe: 'Erro de token Meta (OAuthException 190) · última tentativa 23:42', quando: ontem(23, 42),
    regraId: 'rg-torre', refCol: 'routines', refId: 'r-sync-leads', para: ['t-gabriel', 't-diego', 't-felipe'], acao: { rotulo: 'Ver log', href: '#/torre/rotina/r-sync-leads' } }),
  A({ id: 'a-bella', gravidade: 'warn', area: 'Financeiro', titulo: 'Fatura vencida: Bella Moda', detalhe: 'R$ 6.800 · 9 dias em atraso · lembrete automático já enviado 2×', quando: atras(125),
    regraId: 'rg-fatura', refCol: 'clients', refId: 'c-bella', para: ['t-gabriel', 't-paulo', 't-bruno'], acao: { rotulo: 'Cobrar', href: '#/financeiro/receber?cobrar=' } }),
  A({ id: 'a-ana', gravidade: 'warn', area: 'Equipe', titulo: 'Ana Souza em 118% de ocupação', detalhe: '3ª semana seguida acima de 100% · 5 clientes sob responsabilidade', quando: atras(310),
    regraId: 'rg-ocupacao', refCol: 'team', refId: 't-ana', para: ['t-gabriel'], acao: { rotulo: 'Redistribuir', href: '#/equipe/t-ana?acao=redistribuir' } }),
  A({ id: 'a-technova', gravidade: 'warn', area: 'Clientes', titulo: 'TechNova renova em 6 dias', detalhe: 'Nenhuma reunião de renovação marcada · MRR R$ 9.700 · health 63', quando: atras(190),
    regraId: 'rg-renovacao', refCol: 'clients', refId: 'c-technova', para: ['t-gabriel', 't-bruno', 't-diego'], acao: { rotulo: 'Agendar reunião', href: '#/clientes/c-technova?acao=agendar' } }),
  A({ id: 'a-crm', gravidade: 'warn', area: 'Torre', titulo: 'Token do CRM expira em 5 dias', detalhe: 'Se expirar, o Sync de leads para de criar contatos no CRM', quando: atras(240),
    regraId: 'rg-torre', refCol: 'integrations', refId: 'i-crm', para: ['t-gabriel', 't-felipe'], acao: { rotulo: 'Reconectar CRM', href: '#/torre?reconectar=i-crm' } }),
  A({ id: 'a-health', gravidade: 'warn', area: 'Torre', titulo: 'Rotina "Health score dos clientes" atrasada', detalhe: 'Execução das 23:24 terminou com 35 min de atraso · próxima às 00:00', quando: ontem(23, 25),
    regraId: 'rg-torre', refCol: 'routines', refId: 'r-health', para: ['t-gabriel', 't-felipe'], acao: { rotulo: 'Ver log', href: '#/torre/rotina/r-health' } }),
  // resolvidos recentemente (histórico do feed)
  A({ id: 'a-verba-vida', gravidade: 'warn', area: 'Tráfego', titulo: 'Clínica Vida passou de 90% da verba de mídia', detalhe: 'Conta Meta em 92% do orçamento mensal no dia 21', quando: atras(3 * 1440 + 200),
    regraId: null, refCol: 'clients', refId: 'c-vida', para: ['t-gabriel', 't-ana'], acao: { rotulo: 'Abrir cliente', href: '#/clientes/c-vida' },
    status: 'resolvido', resolvido: true, resolvidoEm: atras(3 * 1440 + 90), resolvidoPor: 'Ana Souza', nota: 'Verba remanejada de Google para Meta.' }),
  A({ id: 'a-entrega-imob', gravidade: 'warn', area: 'Operação', titulo: 'Entrega atrasada: landing page da Imob Prime', detalhe: '3 dias de atraso · responsável Felipe Nunes', quando: atras(2 * 1440 + 400),
    regraId: 'rg-entrega', refCol: 'clients', refId: 'c-imob', para: ['t-gabriel', 't-diego', 't-felipe'], acao: { rotulo: 'Abrir quadro', href: '#/operacao/quadro' },
    status: 'resolvido', resolvido: true, resolvidoEm: atras(1440 + 300), resolvidoPor: 'Felipe Nunes', nota: 'Landing publicada e aprovada pelo cliente.' }),
];

/** 7 regras essenciais (docs/spec-dono.md §8). params editáveis; destinatários = ids de team; resp = inclui o responsável do cliente/rotina */
export const RULES = [
  { id: 'rg-mrr-score', nome: 'Cliente de MRR alto com score caindo', area: 'Clientes', gravidade: 'err', params: { mrrMin: 10000, queda: 15 },
    canais: ['app', 'whatsapp'], destinatarios: ['t-gabriel'], resp: true, ativo: true, disparos30: 2, ultimoDisparo: atras(95) },
  { id: 'rg-entrega', nome: 'Entrega atrasada mais de 2 dias', area: 'Operação', gravidade: 'warn', params: { dias: 2 },
    canais: ['app', 'slack'], destinatarios: ['t-diego'], resp: true, ativo: true, disparos30: 6, ultimoDisparo: atras(2 * 1440 + 400) },
  { id: 'rg-fatura', nome: 'Fatura vencida há mais de 7 dias', area: 'Financeiro', gravidade: 'warn', params: { dias: 7 },
    canais: ['app', 'email', 'whatsapp'], destinatarios: ['t-gabriel', 't-paulo'], resp: true, ativo: true, disparos30: 3, ultimoDisparo: atras(125) },
  { id: 'rg-torre', nome: 'Rotina ou integração vermelha', area: 'Torre', gravidade: 'err', params: { falhas: 2 },
    canais: ['app', 'whatsapp', 'slack'], destinatarios: ['t-gabriel', 't-felipe'], resp: true, ativo: true, disparos30: 4, ultimoDisparo: ontem(23, 42) },
  { id: 'rg-ocupacao', nome: 'Pessoa acima de 100% de ocupação', area: 'Equipe', gravidade: 'warn', params: { limite: 100, semanas: 2 },
    canais: ['app', 'email'], destinatarios: ['t-gabriel'], resp: false, ativo: true, disparos30: 3, ultimoDisparo: atras(310) },
  { id: 'rg-renovacao', nome: 'Renovação em menos de 30 dias sem reunião', area: 'Clientes', gravidade: 'warn', params: { dias: 30 },
    canais: ['app', 'email'], destinatarios: ['t-gabriel', 't-diego'], resp: true, ativo: true, disparos30: 2, ultimoDisparo: atras(190) },
  { id: 'rg-runway', nome: 'Runway abaixo de 3 meses', area: 'Financeiro', gravidade: 'err', params: { meses: 3 },
    canais: ['app', 'whatsapp', 'email'], destinatarios: ['t-gabriel', 't-paulo'], resp: false, ativo: true, disparos30: 0, ultimoDisparo: null },
];

export const INSIGHTS = [
  { id: 'ins-ana', tipo: 'risco', estado: 'warn', area: 'Equipe', titulo: 'O maior cliente em risco é da Ana, que está em 118% de ocupação',
    texto: 'Grupo Orion (R$ 14,2 mil, health 41) é 59% do MRR em risco e está na carteira da Ana, na 3ª semana acima de 100%. Redistribuir 1 ou 2 contas dela libera tempo para o plano de resgate e pode reduzir o risco.', acao: { rotulo: 'Redistribuir', href: '#/equipe/t-ana?acao=redistribuir' }, criadoEm: atras(60),
    textoEquipe: 'Grupo Orion (health 41) é o cliente em pior situação e está na carteira da Ana, na 3ª semana acima de 100%. Redistribuir 1 ou 2 contas dela libera tempo para o plano de resgate e pode reduzir o risco.' },
  { id: 'ins-meta', tipo: 'risco', estado: 'err', area: 'Torre', titulo: 'Leads do Meta não chegam ao CRM desde 23:12',
    texto: 'Enquanto o token do Meta estiver expirado, os leads de formulário dos clientes de tráfego ficam parados no Meta. Reconectar leva 1 minuto.', acao: { rotulo: 'Reconectar Meta Ads', href: '#/torre?reconectar=i-meta' }, criadoEm: atras(30), refId: 'i-meta' },
  { id: 'ins-renov', tipo: 'risco', estado: 'warn', area: 'Clientes', titulo: 'R$ 22,5 mil de MRR renovam em 15 dias e só metade tem reunião',
    tituloEquipe: '2 contratos renovam em 15 dias e só um tem reunião', textoEquipe: 'TechNova (health 63) e Clínica Vida (health 88) renovam até 08/12. A Clínica Vida já está alinhada; a TechNova ainda não tem reunião.',
    texto: 'TechNova (R$ 9.700, health 63) e Clínica Vida (R$ 12.800, health 88) renovam até 08/12. A Clínica Vida já está alinhada; a TechNova ainda não tem reunião.', acao: { rotulo: 'Agendar com TechNova', href: '#/clientes/c-technova?acao=agendar' }, criadoEm: atras(180) },
  { id: 'ins-bella', tipo: 'risco', estado: 'warn', area: 'Financeiro', titulo: 'Bella Moda: atraso no pagamento veio junto com a queda do health',
    texto: 'O health caiu de 66 para 48 em 6 meses e a fatura está 9 dias atrasada. Trate cobrança e resultado na mesma conversa, não em separado.', acao: { rotulo: 'Abrir ficha', href: '#/clientes/c-bella' }, criadoEm: atras(240) },
  { id: 'ins-comercial', tipo: 'oportunidade', estado: 'warn', area: 'Comercial', titulo: '2 propostas acima de R$ 7 mil estão com a próxima ação vencida',
    texto: 'Rede Sabor e Construtora Horizonte somam R$ 17,3 mil de MRR em negociação. Um contato hoje mantém as duas vivas.', acao: { rotulo: 'Ver oportunidades', href: '#/comercial/pipeline?f=atrasadas' }, criadoEm: atras(300) },
  { id: 'ins-prazo', tipo: 'eficiencia', estado: 'warn', area: 'Operação', titulo: 'Entregas no prazo caíram para 91% (meta 95%)',
    texto: '6 dos 10 atrasos do mês são de design, e a Carla está ausente. Antecipar a aprovação dos criativos ou dividir a fila com um freelancer resolve a maior parte.', acao: { rotulo: 'Abrir operação', href: '#/operacao' }, criadoEm: atras(420) },
  { id: 'ins-concentracao', tipo: 'saude', estado: 'ok', area: 'Financeiro', titulo: 'Concentração: top 3 clientes = 20,6% do MRR (saudável)',
    texto: 'Grupo Orion, Clínica Vida e Construtora Alfa somam R$ 38,5 mil de R$ 186,4 mil. O limite de atenção é 40%. Atenção só ao Grupo Orion, que está em risco.', acao: { rotulo: 'Ver rentabilidade', href: '#/financeiro/rentabilidade' }, criadoEm: atras(720) },
];

db.seed('alerts', ALERTS);
db.seed('alertRules', RULES);
db.seed('insights', INSIGHTS);
