// tests/live/voo.mjs — Painel de Voo (item 17) CONTRA O SUPABASE DE PRODUÇÃO (não faz parte de `npm test`).
// Cria 2 logins temporários (dono de teste e gestor de teste, domínio .invalid) e 1 cliente de teste ligado a UMA conta
// real do cache, chama as Edge Functions voo-dados e voo-acao e confere: escopo por papel, receita removida para o gestor,
// busca ao vivo + intervalo mínimo de 20 s, conta fora do escopo recusada, SIM obrigatório, só pausar/orçamento, "ver como"
// recusado e "não configurado" sem META_ACCESS_TOKEN. No fim APAGA só o que criou. Imprime apenas contagens (nunca nomes).
// Uso: SQL_CMD=/caminho/q.sh NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=... node tests/live/voo.mjs
//   SQL_CMD: comando que recebe `-c "<sql>"` e devolve JSON (Management API do Supabase). Nunca use a service_role key aqui.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
       insert into public.profiles (user_id, org_id, papel, team_id, app_user_id, ativo) values ('${id}', 'gmarketing', '${u.papel}', '${u.team}', 'u-voo-${u.chave}', true);`);
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
function limpar() {
  sql(`delete from public.records where id in ('clients:c-voo-teste') or (col in ('activity','clientActions') and (data->>'quem' like 'u-voo-%' or data->>'quem' like 't-voo-%' or data->>'clientId' = 'c-voo-teste'));
       delete from public.voo_cache where chave like 'vivo:%' and chave in (select 'vivo:' || id || ':' || c from auth.users, (select jsonb_array_elements_text(dados->'x') c from public.voo_cache where false) z);
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
  ok(true, `2 logins temporários e 1 cliente de teste (contas ativas no cache: ${contas.n})`);
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
  ok(gG.status === 200 && gG.j.contas.length === 1 && gG.j.contas[0].id === contaTeste && gG.j.contas[0].clientId === 'c-voo-teste', `gestor: só a conta do cliente dele (${gG.j.contas.length})`);
  ok(gG.j.veReceita === false && gG.j.linhas.every(l => l[10] == null) && gG.j.escopo === 'seus', 'gestor: sem receita (action_values_purchase removido no servidor)');
  ok(Object.values(gG.j.camps).every(c => c.c === contaTeste), 'gestor: nenhuma campanha de outra conta');

  console.log('▶ voo-dados: detalhe ao vivo');
  const t0 = Date.now(); const v1 = await fn('voo-dados', tGestor, { acao: 'conta', conta: contaTeste });
  ok(v1.status === 200 && v1.j.fonte === 'vivo' && Date.now() - Date.parse(v1.j.atualizadoEm) < 120000, `busca ao vivo da conta (${Math.round((Date.now() - t0) / 1000)} s, ${v1.j.linhas.length} linhas)`);
  ok(Object.values(v1.j.sets).some(s => s.orc != null) || Object.values(v1.j.camps).some(c => c.orc != null), 'orçamentos diários presentes (conjunto ou campanha CBO)');
  const v2 = await fn('voo-dados', tGestor, { acao: 'conta', conta: contaTeste });
  ok(v2.status === 200 && v2.j.fonte === 'recente', `nova busca em menos de 20 s usa o resultado recente (${v2.j.fonte})`);
  const v3 = await fn('voo-dados', tGestor, { acao: 'conta', conta: outra });
  ok(v3.status === 403, `gestor não busca conta de outro cliente (${v3.status})`);

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
  const a5 = await fn('voo-acao', tGestor, { acao: 'pausar', ...base, conta: outra, confirmacao: 'SIM' });
  ok(a5.status === 403, `conta fora do escopo recusada (${a5.status})`);
  const a6 = await fn('voo-acao', tGestor, { acao: 'pausar', ...base, confirmacao: 'SIM' });
  ok(a6.status === 503 && a6.j.codigo === 'nao_configurado', `sem META_ACCESS_TOKEN → 503 "não configurado" (${a6.status})`);
  const st = await fn('voo-acao', tDono, { acao: 'status' });
  ok(st.status === 200 && st.j.configurado === false, 'status: ações aguardando o token');

  console.log('▶ limite de 4 mudanças de orçamento por conjunto por hora (banco)');
  const r = sql(`select public.voo_reservar_mudanca('gmarketing','voo-teste-obj','x',null,1,2,4) a, public.voo_reservar_mudanca('gmarketing','voo-teste-obj','x',null,1,2,4) b, public.voo_reservar_mudanca('gmarketing','voo-teste-obj','x',null,1,2,4) c, public.voo_reservar_mudanca('gmarketing','voo-teste-obj','x',null,1,2,4) d, public.voo_reservar_mudanca('gmarketing','voo-teste-obj','x',null,1,2,4) e`)[0];
  ok(r.a > 0 && r.d > 0 && r.e === -1, '4 reservas aceitas, a 5ª recusada');
  sql(`delete from public.voo_mudancas where objeto_id = 'voo-teste-obj'`);
  const priv = await fetch(`${URL_SB}/rest/v1/voo_cache?select=chave&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${tDono}` } });
  ok(priv.status === 401 || priv.status === 403 || (priv.ok && (await priv.json()).length === 0), `tabela voo_cache fechada para o navegador (${priv.status})`);
} catch (e) { falhas++; console.log(`  ✗ erro: ${e.message}`); }
finally {
  try { limpar(); const n = sql(`select (select count(*) from auth.users where email like '%${DOM}') u, (select count(*) from public.records where id = 'clients:c-voo-teste') c`)[0]; ok(Number(n.u) === 0 && Number(n.c) === 0, 'limpeza: logins e cliente de teste apagados'); } catch (e) { falhas++; console.log(`  ✗ limpeza: ${e.message}`); }
}
console.log(`\n${oks} ok · ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
