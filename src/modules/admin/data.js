// data.js — sementes do módulo Administração: convites (coleção própria) e histórico de auditoria.
// O histórico entra em `activity` com {chave} para não depender de a coleção estar vazia (o core grava activity a cada {log}).
import { db } from '../../core/store.js';

const agora = Date.now();
const atras = min => new Date(agora - min * 60000).toISOString();
const dia = 1440;

export const INVITES = [
  { id: 'inv-joana', nome: 'Joana Ribeiro', email: 'joana@agencia.demo', papel: 'producao', teamId: null, status: 'pendente', enviadoEm: atras(2 * dia + 190), enviadoPor: 'u-rayane', expiraEm: new Date(agora + 5 * dia * 60000).toISOString(), reenvios: 0 },
  { id: 'inv-thiago', nome: 'Thiago Martins', email: 'thiago.martins@agencia.demo', papel: 'gestor_trafego', teamId: null, status: 'expirado', enviadoEm: atras(9 * dia), enviadoPor: 'u-gabriel', expiraEm: atras(2 * dia), reenvios: 1 },
  { id: 'inv-marina', nome: 'Marina Costa', email: 'marina@agencia.demo', papel: 'comercial', teamId: 't-marina', status: 'aceito', enviadoEm: atras(55 * dia), enviadoPor: 'u-rayane', aceitoEm: atras(54 * dia), userId: 'u-marina' },
];

const A = (id, quem, quemNome, oque, col, refId, min) => ({ id, quem, quemNome, oque, col, refId, quando: atras(min) });
export const HISTORICO = [
  A('act-h01', 'u-ana', 'Ana Souza', 'registrou ação: nova verba de teste aprovada', 'clients', 'c-orion', 38),
  A('act-h02', 'u-gabriel', 'Gabriel Leão', 'aprovou plano de resgate', 'clients', 'c-orion', 64),
  A('act-h03', 'u-paulo', 'Paulo Reis', 'enviou cobrança da fatura', 'invoices', 'inv-bella-nov', 150),
  A('act-h04', 'u-diego', 'Diego Melo', 'pausou a rotina "Backup de criativos"', 'routines', 'r-backup', 5 * dia + 80),
  A('act-h05', 'u-rayane', 'Rayane Leão', 'convidou Joana Ribeiro (Produção)', 'invites', 'inv-joana', 2 * dia + 190),
  A('act-h06', 'u-rayane', 'Rayane Leão', 'alterou permissões', 'settings', 'perms', 3 * dia + 30),
  A('act-h07', 'u-carla', 'Carla Dias', 'concluiu tarefa: 6 criativos Grupo Orion', 'tasks', 'tk-orion-criativos', 600),
  A('act-h08', 'u-bruno', 'Bruno Lima', 'atualizou cadastro do cliente', 'clients', 'c-vida', 1400),
  A('act-h09', 'u-marina', 'Marina Costa', 'moveu negócio para Proposta enviada', 'deals', 'dl-rede-sabor', 1720),
  A('act-h10', 'u-gabriel', 'Gabriel Leão', 'desativou o acesso de Lucas Prado', 'users', 'u-lucas', 147 * dia),
  A('act-h11', 'u-rayane', 'Rayane Leão', 'alterou custo/hora de Felipe Nunes', 'team', 't-felipe', 20 * dia),
  A('act-h12', 'u-ana', 'Ana Souza', 'alterou orçamento da campanha', 'campaigns', 'cp-orion-remarketing', 2 * dia + 300),
  A('act-h13', 'u-paulo', 'Paulo Reis', 'conciliou 42 lançamentos', 'cash', 'cx-nov', 4 * dia),
  A('act-h14', 'u-felipe', 'Felipe Nunes', 'reconectou integração Google Ads', 'integrations', 'int-google', 12 * dia),
  A('act-h15', 'u-gabriel', 'Gabriel Leão', 'alterou MRR do contrato', 'contracts', 'ct-technova', 33 * dia),
];

db.seed('invites', INVITES);
db.seed('activity', HISTORICO, { chave: 'admin-historico' });
