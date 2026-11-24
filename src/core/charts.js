// charts.js — gráficos em SVG puro (strings), cores por variáveis CSS (tema claro/escuro), tooltip compartilhado.
// Cada gráfico é envolvido em <div class="chw" data-chart> e redesenhado na largura real do contêiner
// por charts.hidratar(root) (o shell chama após cada render) — assim o texto nunca encolhe no celular.
import { esc, brl, brlK, pct, num, dec, compacto } from './fmt.js';
import { _setCharts, FAIXAS } from './ui.js';

const CORES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
const EST = { ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--err)', off: 'var(--off)', info: 'var(--c1)', acc: 'var(--c1)' };
const reg = new Map(); let rid = 0;
const r1 = v => Math.round(v * 10) / 10;

/* ---------- formatos ---------- */
function F(formato) {
  if (typeof formato === 'function') return { eixo: formato, tip: formato, un: '' };
  if (formato && typeof formato === 'object') return { eixo: formato.eixo || formato.tip, tip: formato.tip || formato.eixo, un: formato.unidade || '' };
  switch (formato) {
    case 'brl': return { eixo: v => brlK(v, { short: true }), tip: v => brl(v), un: '' };
    case 'brlK': return { eixo: v => brlK(v, { short: true }), tip: v => brlK(v), un: '' };
    case 'mil': return { eixo: v => num(v), tip: v => `R$ ${dec(v, 1)} mil`, un: 'R$ mil' };
    case 'pct': return { eixo: v => pct(v, 0), tip: v => pct(v, 1), un: '' };
    case 'dec': return { eixo: v => dec(v, 1), tip: v => dec(v, 1), un: '' };
    default: return { eixo: v => compacto(v), tip: v => num(v), un: '' };
  }
}
function ticks(min, max, n = 4) {
  if (min === max) { max = min + 1; }
  const span = max - min, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = []; for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}
function wrap(build, opts, Wpad, tipo) {
  const id = `ch${++rid}`; reg.set(id, { build, opts });
  const W = opts.largura || Wpad;
  return `<div class="chw ch-${tipo}" data-chart="${id}" data-w="${W}">${build(opts, W)}</div>`;
}
const svgOpen = (W, H, label, cls = '') => `<svg class="chart ${cls}" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet"><title>${esc(label)}</title>`;
const legendaHtml = (itens) => `<div class="ch-leg" aria-hidden="true">${itens.map(i => `<span><i class="${i.tracejado ? 'tr' : ''}${i.forma ? ' ' + i.forma : ''}" style="--k:${i.cor}"></i>${esc(i.nome)}</span>`).join('')}</div>`;

/* ---------- spark ---------- */
/** spark(serie, {cor, area, altura=32, rotulo, formato}) — mini-gráfico sem eixos */
export function spark(serie = [], o = {}) {
  const v = serie.filter(x => x != null);
  if (v.length < 2) return '';
  const W = 120, H = o.altura || 32, min = Math.min(...v), max = Math.max(...v), sp = max - min || 1;
  const pts = serie.map((y, i) => [r1((i / (serie.length - 1)) * W), r1(H - 3 - ((y - min) / sp) * (H - 6))]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('');
  const cor = o.cor || 'var(--acc)';
  const f = F(o.formato);
  const lbl = `${o.rotulo ? o.rotulo + ': ' : ''}tendência de ${f.tip(serie[0])} para ${f.tip(serie[serie.length - 1])}`;
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}" role="img" aria-label="${esc(lbl)}" style="--k:${cor}">
${o.area !== false ? `<path d="${d}L${W},${H}L0,${H}Z" class="sp-a"/>` : ''}<path d="${d}" class="sp-l" vector-effect="non-scaling-stroke"/></svg><i class="sp-dot" style="--k:${cor};top:${(last[1] / H) * 100}%"></i>`;
}

/* ---------- linhas ---------- */
/**
 * linhas({series:[{nome, dados, cor, tracejado, area}], rotulos, altura=220, formato, destaque:{i, texto}, projecaoDesde,
 *         metas:[{valor, rotulo}], marcos:[{i, rotulo, cor}], min, max, legenda=true, rotulo})
 */
export function linhas(o = {}) { return wrap(buildLinhas, o, 640, 'linhas'); }
function buildLinhas(o, W) {
  const H = o.altura || o.alturas || 220, f = F(o.formato);
  const series = (o.series || []).map((s, i) => ({ ...s, cor: s.cor || CORES[i % 6] }));
  const rot = o.rotulos || (series[0] ? series[0].dados.map((_, i) => String(i + 1)) : []);
  const n = rot.length;
  const all = series.flatMap(s => s.dados.filter(v => v != null)).concat((o.metas || []).map(m => m.valor));
  if (!all.length) return '';
  let mn = o.min ?? Math.min(...all), mx = o.max ?? Math.max(...all);
  const pad = (mx - mn) * 0.12 || 1; if (o.min === undefined) mn = mn - pad; if (o.max === undefined) mx = mx + pad * 0.5;
  if (o.min === undefined && Math.min(...all) >= 0 && mn < 0) mn = 0;
  const tk = ticks(mn, mx, H < 180 ? 3 : 4); mn = tk[0]; mx = tk[tk.length - 1];
  const yl = Math.max(...tk.map(t => f.eixo(t).length)) * 6.6 + 10;
  const L = Math.max(34, yl), R = 14, T = f.un ? 22 : 14, B = 26, pw = W - L - R, ph = H - T - B;
  const X = i => L + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw), Y = v => T + ph - ((v - mn) / (mx - mn)) * ph;
  const lmax = Math.max(...rot.map(x => String(x).length)) * 6.4 + 12;
  const passo = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / lmax))));
  let s = svgOpen(W, H, o.rotulo || `Gráfico de linhas: ${series.map(x => `${x.nome} de ${f.tip(x.dados.find(v => v != null))} a ${f.tip([...x.dados].reverse().find(v => v != null))}`).join('; ')}`);
  if (f.un) s += `<text x="${L - 8}" y="10" class="ch-u" text-anchor="end">${esc(f.un)}</text>`;
  tk.forEach(t => { s += `<line x1="${L}" x2="${W - R}" y1="${r1(Y(t))}" y2="${r1(Y(t))}" class="ch-g${t === 0 ? ' z' : ''}"/><text x="${L - 8}" y="${r1(Y(t)) + 4}" class="ch-t" text-anchor="end">${esc(f.eixo(t))}</text>`; });
  if (o.projecaoDesde != null && o.projecaoDesde < n - 1) {
    const x0 = X(o.projecaoDesde);
    s += `<rect x="${r1(x0)}" y="${T}" width="${r1(W - R - x0)}" height="${ph}" class="ch-proj"/><text x="${r1(x0 + 6)}" y="${T + 12}" class="ch-t sm">Projeção</text>`;
  }
  rot.forEach((r, i) => { if (i % passo === 0 || i === n - 1 && (n - 1) % passo > passo / 2) s += `<text x="${r1(X(i))}" y="${H - 8}" class="ch-t" text-anchor="middle">${esc(r)}</text>`; });
  (o.metas || []).forEach(m => { s += `<line x1="${L}" x2="${W - R}" y1="${r1(Y(m.valor))}" y2="${r1(Y(m.valor))}" class="ch-meta"/><text x="${W - R}" y="${r1(Y(m.valor)) - 5}" class="ch-t sm meta" text-anchor="end">${esc(m.rotulo || 'Meta ' + f.tip(m.valor))}</text>`; });
  (o.marcos || []).forEach(m => { const x = r1(X(m.i)); s += `<line x1="${x}" x2="${x}" y1="${T}" y2="${T + ph}" class="ch-mk"/><g class="ch-mkp" data-tip="${esc(`${rot[m.i] ?? ''}\n${m.rotulo}`)}" tabindex="0"><circle cx="${x}" cy="${T + 2}" r="9" class="hit"/><circle cx="${x}" cy="${T + 2}" r="4.5" style="fill:${m.cor || 'var(--c4)'}" class="mkd"/></g>`; });
  series.forEach(se => {
    const seg = (a, b) => { let d = '', pen = false; for (let i = a; i <= b; i++) { const v = se.dados[i]; if (v == null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${r1(X(i))},${r1(Y(v))}`; pen = true; } return d; };
    const pd = o.projecaoDesde;
    const fim = se.dados.length - 1;
    if (se.area) { const d = seg(0, pd != null ? Math.min(pd, fim) : fim); const idx = se.dados.map((v, i) => (v != null ? i : -1)).filter(i => i >= 0 && (pd == null || i <= pd)); if (idx.length > 1) s += `<path d="${d}L${r1(X(idx[idx.length - 1]))},${T + ph}L${r1(X(idx[0]))},${T + ph}Z" class="ch-area" style="--k:${se.cor}"/>`; }
    if (pd != null && pd < fim) { s += `<path d="${seg(0, pd)}" class="ch-l${se.tracejado ? ' tr' : ''}" style="--k:${se.cor}"/><path d="${seg(pd, fim)}" class="ch-l tr" style="--k:${se.cor}"/>`; }
    else s += `<path d="${seg(0, fim)}" class="ch-l${se.tracejado ? ' tr' : ''}" style="--k:${se.cor}"/>`;
  });
  if (o.destaque && o.destaque.i != null) {
    const i = o.destaque.i, se = series[o.destaque.serie || 0], v = se && se.dados[i];
    if (v != null) {
      const x = r1(X(i)), y = r1(Y(v)); const txt = o.destaque.texto || f.tip(v);
      const tw = txt.length * 6.4 + 16, tx = Math.min(Math.max(x - tw / 2, L), W - R - tw), ty = y - 34 < T - 6 ? y + 12 : y - 34;
      s += `<circle cx="${x}" cy="${y}" r="9" class="ch-ring" style="--k:${se.cor}"/><circle cx="${x}" cy="${y}" r="4.5" class="ch-dot hi" style="--k:${se.cor}"/><g class="ch-call"><rect x="${r1(tx)}" y="${r1(ty)}" width="${r1(tw)}" height="22" rx="6"/><text x="${r1(tx + tw / 2)}" y="${r1(ty + 15)}" text-anchor="middle">${esc(txt)}</text></g>`;
    }
  }
  // camada de hover: uma coluna por x
  const cw = n > 1 ? pw / (n - 1) : pw;
  for (let i = 0; i < n; i++) {
    const linhasTip = series.filter(se => se.dados[i] != null).map(se => `${se.nome}: ${f.tip(se.dados[i])}`);
    if (!linhasTip.length) continue;
    const pj = o.projecaoDesde != null && i > o.projecaoDesde ? ' (projeção)' : '';
    const x = X(i);
    s += `<g class="hc" data-tip="${esc(`${rot[i]}${pj}\n${linhasTip.join('\n')}`)}"><rect x="${r1(Math.max(L, x - cw / 2))}" y="${T}" width="${r1(Math.min(cw, W - R - Math.max(L, x - cw / 2)))}" height="${ph}" class="hc-r"/><line x1="${r1(x)}" x2="${r1(x)}" y1="${T}" y2="${T + ph}" class="hc-l"/>${series.filter(se => se.dados[i] != null).map(se => `<circle cx="${r1(x)}" cy="${r1(Y(se.dados[i]))}" r="4" class="hc-d" style="--k:${se.cor}"/>`).join('')}</g>`;
  }
  s += '</svg>';
  const leg = o.legenda !== false && (series.length > 1 || o.projecaoDesde != null || (o.marcos || []).length) ? legendaHtml([...series.map(x => ({ nome: x.nome, cor: x.cor, tracejado: x.tracejado, forma: x.tracejado ? '' : 'ln' })), ...(o.projecaoDesde != null ? [{ nome: 'Projeção', cor: 'var(--muted)', tracejado: true }] : []), ...((o.marcos || []).length ? [{ nome: o.rotuloMarcos || 'Ações da equipe', cor: 'var(--c4)', forma: 'dot' }] : [])]) : '';
  return s + leg;
}

/* ---------- barras ---------- */
/** barras({rotulos, series:[{nome, dados, cor}], empilhado, horizontal, formato, altura, destaque:i, metas:[{valor,rotulo}], valores:true}) */
export function barras(o = {}) { return wrap(o.horizontal ? buildBarrasH : buildBarras, o, 640, 'barras'); }
function buildBarras(o, W) {
  const H = o.altura || 220, f = F(o.formato);
  const series = (o.series || []).map((s, i) => ({ ...s, cor: s.cor || CORES[i % 6] }));
  const rot = o.rotulos || []; const n = rot.length; if (!n) return '';
  const tot = i => series.reduce((a, s) => a + Math.max(0, s.dados[i] || 0), 0);
  const vals = o.empilhado ? rot.map((_, i) => tot(i)) : series.flatMap(s => s.dados.filter(v => v != null));
  const neg = Math.min(0, ...series.flatMap(s => s.dados.filter(v => v != null)));
  let mx = Math.max(...vals, ...(o.metas || []).map(m => m.valor), 0) * 1.08 || 1;
  const tk = ticks(neg, mx, H < 180 ? 3 : 4); const mn = tk[0]; mx = tk[tk.length - 1];
  const L = Math.max(34, Math.max(...tk.map(t => f.eixo(t).length)) * 6.6 + 10), R = 10, T = f.un ? 22 : 14, B = 26, pw = W - L - R, ph = H - T - B;
  const Y = v => T + ph - ((v - mn) / (mx - mn)) * ph;
  const gw = pw / n, bw = Math.min(o.empilhado ? 44 : 28, (gw * 0.7) / (o.empilhado ? 1 : series.length));
  const lmax = Math.max(...rot.map(x => String(x).length)) * 6.4 + 10;
  const passo = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / lmax))));
  let s = svgOpen(W, H, o.rotulo || `Gráfico de barras: ${series.map(x => x.nome).join(', ')} por ${rot[0]}…${rot[n - 1]}`);
  if (f.un) s += `<text x="${L - 8}" y="10" class="ch-u" text-anchor="end">${esc(f.un)}</text>`;
  tk.forEach(t => { s += `<line x1="${L}" x2="${W - R}" y1="${r1(Y(t))}" y2="${r1(Y(t))}" class="ch-g${t === 0 ? ' z' : ''}"/><text x="${L - 8}" y="${r1(Y(t)) + 4}" class="ch-t" text-anchor="end">${esc(f.eixo(t))}</text>`; });
  rot.forEach((r, i) => {
    const cx = L + gw * i + gw / 2;
    if (i % passo === 0) s += `<text x="${r1(cx)}" y="${H - 8}" class="ch-t${o.destaque === i ? ' b' : ''}" text-anchor="middle">${esc(r)}</text>`;
    const tip = `${r}\n${series.map(se => `${se.nome}: ${f.tip(se.dados[i] ?? 0)}`).join('\n')}${o.empilhado && series.length > 1 ? `\nTotal: ${f.tip(tot(i))}` : ''}`;
    let g = `<g class="hb${o.destaque != null && o.destaque !== i ? ' dim' : ''}" data-tip="${esc(tip)}"><rect x="${r1(L + gw * i)}" y="${T}" width="${r1(gw)}" height="${ph}" class="hc-r"/>`;
    if (o.empilhado) {
      let acc = 0;
      series.forEach((se, k) => { const v = Math.max(0, se.dados[i] || 0); if (!v) return; const y1 = Y(acc + v), y0 = Y(acc); const top = k === series.length - 1 || series.slice(k + 1).every(z => !(z.dados[i] > 0)); g += barRect(cx - bw / 2, y1, bw, y0 - y1 - (top ? 0 : 1.5), se.cor, top); acc += v; });
    } else {
      series.forEach((se, k) => { const v = se.dados[i]; if (v == null) return; const x = cx - (bw * series.length + 2 * (series.length - 1)) / 2 + k * (bw + 2); const y = v >= 0 ? Y(v) : Y(0); g += barRect(x, y, bw, Math.abs(Y(v) - Y(0)), se.cor, v >= 0, v < 0); });
    }
    if (o.valores) { const v = o.empilhado ? tot(i) : series[0].dados[i]; g += `<text x="${r1(cx)}" y="${r1(Y(o.empilhado ? tot(i) : Math.max(0, ...series.map(z => z.dados[i] || 0))) - 6)}" class="ch-t v" text-anchor="middle">${esc(f.eixo(v))}</text>`; }
    s += g + '</g>';
  });
  (o.metas || []).forEach(m => { s += `<line x1="${L}" x2="${W - R}" y1="${r1(Y(m.valor))}" y2="${r1(Y(m.valor))}" class="ch-meta"/><text x="${W - R}" y="${r1(Y(m.valor)) - 5}" class="ch-t sm meta" text-anchor="end">${esc(m.rotulo || 'Meta')}</text>`; });
  s += '</svg>';
  return s + (o.legenda !== false && series.length > 1 ? legendaHtml(series.map(x => ({ nome: x.nome, cor: x.cor }))) : '');
}
function barRect(x, y, w, h, cor, roundTop = true, roundBottom = false) {
  h = Math.max(0, h); if (h < 0.5) return '';
  x = r1(x); y = r1(y); w = r1(w); h = r1(h);
  const r = r1(Math.min(4, w / 2, h));
  if (!roundTop && !roundBottom) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" style="fill:${cor}" class="bar-r"/>`;
  if (roundBottom) return `<path d="M${x},${y}h${w}v${h - r}q0,${r} -${r},${r}h-${w - 2 * r}q-${r},0 -${r},-${r}Z" style="fill:${cor}" class="bar-r"/>`;
  return `<path d="M${x},${y + h}v-${h - r}q0,-${r} ${r},-${r}h${w - 2 * r}q${r},0 ${r},${r}v${h - r}Z" style="fill:${cor}" class="bar-r"/>`;
}
function buildBarrasH(o, W) {
  const f = F(o.formato);
  const series = (o.series || []).map((s, i) => ({ ...s, cor: s.cor || CORES[i % 6] }));
  const rot = o.rotulos || []; const n = rot.length; if (!n) return '';
  const tot = i => series.reduce((a, s) => a + Math.max(0, s.dados[i] || 0), 0);
  const mx = Math.max(...rot.map((_, i) => (o.empilhado ? tot(i) : Math.max(...series.map(s => s.dados[i] || 0)))), 0) || 1;
  const rowH = o.linha || (series.length > 1 && !o.empilhado ? 30 : 26), H = o.altura || n * rowH + 8;
  const lw = Math.min(W * 0.38, Math.max(...rot.map(r => String(r).length)) * 6.8 + 12);
  const vw = Math.max(...rot.map((_, i) => f.eixo(o.empilhado ? tot(i) : series[0].dados[i] || 0).length)) * 6.6 + 12;
  const L = lw, R = vw, pw = W - L - R;
  let s = svgOpen(W, H, o.rotulo || `Barras horizontais: ${rot.slice(0, 4).join(', ')}${n > 4 ? '…' : ''}`);
  rot.forEach((r, i) => {
    const y = 4 + i * rowH, bh = Math.min(14, rowH - 10);
    const tip = `${r}\n${series.map(se => `${se.nome}: ${f.tip(se.dados[i] ?? 0)}`).join('\n')}`;
    let g = `<g class="hb${o.destaque != null && o.destaque !== i ? ' dim' : ''}" data-tip="${esc(tip)}"><rect x="0" y="${y}" width="${W}" height="${rowH}" class="hc-r"/><text x="${L - 10}" y="${y + rowH / 2 + 4}" class="ch-t lbl" text-anchor="end">${esc(String(r).length > 26 ? String(r).slice(0, 25) + '…' : r)}</text><rect x="${L}" y="${r1(y + (rowH - bh) / 2)}" width="${pw}" height="${bh}" rx="3" class="ch-trk"/>`;
    let acc = 0;
    series.forEach((se, k) => {
      const v = Math.max(0, se.dados[i] || 0); const w = (v / mx) * pw; if (w < 0.5) return;
      const cor = se.cores ? se.cores[i] : se.cor;
      if (o.empilhado) { g += `<rect x="${r1(L + acc)}" y="${r1(y + (rowH - bh) / 2)}" width="${r1(Math.max(0, w - (k < series.length - 1 ? 1.5 : 0)))}" height="${bh}" rx="${k === series.length - 1 ? 3 : 0}" style="fill:${cor}" class="bar-r"/>`; acc += w; }
      else { const h2 = series.length > 1 ? bh / series.length : bh; g += `<rect x="${L}" y="${r1(y + (rowH - bh) / 2 + k * h2)}" width="${r1(w)}" height="${r1(h2 - (series.length > 1 ? 1 : 0))}" rx="3" style="fill:${cor}" class="bar-r"/>`; }
    });
    const v = o.empilhado ? tot(i) : series[0].dados[i];
    g += `<text x="${W - 4}" y="${y + rowH / 2 + 4}" class="ch-t v" text-anchor="end">${esc(f.eixo(v ?? 0))}</text></g>`;
    s += g;
  });
  s += '</svg>';
  return s + (o.legenda !== false && series.length > 1 ? legendaHtml(series.map(x => ({ nome: x.nome, cor: x.cor }))) : '');
}

/* ---------- dispersão ---------- */
/**
 * dispersao({pontos:[{x, y, r, rotulo, estado, href}], eixoX:{rotulo, formato, min, max}, eixoY:{...},
 *            quadrantes:{x, y, rotulos:[supEsq, supDir, infEsq, infDir], destaque:'supDir'}, altura=300, rotulosPontos:true})
 */
export function dispersao(o = {}) { return wrap(buildDispersao, o, 640, 'disp'); }
function buildDispersao(o, W) {
  const H = o.altura || 300; const ex = o.eixoX || {}, ey = o.eixoY || {}; const fx = F(ex.formato), fy = F(ey.formato);
  const pts = o.pontos || []; if (!pts.length) return '';
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  let xmn = ex.min ?? Math.min(...xs), xmx = ex.max ?? Math.max(...xs), ymn = ey.min ?? Math.min(...ys), ymx = ey.max ?? Math.max(...ys);
  const px = (xmx - xmn) * 0.08 || 1, py = (ymx - ymn) * 0.1 || 1;
  if (ex.min === undefined) xmn -= px; if (ex.max === undefined) xmx += px; if (ey.min === undefined) ymn = Math.max(0, ymn - py); if (ey.max === undefined) ymx += py;
  const tx = ticks(xmn, xmx, W < 420 ? 3 : 5), ty = ticks(ymn, ymx, 4);
  xmn = ex.min ?? tx[0]; xmx = ex.max ?? tx[tx.length - 1]; ymn = ey.min ?? ty[0]; ymx = ey.max ?? ty[ty.length - 1];
  const L = Math.max(36, Math.max(...ty.map(t => fy.eixo(t).length)) * 6.6 + 14) + (ey.rotulo ? 16 : 0), R = 14, T = 12, B = 40, pw = W - L - R, ph = H - T - B;
  const X = v => L + ((v - xmn) / (xmx - xmn)) * pw, Y = v => T + ph - ((v - ymn) / (ymx - ymn)) * ph;
  const rmax = Math.max(...pts.map(p => p.r || 0)) || 1;
  const RAD = p => (p.r ? 5 + Math.sqrt(p.r / rmax) * (W < 420 ? 9 : 13) : 6);
  let s = svgOpen(W, H, o.rotulo || `Dispersão: ${ey.rotulo || 'y'} por ${ex.rotulo || 'x'}, ${pts.length} pontos`);
  const q = o.quadrantes;
  if (q) {
    const qx = X(q.x), qy = Y(q.y);
    const zonas = [[L, T, qx - L, qy - T, 0], [qx, T, W - R - qx, qy - T, 1], [L, qy, qx - L, T + ph - qy, 2], [qx, qy, W - R - qx, T + ph - qy, 3]];
    const nomes = ['supEsq', 'supDir', 'infEsq', 'infDir'];
    zonas.forEach(([x, y, w, h, k]) => { if (q.destaque === nomes[k]) s += `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" class="ch-qz"/>`; });
    s += `<line x1="${r1(qx)}" x2="${r1(qx)}" y1="${T}" y2="${T + ph}" class="ch-qd"/><line x1="${L}" x2="${W - R}" y1="${r1(qy)}" y2="${r1(qy)}" class="ch-qd"/>`;
    const rl = q.rotulos || [];
    const lab = (x, y, t, anc, k) => (t ? `<text x="${r1(x)}" y="${r1(y)}" class="ch-ql${q.destaque === nomes[k] ? ' hot' : ''}" text-anchor="${anc}">${esc(t)}</text>` : '');
    s += lab(L + 8, T + 14, rl[0], 'start', 0) + lab(W - R - 8, T + 14, rl[1], 'end', 1) + lab(L + 8, T + ph - 8, rl[2], 'start', 2) + lab(W - R - 8, T + ph - 8, rl[3], 'end', 3);
  }
  ty.filter(t => t >= ymn - 1e-9 && t <= ymx + 1e-9).forEach(t => { s += `<line x1="${L}" x2="${W - R}" y1="${r1(Y(t))}" y2="${r1(Y(t))}" class="ch-g"/><text x="${L - 8}" y="${r1(Y(t)) + 4}" class="ch-t" text-anchor="end">${esc(fy.eixo(t))}</text>`; });
  tx.forEach(t => { if (t < xmn || t > xmx) return; s += `<text x="${r1(X(t))}" y="${T + ph + 16}" class="ch-t" text-anchor="middle">${esc(fx.eixo(t))}</text>`; });
  if (ex.rotulo) s += `<text x="${L + pw / 2}" y="${H - 4}" class="ch-ax" text-anchor="middle">${esc(ex.rotulo)}</text>`;
  if (ey.rotulo) s += `<text class="ch-ax" text-anchor="middle" transform="translate(11,${r1(T + ph / 2)}) rotate(-90)">${esc(ey.rotulo)}</text>`;
  const ord = pts.map((p, i) => ({ ...p, i })).sort((a, b) => (b.r || 0) - (a.r || 0));
  const usados = [];
  ord.forEach(p => {
    const x = r1(X(p.x)), y = r1(Y(p.y)), rr = r1(RAD(p)); const cor = p.cor || EST[p.estado] || 'var(--c1)';
    const tip = `${p.rotulo || ''}\n${ex.rotulo || 'x'}: ${fx.tip(p.x)}\n${ey.rotulo || 'y'}: ${fy.tip(p.y)}${p.extra ? '\n' + p.extra : ''}`;
    const el = `<circle cx="${x}" cy="${y}" r="${rr}" class="ch-pt${p.estado === 'err' ? ' err' : ''}" style="--k:${cor}"/>`;
    s += p.href ? `<a href="${esc(p.href)}" class="ch-pa" data-tip="${esc(tip)}">${el}</a>` : `<g class="ch-pa" data-tip="${esc(tip)}" tabindex="0">${el}</g>`;
  });
  if (o.rotulosPontos !== false && pts.length <= 16) {
    ord.forEach(p => {
      if (!p.rotulo) return; const x = X(p.x), y = Y(p.y), rr = RAD(p); const tw = p.rotulo.length * 6.2;
      let lx = x + rr + 4, anc = 'start'; if (lx + tw > W - R) { lx = x - rr - 4; anc = 'end'; }
      const box = anc === 'start' ? [lx, y - 6, lx + tw, y + 6] : [lx - tw, y - 6, lx, y + 6];
      if (usados.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return;
      usados.push(box);
      s += `<text x="${r1(lx)}" y="${r1(y + 4)}" class="ch-t pl" text-anchor="${anc}">${esc(p.rotulo)}</text>`;
    });
  }
  s += '</svg>';
  const est = [...new Set(pts.map(p => p.estado).filter(Boolean))];
  const nomesE = { ok: 'Saudável', warn: 'Atenção', err: 'Em risco', off: 'Inativo' };
  return s + (o.legenda !== false && est.length ? legendaHtml(['ok', 'warn', 'err', 'off'].filter(e => est.includes(e)).map(e => ({ nome: (o.legendaEstados || nomesE)[e], cor: EST[e], forma: 'dot' }))) : '');
}

/* ---------- rosca ---------- */
/** rosca({fatias:[{rotulo, valor, cor}], centro:{valor, rotulo}, formato, tamanho=168}) */
export function rosca(o = {}) {
  const f = F(o.formato); const fat = (o.fatias || []).map((x, i) => ({ ...x, cor: x.cor || CORES[i % 6] }));
  const tot = fat.reduce((a, x) => a + (x.valor || 0), 0) || 1;
  const S = o.tamanho || 168, cx = S / 2, R = S / 2 - 4, r = R - (o.espessura || 20);
  let a0 = -Math.PI / 2, s = `<div class="ch-rosca"><svg class="chart" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="${esc(o.rotulo || `Rosca: ${fat.map(x => `${x.rotulo} ${pct((x.valor / tot) * 100, 0)}`).join(', ')}`)}">`;
  const gap = fat.length > 1 ? 0.025 : 0;
  fat.forEach(x => {
    const ang = (x.valor / tot) * Math.PI * 2; const a1 = a0 + ang;
    const s0 = a0 + gap / 2, s1 = Math.max(s0 + 0.001, a1 - gap / 2), large = s1 - s0 > Math.PI ? 1 : 0;
    const P = (rad, a) => `${r1(cx + rad * Math.cos(a))},${r1(cx + rad * Math.sin(a))}`;
    const d = ang >= Math.PI * 2 - 0.001 ? `M${cx - R},${cx}a${R},${R} 0 1,0 ${2 * R},0a${R},${R} 0 1,0 -${2 * R},0M${cx - r},${cx}a${r},${r} 0 1,1 ${2 * r},0a${r},${r} 0 1,1 -${2 * r},0Z` : `M${P(R, s0)}A${R},${R} 0 ${large} 1 ${P(R, s1)}L${P(r, s1)}A${r},${r} 0 ${large} 0 ${P(r, s0)}Z`;
    s += `<path d="${d}" style="fill:${x.cor}" class="rs-f" fill-rule="evenodd" data-tip="${esc(`${x.rotulo}\n${f.tip(x.valor)} · ${pct((x.valor / tot) * 100, 1)}`)}"/>`;
    a0 = a1;
  });
  if (o.centro) s += `<text x="${cx}" y="${cx + 2}" class="rs-v" text-anchor="middle">${esc(o.centro.valor)}</text><text x="${cx}" y="${cx + 20}" class="rs-l" text-anchor="middle">${esc(o.centro.rotulo || '')}</text>`;
  s += `</svg><ul class="rs-leg">${fat.map(x => `<li><i style="--k:${x.cor}"></i><span>${esc(x.rotulo)}</span><b class="num">${esc(o.legendaValor === 'valor' ? f.tip(x.valor) : pct((x.valor / tot) * 100, 0))}</b></li>`).join('')}</ul></div>`;
  return s;
}

/* ---------- funil ---------- */
/** funil({etapas:[{rotulo, valor, bench}], formato}) — barras decrescentes com conversão entre etapas */
export function funil(o = {}) { return wrap(buildFunil, o, 640, 'funil'); }
function buildFunil(o, W) {
  const f = F(o.formato); const et = o.etapas || []; if (!et.length) return '';
  const mx = Math.max(...et.map(e => e.valor)) || 1;
  const largo = W >= 460;
  const rowH = largo ? 40 : 46, H = et.length * rowH;
  const lw = largo ? Math.min(180, Math.max(...et.map(e => e.rotulo.length)) * 6.8 + 16) : 0;
  const R = largo ? 120 : 0, L = lw, pw = W - L - R;
  let s = svgOpen(W, H, o.rotulo || `Funil: ${et.map(e => `${e.rotulo} ${f.tip(e.valor)}`).join(', ')}`);
  et.forEach((e, i) => {
    const y = i * rowH, w = Math.max(3, (e.valor / mx) * pw);
    const conv = i ? (e.valor / (et[i - 1].valor || 1)) * 100 : null;
    const tip = `${e.rotulo}\n${f.tip(e.valor)}${conv != null ? `\nConversão da etapa anterior: ${pct(conv, 1)}` : ''}${e.bench ? `\nReferência: ${e.bench}` : ''}\n${pct((e.valor / mx) * 100, 1)} do topo`;
    const bh = 12, by = largo ? y + (rowH - bh) / 2 : y + 24;
    s += `<g class="hb" data-tip="${esc(tip)}"><rect x="0" y="${y}" width="${W}" height="${rowH}" class="hc-r"/>`;
    if (largo) {
      s += `<text x="${L - 12}" y="${y + rowH / 2 + 4}" class="ch-t lbl" text-anchor="end">${esc(e.rotulo)}</text>`;
      s += `<text x="${W - R + 12}" y="${y + rowH / 2 + 4}" class="ch-t v">${esc(f.eixo(e.valor))}</text>`;
      if (conv != null) s += `<text x="${W - 4}" y="${y + rowH / 2 + 4}" class="ch-t" text-anchor="end">${esc(pct(conv, 1))}</text>`;
    } else {
      s += `<text x="0" y="${y + 16}" class="ch-t lbl">${esc(e.rotulo)}</text><text x="${W}" y="${y + 16}" class="ch-t v" text-anchor="end">${esc(f.eixo(e.valor))}${conv != null ? ` · ${esc(pct(conv, 1))}` : ''}</text>`;
    }
    s += `<rect x="${L}" y="${r1(by)}" width="${r1(pw)}" height="${bh}" rx="3" class="ch-trk"/><rect x="${L}" y="${r1(by)}" width="${r1(w)}" height="${bh}" rx="3" class="fn-b" style="--k:var(--c1)"/></g>`;
  });
  return s + '</svg>' + (largo ? '' : '') ;
}

/* ---------- calor ---------- */
/** calor({linhas, colunas, valores:[[...]], formato, faixas:'ocupacao'|[{ate,estado}], min, max}) */
export function calor(o = {}) { return wrap(buildCalor, o, 640, 'calor'); }
function buildCalor(o, W) {
  const f = F(o.formato); const ln = o.linhas || [], co = o.colunas || [], v = o.valores || [];
  const flat = v.flat().filter(x => x != null); if (!flat.length) return '';
  const mn = o.min ?? Math.min(...flat), mx = o.max ?? Math.max(...flat);
  const lw = Math.min(W * 0.34, Math.max(...ln.map(x => String(x).length)) * 6.8 + 14), T = 22, ch = o.celula || 30;
  const cw = (W - lw) / co.length, H = T + ln.length * ch + 2;
  const faixas = typeof o.faixas === 'string' ? FAIXAS[o.faixas] : o.faixas;
  const cor = x => {
    if (faixas) { const z = Array.isArray(faixas[0]) ? faixas.find(([ate]) => x < ate) : faixas.find(z => x <= z.ate); const e = z ? (Array.isArray(z) ? z[1] : z.estado) : 'off'; return { fill: EST[e], op: { info: 0.3, ok: 0.5, warn: 0.75, err: 0.85 }[e] ?? 0.6 }; }
    const t = mx === mn ? 0.5 : (x - mn) / (mx - mn); return { fill: 'var(--c1)', op: r1(0.12 + t * 0.78) };
  };
  let s = svgOpen(W, H, o.rotulo || `Mapa de calor: ${ln.length} linhas × ${co.length} colunas`);
  const passo = Math.max(1, Math.ceil(co.length / Math.max(2, Math.floor((W - lw) / 40))));
  co.forEach((c, j) => { if (j % passo === 0) s += `<text x="${r1(lw + cw * j + cw / 2)}" y="14" class="ch-t" text-anchor="middle">${esc(c)}</text>`; });
  ln.forEach((l, i) => {
    s += `<text x="${r1(lw - 10)}" y="${T + i * ch + ch / 2 + 4}" class="ch-t lbl" text-anchor="end">${esc(l)}</text>`;
    co.forEach((c, j) => {
      const x = (v[i] || [])[j]; if (x == null) { s += `<rect x="${r1(lw + cw * j + 1.5)}" y="${T + i * ch + 1.5}" width="${r1(cw - 3)}" height="${ch - 3}" rx="4" class="ch-trk"/>`; return; }
      const k = cor(x);
      s += `<g data-tip="${esc(`${l} · ${c}\n${f.tip(x)}`)}" class="hm"><rect x="${r1(lw + cw * j + 1.5)}" y="${T + i * ch + 1.5}" width="${r1(cw - 3)}" height="${ch - 3}" rx="4" style="fill:${k.fill};fill-opacity:${k.op}"/>${cw > 38 && o.valoresCelula !== false ? `<text x="${r1(lw + cw * j + cw / 2)}" y="${T + i * ch + ch / 2 + 4}" class="hm-t${k.op > 0.7 ? ' inv' : ''}" text-anchor="middle">${esc(f.eixo(x))}</text>` : ''}</g>`;
    });
  });
  return s + '</svg>';
}

/* ---------- gauge ---------- */
/** gauge(valor, {max=100, faixas:[{ate, estado}]|'health', rotulo, sub, tamanho=200}) */
export function gauge(valor, o = {}) {
  const max = o.max || 100, S = o.tamanho || 200, cx = S / 2, cy = S / 2 + 6, R = S / 2 - 12, th = 14;
  const fx = o.faixas === 'health' || !o.faixas ? FAIXAS.health : o.faixas;
  const est = (fx.find(z => valor <= z.ate) || {}).estado || 'ok';
  const A = v => Math.PI + (Math.min(max, Math.max(0, v)) / max) * Math.PI;
  const P = (a, rad = R) => `${r1(cx + rad * Math.cos(a))},${r1(cy + rad * Math.sin(a))}`;
  const arc = (v0, v1, cls, sty = '') => `<path d="M${P(A(v0))}A${R},${R} 0 0 1 ${P(A(v1))}" class="${cls}" style="stroke-width:${th};${sty}"/>`;
  let s = `<div class="ch-gauge"><svg class="chart" viewBox="0 0 ${S} ${S / 2 + 22}" width="100%" style="max-width:${S}px" role="img" aria-label="${esc(`${o.rotulo || 'Indicador'}: ${valor} de ${max}`)}">`;
  s += arc(0, max, 'gg-t');
  let prev = 0; fx.forEach(z => { const ate = Math.min(max, z.ate); if (ate > prev) s += `<path d="M${P(A(prev), R + th / 2 + 4)}A${R + th / 2 + 4},${R + th / 2 + 4} 0 0 1 ${P(A(ate), R + th / 2 + 4)}" class="gg-z" style="stroke:${EST[z.estado]}"/>`; prev = ate; });
  s += arc(0, Math.max(0.5, valor), 'gg-v', `stroke:${EST[est]}`);
  s += `<text x="${cx}" y="${cy - 8}" class="gg-n" text-anchor="middle">${esc(o.texto ?? num(valor))}</text><text x="${cx}" y="${cy + 12}" class="gg-l" text-anchor="middle">${esc(o.sub || `de ${max}`)}</text></svg></div>`;
  return s;
}

/* ---------- cascata ---------- */
/** cascata({passos:[{rotulo, valor, tipo:'base'|'mais'|'menos'|'total'}], formato, altura}) */
export function cascata(o = {}) { return wrap(buildCascata, o, 640, 'cascata'); }
function buildCascata(o, W) {
  const f = F(o.formato); const ps = o.passos || []; if (!ps.length) return '';
  const H = o.altura || 240; let acc = 0; const bars = [];
  ps.forEach(p => {
    if (p.tipo === 'base' || p.tipo === 'total') { const v = p.tipo === 'total' && p.valor == null ? acc : p.valor; bars.push({ ...p, y0: 0, y1: v, v }); acc = v; }
    else { const d = p.tipo === 'menos' ? -Math.abs(p.valor) : Math.abs(p.valor); bars.push({ ...p, y0: acc, y1: acc + d, v: d }); acc += d; }
  });
  const vals = bars.flatMap(b => [b.y0, b.y1]); const mx0 = Math.max(...vals), mnRaw = Math.min(...vals);
  const tk = ticks(Math.min(0, mnRaw), mx0 * 1.06, 4); const mn = tk[0], mx = tk[tk.length - 1];
  const L = Math.max(34, Math.max(...tk.map(t => f.eixo(t).length)) * 6.6 + 10), R = 22, T = f.un ? 26 : 18, B = 34, pw = W - L - R, ph = H - T - B;
  const Y = v => T + ph - ((v - mn) / (mx - mn)) * ph; const gw = pw / bars.length, bw = Math.min(46, gw * 0.62);
  const apertado = bars.some(b => Math.max(...String(b.rotulo).split(' ').map(w => w.length)) * 6.2 > gw - 4);
  let s = svgOpen(W, H, o.rotulo || `Cascata: ${ps.map(p => `${p.rotulo} ${f.tip(p.valor)}`).join(', ')}`);
  if (f.un) s += `<text x="${L - 8}" y="10" class="ch-u" text-anchor="end">${esc(f.un)}</text>`;
  tk.forEach(t => { s += `<line x1="${L}" x2="${W - R}" y1="${r1(Y(t))}" y2="${r1(Y(t))}" class="ch-g${t === 0 ? ' z' : ''}"/><text x="${L - 8}" y="${r1(Y(t)) + 4}" class="ch-t" text-anchor="end">${esc(f.eixo(t))}</text>`; });
  bars.forEach((b, i) => {
    const cx = L + gw * i + gw / 2, top = Y(Math.max(b.y0, b.y1)), h = Math.abs(Y(b.y0) - Y(b.y1));
    const cor = b.tipo === 'mais' ? 'var(--ok)' : b.tipo === 'menos' ? 'var(--neg)' : b.tipo === 'base' ? 'var(--c2n)' : 'var(--c1)';
    const sinal = b.tipo === 'mais' ? '+' : b.tipo === 'menos' ? '−' : '';
    s += `<g class="hb" data-tip="${esc(`${b.rotulo}\n${sinal}${f.tip(Math.abs(b.v))}`)}"><rect x="${r1(L + gw * i)}" y="${T}" width="${r1(gw)}" height="${ph}" class="hc-r"/><rect x="${r1(cx - bw / 2)}" y="${r1(top)}" width="${r1(bw)}" height="${r1(Math.max(1, h))}" rx="3" style="fill:${cor}" class="bar-r"/>`;
    s += `<text x="${r1(cx)}" y="${r1(top - 6)}" class="ch-t v" text-anchor="middle">${esc(sinal + f.eixo(Math.abs(b.v)))}</text>`;
    const lb = String(b.rotulo);
    if (apertado) s += `<text x="${r1(cx)}" y="${i % 2 ? H - 5 : H - 18}" class="ch-t" text-anchor="middle">${esc(lb)}</text></g>`;
    else { const words = lb.split(' '); const dois = lb.length * 6.2 > gw && words.length > 1; const l1 = dois ? words.slice(0, Math.ceil(words.length / 2)).join(' ') : lb, l2 = dois ? words.slice(Math.ceil(words.length / 2)).join(' ') : '';
      s += `<text x="${r1(cx)}" y="${H - 18}" class="ch-t" text-anchor="middle">${esc(l1)}</text>${l2 ? `<text x="${r1(cx)}" y="${H - 5}" class="ch-t" text-anchor="middle">${esc(l2)}</text>` : ''}</g>`; }
    if (i < bars.length - 1) { const nx = L + gw * (i + 1) + gw / 2 - bw / 2; s += `<line x1="${r1(cx + bw / 2)}" x2="${r1(nx)}" y1="${r1(Y(b.y1))}" y2="${r1(Y(b.y1))}" class="ch-cn"/>`; }
  });
  return s + '</svg>';
}

/* ---------- histórico 30 dias ---------- */
/** historico30(estados[] | [{estado, rotulo}], {rotulos, inicio:Date}) — 30 quadradinhos (mais antigo → mais recente) */
export function historico30(estados = [], o = {}) {
  const nomes = { ok: 'Operando', warn: 'Atenção', err: 'Falhou', off: 'Pausada' };
  const it = estados.slice(-30).map(x => (typeof x === 'string' ? { estado: x } : x));
  const hoje = o.fim ? new Date(o.fim) : new Date();
  const lbl = `Histórico de ${it.length} dias: ${['ok', 'warn', 'err', 'off'].map(e => `${it.filter(x => x.estado === e).length} ${nomes[e].toLowerCase()}`).join(', ')}`;
  return `<div class="h30" role="img" aria-label="${esc(lbl)}">${it.map((x, i) => {
    const d = new Date(hoje); d.setDate(d.getDate() - (it.length - 1 - i));
    const r = x.rotulo || `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `<i class="h30-c s-${x.estado || 'off'}" data-tip="${esc(`${r}\n${nomes[x.estado] || x.estado}${x.texto ? ' · ' + x.texto : ''}`)}"></i>`;
  }).join('')}</div>`;
}

/* ---------- tooltip compartilhado ---------- */
let tipEl = null; const ativos = new WeakSet();
function tip() { if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tipbox'; tipEl.setAttribute('role', 'tooltip'); tipEl.id = 'aos-tip'; document.body.appendChild(tipEl); } return tipEl; }
function mostrar(alvo, x, y) {
  const t = tip(); const txt = alvo.getAttribute('data-tip') || ''; const ls = txt.split('\n');
  t.innerHTML = ls.length > 1 ? `<b>${esc(ls[0])}</b>${ls.slice(1).map(l => `<span>${esc(l)}</span>`).join('')}` : `<span>${esc(txt)}</span>`;
  t.classList.add('on');
  const w = t.offsetWidth, h = t.offsetHeight, vw = document.documentElement.clientWidth;
  let left = x + 14, top = y - h - 12;
  if (left + w > vw - 8) left = x - w - 14; if (left < 8) left = 8; if (top < 8) top = y + 18;
  t.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
}
function esconder() { if (tipEl) tipEl.classList.remove('on'); }
/** ativa o tooltip delegado em root (idempotente) */
export function ativarTooltips(root = document.body) {
  if (ativos.has(root)) return; ativos.add(root);
  let atual = null;
  root.addEventListener('mousemove', e => {
    const a = e.target.closest && e.target.closest('[data-tip]');
    if (!a) { if (atual) { atual = null; esconder(); } return; }
    atual = a; mostrar(a, e.clientX, e.clientY);
  });
  root.addEventListener('mouseleave', () => { atual = null; esconder(); });
  root.addEventListener('focusin', e => { const a = e.target.closest && e.target.closest('[data-tip]'); if (a) { const r = a.getBoundingClientRect(); mostrar(a, r.left + r.width / 2, r.top); } });
  root.addEventListener('focusout', esconder);
  root.addEventListener('click', e => { const a = e.target.closest && e.target.closest('.hlp[data-tip]'); if (a) { e.preventDefault(); const r = a.getBoundingClientRect(); mostrar(a, r.left + r.width / 2, r.top); } });
  window.addEventListener('scroll', esconder, { passive: true, capture: true });
}

/** redesenha os gráficos na largura real dos contêineres; remove registros órfãos */
export function hidratar(root = document) {
  root.querySelectorAll('.chw[data-chart]').forEach(el => {
    const r = reg.get(el.dataset.chart); if (!r) return;
    const w = Math.floor(el.clientWidth); if (!w) return;
    if (Math.abs(w - Number(el.dataset.w)) > 4) { el.dataset.w = w; el.innerHTML = r.build(r.opts, w); }
  });
  if (reg.size > 400) { const vivos = new Set(Array.from(document.querySelectorAll('.chw[data-chart]')).map(e => e.dataset.chart)); for (const k of reg.keys()) if (!vivos.has(k)) reg.delete(k); }
}
let rz = null;
if (typeof window !== 'undefined') window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => hidratar(document), 120); });

export const charts = { spark, linhas, barras, dispersao, rosca, funil, calor, gauge, cascata, historico30, ativarTooltips, hidratar, CORES, EST };
_setCharts({ spark });
export default charts;
