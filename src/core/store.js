// store.js — banco de dados do app. Leituras síncronas da memória; escritas persistem (localStorage ou Supabase).
// API: db.list, db.get, db.find, db.count, db.insert, db.update, db.remove, db.upsert, db.seed, db.on, db.reset,
//      db.config, db.setConfig, db.batch, db.mode, db.ready, db.cols
export const COLS = ['users', 'team', 'clients', 'contacts', 'contracts', 'services', 'healthHistory', 'deliveries', 'tasks', 'invoices', 'payables', 'cash', 'deals', 'routines', 'routineRuns', 'integrations', 'alerts', 'alertRules', 'notifications', 'comments', 'activity', 'webinars', 'campaignAccount', 'campaignDaily', 'campaigns', 'onboarding', 'meetings', 'timeEntries', 'goals', 'settings', 'clientResults', 'clientActions', 'mrrMoves', 'finance', 'costs', 'projects', 'checkins', 'oneOnOnes', 'teamStats', 'insights', 'webinarDaily', 'creatives', 'invites', 'recsLog', 'relatorios'];
const KEY = 'aos-db-v1';
const DB_VERSION = 4; // suba este número quando os dados de exemplo mudarem: o modo demonstração recarrega a semente
// "Ver como" é só visualização: nenhuma escrita sai do navegador enquanto estiver ativo.
let leituraFn = () => false, avisoLeitura = null, ultimoAviso = 0;
function bloqueado(col) {
  if (!leituraFn()) return false;
  const gesto = typeof navigator !== 'undefined' && navigator.userActivation && navigator.userActivation.isActive;
  if (gesto && avisoLeitura && Date.now() - ultimoAviso > 1500) { ultimoAviso = Date.now(); try { avisoLeitura(col); } catch { /* nada */ } }
  return true;
}
const CFG = (typeof window !== 'undefined' && window.AOS_CONFIG) || {};
const SUPA = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
const SUPA_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

let mem = {};            // col -> array de objetos
let meta = { v: DB_VERSION, seeded: [] };
const listeners = new Set();
const seedReg = [];      // [{col, arr, opts}] para db.reset()
const pendingSeeds = []; // supabase: aplicadas depois do carregamento
let userFn = () => null; // injetado por auth (evita import circular)
let batching = 0, batchDirty = false;
let loaded = false;

const clone = o => (o == null ? o : (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o))));
const nowIso = () => new Date().toISOString();
const arr = col => (mem[col] || (mem[col] = []));
let seq = 0;
export function genId(col = 'x') {
  const p = String(col).replace(/[^a-z]/gi, '').slice(0, 3).toLowerCase() || 'id';
  return `${p}-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

/* ---------------- Adapters ---------------- */
const LocalAdapter = {
  name: 'demo', storageOk: true,
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || d.v !== DB_VERSION || (CFG.dataVersion && d.dv !== CFG.dataVersion)) return null;
      return d;
    } catch (e) { this.storageOk = false; return null; }
  },
  _t: null,
  save() {
    if (!this.storageOk) return;
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), 60);
  },
  flush() {
    clearTimeout(this._t); this._t = null;
    if (!this.storageOk) return;
    try { localStorage.setItem(KEY, JSON.stringify({ v: DB_VERSION, dv: CFG.dataVersion || null, meta, cols: mem })); }
    catch (e) { this.storageOk = false; console.warn('[Gmarketing] armazenamento local indisponível; usando memória.', e && e.message); }
  },
  write() { this.save(); },
  clear() { try { localStorage.removeItem(KEY); } catch (e) { /* memória */ } },
};

// Produção: o app NÃO lê nem grava a tabela `records` direto. Usa as funções seguras do banco (supabase/policies.sql):
//   ler_records / ler_record → já aplicam o RLS e tiram os valores de receita de quem não tem a permissão 'receita'
//   gravar_record / apagar_record → mesmas regras do RLS; o servidor preserva os valores de receita já gravados
//   realtime → assina `records_feed` (só id/coleção/operação) e busca o registro de novo por ler_record
const SupabaseAdapter = {
  name: 'supabase', client: null, orgId: CFG.orgId || null, canal: null, filas: new Map(),
  async init() {
    const url = CFG.supabaseEsm || SUPA_ESM;
    const mod = await import(/* webpackIgnore: true */ url);
    this.client = mod.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true } });
    return this.client;
  },
  async load() {
    const out = {}; let apos = ''; const page = 1000;
    for (;;) {
      const { data, error } = await this.client.rpc('ler_records', { p_apos: apos, p_limite: page });
      if (error) throw error;
      for (const r of data || []) (out[r.col] || (out[r.col] = [])).push(r.data);
      if (!data || data.length < page) break;
      apos = data[data.length - 1].id;
    }
    return out;
  },
  /** grava em fila por registro (a ordem das gravações do mesmo registro é preservada) */
  write(col, op, obj) {
    if (!this.client) return;
    const id = `${col}:${obj.id}`;
    const dados = op === 'remove' ? null : clone(obj);
    const antes = this.filas.get(id) || Promise.resolve();
    const p = antes.then(() => (op === 'remove'
      ? this.client.rpc('apagar_record', { p_id: id })
      : this.client.rpc('gravar_record', { p_col: col, p_data: dados })))
      .then(({ error }) => { if (error) { console.warn('[Gmarketing] falha ao salvar no Supabase:', error.message); emit(col, 'erro', { id: obj.id, erro: error.message }); } })
      .catch(e => { console.warn('[Gmarketing] falha ao salvar no Supabase:', e && e.message); emit(col, 'erro', { id: obj.id, erro: (e && e.message) || 'erro' }); })
      .finally(() => { if (this.filas.get(id) === p) this.filas.delete(id); });
    this.filas.set(id, p);
  },
  /** espera as gravações pendentes (testes e logout) */
  pendentes() { return Promise.all([...this.filas.values()]); },
  async aplicarRemoto(recId, col, op) {
    const a = arr(col); const rid = recId.slice(col.length + 1);
    let novo = null;
    if (op !== 'DELETE') {
      const { data, error } = await this.client.rpc('ler_record', { p_id: recId });
      if (error) { console.warn('[Gmarketing] realtime: falha ao ler', recId, error.message); return; }
      novo = data;
    }
    const i = a.findIndex(o => o.id === rid);
    if (!novo) { if (i >= 0) { a.splice(i, 1); emit(col, 'remove', { id: rid }, true); } return; }
    if (i >= 0) a[i] = novo; else a.push(novo);
    emit(col, i >= 0 ? 'update' : 'insert', novo, true);
  },
  realtime() {
    if (!this.client || CFG.realtime === false) return;
    try {
      if (this.canal) { try { this.client.removeChannel(this.canal); } catch (e) { /* ignora */ } this.canal = null; }
      this.canal = this.client.channel('records-feed').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'records_feed' }, p => {
        const f = p.new; if (!f || !f.rec_id || !f.col) return;
        this.aplicarRemoto(f.rec_id, f.col, f.op);
      }).subscribe();
    } catch (e) { console.warn('[Gmarketing] realtime indisponível', e && e.message); }
  },
  flush() {}, clear() {},
};

const adapter = SUPA ? SupabaseAdapter : LocalAdapter;

/* ---------------- núcleo ---------------- */
function emit(col, op, obj, remoto = false) {
  if (op === 'erro') { listeners.forEach(fn => { try { fn(col, op, obj); } catch (e) { console.error(e); } }); return; }
  if (batching) { batchDirty = true; return; }
  listeners.forEach(fn => { try { fn(col, op, obj ? clone(obj) : obj, remoto); } catch (e) { console.error(e); } });
}
function persist(col, op, obj) { if (adapter === LocalAdapter) LocalAdapter.save(); else adapter.write(col, op, obj); }

function logActivity(oque, col, refId) {
  const u = userFn();
  const a = { id: genId('activity'), quem: u ? u.id : null, quemNome: u ? u.nome : 'Sistema', oque, col, refId, quando: nowIso() };
  arr('activity').push(a);
  persist('activity', 'insert', a);
  emit('activity', 'insert', a);
}

function bootLocal() {
  const d = LocalAdapter.load();
  if (d) { mem = d.cols || {}; meta = d.meta || meta; if (!Array.isArray(meta.seeded)) meta.seeded = []; }
  COLS.forEach(arr);
  loaded = true;
}

function applySeed(col, list, opts = {}) {
  const key = opts.chave ? `${col}#${opts.chave}` : col;
  if (meta.seeded.includes(key)) return false;
  const a = arr(col);
  if (!opts.chave && a.length) { meta.seeded.push(key); return false; }
  const ids = new Set(a.map(o => o.id));
  const ts = nowIso();
  for (const raw of list) {
    const o = clone(raw);
    if (!o.id) o.id = `${col.slice(0, 3)}-${hash(JSON.stringify(raw))}`;
    if (ids.has(o.id)) continue;
    if (!o.createdAt) o.createdAt = ts;
    a.push(o); ids.add(o.id);
    if (adapter !== LocalAdapter) adapter.write(col, 'insert', o);
  }
  meta.seeded.push(key);
  if (adapter === LocalAdapter) LocalAdapter.save();
  return true;
}

export const db = {
  get mode() { return SUPA ? 'supabase' : 'demo'; },
  get cols() { return COLS.slice(); },
  get loaded() { return loaded; },
  ready: null,
  get supabase() { return SupabaseAdapter.client; },

  /** lista (cópia). pred opcional: objeto {campo: valor} ou função */
  list(col, pred) {
    let a = arr(col);
    if (typeof pred === 'function') a = a.filter(pred);
    else if (pred && typeof pred === 'object') { const ks = Object.keys(pred); a = a.filter(o => ks.every(k => o[k] === pred[k])); }
    return a.map(clone);
  },
  get(col, id) { const o = arr(col).find(x => x.id === id); return o ? clone(o) : null; },
  find(col, pred) { return this.list(col, pred)[0] || null; },
  count(col, pred) { return pred ? this.list(col, pred).length : arr(col).length; },

  insert(col, obj, opts = {}) {
    if (bloqueado(col)) return clone(obj);
    const u = userFn();
    const o = clone(obj) || {};
    if (!o.id) o.id = genId(col);
    if (!o.createdAt) o.createdAt = nowIso();
    if (o.createdBy === undefined) o.createdBy = u ? u.id : null;
    const a = arr(col); const i = a.findIndex(x => x.id === o.id);
    if (i >= 0) a[i] = o; else a.push(o);
    persist(col, 'insert', o); emit(col, 'insert', o);
    if (opts.log) logActivity(opts.log, col, o.id);
    return clone(o);
  },
  update(col, id, patch, opts = {}) {
    if (bloqueado(col)) return this.get(col, id);
    const a = arr(col); const i = a.findIndex(x => x.id === id);
    if (i < 0) return null;
    const u = userFn();
    const o = Object.assign({}, a[i], clone(patch), { id, updatedAt: nowIso(), updatedBy: u ? u.id : null });
    a[i] = o;
    persist(col, 'update', o); emit(col, 'update', o);
    if (opts.log) logActivity(opts.log, col, id);
    return clone(o);
  },
  upsert(col, obj, opts = {}) { return obj.id && this.get(col, obj.id) ? this.update(col, obj.id, obj, opts) : this.insert(col, obj, opts); },
  remove(col, id, opts = {}) {
    if (bloqueado(col)) return null;
    const a = arr(col); const i = a.findIndex(x => x.id === id);
    if (i < 0) return null;
    const [o] = a.splice(i, 1);
    persist(col, 'remove', o); emit(col, 'remove', o);
    if (opts.log) logActivity(opts.log, col, id);
    return clone(o);
  },
  /** semeia somente se a coleção estiver vazia (ou, com {chave}, se essa chave nunca foi semeada) */
  seed(col, list, opts = {}) {
    if (!Array.isArray(list)) return false;
    seedReg.push({ col, list: clone(list), opts });
    if (!loaded) { pendingSeeds.push({ col, list, opts }); return false; }
    if (SUPA && !CFG.seedDemo) return false;
    return applySeed(col, list, opts);
  },
  /** executa várias escritas emitindo um único evento ('*','batch') no final */
  batch(fn) {
    batching++;
    try { fn(); } finally {
      batching--;
      if (!batching && batchDirty) { batchDirty = false; emit('*', 'batch', null); }
    }
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  /** configuração chave/valor guardada em settings ({id: chave, valor}) */
  config(chave, padrao) { const o = arr('settings').find(x => x.id === chave); return o ? clone(o.valor) : padrao; },
  setConfig(chave, valor, opts) { return this.upsert('settings', { id: chave, valor }, opts); },
  /** demo: apaga tudo e ressemeia (recarrega a página por padrão) */
  reset(opts = {}) {
    if (SUPA) { console.warn('db.reset() só funciona no modo demonstração'); return false; }
    mem = {}; meta = { v: DB_VERSION, seeded: [] }; COLS.forEach(arr);
    for (const s of seedReg) applySeed(s.col, s.list, s.opts);
    LocalAdapter.flush();
    emit('*', 'reset', null);
    if (opts.reload !== false && typeof location !== 'undefined') location.reload();
    return true;
  },
  /** uso interno (auth) */
  _setUserProvider(fn) { userFn = fn; },
  /** "Ver como": fn() → true enquanto o dono/admin vê o app como outra pessoa (somente visualização) */
  _setSomenteLeitura(fn, aviso) { leituraFn = fn; avisoLeitura = aviso; },
  /** Supabase: recarrega tudo do servidor (após login, quando o RLS libera as linhas do usuário). */
  async reload() {
    if (!SUPA || !SupabaseAdapter.client) return;
    try { mem = await SupabaseAdapter.load(); COLS.forEach(arr); db.loadError = null; }
    catch (e) { db.loadError = (e && e.message) || 'erro desconhecido'; throw e; }
    SupabaseAdapter.realtime(); // reassina com a sessão nova (o RLS do feed depende de quem está logado)
    try { listeners.forEach(fn => { try { fn('*', 'reload', null); } catch (_) {} }); } catch (_) {}
  },
  _flush() { adapter.flush(); },
  /** Supabase: espera as gravações em andamento */
  async _pendentes() { if (SUPA) await SupabaseAdapter.pendentes(); },
  _storageOk() { return adapter === LocalAdapter ? LocalAdapter.storageOk : true; },
};

if (SUPA) {
  db.ready = (async () => {
    try {
      await SupabaseAdapter.init();
      mem = await SupabaseAdapter.load();
    } catch (e) {
      console.warn('[Gmarketing] não foi possível carregar do Supabase:', e && e.message);
      db.loadError = (e && e.message) || 'erro desconhecido';
    }
    COLS.forEach(arr); loaded = true;
    if (CFG.seedDemo) for (const s of pendingSeeds.splice(0)) applySeed(s.col, s.list, s.opts);
    SupabaseAdapter.realtime();
    emit('*', 'load', null);
  })();
} else {
  bootLocal();
  db.ready = Promise.resolve();
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => LocalAdapter.flush());
    // outra aba gravou (demo): traz as notificações novas para esta aba (sino + aviso sonoro). O resto continua por aba.
    window.addEventListener('storage', e => {
      if (e.key !== KEY || !e.newValue) return;
      try {
        const outras = ((JSON.parse(e.newValue) || {}).cols || {}).notifications || [];
        const a = arr('notifications'); const ids = new Set(a.map(o => o.id)); let n = 0;
        for (const o of outras) if (o && o.id && !ids.has(o.id)) { a.push(o); n++; emit('notifications', 'insert', o, true); }
        if (n) LocalAdapter.save();
      } catch (err) { /* JSON parcial: ignora */ }
    });
  }
}

export default db;
