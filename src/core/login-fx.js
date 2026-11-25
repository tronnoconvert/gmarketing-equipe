// Cena interativa da tela de login: constelação de partículas que reage ao mouse,
// holofote que segue o cursor, parallax dos cartões flutuantes e brilho na borda do card.
// Para sozinha quando a tela de login sai do DOM. Respeita prefers-reduced-motion.

export function iniciarCenaLogin(root) {
  const cena = root.querySelector('.lgn');
  const cv = root.querySelector('.lg-fx');
  if (!cena || !cv || !cv.getContext) return () => {};
  const ctx = cv.getContext('2d');
  const calmo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const CORES = ['61,155,255', '90,180,255', '124,108,255', '38,214,196'];
  let W = 0, H = 0, pts = [], raf = 0, vivo = true;
  const m = { x: -9999, y: -9999, tx: -9999, ty: -9999, dentro: false };
  const ondas = [];

  const medir = () => {
    const r = cena.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.max(40, Math.min(130, Math.round((W * H) / 13000)));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
      r: Math.random() * 1.6 + 0.6, c: CORES[(Math.random() * CORES.length) | 0], f: Math.random() * Math.PI * 2,
    }));
  };

  const LIG = 128, RAIO_M = 190;
  const quadro = t => {
    if (!vivo) return;
    if (!cv.isConnected) { parar(); return; }
    m.x += (m.tx - m.x) * 0.12; m.y += (m.ty - m.y) * 0.12;
    ctx.clearRect(0, 0, W, H);
    for (const p of pts) {
      if (!calmo) {
        const dx = p.x - m.x, dy = p.y - m.y, d2 = dx * dx + dy * dy;
        if (m.dentro && d2 < RAIO_M * RAIO_M) {
          const d = Math.sqrt(d2) || 1, k = (1 - d / RAIO_M) * 0.6;
          p.vx += (dx / d) * k * 0.12; p.vy += (dy / d) * k * 0.12;
        }
        for (const o of ondas) {
          const ex = p.x - o.x, ey = p.y - o.y, ed = Math.sqrt(ex * ex + ey * ey) || 1;
          if (Math.abs(ed - o.r) < 26) { p.vx += (ex / ed) * 0.5 * o.a; p.vy += (ey / ed) * 0.5 * o.a; }
        }
        p.vx *= 0.985; p.vy *= 0.985;
        const v = Math.hypot(p.vx, p.vy);
        if (v < 0.08) { p.vx += (Math.random() - 0.5) * 0.04; p.vy += (Math.random() - 0.5) * 0.04; }
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
      }
    }
    // ligações entre partículas
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < LIG * LIG) {
          const al = (1 - Math.sqrt(d2) / LIG) * 0.3;
          ctx.strokeStyle = `rgba(${a.c},${al})`; ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    // ligações com o cursor
    if (m.dentro) {
      for (const p of pts) {
        const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
        if (d < RAIO_M * 1.25) {
          const al = (1 - d / (RAIO_M * 1.25)) * 0.75;
          ctx.strokeStyle = `rgba(120,190,255,${al})`; ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
      }
    }
    // pontos
    for (const p of pts) {
      const pulso = calmo ? 1 : 0.75 + Math.sin(t / 900 + p.f) * 0.25;
      ctx.fillStyle = `rgba(${p.c},${0.85 * pulso})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    // ondas de clique
    for (let i = ondas.length - 1; i >= 0; i--) {
      const o = ondas[i]; o.r += 6; o.a *= 0.955;
      ctx.strokeStyle = `rgba(120,190,255,${o.a * 0.6})`; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.stroke();
      if (o.a < 0.03) ondas.splice(i, 1);
    }
    if (!calmo) raf = requestAnimationFrame(quadro);
  };

  const flutuantes = [...cena.querySelectorAll('[data-prof]')];
  const card = cena.querySelector('.lg-card');
  const mover = e => {
    const r = cena.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    m.tx = x; m.ty = y; m.dentro = true;
    if (m.x < -1000) { m.x = x; m.y = y; }
    cena.style.setProperty('--mx', x + 'px'); cena.style.setProperty('--my', y + 'px');
    if (calmo) return;
    const nx = x / W - 0.5, ny = y / H - 0.5;
    for (const el of flutuantes) {
      const k = +el.dataset.prof || 10;
      el.style.transform = `translate3d(${(-nx * k).toFixed(1)}px,${(-ny * k).toFixed(1)}px,0)`;
    }
    if (card) {
      const c = card.getBoundingClientRect();
      card.style.setProperty('--cx', (e.clientX - c.left) + 'px');
      card.style.setProperty('--cy', (e.clientY - c.top) + 'px');
    }
  };
  const sair = () => { m.dentro = false; m.tx = m.ty = -9999; };
  const clicar = e => {
    if (calmo || e.target.closest('.lg-card')) return;
    const r = cena.getBoundingClientRect();
    ondas.push({ x: e.clientX - r.left, y: e.clientY - r.top, r: 4, a: 1 });
  };
  let tm = 0;
  const redim = () => { clearTimeout(tm); tm = setTimeout(() => { medir(); if (calmo) quadro(0); }, 120); };

  cena.addEventListener('pointermove', mover);
  cena.addEventListener('pointerleave', sair);
  cena.addEventListener('pointerdown', clicar);
  window.addEventListener('resize', redim);
  const parar = () => {
    vivo = false; cancelAnimationFrame(raf); clearTimeout(tm);
    window.removeEventListener('resize', redim);
  };
  medir();
  if (calmo) quadro(0); else raf = requestAnimationFrame(quadro);
  return parar;
}
