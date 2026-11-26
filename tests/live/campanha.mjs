#!/usr/bin/env node
// tests/live/campanha.mjs — teste REAL da Campanha (contas próprias CA01 e CA02 · HOF) contra a produção. Não faz parte de `npm test`.
// Cria por SQL (Management API) um login TEMPORÁRIO de dono e um de gestor numa organização temporária, chama a Edge Function
// windsor-proxy com as duas contas e os presets que a Windsor recusa (today/yesterday → date_from/date_to no servidor),
// confere que o gestor é recusado e APAGA tudo no final (sempre).
// Uso: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tests/live/campanha.mjs
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REF = 'hzonfbqsjxiwfmjywdlw';
const SUPA = `https://${REF}.supabase.co`;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || 'proxy-injected';
const ANON = (readFileSync(join(ROOT, 'public/config.js'), 'utf8').match(/supabaseAnonKey:\s*'([^']+)'/) || [])[1];
const CA01 = 'act_1906477940242386', CA02 = 'act_848802707655510';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const t = await r.text(); if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null;
}
let ok = 0, falhas = 0;
const check = (nome, cond, det = '') => { if (cond) ok++; else falhas++; console.log(`${cond ? '✓' : '✗'} ${nome}${det ? ` — ${det}` : ''}`); };

const SUF = randomBytes(4).toString('hex'); const ORG = `cpt-${SUF}`; const DOM = '@campanha-teste.invalid';
const U = Object.fromEntries(['dono', 'gestor_trafego'].map(p => [p, { id: randomUUID(), email: `cpt-${SUF}-${p.replace('_', '')}${DOM}`, senha: `Cpt-${randomBytes(12).toString('base64url')}-9z` }]));

async function preparar() {
  await sql(`begin; insert into public.orgs (id, nome) values (${lit(ORG)}, 'Teste Campanha temporário');
  ${Object.entries(U).map(([p, u]) => `
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', ${lit(u.id)}, 'authenticated', 'authenticated', ${lit(u.email)}, extensions.crypt(${lit(u.senha)}, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), ${lit(u.id)}, ${lit(u.id)}, jsonb_build_object('sub', ${lit(u.id)}, 'email', ${lit(u.email)}), 'email', now(), now(), now());
    insert into public.profiles (user_id, org_id, papel, team_id, app_user_id, ativo) values (${lit(u.id)}, ${lit(ORG)}, ${lit(p)}, ${lit(`t-cpt-${p}`)}, ${lit(`u-cpt-${p}`)}, true);`).join('\n')}
  commit;`);
  for (const u of Object.values(U)) {
    const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, password: u.senha }) });
    u.jwt = (await r.json()).access_token;
  }
}
async function limpar() {
  await sql(`begin; delete from public.records where org_id = ${lit(ORG)}; delete from public.profiles where org_id = ${lit(ORG)};
    delete from auth.users where email like ${lit(`cpt-${SUF}-%${DOM}`)}; delete from public.orgs where id = ${lit(ORG)}; commit;`);
  const r = await sql(`select (select count(*) from auth.users where email like '%${DOM}') u, (select count(*) from public.orgs where id like 'cpt-%') o, (select count(*) from public.profiles where org_id like 'cpt-%') p`);
  check('limpeza completa (0 usuários, 0 org, 0 perfis temporários)', r[0].u == 0 && r[0].o == 0 && r[0].p == 0, JSON.stringify(r[0]));
}
async function proxy(jwt, body) {
  const r = await fetch(`${SUPA}/functions/v1/windsor-proxy`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch { /* */ } return { status: r.status, j };
}
const contas = (rows) => new Set(rows.map(x => String(x.account_id || '').replace(/^act_/, '')));

try {
  await preparar();
  check('logins temporários criados', U.dono.jwt && U.gestor_trafego.jwt);
  // as duas contas existem e estão ativas na Windsor (consulta de estrutura, 2 anos: a CA02 · HOF ainda não veiculou)
  const t0 = Date.now();
  const r = await proxy(U.dono.jwt, { date_preset: 'last_730d', select_accounts: `${CA01},${CA02}`, fields: ['account_id', 'account_name', 'account_status'] });
  const rows = (r.j && r.j.data) || []; const cs = contas(rows);
  check('dono: as duas contas em uma chamada responde 200', r.status === 200, `HTTP ${r.status} em ${Date.now() - t0} ms${r.status !== 200 ? ' ' + JSON.stringify(r.j).slice(0, 200) : ''}`);
  check('CA01 devolve linhas', cs.has(CA01.slice(4)), `${rows.filter(x => String(x.account_id).endsWith(CA01.slice(4))).length} linhas`);
  check('CA02 · HOF devolve linhas', cs.has(CA02.slice(4)), `${rows.filter(x => String(x.account_id).endsWith(CA02.slice(4))).length} linhas`);
  check('nenhuma outra conta na resposta', [...cs].every(x => [CA01.slice(4), CA02.slice(4)].includes(x)), [...cs].length + ' contas');
  // dados diários por anúncio (o que a tela usa): 179 dias + hoje
  const t1 = Date.now();
  const d = await proxy(U.dono.jwt, { date_preset: 'last_179dT', select_accounts: `${CA01},${CA02}`, fields: ['date', 'account_id', 'campaign_id', 'campaign', 'adset_id', 'adset_name', 'ad_id', 'ad_name', 'effective_status', 'spend', 'impressions', 'clicks'] });
  const dr = (d.j && d.j.data) || [];
  const ult = dr.map(x => x.date).filter(Boolean).sort().pop();
  check('dados diários por anúncio (180 dias) chegam', d.status === 200 && dr.length > 0, `HTTP ${d.status} · ${dr.length} linhas em ${Date.now() - t1} ms · último dia com dado ${ult || '—'}`);
  for (const p of ['today', 'yesterday']) {
    const x = await proxy(U.dono.jwt, { date_preset: p, select_accounts: `${CA01},${CA02}`, fields: ['date', 'account_id', 'spend'] });
    check(`preset ${p} aceito (vira date_from/date_to)`, x.status === 200 && x.j.periodo && x.j.periodo.de, `HTTP ${x.status} · ${x.j && x.j.periodo ? JSON.stringify(x.j.periodo) : ''} · ${x.j && x.j.total} linhas`);
  }
  const so1 = await proxy(U.dono.jwt, { date_preset: 'last_7d', select_accounts: CA01, fields: ['date', 'account_id', 'spend'] });
  check('só CA01 quando pedido', so1.status === 200 && [...contas(so1.j.data)].every(x => x === CA01.slice(4)), `${so1.j && so1.j.total} linhas`);
  const g = await proxy(U.gestor_trafego.jwt, { date_preset: 'last_7d' });
  check('gestor de tráfego recusado (403)', g.status === 403, `HTTP ${g.status}`);
  const a = await proxy(ANON, { date_preset: 'last_7d' });
  check('sem login recusado', a.status === 401 || a.status === 403, `HTTP ${a.status}`);
  const inv = await proxy(U.dono.jwt, { select_accounts: 'act_1;drop' });
  check('select_accounts inválido recusado (400)', inv.status === 400, `HTTP ${inv.status}`);
} catch (e) { falhas++; console.error('ERRO', e.message); }
finally { try { await limpar(); } catch (e) { falhas++; console.error('limpeza falhou', e.message); } }
console.log(`\n${ok}/${ok + falhas} ok`);
process.exit(falhas ? 1 : 0);
