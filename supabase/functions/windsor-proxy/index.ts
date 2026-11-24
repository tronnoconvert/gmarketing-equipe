// windsor-proxy — dados da conta de Campanha (Meta Ads via Windsor.ai) para o app, sem expor a chave.
// Só o papel Dono. POST/GET {date_preset?, date_from?, date_to?, fields?: string[]|"a,b", select_accounts?}
// Lê WINDSOR_API_KEY (obrigatória) e WINDSOR_ACCOUNT_ID (conta padrão) das variáveis de ambiente.
import { buscar, corpo, envObrigatoria, env, HttpError, json, lista, servir, texto } from '../_shared/http.ts';
import { chamador, exigirPapel } from '../_shared/supa.ts';

const PRESETS = ['today', 'yesterday', 'last_3d', 'last_7d', 'last_14d', 'last_28d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'this_year'];
const CAMPOS = new Set([
  'date', 'account_id', 'account_name', 'campaign', 'campaign_id', 'campaign_status', 'objective', 'adset_name', 'adset_id', 'ad_name', 'ad_id',
  'spend', 'impressions', 'reach', 'frequency', 'clicks', 'link_clicks', 'ctr', 'cpc', 'cpm', 'cpp',
  'actions_lead', 'cost_per_action_type_lead', 'actions_purchase', 'action_values_purchase', 'purchase_roas', 'website_purchase_roas',
  'actions_onsite_conversion_messaging_conversation_started_7d', 'actions_link_click', 'actions_landing_page_view', 'actions_video_view',
  'conversions', 'cost_per_conversion', 'thumbnail_url', 'body', 'title',
]);
const PADRAO = ['date', 'campaign', 'spend', 'impressions', 'clicks', 'ctr', 'cpm', 'frequency', 'actions_lead', 'actions_purchase', 'action_values_purchase'];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(servir(async (req) => {
  const c = await chamador(req);
  exigirPapel(c, ['dono', 'admin'], { somenteUsuario: true }); // regra do dono: o que é só do dono vale também para o admin (sócia)
  const b = await corpo(req);

  const preset = texto(b.date_preset, 'date_preset') || 'last_30d';
  const de = texto(b.date_from, 'date_from', { re: DATA });
  const ate = texto(b.date_to, 'date_to', { re: DATA });
  if (!de && !PRESETS.includes(preset)) throw new HttpError(400, `date_preset inválido. Use: ${PRESETS.join(', ')}.`, 'validacao');
  if ((de && !ate) || (!de && ate)) throw new HttpError(400, 'Informe date_from e date_to juntos (aaaa-mm-dd).', 'validacao');
  const pedidos = lista(b.fields, 'fields', 40);
  const fora = pedidos.filter((f) => !CAMPOS.has(f));
  if (fora.length) throw new HttpError(400, `Campos não permitidos: ${fora.join(', ')}.`, 'validacao');
  const fields = pedidos.length ? pedidos : PADRAO;
  const contas = texto(b.select_accounts, 'select_accounts', { max: 300, re: /^[\w.,:-]+$/ }) || env('WINDSOR_ACCOUNT_ID') || '';

  const chave = envObrigatoria('WINDSOR_API_KEY');
  const u = new URL('https://connectors.windsor.ai/facebook');
  u.searchParams.set('api_key', chave);
  if (de) { u.searchParams.set('date_from', de); u.searchParams.set('date_to', ate); } else u.searchParams.set('date_preset', preset);
  u.searchParams.set('fields', fields.join(','));
  if (contas) u.searchParams.set('select_accounts', contas);

  const res = await buscar(u.toString(), { headers: { Accept: 'application/json' } }, 30000);
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
  return json({ ok: true, periodo: de ? { de, ate } : { preset }, contas: contas ? contas.split(',') : [], campos: fields, total: linhas.length, data: linhas, atualizadoEm: new Date().toISOString() });
}, ['GET', 'POST']));
