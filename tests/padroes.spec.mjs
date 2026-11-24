// tests/padroes.spec.mjs — central "Padrões e regras": quem vê (Dono, Rayane/Admin, Allan/Head de tráfego), quem não vê,
// editar uma faixa e ver o efeito na Equipe (ocupação crítica 100 → 110 → 120), restaurar, histórico, soma 100 dos pesos,
// ordem entre limites, busca, regra de alerta (alertRules), motor de recomendações e Guardião (mesmas chaves de settings).
export default async function (t) {
  const { page, ok, step } = t;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const semToasts = () => ev(() => document.querySelectorAll('.toast').forEach(x => x.remove()));
  const pd = id => ev(i => window.AOS.padroes.padrao(i), id);
  const sel = id => `[data-pd="${id}"]`;
  const menu = () => page.$('li.nv-i[data-mod="padroes"]');
  const digitar = async (id, v) => { await page.fill(sel(id), String(v)); await t.espera(120); };
  const salvar = async () => {
    await semToasts();
    await page.click('[data-pd-salvar]'); await page.waitForSelector('.ov-modal:not(.saindo) .mbox');
    const resumo = await page.textContent('.ov-modal:not(.saindo) .mbox');
    await page.click('.ov-modal:not(.saindo) [data-ok]'); await t.espera(320);
    return resumo;
  };

  step('login rápido do Head de tráfego');
  await page.goto(t.base + 'index.html'); await ev(() => { try { localStorage.clear(); } catch (e) { /* ok */ } }); await page.goto(t.base + 'index.html');
  await page.waitForSelector('.lg-form');
  ok(await page.$('[data-quick="allan@agencia.demo"]'), 'botão "Entrar como Head de tráfego" na tela de login');

  step('dono: menu e página');
  await t.login();
  ok(await menu(), 'item "Padrões e regras" no menu do dono');
  await t.ir('#/padroes');
  await page.waitForSelector('.m-padroes');
  ok((await page.$$('.m-padroes-ix')).length === 13, '12 seções + "Tudo em uma página" no índice');
  const txt = await page.textContent('.m-padroes');
  ok(txt.includes('Como a plataforma decide') && txt.includes('O que mudou recentemente'), 'explicação e "O que mudou recentemente"');
  ok(txt.includes('Peso: resultado vs meta') && txt.includes('Em risco abaixo de') && txt.includes('O que significa') && txt.includes('Como calculamos') && txt.includes('Onde aparece'), 'entradas de Clientes com significado, cálculo e onde aparece');
  ok(await page.isVisible(sel('clientes.health.risco')), 'campo editável para o limite de risco');
  const nCat = await ev(() => window.AOS.padroes.CATALOGO.filter(p => p.secao && ['clientes', 'equipe', 'operacao', 'financeiro', 'webinars', 'alertas', 'comercial', 'acesso'].includes(p.secao)).length);
  ok(nCat >= 100, `catálogo de gestão completo (${nCat} entradas)`);
  for (const s of ['equipe', 'operacao', 'financeiro', 'webinars', 'alertas', 'comercial', 'acesso', 'torre', 'orcamento', 'recomendacoes', 'invasao', 'tudo']) {
    await t.ir(`#/padroes/${s}`);
    ok(await page.isVisible('.m-padroes-main'), `seção ${s} renderiza`);
  }

  step('ocupação crítica 100 → 110: Ana (118%) continua crítica');
  await t.ir('#/padroes/equipe');
  await digitar('equipe.ocupacao.critico', 110);
  ok(await page.isVisible('[data-pd-barra]:not(.vazio)'), 'barra "alterações não salvas"');
  ok(await page.isVisible('[data-pd-item="equipe.ocupacao.critico"].sujo'), 'entrada marcada como não salva');
  const r1 = await salvar();
  ok(/100%\s*→\s*110%/.test(r1), `confirmação mostra de → para (${r1.replace(/\s+/g, ' ').slice(0, 120)})`);
  ok(await pd('equipe.ocupacao.critico') === 110, 'valor salvo (110)');
  ok((await page.textContent('[data-pd-item="equipe.ocupacao.critico"]')).includes('Alterado'), 'selo "Alterado"');
  await t.ir('#/equipe');
  let eq = await page.textContent('.m-equipe');
  ok(eq.includes('Pessoas acima de 110%'), 'Equipe usa o novo limite no KPI');
  ok(await ev(() => window.AOS.ui.faixa(118, 'ocupacao')) === 'err', 'Ana 118% ainda crítica');
  ok(eq.includes('Sobrecarga'), 'Ana continua em sobrecarga');

  step('ocupação crítica 120: Ana vira atenção');
  await t.ir('#/padroes/equipe');
  await digitar('equipe.ocupacao.critico', 120);
  await salvar();
  await t.ir('#/equipe');
  eq = await page.textContent('.m-equipe');
  ok(await ev(() => window.AOS.ui.faixa(118, 'ocupacao')) === 'warn', 'faixa de 118% = atenção');
  ok(eq.includes('Pessoas acima de 120%') && !eq.includes('Sobrecarga'), 'ninguém em sobrecarga na Equipe');
  await t.ir('#/equipe/t-ana');
  ok(!(await page.textContent('.m-equipe')).includes('Risco de burnout'), 'perfil da Ana sem aviso de burnout');

  step('histórico e restaurar padrão');
  await t.ir('#/padroes/equipe');
  const h = await ev(() => window.AOS.padroes.historico('equipe.ocupacao.critico'));
  ok(h.length === 2 && h[1].de === 110 && h[1].para === 120 && h[1].quem === 'u-gabriel', 'histórico com quem, de e para');
  ok((await page.textContent('[data-pd-item="equipe.ocupacao.critico"] .m-padroes-hist')).includes('Histórico (2)'), 'histórico visível na entrada');
  await semToasts();
  await page.click('[data-pd-restaurar="equipe.ocupacao.critico"]'); await page.waitForSelector('.ov-modal:not(.saindo) .mbox');
  await page.click('.ov-modal:not(.saindo) [data-ok]'); await t.espera(320);
  ok(await pd('equipe.ocupacao.critico') === 100, 'restaurado para 100');
  ok(!(await ev(() => window.AOS.padroes.alterado('equipe.ocupacao.critico'))), 'não está mais alterado');
  ok((await ev(() => window.AOS.padroes.historico('equipe.ocupacao.critico'))).length === 3, 'restaurar também entra no histórico');
  await t.ir('#/padroes');
  ok((await page.textContent('.m-padroes-rec')).includes('Crítico (sobrecarga) acima de'), '"O que mudou recentemente" lista a mudança');

  step('validação: limites fora de ordem e fora da faixa');
  await t.ir('#/padroes/equipe');
  await digitar('equipe.ocupacao.idealMin', 90);
  ok((await page.textContent('#pd-e-equipe\\.ocupacao\\.idealMin')).includes('menor que'), 'zona ideal: início precisa ser menor que o fim');
  await digitar('equipe.ocupacao.critico', 999);
  ok((await page.textContent('#pd-e-equipe\\.ocupacao\\.critico')).includes('Máximo'), 'máximo respeitado');
  await semToasts(); await page.click('[data-pd-salvar]'); await t.espera(200);
  ok(!(await page.$('.ov-modal:not(.saindo) .mbox')) && (await page.textContent('#toasts')).includes('Corrija'), 'não salva com erro');
  await page.click('[data-pd-descartar]'); await t.espera(250);
  ok(await page.isVisible('[data-pd-barra].vazio') || !(await page.isVisible('[data-pd-barra]')), 'descartar limpa o rascunho');

  step('pesos do health precisam somar 100%');
  await t.ir('#/padroes/clientes');
  ok((await page.textContent('[data-pd-soma]')).includes('100%'), 'total dos pesos = 100%');
  await digitar('clientes.health.peso.resultado', 40);
  ok(await page.isVisible('[data-pd-soma].err') && (await page.textContent('[data-pd-soma]')).includes('105%'), 'total 105% em vermelho');
  await semToasts(); await page.click('[data-pd-salvar]'); await t.espera(200);
  ok(!(await page.$('.ov-modal:not(.saindo) .mbox')) && (await page.textContent('#toasts')).includes('100%'), 'bloqueia salvar com soma ≠ 100');
  await digitar('clientes.health.peso.prazo', 20);
  ok(!(await page.$('[data-pd-soma].err')), 'resultado 40 + prazo 20 = 100%');
  await salvar();
  ok(await pd('clientes.health.peso.resultado') === 40 && await pd('clientes.health.peso.prazo') === 20, 'pesos salvos juntos');
  await semToasts();
  await page.click('[data-pd-restaurar="clientes.health.peso.resultado"]'); await page.waitForSelector('.ov-modal:not(.saindo) .mbox'); await page.click('.ov-modal:not(.saindo) [data-ok]'); await t.espera(300);
  await page.click('[data-pd-restaurar="clientes.health.peso.prazo"]'); await page.waitForSelector('.ov-modal:not(.saindo) .mbox'); await page.click('.ov-modal:not(.saindo) [data-ok]'); await t.espera(300);
  ok(await pd('clientes.health.peso.resultado') === 35 && await pd('clientes.health.peso.prazo') === 25, 'pesos de volta ao padrão');

  step('limite de risco do health muda a carteira; Desfazer');
  await digitar('clientes.health.risco', 50);
  await salvar();
  ok(await ev(() => window.AOS.ui.faixa(55, 'health')) === 'warn', 'health 55 deixa de ser risco');
  await t.ir('#/clientes?f=risco');
  ok((await page.$$('.m-clientes .tbl tbody tr')).length === 2, 'filtro Em risco: só Orion (41) e Bella (48)');
  await t.ir('#/padroes/clientes');
  await digitar('clientes.health.risco', 60); await salvar();
  await page.click('.toast [data-desfazer]'); await t.espera(300);
  ok(await pd('clientes.health.risco') === 50, 'Desfazer volta o valor anterior');
  await ev(() => window.AOS.padroes.restaurar(['clientes.health.risco'], 'u-gabriel'));
  ok(await pd('clientes.health.risco') === 60, 'restaurado (60)');

  step('regra de alerta (mesmo registro de Alertas › Regras)');
  await t.ir('#/padroes/alertas');
  await digitar('alertas.regra.rg-fatura.dias', 10); await salvar();
  ok(await ev(() => window.AOS.db.get('alertRules', 'rg-fatura').params.dias) === 10, 'alertRules.rg-fatura.params.dias = 10');
  ok(!(await ev(() => 'alertas.regra.rg-fatura.dias' in (window.AOS.db.config('padroes', {}) || {}))), 'não duplica em settings');
  await ev(() => window.AOS.padroes.restaurar(['alertas.regra.rg-fatura.dias'], 'u-gabriel'));
  ok(await ev(() => window.AOS.db.get('alertRules', 'rg-fatura').params.dias) === 7, 'restaurado (7)');

  step('motor de recomendações e Guardião');
  await t.ir('#/padroes/recomendacoes');
  ok((await page.$$('.m-padroes-motor li')).length >= 8, 'regras do motor listadas');
  await page.click('[data-pd-sw^="motor|"]'); await t.espera(250);
  await salvar();
  const mr = await ev(() => window.AOS.db.config('motorRegras', {}));
  ok(Object.values(mr).some(o => o.ativo === false), `settings motorRegras gravado (${JSON.stringify(mr)})`);
  await semToasts();
  await page.click('[data-pd-sw^="motor|"]'); await t.espera(250); await salvar();
  ok(Object.keys(await ev(() => window.AOS.db.config('motorRegras', {}))).length === 0, 'motor de volta ao padrão');
  await t.ir('#/padroes/invasao');
  ok((await page.$$('.m-padroes-motor li')).length >= 10, 'regras do Guardião listadas');
  const inp = await page.$('[data-pd-m^="guardiao|"]');
  await inp.fill('-5'); await page.keyboard.press('Tab'); await t.espera(300);
  ok(await page.$('.m-padroes-motor .m-padroes-er'), 'Guardião valida o valor (fora da faixa)');
  await page.click('[data-pd-descartar]'); await t.espera(250);

  step('busca');
  await t.ir('#/padroes');
  await page.fill('[data-pd-q]', 'burnout'); await t.espera(600);
  let res = await page.textContent('.m-padroes-main');
  ok(/padr(ão|ões) encontrados? para "burnout"/.test(res) && res.includes('Risco de burnout (atenção)'), 'busca por "burnout"');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-pd-q]')), 'foco continua na busca');
  await page.fill('[data-pd-q]', 'xyzsemresultado'); await t.espera(600);
  ok((await page.textContent('.m-padroes-main')).includes('Nada encontrado'), 'estado vazio da busca');
  await page.click('.m-padroes-main [data-pd-limpar]'); await t.espera(250);
  ok(!(await page.inputValue('[data-pd-q]')), 'limpar busca');

  if (t.vp.w === 1366) {
    step('screenshots');
    await t.ir('#/padroes'); await t.espera(200);
    await page.screenshot({ path: '/tmp/aos-p1/padroes-inicio.png', fullPage: false });
    await t.ir('#/padroes/equipe'); await t.espera(200);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '/tmp/aos-p1/padroes-equipe.png', fullPage: false });
    await page.fill('[data-pd="equipe.ocupacao.critico"]', '110'); await t.espera(150);
    await page.screenshot({ path: '/tmp/aos-p1/padroes-sujo.png', fullPage: true });
    await page.click('[data-pd-descartar]'); await t.espera(200);
    await page.evaluate(() => window.AOS.shell.setTema('escuro')); await t.ir('#/padroes/clientes'); await t.espera(200);
    await page.screenshot({ path: '/tmp/aos-p1/padroes-escuro.png', fullPage: false });
    await page.evaluate(() => window.AOS.shell.setTema('claro'));
    await t.ir('#/padroes/invasao'); await t.espera(200);
    await page.screenshot({ path: '/tmp/aos-p1/padroes-invasao.png', fullPage: false });
  }

  step('Rayane (Admin) vê e edita');
  await t.login('rayane@agencia.demo');
  ok(await menu(), 'menu da Rayane tem Padrões e regras');
  await t.ir('#/padroes/equipe');
  ok(await page.isVisible(sel('equipe.ocupacao.critico')), 'Rayane edita');
  ok(await ev(() => window.AOS.perms.can('campanha', 'editar') && window.AOS.perms.can('receita', 'ver')), 'regra do dono: Admin = Dono (Campanha e receita)');

  step('Allan (Head de tráfego) vê e edita');
  await t.login('allan@agencia.demo');
  ok(/#\/torre\/voo/.test(page.url()), `Allan começa no Painel de Voo (${page.url().split('#')[1]})`);
  ok(await menu(), 'menu do Allan tem Padrões e regras');
  await t.ir('#/padroes/equipe');
  ok(await page.isVisible(sel('equipe.ocupacao.critico')), 'Allan edita');
  ok(await ev(() => !window.AOS.perms.can('receita', 'ver') && !window.AOS.perms.can('campanha') && window.AOS.perms.escopoClientes() === 'todos'), 'Allan: sem receita/Campanha, vê todos os clientes');
  if (t.vp.w === 390) { await t.ir('#/padroes/clientes'); await t.espera(200); await page.screenshot({ path: '/tmp/aos-p1/padroes-390.png', fullPage: false }); }

  for (const email of ['ana@agencia.demo', 'diego@agencia.demo', 'felipe@agencia.demo']) {
    step(`${email}: não vê`);
    await t.login(email);
    ok(!(await menu()), 'sem item no menu');
    await t.ir('#/padroes');
    ok((await page.textContent('#view')).includes('Acesso restrito'), 'rota bloqueada');
  }
}
