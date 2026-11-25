// tests/live/voo.mjs — Painel de Voo (item 17) CONTRA O SUPABASE DE PRODUÇÃO (não faz parte de `npm test`).
// Cria 2 logins temporários (dono de teste e gestor de teste, domínio .invalid) e 1 cliente de teste ligado a UMA conta
// real do cache (+1 cliente de OUTRO responsável ligado a outra conta), chama as Edge Functions voo-dados e voo-acao e confere:
// gestor vê todas as contas VINCULADAS (cobre colega; decisão de 25/11/2026) mas não as sem cliente, receita removida para o gestor,
// busca ao vivo + intervalo mínimo de 20 s, conta fora do escopo recusada, SIM obrigatório, só pausar/orçamento, "ver como"
// recusado e "não configurado" sem META_ACCESS_TOKEN. No fim APAGA só o que criou. Imprime apenas contagens (nunca nomes).
// Uso: SQL_CMD=/caminho/q.sh NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=... node tests/live/voo.mjs
//   SQL_CMD: comando que recebe `-c "<sql>"` e devolve JSON (Management API do Supabase). Nunca use a service_role key aqui.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cfg = fs.readFileSync(path.join(ROOT, 'public/config.js'), 'utf8');
const URL_SB = /supabaseUrl:\s*'([^']+)'/.exec(cfg)[1];
const ANON = /supabaseAnonKey:\s*'([^']+)'/.exec(cfg)[1];
const SQL_CMD = process.env.SQL_CMD; if (!SQL_CMD) { console.error('Defina SQL_CMD.'); process.exit(2); }
const sql = q => { const out = execFileSync(SQL_CMD, ['-c', q], { encoding: 'utf8' }); const j = JSON.parse(out || '[]'); if (j && j.message) throw new Error(j.message); return j; };
const esc = s => String(s).replace(/'/g, "''");
let oks = 0, falhas = 0;
const ok = (c, m) => { if (c) { oks++; console.log(`  ✓ ${m}`); } else { falhas++; console.log(`  ✗ ${m}`); } return !!c; };
const DOM = '@voo-teste.invalid';
const SENHA = `Voo-${crypto.randomBytes(9).toString('base64url')}!9`;
const USUARIOS = [{ chave: 'dono', papel: 'dono', team: 't-voo-dono' }, { chave: 'gestor', papel: 'gestor_trafego', team: 't-voo-gestor' }];

function criarUsuario(u) {
  const id = crypto.randomUUID(); const email = `voo-${u.chave}${DOM}`;
  sql(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
       values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${email}', crypt('${esc(SENHA)}', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
       insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
       values (gen_random_uuid(), '${id}', '${id}', jsonb_build_object('sub', '${id}', 'email', '${email}'), 'email', now(), now(), now());
       insert into public.profiles (user_id, org_id, papel, team_id, app_user_id, ativo) values ('${id}', 'gmarketing', '${u.papel}', '${u.team}', 'u-voo-${u.chave}', true);
       insert into public.records (id, col, data, org_id) values
         ('users:u-voo-${u.chave}', 'users', '${esc(JSON.stringify({ id: `u-voo-${u.chave}`, nome: `Teste Voo ${u.chave}`, email, papel: u.papel, teamId: u.team, authId: id, ativo: true }))}'::jsonb, 'gmarketing'),
         ('team:${u.team}', 'team', '${esc(JSON.stringify({ id: u.team, nome: `Teste Voo ${u.chave}`, papel: u.papel, userId: `u-voo-${u.chave}`, ativo: true, area: 'Tráfego' }))}'::jsonb, 'gmarketing');`);
  return { ...u, id, email };
}
async function entrar(u) {
  const r = await fetch(`${URL_SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, password: SENHA }) });
  const j = await r.json(); if (!j.access_token) throw new Error(`login falhou (${r.status})`); return j.access_token;
}
async function fn(nome, token, body) {
  const r = await fetch(`${URL_SB}/functions/v1/${nome}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch { /* */ } return { status: r.status, j };
}
/** tela de produção (build com public/config.js) com o gestor de teste: lista, detalhe ao vivo, sem receita, ações desligadas */
async function telaProducao(u, conta) {
  console.log('▶ tela (build de produção)');
  const require = createRequire(import.meta.url);
  let pw; try { pw = require('playwright'); } catch { pw = require(path.join(spawnSync('npm', ['root', '-g'], { encoding: 'utf8' }).stdout.trim(), 'playwright')); }
  const DIST = path.resolve(process.env.OUT);
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(DIST, path.normalize(p)); if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const browser = await pw.chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: fs.readFileSync(process.env.SUPABASE_ESM_FILE, 'utf8') }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const page = await ctx.newPage(); const erros = [];
    page.on('pageerror', e => erros.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) erros.push(m.text()); });
    const raiz = `http://127.0.0.1:${srv.address().port}/index.html`;
    await page.goto(raiz); await page.waitForSelector('#lg-email', { timeout: 30000 });
    await page.fill('#lg-email', u.email); await page.fill('#lg-senha', SENHA); await page.click('.lg-go'); await page.waitForSelector('#view', { timeout: 30000 });
    await page.goto(`${raiz}#/torre/voo`); await page.waitForSelector('.m-voo-contas tbody tr', { timeout: 60000 });
    ok((await page.$$('.m-voo-contas tbody tr')).length === 1, 'tela: gestor abre em "Meus clientes" (1 conta, a do cliente dele)');
    await page.goto(`${raiz}#/torre/voo?f=todas`); await page.waitForTimeout(800); await page.waitForSelector('.m-voo-contas tbody tr', { timeout: 60000 });
    ok((await page.$$('.m-voo-contas tbody tr')).length >= 2, `tela: "Todas" mostra as contas dos outros clientes (${(await page.$$('.m-voo-contas tbody tr')).length})`);
    await page.goto(`${raiz}#/torre/voo/${conta}`); await page.waitForSelector(`[data-voo-conta="${conta}"]`, { timeout: 60000 });
    ok(/atualizado agora/.test(await page.textContent('.ph')), 'tela: detalhe buscado ao vivo ("atualizado agora")');
    ok(!/Faturamento/.test(await page.textContent('#view')), 'tela: sem faturamento para o gestor');
    ok(!(await page.$('[data-gt]')), 'tela: sem simulação de demonstração em produção');
    await page.goto(`${raiz}#/torre/voo/${conta}?aba=campanhas`); await page.waitForTimeout(1500);
    const bt = await page.$$eval('[data-voo-pausar],[data-voo-orc]', l => ({ n: l.length, off: l.every(b => b.disabled && /token/.test(b.title)) }));
    ok(bt.n === 0 || bt.off, `tela: botões de ação desligados até o token (${bt.n})`);
    ok(!(await page.$$eval('a[href]', l => l.some(a => /adsmanager|business\.facebook\.com/.test(a.href)))), 'tela: nenhum link para o Gerenciador');
    ok(!erros.length, `tela: sem erros de console${erros.length ? ` (${erros.slice(0, 2).join(' | ')})` : ''}`);
  } finally { await browser.close(); srv.close(); }
}
function limpar() {
  sql(`delete from public.records where id in ('clients:c-voo-teste', 'clients:c-voo-teste2') or id like 'users:u-voo-%' or id like 'team:t-voo-%' or (col in ('activity','clientActions') and (data->>'quem' like 'u-voo-%' or data->>'quem' like 't-voo-%' or data->>'clientId' in ('c-voo-teste', 'c-voo-teste2')));
       delete from public.records_feed where rec_id like 'users:u-voo-%' or rec_id like 'team:t-voo-%' or rec_id in ('clients:c-voo-teste', 'clients:c-voo-teste2') or rec_id like 'activity:%' and em > now() - interval '1 hour' and rec_id not in (select id from public.records);
       delete from public.voo_mudancas where user_id in (select id from auth.users where email like '%${DOM}');
       delete from auth.users where email like '%${DOM}';`);
  sql(`delete from public.voo_cache where chave like 'vivo:%' and split_part(chave, ':', 2) not in (select id::text from auth.users)`);
}

try {
  limpar();
  console.log('▶ preparação');
  const contas = sql(`select jsonb_array_length(dados) n, dados->0->>'id' a, dados->1->>'id' b from public.voo_cache where chave = 'contas'`)[0];
  if (!contas || !contas.n) throw new Error('cache de contas vazio: rode a atualização (voo-dados, acao atualizar) antes');
  const [dono, gestor] = USUARIOS.map(criarUsuario);
  // conta com gasto recente para o cliente de teste
  const dia = sql(`select dados from public.voo_cache where chave like 'dia:%' order by chave desc limit 1`)[0].dados;
  const contaTeste = Object.values(dia.estr.camps)[0].c;
  const outra = [contas.a, contas.b].find(x => x !== contaTeste);
  sql(`insert into public.records (id, col, data, org_id) values ('clients:c-voo-teste', 'clients', '${esc(JSON.stringify({ id: 'c-voo-teste', nome: 'Cliente de teste (Painel de Voo)', respId: gestor.team, equipe: [gestor.team], ativo: true, metaContas: [contaTeste], metaCustoConversa: 15 }))}'::jsonb, 'gmarketing')`);
  sql(`insert into public.records (id, col, data, org_id) values ('clients:c-voo-teste2', 'clients', '${esc(JSON.stringify({ id: 'c-voo-teste2', nome: 'Cliente de teste 2 (Painel de Voo)', respId: dono.team, equipe: [dono.team], ativo: true, metaContas: [outra] }))}'::jsonb, 'gmarketing')`);
  ok(true, `2 logins temporários e 2 clientes de teste (contas ativas no cache: ${contas.n})`);
  const tDono = await entrar(dono), tGestor = await entrar(gestor);

  console.log('▶ voo-dados: escopo e receita');
  const sem = await fetch(`${URL_SB}/functions/v1/voo-dados`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: '{}' });
  ok(sem.status === 401, `sem sessão → 401 (${sem.status})`);
  const gD = await fn('voo-dados', tDono, { acao: 'ler' });
  ok(gD.status === 200 && gD.j.contas.length >= contas.n && gD.j.veReceita === true && gD.j.escopo === 'todos', `dono: ${gD.j.contas.length} contas, escopo todos, receita liberada`);
  ok(gD.j.contas.filter(c => !c.clientId).length >= 1, `dono vê contas sem cliente vinculado (${gD.j.contas.filter(c => !c.clientId).length})`);
  ok(gD.j.linhas.length > 0 && gD.j.dias.length === 15, `pacote com ${gD.j.linhas.length} linhas e 15 dias`);
  ok(!!gD.j.atualizadoEm && Date.now() - Date.parse(gD.j.atualizadoEm) < 20 * 60000, `cache recente (${Math.round((Date.now() - Date.parse(gD.j.atualizadoEm)) / 60000)} min)`);
  const gG = await fn('voo-dados', tGestor, { acao: 'ler' });
  const vincDono = gD.j.contas.filter(c => c.clientId).map(c => c.id).sort();
  const semCli = gD.j.contas.find(c => !c.clientId && c.id !== contaTeste && c.id !== outra);
  ok(gG.status === 200 && gG.j.contas.length === vincDono.length && gG.j.contas.map(c => c.id).sort().join() === vincDono.join() && gG.j.contas.some(c => c.id === outra && c.clientId === 'c-voo-teste2'), `gestor: todas as contas vinculadas a clientes, inclusive de outro responsável (${gG.j.contas.length})`);
  ok(gG.j.contas.every(c => c.clientId), 'gestor: nenhuma conta sem cliente vinculado');
  ok((gG.j.meus || []).includes('c-voo-teste') && !(gG.j.meus || []).includes('c-voo-teste2'), 'gestor: "meus clientes" informado para o filtro padrão');
  ok(gG.j.veReceita === false && gG.j.linhas.length > 0 && gG.j.linhas.every(l => l[10] == null) && gG.j.escopo === 'todos', 'gestor: sem receita (action_values_purchase removido no servidor)');
  const vinc = new Set(vincDono); ok(Object.values(gG.j.camps).every(c => vinc.has(String(c.c))), 'gestor: nenhuma campanha de conta sem cliente');

  console.log('▶ voo-dados: detalhe ao vivo');
  const t0 = Date.now(); const v1 = await fn('voo-dados', tGestor, { acao: 'conta', conta: contaTeste });
  ok(v1.status === 200 && v1.j.fonte === 'vivo' && Date.now() - Date.parse(v1.j.atualizadoEm) < 120000, `busca ao vivo da conta (${Math.round((Date.now() - t0) / 1000)} s, ${v1.j.linhas.length} linhas)`);
  ok(Object.values(v1.j.sets).some(s => s.orc != null) || Object.values(v1.j.camps).some(c => c.orc != null), 'orçamentos diários presentes (conjunto ou campanha CBO)');
  const v2 = await fn('voo-dados', tGestor, { acao: 'conta', conta: contaTeste });
  ok(v2.status === 200 && v2.j.fonte === 'recente', `nova busca em menos de 20 s usa o resultado recente (${v2.j.fonte})`);
  const v3 = await fn('voo-dados', tGestor, { acao: 'conta', conta: outra });
  ok(v3.status === 200, `gestor busca ao vivo conta de cliente de outro responsável (${v3.status})`);
  if (semCli) { const v4 = await fn('voo-dados', tGestor, { acao: 'conta', conta: semCli.id }); ok(v4.status === 403, `gestor não busca conta sem cliente vinculado (${v4.status})`); }

  console.log('▶ voo-acao: regras no servidor');
  const base = { nivel: 'anuncio', id: '1234567890', conta: contaTeste };
  const a1 = await fn('voo-acao', tGestor, { acao: 'pausar', ...base });
  ok(a1.status === 400 && a1.j.codigo === 'confirmacao', `sem SIM → recusado (${a1.status} ${a1.j && a1.j.codigo})`);
  const a2 = await fn('voo-acao', tGestor, { acao: 'pausar', ...base, confirmacao: 'sim' });
  ok(a2.status === 400 && a2.j.codigo === 'confirmacao', '"sim" minúsculo recusado');
  const a3 = await fn('voo-acao', tGestor, { acao: 'excluir', ...base, confirmacao: 'SIM' });
  ok(a3.status === 400 && a3.j.codigo === 'acao_proibida', 'excluir/reativar não existem (só pausar e orçamento)');
  const a4 = await fn('voo-acao', tGestor, { acao: 'pausar', ...base, confirmacao: 'SIM', vendoComo: true });
  ok(a4.status === 403 && a4.j.codigo === 'ver_como', '"ver como" recusado');
  if (semCli) { const a5 = await fn('voo-acao', tGestor, { acao: 'pausar', ...base, conta: semCli.id, confirmacao: 'SIM' }); ok(a5.status === 403, `conta sem cliente vinculado recusada para o gestor (${a5.status})`); }
  const a5b = await fn('voo-acao', tGestor, { acao: 'pausar', ...base, conta: outra, confirmacao: 'SIM' });
  ok(a5b.status !== 403, `gestor passa do escopo na conta de cliente de outro responsável (${a5b.status} ${a5b.j && a5b.j.codigo})`);
  const a6 = await fn('voo-acao', tGestor, { acao: 'pausar', ...base, confirmacao: 'SIM' });
  ok(a6.status === 503 && a6.j.codigo === 'nao_configurado', `sem META_ACCESS_TOKEN → 503 "não configurado" (${a6.status})`);
  const st = await fn('voo-acao', tDono, { acao: 'status' });
  ok(st.status === 200 && st.j.configurado === false, 'status: ações aguardando o token');

  console.log('▶ limite de 10 mudanças de orçamento por conjunto por hora (banco)');
  const res = []; for (let k = 0; k < 11; k++) res.push(Number(sql(`select public.voo_reservar_mudanca('gmarketing','voo-teste-obj','x',null,1,2,10) r`)[0].r));
  ok(res.slice(0, 10).every(x => x > 0) && res[10] === -1, `10 reservas aceitas, a 11ª recusada (${res.filter(x => x > 0).length})`);
  const acima = Number(sql(`select public.voo_reservar_mudanca('gmarketing','voo-teste-obj','x',null,1,2,50) r`)[0].r);
  ok(acima === -1, 'limite pedido acima de 10 continua travado em 10');
  sql(`delete from public.voo_mudancas where objeto_id = 'voo-teste-obj'`);
  if (process.env.OUT && process.env.SUPABASE_ESM_FILE) await telaProducao(gestor, contaTeste);
  const priv = await fetch(`${URL_SB}/rest/v1/voo_cache?select=chave&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${tDono}` } });
  ok(priv.status === 401 || priv.status === 403 || (priv.ok && (await priv.json()).length === 0), `tabela voo_cache fechada para o navegador (${priv.status})`);
} catch (e) { falhas++; console.log(`  ✗ erro: ${e.message}`); }
finally {
  try { limpar(); const n = sql(`select (select count(*) from auth.users where email like '%${DOM}') u, (select count(*) from public.records where id in ('clients:c-voo-teste', 'clients:c-voo-teste2')) c`)[0]; ok(Number(n.u) === 0 && Number(n.c) === 0, 'limpeza: logins e cliente de teste apagados'); } catch (e) { falhas++; console.log(`  ✗ limpeza: ${e.message}`); }
}
console.log(`\n${oks} ok · ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
