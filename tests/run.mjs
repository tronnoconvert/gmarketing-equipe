// tests/run.mjs — executor de testes sem dependências extras (usa o Playwright instalado globalmente).
// Uso: node tests/run.mjs            -> todos os tests/*.spec.mjs
//      node tests/run.mjs clientes   -> só tests/clientes.spec.mjs (aceita vários nomes)
//      VP=390 node tests/run.mjs     -> só um viewport (largura)    SKIP_BUILD=1 pula o build
// Cada spec: export default async function (t) { ... }  com t = { page, browser, base, vp, ok, step, ir, login, sair, espera }
//            export const viewports = [[1366,900]]  (opcional, para restringir)
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = process.env.OUT ? path.resolve(process.env.OUT) : path.join(ROOT, 'dist');
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) {
  try { const g = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' }).stdout.trim(); playwright = require(path.join(g, 'playwright')); }
  catch (e2) { console.error('Playwright não encontrado (require("playwright")).'); process.exit(2); }
}
const VIEWPORTS = [[1366, 900], [1920, 1080], [390, 844]];

/* ---------- build ---------- */
if (!process.env.SKIP_BUILD) {
  const b = spawnSync(process.execPath, [path.join(ROOT, 'build.mjs')], { stdio: 'inherit', env: { ...process.env, AOS_DEMO: '1' } }); // testes: sempre modo demonstração
  if (b.status !== 0) { console.error('falha no build'); process.exit(1); }
}

/* ---------- servidor estático ---------- */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, path.normalize(p));
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('não encontrado'); return; }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

/* ---------- specs ---------- */
const filtro = process.argv.slice(2).filter(a => !a.startsWith('-'));
const specs = fs.readdirSync(path.join(ROOT, 'tests')).filter(f => f.endsWith('.spec.mjs')).filter(f => !filtro.length || filtro.some(n => f === n || f === `${n}.spec.mjs` || f.replace('.spec.mjs', '') === n)).sort();
if (!specs.length) { console.error(`nenhum spec encontrado para: ${filtro.join(', ')}`); server.close(); process.exit(1); }

const browser = await playwright.chromium.launch();
let falhas = 0, passos = 0, oks = 0;
const t0 = Date.now();

for (const spec of specs) {
  const mod = await import(path.join(ROOT, 'tests', spec));
  let vps = mod.viewports || VIEWPORTS;
  if (process.env.VP) vps = vps.filter(v => String(v[0]) === process.env.VP);
  for (const [w, h] of vps) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', deviceScaleFactor: 1, hasTouch: w < 700, isMobile: false });
    // fontes externas: responde vazio (ambiente de teste sem rede não pode gerar erro de console)
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await ctx.route(/cdn\.jsdelivr\.net/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    const page = await ctx.newPage();
    const erros = [], overflow = new Map(), rotas = new Set();
    page.on('console', m => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
    page.on('pageerror', e => erros.push(`pageerror: ${e.message}`));
    page.on('requestfailed', r => { if (!/fonts\.|jsdelivr/.test(r.url()) && !(/\/torre\/torre-controle/.test(r.url()) && /ERR_ABORTED/.test((r.failure() || {}).errorText || ''))) erros.push(`requestfailed: ${r.url()} ${r.failure() && r.failure().errorText}`); });
    await page.exposeFunction('__aosReport', d => { rotas.add(d.rota); if (d.overflow) overflow.set(d.rota, `${d.scrollWidth} > ${d.innerWidth}`); });
    let passoAtual = '(início)';
    const nome = `${spec.replace('.spec.mjs', '')} @${w}x${h}`;
    const falhar = msg => { falhas++; console.log(`  ✗ [${nome}] ${passoAtual}: ${msg}`); };
    const t = {
      page, browser, base, vp: { w, h }, mobile: w < 700,
      ok(cond, msg) { passos++; if (cond) oks++; else falhar(msg || 'condição falsa'); return !!cond; },
      step(n) { passoAtual = n; if (process.env.VERBOSE) console.log(`  · [${nome}] ${n}`); },
      async ir(hash) { await page.evaluate(h => { location.hash = h; }, hash.replace(/^#/, '')); await page.waitForTimeout(160); await checarOverflow(); },
      async login(email = 'gabriel@agencia.demo', senha = 'demo123') {
        await page.goto(base + 'index.html');
        await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
        await page.goto(base + 'index.html');
        await page.waitForSelector('.lg-form');
        await page.fill('#lg-email', email); await page.fill('#lg-senha', senha);
        await page.click('.lg-go');
        await page.waitForSelector('#view', { timeout: 5000 });
        await page.waitForTimeout(150);
      },
      async sair() { await page.evaluate(() => window.AOS.auth.logout()); await page.waitForSelector('.lg-form'); },
      espera: ms => page.waitForTimeout(ms),
    };
    async function checarOverflow() {
      const d = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, r: location.hash }));
      if (d.sw > d.iw + 1) overflow.set(d.r || '(raiz)', `${d.sw} > ${d.iw}`);
    }
    try { await mod.default(t); await checarOverflow(); } catch (e) { falhar(`exceção: ${e.message.split('\n')[0]}`); }
    for (const e of erros) falhar(e);
    for (const [r, v] of overflow) falhar(`rolagem horizontal em ${r} (${v})`);
    console.log(`${erros.length || overflow.size ? '✗' : '✓'} ${nome} · ${rotas.size} rotas renderizadas`);
    await ctx.close();
  }
}
await browser.close(); server.close();
console.log(`\n${oks}/${passos} verificações ok · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`falhas: ${falhas}`);
process.exit(falhas ? 1 : 0);
