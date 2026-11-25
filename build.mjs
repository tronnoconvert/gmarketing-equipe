// build.mjs — empacota o app:
//  (a) dist/index.html + dist/app.js + dist/app.css + cópia de public/ (hospedagem estática)
//  (b) dist/agencia-os.html — arquivo único com JS e CSS embutidos (prévia; sempre modo demonstração)
// Produção: `npm run build` usa public/config.js (Supabase). Demonstração: `AOS_DEMO=1 npm run build`.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src'), DIST = process.env.OUT ? path.resolve(process.env.OUT) : path.join(ROOT, 'dist'), PUB = path.join(ROOT, 'public');
const t0 = Date.now();

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// JS
const r = await esbuild.build({
  entryPoints: [path.join(SRC, 'main.js')], bundle: true, format: 'iife', target: ['es2020'], minify: false,
  outfile: path.join(DIST, 'app.js'), legalComments: 'none', charset: 'utf8', logLevel: 'warning', write: true,
});
if (r.errors.length) process.exit(1);

// CSS: core + style.css de cada módulo (ordem alfabética)
const cssCore = ['base.css', 'led.css'].map(f => path.join(SRC, 'core', f));
const modsDir = path.join(SRC, 'modules');
const cssMods = fs.existsSync(modsDir) ? fs.readdirSync(modsDir).sort().map(d => path.join(modsDir, d, 'style.css')).filter(f => fs.existsSync(f)) : [];
const css = [...cssCore, ...cssMods].map(f => `/* ${path.relative(SRC, f)} */\n${fs.readFileSync(f, 'utf8')}`).join('\n\n');
fs.writeFileSync(path.join(DIST, 'app.css'), css);

// public/ -> dist/
const copiar = (a, b) => {
  if (!fs.existsSync(a)) return;
  for (const e of fs.readdirSync(a, { withFileTypes: true })) {
    const s = path.join(a, e.name), d = path.join(b, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copiar(s, d); } else fs.copyFileSync(s, d);
  }
};
copiar(PUB, DIST);
// public/config.js = produção (Supabase). AOS_DEMO=1 (testes, prévias) publica um config vazio → modo demonstração.
const DEMO = process.env.AOS_DEMO === '1';
if (DEMO || !fs.existsSync(path.join(DIST, 'config.js'))) fs.writeFileSync(path.join(DIST, 'config.js'), '// modo demonstração (build com AOS_DEMO=1)\nwindow.AOS_CONFIG = window.AOS_CONFIG || {};\n');

// HTML
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
fs.writeFileSync(path.join(DIST, 'index.html'), html);

const js = fs.readFileSync(path.join(DIST, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const cssInline = css.replace(/<\/style/gi, '<\\/style');
const single = html
  .replace(/<!--AOS:CONFIG-->[\s\S]*?<!--\/AOS:CONFIG-->/, '<script>window.AOS_SINGLE = true;</script>')
  .replace(/<!--AOS:CSS-->[\s\S]*?<!--\/AOS:CSS-->/, () => `<style>\n${cssInline}\n</style>`)
  .replace(/<!--AOS:JS-->[\s\S]*?<!--\/AOS:JS-->/, () => `<script>\n${js}\n</script>`);
fs.writeFileSync(path.join(DIST, 'agencia-os.html'), single.replace('<title>Gmarketing</title>', '<title>Protótipo Oficial</title>'));

const kb = f => (fs.statSync(path.join(DIST, f)).size / 1024).toFixed(0) + ' KB';
console.log(`build ${DEMO ? 'DEMONSTRAÇÃO' : 'PRODUÇÃO (public/config.js)'} ok em ${Date.now() - t0} ms · app.js ${kb('app.js')} · app.css ${kb('app.css')} (${cssMods.length} css de módulos) · agencia-os.html ${kb('agencia-os.html')}`);
