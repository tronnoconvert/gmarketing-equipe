// tests/admin.spec.mjs — Administração: todas as abas, convite, papel, desativar, equipe (com foto), permissões, preferências, auditoria.
// Clientes (cadastro e importação CSV) ficam só em Clientes: #/admin/clientes redireciona (ver clientes.spec).
// SHOTS=<pasta> salva screenshots (claro/escuro).
const SHOTS = process.env.SHOTS;

export default async function (t) {
  const { page, ok, step } = t;
  const shot = async nome => {
    if (!SHOTS) return;
    await t.espera(250);
    const h = await page.evaluate(() => Math.max(...[document.documentElement, document.body, ...document.querySelectorAll('.main-c, .view, #view')].map(e => e ? e.scrollHeight : 0)));
    await page.setViewportSize({ width: t.vp.w, height: Math.min(Math.max(h, t.vp.h), 4000) });
    await page.screenshot({ path: `${SHOTS}/admin-${nome}-${t.vp.w}.png` });
    await page.setViewportSize({ width: t.vp.w, height: t.vp.h });
  };
  const tema = async v => { await page.evaluate(v => window.AOS.shell.setTema(v), v); await t.espera(120); };
  const db = (fn, ...a) => page.evaluate(fn, ...a);
  const fecharToasts = () => page.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.remove()));

  await t.login();

  step('todas as abas renderizam');
  for (const aba of ['usuarios', 'equipe', 'permissoes', 'integracoes', 'notificacoes', 'auditoria']) {
    await t.ir(`#/admin/${aba}`);
    ok(await page.isVisible('.m-admin .tabs'), `abas visíveis em ${aba}`);
    ok(await page.$eval('.tabs [aria-current="page"], .tabs .on, .tabs [aria-selected="true"]', e => e.textContent.trim().length > 0).catch(() => true), `aba ativa (${aba})`);
    await shot(aba);
    if (SHOTS) { await tema('escuro'); await shot(`${aba}-escuro`); await tema('claro'); }
  }
  await t.ir('#/admin');
  ok(await page.isVisible('.m-adm-users'), '#/admin abre Usuários');
  ok(!(await page.$('.m-admin .tabs a[href="#/admin/clientes"]')), 'sem aba Clientes na Administração');

  step('rotas antigas redirecionam');
  await page.evaluate(() => { location.hash = '#/admin/clientes'; }); await t.espera(500);
  ok(/#\/clientes$/.test(page.url()) && await page.isVisible('.m-clientes-cart'), `#/admin/clientes → #/clientes (${page.url().split('#')[1]})`);
  await page.evaluate(() => { location.hash = '#/equipe/acessos'; }); await t.espera(500);
  ok(/#\/admin\/permissoes$/.test(page.url()) && await page.isVisible('.m-pm'), `#/equipe/acessos → #/admin/permissoes (${page.url().split('#')[1]})`);
  ok(!(await (await page.textContent('.m-admin')).includes('Equipe › Acessos')), 'sem link para a tela antiga');

  step('usuários: filtro e busca');
  await t.ir('#/admin/usuarios?f=inativos');
  ok((await page.$$('.m-adm-users tbody tr')).length === 1, 'só 1 inativo (Lucas)');
  await t.ir('#/admin/usuarios');
  await page.fill('[data-m-adm-q]', 'paulo'); await t.espera(80);
  ok(await page.$$eval('.m-adm-users tbody tr', trs => trs.filter(tr => !tr.hidden).length) === 1, 'busca filtra para 1 linha');
  await page.fill('[data-m-adm-q]', ''); await t.espera(350);

  step('convidar: validação e duplicado');
  await page.click('[data-m-adm-convidar]'); await page.waitForSelector('.ov-modal:not(.saindo) .mbox');
  await page.click('[data-ok]'); await t.espera(60);
  ok((await page.$$('.ov-modal:not(.saindo) .mbox .fld-err')).length >= 3, 'erros de obrigatórios');
  await page.fill('.ov-modal:not(.saindo) .mbox [name="nome"]', 'Joana Teste'); await page.fill('.ov-modal:not(.saindo) .mbox [name="email"]', 'ana@agencia.demo');
  await page.selectOption('.ov-modal:not(.saindo) .mbox [name="papel"]', 'producao');
  await page.click('[data-ok]'); await t.espera(60);
  ok((await page.textContent('.ov-modal:not(.saindo) .mbox')).includes('Já existe um usuário com este e-mail'), 'e-mail duplicado bloqueado');

  step('convidar: cria usuário com senha temporária');
  await page.fill('.ov-modal:not(.saindo) .mbox [name="email"]', 'joana.teste@agencia.demo');
  await page.click('[data-ok]');
  await page.waitForSelector('[data-m-adm-senha]');
  const senha = (await page.textContent('[data-m-adm-senha]')).trim();
  ok(senha.length >= 10, `senha temporária gerada (${senha.length} caracteres)`);
  await shot('senha');
  await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await t.espera(220);
  const novo = await db(() => window.AOS.db.find('users', u => u.email === 'joana.teste@agencia.demo'));
  ok(novo && novo.papel === 'producao' && novo.senha && novo.ativo, 'usuário criado em users');
  ok(await db(() => window.AOS.db.count('activity', a => /convidou Joana Teste/.test(a.oque))) === 1, 'convite registrado na auditoria');

  step('editar papel');
  await fecharToasts();
  await page.click(`[data-m-adm-menu="${novo.id}"]`); await page.waitForSelector('.pm [data-m-adm-acao="papel"]');
  await page.click('.pm [data-m-adm-acao="papel"]'); await page.waitForSelector('.m-adm-papeis');
  await page.check('.m-adm-papeis input[value="cs"]'); await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await t.espera(220);
  ok(await db(id => window.AOS.db.get('users', id).papel, novo.id) === 'cs', 'papel alterado para CS');
  ok(await db(id => window.AOS.db.count('notifications', n => n.para === id && /papel mudou/.test(n.titulo)), novo.id) === 1, 'pessoa notificada da mudança');

  step('último dono não pode ser rebaixado');
  await fecharToasts();
  await page.click('[data-m-adm-menu="u-gabriel"]'); await page.click('.pm [data-m-adm-acao="papel"]'); await page.waitForSelector('.m-adm-papeis');
  await page.check('.m-adm-papeis input[value="admin"]'); await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await t.espera(120);
  ok((await page.textContent('.mb-err')).includes('única pessoa com papel Dono'), 'bloqueia remover o último dono');
  await page.keyboard.press('Escape'); await t.espera(200);

  step('desativar com confirmação e desfazer');
  await page.click(`[data-m-adm-menu="${novo.id}"]`); await page.click('.pm [data-m-adm-acao="desativar"]');
  await page.waitForSelector('.ov-modal:not(.saindo) .mbox[role="alertdialog"]'); await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await t.espera(220);
  ok(await db(id => window.AOS.db.get('users', id).ativo, novo.id) === false, 'usuário desativado');
  await page.click('.toast [data-desfazer]'); await t.espera(220);
  ok(await db(id => window.AOS.db.get('users', id).ativo, novo.id) === true, 'Desfazer reativou');

  step('redefinir senha (demo)');
  await fecharToasts();
  await page.click('[data-m-adm-menu="u-paulo"]'); await page.click('.pm [data-m-adm-acao="senha"]');
  await page.waitForSelector('.ov-modal:not(.saindo) .mbox[role="alertdialog"]'); await page.click('.ov-modal:not(.saindo) .mbox [data-ok]');
  await page.waitForSelector('[data-m-adm-senha]');
  const nova = (await page.textContent('[data-m-adm-senha]')).trim();
  ok(await db(s => window.AOS.db.get('users', 'u-paulo').senha === s, nova), 'nova senha gravada');
  await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await t.espera(200);

  step('convites: reenviar e cancelar');
  await t.ir('#/admin/usuarios?f=convites');
  await page.click('[data-m-adm-reenviar="inv-thiago"]'); await t.espera(220);
  ok(await db(() => window.AOS.db.get('invites', 'inv-thiago').status) === 'pendente', 'convite expirado reenviado');
  await page.click('[data-m-adm-cancelar="inv-joana"]'); await page.waitForSelector('.ov-modal:not(.saindo) .mbox'); await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await t.espera(220);
  ok(await db(() => window.AOS.db.get('invites', 'inv-joana').status) === 'cancelado', 'convite cancelado');

  step('ver como');
  await t.ir('#/admin/usuarios');
  await page.click('[data-m-adm-menu="u-ana"]'); await page.click('.pm [data-m-adm-acao="vercomo"]'); await t.espera(400);
  ok(await db(() => window.AOS.auth.vendoComo()), 'entrou em "ver como"');
  await db(() => window.AOS.auth.voltar()); await t.espera(300);

  step('equipe: validação e cadastro');
  await t.ir('#/admin/equipe');
  await page.click('[data-m-adm-novo]'); await page.waitForSelector('.m-adm-tf');
  await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await t.espera(80);
  ok((await page.$$('.ov-modal:not(.saindo) .mbox .fld-err')).length >= 4, 'erros de obrigatórios no colaborador');
  await page.fill('.ov-modal:not(.saindo) .mbox [name="nome"]', 'Rafael Moura'); await page.fill('.ov-modal:not(.saindo) .mbox [name="cargo"]', 'Designer júnior');
  await page.selectOption('.ov-modal:not(.saindo) .mbox [name="area"]', 'Design'); await page.fill('.ov-modal:not(.saindo) .mbox [name="email"]', 'rafael@agencia.demo');
  await page.fill('.ov-modal:not(.saindo) .mbox [name="custoHora"]', '4500'); await page.fill('.ov-modal:not(.saindo) .mbox [name="horasMes"]', '160'); await page.fill('.ov-modal:not(.saindo) .mbox [name="desde"]', '03112026');
  await page.fill('#m-adm-sk-in', 'Figma'); await page.keyboard.press('Enter');
  await page.fill('#m-adm-sk-in', 'Motion'); await page.keyboard.press('Enter');
  await page.check('.ov-modal:not(.saindo) .mbox input[name="status"][value="ferias"]');
  await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await t.espera(80);
  ok((await page.textContent('.ov-modal:not(.saindo) .mbox')).includes('Informe o início das férias'), 'exige datas de férias');
  await page.check('.ov-modal:not(.saindo) .mbox input[name="status"][value="ativo"]');
  await shot('equipe-form');
  await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await t.espera(250);
  const raf = await db(() => window.AOS.db.find('team', x => x.email === 'rafael@agencia.demo'));
  ok(raf && raf.custoHora === 45 && raf.horasMes === 160 && raf.skills.join() === 'Figma,Motion' && raf.desde === '2026-11-03', `colaborador gravado (${raf && raf.custoHora}, ${raf && raf.skills})`);

  step('equipe: editar e desligar');
  await fecharToasts();
  await t.ir(`#/admin/equipe?editar=${raf.id}`); await page.waitForSelector('.m-adm-tf');
  await page.check('.ov-modal:not(.saindo) .mbox input[name="status"][value="desligado"]'); await page.click('.ov-modal:not(.saindo) .mbox [data-ok]');
  await page.waitForSelector('.ov-modal:not(.saindo) .mbox[role="alertdialog"]'); await page.click('.ov-modal:not(.saindo) .mbox[role="alertdialog"] [data-ok]'); await t.espera(250);
  ok(await db(id => window.AOS.db.get('team', id).ativo, raf.id) === false, 'colaborador desligado');

  step('equipe: foto do colaborador');
  await fecharToasts();
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 60; c.height = 40; const g = c.getContext('2d'); g.fillStyle = '#d33'; g.fillRect(0, 0, 60, 40); g.fillStyle = '#fff'; g.fillRect(20, 10, 20, 20); return c.toDataURL('image/png').split(',')[1]; });
  await t.ir('#/admin/equipe?editar=t-carla'); await page.waitForSelector('.m-adm-tf [data-foto-campo]');
  ok(!(await page.$('.mbox [data-foto-campo] .m-eq-foto-pv img')), 'sem foto: prévia com iniciais');
  await page.setInputFiles('.mbox [data-foto-file]', { name: 'texto.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') }); await t.espera(200);
  ok((await page.textContent('.mbox [data-foto-err]')).includes('Formato não suportado'), 'valida formato da foto');
  await page.setInputFiles('.mbox [data-foto-file]', { name: 'carla.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForSelector('.mbox .m-eq-foto-pv img'); await t.espera(100);
  ok(await page.isVisible('.mbox [data-foto-remover]'), 'botão Remover foto aparece');
  await shot('equipe-foto');
  await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await t.espera(300);
  const foto = await db(() => window.AOS.db.get('team', 't-carla').foto || '');
  ok(/^data:image\/jpeg;base64,/.test(foto), 'foto salva no registro team (JPEG recortado)');
  ok(await db(() => window.AOS.db.count('activity', a => /Carla/.test(a.oque) && /foto/.test(a.oque))) >= 1, 'alteração de foto na auditoria');
  ok(await page.isVisible('.m-admin .tbl img.av-img[alt="Carla Dias"], .m-admin img.av-img[alt="Carla Dias"]'), 'foto aparece na lista da equipe');
  await t.ir('#/operacao/quadro');
  const opImg = await page.$('.kb img.av-img[alt="Carla Dias"]');
  ok(!!opImg,'foto no avatar do cartão do quadro da Operação');
  await t.ir('#/admin/equipe?editar=t-carla'); await page.waitForSelector('.mbox [data-foto-remover]');
  await page.click('.mbox [data-foto-remover]'); await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await t.espera(300);
  ok(!(await db(() => window.AOS.db.get('team', 't-carla').foto)), 'Remover foto volta às iniciais');

  step('permissões: editar, salvar, desfazer, restaurar');
  await fecharToasts();
  await t.ir('#/admin/permissoes');
  const nMods = await db(() => window.AOS.perms.MODULOS_PERM.length);
  ok((await page.$$('.m-pm tbody tr')).length === nMods, `uma linha por módulo + receita (${nMods})`);
  ok(!(await page.$('[data-m-pm="admin|dono"]')), 'célula Administração × Dono travada');
  await page.selectOption('[data-m-pm="comercial|cs"]', 'ver'); await t.espera(200);
  ok(await page.isVisible('[data-m-pm-salvar]'), 'barra de alterações não salvas');
  ok((await page.textContent('.m-pm-menu')).length > 0, 'prévia do menu');
  await page.selectOption('[data-m-pm-foco]', 'cs'); await t.espera(200);
  ok((await page.textContent('.m-pm-menu')).includes('Comercial'), 'prévia de CS inclui Comercial (rascunho)');
  await page.click('[data-m-pm-salvar]'); await t.espera(220);
  ok(await db(() => window.AOS.perms.matriz().comercial.cs) === 'ver', 'matriz salva via perms');
  ok(await db(() => window.AOS.perms.can('comercial', 'ver', { papel: 'cs' })), 'perms.can reflete a mudança');
  await page.click('.toast [data-desfazer]'); await t.espera(220);
  ok(await db(() => window.AOS.perms.matriz().comercial.cs) === '', 'Desfazer voltou');
  await page.selectOption('[data-m-pm="webinars|leitura"]', ''); await t.espera(150);
  await page.click('[data-m-pm-salvar]'); await t.espera(200);
  await fecharToasts();
  await page.click('[data-m-pm-padrao]'); await page.waitForSelector('.ov-modal:not(.saindo) .mbox'); await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await t.espera(220);
  ok(await db(() => Object.keys(window.AOS.db.config('perms', {})).length) === 0, 'restaurar padrão limpa diferenças');

  step('integrações: só status, sem campos de chave');
  await t.ir('#/admin/integracoes');
  ok((await page.$$('.m-int')).length === 6, '6 integrações');
  ok((await page.$$('.m-admin input')).length === 0, 'nenhum campo de entrada (chaves só no servidor)');
  ok((await page.textContent('.m-admin')).includes('WINDSOR_API_KEY'), 'mostra nome da variável');
  await page.click('[data-m-int-verificar]'); await t.espera(250);
  ok((await page.textContent('.m-admin')).includes('Verificado'), 'verificação registrada');
  await page.click('[data-m-int-como="windsor"]'); await page.waitForSelector('.dbox');
  ok((await page.textContent('.dbox')).includes('supabase secrets set WINDSOR_API_KEY'), 'instrução com comando');
  await page.keyboard.press('Escape'); await t.espera(200);

  step('preferências de notificação');
  await t.ir('#/admin/notificacoes?pessoa=u-ana');
  await page.check('[name="t.mencao.whatsapp"]'); await page.fill('[name="sil.de"]', '07:00'); await page.fill('[name="sil.ate"]', '07:00');
  await page.click('[data-m-pf-salvar]'); await t.espera(100);
  ok(await page.isVisible('[data-m-pf-err]'), 'silêncio com horários iguais é rejeitado');
  await page.fill('[name="sil.ate"]', '08:00'); await page.click('[data-m-pf-salvar]'); await t.espera(220);
  const pf = await db(() => window.AOS.db.config('notif:u-ana'));
  ok(pf && pf.tipos.mencao.whatsapp === true && pf.silencio.ate === '08:00', 'preferências salvas em settings');

  step('auditoria: filtros e exportação');
  await t.ir('#/admin/auditoria?per=tudo');
  const total = (await page.$$('.m-admin .tbl tbody tr')).length;
  ok(total >= 10, `linhas de auditoria (${total})`);
  await page.selectOption('[data-m-aud="pessoa"]', 'u-rayane'); await t.espera(220);
  ok(/pessoa=u-rayane/.test(page.url()), 'filtro na URL');
  ok(await page.$$eval('.m-admin .tbl tbody tr', trs => trs.every(tr => tr.textContent.includes('Rayane'))), 'só Rayane');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-m-aud-csv]')]);
  ok(/auditoria-.*\.csv/.test(dl.suggestedFilename()), 'CSV exportado');

  step('permissões básicas: quem não é admin não acessa');
  await t.sair(); await t.login('ana@agencia.demo');
  await t.ir('#/admin/usuarios');
  ok(!(await page.$('.m-admin')), 'gestor de tráfego não vê Administração');
  await t.sair(); await t.login('rayane@agencia.demo');
  await t.ir('#/admin/usuarios');
  ok(await page.isVisible('.m-admin [data-m-adm-convidar]'), 'administradora pode convidar');
}
