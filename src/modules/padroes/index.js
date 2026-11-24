// Padrões e regras — a central de "como a plataforma decide": todos os limites, faixas, pesos, fórmulas e regras dos
// motores (recomendações da IA e Guardião de segurança), com o valor atual, o padrão de fábrica, onde aparece e o histórico.
// Catálogo: src/core/padroes (gestao.js + trafego.js). Valores: settings 'padroes' (+ 'motorRegras' e 'guardiaoRegras',
// as mesmas chaves que a Campanha, a Torre e o Alertas usam). Edição: perm 'padroes' (Dono, Admin e Head de tráfego).
import { db } from '../../core/store.js';
import { router } from '../../core/router.js';
import * as fmt from '../../core/fmt.js';
import { CATALOGO, padrao, definicao, alterado, definir, restaurar, historico } from '../../core/padroes/index.js';
import MotorRecs from '../../shared/motor-recs.mjs';
import Guardiao from '../../shared/guardiao.mjs';

const esc = fmt.esc;
const HIST = 'padroesHistorico';
export const SECOES = [
  { id: 'clientes', rotulo: 'Clientes', icone: 'building', lado: 'gestao', desc: 'Health score, risco de cancelamento, renovação e onboarding.' },
  { id: 'equipe', rotulo: 'Equipe', icone: 'users', lado: 'gestao', desc: 'Ocupação, sobrecarga, burnout, horas por cliente e indicadores de cada pessoa.' },
  { id: 'operacao', rotulo: 'Operação', icone: 'kanban', lado: 'gestao', desc: 'Prazos, retrabalho, SLA, prioridades da Minha mesa, relatório semanal e Cockpit.' },
  { id: 'financeiro', rotulo: 'Financeiro', icone: 'dollar', lado: 'gestao', desc: 'Atraso de faturas, runway, concentração, rentabilidade, CAC/LTV e lembretes.' },
  { id: 'webinars', rotulo: 'Webinars', icone: 'video', lado: 'gestao', desc: 'Referências de mercado, metas, prazos de preenchimento e fórmulas.' },
  { id: 'alertas', rotulo: 'Alertas', icone: 'alert', lado: 'gestao', desc: 'Os 7 alertas essenciais e como as notificações chegam.' },
  { id: 'comercial', rotulo: 'Comercial', icone: 'target', lado: 'gestao', desc: 'Probabilidade por etapa (forecast) e regras do pipeline.' },
  { id: 'acesso', rotulo: 'Acesso e visibilidade', icone: 'shield', lado: 'gestao', desc: 'Quem vê o quê, receita, escopo de clientes e quem altera estes padrões.' },
  { id: 'torre', rotulo: 'Torre de Controle', icone: 'radio-tower', lado: 'trafego', desc: 'Quando uma conta de anúncios fica crítica ou pede atenção.' },
  { id: 'orcamento', rotulo: 'Orçamento', icone: 'wallet', lado: 'trafego', desc: 'Teto de verba, limite de mudanças e regras de orçamento.' },
  { id: 'recomendacoes', rotulo: 'Recomendações da IA', icone: 'spark', lado: 'trafego', desc: 'Regras do motor único que sugere o que fazer nas contas (Torre e Campanha).' },
  { id: 'invasao', rotulo: 'Invasão', icone: 'bell-ring', lado: 'trafego', desc: 'O que dispara o alarme de possível invasão e a pausa automática.' },
];
const LADOS = [['gestao', 'Gestão'], ['trafego', 'Tráfego']];
const secaoDe = id => SECOES.find(s => s.id === id);

/* ---------------- rascunho (sobrevive a re-render enquanto não salva) ---------------- */
const rascunho = new Map(); // id → texto digitado (padrão) · 'motor|<regra>|<chave|ativo>' / 'guardiao|…' → texto/bool
let ultimoSalvo = null;     // {secao, quando}

/* ---------------- valores e formatação ---------------- */
const numTxt = v => (Number.isInteger(v) ? fmt.num(v) : fmt.dec(v, Math.abs(v) < 10 ? 2 : 1).replace(/,?0+$/, '') || '0');
export function valorTxt(p, v) {
  if (v == null || v === '') return '—';
  if (p.opcoes) { const o = p.opcoes.find(x => String(x[0]) === String(v)); return o ? o[1] : String(v); }
  if (typeof v !== 'number') return p.unidade === 'bool' ? (v ? 'Sim' : 'Não') : String(v);
  switch (p.unidade) {
    case '%': return `${numTxt(v)}%`;
    case 'R$': return fmt.brl(v);
    case 'x': case '×': return `${numTxt(v)}×`;
    case 'dias': return `${numTxt(v)} ${v === 1 ? 'dia' : 'dias'}`;
    case 'semanas': return `${numTxt(v)} ${v === 1 ? 'semana' : 'semanas'}`;
    case 'meses': return `${numTxt(v)} ${v === 1 ? 'mês' : 'meses'}`;
    case 'h': return `${numTxt(v)} h`;
    case 'min': return `${numTxt(v)} min`;
    case 'pts': return `${numTxt(v)} pts`;
    default: return numTxt(v);
  }
}
const sufixo = u => ({ '%': '%', x: '×', '×': '×', dias: 'dias', semanas: 'sem.', meses: 'meses', h: 'h', min: 'min', pts: 'pts' })[u] || '';
const lerNum = s => { const t = String(s ?? '').trim().replace(/\s|%|×|R\$/gi, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); return t === '' ? NaN : Number(t); };
const editavel = p => p.editavel === true && typeof p.valor === 'number';
const temRascunho = p => rascunho.has(p.id);
/** valor proposto (rascunho válido como número) ou atual */
function proposto(id) { const p = definicao(id); if (!p) return padrao(id); if (rascunho.has(id)) { const n = lerNum(rascunho.get(id)); return Number.isFinite(n) ? n : NaN; } return padrao(id); }

/** valida uma entrada (com o rascunho atual) → mensagem ou '' */
function erroDe(p) {
  if (!temRascunho(p)) return '';
  const v = proposto(p.id);
  if (!Number.isFinite(v)) return 'Informe um número.';
  if (p.opcoes) return p.opcoes.some(o => Number(o[0]) === v) ? '' : 'Escolha uma opção da lista.';
  if (p.min != null && v < p.min) return `Mínimo ${valorTxt(p, p.min)}.`;
  if (p.max != null && v > p.max) return `Máximo ${valorTxt(p, p.max)}.`;
  if (p.passo && p.passo >= 1 && Math.abs((v - (p.min || 0)) / p.passo - Math.round((v - (p.min || 0)) / p.passo)) > 1e-6) return `Use passos de ${numTxt(p.passo)}.`;
  if (p.menorQue && definicao(p.menorQue)) { const o = proposto(p.menorQue); if (Number.isFinite(o) && v >= o) return `Precisa ser menor que "${definicao(p.menorQue).nome}" (${valorTxt(p, o)}).`; }
  if (p.maiorQue && definicao(p.maiorQue)) { const o = proposto(p.maiorQue); if (Number.isFinite(o) && v <= o) return `Precisa ser maior que "${definicao(p.maiorQue).nome}" (${valorTxt(p, o)}).`; }
  return '';
}
/** grupos que somam 100: {chave: {ids, total, ok}} */
function somas(lista) {
  const g = {};
  lista.filter(p => p.grupoSoma).forEach(p => { (g[p.grupoSoma] = g[p.grupoSoma] || { ids: [], total: 0 }).ids.push(p.id); });
  Object.values(g).forEach(x => { x.total = x.ids.reduce((a, id) => a + (Number.isFinite(proposto(id)) ? proposto(id) : 0), 0); x.ok = Math.abs(x.total - 100) < 1e-6; });
  return g;
}
/** mudanças pendentes de uma lista de entradas → [{p, de, para}] */
function pendentes(lista) { return lista.filter(p => temRascunho(p) && Number.isFinite(proposto(p.id)) && proposto(p.id) !== padrao(p.id)).map(p => ({ p, de: padrao(p.id), para: proposto(p.id) })); }

/* ---------------- motores (recomendações e Guardião) ---------------- */
const MOTORES = {
  motor: { chave: 'motorRegras', nome: 'Recomendações da IA', regras: ov => MotorRecs.regras(ov), padraoDe: id => MotorRecs.REGRAS_PADRAO.find(r => r.id === id), validar: (id, ps) => MotorRecs.validar(id, ps), link: '#/campanha/regras', onde: ['Torre › Painel de Voo', 'Campanha › Regras da IA'] },
  guardiao: { chave: 'guardiaoRegras', nome: 'Guardião de segurança', regras: ov => Guardiao.regras(ov), padraoDe: id => Guardiao.regras({}).find(r => r.id === id), validar: (id, ps) => Guardiao.validar(id, ps), link: '#/alertas/regras', onde: ['Torre (quarentena)', 'Alertas › Segurança', 'Verificação a cada 2 min'] },
};
const ovDe = tipo => db.config(MOTORES[tipo].chave, {}) || {};
const kM = (tipo, r, c) => `${tipo}|${r}|${c}`;
function regrasComRascunho(tipo) {
  const M = MOTORES[tipo]; const rs = M.regras(ovDe(tipo));
  return rs.map(r => {
    const kA = kM(tipo, r.id, 'ativo');
    const ativo = rascunho.has(kA) ? rascunho.get(kA) : r.ativo;
    const params = r.params.map(p => { const k = kM(tipo, r.id, p.chave); return { ...p, atual: p.valor, txt: rascunho.has(k) ? rascunho.get(k) : null, valor: rascunho.has(k) ? lerNum(rascunho.get(k)) : p.valor }; });
    const v = M.validar(r.id, Object.fromEntries(params.map(p => [p.chave, p.valor])));
    return { ...r, ativoAtual: r.ativo, ativo, params, erros: v.ok ? {} : v.erros };
  });
}
function mudancasMotor(tipo) {
  const out = [];
  regrasComRascunho(tipo).forEach(r => {
    if (r.ativo !== r.ativoAtual) out.push({ r, rotulo: 'Regra', de: r.ativoAtual ? 'ligada' : 'desligada', para: r.ativo ? 'ligada' : 'desligada' });
    r.params.forEach(p => { if (p.txt != null && Number.isFinite(p.valor) && p.valor !== p.atual) out.push({ r, rotulo: p.rotulo, de: valorTxt({ unidade: p.unidade === '×' ? 'x' : p.unidade }, p.atual), para: valorTxt({ unidade: p.unidade === '×' ? 'x' : p.unidade }, p.valor) }); });
  });
  return out;
}
const motorTemErro = tipo => regrasComRascunho(tipo).some(r => Object.keys(r.erros).length);
function salvarMotor(tipo, quem, idEntrada) {
  const M = MOTORES[tipo]; const antes = ovDe(tipo); const novo = {};
  const mud = mudancasMotor(tipo);
  regrasComRascunho(tipo).forEach(r => {
    const pad = M.padraoDe(r.id); if (!pad) return;
    const o = { ...(antes[r.id] || {}) };
    const dif = {}; r.params.forEach(p => { const pp = pad.params.find(x => x.chave === p.chave); if (pp && Number.isFinite(p.valor) && p.valor !== pp.valor) dif[p.chave] = p.valor; });
    if (Object.keys(dif).length) o.params = dif; else delete o.params;
    if (r.ativo !== pad.ativo) o.ativo = r.ativo; else delete o.ativo;
    if (Object.keys(o).length) novo[r.id] = o;
  });
  const quando = new Date().toISOString();
  const h = (db.config(HIST, []) || []).slice(-499).concat(mud.map(m => ({ id: idEntrada, de: m.de, para: m.para, item: `${m.r.nome} · ${m.rotulo}`, quem, quando })));
  db.batch(() => {
    db.setConfig(M.chave, novo, { log: `alterou as regras de ${M.nome}: ${mud.map(m => `${m.r.nome} (${m.rotulo})`).join(', ')}` });
    db.setConfig(HIST, h);
  });
  return antes;
}

/* ---------------- catálogo por seção (+ editores dos motores se o catálogo de tráfego ainda não os trouxer) ---------------- */
const VIRTUAIS = {
  recomendacoes: { id: 'recomendacoes.motor', secao: 'recomendacoes', grupo: 'Regras do motor de recomendações', nome: 'Regras da IA (motor único)', editor: 'motor', valor: null, unidade: 'texto', editavel: true,
    significa: 'Cada regra olha os números da conta (custo, resultados, frequência, CTR, CPM, gasto) e sugere uma ação com prioridade Agora, Hoje ou Esta semana. As mesmas regras valem para a Torre (contas dos clientes) e a Campanha (conta própria).',
    calculo: 'Liga/desliga cada regra e ajusta os limites. 7 dias depois de aplicar, o motor mede se deu certo.', ondeUsa: ['Torre › Painel de Voo', 'Campanha › Recomendações'], link: '#/campanha/regras' },
  invasao: { id: 'invasao.guardiao', secao: 'invasao', grupo: 'Sinais de possível invasão', nome: 'Regras do Guardião de segurança', editor: 'guardiao', valor: null, unidade: 'texto', editavel: true,
    significa: 'Sinais que indicam que alguém de fora mexeu na conta de anúncios. Uma regra crítica, ou 2 altas diferentes em 30 min, viram incidente: a conta é pausada na hora e a sirene toca para tráfego, Dono e Admin.',
    calculo: 'Verificação a cada 2 min. Pausar nunca exclui; reativar exige Dono/Admin, SIM e checklist.', ondeUsa: ['Torre (quarentena)', 'Alertas › Segurança', 'Sino e sirene'], link: '#/alertas/regras' },
};
function entradasDe(secao) {
  const l = CATALOGO.filter(p => p.secao === secao);
  const v = VIRTUAIS[secao];
  if (v && !l.some(p => p.editor === v.editor)) l.push(v);
  return l;
}
const todasEntradas = () => SECOES.flatMap(s => entradasDe(s.id));
const textoBusca = p => fmt.norm([p.nome, p.significa, p.calculo, p.grupo, (p.ondeUsa || []).join(' '), (secaoDe(p.secao) || {}).rotulo, typeof p.valor === 'string' ? p.valor : ''].join(' '));
export function buscar(q) { const n = fmt.norm(q || '').trim(); if (!n) return []; const ts = n.split(/\s+/); return todasEntradas().filter(p => { const t = textoBusca(p); return ts.every(x => t.includes(x)); }); }
const alteradoE = p => (p.editor ? Object.keys(ovDe(p.editor)).length > 0 : alterado(p.id));
const nomeQuem = id => { const u = id ? db.get('users', id) : null; return u ? u.nome : 'Sistema'; };
const histTxt = (x, p) => (typeof x.de === 'number' || typeof x.para === 'number' ? `${valorTxt(p || {}, x.de)} → ${valorTxt(p || {}, x.para)}` : `${x.de} → ${x.para}`);

/* ---------------- render ---------------- */
function linhaEntrada(ctx, p, pode) {
  const { ui } = ctx;
  const motor = p.editor && MOTORES[p.editor];
  const alt = alteradoE(p);
  const h = historico(p.id).slice().reverse();
  const podeEd = pode && (editavel(p) || motor);
  const erro = editavel(p) ? erroDe(p) : '';
  const sujo = editavel(p) && temRascunho(p) && proposto(p.id) !== padrao(p.id);
  let valor;
  if (motor) valor = '';
  else if (podeEd) {
    const atual = padrao(p.id); const txt = temRascunho(p) ? rascunho.get(p.id) : (Number.isInteger(atual) ? String(atual) : fmt.dec(atual, 2).replace(/,?0+$/, ''));
    const ctrl = p.opcoes
      ? `<select id="pd-${esc(p.id)}" data-pd="${esc(p.id)}" aria-describedby="pd-e-${esc(p.id)}">${p.opcoes.map(o => `<option value="${esc(o[0])}"${Number(txt) === Number(o[0]) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`
      : `<span class="m-padroes-in${erro ? ' err' : ''}">${p.unidade === 'R$' ? '<em>R$</em>' : ''}<input id="pd-${esc(p.id)}" type="text" inputmode="decimal" autocomplete="off" data-pd="${esc(p.id)}" value="${esc(txt)}" aria-invalid="${!!erro}" aria-describedby="pd-e-${esc(p.id)}"${p.min != null ? ` data-min="${p.min}"` : ''}${p.max != null ? ` data-max="${p.max}"` : ''}>${sufixo(p.unidade) ? `<em>${esc(sufixo(p.unidade))}</em>` : ''}</span>`;
    valor = `<label class="sr" for="pd-${esc(p.id)}">${esc(p.nome)}</label>${ctrl}<small class="m-padroes-pd">Padrão: ${esc(valorTxt(p, p.valor))}${p.min != null && p.max != null && !p.opcoes ? ` · ${esc(valorTxt(p, p.min))} a ${esc(valorTxt(p, p.max))}` : ''}</small><small class="m-padroes-er" id="pd-e-${esc(p.id)}" role="alert">${esc(erro)}</small>`;
  } else {
    const fixo = !editavel(p);
    valor = `<b class="m-padroes-ro num${typeof padrao(p.id) === 'number' ? '' : ' txt'}">${esc(valorTxt(p, padrao(p.id)))}</b><small class="m-padroes-pd">${fixo ? `${ui.ic('lock')} Regra fixa` : `${ui.ic('lock')} Só Dono, Admin e Head de tráfego alteram`}${!fixo && alt ? ` · padrão ${esc(valorTxt(p, p.valor))}` : ''}</small>`;
  }
  const estado = motor
    ? (alt ? ui.selo('warn', 'Ajustado') : ui.selo('off', 'Padrão'))
    : sujo ? ui.selo('acc', 'Não salvo') : alt ? ui.selo('warn', 'Alterado') : editavel(p) ? ui.selo('off', 'Padrão') : ui.selo('off', 'Fixo');
  const onde = (p.ondeUsa || []).map(o => p.link ? `<a class="m-padroes-chip" href="${esc(p.link)}">${esc(o)}</a>` : `<span class="m-padroes-chip">${esc(o)}</span>`).join('');
  const restaurarBtn = pode && alt && !motor && editavel(p) ? ui.btn({ rotulo: 'Restaurar padrão', icone: 'refresh', sm: true, tipo: 'ghost', attrs: { 'data-pd-restaurar': p.id } }) : '';
  const histHtml = h.length ? `<details class="m-padroes-hist"><summary>${ui.ic('clock')} Histórico (${h.length})</summary><ol>${h.slice(0, 12).map(x => `<li><span class="num">${esc(fmt.dataHora(x.quando))}</span><b>${esc(nomeQuem(x.quem))}</b><span>${x.item ? `${esc(x.item)}: ` : ''}${esc(histTxt(x, p))}</span></li>`).join('')}</ol></details>` : '';
  const motorHtml = motor ? editorMotor(ctx, p, pode) : '';
  return `<article class="m-padroes-e${sujo ? ' sujo' : ''}${motor ? ' motor' : ''}${ctx.query.item === p.id ? ' alvo' : ''}" id="pd-item-${esc(p.id)}" data-pd-item="${esc(p.id)}">
<div class="m-padroes-eb">
<div class="m-padroes-et"><h4>${esc(p.nome)}</h4>${estado}</div>
${p.significa ? `<p class="m-padroes-sig"><span class="m-padroes-k">O que significa</span>${esc(p.significa)}</p>` : ''}
${p.calculo ? `<p class="m-padroes-calc"><span class="m-padroes-k">Como calculamos</span><code>${esc(p.calculo)}</code></p>` : ''}
${onde ? `<div class="m-padroes-onde"><span class="m-padroes-k">Onde aparece</span><span class="m-padroes-chips">${onde}</span></div>` : ''}
${histHtml || restaurarBtn ? `<div class="m-padroes-ef">${histHtml}${restaurarBtn}</div>` : ''}
</div>
${motor ? '' : `<div class="m-padroes-ev">${valor}</div>`}
${motorHtml}
</article>`;
}

function editorMotor(ctx, p, pode) {
  const { ui } = ctx; const tipo = p.editor; const M = MOTORES[tipo];
  const rs = regrasComRascunho(tipo);
  const SEV = { critica: ['err', 'Crítica'], alta: ['warn', 'Alta'], media: ['info', 'Média'] };
  const PRI = { agora: 'Agora', hoje: 'Hoje', semana: 'Esta semana' };
  const li = r => {
    const tag = tipo === 'guardiao' ? (r.id === 'agregacao' ? ui.selo('err', 'Incidente') : ui.selo(SEV[r.severidade] ? SEV[r.severidade][0] : 'off', SEV[r.severidade] ? SEV[r.severidade][1] : r.severidade)) : ui.selo(r.prioridade === 'agora' ? 'err' : r.prioridade === 'hoje' ? 'warn' : 'off', PRI[r.prioridade] || r.prioridade);
    const sw = r.id === 'agregacao' ? '' : `<button type="button" class="m-padroes-sw" role="switch" aria-checked="${!!r.ativo}" aria-label="${esc(r.nome)}: ${r.ativo ? 'ligada' : 'desligada'}" data-pd-sw="${esc(kM(tipo, r.id, 'ativo'))}"${pode ? '' : ' disabled title="Só Dono, Admin e Head de tráfego alteram"'}><i></i></button>`;
    const ps = r.params.map(x => {
      const k = kM(tipo, r.id, x.chave); const e = r.erros[x.chave] || '';
      const txt = x.txt != null ? x.txt : (Number.isInteger(x.atual) ? String(x.atual) : fmt.dec(x.atual, 2).replace(/,?0+$/, ''));
      const pad = (M.padraoDe(r.id) || { params: [] }).params.find(y => y.chave === x.chave);
      return `<label class="m-padroes-mp"><span>${esc(x.rotulo)}${pad && pad.valor !== x.atual ? ` <small class="t-warn">padrão ${esc(String(pad.valor).replace('.', ','))}</small>` : ''}</span>${pode
        ? `<span class="m-padroes-in sm${e ? ' err' : ''}">${x.unidade === 'R$' ? '<em>R$</em>' : ''}<input type="text" inputmode="decimal" autocomplete="off" data-pd-m="${esc(k)}" value="${esc(txt)}" aria-invalid="${!!e}">${x.unidade && x.unidade !== 'R$' && x.unidade !== 'n' ? `<em>${esc(x.unidade)}</em>` : ''}</span>`
        : `<b class="num">${esc(txt)}${x.unidade && x.unidade !== 'n' ? ` ${esc(x.unidade)}` : ''}</b>`}${e ? `<small class="m-padroes-er" role="alert">${esc(e)}</small>` : ''}</label>`;
    }).join('');
    return `<li class="${r.ativo === false ? 'off' : ''}"><div class="m-padroes-mh">${sw}<div><b>${esc(r.nome)}</b> ${tag}${r.descricao ? `<p class="sm mut">${esc(r.descricao)}</p>` : ''}</div></div>${ps ? `<div class="m-padroes-mps">${ps}</div>` : ''}</li>`;
  };
  return `<div class="m-padroes-motor"><ul>${rs.map(li).join('')}</ul><p class="sm mut">Mesma configuração usada em ${esc(M.onde.join(', '))}. ${ui.btn({ rotulo: tipo === 'motor' ? 'Ver desempenho das regras' : 'Ver incidentes e testar sirene', tipo: 'link', sm: true, href: M.link })}</p></div>`;
}

function grupos(lista) { const g = new Map(); lista.forEach(p => { const k = p.grupo || 'Geral'; if (!g.has(k)) g.set(k, []); g.get(k).push(p); }); return [...g.entries()]; }

function corpoEntradas(ctx, lista, pode, o = {}) {
  const { ui } = ctx;
  const sm = somas(lista);
  return grupos(lista).map(([g, ps]) => {
    const soma = ps[0] && ps[0].grupoSoma && sm[ps[0].grupoSoma];
    const somaHtml = soma ? `<div class="m-padroes-soma${soma.ok ? '' : ' err'}" data-pd-soma="${esc(ps[0].grupoSoma)}" role="status">${ui.led(soma.ok ? 'ok' : 'err', false)}<span>Total dos pesos: <b class="num">${esc(numTxt(soma.total))}%</b>${soma.ok ? '' : ' · precisa somar 100%'}</span></div>` : '';
    const titulo = o.comSecao ? `${(secaoDe(ps[0].secao) || {}).rotulo || ''} › ${g}` : g;
    return `<section class="m-padroes-g"><h3>${esc(titulo)}<span class="mut sm num">${ps.length}</span></h3>${somaHtml}<div class="m-padroes-l">${ps.map(p => linhaEntrada(ctx, p, pode)).join('')}</div></section>`;
  }).join('');
}

/** tipos de motor (motor | guardiao) presentes na lista */
const tiposMotor = lista => [...new Set(lista.filter(p => p.editor && MOTORES[p.editor]).map(p => p.editor))];
const nMotor = lista => tiposMotor(lista).reduce((a, t) => a + mudancasMotor(t).length, 0);
function barraSalvar(ctx, secao, lista, pode) {
  if (!pode) return '';
  const n = pendentes(lista).length + nMotor(lista);
  return `<div class="m-padroes-sv${n ? '' : ' vazio'}" data-pd-barra="${esc(secao)}" role="status" aria-live="polite">${ctx.ui.led('warn', n ? fmt.plural(n, 'alteração não salva', 'alterações não salvas') : 'Sem alterações')}<span class="row">${ctx.ui.btn({ rotulo: 'Descartar', sm: true, attrs: { 'data-pd-descartar': secao } })}${ctx.ui.btn({ rotulo: 'Revisar e salvar', sm: true, tipo: 'pri', icone: 'check', attrs: { 'data-pd-salvar': secao } })}</span></div>`;
}

function resumoTopo(ctx) {
  const { ui } = ctx;
  const h = historico().slice(-5).reverse();
  const como = `<ol class="m-padroes-como">
<li><b>Os dados chegam</b><span>Clientes, tarefas, horas, faturas, contas de anúncios e webinars (lançados pela equipe ou pelas integrações).</span></li>
<li><b>Os padrões classificam</b><span>Cada número passa por um limite ou faixa desta página: verde (ok), âmbar (atenção) ou vermelho (crítico).</span></li>
<li><b>A plataforma age</b><span>O que é vermelho vira alerta, item em "Agora" na Minha mesa, contador no menu, recomendação ou pausa automática (invasão).</span></li></ol>
<p class="sm mut">Mudou um padrão? A tela que usa o valor muda na hora. Tudo fica no histórico (quem, quando, de → para) e pode voltar ao padrão de fábrica.</p>`;
  const lista = h.length ? `<ul class="m-padroes-rec">${h.map(x => { const p = definicao(x.id) || VIRTUAIS[(x.id || '').split('.')[0]] || {}; const s = secaoDe(p.secao || String(x.id).split('.')[0]); return `<li><a href="#/padroes/${esc(s ? s.id : 'clientes')}?item=${esc(x.id)}"><b>${esc(x.item || p.nome || x.id)}</b><span class="num">${esc(histTxt(x, p))}</span></a><small class="mut">${esc(nomeQuem(x.quem))} · ${ui.rel(x.quando)}</small></li>`; }).join('')}</ul>`
    : ui.vazio({ icone: 'clock', titulo: 'Nada mudou ainda', texto: 'Tudo está no padrão de fábrica. Quando alguém alterar um limite, aparece aqui.', compacto: true });
  return `<div class="m-padroes-topo">${ui.card({ titulo: 'Como a plataforma decide', icone: 'sliders', corpo: como })}${ui.card({ titulo: 'O que mudou recentemente', icone: 'clock', sub: h.length ? `últimas ${h.length}` : '', corpo: lista, pad: !h.length ? undefined : false })}</div>`;
}

function indice(ctx, atual) {
  const { ui } = ctx; const q = ctx.query.q || '';
  const item = s => {
    const l = entradasDe(s.id); const nAlt = l.filter(alteradoE).length; const nSujo = pendentes(l).length + nMotor(l);
    return `<a class="m-padroes-ix${s.id === atual && !q ? ' on' : ''}" href="#/padroes/${s.id}"${s.id === atual && !q ? ' aria-current="page"' : ''}>${ui.ic(s.icone)}<span class="trunc">${esc(s.rotulo)}</span>${nSujo ? '<i class="m-padroes-dot" title="Alterações não salvas" aria-label="alterações não salvas"></i>' : ''}<small class="num">${nAlt ? `<b class="t-warn" title="${nAlt} alterado(s)">${nAlt}</b> · ` : ''}${l.length}</small></a>`;
  };
  return `<nav class="m-padroes-nav" aria-label="Seções dos padrões">
<label class="m-padroes-q">${ui.ic('search')}<span class="sr">Buscar padrão</span><input type="search" data-pd-q placeholder="Buscar: ocupação, risco, invasão…" value="${esc(q)}" autocomplete="off"></label>
${LADOS.map(([l, r]) => `<div class="m-padroes-lado"><span class="m-padroes-lt">${esc(r)}</span>${SECOES.filter(s => s.lado === l).map(item).join('')}</div>`).join('')}
<a class="m-padroes-ix${atual === 'tudo' && !q ? ' on' : ''}" href="#/padroes/tudo">${ui.ic('list')}<span>Tudo em uma página</span></a>
</nav>`;
}

function render(ctx) {
  const { ui } = ctx;
  const pode = ctx.can('padroes', 'editar');
  const q = String(ctx.query.q || '').trim();
  const sec = ctx.params.secao && (secaoDe(ctx.params.secao) || ctx.params.secao === 'tudo') ? ctx.params.secao : 'clientes';
  const todas = todasEntradas();
  const nEd = todas.filter(p => editavel(p) || p.editor).length;
  const nAlt = todas.filter(alteradoE).length;
  let conteudo, lista;
  if (q) {
    lista = buscar(q);
    ctx.migalha(`Busca: ${q}`);
    conteudo = lista.length
      ? `<div class="m-padroes-sh"><h2>${fmt.plural(lista.length, 'padrão encontrado', 'padrões encontrados')} para "${esc(q)}"</h2>${ui.btn({ rotulo: 'Limpar busca', sm: true, tipo: 'ghost', icone: 'x', attrs: { 'data-pd-limpar': '' } })}</div>${corpoEntradas(ctx, lista, pode, { comSecao: true })}`
      : ui.vazio({ icone: 'search', titulo: `Nada encontrado para "${q}"`, texto: 'Tente outra palavra (ex.: "health", "ocupação", "fatura", "invasão") ou escolha uma seção ao lado.', acao: { rotulo: 'Limpar busca', attrs: { 'data-pd-limpar': '' } } });
  } else if (sec === 'tudo') {
    lista = todas; ctx.migalha('Tudo');
    conteudo = SECOES.map(s => { const l = entradasDe(s.id); return `<div class="m-padroes-sec" id="sec-${s.id}"><div class="m-padroes-sh"><h2>${ui.ic(s.icone)} ${esc(s.rotulo)}</h2><span class="sm mut">${esc(s.desc)}</span></div>${l.length ? corpoEntradas(ctx, l, pode) : vazioSecao(ctx, s)}</div>`; }).join('');
  } else {
    const s = secaoDe(sec); lista = entradasDe(sec); ctx.migalha(s.rotulo);
    const ed = lista.filter(p => editavel(p) || p.editor).length;
    conteudo = `<div class="m-padroes-sh"><div><h2>${ui.ic(s.icone)} ${esc(s.rotulo)}</h2><p class="sm mut">${esc(s.desc)}</p></div><span class="sm mut num">${fmt.plural(lista.length, 'padrão', 'padrões')} · ${ed} ${ed === 1 ? 'editável' : 'editáveis'}</span></div>${lista.length ? corpoEntradas(ctx, lista, pode) : vazioSecao(ctx, s)}`;
  }
  const acoes = `${ui.btn({ rotulo: 'Imprimir ou salvar PDF', icone: 'file', sm: true, attrs: { 'data-pd-imprimir': '' } })}`;
  const aviso = pode ? '' : ui.aviso({ tipo: 'info', titulo: 'Somente leitura', texto: 'Você pode consultar como a plataforma decide. Só Dono, Admin e Head de tráfego alteram estes padrões.' });
  return `<div class="pg m-padroes">
${ui.cabecalho({ titulo: 'Padrões e regras', descricao: 'Como a plataforma pensa para agir: cada limite, faixa, peso e fórmula que deixa um cliente em risco, uma pessoa sobrecarregada, uma conta crítica ou dispara o alarme de invasão. Troque o que precisar — tudo fica no histórico.', sub: `${todas.length} padrões · ${nEd} editáveis · ${nAlt ? fmt.plural(nAlt, 'alterado', 'alterados') : 'todos no padrão de fábrica'}`, acoes })}
${aviso}
<div class="m-padroes-wrap">${indice(ctx, sec)}<div class="m-padroes-main">${!q && !ctx.params.secao ? resumoTopo(ctx) : ''}${conteudo}${barraSalvar(ctx, q ? 'busca' : sec, lista, pode)}</div></div>
</div>`;
}
function vazioSecao(ctx, s) {
  return ctx.ui.vazio({ icone: s.icone, titulo: 'Padrões desta seção em preparação', texto: 'Os limites de tráfego estão sendo catalogados pelo time. Enquanto isso, a Torre usa os valores de fábrica.', compacto: true });
}

/* ---------------- interação ---------------- */
function listaAtual(ctx) {
  const q = String(ctx.query.q || '').trim(); const sec = ctx.params.secao || 'clientes';
  if (q) return buscar(q);
  if (sec === 'tudo') return todasEntradas();
  return entradasDe(secaoDe(sec) ? sec : 'clientes');
}
/** atualiza erros, totais, selos e a barra sem re-render (enquanto digita) */
function atualizar(el, ctx) {
  const lista = listaAtual(ctx);
  lista.forEach(p => {
    if (!editavel(p)) return;
    const e = erroDe(p); const box = el.querySelector(`[data-pd-item="${CSS.escape(p.id)}"]`); if (!box) return;
    const er = box.querySelector('.m-padroes-er'); if (er) er.textContent = e;
    const inp = box.querySelector('[data-pd]'); if (inp) { inp.setAttribute('aria-invalid', String(!!e)); const w = inp.closest('.m-padroes-in'); if (w) w.classList.toggle('err', !!e); }
    box.classList.toggle('sujo', temRascunho(p) && proposto(p.id) !== padrao(p.id));
  });
  const sm = somas(lista);
  el.querySelectorAll('[data-pd-soma]').forEach(b => { const s = sm[b.dataset.pdSoma]; if (!s) return; b.classList.toggle('err', !s.ok); b.innerHTML = `${ctx.ui.led(s.ok ? 'ok' : 'err', false)}<span>Total dos pesos: <b class="num">${esc(numTxt(s.total))}%</b>${s.ok ? '' : ' · precisa somar 100%'}</span>`; });
  const barra = el.querySelector('[data-pd-barra]');
  if (barra) {
    const n = pendentes(lista).length + nMotor(lista);
    barra.classList.toggle('vazio', !n);
    const led = barra.querySelector('.led-w'); if (led) led.outerHTML = ctx.ui.led('warn', n ? fmt.plural(n, 'alteração não salva', 'alterações não salvas') : 'Sem alterações');
  }
}

async function salvar(ctx, el) {
  const { ui } = ctx; const lista = listaAtual(ctx);
  const erros = lista.filter(p => editavel(p) && erroDe(p));
  const sm = Object.entries(somas(lista)).filter(([, s]) => !s.ok);
  const tipos = tiposMotor(lista);
  if (erros.length || sm.length || tipos.some(motorTemErro)) {
    ui.toast(sm.length ? 'Os pesos precisam somar 100%. Ajuste antes de salvar.' : 'Corrija os valores destacados antes de salvar.', { tipo: 'err' });
    const f = el.querySelector('[aria-invalid="true"]'); if (f) f.focus();
    return;
  }
  const pend = pendentes(lista); const mm = tipos.flatMap(t => mudancasMotor(t));
  if (!pend.length && !mm.length) { ui.toast('Nada para salvar: os valores são iguais aos atuais.', { tipo: 'info' }); return; }
  const linhas = pend.map(x => `<li><b>${esc(x.p.nome)}</b><span class="num">${esc(valorTxt(x.p, x.de))} → <b>${esc(valorTxt(x.p, x.para))}</b></span></li>`)
    .concat(mm.map(m => `<li><b>${esc(m.r.nome)} · ${esc(m.rotulo)}</b><span class="num">${esc(m.de)} → <b>${esc(m.para)}</b></span></li>`)).join('');
  const ok = await ui.modal({
    titulo: 'Salvar novos padrões?', sub: 'As telas que usam estes valores mudam na hora para toda a equipe.', largura: 'md', confirmar: 'Salvar padrões',
    corpo: `<ul class="m-padroes-conf">${linhas}</ul><p class="sm mut">Fica no histórico com o seu nome. Dá para desfazer logo depois ou restaurar o padrão quando quiser.</p>`,
  });
  if (!ok) return;
  const quem = (ctx.real || ctx.user || {}).id;
  const antes = Object.fromEntries(pend.map(x => [x.p.id, x.de]));
  const antesMotor = {};
  tipos.forEach(t => { if (mudancasMotor(t).length) { const ent = lista.find(p => p.editor === t); antesMotor[t] = salvarMotor(t, quem, ent.id); } });
  if (pend.length) definir(Object.fromEntries(pend.map(x => [x.p.id, x.para])), quem);
  pend.forEach(x => rascunho.delete(x.p.id));
  tipos.forEach(t => [...rascunho.keys()].filter(k => k.startsWith(`${t}|`)).forEach(k => rascunho.delete(k)));
  const n = pend.length + mm.length;
  ui.toast(`${fmt.plural(n, 'padrão salvo', 'padrões salvos')}. As telas já usam os novos valores.`, {
    tipo: 'ok',
    desfazer: () => { if (pend.length) definir(antes, quem); Object.entries(antesMotor).forEach(([t, ov]) => db.setConfig(MOTORES[t].chave, ov, { log: `desfez a alteração de ${MOTORES[t].nome}` })); },
  });
  ctx.refresh();
}

function mount(el, ctx) {
  const pode = ctx.can('padroes', 'editar');
  let tq = null;
  const onInput = e => {
    const t = e.target;
    if (t.matches('[data-pd-q]')) {
      clearTimeout(tq); const v = t.value;
      tq = setTimeout(() => { router.setQuery({ q: v.trim() || null, item: null }, { render: true }); }, 260);
      return;
    }
    if (!pode) return;
    if (t.matches('[data-pd]')) { rascunho.set(t.dataset.pd, t.value); atualizar(el, ctx); return; }
    if (t.matches('[data-pd-m]')) { rascunho.set(t.dataset.pdM, t.value); atualizar(el, ctx); }
  };
  const onChange = e => { if (e.target.matches('select[data-pd]') && pode) { rascunho.set(e.target.dataset.pd, e.target.value); atualizar(el, ctx); } if (e.target.matches('[data-pd-m]') && pode) ctx.refresh(); };
  const onClick = async e => {
    const b = e.target.closest('button, a'); if (!b) return;
    if (b.matches('[data-pd-limpar]')) { router.setQuery({ q: null }, { render: true }); return; }
    if (b.matches('[data-pd-imprimir]')) { if (ctx.params.secao !== 'tudo' || ctx.query.q) { router.go('padroes/tudo'); setTimeout(() => window.print(), 500); } else window.print(); return; }
    if (!pode) return;
    if (b.matches('[data-pd-sw]')) {
      const k = b.dataset.pdSw; const [tipo, rid] = k.split('|');
      const r = regrasComRascunho(tipo).find(x => x.id === rid); if (!r) return;
      const novo = !r.ativo; if (novo === r.ativoAtual) rascunho.delete(k); else rascunho.set(k, novo);
      ctx.refresh(); return;
    }
    if (b.matches('[data-pd-descartar]')) {
      const lista = listaAtual(ctx); lista.forEach(p => rascunho.delete(p.id));
      tiposMotor(lista).forEach(t => [...rascunho.keys()].filter(k => k.startsWith(`${t}|`)).forEach(k => rascunho.delete(k)));
      ctx.refresh(); ctx.ui.toast('Alterações descartadas.', { tipo: 'info' }); return;
    }
    if (b.matches('[data-pd-salvar]')) { await salvar(ctx, el); return; }
    if (b.matches('[data-pd-restaurar]')) {
      const p = definicao(b.dataset.pdRestaurar); if (!p) return;
      const de = padrao(p.id);
      const ok = await ctx.ui.confirmar(`"${p.nome}" volta de ${valorTxt(p, de)} para o padrão de fábrica (${valorTxt(p, p.valor)}).`, { titulo: 'Restaurar o padrão?', confirmar: 'Restaurar' });
      if (!ok) return;
      const quem = (ctx.real || ctx.user || {}).id;
      restaurar([p.id], quem); rascunho.delete(p.id);
      ctx.ui.toast(`"${p.nome}" voltou ao padrão (${valorTxt(p, p.valor)}).`, { tipo: 'ok', desfazer: () => definir({ [p.id]: de }, quem) });
      ctx.refresh();
    }
  };
  const onKey = e => { if (e.key === 'Enter' && e.target.matches('[data-pd], [data-pd-m]')) { e.preventDefault(); const b = el.querySelector('[data-pd-salvar]'); if (b) b.click(); } };
  el.addEventListener('input', onInput); el.addEventListener('change', onChange); el.addEventListener('click', onClick); el.addEventListener('keydown', onKey);
  // foco: busca mantém o cursor; ?item= rola até o padrão
  const q = el.querySelector('[data-pd-q]');
  if (q && ctx.query.q) { q.focus(); const n = q.value.length; try { q.setSelectionRange(n, n); } catch (err) { /* ok */ } }
  if (ctx.query.item) { const alvo = el.querySelector(`[data-pd-item="${CSS.escape(ctx.query.item)}"]`); if (alvo) setTimeout(() => alvo.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60); }
  return () => { clearTimeout(tq); el.removeEventListener('input', onInput); el.removeEventListener('change', onChange); el.removeEventListener('click', onClick); el.removeEventListener('keydown', onKey); };
}

export default {
  id: 'padroes', titulo: 'Padrões e regras', icone: 'sliders', grupo: 'sistema', perm: 'padroes',
  rota: 'padroes', routes: ['padroes', 'padroes/:secao'],
  watch: ['settings', 'alertRules', 'users'],
  palavras: ['regras', 'limites', 'faixas', 'pesos', 'fórmulas', 'como calculamos', 'health score', 'ocupação', 'invasão', 'configurações'],
  render, mount,
  busca(q) {
    return buscar(q).slice(0, 8).map(p => ({ tipo: 'Padrões', titulo: p.nome, sub: `${(secaoDe(p.secao) || {}).rotulo || ''} · ${p.editor ? 'regras' : valorTxt(p, padrao(p.id))}`, href: `#/padroes/${p.secao}?item=${encodeURIComponent(p.id)}`, icone: 'sliders' }));
  },
};
