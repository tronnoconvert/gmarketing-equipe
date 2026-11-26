#!/usr/bin/env node
// tests/live/csp.mjs — confere que o app funciona com os cabeçalhos de segurança do netlify.toml (CSP, X-Frame-Options…).
// Serve o build com OS MESMOS cabeçalhos do netlify.toml e abre no Chromium (Playwright):
//   1) build de PRODUÇÃO (public/config.js): tela de login, carrega o supabase-js do cdn.jsdelivr.net, tenta um login
//      inválido (fala com o Supabase por https) — nenhuma violação de CSP;
//   2) build de DEMONSTRAÇÃO: entra como dono e percorre as telas principais — nenhuma violação de CSP.
// Também confere se o hash do <script> inline de src/index.html é o mesmo do CSP.
// Uso: NODE_USE_ENV_PROXY=1 node tests/live/csp.mjs   (SUPABASE_ESM_FILE=… opcional: supabase-js local no lugar do CDN)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
let playwright; try { playwright = require('playwright'); } catch { playwright = require(path.join(spawnSync('npm', ['root', '-g'], { encoding: 'utf8' }).stdout.trim(), 'playwright')); }
let oks = 0, falhas = 0;
const ok = (c, m) => { if (c) { oks++; console.log(`  ✓ ${m}`); } else { falhas++; console.log(`  ✗ ${m}`); } };

/* cabeçalhos do bloco "/*" do netlify.toml */
const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
const bloco = toml.split('[[headers]]').find(b => /for\s*=\s*"\/\*"/.test(b)) || '';
const HEAD = Object.fromEntries([...bloco.matchAll(/^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$/gm)].filter(m => m[1] !== 'for').map(m => [m[1], m[2]]));
const csp = HEAD['Content-Security-Policy'] || '';
ok(!!csp, 'netlify.toml tem Content-Security-Policy');
const inl = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8'))[1];
const hash = crypto.createHash('sha256').update(inl).digest('base64');
ok(csp.includes(`'sha256-${hash}'`), `hash do script inline confere (sha256-${hash})`);

function build(demo) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'aos-csp-'));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'build.mjs')], { env: { ...process.env, OUT: out, ...(demo ? { AOS_DEMO: '1' } : {}) }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('build falhou: ' + r.stderr);
  return out;
}
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
async function servir(dir) {
  const s = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, path.normalize(p));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, HEAD); res.end(); return; }
    // upgrade-insecure-requests em http://127.0.0.1 não se aplica a localhost; o resto vale igual
    res.writeHead(200, { ...HEAD, 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  return { s, base: `http://127.0.0.1:${s.address().port}/` };
}

const browser = await playwright.chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined });
async function pagina() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'pt-BR', ignoreHTTPSErrors: false });
  if (process.env.SUPABASE_ESM_FILE) await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: fs.readFileSync(process.env.SUPABASE_ESM_FILE, 'utf8') }));
  const page = await ctx.newPage(); const v = [];
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) v.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => v.push('pageerror: ' + e.message));
  return { ctx, page, v };
}

// 1) produção
{
  const dir = build(false); const { s, base } = await servir(dir);
  const { ctx, page, v } = await pagina();
  await page.goto(base); await page.waitForSelector('.lg-form', { timeout: 30000 });
  ok(true, 'produção: tela de login abre com o CSP');
  const temSb = await page.waitForFunction(() => window.AOS && window.AOS.db && window.AOS.db.supabase, null, { timeout: 30000 }).then(() => true).catch(() => false);
  ok(temSb, 'produção: supabase-js carregado do cdn.jsdelivr.net');
  const auth = []; page.on('response', r => { if (/supabase\.co\/auth\/v1\/token/.test(r.url())) auth.push(r.status()); });
  await page.fill('#lg-email', 'csp-teste@auditoria.invalid'); await page.fill('#lg-senha', 'senha-errada-123'); await page.click('.lg-go');
  await page.waitForSelector('.lg-err:not([hidden])', { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(1500);
  ok(auth.length > 0 && auth.every(x => x === 400), `produção: o navegador falou com o Supabase Auth e recebeu "credencial inválida" (connect-src ok; HTTP ${auth.join(',') || 'nenhum'})`);
  const viol = [...v, ...(await page.evaluate(() => window.__csp))];
  ok(!viol.length, `produção: nenhuma violação de CSP${viol.length ? ` (${viol.slice(0, 4).join(' | ')})` : ''}`);
  await ctx.close(); s.close();
}
// 2) demonstração
{
  const dir = build(true); const { s, base } = await servir(dir);
  const { ctx, page, v } = await pagina();
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(base); await page.waitForSelector('.lg-form');
  await page.fill('#lg-email', 'gabriel@agencia.demo'); await page.fill('#lg-senha', 'demo123'); await page.click('.lg-go');
  await page.waitForSelector('#view', { timeout: 15000 });
  for (const r of ['cockpit', 'clientes', 'financeiro/visao', 'operacao', 'equipe', 'torre', 'torre/voo', 'comercial', 'alertas', 'webinars', 'campanha', 'mesa', 'admin/integracoes', 'notificacoes']) {
    await page.evaluate(x => { location.hash = '#/' + x; }, r); await page.waitForTimeout(350);
  }
  ok(await page.isVisible('#view'), 'demonstração: telas principais abertas com o CSP');
  const viol = [...v, ...(await page.evaluate(() => window.__csp))];
  ok(!viol.length, `demonstração: nenhuma violação de CSP${viol.length ? ` (${viol.slice(0, 4).join(' | ')})` : ''}`);
  await ctx.close(); s.close();
}
await browser.close();
console.log(`\n${oks} ok · ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
