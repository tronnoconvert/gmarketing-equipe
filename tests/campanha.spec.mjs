// tests/campanha.spec.mjs — conta própria (Windsor): visão, decisões com "SIM", campanhas (hierarquia), criativos, conexão, segurança e permissões.
export default async function (t) {
  const { page, ok, step } = t;
  const db = (fn, ...a) => page.evaluate(fn, ...a);
  const esperaModal = async () => { await page.waitForSelector('.ov-modal .mbox'); await page.waitForTimeout(80); };
  const semGerenciador = async () => page.evaluate(() => !document.querySelector('a[href*="facebook.com"], a[href*="adsmanager"], a[href*="business.facebook"]') && !/adsmanager|business\.facebook\.com/i.test(document.getElementById('view').innerHTML));

  step('visão geral');
  await t.login();
  await t.ir('#/campanha');
  await page.waitForSelector('.m-campanha .kpi');
  ok((await page.$$('.m-campanha .kpi')).length === 9, '9 KPIs');
  const txt = await page.textContent('#view');
  ok(txt.includes('Criar ou subir campanha: somente pelo Gerenciador, via 4G.'), 'nota do Gerenciador via 4G');
  ok(txt.includes('vs período anterior'), 'comparação com período anterior');
  ok((await page.$$('#view svg.chart')).length >= 5, 'gráficos diários, funil e quebras');
  ok(await semGerenciador(), 'nenhum link para o Gerenciador de Anúncios');
  const nRecs = await page.$$eval('.m-campanha-recs > .m-campanha-rec', l => l.length);
  ok(nRecs >= 2, `decisões recomendadas (${nRecs})`);
  ok(txt.includes('A conta passa a investir'), 'recomendação mostra o orçamento diário resultante');
  ok(txt.includes('Agora') && txt.includes('Esta semana'), 'prioridade em texto (Agora / Hoje / Esta semana)');
  ok(await page.$$eval('.m-campanha-rec', l => ['escalar-verba', 'reduzir-verba', 'pausar-anuncio', 'trocar-criativo', 'revisar-publico', 'aprendizado-limitado'].every(id => l.some(li => li.dataset.regra === id))), 'decisões vêm do motor único (6 regras disparam na demonstração)');
  const lerCnt = () => page.$eval('.nv [data-mod="campanha"] .cnt, .nv [data-mod="campanha"] .cnt-dot', e => Number(e.classList.contains('cnt') ? e.textContent.trim() : (e.getAttribute('aria-label').match(/\d+/) || [0])[0]));
  const cnt = await lerCnt();
  ok(cnt === nRecs, `contador do menu = decisões pendentes (${cnt})`);

  step('Por quê fica aberto');
  await page.click('.m-campanha-rec [data-porque] summary'); await page.waitForTimeout(80);
  const idPq = await page.$eval('.m-campanha-rec [data-porque]', d => d.dataset.porque);
  await page.click('.m-campanha-fil nav.chips a.chip:nth-child(2)'); await page.waitForTimeout(350);
  ok(page.url().includes('dias=7'), 'filtro 7 dias na URL');
  ok(await page.$eval(`[data-porque="${idPq}"]`, d => d.open).catch(() => false), '"Por quê" continua aberto após re-render');

  step('quebras');
  await page.click('.m-campanha-qs [data-seg="dispositivo"]'); await page.waitForTimeout(80);
  ok(await page.isVisible('[data-qb="dispositivo"]') && !(await page.isVisible('[data-qb="posicionamento"]')), 'troca de quebra');

  step('duas contas: CA01 / CA02 / As duas (somadas)');
  await t.ir('#/campanha?dias=30');
  const invest = () => page.$eval('.m-campanha .kpi .kpi-v', e => Number(e.textContent.replace(/[^\d,]/g, '').replace(',', '.'))).catch(() => NaN);
  ok(await page.$$eval('.m-campanha-contas nav.chips a.chip', l => l.map(a => a.textContent.trim()).join('|') === 'As duas (somadas)|CA01|CA02 · HOF'), 'seletor com as 3 opções');
  ok((await page.$eval('.m-campanha-contas a.chip[aria-current="true"]', e => e.textContent)).includes('As duas'), 'padrão = as duas somadas');
  ok((await page.textContent('#view')).includes('Por conta'), 'comparativo por conta na visão somada');
  const linhasPc = await page.$$eval('.m-campanha-pc tbody tr', l => l.map(tr => Number(tr.children[1].textContent.replace(/[^\d,]/g, '').replace(',', '.'))));
  const vSoma = await invest();
  ok(linhasPc.length === 2 && Math.abs(linhasPc[0] + linhasPc[1] - vSoma) <= 2, `investimento somado = CA01 + CA02 (${vSoma})`);
  await page.click('.m-campanha-contas a.chip:nth-child(2)'); await page.waitForTimeout(350);
  ok(page.url().includes('conta=ca01'), 'CA01 na URL');
  const v1 = await invest();
  ok(Math.abs(v1 - linhasPc[0]) <= 1 && !(await page.textContent('#view')).includes('Por conta'), `CA01 sozinha (${v1})`);
  await t.ir('#/campanha/campanhas?conta=ca02&dias=30');
  const nomes2 = await page.textContent('#view');
  ok(nomes2.includes('[VENDAS]') && !nomes2.includes('[LEAD] Webinar'), 'aba Campanhas filtra pela CA02');
  ok((await page.$eval('.m-campanha-contas a.chip[aria-current="true"]', e => e.textContent)).includes('CA02'), 'seleção mantida ao trocar de aba');
  ok(!/1906477940242386|848802707655510/.test(await page.content()), 'demonstração não mostra os IDs reais das contas');
  await t.ir('#/campanha');

  step('aplicar pausa exige SIM (simulado)');
  await t.ir('#/campanha');
  const r1 = await page.$('[data-aplicar^="pausar-anuncio:"]');
  ok(!!r1, 'recomendação de pausar anúncio saturado');
  if (r1) {
    const ad = (await r1.getAttribute('data-aplicar')).slice('pausar-anuncio:'.length);
    await r1.click(); await esperaModal();
    ok((await page.textContent('.mbox')).includes('Digite SIM'), 'pede SIM');
    ok(!(await page.$('.mbox input[type="checkbox"]')), 'sem "não perguntar de novo"');
    await page.fill('.mbox [data-sim]', 'sim'); await page.click('.mbox [data-ok]'); await page.waitForTimeout(120);
    ok(await page.isVisible('.mbox .mb-err:not([hidden])'), '"sim" minúsculo não confirma');
    ok(await db(id => window.AOS.db.get('campaigns', id).status, ad) === 'ativo', 'nada mudou sem SIM');
    await page.fill('.mbox [data-sim]', 'SIM'); await page.click('.mbox [data-ok]'); await page.waitForTimeout(350);
    const e = await db(id => window.AOS.db.get('campaigns', id), ad);
    ok(e.status === 'pausado' && e.simulado === true, 'anúncio pausado (simulado)');
    ok((await page.textContent('#toasts')).includes('simulado'), 'toast avisa que é simulação');
    ok(await db(() => window.AOS.db.count('activity', a => a.col === 'campaigns' && /pausou/.test(a.oque))) >= 1, 'atividade registrada');
    ok(await db(id => window.AOS.db.count('recsLog', e => e.recId === 'pausar-anuncio:' + id && e.decisao === 'aceita' && e.antes && e.avaliarEm), ad) === 1, 'decisão aceita no registro de aprendizado (recsLog)');
    await page.waitForTimeout(250);
    ok(await lerCnt() === cnt - 1, 'contador diminui');
  }

  step('aplicar escala de orçamento');
  const r2 = await page.$('[data-aplicar^="escalar-verba:"]');
  ok(!!r2, 'recomendação de escalar verba');
  if (r2) {
    const sid = (await r2.getAttribute('data-aplicar')).slice('escalar-verba:'.length);
    const antes = await db(id => window.AOS.db.get('campaigns', id).orcamentoDia, sid);
    await r2.click(); await esperaModal();
    ok((await page.textContent('.mbox')).includes('A conta passa a investir'), 'confirmação mostra orçamento total');
    await page.fill('.mbox [data-sim]', 'SIM'); await page.click('.mbox [data-ok]'); await page.waitForTimeout(300);
    ok(await db(id => window.AOS.db.get('campaigns', id).orcamentoDia, sid) === Math.round(antes * 1.15), 'orçamento +15%');
  }

  step('ignorar e reabrir');
  const ig = await page.$('[data-ignorar]');
  if (ig) {
    const rid = await ig.getAttribute('data-ignorar');
    await ig.click(); await esperaModal(); await page.fill('.mbox [name="motivo"]', 'teste'); await page.click('.mbox [data-ok]'); await page.waitForTimeout(300);
    ok(await db(id => window.AOS.db.get('campaignAccount', 'demo').decisoes[id].estado, rid) === 'ignorada', 'decisão ignorada registrada');
    ok(await db(id => window.AOS.db.count('recsLog', e => e.recId === id && e.decisao === 'recusada'), rid) === 1, 'recusa no registro de aprendizado');
    await page.click('.m-campanha-hist summary'); await page.waitForTimeout(80);
    await page.click(`.m-campanha-hist [data-reabrir="${rid}"]`); await page.waitForTimeout(300);
    ok(await db(id => !window.AOS.db.get('campaignAccount', 'demo').decisoes[id] && window.AOS.db.count('recsLog', e => e.recId === id) === 0, rid), 'reabrir desfaz a decisão e o registro');
  }

  step('adiar');
  const adi = await page.$('[data-adiar]');
  ok(!!adi, 'botão Adiar');
  if (adi) {
    const rid = await adi.getAttribute('data-adiar');
    await adi.click(); await page.waitForTimeout(300);
    const d = await db(id => window.AOS.db.get('campaignAccount', 'demo').decisoes[id], rid);
    ok(d && d.estado === 'adiada' && d.ate > new Date().toISOString().slice(0, 10), 'adiada por 3 dias');
    ok(await db(id => window.AOS.db.count('recsLog', e => e.recId === id && e.decisao === 'adiada'), rid) === 1, 'adiamento no registro de aprendizado');
    ok(!(await page.$(`.m-campanha-rec:not(.feita)[data-rec="${rid}"]`)), 'sai da lista de pendentes');
  }

  step('regras da IA');
  await page.click('.m-campanha-rec [data-porque] summary'); await page.waitForTimeout(80);
  await page.click('.m-campanha-rec [data-porque] a[href*="campanha/regras"]'); await page.waitForTimeout(400);
  ok(page.url().includes('#/campanha/regras') && page.url().includes('regra='), '"ajustar a regra" abre a aba Regras da IA');
  await t.ir('#/campanha/regras');
  ok((await page.$$('.m-campanha-rg')).length === 10, '10 regras na tabela');
  ok(await page.$$eval('.m-campanha-rg', l => l.every(li => li.querySelector('[role="switch"]') && li.querySelector('.m-campanha-rgd').textContent.length > 40 && li.querySelector('.m-campanha-rgx'))), 'cada regra: ativo, descrição e estatísticas');
  const tr = await page.textContent('#view');
  ok(tr.includes('Sugestões em 30 dias') && tr.includes('Aceitas') && tr.includes('Deram certo') && tr.includes('%'), 'estatísticas por regra (sugestões, aceitas %, deram certo %)');
  await page.fill('[data-pm="escalar-verba.aumento"]', '25'); await page.waitForTimeout(80);
  ok(await page.isVisible('[data-rg="escalar-verba"] .fld-err'), 'valida aumento acima do limite por mudança');
  await page.click('[data-rg-salvar]'); await page.waitForTimeout(200);
  ok(!(await db(() => window.AOS.db.config('motorRegras', {})['escalar-verba'])), 'nada salvo com erro');
  await page.fill('[data-pm="escalar-verba.aumento"]', '10'); await page.waitForTimeout(80);
  ok(!(await page.isVisible('[data-rg="escalar-verba"] .fld-err')), 'erro some com valor válido');
  await page.click('[data-rg-salvar]'); await page.waitForTimeout(400);
  ok(await db(() => (window.AOS.db.config('motorRegras', {})['escalar-verba'] || { params: {} }).params.aumento) === 10, 'limite salvo em settings motorRegras');
  ok((await page.textContent('[data-rg="escalar-verba"]')).includes('ajustada'), 'regra marcada como ajustada');
  await page.click('[data-rg-ativo="revisar-publico"]'); await page.waitForTimeout(400);
  ok(await db(() => (window.AOS.db.config('motorRegras', {})['revisar-publico'] || {}).ativo) === false, 'desligar regra grava na hora');
  ok(await page.getAttribute('[data-rg-ativo="revisar-publico"]', 'aria-checked') === 'false', 'interruptor desligado');
  await t.ir('#/campanha');
  ok(!(await page.$('.m-campanha-recs > [data-regra="revisar-publico"]')), 'regra desligada não gera recomendação');
  await t.ir('#/campanha/regras');
  await page.click('[data-rg-padrao]'); await esperaModal(); await page.click('.mbox [data-ok]'); await page.waitForTimeout(400);
  ok(await db(() => Object.keys(window.AOS.db.config('motorRegras', {})).length) === 0, 'restaurar padrão');
  ok(await page.getAttribute('[data-rg-ativo="revisar-publico"]', 'aria-checked') === 'true', 'regra religada');

  step('campanhas: hierarquia, ordenação, ações');
  await t.ir('#/campanha/campanhas');
  await page.waitForSelector('.m-campanha-tb');
  ok(await page.$$eval('tr.m-campanha-n.conjunto', l => l.every(r => r.offsetParent === null)), 'conjuntos recolhidos');
  await page.click('tr.m-campanha-n.campanha [data-exp]'); await page.waitForTimeout(80);
  ok(await page.$$eval('tr.m-campanha-n.conjunto', l => l.some(r => r.offsetParent !== null)), 'expandiu conjuntos');
  await page.click('[data-exp-tudo="1"]'); await page.waitForTimeout(80);
  ok(await page.$$eval('tr.m-campanha-n.anuncio', l => l.every(r => r.offsetParent !== null)), 'expandir tudo mostra anúncios');
  await page.click('.m-campanha-tb th a.th-b[href*="ordem=cpr"]'); await page.waitForTimeout(300);
  ok(page.url().includes('ordem=cpr'), 'ordenação na URL');
  ok(await page.$$eval('tr.m-campanha-n.anuncio', l => l.some(r => r.offsetParent !== null)), 'linhas continuam abertas após ordenar');
  await page.click('tr.m-campanha-n.conjunto [data-orc]'); await esperaModal();
  await page.fill('.mbox [name="v"]', '300'); await page.click('.mbox [data-ok]'); await page.waitForTimeout(150);
  ok((await page.textContent('.mbox .fld-err')).includes('mínimo'), 'valida orçamento mínimo');
  await page.fill('.mbox [name="v"]', '25000'); await page.click('.mbox [data-ok]'); await page.waitForTimeout(250);
  await esperaModal();
  ok((await page.textContent('.mbox')).includes('Digite SIM'), 'segunda etapa pede SIM');
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(await semGerenciador(), 'sem link para o Gerenciador (campanhas)');

  step('criativos e prévia');
  await t.ir('#/campanha/criativos');
  await page.waitForSelector('.m-campanha-cc');
  ok((await page.$$('.m-campanha-cc')).length >= 10, 'grade de criativos');
  ok((await page.$$('.m-campanha-cc .led')).length >= 10, 'LED de fadiga');
  await t.ir('#/campanha/criativos?rank=hook');
  ok(await page.$$eval('.m-campanha-fmt', l => l.every(e => e.textContent === 'Vídeo')), 'ranking por hook rate só com vídeos');
  await page.click('.m-campanha-cc'); await esperaModal();
  ok(await page.isVisible('.mbox .m-campanha-post svg'), 'prévia do anúncio');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);

  step('conexão');
  await t.ir('#/campanha/conexao');
  const tc = await page.textContent('#view');
  ok(tc.includes('WINDSOR_API_KEY') && tc.includes('/functions/v1/windsor-proxy') && tc.includes('action_values_purchase') && tc.includes('frequency'), 'explica chave no servidor e lista de campos');
  await page.fill('.m-campanha-cx [name="accountId"]', '123456'); await page.click('[data-conectar]'); await page.waitForTimeout(100);
  ok(await page.isVisible('.m-campanha-cx .fld-err'), 'valida formato act_');
  await page.fill('.m-campanha-cx [name="accountId"]', 'act_9876543210'); await page.click('[data-conectar]'); await page.waitForTimeout(300);
  ok(await db(() => window.AOS.db.get('campaignAccount', 'demo').accountId) === 'act_9876543210', 'account_id salvo');
  await page.click('[data-testar]'); await page.waitForTimeout(1100);
  ok((await page.textContent('#toasts')).includes('simulado'), 'teste de conexão simulado');
  ok(await semGerenciador(), 'sem link para o Gerenciador (conexão)');

  step('busca global por campanha');
  if (!t.mobile) {
    await page.click('#gs-in'); await page.keyboard.type('diagnostico'); await page.waitForSelector('.gs-pop [data-gs-i]');
    ok((await page.textContent('.gs-pop')).includes('[MSG] Diagnóstico gratuito'), 'busca encontra campanha');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  }

  // regra permanente do dono: "visível para mim" = Dono + Admin (Rayane). O que o admin pode fazer segue a matriz de permissões.
  step('admin (sócia): botões seguem a matriz de permissões');
  await t.sair();
  await page.fill('#lg-email', 'rayane@agencia.demo'); await page.fill('#lg-senha', 'demo123'); await page.click('.lg-go');
  await page.waitForSelector('#view'); await page.waitForTimeout(150);
  const admEdita = await page.evaluate(() => window.AOS.perms.can('campanha', 'editar'));
  const rotAdm = admEdita ? 'admin (acesso total) pode' : 'admin só vê, não';
  await t.ir('#/campanha');
  ok(await page.isVisible('.m-campanha .kpi'), 'admin vê a visão');
  ok(await page.$$eval('[data-aplicar]', (l, ed) => l.length > 0 && l.every(b => b.disabled === !ed), admEdita), `${rotAdm} aplicar decisões`);
  await t.ir('#/campanha/campanhas');
  ok(await page.$$eval('[data-status]', (l, ed) => l.every(b => b.disabled === !ed), admEdita), `${rotAdm} pausar`);
  await t.ir('#/campanha/regras');
  ok(await page.$$eval('[data-pm], [data-rg-ativo]', (l, ed) => l.length > 10 && l.every(b => b.disabled === !ed), admEdita), `${rotAdm} alterar as regras`);

  step('gestor de tráfego não acessa');
  await t.sair();
  await page.fill('#lg-email', 'ana@agencia.demo'); await page.fill('#lg-senha', 'demo123'); await page.click('.lg-go'); await page.waitForSelector('#view');
  await t.ir('#/campanha');
  ok((await page.textContent('#view')).includes('Você não tem acesso'), 'acesso restrito');

  step('tema escuro');
  await t.sair();
  await page.fill('#lg-email', 'gabriel@agencia.demo'); await page.fill('#lg-senha', 'demo123'); await page.click('.lg-go'); await page.waitForSelector('#view');
  await t.ir('#/campanha'); await page.click('[data-tema-btn]'); await page.waitForTimeout(150);
  await t.ir('#/campanha/campanhas'); await t.ir('#/campanha/criativos'); await t.ir('#/campanha/regras'); await t.ir('#/campanha/conexao');
  await page.click('[data-tema-btn]');
}
