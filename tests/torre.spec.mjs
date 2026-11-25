// tests/torre.spec.mjs — Torre de Controle › Rotinas e integrações, log, Painel de Voo, permissões.
export default async function (t) {
  const { page, ok, step } = t;
  const db = (fn, arg) => page.evaluate(fn, arg);
  const okModal = async () => { await page.click('.ov-modal [data-ok]'); await page.waitForTimeout(350); };

  await t.login();

  step('rotinas: resumo e lista');
  await t.ir('#/torre');
  await page.waitForSelector('.m-torre-r');
  ok((await page.$$('.m-torre-r')).length === 16, 'lista 16 rotinas (15 do documento + Guardião de segurança)');
  const sum = await page.$$eval('.m-torre-sum-i b', els => els.map(e => e.textContent.trim()));
  ok(sum.join(',') === '12,2,1,1', `resumo ok 12 · warn 2 · err 1 · off 1 (${sum})`);
  ok((await page.$$('.m-torre-r .h30')).length >= 16, 'histórico 30 dias em todas as rotinas');
  ok((await page.textContent('.m-torre-r.s-err')).includes('OAuthException 190'), 'erro do Sync de leads visível');
  ok((await page.textContent('.m-torre-r.s-err')).includes('86,7%'), 'sucesso 30d 86,7%');
  ok((await page.$$('.m-torre-int')).length === 8, '8 integrações');
  ok((await page.textContent('.m-torre-int.s-err')).includes('Token expirado'), 'Meta Ads em falha');
  ok((await page.$$('.m-torre-tl-l')).length === 7, `linha do tempo com 7 rotinas (${(await page.$$('.m-torre-tl-l')).length})`);
  ok((await page.$$('.m-torre-tl-l:first-of-type .m-torre-dot.s-err, .m-torre-dot.s-err')).length >= 2, 'falhas 23:12 e 23:42 na linha do tempo');
  ok((await page.textContent('.nv [data-mod="torre"] .cnt')).trim() === '1', 'contador da Torre = 1');
  const u1 = await page.textContent('[data-upd]'); await t.espera(1300); const u2 = await page.textContent('[data-upd]');
  ok(u1 !== u2 && /há \d+ s|agora/.test(u2), `"atualizado há" ao vivo (${u1} → ${u2})`);

  step('filtro por estado (URL)');
  await t.ir('#/torre?f=err');
  ok((await page.$$('.m-torre-r')).length === 1, 'filtro f=err mostra 1');
  await t.ir('#/torre');

  step('rodar agora: Sync de leads continua falhando sem reconectar');
  await page.click('[data-rodar="r-sync-leads"]');
  await page.waitForSelector('.m-torre-r.is-run');
  ok(true, 'LED de execução aparece');
  await t.espera(2100);
  const r1 = await db(() => window.AOS.db.get('routines', 'r-sync-leads'));
  ok(r1.estado === 'err' && r1.falhas === 3, `continua em falha (${r1.estado}, ${r1.falhas}×)`);
  const a1 = await db(() => window.AOS.db.get('alerts', 'a-sync'));
  ok(a1.titulo.includes('3×') && a1.status === 'aberto', `alerta atualizado (${a1.titulo})`);

  step('log + reconectar Meta resolve a rotina e o alerta');
  await t.ir('#/torre/rotina/r-sync-leads');
  await page.waitForSelector('.m-torre-oq');
  ok((await page.textContent('.m-torre-oq')).includes('Token do Meta expirou'), 'bloco "O que fazer"');
  ok((await page.$$('.tbl tbody tr')).length >= 18, 'log de execuções');
  await page.click('.m-torre-oq [data-reconectar]');
  await page.waitForSelector('.ov-modal');
  ok((await page.textContent('.ov-modal')).includes('servidor'), 'modal OAuth explica token no servidor');
  await page.click('.ov-modal [data-ok]');
  await t.espera(3200);
  const st = await db(() => ({ r: window.AOS.db.get('routines', 'r-sync-leads').estado, i: window.AOS.db.get('integrations', 'i-meta').estado, a: window.AOS.db.get('alerts', 'a-sync').status }));
  ok(st.i === 'ok' && st.r === 'ok' && st.a === 'resolvido', `reconectado → rotina ok e alerta resolvido (${JSON.stringify(st)})`);
  ok((await page.textContent('#ml')).includes('1 alerta crítico'), `luz mestra: ${await page.textContent('#ml')}`);

  step('pausar e retomar (com confirmação)');
  await t.ir('#/torre');
  await page.click('[data-pausar="r-renovacoes"]'); await page.waitForSelector('.ov-modal'); await okModal();
  ok((await db(() => window.AOS.db.get('routines', 'r-renovacoes').estado)) === 'off', 'rotina pausada');
  await t.espera(200);
  await page.click('[data-retomar="r-backup"]'); await page.waitForSelector('.ov-modal'); await okModal();
  await t.espera(1900);
  ok((await db(() => window.AOS.db.get('routines', 'r-backup').estado)) === 'ok', 'backup retomado e rodou');

  step('nova rotina com validação');
  await page.click('[data-nova-rotina]'); await page.waitForSelector('.ov-modal');
  await page.click('.ov-modal [data-ok]'); await t.espera(150);
  ok((await page.$$('.ov-modal .fld-err')).length >= 3, 'erros de validação antes de salvar');
  await page.fill('.ov-modal [name="nome"]', 'Sync de leads TikTok → CRM');
  await page.fill('.ov-modal [name="desc"]', 'Puxa os leads do TikTok e cria contatos no CRM');
  await page.selectOption('.ov-modal [name="freqMin"]', '30');
  await page.selectOption('.ov-modal [name="respId"]', 't-felipe');
  await page.check('.ov-modal [name="canais"][value="slack"]');
  await okModal();
  ok((await db(() => window.AOS.db.count('routines'))) === 17, 'rotina criada');
  await t.espera(200);
  ok((await page.$$('.m-torre-r')).length === 17, 'aparece na lista');

  step('testar integração');
  await page.click('[data-testar="i-crm"]'); await t.espera(1100);
  ok((await page.textContent('#toasts')).includes('CRM'), 'teste de conexão mostra resultado');

  step('deep link reconectar e Painel de Voo');
  await t.ir('#/torre?reconectar=i-crm'); await page.waitForSelector('.ov-modal');
  ok((await page.textContent('.ov-modal h2')).includes('CRM'), 'abre reconexão pelo link');
  await page.keyboard.press('Escape'); await t.espera(200);
  await page.keyboard.press('Escape'); await t.espera(150);

  /* ================= Painel de Voo nativo (item 17) ================= */
  const voo = (fn, arg) => page.evaluate(fn, arg);
  const semGerenciador = async () => !(await page.$$eval('a[href]', l => l.some(a => /facebook\.com\/adsmanager|business\.facebook\.com|adsmanager/i.test(a.href))));
  const abrirConta = async (id, aba) => { await t.ir(`#/torre/voo/${id}${aba ? `?aba=${aba}` : ''}`); await page.waitForSelector(`[data-voo-conta="${id}"]`, { timeout: 6000 }); await page.waitForTimeout(150); };
  const digitarSIM = async v => { await page.fill('.ov-modal [name="sim"]', v); await page.waitForTimeout(60); };

  step('Painel de Voo: visão geral nativa (sem iframe)');
  await voo(() => { localStorage.removeItem('aos-voo-demo-semtoken'); window.AOS_VOO.demoReset(); window.AOS_VOO_ATRASO = 0; });
  await t.ir('#/torre/voo'); await page.waitForSelector('.m-voo-contas tbody tr', { timeout: 6000 });
  ok(!(await page.$('iframe')) && !(await page.$('.m-torre-voo-host')), 'sem iframe da Torre antiga');
  ok((await page.$$('.m-voo-contas tbody tr')).length === 17, `17 contas fictícias (${(await page.$$('.m-voo-contas tbody tr')).length})`);
  ok((await page.$$('.m-voo-kpis .kpi')).length === 5, '5 indicadores no topo');
  ok(await page.isVisible('.m-voo-fila'), 'fila "Comece por aqui"');
  const txtG = await page.textContent('#view');
  ok(txtG.includes('Criar ou subir campanha: somente pelo Gerenciador, via 4G.'), 'aviso "somente pelo Gerenciador, via 4G"');
  ok(/atualizado há|atualizado agora/.test(txtG), '"atualizado há X" visível');
  ok(/alguns minutos de atraso/.test(txtG), 'nota honesta sobre o atraso do Meta');
  ok(await semGerenciador(), 'nenhum link para o Gerenciador de Anúncios');
  const sems = await page.$$eval('.m-voo-contas .m-voo-sem', l => l.map(x => x.textContent.trim()));
  ok(['Crítico', 'Conta parada', 'Caro', 'Atenção', 'Dados insuficientes', 'Sem CP de MSG', 'Bom', 'Excelente'].every(x => sems.includes(x)), `semáforo cobre todos os estados (${[...new Set(sems)].join(', ')})`);
  await t.ir('#/torre/voo?f=atencao'); await page.waitForTimeout(200);
  const nAt = (await page.$$('.m-voo-contas tbody tr')).length;
  ok(nAt > 0 && nAt < 17, `filtro "Precisa de atenção" na URL (${nAt})`);

  step('Painel de Voo: vincular conta sem cliente');
  await t.ir('#/torre/voo'); await page.waitForSelector('.m-voo-vincs');
  ok((await page.$$('.m-voo-vl')).length === 3, '3 contas sem cliente vinculado');
  await page.selectOption('[data-voo-vinc-sel="9000000000000191"]', 'c-casabela'); await page.click('[data-voo-vinc="9000000000000191"]'); await page.waitForTimeout(350);
  ok(await voo(() => (window.AOS.db.get('clients', 'c-casabela').metaContas || []).includes('9000000000000191')), 'conta gravada no cadastro do cliente (metaContas)');
  ok((await page.$$('.m-voo-vl')).length === 2, 'some da lista de sem cliente');

  step('Painel de Voo: detalhe ao vivo, "por quê" e recomendações');
  await abrirConta('9000000000000101');
  ok(/atualizado agora/.test(await page.textContent('.ph')), 'detalhe mostra "atualizado agora" (busca ao vivo ao abrir)');
  ok(await page.$eval('[data-voo-atualizar]', b => b.disabled), '"Atualizar agora" respeita 20 s entre buscas');
  ok(/índice/.test(await page.textContent('.m-voo-pq')) && await page.$eval('.m-voo-pq', d => d.open), '"Por que Crítico?" aberto com o índice');
  ok((await page.$$('.m-voo-rec')).length >= 1, 'recomendações do motor único');
  ok(/teto do cliente/i.test(await page.textContent('.m-voo-inv')), 'frase do investimento diário com o teto do cliente');
  const r0 = await page.$eval('.m-voo-rec', li => li.dataset.rec);
  await page.click(`[data-rec-recusar="${r0}"]`); await page.waitForTimeout(250);
  ok(await voo(id => window.AOS.db.count('recsLog', x => x.origem === 'torre' && x.recId === id && x.decisao === 'recusada'), r0) === 1, 'decisão gravada em recsLog');
  ok(await semGerenciador(), 'detalhe sem link para o Gerenciador');
  const tAuto = await voo(() => { const i = window.AOS_VOO.estado.contas.get('9000000000000101'); return Date.parse(i.em); });
  await voo(() => { const i = window.AOS_VOO.estado.contas.get('9000000000000101'); i.em = new Date(Date.now() - 125000).toISOString(); i.proxima = 0; });
  await page.waitForFunction(t0 => { const i = window.AOS_VOO.estado.contas.get('9000000000000101'); return i && !i.carregando && Date.parse(i.em) > t0; }, tAuto, { timeout: 15000 });
  ok(true, 'atualização automática a cada 2 min com a aba visível');

  step('Painel de Voo: receita só para Dono/Admin');
  await abrirConta('9000000000000107');
  ok(/Faturamento 7d/.test(await page.textContent('.m-voo-kpis')), 'dono vê faturamento/ROAS da conta de vendas');

  step('Painel de Voo: pausar com SIM e "aguardando confirmação do Meta"');
  await voo(() => { window.AOS_VOO_ATRASO = 60000; });
  await abrirConta('9000000000000105', 'campanhas');
  ok(/somente pelo Gerenciador, via 4G/.test(await page.textContent('.m-voo-4g')), 'aviso 4G na aba Campanhas');
  await page.$$eval('details.lv-s', l => l.forEach(d => { d.open = true; })); await page.waitForTimeout(100);
  const ad = await page.$eval('.m-voo-ad [data-voo-pausar]', b => b.dataset.vooPausar);
  await page.click(`[data-voo-pausar="${ad}"]`); await page.waitForSelector('.ov-modal [name="sim"]');
  ok(await page.$eval('.ov-modal [data-ok]', b => b.disabled), 'confirmar desabilitado sem SIM');
  await digitarSIM('sim'); ok(await page.$eval('.ov-modal [data-ok]', b => b.disabled), '"sim" minúsculo não libera');
  await digitarSIM('SIM'); ok(!(await page.$eval('.ov-modal [data-ok]', b => b.disabled)), 'SIM libera');
  await page.click('.ov-modal [data-ok]'); await page.waitForSelector('.ov-modal', { state: 'detached', timeout: 5000 }); await page.waitForTimeout(900);
  ok(await voo(() => window.AOS.db.count('clientActions', a => a.origem === 'torre' && a.tipo === 'Pausou anuncio')) === 1, 'pausa registrada no histórico do cliente');
  ok(/aguardando confirmação do Meta/.test(await page.textContent('#view')), 'valor aplicado marcado "aguardando confirmação do Meta" (Windsor ainda mostra o antigo)');
  // o Meta/Windsor confirma: a próxima busca ao vivo traz o valor novo e a marca some
  await voo(() => { window.AOS_VOO_ATRASO = 0; window.AOS_VOO.demoConfirmarTudo(); });
  await voo(() => window.AOS_VOO.carregarConta('9000000000000105', { forcar: true, rapido: true })); await page.waitForTimeout(500);
  ok(!/aguardando confirmação do Meta/.test(await page.textContent('#view')), 'busca seguinte confirmou: marca "aguardando" some');
  ok(await voo(a => window.AOS_VOO.statusCampanhas('9000000000000105') && window.AOS_VOO.modelo('9000000000000105').camps.some(c => c.sets.some(s => s.ads.some(x => x.id === a && x.st === 'PAUSED'))), ad), 'anúncio aparece pausado depois da confirmação');

  step('Painel de Voo: orçamento com teto do cliente e limite de 10 por hora');
  await abrirConta('9000000000000106', 'campanhas');
  await page.$$eval('details.lv-s', l => l.forEach(d => { d.open = true; })); await page.waitForTimeout(100);
  const orcId = await page.$eval('[data-voo-orc]', b => b.dataset.vooOrc);
  for (let k = 1; k <= 10; k++) {
    await page.click(`[data-voo-orc="${orcId}"]`); await page.waitForSelector('.ov-modal [name="valor"]');
    await page.fill('.ov-modal [name="valor"]', k === 1 ? '900000' : String(4000 + k * 100));
    if (k === 1) { await page.dispatchEvent('.ov-modal [name="valor"]', 'input'); ok(/Passa do teto do cliente/.test(await page.textContent('.ov-modal')), 'aviso "passa do teto do cliente" antes de confirmar'); ok(/Aumento acima de/.test(await page.textContent('.ov-modal')), 'aviso de aumento grande (aprendizado)'); }
    await page.click('.ov-modal [data-ok]'); await page.waitForSelector('.ov-modal [name="sim"]');
    await digitarSIM('SIM'); await page.click('.ov-modal [data-ok]'); await page.waitForSelector('.ov-modal', { state: 'detached', timeout: 5000 }); await page.waitForTimeout(700);
    await page.evaluate(() => document.querySelectorAll('.toasts > *, .toast').forEach(x => x.remove()));
  }
  ok(await voo(() => window.AOS.db.count('clientActions', a => a.origem === 'torre' && a.tipo === 'Orçamento alterado')) === 10, '10 mudanças de orçamento registradas');
  await page.waitForTimeout(300);
  await page.click(`[data-voo-orc="${orcId}"]`); await page.waitForTimeout(400);
  ok(!(await page.$('.ov-modal [name="valor"]')) && /no máximo 10 mudanças/.test(await page.textContent('#toasts')), '11ª mudança na mesma hora bloqueada');
  let lim = null; try { await voo(o => window.AOS_VOO.executarAcao({ acao: 'orcamento', nivel: 'campanha', id: o, conta: '9000000000000106', valor: 777 }), orcId); } catch (e) { lim = String(e.message); }
  ok(lim && /no máximo 10/.test(lim), 'limite também na camada de envio (não só no botão)');

  step('Painel de Voo: pedir criativo e avisar cliente');
  await abrirConta('9000000000000105');
  await page.click('.ph [data-voo-criativo]'); await page.waitForSelector('.ov-modal [name="para"]');
  ok(await page.$eval('.ov-modal [name="para"]', s => s.value) === 't-carla', 'Para quem já sugere a Carla');
  await page.click('.ov-modal [data-ok]'); await page.waitForTimeout(400);
  const tk = await voo(() => window.AOS.db.find('tasks', x => x.origem === 'torre'));
  ok(tk && tk.respId === 't-carla' && tk.clientId === 'c-bella' && /^Novo criativo · /.test(tk.titulo), 'tarefa na Operação para a Carla, ligada ao cliente');
  ok(await voo(id => window.AOS.db.count('notifications', n => n.para === 'u-carla' && n.link === `#/operacao/quadro?tarefa=${id}`), tk && tk.id) === 1, 'Carla notificada');
  await page.evaluate(() => document.querySelectorAll('.toasts > *, .toast').forEach(x => x.remove()));
  await page.click('.ph [data-voo-avisar]'); await page.waitForSelector('.ov-modal [name="mensagem"]');
  await page.click('.ov-modal [data-ok]'); await page.waitForTimeout(300);
  ok(await voo(() => window.AOS.db.count('clientActions', a => a.clientId === 'c-bella' && a.origem === 'torre' && /avisado/.test(a.tipo))) === 1, 'aviso ao cliente registrado');
  await t.ir('#/torre/voo/9000000000000105?aba=historico'); await page.waitForSelector('.m-voo-hist');
  ok((await page.$$('.m-voo-hist li')).length >= 3, 'histórico da conta com quem, o quê e antes → depois');

  step('Painel de Voo: sem token do Meta = botões desligados com explicação');
  await voo(() => { localStorage.setItem('aos-voo-demo-semtoken', '1'); window.AOS_VOO.demoReset(); });
  await abrirConta('9000000000000102', 'campanhas');
  ok(await page.$$eval('[data-voo-pausar],[data-voo-orc]', l => l.length > 0 && l.every(b => b.disabled && /token do usuário do sistema/.test(b.title))), 'pausar/orçamento desabilitados com o motivo');
  ok(/aguardando o token do usuário do sistema/.test(await page.textContent('#view')), 'aviso "aguardando o token"');
  await voo(() => { localStorage.removeItem('aos-voo-demo-semtoken'); window.AOS_VOO.demoReset(); });

  step('Painel de Voo: "Ver como" é só visualização');
  await voo(() => window.AOS.auth.verComo('u-ana')); await page.waitForTimeout(300);
  await abrirConta('9000000000000101', 'campanhas');
  ok(await page.$$eval('[data-voo-pausar],[data-voo-orc]', l => l.length > 0 && l.every(b => b.disabled)), 'ações desabilitadas em "ver como"');
  let vc = null; try { await voo(() => window.AOS_VOO.executarAcao({ acao: 'pausar', nivel: 'anuncio', id: '1', conta: '9000000000000101' })); } catch (e) { vc = String(e.message); }
  ok(vc && /Ver como/.test(vc), 'envio recusado em "ver como"');
  await voo(() => window.AOS.auth.voltar()); await page.waitForTimeout(300);

  step('Painel de Voo: ponte do Guardião (invasão vinda do servidor) → alerta, notificações e sirene');
  await voo(d => window.AOS_VOO.guardiaoInvasao(d), { evento: 'invasao', incidente: { id: '<script>', achados: [], pausados: [] } });
  ok(await voo(() => window.AOS.db.count('alerts', a => a.tipo === 'invasao') === 0), 'incidente malformado é ignorado');
  const incT = { id: 'inc-7-teste', tipo: 'invasao', nivel: 'supremo', estado: 'aberto', contaId: '9000000000000110', contaNome: 'Conta Teste', abertoEm: new Date().toISOString(), motivo: 'regra crítica',
    achados: [{ chave: 'admin-novo:e1', regraId: 'admin-novo', severidade: 'critica', quando: new Date().toISOString(), titulo: 'Novo acesso à conta', detalhe: 'Parceiro X' }],
    pausados: [{ id: '900000000000011001', nome: '[MSG] A', cbo: true, orcAtual: 300, orcAntes: 60, conjuntos: [] }], reincidencias: [], assumidoPor: [] };
  await voo(inc => window.AOS_VOO.guardiaoInvasao({ evento: 'invasao', incidente: inc, pausadas: 1 }), incT);
  await page.waitForSelector('#aos-inv', { timeout: 3000 });
  const ponte = await voo(() => { const db = window.AOS.db; return { a: !!db.get('alerts', 'inc-7-teste'), n: db.list('notifications', n => n.refId === 'inc-7-teste' && n.prioridade === 'critica').map(n => n.para).sort().join() }; });
  ok(ponte.a && ponte.n === 'u-ana,u-gabriel,u-rayane', `alerta + notificação crítica para gestora, dono e admin (${ponte.n})`);
  await page.click('[data-inv-assumir]'); await page.waitForTimeout(200);
  await abrirConta('9000000000000110', 'campanhas');
  ok(await page.isVisible('.m-voo-qb') && await page.$$eval('[data-voo-pausar],[data-voo-orc]', l => l.every(b => b.disabled)), 'conta em quarentena: faixa e ações bloqueadas');
  if (!t.mobile) {
    step('busca global');
    await t.ir('#/torre');
    await page.fill('#gs-in', 'sync de leads'); await t.espera(300);
    ok((await page.textContent('.gs-pop')).includes('Sync de leads'), 'busca encontra rotina');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  }

  step('permissão: gestor de tráfego só vê');
  await t.sair(); await t.login('ana@agencia.demo');
  await t.ir('#/torre'); await page.waitForSelector('.m-torre-r');
  ok(await page.$eval('[data-rodar="r-health"]', b => b.disabled), 'Rodar agora desabilitado');
  ok(await page.$eval('[data-nova-rotina]', b => b.disabled), 'Nova rotina desabilitada');

  step('Painel de Voo da Ana (gestora): abre em "Meus clientes", vê todas as contas vinculadas, sem receita');
  await t.ir('#/torre/voo'); await page.waitForSelector('.m-voo-contas tbody tr', { timeout: 6000 });
  const esperadas = await voo(() => { const db = window.AOS.db; const ids = new Set(db.list('clients', c => c.respId === 't-ana' || (c.equipe || []).includes('t-ana')).flatMap(c => c.metaContas || [])); return ids.size; });
  ok((await page.$$('.m-voo-contas tbody tr')).length === esperadas && esperadas > 0 && esperadas < 17, `abre em "Meus clientes": só as contas dos clientes dela (${esperadas})`);
  ok(await page.$eval('.m-voo-chips [aria-current="true"]', a => /Meus clientes/.test(a.textContent)), 'filtro padrão "Meus clientes" marcado');
  const vinculadas = await voo(() => new Set(window.AOS.db.list('clients').flatMap(c => c.metaContas || [])).size);
  await t.ir('#/torre/voo?f=todas'); await page.waitForTimeout(300);
  ok((await page.$$('.m-voo-contas tbody tr')).length === vinculadas && vinculadas > esperadas, `"Todas": as ${vinculadas} contas vinculadas a clientes (cobre colega)`);
  ok(await voo(() => window.AOS_VOO.estado.geral.contas.every(c => c.clientId)), 'nenhuma conta sem cliente para a gestora');
  const alheia = await voo(() => { const c = window.AOS.db.list('clients', c => (c.metaContas || []).length && c.respId !== 't-ana' && !(c.equipe || []).includes('t-ana'))[0]; return String(c.metaContas[0]).replace(/\D/g, ''); });
  await abrirConta(alheia, 'campanhas');
  ok(!/não está no seu Painel de Voo/.test(await page.textContent('#view')) && !!(await page.$('[data-voo-pausar],[data-voo-orc]')), 'gestora abre e pode agir na conta de cliente de outro responsável');
  ok(!(await page.$('.m-voo-vincs')), 'sem "Contas sem cliente vinculado" para gestor');
  ok(await voo(() => window.AOS_VOO.estado.geral.linhas.every(l => l[10] == null) && window.AOS_VOO.estado.geral.veReceita === false), 'pacote sem valores de receita (faturamento)');
  await abrirConta('9000000000000107');
  ok(!/Faturamento/.test(await page.textContent('#view')), 'gestora não vê faturamento/ROAS');
  await t.ir('#/torre/voo/9000000000000192'); await page.waitForTimeout(1200);
  ok(/não está no seu Painel de Voo/.test(await page.textContent('#view')), 'conta sem cliente vinculado não abre para a gestora');
  const dia = await page.evaluate(() => new Date().getDay());
  await t.ir('#/torre/voo'); await page.waitForTimeout(400);
  if (dia === 1) ok(!(await page.$('[data-voo-rel]')), 'segunda-feira: sem faixa');
  else {
    ok(await page.isVisible('[data-voo-rel]'), 'faixa "Terça é dia de relatório" visível para a gestora');
    ok(/0 de \d+ enviados/.test(await page.textContent('[data-voo-rel]')), 'faixa com progresso');
    await page.click('[data-voo-rel-ir]'); await page.waitForTimeout(400);
    ok(/#\/mesa\?o=relatorio/.test(page.url()), '"Ver pendentes" abre a mesa filtrada');
  }
  step('cadastro do cliente: contas Meta só Dono/Admin/Head editam');
  await t.ir('#/clientes/c-orion/cadastro?editar=1'); await page.waitForSelector('#m-clientes-cad');
  ok(!(await page.$('#m-clientes-cad [name="metaContas"]')) && !!(await page.$('#m-clientes-cad [name="metaCustoConversa"]')), 'gestora vê as contas, mas não edita o vínculo');
  await t.sair(); await t.login('allan@agencia.demo');
  await t.ir('#/clientes/c-orion/cadastro?editar=1'); await page.waitForSelector('#m-clientes-cad [name="metaContas"]');
  ok(/act_9000000000000101/.test(await page.inputValue('#m-clientes-cad [name="metaContas"]')), 'Head de Tráfego edita as contas Meta do cliente');
  await t.ir('#/torre/voo'); await page.waitForSelector('.m-voo-contas tbody tr', { timeout: 6000 });
  ok((await page.$$('.m-voo-contas tbody tr')).length === 17 && await page.isVisible('.m-voo-vincs'), 'Head vê todas as contas e as sem cliente');

  step('permissão: financeiro sem acesso');
  await t.sair(); await t.login('paulo@agencia.demo');
  await t.ir('#/torre');
  ok((await page.textContent('#view')).includes('Acesso restrito'), 'acesso restrito');
  await t.ir('#/torre/voo');
  ok((await page.textContent('#view')).includes('Acesso restrito'), 'Painel de Voo restrito');
}
