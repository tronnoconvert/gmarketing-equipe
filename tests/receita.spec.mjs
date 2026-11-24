// tests/receita.spec.mjs — "dinheiro que entra" (MRR, faturamento, ROAS, lucro, receita, faturas) só para Dono/Admin.
// A equipe (tráfego, CS, produção, financeiro, leitura) vê custos, volumes, comparecimento, health, prazos e tarefas.
export const viewports = [[1366, 900], [390, 844]];

export default async function (t) {
  const { page, ok, step } = t;
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const txt = async (sel = '#view') => ((await page.$(sel)) ? page.textContent(sel) : '');
  const RS = /R\$\s?\d/;
  const proibidoWeb = /Faturamento|\bROAS\b|\bLucro\b|Reembolsos|ticket R\$/;
  const entrar = async email => { await t.login(email); await page.waitForTimeout(100); };
  const menu = () => page.$$eval('.nv [data-mod]', els => els.map(e => e.dataset.mod));
  const kpis = sel => page.$$eval(`${sel} .kpi`, l => l.length);

  /* ---------------- dono vê tudo ---------------- */
  step('dono: webinars com faturamento, ROAS e lucro');
  await entrar('gabriel@agencia.demo');
  await t.ir('#/webinars'); await page.waitForSelector('.m-webinars .kpi');
  let v = await txt();
  ok(v.includes('Faturamento') && v.includes('ROAS') && v.includes('Lucro'), 'dono vê Faturamento/ROAS/Lucro no painel');
  await t.ir('#/webinars/wb-06/preencher?etapa=vendas'); await page.waitForSelector('[data-etapa="vendas"]:not([hidden])');
  ok(!!(await page.$('[name="vendas.reembolsos"]')) && !!(await page.$('[data-r="ven"][data-k="faturamento"]')), 'dono edita valores de vendas');
  step('dono: clientes, equipe, alertas com valores');
  await t.ir('#/clientes'); await page.waitForSelector('.m-clientes .kpi');
  ok((await txt()).includes('MRR') && (await txt()).includes('Matriz risco × valor'), 'dono vê MRR e matriz risco × valor');
  await t.ir('#/clientes/c-orion');
  ok((await txt('.m-clientes-hd')).includes('MRR') && !!(await page.$('.tabs a[href$="/financeiro"]')), 'dono vê MRR na ficha e aba Financeiro');
  await t.ir('#/equipe');
  ok((await txt()).includes('Receita por colaborador'), 'dono vê receita por colaborador');
  await t.ir('#/alertas');
  ok(RS.test(await txt()), 'dono vê valores nos alertas/insights');
  await t.ir('#/torre');
  ok((await txt()).includes('Atualização de MRR'), 'dono vê rotinas financeiras na Torre');

  /* ---------------- gestor de tráfego (Ana) ---------------- */
  step('tráfego: menu sem Cockpit e Financeiro');
  await t.sair(); await entrar('ana@agencia.demo');
  const mAna = await menu();
  ok(!mAna.includes('cockpit') && !mAna.includes('financeiro'), 'sem Cockpit/Financeiro no menu');
  ok(await ev(() => !window.AOS.perms.veReceita()), 'perms.veReceita() = false');

  step('tráfego: painel de webinars sem receita');
  await t.ir('#/webinars'); await page.waitForSelector('.m-webinars .kpi');
  v = await txt();
  ok(!proibidoWeb.test(v), `painel sem Faturamento/ROAS/Lucro (${(v.match(proibidoWeb) || [])[0] || ''})`);
  ok((await kpis('.m-webinars .g-kpi')) === 8, 'grade de KPIs continua com 8 cartões (sem buracos)');
  ok(v.includes('Investimento em tráfego') && v.includes('Custo por inscrito') && v.includes('Comparecimento') && v.includes('Custo por venda'), 'custos e comparecimento visíveis');
  ok(!/Faturamento|ROAS|Lucro/.test(await txt('.tbl[aria-label="Comparativo entre webinars"]')), 'comparativo sem colunas de faturamento/ROAS/lucro');

  step('tráfego: detalhe do webinar sem receita');
  await t.ir('#/webinars/wb-06'); await page.waitForSelector('.m-webinars-ckl');
  v = await txt('.m-webinars .g-kpi');
  ok(!proibidoWeb.test(v) && (await kpis('.m-webinars .g-kpi')) === 8, 'KPIs do detalhe sem receita (8 cartões)');
  ok(!/ticket/i.test(await txt('.ph')) && !(await txt()).includes('Reembolsos:'), 'cabeçalho sem ticket e legenda sem reembolsos');

  step('tráfego: formulário — planejamento sem ticket, vendas só quantidade');
  await t.ir('#/webinars/wb-06/preencher'); await page.waitForSelector('[data-wf]');
  ok(!(await page.$('[name="ticket"]')), 'sem campo Ticket');
  ok(!/ROAS|Lucro/.test(await txt('[data-calc]')), 'cálculos ao vivo sem ROAS/Lucro');
  await page.click('[data-ir="vendas"]'); await page.waitForTimeout(120);
  ok(!(await page.$('[data-r="ven"][data-k="faturamento"]')) && !(await page.$('[name="vendas.reembolsos"]')) && !(await page.$('[name="vendas.pendentes"]')) && !(await page.$('[name="vendas.custos"]')), 'sem campos em R$ nas vendas');
  ok(await page.isVisible('[data-nota-receita]') && (await txt('[data-nota-receita]')).includes('Valores de faturamento: visíveis só para administradores'), 'nota explica os valores ocultos');
  ok(!!(await page.$('[name="vendas.checkout"]')) && !!(await page.$('[data-r="ven"][data-k="vendas"]')), 'quantidade de vendas e checkout editáveis');
  const fatAntes = await ev(() => window.AOS.db.list('webinarDaily', d => d.webinarId === 'wb-06' && d.tipo === 'venda').reduce((a, d) => a + (d.faturamento || 0), 0));
  const reembAntes = await ev(() => window.AOS.db.get('webinars', 'wb-06').vendas.reembolsos);
  await page.fill('[name="vendas.checkout"]', '260'); await page.waitForTimeout(80);
  await page.click('[data-salvar="rascunho"]'); await page.waitForTimeout(450);
  ok(await ev(() => window.AOS.db.get('webinars', 'wb-06').vendas.checkout) === 260, 'checkout salvo');
  ok(await ev(f => window.AOS.db.list('webinarDaily', d => d.webinarId === 'wb-06' && d.tipo === 'venda').reduce((a, d) => a + (d.faturamento || 0), 0) === f, fatAntes), 'faturamento gravado continua intacto');
  ok(await ev(r => window.AOS.db.get('webinars', 'wb-06').vendas.reembolsos === r && window.AOS.db.get('webinars', 'wb-06').ticket === 1997, reembAntes), 'reembolsos e ticket preservados');
  ok(await ev(() => { const r = JSON.parse(localStorage.getItem('aos-wb-rasc:wb-06') || 'null'); return !r || !(r.st.ven || []).some(v => v.faturamento); }), 'rascunho local sem valores de faturamento');

  step('tráfego: clientes sem MRR');
  await t.ir('#/clientes'); await page.waitForSelector('.m-clientes .kpi');
  v = await txt();
  ok(!/\bMRR\b/.test(v), 'carteira sem MRR');
  ok(v.includes('Matriz risco × health') && !v.includes('risco × valor'), 'matriz risco × health');
  ok((await kpis('.m-clientes-kpis')) === 5, '5 KPIs na carteira');
  await t.ir('#/clientes/c-orion');
  v = await txt('.m-clientes-hd');
  ok(!/MRR|R\$/.test(v) && v.includes('No prazo'), 'cabeçalho da ficha sem MRR (mostra No prazo)');
  ok(!(await page.$('.tabs a[href$="/financeiro"]')), 'sem aba Financeiro');
  await t.ir('#/clientes/c-orion/financeiro');
  ok((await txt()).includes('Financeiro do cliente restrito') && !RS.test(await txt('.m-clientes-aba')), 'aba Financeiro bloqueada por URL');
  await t.ir('#/clientes/c-orion/cadastro');
  ok(!/\bMRR\b/.test(await txt('.m-clientes-aba')), 'cadastro sem MRR');
  await t.ir('#/clientes/c-orion/cadastro?editar=1'); await page.waitForTimeout(150);
  ok(!(await page.$('#m-clientes-cad [name="mrr"]')) && (await txt()).includes('visível e editável só para administradores'), 'edição sem campo MRR, com nota');
  const mrrOrion = await ev(() => window.AOS.db.get('clients', 'c-orion').mrr);
  await page.click('.m-clientes-savebar [data-salvar]'); await page.waitForTimeout(350);
  ok(await ev(m => window.AOS.db.get('clients', 'c-orion').mrr === m, mrrOrion), 'MRR do cliente preservado');
  await ev(() => document.querySelectorAll('.toast').forEach(x => x.remove()));
  await t.ir('#/clientes/c-orion/resultados-acoes');
  ok(!RS.test(await txt('.m-clientes-hd')) && !(await page.$('.tabs a[href$="/financeiro"]')), 'ficha nova (5 abas) sem MRR nem aba Financeiro');

  step('tráfego: importar planilha ignora MRR');
  await t.ir('#/clientes');
  await page.click('[data-importar]'); await page.waitForSelector('[data-imp-txt]');
  ok(!/mrr/i.test(await page.getAttribute('[data-imp-txt]', 'placeholder')) && !/mrr,/i.test(await page.textContent('.ov-modal:not(.saindo) .mbox .fld-d')), 'modelo e colunas sem MRR');
  await page.fill('[data-imp-txt]', 'nome;segmento;mrr;responsavel\nCliente Receita Oculta;Varejo;9.999,00;ana@agencia.demo'); await page.waitForTimeout(450);
  v = await txt('.ov-modal:not(.saindo) .mbox');
  ok(v.includes('coluna MRR foi ignorada') && !v.includes('9.999') && !/R\$/.test(v), 'prévia sem MRR, com aviso');
  await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await page.waitForTimeout(350);
  const imp = await ev(() => window.AOS.db.find('clients', c => c.nome === 'Cliente Receita Oculta'));
  ok(imp && imp.mrr === 0 && imp.mrrPendente === true, 'importado com MRR 0 e pendente');
  ok(await ev(() => window.AOS.db.count('notifications', n => n.para === 'u-gabriel' && /Preencher o MRR/.test(n.titulo))) >= 1, 'quem vê receita é avisado');
  await page.click('.toast [data-desfazer]'); await page.waitForTimeout(250);
  ok(!(await ev(() => window.AOS.db.find('clients', c => c.nome === 'Cliente Receita Oculta'))), 'Desfazer remove o importado');

  step('tráfego: equipe sem receita');
  await t.ir('#/equipe');
  v = await txt();
  ok(!/Receita por colaborador|\bMRR\b/.test(v), 'sem receita por colaborador');
  await t.ir('#/equipe/t-ana/clientes');
  ok(!/\bMRR\b/.test(await txt()), 'aba Clientes do perfil sem MRR');
  await t.ir('#/equipe/t-ana/performance');
  ok(!(await txt()).includes('Receita gerida'), 'performance sem receita gerida');

  step('tráfego: alertas e torre sem valores');
  await t.ir('#/alertas');
  v = await txt();
  ok(!RS.test(v) && !/\bMRR\b/.test(v), 'feed e insights sem R$/MRR');
  await t.ir('#/alertas/regras');
  ok(!RS.test(await txt()) && !/\bMRR\b/.test(await txt()), 'regras sem R$/MRR');
  await t.ir('#/torre');
  v = await txt();
  ok(!v.includes('Atualização de MRR') && !v.includes('Conciliação bancária') && !RS.test(await txt('.m-torre-tl')), 'Torre sem rotinas financeiras');
  await t.ir('#/torre/rotina/r-mrr');
  ok((await txt()).includes('Rotina restrita'), 'log de rotina financeira bloqueado');

  step('tráfego: busca global sem receita');
  if (!t.mobile) {
    await page.click('#gs-in'); await page.keyboard.type('orion'); await page.waitForSelector('.gs-pop [data-gs-i]');
    ok(!RS.test(await txt('.gs-pop')) && !/\bMRR\b/.test(await txt('.gs-pop')), 'resultados sem R$/MRR');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  }

  /* ---------------- CS (Diego) ---------------- */
  step('CS: webinars e clientes sem receita');
  await t.sair(); await entrar('diego@agencia.demo');
  await t.ir('#/webinars'); await page.waitForSelector('.m-webinars .kpi');
  ok(!proibidoWeb.test(await txt()), 'painel sem receita');
  await t.ir('#/webinars/wb-07');
  ok(!proibidoWeb.test(await txt('.m-webinars .g-kpi')), 'detalhe sem receita');
  await t.ir('#/clientes');
  ok(!/\bMRR\b/.test(await txt()), 'carteira sem MRR');
  await t.ir('#/clientes/novo'); await page.waitForSelector('#m-clientes-wf');
  ok(!(await page.$('#m-clientes-wf [name="mrr"]')), 'cadastro novo: sem MRR (etapa 1)');

  /* ---------------- produção (Felipe) ---------------- */
  step('produção: sem receita');
  await t.sair(); await entrar('felipe@agencia.demo');
  await t.ir('#/webinars');
  ok(!proibidoWeb.test(await txt()), 'webinars sem receita');
  const cliF = await ev(() => { const e = window.AOS.perms.escopoClientes(); return e === 'todos' ? 'c-orion' : e[0]; });
  await t.ir('#/clientes');
  ok(!/\bMRR\b/.test(await txt()), 'carteira sem MRR');
  if (cliF) { await t.ir(`#/clientes/${cliF}`); ok(!/MRR/.test(await txt('.m-clientes-hd')), 'ficha sem MRR'); }
  await t.ir('#/equipe');
  ok(!/Receita por colaborador|\bMRR\b/.test(await txt()), 'equipe sem receita');

  /* ---------------- financeiro (Paulo) ---------------- */
  step('financeiro: sem receita, sem valores do comercial, notificações sem R$');
  await t.sair(); await entrar('paulo@agencia.demo');
  const mP = await menu();
  ok(!mP.includes('cockpit') && !mP.includes('financeiro'), 'papel financeiro sem Cockpit/Financeiro por padrão');
  await t.ir('#/comercial');
  v = await txt();
  ok(!RS.test(v) && !/Receita ponderada|Novo MRR/.test(v), 'pipeline sem valores');
  await t.ir('#/comercial/desempenho');
  ok(!RS.test(await txt()), 'desempenho sem valores');
  await t.ir('#/comercial/propostas');
  ok(!RS.test(await txt()), 'propostas sem valores');
  await t.ir('#/notificacoes');
  ok(!RS.test(await txt()), 'central de notificações sem R$');
  ok(await ev(() => window.AOS.db.list('notifications', n => n.para === 'u-paulo').every(n => !/R\$\s?\d/.test(`${n.titulo} ${n.texto}`))), 'notificações do Paulo sem R$ no db');
  await t.ir('#/clientes');
  ok(!/\bMRR\b/.test(await txt()), 'carteira sem MRR');
  await t.ir('#/webinars');
  ok(!proibidoWeb.test(await txt()), 'webinars sem receita');
  await t.ir('#/equipe');
  ok(!/Receita por colaborador|\bMRR\b/.test(await txt()), 'equipe sem receita');

  /* ---------------- leitura (Helena) ---------------- */
  step('leitura: sem receita');
  await t.sair(); await entrar('helena@agencia.demo');
  const mH = await menu();
  ok(!mH.includes('cockpit') && !mH.includes('financeiro'), 'leitura sem Cockpit/Financeiro');
  await t.ir('#/webinars');
  ok(!proibidoWeb.test(await txt()), 'webinars sem receita');
  await t.ir('#/clientes');
  ok(!/\bMRR\b/.test(await txt()), 'carteira sem MRR');
  await t.ir('#/alertas');
  ok(!RS.test(await txt()), 'alertas sem R$');
  await t.ir('#/torre');
  ok(!(await txt()).includes('Atualização de MRR'), 'Torre sem rotinas financeiras');

  /* ---------------- comercial (Marina) mantém os valores das oportunidades ---------------- */
  step('comercial: vê valores do pipeline, mas não MRR da carteira');
  await t.sair(); await entrar('marina@agencia.demo');
  await t.ir('#/comercial');
  ok(RS.test(await txt()), 'comercial vê valores das oportunidades');
  await t.ir('#/clientes');
  ok(!/\bMRR\b/.test(await txt()), 'carteira sem MRR para o comercial');

  /* ---------------- permissão editável: dar "receita" ao gestor ---------------- */
  step('matriz: liberar receita para o gestor de tráfego');
  await t.sair(); await entrar('gabriel@agencia.demo');
  await ev(() => { const m = window.AOS.perms.matriz(); m.receita.gestor_trafego = 'ver'; window.AOS.perms.salvarMatriz(m); });
  await t.sair(); // sem limpar o armazenamento (t.login limparia a matriz salva)
  await page.fill('#lg-email', 'ana@agencia.demo'); await page.fill('#lg-senha', 'demo123'); await page.click('.lg-go'); await page.waitForSelector('#view');
  await t.ir('#/webinars'); await page.waitForSelector('.m-webinars .kpi');
  ok((await txt()).includes('Faturamento'), 'com a permissão, o gestor passa a ver faturamento');
}
