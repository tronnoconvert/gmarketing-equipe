// backup-diario — cópia lógica diária de TODOS os dados do app num bucket PRIVADO do Storage (docs/BACKUP-E-RESTAURACAO.md).
// Ações (POST JSON):
//   {}  ou {acao:'exportar'}  header x-cron-secret = CRON_SECRET  → grava backups/diario/AAAA-MM-DD.json.gz + .manifest.json,
//                                                                    apaga os antigos (35 dias; dia 1º de cada mês fica 12 meses)
//   {acao:'baixar', data?:'AAAA-MM-DD'}  header x-backup-secret = BACKUP_DOWNLOAD_SECRET
//                                       → devolve o .json.gz (mais recente, ou da data) — usado pela cópia fora do Supabase (GitHub Actions)
//   {acao:'registrar_externo', ok, dia?, bytes?, sha256?, erro?}  header x-backup-secret → o GitHub Actions informa o resultado
//                                       da cópia externa (vira o LED "Cópia externa" no Cockpit e a rotina na Torre)
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

/* ---------- status para o Cockpit (card "Backups", só Dono/Admin) e para a Torre (rotinas) ----------
   records 'backupStatus:<tipo>' (tipo = nativo | diario | externo | auditoria). A coleção não está em col_modules
   (só quem administra lê) e está em receita_colecoes (quem não vê receita não recebe nem pelo realtime). */
const ORG = () => env('DEFAULT_ORG_ID') ?? 'gmarketing';
const ROTINAS: Record<string, { id: string; nome: string; desc: string; freq: string }> = {
  diario: { id: 'r-backup-diario', nome: 'Backup diário dos dados (03:10)', desc: 'Exporta todas as tabelas do app para o armazenamento privado do Supabase (35 dias + 1 por mês por 12 meses)', freq: 'diário 03:10' },
  externo: { id: 'r-backup-externo', nome: 'Cópia externa criptografada (03:40)', desc: 'Copia o backup do dia, criptografado, para o GitHub (fora do Supabase)', freq: 'diário 03:40' },
};
async function gravarStatus(sb: SB, tipo: string, dados: Record<string, unknown>) {
  const agora = new Date().toISOString();
  const doc = { id: tipo, tipo, ultimaEm: agora, ...dados };
  const linhas: Record<string, unknown>[] = [{ id: `backupStatus:${tipo}`, col: 'backupStatus', org_id: ORG(), data: doc }];
  const r = ROTINAS[tipo];
  if (r) {
    const { data: atual } = await sb.from('records').select('data').eq('id', `routines:${r.id}`).maybeSingle();
    const h = Array.isArray(atual?.data?.hist30) ? atual.data.hist30.slice(-29) : [];
    h.push(dados.ok ? 'ok' : 'err');
    linhas.push({ id: `routines:${r.id}`, col: 'routines', org_id: ORG(), data: { ...(atual?.data ?? {}), id: r.id, nome: r.nome, desc: r.desc, freq: r.freq, freqMin: 1440, ativo: true,
      estado: dados.ok ? 'ok' : 'err', ultimaEm: agora, duracaoS: Math.round(Number(dados.duracao_ms ?? 0) / 1000), hist30: h,
      sucesso30: Math.round(h.filter((x: string) => x === 'ok').length / h.length * 100), integracoes: [], canais: ['app'], respId: null, sistema: true,
      ultimaMsg: dados.ok ? `Backup ${dados.dia ?? ''} gravado` : `Falhou: ${String(dados.erro ?? 'erro')}`.slice(0, 200) } });
  }
  const { error } = await sb.from('records').upsert(linhas);
  if (error) console.error('[backup-diario] status:', error.message);
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
  const ok = acao === 'exportar' ? cron : acao === 'baixar' || acao === 'registrar_externo' ? baixa : acao === 'listar' ? (cron || baixa) : false;
  if (!ok) return json({ erro: 'Não autorizado.', codigo: 'nao_autorizado' }, 401);
  const sb = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    if (acao === 'exportar') {
      try {
        const r = await exportar(sb);
        await gravarStatus(sb, 'diario', { ok: true, dia: r.dia, bytes: r.bytes_gz, contagens: r.contagens, sha256: r.sha256_gz, duracao_ms: r.duracao_ms, apagados: r.apagados.length });
        return json(r);
      } catch (e) { await gravarStatus(sb, 'diario', { ok: false, erro: e instanceof Error ? e.message : String(e) }); throw e; }
    }
    if (acao === 'registrar_externo') {
      const ok = b.ok === true;
      await gravarStatus(sb, 'externo', { ok, dia: typeof b.dia === 'string' ? b.dia.slice(0, 10) : null, bytes: Number(b.bytes) || null,
        sha256: typeof b.sha256 === 'string' ? b.sha256.slice(0, 64) : null, arquivos: Number(b.arquivos) || null, erro: ok ? null : String(b.erro ?? 'falha na cópia externa').slice(0, 200) });
      return json({ ok: true });
    }
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
