// _shared/voo.ts — Painel de Voo (item 17): leitura do Meta Ads via Windsor.ai, cache no servidor, escopo por pessoa e
// remoção de receita. Usado por voo-dados (leitura) e voo-acao (pausar / orçamento).
//
// Formato compacto devolvido ao app (o mesmo que o modo demonstração gera em src/modules/torre/voo-demo.js):
//   { dias: ['aaaa-mm-dd' x15, o último = hoje], contas: [{id, nome, status, moeda, clientId}],
//     camps: {id: {c: contaId, n, st, obj, orc}}, sets: {id: {c: campId, n, st, orc}}, ads: {id: {s: setId, n, st}},
//     linhas: [[iDia, adId, gasto, impressoes, alcance, cliques, cliquesLink, leads, conversas, compras, valorCompras|null]] }
// Orçamentos em R$/dia (o Windsor devolve em centavos). Status = effective_status do Meta (ACTIVE, PAUSED, CAMPAIGN_PAUSED…).
import { buscar, env, envObrigatoria, HttpError } from './http.ts';
import { adminClient, listar, type Chamador } from './supa.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

export const DIAS = 15;               // hoje + 14 dias completos
export const TTL_MIN = 5;             // cache da visão geral: no máximo 5 min (regra do dono: dado nunca "velho")
export const VIVO_MIN_S = 20;         // intervalo mínimo entre buscas ao vivo da mesma conta pela mesma pessoa
const FUSO = env('TZ_AGENCIA') ?? 'America/Sao_Paulo';
const CAMPOS = ['date', 'account_id', 'campaign_id', 'campaign', 'campaign_effective_status', 'campaign_objective', 'campaign_daily_budget',
  'adset_id', 'adset_name', 'adset_effective_status', 'adset_daily_budget', 'ad_id', 'ad_name', 'effective_status',
  'spend', 'impressions', 'reach', 'clicks', 'link_clicks', 'actions_lead', 'actions_onsite_conversion_messaging_conversation_started_7d',
  'actions_purchase', 'action_values_purchase'];

export type Linha = (string | number | null)[];
export interface Estr { camps: Record<string, Record<string, unknown>>; sets: Record<string, Record<string, unknown>>; ads: Record<string, Record<string, unknown>> }
export interface Dia { rows: Linha[]; estr: Estr }
export interface Conta { id: string; nome: string; status: string; moeda: string; clientId?: string | null }

/** 'act_123' | '123' → '123' (só dígitos) */
export const normConta = (v: unknown) => String(v ?? '').replace(/^act_/i, '').replace(/\D/g, '');

/** data local (aaaa-mm-dd) da agência, com deslocamento em dias */
export function diaLocal(desloc = 0): string {
  const d = new Date(Date.now() + desloc * 864e5);
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export const listaDias = () => Array.from({ length: DIAS }, (_, i) => diaLocal(i - (DIAS - 1)));

/* ---------------------------------------------------------------- quem chama: nível, receita e escopo */
export interface QuemVoo { c: Chamador; org: string; nivel: number; veReceita: boolean; limitado: boolean; soVinculadas: boolean; clientIds: string[]; teamId: string | null; nome: string }
export async function quemVoo(c: Chamador, req: Request): Promise<QuemVoo> {
  if (c.sistema || !c.perfil) throw new HttpError(403, 'Use sua sessão do Agência OS.', 'sem_permissao');
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  // as mesmas funções do banco que o app usa (matriz de permissões, receita e "seus clientes"), executadas como a pessoa
  const sb = createClient(envObrigatoria('SUPABASE_URL'), envObrigatoria('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const [r1, r2, r3, r4] = await Promise.all([sb.rpc('perm_rank', { p_mod: 'torre_voo' }), sb.rpc('ve_receita'), sb.rpc('escopo_limitado', { p_col: 'clients' }), sb.rpc('my_client_ids')]);
  for (const r of [r1, r2, r3, r4]) if (r.error) throw r.error;
  const nivel = Number(r1.data) || 0;
  if (nivel < 1) throw new HttpError(403, 'Seu papel não tem acesso ao Painel de Voo. Peça ao administrador.', 'sem_permissao');
  const { data: u } = await adminClient().from('records').select('data').eq('id', `users:${c.perfil.app_user_id}`).maybeSingle();
  return { c, org: c.perfil.org_id, nivel, veReceita: !!r2.data, limitado: !!r3.data, soVinculadas: !r3.data && !['dono', 'admin', 'head_trafego'].includes(c.perfil.papel), clientIds: (r4.data as string[]) ?? [], teamId: c.perfil.team_id, nome: String((u?.data as Record<string, unknown> | undefined)?.nome ?? c.email ?? 'Alguém') };
}

/** conta Meta → cliente do app (clients.metaContas, ou o antigo metaAdAccountId) */
export async function mapaContas(org: string): Promise<Map<string, { clientId: string; nome: string; respId: string | null }>> {
  const m = new Map<string, { clientId: string; nome: string; respId: string | null }>();
  for (const cl of await listar(org, 'clients')) {
    const ids = [...(Array.isArray(cl.metaContas) ? cl.metaContas as unknown[] : []), cl.metaAdAccountId].map(normConta).filter(Boolean);
    for (const id of ids) if (!m.has(id)) m.set(id, { clientId: cl.id, nome: String(cl.nome ?? ''), respId: (cl.respId as string) ?? null });
  }
  return m;
}
/** a pessoa pode ver esta conta? Dono/Admin/Head = todas (inclusive as sem cliente); gestor de tráfego (decisão do dono, 25/11/2026:
 *  cobre colega ausente) = todas as contas VINCULADAS a algum cliente; escopo limitado (CS/produção) = só contas dos seus clientes */
export function podeConta(q: QuemVoo, mapa: Map<string, { clientId: string }>, conta: string): boolean {
  if (!q.limitado) return !q.soVinculadas || mapa.has(conta);
  const l = mapa.get(conta); return !!l && q.clientIds.includes(l.clientId);
}

/* ---------------------------------------------------------------- Windsor */
const windsorUrl = (p: Record<string, string>) => {
  const u = new URL('https://connectors.windsor.ai/facebook');
  u.searchParams.set('api_key', envObrigatoria('WINDSOR_API_KEY'));
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  return u.toString();
};
async function windsor(p: Record<string, string>, ms = 140000): Promise<Record<string, unknown>[]> {
  const chave = envObrigatoria('WINDSOR_API_KEY');
  const res = await buscar(windsorUrl(p), { headers: { Accept: 'application/json' } }, ms);
  const txt = (await res.text()).split(chave).join('***');
  if (!res.ok) {
    console.error('[voo] Windsor HTTP', res.status, txt.slice(0, 300));
    throw new HttpError(502, res.status === 401 || res.status === 403 ? 'A Windsor recusou a chave (WINDSOR_API_KEY).' : `A Windsor respondeu com erro (HTTP ${res.status}). Tente de novo em instantes.`, 'windsor');
  }
  let j: { data?: unknown[] }; try { j = JSON.parse(txt); } catch { throw new HttpError(502, 'A Windsor devolveu uma resposta inválida.', 'windsor'); }
  return (Array.isArray(j.data) ? j.data : []) as Record<string, unknown>[];
}
/** contas ATIVAS conectadas (a Windsor só devolve as ativas; as inativas ficam de fora por decisão do dono) */
export async function buscarContas(): Promise<Conta[]> {
  const rows = await windsor({ date_preset: 'last_7d', fields: 'account_id,account_name,account_status,account_currency,spend' });
  const m = new Map<string, Conta>();
  for (const r of rows) { const id = normConta(r.account_id); if (id && !m.has(id)) m.set(id, { id, nome: String(r.account_name ?? id), status: String(r.account_status ?? 'ACTIVE'), moeda: String(r.account_currency ?? 'BRL') }); }
  return [...m.values()];
}
const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
const orc = (v: unknown) => (v == null || v === '' ? null : Math.round(n(v)) / 100); // centavos → R$
/** linhas do Windsor (nível anúncio × dia) → por dia: {rows, estr} */
export function compactar(rows: Record<string, unknown>[]): Map<string, Dia> {
  const out = new Map<string, Dia>();
  for (const r of rows) {
    const d = String(r.date ?? '').slice(0, 10); if (!d) continue;
    let dia = out.get(d); if (!dia) { dia = { rows: [], estr: { camps: {}, sets: {}, ads: {} } }; out.set(d, dia); }
    const conta = normConta(r.account_id), cid = String(r.campaign_id ?? ''), sid = String(r.adset_id ?? ''), aid = String(r.ad_id ?? '');
    if (!conta || !cid || !sid || !aid) continue;
    dia.estr.camps[cid] = { c: conta, n: String(r.campaign ?? cid), st: String(r.campaign_effective_status ?? ''), obj: String(r.campaign_objective ?? ''), orc: orc(r.campaign_daily_budget) };
    dia.estr.sets[sid] = { c: cid, n: String(r.adset_name ?? sid), st: String(r.adset_effective_status ?? ''), orc: orc(r.adset_daily_budget) };
    dia.estr.ads[aid] = { s: sid, n: String(r.ad_name ?? aid), st: String(r.effective_status ?? '') };
    dia.rows.push([aid, n(r.spend), n(r.impressions), n(r.reach), n(r.clicks), n(r.link_clicks), n(r.actions_lead), n(r.actions_onsite_conversion_messaging_conversation_started_7d), n(r.actions_purchase), r.action_values_purchase == null ? null : n(r.action_values_purchase)]);
  }
  return out;
}
export async function buscarDia(d: string): Promise<Dia> {
  const m = compactar(await windsor({ date_from: d, date_to: d, fields: CAMPOS.join(',') }));
  return m.get(d) ?? { rows: [], estr: { camps: {}, sets: {}, ads: {} } };
}
/** busca AO VIVO de poucas contas (detalhe do cliente): 14 dias + hoje, numa só chamada */
export async function buscarContasVivo(ids: string[]): Promise<Map<string, Dia>> {
  return compactar(await windsor({ date_preset: `last_${DIAS - 1}dT`, select_accounts: ids.join(','), fields: CAMPOS.join(',') }, 60000));
}

/* ---------------------------------------------------------------- Meta Graph API (status e orçamento em tempo real, opcional) */
export const tokenMeta = () => env('META_ACCESS_TOKEN') ?? env('META_SYSTEM_USER_TOKEN');
export const versaoGraph = () => env('META_GRAPH_VERSION') ?? 'v21.0';
export async function graph(caminho: string, o: { metodo?: 'GET' | 'POST'; params?: Record<string, string> } = {}): Promise<Record<string, unknown>> {
  const t = tokenMeta(); if (!t) throw new HttpError(503, 'Ações no Meta aguardando o token do usuário do sistema (META_ACCESS_TOKEN).', 'nao_configurado');
  const u = new URL(`https://graph.facebook.com/${versaoGraph()}/${caminho}`);
  const corpo = new URLSearchParams({ ...(o.params ?? {}), access_token: t });
  let res: Response;
  if ((o.metodo ?? 'GET') === 'GET') { corpo.forEach((v, k) => u.searchParams.set(k, v)); res = await buscar(u.toString(), {}, 20000); }
  else res = await buscar(u.toString(), { method: 'POST', body: corpo, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 20000);
  const txt = (await res.text()).split(t).join('***');
  let j: Record<string, unknown> = {}; try { j = JSON.parse(txt); } catch { /* */ }
  if (!res.ok || j.error) {
    const e = (j.error ?? {}) as Record<string, unknown>;
    console.error('[voo] Graph', res.status, txt.slice(0, 300));
    if (res.status === 401 || e.code === 190) throw new HttpError(502, 'O Meta recusou o token (expirado ou sem ads_management). Gere outro no Business Manager › Usuários do sistema.', 'meta_token');
    if (e.code === 17 || e.code === 613 || e.error_subcode === 1487632) throw new HttpError(429, 'O Meta limitou as alterações deste item agora. Espere alguns minutos e tente de novo.', 'meta_limite');
    throw new HttpError(502, `O Meta não aceitou a alteração${e.error_user_msg ? `: ${String(e.error_user_msg).slice(0, 200)}` : ` (HTTP ${res.status})`}.`, 'meta');
  }
  return j;
}
/** sobrepõe status e orçamento lidos direto do Meta (quando há token): a Windsor pode demorar alguns minutos para refletir */
export async function statusMetaAoVivo(conta: string, estr: Estr): Promise<boolean> {
  if (!tokenMeta()) return false;
  try {
    const lim = { limit: '500' };
    const [c, s, a] = await Promise.all([
      graph(`act_${conta}/campaigns`, { params: { ...lim, fields: 'id,effective_status,daily_budget' } }),
      graph(`act_${conta}/adsets`, { params: { ...lim, fields: 'id,effective_status,daily_budget' } }),
      graph(`act_${conta}/ads`, { params: { ...lim, fields: 'id,effective_status' } }),
    ]);
    for (const x of (c.data ?? []) as Record<string, unknown>[]) { const o = estr.camps[String(x.id)]; if (o) { o.st = x.effective_status; o.orc = orc(x.daily_budget); } }
    for (const x of (s.data ?? []) as Record<string, unknown>[]) { const o = estr.sets[String(x.id)]; if (o) { o.st = x.effective_status; o.orc = orc(x.daily_budget); } }
    for (const x of (a.data ?? []) as Record<string, unknown>[]) { const o = estr.ads[String(x.id)]; if (o) o.st = x.effective_status; }
    return true;
  } catch (e) { console.error('[voo] status ao vivo falhou', (e as Error).message); return false; }
}

/* ---------------------------------------------------------------- cache (tabela voo_cache, só service role) */
export async function lerCache(chaves: string[]): Promise<Map<string, { dados: unknown; em: string }>> {
  const { data, error } = await adminClient().from('voo_cache').select('chave,dados,atualizado_em').in('chave', chaves);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.chave as string, { dados: r.dados, em: r.atualizado_em as string }]));
}
export async function gravarCache(itens: { chave: string; dados: unknown }[]): Promise<void> {
  if (!itens.length) return;
  const em = new Date().toISOString();
  const { error } = await adminClient().from('voo_cache').upsert(itens.map((i) => ({ ...i, atualizado_em: em })), { onConflict: 'chave' });
  if (error) throw error;
}

/** atualização da visão geral (cron a cada 5 min e quando o cache passa de 5 min): hoje e ontem sempre; dias antigos só se faltarem ou tiverem mais de 24 h */
export async function atualizarTudo(o: { forcar?: boolean } = {}): Promise<{ ok: boolean; dias: number; linhas: number; pulou?: string }> {
  const agora = Date.now();
  const trava = (await lerCache(['trava'])).get('trava');
  if (!o.forcar && trava && (trava.dados as { ate?: number })?.ate && (trava.dados as { ate: number }).ate > agora) return { ok: true, dias: 0, linhas: 0, pulou: 'já atualizando' };
  await gravarCache([{ chave: 'trava', dados: { ate: agora + 4 * 60000 } }]);
  try {
    const dias = listaDias();
    const cache = await lerCache(['contas', ...dias.map((d) => `dia:${d}`)]);
    const buscar = dias.filter((d, i) => { const c = cache.get(`dia:${d}`); return !c || i >= DIAS - 3 || agora - Date.parse(c.em) > 24 * 36e5; });
    const tarefas: Promise<unknown>[] = [];
    const contasVelhas = !cache.get('contas') || agora - Date.parse(cache.get('contas')!.em) > 60 * 60000;
    if (contasVelhas) tarefas.push(buscarContas().then((l) => gravarCache([{ chave: 'contas', dados: l }])).catch((e) => console.error('[voo] contas', e.message)));
    let linhas = 0;
    const fila = [...buscar];
    const trabalhador = async () => { for (let d = fila.shift(); d; d = fila.shift()) { try { const x = await buscarDia(d); linhas += x.rows.length; await gravarCache([{ chave: `dia:${d}`, dados: x }]); } catch (e) { console.error('[voo] dia', d, (e as Error).message); } } };
    for (let i = 0; i < 5; i++) tarefas.push(trabalhador());
    await Promise.all(tarefas);
    // dias fora da janela saem do cache
    await adminClient().from('voo_cache').delete().like('chave', 'dia:%').lt('chave', `dia:${dias[0]}`);
    return { ok: true, dias: buscar.length, linhas };
  } finally { await gravarCache([{ chave: 'trava', dados: { ate: 0 } }]); }
}

/** substitui, no cache de cada dia, as linhas e a estrutura das contas buscadas ao vivo */
export async function mesclarNoCache(contas: string[], vivo: Map<string, Dia>): Promise<void> {
  const dias = listaDias(); const cache = await lerCache(dias.map((d) => `dia:${d}`));
  const set = new Set(contas); const itens: { chave: string; dados: unknown }[] = [];
  for (const d of dias) {
    const atual = (cache.get(`dia:${d}`)?.dados as Dia | undefined) ?? { rows: [], estr: { camps: {}, sets: {}, ads: {} } };
    const novo = vivo.get(d) ?? { rows: [], estr: { camps: {}, sets: {}, ads: {} } };
    const campsFora = new Set(Object.entries(atual.estr.camps).filter(([, c]) => set.has(String(c.c))).map(([id]) => id));
    const setsFora = new Set(Object.entries(atual.estr.sets).filter(([, s]) => campsFora.has(String(s.c))).map(([id]) => id));
    const adsFora = new Set(Object.entries(atual.estr.ads).filter(([, a]) => setsFora.has(String(a.s))).map(([id]) => id));
    const estr: Estr = { camps: {}, sets: {}, ads: {} };
    for (const k of ['camps', 'sets', 'ads'] as const) {
      const fora = k === 'camps' ? campsFora : k === 'sets' ? setsFora : adsFora;
      for (const [id, v] of Object.entries(atual.estr[k])) if (!fora.has(id)) estr[k][id] = v;
      Object.assign(estr[k], novo.estr[k]);
    }
    itens.push({ chave: `dia:${d}`, dados: { rows: [...atual.rows.filter((r) => !adsFora.has(String(r[0]))), ...novo.rows], estr } });
  }
  await gravarCache(itens);
}

/** monta o pacote para o app: filtra pelo escopo e tira a receita de quem não vê */
export function montarPacote(q: QuemVoo, contasLista: Conta[], diasDados: Map<string, Dia>, mapa: Map<string, { clientId: string }>, o: { soContas?: string[] } = {}) {
  const dias = listaDias();
  const ok = (c: string) => podeConta(q, mapa, c) && (!o.soContas || o.soContas.includes(c));
  const camps: Estr['camps'] = {}, sets: Estr['sets'] = {}, ads: Estr['ads'] = {}; const linhas: Linha[] = [];
  const todas = new Map(contasLista.map((c) => [c.id, c]));
  dias.forEach((d, i) => {
    const x = diasDados.get(d); if (!x) return;
    for (const [id, c] of Object.entries(x.estr.camps)) if (ok(String(c.c))) { camps[id] = c; if (!todas.has(String(c.c))) todas.set(String(c.c), { id: String(c.c), nome: `Conta ${c.c}`, status: 'ACTIVE', moeda: 'BRL' }); }
    for (const [id, s] of Object.entries(x.estr.sets)) if (camps[String(s.c)]) sets[id] = s;
    for (const [id, a] of Object.entries(x.estr.ads)) if (sets[String(a.s)]) ads[id] = a;
    for (const r of x.rows) if (ads[String(r[0])]) { const l = [i, ...r]; if (!q.veReceita) l[10] = null; linhas.push(l); }
  });
  const contas = [...todas.values()].filter((c) => ok(c.id)).map((c) => ({ ...c, clientId: (mapa.get(c.id) || {} as { clientId?: string }).clientId ?? null }));
  return { dias, contas, camps, sets, ads, linhas, veReceita: q.veReceita, escopo: q.limitado ? 'seus' : 'todos', meus: q.clientIds };
}

/** mudanças de orçamento da última hora (para o "Mudanças nesta hora: 2/10" da tela) */
export async function mudancasHora(contas: string[]): Promise<Record<string, string[]>> {
  if (!contas.length) return {};
  const { data, error } = await adminClient().from('voo_mudancas').select('objeto_id,quando').eq('tipo', 'orcamento').eq('ok', true)
    .gt('quando', new Date(Date.now() - 36e5).toISOString()).in('conta_id', contas.slice(0, 500));
  if (error) throw error;
  const m: Record<string, string[]> = {};
  for (const r of data ?? []) (m[r.objeto_id as string] ||= []).push(r.quando as string);
  return m;
}
