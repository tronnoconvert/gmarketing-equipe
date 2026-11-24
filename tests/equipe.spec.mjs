// tests/equipe.spec.mjs — visão do time, perfil (6 abas), redistribuir, elogio, 1:1, metas, check-in, horas, acesso (só leitura), foto e "Meu perfil".
// A matriz de permissões fica só em Administração › Permissões: #/equipe/acessos redireciona.
export default async function (t) {
  const { page, ok, step } = t;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const notifs = (para, tipo) => ev(([p, ti]) => window.AOS.db.list('notifications', n => n.para === p && (!ti || n.tipo === ti)).length, [para, tipo]);
  const semToasts = () => ev(() => document.querySelectorAll('.toast').forEach(x => x.remove()));
  const confirmar = async () => { await semToasts(); await page.click('.ov-modal [data-ok]'); await page.waitForTimeout(300); };

  await t.login();

  step('visão do time');
  await t.ir('#/equipe');
  await page.waitForSelector('.m-equipe .kpi');
  ok((await page.$$('.m-eq-kpis .kpi')).length === 6, '6 KPIs');
  const txt = await page.textContent('.m-equipe');
  ok(txt.includes('Risco de burnout') && txt.includes('3ª semana'), 'risco de burnout da Ana (3ª semana)');
  ok(txt.includes('118%') && txt.includes('58%'), 'ocupações do documento (118% … 58%)');
  ok((await page.$$('.m-eq-pc')).length === 6, '6 cartões de pessoa');
  ok(await page.isVisible('.m-eq-pc .led.err'), 'LED de sobrecarga');
  ok(txt.includes('Férias até 28/nov'), 'Elisa de férias');
  ok(!(await page.$('.m-equipe .ph a[href="#/equipe/acessos"]')), 'sem botão "Permissões" no cabeçalho (fica em Administração)');
  const com = (await page.textContent('.m-eq-com')).replace(/\s+/g, ' ');
  ok(com.includes('Comissões variáveis do mês: R$ 1.114 · 3 pessoas') && await page.isVisible('a.m-eq-com[href="#/financeiro/comissoes"]'), `card de comissões do mês → Financeiro › Comissões (${com})`);
  ok(!/\bNPS\b/.test(txt), 'Equipe sem NPS');

  step('perfil: todas as abas');
  for (const aba of ['', '/performance', '/evolucao', '/clientes', '/horas', '/comissoes', '/acesso']) {
    await t.ir(`#/equipe/t-ana${aba}`);
    ok(await page.isVisible('.m-equipe .tabs'), `aba ${aba || 'agora'} renderiza`);
  }
  await t.ir('#/equipe/t-ana/performance');
  ok((await page.$$('.m-eq-fx')).length >= 8, 'indicadores com faixa do time');
  await t.ir('#/equipe/t-ana/clientes');
  ok((await page.textContent('.m-equipe')).includes('Overservicing'), 'alerta de overservicing');
  await t.ir('#/equipe/t-diego/performance');
  ok((await page.textContent('.m-equipe')).includes('SLA de 1ª resposta'), 'SLA para atendimento');
  ok((await page.textContent('.m-equipe')).includes('Health médio dos clientes') && !/\bNPS\b/.test(await page.textContent('.m-equipe')), 'performance com health médio e sem NPS');
  await t.ir('#/equipe/t-bruno/evolucao');
  ok(!/\bNPS\b/.test(await page.textContent('.m-equipe')), 'metas sem NPS');

  step('comissões: dono vê de qualquer pessoa');
  await t.ir('#/equipe/t-ana/comissoes');
  const cA = (await page.textContent('.m-equipe')).replace(/\s+/g, ' ');
  ok(cA.includes('Grupo Orion') && cA.includes('R$ 300') && cA.includes('Construtora Alfa') && cA.includes('R$ 230') && cA.includes('R$ 530'), `comissões da Ana com total mensal (R$ 530)`);
  ok(cA.includes('2% do MRR'), 'dono vê o tipo (% do MRR)');
  await t.ir('#/equipe/t-diego/comissoes');
  ok((await page.textContent('.m-equipe')).includes('Encerra em ≤ 1 mês'), 'Studio Fit encerra em ≤ 1 mês');
  await t.ir('#/equipe/t-carla/comissoes');
  ok((await page.textContent('.m-equipe')).includes('Encerrada'), 'comissão encerrada no histórico');

  step('redistribuir tarefas da Ana');
  const antesCarla = await notifs('u-carla', 'atribuicao'), antesAna = await notifs('u-ana');
  await t.ir('#/equipe/t-ana?acao=redistribuir');
  await page.waitForSelector('.ov-modal .rd');
  const marcadas = await page.$$eval('.rd [name="mover"]:checked', l => l.map(i => i.value));
  ok(marcadas.length >= 2, `sugestões pré-marcadas (${marcadas.join(',')})`);
  ok((await page.textContent('.rd-proj')).includes('→'), 'projeção de ocupação depois da mudança');
  const para12 = await page.$eval('.rd [name="para-tk-12"]', s => s.value);
  await confirmar();
  ok(!(await page.$('.ov-modal')), 'modal fecha');
  ok(!page.url().includes('acao='), 'limpa ?acao=');
  const t12 = await ev(() => window.AOS.db.get('tasks', 'tk-12'));
  ok(t12.respId === para12 && t12.respId !== 't-ana', `tk-12 passou para ${t12.respId}`);
  ok(await notifs('u-ana') === antesAna + 1, 'Ana notificada');
  if (para12 === 't-carla') ok(await notifs('u-carla', 'atribuicao') === antesCarla + 1, 'quem recebe é notificado');
  ok(await ev(() => window.AOS.db.find('teamStats', s => s.teamId === 't-ana').ajusteH) < 0, 'ocupação projetada da Ana reduzida');
  ok((await page.textContent('#toasts')).includes('→'), 'toast mostra a ocupação antes → depois');
  await page.click('.toast:last-child [data-desfazer]'); await page.waitForTimeout(300);
  ok((await ev(() => window.AOS.db.get('tasks', 'tk-12'))).respId === 't-ana', 'Desfazer devolve a tarefa');

  step('elogio, 1:1, combinados e metas');
  await t.ir('#/equipe/t-bruno/evolucao');
  const antesB = await notifs('u-bruno');
  await page.click('[data-eq="elogio"]'); await page.waitForSelector('.ov-modal textarea');
  await confirmar();
  ok(await page.isVisible('.ov-modal .fld-err'), 'elogio vazio é bloqueado');
  await page.fill('.ov-modal textarea', 'Excelente condução da renovação da Clínica Vida!');
  await confirmar();
  ok(await notifs('u-bruno') === antesB + 1, 'Enviar elogio notifica a pessoa');
  ok((await page.textContent('.m-eq-fb')).includes('Excelente condução'), 'elogio aparece no perfil');
  const nOo = await ev(() => window.AOS.db.count('oneOnOnes', o => o.teamId === 't-bruno'));
  await page.click('[data-eq="umaum"]'); await page.waitForSelector('.ov-modal [name="notas"]');
  await page.fill('.ov-modal [name="notas"]', 'Conversamos sobre a Bella Moda.');
  await page.fill('.ov-modal [name="combinados"]', 'Alinhar fluxo de aprovação\nEnviar calendário até dia 25');
  await confirmar();
  ok(await ev(() => window.AOS.db.count('oneOnOnes', o => o.teamId === 't-bruno')) === nOo + 1, '1:1 registrado');
  await semToasts();
  await page.check('.m-eq-comb input:not(:checked)'); await page.waitForTimeout(200);
  ok((await page.textContent('#toasts')).includes('Combinado concluído'), 'combinado marcado');
  await t.ir('#/equipe/t-ana/evolucao');
  await page.click('[data-meta="g-ana-2"]'); await page.waitForSelector('.ov-modal [name="atual"]');
  await page.fill('.ov-modal [name="atual"]', '60'); await confirmar();
  ok((await ev(() => window.AOS.db.get('goals', 'g-ana-2'))).atual === 60, 'progresso da meta atualizado');

  step('horas');
  await t.ir('#/equipe/t-ana/horas');
  const nTe = await ev(() => window.AOS.db.count('timeEntries'));
  await page.click('[data-eq="horas"]'); await page.waitForSelector('.ov-modal [name="horas"]');
  await page.fill('.ov-modal [name="horas"]', '2'); await page.selectOption('.ov-modal [name="clientId"]', 'c-orion'); await page.fill('.ov-modal [name="desc"]', 'Teste de campanha');
  await confirmar();
  ok(await ev(() => window.AOS.db.count('timeEntries')) === nTe + 1, 'horas lançadas');

  step('atividade e check-in');
  await t.ir('#/equipe/atividade');
  ok((await page.$$('.m-eq-fi')).length >= 10, 'feed do time');
  ok((await page.textContent('.m-equipe')).includes('Com bloqueio'), 'check-ins com bloqueio destacados');
  await page.click('[data-eq="checkin"]'); await page.waitForSelector('.ov-modal [name="fiz"]');
  await page.fill('.ov-modal [name="fiz"]', 'Revisei a operação'); await page.fill('.ov-modal [name="farei"]', 'Reunião com a TechNova');
  await confirmar();
  ok(await ev(() => !!window.AOS.db.find('checkins', c => c.teamId === 't-gabriel')), 'check-in salvo');
  await t.ir('#/equipe/atividade?pessoa=t-ana');
  const quem = await page.$$eval('.m-eq-fi .av', l => [...new Set(l.map(a => a.textContent.trim()))]);
  ok(quem.length === 1 && quem[0] === 'AS', 'filtro por pessoa na URL');

  step('permissões: só em Administração; perfil mostra o efetivo');
  await t.ir('#/equipe/acessos');
  await page.waitForTimeout(400);
  ok(/#\/admin\/permissoes/.test(page.url()), `rota antiga redireciona para Administração › Permissões (${page.url().split('#')[1]})`);
  await t.ir('#/equipe/t-carla/acesso');
  ok(!(await page.$('.m-equipe select[data-perm]')), 'aba Acesso é só leitura');
  ok(await page.isVisible('.m-equipe a[href="#/admin/permissoes"]'), 'link "Editar em Administração" para o dono');
  await t.ir('#/equipe/t-paulo/acesso');
  await page.click('[data-eq="ativo"]'); await page.waitForSelector('.ov-modal'); await confirmar();
  ok(await ev(() => window.AOS.db.get('users', 'u-paulo').ativo) === false, 'desativar acesso');
  await page.click('.toast:last-child [data-desfazer]'); await page.waitForTimeout(250);
  ok(await ev(() => window.AOS.db.get('users', 'u-paulo').ativo) === true, 'Desfazer reativa');

  step('foto: a própria pessoa troca pelo perfil');
  await t.ir('#/equipe/t-gabriel');
  await page.click('[data-eq="foto"]'); await page.waitForSelector('.mbox [data-foto-campo]');
  await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await page.waitForTimeout(150);
  ok(await page.isVisible('.mbox .mb-err, .mbox [role="alert"]:not([hidden])'), 'sem mudança: avisa em vez de salvar');
  const png = await ev(() => { const c = document.createElement('canvas'); c.width = 30; c.height = 50; const g = c.getContext('2d'); g.fillStyle = '#2a6'; g.fillRect(0, 0, 30, 50); return c.toDataURL('image/png').split(',')[1]; });
  await page.setInputFiles('.mbox [data-foto-file]', { name: 'eu.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForSelector('.mbox .m-eq-foto-pv img');
  await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await page.waitForTimeout(300);
  ok(/^data:image\/jpeg/.test(await ev(() => window.AOS.db.get('team', 't-gabriel').foto || '')), 'foto salva no próprio cadastro');
  ok(await page.isVisible('.m-eq-ph img.av-img'), 'avatar do perfil mostra a foto');
  await page.click('.toast:last-child [data-desfazer]'); await page.waitForTimeout(250);
  ok(!(await ev(() => window.AOS.db.get('team', 't-gabriel').foto)), 'Desfazer remove a foto');

  step('comissões: a pessoa vê só as próprias, só em R$');
  await t.login('ana@agencia.demo');
  await t.ir('#/equipe/t-ana');
  ok(await page.isVisible('.m-equipe .tabs a[href$="/comissoes"]'), 'Ana vê a aba Comissões no próprio perfil');
  await t.ir('#/equipe/t-ana/comissoes');
  const tab = (await page.$$eval('.m-equipe .card', e => e.map(x => x.textContent).join(' '))).replace(/\s+/g, ' ');
  ok(tab.includes('Grupo Orion') && tab.includes('R$ 300') && tab.includes('Construtora Alfa') && tab.includes('R$ 230'), 'Ana vê as próprias comissões em R$');
  ok(!/MRR|%/.test(tab), `sem MRR nem % para a Ana (${tab.slice(0, 160)})`);
  ok(!tab.includes('Clínica Vida') && !tab.includes('Studio Fit'), 'não vê comissões de outras pessoas');
  await t.ir('#/equipe/t-bruno/comissoes');
  ok((await page.textContent('.m-equipe')).includes('Acesso restrito'), 'Ana não abre comissões do Bruno');
  ok(!(await page.$('.m-eq-com')), 'sem resumo de comissões do time');

  step('não gestores veem só o próprio perfil');
  await t.login('felipe@agencia.demo');
  await t.ir('#/equipe');
  ok((await page.textContent('.ph h1')).includes('Meu perfil'), '"Meu perfil" para produção');
  await t.ir('#/equipe/t-ana');
  ok((await page.textContent('.m-equipe')).includes('Acesso restrito'), 'perfil de outra pessoa bloqueado');
  await t.ir('#/equipe/t-felipe');
  ok(await page.isVisible('.m-eq-ph [data-eq="foto"]'), 'produção troca a própria foto');
  await t.ir('#/equipe/acessos');
  await page.waitForTimeout(300);
  ok((await page.textContent('.m-equipe')).includes('Permissões mudaram de lugar') && await page.isVisible('a[href="#/equipe/t-felipe/acesso"]'), 'rota antiga explica onde ficou e leva ao próprio acesso');
  await t.ir('#/equipe/atividade');
  ok((await page.textContent('.ph h1')).includes('Minha atividade'), 'atividade só própria');
}
