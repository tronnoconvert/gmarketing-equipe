import fs from 'node:fs';
// tests/financeiro.spec.mjs — todas as abas, cobrar, marcar como paga (+Desfazer), renegociar, + Lançamento (validação), busca, contador, permissões.
export default async function (t) {
  const { page, ok, step } = t;
  const modal = () => page.waitForSelector('.mbox', { timeout: 3000 });
  const fechouModal = () => page.waitForSelector('.mbox', { state: 'detached', timeout: 3000 });
  await t.login();

  step('contador no menu');
  ok((await page.textContent('.nv [data-mod="financeiro"] .cnt')).trim() === '2', 'contador = 2 faturas vencidas há mais de 7 dias');

  step('visão geral');
  await t.ir('#/financeiro');
  await page.waitForSelector('.m-financeiro');
  let txt = await page.textContent('.m-financeiro');
  for (const s of ['R$ 186,4 mil', '27,4%', 'R$ 412 mil', '6,8 meses', 'Ponte de MRR', '+ 14,8', '+ 6,1', '− 2,4', '− 4,4', '186,4', 'Concentração de receita', '20,7%'])
    ok(txt.includes(s), `visão contém "${s}"`);
  ok(await page.$$eval('.ch-cascata svg.chart', e => e.length) === 1, 'cascata da ponte');
  ok(await page.$$eval('.tabs .tab', e => e.length) === 8, '8 abas (com Comissões e Automação)');

  step('período muda a ponte');
  await page.evaluate(() => window.AOS.shell.setPeriodo('tri')); await page.waitForTimeout(350);
  ok((await page.textContent('.m-financeiro')).includes('set–nov'), 'ponte do trimestre');
  await page.evaluate(() => window.AOS.shell.setPeriodo('mes')); await page.waitForTimeout(300);

  step('caixa');
  await t.ir('#/financeiro/caixa');
  txt = await page.textContent('.m-financeiro');
  ok(txt.includes('Saldo projetado (90 dias)') && txt.includes('Alerta: runway < 3 meses'), 'projeção 90 dias com linha de alerta');
  ok(await page.$$eval('.m-financeiro svg.chart', e => e.length) >= 2, 'gráficos de caixa');

  step('+ Lançamento: validação e máscara');
  await page.click('.ph-a [data-f="lancar"]'); await modal();
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(150);
  ok(await page.$$eval('.mbox .fld-err', e => e.length) >= 2, 'erros inline sem descrição/valor');
  await page.fill('.mbox [name="descricao"]', 'Consultoria avulsa — Pet Feliz');
  await page.fill('.mbox [name="valor"]', '250000');
  ok((await page.inputValue('.mbox [name="valor"]')) === 'R$ 2.500,00', 'máscara de moeda');
  await page.click('.mbox [data-ok]'); await fechouModal();
  await page.waitForTimeout(300);
  ok((await page.textContent('.m-financeiro')).includes('Consultoria avulsa'), 'lançamento aparece na lista');
  ok((await page.textContent('.m-financeiro')).includes('R$ 414,5 mil'), 'saldo atualizado (412 + 2,5)');
  await page.click('.toast:last-child [data-desfazer]'); await page.waitForTimeout(300);
  ok(!(await page.textContent('.m-financeiro')).includes('Consultoria avulsa'), 'Desfazer remove o lançamento');

  step('DRE');
  await t.ir('#/financeiro/dre');
  txt = await page.textContent('.m-financeiro');
  for (const s of ['Comissões variáveis', 'Receita bruta', 'Impostos', 'Receita líquida', 'Custos de pessoal', 'Ferramentas', 'Mídia repassada', 'Despesas operacionais', 'EBITDA', 'Lucro líquido', 'Margem líquida', '186,4', '51,1', '27,4%', 'Trimestre', '12 meses'])
    ok(txt.includes(s), `DRE contém "${s}"`);

  step('contas a receber: faixas e status');
  await t.ir('#/financeiro/receber');
  txt = await page.textContent('.m-financeiro');
  for (const s of ['A vencer', '1–15 dias', '16–30 dias', 'Mais de 30 dias', '9 dias de atraso', '3 dias de atraso', 'Vence amanhã', 'Contas a pagar'])
    ok(txt.includes(s), `receber contém "${s}"`);

  step('cobrar (modal com canal e mensagem)');
  await page.click('[data-f="cobrar"][data-id="inv-2611-bella"]'); await modal();
  const msg = await page.inputValue('.mbox [name="mensagem"]');
  ok(msg.includes('6.800,00') && msg.includes('9 dias de atraso'), 'mensagem pronta com valor e atraso');
  await page.check('.mbox [name="canal"][value="email"]');
  await page.fill('.mbox [name="para"]', 'email-invalido');
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(150);
  ok(await page.$$eval('.mbox .fld-err', e => e.length) === 1, 'valida e-mail');
  await page.fill('.mbox [name="para"]', 'financeiro@bellamoda.com.br');
  await page.click('.mbox [data-ok]'); await fechouModal(); await page.waitForTimeout(250);
  ok((await page.textContent('.toast:last-child')).includes('Cobrança enviada por e-mail'), 'toast da cobrança');
  ok(await page.evaluate(() => window.AOS.db.get('invoices', 'inv-2611-bella').cobrancas.length === 3), 'cobrança registrada na fatura');
  ok(await page.evaluate(() => window.AOS.db.list('activity').some(a => /cobrou a fatura/.test(a.oque))), 'activity registrada');

  step('marcar como paga + Desfazer');
  await page.click('[data-f="pagar"][data-id="inv-2611-cafe"]'); await modal();
  await page.click('.mbox [data-ok]'); await fechouModal(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.AOS.db.get('invoices', 'inv-2611-cafe').status === 'paga'), 'fatura paga');
  ok(await page.evaluate(() => window.AOS.db.list('cash', l => l.invoiceId === 'inv-2611-cafe').length === 1), 'entrada no caixa');
  await page.click('.toast:last-child [data-desfazer]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.AOS.db.get('invoices', 'inv-2611-cafe').status === 'aberta' && !window.AOS.db.list('cash', l => l.invoiceId === 'inv-2611-cafe').length), 'Desfazer reabre a fatura e tira do caixa');

  step('renegociar');
  await page.click('[data-f="reneg"][data-id="inv-2610-docelar"]'); await modal();
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(150);
  ok(await page.$$eval('.mbox .fld-err', e => e.length) >= 1, 'exige descrição do acordo');
  await page.fill('.mbox [name="obs"]', 'Acordo por telefone com o ex-sócio: pagamento em 2 parcelas.');
  await page.selectOption('.mbox [name="parcelas"]', '2');
  await page.click('.mbox [data-ok]'); await fechouModal(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.AOS.db.get('invoices', 'inv-2610-docelar').status === 'renegociada'), 'fatura renegociada');
  ok((await page.textContent('.nv [data-mod="financeiro"] .cnt')).trim() === '1', 'contador cai para 1');

  step('filtros na URL');
  await t.ir('#/financeiro/receber?f=pagas');
  ok((await page.$$eval('.m-financeiro .card .tbl tbody tr', e => e.length)) >= 20, 'filtro Pagas');

  step('ação vinda do cockpit: ?cobrar=');
  await t.ir('#/financeiro/receber?cobrar=inv-2611-bella'); await modal();
  ok((await page.textContent('.mbox')).includes('Bella Moda'), 'abre o modal automaticamente');
  await page.keyboard.press('Escape'); await fechouModal();
  ok(!/cobrar=/.test(page.url()), 'limpa o parâmetro da URL');

  step('comissões: total, por pessoa, filtro, status, CSV, link do cadastro');
  await t.ir('#/financeiro/comissoes');
  txt = await page.textContent('.m-financeiro');
  const tot = await page.evaluate(() => window.AOS.db.list('clients').flatMap(c => (c.comissoes || []).map(x => ({ c, x }))).filter(({ x }) => x.inicio <= window.AOS.fmt.iso(new Date()) && window.AOS.fmt.iso(new Date()) < (() => { const d = new Date(x.inicio + 'T12:00:00'); d.setMonth(d.getMonth() + Number(x.meses)); return window.AOS.fmt.iso(d); })()).reduce((a, { c, x }) => a + (x.tipo === 'percentual' ? Math.round(x.valor / 100 * c.mrr * 100) / 100 : x.valor), 0));
  ok(tot > 0 && txt.includes('Total variável do mês') && txt.includes(await page.evaluate(v => window.AOS.fmt.brl(v), tot)), `total variável do mês (${tot})`);
  ok(txt.includes('Por pessoa') && txt.includes('Ana Souza'), 'tabela por pessoa');
  ok(await page.$$eval('.m-financeiro .tbl .led', e => e.length) > 0, 'LEDs de situação');
  ok(await page.$$eval('.m-financeiro a[href$="/cadastro"]', e => e.length) > 0, 'link para o Cadastro do cliente');
  await t.ir('#/financeiro/comissoes?pessoa=t-ana&st=todas');
  const pes = await page.$$eval('.m-financeiro .card:last-child .tbl tbody tr', trs => trs.map(r => r.textContent));
  ok(pes.length > 0 && pes.every(r => r.includes('Ana')), 'filtro por pessoa');
  if (!t.mobile) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 4000 }), page.click('[data-f="com-csv"]')]);
    ok(/^comissoes-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename()), 'exporta CSV');
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    ok(csv.includes('Pessoa"') && csv.includes('Ana Souza') && !csv.includes('Bruno Lima'), `CSV respeita o filtro (${csv.slice(0, 80)})`);
  }

  step('automação: lembretes de vencimento por WhatsApp');
  await t.ir('#/financeiro/automacao');
  txt = await page.textContent('.m-financeiro');
  ok(txt.includes('Lembretes automáticos de vencimento (WhatsApp)') && txt.includes('3 dias antes') && txt.includes('No dia do vencimento') && txt.includes('3 dias depois'), 'card de configuração com os 3 momentos');
  ok((await page.inputValue('[data-lem-form] [name="hora"]')) === '09:00', 'horário padrão 09:00');
  const prev = await page.textContent('[data-lem-previa]');
  ok(prev.includes('⚠️ Mensagem automática — por favor, não responda. Dúvidas: fale com') && /R\$ [\d.]+,\d{2}/.test(prev) && !prev.includes('{cliente}'), 'prévia com fatura real e rodapé fixo');
  await page.fill('[data-lem-form] [name="modelo"]', 'Oi {cliente}, sua fatura {xyz} vence em {vencimento}.');
  ok((await page.textContent('[data-lem-previa]')).includes('sua fatura {xyz}'), 'prévia atualiza enquanto digita');
  await page.click('[data-lem-form] button[type="submit"]'); await page.waitForTimeout(150);
  ok((await page.textContent('[data-lem-form]')).includes('Variável desconhecida: {xyz}'), 'valida variáveis do modelo');
  await page.fill('[data-lem-form] [name="modelo"]', 'Oi {cliente}! A mensalidade de {valor} vence em {vencimento}. Link: ');
  await page.click('[data-lem-var="link_boleto"]');
  ok((await page.inputValue('[data-lem-form] [name="modelo"]')).endsWith('{link_boleto}'), 'botão insere a variável');
  await page.click('[data-lem-form] button[type="submit"]'); await page.waitForTimeout(300);
  const cfg = await page.evaluate(() => window.AOS.db.config('financeiro.lembretes'));
  ok(cfg.ativo && cfg.hora === '09:00' && cfg.quando.length === 3 && cfg.modelo.includes('{link_boleto}') && !cfg.modelo.includes('não responda'), 'configuração salva (rodapé não fica no modelo editável)');
  step('simular envio de hoje');
  await page.click('[data-f="lem-simular"]'); await page.waitForTimeout(350);
  const inv = await page.evaluate(() => window.AOS.db.get('invoices', 'inv-2611-cafe'));
  const l = (inv.lembretes || [])[0];
  ok(l && l.canal === 'whatsapp' && l.tipo === 'depois' && l.status === 'enviado (simulado)' && l.quando && /não responda/.test(l.mensagem), 'fatura vencida há 3 dias recebe lembrete "depois"');
  ok(await page.evaluate(() => window.AOS.db.list('invoices', f => (f.lembretes || []).length).length) === 1, 'só as faturas das regras recebem');
  ok(await page.evaluate(() => window.AOS.db.list('activity').some(a => /lembrete automático de vencimento/.test(a.oque))), 'atividade registrada');
  await page.click('[data-f="lem-simular"]'); await page.waitForTimeout(300);
  ok((await page.evaluate(() => window.AOS.db.get('invoices', 'inv-2611-cafe').lembretes.length)) === 1, 'idempotente: não reenvia no mesmo dia');
  await t.ir('#/financeiro/receber');
  ok(/Lembrete WhatsApp enviado \d{2}\/\d{2} 09:00/.test(await page.textContent('.m-financeiro')), 'linha da fatura mostra "Lembrete WhatsApp enviado dd/mm 09:00"');
  ok(await page.isVisible('.mf-lem-lnk'), 'atalho para a configuração dos lembretes');

  step('rentabilidade e unit economics');
  await t.ir('#/financeiro/rentabilidade');
  txt = await page.textContent('.m-financeiro');
  ok(txt.includes('R$/hora efetivo') && txt.includes('Overservicing') && txt.includes('Margem por serviço') && txt.includes('Abaixo de 40%'), 'rentabilidade completa');
  await t.ir('#/financeiro/unidade');
  txt = await page.textContent('.m-financeiro');
  ok(['CAC', 'LTV', 'LTV/CAC', 'Payback'].every(s => txt.includes(s)), 'unit economics');
  ok(await page.$$eval('.m-financeiro .kpi .hlp', e => e.length) >= 4, 'ajuda (?) em cada indicador');

  step('busca global encontra faturas');
  if (!t.mobile) {
    await page.click('.gs input, #gs-in').catch(() => {});
    await page.keyboard.type('bella');
    await page.waitForTimeout(400);
    ok((await page.evaluate(() => document.body.textContent)).includes('Faturas'), 'grupo Faturas na busca');
    await page.keyboard.press('Escape');
  }

  step('permissões: administrador edita; papel financeiro e leitura não acessam (padrão)');
  await t.login('rayane@agencia.demo');
  await t.ir('#/financeiro/receber');
  ok(!(await page.$eval('[data-f="cobrar"]', e => e.disabled)), 'administrador pode cobrar');
  await t.login('paulo@agencia.demo');
  await t.ir('#/financeiro');
  ok((await page.textContent('#view')).includes('Acesso restrito'), 'papel financeiro sem o módulo Financeiro por padrão');
  await t.login('helena@agencia.demo');
  await t.ir('#/financeiro');
  ok((await page.textContent('#view')).includes('Acesso restrito'), 'leitura não vê o Financeiro');
}
