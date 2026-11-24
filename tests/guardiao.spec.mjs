// tests/guardiao.spec.mjs — testes unitários do Guardião de segurança (src/shared/guardiao.js): cada regra com fluxos de
// eventos montados à mão, agregação em incidente SUPREMO, pausa total, quarentena/vigilância (reincidência), idempotência,
// saída da quarentena (SIM + checklist), reativação seletiva com orçamento anterior e adaptadores (Meta e Torre).
// Rodam no Node (o arquivo é JS puro e se registra em globalThis.Guardiao).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
require('../src/shared/guardiao.js');
const G = globalThis.Guardiao;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const viewports = [[1366, 900]];

const AGORA = Date.parse('2026-11-24T17:00:00Z'); // 14:00 em Brasília
const min = n => new Date(AGORA - n * 60000).toISOString();
let seq = 0;
/** evento (padrão: Ana, da equipe, pelo app, às 13:5x) */
const ev = (atras, x = {}) => ({ id: `e${++seq}`, quando: min(atras), atorId: 'meta-ana', atorNome: 'Ana', via: 'app', tipo: 'outro', nivel: 'campanha', alvoId: 'c1', alvoNome: 'Campanha 1', ...x });
function base(extra = {}) {
  return {
    conta: { id: 'act_1', nome: 'Clínica Teste', clientId: 'c-orion' }, agora: new Date(AGORA).toISOString(), fusoMin: -180,
    campanhas: [
      { id: 'c1', nome: '[MSG] Oferta', status: 'ativo', cbo: true, orc: 100, conjuntos: [{ id: 's0', nome: 'Aberto', status: 'ativo', orc: 0 }] },
      { id: 'c2', nome: '[MSG] Remarketing', status: 'ativo', cbo: false, orc: 0, conjuntos: [{ id: 's1', nome: 'Quente', status: 'ativo', orc: 50 }, { id: 's2', nome: 'Raio 5 km', status: 'ativo', orc: 30 }, { id: 's3', nome: 'Pausado', status: 'pausado', orc: 20 }] },
      { id: 'c3', nome: '[CAD] Antiga', status: 'pausado', cbo: true, orc: 80, conjuntos: [] },
    ],
    eventos: [], autorizados: ['meta-ana', 'meta-bruno'], paisesUsados: ['BR'], tetoMensal: null,
    ...extra,
  };
}
const regrasDe = r => r.achados.map(a => a.regraId);
const tem = (r, id) => r.achados.some(a => a.regraId === id);

export default async function (t) {
  const { ok, step } = t;
  ok(G && typeof G.processar === 'function', 'Guardiao carregado no Node');

  step('regras como dados');
  ok(G.REGRAS_PADRAO.length === 11, '11 regras de detecção');
  ok(G.REGRAS_PADRAO.every(r => r.id && r.nome && r.descricao && G.SEVERIDADES.includes(r.severidade) && Array.isArray(r.params) && r.ativo === true), 'cada regra tem id, nome, descrição, severidade, parâmetros e ativo');
  ok(G.REGRAS_PADRAO.filter(r => r.severidade === 'critica').map(r => r.id).sort().join() === 'admin-novo,campanha-nova,gasto-pico,orcamento-salto', 'críticas: orçamento, gasto, campanha nova, admin novo');
  let rs = G.regras({ 'orcamento-salto': { params: { aumentoPct: 50 } }, rajada: { ativo: false, severidade: 'critica' }, 'gasto-pico': { params: { fator: 9999 } } });
  ok(rs.find(r => r.id === 'orcamento-salto').params.find(p => p.chave === 'aumentoPct').valor === 50, 'override válido aplicado');
  ok(rs.find(r => r.id === 'rajada').ativo === false && rs.find(r => r.id === 'rajada').severidade === 'critica', 'ativo e severidade editáveis');
  ok(rs.find(r => r.id === 'gasto-pico').params.find(p => p.chave === 'fator').valor === 4, 'override fora da faixa ignorado');
  ok(!G.validar('fora-horario', { inicio: 7, fim: 6 }).ok && G.validar('fora-horario', { inicio: 7, fim: 6 }).erros.inicio, 'restrição entre campos (início < fim)');
  ok(!G.validar('orcamento-salto', { aumentoPct: 200, acumuladoPct: 150 }).ok, 'acumulado ≥ limite de uma alteração');
  ok(G.validar('agregacao', { altasParaSupremo: 3 }).ok && !G.validar('agregacao', { altasParaSupremo: 1 }).ok, 'agregação validada');

  step('conta sem nada estranho');
  let r = G.processar(base({ eventos: [ev(20, { tipo: 'orcamento', antes: 100, depois: 115 })] }), null);
  ok(r.achados.length === 0 && r.nivel === null && r.acoes.length === 0 && !r.estado.quarentena, `nenhum achado com alteração normal (${regrasDe(r)})`);

  step('orçamento: salto numa alteração');
  let a = G.avaliar(base({ eventos: [ev(10, { tipo: 'orcamento', antes: 100, depois: 250 })] }));
  ok(a.achados.length === 1 && a.achados[0].regraId === 'orcamento-salto' && a.achados[0].severidade === 'critica' && /\+150%/.test(a.achados[0].titulo), '+150% → crítica');
  a = G.avaliar(base({ eventos: [ev(10, { tipo: 'orcamento', antes: 1000, depois: 1600 })] }));
  ok(a.achados.some(x => x.regraId === 'orcamento-salto'), '+60% mas +R$ 600/dia → crítica pelo valor absoluto');
  a = G.avaliar(base({ eventos: [ev(10, { tipo: 'orcamento', antes: 100, depois: 180 })] }));
  ok(!a.achados.length, '+80% e +R$ 80 → nada');
  a = G.avaliar(base({ eventos: [ev(10, { tipo: 'orcamento', antes: 300, depois: 100 })] }));
  ok(!a.achados.length, 'redução de orçamento → nada');

  step('orçamento: acumulado na janela');
  a = G.avaliar(base({ eventos: [ev(40, { tipo: 'orcamento', antes: 100, depois: 170 }), ev(25, { tipo: 'orcamento', antes: 170, depois: 220 }), ev(5, { tipo: 'orcamento', antes: 220, depois: 260 })] }));
  ok(a.achados.length === 1 && /acum/.test(a.achados[0].chave) && a.achados[0].eventoIds.length === 3, `3 aumentos pequenos somando +160% em 35 min → crítica (${a.achados.map(x => x.chave)})`);
  a = G.avaliar(base({ eventos: [ev(110, { tipo: 'orcamento', antes: 100, depois: 170 }), ev(5, { tipo: 'orcamento', antes: 170, depois: 260 })] }));
  ok(!a.achados.length, 'mesmo aumento espalhado em mais de 60 min → nada');

  step('fora do horário');
  a = G.avaliar(base({ agora: '2026-11-24T06:30:00Z', eventos: [{ ...ev(0, { tipo: 'outro' }), quando: '2026-11-24T06:12:00Z' }] }));
  ok(a.achados.length === 1 && a.achados[0].regraId === 'fora-horario' && a.achados[0].severidade === 'alta' && /03:12/.test(a.achados[0].titulo), 'alteração às 03:12 → alta');
  r = G.processar(base({ agora: '2026-11-24T06:30:00Z', eventos: [{ ...ev(0), quando: '2026-11-24T06:12:00Z' }] }), null);
  ok(r.nivel === 'alto' && r.evento === 'alerta' && r.acoes.length === 0 && !r.estado.quarentena, 'uma regra alta sozinha = alerta, sem pausa');
  a = G.avaliar(base({ agora: '2026-11-24T12:30:00Z', eventos: [{ ...ev(0), quando: '2026-11-24T12:10:00Z' }] }));
  ok(!a.achados.length, '09:10 → nada');

  step('ator fora da equipe');
  a = G.avaliar(base({ eventos: [ev(5, { atorId: 'meta-x', atorNome: 'Fulano' })] }));
  ok(a.achados.length === 1 && a.achados[0].regraId === 'ator-desconhecido' && a.achados[0].severidade === 'alta' && /Fulano/.test(a.achados[0].titulo), 'usuário fora da lista → alta');
  a = G.avaliar(base({ eventos: [ev(9, { atorId: 'meta-x', atorNome: 'Fulano' }), ev(7, { atorId: 'meta-x', atorNome: 'Fulano' }), ev(5, { atorId: 'meta-x', atorNome: 'Fulano' })] }));
  ok(a.achados.length === 1 && a.achados[0].eventoIds.length === 3 && /3 alterações/.test(a.achados[0].titulo), 'várias alterações da mesma pessoa = um sinal só');
  a = G.avaliar(base({ autorizados: [], eventos: [ev(5, { atorId: 'meta-x' })] }));
  ok(!a.achados.length && a.ignoradas.includes('ator-desconhecido'), 'sem lista de autorizados a regra fica de fora (e é informada)');

  step('2 regras altas diferentes em 30 min → SUPREMO');
  r = G.processar(base({ agora: '2026-11-24T06:30:00Z', eventos: [{ ...ev(0, { atorId: 'meta-x' }), quando: '2026-11-24T06:12:00Z' }] }), null);
  ok(r.nivel === 'supremo' && r.evento === 'invasao' && r.estado.quarentena, 'madrugada + ator desconhecido → SUPREMO');
  r = G.processar(base({ eventos: [ev(20, { tipo: 'pagamento' }), ev(5, { tipo: 'pagamento' })] }), null);
  ok(r.nivel === 'alto' && !r.estado.quarentena, '2 achados da MESMA regra alta → só alerta');
  // entre execuções: alta na 1ª, outra alta na 2ª (10 min depois)
  const evP = ev(5, { tipo: 'pagamento' });
  const r1 = G.processar(base({ eventos: [evP] }), null);
  const r2 = G.processar(base({ agora: new Date(AGORA + 10 * 60000).toISOString(), eventos: [evP, { ...ev(0, { tipo: 'whatsapp', antes: '5531999990000', depois: '5511988887777' }), quando: new Date(AGORA + 8 * 60000).toISOString() }] }), r1.estado);
  ok(r1.nivel === 'alto' && r2.nivel === 'supremo' && r2.achados.length === 1, 'altas de execuções diferentes dentro de 30 min somam (estado.recentes)');
  const r3 = G.processar(base({ agora: new Date(AGORA + 50 * 60000).toISOString(), eventos: [{ ...ev(0, { tipo: 'whatsapp' }), quando: new Date(AGORA + 48 * 60000).toISOString() }] }), r1.estado);
  ok(r3.nivel === 'alto', 'altas com mais de 30 min de diferença não somam');

  step('gasto na última hora');
  const horas = (media, ultima) => { const h = []; for (let i = 7 * 24; i >= 1; i--) h.push({ inicio: new Date(AGORA - i * 3600000).toISOString(), gasto: media }); h.push({ inicio: new Date(AGORA - 20 * 60000).toISOString(), gasto: ultima }); return h; };
  a = G.avaliar(base({ gastoHoras: horas(10, 60) }));
  ok(a.achados.length === 1 && a.achados[0].regraId === 'gasto-pico' && a.achados[0].severidade === 'critica' && a.achados[0].mediaHora === 10, `R$ 60 vs média R$ 10/h → crítica (${regrasDe(a)})`);
  ok(!G.avaliar(base({ gastoHoras: horas(10, 45) })).achados.length, '4,5× mas só R$ 45 (abaixo do mínimo de R$ 50) → nada');
  ok(!G.avaliar(base({ gastoHoras: horas(20, 70) })).achados.length, 'R$ 70 vs média R$ 20 (3,5×) → nada');
  ok(G.avaliar(base({ gasto: { ultimaHora: 300, mediaHora7d: 40, inicio: min(30) } })).achados[0].regraId === 'gasto-pico', 'aceita gasto já agregado (ultimaHora/mediaHora7d)');

  step('campanha nova fora da equipe');
  a = G.avaliar(base({ eventos: [ev(5, { tipo: 'criacao_campanha', atorId: 'meta-x', alvoId: 'c9', alvoNome: 'Golpe' })] }));
  ok(tem(a, 'campanha-nova') && a.achados.find(x => x.regraId === 'campanha-nova').severidade === 'critica', 'criada por estranho → crítica');
  ok(!G.avaliar(base({ eventos: [ev(5, { tipo: 'criacao_campanha', via: 'gerenciador' })] })).achados.length, 'criada pela Ana no Gerenciador → nada');
  ok(tem(G.avaliar(base({ eventos: [ev(5, { tipo: 'criacao_campanha', via: 'api' })] })), 'campanha-nova'), 'criada pela Ana por outra ferramenta (API) → fora da lista de canais');

  step('destino de anúncio ativo');
  a = G.avaliar(base({ eventos: [ev(5, { tipo: 'whatsapp', nivel: 'anuncio', antes: '5531999990000', depois: '5511988887777' })] }));
  ok(a.achados.length === 1 && a.achados[0].regraId === 'destino-alterado' && a.achados[0].severidade === 'alta' && /5511988887777/.test(a.achados[0].detalhe), 'número do WhatsApp trocado → alta');
  ok(tem(G.avaliar(base({ eventos: [ev(5, { tipo: 'url_destino' })] })), 'destino-alterado') && tem(G.avaliar(base({ eventos: [ev(5, { tipo: 'objetivo' })] })), 'destino-alterado'), 'URL e objetivo também');
  ok(!G.avaliar(base({ eventos: [ev(5, { tipo: 'url_destino', anuncioAtivo: false })] })).achados.length, 'anúncio pausado → nada');

  step('admin, pagamento, país');
  a = G.avaliar(base({ eventos: [ev(5, { tipo: 'admin_adicionado', nivel: 'conta', depois: 'Parceiro X' })] }));
  ok(a.achados[0].regraId === 'admin-novo' && a.achados[0].severidade === 'critica' && /Parceiro X/.test(a.achados[0].titulo), 'novo admin/parceiro → crítica (mesmo vindo da equipe)');
  a = G.avaliar(base({ eventos: [ev(5, { tipo: 'pagamento', nivel: 'conta' })] }));
  ok(a.achados[0].regraId === 'pagamento-alterado' && a.achados[0].severidade === 'alta', 'pagamento → alta');
  a = G.avaliar(base({ eventos: [ev(5, { tipo: 'segmentacao', nivel: 'conjunto', depois: { paises: ['BR', 'NG'] } })] }));
  ok(a.achados[0].regraId === 'pais-novo' && a.achados[0].paises.join() === 'NG', 'país nunca usado (NG) → alta');
  ok(!G.avaliar(base({ eventos: [ev(5, { tipo: 'segmentacao', depois: { paises: ['BR'] } })] })).achados.length, 'segmentação só no Brasil → nada');

  step('teto do cliente');
  a = G.avaliar(base({ tetoMensal: 3040 })); // teto 100/dia; orçamento ativo 100 + 50 + 30 = 180
  ok(a.achados.length === 1 && a.achados[0].regraId === 'teto-projetado' && a.achados[0].projetado === 180 && a.achados[0].tetoDiario === 100, `180/dia vs teto 100/dia (+80%) → alta (${regrasDe(a)})`);
  ok(!G.avaliar(base({ tetoMensal: 4560 })).achados.length, 'teto 150/dia: 180 é só +20% → nada');
  a = G.avaliar(base({ tetoMensal: 6080, gastoHoje: 400 })); // 14h: ritmo 400/14×24 ≈ 686 vs teto 200
  ok(tem(a, 'teto-projetado') && /ritmo/.test(a.achados[0].detalhe), 'ritmo do gasto de hoje também projeta');
  ok(G.avaliar(base()).ignoradas.includes('teto-projetado'), 'sem teto cadastrado a regra fica de fora');

  step('rajada de alterações');
  const lote = n => Array.from({ length: n }, (_, i) => ev(9 - i * 0.8, { tipo: 'outro', alvoId: `x${i}` }));
  a = G.avaliar(base({ eventos: lote(11) }));
  ok(a.achados.length === 1 && a.achados[0].regraId === 'rajada' && a.achados[0].eventoIds.length === 11, '11 alterações em 8 min → alta');
  ok(!G.avaliar(base({ eventos: lote(10) })).achados.length, '10 alterações → nada');
  ok(!G.avaliar(base({ eventos: lote(11).map(e => ({ ...e, atorId: 'guardiao' })) })).achados.length, 'alterações do próprio Guardião não contam');
  ok(!G.avaliar(base({ eventos: [ev(5, { tipo: 'sistema_meta', atorId: null })] })).achados.length, 'eventos automáticos do Meta não contam');
  ok(!G.avaliar(base({ eventos: [ev(300, { tipo: 'admin_adicionado' })] })).achados.length, 'eventos fora da janela (5 h atrás) não contam');

  step('SUPREMO: pausa total, quarentena e registro');
  const inv = base({ eventos: [ev(8, { tipo: 'orcamento', atorId: 'meta-x', atorNome: 'Invasor', antes: 100, depois: 500 }), ev(6, { tipo: 'orcamento', nivel: 'conjunto', alvoId: 's1', alvoNome: 'Quente', atorId: 'meta-x', antes: 50, depois: 400 })] });
  inv.campanhas[0].orc = 500; inv.campanhas[1].conjuntos[0].orc = 400;
  r = G.processar(inv, null);
  ok(r.nivel === 'supremo' && r.evento === 'invasao', 'orçamento +400% → SUPREMO');
  ok(r.acoes.map(x => x.id).join() === 'c1,c2' && r.acoes.every(x => x.tipo === 'pausar'), 'pausa TODAS as campanhas ativas (c1, c2), não mexe na já pausada (c3)');
  ok(!r.acoes.some(x => /exclu|delet|remov|arquiv/i.test(x.tipo)), 'nunca exclui nem arquiva');
  ok(r.estado.quarentena === true && r.estado.incidenteId === r.incidente.id && r.incidente.estado === 'aberto', 'conta em quarentena com incidente aberto');
  const p1 = r.incidente.pausados.find(x => x.id === 'c1'), p2 = r.incidente.pausados.find(x => x.id === 'c2');
  ok(p1.orcAtual === 500 && p1.orcAntes === 100, 'registra orçamento atual (500) e o de antes do incidente (100) da campanha CBO');
  ok(p2.conjuntos.find(s => s.id === 's1').orcAntes === 50 && p2.conjuntos.find(s => s.id === 's1').orcAtual === 400 && p2.conjuntos.find(s => s.id === 's2').orcAntes === 30, 'e dos conjuntos (ABO)');
  ok(r.notificacao.tipo === 'invasao' && r.notificacao.prioridade === 'critica' && /^POSSÍVEL INVASÃO — Conta Clínica Teste pausada automaticamente$/.test(r.notificacao.titulo) && /2 campanha/.test(r.notificacao.texto), 'notificação "POSSÍVEL INVASÃO — Conta … pausada automaticamente"');
  ok(r.incidente.achados.length === 3 && ['orcamento-salto', 'ator-desconhecido'].every(id => r.incidente.achados.some(x => x.regraId === id)) && r.incidente.clientId === 'c-orion', 'incidente guarda o que foi detectado e o cliente');

  step('idempotência');
  let snap2 = G.aplicarAcoes(inv, r.acoes);
  ok(snap2.campanhas.filter(c => c.status === 'ativo').length === 0 && snap2.campanhas.length === 3, 'depois de aplicar: nada ativo e nenhuma campanha some');
  snap2.eventos.push({ id: 'pz1', quando: min(1), atorId: 'guardiao', tipo: 'status', depois: 'pausado', alvoId: 'c1' }); // a própria pausa aparece no registro
  let rA = G.processar(snap2, r.estado, { incidente: r.incidente });
  ok(rA.acoes.length === 0 && rA.evento === null && rA.incidente.reincidencias.length === 0, 'mesma situação de novo → nenhuma ação, sem reincidência');
  let rB = G.processar(snap2, rA.estado, { incidente: rA.incidente });
  ok(rB.acoes.length === 0 && rB.evento === null, 'terceira verificação igual → nada');
  const evPg = ev(5, { tipo: 'pagamento' });
  const alertaSo = G.processar(base({ eventos: [evPg] }), null);
  const deNovo = G.processar(base({ eventos: [evPg], agora: new Date(AGORA + 2 * 60000).toISOString() }), alertaSo.estado);
  ok(alertaSo.achados.length === 1 && deNovo.achados.length === 0 && deNovo.evento === null, 'alerta comum não repete na verificação seguinte');

  step('vigilância: reativação → pausa de novo (reincidência)');
  const reat = JSON.parse(JSON.stringify(snap2));
  const t2 = new Date(AGORA + 4 * 60000).toISOString();
  reat.agora = t2; reat.campanhas[0].status = 'ativo';
  reat.eventos.push({ id: 'ra1', quando: new Date(AGORA + 3 * 60000).toISOString(), atorId: 'meta-x', atorNome: 'Invasor', tipo: 'status', depois: 'ativo', alvoId: 'c1', alvoNome: '[MSG] Oferta' });
  let rr = G.processar(reat, rB.estado, { incidente: rB.incidente });
  ok(rr.evento === 'reincidencia' && rr.acoes.length === 1 && rr.acoes[0].id === 'c1' && rr.acoes[0].tipo === 'pausar', 'campanha reativada → pausada de novo');
  ok(rr.incidente.reincidencias.length === 1 && rr.estado.reincidencias === 1 && rr.incidente.estado === 'aberto', 'reincidência registrada e incidente volta a "aberto"');
  ok(/^REINCIDÊNCIA/.test(rr.notificacao.titulo) && rr.notificacao.tipo === 'invasao' && rr.notificacao.subtipo === 'reincidencia', 'nova notificação de reincidência');
  ok(rr.incidente.pausados.find(x => x.id === 'c1').orcAntes === 100, 'orçamento de antes do incidente preservado');
  const reat2 = G.aplicarAcoes(reat, rr.acoes);
  const rr2 = G.processar(reat2, rr.estado, { incidente: rr.incidente });
  ok(rr2.acoes.length === 0 && rr2.evento === null, 'depois de pausar de novo → nada (idempotente)');
  // alteração nova sem campanha ativa (ex.: invasor sobe orçamento de campanha pausada) → reincidência sem pausa
  const alt = JSON.parse(JSON.stringify(reat2)); alt.agora = new Date(AGORA + 8 * 60000).toISOString();
  alt.eventos.push({ id: 'ra2', quando: new Date(AGORA + 7 * 60000).toISOString(), atorId: 'meta-x', tipo: 'orcamento', antes: 500, depois: 2000, alvoId: 'c1' });
  const rr3 = G.processar(alt, rr2.estado, { incidente: rr2.incidente });
  ok(rr3.evento === 'reincidencia' && rr3.acoes.length === 0 && rr3.incidente.reincidencias.length === 2, 'alteração nova em conta em quarentena → reincidência (escala de novo)');
  // pausa feita pela equipe durante a quarentena não é reincidência
  const pz = JSON.parse(JSON.stringify(alt)); pz.agora = new Date(AGORA + 9 * 60000).toISOString();
  pz.eventos.push({ id: 'pz2', quando: new Date(AGORA + 8.5 * 60000).toISOString(), atorId: 'meta-ana', tipo: 'status', depois: 'pausado', alvoId: 'c2' });
  ok(G.processar(pz, rr3.estado, { incidente: rr3.incidente }).evento === null, 'pausar algo durante a quarentena não dispara');
  // campanha nova criada e ativada pelo invasor durante a quarentena
  const nv = JSON.parse(JSON.stringify(pz)); nv.agora = new Date(AGORA + 12 * 60000).toISOString();
  nv.campanhas.push({ id: 'c9', nome: 'Golpe', status: 'ativo', cbo: true, orc: 999, conjuntos: [] });
  nv.eventos.push({ id: 'cr9', quando: new Date(AGORA + 11 * 60000).toISOString(), atorId: 'meta-x', tipo: 'criacao_campanha', alvoId: 'c9', alvoNome: 'Golpe' });
  const rr4 = G.processar(nv, rr3.estado, { incidente: rr3.incidente });
  const p9 = rr4.incidente.pausados.find(x => x.id === 'c9');
  ok(rr4.acoes.map(x => x.id).join() === 'c9' && p9 && p9.criadaNoIncidente === true, 'campanha criada pelo invasor é pausada e marcada "criada no incidente"');

  step('assumir incidente');
  let inc = G.assumir(rr4.incidente, { userId: 'u-ana', nome: 'Ana' }, AGORA);
  inc = G.assumir(inc, { userId: 'u-gabriel', nome: 'Gabriel' }, AGORA);
  inc = G.assumir(inc, { userId: 'u-ana', nome: 'Ana' }, AGORA);
  ok(inc.estado === 'assumido' && inc.assumidoPor.map(x => x.userId).join() === 'u-ana,u-gabriel', 'vários podem assumir, sem duplicar');

  step('saída da quarentena: SIM + checklist + dono/admin');
  const ckOk = Object.fromEntries(G.CHECKLIST.map(c => [c.id, true]));
  ok(G.CHECKLIST.length === 5, 'checklist com 5 itens');
  ok(G.validarSaida({ papel: 'gestor_trafego', confirmacao: 'SIM', checklist: ckOk }).erros.papel, 'gestor de tráfego não libera');
  ok(G.validarSaida({ papel: 'dono', confirmacao: 'sim', checklist: ckOk }).erros.confirmacao, '"sim" minúsculo não vale');
  const semDois = { ...ckOk, doisFatores: false };
  ok(/dois fatores/.test(G.validarSaida({ papel: 'admin', confirmacao: 'SIM', checklist: semDois }).erros.checklist || ''), 'checklist incompleto diz o que falta');
  ok(G.validarSaida({ papel: 'admin', confirmacao: ' SIM ', checklist: ckOk }).ok, 'admin + SIM + checklist completo → ok');

  step('reativação seletiva com orçamento anterior');
  let pl = G.planoReativacao(inc, { selecionadas: ['c1', 'c2'], restaurar: true });
  ok(pl.ok && pl.acoes.map(x => `${x.tipo}:${x.id}`).join() === 'orcamento:c1,ativar:c1,orcamento:s1,ativar:c2', `restaurar: orçamento antes de ativar (${pl.acoes.map(x => `${x.tipo}:${x.id}`)})`);
  ok(pl.acoes[0].de === 500 && pl.acoes[0].para === 100 && pl.acoes[2].de === 400 && pl.acoes[2].para === 50, 'volta ao orçamento de antes do incidente (500→100, 400→50)');
  ok(pl.linhas.find(l => l.id === 'c2').orcAntes === 80 && pl.linhas.find(l => l.id === 'c2').orcAtual === 430 && pl.linhas.find(l => l.id === 'c2').alterado, 'linhas mostram antes → depois por campanha');
  pl = G.planoReativacao(inc, { selecionadas: ['c1'], restaurar: { c1: false } });
  ok(pl.acoes.length === 1 && pl.acoes[0].tipo === 'ativar', 'sem restaurar: só reativa');
  ok(!G.planoReativacao(inc, { selecionadas: ['c3'] }).ok, 'campanha que o Guardião não pausou não é reativada por aqui');
  const pg = G.planoReativacao(inc, { selecionadas: ['c9'] });
  ok(pg.ok && pg.avisos.length === 1 && /criada durante o incidente/.test(pg.avisos[0]), 'campanha do invasor gera aviso');
  pl = G.planoReativacao(inc, { selecionadas: ['c1', 'c2'], restaurar: true });
  let fim = G.aplicarAcoes(G.aplicarAcoes(nv, rr4.acoes), pl.acoes);
  ok(fim.campanhas.find(c => c.id === 'c1').status === 'ativo' && fim.campanhas.find(c => c.id === 'c1').orc === 100 && fim.campanhas.find(c => c.id === 'c2').conjuntos.find(s => s.id === 's1').orc === 50 && fim.campanhas.find(c => c.id === 'c9').status !== 'ativo', 'plano aplicado: c1 e c2 no ar com orçamento anterior; c9 continua pausada');
  const sq = G.sairQuarentena(rr4.estado, inc, { quem: { userId: 'u-gabriel', nome: 'Gabriel' }, quando: AGORA, checklist: ckOk, plano: pl });
  ok(!sq.estado.quarentena && sq.incidente.estado === 'encerrado' && sq.incidente.reativadas.join() === 'c1,c2' && sq.incidente.orcamentosRestaurados.length === 2, 'quarentena encerrada com registro do que voltou');
  fim.agora = new Date(AGORA + 20 * 60000).toISOString();
  ok(G.processar(fim, sq.estado).acoes.length === 0, 'depois de liberada, campanhas ativas não são pausadas de novo');

  step('destinatários');
  const users = [{ id: 'u-ana', papel: 'gestor_trafego' }, { id: 'u-gabriel', papel: 'dono' }, { id: 'u-rayane', papel: 'admin' }, { id: 'u-carla', papel: 'producao' }, { id: 'u-bruno', papel: 'gestor_trafego', ativo: false }, { id: 'u-felipe', papel: 'cs' }];
  ok(G.destinatarios(users).map(u => u.id).join() === 'u-ana,u-gabriel,u-rayane', 'gestores de tráfego + dono + admin ativos');

  step('adaptador do Meta');
  const b = G.adaptadores.metaAtividade({ event_type: 'update_campaign_budget', event_time: '2026-11-24T06:12:00+0000', actor_id: '777', actor_name: 'X', object_id: '123', object_name: 'Camp', object_type: 'CAMPAIGN', extra_data: '{"old_value":{"old_value":5000},"new_value":{"new_value":25000}}' });
  ok(b.tipo === 'orcamento' && b.antes === 50 && b.depois === 250 && b.nivel === 'campanha' && b.atorId === '777' && b.quando === '2026-11-24T06:12:00.000Z', 'orçamento em centavos → reais');
  ok(G.adaptadores.metaAtividade({ event_type: 'update_campaign_run_status', event_time: 1795000000, extra_data: { new_value: 'ACTIVE' } }).depois === 'ativo', 'status ativo');
  ok(G.adaptadores.metaAtividade({ event_type: 'ad_account_add_user_to_role', extra_data: { new_value: { name: 'Hacker' } } }).tipo === 'admin_adicionado', 'admin adicionado');
  ok(G.adaptadores.metaAtividade({ event_type: 'update_ad_set_target_spec', extra_data: { new_value: { geo_locations: { countries: ['BR', 'NG'] } } } }).depois.paises.join() === 'BR,NG', 'países da segmentação');
  ok(G.adaptadores.metaAtividade({ event_type: 'update_ad_creative', extra_data: { new_value: 'https://wa.me/5511988887777' } }).tipo === 'whatsapp', 'criativo com wa.me → WhatsApp');
  ok(['ad_review_approved', 'ad_account_billing_charge', 'first_delivery_event'].every(x => G.adaptadores.tipoMeta(x) === 'sistema_meta') && G.adaptadores.tipoMeta('create_campaign_group') === 'criacao_campanha' && G.adaptadores.tipoMeta('add_funding_source') === 'pagamento', 'tabela de tipos do Meta');
  const cm = G.adaptadores.metaCampanhas([{ id: '1', name: 'CBO', effective_status: 'ACTIVE', daily_budget: '15000' }, { id: '2', name: 'ABO', status: 'PAUSED' }], [{ id: '21', name: 'S', campaign_id: '2', status: 'ACTIVE', daily_budget: '3000', targeting: { geo_locations: { countries: ['BR'] } } }]);
  ok(cm[0].cbo && cm[0].orc === 150 && cm[0].status === 'ativo' && cm[1].status === 'pausado' && cm[1].conjuntos[0].orc === 30 && cm[1].conjuntos[0].paises[0] === 'BR', 'campanhas e conjuntos do Graph API');
  const gh = G.adaptadores.metaGastoHoras([{ date_start: '2026-11-24', hourly_stats_aggregated_by_advertiser_time_zone: '03:00:00 - 03:59:59', spend: '88.5' }]);
  ok(gh[0].inicio === '2026-11-24T06:00:00.000Z' && gh[0].gasto === 88.5, 'gasto por hora (fuso da conta → UTC)');

  step('adaptador da Torre + simulação de invasão');
  const contaTorre = { id: 7, nome: 'Clínica Torre', tetoDia: null, camps: [
    { id: 1, nome: '[MSG] A', status: 'Ativa', cbo: true, orc: 60, sets: [{ id: 2, nome: 'S', status: 'Ativa', orc: 0 }] },
    { id: 3, nome: '[MSG] B', status: 'Em aprendizado', cbo: false, orc: 0, sets: [{ id: 4, nome: 'S2', status: 'Ativa', orc: 25 }, { id: 5, nome: 'S3', status: 'Pausada', orc: 10 }] },
    { id: 6, nome: '[CAD] C', status: 'Pausada', cbo: true, orc: 40, sets: [] }] };
  const st = G.adaptadores.torre(contaTorre, { agora: AGORA, autorizados: ['vitor'] });
  ok(st.campanhas.length === 3 && st.campanhas[1].status === 'ativo' && st.campanhas[2].status === 'pausado' && G.orcamentoDiario(st) === 85, 'conta da Torre → snapshot (orçamento diário 85)');
  const sim = G.simularInvasao(st, { mediaHora: 4 });
  ok(sim.campanhas.length === 4 && sim.eventos.length === 4 && sim.campanhas[0].orc === 300, 'simulação: orçamento ×5, campanha nova, admin, país');
  const rs2 = G.processar(sim, null);
  ok(rs2.nivel === 'supremo' && ['admin-novo', 'orcamento-salto', 'campanha-nova', 'gasto-pico', 'pais-novo', 'ator-desconhecido'].every(id => tem(rs2, id)), `simulação dispara as regras esperadas (${[...new Set(regrasDe(rs2))]})`);
  ok(rs2.acoes.length === 3 && rs2.incidente.pausados.find(p => p.criadaNoIncidente) && rs2.incidente.pausados.find(p => p.id === '1').orcAntes === 60, 'pausa 3 ativas (inclusive a do invasor) e guarda orçamento anterior');

  step('cópia do motor na Edge Function');
  const edge = path.join(ROOT, 'supabase/functions/guardiao/motor.js');
  ok(fs.existsSync(edge) && fs.readFileSync(edge, 'utf8').includes(fs.readFileSync(path.join(ROOT, 'src/shared/guardiao.js'), 'utf8')), 'supabase/functions/guardiao/motor.js contém o mesmo motor (rode: node supabase/functions/guardiao/sync-motor.mjs)');
}
