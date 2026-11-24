// _shared/supa.ts — cliente service role, identificação de quem chama (JWT) e acesso à tabela `records`.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { env, envObrigatoria, HttpError } from './http.ts';

export type Papel = 'dono' | 'admin' | 'head_trafego' | 'gestor_trafego' | 'cs' | 'producao' | 'financeiro' | 'comercial' | 'leitura';
export const PAPEIS: Papel[] = ['dono', 'admin', 'head_trafego', 'gestor_trafego', 'cs', 'producao', 'financeiro', 'comercial', 'leitura'];

export interface Perfil { user_id: string; org_id: string; papel: Papel; team_id: string | null; app_user_id: string | null; ativo: boolean }
export interface Chamador { sistema: boolean; userId: string | null; email: string | null; perfil: Perfil | null }
export type Obj = Record<string, unknown> & { id: string };

let admin: SupabaseClient | null = null;
/** cliente com a service role: ignora RLS — use só depois de verificar quem chama */
export function adminClient(): SupabaseClient {
  if (!admin) {
    admin = createClient(envObrigatoria('SUPABASE_URL'), envObrigatoria('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

/**
 * Identifica quem chama:
 *  - sistema (agendador/cron): header x-cron-secret = CRON_SECRET, ou Bearer = service role key
 *  - usuário: valida o JWT no Supabase Auth e carrega o perfil (papel, org, ativo)
 */
export async function chamador(req: Request): Promise<Chamador> {
  const cron = env('CRON_SECRET');
  if (cron && req.headers.get('x-cron-secret') === cron) return { sistema: true, userId: null, email: null, perfil: null };
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError(401, 'Sessão ausente. Entre no Agência OS novamente.', 'sem_sessao');
  if (token === env('SUPABASE_SERVICE_ROLE_KEY')) return { sistema: true, userId: null, email: null, perfil: null };
  const sb = adminClient();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Sessão expirada ou inválida. Entre de novo.', 'sessao_invalida');
  const { data: p, error: pe } = await sb.from('profiles').select('*').eq('user_id', data.user.id).maybeSingle();
  if (pe) throw pe;
  if (!p) throw new HttpError(403, 'Seu acesso ainda não foi configurado. Peça ao administrador.', 'sem_perfil');
  if (!p.ativo) throw new HttpError(403, 'Seu acesso está desativado.', 'inativo');
  return { sistema: false, userId: data.user.id, email: data.user.email ?? null, perfil: p as Perfil };
}

/** exige um dos papéis (o sistema sempre passa, salvo somenteUsuario) */
export function exigirPapel(c: Chamador, papeis: Papel[], o: { somenteUsuario?: boolean } = {}): void {
  if (c.sistema && !o.somenteUsuario) return;
  if (!c.perfil || !papeis.includes(c.perfil.papel)) {
    throw new HttpError(403, `Ação permitida só para: ${papeis.join(', ')}.`, 'sem_permissao');
  }
}

/* ---------------- records ---------------- */
export async function listar(org: string, col: string): Promise<Obj[]> {
  const sb = adminClient(); const out: Obj[] = []; let de = 0;
  for (;;) {
    const { data, error } = await sb.from('records').select('data').eq('org_id', org).eq('col', col).range(de, de + 999);
    if (error) throw error;
    for (const r of data ?? []) out.push(r.data as Obj);
    if (!data || data.length < 1000) break;
    de += 1000;
  }
  return out;
}
export async function obter(org: string, col: string, id: string): Promise<Obj | null> {
  const { data, error } = await adminClient().from('records').select('data').eq('org_id', org).eq('id', `${col}:${id}`).maybeSingle();
  if (error) throw error;
  return (data?.data as Obj) ?? null;
}
/** grava (insere ou substitui) objetos de uma coleção; created_by fica nulo (servidor) */
export async function gravar(org: string, col: string, objs: Obj[]): Promise<void> {
  if (!objs.length) return;
  const agora = new Date().toISOString();
  const linhas = objs.map((o) => ({ id: `${col}:${o.id}`, col, data: o, org_id: org, updated_at: agora }));
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await adminClient().from('records').upsert(linhas.slice(i, i + 500), { onConflict: 'id' });
    if (error) throw error;
  }
}
export async function auditar(org: string, quem: { id: string | null; nome: string }, oque: string, col: string, refId: string | null): Promise<void> {
  const id = `act-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await gravar(org, 'activity', [{ id, quem: quem.id, quemNome: quem.nome, oque, col, refId, quando: new Date().toISOString() }]);
}
export async function orgs(): Promise<string[]> {
  const { data, error } = await adminClient().from('orgs').select('id');
  if (error) throw error;
  return (data ?? []).map((o) => o.id as string);
}
export const novoId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
