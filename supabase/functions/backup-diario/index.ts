// backup-diario — cópia lógica diária de TODOS os dados do app num bucket PRIVADO do Storage (docs/BACKUP-E-RESTAURACAO.md).
// Ações (POST JSON):
//   {}  ou {acao:'exportar'}  header x-cron-secret = CRON_SECRET  → grava backups/diario/AAAA-MM-DD.json.gz + .manifest.json,
//                                                                    apaga os antigos (35 dias; dia 1º de cada mês fica 12 meses)
//   {acao:'baixar', data?:'AAAA-MM-DD'}  header x-backup-secret = BACKUP_DOWNLOAD_SECRET
//                                       → devolve o .json.gz (mais recente, ou da data) — usado pela cópia fora do Supabase (GitHub Actions)
//   {acao:'listar'}  header x-backup-secret ou x-cron-secret → lista os arquivos e manifestos
// Publicada com verify_jwt = false: a autenticação é SÓ pelos segredos acima (comparação em tempo constante). Sem segredo → 401.
// Nunca exporta: hashes de senha (auth.users), senha_temp_hash do perfil, voo_cache (cache descartável).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const BUCKET = 'backups';
const PASTA = 'diario';
const TABELAS: { nome: string; ordem: string; colunas?: string }[] = [
  { nome: 'records', ordem: 'id' },
  { nome: 'profiles', ordem: 'user_id', colunas: 'user_id,org_id,papel,team_id,app_user_id,ativo,created_at,updated_at,trocar_senha' },
  { nome: 'orgs', ordem: 'id' },
  { nome: 'perm_padrao', ordem: 'mod' },
  { nome: 'col_modules', ordem: 'col' },
  { nome: 'receita_colecoes', ordem: 'col' },
  { nome: 'receita_campos', ordem: 'col' },
  { nome: 'voo_mudancas', ordem: 'id' },
];

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const env = (n: string) => { const v = Deno.env.get(n); return v && v.trim() ? v.trim() : undefined; };

function iguais(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
const temSegredo = (req: Request, header: string, nome: string) => {
  const s = env(nome); const v = req.headers.get(header) ?? '';
  return !!s && s.length >= 16 && !!v && iguais(v, s);
};

async function sha256(b: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', b));
  return Array.from(h, (x) => x.toString(16).padStart(2, '0')).join('');
}
async function gzip(b: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([b]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const diaSP = (d = new Date()) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10); // America/Sao_Paulo (UTC-3, sem horário de verão)

// deno-lint-ignore no-explicit-any
type SB = any;
async function tabela(sb: SB, t: typeof TABELAS[number]) {
  const linhas: unknown[] = []; const passo = 1000;
  for (let de = 0; ; de += passo) {
    const { data, error } = await sb.from(t.nome).select(t.colunas ?? '*').order(t.ordem).range(de, de + passo - 1);
    if (error) throw new Error(`${t.nome}: ${error.message}`);
    linhas.push(...(data ?? []));
    if (!data || data.length < passo) break;
  }
  return linhas;
}
async function usuarios(sb: SB) {
  const out: unknown[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth.users: ${error.message}`);
    // só identificação — nunca hash de senha, tokens ou fatores
    for (const u of data.users) out.push({ id: u.id, email: u.email ?? null, created_at: u.created_at, role: u.role ?? null, banned_until: (u as { banned_until?: string }).banned_until ?? null });
    if (data.users.length < 1000) break;
  }
  return out;
}

async function exportar(sb: SB) {
  const inicio = Date.now();
  const dados: Record<string, unknown[]> = {};
  for (const t of TABELAS) dados[t.nome] = await tabela(sb, t);
  dados['auth_users'] = await usuarios(sb);
  const dia = diaSP();
  const contagens = Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, v.length]));
  const corpo = { formato: 'gmarketing-backup', versao: 1, projeto: (env('SUPABASE_URL') ?? '').replace(/^https:\/\/|\.supabase\.co.*$/g, ''), gerado_em: new Date().toISOString(), dia, contagens, tabelas: dados };
  const bruto = new TextEncoder().encode(JSON.stringify(corpo));
  const gz = await gzip(bruto);
  const manifesto = { arquivo: `${PASTA}/${dia}.json.gz`, dia, gerado_em: corpo.gerado_em, contagens, bytes_json: bruto.length, bytes_gz: gz.length, sha256_json: await sha256(bruto), sha256_gz: await sha256(gz), duracao_ms: 0 };
  const up = await sb.storage.from(BUCKET).upload(manifesto.arquivo, gz, { contentType: 'application/gzip', upsert: true });
  if (up.error) throw new Error(`upload: ${up.error.message}`);
  manifesto.duracao_ms = Date.now() - inicio;
  const upm = await sb.storage.from(BUCKET).upload(`${PASTA}/${dia}.manifest.json`, new TextEncoder().encode(JSON.stringify(manifesto, null, 2)), { contentType: 'application/json', upsert: true });
  if (upm.error) throw new Error(`upload manifesto: ${upm.error.message}`);
  const apagados = await podar(sb);
  return { ok: true, ...manifesto, apagados };
}

/** retenção: 35 dias; o dia 1º de cada mês fica 12 meses */
async function podar(sb: SB) {
  const { data, error } = await sb.storage.from(BUCKET).list(PASTA, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw new Error(`listar: ${error.message}`);
  const hoje = Date.parse(diaSP() + 'T00:00:00Z'); const apagar: string[] = [];
  for (const f of data ?? []) {
    const m = /^(\d{4}-\d{2}-(\d{2}))\./.exec(f.name); if (!m) continue;
    const idade = (hoje - Date.parse(m[1] + 'T00:00:00Z')) / 86400_000;
    const limite = m[2] === '01' ? 366 : 35;
    if (idade > limite) apagar.push(`${PASTA}/${f.name}`);
  }
  if (apagar.length) { const r = await sb.storage.from(BUCKET).remove(apagar); if (r.error) throw new Error(`apagar: ${r.error.message}`); }
  return apagar;
}

async function listar(sb: SB) {
  const { data, error } = await sb.storage.from(BUCKET).list(PASTA, { limit: 1000, sortBy: { column: 'name', order: 'desc' } });
  if (error) throw new Error(`listar: ${error.message}`);
  return (data ?? []).map((f: { name: string; metadata?: { size?: number }; created_at?: string }) => ({ nome: f.name, bytes: f.metadata?.size ?? null, criado_em: f.created_at ?? null }));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);
  let b: Record<string, unknown> = {};
  try { const t = await req.text(); b = t.trim() ? JSON.parse(t) : {}; } catch { return json({ erro: 'JSON inválido.' }, 400); }
  const acao = String(b.acao ?? 'exportar');
  const cron = temSegredo(req, 'x-cron-secret', 'CRON_SECRET');
  const baixa = temSegredo(req, 'x-backup-secret', 'BACKUP_DOWNLOAD_SECRET');
  const ok = acao === 'exportar' ? cron : acao === 'baixar' ? baixa : acao === 'listar' ? (cron || baixa) : false;
  if (!ok) return json({ erro: 'Não autorizado.', codigo: 'nao_autorizado' }, 401);
  const sb = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    if (acao === 'exportar') return json(await exportar(sb));
    if (acao === 'listar') return json({ arquivos: await listar(sb) });
    // baixar
    let dia = typeof b.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.data) ? b.data : '';
    if (!dia) { const l = (await listar(sb)).find((f: { nome: string }) => f.nome.endsWith('.json.gz')); if (!l) return json({ erro: 'Nenhum backup encontrado.' }, 404); dia = l.nome.slice(0, 10); }
    const { data, error } = await sb.storage.from(BUCKET).download(`${PASTA}/${dia}.json.gz`);
    if (error || !data) return json({ erro: `Backup de ${dia} não encontrado.` }, 404);
    const m = await sb.storage.from(BUCKET).download(`${PASTA}/${dia}.manifest.json`);
    const man = m.data ? await m.data.text() : '{}';
    return new Response(data, { headers: { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="gmarketing-${dia}.json.gz"`, 'x-backup-dia': dia, 'x-backup-sha256': (JSON.parse(man).sha256_gz ?? '') } });
  } catch (e) {
    console.error('[backup-diario]', e instanceof Error ? e.message : e);
    return json({ erro: 'Falha no backup. Veja os logs da função.', codigo: 'interno' }, 500);
  }
});
