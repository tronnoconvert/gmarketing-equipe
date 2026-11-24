/* motor-recs.js — motor ÚNICO de recomendações (item 18): Torre de Controle (contas dos clientes) e Campanha (conta própria).
 * JavaScript puro, sem import/export: pode ser concatenado no build da Torre (torre2/build.js) ou importado pelo app
 * via src/shared/motor-recs.mjs. Expõe globalThis.MotorRecs.
 * Esquema do snapshot, das regras e da saída: docs/MOTOR-RECS.md.
 */
var MotorRecs = (function () {
  'use strict';
  var VERSAO = '1.0.0';

  /* ------------------------------------------------------------------ formatação pt-BR (sem Intl, determinística) */
  function num(v, d) {
    d = d || 0; if (v == null || !isFinite(v)) return '—';
    var s = Math.abs(v).toFixed(d), p = s.split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var out = p[0] + (d ? ',' + p[1] : '');
    return (v < 0 && Number(s) !== 0 ? '-' : '') + out;
  }
  var F = {
    num: num,
    brl: function (v) { return 'R$ ' + num(Math.round(v), 0); },
    brl2: function (v) { return 'R$ ' + num(v, 2); },
    brlv: function (v) { return Math.abs(Math.round(v * 100) - Math.round(v) * 100) < 1 ? 'R$ ' + num(Math.round(v), 0) : 'R$ ' + num(v, 2); }, // inteiro sem centavos
    pct: function (v, d) { return num(v, d == null ? 0 : d) + '%'; },        // v já em % (30 → "30%")
    dec: function (v, d) { return num(v, d == null ? 1 : d); },
    plural: function (n, um, varios) { return num(n, 0) + ' ' + (Math.round(n) === 1 ? um : (varios || um + 's')); },
  };
  var TIPO = {
    lead: { um: 'lead', varios: 'leads', custo: 'custo por lead', curto: 'CPL' },
    conversa: { um: 'conversa', varios: 'conversas', custo: 'custo por conversa', curto: 'custo/conversa' },
    compra: { um: 'compra', varios: 'compras', custo: 'custo por compra', curto: 'CPA' },
    engaj: { um: 'engajamento', varios: 'engajamentos', custo: 'custo por engajamento', curto: 'custo/engaj.' },
  };
  var tipoInfo = function (t) { return TIPO[t] || { um: 'resultado', varios: 'resultados', custo: 'custo por resultado', curto: 'custo/resultado' }; };
  var clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };

  /* ------------------------------------------------------------------ REGRAS (dados) */
  // param: {chave, rotulo, valor, unidade: '%'|'×'|'dias'|'n'|'R$', min, max, passo, ajuda}
  // Percentuais são guardados como número de 0 a 100 (70 = 70%). Frequência em "×".
  var REGRAS_PADRAO = [
    {
      id: 'escalar-verba', nome: 'Escalar verba', nivel: 'conjunto', acao: 'orcamento', prioridade: 'semana', ativo: true, exigeDados: true, sucesso: 'escala',
      descricao: 'Sobe a verba do conjunto (ou da campanha com orçamento na campanha) que está bem abaixo do custo-alvo há 7 dias e já saiu do aprendizado. Respeita o teto diário da conta e nunca sobe mais que o limite por mudança, para não reiniciar o aprendizado do Meta.',
      params: [
        { chave: 'fatorAlvo', rotulo: 'Custo em 7 dias até', valor: 70, unidade: '%', min: 30, max: 100, passo: 1, ajuda: 'do custo-alvo' },
        { chave: 'aumento', rotulo: 'Aumento sugerido', valor: 15, unidade: '%', min: 5, max: 50, passo: 1 },
        { chave: 'limiteMudanca', rotulo: 'Limite por mudança', valor: 20, unidade: '%', min: 5, max: 50, passo: 1, ajuda: 'acima disso o Meta pode reiniciar o aprendizado' },
        { chave: 'minResultados', rotulo: 'Mínimo de resultados em 7 dias', valor: 10, unidade: 'n', min: 1, max: 1000, passo: 1 },
        { chave: 'esperaDias', rotulo: 'Esperar após mudança', valor: 3, unidade: 'dias', min: 0, max: 14, passo: 1, ajuda: 'sem sugerir de novo no mesmo alvo' },
      ],
      restricoes: [{ a: 'aumento', menorOuIgual: 'limiteMudanca', msg: 'O aumento não pode passar do limite por mudança.' }],
    },
    {
      id: 'reduzir-verba', nome: 'Reduzir verba', nivel: 'conjunto', acao: 'orcamento', prioridade: 'hoje', ativo: true, exigeDados: true, sucesso: 'custo',
      descricao: 'Corta a verba do conjunto (ou campanha) cujo custo por resultado dos últimos 3 dias passou do limite acima do alvo. Quando o custo passa do limite de urgência, a recomendação vai para "Agora".',
      params: [
        { chave: 'fatorAlvo', rotulo: 'Custo em 3 dias a partir de', valor: 125, unidade: '%', min: 100, max: 300, passo: 1, ajuda: 'do custo-alvo' },
        { chave: 'reducao', rotulo: 'Redução sugerida', valor: 20, unidade: '%', min: 5, max: 50, passo: 1 },
        { chave: 'fatorUrgente', rotulo: 'Urgente a partir de', valor: 150, unidade: '%', min: 100, max: 500, passo: 1, ajuda: 'do custo-alvo' },
        { chave: 'minGasto', rotulo: 'Gasto mínimo em 3 dias', valor: 1, unidade: '×', min: 1, max: 20, passo: 0.5, ajuda: 'vezes o custo-alvo' },
        { chave: 'esperaDias', rotulo: 'Esperar após mudança', valor: 3, unidade: 'dias', min: 0, max: 14, passo: 1, ajuda: 'sem sugerir de novo no mesmo alvo' },
      ],
      restricoes: [{ a: 'fatorUrgente', maiorOuIgual: 'fatorAlvo', msg: 'O limite de urgência deve ser igual ou maior que o limite da regra.' }],
    },
    {
      id: 'pausar-anuncio', nome: 'Pausar anúncio cansado', nivel: 'anuncio', acao: 'pausar', prioridade: 'hoje', ativo: true, exigeDados: true, sucesso: 'custoConjunto',
      descricao: 'Pausa o anúncio que o público já viu demais (frequência alta), cujo CTR despencou na comparação com a semana anterior e que custa mais que a média do conjunto. Só vale quando o conjunto tem outros anúncios ativos para receber a verba.',
      params: [
        { chave: 'frequenciaMax', rotulo: 'Frequência acima de', valor: 3.5, unidade: '×', min: 1, max: 10, passo: 0.1 },
        { chave: 'quedaCtr', rotulo: 'Queda do CTR em 7 dias', valor: 30, unidade: '%', min: 5, max: 90, passo: 1 },
        { chave: 'minImpressoes', rotulo: 'Mínimo de impressões em 7 dias', valor: 1000, unidade: 'n', min: 100, max: 1000000, passo: 100 },
      ],
    },
    {
      id: 'trocar-criativo', nome: 'Trocar criativo', nivel: 'conjunto', acao: 'pedirCriativo', prioridade: 'hoje', ativo: true, exigeDados: true, sucesso: 'ctr',
      descricao: 'Quando TODOS os anúncios ativos do conjunto estão cansados (frequência alta e CTR em queda), pausar não resolve: a recomendação é pedir criativo novo à produção.',
      params: [
        { chave: 'frequenciaMax', rotulo: 'Frequência acima de', valor: 3.5, unidade: '×', min: 1, max: 10, passo: 0.1 },
        { chave: 'quedaCtr', rotulo: 'Queda do CTR em 7 dias', valor: 30, unidade: '%', min: 5, max: 90, passo: 1 },
      ],
    },
    {
      id: 'conta-parada', nome: 'Verificar pagamento / conta parada', nivel: 'conta', acao: 'verificar', prioridade: 'agora', ativo: true, exigeDados: false, sucesso: 'gasto',
      descricao: 'A conta não gastou nada nos últimos dias mesmo tendo campanhas ativas: quase sempre é cartão recusado, conta bloqueada ou anúncios reprovados.',
      params: [{ chave: 'dias', rotulo: 'Dias sem gasto', valor: 2, unidade: 'dias', min: 1, max: 7, passo: 1 }],
    },
    {
      id: 'dados-insuficientes', nome: 'Dados insuficientes', nivel: 'conta', acao: 'aguardar', prioridade: 'semana', ativo: true, exigeDados: false, sucesso: null,
      descricao: 'Conta com poucos dias de veiculação ou poucos resultados: o motor não sugere mexer em verba, anúncio ou público até ter dados para decidir com segurança.',
      params: [
        { chave: 'minDias', rotulo: 'Mínimo de dias com gasto', valor: 3, unidade: 'dias', min: 1, max: 14, passo: 1 },
        { chave: 'minResultados', rotulo: 'Mínimo de resultados em 7 dias', valor: 10, unidade: 'n', min: 1, max: 1000, passo: 1 },
      ],
    },
    {
      id: 'sem-campanha-mensagem', nome: 'Sem campanha de mensagem', nivel: 'conta', acao: 'mensagemCliente', prioridade: 'semana', ativo: true, exigeDados: false, sucesso: null,
      descricao: 'A meta da conta é conversa (WhatsApp/Direct), mas não há campanha de mensagem ativa: o resultado não entra na meta. Sugere conversar com o cliente para propor uma.',
      params: [{ chave: 'gastoMin', rotulo: 'Gasto mínimo em 7 dias', valor: 0, unidade: 'R$', min: 0, max: 100000, passo: 10, ajuda: 'em outras campanhas' }],
    },
    {
      id: 'aprendizado-limitado', nome: 'Aprendizado limitado', nivel: 'conjunto', acao: 'verificar', prioridade: 'semana', ativo: true, exigeDados: false, sucesso: 'custo',
      descricao: 'O conjunto não sai da fase de aprendizado (o Meta marca "aprendizado limitado") ou está aprendendo há muitos dias sem volume. Sugere juntar conjuntos parecidos ou ampliar o público.',
      params: [
        { chave: 'diasMin', rotulo: 'Dias em aprendizado', valor: 7, unidade: 'dias', min: 1, max: 60, passo: 1 },
        { chave: 'minResultados', rotulo: 'Resultados por semana abaixo de', valor: 50, unidade: 'n', min: 1, max: 1000, passo: 1 },
      ],
    },
    {
      id: 'revisar-publico', nome: 'Revisar público', nivel: 'conjunto', acao: 'publico', prioridade: 'semana', ativo: true, exigeDados: true, sucesso: 'cpm',
      descricao: 'O CPM (custo por mil impressões) subiu muito na semana enquanto o CTR ficou estável: o criativo continua bom, o que encareceu foi o público (saturado ou disputado).',
      params: [
        { chave: 'altaCpm', rotulo: 'Alta do CPM em 7 dias', valor: 40, unidade: '%', min: 10, max: 300, passo: 1 },
        { chave: 'variacaoCtr', rotulo: 'CTR estável (variação até)', valor: 10, unidade: '%', min: 0, max: 50, passo: 1 },
        { chave: 'minImpressoes', rotulo: 'Mínimo de impressões em 7 dias', valor: 2000, unidade: 'n', min: 100, max: 1000000, passo: 100 },
      ],
    },
    {
      id: 'conversar-cliente', nome: 'Conversar com o cliente', nivel: 'conta', acao: 'mensagemCliente', prioridade: 'hoje', ativo: true, exigeDados: false, sucesso: 'resultados',
      descricao: 'O resultado da conta caiu na semana e o cliente não recebe mensagem há dias. Avisar antes de ele perceber reduz o risco de cancelamento.',
      params: [
        { chave: 'quedaResultado', rotulo: 'Queda do resultado em 7 dias', valor: 20, unidade: '%', min: 5, max: 90, passo: 1 },
        { chave: 'diasSemMensagem', rotulo: 'Dias sem mensagem', valor: 7, unidade: 'dias', min: 1, max: 60, passo: 1 },
      ],
    },
  ];
  var PRIO = { agora: 0, hoje: 1, semana: 2 };
  var ROTULO_PRIO = { agora: 'Agora', hoje: 'Hoje', semana: 'Esta semana' };
  var ROTULO_ACAO = { orcamento: 'Orçamento', pausar: 'Pausar', pedirCriativo: 'Pedir criativo', mensagemCliente: 'Mensagem ao cliente', verificar: 'Verificar', aguardar: 'Aguardar', publico: 'Público' };
  var ROTULO_NIVEL = { conta: 'Conta', campanha: 'Campanha', conjunto: 'Conjunto', anuncio: 'Anúncio' };

  /** regras efetivas = padrão + overrides {regraId: {ativo?, params?: {chave: valor}}} (valores inválidos são ignorados) */
  function regras(overrides) {
    var ov = overrides || {};
    return REGRAS_PADRAO.map(function (r) {
      var o = clone(r), x = ov[r.id] || {};
      if (typeof x.ativo === 'boolean') o.ativo = x.ativo;
      if (x.params) o.params.forEach(function (p) { var v = Number(x.params[p.chave]); if (x.params[p.chave] != null && validarParam(p, v) === '') p.valor = v; });
      if (o.restricoes && validarRestricoes(o, valores(o)).length) o.params.forEach(function (p, i) { p.valor = r.params[i].valor; }); // combinação inválida → padrão
      o.alterada = JSON.stringify(o.params.map(function (p) { return p.valor; })) !== JSON.stringify(r.params.map(function (p) { return p.valor; })) || o.ativo !== r.ativo;
      return o;
    });
  }
  function valores(regra) { var v = {}; (regra.params || []).forEach(function (p) { v[p.chave] = p.valor; }); return v; }
  function validarParam(p, v) {
    if (v === '' || v == null || typeof v === 'boolean' || !isFinite(Number(v))) return 'Informe um número.';
    v = Number(v);
    if (v < p.min) return 'Mínimo: ' + rotValor(p, p.min) + '.';
    if (v > p.max) return 'Máximo: ' + rotValor(p, p.max) + '.';
    if (p.passo >= 1 && Math.round(v) !== v) return 'Use um número inteiro.';
    return '';
  }
  function validarRestricoes(regra, vals) {
    var out = [];
    (regra.restricoes || []).forEach(function (c) {
      if (c.menorOuIgual && !(vals[c.a] <= vals[c.menorOuIgual])) out.push({ chave: c.a, msg: c.msg });
      if (c.maiorOuIgual && !(vals[c.a] >= vals[c.maiorOuIgual])) out.push({ chave: c.a, msg: c.msg });
    });
    return out;
  }
  /** valida um conjunto de parâmetros de uma regra → {ok, erros: {chave: msg}} */
  function validar(regraId, params) {
    var r = REGRAS_PADRAO.find(function (x) { return x.id === regraId; }); var erros = {};
    if (!r) return { ok: false, erros: { _: 'Regra desconhecida.' } };
    var vals = valores(r);
    r.params.forEach(function (p) { if (params && params[p.chave] !== undefined) { var e = validarParam(p, params[p.chave]); if (e) erros[p.chave] = e; else vals[p.chave] = Number(params[p.chave]); } });
    if (!Object.keys(erros).length) validarRestricoes(r, vals).forEach(function (x) { erros[x.chave] = x.msg; });
    return { ok: !Object.keys(erros).length, erros: erros };
  }
  function rotValor(p, v) {
    if (p.unidade === '%') return F.pct(v, p.passo < 1 ? 1 : 0);
    if (p.unidade === '×') return F.dec(v, 1) + '×';
    if (p.unidade === 'R$') return F.brl(v);
    if (p.unidade === 'dias') return F.plural(v, 'dia');
    return F.num(v, 0);
  }

  /* ------------------------------------------------------------------ métricas */
  var SOMA = ['gasto', 'impressoes', 'cliques', 'resultados', 'valor', 'alcance'];
  /** normaliza uma janela de métricas: deriva custo, ctr, cpm, cpc, roas quando não vierem prontos */
  function M(m) {
    if (!m) return null;
    var o = {}; for (var k in m) o[k] = m[k];
    SOMA.forEach(function (k) { if (o[k] == null) o[k] = 0; });
    if (o.custo == null) o.custo = o.resultados ? o.gasto / o.resultados : null;
    if (o.ctr == null) o.ctr = o.impressoes ? (o.cliques / o.impressoes) * 100 : null;
    if (o.cpm == null) o.cpm = o.impressoes ? (o.gasto / o.impressoes) * 1000 : null;
    if (o.cpc == null) o.cpc = o.cliques ? o.gasto / o.cliques : null;
    if (o.roas == null) o.roas = o.gasto && o.valor ? o.valor / o.gasto : null;
    if (o.frequencia == null) o.frequencia = o.alcance ? o.impressoes / o.alcance : null;
    return o;
  }
  function somar(lista) {
    lista = lista.filter(Boolean); if (!lista.length) return null;
    var o = {}; SOMA.forEach(function (k) { o[k] = 0; }); var fi = 0, fiImp = 0, fs = 0, fn = 0;
    lista.forEach(function (m) {
      SOMA.forEach(function (k) { o[k] += m[k] || 0; });
      if (m.frequencia != null) { if (m.impressoes) { fi += m.frequencia * m.impressoes; fiImp += m.impressoes; } fs += m.frequencia; fn++; }
    });
    o.frequencia = fiImp ? fi / fiImp : fn ? fs / fn : null;
    return M(o);
  }
  /** janela anterior de 7 dias = 14d − 7d (ou metricas7dAnterior se vier pronta) */
  function anterior(m14, m7) {
    if (!m14 || !m7) return null;
    var o = {}; SOMA.forEach(function (k) { o[k] = Math.max(0, (m14[k] || 0) - (m7[k] || 0)); });
    if (m14.frequencia != null && m7.frequencia != null && o.impressoes > 0) o.frequencia = Math.max(0, (m14.frequencia * m14.impressoes - m7.frequencia * m7.impressoes) / o.impressoes);
    if (!o.impressoes && !o.gasto) return null;
    return M(o);
  }
  var JANELAS = { d3: 'metricas3d', d7: 'metricas7d', d14: 'metricas14d', a7: 'metricas7dAnterior' };

  /* ------------------------------------------------------------------ preparação do snapshot */
  var ATIVO = function (s) { return s === 'ativo' || s === 'ativa' || s === 'active'; };
  function preparar(snap) {
    var s = snap || {}; var meta = s.meta || {};
    var conta = { nivel: 'conta', id: (s.conta && s.conta.id) || 'conta', nome: (s.conta && s.conta.nome) || 'Conta', meta: meta };
    var arred = s.arredondarOrcamento || 0.01;
    var camps = (s.campanhas || []).map(function (c) {
      var cm = c.meta ? { tipoResultado: c.meta.tipoResultado || meta.tipoResultado, custoAlvo: c.meta.custoAlvo !== undefined ? c.meta.custoAlvo : meta.custoAlvo, roasAlvo: c.meta.roasAlvo !== undefined ? c.meta.roasAlvo : meta.roasAlvo } : meta;
      var cc = { nivel: 'campanha', raw: c, id: c.id, nome: c.nome, status: c.status, ativo: ATIVO(c.status), cbo: !!c.cbo, orc: Number(c.orc) || 0, objetivo: c.objetivo || null, aprendizado: c.aprendizado || null, meta: cm, conjuntos: [] };
      cc.conjuntos = (c.conjuntos || []).map(function (j) {
        var jj = { nivel: 'conjunto', raw: j, id: j.id, nome: j.nome, status: j.status, ativo: cc.ativo && ATIVO(j.status), orc: Number(j.orc) || 0, aprendizado: j.aprendizado || null, diasEmAprendizado: j.diasEmAprendizado, meta: cm, campanha: cc, anuncios: [] };
        jj.anuncios = (j.anuncios || []).map(function (a) {
          var aa = { nivel: 'anuncio', raw: a, id: a.id, nome: a.nome, status: a.status, ativo: jj.ativo && ATIVO(a.status), formato: a.formato || null, meta: cm, conjunto: jj, campanha: cc, m: {} };
          for (var k in JANELAS) aa.m[k] = M(a[JANELAS[k]]);
          if (!aa.m.a7) aa.m.a7 = anterior(aa.m.d14, aa.m.d7);
          return aa;
        });
        jj.m = {}; for (var k in JANELAS) jj.m[k] = M(j[JANELAS[k]]) || somar(jj.anuncios.map(function (a) { return a.m[k]; }));
        if (!jj.m.a7) jj.m.a7 = anterior(jj.m.d14, jj.m.d7);
        return jj;
      });
      cc.m = {}; for (var k in JANELAS) cc.m[k] = M(c[JANELAS[k]]) || somar(cc.conjuntos.map(function (j) { return j.m[k]; }));
      if (!cc.m.a7) cc.m.a7 = anterior(cc.m.d14, cc.m.d7);
      return cc;
    });
    conta.m = {}; for (var k in JANELAS) conta.m[k] = M(s[JANELAS[k]]) || somar(camps.map(function (c) { return c.m[k]; }));
    if (!conta.m.a7) conta.m.a7 = anterior(conta.m.d14, conta.m.d7);
    // quem tem orçamento: campanha CBO ativa, ou conjuntos ativos de campanhas ativas sem CBO
    var holders = [];
    var maxData = function (lista) { return lista.reduce(function (a, x) { return x && (!a || String(x) > String(a)) ? x : a; }, null); };
    var mudouSet = function (j) { return maxData([j.raw.alteradoEm].concat(j.anuncios.map(function (a) { return a.raw.alteradoEm; }))); };
    camps.forEach(function (c) {
      if (!c.ativo) return;
      if (c.cbo) holders.push({ ent: c, orc: c.orc, alteradoEm: maxData([c.raw.alteradoEm].concat(c.conjuntos.map(mudouSet))), aprendizado: c.aprendizado || (c.conjuntos.some(function (j) { return j.ativo && j.aprendizado === 'aprendendo'; }) ? 'aprendendo' : null) });
      else c.conjuntos.forEach(function (j) { if (j.ativo) holders.push({ ent: j, orc: j.orc, alteradoEm: maxData([c.raw.alteradoEm, mudouSet(j)]), aprendizado: j.aprendizado }); });
    });
    var soma = holders.reduce(function (a, h) { return a + h.orc; }, 0);
    var total = s.orcamentoDiarioConta != null ? Number(s.orcamentoDiarioConta) : soma;
    var hoje = s.hoje ? new Date(s.hoje) : new Date();
    var diasMsg = s.diasSemMensagem != null ? s.diasSemMensagem : s.ultimaMensagemCliente ? Math.floor((hoje - new Date(s.ultimaMensagemCliente)) / 864e5) : null;
    return {
      s: s, conta: conta, campanhas: camps, holders: holders, total: round2(total), teto: s.tetoDiario != null && s.tetoDiario > 0 ? Number(s.tetoDiario) : null,
      arred: arred, minOrc: s.orcamentoMinimo != null ? s.orcamentoMinimo : 6, hoje: hoje, diasMsg: diasMsg,
      tipo: meta.tipoResultado, alvo: meta.custoAlvo,
    };
  }
  var round2 = function (v) { return Math.round(v * 100) / 100; };
  var arredonda = function (v, passo) { return Math.round(Math.round(v / passo) * passo * 100) / 100; };

  /** orçamento diário da conta, opcionalmente trocando o orçamento de um alvo {id, v} */
  function orcamentoConta(snap, troca) {
    var P = snap && snap.holders ? snap : preparar(snap);
    var t = P.total; if (troca) P.holders.forEach(function (h) { if (h.ent.id === troca.id) t += troca.v - h.orc; });
    return round2(t);
  }
  function fraseOrcamento(P, antes, depois) {
    var o = { antes: antes, depois: depois, teto: P.teto, excedeTeto: !!(P.teto && depois > P.teto + 0.001), frase: '', avisoTeto: null };
    o.frase = 'A conta passa a investir ' + F.brlv(depois) + ' por dia (hoje ' + F.brlv(antes) + ').';
    if (o.excedeTeto) o.avisoTeto = 'Passa do teto diário combinado com o cliente (' + F.brlv(P.teto) + ') em ' + F.brlv(depois - P.teto) + '. Combine com o cliente antes de aplicar.';
    return o;
  }

  /** alvo mexido há menos de N dias (orçamento, pausa de anúncio…): espera o Meta reagir antes de sugerir verba de novo */
  function recente(P, h, dias) { if (!h.alteradoEm || !dias) return false; return (P.hoje - new Date(h.alteradoEm)) / 864e5 < dias; }
  function confianca(n, alta, media) { return n >= alta ? 'alta' : n >= media ? 'média' : 'baixa'; }
  var confRes = function (n) { return confianca(n || 0, 30, 10); };
  var confImp = function (n) { return confianca(n || 0, 20000, 5000); };
  function fadiga(a, v) {
    var m7 = a.m.d7, ant = a.m.a7; if (!m7 || !ant || m7.frequencia == null || m7.ctr == null || !ant.ctr) return null;
    var queda = (1 - m7.ctr / ant.ctr) * 100;
    return { cansado: m7.frequencia > v.frequenciaMax && queda > v.quedaCtr, freq: m7.frequencia, queda: queda, ctr: m7.ctr, ctrAnt: ant.ctr };
  }

  /* ------------------------------------------------------------------ avaliação de cada regra */
  var AVALIA = {
    'escalar-verba': function (P, v, out) {
      P.holders.forEach(function (h) {
        var e = h.ent, alvo = e.meta.custoAlvo, m7 = e.m.d7, m3 = e.m.d3; if (!alvo || !m7 || m7.custo == null) return;
        if (h.aprendizado === 'aprendendo' || h.aprendizado === 'limitado') return;
        if (recente(P, h, v.esperaDias)) return;
        if (m7.resultados < v.minResultados || m7.custo > alvo * v.fatorAlvo / 100) return;
        if (m3 && m3.custo != null && m3.custo > alvo) return; // piorou nos últimos 3 dias: não escala
        var T = tipoInfo(e.meta.tipoResultado);
        var aum = Math.min(v.aumento, v.limiteMudanca) / 100, de = h.orc, para = arredonda(de * (1 + aum), P.arred);
        var aviso = null, depois = round2(P.total + para - de);
        if (P.teto && depois > P.teto) {
          var folga = round2(P.teto - P.total);
          if (folga >= Math.max(1, de * 0.05)) { para = arredonda(de + folga, P.arred); if (round2(P.total + para - de) > P.teto) para = Math.floor((de + folga) * 100) / 100; aviso = 'Aumento limitado a +' + F.pct((para / de - 1) * 100) + ' para não passar do teto diário de ' + F.brl2(P.teto) + '.'; }
          depois = round2(P.total + para - de);
        }
        var delta = para - de, extra = (delta * 7 / m7.custo) * 0.85, abaixo = (1 - m7.custo / alvo) * 100;
        out.push({
          alvo: e, de: de, para: para, aviso: aviso, conf: confRes(m7.resultados), base: m7,
          titulo: 'Aumentar a verba de "' + e.nome + '" em ' + F.pct((para / de - 1) * 100),
          rotuloAcao: 'Aumentar ' + F.pct((para / de - 1) * 100),
          impacto: '+' + F.brlv(delta) + ' por dia ≈ +' + F.plural(Math.max(1, Math.round(extra)), T.um, T.varios) + ' por semana, com o ' + T.custo + ' perto de ' + F.brl2(m7.custo * 1.06) + '.',
          porque: 'O ' + T.custo + ' dos últimos 7 dias é ' + F.brl2(m7.custo) + ', ' + F.pct(abaixo) + ' abaixo do alvo de ' + F.brl2(alvo) + ', com ' + F.plural(m7.resultados, T.um, T.varios) + ' e fora do aprendizado. Até ' + F.pct(v.limiteMudanca) + ' de aumento não reinicia o aprendizado do Meta.',
          detalhes: ['Regra: custo em 7 dias até ' + F.pct(v.fatorAlvo) + ' do alvo, pelo menos ' + F.plural(v.minResultados, 'resultado') + ', fora do aprendizado e sem piora nos últimos 3 dias.',
            m3 && m3.custo != null ? 'Últimos 3 dias: ' + F.brl2(m3.custo) + ' por ' + T.um + '.' : null],
        });
      });
    },
    'reduzir-verba': function (P, v, out) {
      P.holders.forEach(function (h) {
        var e = h.ent, alvo = e.meta.custoAlvo, m3 = e.m.d3; if (!alvo || !m3) return;
        if (recente(P, h, v.esperaDias)) return;
        if (m3.gasto < alvo * v.minGasto) return;
        var custo = m3.resultados ? m3.gasto / m3.resultados : Infinity; if (custo < alvo * v.fatorAlvo / 100) return;
        var T = tipoInfo(e.meta.tipoResultado), de = h.orc, para = Math.max(P.minOrc, arredonda(de * (1 - v.reducao / 100), P.arred)); if (para >= de) return;
        var eco = (de - para) * 30.4, m7 = e.m.d7 || m3, perde = m7.resultados ? Math.max(1, Math.round(m7.resultados * (1 - para / de) * 0.4)) : 0;
        var x = isFinite(custo) ? custo / alvo : null;
        out.push({
          alvo: e, de: de, para: para, conf: confRes(m3.resultados + (m7.resultados || 0) / 2), base: m3,
          custoTxt: isFinite(custo) ? F.dec(x, 2) + '× o alvo nos últimos 3 dias (' + F.brl2(custo) + ' por ' + T.um + ', alvo ' + F.brl2(alvo) + ').' : 'sem nenhum resultado nos últimos 3 dias (' + F.brl2(m3.gasto) + ' investidos).',
          prioridade: (!isFinite(custo) || custo >= alvo * v.fatorUrgente / 100) ? 'agora' : null,
          titulo: 'Reduzir a verba de "' + e.nome + '" em ' + F.pct(v.reducao),
          rotuloAcao: 'Reduzir ' + F.pct(v.reducao),
          impacto: 'Economia de ' + F.brlv(de - para) + ' por dia (cerca de ' + F.brl(eco) + ' por mês)' + (perde ? ', perdendo só ~' + F.plural(perde, T.um, T.varios) + ' por semana enquanto o custo volta para perto do alvo.' : '.'),
          porque: isFinite(custo)
            ? 'O ' + T.custo + ' dos últimos 3 dias é ' + F.brl2(custo) + ', ' + F.dec(x, 2) + '× o alvo de ' + F.brl2(alvo) + ' (' + F.brl2(m3.gasto) + ' investidos, ' + F.plural(m3.resultados, T.um, T.varios) + '). Cortar ' + F.pct(v.reducao) + ' segura o prejuízo sem parar o aprendizado.'
            : 'Nos últimos 3 dias foram ' + F.brl2(m3.gasto) + ' investidos sem nenhum resultado (alvo de ' + F.brl2(alvo) + ' por ' + T.um + '). Cortar ' + F.pct(v.reducao) + ' segura o prejuízo enquanto alguém confere a campanha.',
          detalhes: ['Regra: custo em 3 dias a partir de ' + F.pct(v.fatorAlvo) + ' do alvo (urgente a partir de ' + F.pct(v.fatorUrgente) + '), com gasto mínimo de ' + F.dec(v.minGasto, 1) + '× o alvo.'],
        });
      });
    },
    'pausar-anuncio': function (P, v, out, R) {
      var vc = R['trocar-criativo'] && R['trocar-criativo'].ativo ? valores(R['trocar-criativo']) : null;
      P.campanhas.forEach(function (c) {
        c.conjuntos.forEach(function (j) {
          var ativos = j.anuncios.filter(function (a) { return a.ativo; }); if (ativos.length < 2) return;
          if (vc && ativos.every(function (a) { var f = fadiga(a, vc); return f && f.cansado; })) return; // vira "trocar criativo"
          var mj = j.m.d7; var T = tipoInfo(j.meta.tipoResultado);
          ativos.forEach(function (a) {
            var f = fadiga(a, v), m7 = a.m.d7; if (!f || !f.cansado || m7.impressoes < v.minImpressoes) return;
            var cAd = m7.resultados ? m7.gasto / m7.resultados : (m7.gasto > 0 ? Infinity : null), cSet = mj && mj.custo;
            if (cAd == null || cSet == null || !(cAd > cSet)) return;
            var outros = somar(ativos.filter(function (x) { return x !== a; }).map(function (x) { return x.m.d7; }));
            out.push({
              alvo: a, conf: confImp(m7.impressoes), base: m7,
              titulo: 'Pausar o anúncio "' + a.nome + '"', rotuloAcao: 'Pausar anúncio',
              impacto: 'A verba do conjunto passa para os outros ' + F.plural(ativos.length - 1, 'anúncio') + (outros && outros.custo != null ? ', que custam ' + F.brl2(outros.custo) + ' por ' + T.um : '') + '. O orçamento diário da conta não muda.',
              porque: 'Este anúncio está cansado: frequência ' + F.dec(f.freq, 1) + ', CTR caiu ' + F.pct(f.queda) + ' em 7 dias (de ' + F.pct(f.ctrAnt, 2) + ' para ' + F.pct(f.ctr, 2) + ') e o ' + T.custo + ' dele é ' + (isFinite(cAd) ? F.brl2(cAd) : 'sem resultado') + ', acima da média do conjunto (' + F.brl2(cSet) + '). Pausar redistribui a verba para quem converte melhor.',
              detalhes: ['Regra: frequência acima de ' + F.dec(v.frequenciaMax, 1) + ', CTR com queda maior que ' + F.pct(v.quedaCtr) + ' vs os 7 dias anteriores e custo acima da média do conjunto.', 'Criativo novo: somente pelo Gerenciador, via 4G.'],
            });
          });
        });
      });
    },
    'trocar-criativo': function (P, v, out) {
      P.campanhas.forEach(function (c) {
        c.conjuntos.forEach(function (j) {
          var ativos = j.anuncios.filter(function (a) { return a.ativo; }); if (!ativos.length) return;
          var fs = ativos.map(function (a) { return fadiga(a, v); }); if (!fs.every(function (f) { return f && f.cansado; })) return;
          var fm = fs.reduce(function (a, f) { return a + f.freq; }, 0) / fs.length, qm = fs.reduce(function (a, f) { return a + f.queda; }, 0) / fs.length;
          var ctrAnt = fs.reduce(function (a, f) { return Math.max(a, f.ctrAnt); }, 0);
          out.push({
            alvo: j, conf: confImp(j.m.d7 ? j.m.d7.impressoes : 0), base: j.m.d7,
            titulo: 'Pedir criativo novo para "' + j.nome + '"', rotuloAcao: 'Pedir criativo',
            impacto: 'Criativo novo costuma devolver o CTR para perto de ' + F.pct(ctrAnt, 2) + ' (semana anterior) e baixar o custo por clique. Nada muda na conta agora.',
            porque: (ativos.length === 1 ? 'O único anúncio ativo do conjunto está cansado' : (ativos.length === 2 ? 'Os 2 anúncios ativos' : 'Todos os ' + ativos.length + ' anúncios ativos') + ' do conjunto estão cansados') + ': frequência média ' + F.dec(fm, 1) + ' e CTR caiu ' + F.pct(qm) + ' em 7 dias. Pausar não resolve, porque não sobra anúncio bom para receber a verba.',
            detalhes: ['Regra: todos os anúncios ativos com frequência acima de ' + F.dec(v.frequenciaMax, 1) + ' e queda do CTR maior que ' + F.pct(v.quedaCtr) + '.', 'Subir o criativo novo: somente pelo Gerenciador, via 4G.'],
          });
        });
      });
    },
    'conta-parada': function (P, v, out) {
      var s = P.s, ativas = P.campanhas.filter(function (c) { return c.ativo; }); if (!ativas.length) return;
      var gasto = null;
      if (Array.isArray(s.gastoPorDia) && s.gastoPorDia.length >= v.dias) gasto = s.gastoPorDia.slice(-v.dias).reduce(function (a, d) { return a + (Number(d.gasto) || 0); }, 0);
      else if (v.dias === 2 && s.gastoUltimos2Dias != null) gasto = Number(s.gastoUltimos2Dias);
      if (gasto == null || gasto > 0) return;
      var med = P.conta.m.d14 && P.conta.m.d14.gasto ? P.conta.m.d14.gasto / 14 : P.total;
      out.push({
        alvo: P.conta, conf: 'alta', base: P.conta.m.d7, titulo: 'Verificar pagamento e veiculação da conta', rotuloAcao: 'Verificar conta',
        impacto: 'Cada dia parado deixa de investir cerca de ' + F.brl2(med || P.total) + ' e de gerar resultado. Resolver hoje evita que o aprendizado das campanhas esfrie.',
        porque: 'A conta não gastou nada nos últimos ' + F.plural(v.dias, 'dia') + ', mas tem ' + F.plural(ativas.length, 'campanha ativa', 'campanhas ativas') + '. Quase sempre é cartão recusado, conta bloqueada ou anúncios reprovados.' + (s.statusConta ? ' Status no Meta: ' + String(s.statusConta).toLowerCase() + '.' : ''),
        detalhes: ['Regra: gasto zero em ' + F.plural(v.dias, 'dia') + ' com pelo menos uma campanha ativa.'],
      });
    },
    'dados-insuficientes': function (P, v, out) {
      var m7 = P.conta.m.d7, dias = P.s.diasComDados; if (P.s.diasComDados == null && Array.isArray(P.s.gastoPorDia)) dias = P.s.gastoPorDia.filter(function (d) { return d.gasto > 0; }).length;
      var res = m7 ? m7.resultados : 0; var poucosDias = dias != null && dias < v.minDias, poucos = res < v.minResultados;
      if (!P.campanhas.some(function (c) { return c.ativo; })) return;
      if (!poucosDias && !poucos) return;
      if (m7 && m7.gasto === 0 && !poucosDias) return; // conta parada: outra regra cuida
      var T = tipoInfo(P.tipo);
      out.push({
        alvo: P.conta, conf: 'baixa', base: m7, titulo: 'Aguardar mais dados antes de mexer', rotuloAcao: 'Ciente, aguardar',
        impacto: 'Evita mexer antes da hora: com ' + F.plural(v.minDias, 'dia') + ' de veiculação e ' + F.plural(v.minResultados, T.um, T.varios) + ' a recomendação fica confiável.',
        porque: (poucosDias ? 'A conta tem ' + F.plural(dias, 'dia') + ' de veiculação' : 'A conta tem ' + F.plural(res, T.um, T.varios) + ' em 7 dias') + (poucosDias && m7 ? ' e ' + F.plural(res, T.um, T.varios) : '') + '. Com tão pouco dado, o custo varia muito de um dia para o outro e qualquer mudança agora seria no escuro.',
        detalhes: ['Regra: menos de ' + F.plural(v.minDias, 'dia') + ' com gasto ou menos de ' + F.plural(v.minResultados, 'resultado') + ' em 7 dias. Enquanto isso, as regras de verba, anúncio e público ficam em espera.'],
        bloqueia: true,
      });
    },
    'sem-campanha-mensagem': function (P, v, out) {
      if (P.tipo !== 'conversa') return;
      if (!P.campanhas.some(function (c) { return c.ativo; })) return; // tudo pausado (ex.: contrato pausado): nada a propor
      var msg = P.campanhas.some(function (c) { return c.ativo && (c.objetivo === 'mensagem' || c.objetivo === 'conversa'); }); if (msg) return;
      var m7 = P.conta.m.d7; var gasto = m7 ? m7.gasto : 0; if (gasto < v.gastoMin) return;
      out.push({
        alvo: P.conta, conf: 'alta', base: m7, titulo: 'Propor ao cliente uma campanha de mensagem', rotuloAcao: 'Avisar cliente',
        impacto: 'Com uma campanha de mensagem o resultado passa a contar na meta da conta (custo por conversa' + (P.alvo ? ', alvo ' + F.brl2(P.alvo) : '') + ').',
        porque: 'A meta da conta é conversa no WhatsApp/Direct, mas nenhuma campanha de mensagem está ativa' + (gasto ? ': os ' + F.brl2(gasto) + ' dos últimos 7 dias foram para outros objetivos' : '') + '. Vale conversar com o cliente e propor uma.',
        detalhes: ['Regra: meta da conta = conversa e nenhuma campanha ativa com objetivo de mensagem.'],
      });
    },
    'aprendizado-limitado': function (P, v, out) {
      P.campanhas.forEach(function (c) {
        var alvos = c.cbo && c.ativo ? [{ e: c, ap: c.aprendizado, dias: c.raw.diasEmAprendizado }] : c.conjuntos.filter(function (j) { return j.ativo; }).map(function (j) { return { e: j, ap: j.aprendizado, dias: j.diasEmAprendizado }; });
        alvos.forEach(function (x) {
          var m7 = x.e.m.d7, res = m7 ? m7.resultados : 0; var T = tipoInfo(x.e.meta.tipoResultado);
          var lim = x.ap === 'limitado' || (x.ap === 'aprendendo' && x.dias != null && x.dias >= v.diasMin && res < v.minResultados);
          if (!lim) return;
          out.push({
            alvo: x.e, conf: confRes(res), base: m7, titulo: 'Tirar "' + x.e.nome + '" do aprendizado limitado', rotuloAcao: 'Marcar como feita',
            impacto: 'Com cerca de ' + F.plural(v.minResultados, T.um, T.varios) + ' por semana o Meta estabiliza a entrega e o custo tende a cair.',
            porque: (x.ap === 'limitado' ? 'O Meta marcou o ' + (x.e.nivel === 'campanha' ? 'a campanha' : 'conjunto') + ' como "aprendizado limitado"' : 'Está em aprendizado há ' + F.plural(x.dias, 'dia')) + ' e fez ' + F.plural(res, T.um, T.varios) + ' em 7 dias, abaixo dos ' + F.num(v.minResultados) + ' resultados por semana de que o Meta precisa para estabilizar. Junte conjuntos parecidos ou amplie o público (pelo Gerenciador, via 4G).',
            detalhes: ['Regra: status "aprendizado limitado", ou em aprendizado há ' + F.plural(v.diasMin, 'dia') + ' ou mais com menos de ' + F.plural(v.minResultados, 'resultado') + ' por semana.'],
          });
        });
      });
    },
    'revisar-publico': function (P, v, out) {
      P.campanhas.forEach(function (c) {
        c.conjuntos.forEach(function (j) {
          if (!j.ativo) return; var m7 = j.m.d7, ant = j.m.a7; if (!m7 || !ant || !m7.cpm || !ant.cpm || m7.ctr == null || !ant.ctr || m7.impressoes < v.minImpressoes) return;
          var alta = (m7.cpm / ant.cpm - 1) * 100, vctr = Math.abs(m7.ctr / ant.ctr - 1) * 100;
          if (alta <= v.altaCpm || vctr > v.variacaoCtr) return;
          out.push({
            alvo: j, conf: confImp(m7.impressoes), base: m7, titulo: 'Revisar o público de "' + j.nome + '"', rotuloAcao: 'Marcar como feita',
            impacto: 'Renovar ou ampliar o público costuma devolver o CPM para perto de ' + F.brl2(ant.cpm) + ', baixando o custo de cada resultado na mesma proporção.',
            porque: 'O CPM subiu ' + F.pct(alta) + ' na semana (de ' + F.brl2(ant.cpm) + ' para ' + F.brl2(m7.cpm) + ') enquanto o CTR ficou estável em ' + F.pct(m7.ctr, 2) + ': o anúncio continua bom, o que encareceu foi alcançar esse público.',
            detalhes: ['Regra: CPM com alta maior que ' + F.pct(v.altaCpm) + ' vs os 7 dias anteriores e CTR variando até ' + F.pct(v.variacaoCtr) + '.', 'Mudança de público: somente pelo Gerenciador, via 4G.'],
          });
        });
      });
    },
    'conversar-cliente': function (P, v, out) {
      if (P.diasMsg == null || P.diasMsg < v.diasSemMensagem) return;
      var m7 = P.conta.m.d7, ant = P.conta.m.a7; if (!m7 || !ant) return;
      var T = tipoInfo(P.tipo), caiuRes = ant.resultados > 0 && m7.resultados < ant.resultados * (1 - v.quedaResultado / 100);
      var subiu = ant.custo && m7.custo && m7.custo > ant.custo * (1 + v.quedaResultado / 100);
      if (!caiuRes && !subiu) return;
      out.push({
        alvo: P.conta, conf: confRes(ant.resultados), base: m7, titulo: 'Enviar o resumo da semana ao cliente', rotuloAcao: 'Avisar cliente',
        impacto: 'Avisar antes de o cliente perceber reduz o risco de cancelamento' + (P.s.riscoCancelamento ? ' (risco atual: ' + String(P.s.riscoCancelamento).toLowerCase() + ')' : '') + '.',
        porque: (caiuRes ? 'As ' + T.varios + ' caíram de ' + F.num(ant.resultados) + ' para ' + F.num(m7.resultados) + ' na semana (−' + F.pct((1 - m7.resultados / ant.resultados) * 100) + ')' : 'O ' + T.custo + ' subiu de ' + F.brl2(ant.custo) + ' para ' + F.brl2(m7.custo) + ' na semana') + ' e a última mensagem ao cliente foi há ' + F.plural(P.diasMsg, 'dia') + '.',
        detalhes: ['Regra: resultado com queda maior que ' + F.pct(v.quedaResultado) + ' (ou custo com alta maior que isso) vs a semana anterior e ' + F.plural(v.diasSemMensagem, 'dia') + ' ou mais sem mensagem.'],
      });
    },
  };

  /* ------------------------------------------------------------------ recomendar */
  /** snapshot → [recomendação]. opcoes: {regras (já mescladas) | overrides, hoje} */
  function recomendar(snapshot, opcoes) {
    opcoes = opcoes || {};
    var R = {}; (opcoes.regras || regras(opcoes.overrides)).forEach(function (r) { R[r.id] = r; });
    var P = preparar(snapshot); if (opcoes.hoje) P.hoje = new Date(opcoes.hoje);
    var bruto = [];
    var ordem = REGRAS_PADRAO.map(function (r) { return r.id; });
    // 1º as regras de conta que podem bloquear as de desempenho
    var bloqueio = false;
    ordem.forEach(function (id) {
      var r = R[id]; if (!r || !r.ativo || r.exigeDados || !AVALIA[id]) return;
      var out = []; AVALIA[id](P, valores(r), out, R);
      out.forEach(function (x) { if (x.bloqueia) bloqueio = true; bruto.push({ r: r, x: x }); });
    });
    if (!bloqueio) ordem.forEach(function (id) {
      var r = R[id]; if (!r || !r.ativo || !r.exigeDados || !AVALIA[id]) return;
      var out = []; AVALIA[id](P, valores(r), out, R); out.forEach(function (x) { bruto.push({ r: r, x: x }); });
    });
    // "reduzir verba" cede lugar à regra que ataca a causa no mesmo conjunto (anúncio cansado, criativo, público):
    // a recomendação da causa herda a urgência e explica o custo; se não resolver, a redução volta a aparecer depois.
    bruto = bruto.filter(function (b) {
      if (b.r.id !== 'reduzir-verba') return true;
      var e = b.x.alvo, ids = e.nivel === 'campanha' ? e.conjuntos.map(function (j) { return j.id; }) : [e.id];
      var causa = bruto.filter(function (c) { return ['pausar-anuncio', 'trocar-criativo', 'revisar-publico'].indexOf(c.r.id) >= 0 && ids.indexOf(c.x.alvo.nivel === 'anuncio' ? c.x.alvo.conjunto.id : c.x.alvo.id) >= 0; });
      if (!causa.length) return true;
      var pr = b.x.prioridade || b.r.prioridade, c0 = causa[0];
      causa.forEach(function (c) { var atual = c.x.prioridade || c.r.prioridade; if (PRIO[pr] < PRIO[atual]) c.x.prioridade = pr; });
      c0.x.aviso = 'O custo do conjunto está ' + b.x.custoTxt + ' Resolva a causa primeiro; se o custo não voltar em 3 dias, o motor sugere reduzir a verba.';
      return false;
    });
    var vistos = {}, recs = [];
    bruto.forEach(function (b, i) {
      var r = b.r, x = b.x, e = x.alvo; var id = r.id + ':' + e.id; if (vistos[id]) return; vistos[id] = 1;
      var orc = r.acao === 'orcamento' ? fraseOrcamento(P, P.total, round2(P.total + x.para - x.de)) : null;
      recs.push({
        id: id, regraId: r.id, regraNome: r.nome,
        acao: { tipo: r.acao, rotulo: ROTULO_ACAO[r.acao] },
        alvo: { nivel: e.nivel, id: e.id, nome: e.nome, campanhaId: e.campanha ? e.campanha.id : e.nivel === 'campanha' ? e.id : null, conjuntoId: e.conjunto ? e.conjunto.id : e.nivel === 'conjunto' ? e.id : null },
        titulo: x.titulo, rotuloAcao: x.rotuloAcao, impactoEsperado: x.impacto, porque: x.porque,
        detalhes: (x.detalhes || []).filter(Boolean),
        de: r.acao === 'orcamento' ? x.de : null, para: r.acao === 'orcamento' ? x.para : null,
        orcamentoDiarioContaDepois: orc,
        aviso: x.aviso || (orc && orc.avisoTeto) || null,
        prioridade: x.prioridade || r.prioridade, confianca: x.conf || 'média',
        base: resumoBase(x.base), alvoCusto: e.meta ? e.meta.custoAlvo || null : null,
        _ordem: ordem.indexOf(r.id) * 1000 + i,
      });
    });
    recs.sort(function (a, b) { return PRIO[a.prioridade] - PRIO[b.prioridade] || a._ordem - b._ordem; });
    recs.forEach(function (r) { delete r._ordem; });
    return recs;
  }
  function resumoBase(m) { if (!m) return null; return { gasto: round2(m.gasto || 0), resultados: m.resultados || 0, custo: m.custo == null ? null : round2(m.custo), ctr: m.ctr == null ? null : Math.round(m.ctr * 1000) / 1000, cpm: m.cpm == null ? null : round2(m.cpm), frequencia: m.frequencia == null ? null : Math.round(m.frequencia * 100) / 100 }; }

  /* ------------------------------------------------------------------ registro de aprendizado */
  var DECISOES = ['aceita', 'recusada', 'adiada'];
  /** cria a entrada do log (quem grava é o app: coleção recsLog / localStorage) */
  function registrarDecisao(rec, decisao, quem, quando) {
    if (DECISOES.indexOf(decisao) < 0) throw new Error('decisão inválida: ' + decisao);
    var q = quando ? new Date(quando) : new Date();
    return {
      id: 'rl-' + rec.id.replace(/[^a-z0-9]+/gi, '-') + '-' + q.getTime().toString(36),
      recId: rec.id, regraId: rec.regraId, decisao: decisao, quem: quem || null, quando: q.toISOString(),
      alvo: rec.alvo, acao: rec.acao.tipo, titulo: rec.titulo, de: rec.de, para: rec.para,
      antes: rec.base, alvoCusto: rec.alvoCusto, avaliarEm: decisao === 'aceita' ? new Date(q.getTime() + 7 * 864e5).toISOString() : null, resultado: null,
    };
  }
  var MAIOR_MELHOR = { resultados: true, ctr: true, gasto: true, custo: false, cpm: false };
  var CRITERIO = { escala: 'resultados', custo: 'custo', custoConjunto: 'custo', ctr: 'ctr', gasto: 'gasto', resultados: 'resultados', cpm: 'cpm' };
  /** compara a métrica 7 dias antes × 7 dias depois → {metrica, antes, depois, melhorou} */
  function avaliarResultado(entrada, depois) {
    var r = REGRAS_PADRAO.find(function (x) { return x.id === entrada.regraId; }); if (!r || !r.sucesso || !depois) return null;
    var k = CRITERIO[r.sucesso], a = entrada.antes ? entrada.antes[k] : null, d = depois[k];
    if (a == null || d == null) return { metrica: k, antes: a, depois: d, melhorou: null };
    var melhorou = MAIOR_MELHOR[k] ? d > a : d < a;
    if (r.sucesso === 'escala' && entrada.alvoCusto && depois.custo != null) melhorou = melhorou && depois.custo <= entrada.alvoCusto;
    return { metrica: k, antes: a, depois: d, melhorou: melhorou, avaliadoEm: new Date().toISOString() };
  }
  /** entradas aceitas cuja avaliação venceu (7 dias) e ainda não têm resultado */
  function pendentesDeAvaliacao(log, hoje) { var h = hoje ? new Date(hoje) : new Date(); return (log || []).filter(function (e) { return e.decisao === 'aceita' && !e.resultado && e.avaliarEm && new Date(e.avaliarEm) <= h; }); }
  /** estatística por regra nos últimos N dias: {regraId: {sugestoes, aceitas, recusadas, adiadas, taxaAceite, avaliadas, deramCerto, taxaSucesso}} */
  function estatisticas(log, opcoes) {
    opcoes = opcoes || {}; var dias = opcoes.dias || 30, h = opcoes.hoje ? new Date(opcoes.hoje) : new Date(), ini = h.getTime() - dias * 864e5;
    var out = {}; REGRAS_PADRAO.forEach(function (r) { out[r.id] = { sugestoes: 0, aceitas: 0, recusadas: 0, adiadas: 0, decididas: 0, taxaAceite: null, avaliadas: 0, deramCerto: 0, taxaSucesso: null }; });
    var ultima = {}; // a decisão mais recente por recId conta (adiada → depois aceita = aceita)
    (log || []).forEach(function (e) { var t = new Date(e.quando).getTime(); if (t < ini || t > h.getTime() + 864e5) return; if (!ultima[e.recId] || new Date(ultima[e.recId].quando) < new Date(e.quando)) ultima[e.recId] = e; });
    Object.keys(ultima).forEach(function (k) {
      var e = ultima[k], s = out[e.regraId]; if (!s) return;
      s.sugestoes++; s.decididas++;
      if (e.decisao === 'aceita') s.aceitas++; else if (e.decisao === 'recusada') s.recusadas++; else s.adiadas++;
      if (e.resultado && e.resultado.melhorou != null) { s.avaliadas++; if (e.resultado.melhorou) s.deramCerto++; }
    });
    (opcoes.pendentes || []).forEach(function (r) { if (!ultima[r.id] && out[r.regraId]) out[r.regraId].sugestoes++; });
    Object.keys(out).forEach(function (k) { var s = out[k]; s.taxaAceite = s.decididas ? s.aceitas / s.decididas : null; s.taxaSucesso = s.avaliadas ? s.deramCerto / s.avaliadas : null; });
    return out;
  }

  /* ------------------------------------------------------------------ adaptador: Torre de Controle (torre2/data.js) */
  /**
   * Converte uma conta da Torre (objeto de CONTAS em torre2/data.js) num snapshot.
   * A Torre só tem métricas diárias por CONTA (a.series) e gasto/resultados de 7 dias por campanha/conjunto/anúncio (g7/res).
   * O adaptador distribui as janelas de 3 e 14 dias pela participação de cada nível e, como o protótipo não tem frequência/CTR
   * por anúncio, traduz os sinais de diagnóstico da conta (a.fadiga, semáforo "Atenção") em métricas de anúncio/conjunto.
   * opcoes: {hoje: Date, invDia(a): orçamento diário (função da Torre), aprendizadoDias}
   */
  function adaptarTorre(a, opcoes) {
    opcoes = opcoes || {};
    var hoje = opcoes.hoje || new Date(), serie = a.series || [];
    var ult = function (n, ini) { return serie.slice(serie.length - n - (ini || 0), serie.length - (ini || 0)); };
    var soma = function (arr, k) { return arr.reduce(function (s, x) { return s + (x[k] || 0); }, 0); };
    var semMsg = a.sem === 'sem';
    var janela = function (arr) { var imp = soma(arr, 'impr'), alc = soma(arr, 'reach'); return { gasto: soma(arr, 'sp'), impressoes: imp, cliques: soma(arr, 'clicks'), resultados: semMsg ? soma(arr, 'leads') : soma(arr, 'msgs'), alcance: alc, frequencia: alc ? imp / alc : null }; };
    var C = { d3: janela(ult(3)), d7: janela(ult(7)), d14: janela(ult(14)) }; C.a7 = janela(ult(7, 7));
    var pagto = a.statusOp === 'Pagamento pendente';
    var st = function (s) { if (pagto) return 'ativo'; return s === 'Ativa' || s === 'Em aprendizado' ? 'ativo' : s === 'Pausada' ? 'pausado' : 'erro'; };
    var esc = function (m, k) { // escala a janela da conta pela participação k (gasto e resultados), mantendo taxas
      var o = {}; for (var x in m) o[x] = m[x]; ['gasto', 'impressoes', 'cliques', 'resultados', 'alcance'].forEach(function (x) { o[x] = (m[x] || 0) * k; }); o.resultados = Math.round(o.resultados * 10) / 10; return o;
    };
    var principal = null;
    var camps = (a.camps || []).map(function (c) {
      var msg = c.obj === 'Mensagens';
      var conjuntos = (c.sets || []).map(function (s) {
        var k = C.d7.gasto ? (s.g7 || 0) / C.d7.gasto : 0;
        var ads = (s.ads || []).map(function (d) {
          var kd = C.d7.gasto ? (d.g7 || 0) / C.d7.gasto : 0;
          return { id: d.id, nome: d.nome, status: st(d.status), formato: d.fmt, metricas3d: esc(C.d3, kd), metricas7d: esc(C.d7, kd), metricas7dAnterior: esc(C.a7, kd), metricas14d: esc(C.d14, kd) };
        });
        var j = { id: s.id, nome: s.nome, status: st(s.status), orc: s.orc, aprendizado: s.status === 'Em aprendizado' ? 'aprendendo' : null, diasEmAprendizado: s.status === 'Em aprendizado' && s.desde ? Math.floor((hoje - new Date(s.desde)) / 864e5) : null, anuncios: ads };
        if (!msg) j.metricas7d = null;
        return j;
      });
      var cc = { id: c.id, nome: c.nome, status: st(c.status), cbo: !!c.cbo, orc: c.orc, objetivo: msg ? 'mensagem' : 'lead', aprendizado: c.status === 'Em aprendizado' ? 'aprendendo' : null, conjuntos: conjuntos };
      if (!msg) cc.meta = { tipoResultado: 'lead', custoAlvo: null };
      if (msg && !principal && cc.status === 'ativo') principal = cc;
      return cc;
    });
    // sinais de diagnóstico → métricas de anúncio/conjunto (o protótipo não tem essas métricas por anúncio)
    if (principal) {
      var set = principal.conjuntos.find(function (s) { return s.status === 'ativo' && s.anuncios.some(function (d) { return d.status === 'ativo'; }); });
      if (set && a.fadiga === 'Saturado') {
        var ad = set.anuncios.find(function (d) { return d.status === 'ativo'; });
        var m7 = ad.metricas7d, ant = ad.metricas7dAnterior;
        ant.frequencia = 2.5; ant.impressoes = Math.max(ant.impressoes, 1500); ant.cliques = ant.impressoes * 0.014;
        m7.frequencia = 3.6; m7.impressoes = Math.max(m7.impressoes, 1500); m7.cliques = m7.impressoes * 0.014 * 0.62; // CTR −38%
        m7.resultados = Math.max(0, Math.round(m7.resultados * 0.7)); m7.gasto = m7.gasto * 1.1;
      }
      if (set && a.sem === 'aten' && a.fadiga !== 'Saturado') { // custo subiu com CTR estável: CPM mais caro (público saturado)
        set.anuncios.forEach(function (d) { if (d.metricas7d.impressoes) { d.metricas7dAnterior.impressoes = Math.max(d.metricas7dAnterior.impressoes, d.metricas7d.impressoes * 1.5); d.metricas7dAnterior.cliques = d.metricas7dAnterior.impressoes * (d.metricas7d.cliques / d.metricas7d.impressoes); } });
      }
    }
    var orc = typeof opcoes.invDia === 'function' ? opcoes.invDia(a) : null;
    var temCliente = a.ultMsg != null;
    return {
      conta: { id: a.id, nome: a.nome }, hoje: hoje,
      meta: { tipoResultado: 'conversa', custoAlvo: a.meta, roasAlvo: null },
      orcamentoDiarioConta: orc, tetoDiario: a.tetoDia || null, orcamentoMinimo: typeof opcoes.orcamentoMinimo === 'number' ? opcoes.orcamentoMinimo : 6, arredondarOrcamento: 0.01,
      campanhas: camps, metricas3d: C.d3, metricas7d: C.d7, metricas7dAnterior: C.a7, metricas14d: C.d14,
      gastoPorDia: ult(7).map(function (x) { return { data: x.d, gasto: x.sp }; }), gastoUltimos2Dias: soma(ult(2), 'sp'),
      diasComDados: serie.filter(function (x) { return x.sp > 0; }).length,
      diasSemOtimizar: a.diasSem, ultimaMensagemCliente: temCliente ? a.ultMsg : null, statusConta: a.statusOp !== 'OK' ? a.statusOp : null, riscoCancelamento: a.churn || null,
    };
  }

  return {
    versao: VERSAO, REGRAS_PADRAO: REGRAS_PADRAO, PRIO: PRIO, ROTULO_PRIO: ROTULO_PRIO, ROTULO_ACAO: ROTULO_ACAO, ROTULO_NIVEL: ROTULO_NIVEL,
    regras: regras, valores: valores, validar: validar, validarParam: validarParam, rotValor: rotValor,
    recomendar: recomendar, preparar: preparar, orcamentoConta: orcamentoConta, metricas: M, somar: somar,
    registrarDecisao: registrarDecisao, avaliarResultado: avaliarResultado, pendentesDeAvaliacao: pendentesDeAvaliacao, estatisticas: estatisticas,
    adaptadores: { torre: adaptarTorre }, fmt: F,
  };
})();
if (typeof globalThis !== 'undefined') globalThis.MotorRecs = MotorRecs;
