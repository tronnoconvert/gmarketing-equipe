// comercial/data.js — semente do pipeline (deals). Dono do comercial: Marina Costa (t-marina).
// Coerência: 6 ganhos no mês somam R$ 14.800 de novo MRR (= "Novos" da ponte de MRR) e 16 propostas enviadas no mês.
import { db } from '../../core/store.js';
import { padrao } from '../../core/padroes/index.js';

const H0 = new Date(); H0.setHours(12, 0, 0, 0);
const dia = off => { const d = new Date(H0.getTime() + off * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const quando = off => new Date(H0.getTime() + off * 864e5 - 3 * 36e5).toISOString();

export const ETAPAS = [
  { id: 'lead', rotulo: 'Lead', get prob() { return padrao('comercial.prob.lead', 10); } },
  { id: 'qualificado', rotulo: 'Qualificado', get prob() { return padrao('comercial.prob.qualificado', 20); } },
  { id: 'diagnostico', rotulo: 'Diagnóstico', get prob() { return padrao('comercial.prob.diagnostico', 35); } },
  { id: 'proposta', rotulo: 'Proposta enviada', get prob() { return padrao('comercial.prob.proposta', 50); } },
  { id: 'negociacao', rotulo: 'Negociação', get prob() { return padrao('comercial.prob.negociacao', 70); } },
  { id: 'ganho', rotulo: 'Ganho', prob: 100 },
  { id: 'perdido', rotulo: 'Perdido', prob: 0 },
];
export const ORIGENS = ['Indicação', 'Inbound (site)', 'Webinar', 'Meta Ads', 'Outbound', 'Evento'];
export const SERVICOS = ['Tráfego', 'Social', 'Google', 'Site', 'CRM', 'Conteúdo'];
/** histórico consolidado dos meses anteriores (propostas enviadas × ganhas, novo MRR em R$) — o mês atual é calculado dos deals */
export const HISTORICO = [
  { mesesAtras: 5, enviadas: 11, ganhas: 4, novoMrr: 9200 },
  { mesesAtras: 4, enviadas: 13, ganhas: 4, novoMrr: 10400 },
  { mesesAtras: 3, enviadas: 12, ganhas: 5, novoMrr: 11800 },
  { mesesAtras: 2, enviadas: 14, ganhas: 5, novoMrr: 12100 },
  { mesesAtras: 1, enviadas: 18, ganhas: 7, novoMrr: 16300 },
];

const ORDEM = ETAPAS.map(e => e.id);
/** monta o histórico de etapas até a etapa atual (ou até a etapa onde foi perdido) */
function trilha(etapa, criado, fim, etapaPerda) {
  const ate = etapa === 'perdido' ? ORDEM.indexOf(etapaPerda) : Math.min(ORDEM.indexOf(etapa), 5);
  const n = ate + 1; const passo = (fim - criado) / Math.max(1, n - 1 + (etapa === 'perdido' ? 1 : 0));
  const h = [];
  for (let i = 0; i < n; i++) h.push({ etapa: ORDEM[i], em: quando(Math.round(criado + passo * i)) });
  if (etapa === 'perdido') h.push({ etapa: 'perdido', em: quando(fim) });
  return h;
}
const D = (id, empresa, contato, cargo, valor, servicos, origem, respId, etapa, criado, o = {}) => {
  const fim = o.ganho ?? o.perdido ?? (o.proposta != null && ['proposta', 'negociacao'].includes(etapa) ? Math.max(o.proposta, criado) + (etapa === 'negociacao' ? 3 : 0) : Math.round(criado / 2));
  const historico = trilha(etapa, criado, etapa === 'lead' ? criado : fim, o.etapaPerda);
  if (etapa === 'proposta' && o.proposta != null) historico[historico.length - 1].em = quando(o.proposta);
  return {
    id, empresa, contato, cargo, email: `${contato.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@${empresa.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '')}.com.br`,
    telefone: o.tel || null, valor, servicos, origem, respId, etapa, criadoEm: quando(criado), etapaDesde: historico[historico.length - 1].em,
    propostaEm: o.proposta != null ? quando(o.proposta) : null, ganhoEm: o.ganho != null ? quando(o.ganho) : null, perdidoEm: o.perdido != null ? quando(o.perdido) : null,
    etapaPerda: o.etapaPerda || null, motivoPerda: o.motivo || null, proximaAcao: o.prox || null, proximaData: o.data != null ? dia(o.data) : null,
    notas: o.notas || '', historico, clienteId: null,
  };
};

export const DEALS = [
  // ganhos no mês (R$ 14.800)
  D('d-odonto', 'Odonto Prime', 'Renata Alves', 'Sócia', 3200, ['Tráfego', 'Social'], 'Indicação', 't-marina', 'ganho', -52, { proposta: -23, ganho: -20 }),
  D('d-movimento', 'Academia Movimento', 'Thiago Prates', 'Proprietário', 2400, ['Social'], 'Webinar', 't-marina', 'ganho', -40, { proposta: -21, ganho: -17 }),
  D('d-exata', 'Contabilidade Exata', 'Márcia Teles', 'Diretora', 1800, ['Tráfego'], 'Inbound (site)', 't-marina', 'ganho', -38, { proposta: -18, ganho: -14 }),
  D('d-serra', 'Vinícola Serra Alta', 'Otávio Bernardi', 'Diretor comercial', 3500, ['Tráfego', 'Site'], 'Evento', 't-gabriel', 'ganho', -55, { proposta: -16, ganho: -10 }),
  D('d-pilates', 'Studio Pilates Equilíbrio', 'Luana Freitas', 'Proprietária', 1500, ['Social'], 'Meta Ads', 't-marina', 'ganho', -24, { proposta: -12, ganho: -6 }),
  D('d-vilamar', 'Hotel Vila Mar', 'Rogério Antunes', 'Gerente geral', 2400, ['Tráfego', 'Google'], 'Indicação', 't-marina', 'ganho', -35, { proposta: -9, ganho: -3, notas: 'Contrato assinado. Falta cadastrar como cliente para iniciar o onboarding.' }),
  // perdidos
  D('d-aurum', 'Joalheria Aurum', 'Patrícia Lemos', 'Gerente de marketing', 5200, ['Tráfego', 'Social'], 'Outbound', 't-marina', 'perdido', -45, { proposta: -22, perdido: -8, etapaPerda: 'negociacao', motivo: 'Preço acima do orçamento' }),
  D('d-burger', 'Burger Lab', 'Caio Mendes', 'Sócio', 2800, ['Social'], 'Meta Ads', 't-marina', 'perdido', -30, { proposta: -19, perdido: -11, etapaPerda: 'proposta', motivo: 'Escolheu outra agência' }),
  D('d-eletro', 'Eletro Center', 'Fábio Rocha', 'Diretor', 4100, ['Tráfego', 'Google'], 'Inbound (site)', 't-gabriel', 'perdido', -33, { proposta: -15, perdido: -5, etapaPerda: 'negociacao', motivo: 'Projeto adiado para 2027' }),
  D('d-agro', 'Agro Campo Forte', 'Sérgio Battisti', 'Gerente', 6000, ['Tráfego', 'Conteúdo'], 'Evento', 't-gabriel', 'perdido', -80, { perdido: -60, etapaPerda: 'diagnostico', motivo: 'Sem orçamento neste ano' }),
  D('d-iris', 'Moda Íris', 'Débora Lins', 'Proprietária', 1200, ['Social'], 'Meta Ads', 't-marina', 'perdido', -66, { perdido: -50, etapaPerda: 'qualificado', motivo: 'Ticket abaixo do mínimo' }),
  // proposta enviada
  D('d-sabor', 'Rede Sabor', 'Henrique Duarte', 'Diretor de marketing', 7500, ['Tráfego', 'Social'], 'Indicação', 't-marina', 'proposta', -28, { proposta: -1, prox: 'Confirmar recebimento da proposta com o decisor', data: -1, notas: 'Retorno prometido para sexta. Concorre com uma agência local.' }),
  D('d-sorriso', 'Clínica Sorriso Pleno', 'Aline Moraes', 'Administradora', 4800, ['Tráfego', 'Site'], 'Inbound (site)', 't-marina', 'proposta', -20, { proposta: -7, prox: 'Apresentar a proposta por vídeo', data: 2 }),
  D('d-saber', 'Escola Saber Mais', 'Cláudio Reis', 'Diretor', 3900, ['Social', 'Conteúdo'], 'Webinar', 't-marina', 'proposta', -26, { proposta: -11, prox: 'Follow-up da proposta', data: 1 }),
  D('d-amigo', 'Pet Shop Amigo Fiel', 'Bianca Torres', 'Sócia', 2100, ['Social'], 'Meta Ads', 't-marina', 'proposta', -14, { proposta: -4, prox: 'Ajustar o escopo de social', data: 3 }),
  // negociação
  D('d-horizonte', 'Construtora Horizonte', 'Eduardo Vasconcelos', 'CEO', 9800, ['Tráfego', 'CRM', 'Site'], 'Outbound', 't-gabriel', 'negociacao', -48, { proposta: -20, prox: 'Enviar minuta do contrato', data: -6, notas: 'Pediram 10% de desconto no setup. Decisão depende do jurídico deles.' }),
  D('d-atlas', 'Distribuidora Atlas', 'Mônica Farias', 'Gerente comercial', 6500, ['Tráfego', 'Google'], 'Indicação', 't-marina', 'negociacao', -36, { proposta: -13, prox: 'Reunião de negociação com a diretoria', data: 1 }),
  D('d-lupulo', 'Cervejaria Lúpulo Alto', 'André Kühn', 'Sócio', 3600, ['Social', 'Tráfego'], 'Evento', 't-marina', 'negociacao', -30, { proposta: -10, prox: 'Fechar desconto do setup', data: 0 }),
  // diagnóstico
  D('d-derma', 'Clínica Derma Viva', 'Juliana Prado', 'Médica e sócia', 4200, ['Tráfego'], 'Inbound (site)', 't-marina', 'diagnostico', -15, { prox: 'Reunião de diagnóstico', data: -2 }),
  D('d-ramos', 'Advocacia Ramos & Lima', 'Paulo Ramos', 'Sócio', 3000, ['Conteúdo', 'Site'], 'Indicação', 't-gabriel', 'diagnostico', -12, { prox: 'Levantar acessos do site atual', data: 4 }),
  D('d-larnovo', 'Imobiliária Lar Novo', 'Sandra Queiroz', 'Diretora', 5500, ['Tráfego', 'CRM'], 'Webinar', 't-marina', 'diagnostico', -9, { prox: 'Diagnóstico das campanhas atuais', data: 2 }),
  // qualificado
  D('d-bemestar', 'Farmácia Bem Estar', 'Ricardo Nogueira', 'Proprietário', 3800, ['Tráfego', 'Social'], 'Meta Ads', 't-marina', 'qualificado', -10, { prox: 'Agendar diagnóstico', data: 1 }),
  D('d-novosaber', 'Colégio Novo Saber', 'Vera Lúcia Campos', 'Coordenadora', 2900, ['Social'], 'Webinar', 't-marina', 'qualificado', -8, { prox: 'Enviar cases de educação', data: 2 }),
  D('d-trigo', 'Padaria Trigo Nobre', 'Mário Gentile', 'Sócio', 1600, ['Social'], 'Indicação', 't-marina', 'qualificado', -6, { prox: 'Ligar para o sócio', data: 3 }),
  D('d-verde', 'Loja Verde Casa', 'Camila Souto', 'Gerente', 2700, ['Tráfego', 'Google'], 'Inbound (site)', 't-marina', 'qualificado', -5, { prox: 'Agendar diagnóstico', data: 5 }),
  // leads
  D('d-foco', 'Ótica Foco', 'Gustavo Lima', 'Proprietário', 1900, ['Tráfego'], 'Meta Ads', 't-marina', 'lead', -3, { prox: 'Primeiro contato', data: 1 }),
  D('d-cristal', 'Vidraçaria Cristal', 'Rafael Couto', 'Sócio', 2200, ['Google'], 'Inbound (site)', 't-marina', 'lead', -2, { prox: 'Qualificar por telefone', data: 0 }),
  D('d-carvalho', 'Marcenaria Carvalho', 'Elaine Ruiz', 'Sócia', 2500, ['Social', 'Tráfego'], 'Webinar', 't-marina', 'lead', -2, { prox: 'Enviar o material do webinar', data: 1 }),
  D('d-porto', 'Hamburgueria do Porto', 'Bruno Sales', 'Proprietário', 1700, ['Social'], 'Outbound', 't-marina', 'lead', -1, { prox: 'Primeiro contato', data: 2 }),
  D('d-zen', 'Espaço Zen Yoga', 'Lívia Matos', 'Proprietária', 1400, ['Social'], 'Indicação', 't-marina', 'lead', -1, { prox: 'Qualificar por WhatsApp', data: 2 }),
];

db.seed('deals', DEALS);
