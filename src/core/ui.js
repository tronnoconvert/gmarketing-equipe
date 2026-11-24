// ui.js — componentes. Funções que retornam strings HTML + imperativos (modal, drawer, toast, popover, form).
// Regra: todo texto vindo de dados passa por esc(). Os componentes já escapam os campos de texto que recebem,
// exceto os campos "corpo"/"acoes"/"r(row)" que são HTML por definição.
import { esc, iniciais, rel as relFmt, dataHora, brl2, pct as pctFmt } from './fmt.js';
import { svgIc } from './icons.js';
import { db } from './store.js';
import { router } from './router.js';
import { padrao } from './padroes/index.js';

const E = { ok: 'ok', warn: 'warn', err: 'err', off: 'off', bad: 'err', erro: 'err', critico: 'err', crit: 'err', atencao: 'warn', aten: 'warn', pausada: 'off', pausado: 'off', info: 'info', acc: 'acc' };
const ROT = { ok: 'Operando', warn: 'Atenção', err: 'Falhou', off: 'Pausada', info: 'Info', acc: '' };
export const normEstado = e => E[String(e || 'off').toLowerCase()] || 'off';
const attrs = a => (!a ? '' : typeof a === 'string' ? ' ' + a : Object.entries(a).filter(([, v]) => v !== false && v != null).map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`)).join(''));
let uid = 0;
export const novoId = (p = 'u') => `${p}-${(++uid).toString(36)}`;

/* ---------------- básicos ---------------- */
export function ic(nome, cls) { return svgIc(nome, cls); }

/** LED: led('err') | led('ok','Operando') | led('warn', false) (só o ponto, com aria-label) */
export function led(estado, rotulo, o = {}) {
  const e = normEstado(estado); const r = rotulo === undefined || rotulo === null ? ROT[e] : rotulo;
  if (rotulo === false) return `<i class="led ${e}" role="img" aria-label="${esc(o.aria || ROT[e])}"${o.title ? ` title="${esc(o.title)}"` : ''}></i>`;
  return `<span class="led-w${o.cls ? ' ' + o.cls : ''}"><i class="led ${e}" aria-hidden="true"></i><span>${esc(r)}</span></span>`;
}
/** Selo modelo "Marcador": ponto colorido + texto, sem caixa */
export function selo(estado, texto, o = {}) {
  const e = normEstado(estado);
  return `<span class="selo s-${e}${o.cls ? ' ' + o.cls : ''}"${o.title ? ` title="${esc(o.title)}"` : ''}><i aria-hidden="true"></i>${esc(texto ?? ROT[e])}</span>`;
}
/** Ícone "?" com tooltip explicando o cálculo */
export function ajuda(texto, o = {}) {
  return `<button type="button" class="hlp${o.cls ? ' ' + o.cls : ''}" data-tip="${esc(texto)}" aria-label="${esc(o.rotulo || 'Como é calculado')}: ${esc(texto)}">${svgIc('help')}</button>`;
}
/** botão: btn({rotulo, icone, tipo:'pri'|'sec'|'ghost'|'perigo'|'link', href, sm, attrs, title, disabled}) */
export function btn(o = {}) {
  if (typeof o === 'string') o = { rotulo: o };
  const cls = ['btn', o.tipo && o.tipo !== 'sec' ? o.tipo : '', o.sm ? 'sm' : '', o.cls || ''].filter(Boolean).join(' ');
  const inner = `${o.icone ? svgIc(o.icone) : ''}${o.rotulo ? `<span>${esc(o.rotulo)}</span>` : ''}${o.iconeDir ? svgIc(o.iconeDir) : ''}`;
  const t = o.title ? ` title="${esc(o.title)}"` : '';
  if (o.href) return `<a class="${cls}" href="${esc(o.href)}"${t}${attrs(o.attrs)}>${inner}</a>`;
  return `<button type="${o.submit ? 'submit' : 'button'}" class="${cls}"${t}${o.disabled ? ' disabled' : ''}${attrs(o.attrs)}>${inner}</button>`;
}
/** botão só com ícone (aria-label obrigatório) */
export function btnIc(icone, rotulo, a, o = {}) {
  return `<button type="button" class="ib${o.cls ? ' ' + o.cls : ''}" aria-label="${esc(rotulo)}" title="${esc(rotulo)}"${attrs(a)}>${svgIc(icone)}${o.badge ? `<span class="ib-badge">${esc(o.badge)}</span>` : ''}</button>`;
}
/** "há 4 min" que se atualiza sozinho a cada 20 s */
export function rel(iso, o = {}) {
  if (!iso) return '—';
  return `<time datetime="${esc(iso)}" data-rel="iso" title="${esc(dataHora(iso))}"${o.prefixo ? ` data-prefixo="${esc(o.prefixo)}"` : ''}>${esc((o.prefixo || '') + relFmt(iso))}</time>`;
}

/* ---------------- delta / kpi ---------------- */
/** delta(texto|número, bom?) — bom: true (verde), false (vermelho), null (neutro), undefined (sobe = bom) */
export function delta(d, bom, o = {}) {
  if (d === undefined || d === null || d === '') return '';
  let s = typeof d === 'number' ? `${d > 0 ? '▲' : d < 0 ? '▼' : ''} ${String(Math.abs(d)).replace('.', ',')}${o.sufixo ?? ''}`.trim() : String(d).trim();
  let dir = 0;
  if (/^(▲|\+|↑)/.test(s)) dir = 1; else if (/^(▼|−|-|↓)/.test(s)) dir = -1;
  if (dir && !/^[▲▼]/.test(s)) s = (dir > 0 ? '▲ ' : '▼ ') + s.replace(/^[+\-−↑↓]\s*/, '');
  const good = bom === null ? null : bom === undefined ? (dir === 0 ? null : dir > 0) : bom;
  const cls = good === null || dir === 0 && bom === undefined ? 'neu' : good ? 'good' : 'bad';
  return `<span class="dl ${cls} num">${esc(s)}</span>`;
}
/** kpi({rotulo, valor, delta, deltaBom, comp, serie, ajuda, alerta, href, led, corSerie, id}) */
export function kpi(o = {}) {
  const { spark } = chartsRef;
  const alerta = !!o.alerta;
  const sp = o.serie && o.serie.length > 1 && spark ? spark(o.serie, { cor: o.corSerie || (alerta ? 'var(--err)' : 'var(--acc)'), area: true, rotulo: o.rotulo, formato: o.formatoSerie }) : '';
  const lnk = o.href ? `<a class="kpi-lnk" href="${esc(o.href)}" aria-label="${esc(`Abrir ${o.rotulo}`)}"></a>` : '';
  const ledH = alerta ? led('err', false, { aria: 'Exige ação' }) : o.led ? led(o.led, false) : '';
  return `<article class="kpi${alerta ? ' alerta' : ''}${o.href ? ' clk' : ''}${o.cls ? ' ' + o.cls : ''}"${o.id ? ` id="${esc(o.id)}"` : ''}>
${lnk}<header class="kpi-h">${ledH}<span class="kpi-l">${esc(o.rotulo)}</span>${o.ajuda ? ajuda(o.ajuda) : ''}</header>
<div class="kpi-v num">${esc(o.valor)}</div>
<div class="kpi-f">${delta(o.delta, o.deltaBom)}${o.comp ? `<span class="kpi-c">${esc(o.comp)}</span>` : ''}</div>
${sp ? `<div class="kpi-s">${sp}</div>` : ''}</article>`;
}
const chartsRef = {}; // preenchido por charts.js (evita import circular)
export function _setCharts(c) { Object.assign(chartsRef, c); }

/* ---------------- containers ---------------- */
/** card({titulo, sub, acoes, corpo, ajuda, cls, id, pad, rodape, icone}) */
export function card(o = {}) {
  const head = o.titulo || o.acoes ? `<header class="card-h"><div class="card-t">${o.icone ? svgIc(o.icone) : ''}<h2>${esc(o.titulo || '')}</h2>${o.ajuda ? ajuda(o.ajuda) : ''}${o.sub ? `<span class="card-sub">${esc(o.sub)}</span>` : ''}</div>${o.acoes ? `<div class="card-a">${o.acoes}</div>` : ''}</header>` : '';
  return `<section class="card${o.pad === false ? ' np' : ''}${o.cls ? ' ' + o.cls : ''}"${o.id ? ` id="${esc(o.id)}"` : ''}>${head}<div class="card-b">${o.corpo ?? ''}</div>${o.rodape ? `<footer class="card-f">${o.rodape}</footer>` : ''}</section>`;
}
/* introdução das páginas: aparece nas 2 primeiras visitas de cada página (por pessoa); depois vira um "i" ao lado do título.
   O shell informa a visita atual com definirIntro({chave, visitas}). */
let introCtx = { chave: '', visitas: 0 };
export const INTRO_VISITAS = 2;
export function definirIntro(c) { introCtx = { chave: '', visitas: 0, ...(c || {}) }; }
const ehIntro = o => {
  if (o.intro === false || o.subHtml) return false;
  if (o.descricao) return true;
  if (o.intro === true) return !!o.sub;
  return typeof o.sub === 'string' && /[.!…]\s*$/.test(o.sub.trim()); // frase completa = texto de introdução; status dinâmico fica sempre visível
};
/** cabeçalho de página: cabecalho({titulo, sub, descricao, intro, acoes, voltar:{href, rotulo}, meta}) */
export function cabecalho(o = {}) {
  const texto = o.descricao || o.sub;
  const intro = texto && ehIntro(o);
  const recolher = intro && introCtx.visitas > INTRO_VISITAS;
  const extra = o.descricao && o.sub && o.sub !== o.descricao ? `<p class="ph-st">${o.subHtml ? o.sub : esc(o.sub)}</p>` : '';
  let sub = '', info = '';
  if (texto) {
    if (recolher) {
      info = `<button type="button" class="hlp ph-i" data-tip="${esc(texto)}" aria-label="Sobre esta página: ${esc(texto)}" aria-describedby="ph-intro">${svgIc('info')}</button>`;
      sub = `<p class="sr" id="ph-intro">${esc(texto)}</p>${extra}`;
    } else sub = `<p${intro ? ' class="ph-d"' : ''}>${o.subHtml && !o.descricao ? o.sub : esc(texto)}</p>${extra}`;
  }
  return `<div class="ph${recolher ? ' ph-rec' : ''}">${o.voltar ? `<a class="ph-back" href="${esc(o.voltar.href)}">${svgIc('chev-left')}${esc(o.voltar.rotulo || 'Voltar')}</a>` : ''}
<div class="ph-row"><div class="ph-t"><div class="ph-tl"><h1>${esc(o.titulo || '')}</h1>${info}</div>${sub}${o.meta ? `<div class="ph-meta">${o.meta}</div>` : ''}</div>${o.acoes ? `<div class="ph-a">${o.acoes}</div>` : ''}</div></div>`;
}
/** estado vazio que ensina o próximo passo: vazio({titulo, texto, acao:{rotulo, href, icone, attrs}, icone, compacto}) */
export function vazio(o = {}) {
  const a = o.acao ? btn({ tipo: 'pri', rotulo: o.acao.rotulo, href: o.acao.href, icone: o.acao.icone, attrs: o.acao.attrs }) : '';
  return `<div class="vz${o.compacto ? ' cmp' : ''}"><span class="vz-i">${svgIc(o.icone || 'inbox')}</span><h3>${esc(o.titulo || 'Nada por aqui')}</h3>${o.texto ? `<p>${esc(o.texto)}</p>` : ''}${a}</div>`;
}
/** aviso inline: aviso({tipo:'info'|'warn'|'err'|'ok', titulo, texto, acao}) */
export function aviso(o = {}) {
  const t = normEstado(o.tipo || 'info');
  const icn = { info: 'info', ok: 'check-circle', warn: 'alert', err: 'alert-circle', off: 'info', acc: 'info' }[t];
  return `<div class="av-box t-${t}" role="${t === 'err' ? 'alert' : 'status'}">${svgIc(icn)}<div>${o.titulo ? `<b>${esc(o.titulo)}</b>` : ''}${o.texto ? `<span>${esc(o.texto)}</span>` : ''}</div>${o.acao ? `<div class="av-a">${o.acao}</div>` : ''}</div>`;
}
/** esqueleto de carregamento */
export function skeleton(o = {}) {
  const n = o.linhas || 3;
  if (o.tipo === 'kpi') return `<div class="g-kpi">${Array.from({ length: n }, () => '<div class="kpi sk"><i class="sk-l w40"></i><i class="sk-l w70 h28"></i><i class="sk-l w55"></i></div>').join('')}</div>`;
  return `<div class="card sk" aria-busy="true" aria-label="Carregando">${Array.from({ length: n }, (_, i) => `<i class="sk-l w${[90, 70, 80, 60][i % 4]}"></i>`).join('')}</div>`;
}
/** lista acionável: lista([{estado, titulo, sub, meta, href, acao:{rotulo, href, attrs, icone}}], {vazio}) */
export function lista(itens = [], o = {}) {
  if (!itens.length) return o.vazio ? vazio(typeof o.vazio === 'string' ? { titulo: o.vazio, compacto: true } : o.vazio) : '';
  return `<ul class="lst${o.cls ? ' ' + o.cls : ''}">${itens.map(it => `<li class="lst-i${it.estado === 'err' ? ' is-err' : ''}">
${it.estado ? `<span class="lst-led">${led(it.estado, false)}</span>` : it.avatar ? `<span class="lst-led">${avatar(it.avatar, 28)}</span>` : ''}
<div class="lst-m">${it.href ? `<a href="${esc(it.href)}" class="lst-t">${esc(it.titulo)}</a>` : `<b class="lst-t">${esc(it.titulo)}</b>`}${it.sub ? `<span class="lst-s">${it.subHtml ? it.sub : esc(it.sub)}</span>` : ''}</div>
${it.meta ? `<span class="lst-meta num">${it.metaHtml ? it.meta : esc(it.meta)}</span>` : ''}
${it.acao ? `<span class="lst-a">${btn({ rotulo: it.acao.rotulo, href: it.acao.href, icone: it.acao.icone, sm: true, attrs: it.acao.attrs, tipo: it.acao.tipo })}</span>` : ''}</li>`).join('')}</ul>`;
}
/** pares rótulo/valor (ficha de cadastro): pares([[rotulo, valorHtml], ...], {colunas}) */
export function pares(lst = [], o = {}) {
  return `<dl class="dl-g${o.colunas ? ' c' + o.colunas : ''}">${lst.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v === undefined || v === null || v === '' ? '<span class="mut">—</span>' : v}</dd></div>`).join('')}</dl>`;
}

/* ---------------- navegação ---------------- */
/** chips de filtro (links que gravam ?param= na URL): chips([{id, rotulo, n}], ativo, 'f'). param=null → botões com data-chip */
export function chips(lst = [], ativo, param = 'f', o = {}) {
  const itens = lst.map(c => (typeof c === 'string' ? { id: c, rotulo: c } : c));
  const at = ativo ?? (itens[0] && itens[0].id);
  return `<nav class="chips${o.cls ? ' ' + o.cls : ''}" aria-label="${esc(o.rotulo || 'Filtros')}">${itens.map((c, i) => {
    const on = String(c.id) === String(at);
    const inner = `${c.estado ? `<i class="chip-d s-${normEstado(c.estado)}"></i>` : ''}${esc(c.rotulo)}${c.n !== undefined ? `<span class="n num">${esc(c.n)}</span>` : ''}`;
    if (param === null) return `<button type="button" class="chip" data-chip="${esc(c.id)}" aria-pressed="${on}">${inner}</button>`;
    const val = i === 0 && o.primeiroLimpa !== false ? null : c.id;
    return `<a class="chip" href="${esc(router.href(null, { [param]: val }))}"${on ? ' aria-current="true"' : ''}>${inner}</a>`;
  }).join('')}</nav>`;
}
/** abas: tabs([{id, rotulo, n}], ativa, '#/clientes/c-orion') — id '' = base */
export function tabs(lst = [], ativa, base = '') {
  const b = String(base).replace(/^#?\/?/, '').replace(/\/$/, '');
  return `<nav class="tabs" aria-label="Seções"><div class="tabs-in">${lst.map(t => {
    const on = String(t.id) === String(ativa ?? '');
    return `<a class="tab" href="${esc(router.href(t.id ? `${b}/${t.id}` : b, {}, false) + (router.query.p ? `?p=${router.query.p}` : ''))}"${on ? ' aria-current="page"' : ''}>${t.icone ? svgIc(t.icone) : ''}${esc(t.rotulo)}${t.n !== undefined && t.n !== null ? `<span class="n num">${esc(t.n)}</span>` : ''}</a>`;
  }).join('')}</div></nav>`;
}
/** controle segmentado (botões com aria-pressed + data-seg=valor): seg([{id, rotulo}], ativo, {nome}) */
export function seg(lst = [], ativo, o = {}) {
  return `<div class="seg${o.cls ? ' ' + o.cls : ''}" role="group" aria-label="${esc(o.rotulo || 'Opções')}"${o.nome ? ` data-seg-nome="${esc(o.nome)}"` : ''}>${lst.map(x => (typeof x === 'string' ? { id: x, rotulo: x } : x)).map(x => `<button type="button" data-seg="${esc(x.id)}" aria-pressed="${String(x.id) === String(ativo)}">${esc(x.rotulo)}</button>`).join('')}</div>`;
}

/* ---------------- pessoas / barras ---------------- */
function pessoaDe(p) {
  if (!p) return null;
  if (typeof p === 'string') return db.get(p.startsWith('u-') ? 'users' : 'team', p) || db.get('team', p) || db.get('users', p) || { nome: p };
  return p;
}
/** foto da pessoa: o próprio registro, ou o par team<->user (user.teamId / team.userId) */
function fotoDe(x) {
  if (!x) return '';
  if (x.foto) return x.foto;
  const t = x.teamId ? db.get('team', x.teamId) : null; if (t && t.foto) return t.foto;
  const u = x.userId ? db.get('users', x.userId) : null; if (u && u.foto) return u.foto;
  return '';
}
const fotoValida = f => typeof f === 'string' && (/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(f) || /^https:\/\//i.test(f));
/** avatar(pessoa|id, tam=28, {status}) — mostra `foto` (data URL ou https) quando houver; se a imagem falhar, volta às iniciais */
export function avatar(p, tam = 28, o = {}) {
  const x = pessoaDe(p) || { nome: '?' };
  const ini = x.iniciais || iniciais(x.nome);
  const st = o.status && x.status ? `<i class="av-st s-${{ online: 'ok', ausente: 'warn', ferias: 'off', folga: 'off', sobrecarga: 'err' }[x.status] || 'off'}" aria-hidden="true"></i>` : '';
  const foto = fotoDe(x);
  const img = fotoValida(foto) ? `<img class="av-img" src="${esc(foto)}" alt="${esc(x.nome)}" loading="lazy" decoding="async" data-av-img>` : '';
  return `<span class="av${img ? ' av-f' : ''}" style="--av:${esc(x.avatarCor || '#64748B')};width:${tam}px;height:${tam}px;font-size:${Math.max(9, Math.round(tam * 0.38))}px" title="${esc(x.nome)}" role="img" aria-label="${esc(x.nome)}"><span class="av-ini" aria-hidden="true">${esc(ini)}</span>${img}${st}</span>`;
}
/**
 * lerFoto(file) -> Promise<dataURL> — valida (JPG, PNG ou WebP, até 8 MB), recorta o centro em quadrado e
 * reduz para 256×256 JPEG (qualidade 0,85, ~20–40 KB). Rejeita com Error de mensagem em pt-BR.
 */
export function lerFoto(file, o = {}) {
  const lado = o.lado || 256, q = o.qualidade || 0.85;
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('Nenhum arquivo escolhido. Selecione uma foto.')); return; }
    const tipo = String(file.type || '').toLowerCase();
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(tipo)) { reject(new Error('Formato não suportado. Envie uma foto JPG, PNG ou WebP.')); return; }
    if (file.size > 8 * 1024 * 1024) { reject(new Error('A foto tem mais de 8 MB. Escolha uma imagem menor ou reduza a resolução.')); return; }
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      try {
        const w = im.naturalWidth, h = im.naturalHeight; if (!w || !h) throw new Error('vazia');
        const m = Math.min(w, h), sx = (w - m) / 2, sy = (h - m) / 2;
        const c = document.createElement('canvas'); c.width = lado; c.height = lado;
        const g = c.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, lado, lado);
        g.imageSmoothingQuality = 'high'; g.drawImage(im, sx, sy, m, m, 0, 0, lado, lado);
        URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', q));
      } catch (e) { URL.revokeObjectURL(url); reject(new Error('Não foi possível processar esta imagem. Tente outra foto.')); }
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler esta imagem. O arquivo pode estar corrompido — tente outra foto.')); };
    im.src = url;
  });
}
/** pilha de avatares */
export function avatares(lst = [], max = 4, tam = 24) {
  const a = lst.slice(0, max).map(p => avatar(p, tam)).join('');
  return `<span class="avs">${a}${lst.length > max ? `<span class="av av-more" style="width:${tam}px;height:${tam}px">+${lst.length - max}</span>` : ''}</span>`;
}
/* faixas de ocupação e health vêm da central "Padrões e regras" (padrões de fábrica: 70/85/100 e 60/75) */
export const FAIXAS = {
  get ocupacao() { const a = padrao('equipe.ocupacao.idealMin', 70), b = padrao('equipe.ocupacao.idealMax', 85), c = padrao('equipe.ocupacao.critico', 100); return [{ ate: a - 0.001, estado: 'info', rotulo: 'Ociosa' }, { ate: b, estado: 'ok', rotulo: 'Ideal' }, { ate: c, estado: 'warn', rotulo: 'Atenção' }, { ate: Infinity, estado: 'err', rotulo: 'Crítico' }]; },
  meta: [{ ate: 74.999, estado: 'err' }, { ate: 89.999, estado: 'warn' }, { ate: Infinity, estado: 'ok' }],
  get health() { const r = padrao('clientes.health.risco', 60), o = padrao('clientes.health.saudavel', 75); return [{ ate: r - 0.001, estado: 'err' }, { ate: o - 0.001, estado: 'warn' }, { ate: Infinity, estado: 'ok' }]; },
};
/** estado de um valor segundo faixas: faixa(82, 'health') -> 'ok' */
export function faixa(v, faixas) { const f = typeof faixas === 'string' ? FAIXAS[faixas] : faixas; if (!f) return 'acc'; const x = f.find(z => v <= z.ate); return x ? x.estado : 'off'; }
/** barra(pct, faixas|{faixas, zona:[70,85], max, rotulo, estado, texto}) */
export function barra(v, o = {}) {
  if (Array.isArray(o) || typeof o === 'string') o = { faixas: o };
  const max = o.max || (v > 100 ? Math.max(120, Math.ceil(v / 10) * 10) : 100);
  const e = o.estado || (o.faixas ? faixa(v, o.faixas) : 'acc');
  const w = Math.max(0, Math.min(100, (v / max) * 100));
  const z = o.zona ? `<i class="bar-z" style="left:${(o.zona[0] / max) * 100}%;width:${((o.zona[1] - o.zona[0]) / max) * 100}%" title="Zona ideal ${o.zona[0]}–${o.zona[1]}%"></i>` : '';
  const m100 = max > 100 ? `<i class="bar-100" style="left:${(100 / max) * 100}%"></i>` : '';
  return `<div class="bar${o.fina ? ' fina' : ''}" role="meter" aria-valuenow="${esc(v)}" aria-valuemin="0" aria-valuemax="${max}" aria-label="${esc(o.aria || `${v}%`)}"><div class="bar-t">${z}<i class="bar-f s-${e}" style="width:${w}%"></i>${m100}</div>${o.rotulo === false ? '' : `<span class="bar-v num">${esc(o.texto ?? pctFmt(v, 0))}</span>`}</div>`;
}

/* ---------------- tabela ---------------- */
const valorSort = (c, row) => {
  if (typeof c.sort === 'function') return c.sort(row);
  if (c.v) return c.v(row);
  const v = row[c.k]; return v == null ? '' : v;
};
/**
 * tabela({cols:[{k, l, r(row), num, sort, v(row), w, cls, ajuda, mobile:false}], linhas, vazio, onRowHref(row), ordem:{k, dir:'asc'|'desc'},
 *         mobile:'cards'|'scroll', altura, densa, id, rowCls(row), rodape})
 */
export function tabela(o = {}) {
  const cols = o.cols || [];
  let linhas = (o.linhas || []).slice();
  if (!linhas.length) return `<div class="tbl-vz">${vazio(Object.assign({ compacto: true }, typeof o.vazio === 'string' ? { titulo: o.vazio } : (o.vazio || { titulo: 'Nenhum registro encontrado', texto: 'Ajuste os filtros ou cadastre um novo item.' })))}</div>`;
  let sortIdx = -1, dir = 'asc';
  if (o.ordem) {
    sortIdx = cols.findIndex(c => c.k === o.ordem.k); dir = o.ordem.dir || 'asc';
    if (sortIdx >= 0) { const c = cols[sortIdx]; linhas.sort((a, b) => cmp(valorSort(c, a), valorSort(c, b)) * (dir === 'desc' ? -1 : 1)); }
  }
  const th = cols.map((c, i) => {
    const sortable = c.sort !== false && (c.k || c.v || typeof c.sort === 'function');
    const as = i === sortIdx ? (dir === 'desc' ? 'descending' : 'ascending') : 'none';
    const inner = `${esc(c.l || '')}${c.ajuda ? ajuda(c.ajuda) : ''}`;
    return `<th scope="col" class="${c.num ? 'n ' : ''}${c.cls || ''}"${c.w ? ` style="width:${esc(c.w)}"` : ''}${sortable ? ` aria-sort="${as}"` : ''}>${sortable ? `<button type="button" class="th-b" data-sort-i="${i}">${inner}<span class="th-s" aria-hidden="true"></span></button>` : inner}</th>`;
  }).join('');
  const tr = linhas.map(row => {
    const href = o.onRowHref ? o.onRowHref(row) : null;
    const tds = cols.map((c, i) => {
      const v = valorSort(c, row);
      const cont = c.r ? c.r(row) : esc(row[c.k] ?? '');
      return `<td class="${c.num ? 'n num ' : ''}${c.cls || ''}${c.mobile === false ? ' m-hide' : ''}${i === 0 ? ' t1' : ''}" data-l="${esc(c.l || '')}" data-v="${esc(typeof v === 'object' ? '' : v)}">${cont}</td>`;
    }).join('');
    return `<tr${href ? ` class="clk${o.rowCls ? ' ' + o.rowCls(row) : ''}" data-href="${esc(href)}" tabindex="0"` : o.rowCls ? ` class="${o.rowCls(row)}"` : ''}>${tds}</tr>`;
  }).join('');
  const ordenaveis = cols.map((c, i) => ({ c, i })).filter(({ c }) => c.sort !== false && (c.k || c.v || typeof c.sort === 'function'));
  const selSort = (o.mobile || 'cards') === 'cards' && ordenaveis.length > 1 && linhas.length > 2 ? `<label class="tbl-sort"><span>Ordenar por</span><select data-sort-sel aria-label="Ordenar tabela por">${ordenaveis.map(({ c, i }) => `<option value="${i}"${i === sortIdx ? ' selected' : ''}>${esc(c.l || '')}</option>`).join('')}</select></label>` : '';
  return `${selSort}<div class="tbl-w${o.altura ? ' fix-h' : ''}" data-mobile="${o.mobile || 'cards'}"${o.altura ? ` style="max-height:${o.altura}px"` : ''}${o.id ? ` id="${esc(o.id)}"` : ''}><table class="tbl${o.densa ? ' densa' : ''}"${o.legenda ? ` aria-label="${esc(o.legenda)}"` : ''}><thead><tr>${th}</tr></thead><tbody>${tr}</tbody>${o.rodape ? `<tfoot>${o.rodape}</tfoot>` : ''}</table></div>`;
}
function cmp(a, b) {
  const na = typeof a === 'number' ? a : (a !== '' && !isNaN(Number(a)) ? Number(a) : null);
  const nb = typeof b === 'number' ? b : (b !== '' && !isNaN(Number(b)) ? Number(b) : null);
  if (na !== null && nb !== null) return na - nb;
  if (a === '' || a == null) return 1; if (b === '' || b == null) return -1;
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}
function ordenarTabela(btnEl, dirForcada) {
  const thEl = btnEl.closest('th'), table = btnEl.closest('table'), i = Number(btnEl.dataset.sortI);
  const cur = thEl.getAttribute('aria-sort'); const dir = dirForcada || (cur === 'ascending' ? 'descending' : 'ascending');
  table.querySelectorAll('th[aria-sort]').forEach(t => t.setAttribute('aria-sort', 'none'));
  thEl.setAttribute('aria-sort', dir);
  const tb = table.tBodies[0]; const rows = Array.from(tb.rows);
  rows.sort((a, b) => cmp(a.cells[i].dataset.v, b.cells[i].dataset.v) * (dir === 'descending' ? -1 : 1));
  rows.forEach(r => tb.appendChild(r));
}

/* ---------------- formulários ---------------- */
const dig = s => String(s || '').replace(/\D/g, '');
export const mascaras = {
  cnpj(v) { const d = dig(v).slice(0, 14); return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2'); },
  cpf(v) { const d = dig(v).slice(0, 11); return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); },
  telefone(v) {
    let d = dig(v); if (d.length > 11 && d.startsWith('55')) d = d.slice(2); d = d.slice(0, 11);
    if (!d) return '';
    const dd = d.slice(0, 2), r = d.slice(2);
    if (d.length <= 2) return `+55 (${dd}`;
    if (r.length <= 4) return `+55 (${dd}) ${r}`;
    const cut = r.length === 9 ? 5 : 4;
    return `+55 (${dd}) ${r.slice(0, cut)}${r.length > cut ? '-' + r.slice(cut) : ''}`;
  },
  moeda(v) { if (typeof v === 'number') return brl2(v); const d = dig(v).replace(/^0+(?=\d)/, ''); if (!d) return ''; return brl2(Number(d) / 100); },
  percent(v) { if (typeof v === 'number') return String(v).replace('.', ','); let s = String(v || '').replace(/[^\d,]/g, ''); const i = s.indexOf(','); if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, '').slice(0, 2); return s; },
  data(v) { if (/^\d{4}-\d{2}-\d{2}/.test(v)) { const [y, m, d] = v.slice(0, 10).split('-'); return `${d}/${m}/${y}`; } const d = dig(v).slice(0, 8); return d.replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})\/(\d{2})(\d)/, '$1/$2/$3'); },
  cep(v) { const d = dig(v).slice(0, 8); return d.replace(/(\d{5})(\d)/, '$1-$2'); },
  inteiro(v) { return dig(v); },
};
export const parse = {
  moeda(s) { if (typeof s === 'number') return s; const d = String(s || '').replace(/[^\d,-]/g, '').replace(',', '.'); return d === '' ? null : Number(d); },
  percent(s) { if (typeof s === 'number') return s; const d = String(s || '').replace(/[^\d,.-]/g, '').replace(',', '.'); return d === '' ? null : Number(d); },
  data(s) { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''); },
};
function dvCnpj(d) {
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = n => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = w.reduce((a, x, i) => a + x * Number(d[i]), 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
function dvCpf(d) {
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = n => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
/** validadores: retornam '' (ok) ou a mensagem em pt-BR */
export const valida = {
  obrigatorio: v => (v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && !v.length) ? 'Campo obrigatório.' : ''),
  email: v => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'E-mail inválido. Ex.: nome@empresa.com.br'),
  cnpj: v => (!v || dvCnpj(dig(v)) ? '' : 'CNPJ inválido. Confira os 14 dígitos.'),
  cpf: v => (!v || dvCpf(dig(v)) ? '' : 'CPF inválido. Confira os 11 dígitos.'),
  telefone: v => { if (!v) return ''; let d = dig(v); if (d.length > 11 && d.startsWith('55')) d = d.slice(2); return d.length >= 10 && d.length <= 11 ? '' : 'Telefone inválido. Use DDD + número, ex.: (11) 91234-5678.'; },
  data: v => { if (!v) return ''; const iso = parse.data(v) || v; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); if (!m) return 'Data inválida. Use dd/mm/aaaa.'; const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? '' : 'Data inválida. Use dd/mm/aaaa.'; },
  url: v => (!v || /^https?:\/\/[^\s.]+\.[^\s]{2,}/.test(v) ? '' : 'Endereço inválido. Comece com https://'),
  min: n => v => (v === null || v === '' || v === undefined ? '' : (typeof v === 'number' ? (v < n ? `O mínimo é ${String(n).replace('.', ',')}.` : '') : (String(v).length < n ? `Use pelo menos ${n} caracteres.` : ''))),
  max: n => v => (v === null || v === '' || v === undefined ? '' : (typeof v === 'number' ? (v > n ? `O máximo é ${String(n).replace('.', ',')}.` : '') : (String(v).length > n ? `Use no máximo ${n} caracteres.` : ''))),
  moeda: v => (v === null || v === '' || v === undefined || (!isNaN(v) && v >= 0) ? '' : 'Valor inválido.'),
};
const INPUTMODE = { cnpj: 'numeric', cpf: 'numeric', telefone: 'tel', moeda: 'numeric', percent: 'decimal', data: 'numeric', cep: 'numeric', inteiro: 'numeric' };
const PH = { cnpj: '00.000.000/0000-00', cpf: '000.000.000-00', telefone: '+55 (11) 91234-5678', moeda: 'R$ 0,00', percent: '0,0', data: 'dd/mm/aaaa', cep: '00000-000' };
/**
 * campo({nome, rotulo, tipo, valor, opcoes:[{v,l}]|[str], obrigatorio, ajuda, dica, placeholder, attrs, cls, desabilitado, multiplo, linhas})
 * tipos: text, email, number, password, textarea, select, checkbox, radio, date(=máscara dd/mm/aaaa), moeda, percent, cnpj, cpf, telefone, cep
 */
export function campo(o = {}) {
  const id = o.id || novoId('f');
  const t = o.tipo || 'text';
  const req = o.obrigatorio ? ' required aria-required="true"' : '';
  const dis = o.desabilitado ? ' disabled' : '';
  const desc = o.dica ? ` aria-describedby="${id}-d"` : '';
  const lab = `<label for="${id}">${esc(o.rotulo || '')}${o.obrigatorio ? '<span class="req" aria-hidden="true">*</span>' : ''}${o.ajuda ? ajuda(o.ajuda) : ''}</label>`;
  let ctl;
  const val = o.valor;
  if (t === 'textarea') ctl = `<textarea id="${id}" name="${esc(o.nome)}" rows="${o.linhas || 3}"${req}${dis}${desc}${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ''}${attrs(o.attrs)}>${esc(val ?? '')}</textarea>`;
  else if (t === 'select') {
    const ops = (o.opcoes || []).map(x => (typeof x === 'object' ? x : { v: x, l: x }));
    const sel = v => (o.multiplo ? (Array.isArray(val) && val.map(String).includes(String(v))) : String(val ?? '') === String(v));
    ctl = `<select id="${id}" name="${esc(o.nome)}"${o.multiplo ? ' multiple' : ''}${req}${dis}${desc}${attrs(o.attrs)}>${o.placeholder ? `<option value="">${esc(o.placeholder)}</option>` : ''}${ops.map(x => `<option value="${esc(x.v)}"${sel(x.v) ? ' selected' : ''}>${esc(x.l)}</option>`).join('')}</select>`;
  } else if (t === 'checkbox') {
    return `<div class="fld fld-ck${o.cls ? ' ' + o.cls : ''}"><label class="ck"><input type="checkbox" id="${id}" name="${esc(o.nome)}"${val ? ' checked' : ''}${dis}${attrs(o.attrs)}><span>${esc(o.rotulo)}</span></label>${o.dica ? `<p class="fld-d" id="${id}-d">${esc(o.dica)}</p>` : ''}</div>`;
  } else if (t === 'radio') {
    const ops = (o.opcoes || []).map(x => (typeof x === 'object' ? x : { v: x, l: x }));
    return `<fieldset class="fld fld-rd${o.cls ? ' ' + o.cls : ''}"><legend>${esc(o.rotulo)}</legend><div class="rd-g">${ops.map((x, i) => `<label class="ck"><input type="radio" name="${esc(o.nome)}" value="${esc(x.v)}"${String(val) === String(x.v) || (val == null && i === 0) ? ' checked' : ''}${dis}><span>${esc(x.l)}</span></label>`).join('')}</div></fieldset>`;
  } else {
    const mask = { date: 'data', data: 'data', moeda: 'moeda', percent: 'percent', cnpj: 'cnpj', cpf: 'cpf', telefone: 'telefone', cep: 'cep' }[t];
    const type = mask ? 'text' : t;
    let v = val ?? '';
    if (mask && v !== '') v = mascaras[mask](mask === 'moeda' && typeof v === 'number' ? v : (mask === 'percent' && typeof v === 'number' ? v : String(v)));
    const inp = `<input id="${id}" name="${esc(o.nome)}" type="${type}" value="${esc(v)}"${mask ? ` data-mask="${mask}" inputmode="${INPUTMODE[mask]}" autocomplete="off"` : ''}${req}${dis}${desc} placeholder="${esc(o.placeholder ?? PH[mask] ?? '')}"${attrs(o.attrs)}>`;
    ctl = mask === 'percent' ? `<div class="inp-suf">${inp}<span>%</span></div>` : inp;
  }
  return `<div class="fld${o.cls ? ' ' + o.cls : ''}">${lab}${ctl}${o.dica ? `<p class="fld-d" id="${id}-d">${esc(o.dica)}</p>` : ''}</div>`;
}
function aplicarMascara(inp) {
  const m = inp.dataset.mask; if (!mascaras[m]) return;
  const antes = inp.value; const novo = mascaras[m](antes);
  if (novo !== antes) { inp.value = novo; try { inp.setSelectionRange(novo.length, novo.length); } catch (e) { /* tipo sem seleção */ } }
}
export const form = {
  /** lê os campos [name] do elemento: máscaras moeda/percent → número; data → ISO yyyy-mm-dd; checkbox → bool (vários com o mesmo nome → array) */
  ler(el) {
    const out = {};
    const els = Array.from(el.querySelectorAll('[name]'));
    const nomes = {}; els.forEach(e => { if (e.type === 'checkbox') nomes[e.name] = (nomes[e.name] || 0) + 1; });
    for (const e of els) {
      const n = e.name; if (!n || e.disabled && !e.dataset.lerDesabilitado) continue;
      if (e.type === 'checkbox') { if (nomes[n] > 1) { (out[n] || (out[n] = [])); if (e.checked) out[n].push(e.value); } else out[n] = e.checked; continue; }
      if (e.type === 'radio') { if (e.checked) out[n] = e.value; else if (!(n in out)) out[n] = null; continue; }
      if (e.tagName === 'SELECT' && e.multiple) { out[n] = Array.from(e.selectedOptions).map(x => x.value); continue; }
      const m = e.dataset.mask; const v = String(e.value || '').trim();
      if (m === 'moeda') out[n] = parse.moeda(v);
      else if (m === 'percent') out[n] = parse.percent(v);
      else if (m === 'data') out[n] = parse.data(v) || (v ? v : '');
      else if (e.type === 'number') out[n] = v === '' ? null : Number(v);
      else out[n] = v;
    }
    return out;
  },
  /** preenche os campos a partir de um objeto */
  preencher(el, obj = {}) {
    el.querySelectorAll('[name]').forEach(e => {
      if (!(e.name in obj)) return; const v = obj[e.name];
      if (e.type === 'checkbox') e.checked = Array.isArray(v) ? v.includes(e.value) : !!v;
      else if (e.type === 'radio') e.checked = String(v) === e.value;
      else if (e.dataset.mask) e.value = v == null || v === '' ? '' : mascaras[e.dataset.mask](v);
      else e.value = v ?? '';
    });
  },
  limparErros(el) { el.querySelectorAll('.fld-err').forEach(x => x.remove()); el.querySelectorAll('[aria-invalid]').forEach(x => { x.removeAttribute('aria-invalid'); }); },
  /**
   * validar(el, regras?) -> {ok, erros:{campo: msg}, dados}
   * regras: {campo: 'obrigatorio|email|min:3' | ['obrigatorio', valida.cnpj, (v, dados) => msg]}
   * Sem regras, usa os atributos: required, type=email, data-mask (cnpj/cpf/telefone/data).
   */
  validar(el, regras = {}) {
    this.limparErros(el);
    const dados = this.ler(el); const erros = {};
    const campos = Array.from(el.querySelectorAll('[name]'));
    const porNome = {}; campos.forEach(c => { if (!porNome[c.name]) porNome[c.name] = c; });
    const nomes = new Set([...Object.keys(regras), ...campos.map(c => c.name)]);
    for (const n of nomes) {
      const c = porNome[n]; let lst = regras[n];
      if (typeof lst === 'string') lst = lst.split('|');
      lst = (lst || []).slice();
      if (c) {
        if (c.required && !lst.includes('obrigatorio')) lst.unshift('obrigatorio');
        if (c.type === 'email' && !lst.includes('email')) lst.push('email');
        const m = c.dataset.mask; if (m && valida[m] && !lst.includes(m)) lst.push(m);
      }
      for (const r of lst) {
        let fn = r;
        if (typeof r === 'string') { const [k, arg] = r.split(':'); fn = arg !== undefined ? valida[k] && valida[k](Number(arg)) : valida[k]; }
        if (typeof fn !== 'function') continue;
        const raw = c && c.dataset.mask && ['cnpj', 'cpf', 'telefone'].includes(c.dataset.mask) ? c.value : dados[n];
        const msg = (r === 'data' || (c && c.dataset.mask === 'data' && fn === valida.data)) ? fn(c ? c.value : raw) : fn(raw, dados);
        if (msg) { erros[n] = msg; break; }
      }
      if (erros[n] && c) {
        const f = c.closest('.fld') || c.parentElement;
        const id = (c.id || novoId('f')) + '-e';
        c.setAttribute('aria-invalid', 'true');
        const prev = c.getAttribute('aria-describedby') || '';
        if (!prev.includes(id)) c.setAttribute('aria-describedby', (prev + ' ' + id).trim());
        f.insertAdjacentHTML('beforeend', `<p class="fld-err" id="${id}">${svgIc('alert-circle')}${esc(erros[n])}</p>`);
      }
    }
    const ok = !Object.keys(erros).length;
    if (!ok) { const first = el.querySelector('[aria-invalid="true"]'); first && first.focus(); }
    return { ok, erros, dados };
  },
  mascarar: aplicarMascara,
};

/* ---------------- overlays (pilha) ---------------- */
const pilha = [];
const FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function prenderFoco(box, e) {
  if (e.key !== 'Tab') return;
  const f = Array.from(box.querySelectorAll(FOCAVEIS)).filter(x => x.offsetParent !== null || x === document.activeElement);
  if (!f.length) { e.preventDefault(); return; }
  const a = f[0], z = f[f.length - 1];
  if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
}
/** fecha o overlay do topo (Esc). Retorna true se fechou algo */
export function fecharTopo() { const t = pilha[pilha.length - 1]; if (t) { t.fechar(false); return true; } return false; }
export function overlaysAbertos() { return pilha.length; }
function raizOverlay() { let r = document.getElementById('ov-root'); if (!r) { r = document.createElement('div'); r.id = 'ov-root'; document.body.appendChild(r); } return r; }

/**
 * overlay({html, cls, rotulo, onAbrir(box), onFechar}) -> {el, box, fechar} — janela solta (sem cabeçalho/rodapé do modal),
 * com fundo, foco preso, Esc e devolução do foco. Usada pela paleta de comandos.
 */
export function overlay(o = {}) {
  const ant = document.activeElement;
  const w = document.createElement('div'); w.className = `ov ov-modal ov-solta${o.cls ? ' ' + o.cls : ''}`;
  w.innerHTML = `<div class="scrim" data-fechar></div><div class="ovb" role="dialog" aria-modal="true"${o.rotulo ? ` aria-label="${esc(o.rotulo)}"` : ''}>${o.html || ''}</div>`;
  raizOverlay().appendChild(w); document.body.classList.add('ov-lock');
  const box = w.querySelector('.ovb'); let fechado = false;
  const fechar = (restaurar = true) => {
    if (fechado) return; fechado = true;
    const i = pilha.indexOf(ent); if (i >= 0) pilha.splice(i, 1);
    w.classList.add('saindo'); setTimeout(() => w.remove(), 120);
    if (!pilha.length) document.body.classList.remove('ov-lock');
    if (restaurar !== 'sem-foco' && ant && ant.focus && document.contains(ant)) ant.focus({ preventScroll: true });
    o.onFechar && o.onFechar();
  };
  const ent = { fechar, el: w }; pilha.push(ent);
  w.addEventListener('mousedown', e => { if (e.target.closest('[data-fechar]')) { e.preventDefault(); fechar(); } });
  w.addEventListener('keydown', e => prenderFoco(box, e));
  o.onAbrir && o.onAbrir(box);
  return { el: w, box, fechar };
}
/**
 * modal({titulo, corpo, confirmar='Confirmar'|false, cancelar='Cancelar', perigo, onConfirmar(el)->false|string|Promise, onAbrir(el), largura:'sm'|'md'|'lg', sub})
 * -> Promise<boolean>. onConfirmar retornando false ou uma mensagem mantém o modal aberto.
 */
export function modal(o = {}) {
  return new Promise(resolve => {
    const ant = document.activeElement;
    const id = novoId('m');
    const w = document.createElement('div');
    w.className = 'ov ov-modal';
    const conf = o.confirmar === undefined ? 'Confirmar' : o.confirmar;
    w.innerHTML = `<div class="scrim" data-fechar></div><div class="mbox ${o.largura || 'md'}" role="${o.perigo ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="${id}-t">
<header class="mb-h"><div><h2 id="${id}-t">${esc(o.titulo || '')}</h2>${o.sub ? `<p>${esc(o.sub)}</p>` : ''}</div>${btnIc('x', 'Fechar', { 'data-fechar': '' })}</header>
<div class="mb-b">${o.corpo ?? ''}</div>
<footer class="mb-f"><p class="mb-err" role="alert" hidden></p><div class="mb-fa">${o.cancelar === false ? '' : `<button type="button" class="btn" data-fechar>${esc(o.cancelar || (conf === false ? 'Fechar' : 'Cancelar'))}</button>`}${conf === false ? '' : `<button type="button" class="btn ${o.perigo ? 'perigo' : 'pri'}" data-ok>${esc(conf)}</button>`}</div></footer></div>`;
    raizOverlay().appendChild(w);
    document.body.classList.add('ov-lock');
    const box = w.querySelector('.mbox'), okb = w.querySelector('[data-ok]'), err = w.querySelector('.mb-err');
    let fechado = false;
    const fechar = v => {
      if (fechado) return; fechado = true;
      const i = pilha.indexOf(ent); if (i >= 0) pilha.splice(i, 1);
      w.classList.add('saindo'); setTimeout(() => w.remove(), 140);
      if (!pilha.length) document.body.classList.remove('ov-lock');
      if (ant && ant.focus && document.contains(ant)) ant.focus();
      resolve(v);
    };
    const ent = { fechar, el: w }; pilha.push(ent);
    w.addEventListener('click', e => { if (e.target.closest('[data-fechar]')) fechar(false); });
    w.addEventListener('keydown', e => prenderFoco(box, e));
    const confirmarAcao = async () => {
      if (!o.onConfirmar) return fechar(true);
      okb.disabled = true; const txt = okb.textContent; okb.textContent = 'Salvando…'; err.hidden = true;
      let r;
      try { r = await o.onConfirmar(box); } catch (ex) { console.error(ex); r = 'Algo deu errado. Tente de novo.'; }
      if (fechado) return;
      okb.disabled = false; okb.textContent = txt;
      if (r === false) return;
      if (typeof r === 'string') { err.textContent = r; err.hidden = false; return; }
      fechar(true);
    };
    okb && okb.addEventListener('click', confirmarAcao);
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && okb && e.target.type !== 'checkbox') { e.preventDefault(); confirmarAcao(); } });
    o.onAbrir && o.onAbrir(box);
    const f0 = box.querySelector('.mb-b ' + FOCAVEIS) || okb || box.querySelector(FOCAVEIS); f0 && f0.focus();
  });
}
/** confirmar(texto, {titulo, confirmar, perigo=true}) -> Promise<bool> */
export function confirmar(texto, o = {}) {
  return modal({ titulo: o.titulo || 'Tem certeza?', corpo: `<p class="mb-txt">${esc(texto)}</p>`, confirmar: o.confirmar || 'Confirmar', cancelar: o.cancelar || 'Cancelar', perigo: o.perigo !== false, largura: 'sm' });
}
/** drawer({titulo, sub, corpo, onAbrir(el), largura, rodape}) -> {el, fechar, fechado: Promise} */
export function drawer(o = {}) {
  const ant = document.activeElement; const id = novoId('d');
  const w = document.createElement('div'); w.className = 'ov ov-drawer';
  w.innerHTML = `<div class="scrim" data-fechar></div><aside class="dbox" role="dialog" aria-modal="true" aria-labelledby="${id}-t"${o.largura ? ` style="width:min(${o.largura}px,100vw)"` : ''}>
<header class="mb-h"><div><h2 id="${id}-t">${esc(o.titulo || '')}</h2>${o.sub ? `<p>${esc(o.sub)}</p>` : ''}</div>${btnIc('x', 'Fechar', { 'data-fechar': '' })}</header><div class="db-b">${o.corpo ?? ''}</div>${o.rodape ? `<footer class="mb-f"><div class="mb-fa">${o.rodape}</div></footer>` : ''}</aside>`;
  raizOverlay().appendChild(w); document.body.classList.add('ov-lock');
  const box = w.querySelector('.dbox');
  let res; const fechadoP = new Promise(r => { res = r; }); let fechou = false;
  const fechar = v => {
    if (fechou) return; fechou = true;
    const i = pilha.indexOf(ent); if (i >= 0) pilha.splice(i, 1);
    w.classList.add('saindo'); setTimeout(() => w.remove(), 160);
    if (!pilha.length) document.body.classList.remove('ov-lock');
    if (ant && ant.focus && document.contains(ant)) ant.focus();
    res(v);
  };
  const ent = { fechar, el: w }; pilha.push(ent);
  w.addEventListener('click', e => { if (e.target.closest('[data-fechar]')) fechar(false); });
  w.addEventListener('keydown', e => prenderFoco(box, e));
  o.onAbrir && o.onAbrir(box);
  const f0 = box.querySelector('.db-b ' + FOCAVEIS) || box.querySelector(FOCAVEIS); f0 && f0.focus();
  return { el: box, fechar, fechado: fechadoP };
}
/**
 * popover(ancora, html, {onFechar, alinhar:'end'|'start', cls, largura}) -> {el, fechar}
 * Fecha ao clicar fora, Esc, ou chamando fechar(). Usado pelo shell (sino, perfil, busca).
 */
export function popover(ancora, html, o = {}) {
  const w = document.createElement('div'); w.className = `pop${o.cls ? ' ' + o.cls : ''}`; w.setAttribute('role', o.role || 'dialog');
  if (o.rotulo) w.setAttribute('aria-label', o.rotulo);
  w.innerHTML = html; raizOverlay().appendChild(w);
  const pos = () => {
    const r = ancora.getBoundingClientRect(); const vw = document.documentElement.clientWidth;
    const lw = Math.min(o.largura || w.offsetWidth || 320, vw - 16); w.style.width = o.largura ? `${lw}px` : '';
    let left = o.alinhar === 'start' ? r.left : r.right - lw; left = Math.max(8, Math.min(left, vw - lw - 8));
    w.style.left = `${left}px`;
    const abaixo = innerHeight - r.bottom - 24, acima = r.top - 24, alt = w.scrollHeight;
    if (abaixo < Math.min(alt, 260) && acima > abaixo) { const h = Math.min(alt, acima); w.style.maxHeight = `${h}px`; w.style.top = `${Math.max(8, r.top - 8 - h)}px`; }
    else { w.style.top = `${r.bottom + 8}px`; w.style.maxHeight = `${Math.max(160, abaixo)}px`; }
  };
  pos();
  let fechou = false;
  const fora = e => { if (!w.contains(e.target) && !ancora.contains(e.target)) fechar(false); };
  const fechar = () => {
    if (fechou) return; fechou = true;
    const i = pilha.indexOf(ent); if (i >= 0) pilha.splice(i, 1);
    document.removeEventListener('pointerdown', fora, true); window.removeEventListener('resize', pos);
    w.remove(); ancora.setAttribute('aria-expanded', 'false'); o.onFechar && o.onFechar();
  };
  const ent = { fechar, el: w, pop: true }; pilha.push(ent);
  ancora.setAttribute('aria-expanded', 'true');
  setTimeout(() => document.addEventListener('pointerdown', fora, true), 0);
  window.addEventListener('resize', pos);
  return { el: w, fechar, reposicionar: pos };
}
export function fecharPopovers() { pilha.filter(p => p.pop).forEach(p => p.fechar()); }

/** toast(msg, {desfazer: fn, tipo:'ok'|'err'|'info'|'warn', duracao, acao:{rotulo, fn}}) */
export function toast(msg, o = {}) {
  let r = document.getElementById('toasts');
  if (!r) { r = document.createElement('div'); r.id = 'toasts'; r.className = 'toasts'; r.setAttribute('aria-live', 'polite'); r.setAttribute('role', 'status'); document.body.appendChild(r); }
  const t = document.createElement('div'); const tipo = o.tipo || 'ok';
  t.className = `toast t-${tipo}`;
  const icn = { ok: 'check-circle', err: 'alert-circle', warn: 'alert', info: 'info' }[tipo] || 'info';
  t.innerHTML = `${svgIc(icn)}<span class="toast-m">${esc(msg)}</span>${o.desfazer ? '<button type="button" class="toast-b" data-desfazer>Desfazer</button>' : ''}${o.acao ? `<button type="button" class="toast-b" data-acao>${esc(o.acao.rotulo)}</button>` : ''}<button type="button" class="toast-x" aria-label="Fechar aviso">${svgIc('x')}</button>`;
  r.appendChild(t);
  let tm;
  const fechar = () => { clearTimeout(tm); t.classList.add('saindo'); setTimeout(() => t.remove(), 180); };
  const iniciar = () => { tm = setTimeout(fechar, o.duracao || (o.desfazer ? 7000 : 4500)); };
  t.addEventListener('mouseenter', () => clearTimeout(tm)); t.addEventListener('mouseleave', iniciar);
  t.querySelector('.toast-x').addEventListener('click', fechar);
  const d = t.querySelector('[data-desfazer]');
  if (d) d.addEventListener('click', () => { fechar(); try { o.desfazer(); toast('Ação desfeita.', { tipo: 'info' }); } catch (e) { console.error(e); toast('Não foi possível desfazer.', { tipo: 'err' }); } });
  const a = t.querySelector('[data-acao]');
  if (a) a.addEventListener('click', () => { fechar(); o.acao.fn && o.acao.fn(); });
  iniciar();
  return { fechar };
}

/** incorpora outra página (iframe) com estado vazio se o arquivo não existir: embed({src, srcEscuro, titulo, altura}) */
export function embed(o = {}) {
  return `<div class="emb" data-embed="${esc(o.src)}"${o.srcEscuro ? ` data-embed-escuro="${esc(o.srcEscuro)}"` : ''} data-embed-titulo="${esc(o.titulo || 'Conteúdo incorporado')}" style="--emb-h:${o.altura ? o.altura + 'px' : 'calc(100vh - 140px)'}"><div class="emb-ld">${skeleton({ linhas: 4 })}</div></div>`;
}
function hidratarEmbeds(root) {
  root.querySelectorAll('[data-embed]:not([data-ok])').forEach(async el => {
    el.dataset.ok = '1';
    const escuro = document.documentElement.dataset.tema === 'escuro';
    const src = (escuro && el.dataset.embedEscuro) || el.dataset.embed;
    const titulo = el.dataset.embedTitulo;
    const falhar = () => {
      el.innerHTML = vazio({ icone: 'plane', titulo: `${titulo} indisponível neste arquivo`, texto: `Não encontramos "${src}". Ao publicar, mantenha a pasta "torre/" ao lado do arquivo do app (a versão em pasta, dist/, já inclui). No arquivo único de prévia este painel não vem embutido.`, acao: { rotulo: 'Tentar carregar mesmo assim', attrs: { 'data-embed-forcar': '' } } });
      const b = el.querySelector('[data-embed-forcar]'); b && b.addEventListener('click', () => mostrar());
    };
    const mostrar = () => { el.innerHTML = `<iframe src="${esc(src)}" title="${esc(titulo)}" loading="lazy" referrerpolicy="same-origin"></iframe><a class="emb-ext" href="${esc(src)}" target="_blank" rel="noopener">${svgIc('ext')}Abrir em nova aba</a>`; };
    if (location.protocol === 'file:') { (window.AOS_SINGLE ? falhar : mostrar)(); return; }
    try { const r = await fetch(src, { method: 'HEAD', cache: 'no-store' }); if (r.ok) mostrar(); else falhar(); } catch (e) { falhar(); }
  });
}
/** pós-render: embeds etc. O shell chama após cada render. */
export function hidratar(root = document) { hidratarEmbeds(root); }

/* ---------------- listeners delegados (uma vez) ---------------- */
let delegou = false;
export function iniciarDelegacao() {
  if (delegou) return; delegou = true;
  document.addEventListener('click', e => {
    const sb = e.target.closest('[data-sort-i]'); if (sb) { ordenarTabela(sb); return; }
    const tr = e.target.closest('tr[data-href]');
    if (tr && !e.target.closest('a,button,input,select,textarea,label,[data-no-row]')) { location.hash = tr.dataset.href.replace(/^#/, ''); return; }
    const sg = e.target.closest('.seg [data-seg]');
    if (sg && !sg.closest('[data-seg-manual]')) { sg.parentElement.querySelectorAll('[data-seg]').forEach(b => b.setAttribute('aria-pressed', String(b === sg))); }
    const ch = e.target.closest('button.chip[data-chip]');
    if (ch) { ch.parentElement.querySelectorAll('[data-chip]').forEach(b => b.setAttribute('aria-pressed', String(b === ch))); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { const tr = e.target.closest && e.target.closest('tr[data-href]'); if (tr && e.target === tr) { e.preventDefault(); location.hash = tr.dataset.href.replace(/^#/, ''); } }
  });
  document.addEventListener('input', e => { const t = e.target; if (t && t.dataset && t.dataset.mask) aplicarMascara(t); });
  document.addEventListener('change', e => {
    const s = e.target.closest && e.target.closest('[data-sort-sel]'); if (!s) return;
    const w = s.closest('.tbl-sort').nextElementSibling; const b = w && w.querySelector(`[data-sort-i="${s.value}"]`);
    if (b) { const c = w.querySelectorAll('th')[Number(s.value)]; ordenarTabela(b, c && c.classList.contains('n') ? 'descending' : 'ascending'); }
  });
  // foto de avatar quebrada: remove a imagem e as iniciais aparecem
  document.addEventListener('error', e => { const t = e.target; if (t && t.matches && t.matches('img[data-av-img]')) { const av = t.closest('.av'); t.remove(); if (av) av.classList.remove('av-f'); } }, true);
  document.addEventListener('blur', e => {
    const t = e.target; if (!t || !t.dataset || !t.dataset.mask) return;
    if (t.dataset.mask === 'percent' && t.value.endsWith(',')) t.value = t.value.slice(0, -1);
  }, true);
}

export const ui = {
  ic, led, selo, ajuda, btn, btnIc, rel, delta, kpi, card, cabecalho, vazio, aviso, skeleton, lista, pares, chips, tabs, seg,
  avatar, avatares, lerFoto, overlay, definirIntro, barra, faixa, FAIXAS, tabela, campo, form, mascaras, parse, valida, modal, confirmar, drawer, popover, fecharPopovers,
  toast, embed, hidratar, fecharTopo, overlaysAbertos, normEstado, novoId, iniciarDelegacao,
};
export default ui;
