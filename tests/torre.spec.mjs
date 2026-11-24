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
  await t.ir('#/torre/voo'); await page.waitForSelector('.m-torre-voo-host iframe', { state: 'attached' });
  const src = await page.$eval('.m-torre-voo-host iframe', f => f.getAttribute('src'));
  ok(/torre-controle\.html\?embed=1&tema=claro/.test(src), 'iframe carrega a Torre com ?embed=1&tema=claro');
  ok(/torre-controle\.html$/.test(await page.$eval('.m-torre-voo-ext', a => a.getAttribute('href'))), '"Abrir em nova aba" abre a versão completa (sem embed)');
  await page.waitForFunction(() => { const f = document.querySelector('.m-torre-voo-host iframe'); try { return f.contentDocument && f.contentDocument.querySelector('#etabs .etab'); } catch (e) { return false; } }, null, { timeout: 8000 });
  const fr = page.frames().find(f => /torre-controle/.test(f.url()));
  ok(!!fr, 'frame da Torre encontrado');
  const dentro = await fr.evaluate(() => ({
    selo: !!document.querySelector('.selo-sw') || /B · Etiqueta|A · Marcador/.test(document.body.innerText),
    side: getComputedStyle(document.querySelector('.side')).display, sino: getComputedStyle(document.querySelector('#bell-w')).display, tema: getComputedStyle(document.querySelector('.tema')).display,
    abas: [...document.querySelectorAll('#etabs .etab')].map(x => x.textContent.replace(/\d+/g, '').trim()),
  }));
  ok(!dentro.selo, 'sem barra de comparação de selos dentro do iframe');
  ok(dentro.side === 'none' && dentro.sino === 'none' && dentro.tema === 'none', 'Torre embutida sem menu lateral, sino e seletor de tema');
  ok(['Quadro principal', 'Precisa de atenção', 'Contas silenciosas', 'Cadastrar cliente', 'Auditoria'].every(a => dentro.abas.includes(a)), 'abas internas da Torre no topo');
  const caixa = await page.evaluate(() => { const s = document.querySelector('[data-voo-slot]').getBoundingClientRect(), h = document.querySelector('.m-torre-voo-host').getBoundingClientRect(); return { dt: Math.abs(s.top - h.top), dl: Math.abs(s.left - h.left), dw: Math.abs(s.width - h.width), rola: document.documentElement.scrollHeight - innerHeight, alt: h.height, fim: h.bottom }; });
  ok(caixa.dt < 2 && caixa.dl < 2 && caixa.dw < 2, 'iframe alinhado ao espaço da página');
  ok(caixa.rola <= 2, `sem rolagem dupla (página rola ${caixa.rola}px)`);
  ok(caixa.fim <= t.vp.h + 1 && caixa.alt >= 400, 'iframe ocupa até o fim da tela');

  step('Painel de Voo: tema sincronizado sem recarregar');
  await fr.evaluate(() => { window.__marca = 'mesmo-iframe'; });
  await page.evaluate(() => window.AOS.shell.setTema('escuro')); await page.waitForTimeout(300);
  ok(await fr.evaluate(() => document.documentElement.dataset.tema) === 'escuro', 'tema escuro chega na Torre por postMessage');
  ok(await fr.evaluate(() => window.__marca) === 'mesmo-iframe', 'iframe não recarregou');
  ok(/torre-controle-escuro\.html$/.test(await page.$eval('.m-torre-voo-ext', a => a.getAttribute('href'))), 'link da nova aba acompanha o tema');
  await page.evaluate(() => window.AOS.shell.setTema('claro')); await page.waitForTimeout(250);
  ok(await fr.evaluate(() => document.documentElement.dataset.tema) === 'claro', 'volta ao claro');

  step('Painel de Voo: padrões da central chegam na Torre (semáforo e limites de orçamento)');
  const pd0 = await fr.evaluate(() => ({ at: PD('torre.semaforo.atencao'), lim: PD('orcamento.maxMudancasHora'), contas: CONTAS.filter(a => a.sem === 'aten' && a.indice > 1.1).map(a => a.id) }));
  ok(pd0.at === 1.25 && pd0.lim === 4 && pd0.contas.length > 0, `Torre recebeu os padrões de fábrica (Atenção até ${pd0.at}, ${pd0.lim} mudanças/hora)`);
  await page.evaluate(() => window.AOS.db.setConfig('padroes', { 'torre.semaforo.atencao': 1.1, 'orcamento.maxMudancasHora': 2 })); await page.waitForTimeout(350);
  const pd1 = await fr.evaluate(ids => ({ at: PD('torre.semaforo.atencao'), lim: PD('orcamento.maxMudancasHora'), sem: ids.map(i => conta(i).sem) }), pd0.contas);
  ok(pd1.at === 1.1 && pd1.lim === 2, 'padrão salvo no app é repassado ao iframe (Atenção 1,10 · 2 mudanças/hora)');
  ok(pd1.sem.every(s => s === 'caro'), `contas com índice entre 1,10 e 1,25 passam de Atenção para Caro (${pd1.sem})`);
  await page.evaluate(() => window.AOS.db.setConfig('padroes', {})); await page.waitForTimeout(350);
  ok(await fr.evaluate(ids => PD('torre.semaforo.atencao') === 1.25 && ids.every(i => conta(i).sem === 'aten'), pd0.contas), 'restaurar o padrão volta o semáforo na Torre');

  step('Painel de Voo: pedido de criativo vira tarefa para a Carla');
  const equipe = await fr.evaluate(() => (typeof HOST !== 'undefined' && HOST.equipe ? HOST.equipe.slice(0, 2).map(p => p.id) : []));
  ok(equipe[0] === 't-carla' && equipe[1] === 't-elisa', 'Torre recebeu a equipe do app (criativos primeiro)');
  const orion = await page.evaluate(() => window.AOS.db.get('clients', 'c-orion'));
  await fr.evaluate(nome => { window.__resp = null; addEventListener('message', e => { if (e.data && e.data.tipo === 'pedidoCriativoOk') window.__resp = e.data; }); parent.postMessage({ tipo: 'pedidoCriativo', ref: 'pc-teste', cliente: nome, conta: 'act_1', anuncio: 'Reels · depoimento', para: 't-carla', prazo: '2026-11-26', formato: 'video', briefing: 'Novo vídeo com outro gancho nos 3 primeiros segundos. Frequência 3,4 e CTR caiu 38%.', prioridade: 'alta' }, location.origin); }, orion ? orion.nome : 'Cliente de teste');
  await page.waitForTimeout(400);
  const tk = await page.evaluate(() => window.AOS.db.find('tasks', x => x.origem === 'torre'));
  ok(tk && tk.respId === 't-carla' && tk.status === 'afazer' && tk.tipo === 'criativo' && tk.prazo === '2026-11-26' && /^Novo criativo · /.test(tk.titulo) && /gancho/.test(tk.desc), 'tarefa criada na Operação para a Carla');
  ok(tk && tk.clientId === (orion ? 'c-orion' : null), 'tarefa ligada ao cliente pelo nome');
  ok(await page.evaluate(id => window.AOS.db.count('notifications', n => n.para === 'u-carla' && n.tipo === 'atribuicao' && n.link === `#/operacao/quadro?tarefa=${id}`), tk && tk.id) === 1, 'Carla notificada com link para a tarefa');
  if (orion) ok(await page.evaluate(() => window.AOS.db.count('clientActions', a => a.clientId === 'c-orion' && a.origem === 'torre' && a.tipo === 'Novo criativo pedido')) === 1, 'ação registrada no cliente');
  const resp = await fr.evaluate(() => window.__resp);
  ok(resp && resp.ref === 'pc-teste' && resp.tarefaId === (tk && tk.id) && resp.paraNome === 'Carla Dias', 'Torre recebe a confirmação');
  await fr.evaluate(() => parent.postMessage({ tipo: 'pedidoCriativo', cliente: 'X', para: 't-carla', briefing: '' }, location.origin)); await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.AOS.db.count('tasks', x => x.origem === 'torre')) === 1, 'pedido sem briefing é ignorado');
  await page.evaluate(() => window.postMessage({ tipo: 'pedidoCriativo', ref: 'falso', cliente: 'Y', para: 't-carla', briefing: 'mensagem que não veio da Torre' }, '*')); await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.AOS.db.count('tasks', x => x.origem === 'torre')) === 1, 'mensagem de outra origem é ignorada');
  await fr.evaluate(() => parent.postMessage({ tipo: 'pedidoCriativoDesfazer', ref: 'pc-teste' }, location.origin)); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.AOS.db.count('tasks', x => x.origem === 'torre')) === 0 && await page.evaluate(() => window.AOS.db.count('notifications', n => n.para === 'u-carla' && /criativo novo/.test(n.titulo))) === 0, 'Desfazer na Torre remove tarefa e notificação');
  await fr.evaluate(() => parent.postMessage({ tipo: 'clienteAvisado', cliente: 'Cliente sem cadastro', anuncio: 'Reels · dor', mensagem: 'Oi! Precisamos de vídeos novos.' }, location.origin)); await page.waitForTimeout(250);
  ok(await page.evaluate(() => window.AOS.db.count('activity', a => /avisou Cliente sem cadastro para trocar o criativo/.test(a.oque || ''))) === 1, 'cliente avisado registrado na atividade');

  step('Painel de Voo: fluxo real dentro do iframe');
  const idC = await fr.evaluate(() => CONTAS.find(a => a.acao === 'Trocar criativo' && prioridade(a) != null).id);
  await fr.click(`.qi [data-act="crv-pedir"][data-a="${idC}"]`); await fr.waitForSelector('#cr-para');
  ok(await fr.evaluate(() => document.querySelector('#cr-para').value) === 't-carla', 'Para quem já sugere a Carla');
  await fr.click('#modal [data-m="1"]'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => window.AOS.db.count('tasks', x => x.origem === 'torre' && x.respId === 't-carla')) === 1, 'clicar em Pedir criativo cria a tarefa no app');
  const stQ = await fr.evaluate(i => document.querySelector(`.qi [data-act="crv-pedir"][data-a="${i}"]`).closest('.qi').innerText, idC);
  ok(/Criativo pedido a Carla · prazo .* · tarefa criada/.test(stQ), 'fila da Torre mostra o pedido com tarefa criada');

  step('Painel de Voo: sair e voltar mantém o iframe');
  await t.ir('#/torre'); await page.waitForSelector('.m-torre-r');
  ok(await page.$eval('.m-torre-voo-host', h => h.hidden), 'iframe escondido fora do Painel de Voo');
  await t.ir('#/torre/voo'); await page.waitForTimeout(200);
  ok(!(await page.$eval('.m-torre-voo-host', h => h.hidden)) && await fr.evaluate(() => window.__marca) === 'mesmo-iframe', 'ao voltar, mesmo iframe (estado preservado)');

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

  step('Painel de Voo da Ana: faixa "Terça é dia de relatório"');
  const dia = await page.evaluate(() => new Date().getDay());
  await t.ir('#/torre/voo'); await page.waitForSelector('.m-torre-voo-host iframe', { state: 'attached' }); await page.waitForTimeout(400);
  const alinhado = () => page.evaluate(() => { const s = document.querySelector('[data-voo-slot]').getBoundingClientRect(), h = document.querySelector('.m-torre-voo-host').getBoundingClientRect(); return Math.abs(s.top - h.top) < 2 && Math.abs(s.left - h.left) < 2 && Math.abs(s.width - h.width) < 2 && document.documentElement.scrollHeight - innerHeight <= 2; });
  if (dia === 1) ok(!(await page.$('[data-voo-rel]')), 'segunda-feira: sem faixa');
  else {
    ok(await page.isVisible('[data-voo-rel]'), 'faixa visível para a gestora');
    const txt = await page.textContent('[data-voo-rel]');
    ok(/(Terça é dia de relatório|Relatórios da semana atrasados)/.test(txt) && /0 de \d+ enviados/.test(txt), `texto com progresso (${txt.replace(/\s+/g, ' ').trim()})`);
    ok(await page.$eval('[data-voo-rel]', (f) => f.getBoundingClientRect().bottom <= document.querySelector('[data-voo-slot]').getBoundingClientRect().top), 'faixa acima do Painel (não cobre o iframe)');
    ok(await alinhado(), 'iframe continua alinhado com a faixa visível');
    await page.evaluate(() => { const db = window.AOS.db; const c = db.list('clients', x => x.respId === 't-ana')[0]; const d = new Date(); const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const w = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - w); const ini = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); const sem = `${x.getUTCFullYear()}-W${String(Math.ceil(((x - ini) / 864e5 + 1) / 7)).padStart(2, '0')}`; db.insert('relatorios', { id: 'rel-teste', clientId: c.id, semana: sem, enviadoPor: 't-ana', quando: d.toISOString() }); });
    await page.waitForTimeout(500);
    ok(/1 de \d+ enviados/.test(await page.textContent('[data-voo-rel]')), 'progresso atualiza (1 enviado)');
    ok(await alinhado(), 'iframe realinhado depois da atualização');
    await page.click('[data-voo-rel-ir]'); await page.waitForTimeout(400);
    ok(/#\/mesa\?o=relatorio/.test(page.url()), '"Ver pendentes" abre a mesa filtrada');
    ok((await page.$$eval('.m-mesa li.m-mesa-i', els => els.map(e => e.dataset.k))).every(k => k.startsWith('rl:')), 'mesa mostra só relatórios');
    step('todos enviados: faixa some e o iframe sobe');
    await page.evaluate(() => { const db = window.AOS.db; const sem = db.get('relatorios', 'rel-teste').semana; db.batch(() => db.list('clients', c => c.ativo !== false && (c.respId === 't-ana' || (c.equipe || []).includes('t-ana'))).forEach(c => db.upsert('relatorios', { id: `rel-${c.id}-${sem}`, clientId: c.id, semana: sem, enviadoPor: 't-ana', quando: new Date().toISOString() }))); });
    await t.ir('#/torre/voo'); await page.waitForTimeout(500);
    ok(!(await page.$('[data-voo-rel]')), 'sem faixa quando todos foram enviados');
    ok(await alinhado(), 'iframe alinhado sem a faixa');
  }
  step('ponte do Guardião: Torre avisa invasão → alerta, notificações, rotina e banner');
  await t.sair(); await t.login();
  await t.ir('#/torre/voo'); await page.waitForFunction(() => { const f = document.querySelector('.m-torre-voo-host iframe'); try { return f.contentWindow.Guardiao && f.contentDocument.querySelector('#board'); } catch (e) { return false; } }, null, { timeout: 10000 });
  const fg = page.frames().find(f => /torre-controle/.test(f.url()));
  await fg.evaluate(() => parent.postMessage({ tipo: 'invasao', evento: 'invasao', incidente: { id: '<script>', achados: [], pausados: [] } }, location.origin));
  await fg.evaluate(() => parent.postMessage({ tipo: 'invasao', evento: 'invasao', incidente: { id: 'inc-x' } }, location.origin));
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.AOS.db.count('alerts', a => a.tipo === 'invasao') === 0), 'mensagem de invasão malformada é ignorada');
  const incT = { id: 'inc-7-teste', tipo: 'invasao', nivel: 'supremo', estado: 'aberto', contaId: 7, contaNome: 'Conta Teste', abertoEm: new Date().toISOString(), motivo: 'regra crítica',
    achados: [{ chave: 'admin-novo:e1', regraId: 'admin-novo', severidade: 'critica', quando: new Date().toISOString(), titulo: 'Novo acesso à conta', detalhe: 'Parceiro X' }],
    pausados: [{ id: '1', nome: '[MSG] A', cbo: true, orcAtual: 300, orcAntes: 60, conjuntos: [] }], reincidencias: [], assumidoPor: [] };
  await fg.evaluate(inc => parent.postMessage({ tipo: 'invasao', evento: 'invasao', incidente: inc, pausadas: 1 }, location.origin), incT);
  await page.waitForSelector('#aos-inv', { timeout: 3000 });
  const ponte = await page.evaluate(() => { const db = window.AOS.db; const a = db.get('alerts', 'inc-7-teste');
    return { a: !!a && a.area === 'Segurança' && a.severidade === 'err' && a.tipo === 'invasao', n: db.list('notifications', n => n.refId === 'inc-7-teste' && n.prioridade === 'critica').map(n => n.para).sort().join(), run: db.count('routineRuns', r => r.routineId === 'r-guardiao' && r.incidenteId === 'inc-7-teste') }; });
  ok(ponte.a, 'alerta de segurança criado (área Segurança, severidade err, tipo invasao)');
  ok(ponte.n === 'u-ana,u-gabriel,u-rayane', `notificação crítica para gestora, dono e admin (${ponte.n})`);
  ok(ponte.run === 1, 'execução registrada na rotina r-guardiao');
  ok((await page.textContent('#aos-inv')).includes('Conta Teste pausada automaticamente') && await page.evaluate(() => window.AOS_SIRENE.estado().tocando), 'banner + sirene no app');
  await fg.evaluate(inc => parent.postMessage({ tipo: 'invasao', evento: 'invasao', incidente: inc, pausadas: 1 }, location.origin), incT); await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.AOS.db.count('notifications', n => n.refId === 'inc-7-teste' && n.para === 'u-gabriel' && n.prioridade === 'critica')) === 1, 'mesma mensagem de novo não duplica (idempotente)');
  await page.click('[data-inv-assumir]'); await page.waitForTimeout(200);
  ok(!(await page.$('#aos-inv')) && !(await page.evaluate(() => window.AOS_SIRENE.estado().tocando)), 'assumir tira o banner e para a sirene');
  ok(await page.evaluate(() => window.AOS.db.get('alerts', 'inc-7-teste').incidente.assumidoPor[0].userId === 'u-gabriel'), 'quem assumiu fica registrado');
  step('permissão: financeiro sem acesso');
  await t.sair(); await t.login('paulo@agencia.demo');
  await t.ir('#/torre');
  ok((await page.textContent('#view')).includes('Acesso restrito'), 'acesso restrito');
}
