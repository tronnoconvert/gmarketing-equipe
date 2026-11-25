#!/usr/bin/env node
// restaurar-backup.mjs — abre, confere e (opcionalmente) restaura um backup do Gmarketing. Ver docs/BACKUP-E-RESTAURACAO.md.
//
// Uso:
//   BACKUP_PASSPHRASE='...' node scripts/restaurar-backup.mjs gmarketing-2026-11-25.json.gz.enc      (confere; NÃO grava nada)
//   node scripts/restaurar-backup.mjs diario-2026-11-25.json.gz                                          (arquivo do Storage, já sem criptografia)
//   ... --saida pasta/            grava o JSON aberto em pasta/ (cuidado: contém dados sensíveis)
//   ... --sha256 <hash do .gz>    confere a integridade com o manifesto
//   ... --projeto <ref> --aplicar  restaura NO projeto <ref> pela Management API (precisa SUPABASE_ACCESS_TOKEN,
//                                  ou HTTPS_PROXY que injete o token). Sem --aplicar: simulação (mostra o que faria).
//
// O .enc é o formato do `openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -salt`:
//   "Salted__" + sal(8) + dados; chave(32)+iv(16) = PBKDF2-HMAC-SHA256(senha, sal, 200000, 48).
// A restauração faz UPSERT (não apaga o que já existe no destino) com os gatilhos desligados na transação
// (session_replication_role = replica), em lotes. Logins (auth.users) NÃO têm senha no backup: o script lista quem
// falta e o perfil só é restaurado para quem já existe no Auth do destino (recrie pelo app: Admin › Usuários › Convidar).
import { createDecipheriv, createHash, pbkdf2Sync } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n) => args.includes(n);
const arquivo = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--aplicar'].includes(args[i - 1])));
if (!arquivo) { console.error('Uso: node scripts/restaurar-backup.mjs <arquivo .enc ou .json.gz> [--sha256 H] [--saida DIR] [--projeto REF --aplicar]'); process.exit(2); }

export function decifrar(buf, senha) {
  if (buf.subarray(0, 8).toString('latin1') !== 'Salted__') throw new Error('Arquivo não está no formato do openssl (falta "Salted__").');
  const sal = buf.subarray(8, 16);
  const k = pbkdf2Sync(Buffer.from(senha, 'utf8'), sal, 200000, 48, 'sha256');
  const d = createDecipheriv('aes-256-cbc', k.subarray(0, 32), k.subarray(32, 48));
  try { return Buffer.concat([d.update(buf.subarray(16)), d.final()]); } catch { throw new Error('Senha errada ou arquivo corrompido.'); }
}

const TABELAS = { // ordem de restauração e chave de conflito
  orgs: 'id', perm_padrao: 'mod,papel', col_modules: 'col', receita_colecoes: 'col', receita_campos: null,
  records: 'id', voo_mudancas: 'id', profiles: 'user_id',
};

function validar(b) {
  const erros = [];
  if (b?.formato !== 'gmarketing-backup') erros.push('formato desconhecido');
  for (const [t, n] of Object.entries(b?.contagens ?? {})) {
    const real = (b.tabelas?.[t] ?? []).length;
    if (real !== n) erros.push(`${t}: manifesto diz ${n}, arquivo tem ${real}`);
  }
  for (const t of Object.keys(TABELAS)) if (!Array.isArray(b?.tabelas?.[t])) erros.push(`tabela ausente: ${t}`);
  const recs = b?.tabelas?.records ?? [];
  if (recs.some((r) => !r.id || !r.col || !r.org_id)) erros.push('records com id/col/org_id vazio');
  if (JSON.stringify(b?.tabelas?.auth_users ?? []).match(/encrypted_password|\$2[aby]\$/)) erros.push('ATENÇÃO: hash de senha no backup');
  return erros;
}

async function sql(ref, query) {
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN || 'proxy-injected'}` };
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: h, body: JSON.stringify({ query }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

async function restaurar(b, ref, aplicar) {
  const existentes = new Set((await sql(ref, 'select id::text from auth.users')).map((r) => r.id));
  const faltam = (b.tabelas.auth_users ?? []).filter((u) => !existentes.has(u.id));
  console.log(`\nDestino ${ref}: ${existentes.size} login(s) no Auth; ${faltam.length} do backup não existem lá${faltam.length ? ' (recrie pelo app e rode de novo para restaurar os perfis):' : '.'}`);
  for (const u of faltam) console.log(`  - ${u.email ?? u.id}`);
  for (const [t, chave] of Object.entries(TABELAS)) {
    let linhas = b.tabelas[t];
    if (t === 'profiles') linhas = linhas.filter((p) => existentes.has(p.user_id));
    console.log(`${aplicar ? 'restaurando' : '[simulação]'} ${t}: ${linhas.length} linha(s)`);
    if (!aplicar || !linhas.length) continue;
    for (let i = 0; i < linhas.length; i += 500) {
      const lote = JSON.stringify(linhas.slice(i, i + 500));
      const cols = Object.keys(linhas[0]);
      const conflito = chave ? `on conflict (${chave}) do update set ${cols.filter((c) => !chave.split(',').includes(c)).map((c) => `${c} = excluded.${c}`).join(', ') || `${cols[0]} = excluded.${cols[0]}`}` : 'on conflict do nothing';
      await sql(ref, `begin; set local session_replication_role = replica;
        insert into public.${t} (${cols.join(',')}) select ${cols.join(',')} from jsonb_populate_recordset(null::public.${t}, ${lit(lote)}::jsonb) ${conflito};
        commit;`);
    }
  }
  if (aplicar) console.log('\nRestauração concluída. Confira as contagens no app e rode tests/live/auditoria.mjs.');
}

const buf = readFileSync(arquivo);
let gz = buf;
if (arquivo.endsWith('.enc')) {
  const senha = process.env.BACKUP_PASSPHRASE;
  if (!senha) { console.error('Defina BACKUP_PASSPHRASE (a senha do gerenciador de senhas) no ambiente.'); process.exit(2); }
  gz = decifrar(buf, senha);
  console.log('✔ arquivo aberto (senha correta)');
}
const hash = createHash('sha256').update(gz).digest('hex');
console.log(`sha256 do .gz: ${hash}`);
if (opt('--sha256') && opt('--sha256') !== hash) { console.error('✘ sha256 NÃO confere com o informado'); process.exit(1); }
const b = JSON.parse(gunzipSync(gz).toString('utf8'));
const erros = validar(b);
console.log(`backup do dia ${b.dia} (gerado ${b.gerado_em}, projeto ${b.projeto})`);
console.table(b.contagens);
if (erros.length) { console.error('✘ problemas:\n  ' + erros.join('\n  ')); process.exit(1); }
console.log('✔ backup válido');
if (opt('--saida')) { mkdirSync(opt('--saida'), { recursive: true, mode: 0o700 }); const p = join(opt('--saida'), basename(arquivo).replace(/(\.json)?\.gz(\.enc)?$/, '') + '.json'); writeFileSync(p, JSON.stringify(b, null, 1), { mode: 0o600 }); console.log(`JSON aberto em ${p} (dados sensíveis: apague depois)`); }
if (opt('--projeto')) await restaurar(b, opt('--projeto'), flag('--aplicar'));
