// tests/core.spec.mjs — login, menu por papel, acesso restrito, ver como, tema, período, busca, notificações, #/_ui.
export default async function (t) {
  const { page, ok, step } = t;
  const menu = () => page.$$eval('.nv [data-mod]', els => els.map(e => e.dataset.mod));
  const abrirMenuMobile = async () => { if (t.vp.w <= 1000) { await page.click('.tb-ham'); await page.waitForTimeout(260); } };
  const fecharMenuMobile = async () => { if (t.vp.w <= 1000) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } };

  step('tela de login');
  await page.goto(t.base + 'index.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto(t.base + 'index.html');
  await page.waitForSelector('.lg-form');
  ok(await page.isVisible('.tag-demo') && (await page.textContent('.tag-demo')).includes('Modo demonstração'), 'selo "Modo demonstração" visível');
  ok((await page.$$('[data-quick]')).length >= 5, 'botões de entrada rápida');

  step('login com senha errada');
  await page.fill('#lg-email', 'gabriel@agencia.demo'); await page.fill('#lg-senha', 'errada');
  await page.click('.lg-go'); await page.waitForSelector('.lg-err:not([hidden])');
  ok((await page.textContent('.lg-err')).includes('incorretos'), 'mensagem de senha incorreta');

  step('usuário inativo');
  await page.fill('#lg-email', 'lucas@agencia.demo'); await page.fill('#lg-senha', 'demo123');
  await page.click('.lg-go'); await page.waitForTimeout(100);
  ok((await page.textContent('.lg-err')).includes('desativado'), 'inativo não entra');

  step('esqueci minha senha');
  await page.click('[data-esqueci]'); await page.waitForSelector('.toast');
  ok((await page.textContent('.toast')).includes('administrador'), 'toast explica redefinição pelo admin');

  step('login demo (formulário) como dono');
  await page.fill('#lg-email', 'gabriel@agencia.demo'); await page.fill('#lg-senha', 'demo123');
  await page.click('.lg-go'); await page.waitForSelector('#view');
  await page.waitForTimeout(200);
  ok(/#\/cockpit/.test(page.url()), `redireciona para o cockpit (${page.url()})`);
  const mDono = await menu();
  ok(['cockpit', 'financeiro', 'clientes', 'campanha', 'admin', 'torre'].every(m => mDono.includes(m)), `dono vê todos os módulos (${mDono.join(',')})`);
  step('menu: só número para crítico, ponto para atenção, sem Notificações');
  const cnts = await page.$$eval('.nv .cnt', els => els.map(e => ({ err: e.classList.contains('s-err'), n: e.textContent.trim() })));
  ok(cnts.length >= 1 && cnts.every(c => c.err && /^\d+$/.test(c.n)), `todo número do menu é vermelho (${JSON.stringify(cnts)})`);
  const esperado = await page.evaluate(() => window.AOS.shell.modulos().filter(m => m.contador && window.AOS.perms.can(m.perm || m.id) && m.id !== 'notificacoes').map(m => { let c = m.contador(); if (typeof c === 'number') c = { n: c }; return c && c.n ? { id: m.id, e: c.estado } : null; }).filter(Boolean));
  for (const c of esperado) {
    const tem = await page.$(`.nv [data-mod="${c.id}"] .cnt`), dot = await page.$(`.nv [data-mod="${c.id}"] .cnt-dot`);
    if (c.e === 'err') ok(!!tem, `${c.id}: crítico mostra número`);
    else if (c.e === 'warn') ok(!tem && !!dot, `${c.id}: atenção vira ponto sem número`);
    else ok(!tem && !dot, `${c.id}: estado "${c.e || 'neutro'}" não aparece no menu`);
  }
  const dot = await page.$('.nv .cnt-dot');
  if (dot) ok(/pedindo atenção/.test(await dot.getAttribute('aria-label')), 'ponto âmbar tem aria-label "N itens pedindo atenção"');
  ok(!mDono.includes('notificacoes'), 'Notificações fora do menu lateral');
  ok(mDono[0] === 'mesa', `Minha mesa é o 1º item (${mDono[0]})`);
  ok(/#\/cockpit$/.test(await page.getAttribute('#brand', 'href')), 'logo leva ao início do dono (cockpit)');

  step('luz mestra');
  ok(await page.isVisible('#ml .led'), 'luz mestra visível');

  step('#/_ui renderiza todos os componentes');
  await t.ir('#/_ui');
  await page.waitForSelector('.qa-sec');
  const qa = await page.evaluate(() => ({
    kpi: document.querySelectorAll('.kpi').length, alerta: document.querySelectorAll('.kpi.alerta').length, led: document.querySelectorAll('.led').length,
    charts: document.querySelectorAll('svg.chart').length, spark: document.querySelectorAll('svg.spark').length, tbl: document.querySelectorAll('.tbl').length,
    h30: document.querySelectorAll('.h30').length, cmt: document.querySelectorAll('.cmt').length, roles: document.querySelectorAll('svg.chart[role="img"][aria-label]').length,
  }));
  ok(qa.kpi >= 6 && qa.alerta === 1, `KPIs (${qa.kpi}, alerta ${qa.alerta})`);
  ok(qa.charts >= 11, `gráficos SVG (${qa.charts})`);
  ok(qa.roles === qa.charts, 'todo gráfico tem role=img e aria-label');
  ok(qa.spark >= 6 && qa.tbl >= 1 && qa.h30 >= 3 && qa.cmt === 1, 'spark, tabela, histórico e comentários');

  step('tabela ordenável');
  if (t.mobile) await page.selectOption('[data-sort-sel]', '0');
  else await page.click('.tbl th:first-child .th-b');
  ok(await page.$eval('.tbl th:first-child', e => e.getAttribute('aria-sort')) === 'ascending', 'aria-sort após ordenar');
  { const first = await page.$eval('.tbl tbody tr td', e => e.textContent); ok(first.includes('Auto Center'), `ordem alfabética (${first})`); }

  step('tooltip do gráfico');
  if (!t.mobile) {
    const alvo = await page.$('.ch-linhas .hc:nth-of-type(6)');
    await alvo.scrollIntoViewIfNeeded(); await page.waitForTimeout(120);
    const bb = await alvo.boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.waitForTimeout(80);
    ok(await page.$eval('#aos-tip', e => e.classList.contains('on')), 'tooltip aparece no hover');
    await page.mouse.move(2, 2);
  }

  step('modal: abre, prende foco, Esc fecha e devolve o foco');
  await page.click('[data-qa="modal"]'); await page.waitForSelector('.ov-modal .mbox');
  ok(await page.evaluate(() => document.querySelector('.mbox').contains(document.activeElement)), 'foco dentro do modal');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  ok(await page.evaluate(() => document.querySelector('.mbox').contains(document.activeElement)), 'foco preso no modal');
  await page.keyboard.press('Escape'); await page.waitForTimeout(220);
  ok(!(await page.$('.ov-modal')), 'Esc fecha o modal');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.qa === 'modal'), 'foco volta ao botão');

  step('formulário: máscaras e validação');
  await page.fill('#qa-form [name="cnpj"]', '11222333000181');
  ok((await page.inputValue('#qa-form [name="cnpj"]')) === '11.222.333/0001-81', 'máscara CNPJ');
  await page.fill('#qa-form [name="tel"]', '11912345678');
  ok((await page.inputValue('#qa-form [name="tel"]')) === '+55 (11) 91234-5678', 'máscara telefone');
  await page.fill('#qa-form [name="email"]', 'invalido@');
  await page.click('[data-qa="validar"]');
  ok((await page.$$('#qa-form .fld-err')).length >= 2, 'erros inline (razão social, e-mail, segmento)');
  await page.fill('#qa-form [name="razao"]', 'Orion Comércio Ltda.'); await page.fill('#qa-form [name="email"]', 'marcos@orion.com.br');
  await page.selectOption('#qa-form [name="segmento"]', 'Varejo');
  await page.click('[data-qa="validar"]'); await page.waitForTimeout(60);
  const out = await page.textContent('#qa-out');
  ok(out.includes('"mrr": 14200') && out.includes('"inicio": "2025-09-01"'), 'form.ler converte moeda e data');

  step('toast com Desfazer');
  await page.click('[data-qa="toast"]');
  ok(await page.isVisible('.toast [data-desfazer]'), 'botão Desfazer no toast');

  step('comentário com @menção notifica');
  await page.click('.cmt textarea'); await page.keyboard.type('Teste @Ana');
  await page.waitForSelector('.mn-l:not([hidden]) li');
  await page.keyboard.press('Enter');
  await page.keyboard.type('confira o ROAS.');
  await page.click('.cmt-f button[type="submit"]'); await page.waitForTimeout(120);
  const notifAna = await page.evaluate(() => window.AOS.db.list('notifications', n => n.para === 'u-ana' && n.tipo === 'mencao' && n.texto.includes('confira o ROAS')).length);
  ok(notifAna === 1, 'menção gerou notificação para Ana');

  step('notificar alguém');
  await page.click('.card [data-notificar]'); await page.waitForSelector('.ntf');
  await page.click('[data-ok]'); await page.waitForTimeout(60);
  ok((await page.$$('.ntf .fld-err')).length >= 1, 'exige pessoa e mensagem');
  await page.check('.ntf input[value="u-paulo"]'); await page.fill('#ntf-msg', 'Cobrar a fatura hoje.'); await page.check('.ntf input[value="whatsapp"]');
  await page.click('[data-ok]'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => window.AOS.db.count('notifications', n => n.para === 'u-paulo' && n.texto === 'Cobrar a fatura hoje.')) === 1, 'notificação criada');
  ok((await page.textContent('#toasts')).includes('WhatsApp (simulado'), 'canal externo simulado');

  step('tema claro/escuro');
  await page.click('[data-tema-btn]');
  ok(await page.evaluate(() => document.documentElement.dataset.tema) === 'escuro', 'tema escuro aplicado');
  ok(await page.evaluate(() => localStorage.getItem('aos-tema')) === 'escuro', 'tema persistido');
  await page.click('[data-tema-btn]');
  ok(await page.evaluate(() => document.documentElement.dataset.tema) === 'claro', 'volta ao claro');

  step('período atualiza a URL');
  const per = t.vp.w <= 760 ? '#tb-per-m' : '#tb-per';
  await page.click(`${per} [data-periodo="tri"]`); await page.waitForTimeout(100);
  ok(page.url().includes('p=tri'), `URL com p=tri (${page.url()})`);
  ok(await page.$eval(`${per} [data-periodo="tri"]`, e => e.getAttribute('aria-pressed')) === 'true', 'botão marcado');
  ok((await page.textContent('.ph-meta')).includes('Trimestre'), 'página re-renderizou com o período');
  await page.click(`${per} [data-periodo="mes"]`);

  step('seletor de período só onde muda os dados');
  await t.ir('#/clientes');
  ok(await page.evaluate(() => document.documentElement.classList.contains('sem-periodo')), 'Clientes: sem período (classe)');
  ok(!(await page.isVisible(`${per} [data-periodo="mes"]`)), 'Clientes: seletor escondido');
  const posBusca = t.vp.w > 1100 ? await page.$eval('#gs', e => Math.round(e.getBoundingClientRect().left)) : 0;
  await t.ir('#/cockpit');
  ok(await page.isVisible(`${per} [data-periodo="mes"]`), 'Cockpit: seletor visível');
  if (t.vp.w > 1100) ok(posBusca === await page.$eval('#gs', e => Math.round(e.getBoundingClientRect().left)), 'busca não muda de lugar (sem salto de layout)');
  await t.ir('#/webinars/novo');
  ok(!(await page.isVisible(`${per} [data-periodo="mes"]`)), 'Novo webinar: sem período');
  await t.ir('#/_ui');

  step('busca global');
  await page.keyboard.press('/'); await page.waitForTimeout(80);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'gs-in'), '"/" foca a busca');
  await page.keyboard.type('ana'); await page.waitForSelector('.gs-pop [data-gs-i]');
  ok((await page.textContent('.gs-pop')).includes('Ana Souza'), 'resultado de pessoa');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(80);

  step('notificações: painel e marcar como lidas');
  const antes = await page.evaluate(() => window.AOS.notify.naoLidas());
  ok(antes >= 5, `dono tem não lidas (${antes})`);
  ok((await page.textContent('#bell .ib-badge')).trim() === String(antes), 'contador no sino');
  await page.click('#bell'); await page.waitForSelector('.ntp .nt');
  ok((await page.$$('.ntp .np-l > .nt')).length === 8, 'painel mostra as 8 entradas mais recentes');
  const mesmoDia = await page.evaluate(() => { const l = ['n-02', 'n-13', 'n-14'].map(id => window.AOS.db.get('notifications', id).quando); return new Set(l.map(q => window.AOS.fmt.iso(q))).size === 1; });
  if (mesmoDia) {
    ok((await page.textContent('.ntp .nt-grp')).includes('3 menções em Grupo Orion'), 'grupo "3 menções em Grupo Orion" no sino');
    await page.click('.ntp .nt-grp [data-nt-grp-toggle]'); await page.waitForTimeout(80);
    ok((await page.$$('.ntp .nt-grp .nt-sub:not([hidden]) .nt')).length === 3, 'grupo expande e mostra as 3');
    await page.click('.ntp .nt-grp [data-nt-lida-grupo]'); await page.waitForTimeout(250);
    ok(await page.evaluate(() => ['n-02', 'n-13', 'n-14'].every(id => window.AOS.db.get('notifications', id).lida)), 'marcar grupo como lido');
  }
  await page.click('[data-marcar-todas]'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => window.AOS.notify.naoLidas()) === 0, 'todas lidas');
  ok(await page.$eval('#bell .ib-badge', e => e.hidden), 'contador some');
  await page.keyboard.press('Escape');

  step('atalho ? abre ajuda');
  await page.keyboard.press('?'); await page.waitForSelector('.kb');
  ok(true); await page.keyboard.press('Escape'); await page.waitForTimeout(200);

  step('ver como (Ana) e voltar');
  await page.click('.tb-av'); await page.click('[data-ver-como]'); await page.waitForSelector('.vcl');
  await page.click('[data-vc="u-ana"]'); await page.waitForSelector('#vc:not([hidden])');
  ok((await page.textContent('#vc')).includes('Vendo como Ana Souza') && (await page.textContent('#vc')).includes('Voltar para Gabriel'), 'banner "Vendo como Ana Souza · Voltar para Gabriel"');
  const mAna = await menu();
  ok(!mAna.includes('financeiro') && !mAna.includes('cockpit') && mAna.includes('clientes') && mAna.includes('torre'), `menu da Ana (${mAna.join(',')})`);
  await t.ir('#/financeiro');
  ok((await page.textContent('#view')).includes('Você não tem acesso a esta área. Peça ao administrador.'), 'acesso restrito no ver como');
  await page.click('#vc [data-voltar]'); await page.waitForTimeout(200);
  ok(await page.$eval('#vc', e => e.hidden), 'banner some ao voltar');
  ok((await menu()).includes('financeiro'), 'menu do dono de volta');

  step('submenu da Torre e 404');
  await abrirMenuMobile();
  ok((await page.$$('.nv-sub .nv-sa')).length === 2, 'Torre com 2 subitens');
  await fecharMenuMobile();
  await t.ir('#/nao-existe');
  ok((await page.textContent('#view')).includes('Página não encontrada'), 'página 404');

  step('menu por papel: financeiro');
  await t.sair();
  await page.click('[data-quick="paulo@agencia.demo"]'); await page.waitForSelector('#view'); await page.waitForTimeout(150);
  const mFin = await menu();
  ok(!mFin.includes('financeiro') && !mFin.includes('cockpit') && !mFin.includes('campanha') && !mFin.includes('admin') && mFin.includes('clientes'), `papel financeiro (padrão): sem Cockpit/Financeiro/Campanha/Administração (${mFin.join(',')})`);
  await t.ir('#/admin');
  ok((await page.textContent('#view')).includes('Você não tem acesso'), 'página de acesso restrito');
  ok(await page.isVisible('#view .vz .btn'), 'botão para voltar');

  step('menu por papel: produção');
  await t.sair();
  await page.click('[data-quick="carla@agencia.demo"]'); await page.waitForSelector('#view'); await page.waitForTimeout(150);
  const mProd = await menu();
  ok(!mProd.includes('financeiro') && !mProd.includes('cockpit') && mProd.includes('operacao'), `produção não vê Financeiro (${mProd.join(',')})`);
  ok(/#\/mesa/.test(page.url()), `produção começa na Minha mesa (${page.url()})`);
  ok(await page.evaluate(() => !window.AOS.perms.can('clientes', 'editar') && window.AOS.perms.can('clientes', 'ver')), 'produção: clientes só ver');

  step('menu mobile (drawer)');
  if (t.vp.w <= 1000) {
    await page.click('.tb-ham'); await page.waitForTimeout(260);
    ok(await page.evaluate(() => document.documentElement.classList.contains('sb-on')), 'drawer abre');
    await page.click('.nv [data-mod="operacao"] a'); await page.waitForTimeout(260);
    ok(!(await page.evaluate(() => document.documentElement.classList.contains('sb-on'))), 'drawer fecha ao navegar');
    ok(page.url().includes('#/operacao'), 'navegou');
  }

  step('início por papel');
  for (const [email, rota] of [['ana@agencia.demo', 'torre/voo'], ['diego@agencia.demo', 'mesa'], ['felipe@agencia.demo', 'mesa'], ['gabriel@agencia.demo', 'cockpit']]) {
    await t.sair();
    await page.click(`[data-quick="${email}"]`).catch(async () => { await page.fill('#lg-email', email); await page.fill('#lg-senha', 'demo123'); await page.click('.lg-go'); });
    await page.waitForSelector('#view'); await page.waitForTimeout(200);
    ok(page.url().endsWith(`#/${rota}`), `${email} entra em #/${rota} (${page.url().split('#')[1]})`);
    ok((await page.getAttribute('#brand', 'href')) === `#/${rota}`, `logo de ${email} leva a #/${rota}`);
  }

  step('paleta de comandos: Ctrl+K → Grupo Orion');
  await t.ir('#/cockpit');
  await page.keyboard.press('Control+k'); await page.waitForSelector('.cmdk');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'cmdk-in'), 'foco no campo da paleta');
  ok(await page.$eval('#cmdk-in', e => e.getAttribute('role') === 'combobox' && e.getAttribute('aria-controls') === 'cmdk-l') && await page.$eval('#cmdk-l', e => e.getAttribute('role') === 'listbox'), 'combobox + listbox acessíveis');
  ok((await page.$$('.cmdk-o')).length >= 5, 'vazia: mostra ações e páginas');
  await page.keyboard.type('orion'); await page.waitForTimeout(150);
  ok((await page.textContent('.cmdk-o[aria-selected="true"]')).includes('Grupo Orion'), 'primeiro resultado = Grupo Orion');
  ok(await page.$eval('#cmdk-in', e => !!e.getAttribute('aria-activedescendant')), 'aria-activedescendant aponta o item');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(/#\/clientes\/c-orion/.test(page.url()), `Enter abre a ficha (${page.url().split('#')[1]})`);
  ok(!(await page.$('.cmdk')), 'paleta fecha');

  step('paleta: "nova tarefa" abre o formulário da Operação');
  await page.keyboard.press('Control+k'); await page.waitForSelector('.cmdk');
  ok((await page.textContent('.cmdk-g')).includes('Recentes') && (await page.textContent('.cmdk-g')).includes('Grupo Orion'), 'recentes no topo quando vazio');
  await page.keyboard.type('nova tarefa'); await page.waitForTimeout(150);
  ok((await page.textContent('.cmdk-o[aria-selected="true"]')).includes('Nova tarefa'), 'ação "Nova tarefa" em primeiro');
  await page.keyboard.press('Enter'); await page.waitForSelector('.ov-modal .mbox', { timeout: 4000 }).catch(() => {});
  ok(/#\/operacao\/quadro/.test(page.url()) && await page.isVisible('.ov-modal .mbox'), `foi ao quadro e abriu o modal de nova tarefa (${page.url().split('#')[1]})`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);

  step('paleta: "cobrar bella" leva à cobrança');
  await page.keyboard.press('Control+k'); await page.waitForSelector('.cmdk');
  await page.keyboard.type('cobrar bella'); await page.waitForTimeout(150);
  ok((await page.textContent('.cmdk-o[aria-selected="true"]')).includes('Cobrar Bella'), 'resultado "Cobrar Bella Moda"');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok(/#\/financeiro\/receber\?.*(cobrar|fatura)=inv-2611-bella/.test(page.url()) && await page.isVisible('.ov-modal .mbox'), `abriu a cobrança da Bella (${page.url().split('#')[1]})`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.keyboard.press('Control+k'); await page.waitForSelector('.cmdk'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!(await page.$('.cmdk')), 'Esc fecha a paleta');

  step('densidade compacta persiste');
  await t.ir('#/clientes');
  const altura = () => page.$eval('.tbl tbody tr', e => e.getBoundingClientRect().height);
  const h0 = t.mobile ? 0 : await altura();
  await page.click('.tb-av'); await page.click('[data-densidade-toggle]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.documentElement.dataset.densidade) === 'compacta', 'html[data-densidade=compacta]');
  ok(await page.evaluate(() => localStorage.getItem('aos-densidade:u-gabriel')) === 'compacta', 'gravado por pessoa');
  if (!t.mobile) { const h1 = await altura(); ok(h1 <= h0 - 12, `linhas mais baixas (${h0.toFixed(0)} → ${h1.toFixed(0)} px)`); }
  await page.keyboard.press('Escape');
  await page.reload(); await page.waitForSelector('#view'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.documentElement.dataset.densidade) === 'compacta', 'continua compacta após recarregar');
  await page.keyboard.press('Control+k'); await page.waitForSelector('.cmdk'); await page.keyboard.type('densidade'); await page.waitForTimeout(120);
  ok((await page.textContent('.cmdk-o[aria-selected="true"]')).includes('Densidade confortável'), 'comando de densidade na paleta');
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !document.documentElement.dataset.densidade), 'volta à confortável pela paleta');

  step('introdução da página recolhe depois de 2 visitas');
  await t.ir('#/equipe');
  ok(await page.isVisible('.ph .ph-d') && !(await page.$('.ph .ph-i')), '1ª visita: frase visível');
  await t.ir('#/cockpit'); await t.ir('#/equipe'); await t.ir('#/cockpit'); await t.ir('#/equipe');
  ok(!(await page.isVisible('.ph .ph-d')) && await page.isVisible('.ph .ph-i'), '3ª visita: vira "i" ao lado do título');
  ok((await page.getAttribute('.ph .ph-i', 'aria-label')).startsWith('Sobre esta página:'), '"i" acessível com o texto');

  step('foto no avatar (e volta às iniciais se quebrar)');
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await page.evaluate(f => window.AOS.db.update('team', 't-gabriel', { foto: f }), PNG); await page.waitForTimeout(300);
  ok(await page.$eval('.tb-av .av img.av-img', e => e.alt === 'Gabriel Leão').catch(() => false), 'avatar do topo mostra a foto (alt = nome)');
  await page.evaluate(() => window.AOS.db.update('team', 't-gabriel', { foto: 'data:image/png;base64,AAAA' }));
  await page.waitForFunction(() => !document.querySelector('.tb-av .av img'), null, { timeout: 3000 }).catch(() => {});
  ok(!(await page.$('.tb-av .av img')) && (await page.textContent('.tb-av .av')).trim() === 'GL', 'foto quebrada volta às iniciais');
  await page.evaluate(() => window.AOS.db.update('team', 't-gabriel', { foto: null }));
  const lf = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 400; const g = c.getContext('2d'); g.fillStyle = '#0B6BE8'; g.fillRect(0, 0, 600, 400);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); const f = new File([blob], 'foto.png', { type: 'image/png' });
    const url = await window.AOS.ui.lerFoto(f); const im = new Image(); im.src = url; await im.decode();
    let erro = ''; try { await window.AOS.ui.lerFoto(new File(['x'], 'a.gif', { type: 'image/gif' })); } catch (e) { erro = e.message; }
    return { ini: url.slice(0, 15), w: im.naturalWidth, h: im.naturalHeight, kb: url.length / 1024, erro };
  });
  ok(lf.ini === 'data:image/jpeg' && lf.w === 256 && lf.h === 256 && lf.kb < 60, `lerFoto: JPEG 256×256 (${lf.w}×${lf.h}, ${lf.kb.toFixed(1)} KB)`);
  ok(/Formato não suportado/.test(lf.erro), 'lerFoto recusa GIF com mensagem em pt-BR');

  step('celular: barra inferior');
  if (t.vp.w < 700) {
    const bn = await page.$$eval('#bnav .bn-i', els => els.map(e => e.dataset.bn));
    ok(bn.length === 4 && bn[0] === 'hoje' && bn.includes('clientes') && bn.includes('notificacoes'), `4 atalhos (${bn.join(',')})`);
    ok(await page.isVisible('#bnav'), 'barra visível');
    await page.click('#bnav [data-bn="clientes"]'); await page.waitForTimeout(250);
    ok(page.url().includes('#/clientes') && await page.$eval('#bnav [data-bn="clientes"]', e => e.getAttribute('aria-current') === 'page'), 'navega e marca o atalho atual');
    const pad = await page.$eval('#view', e => parseFloat(getComputedStyle(e).paddingBottom));
    ok(pad >= 80, `conteúdo com respiro para a barra (${pad}px)`);
    await page.click('#bnav [data-bn="notificacoes"]'); await page.waitForTimeout(250);
    ok(page.url().includes('#/notificacoes'), 'atalho Notificações');
  } else ok(!(await page.isVisible('#bnav')), 'barra inferior só no celular');

  step('router: um render por navegação');
  await t.ir('#/cockpit');
  const r0 = await page.evaluate(() => window.AOS.shell.renders());
  await page.evaluate(() => { location.hash = '#/equipe'; }); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.AOS.shell.renders()) - r0 === 1, 'hashchange + popstate não renderizam 2×');
  const r1 = await page.evaluate(() => window.AOS.shell.renders());
  await page.goBack(); await page.waitForTimeout(300);
  ok(page.url().includes('#/cockpit') && await page.evaluate(() => window.AOS.shell.renders()) - r1 === 1, 'voltar do navegador renderiza 1×');

  step('router: refresh relê a URL (parâmetro de uso único não volta)');
  await t.ir('#/_ui?acao=teste&f=x');
  await page.evaluate(() => { window.AOS.router.setQuery({ acao: null }); window.AOS.shell.refresh(); }); await page.waitForTimeout(150);
  const ra = await page.evaluate(() => window.AOS.shell.rotaAtual().query);
  ok(ra.acao === undefined && ra.f === 'x', `rota do refresh sem ?acao (${JSON.stringify(ra)})`);
  ok(!page.url().includes('acao='), 'URL sem ?acao');

  step('rotas principais sem rolagem horizontal');
  await t.sair();
  await page.click('[data-quick="gabriel@agencia.demo"]'); await page.waitForSelector('#view');
  for (const r of ['cockpit', 'financeiro', 'clientes', 'clientes/c-orion', 'operacao', 'equipe', 'equipe/t-ana', 'torre', 'torre/voo', 'comercial', 'alertas', 'webinars', 'campanha', 'notificacoes', 'admin', '_ui']) await t.ir('#/' + r);
  await t.ir('#/_ui'); await page.click('[data-tema-btn]'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.documentElement.dataset.tema) === 'escuro', '#/_ui no escuro');
  await page.click('[data-tema-btn]');

  step('som de notificação nova (uma vez, nunca repete)');
  await page.addInitScript(() => {
    window.__somN = 0; window.__osc = 0; window.__gesto = false;
    addEventListener('aos:som', () => { window.__somN++; });
    addEventListener('pointerdown', () => { window.__gesto = true; }, true); addEventListener('keydown', () => { window.__gesto = true; }, true);
    const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
    class FakeAC {
      constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
      resume() { if (window.__gesto) { this.state = 'running'; return Promise.resolve(); } return Promise.reject(new Error('sem gesto')); }
      createGain() { return { gain: param(), connect() {} }; }
      createOscillator() { return { type: '', frequency: param(), connect() {}, start() { window.__osc++; }, stop() {} }; }
    }
    window.AudioContext = FakeAC; window.webkitAudioContext = FakeAC;
  });
  await t.login();
  await page.mouse.click(5, 300); await page.waitForTimeout(100);
  const som = () => page.evaluate(() => window.__somN);
  ok(await som() === 0, 'login não toca nada (notificações antigas)');
  await page.evaluate(() => window.AOS.db.insert('notifications', { id: 'n-som-1', para: 'u-gabriel', de: 'u-ana', tipo: 'mensagem', titulo: 'Teste de som', texto: '', lida: false, quando: new Date().toISOString() }));
  await page.waitForTimeout(300);
  ok(await som() === 1 && await page.evaluate(() => window.__osc) >= 1, 'notificação de outra pessoa toca 1 vez (WebAudio)');
  await page.evaluate(() => window.AOS.db.upsert('notifications', { id: 'n-som-1', para: 'u-gabriel', de: 'u-ana', tipo: 'mensagem', titulo: 'Teste de som (editada)', lida: false, quando: new Date().toISOString() }));
  await page.evaluate(() => window.AOS.db.insert('notifications', { id: 'n-som-2', para: 'u-gabriel', de: 'u-gabriel', tipo: 'mensagem', titulo: 'Minha própria', lida: false, quando: new Date().toISOString() }));
  await page.evaluate(() => window.AOS.db.insert('notifications', { id: 'n-som-3', para: 'u-ana', de: 'u-diego', tipo: 'mensagem', titulo: 'Para outra pessoa', lida: false, quando: new Date().toISOString() }));
  await page.waitForTimeout(300);
  ok(await som() === 1, 'não repete a mesma; própria e de outra pessoa não tocam');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('aos-som-tocadas:u-gabriel') || '[]').includes('n-som-1')), 'ids tocados guardados em aos-som-tocadas:<uid>');
  await page.evaluate(() => window.AOS.db._flush());
  await page.reload(); await page.waitForSelector('#view'); await page.waitForTimeout(500);
  ok(await som() === 0, 'recarregar não toca de novo');
  await page.evaluate(() => window.AOS.db.insert('notifications', { id: 'n-som-4', para: 'u-gabriel', de: 'u-marina', tipo: 'mencao', titulo: 'Antes do gesto', lida: false, quando: new Date().toISOString() }));
  await page.waitForTimeout(300);
  ok(await som() === 0, 'sem gesto o navegador bloqueia: fica pendente');
  await page.mouse.click(5, 300); await page.waitForTimeout(200);
  ok(await som() === 1, 'toca uma vez no próximo gesto');
  await page.mouse.click(5, 300); await page.waitForTimeout(200);
  ok(await som() === 1, 'não repete em gestos seguintes');
}
