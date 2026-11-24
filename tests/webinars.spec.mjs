// tests/webinars.spec.mjs — painel, detalhe, preencher/novo (etapas, máscaras, cálculos, alertas, rascunho), checklist, pedir preenchimento, permissões.
export default async function (t) {
  const { page, ok, step } = t;
  const db = (fn, ...a) => page.evaluate(fn, ...a);
  const esperaModal = async () => { await page.waitForSelector('.ov-modal .mbox'); await page.waitForTimeout(80); };

  step('painel');
  await t.login();
  await t.ir('#/webinars');
  await page.waitForSelector('.m-webinars .kpi');
  ok((await page.$$('.m-webinars .kpi')).length === 8, 'painel com 8 KPIs');
  ok(await page.isVisible('.m-webinars .tbl[aria-label="Comparativo entre webinars"]'), 'tabela comparativa');
  ok((await page.$$('.m-webinars .tbl[aria-label="Comparativo entre webinars"] tbody tr')).length === 6, '6 webinars realizados na comparação');
  ok((await page.$$('.m-webinars svg.chart')).length >= 3, 'gráficos (tendência e funil)');
  ok((await page.textContent('.m-webinars')).includes('Melhores e piores'), 'melhores e piores');
  ok((await page.textContent('.m-webinars')).includes('Dados faltando perto da data'), 'aviso de pendências');
  // o core mostra pendência "warn" como ponto (sem número): confere o rótulo do indicador do menu
  const ind = await page.$eval('.nv [data-mod="webinars"]', li => { const c = li.querySelector('.cnt, .cnt-dot'); return c ? (c.getAttribute('title') || c.textContent || '') : ''; });
  ok(/2 webinars com dados faltando/.test(ind) || ind.trim() === '2', 'indicador do menu = 2 webinars com dados faltando');

  step('período 12 meses');
  const per = t.vp.w <= 760 ? '#tb-per-m' : '#tb-per';
  await page.click(`${per} [data-periodo="12m"]`); await page.waitForTimeout(250);
  ok((await page.textContent('.m-webinars .kpi .kpi-v')).trim() === '6', 'KPI de realizados no período de 12 meses = 6');
  await page.click(`${per} [data-periodo="mes"]`); await page.waitForTimeout(200);

  step('busca global por tema');
  if (!t.mobile) {
    await page.click('#gs-in'); await page.keyboard.type('trafego que'); await page.waitForSelector('.gs-pop [data-gs-i]');
    ok((await page.textContent('.gs-pop')).includes('Tráfego que Vende 2.0'), 'busca encontra webinar pelo tema');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  }

  step('detalhe');
  await t.ir('#/webinars/wb-06');
  await page.waitForSelector('.m-webinars-ckl');
  const txt = await page.textContent('#view');
  ok(txt.includes('Método Agência Lucrativa 2.0') && txt.includes('Retenção ao vivo') && txt.includes('Vendas por dia de carrinho') && txt.includes('Origem dos inscritos'), 'seções do detalhe');
  ok((await page.$$('#view svg.chart')).length >= 5, 'gráficos do detalhe');
  ok(await page.isVisible('.cmt'), 'comentários');

  step('checklist registra atividade');
  const antesAct = await db(() => window.AOS.db.count('activity', a => a.col === 'webinars'));
  await page.click('.m-webinars-ck:not(.feito) input[data-ck]'); await page.waitForTimeout(350);
  ok(await db(() => window.AOS.db.get('webinars', 'wb-06').checklist.every(c => c.feito)), 'item marcado no db');
  ok(await db(n => window.AOS.db.count('activity', a => a.col === 'webinars') > n, antesAct), 'activity registrada');
  ok(await page.isVisible('.toast [data-desfazer]'), 'toast com Desfazer');

  step('pedir preenchimento notifica responsáveis');
  await page.click('.ph [data-pedir]'); await esperaModal();
  ok((await page.textContent('.mbox')).includes('Elisa Rocha'), 'Elisa (pós) aparece no pedido');
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(250);
  ok(await db(() => window.AOS.db.count('notifications', n => n.para === 'u-elisa' && n.refId === 'wb-06' && n.tipo === 'atribuicao')) === 1, 'Elisa notificada');
  ok(await db(() => window.AOS.db.count('notifications', n => n.para === 'u-diego' && n.refId === 'wb-06')) === 1, 'Diego notificado (vendas do replay)');

  step('adicionar item ao checklist');
  await page.click('[data-ck-add]'); await esperaModal();
  await page.fill('.mbox [name="item"]', 'Teste de som com convidado');
  await page.selectOption('.mbox [name="resp"]', 't-felipe');
  await page.fill('.mbox [name="prazo"]', '01122026');
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(250);
  ok(await db(() => window.AOS.db.get('webinars', 'wb-06').checklist.some(c => c.item === 'Teste de som com convidado' && c.prazo === '2026-12-01')), 'item salvo com prazo');
  ok(await db(() => window.AOS.db.count('notifications', n => n.para === 'u-felipe' && n.titulo.includes('Teste de som'))) === 1, 'responsável notificado');

  step('novo webinar: etapas, máscaras, cálculo ao vivo, alertas, rascunho');
  await t.ir('#/webinars/novo');
  await page.waitForSelector('[data-wf]');
  const nWb0 = await db(() => window.AOS.db.count('webinars'));
  ok((await page.getAttribute('[data-ir="aovivo"]', 'class')).includes('is-novo') && (await page.textContent('[data-ir="aovivo"]')).includes('Não visitada'), 'etapa não visitada marcada no stepper');
  step('novo webinar: pular etapas sem preencher');
  await page.click('[data-ir="vendas"]'); await page.waitForTimeout(120);
  ok(await page.isVisible('[data-etapa="vendas"]') && !(await page.isVisible('[data-etapa="planejamento"]')), 'pulou direto da etapa 1 para a 4 com tudo vazio');
  ok(page.url().includes('etapa=vendas'), 'etapa na URL');
  const sPlan = await page.textContent('[data-ir="planejamento"]');
  ok((await page.getAttribute('[data-ir="planejamento"]', 'class')).includes('is-warn') && /\d+ pendentes/.test(sPlan), 'planejamento: ponto âmbar + "N pendentes"');
  ok((await page.$$('[data-etapa="planejamento"] .m-webinars-hint')).length >= 2, 'dicas (não bloqueantes) em tema e data');
  await page.click('[data-passo="1"]'); await page.waitForTimeout(120);
  ok(await page.isVisible('[data-etapa="pos"]'), 'Continuar avança mesmo com a etapa vazia');
  await page.click('[data-passo="-1"]'); await page.waitForTimeout(80);
  await page.click('[data-ir="captacao"]'); await page.waitForTimeout(80);
  ok(await page.isVisible('[data-etapa="captacao"]'), 'voltar para trás pelo stepper');
  await page.click('[data-ir="pos"]'); await page.waitForTimeout(80);
  step('novo webinar: criar bloqueado com resumo do que falta');
  await page.click('[data-salvar="concluir"]'); await page.waitForTimeout(200);
  ok(await page.isVisible('.m-webinars-pend'), 'resumo de pendências aparece');
  const resumoTxt = await page.textContent('.m-webinars-pend');
  ok(resumoTxt.includes('Nome / tema') && resumoTxt.includes('Data da live') && resumoTxt.includes('1. Planejamento'), 'resumo lista tema e data com a etapa');
  ok(await db(n => window.AOS.db.count('webinars') === n, nWb0), 'nada foi criado');
  await page.click('.m-webinars-pend [data-pend="1"]'); await page.waitForTimeout(150);
  ok(await page.isVisible('[data-etapa="planejamento"]') && await page.evaluate(() => document.activeElement && document.activeElement.name === 'data'), 'link do resumo abre a etapa e foca o campo');
  await page.fill('[name="tema"]', 'Webinar de Teste Automatizado');
  await page.fill('[name="data"]', '15012027');
  ok((await page.inputValue('[name="data"]')) === '15/01/2027', 'máscara de data');
  await page.fill('[name="hora"]', '1930');
  ok((await page.inputValue('[name="hora"]')) === '19:30', 'máscara de hora');
  await page.fill('[name="ticket"]', '99700');
  ok((await page.inputValue('[name="ticket"]')) === 'R$ 997,00', 'máscara de R$');
  await page.fill('[name="metaInscritos"]', '2500');
  ok((await page.inputValue('[name="metaInscritos"]')) === '2.500', 'máscara de número');
  await page.waitForTimeout(80);
  ok((await page.textContent('[data-pend-box]')).includes('Tudo certo para concluir'), 'resumo atualiza ao preencher');
  await page.click('[data-passo="1"]'); await page.waitForTimeout(150);
  ok(await page.isVisible('[data-etapa="captacao"]'), 'avançou para Captação');
  step('novo webinar: captação');
  await page.click('[data-add="cap"]'); await page.waitForTimeout(100);
  await page.fill('[data-r="cap"][data-i="0"][data-k="investimento"]', '100000');
  await page.fill('[data-r="cap"][data-i="0"][data-k="impressoes"]', '50000');
  await page.fill('[data-r="cap"][data-i="0"][data-k="cliques"]', '800');
  await page.fill('[data-r="cap"][data-i="0"][data-k="inscritos"]', '200');
  await page.waitForTimeout(80);
  ok((await page.textContent('[data-calc]')).includes('R$ 5,00'), 'CPL calculado ao vivo (R$ 1.000 ÷ 200)');
  await page.click('[data-ir="aovivo"]'); await page.waitForTimeout(100);
  await page.fill('[name="aovivo.presentes"]', '300');
  await page.waitForTimeout(80);
  ok((await page.textContent('[data-calc]')).includes('maior que inscritos'), 'alerta presentes > inscritos');
  await page.fill('[data-colar]', '0;100\n5;180\nlixo\n10;150');
  await page.click('[data-importar]'); await page.waitForTimeout(100);
  ok((await page.$$('[data-rows="curva"] .m-webinars-rw:not(.hd)')).length === 3, 'curva importada (3 pontos, 1 ignorada)');
  await page.waitForTimeout(900);
  ok(await db(() => !!localStorage.getItem('aos-wb-rasc:novo')), 'rascunho salvo automaticamente');
  step('novo webinar: rascunho restaurado');
  await page.reload(); await page.waitForSelector('[data-wf]');
  ok((await page.textContent('#view')).includes('Rascunho restaurado'), 'rascunho restaurado após recarregar');
  ok((await page.inputValue('[name="tema"]')) === 'Webinar de Teste Automatizado', 'dados do rascunho de volta');
  step('novo webinar: salvar e concluir');
  await page.click('[data-ir="pos"]'); await page.waitForTimeout(100);
  await page.click('[data-salvar="concluir"]'); await esperaModal();
  ok((await page.textContent('.mbox')).includes('Salvar mesmo assim') || (await page.textContent('.mbox')).includes('inconsist'), 'confirma antes de salvar com inconsistências');
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(450);
  const novo = await db(() => window.AOS.db.find('webinars', w => w.tema === 'Webinar de Teste Automatizado'));
  ok(novo && novo.data === '2027-01-15' && novo.hora === '19:30' && novo.ticket === 997 && novo.metaInscritos === 2500, 'webinar salvo com valores convertidos');
  ok(novo && await db(id => window.AOS.db.count('webinarDaily', d => d.webinarId === id && d.tipo === 'captacao' && d.investimento === 1000), novo.id) === 1, 'captação diária salva');
  ok(novo && await db(id => window.AOS.db.count('notifications', n => n.para === 'u-ana' && n.refId === id && n.tipo === 'atribuicao'), novo.id) === 1, 'equipe escalada notificada');
  ok(novo && page.url().includes(`#/webinars/${novo.id}`), 'foi para o detalhe');
  ok(await db(() => !localStorage.getItem('aos-wb-rasc:novo')), 'rascunho limpo ao salvar');

  step('preencher existente: salvar rascunho no db');
  await t.ir('#/webinars/wb-07/preencher?etapa=captacao');
  await page.waitForSelector('[data-etapa="captacao"]:not([hidden])');
  const nAntes = await page.$$eval('[data-rows="cap"] .m-webinars-rw:not(.hd):not(.tot)', l => l.length);
  await page.click('[data-add="cap"]'); await page.waitForTimeout(80);
  ok((await page.inputValue(`[data-r="cap"][data-i="${nAntes}"][data-k="data"]`)) === '23/11/2026', 'novo dia sugere a data seguinte');
  await page.fill(`[data-r="cap"][data-i="${nAntes}"][data-k="investimento"]`, '58000');
  await page.fill(`[data-r="cap"][data-i="${nAntes}"][data-k="inscritos"]`, '95');
  await page.click('[data-salvar="rascunho"]'); await page.waitForTimeout(450);
  ok(await db(() => window.AOS.db.count('webinarDaily', d => d.webinarId === 'wb-07' && d.data === '2026-11-23' && d.inscritos === 95)) === 1, 'dia salvo no db');

  step('lançar dia (rápido): painel e validação');
  const hoje = await page.evaluate(() => window.AOS.fmt.iso(new Date()));
  const hojeBr = hoje.split('-').reverse().join('/');
  const amanhaBr = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1); return window.AOS.fmt.iso(d).split('-').reverse().join(''); });
  await t.ir('#/webinars'); await page.waitForSelector('.m-webinars .kpi');
  ok(await page.isVisible('.m-webinars-pil [data-lancar="wb-07"]'), 'botão Lançar dia no webinar em captação (Próximos)');
  ok(!!(await page.$('.ph [data-lancar], .ph [data-lancar-menu]')), 'Lançar dia no topo do painel');
  await page.click('.m-webinars-pil [data-lancar="wb-07"]'); await esperaModal();
  ok((await page.textContent('.mbox h2')).includes('Lançar dia de captação'), 'modal de captação');
  ok((await page.inputValue('.mbox [name="data"]')) === hojeBr, 'dia padrão = hoje');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.name === 'investimento'), 'foco no investimento');
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(150);
  ok((await page.textContent('.mbox')).includes('Preencha pelo menos um número'), 'valida dia vazio');
  await page.fill('.mbox [name="data"]', amanhaBr); await page.waitForTimeout(80);
  ok((await page.textContent('[data-q-st]')).includes('futuro'), 'avisa dia no futuro');
  await page.fill('.mbox [name="investimento"]', '62000');
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(150);
  ok((await page.textContent('.mbox')).includes('não pode ser no futuro'), 'bloqueia dia no futuro');
  await page.fill('.mbox [name="data"]', hoje.split('-').reverse().join(''));
  await page.fill('.mbox [name="impressoes"]', '45000'); await page.fill('.mbox [name="cliques"]', '50000');
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(150);
  ok((await page.textContent('.mbox')).includes('maiores que impressões'), 'valida cliques > impressões');
  await page.fill('.mbox [name="cliques"]', '700'); await page.fill('.mbox [name="grupo"]', '60');
  await page.fill('.mbox [name="inscritos"]', '100'); await page.waitForTimeout(80);
  ok((await page.inputValue('.mbox [name="impressoes"]')) === '45.000', 'máscara de milhar');
  const prev = await page.textContent('[data-q-prev]');
  ok(prev.includes('R$ 6,20') && prev.includes('1,56%') && /23\/nov/.test(prev), 'prévia de CPL e CTR vs dia anterior');

  step('lançar dia (rápido): Enter salva');
  const nAct = await db(() => window.AOS.db.count('activity', a => /lançou a captação/.test(a.oque || '')));
  await page.focus('.mbox [name="inscritos"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(350);
  ok(!(await page.$('.ov-modal')), 'Enter salvou e fechou');
  const linhaHoje = await db(h => window.AOS.db.list('webinarDaily', d => d.webinarId === 'wb-07' && d.data === h), hoje);
  ok(linhaHoje.length === 1 && linhaHoje[0].investimento === 620 && linhaHoje[0].inscritos === 100 && linhaHoje[0].grupo === 60 && linhaHoje[0].tipo === 'captacao', 'linha diária gravada');
  ok(await db(n => window.AOS.db.count('activity', a => /lançou a captação/.test(a.oque || '')) === n + 1, nAct), 'atividade registrada');
  ok((await page.textContent('#toasts')).includes('100 inscritos') && !!(await page.$('#toasts .toast:last-child [data-desfazer]')), 'toast com resumo e Desfazer');
  await t.ir('#/webinars/wb-07'); await page.waitForSelector('.m-webinars-ckl');
  ok(!(await page.textContent('#view')).includes('sem lançamento há'), 'aviso de captação atrasada some');
  ok((await page.textContent('.kpi')).includes(await db(() => window.AOS.fmt.num(window.AOS.db.list('webinarDaily', d => d.webinarId === 'wb-07' && d.tipo === 'captacao').reduce((a, d) => a + d.inscritos, 0)))), 'KPI de inscritos = soma das linhas');

  step('lançar dia (rápido): dia existente vira edição, origem e Desfazer');
  const orgAntes = await db(() => ({ ...window.AOS.db.get('webinars', 'wb-07').captacao.origem }));
  await page.click('.ph [data-lancar="wb-07"]'); await esperaModal();
  await page.fill('.mbox [name="data"]', '23112026'); await page.waitForTimeout(120);
  ok((await page.textContent('[data-q-st]')).includes('já foi lançado'), 'avisa que o dia já existe');
  ok((await page.inputValue('.mbox [name="inscritos"]')) === '95', 'carrega os números do dia para editar');
  ok((await page.textContent('.mbox [data-ok]')).includes('Salvar alterações'), 'botão vira Salvar alterações');
  await page.fill('.mbox [name="inscritos"]', '120');
  await page.click('.mbox details.m-webinars-qo summary');
  await page.fill('.mbox [name="origem.meta"]', '50');
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(150);
  ok((await page.textContent('.mbox')).includes('precisa bater'), 'valida soma por origem');
  await page.fill('.mbox [name="origem.meta"]', '100'); await page.fill('.mbox [name="origem.google"]', '20');
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(350);
  const d23 = await db(() => window.AOS.db.list('webinarDaily', d => d.webinarId === 'wb-07' && d.data === '2026-11-23'));
  ok(d23.length === 1 && d23[0].inscritos === 120 && d23[0].origem && d23[0].origem.meta === 100, 'dia editado sem duplicar');
  const orgDepois = await db(() => window.AOS.db.get('webinars', 'wb-07').captacao.origem);
  ok(orgDepois.meta === orgAntes.meta + 100 && orgDepois.google === orgAntes.google + 20, 'origem total do webinar somou o dia');
  await page.click('#toasts .toast:last-child [data-desfazer]'); await page.waitForTimeout(300);
  ok(await db(() => window.AOS.db.get('webinarDaily', window.AOS.db.find('webinarDaily', d => d.webinarId === 'wb-07' && d.data === '2026-11-23').id).inscritos) === 95, 'Desfazer volta o dia');
  ok((await db(() => window.AOS.db.get('webinars', 'wb-07').captacao.origem.meta)) === orgAntes.meta, 'Desfazer volta a origem');

  step('lançar dia (rápido): ?lancar=1 e vendas do carrinho');
  await t.ir('#/webinars/wb-07?lancar=1'); await esperaModal();
  ok((await page.textContent('.mbox h2')).includes('Lançar dia de captação'), '?lancar=1 abre o modal');
  ok(!page.url().includes('lancar=1'), 'parâmetro sai da URL');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const ckAntes = await db(() => Number(window.AOS.db.get('webinars', 'wb-06').vendas.checkout) || 0);
  await t.ir('#/webinars/wb-06?lancar=1'); await esperaModal();
  ok((await page.textContent('.mbox h2')).includes('Lançar dia de vendas'), 'carrinho aberto: modal de vendas');
  ok(!!(await page.$('.mbox [name="faturamento"]')), 'dono vê o faturamento');
  await page.fill('.mbox [name="vendas"]', '12'); await page.fill('.mbox [name="checkout"]', '10');
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(150);
  ok((await page.textContent('.mbox')).includes('maiores que cliques no checkout'), 'valida vendas > checkout');
  await page.fill('.mbox [name="vendas"]', '3'); await page.waitForTimeout(60);
  ok((await page.textContent('[data-q-prev]')).includes('30%'), 'prévia checkout → venda');
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(350);
  const v = await db(h => window.AOS.db.find('webinarDaily', d => d.webinarId === 'wb-06' && d.tipo === 'venda' && d.data === h && d.canal === 'carrinho'), hoje);
  ok(v && v.vendas === 3 && v.checkout === 10 && v.faturamento === 3 * 1997, 'venda do dia gravada (faturamento = vendas × ticket)');
  ok((await db(() => Number(window.AOS.db.get('webinars', 'wb-06').vendas.checkout))) === ckAntes + 10, 'cliques no checkout somados ao total');

  if (!t.mobile) {
    step('lançar dia (rápido): paleta de comandos');
    await t.ir('#/webinars');
    await page.keyboard.press('Control+k'); await page.waitForSelector('#cmdk-in', { timeout: 3000 }).catch(() => {});
    if (await page.$('#cmdk-in')) {
      await page.keyboard.type('lançar dia'); await page.waitForTimeout(200);
      const txtP = await page.textContent('.ov-cmdk');
      ok(txtP.includes('Lançar dia do webinar') && txtP.includes('Tráfego que Vende 2.0'), 'comando "Lançar dia do webinar" na paleta');
      await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    } else ok(false, 'paleta de comandos não abriu');
  }

  step('checklist: reordenar com ↑/↓ e Desfazer');
  await t.ir('#/webinars/wb-07'); await page.waitForSelector('.m-webinars-ckl');
  const ordemDom = () => page.$$eval('[data-ck-li]', l => l.map(x => x.dataset.ckLi));
  const ordemDb = () => db(() => { const w = window.AOS.db.get('webinars', 'wb-07'); const l = w.checklist.slice(); return (w.ckManual ? l : l.sort((a, b) => String(a.prazo || '9').localeCompare(String(b.prazo || '9')))).map(c => c.id); });
  const o0 = await ordemDom();
  ok(o0.length >= 3 && JSON.stringify(o0) === JSON.stringify(await ordemDb()), 'ordem na tela = ordem por prazo');
  ok(await page.$eval(`[data-ck-mv="${o0[0]}"][data-dir="-1"]`, b => b.disabled), '↑ do primeiro item desabilitado');
  ok(await page.$eval(`[data-ck-mv="${o0[o0.length - 1]}"][data-dir="1"]`, b => b.disabled), '↓ do último item desabilitado');
  await page.click(`[data-ck-mv="${o0[0]}"][data-dir="1"]`); await page.waitForTimeout(300);
  const o1 = await ordemDom();
  ok(o1[0] === o0[1] && o1[1] === o0[0], '↓ troca o 1º com o 2º');
  ok(await db(() => window.AOS.db.get('webinars', 'wb-07').ckManual === true), 'ordem manual gravada (ckManual)');
  ok(await db(() => window.AOS.db.count('activity', a => /reordenou o checklist/.test(a.oque || '')) >= 1), 'atividade registrada');
  ok((await page.textContent('#toasts')).includes('posição 2'), 'toast informa a nova posição');
  ok(await page.evaluate(id => document.activeElement && document.activeElement.dataset.ckMv === id, o0[0]), 'foco acompanha o item movido');
  await page.click('#toasts .toast:last-child [data-desfazer]'); await page.waitForTimeout(300);
  ok(JSON.stringify(await ordemDom()) === JSON.stringify(o0), 'Desfazer volta a ordem original');
  ok(await db(() => !window.AOS.db.get('webinars', 'wb-07').ckManual), 'Desfazer volta à ordem por prazo');

  step('checklist: Alt+↑ no teclado');
  await page.focus(`[data-ck-mv="${o0[2]}"][data-dir="-1"]`);
  await page.keyboard.press('Alt+ArrowUp'); await page.waitForTimeout(300);
  const o2 = await ordemDom();
  ok(o2[1] === o0[2] && o2[2] === o0[1], 'Alt+↑ sobe o item uma posição');
  ok(JSON.stringify(o2) === JSON.stringify(await ordemDb()), 'ordem persistida no db');

  step('checklist: arrastar pela alça');
  const arrastar = async (de, para) => page.evaluate(([de, para]) => {
    const dt = new DataTransfer();
    const g = document.querySelector(`[data-ck-grip="${de}"]`); const li = document.querySelector(`[data-ck-li="${para}"]`);
    const r = li.getBoundingClientRect(); const y = r.bottom - 2;
    g.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    li.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
    li.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
    g.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, [de, para]);
  const antesDrag = await ordemDom();
  await arrastar(antesDrag[0], antesDrag[2]); await page.waitForTimeout(300);
  const o3 = await ordemDom();
  ok(o3[2] === antesDrag[0] && o3[0] === antesDrag[1] && o3[1] === antesDrag[2], 'soltar abaixo do 3º item leva o 1º para a 3ª posição');
  ok(JSON.stringify(o3) === JSON.stringify(await ordemDb()), 'ordem arrastada persistida');
  ok(!(await page.$('.m-webinars-ck.arrastando, .m-webinars-ck.alvo-cima, .m-webinars-ck.alvo-baixo')), 'marcas de arraste limpas');
  await page.reload(); await page.waitForSelector('.m-webinars-ckl');
  ok(JSON.stringify(await ordemDom()) === JSON.stringify(o3), 'ordem mantida após recarregar');

  step('checklist: marcar pela caixa (um clique = uma mudança)');
  const alvoCk = await page.$eval('.m-webinars-ck:not(.feito) input[data-ck]', i => i.dataset.ck);
  await page.click(`.m-webinars-ck input[data-ck="${alvoCk}"]`); await page.waitForTimeout(300);
  ok(await db(id => window.AOS.db.get('webinars', 'wb-07').checklist.find(c => c.id === id).feito === true, alvoCk), 'um clique marca como feito (sem duplo toggle)');
  ok(await page.$eval(`input[data-ck="${alvoCk}"]`, i => i.checked), 'caixa marcada na tela após re-render');
  await page.click('#toasts .toast:last-child [data-desfazer]'); await page.waitForTimeout(300);
  ok(await db(id => !window.AOS.db.get('webinars', 'wb-07').checklist.find(c => c.id === id).feito, alvoCk), 'Desfazer reabre o item');

  step('excluir (dono) com desfazer');
  await t.ir('#/webinars/wb-08');
  await page.click('[data-excluir]'); await esperaModal(); await page.click('.mbox [data-ok]'); await page.waitForTimeout(300);
  ok(!(await db(() => window.AOS.db.get('webinars', 'wb-08'))), 'excluído');
  await page.click('#toasts .toast:last-child [data-desfazer]'); await page.waitForTimeout(250);
  ok(!!(await db(() => window.AOS.db.get('webinars', 'wb-08'))), 'desfeito');

  step('permissões: produção (Carla)');
  await t.sair();
  await page.click('[data-quick="carla@agencia.demo"]'); await page.waitForSelector('#view'); await page.waitForTimeout(150);
  await t.ir('#/webinars');
  ok(!(await page.$('[data-novo]')), 'produção não cria webinar');
  await t.ir('#/webinars/wb-08/preencher');
  ok((await page.textContent('#view')).includes('não está escalado'), 'não preenche webinar em que não está escalada');
  await t.ir('#/webinars/wb-06');
  ok(!(await page.$('[data-excluir]')), 'produção não exclui');
  ok(await page.isVisible('a[href="#/webinars/wb-06/preencher"]'), 'escalada: pode preencher');
  await t.ir('#/webinars/wb-06/preencher');
  ok(await page.isVisible('[data-wf]'), 'formulário abre para quem está escalado');

  step('permissões: leitura (Helena) só vê');
  await t.sair();
  await page.fill('#lg-email', 'helena@agencia.demo'); await page.fill('#lg-senha', 'demo123'); await page.click('.lg-go'); await page.waitForSelector('#view');
  await t.ir('#/webinars/wb-06');
  ok(!(await page.$('a[href="#/webinars/wb-06/preencher"]')) && !!(await page.$('.m-webinars-ck input[disabled]')), 'leitura sem edição');
  ok(!(await page.$('[data-ck-mv], [data-ck-grip]')), 'leitura sem botões/alça de reordenar');
  ok(!(await page.$('[data-lancar]')), 'leitura sem Lançar dia');

  step('tema escuro');
  await t.ir('#/webinars');
  await page.click('[data-tema-btn]'); await page.waitForTimeout(150);
  await t.ir('#/webinars/wb-07');
  await page.click('[data-tema-btn]');
}
