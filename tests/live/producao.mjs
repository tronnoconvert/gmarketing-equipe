// tests/live/producao.mjs — teste de ponta a ponta CONTRA O SUPABASE DE PRODUÇÃO (não faz parte de `npm test`).
// Cria um Dono de teste (bootstrap), troca a senha provisória, cria um gestor de tráfego pela tela, verifica que o
// gestor NÃO recebe MRR/faturas/comissões alheias (memória, rede, armazenamento) e que a edição dele preserva o MRR
// no banco; no fim APAGA todos os usuários e registros de teste.
// Uso:  OUT=/tmp/aos-prod-live node build.mjs   (build de produção com public/config.js)
//       BOOTSTRAP_SECRET=... SQL_CMD=/caminho/q.sh OUT=/tmp/aos-prod-live NODE_USE_ENV_PROXY=1 node tests/live/producao.mjs
//   SQL_CMD: comando que recebe `-c "<sql>"` e devolve JSON (ex.: chamada à Management API do Supabase) — usado
//   para conferir o banco e limpar no final. Nunca use a service_role key aqui.
//   SUPABASE_ESM_FILE (opcional): supabase-js 2.45.4 empacotado em ESM, servido no lugar do cdn.jsdelivr.net.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.resolve(process.env.OUT || '/tmp/aos-prod-live');
const SQL_CMD = process.env.SQL_CMD;
if (!SQL_CMD || !process.env.BOOTSTRAP_SECRET) { console.error('Defina SQL_CMD e BOOTSTRAP_SECRET.'); process.exit(2); }
const require = createRequire(import.meta.url);
let playwright; try { playwright = require('playwright'); } catch { playwright = require(path.join(spawnSync('npm', ['root', '-g'], { encoding: 'utf8' }).stdout.trim(), 'playwright')); }

const sql = q => JSON.parse(execFileSync(SQL_CMD, ['-c', q], { encoding: 'utf8' }) || '[]');
const DOM = '@gmarketing.invalid';
const senhaForte = () => `E2e-${crypto.randomBytes(9).toString('base64url')}!7a`;
let oks = 0, falhas = 0;
const ok = (c, m) => { if (c) { oks++; console.log(`  ✓ ${m}`); } else { falhas++; console.log(`  ✗ ${m}`); } return !!c; };

/* servidor estático do build de produção */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, path.normalize(p));
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;

function limpar() {
  sql(`delete from auth.users where email like '%${DOM}'`);
  sql(`delete from public.records where org_id = 'gmarketing'`);
  sql(`truncate public.records_feed`);
}

const browser = await playwright.chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined });
const erros = [];
let ultima = null;
let esperado403 = false;
async function novaPagina() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  // SUPABASE_ESM_FILE: cópia local do supabase-js (ambientes sem acesso ao cdn.jsdelivr.net)
  if (process.env.SUPABASE_ESM_FILE) await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: fs.readFileSync(process.env.SUPABASE_ESM_FILE, 'utf8') }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage(); ultima = page;
  const respostas = [];
  page.on('pageerror', e => erros.push(`pageerror: ${e.message}`));
  // 403 esperado: o passo 6 tenta gravar uma fatura como gestor (o servidor recusa). Os demais 4xx/5xx contam como erro.
  page.on('console', m => { if (m.type() === 'error' && !/favicon|fonts\.g|Failed to load resource/.test(m.text())) erros.push(`console: ${m.text()}`); });
  page.on('response', r => { if (r.status() >= 400 && !(esperado403 && r.status() === 403 && /rpc\/gravar_record/.test(r.url()))) erros.push(`HTTP ${r.status()} ${r.url().replace(/\?.*/, '')}`); });
  page.on('response', async r => { if (/supabase\.co\/(rest|functions)\//.test(r.url())) { try { respostas.push({ url: r.url(), corpo: await r.text() }); } catch { /* sem corpo */ } } });
  return { ctx, page, respostas };
}
async function entrarComProvisoria(page, email, provisoria, nova) {
  await page.goto(base); await page.waitForSelector('.lg-form', { timeout: 30000 });
  ok(!(await page.$('.lg-demo')), 'tela de login sem o selo "Modo demonstração"');
  await page.fill('#lg-email', email); await page.fill('#lg-senha', provisoria); await page.click('.lg-go');
  await page.waitForSelector('.lg-troca', { timeout: 30000 });
  ok(true, `${email}: senha provisória aceita → tela "Crie sua nova senha"`);
  await page.fill('#lg-nova', 'curta'); await page.fill('#lg-conf', 'curta'); await page.click('.lg-troca .lg-go');
  await page.waitForSelector('.lg-troca .lg-err:not([hidden])');
  ok(/10 caracteres/.test(await page.textContent('.lg-troca .lg-err')), 'senha curta recusada (mínimo 10)');
  await page.fill('#lg-nova', nova); await page.fill('#lg-conf', nova); await page.click('.lg-troca .lg-go');
  await page.waitForSelector('#view', { timeout: 30000 });
  ok(true, `${email}: senha nova criada e app aberto`);
}

try {
  limpar();
  console.log('1) bootstrap do Dono de teste');
  const boot = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'scripts/criar-dono.mjs'), '--nome', 'Teste Dono', '--email', `teste.dono${DOM}`, '--papel', 'dono', '--json'], { encoding: 'utf8', env: process.env }));
  ok(boot.ok && boot.senha && boot.senha.length >= 16, 'bootstrap devolveu senha provisória (mostrada só uma vez)');
  ok(sql(`select trocar_senha from profiles p join auth.users u on u.id = p.user_id where u.email = 'teste.dono${DOM}'`)[0]?.trocar_senha === true, 'perfil do dono com trocar_senha = true');
  const segundo = spawnSync(process.execPath, [path.join(ROOT, 'scripts/criar-dono.mjs'), '--nome', 'Intruso', '--email', `intruso${DOM}`, '--papel', 'dono'], { encoding: 'utf8', env: { ...process.env, BOOTSTRAP_SECRET: 'segredo-errado' } });
  ok(segundo.status !== 0 && /inválido/.test(segundo.stderr), 'bootstrap com segredo errado é recusado');

  console.log('2) Dono: primeiro acesso');
  const D = await novaPagina();
  const senhaDono = senhaForte();
  await entrarComProvisoria(D.page, `teste.dono${DOM}`, boot.senha, senhaDono);
  ok(sql(`select trocar_senha from profiles p join auth.users u on u.id = p.user_id where u.email = 'teste.dono${DOM}'`)[0]?.trocar_senha === false, 'banco: trocar_senha limpo depois da troca');

  console.log('3) Dono cria cliente (MRR 1000 + comissão), fatura e notificações');
  const CID = 'c-e2e-teste', TG = 't-teste-gestor';
  await D.page.evaluate(async ({ CID, TG }) => {
    const { db } = window.AOS;
    db.insert('team', { id: TG, nome: 'Teste Gestor', email: 'teste.gestor@gmarketing.invalid', cargo: 'Gestor de tráfego', area: 'Tráfego', papel: 'gestor_trafego', ativo: true, custoHora: 0, horasMes: 160, skills: [] });
    db.insert('clients', { id: CID, nome: 'Cliente E2E', razaoSocial: 'Cliente E2E Ltda.', segmento: 'Varejo', mrr: 1000, respId: TG, equipe: [TG], health: 80, tendencia: [80, 80, 80, 80, 80, 80], ativo: true, status: 'ativo', pagamento: { estado: 'ok', texto: 'Em dia' }, renova: '2027-11-01', servicos: ['Tráfego'],
      comissoes: [{ id: 'cm-e2e', teamId: TG, tipo: 'percentual', valor: 10, meses: 6, inicio: '2026-11-01', obs: 'teste' }, { id: 'cm-e2e-2', teamId: 't-outra-pessoa', tipo: 'fixo', valor: 777, meses: 3, inicio: '2026-11-01' }] });
    db.insert('contracts', { id: 'ctr-e2e', clientId: CID, mrr: 1000, indice: 'IPCA', status: 'vigente' });
    db.insert('invoices', { id: 'fat-e2e', clientId: CID, valor: 1000, vencimento: '2026-12-10', status: 'aberta' });
    await db._pendentes();
  }, { CID, TG });
  const cli = sql(`select data from records where id = 'clients:${CID}'`)[0]?.data;
  ok(cli && cli.mrr === 1000 && cli.comissoes.length === 2, 'banco: cliente gravado com MRR 1000 e 2 comissões');
  ok(sql(`select count(*)::int n from records where id = 'invoices:fat-e2e'`)[0].n === 1, 'banco: fatura gravada pelo dono');

  console.log('4) Dono cria o gestor de tráfego pela tela (Administração › Usuários)');
  await D.page.evaluate(() => { location.hash = '#/admin/usuarios'; });
  await D.page.waitForSelector('[data-m-adm-convidar]', { timeout: 20000 });
  await D.page.click('[data-m-adm-convidar]');
  await D.page.waitForSelector('.mbox form [name="nome"]');
  await D.page.selectOption('.mbox form [name="teamId"]', TG);
  await D.page.fill('.mbox form [name="nome"]', 'Teste Gestor');
  await D.page.fill('.mbox form [name="email"]', `teste.gestor${DOM}`);
  await D.page.selectOption('.mbox form [name="papel"]', 'gestor_trafego');
  await D.page.click('.mbox [data-ok]');
  await D.page.waitForSelector('[data-m-adm-senha]', { timeout: 30000 });
  const provGestor = (await D.page.textContent('[data-m-adm-senha]')).trim();
  ok(provGestor.length >= 16 && /WhatsApp/.test(await D.page.textContent('.mbox:has([data-m-adm-senha])')), 'senha provisória mostrada uma vez, com "envie por WhatsApp"');
  ok(!JSON.stringify(sql(`select data from records where col = 'users'`)).includes(provGestor), 'senha provisória não está gravada nos registros do app');
  await D.page.click('.mbox:has([data-m-adm-senha]) [data-ok]');
  const gUser = sql(`select data from records where col = 'users' and data->>'email' = 'teste.gestor${DOM}'`)[0]?.data;
  ok(gUser && gUser.papel === 'gestor_trafego' && gUser.teamId === TG && gUser.senhaTemporaria === true, 'usuário gestor criado, ligado ao colaborador');
  await D.page.evaluate(async ({ G }) => {
    const { notify, db } = window.AOS;
    notify.enviar({ para: [G], tipo: 'sistema', titulo: 'Fatura de R$ 1.000 paga', texto: 'Cliente E2E · R$ 1.000 · em dia', link: '#/clientes' });
    notify.enviar({ para: [db.list('users').find(u => u.papel === 'dono').id], tipo: 'sistema', titulo: 'Só para o dono', texto: 'privado' });
    await db._pendentes();
  }, { G: gUser.id });
  await D.page.evaluate(() => window.AOS.auth.logout());
  await D.ctx.close();

  console.log('5) Gestor: primeiro acesso e o que ele recebe');
  const G = await novaPagina();
  await entrarComProvisoria(G.page, `teste.gestor${DOM}`, provGestor, senhaForte());
  const v = await G.page.evaluate(async (CID) => {
    const { db } = window.AOS;
    const c = db.get('clients', CID);
    const direto = await db.supabase.from('records').select('id,data').in('col', ['clients', 'invoices', 'contracts']);
    let ls = ''; try { ls = JSON.stringify(Object.assign({}, localStorage)); } catch (e) { /* sem storage */ }
    const idb = typeof indexedDB !== 'undefined' && indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : [];
    return { c, invoices: db.list('invoices').length, contrato: db.get('contracts', 'ctr-e2e'), notifs: db.list('notifications').map(n => ({ t: n.titulo, para: n.para })), direto: direto.data, ls, idb, papel: window.AOS.auth.user().papel, veReceita: window.AOS.perms.veReceita() };
  }, CID);
  ok(v.papel === 'gestor_trafego' && !v.veReceita, 'gestor logado, sem a permissão receita');
  ok(v.c && !('mrr' in v.c), `window.AOS.db.get('clients') sem mrr (chaves: ${v.c ? Object.keys(v.c).length : 0})`);
  ok(v.c && v.c.comissoes.length === 1 && v.c.comissoes[0].tipo === 'fixo' && v.c.comissoes[0].valor === 100, 'comissões: só a própria, convertida para R$ 100/mês (sem revelar o %/MRR)');
  ok(v.invoices === 0, 'faturas: 0 na memória');
  ok(v.contrato && !('mrr' in v.contrato), 'contrato sem valor');
  ok(Array.isArray(v.direto) && v.direto.length === 0, 'SELECT direto na tabela records (clients/invoices/contracts) devolve 0 linhas');
  ok(!/"mrr"|valor\\?":1000/.test(v.ls) && !v.idb.length, 'localStorage/IndexedDB sem dados de receita');
  const rede = G.respostas.map(r => r.corpo).join('\n');
  ok(G.respostas.length > 0 && !/"mrr"\s*:/.test(rede) && !/fat-e2e/.test(rede) && !/777/.test(rede), `rede: ${G.respostas.length} respostas do Supabase sem mrr, sem a fatura e sem a comissão alheia`);
  ok(v.notifs.some(n => n.t === 'Fatura de valor restrito paga') && !v.notifs.some(n => /R\$/.test(n.t)), 'notificação com R$ chega sem o valor');
  ok(!v.notifs.some(n => n.t === 'Só para o dono'), 'notificações de outra pessoa não chegam (RLS)');

  console.log('6) Gestor edita o cliente (campo comum) — o MRR fica intacto no banco');
  esperado403 = true;
  const e = await G.page.evaluate(async (CID) => {
    const { db } = window.AOS;
    const erros = []; const off = db.on((col, op, o) => { if (op === 'erro') erros.push(`${col}: ${o.erro}`); });
    db.update('clients', CID, { segmento: 'Moda', mrr: undefined }, { log: 'editou o cadastro de Cliente E2E' });
    db.update('contracts', 'ctr-e2e', { indice: 'IGP-M' });
    db.insert('invoices', { id: 'fat-gestor', clientId: CID, valor: 1 }); // deve ser recusado (403)
    await db._pendentes(); off();
    return erros;
  }, CID);
  esperado403 = false;
  const cli2 = sql(`select data from records where id = 'clients:${CID}'`)[0]?.data;
  ok(cli2.segmento === 'Moda' && cli2.mrr === 1000 && cli2.comissoes.length === 2 && cli2.comissoes[0].tipo === 'percentual', 'banco: segmento = Moda, MRR continua 1000 e as 2 comissões originais');
  ok(sql(`select data->>'indice' i, (data->>'mrr')::int m from records where id = 'contracts:ctr-e2e'`)[0].m === 1000, 'banco: contrato com MRR preservado');
  ok(e.length === 1 && /invoices/.test(e[0]) && sql(`select count(*)::int n from records where id = 'invoices:fat-gestor'`)[0].n === 0, 'gestor não consegue gravar fatura (recusado pelo servidor)');
  const act = sql(`select data->>'oque' o from records where col = 'activity' and data->>'quem' = '${gUser.id}'`);
  ok(act.length >= 1, 'auditoria do gestor gravada');

  console.log('7) Realtime: o dono muda o cliente no banco; o gestor recebe sem o MRR');
  sql(`update records set data = data || '{"nome":"Cliente E2E RT","mrr":1500}' where id = 'clients:${CID}'`);
  const rt = await G.page.waitForFunction(CID => { const c = window.AOS.db.get('clients', CID); return c && c.nome === 'Cliente E2E RT' ? c : null; }, CID, { timeout: 20000 }).then(h => h.jsonValue()).catch(() => null);
  ok(rt && !('mrr' in rt), 'aviso do realtime chegou e o registro veio sem mrr');
  const feed = sql(`select count(*)::int n from records_feed`)[0].n;
  ok(feed > 0, `feed do realtime só com id/coleção/operação (${feed} avisos)`);
  await G.page.evaluate(() => window.AOS.auth.logout());
  await G.ctx.close();

  console.log('8) erros de página');
  ok(!erros.length, erros.length ? `erros: ${erros.slice(0, 5).join(' | ')}` : 'sem erros de console/página');
} catch (e) {
  falhas++; console.log(`  ✗ exceção: ${e.message.split('\n')[0]}`);
  if (ultima) { try { console.log('    tela:', (await ultima.evaluate(() => document.body.innerText)).slice(0, 600).replace(/\s+/g, ' ')); } catch { /* fechada */ } }
  if (erros.length) console.log('    erros:', erros.slice(0, 6).join(' | '));
} finally {
  console.log('9) limpeza');
  try {
    limpar();
    const r = sql(`select (select count(*) from auth.users)::int usuarios, (select count(*) from public.profiles)::int perfis, (select count(*) from public.records)::int registros, (select count(*) from public.records_feed)::int feed, (select count(*) from public.orgs)::int orgs, (select count(*) from public.perm_padrao)::int matriz`)[0];
    ok(r.usuarios === 0 && r.perfis === 0 && r.registros === 0 && r.feed === 0 && r.orgs === 1 && r.matriz > 0, `projeto limpo: ${JSON.stringify(r)}`);
  } catch (e) { falhas++; console.log(`  ✗ limpeza: ${e.message}`); }
  await browser.close(); server.close();
  console.log(`\n${oks} ok · ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
}
