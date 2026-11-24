// torre/data.js — semente de rotinas, execuções e integrações (docs/spec-dono.md §4, valores exatos).
// O "instantâneo" do documento é a virada do dia: falhas de ontem 23:12/23:42, retry 00:12. Horários fixos usam
// o relógio de hoje/ontem; "há X min" usa o momento do carregamento.
import { db } from '../../core/store.js';

const H0 = new Date(); H0.setHours(0, 0, 0, 0);
const T0 = H0.getTime();
const MIN = 6e4, DIA = 864e5;
const ontem = (h, m = 0) => new Date(T0 - DIA + (h * 60 + m) * MIN).toISOString();
const hoje = (h, m = 0) => new Date(T0 + (h * 60 + m) * MIN).toISOString();
const amanha = (h, m = 0) => new Date(T0 + DIA + (h * 60 + m) * MIN).toISOString();
const atras = min => new Date(Date.now() - min * MIN).toISOString();
const passado = iso => (new Date(iso).getTime() > Date.now() ? atras(60) : iso);
const ultimaSegunda = (() => { const d = new Date(T0); const dw = d.getDay(); d.setDate(d.getDate() - ((dw + 6) % 7 || 7)); d.setHours(8, 0, 0, 0); return d.toISOString(); })();
const proximaSegunda = (() => { const d = new Date(ultimaSegunda); d.setDate(d.getDate() + 7); return d.toISOString(); })();
// terça 08:00 mais recente já passada (ou hoje, se já passou das 08:00) e a próxima
const ultimaTerca = (() => { const d = new Date(T0); d.setDate(d.getDate() - ((d.getDay() + 5) % 7)); d.setHours(8, 0, 0, 0); if (d.getTime() > Date.now()) d.setDate(d.getDate() - 7); return d.toISOString(); })();
const proximaTerca = (() => { const d = new Date(ultimaTerca); d.setDate(d.getDate() + 7); return d.toISOString(); })();

/** histórico de 30 dias (índice 0 = mais antigo, 29 = hoje); dias do documento são 1..30 */
const hist = (marcas = {}, base = 'ok') => Array.from({ length: 30 }, (_, i) => marcas[i + 1] || base);

const R = (o) => ({ ativo: true, falhas: 0, erro: null, integracoes: [], canais: ['app'], ...o });

export const ROUTINES = [
  R({ id: 'r-sync-leads', nome: 'Sync de leads Meta → CRM', desc: 'Puxa leads dos formulários e cria contatos no CRM', estado: 'err',
    ultimaEm: ontem(23, 42), ultimaRotulo: '23:42 · falhou', proximaEm: hoje(0, 12), proximaRotulo: 'retry 00:12', duracaoS: 4,
    sucesso30: 86.7, respId: 't-diego', freq: 'a cada 15 min', freqMin: 15, erro: 'OAuthException 190: token de acesso expirado', erroCod: 'OAuthException 190', falhas: 2,
    hist30: hist({ 22: 'warn', 23: 'warn', 28: 'err', 30: 'err' }), integracoes: ['i-meta', 'i-crm'], canais: ['app', 'whatsapp'],
    guia: { titulo: 'Token do Meta expirou: reconecte a integração Meta Ads em Integrações.', texto: 'Desde 23:12 o Meta recusa o acesso (OAuthException 190). Os leads ficam guardados no Meta por 90 dias e entram no CRM assim que a conexão voltar — nada se perde. Depois de reconectar, a rotina roda sozinha para confirmar.', integ: 'i-meta' } }),
  R({ id: 'r-health', nome: 'Health score dos clientes', desc: 'Recalcula o score com entregas, resultado e pagamentos', estado: 'warn',
    ultimaEm: ontem(23, 25), ultimaRotulo: '23:25 · 35 min atraso', proximaEm: hoje(0, 0), proximaRotulo: '00:00', duracaoS: 2100,
    sucesso30: 93.3, respId: 't-felipe', freq: 'a cada hora', freqMin: 60, hist30: hist({ 13: 'warn', 29: 'warn', 30: 'warn' }), integracoes: ['i-monday'],
    aviso: 'Execução das 23:24 terminou com 35 min de atraso.',
    guia: { titulo: 'A rotina está atrasando: a fila de cálculo ficou lenta entre 22h e 23h.', texto: 'O monday.com respondeu devagar e o cálculo dos 42 clientes levou 35 min (normal: 40 s). Rode agora para atualizar os scores; se atrasar de novo, avise o Felipe.' } }),
  R({ id: 'r-torre', nome: 'Torre de Controle', desc: 'Monitora todas as rotinas e dispara alertas', estado: 'ok',
    ultimaEm: atras(4), ultimaRotulo: null, duracaoS: 3, proximaEm: new Date(Date.now() + MIN).toISOString(), proximaRotulo: null,
    sucesso30: 100, respId: 't-felipe', freq: 'a cada 5 min', freqMin: 5, hist30: hist() }),
  R({ id: 'r-cobranca', nome: 'Cobrança automática', desc: 'Envia boletos e lembretes de vencimento', estado: 'ok',
    ultimaEm: atras(60), duracaoS: 12, proximaEm: hoje(9, 0), proximaRotulo: '09:00', sucesso30: 100, respId: 't-elisa', freq: 'diária', freqMin: 1440, hist30: hist(), integracoes: ['i-banco'], canais: ['app', 'email'] }),
  R({ id: 'r-relatorio-semanal', nome: 'Relatório semanal de clientes', desc: 'Gera e envia o PDF de resultados para cada cliente', estado: 'ok',
    ultimaEm: ultimaSegunda, ultimaRotulo: 'seg 08:00 · 4 min', duracaoS: 240, proximaEm: proximaSegunda, proximaRotulo: 'seg 08:00', sucesso30: 100, respId: 't-bruno', freq: 'semanal', freqMin: 10080, hist30: hist(), integracoes: ['i-ga4', 'i-drive'], canais: ['app', 'email'] }),
  R({ id: 'r-verba', nome: 'Alerta de verba de mídia', desc: 'Avisa quando uma conta passa de 90% do orçamento', estado: 'ok',
    ultimaEm: atras(12), duracaoS: 6, proximaEm: new Date(Date.now() + 18 * MIN).toISOString(), proximaRotulo: null, sucesso30: 99.1, respId: 't-ana', freq: 'a cada 30 min', freqMin: 30, hist30: hist({ 10: 'warn' }), integracoes: ['i-meta', 'i-google-ads'], canais: ['app', 'whatsapp'] }),
  R({ id: 'r-whatsapp', nome: 'Resumo diário no WhatsApp', desc: 'Manda o pulso da agência para o dono às 07:30', estado: 'ok',
    ultimaEm: passado(hoje(7, 30)), ultimaRotulo: 'hoje 07:30 · 8 s', duracaoS: 8, proximaEm: amanha(7, 30), proximaRotulo: 'amanhã 07:30', sucesso30: 100, respId: 't-elisa', freq: 'diária', freqMin: 1440, hist30: hist(), integracoes: ['i-whatsapp'], canais: ['whatsapp'] }),
  R({ id: 'r-conciliacao', nome: 'Conciliação bancária', desc: 'Cruza extrato com contas a receber', estado: 'warn',
    ultimaEm: ontem(22, 0), ultimaRotulo: 'ontem 22:00 · 3 itens sem par', duracaoS: 41, proximaEm: hoje(22, 0), proximaRotulo: 'hoje 22:00', sucesso30: 96.7, respId: 't-elisa', freq: 'diária', freqMin: 1440, hist30: hist({ 30: 'warn' }), integracoes: ['i-banco'], canais: ['app', 'email'],
    aviso: '3 lançamentos do extrato não bateram com contas a receber.',
    guia: { titulo: '3 lançamentos do extrato ficaram sem par.', texto: 'São recebimentos sem fatura correspondente (provável pagamento com valor diferente). Confira em Financeiro › Contas a receber e vincule manualmente; a próxima execução às 22:00 confirma.', href: '#/financeiro/receber', rotulo: 'Abrir contas a receber' } }),
  R({ id: 'r-backup', nome: 'Backup de criativos', desc: 'Copia artes aprovadas para o drive', estado: 'off',
    ultimaEm: atras(5 * 1440), ultimaRotulo: 'há 5 dias', duracaoS: 95, proximaEm: null, proximaRotulo: '—', sucesso30: 100, respId: 't-carla', freq: 'diária · pausada', freqMin: 1440, hist30: hist({ 26: 'off', 27: 'off', 28: 'off', 29: 'off', 30: 'off' }), integracoes: ['i-drive'],
    pausadaEm: atras(5 * 1440 - 30), pausadaPor: 'Carla Dias', motivoPausa: 'Reorganização das pastas do drive' }),
  // 6 rotinas ok complementares (o resumo do documento conta 15; + Guardião de segurança = 16)
  R({ id: 'r-google-ads', nome: 'Sync Google Ads', desc: 'Importa gastos e conversões das contas Google Ads', estado: 'ok', ultimaEm: atras(22), duracaoS: 14, proximaEm: new Date(Date.now() + 38 * MIN).toISOString(), proximaRotulo: null, sucesso30: 99.6, respId: 't-ana', freq: 'a cada hora', freqMin: 60, hist30: hist({ 17: 'warn' }), integracoes: ['i-google-ads'] }),
  R({ id: 'r-mrr', nome: 'Atualização de MRR', desc: 'Recalcula MRR, churn e expansão a partir dos contratos', estado: 'ok', ultimaEm: passado(hoje(6, 0)), ultimaRotulo: 'hoje 06:00 · 9 s', duracaoS: 9, proximaEm: amanha(6, 0), proximaRotulo: 'amanhã 06:00', sucesso30: 100, respId: 't-paulo', freq: 'diária', freqMin: 1440, hist30: hist(), canais: ['app', 'email'] }),
  R({ id: 'r-reunioes', nome: 'Lembrete de reuniões', desc: 'Avisa cliente e responsável 1 dia antes de cada reunião', estado: 'ok', ultimaEm: atras(130), duracaoS: 5, proximaEm: hoje(18, 0), proximaRotulo: 'hoje 18:00', sucesso30: 100, respId: 't-diego', freq: 'diária', freqMin: 1440, hist30: hist(), integracoes: ['i-whatsapp'], canais: ['app', 'whatsapp'] }),
  R({ id: 'r-entregas', nome: 'Monitor de entregas', desc: 'Marca entregas atrasadas e avisa o responsável', estado: 'ok', ultimaEm: atras(9), duracaoS: 7, proximaEm: new Date(Date.now() + 51 * MIN).toISOString(), proximaRotulo: null, sucesso30: 98.9, respId: 't-bruno', freq: 'a cada hora', freqMin: 60, hist30: hist({ 8: 'warn' }), integracoes: ['i-monday'] }),
  R({ id: 'r-renovacoes', nome: 'Lembrete de renovações', desc: 'Toda terça avisa o responsável dos contratos que renovam nos próximos 30 dias', estado: 'ok', ultimaEm: ultimaTerca, ultimaRotulo: 'ter 08:00 · 6 s', duracaoS: 6, proximaEm: proximaTerca, proximaRotulo: 'ter 08:00', sucesso30: 100, respId: 't-diego', freq: 'semanal', freqMin: 10080, hist30: hist(), canais: ['app', 'email'] }),
  R({ id: 'r-monday', nome: 'Sync monday.com', desc: 'Sincroniza tarefas e prazos com os quadros do monday.com', estado: 'ok', ultimaEm: atras(6), duracaoS: 11, proximaEm: new Date(Date.now() + 9 * MIN).toISOString(), proximaRotulo: null, sucesso30: 99.4, respId: 't-felipe', freq: 'a cada 15 min', freqMin: 15, hist30: hist({ 4: 'warn' }), integracoes: ['i-monday'] }),
  // Guardião de segurança (docs/SEGURANCA-INVASAO.md): possível invasão nas contas Meta → pausa a conta, quarentena e sirene para todos
  R({ id: 'r-guardiao', nome: 'Guardião de segurança (a cada 2 min)', desc: 'Vigia mudanças bruscas nas contas Meta (orçamento, gasto por hora, admin novo, campanha fora da equipe) e pausa a conta na hora em caso de possível invasão', estado: 'ok',
    ultimaEm: atras(1), duracaoS: 4, proximaEm: new Date(Date.now() + MIN).toISOString(), proximaRotulo: null, sucesso30: 100, respId: 't-gabriel', freq: 'a cada 2 min', freqMin: 2, hist30: hist(), integracoes: [], canais: ['app', 'whatsapp', 'email'] }),
];

/* ---------- execuções (linha do tempo de ontem + log) ---------- */
const RUNS = [];
let k = 0;
let TL = true; // execuções da linha do tempo "Execuções de ontem" (§4.4)
const run = (rotinaId, inicio, estado, duracaoS, msg, detalhe = null) => RUNS.push({ id: `rr-${(++k).toString().padStart(4, '0')}`, rotinaId, inicio, estado, duracaoS, msg, detalhe, tl: TL });
const pseudo = (i, a, b) => a + ((i * 7919) % (b - a + 1));

// Sync de leads: a cada 1h30 até 22h ok; 22:36 atenção; 23:12 e 23:42 falharam
for (let m = 0, i = 0; m <= 21 * 60; m += 90, i++) run('r-sync-leads', ontem(0, m), 'ok', pseudo(i, 4, 8), `${pseudo(i, 3, 14)} leads sincronizados com o CRM`);
run('r-sync-leads', ontem(22, 36), 'warn', 48, 'Lenta: 48 s (normal: 6 s)', 'O Meta respondeu com aviso "token próximo de expirar" (code 463).');
run('r-sync-leads', ontem(23, 12), 'err', 2, 'OAuthException 190: token de acesso expirado', 'Tentativa 1 de 3 · nenhum lead importado · o Meta recusou o token de acesso da Business Manager.');
run('r-sync-leads', ontem(23, 42), 'err', 2, 'OAuthException 190: token de acesso expirado', 'Tentativa 2 de 3 · nenhum lead importado · próxima tentativa às 00:12.');
// Health score: de hora em hora até 22h ok; 23:24 atenção
for (let h = 0; h <= 22; h++) run('r-health', ontem(h, 0), 'ok', pseudo(h, 34, 52), '42 clientes recalculados');
run('r-health', ontem(23, 24), 'warn', 2100, 'Terminou com 35 min de atraso', 'Fila de cálculo lenta: o monday.com levou 31 min para responder a lista de entregas.');
// Torre: a cada 45 min ok
for (let m = 0, i = 0; m < 24 * 60; m += 45, i++) run('r-torre', ontem(0, m), 'ok', pseudo(i, 2, 4), '16 rotinas e 8 integrações verificadas');
// Alerta de verba: de hora em hora ok
for (let h = 0; h < 24; h++) run('r-verba', ontem(h, 0), 'ok', pseudo(h, 4, 7), h === 15 ? '1 conta em 86% do orçamento (abaixo do limite de 90%)' : 'Nenhuma conta acima de 90% do orçamento');
run('r-cobranca', ontem(9, 0), 'ok', 12, '7 boletos e 12 lembretes de vencimento enviados');
run('r-whatsapp', ontem(7, 30), 'ok', 8, 'Resumo enviado para Gabriel Leão');
run('r-conciliacao', ontem(22, 0), 'warn', 41, '3 lançamentos sem par no extrato', 'Recebimentos de R$ 1.180, R$ 2.400 e R$ 640 sem fatura correspondente.');
// últimas execuções de hoje e de rotinas que não rodaram ontem (para o log)
TL = false;
run('r-torre', atras(4), 'ok', 3, '16 rotinas e 8 integrações verificadas · 1 falha, 2 em atenção');
run('r-torre', atras(9), 'ok', 3, '16 rotinas e 8 integrações verificadas · 1 falha, 2 em atenção');
run('r-verba', atras(12), 'ok', 6, 'Nenhuma conta acima de 90% do orçamento');
run('r-cobranca', atras(60), 'ok', 12, '3 lembretes de vencimento enviados');
run('r-whatsapp', passado(hoje(7, 30)), 'ok', 8, 'Resumo enviado para Gabriel Leão');
for (let i = 0; i < 4; i++) run('r-relatorio-semanal', new Date(new Date(ultimaSegunda).getTime() - i * 7 * DIA).toISOString(), 'ok', 240 - i * 8, `${42 - i} relatórios gerados e enviados`);
for (let i = 0; i < 6; i++) run('r-backup', atras((5 + i) * 1440), 'ok', 95, `${pseudo(i, 6, 19)} artes copiadas para o drive`);
for (let i = 0; i < 6; i++) run('r-google-ads', atras(22 + i * 60), 'ok', 14, `9 contas atualizadas · R$ ${pseudo(i, 2, 6)}.${pseudo(i + 3, 100, 899)} de investimento importado`);
for (let i = 0; i < 6; i++) run('r-mrr', new Date(new Date(passado(hoje(6, 0))).getTime() - i * DIA).toISOString(), 'ok', 9, 'MRR recalculado: R$ 186,4 mil');
for (let i = 0; i < 6; i++) run('r-reunioes', atras(130 + i * 1440), 'ok', 5, `${pseudo(i, 2, 7)} lembretes enviados`);
for (let i = 0; i < 6; i++) run('r-entregas', atras(9 + i * 60), 'ok', 7, i === 0 ? '4 entregas atrasadas marcadas · responsáveis avisados' : '4 entregas atrasadas · nenhuma nova');
for (let i = 0; i < 4; i++) run('r-renovacoes', new Date(new Date(ultimaTerca).getTime() - i * 7 * DIA).toISOString(), 'ok', 6 - (i % 2), i === 0 ? '3 contratos renovam em 30 dias · responsáveis avisados' : `${pseudo(i, 1, 4)} contratos renovam em 30 dias · responsáveis avisados`);
for (let i = 0; i < 5; i++) run('r-guardiao', atras(1 + i * 2), 'ok', 4, '30 contas verificadas · nenhum sinal de invasão');
for (let i = 0; i < 6; i++) run('r-monday', atras(6 + i * 15), 'ok', 11, `${pseudo(i, 8, 31)} tarefas sincronizadas`);
export const ROUTINE_RUNS = RUNS;

/* ---------- integrações ---------- */
export const INTEGRATIONS = [
  { id: 'i-meta', nome: 'Meta Ads', estado: 'err', status: 'Token expirado', detalhe: 'OAuthException 190 desde ontem 23:12', conta: 'Business Manager da agência · 14 contas de anúncio', ultimaSync: ontem(22, 36), expiraEm: ontem(23, 12), ativo: true, icone: 'megaphone' },
  { id: 'i-google-ads', nome: 'Google Ads', estado: 'ok', status: 'Conectado', detalhe: 'Token renovado automaticamente', conta: 'Conta gerente (MCC) · 9 contas', ultimaSync: atras(22), expiraEm: null, ativo: true, icone: 'target' },
  { id: 'i-crm', nome: 'CRM', estado: 'warn', status: 'Token expira em 5 dias', detalhe: 'Reconecte antes do vencimento para não parar o Sync de leads', conta: 'CRM de vendas da agência', ultimaSync: ontem(21, 0), expiraEm: new Date(T0 + 5 * DIA + 12 * 60 * MIN).toISOString(), ativo: true, icone: 'users' },
  { id: 'i-banco', nome: 'Banco / boletos', estado: 'ok', status: 'Conectado', detalhe: 'Extrato e emissão de boletos', conta: 'Conta PJ · carteira de cobrança', ultimaSync: ontem(22, 0), expiraEm: null, ativo: true, icone: 'dollar' },
  { id: 'i-whatsapp', nome: 'WhatsApp API', estado: 'ok', status: 'Conectado', detalhe: 'Número verificado', conta: 'WhatsApp Business da agência', ultimaSync: atras(130), expiraEm: null, ativo: true, icone: 'message' },
  { id: 'i-monday', nome: 'monday.com', estado: 'ok', status: 'Conectado', detalhe: '6 quadros sincronizados', conta: 'Espaço de trabalho da agência', ultimaSync: atras(6), expiraEm: null, ativo: true, icone: 'kanban' },
  { id: 'i-ga4', nome: 'Google Analytics 4', estado: 'ok', status: 'Conectado', detalhe: '11 propriedades de clientes', conta: 'Conta de análise da agência', ultimaSync: atras(95), expiraEm: null, ativo: true, icone: 'chart' },
  { id: 'i-drive', nome: 'Google Drive', estado: 'ok', status: 'Conectado', detalhe: 'Pasta "Criativos aprovados"', conta: 'Drive compartilhado da agência', ultimaSync: atras(5 * 1440), expiraEm: null, ativo: true, icone: 'database' },
];

db.seed('routines', ROUTINES);
db.seed('routineRuns', ROUTINE_RUNS);
db.seed('integrations', INTEGRATIONS);
