#!/usr/bin/env node
// tests/live/auditoria.mjs — AUDITORIA DE SEGURANÇA automática do Gmarketing (contra a produção). Não faz parte de `npm test`.
// Precisa só do token da Management API do Supabase (SUPABASE_ACCESS_TOKEN, ou um proxy que injete o token como nas sessões
// do Claude Code). NÃO precisa de nenhum segredo das Edge Functions: cria usuários e registros TEMPORÁRIOS por SQL (numa
// organização temporária "aud-…"), testa como cada papel pela API pública (anon key), e APAGA tudo no final (sempre).
//
// Uso:  NODE_USE_ENV_PROXY=1 node tests/live/auditoria.mjs --out docs/auditoria/AAAA-MM-DD.md
//   --projeto <ref>   (padrão hzonfbqsjxiwfmjywdlw)   --site <url> (padrão https://painel.agenciagmarketing.com.br)
//   --sem-status      não grava o resultado no card "Backups" do Cockpit (records backupStatus:auditoria / :nativo)
// Saída: relatório em pt-BR (markdown) com OK/FALHA por item e severidade. Código de saída 1 se houver FALHA crítica/alta.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const REF = opt('--projeto', 'hzonfbqsjxiwfmjywdlw');
const SITE = opt('--site', 'https://painel.agenciagmarketing.com.br').replace(/\/$/, '');
const OUT = opt('--out', join(ROOT, 'docs/auditoria', `${new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)}.md`)); // dia em São Paulo
const SUPA = `https://${REF}.supabase.co`;
const MGMT = `https://api.supabase.com/v1/projects/${REF}`;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || 'proxy-injected';
const ORG_APP = 'gmarketing';

/* ------------------------------------------------------------ util */
const R = []; // {area, item, sev, ok, det, regra}
const add = (area, item, sev, ok, det = '', regra = '') => { R.push({ area, item, sev, ok: ok === null ? null : !!ok, det: String(det).slice(0, 400), regra }); console.log(`${ok === null ? '•' : ok ? '✓' : '✗'} [${sev}] ${area} · ${item}${det ? ` — ${String(det).slice(0, 160)}` : ''}`); return ok; };
async function mgmt(path, init = {}) {
  const r = await fetch(MGMT + path, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const t = await r.text(); if (!r.ok) throw new Error(`Management API ${path} ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
const sql = (query) => mgmt('/database/query', { method: 'POST', body: JSON.stringify({ query }) });
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
async function http(url, { method = 'GET', headers = {}, body, token } = {}) {
  const h = { apikey: ANON, ...headers };
  if (token !== undefined) { if (token) h.Authorization = `Bearer ${token}`; } else h.Authorization = `Bearer ${ANON}`;
  if (token === null) { delete h.Authorization; delete h.apikey; }
  if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
  try {
    const r = await fetch(url, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: r.status, text: await r.text(), headers: r.headers };
  } catch (e) { return { status: 0, text: String(e.message), headers: new Headers() }; }
}

/* ------------------------------------------------------------ chaves públicas */
const cfg = readFileSync(join(ROOT, 'public/config.js'), 'utf8');
const ANON = (cfg.match(/supabaseAnonKey:\s*'([^']+)'/) || [])[1];
if (!ANON) { console.error('anon key não encontrada em public/config.js'); process.exit(2); }

/* ------------------------------------------------------------ dados temporários */
const SUF = randomBytes(4).toString('hex');
const ORG = `aud-${SUF}`, ORG2 = `aud-${SUF}-outra`, DOM = '@auditoria.invalid';
const CANARIO = /9876[5-6]\d|987\.6[5-6]\d|OUTRA-ORG-CANARIO/;
const PAPEIS = ['dono', 'gestor_trafego', 'cs', 'leitura'];
const U = {}; // papel -> {id, email, senha, app, team, jwt}

async function preparar() {
  for (const p of PAPEIS) U[p] = { id: randomUUID(), email: `aud-${SUF}-${p.replace('_', '')}${DOM}`, senha: `Aud-${randomBytes(12).toString('base64url')}-9z`, app: `u-aud-${p}`, team: `t-aud-${p}` };
  const usuarios = PAPEIS.map(p => { const u = U[p]; return `
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', ${lit(u.id)}, 'authenticated', 'authenticated', ${lit(u.email)}, extensions.crypt(${lit(u.senha)}, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), ${lit(u.id)}, ${lit(u.id)}, jsonb_build_object('sub', ${lit(u.id)}, 'email', ${lit(u.email)}), 'email', now(), now(), now());
    insert into public.profiles (user_id, org_id, papel, team_id, app_user_id, ativo) values (${lit(u.id)}, ${lit(ORG)}, ${lit(p)}, ${lit(u.team)}, ${lit(u.app)}, true);
    insert into public.records (id, col, org_id, data) values
      (${lit(`users:${u.app}`)}, 'users', ${lit(ORG)}, jsonb_build_object('id', ${lit(u.app)}, 'nome', 'Auditoria ${p}', 'email', ${lit(u.email)}, 'papel', ${lit(p)}, 'teamId', ${lit(u.team)}, 'authId', ${lit(u.id)}, 'ativo', true)),
      (${lit(`team:${u.team}`)}, 'team', ${lit(ORG)}, jsonb_build_object('id', ${lit(u.team)}, 'nome', 'Auditoria ${p}', 'papel', ${lit(p)}, 'userId', ${lit(u.app)}, 'ativo', true));`; }).join('\n');
  const g = U.gestor_trafego.team, cs = U.cs.team;
  const rec = (col, id, data, org = ORG) => `(${lit(`${col}:${id}`)}, ${lit(col)}, ${lit(org)}, ${lit(JSON.stringify({ id, ...data }))}::jsonb)`;
  await sql(`begin;
    insert into public.orgs (id, nome) values (${lit(ORG)}, 'Auditoria temporária'), (${lit(ORG2)}, 'Auditoria outra org');
    ${usuarios}
    insert into public.records (id, col, org_id, data) values
      ${rec('clients', 'aud-c1', { nome: 'Cliente Auditoria', respId: g, equipe: [g, cs], mrr: 987651, comissoes: [{ teamId: 't-outro', tipo: 'percentual', valor: 10 }], metaContas: ['act_000000000000001'] })},
      ${rec('contracts', 'aud-k1', { clientId: 'aud-c1', mrr: 987652, valor: 987653 })},
      ${rec('invoices', 'aud-i1', { clientId: 'aud-c1', valor: 987654, status: 'aberta' })},
      ${rec('finance', 'aud-f1', { valor: 987655 })},
      ${rec('cash', 'aud-x1', { valor: 987656 })},
      ${rec('mrrMoves', 'aud-m1', { clientId: 'aud-c1', valor: 987657 })},
      ${rec('campaignDaily', 'aud-cd1', { clientId: 'aud-c1', spend: 10, action_values_purchase: 987658 })},
      ${rec('campaigns', 'aud-cp1', { clientId: 'aud-c1', nome: 'Campanha auditoria', action_values_purchase: 987659 })},
      ${rec('webinars', 'aud-w1', { titulo: 'Webinar auditoria', faturamento: 987660, ticket: 987661, vendas: { reembolsos: 987662 } })},
      ${rec('alerts', 'aud-a1', { titulo: 'Queda de MRR R$ 987.663', gravidade: 'err', para: [g, cs] })},
      ${rec('clients', 'aud-o1', { nome: 'OUTRA-ORG-CANARIO', mrr: 987664 }, ORG2)};
    commit;`);
  for (const p of PAPEIS) {
    const r = await http(`${SUPA}/auth/v1/token?grant_type=password`, { method: 'POST', body: { email: U[p].email, password: U[p].senha } });
    U[p].jwt = r.status === 200 ? JSON.parse(r.text).access_token : null;
    if (!U[p].jwt) throw new Error(`login do usuário temporário ${p} falhou (${r.status}): ${r.text.slice(0, 200)}`);
  }
}
async function limpar() {
  try {
    await sql(`begin;
      delete from public.records where org_id in (${lit(ORG)}, ${lit(ORG2)});
      delete from public.profiles where org_id in (${lit(ORG)}, ${lit(ORG2)});
      delete from public.voo_mudancas where org_id in (${lit(ORG)}, ${lit(ORG2)});
      delete from auth.users where email like ${lit(`aud-${SUF}-%${DOM}`)};
      delete from public.orgs where id in (${lit(ORG)}, ${lit(ORG2)});
      commit;`);
    // sobras de execuções interrompidas (mais de 1 h)
    await sql(`delete from public.records where org_id like 'aud-%' and created_at < now() - interval '1 hour';
      delete from public.profiles where org_id like 'aud-%' and created_at < now() - interval '1 hour';
      delete from auth.users where email like '%${DOM}' and created_at < now() - interval '1 hour';
      delete from public.orgs where id like 'aud-%' and created_at < now() - interval '1 hour';`);
    const s = await sql(`select (select count(*) from auth.users where email like '%${DOM}') u, (select count(*) from public.records where org_id like 'aud-%') r, (select count(*) from public.orgs where id like 'aud-%') o`);
    add('Limpeza', 'usuários e registros temporários apagados', 'info', s[0].u == 0 && s[0].r == 0 && s[0].o == 0, `restam ${s[0].u} usuário(s), ${s[0].r} registro(s), ${s[0].o} org(s)`);
  } catch (e) { add('Limpeza', 'usuários e registros temporários apagados', 'alta', false, e.message); }
}

/* ------------------------------------------------------------ 1. banco */
async function banco() {
  const A = 'Banco (RLS e privilégios)';
  const t = await sql(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p')`);
  const sem = t.filter(x => !x.relrowsecurity).map(x => x.relname);
  add(A, `RLS ligado em todas as tabelas de public (${t.length})`, 'crítica', !sem.length, sem.length ? `sem RLS: ${sem.join(', ')}` : '');
  const v = await sql(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v','m') and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))`);
  add(A, 'nenhuma view/materialized view de public exposta', 'alta', !v.length, v.map(x => x.relname).join(', '));
  const ga = await sql(`select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'`);
  const extraAnon = ga.filter(g => !(g.table_name === 'records' && g.privilege_type === 'SELECT'));
  add(A, 'anon: nenhum privilégio de tabela além de SELECT em records (que o RLS zera)', 'alta', !extraAnon.length, extraAnon.map(g => `${g.privilege_type} ${g.table_name}`).join(', '));
  const PERM_AUTH = { records: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] };
  const gu = await sql(`select table_name, privilege_type from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public'`);
  const extraAuth = gu.filter(g => !((PERM_AUTH[g.table_name] || ['SELECT']).includes(g.privilege_type)) || /^voo_/.test(g.table_name));
  add(A, 'authenticated: só SELECT nas tabelas de apoio, escrita só em records (sob RLS); nada em voo_*', 'alta', !extraAuth.length, extraAuth.map(g => `${g.privilege_type} ${g.table_name}`).join(', '));
  const NEGAR = ['aos_chamar_funcao', 'voo_reservar_mudanca', 'registrar_senha_temporaria', 'usuario_ve_receita', 'gravar_record', 'apagar_record', 'concluir_troca_senha', 'tg_backup_status_guard', 'tg_records_guard', 'tg_users_sync_profile'];
  const fa = await sql(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') and p.proname = any(array[${NEGAR.map(lit).join(',')}])`);
  add(A, 'anon não executa funções sensíveis (gravar/apagar, agendador, senha, limite do Voo)', 'crítica', !fa.length, fa.map(x => x.proname).join(', '));
  const fu = await sql(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') and p.proname = any(array['aos_chamar_funcao','voo_reservar_mudanca','registrar_senha_temporaria','usuario_ve_receita'])`);
  add(A, 'authenticated não executa funções só do servidor (agendador, senha provisória, limite do Voo)', 'crítica', !fu.length, fu.map(x => x.proname).join(', '));
  const sd = await sql(`select n.nspname || '.' || p.proname f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.prosecdef and n.nspname = 'public' and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
  add(A, 'toda função SECURITY DEFINER tem search_path fixo', 'alta', !sd.length, sd.map(x => x.f).join(', '));
  const pub = await sql(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`);
  const pubX = pub.filter(p => p.tablename !== 'records_feed');
  add(A, 'realtime publica só o aviso records_feed (sem dados)', 'crítica', !pubX.length, pubX.map(p => p.tablename).join(', '));
  const feed = await sql(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'records_feed'`);
  add(A, 'records_feed não tem coluna de dados', 'alta', !feed.some(c => c.column_name === 'data'), feed.map(c => c.column_name).join(', '));
  const rc = await sql(`select col from public.receita_colecoes`); const rcs = rc.map(x => x.col);
  const faltam = ['invoices', 'payables', 'cash', 'mrrMoves', 'finance', 'costs', 'backupStatus'].filter(c => !rcs.includes(c));
  add(A, 'coleções de receita (faturas, caixa, MRR, finanças, custos) e status de backup marcadas como restritas', 'crítica', !faltam.length, faltam.length ? `faltam: ${faltam.join(', ')}` : '');
  const cm = await sql(`select col from public.col_modules where col = 'backupStatus'`);
  add(A, 'status dos backups: coleção fora de col_modules (só quem administra lê)', 'alta', !cm.length);
  const tg = await sql(`select tgname from pg_trigger where tgrelid = 'public.records'::regclass and not tgisinternal`);
  for (const n of ['records_guard', 'records_guard_ins', 'records_backup_status_guard']) add(A, `gatilho ${n} ativo em records`, 'alta', tg.some(x => x.tgname === n));
}

/* ------------------------------------------------------------ 2. storage */
async function storage() {
  const A = 'Storage (bucket backups)';
  const b = await sql(`select id, public from storage.buckets where id = 'backups'`);
  add(A, 'bucket backups existe e é PRIVADO', 'crítica', b.length === 1 && b[0].public === false, b.length ? `public=${b[0].public}` : 'não existe');
  const pol = await sql(`select policyname, roles::text r, qual, with_check from pg_policies where schemaname = 'storage' and (coalesce(qual,'') ilike '%backups%' or coalesce(with_check,'') ilike '%backups%' or (roles::text ~ 'anon|public' and coalesce(qual,'') in ('true','')))`);
  add(A, 'nenhuma política do Storage abre o bucket backups (ou todos os buckets) para anon/authenticated', 'crítica', !pol.length, pol.map(p => p.policyname).join(', '));
  const ob = await sql(`select name from storage.objects where bucket_id = 'backups' and name like 'diario/%.json.gz' order by name desc limit 1`);
  const nome = ob[0]?.name || 'diario/2000-01-01.json.gz';
  for (const [quem, tok] of [['anon', ANON], ['gestor_trafego', U.gestor_trafego.jwt], ['dono do app (logado)', U.dono.jwt]]) {
    const l = await http(`${SUPA}/storage/v1/object/list/backups`, { method: 'POST', token: tok, body: { prefix: 'diario', limit: 100 } });
    const lista = l.status === 200 ? JSON.parse(l.text) : [];
    add(A, `${quem}: não lista o bucket backups`, 'crítica', !(Array.isArray(lista) && lista.length), `HTTP ${l.status}, ${Array.isArray(lista) ? lista.length : '?'} item(ns)`);
    const d = await http(`${SUPA}/storage/v1/object/backups/${nome}`, { token: tok });
    add(A, `${quem}: não baixa o arquivo de backup`, 'crítica', d.status >= 400, `HTTP ${d.status}`);
  }
  const pu = await http(`${SUPA}/storage/v1/object/public/backups/${nome}`, { token: null });
  add(A, 'sem link público para o backup', 'crítica', pu.status >= 400, `HTTP ${pu.status}`);
}

/* ------------------------------------------------------------ 3. edge functions */
async function funcoes() {
  const A = 'Edge Functions';
  const fs = await mgmt('/functions');
  const SEM_JWT = new Set(['backup-diario']); // autenticação própria por segredo (x-cron-secret / x-backup-secret)
  for (const f of fs) {
    add(A, `${f.slug}: verify_jwt = ${SEM_JWT.has(f.slug) ? 'false (segredo próprio)' : 'true'}`, 'alta', f.verify_jwt === !SEM_JWT.has(f.slug), `verify_jwt=${f.verify_jwt}`);
    const a = await http(`${SUPA}/functions/v1/${f.slug}`, { method: 'POST', token: null, body: {} });
    add(A, `${f.slug}: chamada sem credencial recusada (401)`, 'crítica', a.status === 401, `HTTP ${a.status}`);
    const b = await http(`${SUPA}/functions/v1/${f.slug}`, { method: 'POST', headers: { 'x-cron-secret': 'segredo-errado-' + SUF, 'x-backup-secret': 'segredo-errado-' + SUF }, body: { acao: 'baixar' } });
    add(A, `${f.slug}: segredo do agendador errado recusado`, 'crítica', b.status === 401 || b.status === 403, `HTTP ${b.status}`);
  }
  const esperadas = ['admin-invite', 'notify', 'routines-runner', 'windsor-proxy', 'monday-sync', 'guardiao', 'voo-dados', 'voo-acao', 'backup-diario'];
  const faltam = esperadas.filter(s => !fs.some(f => f.slug === s));
  add(A, 'todas as funções esperadas publicadas', 'média', !faltam.length, faltam.join(', '));
  const sec = (await mgmt('/secrets')).map(s => s.name);
  for (const s of ['CRON_SECRET', 'BACKUP_DOWNLOAD_SECRET']) add(A, `segredo ${s} definido`, 'alta', sec.includes(s));
  add(A, 'BOOTSTRAP_SECRET removido depois da criação dos donos (porta de criação de dono fechada)', 'média', !sec.includes('BOOTSTRAP_SECRET'), sec.includes('BOOTSTRAP_SECRET') ? 'ainda definido' : '');
}

/* ------------------------------------------------------------ 4. papéis (receita, escrita, escalada, outras orgs) */
async function papeis() {
  const ids = ['clients:aud-c1', 'contracts:aud-k1', 'invoices:aud-i1', 'finance:aud-f1', 'cash:aud-x1', 'mrrMoves:aud-m1', 'campaignDaily:aud-cd1', 'campaigns:aud-cp1', 'webinars:aud-w1', 'alerts:aud-a1', 'clients:aud-o1'];
  // controle positivo: o dono temporário VÊ a receita (prova que os canários estão no lugar)
  const d = await http(`${SUPA}/rest/v1/rpc/ler_records`, { method: 'POST', token: U.dono.jwt, body: {} });
  add('Receita (controle)', 'dono temporário enxerga os valores-canário (o teste é válido)', 'info', /987651/.test(d.text) && /987654/.test(d.text), `HTTP ${d.status}`);
  add('Outras organizações', 'dono temporário NÃO vê a outra organização', 'crítica', !/OUTRA-ORG-CANARIO/.test(d.text));
  // controle positivo de escrita (passa pelos gatilhos de records): o dono grava e altera normalmente
  const g1 = await http(`${SUPA}/rest/v1/rpc/gravar_record`, { method: 'POST', token: U.dono.jwt, body: { p_col: 'clients', p_data: { id: 'aud-c2', nome: 'Cliente auditoria 2' } } });
  const g2 = await http(`${SUPA}/rest/v1/rpc/gravar_record`, { method: 'POST', token: U.dono.jwt, body: { p_col: 'clients', p_data: { id: 'aud-c2', nome: 'Cliente auditoria 2b' } } });
  const gc = await sql(`select data->>'nome' n from public.records where id = 'clients:aud-c2'`);
  add('Receita (controle)', 'dono temporário grava e altera registros normalmente (gatilhos funcionando)', 'alta', gc[0]?.n === 'Cliente auditoria 2b', `HTTP ${g1.status}/${g2.status}`);
  for (const p of ['gestor_trafego', 'cs', 'leitura']) {
    const A = `Papel ${p}`; const tok = U[p].jwt;
    const caminhos = [];
    caminhos.push(['SELECT direto em records', await http(`${SUPA}/rest/v1/records?select=*`, { token: tok })]);
    caminhos.push(['RPC ler_records', await http(`${SUPA}/rest/v1/rpc/ler_records`, { method: 'POST', token: tok, body: {} })]);
    for (const id of ids) caminhos.push([`RPC ler_record ${id.split(':')[0]}`, await http(`${SUPA}/rest/v1/rpc/ler_record`, { method: 'POST', token: tok, body: { p_id: id } })]);
    caminhos.push(['feed do realtime (records_feed)', await http(`${SUPA}/rest/v1/records_feed?select=*`, { token: tok })]);
    caminhos.push(['tabelas voo_cache/voo_mudancas', await http(`${SUPA}/rest/v1/voo_cache?select=*`, { token: tok })]);
    caminhos.push(['Edge Function voo-dados', await http(`${SUPA}/functions/v1/voo-dados`, { method: 'POST', token: tok, body: {} })]);
    caminhos.push(['Edge Function windsor-proxy', await http(`${SUPA}/functions/v1/windsor-proxy`, { method: 'POST', token: tok, body: {} })]);
    const vaz = caminhos.filter(([, r]) => CANARIO.test(r.text)).map(([n]) => n);
    add(A, `não lê receita (MRR, contratos, faturas, caixa, finanças, faturamento, action_values_purchase/ROAS) nem outra org por ${caminhos.length} caminhos`, 'crítica', !vaz.length, vaz.length ? `vazou por: ${vaz.join(', ')}` : '', 'receita só Dono/Admin');
    const roas = caminhos.filter(([n, r]) => /voo-dados/.test(n) && /"(action_values_purchase|roas|receita|faturamento)"\s*:\s*[1-9]/i.test(r.text)).map(([n]) => n);
    add(A, 'voo-dados sem valores de receita/ROAS', 'crítica', !roas.length, roas.join(', '), 'receita só Dono/Admin');
    const fn = await http(`${SUPA}/rest/v1/rpc/usuario_ve_receita`, { method: 'POST', token: tok, body: { p_org: ORG, p_app_user: U.dono.app } });
    add(A, 'não chama funções só do servidor (usuario_ve_receita)', 'alta', fn.status >= 400, `HTTP ${fn.status}`);
    // escrita em dados alheios
    await http(`${SUPA}/rest/v1/records?id=eq.invoices:aud-i1`, { method: 'PATCH', token: tok, body: { data: { id: 'aud-i1', valor: 1 } } });
    await http(`${SUPA}/rest/v1/rpc/gravar_record`, { method: 'POST', token: tok, body: { p_col: 'invoices', p_data: { id: 'aud-i1', valor: 2 } } });
    await http(`${SUPA}/rest/v1/rpc/gravar_record`, { method: 'POST', token: tok, body: { p_col: 'invoices', p_data: { id: `aud-i-${p}`, valor: 3 } } });
    await http(`${SUPA}/rest/v1/rpc/apagar_record`, { method: 'POST', token: tok, body: { p_id: 'contracts:aud-k1' } });
    await http(`${SUPA}/rest/v1/records`, { method: 'POST', token: tok, headers: { Prefer: 'return=minimal' }, body: { id: `clients:aud-z-${p}`, col: 'clients', org_id: ORG2, data: { id: `aud-z-${p}` } } });
    await http(`${SUPA}/rest/v1/records?id=eq.clients:aud-o1`, { method: 'PATCH', token: tok, body: { data: { id: 'aud-o1', nome: 'x' } } });
    await http(`${SUPA}/rest/v1/rpc/gravar_record`, { method: 'POST', token: tok, body: { p_col: 'backupStatus', p_data: { id: 'diario', ok: true } } });
    const w = await sql(`select (select data->>'valor' from public.records where id = 'invoices:aud-i1') v, (select count(*) from public.records where id = ${lit(`invoices:aud-i-${p}`)}) n,
      (select count(*) from public.records where id = 'contracts:aud-k1') k, (select count(*) from public.records where id = ${lit(`clients:aud-z-${p}`)}) z,
      (select data->>'nome' from public.records where id = 'clients:aud-o1') o, (select count(*) from public.records where col = 'backupStatus' and org_id = ${lit(ORG)}) b`);
    add(A, 'não altera, cria nem apaga dados financeiros/alheios (PATCH, gravar_record, apagar_record)', 'crítica', w[0].v === '987654' && w[0].n == 0 && w[0].k == 1, JSON.stringify(w[0]));
    add(A, 'não grava em outra organização', 'crítica', w[0].z == 0 && w[0].o === 'OUTRA-ORG-CANARIO');
    add(A, 'não forja o status dos backups', 'alta', w[0].b == 0);
    // escalada de papel
    await http(`${SUPA}/rest/v1/profiles?user_id=eq.${U[p].id}`, { method: 'PATCH', token: tok, body: { papel: 'dono', org_id: ORG_APP, ativo: true } });
    await http(`${SUPA}/rest/v1/rpc/gravar_record`, { method: 'POST', token: tok, body: { p_col: 'users', p_data: { id: U[p].app, nome: 'x', email: U[p].email, papel: 'dono', teamId: U[p].team, authId: U[p].id, ativo: true } } });
    await http(`${SUPA}/rest/v1/records?id=eq.users:${U[p].app}`, { method: 'PATCH', token: tok, body: { data: { id: U[p].app, papel: 'admin', authId: U[p].id } } });
    await http(`${SUPA}/rest/v1/rpc/gravar_record`, { method: 'POST', token: tok, body: { p_col: 'settings', p_data: { id: 'perms', matriz: { receita: { [p]: 'admin' }, admin: { [p]: 'admin' } } } } });
    const e = await sql(`select papel, org_id, (select data->>'papel' from public.records where id = ${lit(`users:${U[p].app}`)}) up, (select count(*) from public.records where id = 'settings:perms' and org_id = ${lit(ORG)}) sp from public.profiles where user_id = ${lit(U[p].id)}`);
    add(A, 'não escala o próprio papel/organização (profiles, users, matriz de permissões)', 'crítica', e[0]?.papel === p && e[0]?.org_id === ORG && e[0]?.up === p && e[0]?.sp == 0, JSON.stringify(e[0]));
    const inv = await http(`${SUPA}/functions/v1/admin-invite`, { method: 'POST', token: tok, body: { acao: 'convidar', nome: 'Invasor', email: `x-${SUF}${DOM}`, papel: 'dono' } });
    add(A, 'não usa admin-invite (criar logins)', 'crítica', inv.status === 403 || inv.status === 401, `HTTP ${inv.status}`);
    const st = await http(`${SUPA}/functions/v1/admin-invite`, { method: 'POST', token: tok, body: { acao: 'status_integracoes' } });
    add(A, 'não consulta status das integrações', 'média', st.status >= 400, `HTTP ${st.status}`);
  }
  // anon
  const A = 'Visitante sem login (anon)';
  const an = [await http(`${SUPA}/rest/v1/records?select=*`), await http(`${SUPA}/rest/v1/profiles?select=*`), await http(`${SUPA}/rest/v1/rpc/ler_records`, { method: 'POST', body: {} }), await http(`${SUPA}/rest/v1/orgs?select=*`)];
  add(A, 'não lê registros, perfis nem organizações', 'crítica', an.every(r => r.status >= 400 || r.text.trim() === '[]'), an.map(r => r.status).join(','));
  const ch = await http(`${SUPA}/rest/v1/rpc/aos_chamar_funcao`, { method: 'POST', body: { p_nome: 'guardiao' } });
  add(A, 'não dispara o agendador (aos_chamar_funcao)', 'crítica', ch.status >= 400, `HTTP ${ch.status}`);
  const su = await http(`${SUPA}/auth/v1/signup`, { method: 'POST', body: { email: `invasor-${SUF}${DOM}`, password: `X${randomBytes(12).toString('hex')}!` } });
  add(A, 'cadastro público desligado (só a Administração cria logins)', 'alta', su.status >= 400, `HTTP ${su.status}`);
  await sql(`delete from auth.users where email = ${lit(`invasor-${SUF}${DOM}`)}`);
}

/* ------------------------------------------------------------ 5. regras do dono (Painel de Voo e "ver como") */
async function regrasDono() {
  const A = 'Regras do dono';
  const voo = existsSync(join(ROOT, 'supabase/functions/voo-acao/index.ts')) ? readFileSync(join(ROOT, 'supabase/functions/voo-acao/index.ts'), 'utf8') : '';
  const r = await http(`${SUPA}/functions/v1/voo-acao`, { method: 'POST', token: U.gestor_trafego.jwt, body: { acao: 'pausar', nivel: 'campanha', id: '120000000000000001', conta: 'act_000000000000001' } });
  let cod = ''; try { cod = JSON.parse(r.text).codigo; } catch { /* */ }
  add(A, 'alteração no Meta sem "SIM" é recusada (teste ao vivo)', 'crítica', r.status === 400 && cod === 'confirmacao' || (r.status === 503 && /confirmacao !== 'SIM'/.test(voo)), `HTTP ${r.status} ${cod}`, 'SIM obrigatório');
  add(A, 'código exige confirmacao === "SIM" antes de qualquer ação', 'crítica', /confirmacao\s*!==\s*'SIM'/.test(voo), '', 'SIM obrigatório');
  add(A, 'toda alteração vai para o histórico com autor (activity + clientActions)', 'alta', /'activity'/.test(voo) && /clientActions/.test(voo) && /quem/.test(voo), '', 'histórico com autor');
  const marca = /outroGestor|deOutro|alheio|outro gestor|cliente de outro|naoResponsavel|foraDaCarteira/i.test(voo);
  add(A, 'alteração em cliente de outro gestor fica marcada no histórico', 'média', marca, marca ? '' : 'marca não encontrada em voo-acao (o dono pediu; conferir com quem implementa)', 'histórico com autor');
  const limite = voo.match(/max(?:imo)?Mudanc\w*[^\n]*?(\d+)/i) || voo.match(/no máximo \$\{?(\w+)\}? mudanças/);
  add(A, 'limite de mudanças de orçamento por hora: removido pelo dono (não é exigido)', 'info', null, /voo_reservar_mudanca|limite_hora/.test(voo) ? 'o código ainda contém o limite por hora (o dono pediu para remover; outra frente está tirando)' : 'sem limite por hora no código');
  const del = /method:\s*'DELETE'|status['"]?\s*[:=]\s*['"](DELETED|ARCHIVED)/.test(voo + (existsSync(join(ROOT, 'supabase/functions/guardiao/meta.ts')) ? readFileSync(join(ROOT, 'supabase/functions/guardiao/meta.ts'), 'utf8') : ''));
  add(A, 'pausar, nunca excluir/arquivar (voo-acao e guardião)', 'crítica', !del, '', 'pausar nunca excluir');
  add(A, '"ver como" é só visualização (voo-acao recusa a marca)', 'alta', /ver como|verComo/i.test(voo), '', '"ver como" só visualização');
  const au = readFileSync(join(ROOT, 'src/core/auth.js'), 'utf8');
  add(A, '"ver como" restrito a Dono/Admin no app', 'média', /ver como" \(só dono\/admin\)|verComo/.test(au));
}

/* ------------------------------------------------------------ 6. autenticação */
async function autenticacao() {
  const A = 'Autenticação (Supabase Auth)';
  const c = await mgmt('/config/auth');
  add(A, 'cadastro público desligado (disable_signup)', 'alta', c.disable_signup === true);
  add(A, 'confirmação de e-mail exigida (mailer_autoconfirm = false)', 'média', c.mailer_autoconfirm === false);
  add(A, 'senha mínima ≥ 10 caracteres', 'alta', (c.password_min_length || 0) >= 10, `atual: ${c.password_min_length}`);
  add(A, 'proteção contra senhas vazadas (HaveIBeenPwned)', 'média', c.password_hibp_enabled === true);
  add(A, `site_url = ${SITE}`, 'média', c.site_url === SITE, c.site_url);
  add(A, 'lista de redirecionamento só do domínio do painel', 'média', String(c.uri_allow_list || '').split(',').every(u => !u || u.startsWith(SITE)), c.uri_allow_list);
  add(A, 'limites de tentativas (rate limit) ativos', 'média', c.rate_limit_verify > 0 && c.rate_limit_token_refresh > 0 && c.rate_limit_email_sent > 0, `verify=${c.rate_limit_verify}/5min, token_refresh=${c.rate_limit_token_refresh}, email=${c.rate_limit_email_sent}/h`);
  add(A, 'rotação de refresh token ligada', 'média', c.refresh_token_rotation_enabled === true);
  add(A, 'login anônimo desligado', 'alta', c.external_anonymous_users_enabled === false);
  add(A, '2FA (TOTP) disponível para os admins', 'média', c.mfa_totp_enroll_enabled === true && c.mfa_totp_verify_enabled === true, 'exigir 2FA de Dono/Admin dentro do app é o próximo passo', '2FA para admins');
  // força bruta: 12 tentativas erradas seguidas não podem todas ser aceitas como "credencial inválida" sem limite → só sanidade
  let ultimo = 0; for (let i = 0; i < 6; i++) { const r = await http(`${SUPA}/auth/v1/token?grant_type=password`, { method: 'POST', body: { email: U.leitura.email, password: 'errada-' + i } }); ultimo = r.status; }
  add(A, 'senha errada recusada (sem vazar se o e-mail existe)', 'média', ultimo === 400 || ultimo === 429, `HTTP ${ultimo}`);
  const en = await http(`${SUPA}/auth/v1/token?grant_type=password`, { method: 'POST', body: { email: `nao-existe-${SUF}${DOM}`, password: 'errada' } });
  const ex = await http(`${SUPA}/auth/v1/token?grant_type=password`, { method: 'POST', body: { email: U.leitura.email, password: 'errada' } });
  add(A, 'mesma resposta para e-mail existente e inexistente (anti-enumeração)', 'média', en.status === ex.status && (JSON.parse(en.text || '{}').error_code || '') === (JSON.parse(ex.text || '{}').error_code || ''), `${en.status}/${ex.status}`);
}

/* ------------------------------------------------------------ 7. site e bundle */
const PADROES = [
  ['service_role JWT', (s) => (s.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || []).filter(j => { try { const p = JSON.parse(Buffer.from(j.split('.')[1], 'base64url').toString()); return p.role === 'service_role' || p.role === 'supabase_admin' || p.aai || p.tid; } catch { return false; } })],
  ['chave secreta Supabase (sb_secret_)', (s) => s.match(/sb_secret_[A-Za-z0-9_-]{10,}/g) || []],
  ['token do Meta (EAA…)', (s) => s.match(/\bEAA[A-Za-z0-9]{60,}/g) || []],
  ['chave Windsor/monday/Z-API/Resend/Twilio', (s) => s.match(/(?:windsor[_-]?api[_-]?key|api_key|MONDAY_API_TOKEN|ZAPI_TOKEN|RESEND_API_KEY|TWILIO_AUTH_TOKEN)\s*[=:]\s*['"]?[A-Za-z0-9_-]{24,}/gi) || []],
  ['chave re_ (Resend) / AC (Twilio)', (s) => s.match(/\bre_[A-Za-z0-9]{20,}\b|\bSK[0-9a-f]{32}\b/g) || []],
  ['chave privada', (s) => s.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g) || []],
];
async function site() {
  const A = 'Site em produção';
  const r = await http(SITE + '/', { token: null });
  const protegido = r.status === 401 && /edge-access|Login Redirect/i.test(r.text);
  // Com a proteção por senha do Netlify ligada, os cabeçalhos do app só aparecem depois do login do Netlify:
  // confere o HSTS ao vivo e os demais no netlify.toml (o mesmo arquivo que o Netlify aplica no ramo producao).
  const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
  const bloco = toml.split('[[headers]]').find(b => /for\s*=\s*"\/\*"/.test(b)) || '';
  const T = Object.fromEntries([...bloco.matchAll(/^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$/gm)].map(m => [m[1].toLowerCase(), m[2]]));
  const h = (n) => protegido ? (n === 'strict-transport-security' ? r.headers.get(n) || '' : T[n] || '') : r.headers.get(n) || '';
  const onde = protegido ? ' (netlify.toml; site atrás da senha do Netlify)' : ' (ao vivo)';
  add(A, 'site protegido por senha do Netlify (só a equipe abre)', 'info', null, protegido ? 'sim: cabeçalhos do app conferidos no netlify.toml' : `HTTP ${r.status}`);
  add(A, 'HTTPS com HSTS (ao vivo)', 'alta', /max-age=\d{7,}/.test(r.headers.get('strict-transport-security') || ''), r.headers.get('strict-transport-security') || '');
  add(A, 'proteção contra iframe (X-Frame-Options ou CSP frame-ancestors)' + onde, 'alta', /DENY|SAMEORIGIN/i.test(h('x-frame-options')) || /frame-ancestors/.test(h('content-security-policy')), `${h('x-frame-options')} | ${/frame-ancestors[^;]*/.exec(h('content-security-policy'))?.[0] || ''}`);
  add(A, 'X-Content-Type-Options: nosniff' + onde, 'média', /nosniff/i.test(h('x-content-type-options')));
  add(A, 'Referrer-Policy definido' + onde, 'baixa', !!h('referrer-policy'), h('referrer-policy'));
  add(A, 'Content-Security-Policy definido' + onde, 'média', /default-src/.test(h('content-security-policy')) && !/script-src[^;]*'unsafe-(inline|eval)'/.test(h('content-security-policy')), h('content-security-policy').slice(0, 160));
  add(A, 'Permissions-Policy definido' + onde, 'baixa', !!h('permissions-policy'), h('permissions-policy'));
  const fontes = {};
  if (!protegido) {
    fontes['index.html'] = r.text;
    const scripts = [...r.text.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]).filter(s => !/^https?:/.test(s) || s.startsWith(SITE));
    for (const s of scripts) { const u = new URL(s, SITE + '/').href; const x = await http(u, { token: null }); fontes[u.replace(SITE, '')] = x.text; }
  }
  // build de produção local (o mesmo que o Netlify gera a partir do ramo atual)
  try {
    const out = mkdtempSync(join(tmpdir(), 'aos-aud-'));
    execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { env: { ...process.env, OUT: out, AOS_DEMO: '' }, stdio: 'ignore' });
    for (const f of ['index.html', 'app.js', 'config.js']) if (existsSync(join(out, f))) fontes[`build de produção/${f}`] = readFileSync(join(out, f), 'utf8');
    rmSync(out, { recursive: true, force: true });
  } catch (e) { add(A, 'build de produção local para varredura', 'média', false, e.message); }
  const A2 = 'Front-end (bundle)';
  for (const [nome, fn] of PADROES) { const ach = Object.entries(fontes).flatMap(([a, t]) => fn(t).map(() => a)); add(A2, `sem ${nome}`, 'crítica', !ach.length, ach.length ? `em: ${[...new Set(ach)].join(', ')}` : '', 'sem segredos no front-end'); }
  add(A2, `bundle conferido (${Object.keys(fontes).join(', ')})`, 'info', Object.keys(fontes).length > 1);
  const ger = Object.entries(fontes).filter(([, t]) => /adsmanager|business\.facebook\.com\/(adsmanager|latest\/ads)/i.test(t)).map(([a]) => a);
  add(A2, 'sem links para o Gerenciador de Anúncios', 'alta', !ger.length, ger.join(', '), 'sem links do Gerenciador');
  // git
  const A3 = 'Repositório (histórico git)';
  let log = ''; try { log = execFileSync('git', ['-C', ROOT, 'log', '-p', '--all', '--no-color', '--', '.', ':(exclude)package-lock.json', ':(exclude)node_modules'], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 }); } catch (e) { log = ''; }
  for (const [nome, fn] of PADROES) { const n = fn(log).length; add(A3, `sem ${nome} em nenhum commit`, 'crítica', n === 0, n ? `${n} ocorrência(s): rode git log -p e troque a chave` : '', 'sem segredos no repositório'); }
  const env = /^\+\+\+ b\/(\.env(\.[a-z]+)?|.*\.segredos|.*credentials\.json)$/m.exec(log);
  add(A3, 'nenhum arquivo .env/.segredos/credentials versionado', 'alta', !env, env?.[1] || '');
}

/* ------------------------------------------------------------ 8. backups */
async function backups() {
  const A = 'Backups'; const H = 3600_000; const agora = Date.now();
  const nb = await mgmt('/database/backups');
  const ult = (nb.backups || []).filter(b => b.status === 'COMPLETED').map(b => Date.parse(b.inserted_at)).sort((a, b) => b - a)[0];
  add(A, '1. backup nativo do Supabase com menos de 26 h', 'alta', ult && agora - ult < 26 * H, ult ? `último ${new Date(ult).toISOString()} (${(nb.backups || []).length} guardados, PITR ${nb.pitr_enabled ? 'ligado' : 'desligado'})` : 'nenhum');
  NATIVO = { ok: !!ult, ultimoBackupEm: ult ? new Date(ult).toISOString() : null, backups: (nb.backups || []).length, pitr: !!nb.pitr_enabled };
  const ob = await sql(`select name, created_at, (metadata->>'size')::bigint tam from storage.objects where bucket_id = 'backups' and name like 'diario/%.json.gz' order by created_at desc limit 1`);
  const d = ob[0] ? Date.parse(ob[0].created_at) : 0;
  add(A, '2. exportação diária (bucket backups) com menos de 26 h', 'alta', d && agora - d < 26 * H, ob[0] ? `${ob[0].name} · ${ob[0].tam} bytes · ${ob[0].created_at}` : 'nenhum arquivo');
  const job = await sql(`select schedule, active from cron.job where jobname = 'aos-backup-diario'`);
  add(A, '2. agendamento aos-backup-diario ativo (06:10 UTC)', 'alta', job[0]?.active === true, job[0] ? job[0].schedule : 'não existe');
  const ex = await sql(`select data from public.records where id = 'backupStatus:externo' and org_id = ${lit(ORG_APP)}`);
  const e = ex[0]?.data; const de = e ? Date.parse(e.ultimaEm) : 0;
  add(A, '3. cópia externa (GitHub, criptografada) com menos de 26 h', 'alta', e?.ok === true && agora - de < 26 * H, e ? `${e.ok ? 'ok' : 'falhou'} em ${e.ultimaEm}${e.erro ? ` · ${e.erro}` : ''}` : 'ainda não houve cópia (configurar os segredos do GitHub)');
}
let NATIVO = null;

/* ------------------------------------------------------------ relatório */
function relatorio(inicio) {
  const SEV = { 'crítica': 0, alta: 1, 'média': 2, baixa: 3, info: 4 };
  const fal = R.filter(r => r.ok === false), oks = R.filter(r => r.ok === true);
  const L = [];
  L.push(`# Auditoria de segurança — ${new Date(inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, '');
  L.push(`Projeto \`${REF}\` · site ${SITE} · gerado por \`tests/live/auditoria.mjs\` (usuários e registros temporários criados e apagados no final).`, '');
  L.push(`**Resultado: ${oks.length} OK · ${fal.length} FALHA** (${fal.filter(f => f.sev === 'crítica').length} crítica, ${fal.filter(f => f.sev === 'alta').length} alta, ${fal.filter(f => f.sev === 'média').length} média, ${fal.filter(f => f.sev === 'baixa').length} baixa).`, '');
  if (fal.length) { L.push('## Falhas (corrigir)', '', '| Severidade | Área | Item | Detalhe |', '|---|---|---|---|'); for (const f of fal.sort((a, b) => SEV[a.sev] - SEV[b.sev])) L.push(`| ${f.sev} | ${f.area} | ${f.item} | ${f.det.replace(/\|/g, '/')} |`); L.push(''); }
  const regras = [...new Set(R.filter(r => r.regra).map(r => r.regra))];
  L.push('## Regras do dono', '', '| Regra | Situação |', '|---|---|');
  for (const g of regras) { const it = R.filter(r => r.regra === g); const f = it.filter(r => r.ok === false).length; L.push(`| ${g} | ${f ? `FALHA (${f} de ${it.length})` : `OK (${it.filter(r => r.ok).length} verificações)`} |`); }
  L.push('', '## Todos os itens', '');
  for (const area of [...new Set(R.map(r => r.area))]) {
    L.push(`### ${area}`, '', '| | Severidade | Item | Detalhe |', '|---|---|---|---|');
    for (const r of R.filter(x => x.area === area)) L.push(`| ${r.ok === null ? 'INFO' : r.ok ? 'OK' : '**FALHA**'} | ${r.sev} | ${r.item} | ${r.det.replace(/\|/g, '/')} |`);
    L.push('');
  }
  return { md: L.join('\n'), fal, oks };
}

const inicio = Date.now();
try {
  await preparar();
  for (const [n, f] of [['banco', banco], ['storage', storage], ['funções', funcoes], ['papéis', papeis], ['regras', regrasDono], ['autenticação', autenticacao], ['site', site], ['backups', backups]]) {
    try { await f(); } catch (e) { add('Execução', `bloco "${n}" terminou com erro`, 'alta', false, e.message); }
  }
} catch (e) { add('Execução', 'preparação dos usuários temporários', 'crítica', false, e.message); }
finally { await limpar(); }

const { md, fal, oks } = relatorio(inicio);
mkdirSync(dirname(resolve(OUT)), { recursive: true });
writeFileSync(resolve(OUT), md + '\n');
console.log(`\nRelatório: ${OUT}\n${oks.length} OK · ${fal.length} FALHA`);
if (!args.includes('--sem-status')) {
  const rel = resolve(OUT).startsWith(ROOT) ? resolve(OUT).slice(ROOT.length + 1) : OUT.split('/').pop();
  const st = { id: 'auditoria', tipo: 'auditoria', ultimaEm: new Date().toISOString(), ok: !fal.length, pass: oks.length, fail: fal.length, total: oks.length + fal.length, criticas: fal.filter(f => f.sev === 'crítica').length, arquivo: rel };
  const nat = NATIVO ? { id: 'nativo', tipo: 'nativo', ultimaEm: new Date().toISOString(), ...NATIVO } : null;
  try {
    await sql(`insert into public.records (id, col, org_id, data) values ('backupStatus:auditoria', 'backupStatus', ${lit(ORG_APP)}, ${lit(JSON.stringify(st))}::jsonb)
      ${nat ? `, ('backupStatus:nativo', 'backupStatus', ${lit(ORG_APP)}, ${lit(JSON.stringify(nat))}::jsonb)` : ''}
      on conflict (id) do update set data = excluded.data, updated_at = now()`);
  } catch (e) { console.error('não gravou o status no Cockpit:', e.message); }
}
process.exit(fal.some(f => f.sev === 'crítica' || f.sev === 'alta') ? 1 : 0);
