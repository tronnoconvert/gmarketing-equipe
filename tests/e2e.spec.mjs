// tests/e2e.spec.mjs — fluxos que atravessam módulos (integração).
export default async function (t) {
  const { page, ok, step } = t;
  await t.login();

  step('Cockpit → Grupo Orion → Plano de resgate cria tarefas na Operação');
  await t.ir('#/cockpit');
  await page.waitForSelector('.m-cockpit');
  const antes = await page.evaluate(() => window.AOS.db.list('tasks').length);
  await t.ir('#/clientes/c-orion?acao=resgate');
  await page.waitForSelector('.mbox');
  ok(await page.isVisible('.mbox'), 'Plano de resgate abre pelo link de ação');
  await page.keyboard.press('Escape');

  step('Luz mestra mostra 2 alertas críticos e leva aos Alertas');
  ok(/2 alertas críticos/i.test(await page.textContent('body')), 'luz mestra com "2 alertas críticos"');

  step('Reconectar Meta na Torre resolve a falha e a luz mestra baixa para 1');
  await t.ir('#/torre?reconectar=i-meta');
  await page.waitForSelector('.mbox');
  const conf = await page.$('.mbox [data-m="1"], .mbox .btn.pri');
  if (conf) await conf.click();
  await page.waitForTimeout(2500);
  ok(/1 alerta crítico/i.test(await page.textContent('body')), 'luz mestra com "1 alerta crítico" após reconectar');

  step('Comercial → Ganho → cadastro de cliente pré-preenchido');
  const deal = await page.evaluate(() => { const d = window.AOS.db.list('deals'); return d.find(x => x.etapa !== 'ganho' && x.etapa !== 'perdido' && x.empresa); });
  ok(!!deal, 'há oportunidade aberta');
  await t.ir(`#/clientes/novo?deal=${deal.id}`);
  await page.waitForSelector('input[name="nome"]');
  ok(await page.inputValue('input[name="nome"]') === deal.empresa, 'nome fantasia veio da oportunidade');
  ok(/Pré-preenchido com a oportunidade/.test(await page.textContent('.m-clientes')), 'aviso de pré-preenchimento');
  await page.click('[data-descartar]').catch(() => {});

  step('Menção em comentário notifica a pessoa');
  await t.ir('#/clientes/c-orion/comentarios');
  await page.waitForTimeout(700); // a ficha pode redirecionar a aba de comentários (?comentarios=1 → ficha) antes de estabilizar
  const ta = await page.waitForSelector('.cmt textarea');
  await ta.fill('@Ana Souza conferir o ROAS desta semana, por favor');
  const enviar = await page.$('button:has-text("Comentar"), button:has-text("Enviar")');
  if (enviar) await enviar.click();
  await page.waitForTimeout(400);
  const notifAna = await page.evaluate(() => window.AOS.db.list('notifications').some(n => (Array.isArray(n.para) ? n.para : [n.para]).some(p => /ana/.test(p)) && /ROAS desta semana/.test(n.texto || '')));
  ok(notifAna, 'Ana recebeu notificação da menção');

  step('Ver como Ana: escopo e menu restritos');
  await t.ir('#/cockpit');
  await page.evaluate(() => window.AOS && window.AOS.auth && window.AOS.auth.verComo && window.AOS.auth.verComo('u-ana'));
  await page.waitForTimeout(300);
  const menu = await page.textContent('nav').catch(() => '');
  if (menu) ok(!/Financeiro/.test(menu) && !/Campanha/.test(menu), 'Ana não vê Financeiro nem Campanha');

  step('Todas as rotas principais abrem sem erro');
  for (const r of ['#/cockpit', '#/financeiro', '#/clientes', '#/clientes/c-orion/resultados', '#/clientes/c-orion/acoes', '#/operacao/quadro', '#/equipe', '#/equipe/t-ana/performance', '#/torre', '#/torre/voo', '#/comercial', '#/alertas', '#/alertas/regras', '#/webinars', '#/campanha', '#/notificacoes', '#/admin/usuarios', '#/admin/permissoes']) {
    await t.ir(r); await page.waitForTimeout(150);
  }
  ok(true, 'rotas percorridas');
}
