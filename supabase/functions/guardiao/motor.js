// GERADO por sync-motor.mjs a partir de src/shared/guardiao.js — NÃO EDITE AQUI.
/* guardiao.js — Guardião de segurança das contas Meta Ads (detecção de possível invasão + plano de resposta).
 * JavaScript puro, sem import/export e sem efeitos colaterais: quem executa as ações (pausar no Meta, gravar no banco,
 * notificar, tocar a sirene) é o app (Torre/host) ou a Edge Function supabase/functions/guardiao.
 * Pode ser concatenado no build da Torre (torre2/build.js, antes de ov.js) ou importado pelo app via src/shared/guardiao.mjs.
 * Expõe globalThis.Guardiao. Documentação completa: docs/SEGURANCA-INVASAO.md.
 *
 * Fluxo: snapshot normalizado da conta + estado salvo da conta → Guardiao.processar() → {achados, nivel, acoes, incidente, evento, estado}.
 * Nível SUPREMO (qualquer regra crítica, ou 2+ regras altas distintas em 30 min) → pausar TODAS as campanhas ativas (nunca excluir),
 * quarentena e vigilância: a cada verificação, campanha ativa ou alteração nova na conta em quarentena → pausa de novo + "reincidência".
 */
var Guardiao = (function () {
  'use strict';
  var VERSAO = '1.0.0';
  var MIN = 60000, HORA = 3600000, DIA = 86400000;

  /* ------------------------------------------------------------------ formatação pt-BR determinística */
  function num(v, d) {
    d = d || 0; if (v == null || !isFinite(v)) return '—';
    var s = Math.abs(v).toFixed(d), p = s.split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (v < 0 && Number(s) !== 0 ? '-' : '') + p[0] + (d ? ',' + p[1] : '');
  }
  var F = {
    num: num,
    brl: function (v) { return 'R$ ' + num(v, Math.abs(v - Math.round(v)) < 0.005 ? 0 : 2); },
    pct: function (v) { return num(v, 0) + '%'; },
    hora: function (ms, fusoMin) { var d = new Date(ms + fusoMin * MIN); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); },
    dataHora: function (ms, fusoMin) { var d = new Date(ms + fusoMin * MIN); return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); },
  };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
  function ms(v) { if (v == null || v === '') return NaN; if (typeof v === 'number') return v; if (v instanceof Date) return v.getTime(); return Date.parse(v); }
  function iso(v) { var m = ms(v); return isFinite(m) ? new Date(m).toISOString() : null; }
  function horaLocal(m, fusoMin) { return new Date(m + fusoMin * MIN).getUTCHours(); }
  function dataLocal(m, fusoMin) { var d = new Date(m + fusoMin * MIN); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function arred(v) { return Math.round(v * 100) / 100; }

  /* ------------------------------------------------------------------ vocabulário */
  var SEVERIDADES = ['critica', 'alta', 'media'];
  var ROTULO_SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  var NIVEIS = { supremo: 'SUPREMO — possível invasão', alto: 'Alto', medio: 'Médio' };
  /** tipos de evento normalizados (vindos do registro de atividades do Meta ou do simulador da Torre) */
  var TIPOS = {
    orcamento: 'Alterou orçamento', status: 'Alterou status (ativar/pausar)', criacao_campanha: 'Criou campanha', objetivo: 'Alterou objetivo',
    url_destino: 'Alterou URL de destino', whatsapp: 'Alterou número de WhatsApp', admin_adicionado: 'Adicionou administrador/parceiro',
    pagamento: 'Alterou forma de pagamento/limite', segmentacao: 'Alterou segmentação', outro: 'Outra alteração', sistema_meta: 'Evento automático do Meta',
  };
  /** papéis que recebem o alerta de invasão (todos ao mesmo tempo) */
  var PAPEIS_ALVO = ['gestor_trafego', 'dono', 'admin'];
  /** papéis que podem tirar a conta da quarentena */
  var PAPEIS_SAIDA = ['dono', 'admin'];
  var CHECKLIST = [
    { id: 'senhaBM', rotulo: 'Senha do Business Manager (e do Facebook de quem tem acesso) trocada' },
    { id: 'doisFatores', rotulo: 'Autenticação em dois fatores ativa para todos os administradores' },
    { id: 'adminsRevisados', rotulo: 'Administradores e parceiros da conta/BM revisados (intrusos removidos)' },
    { id: 'pagamentoVerificado', rotulo: 'Forma de pagamento e limite de gastos verificados' },
    { id: 'orcamentosRevisados', rotulo: 'Orçamentos revisados (nada inflado pelo invasor)' },
  ];

  /* ------------------------------------------------------------------ REGRAS (dados) */
  // param: {chave, rotulo, valor, unidade: '%'|'R$'|'×'|'min'|'h'|'n', min, max, passo, ajuda}
  var REGRAS_PADRAO = [
    {
      id: 'orcamento-salto', nome: 'Orçamento aumentado de forma brusca', severidade: 'critica', ativo: true,
      descricao: 'Uma única alteração subiu o orçamento de uma campanha ou conjunto acima do limite (em % ou em reais por dia), ou várias alterações seguidas somaram mais que o limite acumulado dentro da janela.',
      params: [
        { chave: 'aumentoPct', rotulo: 'Aumento numa alteração acima de', valor: 100, unidade: '%', min: 20, max: 1000, passo: 5 },
        { chave: 'aumentoAbs', rotulo: 'ou aumento absoluto acima de', valor: 500, unidade: 'R$', min: 50, max: 100000, passo: 10, ajuda: 'por dia, numa alteração' },
        { chave: 'acumuladoPct', rotulo: 'Aumento acumulado acima de', valor: 150, unidade: '%', min: 50, max: 2000, passo: 5 },
        { chave: 'janelaMin', rotulo: 'Janela do acumulado', valor: 60, unidade: 'min', min: 10, max: 1440, passo: 5 },
      ],
      restricoes: [{ a: 'aumentoPct', menorOuIgual: 'acumuladoPct', msg: 'O limite acumulado precisa ser maior ou igual ao limite de uma alteração.' }],
    },
    {
      id: 'fora-horario', nome: 'Alteração de madrugada', severidade: 'alta', ativo: true,
      descricao: 'Alguém mexeu na conta fora do horário de trabalho (padrão: entre 00h e 06h, horário de Brasília).',
      params: [
        { chave: 'inicio', rotulo: 'Das', valor: 0, unidade: 'h', min: 0, max: 23, passo: 1 },
        { chave: 'fim', rotulo: 'até as', valor: 6, unidade: 'h', min: 1, max: 24, passo: 1 },
      ],
      restricoes: [{ a: 'inicio', menor: 'fim', msg: 'O início precisa ser antes do fim.' }],
    },
    {
      id: 'ator-desconhecido', nome: 'Alteração feita por pessoa fora da equipe', severidade: 'alta', ativo: true,
      descricao: 'A alteração veio de um usuário do Meta que não está na lista de usuários autorizados da equipe (Administração › Integrações › Usuários do Meta).',
      params: [],
    },
    {
      id: 'gasto-pico', nome: 'Gasto disparou na última hora', severidade: 'critica', ativo: true,
      descricao: 'O gasto da última hora passou de N vezes a média por hora dos últimos 7 dias e de um valor mínimo.',
      params: [
        { chave: 'fator', rotulo: 'Gasto da última hora acima de', valor: 4, unidade: '×', min: 1.5, max: 50, passo: 0.5, ajuda: 'a média por hora dos últimos 7 dias' },
        { chave: 'minimo', rotulo: 'e acima de', valor: 50, unidade: 'R$', min: 0, max: 100000, passo: 10, ajuda: 'na hora' },
      ],
    },
    {
      id: 'campanha-nova', nome: 'Campanha criada fora da equipe', severidade: 'critica', ativo: true,
      descricao: 'Uma campanha nova apareceu e não foi criada por alguém da equipe pelo app ou pelo Gerenciador (lista de usuários autorizados).',
      params: [],
    },
    {
      id: 'destino-alterado', nome: 'Destino de anúncio ativo alterado', severidade: 'alta', ativo: true,
      descricao: 'Objetivo, URL de destino ou número de WhatsApp de um anúncio ativo foi trocado — golpe típico para desviar os contatos do cliente.',
      params: [],
    },
    {
      id: 'admin-novo', nome: 'Novo administrador ou parceiro', severidade: 'critica', ativo: true,
      descricao: 'Uma pessoa ou empresa parceira ganhou acesso à conta de anúncios ou ao Business Manager.',
      params: [],
    },
    {
      id: 'pagamento-alterado', nome: 'Forma de pagamento alterada', severidade: 'alta', ativo: true,
      descricao: 'Cartão, forma de pagamento ou limite de gastos da conta foi alterado ou removido.',
      params: [],
    },
    {
      id: 'pais-novo', nome: 'Segmentação para país nunca usado', severidade: 'alta', ativo: true,
      descricao: 'Um conjunto passou a anunciar para um país que a conta nunca usou.',
      params: [],
    },
    {
      id: 'teto-projetado', nome: 'Gasto do dia acima do teto do cliente', severidade: 'alta', ativo: true,
      descricao: 'O investimento projetado para hoje (orçamentos ativos ou ritmo de gasto) passa do teto diário do cliente (teto mensal ÷ 30,4) em mais que o limite.',
      params: [
        { chave: 'excessoPct', rotulo: 'Acima do teto diário em mais de', valor: 50, unidade: '%', min: 0, max: 1000, passo: 5 },
      ],
    },
    {
      id: 'rajada', nome: 'Rajada de alterações', severidade: 'alta', ativo: true,
      descricao: 'Muitas alterações em poucos minutos — comportamento de robô ou de invasor mexendo em tudo.',
      params: [
        { chave: 'maxAlteracoes', rotulo: 'Mais de', valor: 10, unidade: 'n', min: 3, max: 200, passo: 1, ajuda: 'alterações' },
        { chave: 'janelaMin', rotulo: 'em', valor: 10, unidade: 'min', min: 1, max: 120, passo: 1 },
      ],
    },
  ];
  /** agregação em incidente (também editável: overrides.agregacao) */
  var AGREGACAO_PADRAO = {
    id: 'agregacao', nome: 'Quando vira incidente SUPREMO',
    descricao: 'Qualquer regra crítica, ou várias regras altas diferentes dentro da janela, vira incidente SUPREMO: a conta é pausada na hora e entra em quarentena.',
    params: [
      { chave: 'altasParaSupremo', rotulo: 'Regras altas diferentes', valor: 2, unidade: 'n', min: 2, max: 10, passo: 1 },
      { chave: 'janelaAltasMin', rotulo: 'dentro de', valor: 30, unidade: 'min', min: 5, max: 1440, passo: 5 },
      { chave: 'janelaEventosMin', rotulo: 'Olhar alterações dos últimos', valor: 120, unidade: 'min', min: 10, max: 2880, passo: 10, ajuda: 'eventos mais antigos são ignorados' },
    ],
  };

  function validarParam(p, v) {
    if (typeof v !== 'number' || !isFinite(v)) return 'Informe um número.';
    if (v < p.min || v > p.max) return 'Use um valor entre ' + num(p.min, p.passo < 1 ? 1 : 0) + ' e ' + num(p.max, 0) + '.';
    return '';
  }
  function base(id) { if (id === 'agregacao') return AGREGACAO_PADRAO; for (var i = 0; i < REGRAS_PADRAO.length; i++) if (REGRAS_PADRAO[i].id === id) return REGRAS_PADRAO[i]; return null; }
  /** {ok, erros:{chave:msg}} — valida parâmetros (faixa + restrições entre campos) */
  function validar(regraId, params) {
    var r = base(regraId); var erros = {};
    if (!r) return { ok: false, erros: { _: 'Regra desconhecida.' } };
    var vals = {}; r.params.forEach(function (p) { vals[p.chave] = params && params[p.chave] != null ? params[p.chave] : p.valor; var e = validarParam(p, vals[p.chave]); if (e) erros[p.chave] = e; });
    (r.restricoes || []).forEach(function (x) {
      if (erros[x.a]) return;
      if (x.menorOuIgual && !(vals[x.a] <= vals[x.menorOuIgual])) erros[x.a] = x.msg;
      if (x.menor && !(vals[x.a] < vals[x.menor])) erros[x.a] = x.msg;
    });
    return { ok: !Object.keys(erros).length, erros: erros };
  }
  /** regras efetivas = padrão + overrides ({id: {ativo, severidade, params:{chave: valor}}}); valores inválidos são ignorados */
  function regras(overrides) {
    overrides = overrides || {};
    return REGRAS_PADRAO.concat([AGREGACAO_PADRAO]).map(function (r0) {
      var r = clone(r0), o = overrides[r.id] || {};
      if (typeof o.ativo === 'boolean' && r.id !== 'agregacao') r.ativo = o.ativo;
      if (o.severidade && SEVERIDADES.indexOf(o.severidade) >= 0 && r.id !== 'agregacao') r.severidade = o.severidade;
      if (o.params) {
        var cand = {}; r.params.forEach(function (p) { cand[p.chave] = o.params[p.chave] != null ? Number(o.params[p.chave]) : p.valor; });
        var v = validar(r.id, cand);
        r.params.forEach(function (p) { if (!v.erros[p.chave]) p.valor = cand[p.chave]; });
      }
      return r;
    });
  }
  function valores(r) { var o = {}; r.params.forEach(function (p) { o[p.chave] = p.valor; }); return o; }

  /* ------------------------------------------------------------------ leitura do snapshot */
  var ATIVO = function (s) { return s === 'ativo'; };
  function opcoes(snap) {
    return {
      agora: isFinite(ms(snap.agora)) ? ms(snap.agora) : Date.now(),
      fusoMin: typeof snap.fusoMin === 'number' ? snap.fusoMin : -180,
      autorizados: (snap.autorizados || []).map(String),
      sistema: ['guardiao', 'sistema'].concat((snap.sistemaIds || []).map(String)),
      canaisEquipe: snap.canaisEquipe || ['app', 'gerenciador'],
    };
  }
  /** orçamento diário ativo da conta (CBO na campanha; ABO soma dos conjuntos ativos) */
  function orcamentoDiario(snap) {
    var t = 0;
    (snap.campanhas || []).forEach(function (c) {
      if (!ATIVO(c.status)) return;
      if (c.cbo) t += Number(c.orc) || 0;
      else (c.conjuntos || []).forEach(function (s) { if (ATIVO(s.status)) t += Number(s.orc) || 0; });
    });
    return arred(t);
  }
  function ehDoSistema(ev, o) { return ev.tipo === 'sistema_meta' || (ev.atorId != null && o.sistema.indexOf(String(ev.atorId)) >= 0) || ev.via === 'sistema'; }
  function autorizado(ev, o) { return ev.atorId != null && o.autorizados.indexOf(String(ev.atorId)) >= 0; }
  function nomeAtor(ev) { return ev.atorNome || (ev.atorId ? 'usuário ' + ev.atorId : 'usuário desconhecido'); }
  function alvoTxt(ev) { return ev.alvoNome ? '"' + ev.alvoNome + '"' : (ev.nivel === 'conta' ? 'a conta' : 'item ' + (ev.alvoId || '?')); }

  /** eventos de pessoas (não do sistema), dentro da janela, ordenados por hora */
  function eventosRecentes(snap, o, janelaMin) {
    var desde = o.agora - janelaMin * MIN;
    return (snap.eventos || []).filter(function (e) { var t = ms(e.quando); return isFinite(t) && t >= desde && t <= o.agora + 5 * MIN && !ehDoSistema(e, o); })
      .sort(function (a, b) { return ms(a.quando) - ms(b.quando) || String(a.id).localeCompare(String(b.id)); });
  }

  /* ------------------------------------------------------------------ avaliação das regras */
  /** gasto da última hora e média por hora dos 7 dias anteriores */
  function gastoHora(snap, o) {
    if (snap.gasto && typeof snap.gasto.ultimaHora === 'number') return { ultima: snap.gasto.ultimaHora, media: Number(snap.gasto.mediaHora7d) || 0, inicio: iso(snap.gasto.inicio) || dataLocal(o.agora, o.fusoMin) + 'T' + pad(horaLocal(o.agora, o.fusoMin)) };
    var hs = (snap.gastoHoras || []).map(function (h) { return { t: ms(h.inicio), g: Number(h.gasto) || 0 }; }).filter(function (h) { return isFinite(h.t) && h.t <= o.agora; }).sort(function (a, b) { return a.t - b.t; });
    if (!hs.length) return null;
    var u = hs[hs.length - 1], ant = hs.filter(function (h) { return h.t < u.t && h.t >= u.t - 7 * DIA; });
    if (!ant.length) return null;
    var soma = ant.reduce(function (s, h) { return s + h.g; }, 0);
    return { ultima: u.g, media: soma / (7 * 24), inicio: new Date(u.t).toISOString() };
  }

  /** agrupa eventos por pessoa (ordem de chegada preservada) */
  function porAtor(evs) { var m = {}, ordem = []; evs.forEach(function (e) { var k = String(e.atorId); if (!m[k]) { m[k] = []; ordem.push(k); } m[k].push(e); }); return ordem.map(function (k) { return m[k]; }); }
  function achado(regra, chave, quando, titulo, detalhe, extra) {
    var a = { chave: regra.id + ':' + chave, regraId: regra.id, regra: regra.nome, severidade: regra.severidade, quando: iso(quando), titulo: titulo, detalhe: detalhe };
    if (extra) for (var k in extra) a[k] = extra[k];
    return a;
  }

  var AVALIADORES = {
    'orcamento-salto': function (r, p, snap, o, evs) {
      var out = [];
      var orc = evs.filter(function (e) { return e.tipo === 'orcamento' && isFinite(Number(e.antes)) && isFinite(Number(e.depois)); });
      orc.forEach(function (e) {
        var a = Number(e.antes), d = Number(e.depois), inc = d - a, pc = a > 0 ? inc / a * 100 : (d > 0 ? Infinity : 0);
        if (inc > 0 && (pc > p.aumentoPct || inc > p.aumentoAbs)) {
          out.push(achado(r, e.id, e.quando, 'Orçamento de ' + alvoTxt(e) + ' subiu ' + (isFinite(pc) ? '+' + F.pct(pc) : 'de zero') + ' numa alteração',
            nomeAtor(e) + ' mudou de ' + F.brl(a) + ' para ' + F.brl(d) + '/dia às ' + F.hora(ms(e.quando), o.fusoMin) + '.', { eventoIds: [e.id], alvoId: e.alvoId, atorId: e.atorId }));
        }
      });
      // acumulado por alvo dentro da janela
      var porAlvo = {};
      orc.forEach(function (e) { (porAlvo[e.alvoId] = porAlvo[e.alvoId] || []).push(e); });
      Object.keys(porAlvo).forEach(function (id) {
        var l = porAlvo[id]; if (l.length < 2) return;
        for (var i = l.length - 1; i >= 1; i--) {
          var fim = l[i], ini = null;
          for (var j = 0; j < i; j++) if (ms(fim.quando) - ms(l[j].quando) <= p.janelaMin * MIN) { ini = l[j]; break; }
          if (!ini) continue;
          var a = Number(ini.antes), d = Number(fim.depois), pc = a > 0 ? (d - a) / a * 100 : Infinity;
          var ja = out.some(function (x) { return x.eventoIds && x.eventoIds.indexOf(fim.id) >= 0; });
          if (d > a && pc > p.acumuladoPct && !ja) {
            out.push(achado(r, 'acum:' + id + ':' + fim.id, fim.quando, 'Orçamento de ' + alvoTxt(fim) + ' subiu ' + (isFinite(pc) ? '+' + F.pct(pc) : 'de zero') + ' em ' + Math.max(1, Math.round((ms(fim.quando) - ms(ini.quando)) / MIN)) + ' min',
              'Alterações seguidas levaram de ' + F.brl(a) + ' para ' + F.brl(d) + '/dia (limite acumulado ' + F.pct(p.acumuladoPct) + ' em ' + p.janelaMin + ' min).', { eventoIds: l.slice(l.indexOf(ini), i + 1).map(function (x) { return x.id; }), alvoId: id }));
          }
          break;
        }
      });
      return out;
    },
    'fora-horario': function (r, p, snap, o, evs) {
      // um achado por pessoa (várias alterações de madrugada da mesma pessoa = um sinal)
      return porAtor(evs.filter(function (e) { var h = horaLocal(ms(e.quando), o.fusoMin); return h >= p.inicio && h < p.fim; })).map(function (l) {
        var e = l[0], n = l.length;
        return achado(r, e.id, l[n - 1].quando, (n > 1 ? n + ' alterações' : 'Alteração') + ' de madrugada (' + F.hora(ms(e.quando), o.fusoMin) + (n > 1 ? '–' + F.hora(ms(l[n - 1].quando), o.fusoMin) : '') + ')',
          nomeAtor(e) + ': ' + l.slice(0, 3).map(function (x) { return (TIPOS[x.tipo] || 'alteração').toLowerCase() + ' em ' + alvoTxt(x); }).join('; ') + (n > 3 ? '; e mais ' + (n - 3) : '') + '.', { eventoIds: l.map(function (x) { return x.id; }), atorId: e.atorId });
      });
    },
    'ator-desconhecido': function (r, p, snap, o, evs) {
      if (!o.autorizados.length) return [];
      return porAtor(evs.filter(function (e) { return e.atorId != null && !autorizado(e, o); })).map(function (l) {
        var e = l[0], n = l.length;
        return achado(r, e.id, l[n - 1].quando, nomeAtor(e) + ' não é da equipe' + (n > 1 ? ' (' + n + ' alterações)' : ''),
          l.slice(0, 3).map(function (x) { return (TIPOS[x.tipo] || 'Alteração') + ' em ' + alvoTxt(x) + ' às ' + F.hora(ms(x.quando), o.fusoMin); }).join('; ') + (n > 3 ? '; e mais ' + (n - 3) : '') + '. Esse usuário não está na lista de usuários autorizados do Meta.', { eventoIds: l.map(function (x) { return x.id; }), atorId: e.atorId });
      });
    },
    'gasto-pico': function (r, p, snap, o) {
      var g = gastoHora(snap, o); if (!g) return [];
      if (g.ultima > p.minimo && g.media > 0 && g.ultima > p.fator * g.media) {
        return [achado(r, String(g.inicio), o.agora, 'Gasto da última hora ' + num(g.ultima / g.media, 1) + '× a média',
          'Gastou ' + F.brl(arred(g.ultima)) + ' na última hora; a média por hora dos últimos 7 dias é ' + F.brl(arred(g.media)) + '.', { gastoUltimaHora: arred(g.ultima), mediaHora: arred(g.media) })];
      }
      if (g.ultima > p.minimo && g.media === 0) return [achado(r, String(g.inicio), o.agora, 'Gasto apareceu do nada', 'Gastou ' + F.brl(arred(g.ultima)) + ' na última hora numa conta sem gasto nos últimos 7 dias.', { gastoUltimaHora: arred(g.ultima), mediaHora: 0 })];
      return [];
    },
    'campanha-nova': function (r, p, snap, o, evs) {
      return evs.filter(function (e) { return e.tipo === 'criacao_campanha' && (!autorizado(e, o) || (e.via && o.canaisEquipe.indexOf(e.via) < 0)); }).map(function (e) {
        return achado(r, e.id, e.quando, 'Campanha nova criada fora da equipe: ' + alvoTxt(e), nomeAtor(e) + ' criou ' + alvoTxt(e) + ' às ' + F.hora(ms(e.quando), o.fusoMin) + (e.via ? ' (via ' + e.via + ')' : '') + '.', { eventoIds: [e.id], alvoId: e.alvoId, atorId: e.atorId });
      });
    },
    'destino-alterado': function (r, p, snap, o, evs) {
      return evs.filter(function (e) { return ['objetivo', 'url_destino', 'whatsapp'].indexOf(e.tipo) >= 0 && e.anuncioAtivo !== false; }).map(function (e) {
        var o2 = e.antes != null && e.depois != null ? ' de "' + e.antes + '" para "' + e.depois + '"' : '';
        return achado(r, e.id, e.quando, (TIPOS[e.tipo] || 'Destino alterado') + ' em anúncio ativo', nomeAtor(e) + ' mudou ' + alvoTxt(e) + o2 + '.', { eventoIds: [e.id], alvoId: e.alvoId, atorId: e.atorId });
      });
    },
    'admin-novo': function (r, p, snap, o, evs) {
      return evs.filter(function (e) { return e.tipo === 'admin_adicionado'; }).map(function (e) {
        return achado(r, e.id, e.quando, 'Novo acesso à conta: ' + (e.depois || 'pessoa/parceiro'), nomeAtor(e) + ' deu acesso a ' + (e.depois || 'um novo usuário') + ' às ' + F.hora(ms(e.quando), o.fusoMin) + '.', { eventoIds: [e.id], atorId: e.atorId });
      });
    },
    'pagamento-alterado': function (r, p, snap, o, evs) {
      return evs.filter(function (e) { return e.tipo === 'pagamento'; }).map(function (e) {
        return achado(r, e.id, e.quando, 'Forma de pagamento ou limite alterado', nomeAtor(e) + ' alterou o pagamento da conta às ' + F.hora(ms(e.quando), o.fusoMin) + (e.depois ? ' (' + e.depois + ')' : '') + '.', { eventoIds: [e.id], atorId: e.atorId });
      });
    },
    'pais-novo': function (r, p, snap, o, evs) {
      var usados = (snap.paisesUsados || ['BR']).map(function (x) { return String(x).toUpperCase(); });
      var out = [];
      evs.filter(function (e) { return e.tipo === 'segmentacao' && e.depois; }).forEach(function (e) {
        var novos = [].concat(e.depois.paises || e.depois).map(function (x) { return String(x).toUpperCase(); }).filter(function (x) { return /^[A-Z]{2}$/.test(x) && usados.indexOf(x) < 0; });
        if (novos.length) out.push(achado(r, e.id, e.quando, 'Anúncios apontados para país nunca usado: ' + novos.join(', '), nomeAtor(e) + ' mudou a segmentação de ' + alvoTxt(e) + ' para ' + novos.join(', ') + '. A conta só anunciou em ' + usados.join(', ') + '.', { eventoIds: [e.id], alvoId: e.alvoId, atorId: e.atorId, paises: novos }));
      });
      return out;
    },
    'teto-projetado': function (r, p, snap, o) {
      var tm = Number(snap.tetoMensal); if (!(tm > 0)) return [];
      var td = tm / 30.4, orc = orcamentoDiario(snap), proj = orc, fonte = 'orçamentos ativos';
      if (typeof snap.gastoHoje === 'number') {
        var h = horaLocal(o.agora, o.fusoMin) + new Date(o.agora).getUTCMinutes() / 60;
        if (h >= 2) { var ritmo = snap.gastoHoje / h * 24; if (ritmo > proj) { proj = ritmo; fonte = 'ritmo de gasto de hoje'; } }
      }
      if (proj > td * (1 + p.excessoPct / 100)) {
        return [achado(r, dataLocal(o.agora, o.fusoMin), o.agora, 'Gasto de hoje projetado em ' + F.brl(arred(proj)) + ' (teto ' + F.brl(arred(td)) + '/dia)',
          'Projeção pelos ' + fonte + ': ' + F.brl(arred(proj)) + ', ' + F.pct((proj / td - 1) * 100) + ' acima do teto diário do cliente (' + F.brl(tm) + '/mês ÷ 30,4).', { projetado: arred(proj), tetoDiario: arred(td) })];
      }
      return [];
    },
    'rajada': function (r, p, snap, o, evs) {
      for (var i = 0; i + p.maxAlteracoes < evs.length; i++) {
        var j = i + p.maxAlteracoes; // p.max+1 eventos de i a j
        if (ms(evs[j].quando) - ms(evs[i].quando) <= p.janelaMin * MIN) {
          var k = j; while (k + 1 < evs.length && ms(evs[k + 1].quando) - ms(evs[i].quando) <= p.janelaMin * MIN) k++;
          var lote = evs.slice(i, k + 1);
          return [achado(r, evs[i].id, evs[k].quando, lote.length + ' alterações em ' + Math.max(1, Math.round((ms(evs[k].quando) - ms(evs[i].quando)) / MIN)) + ' min',
            'Entre ' + F.hora(ms(evs[i].quando), o.fusoMin) + ' e ' + F.hora(ms(evs[k].quando), o.fusoMin) + ' foram feitas ' + lote.length + ' alterações (limite: ' + p.maxAlteracoes + ' em ' + p.janelaMin + ' min).', { eventoIds: lote.map(function (x) { return x.id; }) })];
        }
      }
      return [];
    },
  };

  /**
   * Avalia todas as regras ativas no snapshot. Não olha o estado (achados podem repetir entre execuções).
   * @returns {achados:[...], ignoradas:[regraId sem dados]}
   */
  function avaliar(snap, opts) {
    opts = opts || {};
    var rs = opts.regras || regras(opts.overrides), o = opcoes(snap);
    var ag = valores(rs.filter(function (r) { return r.id === 'agregacao'; })[0] || AGREGACAO_PADRAO);
    var evs = eventosRecentes(snap, o, ag.janelaEventosMin);
    var achados = [], ignoradas = [];
    rs.forEach(function (r) {
      if (r.id === 'agregacao' || !r.ativo || !AVALIADORES[r.id]) return;
      if (r.id === 'ator-desconhecido' && !o.autorizados.length) ignoradas.push(r.id);
      if (r.id === 'teto-projetado' && !(Number(snap.tetoMensal) > 0)) ignoradas.push(r.id);
      achados = achados.concat(AVALIADORES[r.id](r, valores(r), snap, o, evs));
    });
    achados.sort(function (a, b) { return SEVERIDADES.indexOf(a.severidade) - SEVERIDADES.indexOf(b.severidade) || ms(a.quando) - ms(b.quando); });
    return { achados: achados, ignoradas: ignoradas, agregacao: ag };
  }

  /** nível do conjunto de achados: supremo | alto | medio | null */
  function nivelDe(achados, ag, agora) {
    if (achados.some(function (a) { return a.severidade === 'critica'; })) return { nivel: 'supremo', motivo: 'regra crítica' };
    var altas = achados.filter(function (a) { return a.severidade === 'alta'; });
    // regras altas DIFERENTES dentro da janela
    for (var i = 0; i < altas.length; i++) {
      var t0 = ms(altas[i].quando), regs = {};
      altas.forEach(function (b) { var t = ms(b.quando); if (Math.abs(t - t0) <= ag.janelaAltasMin * MIN) regs[b.regraId] = 1; });
      if (Object.keys(regs).length >= ag.altasParaSupremo) return { nivel: 'supremo', motivo: Object.keys(regs).length + ' regras altas em ' + ag.janelaAltasMin + ' min' };
    }
    if (altas.length) return { nivel: 'alto', motivo: 'regra alta' };
    if (achados.length) return { nivel: 'medio', motivo: 'regra média' };
    return { nivel: null, motivo: '' };
  }

  /* ------------------------------------------------------------------ estado da conta e resposta */
  function estadoInicial(contaId) { return { contaId: contaId, quarentena: false, incidenteId: null, desde: null, processados: {}, recentes: [], reincidencias: 0, ultimaVerificacao: null }; }
  function podar(est, agora) {
    var lim = agora - 48 * HORA;
    Object.keys(est.processados).forEach(function (k) { if (ms(est.processados[k]) < lim) delete est.processados[k]; });
    est.recentes = (est.recentes || []).filter(function (a) { return ms(a.quando) >= agora - 2 * HORA; });
  }
  /** orçamento antes do incidente: o "antes" da 1ª alteração de orçamento suspeita (janela) de cada alvo */
  function orcamentosAntes(snap, o, janelaMin) {
    var antes = {};
    eventosRecentes(snap, o, janelaMin).forEach(function (e) {
      if (e.tipo === 'orcamento' && e.alvoId != null && !(String(e.alvoId) in antes) && isFinite(Number(e.antes))) antes[String(e.alvoId)] = Number(e.antes);
    });
    return antes;
  }
  function criadasSuspeitas(snap, o, janelaMin) {
    var ids = {};
    eventosRecentes(snap, o, janelaMin).forEach(function (e) { if (e.tipo === 'criacao_campanha' && e.alvoId != null && !autorizado(e, o)) ids[String(e.alvoId)] = 1; });
    return ids;
  }
  /** registro do que foi pausado (para reativação controlada) */
  function registroPausa(c, antes, criadas, quando) {
    var orcAntes = function (id, atual) { return String(id) in antes ? antes[String(id)] : atual; };
    return {
      id: String(c.id), nome: c.nome, cbo: !!c.cbo, pausadaEm: iso(quando),
      orcAtual: c.cbo ? Number(c.orc) || 0 : null, orcAntes: c.cbo ? orcAntes(c.id, Number(c.orc) || 0) : null,
      criadaNoIncidente: !!criadas[String(c.id)],
      conjuntos: (c.conjuntos || []).map(function (s) { return { id: String(s.id), nome: s.nome, ativo: ATIVO(s.status), orcAtual: c.cbo ? null : Number(s.orc) || 0, orcAntes: c.cbo ? null : orcAntes(s.id, Number(s.orc) || 0) }; }),
    };
  }

  /**
   * Processa uma verificação da conta (idempotente: rodar de novo com o mesmo snapshot e o estado devolvido não repete ações).
   * @param snap snapshot normalizado (ver docs/SEGURANCA-INVASAO.md)
   * @param estado estado salvo da conta (ou null)
   * @param opts {overrides|regras, incidente (registro atual, se em quarentena)}
   * @returns {estado, achados (novos), nivel, motivo, evento: 'invasao'|'reincidencia'|'alerta'|null, acoes:[{tipo:'pausar', nivel:'campanha', id, nome}], incidente, notificacao}
   */
  function processar(snap, estado, opts) {
    opts = opts || {};
    var o = opcoes(snap), agora = o.agora;
    var est = clone(estado) || estadoInicial(snap.conta && snap.conta.id);
    if (!est.processados) est.processados = {};
    if (!est.recentes) est.recentes = [];
    est.contaId = est.contaId != null ? est.contaId : snap.conta && snap.conta.id;
    var rs = opts.regras || regras(opts.overrides);
    var av = avaliar(snap, { regras: rs });
    var novos = av.achados.filter(function (a) { return !est.processados[a.chave]; });
    var ativas = (snap.campanhas || []).filter(function (c) { return ATIVO(c.status); });
    var inc = clone(opts.incidente) || null;
    var res = { estado: est, achados: novos, nivel: null, motivo: '', evento: null, acoes: [], incidente: inc, notificacao: null, ignoradas: av.ignoradas };
    var contaNome = (snap.conta && snap.conta.nome) || 'conta';

    if (est.quarentena) {
      // VIGILÂNCIA: qualquer campanha ativa ou alteração nova (que não seja uma pausa) → pausa de novo + reincidência
      var desde = ms(est.desde) || 0;
      var evNovos = eventosRecentes(snap, o, av.agregacao.janelaEventosMin).filter(function (e) {
        return ms(e.quando) > desde && !est.processados['ev:' + e.id] && !(e.tipo === 'status' && e.depois === 'pausado');
      });
      evNovos.forEach(function (e) { est.processados['ev:' + e.id] = iso(agora); });
      novos.forEach(function (a) { est.processados[a.chave] = iso(agora); });
      if (ativas.length || evNovos.length) {
        var antes = orcamentosAntes(snap, o, av.agregacao.janelaEventosMin), criadas = criadasSuspeitas(snap, o, av.agregacao.janelaEventosMin);
        res.acoes = ativas.map(function (c) { return { tipo: 'pausar', nivel: 'campanha', id: String(c.id), nome: c.nome }; });
        est.reincidencias = (est.reincidencias || 0) + 1;
        res.evento = 'reincidencia'; res.nivel = 'supremo'; res.motivo = 'conta em quarentena teve ' + (ativas.length ? ativas.length + ' campanha(s) reativada(s)' : '') + (ativas.length && evNovos.length ? ' e ' : '') + (evNovos.length ? evNovos.length + ' alteração(ões) nova(s)' : '');
        if (inc) {
          inc.pausados = inc.pausados || [];
          ativas.forEach(function (c) {
            var ex = inc.pausados.filter(function (p) { return p.id === String(c.id); })[0];
            if (ex) { ex.pausadaEm = iso(agora); if (c.cbo) ex.orcAtual = Number(c.orc) || 0; (c.conjuntos || []).forEach(function (s) { var es = ex.conjuntos.filter(function (x) { return x.id === String(s.id); })[0]; if (es && !c.cbo) es.orcAtual = Number(s.orc) || 0; }); }
            else inc.pausados.push(registroPausa(c, antes, criadas, agora));
          });
          inc.reincidencias = (inc.reincidencias || []).concat([{ quando: iso(agora), motivo: res.motivo, pausadas: res.acoes.map(function (a) { return a.id; }), eventos: evNovos.map(function (e) { return { id: e.id, tipo: e.tipo, atorNome: nomeAtor(e), alvoNome: e.alvoNome || null, quando: iso(e.quando) }; }), achados: novos.map(resumoAchado) }]);
          inc.estado = 'aberto'; inc.assumidoPor = inc.assumidoPor || []; inc.atualizadoEm = iso(agora);
          inc.achados = (inc.achados || []).concat(novos.map(resumoAchado));
          res.incidente = inc;
        }
        res.notificacao = {
          tipo: 'invasao', subtipo: 'reincidencia', prioridade: 'critica',
          titulo: 'REINCIDÊNCIA — ' + contaNome + ' foi mexida de novo e pausada outra vez',
          texto: res.motivo.charAt(0).toUpperCase() + res.motivo.slice(1) + '. ' + (res.acoes.length ? res.acoes.length + ' campanha(s) pausada(s) de novo. ' : '') + 'A conta continua em quarentena.',
        };
      }
      est.ultimaVerificacao = iso(agora); podar(est, agora);
      return res;
    }

    // fora de quarentena
    novos.forEach(function (a) { est.processados[a.chave] = iso(agora); });
    var considerados = est.recentes.concat(novos.map(resumoAchado)).filter(function (a) { return ms(a.quando) >= agora - Math.max(av.agregacao.janelaAltasMin, 60) * MIN; });
    var nv = novos.length ? nivelDe(considerados, av.agregacao, agora) : { nivel: null, motivo: '' };
    est.recentes = est.recentes.concat(novos.map(resumoAchado));
    res.nivel = nv.nivel; res.motivo = nv.motivo;

    if (nv.nivel === 'supremo') {
      var antes2 = orcamentosAntes(snap, o, av.agregacao.janelaEventosMin), criadas2 = criadasSuspeitas(snap, o, av.agregacao.janelaEventosMin);
      var id = 'inc-' + String(snap.conta && snap.conta.id).replace(/[^\w-]/g, '') + '-' + agora.toString(36);
      res.acoes = ativas.map(function (c) { return { tipo: 'pausar', nivel: 'campanha', id: String(c.id), nome: c.nome }; });
      // eventos que existiam antes da quarentena ficam marcados (não contam como reincidência)
      eventosRecentes(snap, o, av.agregacao.janelaEventosMin).forEach(function (e) { est.processados['ev:' + e.id] = iso(agora); });
      inc = {
        id: id, tipo: 'invasao', nivel: 'supremo', estado: 'aberto', contaId: snap.conta && snap.conta.id, contaNome: contaNome,
        clientId: snap.conta && snap.conta.clientId || null, abertoEm: iso(agora), motivo: nv.motivo,
        achados: considerados.filter(function (a) { return a.severidade !== 'media'; }),
        pausados: ativas.map(function (c) { return registroPausa(c, antes2, criadas2, agora); }),
        orcamentoDiarioAntes: orcamentoDiario(snap), reincidencias: [], assumidoPor: [], encerradoEm: null,
      };
      est.quarentena = true; est.incidenteId = id; est.desde = iso(agora); est.reincidencias = 0;
      res.incidente = inc; res.evento = 'invasao';
      var principais = inc.achados.slice(0, 3).map(function (a) { return a.titulo; }).join(' · ');
      res.notificacao = {
        tipo: 'invasao', subtipo: 'invasao', prioridade: 'critica',
        titulo: 'POSSÍVEL INVASÃO — Conta ' + contaNome + ' pausada automaticamente',
        texto: 'Detectado: ' + principais + '. Pausadas: ' + res.acoes.length + ' campanha(s) (nenhuma excluída). A conta está em quarentena até alguém assumir e liberar.',
      };
    } else if (nv.nivel) {
      res.evento = 'alerta';
      res.notificacao = { tipo: 'alerta', prioridade: 'alta', titulo: 'Sinal de risco em ' + contaNome + ': ' + novos[0].titulo, texto: novos.map(function (a) { return a.detalhe; }).join(' ') };
    }
    est.ultimaVerificacao = iso(agora); podar(est, agora);
    return res;
  }
  function resumoAchado(a) { return { chave: a.chave, regraId: a.regraId, regra: a.regra, severidade: a.severidade, quando: a.quando, titulo: a.titulo, detalhe: a.detalhe }; }

  /** aplica ações de pausa num snapshot (uso no simulador e nos testes): nunca exclui, só muda status */
  function aplicarAcoes(snap, acoes) {
    var s = clone(snap);
    (acoes || []).forEach(function (a) {
      (s.campanhas || []).forEach(function (c) {
        if (String(c.id) !== String(a.id)) return;
        if (a.tipo === 'pausar') c.status = 'pausado';
        if (a.tipo === 'ativar') c.status = 'ativo';
        if (a.tipo === 'orcamento' && a.nivel === 'campanha') c.orc = a.para;
      });
      if (a.tipo === 'orcamento' && a.nivel === 'conjunto') (s.campanhas || []).forEach(function (c) { (c.conjuntos || []).forEach(function (x) { if (String(x.id) === String(a.id)) x.orc = a.para; }); });
    });
    return s;
  }

  /* ------------------------------------------------------------------ incidente: assumir, sair da quarentena, reativar */
  function assumir(incidente, quem, quando) {
    var inc = clone(incidente);
    inc.assumidoPor = inc.assumidoPor || [];
    if (!inc.assumidoPor.some(function (x) { return x.userId === quem.userId; })) inc.assumidoPor.push({ userId: quem.userId, nome: quem.nome || '', quando: iso(quando || Date.now()) });
    if (inc.estado !== 'encerrado') inc.estado = 'assumido';
    return inc;
  }
  /** valida o pedido de saída da quarentena: papel dono/admin, "SIM" digitado e checklist completo */
  function validarSaida(p) {
    p = p || {}; var erros = {};
    if (PAPEIS_SAIDA.indexOf(p.papel) < 0) erros.papel = 'Só Dono ou Admin podem tirar a conta da quarentena.';
    if (String(p.confirmacao || '').trim() !== 'SIM') erros.confirmacao = 'Digite SIM (em maiúsculas) para confirmar.';
    var ck = p.checklist || {};
    var falta = CHECKLIST.filter(function (c) { return ck[c.id] !== true; });
    if (falta.length) erros.checklist = 'Confirme todos os itens: falta ' + falta.map(function (c) { return '"' + c.rotulo + '"'; }).join(', ') + '.';
    return { ok: !Object.keys(erros).length, erros: erros };
  }
  /**
   * Plano de reativação seletiva: só campanhas pausadas pelo sistema neste incidente.
   * @param sel {selecionadas:[campId], restaurar: bool | {campId: bool}} — restaurar = volta ao orçamento de antes do incidente
   * @returns {ok, erros, acoes:[{tipo:'orcamento', nivel, id, nome, de, para} | {tipo:'ativar', nivel:'campanha', id, nome}], linhas:[{id, nome, orcAntes, orcAtual, orcFinal, alterado, criadaNoIncidente}]}
   */
  function planoReativacao(incidente, sel) {
    sel = sel || {}; var erros = [], acoes = [], linhas = [];
    var pausados = (incidente && incidente.pausados) || [];
    (sel.selecionadas || []).forEach(function (id) {
      var p = pausados.filter(function (x) { return x.id === String(id); })[0];
      if (!p) { erros.push('A campanha ' + id + ' não foi pausada pelo Guardião neste incidente e não pode ser reativada por aqui.'); return; }
      var rest = typeof sel.restaurar === 'object' && sel.restaurar ? sel.restaurar[p.id] !== false : sel.restaurar !== false;
      var alvos = p.cbo ? [{ nivel: 'campanha', id: p.id, nome: p.nome, de: p.orcAtual, antes: p.orcAntes }]
        : p.conjuntos.filter(function (s) { return s.ativo; }).map(function (s) { return { nivel: 'conjunto', id: s.id, nome: s.nome, de: s.orcAtual, antes: s.orcAntes }; });
      var tAtual = 0, tFinal = 0, tAntes = 0;
      alvos.forEach(function (a) {
        tAtual += a.de || 0; tAntes += a.antes || 0;
        var para = rest ? a.antes : a.de; tFinal += para || 0;
        if (rest && a.antes != null && a.de != null && Math.abs(a.antes - a.de) > 0.004) acoes.push({ tipo: 'orcamento', nivel: a.nivel, id: a.id, nome: a.nome, de: a.de, para: a.antes });
      });
      acoes.push({ tipo: 'ativar', nivel: 'campanha', id: p.id, nome: p.nome });
      linhas.push({ id: p.id, nome: p.nome, orcAntes: arred(tAntes), orcAtual: arred(tAtual), orcFinal: arred(tFinal), alterado: Math.abs(tAntes - tAtual) > 0.004, restaurado: rest, criadaNoIncidente: !!p.criadaNoIncidente });
      if (p.criadaNoIncidente) erros.push('A campanha "' + p.nome + '" foi criada durante o incidente (provavelmente pelo invasor). Desmarque ou confirme com o cliente antes de reativar.');
    });
    var bloqueantes = erros.filter(function (e) { return /não foi pausada/.test(e); });
    return { ok: !bloqueantes.length, erros: erros, avisos: erros.filter(function (e) { return !/não foi pausada/.test(e); }), acoes: acoes, linhas: linhas };
  }
  /** encerra a quarentena (depois de validarSaida ok e do plano executado) */
  function sairQuarentena(estado, incidente, p) {
    p = p || {};
    var est = clone(estado) || estadoInicial(incidente && incidente.contaId), inc = clone(incidente);
    var quando = iso(p.quando || Date.now());
    est.quarentena = false; est.incidenteId = null; est.desde = null; est.recentes = []; est.liberadaEm = quando;
    if (inc) {
      inc.estado = 'encerrado'; inc.encerradoEm = quando; inc.encerradoPor = p.quem || null; inc.checklist = p.checklist || null;
      inc.reativadas = (p.plano && p.plano.acoes || []).filter(function (a) { return a.tipo === 'ativar'; }).map(function (a) { return a.id; });
      inc.orcamentosRestaurados = (p.plano && p.plano.acoes || []).filter(function (a) { return a.tipo === 'orcamento'; });
    }
    return { estado: est, incidente: inc };
  }
  /** destinatários: todos os usuários ativos com papel gestor_trafego, dono ou admin */
  function destinatarios(users) { return (users || []).filter(function (u) { return u && u.ativo !== false && PAPEIS_ALVO.indexOf(u.papel) >= 0; }); }

  /* ------------------------------------------------------------------ adaptadores */
  /** registro de atividades do Meta (GET /act_<id>/activities) → evento normalizado (melhor esforço; ver docs) */
  function numeroDe(v) {
    if (v == null) return NaN; if (typeof v === 'number') return v;
    if (typeof v === 'string') { var n = Number(v.replace(/[^\d.-]/g, '')); return v.trim() && isFinite(n) ? n : NaN; }
    if (typeof v === 'object') { var ks = ['new_value', 'old_value', 'value', 'amount', 'budget', 'daily_budget']; for (var i = 0; i < ks.length; i++) if (ks[i] in v) { var x = numeroDe(v[ks[i]]); if (isFinite(x)) return x; } }
    return NaN;
  }
  function tipoMeta(t) {
    t = String(t || '').toLowerCase();
    if (/review|billing_charge|first_delivery|campaign_ended|spending_limit_reached|budget_spent|learning_stage|funding_event|ad_account_billing/.test(t)) return 'sistema_meta';
    if (/budget|spend_cap/.test(t)) return 'orcamento';
    if (/create_campaign_group|create_campaign_legacy|^create_campaign$/.test(t)) return 'criacao_campanha';
    if (/run_status|stop_delivery/.test(t)) return 'status';
    if (/user_to_role|add_user|partner|agency|business_user|admin/.test(t)) return 'admin_adicionado';
    if (/funding_source|payment|spend_limit/.test(t)) return 'pagamento';
    if (/target/.test(t)) return 'segmentacao';
    if (/objective|optimization_goal/.test(t)) return 'objetivo';
    if (/creative|link|url/.test(t)) return 'url_destino';
    return 'outro';
  }
  function normalizarAtividadeMeta(a, ctx) {
    ctx = ctx || {};
    var extra = a.extra_data; if (typeof extra === 'string') { try { extra = JSON.parse(extra); } catch (e) { extra = { texto: extra }; } }
    extra = extra || {};
    var tipo = tipoMeta(a.event_type), nivel = /campaign_group|^campaign$/i.test(a.object_type || '') ? 'campanha' : /ad_set|adset|campaign/i.test(a.object_type || '') ? 'conjunto' : /ad|creative/i.test(a.object_type || '') ? 'anuncio' : 'conta';
    if (String(a.object_type || '').toUpperCase() === 'CAMPAIGN') nivel = 'campanha';
    if (String(a.object_type || '').toUpperCase() === 'AD_SET' || String(a.object_type || '').toUpperCase() === 'ADSET') nivel = 'conjunto';
    if (String(a.object_type || '').toUpperCase() === 'AD') nivel = 'anuncio';
    var ev = {
      id: 'meta:' + [a.event_time, a.event_type, a.object_id, a.actor_id].join(':'), quando: iso(a.event_time) || a.event_time, tipo: tipo, nivel: nivel,
      atorId: a.actor_id != null && a.actor_id !== '' ? String(a.actor_id) : null, atorNome: a.actor_name || null, alvoId: a.object_id != null ? String(a.object_id) : null, alvoNome: a.object_name || null,
      via: a.application_name ? (/business manager|ads manager|gerenciador/i.test(a.application_name) ? 'gerenciador' : 'api') : null, original: a.event_type,
    };
    if (tipo === 'orcamento') {
      var div = ctx.centavos === false ? 1 : 100;
      var antes = numeroDe(extra.old_value), depois = numeroDe(extra.new_value);
      ev.antes = isFinite(antes) ? antes / div : null; ev.depois = isFinite(depois) ? depois / div : null;
    } else if (tipo === 'status') {
      var nv = String((extra.new_value && extra.new_value.new_value) || extra.new_value || extra.new_status || '').toUpperCase();
      ev.depois = /PAUS|INACTIVE|STOP/.test(nv) ? 'pausado' : /ACTIVE|ATIV/.test(nv) ? 'ativo' : null;
    } else if (tipo === 'segmentacao') {
      var txt = JSON.stringify(extra.new_value || extra), m = txt.match(/"countries"\s*:\s*\[([^\]]*)\]/);
      if (m) ev.depois = { paises: (m[1].match(/[A-Z]{2}/g) || []) };
    } else if (tipo === 'admin_adicionado') {
      ev.depois = (extra.new_value && (extra.new_value.name || extra.new_value.user_name)) || extra.user_name || extra.name || null;
    } else if (tipo === 'url_destino' || tipo === 'objetivo') {
      var tt = JSON.stringify(extra);
      if (/wa\.me|whatsapp|api\.whatsapp/i.test(tt)) ev.tipo = 'whatsapp';
      ev.antes = typeof extra.old_value === 'string' ? extra.old_value : null; ev.depois = typeof extra.new_value === 'string' ? extra.new_value : null;
    }
    return ev;
  }
  /** campanhas/conjuntos do Graph API → snapshot.campanhas (orçamentos em centavos → reais) */
  function campanhasMeta(campanhas, conjuntos, ctx) {
    ctx = ctx || {}; var div = ctx.centavos === false ? 1 : 100;
    var st = function (x) { var s = String(x.effective_status || x.status || '').toUpperCase(); return s === 'ACTIVE' || s === 'IN_PROCESS' || s === 'WITH_ISSUES' ? 'ativo' : 'pausado'; };
    return (campanhas || []).map(function (c) {
      var cbo = c.daily_budget != null && c.daily_budget !== '' && Number(c.daily_budget) > 0;
      return {
        id: String(c.id), nome: c.name, status: st(c), cbo: cbo, orc: cbo ? Number(c.daily_budget) / div : 0, objetivo: c.objective || null,
        conjuntos: (conjuntos || []).filter(function (s) { return String(s.campaign_id) === String(c.id); }).map(function (s) {
          var paises = s.targeting && s.targeting.geo_locations && s.targeting.geo_locations.countries || null;
          return { id: String(s.id), nome: s.name, status: st(s), orc: s.daily_budget ? Number(s.daily_budget) / div : 0, paises: paises };
        }),
      };
    });
  }
  /** insights por hora do Meta (breakdowns=hourly_stats_aggregated_by_advertiser_time_zone) → gastoHoras */
  function gastoHorasMeta(linhas, fusoMin) {
    fusoMin = typeof fusoMin === 'number' ? fusoMin : -180;
    return (linhas || []).map(function (l) {
      var h = String(l.hourly_stats_aggregated_by_advertiser_time_zone || '00').slice(0, 2), d = l.date_start;
      var t = Date.parse(d + 'T' + h + ':00:00Z') - fusoMin * MIN; // hora local da conta → UTC
      return { inicio: new Date(t).toISOString(), gasto: Number(l.spend) || 0 };
    }).filter(function (x) { return isFinite(ms(x.inicio)); });
  }
  /** conta do protótipo da Torre (torre2/data.js) → snapshot */
  function adaptarTorre(conta, ctx) {
    ctx = ctx || {};
    var st = function (s) { return s === 'Pausada' ? 'pausado' : 'ativo'; };
    return {
      conta: { id: conta.id, nome: conta.nome, clientId: conta.clientId || null },
      agora: ctx.agora || Date.now(), fusoMin: ctx.fusoMin != null ? ctx.fusoMin : -180,
      campanhas: (conta.camps || []).map(function (c) {
        return { id: String(c.id), nome: c.nome, status: st(c.status), cbo: !!c.cbo, orc: Number(c.orc) || 0, objetivo: c.obj || null,
          conjuntos: (c.sets || []).map(function (s) { return { id: String(s.id), nome: s.nome, status: st(s.status), orc: Number(s.orc) || 0 }; }) };
      }),
      eventos: ctx.eventos || conta.eventosSeg || [], gastoHoras: ctx.gastoHoras || conta.gastoHoras || null, gasto: ctx.gasto || null, gastoHoje: ctx.gastoHoje,
      autorizados: ctx.autorizados || [], paisesUsados: ctx.paisesUsados || ['BR'], tetoMensal: ctx.tetoMensal != null ? ctx.tetoMensal : (conta.tetoMidiaMensal || (conta.tetoDia ? conta.tetoDia * 30.4 : null)),
    };
  }

  /* ------------------------------------------------------------------ simulação (demonstração e testes) */
  /**
   * Gera um cenário de invasão sobre um snapshot: às 03:12 locais um usuário estranho adiciona um admin, sobe o orçamento
   * da 1ª campanha ativa em 400%, cria e ativa uma campanha nova e o gasto da última hora dispara.
   * @returns snapshot novo (com eventos e gastoHoras)
   */
  function simularInvasao(snap, p) {
    p = p || {};
    var s = clone(snap), o = opcoes(s), t = o.agora, ator = p.ator || { id: 'meta-9912', nome: 'Jhon Ads Pro' };
    var ev = function (k, min, x) { var e = { id: 'sim-' + t.toString(36) + '-' + k, quando: new Date(t - min * MIN).toISOString(), atorId: ator.id, atorNome: ator.nome, via: 'api' }; for (var c in x) e[c] = x[c]; return e; };
    var ativa = (s.campanhas || []).filter(function (c) { return ATIVO(c.status); })[0];
    var evs = [ev('admin', 9, { tipo: 'admin_adicionado', nivel: 'conta', depois: 'Parceiro "Digital Growth LTDA"' })];
    if (ativa) {
      if (ativa.cbo) { evs.push(ev('orc', 6, { tipo: 'orcamento', nivel: 'campanha', alvoId: ativa.id, alvoNome: ativa.nome, antes: ativa.orc, depois: ativa.orc * 5 })); ativa.orc = ativa.orc * 5; }
      else { var cj = (ativa.conjuntos || []).filter(function (x) { return ATIVO(x.status); })[0] || (ativa.conjuntos || [])[0]; if (cj) { evs.push(ev('orc', 6, { tipo: 'orcamento', nivel: 'conjunto', alvoId: cj.id, alvoNome: cj.nome, campanhaId: ativa.id, antes: cj.orc, depois: cj.orc * 5 })); cj.orc = cj.orc * 5; } }
    }
    var nova = { id: 'sim-camp-' + t.toString(36), nome: '[NOVA] Promo Black Week 90% OFF', status: 'ativo', cbo: true, orc: 900, objetivo: 'Vendas', conjuntos: [{ id: 'sim-set-' + t.toString(36), nome: 'Brasil + Portugal · aberto', status: 'ativo', orc: 0 }] };
    s.campanhas = (s.campanhas || []).concat([nova]);
    evs.push(ev('nova', 4, { tipo: 'criacao_campanha', nivel: 'campanha', alvoId: nova.id, alvoNome: nova.nome }));
    evs.push(ev('pais', 3, { tipo: 'segmentacao', nivel: 'conjunto', alvoId: nova.conjuntos[0].id, alvoNome: nova.conjuntos[0].nome, depois: { paises: ['BR', 'PT'] } }));
    s.eventos = (s.eventos || []).concat(evs);
    var mediaH = p.mediaHora != null ? p.mediaHora : 6, horas = [];
    for (var h = 7 * 24; h >= 1; h--) horas.push({ inicio: new Date(t - h * HORA).toISOString(), gasto: mediaH });
    horas.push({ inicio: new Date(t - 30 * MIN).toISOString(), gasto: Math.max(120, mediaH * 9) });
    s.gastoHoras = horas;
    return s;
  }

  return {
    versao: VERSAO, REGRAS_PADRAO: REGRAS_PADRAO, AGREGACAO_PADRAO: AGREGACAO_PADRAO, SEVERIDADES: SEVERIDADES, ROTULO_SEV: ROTULO_SEV, NIVEIS: NIVEIS, TIPOS: TIPOS,
    PAPEIS_ALVO: PAPEIS_ALVO, PAPEIS_SAIDA: PAPEIS_SAIDA, CHECKLIST: CHECKLIST,
    regras: regras, valores: valores, validar: validar, avaliar: avaliar, nivelDe: nivelDe, processar: processar, estadoInicial: estadoInicial,
    aplicarAcoes: aplicarAcoes, orcamentoDiario: orcamentoDiario, assumir: assumir, validarSaida: validarSaida, planoReativacao: planoReativacao,
    sairQuarentena: sairQuarentena, destinatarios: destinatarios, simularInvasao: simularInvasao,
    adaptadores: { torre: adaptarTorre, metaAtividade: normalizarAtividadeMeta, metaCampanhas: campanhasMeta, metaGastoHoras: gastoHorasMeta, tipoMeta: tipoMeta },
    fmt: F,
  };
})();
if (typeof globalThis !== 'undefined') globalThis.Guardiao = Guardiao;
