// tests/mesa.spec.mjs — Minha mesa: fila pessoal por papel, ações reais (abrir, Feito, aprovar, lida, resolver) com Desfazer,
// check-in inline, sem R$ para quem não vê receita, "ver como", leitura e estado vazio.
export default async function (t) {
  const { page, ok, step } = t;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const item = k => `.m-mesa li.m-mesa-i[data-k="${k}"]`;
  const tem = async k => !!(await page.$(item(k)));
  const chaves = () => page.$$eval('.m-mesa li.m-mesa-i', els => els.map(e => e.dataset.k));
  const desfazer = async () => { await page.click('.toast:last-child [data-desfazer]'); await page.waitForTimeout(300); };
  const fecharOverlays = async () => { for (let i = 0; i < 3; i++) { if (await page.$('.ov')) { await page.keyboard.press('Escape'); await page.waitForTimeout(220); } } };
  // o início por papel pode carregar o iframe da Torre (gestor de tráfego): espera a rede antes de sair dele
  const entrar = async email => { await t.login(email); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(200); };
  const mesa = async () => { await t.ir('#/mesa'); await page.waitForSelector('.m-mesa'); await page.waitForTimeout(150); };
  // valores em R$ só para quem vê receita — exceto as comissões da própria pessoa (card "Minhas comissões variáveis")
  const semRS = async () => !(await page.$eval('.m-mesa', el => { const c = el.cloneNode(true); c.querySelectorAll('.m-mesa-com').forEach(x => x.remove()); return c.textContent; })).includes('R$');
  /** toda tarefa na fila é minha (responsável) ou espera minha aprovação */
  const tarefasSaoMinhas = async me => ev(([ks, m]) => ks.every(k => {
    if (k.startsWith('tk:')) return window.AOS.db.get('tasks', k.slice(3)).respId === m;
    if (k.startsWith('ap:')) return window.AOS.db.get('tasks', k.slice(3)).aprovadorId === m;
    return true;
  }), [await chaves(), me]);

  /* ---------------- Ana (gestora de tráfego) ---------------- */
  await entrar('ana@agencia.demo');
  step('Ana: seções e itens dela');
  await mesa();
  ok((await page.textContent('.m-mesa-hd h1')).includes('Ana.'), 'saudação com o primeiro nome');
  ok(/para agora/.test(await page.textContent('.m-mesa-res')), 'resumo de uma linha com "para agora"');
  ok(await page.isVisible('.m-mesa .sec-agora') && await page.isVisible('.m-mesa .sec-hoje') && await page.isVisible('.m-mesa .sec-semana'), 'seções Agora, Hoje e Esta semana');
  const ksAna = await chaves();
  ok(await ev(ks => ks.filter(k => k.startsWith('tk:')).every(k => window.AOS.db.get('tasks', k.slice(3)).respId === 't-ana'), ksAna), 'tarefas da fila são da Ana');
  ok(await ev(ks => ks.filter(k => k.startsWith('ap:')).every(k => window.AOS.db.get('tasks', k.slice(3)).aprovadorId === 't-ana'), ksAna), 'aprovações esperam a Ana');
  ok(await ev(ks => ks.filter(k => k.startsWith('nt:')).every(k => k.slice(3).split(',').every(id => window.AOS.db.get('notifications', id).para === 'u-ana')), ksAna), 'notificações são para a Ana');
  ok(await tem('tk:tk-01') && (await page.$(`.sec-agora ${item('tk:tk-01').replace('.m-mesa ', '')}`)) !== null, 'tarefa atrasada tk-01 em Agora');
  ok(!(await tem('tk:tk-07')), 'tarefa do Felipe não aparece');
  ok(await tem('ap:tk-02'), 'aprovação dos criativos do Orion (Carla → Ana)');
  ok(await tem('nt:n-20'), 'menção do Gabriel');
  ok(await tem('cl:c-orion'), 'cliente Grupo Orion (health 41) na mesa');
  ok(!(await tem('al:a-orion')), 'alerta do Orion fundido no item do cliente');
  ok(!(await tem('ck')), 'check-in já feito hoje não aparece');
  ok(await semRS(), 'sem R$ para a gestora de tráfego');
  ok((await page.$$('.m-mesa-lat .m-mesa-st')).length === 3, 'Minha semana: 3 indicadores');
  ok((await page.$$('.m-mesa-cl li')).length > 0, 'Meus clientes com LEDs');
  const nAgora = (await page.$$('.sec-agora li.m-mesa-i')).length;
  ok((await page.textContent('.nv [data-mod="mesa"] .cnt')).trim() === String(nAgora), `contador do menu = itens de Agora (${nAgora})`);

  step('Ana: minhas comissões variáveis (só as dela, sem MRR/%)');
  ok(await page.isVisible('.m-mesa-com'), 'card de comissões visível');
  const com = await page.textContent('.m-mesa-com');
  const esperado = await ev(() => window.AOS.db.list('clients', c => (c.comissoes || []).some(x => x.teamId === 't-ana')).map(c => c.nome));
  ok(esperado.length > 0 && esperado.every(n => com.includes(n)), 'clientes com comissão da Ana');
  ok(/R\$ [\d.]+\/mês/.test(com) && /meses restantes|último mês/.test(com) && com.includes('Total por mês'), 'valor mensal, meses restantes e total');
  ok(!/MRR|%/.test(com), 'nunca mostra MRR nem percentual');
  ok(!com.includes('Studio Fit'), 'não mostra comissão de outra pessoa');

  step('Ana: terça é dia de relatório');
  const dia = await ev(() => new Date().getDay());
  const rl = (await chaves()).filter(k => k.startsWith('rl:'));
  if (dia === 1) ok(rl.length === 0, 'segunda: nenhum relatório na mesa');
  else {
    const nCli = await ev(() => window.AOS.db.count('clients', c => c.ativo !== false && !['churn', 'inativo', 'encerrado'].includes(c.status) && c.respId === 't-ana'));
    ok(rl.length === nCli, `um item por cliente (${rl.length} de ${nCli})`);
    const sec = dia === 2 ? 'hoje' : 'agora';
    ok(await page.$$eval(`.sec-${sec} li[data-k^="rl:"]`, e => e.length) === nCli, `relatórios em "${sec === 'hoje' ? 'Hoje' : 'Agora'}"`);
    ok((await page.textContent(item(rl[0]))).includes('Relatório semanal: '), 'título "Relatório semanal: <cliente>"');
    if (nCli > 4) {
      ok(await page.$$eval('li[data-rel-oculto]', e => e.filter(x => x.hidden).length) === nCli - 3, 'visão Tudo recolhe os relatórios além dos 3 primeiros');
      await page.click('[data-rel-mais]'); await page.waitForTimeout(100);
      ok(await page.$$eval('li[data-k^="rl:"]', e => e.every(x => !x.hidden)), '"Mostrar mais" abre todos');
    }
    const n0 = await ev(() => window.AOS.db.list('notifications', n => n.para === 'u-ana' && /^n-rel-/.test(n.id)).length);
    if (dia === 2) ok(n0 === 1 && (await ev(() => window.AOS.db.list('notifications', n => /^n-rel-/.test(n.id))[0].titulo)).includes(`Hoje é dia de relatório: ${nCli} clientes`), 'notificação de terça "Hoje é dia de relatório: N clientes" (uma)');
    const alvo = rl[0].slice(3);
    await page.click(`${item(rl[0])} [data-acao="relatorio-enviado"]`); await page.waitForTimeout(300);
    const reg = await ev(id => window.AOS.db.find('relatorios', r => r.clientId === id), alvo);
    ok(reg && /^\d{4}-W\d{2}$/.test(reg.semana) && reg.enviadoPor === 't-ana' && reg.quando, 'gravado em relatorios {clientId, semana ISO, enviadoPor, quando}');
    ok(!(await tem(rl[0])), 'item sai da mesa');
    ok(await ev(() => window.AOS.db.list('activity').some(a => /relatório semanal/.test(a.oque))), 'atividade registrada');
    await desfazer();
    ok(await tem(rl[0]) && !(await ev(id => window.AOS.db.find('relatorios', r => r.clientId === id), alvo)), 'Desfazer devolve o item');
    ok(/#\/clientes\/[\w-]+\/resultados-acoes/.test(await page.$eval(`${item(rl[0])} a.m-mesa-t`, a => a.getAttribute('href'))), 'abre os resultados do cliente');
    await t.ir('#/mesa?o=relatorio'); await page.waitForTimeout(150);
    ok((await chaves()).every(k => k.startsWith('rl:')) && await page.isVisible('.m-mesa-relp'), 'filtro ?o=relatorio com progresso da semana');
    if (dia === 2) {
      await page.reload(); await page.waitForSelector('#view'); await page.waitForTimeout(400); // reabrir na mesma terça não duplica o aviso
      ok(await ev(() => window.AOS.db.list('notifications', n => /^n-rel-/.test(n.id)).length) === 1, 'aviso de terça não duplica');
    }
    await mesa();
  }

  step('Ana: Abrir tarefa navega para o painel');
  await page.click(`${item('tk:tk-01')} .m-mesa-a a.btn`); await page.waitForTimeout(500);
  ok(page.url().includes('operacao/quadro?tarefa=tk-01'), 'URL do quadro com ?tarefa=');
  ok(!!(await page.$('.ov-drawer')), 'painel da tarefa aberto');
  await fecharOverlays();

  step('Ana: Feito envia para aprovação, Desfazer volta');
  await mesa();
  await page.click(`${item('tk:tk-08')} [data-acao="tarefa-feito"]`); await page.waitForTimeout(300);
  ok((await ev(() => window.AOS.db.get('tasks', 'tk-08').status)) === 'aprovacao', 'tk-08 foi para aprovação');
  ok(!(await tem('tk:tk-08')), 'item saiu da mesa');
  ok(await ev(() => { const ap = window.AOS.db.get('team', window.AOS.db.get('tasks', 'tk-08').aprovadorId).userId; return window.AOS.db.count('notifications', n => n.para === ap && n.refId === 'tk-08'); }) >= 1, 'aprovador notificado');
  await desfazer();
  ok((await ev(() => window.AOS.db.get('tasks', 'tk-08').status)) === 'andamento', 'Desfazer restaura Em andamento');
  ok(await tem('tk:tk-08'), 'item voltou');

  step('Ana: Aprovar e Pedir ajuste');
  await page.click(`${item('ap:tk-02')} [data-acao="aprovar"]`); await page.waitForTimeout(300);
  ok((await ev(() => window.AOS.db.get('tasks', 'tk-02').status)) === 'feito', 'tk-02 aprovada');
  ok(await ev(() => window.AOS.db.count('notifications', n => n.para === 'u-carla' && n.refId === 'tk-02')) >= 1, 'Carla avisada da aprovação');
  await desfazer();
  ok((await ev(() => window.AOS.db.get('tasks', 'tk-02').status)) === 'aprovacao', 'Desfazer volta para aprovação');
  await page.click(`${item('ap:tk-02')} [data-acao="ajuste"]`); await page.waitForSelector('.ov-modal textarea[name="motivo"]');
  await page.fill('.ov-modal textarea[name="motivo"]', 'Trocar a foto principal pela do manual.');
  await page.click('.ov-modal [data-ok]'); await page.waitForTimeout(350);
  const tk02 = await ev(() => window.AOS.db.get('tasks', 'tk-02'));
  ok(tk02.status === 'andamento' && tk02.retrabalho === 2, 'ajuste pedido: volta para andamento com retrabalho');
  await desfazer();
  ok((await ev(() => window.AOS.db.get('tasks', 'tk-02').status)) === 'aprovacao', 'Desfazer do ajuste');

  step('Ana: menção — Lida e Responder');
  await mesa();
  await page.click(`${item('nt:n-20')} [data-acao="lida"]`); await page.waitForTimeout(300);
  ok(await ev(() => window.AOS.db.get('notifications', 'n-20').lida) === true, 'menção marcada como lida');
  ok(!(await tem('nt:n-20')), 'menção saiu da mesa');
  await desfazer();
  ok(await ev(() => window.AOS.db.get('notifications', 'n-20').lida) === false && await tem('nt:n-20'), 'Desfazer devolve a menção');
  await page.click(`${item('nt:n-20')} .m-mesa-a a.btn`); await page.waitForTimeout(500);
  ok(page.url().includes('#/clientes/c-orion') && await page.isVisible('.cmt textarea'), 'Responder abre a thread de comentários do cliente');
  ok(await ev(() => window.AOS.db.get('notifications', 'n-20').lida) === true, 'abrir marca como lida');

  step('Ana: filtro por origem na URL');
  await t.ir('#/mesa?o=clientes'); await page.waitForTimeout(150);
  ok((await chaves()).every(k => k.startsWith('cl:')), 'filtro Clientes mostra só clientes');
  ok(await page.isVisible('.m-mesa-chips [aria-current="true"]'), 'chip ativo visível');

  step('Ana: Feito em cliente (por hoje) e Trazer de volta');
  await mesa();
  await page.click(`${item('cl:c-orion')} [data-acao="dispensar"]`); await page.waitForTimeout(300);
  ok(!(await tem('cl:c-orion')), 'cliente saiu da mesa por hoje');
  ok((await page.textContent('.m-mesa-disp summary')).includes('feito hoje'), 'lista de feitos hoje');
  await desfazer();
  ok(await tem('cl:c-orion'), 'Desfazer traz o cliente de volta');
  await page.click(`${item('cl:c-orion')} [data-acao="dispensar"]`); await page.waitForTimeout(300);
  await page.click('.m-mesa-disp summary'); await page.click('[data-voltar-item="cl:c-orion"]'); await page.waitForTimeout(300);
  ok(await tem('cl:c-orion'), '"Trazer de volta" também funciona');

  /* ---------------- Carla (produção) — check-in inline ---------------- */
  await entrar('carla@agencia.demo');
  step('Carla: check-in inline salva');
  await mesa();
  ok(await tem('ck'), 'item "Fazer check-in" em Hoje');
  ok(await tarefasSaoMinhas('t-carla'), 'tarefas da Carla');
  ok(await semRS(), 'sem R$ para produção');
  await page.click(`${item('ck')} [data-acao="checkin"]`); await page.waitForTimeout(150);
  ok(await page.isVisible('[data-ck-form]'), 'formulário rápido abre no lugar');
  await page.click('[data-ck-form] button[type="submit"]'); await page.waitForTimeout(150);
  ok((await page.$$('[data-ck-form] .fld-err')).length >= 2, 'validação: o que fiz e o que farei');
  await page.fill('[data-ck-form] textarea[name="fiz"]', 'Carrossel do Café Raiz quase pronto.');
  await page.fill('[data-ck-form] textarea[name="farei"]', 'Finalizar o carrossel e começar os banners da Bella.');
  await page.fill('[data-ck-form] textarea[name="bloqueios"]', 'Falta a foto do produto novo.');
  await page.click('[data-ck-form] button[type="submit"]'); await page.waitForTimeout(350);
  const ck = await ev(() => { const d = new Date(); const h = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; return window.AOS.db.find('checkins', c => c.teamId === 't-carla' && c.data === h); });
  ok(ck && ck.farei.includes('banners') && ck.bloqueios.includes('foto'), 'check-in gravado na coleção checkins');
  ok(await ev(() => window.AOS.db.count('notifications', n => n.para === 'u-gabriel' && n.refCol === 'checkins')) >= 1, 'gestor avisado do bloqueio');
  ok(!(await tem('ck')), 'item de check-in some depois de salvo');
  await desfazer();
  ok(await tem('ck'), 'Desfazer remove o check-in');

  /* ---------------- Diego (CS) ---------------- */
  await entrar('diego@agencia.demo');
  step('Diego: alertas e clientes dele, sem R$');
  await mesa();
  const ksD = await chaves();
  ok(await tarefasSaoMinhas('t-diego'), 'tarefas do Diego');
  ok(ksD.includes('al:a-sync'), 'alerta da rotina de sync (para Diego)');
  ok(!ksD.includes('al:a-ana'), 'alerta de ocupação da Ana (só para o dono) não aparece');
  ok(await ev(ks => ks.filter(k => k.startsWith('cl:')).every(k => { const c = window.AOS.db.get('clients', k.slice(3)); return c.respId === 't-diego' || (c.equipe || []).includes('t-diego'); }), ksD), 'clientes do escopo do Diego');
  ok(await semRS(), 'nenhum R$ na mesa do CS');
  ok(!ksD.some(k => k.startsWith('rl:')), 'CS não recebe itens de relatório semanal');
  ok(!(await page.$('[data-acao="resolver-alerta"]')), 'CS só vê alertas: sem "Resolvido"');

  /* ---------------- Felipe (produção) — estado vazio ---------------- */
  await entrar('felipe@agencia.demo');
  step('Felipe: itens dele e estado vazio quando tudo está feito');
  await mesa();
  ok(await tarefasSaoMinhas('t-felipe'), 'tarefas do Felipe');
  ok((await chaves()).length > 0, 'Felipe tem itens');
  await ev(() => {
    const db = window.AOS.db;
    db.batch(() => {
      db.list('tasks', x => x.respId === 't-felipe' && x.status !== 'feito').forEach(x => db.update('tasks', x.id, { status: 'feito', concluidaEm: new Date().toISOString() }));
      db.list('alerts', a => (a.para || []).includes('t-felipe')).forEach(a => db.update('alerts', a.id, { status: 'resolvido', resolvido: true }));
      db.list('notifications', n => n.para === 'u-felipe').forEach(n => db.update('notifications', n.id, { lida: true }));
    });
  });
  await mesa();
  for (let i = 0; i < 40 && await page.$('.m-mesa [data-acao="dispensar"], .m-mesa [data-acao="webinar-check"], .m-mesa [data-acao="lida"]'); i++) {
    await page.click('.m-mesa [data-acao="dispensar"], .m-mesa [data-acao="webinar-check"], .m-mesa [data-acao="lida"]'); await page.waitForTimeout(250);
  }
  if (await tem('ck')) {
    await page.click(`${item('ck')} [data-acao="checkin"]`);
    await page.fill('[data-ck-form] textarea[name="fiz"]', 'Landing publicada.'); await page.fill('[data-ck-form] textarea[name="farei"]', 'Integração do CRM.');
    await page.click('[data-ck-form] button[type="submit"]'); await page.waitForTimeout(300);
  }
  await mesa();
  ok(await page.isVisible('.m-mesa-vazio'), 'estado vazio "Tudo em dia"');
  ok((await page.textContent('.m-mesa-vazio')).includes('Tudo em dia, Felipe.'), 'celebra com o nome');
  ok(!!(await page.$('.m-mesa-vazio a.btn.pri')), 'próximo passo útil no estado vazio');
  ok(!(await page.$('.nv [data-mod="mesa"] .cnt')), 'contador do menu some');

  /* ---------------- Gabriel (dono) ---------------- */
  await ev(() => window.AOS.db.reset()); await page.waitForTimeout(400); // desfaz o "tudo feito" do Felipe
  await entrar();
  step('Gabriel: fila pessoal do dono, resolver alerta');
  await mesa();
  const ksG = await chaves();
  ok(ksG.includes('al:a-sync') && ksG.includes('ap:tk-27'), 'alertas e aprovações do dono');
  ok(await tarefasSaoMinhas('t-gabriel'), 'aprovações esperam o Gabriel');
  ok((await page.textContent('.m-mesa')).includes('R$'), 'dono vê valores');
  await page.click(`${item('al:a-sync')} [data-acao="resolver-alerta"]`); await page.waitForTimeout(300);
  ok((await ev(() => window.AOS.db.get('alerts', 'a-sync').status)) === 'resolvido', 'alerta resolvido');
  await desfazer();
  ok((await ev(() => window.AOS.db.get('alerts', 'a-sync').status)) === 'aberto' && await tem('al:a-sync'), 'Desfazer reabre o alerta');
  await page.click(`${item('ap:tk-27')} [data-acao="aprovar"]`); await page.waitForTimeout(300);
  ok((await ev(() => window.AOS.db.get('tasks', 'tk-27').status)) === 'feito', 'dono aprova o relatório');
  await desfazer();

  step('Gabriel: ver como Ana');
  await ev(() => window.AOS.auth.verComo('u-ana')); await page.waitForTimeout(300);
  await mesa();
  ok((await page.textContent('.m-mesa-hd h1')).includes('Ana.'), 'mesa da pessoa vista');
  ok(await tem('tk:tk-01') && !(await tem('ap:tk-27')), 'fila da Ana, não a do dono');
  ok(await page.$eval('[data-acao="tarefa-feito"]', b => b.disabled), 'ações de concluir desabilitadas em "ver como"');
  ok(await semRS(), 'sem R$ vendo como a Ana');
  await ev(() => window.AOS.auth.voltar()); await page.waitForTimeout(300);

  /* ---------------- Helena (leitura) ---------------- */
  await entrar('helena@agencia.demo');
  step('Helena: leitura, sem ações');
  await mesa();
  ok(await page.isVisible('.m-mesa-vazio'), 'estado vazio para leitura sem pendências');
  ok(!(await page.$('.m-mesa [data-acao]')), 'nenhuma ação de mesa para leitura');
  ok((await page.textContent('.m-mesa-hd')).includes('somente leitura'), 'indica somente leitura');
}
