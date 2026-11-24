// tests/motor.spec.mjs — testes unitários do motor único de recomendações (src/shared/motor-recs.js).
// Rodam no Node (o arquivo é JS puro e se registra em globalThis.MotorRecs); no fim confere que o app empacotado expõe o mesmo motor.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../src/shared/motor-recs.js');
const MR = globalThis.MotorRecs;

export const viewports = [[1366, 900]];

const H = '2026-11-24T12:00:00Z';
// métricas: gasto, resultados, impressões, cliques, frequência
const m = (gasto, resultados, impressoes = 10000, cliques = 120, frequencia = 1.6) => ({ gasto, resultados, impressoes, cliques, frequencia });
const soma = (a, b) => ({ gasto: a.gasto + b.gasto, resultados: a.resultados + b.resultados, impressoes: a.impressoes + b.impressoes, cliques: a.cliques + b.cliques, frequencia: (a.frequencia * a.impressoes + b.frequencia * b.impressoes) / (a.impressoes + b.impressoes) });
/** anúncio com janela de 7 dias atual e 7 dias anteriores (14d = soma) */
const ad = (id, d7, ant, extra = {}) => ({ id, nome: `Anúncio ${id}`, status: 'ativo', formato: 'video', metricas3d: { ...d7, gasto: d7.gasto * 3 / 7, resultados: Math.round(d7.resultados * 3 / 7), impressoes: d7.impressoes * 3 / 7, cliques: d7.cliques * 3 / 7 }, metricas7d: d7, metricas14d: soma(d7, ant), ...extra });
const neutro = id => ad(id, m(350, 35, 10000, 120, 1.6), m(350, 35, 10000, 120, 1.5));
function base(extra = {}) {
  return {
    conta: { id: 'x', nome: 'Conta teste' }, hoje: H, meta: { tipoResultado: 'conversa', custoAlvo: 10, roasAlvo: null },
    tetoDiario: null, gastoUltimos2Dias: 200, diasComDados: 60,
    campanhas: [{ id: 'c1', nome: '[MSG] Campanha', status: 'ativo', cbo: false, orc: 0, objetivo: 'mensagem', conjuntos: [
      { id: 's1', nome: 'Conjunto 1', status: 'ativo', orc: 100, anuncios: [neutro('a1'), neutro('a2')] },
      { id: 's2', nome: 'Conjunto 2', status: 'ativo', orc: 100, anuncios: [neutro('a3')] },
    ] }],
    ...extra,
  };
}
const ids = recs => recs.map(r => r.id);
const um = (recs, id) => recs.find(r => r.id === id);

export default async function (t) {
  const { ok, step, page } = t;
  ok(MR && typeof MR.recomendar === 'function', 'MotorRecs carregado no Node');

  step('regras como dados');
  ok(MR.REGRAS_PADRAO.length === 10, '10 regras padrão');
  ok(MR.REGRAS_PADRAO.every(r => r.id && r.nome && r.descricao && ['conta', 'campanha', 'conjunto', 'anuncio'].includes(r.nivel) && Array.isArray(r.params) && typeof r.ativo === 'boolean' && ['agora', 'hoje', 'semana'].includes(r.prioridade)), 'cada regra tem id, nome, descrição, nível, parâmetros, ativo e prioridade');
  ok(um(MR.REGRAS_PADRAO, 'trocar-criativo').acao === 'pedirCriativo', 'trocar criativo = pedirCriativo');

  step('snapshot neutro não recomenda nada');
  ok(MR.recomendar(base()).length === 0, 'sem recomendações quando tudo está no alvo');

  step('orçamento da conta (CBO + ABO, pausados fora)');
  const sc = base(); sc.campanhas.push({ id: 'c2', nome: 'CBO', status: 'ativo', cbo: true, orc: 50, objetivo: 'mensagem', conjuntos: [{ id: 's3', nome: 'S3', status: 'ativo', orc: 0, anuncios: [] }] }, { id: 'c3', nome: 'Pausada', status: 'pausado', cbo: true, orc: 80, conjuntos: [] });
  sc.campanhas[0].conjuntos.push({ id: 's4', nome: 'S4 pausado', status: 'pausado', orc: 70, anuncios: [] });
  ok(MR.orcamentoConta(sc) === 250, `orçamento diário = 100 + 100 + 50 (${MR.orcamentoConta(sc)})`);
  ok(MR.orcamentoConta(sc, { id: 's1', v: 130 }) === 280, 'troca simulada de um conjunto');

  step('escalar verba');
  const barato = () => { const s = base(); s.campanhas[0].conjuntos[0].anuncios = [ad('a1', m(350, 70), m(350, 60)), ad('a2', m(350, 70), m(350, 60))]; return s; };
  let r = MR.recomendar(barato()); let e = um(r, 'escalar-verba:s1');
  ok(!!e, `escala o conjunto barato (${ids(r)})`);
  if (e) {
    ok(e.acao.tipo === 'orcamento' && e.de === 100 && e.para === 115, `+15% (${e.de} → ${e.para})`);
    ok(e.orcamentoDiarioContaDepois && e.orcamentoDiarioContaDepois.antes === 200 && e.orcamentoDiarioContaDepois.depois === 215, 'orçamento da conta 200 → 215');
    ok(/A conta passa a investir R\$ 215 por dia \(hoje R\$ 200\)/.test(e.orcamentoDiarioContaDepois.frase), `frase do orçamento diário (${e.orcamentoDiarioContaDepois.frase})`);
    ok(/R\$ 5,00/.test(e.porque) && /R\$ 10,00/.test(e.porque), 'porquê traz custo e alvo');
    ok(e.prioridade === 'semana' && e.confianca === 'alta', `prioridade semana, confiança alta (${e.prioridade}, ${e.confianca})`);
  }
  const ap = barato(); ap.campanhas[0].conjuntos[0].aprendizado = 'aprendendo';
  ok(!um(MR.recomendar(ap), 'escalar-verba:s1'), 'não escala em aprendizado');
  const rec = barato(); rec.campanhas[0].conjuntos[0].alteradoEm = '2026-11-23T10:00:00Z';
  ok(!um(MR.recomendar(rec), 'escalar-verba:s1'), 'espera 3 dias depois de uma mudança');
  ok(!um(MR.recomendar(barato(), { overrides: { 'escalar-verba': { ativo: false } } }), 'escalar-verba:s1'), 'regra desligada não recomenda');
  e = um(MR.recomendar(barato(), { overrides: { 'escalar-verba': { params: { aumento: 10 } } } }), 'escalar-verba:s1');
  ok(e && e.para === 110, 'limite editável: aumento de 10%');
  e = um(MR.recomendar(barato(), { overrides: { 'escalar-verba': { params: { aumento: 30 } } } }), 'escalar-verba:s1');
  ok(e && e.para === 115, 'aumento acima do limite de 20% é recusado (volta ao padrão)');
  e = um(MR.recomendar(barato(), { overrides: { 'escalar-verba': { params: { fatorAlvo: 40 } } } }), 'escalar-verba:s1');
  ok(!e, 'limite mais rígido (40% do alvo) não escala custo de 50%');

  step('teto diário');
  e = um(MR.recomendar({ ...barato(), tetoDiario: 208 }), 'escalar-verba:s1');
  ok(e && e.para === 108 && e.orcamentoDiarioContaDepois.depois === 208 && !e.orcamentoDiarioContaDepois.excedeTeto, `aumento limitado ao teto (${e && e.para})`);
  ok(e && /teto/.test(e.aviso), 'aviso de aumento limitado pelo teto');
  e = um(MR.recomendar({ ...barato(), tetoDiario: 200 }), 'escalar-verba:s1');
  ok(e && e.para === 115 && e.orcamentoDiarioContaDepois.excedeTeto === true, 'sem folga: mantém +15% e marca que passa do teto');
  ok(e && /Passa do teto diário/.test(e.aviso), 'aviso de teto excedido');

  step('reduzir verba');
  const caro = custo3 => { const s = base(); const g = 210; s.campanhas[0].conjuntos[1].anuncios = [ad('a3', m(g * 7 / 3, Math.round(g * 7 / 3 / custo3)), m(350, 35), { metricas3d: m(g, Math.round(g / custo3)) })]; return s; };
  r = MR.recomendar(caro(15)); e = um(r, 'reduzir-verba:s2');
  ok(e && e.de === 100 && e.para === 80 && e.prioridade === 'agora', `custo 150% do alvo: −20% e prioridade agora (${e && e.prioridade})`);
  ok(e && e.orcamentoDiarioContaDepois.depois === 180, 'orçamento da conta 200 → 180');
  e = um(MR.recomendar(caro(13)), 'reduzir-verba:s2');
  ok(e && e.prioridade === 'hoje', 'custo 130%: prioridade hoje');
  ok(!um(MR.recomendar(caro(11.5)), 'reduzir-verba:s2'), 'custo 115%: não reduz');

  step('pausar anúncio cansado');
  const cansado = (todos) => { const s = base(); const c = ad('a1', m(400, 20, 10000, 60, 4.1), m(350, 35, 10000, 120, 2.9)); s.campanhas[0].conjuntos[0].anuncios = [c, todos ? ad('a2', m(400, 22, 10000, 60, 4.0), m(350, 35, 10000, 120, 3)) : neutro('a2')]; return s; };
  r = MR.recomendar(cansado(false)); e = um(r, 'pausar-anuncio:a1');
  ok(e && e.acao.tipo === 'pausar' && e.alvo.nivel === 'anuncio' && e.alvo.conjuntoId === 's1', `pausa o anúncio cansado (${ids(r)})`);
  ok(e && /frequência 4,1/.test(e.porque) && /CTR caiu 50%/.test(e.porque), 'porquê com frequência e queda do CTR');
  ok(!um(r, 'trocar-criativo:s1'), 'não pede criativo se há anúncio bom');
  ok(!um(MR.recomendar(cansado(false), { overrides: { 'pausar-anuncio': { params: { frequenciaMax: 5 } } } }), 'pausar-anuncio:a1'), 'frequência limite editável');

  step('trocar criativo (todos cansados)');
  r = MR.recomendar(cansado(true)); e = um(r, 'trocar-criativo:s1');
  ok(e && e.acao.tipo === 'pedirCriativo', 'pede criativo novo');
  ok(e && e.prioridade === 'agora' && /Resolva a causa/.test(e.aviso || ''), 'custo do conjunto 1,9× o alvo: herda a urgência da redução de verba');
  ok(!r.some(x => x.regraId === 'pausar-anuncio'), 'não sugere pausar quando todos estão cansados');

  step('reduzir cede à causa no mesmo conjunto');
  const s9 = cansado(false); s9.campanhas[0].conjuntos[0].anuncios[0].metricas3d = m(300, 10);
  r = MR.recomendar(s9);
  ok(!um(r, 'reduzir-verba:s1') && um(r, 'pausar-anuncio:a1') && um(r, 'pausar-anuncio:a1').prioridade === 'agora' && /Resolva a causa/.test(um(r, 'pausar-anuncio:a1').aviso || ''), 'pausar o anúncio vem antes de cortar verba');

  step('conta parada');
  r = MR.recomendar(base({ gastoUltimos2Dias: 0 })); e = um(r, 'conta-parada:x');
  ok(e && e.acao.tipo === 'verificar' && e.prioridade === 'agora' && r[0] === e, 'gasto 0 há 2 dias com campanha ativa → verificar, no topo');
  const par = base({ gastoUltimos2Dias: 0 }); par.campanhas[0].status = 'pausado';
  ok(!um(MR.recomendar(par), 'conta-parada:x'), 'campanhas pausadas: não acusa conta parada');
  ok(um(MR.recomendar(base({ gastoPorDia: [{ gasto: 50 }, { gasto: 0 }, { gasto: 0 }, { gasto: 0 }] }), { overrides: { 'conta-parada': { params: { dias: 3 } } } }), 'conta-parada:x'), 'janela de dias editável com gastoPorDia');

  step('dados insuficientes');
  r = MR.recomendar({ ...barato(), diasComDados: 2 });
  ok(um(r, 'dados-insuficientes:x') && um(r, 'dados-insuficientes:x').acao.tipo === 'aguardar', 'aguardar com 2 dias de dados');
  ok(!um(r, 'escalar-verba:s1'), 'bloqueia regras de desempenho enquanto faltam dados');

  step('sem campanha de mensagem');
  const lead = base(); lead.campanhas[0].objetivo = 'lead';
  e = um(MR.recomendar(lead), 'sem-campanha-mensagem:x');
  ok(e && e.acao.tipo === 'mensagemCliente', 'meta conversa sem campanha de mensagem → falar com o cliente');
  ok(!um(MR.recomendar({ ...lead, meta: { tipoResultado: 'lead', custoAlvo: 10 } }), 'sem-campanha-mensagem:x'), 'meta lead: não se aplica');

  step('aprendizado limitado');
  const lim = base(); lim.campanhas[0].conjuntos[1].aprendizado = 'limitado';
  ok(um(MR.recomendar(lim), 'aprendizado-limitado:s2'), 'conjunto com aprendizado limitado');
  const lim2 = base(); Object.assign(lim2.campanhas[0].conjuntos[1], { aprendizado: 'aprendendo', diasEmAprendizado: 9 });
  ok(um(MR.recomendar(lim2), 'aprendizado-limitado:s2'), 'aprendendo há 9 dias com pouco volume');

  step('revisar público');
  const pub = base(); pub.campanhas[0].conjuntos[1].anuncios = [ad('a3', m(350, 25, 6600, 80, 1.8), m(350, 35, 10000, 120, 1.6))];
  e = um(MR.recomendar(pub), 'revisar-publico:s2');
  ok(e && e.acao.tipo === 'publico' && /CPM subiu 52%/.test(e.porque), `CPM +52% com CTR estável (${e && e.porque})`);

  step('conversar com o cliente');
  const cli = base({ ultimaMensagemCliente: '2026-11-14T12:00:00Z' }); cli.campanhas[0].conjuntos[1].anuncios = [ad('a3', m(350, 10), m(350, 35))];
  e = um(MR.recomendar(cli), 'conversar-cliente:x');
  ok(e && e.acao.tipo === 'mensagemCliente' && /10 dias/.test(e.porque), 'resultado caiu e 10 dias sem mensagem');
  ok(!um(MR.recomendar({ ...cli, ultimaMensagemCliente: '2026-11-21T12:00:00Z' }), 'conversar-cliente:x'), 'mensagem recente: não sugere');

  step('formato da saída');
  const todas = [...MR.recomendar(barato()), ...MR.recomendar(caro(15)), ...MR.recomendar(cansado(true)), ...MR.recomendar(lead), ...MR.recomendar(base({ gastoUltimos2Dias: 0 }))];
  const CH = ['id', 'regraId', 'acao', 'alvo', 'titulo', 'impactoEsperado', 'porque', 'de', 'para', 'orcamentoDiarioContaDepois', 'prioridade', 'confianca'];
  ok(todas.length >= 5 && todas.every(x => CH.every(k => k in x)), 'todas as recomendações têm o mesmo formato');
  ok(todas.every(x => ['orcamento', 'pausar', 'pedirCriativo', 'mensagemCliente', 'verificar', 'aguardar', 'publico'].includes(x.acao.tipo)), 'tipos de ação válidos');
  ok(todas.every(x => ['alta', 'média', 'baixa'].includes(x.confianca) && x.porque.length > 30 && x.alvo.nivel && x.alvo.id), 'confiança, porquê e alvo preenchidos');
  ok(todas.filter(x => x.acao.tipo === 'orcamento').every(x => x.orcamentoDiarioContaDepois && /A conta passa a investir/.test(x.orcamentoDiarioContaDepois.frase)), 'ações de orçamento sempre trazem o orçamento diário resultante');
  ok(todas.filter(x => x.acao.tipo !== 'orcamento').every(x => x.de === null && x.orcamentoDiarioContaDepois === null), 'demais ações sem de/para');

  step('validação de limites');
  ok(!MR.validar('escalar-verba', { aumento: 60 }).ok, 'aumento acima do máximo');
  ok(MR.validar('escalar-verba', { aumento: 25 }).erros.aumento === 'O aumento não pode passar do limite por mudança.', 'restrição entre campos');
  ok(MR.validar('escalar-verba', { aumento: 25, limiteMudanca: 30 }).ok, 'aumento 25% com limite 30% é válido');
  ok(!MR.validar('pausar-anuncio', { frequenciaMax: 'abc' }).ok && !MR.validar('dados-insuficientes', { minDias: 2.5 }).ok, 'texto e decimal em campo inteiro são recusados');

  step('registro de aprendizado');
  const rr = um(MR.recomendar(caro(15)), 'reduzir-verba:s2');
  const lg = MR.registrarDecisao(rr, 'aceita', 'u-gabriel', '2026-11-10T12:00:00Z');
  ok(lg.recId === rr.id && lg.regraId === 'reduzir-verba' && lg.decisao === 'aceita' && lg.antes && lg.antes.custo === 15, 'entrada com recId, regra, decisão e métrica antes');
  ok(MR.pendentesDeAvaliacao([lg], '2026-11-18T12:00:00Z').length === 1 && MR.pendentesDeAvaliacao([lg], '2026-11-15T12:00:00Z').length === 0, 'avaliação 7 dias depois');
  const res = MR.avaliarResultado(lg, { custo: 11 });
  ok(res && res.metrica === 'custo' && res.melhorou === true, 'custo caiu = deu certo');
  const log = [{ ...lg, resultado: res }, MR.registrarDecisao(rr, 'recusada', 'u-ana', '2026-11-12T12:00:00Z'), { ...MR.registrarDecisao(um(MR.recomendar(barato()), 'escalar-verba:s1'), 'aceita', 'u', '2026-11-05T12:00:00Z'), resultado: { melhorou: false } }];
  const st = MR.estatisticas(log, { hoje: H, pendentes: MR.recomendar(cansado(true)) });
  ok(st['reduzir-verba'].sugestoes === 1 && st['reduzir-verba'].recusadas === 1 && st['reduzir-verba'].taxaAceite === 0, 'última decisão por recomendação vale (aceita → recusada)');
  ok(st['escalar-verba'].aceitas === 1 && st['escalar-verba'].taxaSucesso === 0, 'taxa de acerto por regra');
  ok(st['trocar-criativo'].sugestoes === 1 && st['trocar-criativo'].taxaAceite === null, 'pendentes contam como sugestão');
  let erro = false; try { MR.registrarDecisao(rr, 'talvez'); } catch (x) { erro = true; }
  ok(erro, 'decisão inválida é recusada');

  step('adaptador da Torre');
  const serie = Array.from({ length: 30 }, (_, i) => ({ d: new Date(2026, 9, 26 + i), sp: 100, impr: 4000, reach: 3000, clicks: 50, msgs: i >= 23 ? 18 : 10, leads: 0 }));
  const conta = { id: 7, nome: 'Clínica Teste', meta: 10, sem: 'exc', fadiga: 'OK', statusOp: 'OK', diasSem: 2, ultMsg: new Date(2026, 10, 20), churn: 'Baixo', tetoDia: null, series: serie,
    camps: [{ id: 1, nome: '[MSG] Oferta', status: 'Ativa', obj: 'Mensagens', cbo: false, orc: 0, sets: [{ id: 2, nome: 'Raio 5 km', status: 'Ativa', orc: 100, g7: 700, res: 126, ads: [{ id: 3, nome: 'Reels', status: 'Ativa', fmt: 'video', g7: 400, res: 72 }, { id: 4, nome: 'Imagem', status: 'Ativa', fmt: 'imagem', g7: 300, res: 54 }] }] }] };
  const snap = MR.adaptadores.torre(conta, { hoje: new Date(2026, 10, 24), invDia: () => 100 });
  ok(snap.meta.tipoResultado === 'conversa' && snap.meta.custoAlvo === 10 && snap.orcamentoDiarioConta === 100 && snap.campanhas[0].conjuntos[0].anuncios.length === 2, 'snapshot da conta da Torre');
  r = MR.recomendar(snap); e = um(r, 'escalar-verba:2');
  ok(e && e.para === 115 && /A conta passa a investir R\$ 115/.test(e.orcamentoDiarioContaDepois.frase), `conta barata da Torre → escalar (${ids(r)})`);
  const sat = MR.adaptadores.torre({ ...conta, sem: 'caro', fadiga: 'Saturado' }, { hoje: new Date(2026, 10, 24), invDia: () => 100 });
  ok(um(MR.recomendar(sat), 'pausar-anuncio:3'), 'conta com criativo saturado → pausar o anúncio cansado');

  step('motor exposto no app empacotado');
  await t.login();
  ok(await page.evaluate(() => typeof window.MotorRecs === 'object' && window.MotorRecs.REGRAS_PADRAO.length === 10), 'window.MotorRecs no app');
}
