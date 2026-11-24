// guardiao/meta.ts — leitura da conta de anúncios (Graph API do Meta e, como reserva, Windsor) e pausa de campanhas.
// Permissões do token (usuário do sistema do Business Manager): ads_management, ads_read, business_management.
import { buscar, env, HttpError } from '../_shared/http.ts';

const versao = () => env('META_GRAPH_VERSION') ?? 'v21.0';
const token = () => env('META_SYSTEM_USER_TOKEN') ?? env('META_ACCESS_TOKEN');
export const metaConfigurado = () => !!token();
export const windsorConfigurado = () => !!env('WINDSOR_API_KEY');

type Linha = Record<string, unknown>;

/** GET paginado no Graph API (segue paging.next até maxPaginas); nunca devolve o token em erros */
async function graphGet(caminho: string, params: Record<string, string>, maxPaginas = 5): Promise<Linha[]> {
  const t = token();
  if (!t) throw new HttpError(503, 'Defina META_SYSTEM_USER_TOKEN com "supabase secrets set META_SYSTEM_USER_TOKEN=...".', 'nao_configurado');
  const u = new URL(`https://graph.facebook.com/${versao()}/${caminho}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', t);
  const out: Linha[] = [];
  let url: string | null = u.toString();
  for (let i = 0; url && i < maxPaginas; i++) {
    const res = await buscar(url, { headers: { Accept: 'application/json' } }, 20000);
    const txt = (await res.text()).split(t).join('***');
    if (!res.ok) {
      console.error('[guardiao] Graph', res.status, txt.slice(0, 300));
      const msg = res.status === 401 || /OAuthException/.test(txt) ? 'O token do Meta foi recusado (expirado ou sem permissão ads_management/business_management). Gere outro no Business Manager › Usuários do sistema.' : `O Meta respondeu com erro (HTTP ${res.status}).`;
      throw new HttpError(502, msg, 'meta');
    }
    const j = JSON.parse(txt) as { data?: Linha[]; paging?: { next?: string } };
    out.push(...(j.data ?? []));
    url = j.paging?.next ?? null;
  }
  return out;
}

export interface Leitura { campanhas: Linha[]; conjuntos: Linha[]; atividades: Linha[]; horas: Linha[]; gastoHoje?: number; fonteGasto: string }

/** tudo que o Guardião precisa de uma conta act_… */
export async function lerConta(act: string, o: { desdeMin: number }): Promise<Leitura> {
  const desde = Math.floor((Date.now() - o.desdeMin * 60000) / 1000);
  if (metaConfigurado()) {
    const [campanhas, conjuntos, atividades, horas] = await Promise.all([
      graphGet(`${act}/campaigns`, { fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,objective', limit: '200', effective_status: '["ACTIVE","PAUSED","IN_PROCESS","WITH_ISSUES"]' }),
      graphGet(`${act}/adsets`, { fields: 'id,name,campaign_id,status,effective_status,daily_budget,targeting{geo_locations{countries}}', limit: '300', effective_status: '["ACTIVE","PAUSED","IN_PROCESS","WITH_ISSUES"]' }),
      graphGet(`${act}/activities`, { fields: 'event_type,event_time,actor_id,actor_name,object_id,object_name,object_type,extra_data,application_name,translated_event_type', since: String(desde), limit: '500' }, 3),
      graphGet(`${act}/insights`, { fields: 'spend', time_increment: '1', date_preset: 'last_7d', breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone', limit: '500' }, 4)
        .then(async (h) => h.concat(await graphGet(`${act}/insights`, { fields: 'spend', date_preset: 'today', breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone', limit: '50' }, 1))),
    ]);
    return { campanhas, conjuntos, atividades, horas, fonteGasto: 'meta-horario' };
  }
  if (windsorConfigurado()) {
    // reserva: a Windsor não traz o registro de atividades nem pausa campanhas por esta rota; só gasto do dia (regras de gasto/teto)
    const u = new URL('https://connectors.windsor.ai/facebook');
    const k = env('WINDSOR_API_KEY')!;
    u.searchParams.set('api_key', k); u.searchParams.set('date_preset', 'today');
    u.searchParams.set('fields', 'account_id,campaign_id,campaign,campaign_status,spend'); u.searchParams.set('select_accounts', act);
    const res = await buscar(u.toString(), { headers: { Accept: 'application/json' } }, 25000);
    const txt = (await res.text()).split(k).join('***');
    if (!res.ok) throw new HttpError(502, `A Windsor respondeu com erro (HTTP ${res.status}).`, 'windsor');
    const linhas = ((JSON.parse(txt) as { data?: Linha[] }).data ?? []);
    const porCamp = new Map<string, Linha>();
    let gasto = 0;
    for (const l of linhas) { gasto += Number(l.spend) || 0; if (l.campaign_id) porCamp.set(String(l.campaign_id), { id: l.campaign_id, name: l.campaign, status: l.campaign_status }); }
    return { campanhas: [...porCamp.values()], conjuntos: [], atividades: [], horas: [], gastoHoje: gasto, fonteGasto: 'windsor-diario' };
  }
  throw new HttpError(503, 'Nenhuma fonte configurada: defina META_SYSTEM_USER_TOKEN (recomendado) ou WINDSOR_API_KEY.', 'nao_configurado');
}

export interface ResultadoPausa { id: string; ok: boolean; via: string; detalhe?: string }

/** pausa UMA campanha (nunca exclui/arquiva). GUARDIAO_PAUSA_VIA = meta (padrão) | windsor */
export async function pausarCampanha(act: string, campanhaId: string): Promise<ResultadoPausa> {
  const via = (env('GUARDIAO_PAUSA_VIA') ?? 'meta').toLowerCase();
  try {
    if (via === 'windsor') {
      // Ação de escrita "pause_campaign" do conector facebook da Windsor (parâmetro campaign_id).
      // A URL do endpoint de ações vem de WINDSOR_ACTIONS_URL (confirme com o suporte da Windsor para a sua conta).
      const url = env('WINDSOR_ACTIONS_URL'); const k = env('WINDSOR_API_KEY');
      if (!url || !k) return { id: campanhaId, ok: false, via, detalhe: 'WINDSOR_ACTIONS_URL/WINDSOR_API_KEY ausentes' };
      const res = await buscar(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` }, body: JSON.stringify({ connector: 'facebook', account_id: act, action: 'pause_campaign', params: { campaign_id: campanhaId } }) }, 20000);
      return { id: campanhaId, ok: res.ok, via, detalhe: res.ok ? undefined : `HTTP ${res.status}` };
    }
    const t = token();
    if (!t) return { id: campanhaId, ok: false, via, detalhe: 'META_SYSTEM_USER_TOKEN ausente' };
    const body = new URLSearchParams({ status: 'PAUSED', access_token: t });
    const res = await buscar(`https://graph.facebook.com/${versao()}/${encodeURIComponent(campanhaId)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, 20000);
    const txt = (await res.text()).split(t).join('***');
    return { id: campanhaId, ok: res.ok, via, detalhe: res.ok ? undefined : `HTTP ${res.status} ${txt.slice(0, 160)}` };
  } catch (e) {
    return { id: campanhaId, ok: false, via, detalhe: (e as Error).message };
  }
}

/** reativação controlada (saída da quarentena, pedida por Dono/Admin com SIM): orçamento e/ou status ACTIVE */
export async function aplicarNoMeta(a: { tipo: string; nivel: string; id: string; para?: number }): Promise<ResultadoPausa> {
  const t = token();
  if (!t) return { id: a.id, ok: false, via: 'meta', detalhe: 'META_SYSTEM_USER_TOKEN ausente' };
  const p: Record<string, string> = { access_token: t };
  if (a.tipo === 'orcamento') p.daily_budget = String(Math.round(Number(a.para) * 100));
  else if (a.tipo === 'ativar') p.status = 'ACTIVE';
  else return { id: a.id, ok: false, via: 'meta', detalhe: `ação ${a.tipo} não permitida aqui` };
  try {
    const res = await buscar(`https://graph.facebook.com/${versao()}/${encodeURIComponent(a.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(p) }, 20000);
    const txt = (await res.text()).split(t).join('***');
    return { id: a.id, ok: res.ok, via: 'meta', detalhe: res.ok ? undefined : `HTTP ${res.status} ${txt.slice(0, 160)}` };
  } catch (e) { return { id: a.id, ok: false, via: 'meta', detalhe: (e as Error).message }; }
}
