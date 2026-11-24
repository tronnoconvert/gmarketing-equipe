// ui-demo.js — página oculta #/_ui: vitrine de todos os componentes e gráficos do core (QA visual nos dois temas).
import { ui } from './ui.js';
import { charts } from './charts.js';
import { notify } from './notify.js';
import * as fmt from './fmt.js';

const S = (titulo, corpo) => `<section class="qa-sec"><h2>${titulo}</h2>${corpo}</section>`;

const CARTEIRA = [
  { id: 'c-orion', nome: 'Grupo Orion', seg: 'Varejo', desde: '2025-09-01', serv: 'Tráfego, Social', mrr: 14200, health: 41, tend: [70, 66, 63, 58, 49, 41], prazo: 62, pag: ['ok', 'Em dia'], renova: '2027-02-12', resp: 't-ana' },
  { id: 'c-vida', nome: 'Clínica Vida', seg: 'Saúde', desde: '2024-03-01', serv: 'Tráfego, Site', mrr: 12800, health: 88, tend: [82, 84, 85, 86, 87, 88], prazo: 98, pag: ['ok', 'Em dia'], renova: '2026-12-08', resp: 't-bruno' },
  { id: 'c-alfa', nome: 'Construtora Alfa', seg: 'Construção', desde: '2025-01-01', serv: 'Tráfego, CRM', mrr: 11500, health: 82, tend: [78, 80, 79, 81, 82, 82], prazo: 95, pag: ['ok', 'Em dia'], renova: '2027-03-20', resp: 't-ana' },
  { id: 'c-technova', nome: 'TechNova', seg: 'Tecnologia', desde: '2024-12-01', serv: 'Social, Conteúdo', mrr: 9700, health: 63, tend: [74, 72, 70, 67, 65, 63], prazo: 84, pag: ['ok', 'Em dia'], renova: '2026-11-30', resp: 't-bruno' },
  { id: 'c-bella', nome: 'Bella Moda', seg: 'Moda', desde: '2025-02-01', serv: 'Social, Tráfego', mrr: 6800, health: 48, tend: [66, 63, 60, 55, 51, 48], prazo: 78, pag: ['err', '9 dias de atraso'], renova: '2027-04-18', resp: 't-bruno' },
  { id: 'c-autocenter', nome: 'Auto Center Sul', seg: 'Automotivo', desde: '2025-04-01', serv: 'Tráfego, Google', mrr: 5600, health: 66, tend: [70, 69, 69, 67, 66, 66], prazo: 88, pag: ['warn', 'Vence amanhã'], renova: '2027-05-11', resp: 't-ana' },
  { id: 'c-cafe', nome: 'Café Raiz', seg: 'Alimentação', desde: '2025-10-01', serv: 'Social', mrr: 3400, health: 61, tend: [68, 66, 64, 63, 62, 61], prazo: 80, pag: ['warn', '3 dias de atraso'], renova: '2026-12-15', resp: 't-bruno' },
];
const hEst = h => ui.faixa(h, 'health');
const prazoEst = v => ui.faixa(v, 'meta');

function render(ctx) {
  const p = ctx.periodoInfo;
  const kpis = `<div class="g-kpi">
${ui.kpi({ rotulo: 'MRR', valor: 'R$ 186,4 mil', delta: '▲ 8,2%', comp: p.comparacao, serie: [150, 152, 151, 155, 158, 157, 160, 163, 165, 164, 168, 171, 173, 176, 175, 178, 181, 183, 186], ajuda: 'Receita recorrente mensal: soma dos contratos ativos no mês, sem receitas avulsas.', href: '#/_ui', formatoSerie: 'mil' })}
${ui.kpi({ rotulo: 'Margem líquida', valor: '27,4%', delta: '▲ 1,1 pp', comp: p.comparacao, serie: [22, 23, 22, 24, 25, 24, 25, 26, 25, 26, 27, 26, 27, 27.4], ajuda: 'Lucro líquido ÷ receita do mês.', formatoSerie: 'pct' })}
${ui.kpi({ rotulo: 'Caixa', valor: 'R$ 412 mil', delta: '6,8 meses', deltaBom: null, comp: 'de runway', serie: [360, 372, 368, 380, 390, 385, 395, 402, 398, 405, 412], ajuda: 'Saldo em conta. Runway = caixa ÷ custo fixo mensal médio.', formatoSerie: 'mil' })}
${ui.kpi({ rotulo: 'Clientes ativos', valor: '42', delta: '▲ 3', comp: 'no mês', serie: [35, 36, 36, 37, 38, 38, 39, 39, 40, 39, 41, 42] })}
${ui.kpi({ rotulo: 'MRR em risco', valor: 'R$ 23,9 mil', delta: '5 clientes', deltaBom: null, comp: '12,8% do MRR', serie: [9, 11, 10, 13, 14, 16, 15, 18, 20, 22, 23.9], alerta: true, ajuda: 'Soma do MRR dos clientes com health score abaixo de 60.', formatoSerie: 'mil' })}
${ui.kpi({ rotulo: 'Entregas no prazo', valor: '91%', delta: '▼ 2 pp', deltaBom: false, comp: 'meta 95%', serie: [94, 95, 93, 96, 94, 93, 95, 92, 93, 91], formatoSerie: 'pct' })}
</div>`;

  const estados = `<div class="g3">
${ui.card({ titulo: 'LEDs (luzes de status)', ajuda: 'Verde parado = ok · Âmbar pulsa devagar = atenção · Vermelho pisca + anel = falhou · Cinza = pausada.', corpo: `<div class="stack">${['ok', 'warn', 'err', 'off'].map(e => `<div class="row between">${ui.led(e)}<span class="mut sm">${{ ok: 'Operando', warn: 'Atenção', err: 'Falhou', off: 'Pausada' }[e]}</span></div>`).join('')}<div class="row">${ui.led('ok', false)}${ui.led('warn', false)}${ui.led('err', false)}${ui.led('off', false)}<span class="mut sm">só o ponto (com aria-label)</span></div></div>` })}
${ui.card({ titulo: 'Selos — modelo Marcador', corpo: `<div class="stack">${ui.selo('ok', 'Em dia')}${ui.selo('warn', 'Vence amanhã')}${ui.selo('err', '9 dias de atraso')}${ui.selo('off', 'Pausado')}${ui.selo('info', 'Em onboarding')}</div>` })}
${ui.card({ titulo: 'Pessoas e ocupação', sub: 'Zona ideal 70–85%', corpo: `<div class="stack">${[['t-ana', 118], ['t-bruno', 96], ['t-felipe', 88], ['t-carla', 82], ['t-diego', 74], ['t-elisa', 58]].map(([id, v]) => { const t = ctx.db.get('team', id) || { nome: id }; return `<div class="row" style="flex-wrap:nowrap">${ui.avatar(t, 28, { status: true })}<div style="flex:1;min-width:0"><div class="row between sm"><b class="trunc">${fmt.esc(t.nome)}</b><span class="mut">${fmt.esc(t.area || '')}</span></div>${ui.barra(v, { faixas: 'ocupacao', zona: [70, 85], max: 120 })}</div></div>`; }).join('')}<div class="row">${ui.avatares(['t-ana', 't-bruno', 't-carla', 't-diego', 't-elisa', 't-felipe'], 4)}<span class="mut sm">pilha de avatares</span></div></div>` })}
</div>`;

  const navs = `<div class="card"><div class="card-b stack">
${ui.chips([{ id: 'todos', rotulo: 'Todos', n: 42 }, { id: 'risco', rotulo: 'Em risco', n: 5, estado: 'err' }, { id: 'atraso', rotulo: 'Com atraso', n: 4 }, { id: 'inad', rotulo: 'Inadimplentes', n: 2 }, { id: 'renova', rotulo: 'Renovam em 30 dias', n: 3 }], ctx.query.f || 'todos', 'f')}
${ui.tabs([{ id: '', rotulo: 'Visão geral' }, { id: 'resultados', rotulo: 'Resultados' }, { id: 'acoes', rotulo: 'Ações da equipe', n: 12 }, { id: 'entregas', rotulo: 'Entregas' }, { id: 'health', rotulo: 'Health score' }, { id: 'financeiro', rotulo: 'Financeiro' }, { id: 'cadastro', rotulo: 'Cadastro' }, { id: 'comentarios', rotulo: 'Comentários', n: 2 }], '', '_ui')}
<div class="row">${ui.seg([{ id: 'sem', rotulo: 'Semana' }, { id: 'mes', rotulo: 'Mês' }, { id: 'ano', rotulo: 'Ano' }], 'mes', { rotulo: 'Agrupar por' })}
${ui.btn({ rotulo: 'Cadastrar cliente', icone: 'plus', tipo: 'pri' })}${ui.btn({ rotulo: 'Exportar', icone: 'download' })}${ui.btn({ rotulo: 'Filtros', icone: 'filter', tipo: 'ghost' })}${ui.btn({ rotulo: 'Excluir', icone: 'trash', tipo: 'perigo', sm: true })}${ui.btn({ rotulo: 'Pequeno', sm: true })}${ui.btnIc('more', 'Mais ações')}
<span class="mut sm">Deltas: ${ui.delta('▲ 8,2%')} ${ui.delta('▼ 2 pp', false)} ${ui.delta('▲ 4 dias', false)} ${ui.delta('6,8 meses', null)}</span>
<span class="row sm mut">Atualizado ${ui.rel(new Date(Date.now() - 20000).toISOString())} ${ui.ajuda('Mostra há quanto tempo o dado foi atualizado; o texto se atualiza sozinho.')}</span></div>
</div></div>`;

  const meses = ['Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez', 'Jan', 'Fev'];
  const linhas = charts.linhas({
    series: [{ nome: 'Receita', dados: [148, 152, 155, 151, 160, 164, 168, 171, 170, 176, 181, 186.4, 190, 194, 199], area: true }, { nome: 'Custos', dados: [112, 114, 118, 117, 120, 121, 124, 126, 127, 129, 132, 135.3, null, null, null], cor: 'var(--c2n)' }],
    rotulos: meses, formato: 'mil', projecaoDesde: 11, destaque: { i: 11, texto: 'Nov · R$ 186,4 mil · margem 27%' }, altura: 260,
  });
  const resultado = charts.linhas({
    series: [{ nome: 'ROAS', dados: [3.4, 3.2, 3.1, 2.8, 2.6, 2.3, 2.1, 2.0, 1.9, 1.8, 1.8, 1.8] }],
    rotulos: ['01/09', '15/09', '01/10', '08/10', '15/10', '22/10', '29/10', '05/11', '10/11', '15/11', '20/11', '24/11'], formato: 'dec', metas: [{ valor: 3, rotulo: 'Meta 3,0' }],
    marcos: [{ i: 3, rotulo: 'Ana Souza: nova campanha de remarketing' }, { i: 7, rotulo: 'Carla Dias: 6 criativos novos' }, { i: 10, rotulo: 'Ana Souza: verba de teste aprovada' }], altura: 220, min: 0,
  });
  const barrasV = charts.barras({ rotulos: ['Set', 'Out', 'Nov'], series: [{ nome: 'Propostas enviadas', dados: [14, 18, 16] }, { nome: 'Ganhas', dados: [5, 7, 6], cor: 'var(--c3)' }], formato: 'num', altura: 220 });
  const barrasE = charts.barras({ rotulos: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'], series: [{ nome: 'Tráfego', dados: [32, 34, 30, 36, 38, 35, 40, 41] }, { nome: 'Social', dados: [22, 24, 26, 22, 25, 27, 26, 28], cor: 'var(--c3)' }, { nome: 'Produção', dados: [18, 16, 20, 21, 19, 22, 24, 23], cor: 'var(--c4)' }], empilhado: true, formato: 'num', altura: 220, destaque: 7 });
  const barrasH = charts.barras({ horizontal: true, rotulos: ['Grupo Orion', 'Clínica Vida', 'Construtora Alfa', 'TechNova', 'Imob Prime', 'Bella Moda'], series: [{ nome: 'MRR', dados: [14200, 12800, 11500, 9700, 8900, 6800], cores: ['var(--err)', 'var(--c1)', 'var(--c1)', 'var(--warn)', 'var(--c1)', 'var(--err)'] }], formato: 'brl' });
  const disp = charts.dispersao({
    pontos: [['Grupo Orion', 86, 14.2, 41], ['Clínica Vida', 14, 12.8, 88], ['Construtora Alfa', 22, 11.5, 82], ['TechNova', 61, 9.7, 63], ['Imob Prime', 30, 8.9, 79], ['Bella Moda', 80, 6.8, 48], ['Studio Fit', 12, 6.1, 85], ['Auto Center Sul', 58, 5.6, 66], ['Pet Feliz', 8, 4.9, 90], ['Ótica Visão', 34, 4.2, 77], ['Café Raiz', 66, 3.4, 61], ['', 20, 2.6, 81], ['', 42, 2.1, 72], ['', 72, 1.8, 55]]
      .map(([rotulo, x, y, h]) => ({ rotulo, x, y, r: y, estado: hEst(h), extra: `Health ${h}` })),
    eixoX: { rotulo: 'Risco de churn (%)', formato: 'pct', min: 0, max: 100 }, eixoY: { rotulo: 'MRR (R$ mil)', formato: 'dec', min: 0, max: 16 },
    quadrantes: { x: 50, y: 7.5, rotulos: ['Proteger e expandir', 'Ação imediata', 'Manter', 'Revisar escopo'], destaque: 'supDir' }, altura: 320,
  });
  const rosca = charts.rosca({ fatias: [{ rotulo: 'Tráfego', valor: 92.4 }, { rotulo: 'Social', valor: 48.1, cor: 'var(--c3)' }, { rotulo: 'Sites', valor: 22.6, cor: 'var(--c4)' }, { rotulo: 'CRM', valor: 14.2, cor: 'var(--c5)' }, { rotulo: 'Conteúdo', valor: 9.1, cor: 'var(--c2n)' }], centro: { valor: 'R$ 186 mil', rotulo: 'MRR por serviço' }, formato: 'mil' });
  const funil = charts.funil({ etapas: [{ rotulo: 'Impressões', valor: 412000 }, { rotulo: 'Cliques', valor: 9840 }, { rotulo: 'Inscritos', valor: 2310 }, { rotulo: 'Ao vivo (pico)', valor: 690, bench: 'comparecimento 25–35%' }, { rotulo: 'Até a oferta', valor: 402 }, { rotulo: 'Vendas', valor: 41 }] });
  const calor = charts.calor({ linhas: ['Ana Souza', 'Bruno Lima', 'Felipe Nunes', 'Carla Dias', 'Diego Melo', 'Elisa Rocha'], colunas: ['Sem 48', 'Sem 49', 'Sem 50', 'Sem 51'], valores: [[118, 112, 104, 96], [96, 92, 88, 84], [88, 90, 86, 80], [82, 78, 84, 88], [74, 76, 72, 70], [0, 58, 62, 66]], formato: { eixo: v => `${v}%`, tip: v => `${v}% de ocupação` }, faixas: 'ocupacao' });
  const gauge = charts.gauge(78, { rotulo: 'Saúde da agência', sub: '▲ 3 pts vs outubro' });
  const cascata = charts.cascata({ passos: [{ rotulo: 'MRR outubro', valor: 172.3, tipo: 'base' }, { rotulo: 'Novos', valor: 14.8, tipo: 'mais' }, { rotulo: 'Expansão', valor: 6.1, tipo: 'mais' }, { rotulo: 'Contração', valor: 2.4, tipo: 'menos' }, { rotulo: 'Churn', valor: 4.4, tipo: 'menos' }, { rotulo: 'MRR novembro', tipo: 'total' }], formato: 'mil' });
  const h30 = (st) => charts.historico30(st);
  const H1 = Array.from({ length: 30 }, (_, i) => (i === 27 || i === 29 ? 'err' : i === 21 || i === 22 ? 'warn' : 'ok'));
  const H2 = Array.from({ length: 30 }, (_, i) => (i === 12 || i === 28 || i === 29 ? 'warn' : 'ok'));
  const H3 = Array.from({ length: 30 }, (_, i) => (i >= 25 ? 'off' : 'ok'));

  const graficos = `<div class="g-2-1">${ui.card({ titulo: 'Receita × Custos', sub: 'R$ mil · 12 meses + projeção de 3', ajuda: 'Receita = MRR + avulsos. Custos = folha + ferramentas + impostos. Projeção pela tendência dos últimos 6 meses.', corpo: linhas })}
${ui.card({ titulo: 'Saúde da agência', ajuda: 'Média ponderada: Financeiro 84 · Clientes 71 · Operação 76 · Equipe 80.', corpo: `${gauge}<div class="stack" style="margin-top:8px">${[['Financeiro', 84], ['Clientes', 71], ['Operação', 76], ['Equipe', 80]].map(([k, v]) => `<div><div class="row between sm"><span>${k}</span><b class="num">${v}</b></div>${ui.barra(v, { faixas: 'health', rotulo: false, fina: true })}</div>`).join('')}</div>` })}</div>
<div class="g2">${ui.card({ titulo: 'Mapa da carteira', sub: 'Risco × MRR · tamanho = MRR · cor = health score', corpo: disp })}
${ui.card({ titulo: 'Resultado do cliente × ações da equipe', sub: 'Grupo Orion · ROAS semanal', ajuda: 'Os pontos no topo marcam ações da equipe; passe o mouse para ver quem fez o quê.', corpo: resultado })}</div>
<div class="g3">${ui.card({ titulo: 'Propostas enviadas × ganhas', corpo: barrasV })}${ui.card({ titulo: 'Horas por área (empilhado)', corpo: barrasE })}${ui.card({ titulo: 'Concentração de receita', corpo: barrasH })}</div>
<div class="g3">${ui.card({ titulo: 'MRR por serviço', corpo: rosca })}${ui.card({ titulo: 'Funil do webinar', corpo: funil })}${ui.card({ titulo: 'Ponte de MRR', sub: 'R$ mil', corpo: cascata })}</div>
<div class="g2">${ui.card({ titulo: 'Capacidade — próximas 4 semanas', corpo: calor })}
${ui.card({ titulo: 'Histórico de 30 dias', corpo: `<div class="stack"><div class="row between"><span class="sm">Sync de leads Meta → CRM</span>${h30(H1)}</div><div class="row between"><span class="sm">Health score dos clientes</span>${h30(H2)}</div><div class="row between"><span class="sm">Backup de criativos</span>${h30(H3)}</div></div>` })}</div>`;

  const tabela = ui.card({
    titulo: 'Carteira', sub: 'Clique no cabeçalho para ordenar · clique na linha para abrir', pad: false, acoes: ui.btn({ rotulo: 'Cadastrar cliente', icone: 'plus', sm: true }),
    corpo: ui.tabela({
      cols: [
        { k: 'nome', l: 'Cliente', r: c => `<b>${fmt.esc(c.nome)}</b><span class="sub">${fmt.esc(c.seg)}</span>` },
        { k: 'desde', l: 'Desde', r: c => fmt.mesAno(c.desde), mobile: false },
        { k: 'serv', l: 'Serviços', mobile: false },
        { k: 'mrr', l: 'MRR', num: true, r: c => fmt.brl(c.mrr) },
        { k: 'health', l: 'Health', num: true, r: c => ui.selo(hEst(c.health), String(c.health)), ajuda: 'Resultado 30% · Prazo 20% · Engajamento 20% · Pagamento 15% · NPS 15%' },
        { k: 'tend', l: 'Tendência 6m', sort: false, r: c => `<div style="width:84px;position:relative">${charts.spark(c.tend, { cor: c.tend[5] < c.tend[0] ? 'var(--err)' : 'var(--ok)', area: false, altura: 22 })}</div>`, mobile: false },
        { k: 'prazo', l: 'No prazo', num: true, r: c => `<span class="${prazoEst(c.prazo) === 'err' ? 't-err fw6' : ''}">${fmt.pct(c.prazo, 0)}</span>` },
        { k: 'pag', l: 'Pagamento', v: c => c.pag[1], r: c => ui.led(c.pag[0], c.pag[1]) },
        { k: 'renova', l: 'Renova', r: c => fmt.dataCurta(c.renova) },
        { k: 'resp', l: 'Resp.', r: c => ui.avatar(c.resp, 24), v: c => c.resp },
      ],
      linhas: CARTEIRA, onRowHref: c => `#/_ui?cliente=${c.id}`, ordem: { k: 'mrr', dir: 'desc' }, legenda: 'Carteira de clientes',
    }),
  });

  const lista = ui.card({ titulo: 'Precisa de você hoje', sub: '5 itens', corpo: ui.lista([
    { estado: 'err', titulo: 'Grupo Orion: score caiu 22 pts', sub: '3 entregas atrasadas · ROAS 1,8 vs meta 3,0', acao: { rotulo: 'Abrir ficha', href: '#/_ui' } },
    { estado: 'err', titulo: 'Rotina "Sync de leads" falhou 2×', sub: 'Erro de token Meta · última tentativa 23:42', acao: { rotulo: 'Ver log' } },
    { estado: 'warn', titulo: 'Fatura vencida: Bella Moda', sub: 'R$ 6.800 · 9 dias em atraso', acao: { rotulo: 'Cobrar' } },
    { estado: 'warn', titulo: 'Ana Souza em 118% de ocupação', sub: '3ª semana seguida acima de 100%', acao: { rotulo: 'Redistribuir' } },
    { estado: 'warn', titulo: 'TechNova renova em 6 dias', sub: 'Nenhuma reunião de renovação marcada', acao: { rotulo: 'Agendar' } },
  ]) });

  const formHtml = ui.card({ titulo: 'Formulário com máscaras e validação', acoes: notify.botaoNotificar('clients', 'c-orion', 'Grupo Orion', { sm: true }), corpo: `<form id="qa-form" class="stack" novalidate><div class="fgrid">
${ui.campo({ nome: 'razao', rotulo: 'Razão social', obrigatorio: true, placeholder: 'Ex.: Orion Comércio Ltda.' })}
${ui.campo({ nome: 'cnpj', rotulo: 'CNPJ', tipo: 'cnpj', obrigatorio: true })}
${ui.campo({ nome: 'email', rotulo: 'E-mail do decisor', tipo: 'email', placeholder: 'nome@empresa.com.br' })}
${ui.campo({ nome: 'tel', rotulo: 'WhatsApp', tipo: 'telefone' })}
${ui.campo({ nome: 'mrr', rotulo: 'MRR', tipo: 'moeda', valor: 14200, ajuda: 'Valor mensal recorrente do contrato.' })}
${ui.campo({ nome: 'reajuste', rotulo: 'Reajuste', tipo: 'percent', valor: 4.5 })}
${ui.campo({ nome: 'inicio', rotulo: 'Início do contrato', tipo: 'data', valor: '2025-09-01' })}
${ui.campo({ nome: 'cpf', rotulo: 'CPF do decisor', tipo: 'cpf' })}
${ui.campo({ nome: 'resp', rotulo: 'Responsável interno', tipo: 'select', opcoes: ctx.db.list('team', t => t.faturavel).map(t => ({ v: t.id, l: t.nome })), valor: 't-ana' })}
${ui.campo({ nome: 'segmento', rotulo: 'Segmento', tipo: 'select', placeholder: 'Escolha…', opcoes: ['Varejo', 'Saúde', 'Construção', 'Tecnologia'], obrigatorio: true })}
${ui.campo({ nome: 'obs', rotulo: 'Observações', tipo: 'textarea', cls: 'full', dica: 'Visível para toda a equipe do cliente.' })}
${ui.campo({ nome: 'fidelidade', rotulo: 'Contrato com fidelidade de 12 meses', tipo: 'checkbox', valor: true })}
</div><div class="row" style="justify-content:flex-end">${ui.btn({ rotulo: 'Limpar', attrs: { 'data-qa': 'limpar' } })}${ui.btn({ rotulo: 'Validar e salvar', tipo: 'pri', attrs: { 'data-qa': 'validar' } })}</div><pre id="qa-out" class="sm mut" style="white-space:pre-wrap;margin:0" hidden></pre></form>` });

  const imperativos = ui.card({ titulo: 'Janelas, avisos e estados', corpo: `<div class="stack"><div class="row">
${ui.btn({ rotulo: 'Abrir modal', icone: 'edit', attrs: { 'data-qa': 'modal' } })}${ui.btn({ rotulo: 'Confirmar exclusão', icone: 'trash', attrs: { 'data-qa': 'confirmar' } })}${ui.btn({ rotulo: 'Abrir painel lateral', icone: 'cols', attrs: { 'data-qa': 'drawer' } })}${ui.btn({ rotulo: 'Toast com Desfazer', icone: 'check', attrs: { 'data-qa': 'toast' } })}${ui.btn({ rotulo: 'Toast de erro', icone: 'alert', attrs: { 'data-qa': 'toast-err' } })}</div>
${ui.aviso({ tipo: 'err', titulo: 'Token do Meta expirou.', texto: 'A sincronização de leads parou às 23:42. Reconecte em Integrações.', acao: ui.btn({ rotulo: 'Reconectar', sm: true, tipo: 'pri' }) })}
${ui.aviso({ tipo: 'warn', titulo: '2 clientes parados em "Acessos" há mais de 5 dias.', texto: 'Cobre os acessos para não atrasar o kickoff.' })}
${ui.aviso({ tipo: 'info', texto: 'Dados ilustrativos no modo demonstração.' })}
${ui.pares([['Razão social', 'Orion Comércio Varejista Ltda.'], ['CNPJ', '12.345.678/0001-95'], ['Decisor', 'Marcos Vieira'], ['Renovação', fmt.data('2027-02-12')], ['MRR', fmt.brl(14200)], ['Conta de anúncios', ui.led('err', 'Token expirado')]])}
<div class="g2">${ui.vazio({ icone: 'inbox', titulo: 'Nenhuma entrega atrasada', texto: 'Quando uma entrega passar do prazo, ela aparece aqui com o responsável.', acao: { rotulo: 'Criar tarefa', icone: 'plus' }, compacto: true })}<div>${ui.skeleton({ linhas: 4 })}</div></div></div>` });

  const comentarios = ui.card({ titulo: 'Comentários (Grupo Orion)', sub: 'Digite @ para mencionar — a pessoa recebe notificação', corpo: notify.comentarios('clients', 'c-orion', { titulo: 'Grupo Orion' }) });

  const cores = `<div class="qa-sw">${['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c2n', '--ok', '--warn', '--err', '--off', '--acc'].map(v => `<div><i style="--k:var(${v})"></i><code>${v}</code></div>`).join('')}</div>`;

  return `<div class="pg">
${ui.cabecalho({ titulo: 'Componentes do core', sub: 'Página de QA visual (#/_ui). Tudo aqui vem de src/core/ui.js e src/core/charts.js — use os mesmos componentes nos módulos.', acoes: `${ui.btn({ rotulo: 'Alternar tema', icone: 'moon', attrs: { 'data-tema-toggle': '' } })}${ui.btn({ rotulo: 'Nova rotina', icone: 'plus', tipo: 'pri' })}`, meta: `${ui.led('ok', 'Core carregado')}<span>Período: <b>${fmt.esc(p.rotulo)}</b> (${fmt.esc(p.comparacao)})</span>` })}
${S('Indicadores', kpis)}
${S('Estados', estados)}
${S('Navegação e ações', navs)}
${S('Gráficos', graficos)}
${S('Tabela', tabela)}
${S('Listas e comentários', `<div class="g2">${lista}${comentarios}</div>`)}
${S('Formulários', formHtml)}
${S('Imperativos', imperativos)}
${S('Cores dos gráficos', cores)}
</div>`;
}

function mount(el, ctx) {
  const onClick = async e => {
    const b = e.target.closest('[data-qa]'); if (!b) return;
    const k = b.dataset.qa;
    if (k === 'validar') {
      const f = el.querySelector('#qa-form'); const r = ui.form.validar(f, { razao: 'obrigatorio|min:3' });
      const out = el.querySelector('#qa-out'); out.hidden = false; out.textContent = r.ok ? `Dados lidos: ${JSON.stringify(r.dados, null, 1)}` : `Erros: ${Object.values(r.erros).join(' · ')}`;
      if (r.ok) ui.toast('Cliente salvo.', { desfazer: () => {} });
    } else if (k === 'limpar') { el.querySelector('#qa-form').reset(); ui.form.limparErros(el.querySelector('#qa-form')); el.querySelector('#qa-out').hidden = true; }
    else if (k === 'modal') {
      await ui.modal({ titulo: 'Editar MRR do contrato', sub: 'Grupo Orion', corpo: `<form class="stack" novalidate>${ui.campo({ nome: 'mrr', rotulo: 'Novo MRR', tipo: 'moeda', valor: 14200, obrigatorio: true })}${ui.campo({ nome: 'motivo', rotulo: 'Motivo da alteração', tipo: 'textarea', obrigatorio: true })}</form>`, confirmar: 'Salvar',
        onConfirmar: box => { const r = ui.form.validar(box.querySelector('form')); if (!r.ok) return false; ui.toast(`MRR alterado para ${fmt.brl(r.dados.mrr)}.`, { desfazer: () => {} }); return true; } });
    } else if (k === 'confirmar') { const ok = await ui.confirmar('A rotina "Backup de criativos" e o histórico de 30 dias serão excluídos. Esta ação não pode ser desfeita.', { titulo: 'Excluir rotina?', confirmar: 'Excluir rotina' }); ui.toast(ok ? 'Rotina excluída.' : 'Nada foi excluído.', { tipo: ok ? 'ok' : 'info' }); }
    else if (k === 'drawer') { ui.drawer({ titulo: 'Log da rotina', sub: 'Sync de leads Meta → CRM', corpo: `${ui.aviso({ tipo: 'err', titulo: 'OAuthException 190', texto: 'Token de acesso expirado. Reconecte o Meta Ads em Integrações.' })}${ui.lista([{ estado: 'err', titulo: '23:42 · falhou', sub: 'Tentativa 2 de 3' }, { estado: 'err', titulo: '23:12 · falhou', sub: 'Tentativa 1 de 3' }, { estado: 'warn', titulo: '22:36 · lenta', sub: '48 s (normal: 6 s)' }, { estado: 'ok', titulo: '21:00 · ok', sub: '27 leads sincronizados' }])}`, rodape: ui.btn({ rotulo: 'Rodar agora', icone: 'play', tipo: 'pri', attrs: { 'data-fechar': '' } }) }); }
    else if (k === 'toast') ui.toast('Tarefa marcada como concluída.', { desfazer: () => {} });
    else if (k === 'toast-err') ui.toast('Não foi possível salvar. Verifique sua conexão e tente de novo.', { tipo: 'err' });
  };
  el.addEventListener('click', onClick);
  return () => el.removeEventListener('click', onClick);
}

export const paginaUI = { titulo: 'Componentes (QA)', render, mount, usaPeriodo: true };
export default paginaUI;
