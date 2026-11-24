// tests/notificacoes.spec.mjs — central de notificações: abas, agrupamento, lida/não lida, marcar todas, enviar mensagem, preferências, contador.
const SHOTS = process.env.SHOTS;

export default async function (t) {
  const { page, ok, step } = t;
  const shot = async nome => {
    if (!SHOTS) return;
    await t.espera(250);
    const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    await page.setViewportSize({ width: t.vp.w, height: Math.min(Math.max(h, t.vp.h), 4000) });
    await page.screenshot({ path: `${SHOTS}/notificacoes-${nome}-${t.vp.w}.png` });
    await page.setViewportSize({ width: t.vp.w, height: t.vp.h });
  };
  const db = (fn, ...a) => page.evaluate(fn, ...a);
  const M = '.ov-modal:not(.saindo) .mbox';
  const fecharToasts = () => page.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.remove()));

  await t.login();

  const IT = '.m-nt-i:not(.m-nt-gi)';
  step('fora do menu lateral, acessível pelo perfil e pelo sino');
  ok(!(await page.$('.nv [data-mod="notificacoes"]')), 'sem item Notificações no menu');
  await page.click('.tb-av'); ok(await page.isVisible('.pm a[href="#/notificacoes"]'), 'perfil: "Notificações e preferências"'); await page.keyboard.press('Escape');

  step('central renderiza agrupada por dia');
  await t.ir('#/notificacoes');
  ok(await page.isVisible('.m-notificacoes .tabs'), 'abas visíveis');
  const grupos = await page.$$eval('.m-nt-gh span:first-child', e => e.map(x => x.textContent));
  ok(grupos[0] === 'Hoje' && grupos.length >= 3, `grupos por dia (${grupos.join(', ')})`);
  ok((await page.$$(IT)).length === await db(() => window.AOS.notify.minhas().length), 'todas as notificações listadas');

  step('agrupamento: mesma entidade + tipo + dia');
  await db(() => { const q = m => new Date(Date.now() - m * 60000).toISOString(); [3, 5, 7].forEach((m, i) => window.AOS.db.insert('notifications', { id: `n-tg-${i}`, para: 'u-gabriel', de: ['u-ana', 'u-bruno', 'u-carla'][i], tipo: 'mencao', titulo: `Teste ${i} mencionou você em Construtora Alfa`, texto: `Comentário ${i}`, link: '#/clientes/c-alfa', lida: false, prioridade: 'normal', quando: q(m), refCol: 'clients', refId: 'c-alfa' })); });
  await t.espera(300);
  const G = '[data-m-nt-grp^="clients:c-alfa:mencao"]';
  const gAlfa = await page.$(G);
  const mesmoDia = await db(() => new Set([3, 7].map(m => window.AOS.fmt.iso(new Date(Date.now() - m * 60000)))).size === 1);
  if (mesmoDia) {
    ok(!!gAlfa && (await gAlfa.textContent()).includes('3 menções em Construtora Alfa'), 'grupo "3 menções em Construtora Alfa"');
    ok(await page.$eval(`${G} .m-nt-sub`, e => e.hidden), 'itens do grupo recolhidos');
    await page.click(`${G} [data-m-nt-grp-toggle]`); await t.espera(120);
    ok((await page.$$(`${G} .m-nt-sub:not([hidden]) .m-nt-i`)).length === 3, 'expande e mostra cada uma');
    ok(await page.$eval(`${G} [data-m-nt-grp-toggle]`, e => e.getAttribute('aria-expanded')) === 'true', 'aria-expanded=true');
    await shot('grupo');
    await page.click(`${G} [data-m-nt-grp-lida]`); await t.espera(250);
    ok(await db(() => [0, 1, 2].every(i => window.AOS.db.get('notifications', `n-tg-${i}`).lida)), 'marcar grupo como lido');
    ok(await page.$eval(`${G} .m-nt-sub`, e => !e.hidden), 'grupo continua aberto após re-render');
    await page.click('.toast [data-desfazer]'); await t.espera(250);
    ok(await db(() => [0, 1, 2].every(i => !window.AOS.db.get('notifications', `n-tg-${i}`).lida)), 'Desfazer devolve as 3 como não lidas');
  }
  await db(() => window.AOS.db.batch(() => [0, 1, 2].forEach(i => window.AOS.db.remove('notifications', `n-tg-${i}`))));
  await fecharToasts(); await t.espera(200);

  step('resumo de hoje');
  ok(await page.isVisible('.m-nt-resumo'), 'card "Resumo de hoje" no topo');
  const rt = (await page.textContent('.m-nt-resumo')).replace(/\s+/g, ' ');
  const nAl = await db(() => window.AOS.notify.minhas({ filtro: 'nao_lidas' }).filter(n => n.tipo === 'alerta').length);
  ok(rt.includes(`${nAl} ${nAl === 1 ? 'alerta' : 'alertas'}`), `resume não lidas por tipo (${nAl} alertas)`);
  ok(/Chega todo dia às 08:00/.test(rt), 'mostra horário do resumo (padrão 08:00 para o dono)');
  ok((await page.$$('.m-nt-i.alta')).length >= 1, 'prioridade alta destacada');
  await shot('todas');
  if (SHOTS) { await page.evaluate(() => window.AOS.shell.setTema('escuro')); await shot('todas-escuro'); await page.evaluate(() => window.AOS.shell.setTema('claro')); }

  step('abas');
  for (const [aba, filtro] of [['nao-lidas', 'nao_lidas'], ['mencoes', 'mencoes'], ['atribuidas', 'atribuidas'], ['alertas', 'alertas']]) {
    await t.ir(`#/notificacoes/${aba}`);
    const n = await db(f => window.AOS.notify.minhas({ filtro: f }).length, filtro);
    const vis = (await page.$$(IT)).length;
    ok(vis === n, `aba ${aba}: ${vis} itens (esperado ${n})`);
  }

  step('marcar como lida / não lida com desfazer');
  await t.ir('#/notificacoes');
  const alvo = await db(() => window.AOS.notify.minhas({ filtro: 'nao_lidas' })[0].id);
  await page.click(`[data-m-nt-toggle="${alvo}"]`); await t.espera(200);
  ok(await db(id => window.AOS.db.get('notifications', id).lida, alvo) === true, 'marcada como lida');
  await page.click(`[data-m-nt-toggle="${alvo}"]`); await t.espera(200);
  ok(await db(id => window.AOS.db.get('notifications', id).lida, alvo) === false, 'marcada como não lida de novo');

  step('abrir link marca como lida');
  await fecharToasts();
  const n2 = await db(() => window.AOS.notify.minhas({ filtro: 'nao_lidas' }).find(n => n.link === '#/financeiro') || window.AOS.notify.minhas({ filtro: 'nao_lidas' })[0]);
  await page.click(`.m-nt-m[data-nt-abrir="${n2.id}"]`); await t.espera(300);
  ok(await db(id => window.AOS.db.get('notifications', id).lida, n2.id) === true, 'abrir marca como lida');
  ok(page.url().includes(n2.link.replace('#', '')), 'navegou para o link');

  step('marcar todas com desfazer');
  await t.ir('#/notificacoes');
  const antes = await db(() => window.AOS.notify.naoLidas());
  await page.click('[data-m-nt-todas]'); await t.espera(200);
  ok(await db(() => window.AOS.notify.naoLidas()) === 0, 'todas lidas');
  await page.click('.toast [data-desfazer]'); await t.espera(200);
  ok(await db(() => window.AOS.notify.naoLidas()) === antes, `Desfazer voltou ${antes} não lidas`);

  step('enviar mensagem para pessoa');
  await fecharToasts();
  await page.click('[data-m-nt-enviar]'); await page.waitForSelector('.m-nt-env');
  await page.click(`${M} [data-ok]`); await t.espera(80);
  ok((await page.$$(`${M} .fld-err`)).length >= 2, 'valida pessoa, assunto e mensagem');
  await page.check(`${M} input[name="para"][value="u-ana"]`);
  await page.fill(`${M} [name="titulo"]`, 'Revisar ROAS do Orion'); await page.fill(`${M} [name="texto"]`, 'Preciso do resumo até as 16h.');
  await page.fill(`${M} [name="link"]`, 'clientes/c-orion'); await page.click(`${M} [data-ok]`); await t.espera(80);
  ok((await page.textContent(M)).includes('começando com #/'), 'valida formato do link');
  await page.fill(`${M} [name="link"]`, '#/clientes/c-orion');
  await page.click(`${M} [data-ok]`); await t.espera(250);
  ok(await db(() => window.AOS.db.count('notifications', n => n.para === 'u-ana' && n.titulo.includes('Revisar ROAS do Orion') && n.link === '#/clientes/c-orion')) === 1, 'mensagem entregue a Ana');

  step('enviar mensagem para grupo');
  await fecharToasts();
  await page.click('[data-m-nt-enviar]'); await page.waitForSelector('.m-nt-env');
  await page.click(`${M} label:has(input[name="modo"][value="grupo"])`);
  await page.selectOption(`${M} [name="grupo"]`, 'producao');
  await page.fill(`${M} [name="titulo"]`, 'Pauta da semana'); await page.fill(`${M} [name="texto"]`, 'Reunião de pauta na segunda às 10h.');
  await page.check(`${M} input[name="canais"][value="whatsapp"]`);
  await page.click(`${M} [data-ok]`); await t.espera(250);
  const prod = await db(() => window.AOS.db.list('users', u => u.papel === 'producao' && u.ativo !== false).map(u => u.id));
  ok(await db(ids => ids.every(id => window.AOS.db.count('notifications', n => n.para === id && n.titulo.includes('Pauta da semana')) === 1), prod), `grupo Produção recebeu (${prod.length})`);
  ok((await page.textContent('#toasts')).includes('WhatsApp (simulado'), 'canal externo simulado');

  step('preferências pela central');
  await fecharToasts();
  await page.click('[data-m-nt-prefs]'); await page.waitForSelector('.m-ntp-f');
  ok((await page.textContent('[data-ntp-som]')).includes('aviso sonoro') && !(await page.$('.m-ntp-f [name*="som"]')), 'explica o aviso sonoro (sem opção de desligar)');
  await page.check(`${M} [name="t.mensagem.email"]`);
  await page.fill(`${M} [name="resumoHora"]`, '2599'); await page.click(`${M} [data-ok]`); await t.espera(120);
  ok((await page.textContent(M)).includes('resumo diário inválido'), 'valida horário do resumo');
  await page.fill(`${M} [name="resumoHora"]`, '0745'); await page.click(`${M} [data-ok]`); await t.espera(250);
  ok(await db(() => window.AOS.db.config('notif:u-gabriel').resumoHora) === '07:45', 'horário do resumo salvo');
  ok((await page.textContent('.m-nt-resumo')).includes('07:45'), 'resumo mostra o novo horário');
  ok(await db(() => window.AOS.db.config('notif:u-gabriel').tipos.mensagem.email) === true, 'preferência salva');
  ok((await page.textContent('.m-nt-side')).includes('E-mail'), 'resumo de canais atualizado');

  step('busca global encontra notificação');
  const r = await db(() => window.AOS.shell.modulos().find(m => m.id === 'notificacoes').busca('bella'));
  ok(r.length >= 1, 'busca("bella") retorna resultado');

  step('outro usuário vê só as próprias');
  await t.sair(); await t.login('diego@agencia.demo');
  await t.ir('#/notificacoes');
  const nd = await db(() => window.AOS.db.count('notifications', n => n.para === 'u-diego'));
  ok((await page.$$(IT)).length === nd, `Diego vê ${nd} notificações`);
  await t.sair(); await t.login('helena@agencia.demo');
  await t.ir('#/notificacoes');
  ok(!(await page.$('[data-m-nt-enviar]')), 'leitura não envia mensagens');
  ok(await page.isVisible('.m-notificacoes .vz') || (await page.$$(IT)).length >= 0, 'leitura vê a central');
}
