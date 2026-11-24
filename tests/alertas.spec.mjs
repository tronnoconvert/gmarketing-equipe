// tests/alertas.spec.mjs — feed acionável, filtros na URL, atribuir/adiar/resolver, insights, regras, permissões.
export default async function (t) {
  const { page, ok, step } = t;
  const db = (fn, arg) => page.evaluate(fn, arg);
  await t.login();

  step('feed');
  await t.ir('#/alertas'); await page.waitForSelector('.m-alertas-i');
  ok((await page.$$('.m-alertas-i')).length === 7, `7 alertas abertos (${(await page.$$('.m-alertas-i')).length})`);
  ok((await page.textContent('#ml')).includes('2 alertas críticos'), 'luz mestra "2 alertas críticos"');
  ok((await page.textContent('.nv [data-mod="alertas"] .cnt')).trim() === '2', 'contador = 2 críticos');
  ok((await page.$$('.m-alertas-ins li')).length >= 6, 'insights automáticos');
  ok((await page.textContent('.m-alertas-insc')).includes('20,6%'), 'insight de concentração');

  step('filtros na URL');
  await t.ir('#/alertas?g=err');
  ok((await page.$$('.m-alertas-i')).length === 2, 'filtro críticos = 2');
  await t.ir('#/alertas?area=Torre');
  ok((await page.$$('.m-alertas-i')).length === 3, 'área Torre = 3');
  await t.ir('#/alertas');
  await page.selectOption('[data-area]', 'Equipe'); await t.espera(300);
  ok(page.url().includes('area=Equipe') && (await page.$$('.m-alertas-i')).length === 1, 'select de área grava na URL');
  await t.ir('#/alertas');

  step('resolver com desfazer');
  await page.click('[data-resolver="a-bella"]'); await t.espera(350);
  ok((await db(() => window.AOS.db.get('alerts', 'a-bella').status)) === 'resolvido', 'resolvido');
  ok(!(await page.$('#alerta-a-bella')), 'sai do feed de abertos');
  await page.click('#toasts [data-desfazer]'); await t.espera(350);
  ok((await db(() => window.AOS.db.get('alerts', 'a-bella').status)) === 'aberto', 'desfazer reabre');

  step('adiar');
  await page.click('[data-adiar="a-ana"]'); await page.waitForSelector('.m-alertas-pop');
  await page.click('.m-alertas-pop [data-ate] >> nth=1'); await t.espera(350);
  ok((await db(() => window.AOS.db.get('alerts', 'a-ana').status)) === 'adiado', 'adiado até amanhã');
  await t.ir('#/alertas?s=adiados');
  ok((await page.$$('.m-alertas-i')).length === 1, 'aparece em Adiados');
  await t.ir('#/alertas');

  step('atribuir notifica a pessoa');
  await page.click('[data-atribuir="a-technova"]'); await page.waitForSelector('.ov-modal');
  await page.selectOption('.ov-modal [name="pessoa"]', 't-diego');
  await page.fill('.ov-modal [name="msg"]', 'Consegue marcar ainda hoje?');
  await page.click('.ov-modal [data-ok]'); await t.espera(350);
  const at = await db(() => ({ a: window.AOS.db.get('alerts', 'a-technova').atribuidoA, n: window.AOS.db.count('notifications', n => n.para === 'u-diego' && n.tipo === 'atribuicao' && n.link.includes('a-technova')) }));
  ok(at.a === 't-diego' && at.n === 1, `atribuído e notificado (${JSON.stringify(at)})`);

  step('insight: dispensar');
  const nIns = (await page.$$('.m-alertas-ins li')).length;
  await page.click('[data-dispensar="ins-prazo"]'); await t.espera(350);
  ok((await page.$$('.m-alertas-ins li')).length === nIns - 1, 'insight dispensado');

  step('link de busca foca o alerta');
  await t.ir('#/alertas?alerta=a-orion');
  ok(await page.isVisible('#alerta-a-orion.is-foco'), 'alerta em foco');

  step('regras');
  await t.ir('#/alertas/regras'); await page.waitForSelector('.m-alertas-rg');
  ok((await page.$$('.m-alertas-rg')).length === 7, '7 regras essenciais');
  await page.click('[data-rg-ativo="rg-runway"]'); await t.espera(300);
  ok((await db(() => window.AOS.db.get('alertRules', 'rg-runway').ativo)) === false, 'toggle ativo');
  await page.click('[data-rg-canal="rg-entrega"][data-canal="email"]'); await t.espera(300);
  ok((await db(() => window.AOS.db.get('alertRules', 'rg-entrega').canais)).includes('email'), 'canal ligado');
  await page.click('[data-rg-testar="rg-fatura"]'); await t.espera(300);
  ok((await db(() => window.AOS.db.count('notifications', n => n.para === 'u-paulo' && n.titulo.includes('[Teste]')))) === 1, 'testar regra envia notificação');
  await page.click('[data-rg-editar="rg-fatura"]'); await page.waitForSelector('.ov-modal');
  await page.fill('.ov-modal [name="dias"]', '10');
  await page.click('.ov-modal [data-ok]'); await t.espera(350);
  ok((await page.textContent('[data-rg="rg-fatura"]')).includes('10 dias'), 'limite editado');

  step('nova regra');
  await page.click('[data-rg-nova] >> nth=0'); await page.waitForSelector('.ov-modal');
  await page.click('.ov-modal [data-ok]'); await t.espera(150);
  ok((await page.$$('.ov-modal .fld-err')).length >= 2, 'validação');
  await page.fill('.ov-modal [name="nome"]', 'ROAS abaixo de 2');
  await page.selectOption('.ov-modal [name="metrica"]', 'roas');
  await page.fill('.ov-modal [name="valor"]', '2');
  ok((await page.textContent('.ov-modal [data-prev]')).includes('ROAS'), 'prévia da regra');
  await page.click('.ov-modal [data-ok]'); await t.espera(350);
  ok((await page.$$('.m-alertas-rg')).length === 8, 'regra personalizada criada');

  step('permissão: leitura não age');
  await t.sair(); await t.login('helena@agencia.demo');
  await t.ir('#/alertas'); await page.waitForSelector('.m-alertas-i');
  ok(await page.$eval('[data-resolver]', b => b.disabled), 'Resolver desabilitado para leitura');
  step('permissão: escopo "seus" (Ana)');
  await t.sair(); await t.login('ana@agencia.demo');
  await t.ir('#/alertas'); await page.waitForSelector('.m-alertas-l, .vz');
  const n = (await page.$$('.m-alertas-i')).length;
  ok(n >= 1 && n < 7, `Ana vê só os seus alertas (${n})`);
}
