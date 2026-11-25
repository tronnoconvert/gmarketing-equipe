// tests/producao-vazia.spec.mjs — produção NUNCA mostra dados fictícios.
// Sobe o app no modo "produção vazia": build de demonstração + AOS_CONFIG.seedDemo = false (LocalAdapter sem sementes),
// cria um único usuário dono pela API do db e visita todas as rotas, conferindo que nenhum nome/número das sementes
// e dos snapshots de demonstração aparece (página, cabeçalho, sino, menu do perfil, paleta) e que os estados vazios ensinam o próximo passo.
// A lista de textos proibidos é DERIVADA das sementes: o teste abre o modo demonstração antes e lê as coleções.
// SHOTS=<pasta> grava screenshots (claro e escuro) do Cockpit e do Financeiro.
export const viewports = [[1366, 900], [390, 844]];

const ROTAS = [
  '#/cockpit', '#/mesa',
  '#/financeiro', '#/financeiro/visao', '#/financeiro/caixa', '#/financeiro/dre', '#/financeiro/receber', '#/financeiro/rentabilidade', '#/financeiro/unidade', '#/financeiro/comissoes', '#/financeiro/automacao',
  '#/clientes', '#/clientes?f=risco', '#/clientes/novo',
  '#/operacao', '#/operacao/visao', '#/operacao/quadro', '#/operacao/calendario', '#/operacao/projetos',
  '#/equipe', '#/equipe/atividade', '#/equipe/t-resp', '#/equipe/t-resp/performance', '#/equipe/t-resp/horas',
  '#/torre', '#/comercial', '#/comercial/pipeline', '#/comercial/desempenho', '#/comercial/propostas',
  '#/alertas', '#/alertas/regras', '#/webinars', '#/webinars/novo',
  '#/campanha', '#/campanha/visao', '#/campanha/campanhas', '#/campanha/criativos', '#/campanha/conexao',
  '#/notificacoes', '#/padroes', '#/admin', '#/admin/usuarios', '#/admin/equipe', '#/admin/permissoes', '#/admin/integracoes', '#/admin/notificacoes', '#/admin/auditoria',
];
// textos de snapshots (não estão em coleções): valores do Cockpit/Financeiro/Clientes de demonstração
const FIXOS = ['186,4', 'R$ 412 mil', '23,9 mil', '27,4%', '6,8 meses', 'Sync de leads', 'Sync leads', 'score caiu 22', '+31 clientes', '98,3', 'R$ 1,98 mi', '543,4', '4.850', '4.438', 'Bella', 'Orion', 'TechNova', 'StudioFit', 'Studio Fit', 'Ana Souza', 'agencia.demo'];
// nomes de sementes genéricos demais para serem "fictícios" (rótulos legítimos da interface)
const GENERICOS = new Set(['Health score dos clientes', 'Torre de Controle', 'Relatório semanal', 'Backup de criativos', 'Meta Ads', 'Google Ads', 'WhatsApp', 'Windsor.ai', 'Supabase', 'monday.com', 'Instagram', 'Google Analytics 4', 'Meta']);

export default async function (t) {
  const { page, ok, step, base } = t;

  step('lista de textos fictícios derivada das sementes (modo demonstração)');
  const ctxDemo = await t.browser.newContext();
  const pd = await ctxDemo.newPage();
  await pd.goto(base + 'index.html'); await pd.waitForFunction(() => window.AOS && window.AOS.db);
  const derivados = await pd.evaluate(() => {
    const d = window.AOS.db; const out = new Set();
    const add = v => { v = String(v || '').trim(); if (v.length >= 5) out.add(v); };
    d.list('clients').forEach(c => { add(c.nome); add(c.fantasia); });
    d.list('team').forEach(p => add(p.nome)); d.list('users').forEach(p => add(p.nome));
    d.list('deals').forEach(x => { add(x.empresa); add(x.contato); });
    d.list('routines').forEach(x => add(x.nome)); d.list('webinars').forEach(x => add(x.titulo || x.nome));
    d.list('campaigns').forEach(x => add(x.nome || x.name)); d.list('invites').forEach(x => add(x.nome));
    d.list('alerts').forEach(x => add(x.titulo));
    return [...out];
  });
  await ctxDemo.close();
  const PROIBIDOS = [...new Set([...derivados.filter(s => !GENERICOS.has(s)), ...FIXOS])];
  ok(PROIBIDOS.length > 40, `lista de textos proibidos derivada das sementes (${PROIBIDOS.length})`);

  step('boot em produção vazia + usuário dono criado pela API do db');
  await page.addInitScript(() => { window.AOS_CONFIG = Object.assign({}, window.AOS_CONFIG, { seedDemo: false }); });
  await page.goto(base + 'index.html');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* nada */ } });
  await page.goto(base + 'index.html');
  await page.waitForSelector('.lg-form');
  ok(!(await page.$('.lg-demo')), 'login sem atalhos de demonstração');
  const vazio = await page.evaluate(() => {
    const d = window.AOS.db; const n = d.cols.filter(c => c !== 'settings' && c !== 'activity').reduce((s, c) => s + d.count(c), 0);
    d.insert('team', { id: 't-resp', nome: 'Responsável Teste', iniciais: 'RT', cargo: 'Diretor', area: 'Diretoria', papel: 'dono', email: 'dono@empresa.test', userId: 'u-resp', avatarCor: '#0B6BE8', status: 'online', ativo: true });
    d.insert('users', { id: 'u-resp', nome: 'Responsável Teste', iniciais: 'RT', email: 'dono@empresa.test', papel: 'dono', teamId: 't-resp', avatarCor: '#0B6BE8', cargo: 'Diretor', ativo: true, senha: 'senha-teste-123' });
    d._flush();
    return { n, dadosDemo: d.dadosDemo };
  });
  ok(vazio.n === 0, `coleções começam vazias (${vazio.n} registros)`);
  ok(vazio.dadosDemo === false, 'db.dadosDemo = false');
  await page.fill('#lg-email', 'dono@empresa.test'); await page.fill('#lg-senha', 'senha-teste-123');
  await page.click('.lg-go');
  await page.waitForSelector('#view', { timeout: 5000 }); await page.waitForTimeout(200);

  const conferir = async (onde, sel = 'body') => {
    const txt = await page.evaluate(s => { const e = document.querySelector(s); return e ? (e.innerText + ' ' + Array.from(e.querySelectorAll('[title],[aria-label],[data-tip]')).map(x => `${x.getAttribute('title') || ''} ${x.getAttribute('aria-label') || ''} ${x.getAttribute('data-tip') || ''}`).join(' ')) : ''; }, sel);
    const achados = PROIBIDOS.filter(s => txt.includes(s));
    ok(!achados.length, `${onde}: sem dados fictícios${achados.length ? ` (achou: ${achados.slice(0, 6).join(' | ')})` : ''}`);
    return txt;
  };

  step('cabeçalho: luz mestra neutra e sino sem notificações');
  await t.ir('#/cockpit'); await page.waitForSelector('.m-cockpit');
  const ml = await page.textContent('#ml');
  ok(/Sem rotinas configuradas/.test(ml), `luz mestra "Sem rotinas configuradas" (${ml.trim()})`);
  ok(!/Tudo operando/.test(ml), 'não diz "Tudo operando" sem rotinas');
  ok(await page.$eval('#bell .ib-badge', e => e.hidden), 'sino sem contador');
  ok(!(await page.$$eval('.nv .nv-badge, .nv .nv-dot, .nv [class*="cnt"]', e => e.length)), 'menu sem contadores');

  step('Cockpit: estados vazios que ensinam o próximo passo');
  const ck = await conferir('cockpit', '#view');
  ok(/lance receitas e custos no Financeiro/i.test(ck), 'Receita × Custos ensina a lançar no Financeiro');
  ok(!(await page.$('.ck-saude .ch-gauge')), 'sem gauge de saúde fictício');
  ok(!(await page.$('.ck-torre li')), 'sem rotinas fictícias na Torre');
  ok(/Clientes ativos/.test(ck), 'KPI de clientes ativos (zero verdadeiro)');

  for (const r of ROTAS) {
    step(`rota ${r}`);
    await t.ir(r); await page.waitForTimeout(120);
    await conferir(r);
  }

  step('sino, perfil e paleta');
  await t.ir('#/cockpit');
  await page.click('#bell'); await page.waitForSelector('.ntp'); await page.waitForTimeout(150);
  const sino = await conferir('sino', '.ntp'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(sino.trim().length > 0, 'painel do sino abriu');
  await page.click('.tb-av'); await page.waitForSelector('.pm'); await page.waitForTimeout(150);
  ok(!/Modo demonstração/.test(await page.textContent('.pm')), 'perfil sem "Modo demonstração"'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.evaluate(() => window.AOS.shell.abrirPaleta()); await page.waitForSelector('.ov-cmdk'); await page.waitForTimeout(150);
  await conferir('paleta', '.ov-cmdk');
  for (const q of ['or', 'be', 'tec', 'ana', 'sync']) { await page.fill('.ov-cmdk input', q); await page.waitForTimeout(180); await conferir(`paleta "${q}"`, '.ov-cmdk'); }
  await page.keyboard.press('Escape');
  step('busca global');
  if (await page.isVisible('#gs-in')) for (const q of ['orion', 'bella', 'ana']) { await page.evaluate(() => window.AOS.router.go('cockpit')); await page.fill('#gs-in', q); await page.waitForTimeout(250); const r = await page.$('.gs-pop'); if (r) await conferir(`busca "${q}"`, '.gs-pop'); await page.fill('#gs-in', ''); await page.keyboard.press('Escape'); }

  if (process.env.SHOTS) {
    step('screenshots');
    for (const tema of ['claro', 'escuro']) {
      await page.evaluate(x => window.AOS.shell.setTema(x), tema); await page.waitForTimeout(150);
      for (const r of ['cockpit', 'financeiro/visao', 'financeiro/caixa', 'financeiro/dre', 'financeiro/rentabilidade', 'financeiro/unidade', 'clientes', 'operacao', 'equipe', 'torre', 'comercial', 'comercial/desempenho', 'alertas', 'webinars', 'campanha', 'campanha/conexao', 'mesa', 'equipe/t-resp', 'admin/integracoes', 'financeiro/receber', 'notificacoes', 'operacao/quadro', 'clientes/novo']) {
        await t.ir('#/' + r); await page.waitForTimeout(250);
        await page.screenshot({ path: `${process.env.SHOTS}/${r.replace('/', '-')}-${tema}-${t.vp.w}.png`, fullPage: true });
      }
    }
    await page.evaluate(() => window.AOS.shell.setTema('claro'));
  }
}
