// tests/clientes.spec.mjs — carteira, filtros, importação CSV, ficha (5 abas + painel de comentários), resultados e ações,
// redirecionamento das abas antigas, plano de resgate, agendar reunião, registrar ação, cadastro (edição + validação + desfazer),
// cadastro em etapas, permissões, busca.
// SHOT=<pasta> grava screenshots (claro/escuro) das telas principais.
import fs from 'node:fs';
import path from 'node:path';

export default async function (t) {
  const { page, ok, step } = t;
  const shot = async (nome) => {
    if (!process.env.SHOT) return;
    fs.mkdirSync(process.env.SHOT, { recursive: true });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(process.env.SHOT, `${nome}-${t.vp.w}.png`), fullPage: true });
  };
  const txt = sel => page.textContent(sel);
  const db = (fn, arg) => page.evaluate(fn, arg);
  const fecharModal = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(220); };

  await t.login();

  step('dados canônicos');
  const tot = await db(() => { const l = AOS.db.list('clients'); return { n: l.length, mrr: l.reduce((a, c) => a + c.mrr, 0), risco: l.filter(c => c.health < 60).reduce((a, c) => a + c.mrr, 0), nr: l.filter(c => c.health < 60).length, orion: AOS.db.get('clients', 'c-orion') }; });
  ok(tot.n === 42, `42 clientes (${tot.n})`);
  ok(tot.mrr === 186400, `MRR 186.400 (${tot.mrr})`);
  ok(tot.nr === 5 && tot.risco === 23900, `5 em risco = 23.900 (${tot.nr}, ${tot.risco})`);
  ok(tot.orion && tot.orion.health === 41 && tot.orion.mrr === 14200 && tot.orion.respId === 't-ana', 'Grupo Orion conforme spec');
  // NPS removido: pesos 35/25/20/20, componentes sem NPS e scores exibidos mantidos
  const hs = await db(() => AOS.db.list('clients').map(c => { const k = c.componentes; const b = k.resultado * 0.35 + k.prazo * 0.25 + k.engajamento * 0.2 + k.pagamento * 0.2; return { id: c.id, h: c.health, calc: Math.round(b) - ((c.delta30 ?? 0) <= -15 ? 5 : 0), nps: 'nps' in c || 'nps' in k }; }));
  ok(hs.every(x => !x.nps), 'nenhum cliente com campo NPS');
  const difs = hs.filter(x => Math.abs(x.h - x.calc) > 1);
  ok(!difs.length, `health = Resultado 35% · Prazo 25% · Engajamento 20% · Pagamento 20% (${JSON.stringify(difs.slice(0, 3))})`);
  ok(hs.find(x => x.id === 'c-orion').calc === 41, 'Orion continua 41 com os novos pesos (46 − 5)');
  const tetos = await db(() => ({ orion: AOS.db.get('clients', 'c-orion').tetoMidiaMensal, vida: AOS.db.get('clients', 'c-vida').tetoMidiaMensal, n: AOS.db.count('clients', c => c.tetoMidiaMensal > 0) }));
  ok(tetos.orion === 45000 && tetos.vida === 30000 && tetos.n >= 25, `teto de mídia semeado (${JSON.stringify(tetos)})`);
  const coms = await db(() => AOS.db.list('clients').flatMap(c => (c.comissoes || []).map(x => ({ ...x, clientId: c.id }))));
  ok(coms.length >= 4 && coms.length <= 6 && coms.every(x => x.id && x.teamId && ['fixo', 'percentual'].includes(x.tipo) && x.valor > 0 && x.meses >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(x.inicio)), `comissões semeadas no modelo combinado (${coms.length})`);

  step('carteira');
  await t.ir('#/clientes');
  await page.waitForSelector('.m-clientes .kpi');
  const kp = await page.$$eval('.m-clientes .kpi', els => els.map(e => e.textContent.replace(/\s+/g, ' ')));
  ok(kp.length === 5, `5 KPIs (${kp.length})`);
  ok(kp[0].includes('42') && kp[0].includes('▲ 3'), `Clientes ativos 42 ▲3 (${kp[0]})`);
  ok(kp[1].includes('74') && kp[1].includes('▼ 2'), `Health médio 74 ▼2 (${kp[1]})`);
  ok(kp[2].includes('5') && kp[2].includes('23,9 mil'), `Em risco 5 · R$ 23,9 mil (${kp[2]})`);
  ok(kp[3].includes('Renovam em 30 dias') && /\b3\b/.test(kp[3]) && kp[4].includes('8,3%'), `Renovam em 30 dias 3 (no lugar do NPS) e churn 8,3% (${kp[3]})`);
  ok(!/\bNPS\b/.test(await txt('.view')), 'Clientes sem NPS');
  ok(await page.isVisible('.m-clientes .kpi.alerta'), 'KPI em risco destacado');
  ok(await page.$$eval('.m-clientes .ch-disp svg.chart', e => e.length) === 1, 'matriz risco × valor');
  ok((await page.textContent('.ch-disp')).includes('Ação imediata'), 'quadrantes rotulados');
  ok(await page.$$eval('.m-clientes-cart tbody tr', e => e.length) === 42, 'carteira com 42 linhas');
  const chipsTxt = (await txt('.m-clientes-cart .chips')).replace(/\s+/g, ' ');
  ok(/Todos ?42/.test(chipsTxt) && /Em risco ?5/.test(chipsTxt) && /Com atraso ?4/.test(chipsTxt) && /Inadimplentes ?2/.test(chipsTxt) && /Renovam em 30 dias ?3/.test(chipsTxt), `chips com contagens (${chipsTxt})`);
  ok((await txt('.m-clientes')).includes('2 clientes parados em "Acessos" há mais de 5 dias'), 'alerta de onboarding');
  ok(await page.isVisible('.ch-calor svg') && await page.isVisible('.ch-funil svg'), 'safra e funil');
  await shot('carteira');

  step('filtro na URL');
  await page.click('.m-clientes-cart .chips a:has-text("Em risco")');
  await page.waitForTimeout(250);
  ok(/f=risco/.test(page.url()), 'filtro gravado na URL');
  ok(await page.$$eval('.m-clientes-cart tbody tr', e => e.length) === 5, 'Em risco = 5 linhas');
  await t.ir('#/clientes?f=renovam'); ok(await page.$$eval('.m-clientes-cart tbody tr', e => e.length) === 3, 'Renovam em 30 dias = 3');
  await t.ir('#/clientes?f=inadimplentes'); ok(await page.$$eval('.m-clientes-cart tbody tr', e => e.length) === 2, 'Inadimplentes = 2');
  await t.ir('#/clientes?f=atraso'); ok(await page.$$eval('.m-clientes-cart tbody tr', e => e.length) === 4, 'Com atraso = 4');

  step('busca na carteira');
  await t.ir('#/clientes');
  await page.fill('#m-clientes-q', 'orion'); await page.waitForTimeout(600);
  ok(/q=orion/.test(page.url()) && await page.$$eval('.m-clientes-cart tbody tr', e => e.length) === 1, 'busca filtra e grava ?q=');
  await page.fill('#m-clientes-q', 'xyzinexistente'); await page.waitForTimeout(600);
  ok((await txt('.m-clientes-cart')).includes('Nenhum cliente encontrado'), 'estado vazio da busca');
  await t.ir('#/clientes');

  step('exportar CSV');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 3000 }).catch(() => null), page.click('[data-csv]')]);
  ok(dl && /carteira-todos-.*\.csv/.test(dl.suggestedFilename()), 'download do CSV');

  step('importar planilha (CSV)');
  await page.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.remove()));
  ok(await page.isVisible('.ph [data-importar]') && await page.isVisible('.ph a[href="#/clientes/novo"]'), 'Importar planilha ao lado de Cadastrar cliente');
  const antesImp = await db(() => AOS.db.count('clients'));
  await page.click('[data-importar]'); await page.waitForSelector('[data-imp-txt]');
  const csv = 'nome;cnpj;segmento;mrr;responsavel\nLoja Teste Alfa;11.222.333/0001-81;Varejo;4.500,00;ana@agencia.demo\nClínica Beta;123;Saúde;3200;Bruno Lima\n;;;;\nPadaria Gama;;Alimentação;abc;\nPet Delta;;Pet;1500;Ninguém';
  await page.fill('[data-imp-txt]', csv); await page.waitForTimeout(450);
  ok((await page.$$('.m-clientes-imp-pv tbody tr')).length === 4, 'prévia com 4 linhas (vazia ignorada)');
  ok((await page.$$('.m-clientes-imp-pv tr.m-clientes-imp-err')).length === 2, '2 linhas com erro (CNPJ e MRR)');
  ok((await page.textContent('.ov-modal:not(.saindo) .mbox [data-ok]')).includes('Importar 2'), 'botão importa só as válidas');
  await shot('importar');
  await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await page.waitForTimeout(350);
  ok(await db(() => AOS.db.count('clients')) === antesImp + 2, 'importou 2 clientes');
  const alfa = await db(() => AOS.db.find('clients', c => c.nome === 'Loja Teste Alfa'));
  ok(alfa && alfa.mrr === 4500 && alfa.respId === 't-ana' && alfa.cnpj === '11.222.333/0001-81' && alfa.origem === 'importacao', 'campos mapeados (mrr, respId, cnpj)');
  ok(await page.$$eval('.m-clientes-cart tbody tr', e => e.length) === 44, 'importados aparecem na carteira');
  await t.ir(`#/clientes/${alfa.id}`); ok(await page.isVisible('.m-clientes-hd'), 'ficha do importado abre');
  await t.ir('#/clientes');
  await page.click('.toast:has-text("importados") [data-desfazer]'); await page.waitForTimeout(300);
  ok(await db(() => AOS.db.count('clients')) === antesImp, 'Desfazer remove os importados');

  step('ficha Grupo Orion — visão geral');
  await t.ir('#/clientes/c-orion');
  await page.waitForSelector('.m-clientes-hd');
  const hd = (await txt('.m-clientes-hd')).replace(/\s+/g, ' ');
  ok(hd.includes('41') && hd.includes('R$ 14.200') && hd.includes('12/02/2027') && hd.includes('▼ 22'), `cabeçalho (${hd})`);
  ok((await txt('.ph')).includes('Varejo') && (await txt('.ph')).includes('14 meses'), 'segmento e tempo de casa');
  const mot = await txt('.m-clientes-mot');
  ok(mot.includes('ROAS 1,8 vs meta 3,0 há 6 semanas') && mot.includes('3 entregas atrasadas no mês') && mot.includes('Decisor não responde há 11 dias'), `por que está em risco (${mot.slice(0, 160)})`);
  const comp = (await txt('.m-clientes-comp')).replace(/\s+/g, ' ');
  ok(comp.includes('30 / meta 80') && comp.includes('45 / meta 90') && comp.includes('32 / meta 75') && comp.includes('90 / meta 95') && await page.$$eval('.m-clientes-ci', e => e.length) === 4, `4 componentes atual × meta, sem NPS (${comp})`);
  ok(comp.includes('35%') && comp.includes('25%'), 'pesos 35% e 25% na barra');
  const teto = (await txt('.m-clientes-teto')).replace(/\s+/g, ' ');
  ok(teto.includes('Teto de mídia: R$ 45.000/mês') && teto.includes('≈ R$ 1.480/dia'), `teto de mídia na visão geral (${teto})`);
  ok(!/\bNPS\b/.test(await txt('.view')), 'ficha sem NPS');
  const abas = await page.$$eval('.m-clientes-main .tabs a', e => e.map(a => a.textContent.replace(/\d+/g, '').trim()));
  ok(abas.join('|') === 'Visão geral|Resultados e ações|Entregas|Cadastro|Financeiro', `5 abas (${abas.join(' · ')})`);
  ok((await txt('.m-clientes-hsc')).includes('41') && !(await page.$('.m-clientes-calc')), 'health score compacto, cálculo recolhido');
  await page.click('[data-calc]'); await page.waitForSelector('.m-clientes-calc');
  ok(/calc=1/.test(page.url()), 'Ver cálculo grava ?calc=1');
  ok((await txt('.m-clientes-calc')).includes('−5') && (await txt('.m-clientes-calc')).includes('35%') && (await txt('.m-clientes-calcc')).includes('Pagamento em dia 20%'), 'cálculo com pesos novos e penalidade');
  ok(!/\bNPS\b/.test(await txt('.m-clientes-calcc')), 'cálculo sem NPS');
  ok(await page.isVisible('.m-clientes-calcc .ch-linhas svg'), 'histórico do score');
  await shot('ficha-visao-calculo');
  await page.click('.m-clientes-calcb'); await page.waitForTimeout(250);
  ok(!(await page.$('.m-clientes-calc')), 'Ocultar cálculo');
  await shot('ficha-visao');

  step('painel de comentários');
  const nCom = await db(() => AOS.db.count('comments', x => x.refCol === 'clients' && x.refId === 'c-orion'));
  ok((await txt('[data-com-toggle]')).includes(`(${nCom})`), `botão Comentários (${nCom}) no cabeçalho`);
  await page.click('[data-com-toggle]'); await page.waitForTimeout(400);
  const lado = t.vp.w >= 1200;
  ok(lado ? await page.isVisible('#m-clientes-com .cmt') : await page.isVisible('.ov-drawer .cmt'), lado ? 'coluna lateral (desktop)' : 'gaveta (telas menores)');
  await page.fill(lado ? '#m-clientes-com textarea' : '.ov-drawer textarea', 'Teste automatizado no painel de comentários.');
  await page.click(lado ? '#m-clientes-com .cmt-f [type="submit"]' : '.ov-drawer .cmt-f [type="submit"]'); await page.waitForTimeout(350);
  ok(await db(() => AOS.db.count('comments', x => x.refId === 'c-orion' && /painel de comentários/.test(x.texto))) === 1, 'comentário publicado no painel');
  await shot('ficha-comentarios');
  if (lado) {
    await t.ir('#/clientes/c-orion/entregas');
    ok(await page.isVisible('#m-clientes-com .cmt'), 'painel continua aberto em outra aba (lembrado)');
    await page.click('[data-com-fechar]'); await page.waitForTimeout(300);
    ok(!(await page.isVisible('#m-clientes-com')), 'recolher o painel');
  } else { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }

  step('abas antigas redirecionam');
  const red = async (de, re, msg) => { await t.ir(de); await page.waitForTimeout(350); ok(re.test(page.url()), `${msg} (${page.url().split('#')[1]})`); };
  await red('#/clientes/c-orion/resultados?m=cpl', /\/clientes\/c-orion\/resultados-acoes\?m=cpl$/, 'resultados → resultados-acoes (mantém ?m=)');
  await red('#/clientes/c-orion/acoes', /\/clientes\/c-orion\/resultados-acoes$/, 'acoes → resultados-acoes');
  await red('#/clientes/c-orion/saude', /\/clientes\/c-orion\?calc=1$/, 'saude → visão geral com cálculo aberto');
  ok(await page.isVisible('.m-clientes-calc'), 'cálculo aberto após redirecionar');
  await red('#/clientes/c-orion/visao', /\/clientes\/c-orion$/, 'visao → visão geral');
  await red('#/clientes/c-orion/comentarios', /\/clientes\/c-orion$/, 'comentarios → visão geral');
  ok(t.vp.w >= 1200 ? await page.isVisible('#m-clientes-com .cmt') : await page.isVisible('.ov-drawer .cmt'), 'comentarios abre o painel');
  if (t.vp.w < 1200) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
  else { await page.click('[data-com-fechar]'); await page.waitForTimeout(250); }

  step('plano de resgate (?acao=resgate)');
  const tasks0 = await db(() => AOS.db.count('tasks'));
  const notif0 = await db(() => AOS.db.count('notifications', n => n.para === 'u-carla'));
  await t.ir('#/clientes/c-orion?acao=resgate');
  await page.waitForSelector('.mbox .m-clientes-rgf');
  ok(!/acao=/.test(page.url()), 'query ?acao= limpa');
  await shot('modal-resgate');
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(400);
  const tk = await db(() => AOS.db.list('tasks', x => x.origem === 'plano-resgate' && x.clientId === 'c-orion'));
  ok(tk.length >= 4 && tk.every(x => x.status === 'a_fazer' && x.respId && x.prazo && x.titulo), `tarefas criadas em tasks (${tk.length})`);
  ok(await db(() => AOS.db.count('tasks')) === tasks0 + tk.length, 'inseridas na coleção tasks');
  ok(await db(() => AOS.db.count('notifications', n => n.para === 'u-carla')) > notif0, 'responsável notificado');
  ok(await page.isVisible('.toast:has-text("Plano criado")'), 'toast do plano');
  await page.click('.toast:has-text("Plano criado") [data-desfazer]'); await page.waitForTimeout(300);
  ok(await db(() => AOS.db.count('tasks', x => x.origem === 'plano-resgate')) === 0, 'Desfazer remove as tarefas');

  step('agendar reunião (?acao=agendar)');
  await t.ir('#/clientes/c-technova?acao=agendar');
  await page.waitForSelector('.mbox');
  ok((await txt('.mbox')).includes('renova em 6 dias'), 'modal explica a renovação em 6 dias');
  await page.fill('.mbox [name="hora"]', '25:99'); await page.click('.mbox [data-ok]'); await page.waitForTimeout(150);
  ok(await page.isVisible('.mbox .fld-err'), 'valida horário');
  await page.fill('.mbox [name="hora"]', '15:30'); await page.click('.mbox [data-ok]'); await page.waitForTimeout(350);
  ok(await db(() => AOS.db.count('meetings', m => m.clientId === 'c-technova' && m.status === 'agendada')) === 1, 'reunião gravada');
  await t.ir('#/clientes?f=renovam');
  ok(!(await txt('.m-clientes')).includes('TechNova · R$ 9,7k') || (await txt('.m-clientes')).includes('reunião'), 'renovações refletem a reunião');

  step('resultados e ações (aba única)');
  await t.ir('#/clientes/c-orion/resultados-acoes');
  await page.waitForSelector('.m-clientes-dqs');
  const ordem = await page.$$eval('.m-clientes-aba .card-h h2', e => e.map(x => x.textContent.trim()));
  const pos = k => ordem.findIndex(x => x.startsWith(k));
  ok(pos('Desde que entramos') >= 0 && pos('Desde que entramos') < pos('ROAS') && pos('ROAS') < pos('Impacto das ações') && pos('Impacto das ações') < pos('Ações da equipe'), `ordem: KPIs → gráfico → impacto → linha do tempo (${ordem.slice(0, 4).join(' · ')})`);
  ok(await page.$$eval('.m-clientes-dq', e => e.length) === 4, '4 metas (ROAS, CPL, leads, faturamento)');
  ok(await page.$$eval('.ch-linhas .ch-mkp', e => e.length) >= 8, 'ações marcadas no gráfico');
  ok((await txt('.m-clientes-aba')).includes('Impacto das ações') && (await txt('.m-clientes-aba')).includes('aguardando'), 'impacto das ações com pendente');
  ok(await page.isVisible('.m-clientes-tl') && await page.isVisible('.m-clientes-aba [data-reg-acao]'), 'linha do tempo e Registrar ação na mesma aba');
  await shot('ficha-resultados');
  await page.click('[data-resumo]'); await page.waitForSelector('.mbox .m-clientes-rel');
  ok((await page.inputValue('.m-clientes-rel')).includes('RESULTADOS'), 'resumo mensal gerado');
  await page.click('.ov-modal:not(.saindo) .mbox [data-ok]'); await page.waitForTimeout(300);
  ok(await page.isVisible('.toast'), 'copiar resumo dá retorno');
  await page.click('.m-clientes-dq:nth-child(2)'); await page.waitForTimeout(250);
  ok(/m=cpl/.test(page.url()), 'troca de métrica pela URL');

  step('registrar ação aparece no gráfico');
  const mk0 = await page.$$eval('.ch-linhas .ch-mkp', e => e.length);
  await page.click('.m-clientes-aba [data-reg-acao]'); await page.waitForSelector('.mbox');
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(150);
  ok(await page.isVisible('.mbox .fld-err'), 'valida campos obrigatórios');
  await page.selectOption('.mbox [name="tipo"]', 'Ajuste de público');
  await page.fill('.mbox [name="data"]', '20/10/2026');
  await page.fill('.mbox [name="descricao"]', 'Teste automatizado: público de interesse em decoração excluído.');
  await page.click('.mbox [data-ok]'); await page.waitForTimeout(450);
  ok(await db(() => AOS.db.count('clientActions', a => a.clientId === 'c-orion' && /Teste automatizado/.test(a.descricao))) === 1, 'ação gravada');
  const mk1 = await page.$$eval('.ch-linhas .ch-mkp', e => e.length);
  ok(mk1 >= mk0, `marcador no gráfico (${mk0} → ${mk1})`);

  step('ações da equipe (linha do tempo)');
  await t.ir('#/clientes/c-orion/resultados-acoes');
  await page.waitForSelector('.m-clientes-tl');
  ok((await txt('.m-clientes-tlw0')).includes('Torre de Controle'), 'inclui ajustes da Torre');
  await t.ir('#/clientes/c-orion/resultados-acoes?area=torre');
  const nt = await page.$$eval('.m-clientes-tli', e => e.length);
  ok(nt === 2, `filtro por área = Torre (${nt})`);
  await page.selectOption('[data-f-pessoa]', 't-carla'); await page.waitForTimeout(250);
  ok(/pessoa=t-carla/.test(page.url()), 'filtro de pessoa na URL');
  await t.ir('#/clientes/c-orion/acoes?novo=1'); await page.waitForTimeout(400);
  ok(/resultados-acoes/.test(page.url()) && await page.isVisible('.mbox [name="descricao"]'), 'link antigo ?novo=1 abre Registrar ação');
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);

  step('demais abas');
  for (const aba of ['entregas', 'financeiro', 'cadastro']) {
    await t.ir(`#/clientes/c-orion/${aba}`);
    ok(await page.isVisible('.m-clientes-aba .card'), `aba ${aba}`);
  }
  await t.ir('#/clientes/c-orion/cadastro');
  ok((await txt('.m-clientes-aba')).includes('Token expirado'), 'acesso com LED de erro');
  ok((await txt('.m-clientes-aba')).replace(/\s+/g, ' ').includes('R$ 45.000/mês'), 'teto de mídia no cadastro');
  ok((await txt('.m-clientes-aba')).includes('Comissão variável') && (await txt('.m-clientes-aba')).includes('Ana Souza'), 'dono vê a comissão variável do cliente');
  ok(!/\bNPS\b/.test(await txt('.view')), 'cadastro sem NPS');
  await page.click('[data-testar="0"]'); await page.waitForTimeout(900);
  ok(await page.isVisible('.toast'), 'testar conexão dá retorno');
  await shot('ficha-cadastro');

  step('editar cadastro: validação, aviso ao sair, desfazer');
  await page.click('a:has-text("Editar cadastro")'); await page.waitForSelector('#m-clientes-cad');
  await shot('ficha-cadastro-editar');
  await page.fill('#m-clientes-cad [name="cnpj"]', '11.111.111/1111-11');
  await page.fill('#m-clientes-cad [name="ct-email-0"]', 'email-invalido');
  await page.click('[data-salvar]'); await page.waitForTimeout(200);
  ok(await page.$$eval('#m-clientes-cad .fld-err', e => e.length) >= 2, 'erros de CNPJ e e-mail');
  await page.click('.tabs a:has-text("Resultados e ações")'); await page.waitForTimeout(250);
  ok(await page.isVisible('.mbox:has-text("Sair sem salvar")'), 'aviso de alterações não salvas');
  await page.click('.mbox [data-fechar].btn'); await page.waitForTimeout(250);
  ok(/cadastro/.test(page.url()), 'continua editando');
  const cnpjOrig = await db(() => AOS.db.get('clients', 'c-orion').cnpj);
  await page.fill('#m-clientes-cad [name="cnpj"]', cnpjOrig);
  await page.fill('#m-clientes-cad [name="ct-email-0"]', 'marcos@orion.com.br');
  await page.fill('#m-clientes-cad [name="mrr"]', 'R$ 15.000,00');
  await page.click('[data-salvar]'); await page.waitForTimeout(400);
  ok(await db(() => AOS.db.get('clients', 'c-orion').mrr) === 15000, 'MRR salvo');
  await page.click('.toast:has-text("Cadastro salvo") [data-desfazer]'); await page.waitForTimeout(300);
  ok(await db(() => AOS.db.get('clients', 'c-orion').mrr) === 14200, 'Desfazer restaura o MRR');

  step('editar cadastro: teto de mídia e comissão variável');
  await page.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.remove()));
  await t.ir('#/clientes/c-orion/cadastro?editar=1'); await page.waitForSelector('#m-clientes-cad');
  ok(await page.isVisible('#sec-comissao') && await page.isVisible('.m-clientes-secnav [data-sec="sec-comissao"]'), 'seção Comissão variável para o dono');
  await page.fill('#m-clientes-cad [name="tetoMidiaMensal"]', 'R$ 60.800,00'); await page.waitForTimeout(100);
  ok((await txt('[data-teto-dia]')).includes('R$ 2.000'), 'teto diário ao vivo (60.800 ÷ 30,4 = 2.000)');
  const nCm0 = await page.$$eval('.m-clientes-cmr', e => e.length);
  await page.click('[data-add-cm]'); await page.waitForTimeout(100);
  const i = nCm0; // nova linha
  await page.selectOption(`[name="cm-tipo-${i}"]`, 'percentual'); await page.waitForTimeout(100);
  await page.fill(`[name="cm-valor-${i}"]`, '150');
  await page.fill(`[name="cm-meses-${i}"]`, '80');
  await shot('cadastro-comissao');
  await page.click('[data-salvar]'); await page.waitForTimeout(250);
  const errs = await page.$$eval('#sec-comissao .fld-err', e => e.map(x => x.textContent));
  ok(errs.length >= 3 && errs.some(x => /100%/.test(x)) && errs.some(x => /60 meses/.test(x)), `valida pessoa, % ≤ 100 e meses 1–60 (${errs.join(' | ')})`);
  ok((await txt('#toasts')).includes('Faltam: Comissão variável'), 'toast resume onde estão os erros');
  // remover com Desfazer
  await page.click(`[data-rm-cm="${i}"]`); await page.waitForTimeout(150);
  ok(await page.$$eval('.m-clientes-cmr', e => e.length) === nCm0, 'linha removida');
  await page.click('.toast:has-text("removida") [data-desfazer]'); await page.waitForTimeout(150);
  ok(await page.$$eval('.m-clientes-cmr', e => e.length) === nCm0 + 1, 'Desfazer devolve a linha');
  await page.selectOption(`[name="cm-team-${i}"]`, 't-carla');
  await page.fill(`[name="cm-valor-${i}"]`, '2');
  await page.fill(`[name="cm-meses-${i}"]`, '4');
  const nCarla = await db(() => AOS.db.count('notifications', n => n.para === 'u-carla' && /comissão variável/.test(n.titulo)));
  await page.click('[data-salvar]'); await page.waitForTimeout(400);
  const orion = await db(() => AOS.db.get('clients', 'c-orion'));
  const nova = (orion.comissoes || []).find(x => x.teamId === 't-carla');
  ok(orion.tetoMidiaMensal === 60800 && nova && nova.tipo === 'percentual' && nova.valor === 2 && nova.meses === 4, `teto e comissão salvos (${JSON.stringify(nova)})`);
  const ntc = await db(() => AOS.db.list('notifications', n => n.para === 'u-carla' && /comissão variável/.test(n.titulo)));
  ok(ntc.length === nCarla + 1 && ntc.some(n => n.titulo.includes('Grupo Orion — R$ 284/mês por 4 meses')), `Carla notificada (${ntc.map(n => n.titulo).join(' | ')})`);
  await page.click('.toast:has-text("Cadastro salvo") [data-desfazer]'); await page.waitForTimeout(300);
  ok(await db(() => { const c = AOS.db.get('clients', 'c-orion'); return c.tetoMidiaMensal === 45000 && c.comissoes.length === 1; }), 'Desfazer restaura teto e comissões');

  step('cadastro em etapas (navegação livre)');
  await t.ir('#/clientes/novo');
  await page.waitForSelector('#m-clientes-wf');
  ok(await page.$$eval('.m-clientes-steps [data-ir]', e => e.length) === 5, 'todas as etapas clicáveis');
  // pula direto da etapa 1 (vazia) para a 4
  await page.click('.m-clientes-steps [data-ir="3"]'); await page.waitForTimeout(250);
  ok(await page.isVisible('[name="m-leads"]') && await page.isVisible('[name="tetoMidiaMensal"]'), 'etapa 4 aberta direto da 1 (com teto de mídia)');
  ok(await page.$eval('.m-clientes-steps li:nth-child(1)', e => e.classList.contains('pend') && /pendentes/.test(e.textContent)), 'etapa 1 marcada com pendências');
  ok(await page.$eval('.m-clientes-steps li:nth-child(2)', e => /não visitada/.test(e.textContent)), 'etapa 2 não visitada');
  await page.click('[data-avancar]'); await page.waitForTimeout(250);
  ok((await txt('#m-clientes-wf')).includes('Faltam:'), 'Continuar avança mesmo vazio; Revisão lista o que falta');
  await page.click('[data-criar]'); await page.waitForTimeout(300);
  ok(/novo$/.test(page.url()) && await page.isVisible('.m-clientes-faltabox.t-err'), 'Cadastrar bloqueia com resumo');
  const faltam = (await txt('.m-clientes-faltam')).replace(/\s+/g, ' ');
  ok(faltam.includes('Dados (nome fantasia, razão social, CNPJ, segmento)') && faltam.includes('Contatos (nome do decisor, e-mail do decisor') && faltam.includes('MRR'), `resumo "Faltam" (${faltam})`);
  ok((await txt('#toasts')).includes('Faltam: Dados'), 'toast com o resumo');
  await shot('novo-faltam');
  // link do resumo leva à etapa e foca o campo
  await page.click('.m-clientes-faltam [data-ir="1"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.name) === 'd-nome', 'link "Contatos" foca o nome do decisor');
  await page.fill('[name="d-nome"]', 'Joana Prates'); await page.fill('[name="d-email"]', 'joana@paonosso.com.br'); await page.fill('[name="d-tel"]', '11912345678');
  await page.click('.m-clientes-steps [data-ir="0"]'); await page.waitForTimeout(250);
  ok(await page.$$eval('#m-clientes-wf .fld-err', e => e.length) >= 3, 'voltar à etapa 1 mostra o que falta (sem bloquear)');
  ok(await page.$eval('.m-clientes-steps li:nth-child(2)', e => e.classList.contains('feito')), 'Contatos completa (check)');
  await page.fill('[name="nome"]', 'Grupo Orion');
  await page.fill('[name="razaoSocial"]', 'Teste Duplicado Ltda.');
  await page.fill('[name="cnpj"]', cnpjOrig);
  await page.selectOption('[name="segmento"]', 'Varejo');
  await page.click('[data-avancar]'); await page.waitForTimeout(250);
  await page.click('.m-clientes-steps [data-ir="0"]'); await page.waitForTimeout(250);
  ok((await txt('#m-clientes-wf')).includes('CNPJ já cadastrado'), 'aponta CNPJ duplicado');
  ok(await page.isVisible('.m-clientes-dup'), 'avisa nome duplicado');
  await page.fill('[name="nome"]', 'Padaria Pão Nosso');
  await page.fill('[name="razaoSocial"]', 'Pão Nosso Alimentos Ltda.');
  await page.fill('[name="cnpj"]', '11.222.333/0001-81');
  await page.waitForTimeout(300);
  await shot('novo-1');
  ok(await db(() => !!localStorage.getItem('aos-clientes-rascunho')), 'rascunho salvo');
  await page.click('.m-clientes-steps [data-ir="2"]'); await page.waitForTimeout(250);
  await page.fill('[name="mrr"]', '3500,00');
  await page.check('[name="servicos"][value="Social"]'); await page.check('[name="servicos"][value="Tráfego"]');
  // comissão no cadastro em etapas
  await page.click('[data-add-cm]'); await page.waitForTimeout(100);
  await page.selectOption('[name="cm-team-0"]', 't-diego'); await page.fill('[name="cm-valor-0"]', 'R$ 250,00'); await page.fill('[name="cm-meses-0"]', '3');
  await page.waitForTimeout(350);
  await page.click('[data-avancar]'); await page.waitForTimeout(250);
  await page.fill('[name="m-leads"]', '200');
  await page.fill('[name="tetoMidiaMensal"]', 'R$ 9.120,00');
  await page.waitForTimeout(350);
  await page.click('[data-avancar]'); await page.waitForTimeout(250);
  ok((await txt('#m-clientes-wf')).includes('Padaria Pão Nosso') && (await txt('#m-clientes-wf')).includes('Tudo pronto'), 'revisão sem pendências');
  ok((await txt('#m-clientes-wf')).replace(/\s+/g, ' ').includes('R$ 9.120/mês'), 'revisão mostra o teto');
  ok(await page.$$eval('.m-clientes-steps li.feito', e => e.length) === 5, 'todas as etapas completas');
  await shot('novo-revisao');
  const nDiego = await db(() => AOS.db.count('notifications', n => n.para === 'u-diego' && /comissão variável/.test(n.titulo)));
  await page.click('[data-criar]'); await page.waitForTimeout(450);
  ok(/novo\?ok=/.test(page.url()) && (await txt('.m-clientes-ok')).includes('Padaria Pão Nosso'), 'tela de sucesso');
  const novo = await db(() => AOS.db.find('clients', c => c.nome === 'Padaria Pão Nosso'));
  ok(novo && novo.status === 'onboarding' && await db(id => AOS.db.count('onboarding', o => o.clientId === id), novo.id) === 1, 'novo cliente em onboarding');
  ok(novo.tetoMidiaMensal === 9120 && novo.comissoes.length === 1 && novo.comissoes[0].teamId === 't-diego' && novo.comissoes[0].valor === 250, 'teto e comissão gravados no novo cliente');
  ok(await db(() => AOS.db.count('notifications', n => n.para === 'u-diego' && /comissão variável: Padaria Pão Nosso — R\$ 250\/mês por 3 meses/.test(n.titulo))) === nDiego + 1, 'Diego notificado da comissão');
  await page.click('a:has-text("Abrir ficha")'); await page.waitForTimeout(300);
  ok((await txt('.ph')).includes('Padaria Pão Nosso'), 'ficha do novo cliente');
  await t.ir(`#/clientes/${novo.id}/resultados-acoes`);
  ok((await txt('.m-clientes-aba')).includes('Resultados chegam') && await page.isVisible('.m-clientes-aba [data-reg-acao]'), 'resultados vazios ensinam o próximo passo; registrar ação continua disponível');

  step('busca global');
  const res = await db(() => { const m = AOS.shell; return AOS.db.list('clients').length; });
  ok(res === 43, 'novo cliente na base');

  step('tema escuro');
  await page.evaluate(() => AOS.shell.setTema('escuro'));
  await t.ir('#/clientes'); await shot('carteira-escuro');
  await t.ir('#/clientes/c-orion/resultados-acoes'); await shot('ficha-resultados-escuro');
  await page.evaluate(() => AOS.shell.setTema('claro'));

  step('permissões: gestora de tráfego vê só os seus');
  await t.sair();
  await t.login('ana@agencia.demo');
  await t.ir('#/clientes');
  const nAna = await page.$$eval('.m-clientes-cart tbody tr', e => e.length);
  const esperado = await db(() => AOS.perms.escopoClientes().length);
  ok(nAna === esperado && nAna < 42, `Ana vê ${nAna} clientes (escopo ${esperado})`);
  await t.ir('#/clientes/c-orion/cadastro');
  ok(!(await txt('.view')).includes('Comissão variável') && (await txt('.view')).replace(/\s+/g, ' ').includes('R$ 45.000/mês'), 'Ana vê o teto de mídia, mas não a comissão variável');
  await t.ir('#/clientes/c-orion/cadastro?editar=1');
  ok(await page.isVisible('#m-clientes-cad') && !(await page.$('#sec-comissao')) && !(await page.$('[data-add-cm]')), 'edição sem a seção de comissão para quem não vê receita');
  await t.ir('#/clientes/c-orion');
  ok((await txt('.m-clientes-teto')).includes('Teto de mídia'), 'teto visível para a equipe do cliente');
  await t.ir('#/clientes/novo'); await page.click('.m-clientes-steps [data-ir="2"]'); await page.waitForTimeout(250);
  ok(!(await page.$('[data-add-cm]')), 'cadastro em etapas sem comissão para quem não vê receita');
  await page.click('[data-descartar]'); await page.waitForTimeout(200);
  await t.ir('#/clientes/c-vida');
  ok((await txt('.view')).includes('Este cliente não está na sua carteira') || esperado && (await db(() => AOS.perms.podeCliente('c-vida'))), 'cliente fora do escopo bloqueado');

  step('permissões: produção só vê, sem editar');
  await t.sair();
  await t.login('carla@agencia.demo');
  await t.ir('#/clientes/c-orion');
  ok(await page.isVisible('.m-clientes-hd'), 'Carla vê o Orion (equipe)');
  ok(await page.$eval('[title*="Sem permissão"]', e => e.disabled).catch(() => false), 'ações desabilitadas com explicação');
  await t.ir('#/clientes/novo');
  ok((await txt('.view')).includes('Sem permissão para cadastrar'), 'produção não cadastra');
}
