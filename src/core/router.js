// router.js — roteador por hash: '#/clientes/c-orion/resultados?f=risco&p=tri'
const routes = []; // {pattern, segs:[{param?,name}], mod, score}
let handler = null;
let ultimoHash = null; // dedupe: location.hash = … dispara hashchange E popstate
let cur = { path: '', segs: [], params: {}, query: {}, pattern: null, mod: null };

function parseHash(h = location.hash) {
  h = decodeURI(String(h || '')).replace(/^#\/?/, '');
  const [p, qs = ''] = h.split('?');
  const path = p.replace(/\/+$/, '');
  const query = {};
  new URLSearchParams(qs).forEach((v, k) => { query[k] = v; });
  return { path, segs: path ? path.split('/') : [], query };
}
function qsOf(query) {
  const u = new URLSearchParams();
  Object.keys(query).forEach(k => { const v = query[k]; if (v !== undefined && v !== null && v !== '') u.set(k, v); });
  const s = u.toString(); return s ? `?${s}` : '';
}

export const router = {
  /** registra um padrão ('clientes/:id/:aba') para um módulo */
  add(pattern, mod) {
    const segs = pattern.split('/').filter(Boolean).map(s => (s[0] === ':' ? { param: true, name: s.slice(1) } : { name: s }));
    const score = segs.reduce((a, s) => a + (s.param ? 1 : 3), 0);
    routes.push({ pattern, segs, mod, score });
    routes.sort((a, b) => b.segs.length - a.segs.length || b.score - a.score);
  },
  routes() { return routes.slice(); },
  match(path) {
    const segs = String(path || '').split('/').filter(Boolean);
    for (const r of routes) {
      if (r.segs.length !== segs.length) continue;
      const params = {}; let ok = true;
      for (let i = 0; i < segs.length; i++) {
        const s = r.segs[i];
        if (s.param) params[s.name] = decodeURIComponent(segs[i]);
        else if (s.name !== segs[i]) { ok = false; break; }
      }
      if (ok) return { mod: r.mod, params, pattern: r.pattern };
    }
    return null;
  },
  get path() { return cur.path; },
  get params() { return { ...cur.params }; },
  get query() { return { ...cur.query }; },
  get segs() { return cur.segs.slice(); },
  get atual() { return { ...cur }; },
  /** monta href preservando a query atual (patch null remove a chave) */
  href(path, queryPatch, manter = true) {
    path = path == null ? cur.path : String(path).replace(/^#?\/?/, '');
    const base = manter ? { ...(path === cur.path ? cur.query : { p: cur.query.p }) } : {};
    const q = Object.assign(base, queryPatch || {});
    return `#/${path}${qsOf(q)}`;
  },
  /** navega (dispara render) */
  go(path, opts = {}) {
    const h = String(path).startsWith('#') ? path : `#/${String(path).replace(/^\/+/, '')}`;
    if (opts.replace) { history.replaceState(null, '', h); this._fire(); }
    else if (location.hash === h) this._fire();
    else location.hash = h;
  },
  /** altera a query sem recarregar. opts.render=true re-renderiza; opts.push=true cria entrada no histórico */
  setQuery(patch, opts = {}) {
    const q = { ...cur.query, ...patch };
    Object.keys(q).forEach(k => { if (q[k] === null || q[k] === undefined || q[k] === '') delete q[k]; });
    const h = `#/${cur.path}${qsOf(q)}`;
    if (opts.push) history.pushState(null, '', h); else history.replaceState(null, '', h);
    cur = { ...cur, query: q }; ultimoHash = location.hash;
    if (opts.render) this._fire();
  },
  back() { history.back(); },
  start(fn) {
    handler = fn;
    const porEvento = () => { if (location.hash === ultimoHash) return; this._fire(); };
    window.addEventListener('hashchange', porEvento);
    window.addEventListener('popstate', porEvento);
    this._fire();
  },
  /** relê a URL atual (sem disparar render) e devolve a rota resolvida */
  atualizar() {
    const p = parseHash(); const m = this.match(p.path);
    cur = { ...p, params: m ? m.params : {}, pattern: m ? m.pattern : null, mod: m ? m.mod : null };
    ultimoHash = location.hash;
    return { ...cur };
  },
  _fire() {
    ultimoHash = location.hash;
    const p = parseHash();
    const m = this.match(p.path);
    cur = { ...p, params: m ? m.params : {}, pattern: m ? m.pattern : null, mod: m ? m.mod : null };
    if (handler) handler(cur);
  },
  parse: parseHash,

  /** atalhos globais: {busca, notificacoes, ajuda, fechar, ir(path)} */
  atalhos(h) {
    let prefixo = null, t = null;
    const IR = { c: 'cockpit', f: 'financeiro', l: 'clientes', o: 'operacao', e: 'equipe', t: 'torre', m: 'comercial', a: 'alertas', w: 'webinars', p: 'campanha', n: 'notificacoes', d: 'admin' };
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { h.fechar && h.fechar(e); return; }
      const el = e.target;
      const digitando = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if (digitando || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.ov-modal')) return; // modal aberto: sem atalhos
      if (prefixo === 'g') {
        prefixo = null; clearTimeout(t);
        const dest = IR[e.key.toLowerCase()];
        if (dest) { e.preventDefault(); h.ir && h.ir(dest); }
        return;
      }
      if (e.key === '/') { e.preventDefault(); h.busca && h.busca(); }
      else if (e.key === '?') { e.preventDefault(); h.ajuda && h.ajuda(); }
      else if (e.key === 'n') { e.preventDefault(); h.notificacoes && h.notificacoes(); }
      else if (e.key === 'g') { prefixo = 'g'; clearTimeout(t); t = setTimeout(() => { prefixo = null; }, 1200); }
    });
    return IR;
  },
};
export default router;
