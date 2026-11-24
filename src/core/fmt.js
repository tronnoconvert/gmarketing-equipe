// fmt.js — formatação pt-BR (R$, datas dd/mm/aaaa, números). Funções puras.
const nf = (min, max) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
const N0 = nf(0, 0), N1 = nf(1, 1), N2 = nf(2, 2);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const ok = v => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));
const sinal = v => (v < 0 ? '−' : '');

/** "R$ 1.234" (sem centavos) */
export function brl(v) { if (!ok(v)) return '—'; v = Number(v); return `${sinal(v)}R$ ${N0.format(Math.abs(Math.round(v)))}`; }
/** "R$ 1.234,56" */
export function brl2(v) { if (!ok(v)) return '—'; v = Number(v); return `${sinal(v)}R$ ${N2.format(Math.abs(v))}`; }
/** "R$ 186,4 mil" | short: "R$ 14,2k" | milhões: "R$ 1,2 mi" */
export function brlK(v, o = {}) {
  if (!ok(v)) return '—'; v = Number(v); const a = Math.abs(v), s = sinal(v);
  if (a >= 1e6) return `${s}R$ ${N1.format(a / 1e6)}${o.short ? 'mi' : ' mi'}`;
  if (a >= 1000) return `${s}R$ ${(a >= 1e5 && !o.short ? nf(0, 1) : N1).format(a / 1000)}${o.short ? 'k' : ' mil'}`;
  return `${s}R$ ${N0.format(a)}`;
}
/** "27,4%" */
export function pct(v, d = 1) { if (!ok(v)) return '—'; return `${nf(0, d).format(Number(v))}%`; }
/** "1,1 pp" */
export function pp(v, d = 1) { if (!ok(v)) return '—'; return `${nf(0, d).format(Number(v))} pp`; }
/** "1.234" */
export function num(v) { if (!ok(v)) return '—'; return N0.format(Number(v)); }
/** número com d casas: dec(1.8,1) "1,8" */
export function dec(v, d = 1) { if (!ok(v)) return '—'; return nf(d, d).format(Number(v)); }
/** compacto: 12.400 -> "12,4 mil"; 1.2e6 -> "1,2 mi" */
export function compacto(v) { if (!ok(v)) return '—'; v = Number(v); const a = Math.abs(v), s = sinal(v);
  if (a >= 1e6) return s + N1.format(a / 1e6) + ' mi'; if (a >= 1e4) return s + nf(0, 1).format(a / 1000) + ' mil'; return s + N0.format(a); }

export function toDate(d) {
  if (d instanceof Date) return d;
  if (d === null || d === undefined || d === '') return null;
  if (typeof d === 'number') return new Date(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { const [dd, m, y] = d.split('/').map(Number); return new Date(y, m - 1, dd); }
  const x = new Date(d); return Number.isNaN(x.getTime()) ? null : x;
}
const p2 = n => String(n).padStart(2, '0');
/** "24/11/2026" */
export function data(d) { d = toDate(d); return d ? `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` : '—'; }
/** "24/nov" */
export function dataCurta(d) { d = toDate(d); return d ? `${p2(d.getDate())}/${MESES[d.getMonth()]}` : '—'; }
/** "nov/2026" */
export function mesAno(d) { d = toDate(d); return d ? `${MESES[d.getMonth()]}/${d.getFullYear()}` : '—'; }
/** "novembro" */
export function mesLongo(d) { d = toDate(d); return d ? MESES_LONGOS[d.getMonth()] : '—'; }
/** "seg" */
export function diaSemana(d) { d = toDate(d); return d ? DIAS[d.getDay()] : '—'; }
/** "23:42" */
export function hora(d) { d = toDate(d); return d ? `${p2(d.getHours())}:${p2(d.getMinutes())}` : '—'; }
/** "24/11/2026 23:42" */
export function dataHora(d) { d = toDate(d); return d ? `${data(d)} ${hora(d)}` : '—'; }
/** ISO yyyy-mm-dd (data local) */
export function iso(d) { d = toDate(d); return d ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : ''; }
/** "há 4 min" / "em 18 min" / "agora" / "ontem" / "há 3 dias" */
export function rel(d, agora = Date.now()) {
  d = toDate(d); if (!d) return '—';
  const diff = (d.getTime() - agora) / 1000, a = Math.abs(diff), fut = diff > 0;
  const f = t => (fut ? `em ${t}` : `há ${t}`);
  if (a < 10) return 'agora';
  if (a < 60) return f(`${Math.round(a)} s`);
  if (a < 3600) return f(`${Math.round(a / 60)} min`);
  if (a < 86400) return f(`${Math.round(a / 3600)} h`);
  const dias = Math.round(a / 86400);
  if (dias === 1) return fut ? 'amanhã' : 'ontem';
  if (dias < 30) return f(`${dias} dias`);
  if (dias < 365) { const m = Math.round(dias / 30); return f(m === 1 ? '1 mês' : `${m} meses`); }
  const y = Math.round(dias / 365); return f(y === 1 ? '1 ano' : `${y} anos`);
}
/** dias entre hoje e d (positivo = futuro) */
export function diasAte(d) { d = toDate(d); if (!d) return null; const h = new Date(); h.setHours(0, 0, 0, 0); const x = new Date(d); x.setHours(0, 0, 0, 0); return Math.round((x - h) / 864e5); }
/** "Gabriel Leão" -> "GL" */
export function iniciais(nome) { if (!nome) return '?'; const p = String(nome).trim().split(/\s+/).filter(w => !/^(da|de|do|das|dos|e)$/i.test(w)); return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
/** primeiro nome */
export function primeiro(nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; }
/** escape HTML — usar SEMPRE em texto vindo de dados */
export function esc(s) { if (s === null || s === undefined) return ''; return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
/** plural simples: plural(2,'cliente') "2 clientes"; plural(1,'alerta crítico','alertas críticos') */
export function plural(n, um, varios) { return `${num(n)} ${n === 1 ? um : (varios || um + 's')}`; }
/** sem acentos/minúsculas — útil para busca */
export function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
/** duração em minutos -> "1 h 20 min" */
export function duracao(min) { if (!ok(min)) return '—'; min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`; }

export const MESES_CURTOS = MESES;
export default { brl, brl2, brlK, pct, pp, num, dec, compacto, data, dataCurta, mesAno, mesLongo, diaSemana, hora, dataHora, iso, rel, diasAte, iniciais, primeiro, esc, plural, norm, duracao, toDate, MESES_CURTOS };
