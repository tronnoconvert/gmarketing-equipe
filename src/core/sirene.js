// sirene.js — sirene de "POSSÍVEL INVASÃO" (Guardião de segurança). Som sintetizado com WebAudio (sem arquivo de áudio):
// dois tons alternados (960 Hz / 640 Hz, onda dente-de-serra filtrada), alto, ~3,2 s por toque, repetido a cada ~10 s
// até alguém assumir o incidente (parar()) ou a pessoa silenciar neste aparelho (silenciar()).
// Autoplay: navegadores só liberam áudio depois de um gesto do usuário. instalarDesbloqueio() (chamado no boot/login)
// retoma o AudioContext no primeiro clique/tecla/toque. Se a sirene for pedida antes disso, ela fica "pendente" e
// começa sozinha no primeiro gesto (o banner vermelho aparece de qualquer jeito).
// Módulo independente: não importa nada do core. Expõe window.AOS_SIRENE para testes (estado()).

const CFG = { tomA: 960, tomB: 640, meioCiclo: 0.4, duracao: 3.2, intervaloMs: 10000, volume: 0.32 };

let ctx = null;            // AudioContext (criado sob demanda)
let timer = null;          // setInterval da repetição
let ativa = false;         // a sirene foi pedida (incidente aberto)
let silenciadaLocal = false; // a pessoa silenciou neste aparelho (só para o incidente atual)
let chaveAtual = null;     // id do incidente que está tocando
let toques = 0;            // quantos toques já soaram (testes)
let ultimoToque = null;    // ISO do último toque
let pendente = false;      // pedida antes do desbloqueio do áudio
let fontes = [];           // nós em execução (para cortar na hora)
let desbloqueioInstalado = false;

function contexto() {
  if (ctx) return ctx;
  // um só AudioContext no app: o mesmo do aviso sonoro (som.js), destravado no primeiro gesto
  if (typeof window !== 'undefined' && window.__aosAudioCtx) { ctx = window.__aosAudioCtx; return ctx; }
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try { ctx = new AC(); window.__aosAudioCtx = ctx; } catch (e) { ctx = null; }
  return ctx;
}
const bloqueado = () => { const c = contexto(); return !c || c.state !== 'running'; };

/** um toque: tons alternados com envelope (sem estalo), passa-baixa para não ficar estridente demais */
function tocarUmaVez() {
  const c = contexto();
  toques++; ultimoToque = new Date().toISOString();
  if (!c || c.state !== 'running') { pendente = true; return false; }
  const t0 = c.currentTime + 0.02, fim = t0 + CFG.duracao;
  const osc = c.createOscillator(); const osc2 = c.createOscillator();
  const filtro = c.createBiquadFilter(); const ganho = c.createGain();
  osc.type = 'sawtooth'; osc2.type = 'square';
  filtro.type = 'lowpass'; filtro.frequency.value = 2600; filtro.Q.value = 0.8;
  for (let t = t0, i = 0; t < fim; t += CFG.meioCiclo, i++) {
    const f = i % 2 ? CFG.tomB : CFG.tomA;
    osc.frequency.setValueAtTime(f, t); osc2.frequency.setValueAtTime(f / 2, t);
  }
  ganho.gain.setValueAtTime(0.0001, t0);
  ganho.gain.exponentialRampToValueAtTime(CFG.volume, t0 + 0.06);
  ganho.gain.setValueAtTime(CFG.volume, fim - 0.12);
  ganho.gain.exponentialRampToValueAtTime(0.0001, fim);
  const g2 = c.createGain(); g2.gain.value = 0.35;
  osc.connect(filtro); osc2.connect(g2); g2.connect(filtro); filtro.connect(ganho); ganho.connect(c.destination);
  osc.start(t0); osc2.start(t0); osc.stop(fim + 0.02); osc2.stop(fim + 0.02);
  fontes = [osc, osc2];
  osc.onended = () => { fontes = fontes.filter(x => x !== osc && x !== osc2); };
  pendente = false;
  return true;
}
function cortar() { fontes.forEach(o => { try { o.stop(); } catch (e) { /* já parou */ } }); fontes = []; }

export const sirene = {
  CFG,
  /** começa a tocar (e repetir) para o incidente `chave`. Chamar de novo com a mesma chave não duplica. */
  tocar(chave = 'incidente', { intervaloMs = CFG.intervaloMs } = {}) {
    if (chaveAtual !== chave) silenciadaLocal = false; // incidente novo (ou reincidência com outra chave) volta a tocar
    chaveAtual = chave; ativa = true;
    if (silenciadaLocal) return sirene.estado();
    if (!timer) {
      tocarUmaVez();
      timer = setInterval(() => { if (ativa && !silenciadaLocal) tocarUmaVez(); }, intervaloMs);
    }
    return sirene.estado();
  },
  /** para de vez (incidente assumido por alguém / encerrado) */
  parar() { ativa = false; pendente = false; chaveAtual = null; if (timer) clearInterval(timer); timer = null; cortar(); return sirene.estado(); },
  /** silencia só neste aparelho; o banner continua até alguém assumir. Uma reincidência (nova chave) toca de novo. */
  silenciar() { silenciadaLocal = true; pendente = false; if (timer) clearInterval(timer); timer = null; cortar(); return sirene.estado(); },
  /** toque curto de teste (Administração/Alertas: "Testar sirene") */
  testar() { const c = contexto(); if (c && c.state === 'suspended') c.resume().catch(() => {}); return tocarUmaVez(); },
  /** retoma o áudio (precisa ser chamado dentro de um gesto do usuário) */
  desbloquear() {
    const c = contexto(); if (!c) return Promise.resolve(false);
    const p = c.state === 'suspended' ? c.resume() : Promise.resolve();
    return p.then(() => { if (pendente && ativa && !silenciadaLocal) tocarUmaVez(); return c.state === 'running'; }).catch(() => false);
  },
  /** instala o desbloqueio no primeiro gesto (clique, tecla, toque) — chame uma vez após o login */
  instalarDesbloqueio() {
    if (desbloqueioInstalado || typeof window === 'undefined') return;
    desbloqueioInstalado = true;
    const ev = ['pointerdown', 'keydown', 'touchstart'];
    const fn = () => { sirene.desbloquear().then(ok => { if (ok) ev.forEach(e => window.removeEventListener(e, fn, true)); }); };
    ev.forEach(e => window.addEventListener(e, fn, true));
  },
  estado() { return { ativa, tocando: ativa && !silenciadaLocal && !!timer, silenciadaLocal, chave: chaveAtual, toques, ultimoToque, pendente, bloqueado: bloqueado() }; },
};
if (typeof window !== 'undefined') window.AOS_SIRENE = sirene;
export default sirene;
