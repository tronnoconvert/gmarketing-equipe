// tests/cockpit.spec.mjs — Cockpit: valores do documento, ações de "Precisa de você hoje", Resolvido/Desfazer, período, permissões.
export default async function (t) {
  const { page, ok, step } = t;
  await t.login();

  step('renderiza com os valores do documento');
  await t.ir('#/cockpit');
  await page.waitForSelector('.m-cockpit');
  const txt = await page.textContent('.m-cockpit');
  for (const s of ['R$ 186,4 mil', '▲ 8,2%', '27,4%', 'R$ 412 mil', '6,8 meses', 'R$ 23,9 mil', '12,8% do MRR', '91%', 'meta 95%', '78', 'Financeiro', '+31 clientes', 'R$ 98,3k', 'Sync leads Meta → CRM', 'falhou 2× · 23:42', 'Ana Souza', '118%', 'TechNova', 'Renovações'])
    ok(txt.includes(s), `contém "${s}"`);
  ok(txt.includes('Gabriel'), 'saudação com o nome do dono');
  ok(/2 itens críticos e 3 de atenção hoje/.test(txt), 'resumo "2 itens críticos e 3 de atenção hoje"');
  ok(await page.$$eval('.ck-kpis .kpi', e => e.length) === 6, '6 KPIs');
  ok(await page.$$eval('.ck-kpis .kpi.alerta', e => e.length) === 1, 'MRR em risco em alerta');
  ok(await page.$$eval('.ck-kpis svg.spark', e => e.length) === 6, 'sparklines nos 6 KPIs');
  ok(await page.$eval('#ck-kpi-risco .kpi-lnk', e => e.getAttribute('href')) === '#/clientes?f=risco', 'MRR em risco → #/clientes?f=risco');
  ok(await page.$$eval('.ck-hoje .ck-it', e => e.length) === 5, '5 itens em Precisa de você hoje');
  ok(await page.$$eval('.ck-hoje .ck-it .led', e => e.length) === 5, 'LED em cada item');
  ok(await page.$$eval('.ck-torre li', e => e.length) === 8, '8 rotinas na Torre');
  ok(await page.$$eval('.ck-cap li', e => e.length) === 6, '6 pessoas na capacidade');
  ok(await page.$$eval('.ck-cap .bar-z', e => e.length) === 6, 'zona ideal sombreada');
  ok(await page.$$eval('.ck-ren li', e => e.length) === 4, '4 renovações');
  ok(await page.$$eval('.ch-disp a.ch-pa', e => e.length) === 11, '11 clientes no mapa com link');
  ok(await page.$$eval('.ck-leds .led', e => e.length) === 12, 'LED por cliente + agregado');
  ok(await page.isVisible('.ck-saude .ch-gauge'), 'gauge de saúde');
  ok(await page.$$eval('.ck-comp a', e => e.map(a => a.getAttribute('href')).join()) === '#/financeiro,#/clientes,#/operacao,#/equipe', 'componentes da saúde levam aos módulos');
  ok(await page.$$eval('.ch-linhas svg.chart', e => e.length) >= 1, 'gráfico Receita × Custos');

  step('card Backups (dono): 3 backups verdes + auditoria (demonstração)');
  ok(await page.isVisible('.ck-backups'), 'card Backups visível para o dono');
  ok(await page.$$eval('.ck-bk [data-backup]', e => e.map(x => x.dataset.backup).join()) === 'nativo,diario,externo,auditoria', 'Supabase nativo, Exportação diária, Cópia externa e Auditoria');
  ok(await page.$$eval('.ck-bk [data-backup] .led.ok', e => e.length) === 4, 'LEDs verdes na demonstração');
  ok(/último: \d\d\/\d\d às \d\d:\d\d/.test(await page.textContent('.ck-backups')), '"último: dd/mm às hh:mm"');
  ok(/3 de 3 em dia/.test(await page.textContent('.ck-backups')), '"3 de 3 em dia"');

  step('acima da dobra (1366×900)');
  if (t.vp.w === 1366) {
    const b = await page.$eval('.ck-hoje .ck-it:last-child', e => e.getBoundingClientRect().bottom);
    ok(b <= 900, `último item de "Precisa de você hoje" visível sem rolar (${Math.round(b)}px)`);
  }

  step('links das ações');
  const hrefs = await page.$$eval('.ck-hoje [data-acao]', e => e.map(a => a.getAttribute('href')));
  ok(hrefs.includes('#/clientes/c-orion') && hrefs.includes('#/torre/rotina/r-sync-leads') && hrefs.includes('#/financeiro/receber?cobrar=inv-2611-bella') && hrefs.includes('#/equipe/t-ana?acao=redistribuir') && hrefs.includes('#/clientes/c-technova?acao=agendar'), 'cinco ações com destino correto');

  step('Cobrar abre o modal de cobrança no Financeiro');
  await page.click('.ck-hoje [data-acao="bella"]');
  await page.waitForSelector('.mbox', { timeout: 3000 });
  ok((await page.textContent('.mbox')).includes('Bella Moda'), 'modal de cobrança da Bella Moda');
  ok(/#\/financeiro\/receber/.test(page.url()), 'navegou para contas a receber');
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);

  step('Resolvido + Desfazer + persistência');
  await t.ir('#/cockpit');
  await page.click('.ck-hoje [data-resolver="technova"]');
  await page.waitForTimeout(350);
  ok(await page.$$eval('.ck-hoje .ck-it', e => e.length) === 4, 'item sai da lista');
  ok((await page.textContent('.ck-hd')).includes('2 itens críticos e 2 de atenção'), 'resumo atualizado');
  ok(await page.isVisible('.toast:last-child [data-desfazer]'), 'toast com Desfazer');
  await page.reload(); await page.waitForSelector('.m-cockpit'); await page.waitForTimeout(200);
  ok(await page.$$eval('.ck-hoje .ck-it', e => e.length) === 4, 'resolvido persiste após recarregar');
  await page.click('.ck-feitos summary');
  await page.click('[data-reabrir="technova"]'); await page.waitForTimeout(350);
  ok(await page.$$eval('.ck-hoje .ck-it', e => e.length) === 5, 'Desfazer devolve o item');

  step('período');
  await page.evaluate(() => window.AOS.shell.setPeriodo('tri')); await page.waitForTimeout(350);
  let k = await page.textContent('#ck-kpi-mrr');
  ok(k.includes('14,4%') && k.includes('vs agosto'), 'Trimestre muda a comparação do MRR');
  ok((await page.textContent('.m-cockpit')).includes('Set–Nov'), 'Receita × Custos por trimestre');
  await page.evaluate(() => window.AOS.shell.setPeriodo('12m')); await page.waitForTimeout(350);
  k = await page.textContent('#ck-kpi-mrr');
  ok(k.includes('33,6%'), '12 meses muda a comparação');
  await page.evaluate(() => window.AOS.shell.setPeriodo('mes')); await page.waitForTimeout(300);

  step('clique no KPI de risco');
  await page.click('#ck-kpi-risco .kpi-lnk'); await page.waitForTimeout(250);
  ok(/#\/clientes\?f=risco/.test(page.url()), 'foi para clientes em risco');

  step('permissão: financeiro não acessa o Cockpit por padrão');
  await t.login('paulo@agencia.demo');
  await t.ir('#/cockpit');
  ok((await page.textContent('#view')).includes('Acesso restrito'), 'papel financeiro sem Cockpit (dinheiro que entra só para administradores)');
  step('permissão: só ver o Cockpit (Resolvido desabilitado)');
  await t.login();
  await page.evaluate(() => { const m = window.AOS.perms.matriz(); m.cockpit.financeiro = 'ver'; m.receita.financeiro = 'ver'; window.AOS.perms.salvarMatriz(m); });
  await t.sair(); // sem limpar o armazenamento (a matriz alterada fica salva)
  await page.fill('#lg-email', 'paulo@agencia.demo'); await page.fill('#lg-senha', 'demo123'); await page.click('.lg-go'); await page.waitForSelector('#view');
  await t.ir('#/cockpit'); await page.waitForSelector('.m-cockpit');
  ok(await page.$eval('[data-resolver="orion"]', e => e.disabled), 'Resolvido desabilitado para quem só vê');
  ok((await page.$eval('[data-resolver="orion"]', e => e.title)).includes('visualiza'), 'tooltip explica');
  ok(!(await page.$('.ck-backups')), 'card Backups NÃO aparece para quem não é Dono/Admin');
}
