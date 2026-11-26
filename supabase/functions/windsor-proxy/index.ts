// windsor-proxy — dados da conta de Campanha (Meta Ads via Windsor.ai) para o app, sem expor a chave.
// Só Dono e Admin. POST/GET {date_preset?, date_from?, date_to?, fields?: string[]|"a,b", select_accounts?: "act_1,act_2"}
// Lê WINDSOR_API_KEY (obrigatória) e WINDSOR_ACCOUNT_ID (contas padrão, separadas por vírgula) das variáveis de ambiente;
// sem WINDSOR_ACCOUNT_ID usa as duas contas próprias do dono (CA01 e CA02 · HOF).
// A Windsor só aceita presets no formato last_Xd / last_XdT / this_month...: "today" e "yesterday" viram date_from/date_to
// (dia de São Paulo) aqui no servidor.
import { buscar, corpo, envObrigatoria, env, HttpError, json, lista, servir, texto } from '../_shared/http.ts';
import { chamador, exigirPapel } from '../_shared/supa.ts';

const PRESETS = ['today', 'yesterday', 'last_3d', 'last_7d', 'last_14d', 'last_28d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'this_year'];
const PRESET_RE = /^last_\d{1,3}dT?$/; // formato aceito pela Windsor (ex.: last_89dT = 89 dias + hoje)
const CONTAS_PROPRIAS = ['act_1906477940242386', 'act_848802707655510']; // CA01 - Gabriel Leão · CA02 · HOF
/** dia (aaaa-mm-dd) em São Paulo, com deslocamento em dias */
function diaSP(desloc = 0): string {
  const d = new Date(Date.now() - 3 * 3600_000 + desloc * 864e5); // America/Sao_Paulo (sem horário de verão desde 2019)
  return d.toISOString().slice(0, 10);
}
const CAMPOS = new Set([
  'date', 'account_id', 'account_name', 'campaign', 'campaign_id', 'campaign_status', 'objective', 'adset_name', 'adset_id', 'ad_name', 'ad_id',
  'spend', 'impressions', 'reach', 'frequency', 'clicks', 'link_clicks', 'ctr', 'cpc', 'cpm', 'cpp',
  'actions_lead', 'cost_per_action_type_lead', 'actions_purchase', 'action_values_purchase', 'purchase_roas', 'website_purchase_roas',
  'actions_onsite_conversion_messaging_conversation_started_7d', 'actions_link_click', 'actions_landing_page_view', 'actions_video_view',
  'conversions', 'cost_per_conversion', 'thumbnail_url', 'body', 'title',
  'campaign_effective_status', 'campaign_objective', 'campaign_daily_budget', 'adset_effective_status', 'adset_daily_budget', 'effective_status',
  'actions_post_engagement', 'account_status', 'account_currency',
]);
const PADRAO = ['date', 'campaign', 'spend', 'impressions', 'clicks', 'ctr', 'cpm', 'frequency', 'actions_lead', 'actions_purchase', 'action_values_purchase'];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(servir(async (req) => {
  const c = await chamador(req);
  exigirPapel(c, ['dono', 'admin'], { somenteUsuario: true }); // regra do dono: o que é só do dono vale também para o admin (sócia)
  const b = await corpo(req);

  let preset = texto(b.date_preset, 'date_preset') || 'last_30d';
  let de = texto(b.date_from, 'date_from', { re: DATA });
  let ate = texto(b.date_to, 'date_to', { re: DATA });
  if (!de && !ate) {
    const hoje = diaSP(0);
    if (preset === 'today' || preset === 'yesterday') de = ate = diaSP(preset === 'today' ? 0 : -1);
    else if (preset === 'this_month') { de = `${hoje.slice(0, 7)}-01`; ate = hoje; }
    else if (preset === 'this_year') { de = `${hoje.slice(0, 4)}-01-01`; ate = hoje; }
    else if (preset === 'last_month') {
      const [a, m] = hoje.split('-').map(Number); const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1;
      de = `${pa}-${String(pm).padStart(2, '0')}-01`; ate = new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10);
    }
  }
  if (!de && !PRESETS.includes(preset) && !PRESET_RE.test(preset)) throw new HttpError(400, `date_preset inválido. Use: ${PRESETS.join(', ')}.`, 'validacao');
  if ((de && !ate) || (!de && ate)) throw new HttpError(400, 'Informe date_from e date_to juntos (aaaa-mm-dd).', 'validacao');
  const pedidos = lista(b.fields, 'fields', 40);
  const fora = pedidos.filter((f) => !CAMPOS.has(f));
  if (fora.length) throw new HttpError(400, `Campos não permitidos: ${fora.join(', ')}.`, 'validacao');
  const fields = pedidos.length ? pedidos : PADRAO;
  const contas = (texto(b.select_accounts, 'select_accounts', { max: 300, re: /^(act_)?\d{5,20}(,(act_)?\d{5,20}){0,9}$/ }) || env('WINDSOR_ACCOUNT_ID') || CONTAS_PROPRIAS.join(','))
    .split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/^act_/, '')).join(','); // a Windsor espera o número da conta, sem act_
  if (de && ate && de > ate) throw new HttpError(400, 'date_from depois de date_to.', 'validacao');

  const chave = envObrigatoria('WINDSOR_API_KEY');
  const u = new URL('https://connectors.windsor.ai/facebook');
  u.searchParams.set('api_key', chave);
  if (de) { u.searchParams.set('date_from', de); u.searchParams.set('date_to', ate); } else u.searchParams.set('date_preset', preset);
  u.searchParams.set('fields', fields.join(','));
  if (contas) u.searchParams.set('select_accounts', contas);

  const res = await buscar(u.toString(), { headers: { Accept: 'application/json' } }, 120000);
  const txt = await res.text();
  const limpo = txt.split(chave).join('***'); // nunca devolve a chave, nem em mensagens de erro
  if (!res.ok) {
    console.error('[windsor-proxy] HTTP', res.status, limpo.slice(0, 300));
    const msg = res.status === 401 || res.status === 403 ? 'A Windsor recusou a chave. Gere outra em windsor.ai e rode "supabase secrets set WINDSOR_API_KEY=...".' : `A Windsor respondeu com erro (HTTP ${res.status}). Tente de novo mais tarde.`;
    throw new HttpError(502, msg, 'windsor');
  }
  let dados: unknown;
  try { dados = JSON.parse(limpo); } catch { throw new HttpError(502, 'A Windsor devolveu uma resposta que não é JSON.', 'windsor'); }
  const linhas = Array.isArray((dados as { data?: unknown[] }).data) ? (dados as { data: unknown[] }).data : Array.isArray(dados) ? dados as unknown[] : [];
  return json({ ok: true, periodo: de ? { de, ate } : { preset }, contas: contas ? contas.split(',').map((x) => `act_${x}`) : [], campos: fields, total: linhas.length, data: linhas, atualizadoEm: new Date().toISOString() });
}, ['GET', 'POST']));
