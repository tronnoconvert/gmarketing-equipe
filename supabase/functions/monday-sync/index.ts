// monday-sync — importa/atualiza clientes a partir dos quadros do monday.com para `records` (coleção clients).
// Quadros padrão: 18425955775 (🗂️ Cadastro de Clientes) e 18425955783 (✈️ Painel de Voo). Troque com MONDAY_BOARD_IDS.
// Quem pode chamar: Dono/Admin (botão "Sincronizar agora") ou o agendador (x-cron-secret / service role).
// POST {orgId?, dryRun?: boolean}  → {ok, lidos, criados, atualizados, ignorados, amostra?}
// Chave de ligação entre os quadros: ID da conta de anúncios (act_…). Campos do app (health, MRR, contrato) não são sobrescritos;
// os dados do monday ficam em `monday` e `painelVoo` dentro do cliente.
import { buscar, corpo, env, envObrigatoria, HttpError, json, servir, texto } from '../_shared/http.ts';
import { auditar, chamador, exigirPapel, gravar, listar, novoId, orgs, type Obj } from '../_shared/supa.ts';

const BOARD_CADASTRO = '18425955775';
const BOARD_PAINEL = '18425955783';
/** id da coluna no monday → campo no app (mapa revisado em nov/2026; sobrescreva com MONDAY_COLUMN_MAP em JSON) */
const MAPA_PADRAO: Record<string, Record<string, string>> = {
  [BOARD_CADASTRO]: {
    color_mm63caj4: 'empresa', text_mm6360vb: 'adAccountId', link_mm63cct: 'looker', multiple_person_mm63w9m8: 'gestor',
    color_mm63r82j: 'statusContratual', numeric_mm63p9n9: 'metaCustoConversa', numeric_mm63pak8: 'verbaDiaria', date_mm63bqs0: 'inicioContrato',
    long_text_mm63gadf: 'observacoes', date_mm64cwdh: 'lerDadosDesde', numeric_mm64n9mw: 'cicloConta', text_mm64xrz7: 'nomeNoMeta',
    text_mm644crf: 'perfilBm', color_mm64fmef: 'origemConta', color_mm64vrm9: 'sincronizacao',
  },
  [BOARD_PAINEL]: {
    text_mm63b2fj: 'adAccountId', color_mm63r5g8: 'semaforo', color_mm63kvm1: 'acaoRecomendada', color_mm64gg37: 'statusOperacional',
    numeric_mm63w4v: 'healthScore', color_mm635b8n: 'riscoChurn', numeric_mm63htzg: 'conversas7d', numeric_mm639bpy: 'custoConversa7d',
    numeric_mm6333c7: 'verbaMensagem7d', numeric_mm64k37q: 'verbaTotal7d', numeric_mm63z8p7: 'gastoMedioDiario', numeric_mm63zcat: 'diasSemOtimizacao',
    color_mm63ep41: 'fadigaCriativo', numeric_mm64zrpk: 'custoConversa3d', numeric_mm647hv2: 'conversas3d', date_mm63mmd1: 'ultimaAtualizacao',
    date_mm6540y5: 'ultimaExecucao', color_mm64n65h: 'statusRevisao', numeric_mm64z6b7: 'alertasEnviados',
  },
};
const STATUS: Record<string, string> = { Ativo: 'ativo', Onboarding: 'onboarding', Pausado: 'pausado', Encerrado: 'encerrado' };
const NUM = (v: string | null) => { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18) || 'cliente';

interface Item { id: string; name: string; board: string; cols: Record<string, string | null> }

async function gql(token: string, query: string, variables: Record<string, unknown>) {
  const res = await buscar('https://api.monday.com/v2', { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': '2024-10' }, body: JSON.stringify({ query, variables }) }, 30000);
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new HttpError(502, 'O monday.com recusou o token. Gere outro e rode "supabase secrets set MONDAY_API_TOKEN=...".', 'monday_auth');
  if (!res.ok || body.errors || body.error_message) {
    console.error('[monday-sync]', res.status, JSON.stringify(body.errors ?? body.error_message ?? body).slice(0, 400));
    throw new HttpError(502, `O monday.com respondeu com erro${body.error_message ? `: ${body.error_message}` : ''}.`, 'monday');
  }
  return body.data;
}

async function lerQuadro(token: string, board: string): Promise<Item[]> {
  const conv = (it: { id: string; name: string; column_values: { id: string; text: string | null }[] }): Item =>
    ({ id: it.id, name: it.name, board, cols: Object.fromEntries(it.column_values.map((c) => [c.id, c.text])) });
  const out: Item[] = [];
  const d = await gql(token, `query ($b: [ID!]) { boards(ids: $b) { items_page(limit: 200) { cursor items { id name column_values { id text } } } } }`, { b: [board] });
  let pagina = d?.boards?.[0]?.items_page; if (!pagina) throw new HttpError(404, `Quadro ${board} não encontrado ou sem acesso para este token.`, 'monday_quadro');
  out.push(...pagina.items.map(conv));
  let guard = 0;
  while (pagina.cursor && guard++ < 50) {
    const n = await gql(token, `query ($c: String!) { next_items_page(limit: 200, cursor: $c) { cursor items { id name column_values { id text } } } }`, { c: pagina.cursor });
    pagina = n.next_items_page; out.push(...pagina.items.map(conv));
  }
  return out;
}

function mapear(it: Item, mapa: Record<string, Record<string, string>>): Record<string, unknown> {
  const m = mapa[it.board] ?? {}; const o: Record<string, unknown> = {};
  for (const [col, campo] of Object.entries(m)) {
    const v = it.cols[col];
    o[campo] = /^numeric_/.test(col) ? NUM(v ?? null) : (v ?? null);
  }
  return o;
}

Deno.serve(servir(async (req) => {
  const c = await chamador(req);
  exigirPapel(c, ['dono', 'admin']);
  const b = await corpo(req);
  const token = envObrigatoria('MONDAY_API_TOKEN');
  const boards = (env('MONDAY_BOARD_IDS') ?? `${BOARD_CADASTRO},${BOARD_PAINEL}`).split(',').map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
  if (!boards.length) throw new HttpError(400, 'MONDAY_BOARD_IDS inválido (use ids numéricos separados por vírgula).', 'validacao');
  let mapa = MAPA_PADRAO;
  if (env('MONDAY_COLUMN_MAP')) { try { mapa = { ...MAPA_PADRAO, ...JSON.parse(env('MONDAY_COLUMN_MAP')!) }; } catch { throw new HttpError(500, 'MONDAY_COLUMN_MAP não é um JSON válido.', 'config'); } }

  const org = c.sistema ? (texto(b.orgId, 'orgId', { max: 60 }) || env('DEFAULT_ORG_ID') || (await orgs())[0]) : c.perfil!.org_id;
  if (!org) throw new HttpError(400, 'Nenhuma organização encontrada. Rode schema.sql e cadastre a org.', 'org');
  const dryRun = b.dryRun === true || b.dryRun === 'true';
  const inicio = new Date().toISOString();

  const itens: Item[] = [];
  for (const bd of boards) itens.push(...await lerQuadro(token, bd));

  // agrupa por conta de anúncios (ou pelo nome, se não houver conta)
  const grupos = new Map<string, { nome: string; cadastro?: Item; painel?: Item }>();
  for (const it of itens) {
    const d = mapear(it, mapa); const conta = String(d.adAccountId ?? '').trim();
    const k = conta ? `act:${conta}` : `nome:${slug(it.name)}`;
    const g = grupos.get(k) ?? { nome: it.name };
    if (it.board === BOARD_PAINEL) g.painel = it; else g.cadastro = it;
    grupos.set(k, g);
  }

  const existentes = await listar(org, 'clients');
  const porMonday = new Map(existentes.filter((x) => x.mondayId).map((x) => [String(x.mondayId), x]));
  const porConta = new Map(existentes.filter((x) => (x.monday as Obj | undefined)?.adAccountId).map((x) => [String((x.monday as Obj).adAccountId), x]));
  const ids = new Set(existentes.map((x) => x.id));
  const gravarLista: Obj[] = []; let criados = 0, atualizados = 0, ignorados = 0;
  const agora = new Date().toISOString();

  for (const g of grupos.values()) {
    const base = g.cadastro ?? g.painel!;
    const cad = g.cadastro ? mapear(g.cadastro, mapa) : {};
    const pv = g.painel ? mapear(g.painel, mapa) : null;
    const conta = String(cad.adAccountId ?? pv?.adAccountId ?? '');
    if (!base.name?.trim()) { ignorados++; continue; }
    const atual = porMonday.get(base.id) ?? (conta ? porConta.get(conta) : undefined);
    const status = STATUS[String(cad.statusContratual ?? '')] ?? (atual?.status as string | undefined) ?? 'ativo';
    const novo: Obj = {
      ...(atual ?? {}),
      id: atual?.id ?? (() => { let id = `c-${slug(base.name)}`; let n = 2; while (ids.has(id)) id = `c-${slug(base.name)}${n++}`; ids.add(id); return id; })(),
      nome: atual?.nome ?? base.name.trim(),
      mondayId: base.id,
      status, ativo: status !== 'encerrado',
      origem: atual?.origem ?? 'monday',
      monday: { ...cad, adAccountId: conta || null, boardId: base.board, itemId: base.id, sincronizadoEm: agora },
      ...(pv ? { painelVoo: { ...pv, itemId: g.painel!.id, sincronizadoEm: agora } } : {}),
      ...(atual ? {} : { desde: cad.inicioContrato ?? agora.slice(0, 10), createdAt: agora, equipe: [], servicos: ['Tráfego'] }),
    };
    if (!atual && typeof pv?.healthScore === 'number') novo.health = pv.healthScore; // só no primeiro cadastro
    gravarLista.push(novo); if (atual) atualizados++; else criados++;
  }

  if (!dryRun) {
    await gravar(org, 'clients', gravarLista);
    await gravar(org, 'routineRuns', [{ id: novoId('run'), routineId: 'r-sync-monday', inicio, fim: new Date().toISOString(), estado: 'ok', resumo: `${itens.length} itens lidos · ${criados} criados · ${atualizados} atualizados`, origem: 'monday-sync' }]);
    await auditar(org, { id: c.perfil?.app_user_id ?? null, nome: c.sistema ? 'Sistema' : 'Sincronização monday.com' }, `sincronizou ${gravarLista.length} clientes do monday.com`, 'clients', null);
  }
  return json({ ok: true, dryRun, quadros: boards, lidos: itens.length, criados, atualizados, ignorados, amostra: dryRun ? gravarLista.slice(0, 5) : undefined });
}));
