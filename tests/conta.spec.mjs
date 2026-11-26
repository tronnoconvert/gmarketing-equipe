// tests/conta.spec.mjs — Minha conta: verificação em duas etapas (simulada no modo demonstração), faixa de recomendação e login com código.
export default async function (t) {
  const { page, ok, step } = t;
  const entrar = async (email) => { await page.fill('#lg-email', email); await page.fill('#lg-senha', 'demo123'); await page.click('.lg-go'); };

  step('faixa de recomendação para o dono sem 2FA');
  await t.login();
  await page.waitForSelector('#mfa-ban:not([hidden])', { timeout: 3000 }).catch(() => null);
  ok(await page.isVisible('#mfa-ban'), 'faixa "Proteja seu acesso" aparece para o dono');
  ok((await page.textContent('#mfa-ban')).includes('verificação em duas etapas'), 'texto da faixa');

  step('ativar (QR, código errado, código certo)');
  await page.click('#mfa-ban a[href="#/conta"]'); await page.waitForSelector('.m-conta');
  ok(!(await page.isVisible('#mfa-ban')), 'faixa some na própria página da conta');
  ok((await page.textContent('#view')).includes('Fortemente recomendado'), 'recomendação forte para Dono');
  await page.click('[data-iniciar]'); await page.waitForSelector('.m-conta-qr img');
  ok(await page.$eval('.m-conta-qr img', i => i.src.startsWith('data:image/svg+xml')), 'QR code exibido');
  ok((await page.textContent('[data-segredo]')).trim().length > 8, 'chave para digitar manualmente');
  await page.fill('[data-codigo]', '111111'); await page.click('.m-conta-cf button[type="submit"]'); await page.waitForTimeout(150);
  ok((await page.textContent('.m-conta')).includes('Código incorreto'), 'código errado recusado com mensagem');
  await page.fill('[data-codigo]', '123456'); await page.click('.m-conta-cf button[type="submit"]'); await page.waitForTimeout(250);
  ok((await page.textContent('.m-conta')).includes('Ativada'), 'verificação ativada');
  ok(await page.$$eval('.m-conta-fat tbody tr', l => l.length === 1), 'lista com 1 aplicativo');
  await t.ir('#/cockpit');
  ok(!(await page.isVisible('#mfa-ban')), 'faixa não aparece mais depois de ativar');

  step('login pede o código (aal2)');
  await t.sair();
  await entrar('gabriel@agencia.demo'); await page.waitForSelector('.lg-2fa');
  ok(await page.isVisible('#lg-cod'), 'tela do código de 6 dígitos');
  await page.fill('#lg-cod', '999999'); await page.waitForTimeout(250);
  ok(await page.isVisible('.lg-2fa .lg-err'), 'código errado não entra');
  ok(!(await page.$('#view')), 'continua fora do app');
  await page.click('[data-cancelar-2fa]'); await page.waitForSelector('.lg-form #lg-senha');
  ok(true, 'voltar ao login');
  await entrar('gabriel@agencia.demo'); await page.waitForSelector('#lg-cod');
  await page.fill('#lg-cod', '123456'); await page.waitForSelector('#view', { timeout: 4000 });
  ok(await page.isVisible('#view'), 'código certo entra');

  step('remover');
  await t.ir('#/conta'); await page.waitForSelector('[data-remover]');
  await page.click('[data-remover]'); await page.waitForSelector('.ov-modal [data-ok]'); await page.click('.ov-modal [data-ok]'); await page.waitForTimeout(300);
  ok((await page.textContent('.m-conta')).includes('Desativada'), 'removida');
  await t.sair();
  await entrar('gabriel@agencia.demo'); await page.waitForSelector('#view', { timeout: 4000 });
  ok(!(await page.$('#lg-cod')), 'sem 2FA o login volta a pedir só a senha');

  step('gestor: sem faixa, mas pode ativar');
  await t.login('ana@agencia.demo');
  await page.waitForTimeout(200);
  ok(!(await page.isVisible('#mfa-ban')), 'gestor não vê a faixa');
  await t.ir('#/conta');
  ok(await page.isVisible('[data-iniciar]') && !(await page.textContent('#view')).includes('Fortemente recomendado'), 'gestor pode ativar, sem a recomendação forte');

  step('lembrar depois (sessão)');
  await t.login('rayane@agencia.demo');
  await page.waitForSelector('#mfa-ban:not([hidden])', { timeout: 3000 }).catch(() => null);
  ok(await page.isVisible('#mfa-ban'), 'admin vê a faixa');
  await page.click('[data-mfa-depois]'); await page.waitForTimeout(100);
  ok(!(await page.isVisible('#mfa-ban')), '"Lembrar depois" esconde nesta sessão');
  await t.ir('#/conta'); await page.click('[data-tema-btn]'); await page.waitForTimeout(100); await page.click('[data-tema-btn]');
}
