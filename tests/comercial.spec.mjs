// tests/comercial.spec.mjs — pipeline (mover por teclado e arrastar), ganho/perdido, nova oportunidade, drawer, abas, permissões.
export default async function (t) {
  const { page, ok, step } = t;
  const db = (fn, arg) => page.evaluate(fn, arg);
  const semToasts = () => page.evaluate(() => document.querySelectorAll('#toasts .toast').forEach(x => x.remove()));
  const etapa = id => db(i => window.AOS.db.get('deals', i).etapa, id);
  await t.login();

  step('pipeline');
  await t.ir('#/comercial'); await page.waitForSelector('.m-comercial-col');
  ok((await page.$$('.m-comercial-col')).length === 7, '7 etapas');
  ok((await page.textContent('.m-comercial-kpi')).includes('R$ 14.800'), 'novo MRR do mês R$ 14.800');
  ok(/^3 /.test(await page.getAttribute('.nv [data-mod="comercial"] .cnt-dot', 'aria-label') || ''), 'contador (ponto âmbar) = 3 ações vencidas');
  ok((await page.$$('.m-comercial-col[data-etapa="lead"] .m-comercial-cd')).length === 5, '5 leads');

  step('filtro ação vencida (URL)');
  await t.ir('#/comercial?f=atrasadas');
  ok((await page.$$('.m-comercial-cd')).length === 3, '3 oportunidades com ação vencida');
  await t.ir('#/comercial');

  step('mover pelo teclado (menu "Mover para")');
  await page.click('[data-mover-menu="d-sorriso"]'); await page.waitForSelector('.m-comercial-pop');
  await page.click('.m-comercial-pop [data-para="negociacao"]'); await t.espera(350);
  ok((await etapa('d-sorriso')) === 'negociacao', 'movido para negociação');
  await page.click('#toasts [data-desfazer]'); await t.espera(300);
  ok((await etapa('d-sorriso')) === 'proposta', 'desfazer volta a etapa');

  await semToasts();
  if (!t.mobile) {
    step('arrastar e soltar');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.dragAndDrop('.m-comercial-cd[data-id="d-cristal"]', '.m-comercial-col[data-etapa="qualificado"] header', { targetPosition: { x: 30, y: 20 } }); await t.espera(350);
    ok((await etapa('d-cristal')) === 'qualificado', 'arrastado para Qualificado');
  }

  await semToasts();
  step('ganho oferece cadastrar cliente');
  await page.click('[data-mover-menu="d-atlas"]'); await page.waitForSelector('.m-comercial-pop');
  await page.click('.m-comercial-pop [data-para="ganho"]'); await page.waitForSelector('.ov-modal');
  await page.click('.ov-modal [data-ok]'); await t.espera(400);
  ok((await etapa('d-atlas')) === 'ganho', 'marcado como ganho');
  ok((await page.textContent('#toasts')).includes('Cadastrar como cliente'), 'toast oferece cadastrar');
  ok((await page.textContent('.m-comercial-kpi')).includes('R$ 21.300'), 'novo MRR atualizado');
  ok(!!(await page.$('.m-comercial-cd[data-id="d-atlas"] a[href*="clientes/novo?deal=d-atlas"]')), 'botão Cadastrar como cliente no cartão');

  await semToasts();
  step('perdido exige motivo');
  await page.click('[data-mover-menu="d-zen"]'); await page.waitForSelector('.m-comercial-pop');
  await page.click('.m-comercial-pop [data-para="perdido"]'); await page.waitForSelector('.ov-modal');
  await page.click('.ov-modal [data-ok]'); await t.espera(150);
  ok(!!(await page.$('.ov-modal .fld-err')), 'motivo obrigatório');
  await page.selectOption('.ov-modal [name="motivo"]', 'Sem orçamento');
  await page.click('.ov-modal [data-ok]'); await t.espera(350);
  ok((await etapa('d-zen')) === 'perdido', 'marcado como perdido');

  step('nova oportunidade com validação');
  await page.click('[data-nova]'); await page.waitForSelector('.ov-modal');
  await page.click('.ov-modal [data-ok]'); await t.espera(150);
  ok((await page.$$('.ov-modal .fld-err')).length >= 4, 'erros de validação');
  await page.fill('.ov-modal [name="empresa"]', 'Padaria Bom Grão');
  await page.fill('.ov-modal [name="valor"]', '320000');
  await page.fill('.ov-modal [name="contato"]', 'Joana Prates');
  await page.check('.ov-modal [name="servicos"][value="Social"]');
  await page.selectOption('.ov-modal [name="origem"]', 'Indicação');
  await page.fill('.ov-modal [name="proximaAcao"]', 'Ligar para qualificar');
  await page.click('.ov-modal [data-ok]'); await t.espera(350);
  const nova = await db(() => window.AOS.db.find('deals', d => d.empresa === 'Padaria Bom Grão'));
  ok(nova && nova.valor === 3200 && nova.etapa === 'lead' && nova.respId === 't-marina', `criada (${nova && nova.valor})`);

  step('drawer com comentários e cadastrar cliente');
  await t.ir('#/comercial?deal=d-vilamar'); await page.waitForSelector('.dbox');
  ok(!!(await page.$('.dbox a[href*="clientes/novo?deal=d-vilamar"]')), 'drawer: Cadastrar como cliente');
  ok(!!(await page.$('.dbox .cmt')) && !!(await page.$('.dbox [data-notificar]')), 'comentários e notificar');
  await page.keyboard.press('Escape'); await t.espera(300);
  ok(!page.url().includes('deal='), 'fechar limpa a URL');

  step('abas desempenho e propostas');
  await t.ir('#/comercial/desempenho'); await page.waitForSelector('svg.chart');
  ok((await page.textContent('#view')).includes('Conversão e ciclo'), 'conversão e ciclo');
  ok((await page.textContent('#view')).includes('Origem dos leads'), 'origem dos leads');
  ok((await page.textContent('#view')).includes('Metas de'), 'metas do mês');
  await t.ir('#/comercial/propostas'); await page.waitForSelector('svg.chart');
  ok((await page.$$('.tbl tbody tr')).length >= 16, 'lista de propostas');

  step('permissões');
  await t.sair(); await t.login('paulo@agencia.demo');
  await t.ir('#/comercial'); await page.waitForSelector('.m-comercial-col');
  ok(await page.$eval('[data-nova]', b => b.disabled), 'financeiro só vê (Nova desabilitada)');
  ok(!(await page.$('.m-comercial-cd[draggable="true"]')), 'sem arrastar');
  await t.sair(); await t.login('marina@agencia.demo');
  await t.ir('#/comercial'); await page.waitForSelector('.m-comercial-col');
  ok(!(await page.$eval('[data-nova]', b => b.disabled)), 'Marina (comercial) edita');
  await t.sair(); await t.login('ana@agencia.demo');
  await t.ir('#/comercial');
  ok((await page.textContent('#view')).includes('Acesso restrito'), 'tráfego sem acesso');
}
