// tests/operacao.spec.mjs — visão, quadro (filtros, nova tarefa, mover, arrastar, painel, aprovação/ajuste, comentários), calendário, projetos, permissões.
export default async function (t) {
  const { page, ok, step } = t;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const task = id => ev(i => window.AOS.db.get('tasks', i), id);
  const notifs = (para, tipo) => ev(([p, ti]) => window.AOS.db.list('notifications', n => n.para === p && (!ti || n.tipo === ti)).length, [para, tipo]);
  const fecharOverlays = async () => { for (let i = 0; i < 3; i++) { if (await page.$('.ov')) { await page.keyboard.press('Escape'); await page.waitForTimeout(220); } } };

  await t.login();

  step('visão geral');
  await t.ir('#/operacao');
  await page.waitForSelector('.m-operacao .kpi');
  ok((await page.$$('.m-operacao .g-kpi .kpi')).length === 6, '6 KPIs (a fazer, andamento, aprovação, atrasadas, no prazo, SLA)');
  ok(await page.isVisible('.m-operacao .kpi.alerta'), 'Atrasadas com LED de alerta');
  const vis = await page.textContent('.m-operacao');
  ok(vis.includes('Grupo Orion concentra 3'), 'Grupo Orion concentra 3 atrasadas');
  ok(vis.includes('91%'), 'entregas no prazo 91% (4 semanas)');
  ok(vis.includes('Meta 95%') || vis.includes('meta 95%'), 'meta 95% visível');
  ok((await page.$$('.m-operacao svg.chart')).length >= 2, 'gráficos de % no prazo e SLA');
  ok(await ev(() => window.AOS.db.count('tasks', x => x.clientId === 'c-orion' && x.status !== 'feito' && x.prazo < new Date().toISOString().slice(0, 10))) === 3, 'dados: 3 tarefas atrasadas do Grupo Orion');
  ok((await page.textContent('.nv [data-mod="operacao"] .cnt')).trim() === '6', 'contador do menu = 6 atrasadas');
  await t.ir('#/operacao?rt=tipo');
  ok((await page.textContent('.m-operacao')).includes('Criativo'), 'retrabalho por tipo (filtro na URL)');

  step('quadro e filtros na URL');
  await t.ir('#/operacao/quadro');
  ok((await page.$$('.m-operacao .kb-col')).length === 4, '4 colunas');
  await page.selectOption('[data-filtro="pessoa"]', 't-ana'); await page.waitForTimeout(250);
  ok(page.url().includes('pessoa=t-ana'), 'filtro pessoa na URL');
  const avs = await page.$$eval('.kb-card .kb-foot .av', els => els.map(e => e.textContent.trim()));
  ok(avs.length > 0 && avs.every(a => a === 'AS'), `só cartões da Ana (${avs.length})`);
  await t.ir('#/operacao/quadro?atraso=1');
  ok((await page.$$('.kb-card')).length === 6, 'filtro "só atrasadas" = 6');

  step('nova tarefa: validação e atribuição notifica');
  await t.ir('#/operacao/quadro');
  const antesCarla = await notifs('u-carla', 'atribuicao');
  await page.click('[data-nova]'); await page.waitForSelector('.ov-modal .tf-form');
  await page.click('.ov-modal [data-ok]'); await page.waitForTimeout(150);
  ok((await page.$$('.ov-modal .fld-err')).length >= 4, 'erros de validação nos obrigatórios');
  await page.fill('.ov-modal [name="titulo"]', 'Teste de criativos para stories');
  await page.selectOption('.ov-modal [name="clientId"]', 'c-bella');
  await page.selectOption('.ov-modal [name="tipo"]', 'criativo');
  await page.selectOption('.ov-modal [name="respId"]', 't-carla');
  await page.fill('.ov-modal [name="prazo"]', '01/01/2020');
  await page.fill('.ov-modal [name="estimativaH"]', '3');
  await page.click('.ov-modal [data-ok]'); await page.waitForTimeout(150);
  ok((await page.textContent('.ov-modal')).includes('não pode ser antes de hoje'), 'prazo no passado bloqueado');
  ok((await page.textContent('.ov-modal .tf-carga')).includes('Carla'), 'mostra a ocupação de quem recebe');
  const amanha = await ev(() => { const d = new Date(); d.setDate(d.getDate() + 3); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; });
  await page.fill('.ov-modal [name="prazo"]', amanha);
  await page.click('.ov-modal [data-ok]'); await page.waitForTimeout(350);
  ok(!(await page.$('.ov-modal')), 'modal fecha ao salvar');
  const nova = await ev(() => window.AOS.db.find('tasks', x => x.titulo === 'Teste de criativos para stories'));
  ok(nova && nova.respId === 't-carla' && nova.status === 'afazer', 'tarefa criada em A fazer');
  ok(await notifs('u-carla', 'atribuicao') === antesCarla + 1, 'Carla notificada (atribuição)');
  ok(await ev(i => !!window.AOS.db.get('deliveries', `en-${i}`), nova.id), 'entrega criada junto');

  step('mover pelo menu (teclado)');
  await t.ir('#/operacao/quadro');
  await page.click('.kb-card[data-id="tk-09"] [data-mover]'); await page.waitForSelector('.kb-menu [data-para]');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok((await task('tk-09')).status === 'andamento', 'tk-09 movida para Em andamento');
  await page.click('.toast:last-child [data-desfazer]'); await page.waitForTimeout(300);
  ok((await task('tk-09')).status === 'afazer', 'Desfazer restaura');

  if (!t.mobile) {
    step('arrastar e soltar');
    await t.ir('#/operacao/quadro');
    const c = await page.$('.kb-card[data-id="tk-15"] .kb-tit'); const bb = await c.boundingBox();
    const col = await (await page.$('.kb-col[data-col="andamento"] .kb-ch')).boundingBox();
    await page.mouse.move(bb.x + 20, bb.y + 5); await page.mouse.down();
    await page.mouse.move(bb.x + 60, bb.y + 30, { steps: 4 }); await page.mouse.move(col.x + 40, col.y + 40, { steps: 8 });
    ok(await page.isVisible('.kb-ghost'), 'cartão fantasma durante o arraste');
    await page.mouse.up(); await page.waitForTimeout(300);
    ok((await task('tk-15')).status === 'andamento', 'tk-15 arrastada para Em andamento');
  }

  step('painel da tarefa: pedir aprovação notifica o aprovador');
  const antesBruno = await notifs('u-bruno', 'atribuicao');
  await t.ir('#/operacao/quadro?tarefa=tk-06'); await page.waitForSelector('.ov-drawer .td-acoes');
  ok((await page.textContent('.ov-drawer')).includes('Checklist'), 'painel com checklist');
  await page.click('.ov-drawer [data-td="aprovacao"]'); await page.waitForTimeout(250);
  ok((await task('tk-06')).status === 'aprovacao', 'tk-06 em aprovação');
  ok(await notifs('u-bruno', 'atribuicao') === antesBruno + 1, 'Bruno (aprovador) notificado');

  step('checklist e comentário com @menção');
  const semToasts = () => ev(() => document.querySelectorAll('.toast').forEach(x => x.remove()));
  await semToasts();
  await page.check('.ov-drawer [data-ck="tk-06-c2"]'); await page.waitForTimeout(150);
  ok((await task('tk-06')).checklist.find(x => x.id === 'tk-06-c2').feito, 'item do checklist concluído');
  await page.fill('.ov-drawer .td-add-in', 'Revisar legenda'); await semToasts(); await page.click('.ov-drawer [data-ck-add]'); await page.waitForTimeout(150);
  ok((await task('tk-06')).checklist.length === 4, 'item adicionado');
  const antesM = await notifs('u-carla', 'mencao');
  await page.fill('.ov-drawer .cmt textarea', '@Carla ficou ótimo, só ajustar a cor do título');
  await semToasts(); await page.click('.ov-drawer .cmt-f [type="submit"]'); await page.waitForTimeout(250);
  ok(await notifs('u-carla', 'mencao') === antesM + 1, 'menção notifica a Carla');
  ok((await task('tk-06')).historico.length > 3, 'histórico registrado');
  await fecharOverlays();
  ok(!page.url().includes('tarefa='), 'fechar o painel limpa ?tarefa=');

  step('aprovar e pedir ajuste');
  const antesCarla2 = await notifs('u-carla');
  await t.ir('#/operacao/quadro?tarefa=tk-02'); await page.waitForSelector('.ov-drawer [data-td="ajuste"]');
  await page.click('.ov-drawer [data-td="ajuste"]'); await page.waitForSelector('.ov-modal textarea');
  await page.fill('.ov-modal textarea', 'Usar a paleta nova do cliente nos 3 vídeos.');
  await page.click('.ov-modal [data-ok]'); await page.waitForTimeout(300);
  const t2 = await task('tk-02');
  ok(t2.status === 'andamento' && t2.retrabalho === 2, 'ajuste volta para andamento e soma retrabalho');
  ok(await notifs('u-carla') > antesCarla2, 'responsável notificada do ajuste');
  await page.click('.ov-drawer [data-td="aprovacao"]'); await page.waitForTimeout(250);
  await page.click('.ov-drawer [data-td="feito"]'); await page.waitForTimeout(250);
  ok((await task('tk-02')).status === 'feito', 'aprovada → Feito');
  ok(await ev(() => !!window.AOS.db.get('deliveries', 'en-tk-02').entregueEm), 'entrega registrada');
  await fecharOverlays();

  step('calendário e projetos');
  await t.ir('#/operacao/calendario');
  ok(await page.isVisible('.m-operacao .ch-calor svg.chart'), 'mapa de calor pessoa × dia');
  ok((await page.$$('.m-op-dia')).length === 5, 'semana com 5 dias de prazos');
  await t.ir('#/operacao/calendario?sem=1');
  ok((await page.textContent('.m-operacao')).includes('próxima semana'), 'próxima semana pela URL');
  await t.ir('#/operacao/projetos');
  ok((await page.$$('.gt-row')).length >= 9, 'linha do tempo com projetos');
  ok((await page.$$('.gt-m.s-err')).length >= 2, 'marcos atrasados em vermelho');
  await page.click('[data-marco]'); await page.waitForTimeout(250);
  ok((await page.textContent('#toasts')).includes('concluído'), 'concluir marco');

  step('busca global encontra tarefas');
  await page.click('#gs-in').catch(() => {}); await page.keyboard.press('/').catch(() => {});
  if (await page.isVisible('#gs-in')) { await page.fill('#gs-in', 'resgate'); await page.waitForTimeout(300); ok((await page.textContent('.gs-pop')).includes('Tarefas'), 'resultado de tarefa'); await page.keyboard.press('Escape'); }

  step('permissões: produção move só as próprias');
  await t.login('felipe@agencia.demo');
  await t.ir('#/operacao/quadro');
  const outros = await page.$$eval('.kb-card', cs => cs.filter(c => c.querySelector('.kb-foot .av').textContent.trim() !== 'FN').map(c => c.querySelector('[data-mover]').disabled));
  ok(outros.length > 0 && outros.every(Boolean), `não move tarefas de outras pessoas (${outros.length})`);
  ok(!(await page.$eval('.kb-card[data-id="tk-07"] [data-mover]', b => b.disabled)), 'move a própria (tk-07)');
  await t.ir('#/operacao/quadro?tarefa=tk-01'); await page.waitForSelector('.ov-drawer');
  ok((await page.textContent('.ov-drawer .td-acoes')).includes('Somente leitura'), 'painel somente leitura para tarefa de outra pessoa');
  await fecharOverlays();
  await page.click('[data-nova]'); await page.waitForSelector('.ov-modal [name="respId"]');
  ok((await page.$$eval('.ov-modal [name="respId"] option', o => o.length)) === 1, 'produção cria só para si');
  await fecharOverlays();

  step('permissões: leitura não edita');
  await t.login('helena@agencia.demo');
  await t.ir('#/operacao');
  ok(await page.$eval('.ph-a .btn', b => b.disabled), 'Nova tarefa desabilitada para leitura');
}
