// regras.js — aba "Regras da IA" (#/campanha/regras): liga/desliga regras do motor único, edita limites (validados) e mostra
// quais regras funcionam (sugestões em 30 dias, % aceitas, % que deram certo 7 dias depois). Salvo em settings 'motorRegras'
// (a mesma configuração que a Torre de Controle lê).
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import { MotorRecs, overrides, regrasAtuais, estatisticas } from './engine.js';

const esc = fmt.esc;
const CHAVE = 'motorRegras';
const SEM_PERM = 'Só o dono altera as regras. Seu perfil pode apenas ver.';
const rascunho = new Map(); // "regra.chave" -> texto digitado e ainda não salvo (sobrevive a re-render)
const SUCESSO = {
  escala: 'resultados subiram e o custo ficou dentro do alvo', custo: 'o custo por resultado caiu', custoConjunto: 'o custo do conjunto caiu',
  ctr: 'o CTR subiu', gasto: 'a conta voltou a gastar', resultados: 'os resultados voltaram a subir', cpm: 'o CPM caiu',
};
const lerNum = v => { const s = String(v ?? '').trim().replace(/\s|%|×|x|R\$/gi, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); return s === '' ? '' : Number(s); };
const mostra = (p, v) => (p.unidade === '×' || p.passo < 1 ? fmt.dec(v, 1) : fmt.num(v));
const pctOu = (v, sub) => (v == null ? `<span class="mut">—</span>${sub ? `<small>${sub}</small>` : ''}` : `<b>${fmt.pct(v * 100, 0)}</b>${sub ? `<small>${sub}</small>` : ''}`);

export function regrasAba(ctx) {
  const { ui } = ctx; const pode = ctx.can('campanha', 'editar');
  const rs = regrasAtuais(); const st = estatisticas(30); const ov = overrides();
  const tot = Object.values(st).reduce((a, s) => ({ sug: a.sug + s.sugestoes, dec: a.dec + s.decididas, ac: a.ac + s.aceitas, av: a.av + s.avaliadas, ok: a.ok + s.deramCerto }), { sug: 0, dec: 0, ac: 0, av: 0, ok: 0 });
  const ativas = rs.filter(r => r.ativo).length; const alteradas = rs.filter(r => r.alterada).length;
  const kpis = `<div class="g-kpi m-campanha-rgk">
${ui.kpi({ rotulo: 'Regras ativas', valor: `${ativas} de ${rs.length}`, comp: alteradas ? `${fmt.plural(alteradas, 'regra ajustada', 'regras ajustadas')}` : 'todas no padrão', ajuda: 'Regras desligadas não geram recomendação aqui nem na Torre de Controle.' })}
${ui.kpi({ rotulo: 'Sugestões em 30 dias', valor: fmt.num(tot.sug), comp: `${fmt.num(tot.dec)} decididas`, ajuda: 'Recomendações geradas nos últimos 30 dias: as que já foram decididas (aceitas, ignoradas ou adiadas) + as pendentes agora.' })}
${ui.kpi({ rotulo: 'Aceitas', valor: tot.dec ? fmt.pct((tot.ac / tot.dec) * 100, 0) : '—', comp: `${fmt.num(tot.ac)} de ${fmt.num(tot.dec)} decididas`, ajuda: 'Percentual das recomendações decididas que foram aplicadas. Taxa baixa numa regra = limites desalinhados com o seu jeito de gerir.' })}
${ui.kpi({ rotulo: 'Deram certo', valor: tot.av ? fmt.pct((tot.ok / tot.av) * 100, 0) : '—', comp: `${fmt.num(tot.ok)} de ${fmt.num(tot.av)} avaliadas`, ajuda: '7 dias depois de aplicar, o motor compara a métrica da regra (custo, CTR, resultados, CPM ou gasto) nos 7 dias antes × 7 dias depois.' })}
</div>`;
  const linha = r => {
    const s = st[r.id]; const padrao = MotorRecs.REGRAS_PADRAO.find(x => x.id === r.id);
    const params = r.params.length ? r.params.map((p, i) => {
      const k = `${r.id}.${p.chave}`; const txt = rascunho.has(k) ? rascunho.get(k) : mostra(p, p.valor); const pd = padrao.params[i].valor;
      const id = `rg-${r.id}-${p.chave}`;
      return `<div class="m-campanha-pm"><label for="${id}">${esc(p.rotulo)}</label><span class="m-campanha-pmi">${p.unidade === 'R$' ? '<em>R$</em>' : ''}<input id="${id}" type="text" inputmode="decimal" autocomplete="off" name="${esc(k)}" value="${esc(txt)}" data-pm="${esc(k)}" aria-describedby="${id}-d"${pode ? '' : ` disabled title="${SEM_PERM}"`}>${p.unidade === 'n' || p.unidade === 'R$' ? '' : `<em>${esc(p.unidade)}</em>`}</span><small id="${id}-d">${esc(p.ajuda ? p.ajuda + ' · ' : '')}${p.valor !== pd ? `padrão ${esc(MotorRecs.rotValor(p, pd))}` : `de ${esc(MotorRecs.rotValor(p, p.min))} a ${esc(MotorRecs.rotValor(p, p.max))}`}</small></div>`;
    }).join('') : '<p class="sm mut m-campanha-pm0">Sem limites ajustáveis: a regra só liga ou desliga.</p>';
    return `<li class="m-campanha-rg${r.ativo ? '' : ' off'}${ctx.query.regra === r.id ? ' alvo' : ''}" data-rg="${esc(r.id)}" id="regra-${esc(r.id)}">
<div class="m-campanha-rgs"><button type="button" class="m-campanha-sw" role="switch" aria-checked="${r.ativo}" aria-label="Regra ${esc(r.nome)} ${r.ativo ? 'ativa' : 'desligada'}" data-rg-ativo="${esc(r.id)}"${pode ? '' : ` disabled title="${SEM_PERM}"`}><i></i></button></div>
<div class="m-campanha-rgi"><div class="m-campanha-rgn"><b>${esc(r.nome)}</b>${r.alterada ? `<span class="m-campanha-rgal">${ui.selo('warn', 'ajustada')}</span>` : ''}</div>
<p class="m-campanha-rgm">${esc(MotorRecs.ROTULO_NIVEL[r.nivel])} · ${esc(MotorRecs.ROTULO_ACAO[r.acao])} · ${esc(MotorRecs.ROTULO_PRIO[r.prioridade])}</p>
<p class="m-campanha-rgd">${esc(r.descricao)}</p>${r.sucesso ? `<p class="sm mut">Dá certo quando ${esc(SUCESSO[r.sucesso])} nos 7 dias seguintes.</p>` : '<p class="sm mut">Regra informativa: não tem medição de acerto.</p>'}</div>
<div class="m-campanha-rgp">${params}</div>
<div class="m-campanha-rgx"><div><span>Sugestões</span><b>${fmt.num(s.sugestoes)}</b><small>30 dias</small></div><div><span>Aceitas</span>${pctOu(s.taxaAceite, s.decididas ? `${s.aceitas} de ${s.decididas}` : 'sem decisões')}</div><div><span>Deram certo</span>${r.sucesso ? pctOu(s.taxaSucesso, s.avaliadas ? `${s.deramCerto} de ${s.avaliadas}` : 'nada avaliado') : '<span class="mut">—</span><small>não se aplica</small>'}</div></div>
</li>`;
  };
  const sujo = rascunho.size > 0;
  return `${kpis}
${ui.card({
    titulo: 'Regras da IA', icone: 'sliders', pad: false,
    sub: 'O mesmo motor de recomendações da Torre de Controle. Ajuste os limites, desligue o que não serve e veja quais regras funcionam.',
    ajuda: 'Cada regra olha os últimos 3, 7 e 14 dias de cada conjunto, campanha e anúncio. Mudanças valem na hora para "Decisões recomendadas" e para a Torre de Controle.',
    acoes: `${ui.btn({ rotulo: 'Restaurar padrão', icone: 'refresh', sm: true, tipo: 'ghost', attrs: { 'data-rg-padrao': '' }, disabled: !pode || !Object.keys(ov).length, title: pode ? (Object.keys(ov).length ? '' : 'As regras já estão no padrão.') : SEM_PERM })}`,
    corpo: `<div class="m-campanha-rgh" aria-hidden="true"><span></span><span>Regra</span><span>Limites</span><span>Últimos 30 dias</span></div><ul class="m-campanha-rgl">${rs.map(linha).join('')}</ul>
<div class="m-campanha-rgf"><p class="sm mut" data-rg-status>${sujo ? `${fmt.plural(rascunho.size, 'alteração não salva', 'alterações não salvas')}.` : 'Nenhuma alteração pendente.'}${db.mode === 'demo' ? ' Na demonstração o histórico de decisões é ilustrativo.' : ''}</p><div class="row">${ui.btn({ rotulo: 'Descartar', sm: true, tipo: 'ghost', attrs: { 'data-rg-descartar': '' }, disabled: !pode || !sujo })}${ui.btn({ rotulo: 'Salvar alterações', icone: 'check', sm: true, tipo: 'pri', attrs: { 'data-rg-salvar': '' }, disabled: !pode || !sujo, title: pode ? '' : SEM_PERM })}</div></div>`,
  })}`;
}

/* ---------------- interação ---------------- */
function erroCampo(inp, msg) {
  const box = inp.closest('.m-campanha-pm'); let e = box.querySelector('.fld-err');
  if (!msg) { inp.removeAttribute('aria-invalid'); if (e) e.remove(); return; }
  inp.setAttribute('aria-invalid', 'true');
  if (!e) { e = document.createElement('p'); e.className = 'fld-err'; e.id = `${inp.id}-e`; box.appendChild(e); inp.setAttribute('aria-describedby', `${inp.id}-d ${inp.id}-e`); }
  e.textContent = msg;
}
/** valida os campos de uma regra (cada um + restrições entre eles) e marca os erros; devolve {ok, params} */
function validarRegra(el, regraId) {
  const li = el.querySelector(`[data-rg="${CSS.escape(regraId)}"]`); if (!li) return { ok: true, params: {} };
  const params = {}; li.querySelectorAll('[data-pm]').forEach(i => { params[i.dataset.pm.split('.')[1]] = lerNum(i.value); });
  const r = MotorRecs.validar(regraId, params);
  li.querySelectorAll('[data-pm]').forEach(i => erroCampo(i, r.erros[i.dataset.pm.split('.')[1]] || ''));
  return { ok: r.ok, params };
}
function atualizarRodape(el) {
  const st = el.querySelector('[data-rg-status]'); if (!st) return;
  const n = rascunho.size; const extra = db.mode === 'demo' ? ' Na demonstração o histórico de decisões é ilustrativo.' : '';
  st.textContent = `${n ? `${fmt.plural(n, 'alteração não salva', 'alterações não salvas')}.` : 'Nenhuma alteração pendente.'}${extra}`;
  el.querySelectorAll('[data-rg-salvar],[data-rg-descartar]').forEach(b => { b.disabled = !n; });
}
function salvarOv(ctx, novo, msg) {
  const antes = overrides();
  db.setConfig(CHAVE, novo, { log: msg });
  ctx.ui.toast(`${msg[0].toUpperCase()}${msg.slice(1)}.`, { desfazer: () => db.setConfig(CHAVE, antes) });
}
/** overrides só com o que difere do padrão */
function limpar(ov) {
  const out = {};
  MotorRecs.REGRAS_PADRAO.forEach(p => {
    const x = ov[p.id]; if (!x) return; const o = {};
    if (typeof x.ativo === 'boolean' && x.ativo !== p.ativo) o.ativo = x.ativo;
    const ps = {}; p.params.forEach(q => { if (x.params && x.params[q.chave] != null && Number(x.params[q.chave]) !== q.valor) ps[q.chave] = Number(x.params[q.chave]); });
    if (Object.keys(ps).length) o.params = ps;
    if (Object.keys(o).length) out[p.id] = o;
  });
  return out;
}

export function montarRegras(el, ctx) {
  const pode = ctx.can('campanha', 'editar');
  if (ctx.query.regra) { const li = el.querySelector(`#regra-${CSS.escape(ctx.query.regra)}`); if (li) setTimeout(() => li.scrollIntoView({ block: 'center' }), 30); }
  const onInput = e => {
    const i = e.target.closest('[data-pm]'); if (!i) return;
    const [rid, ch] = i.dataset.pm.split('.'); const r = regrasAtuais().find(x => x.id === rid); const p = r.params.find(x => x.chave === ch);
    const v = lerNum(i.value);
    if (v !== '' && v === p.valor) rascunho.delete(i.dataset.pm); else rascunho.set(i.dataset.pm, i.value);
    validarRegra(el, rid); atualizarRodape(el);
  };
  const onClick = async e => {
    const t = e.target; if (!pode) return;
    const sw = t.closest('[data-rg-ativo]');
    if (sw) {
      const id = sw.dataset.rgAtivo; const r = regrasAtuais().find(x => x.id === id); const ov = JSON.parse(JSON.stringify(overrides()));
      ov[id] = { ...(ov[id] || {}), ativo: !r.ativo };
      salvarOv(ctx, limpar(ov), `${r.ativo ? 'desligou' : 'ligou'} a regra "${r.nome}"`);
      return;
    }
    if (t.closest('[data-rg-descartar]')) { rascunho.clear(); ctx.refresh(); return; }
    if (t.closest('[data-rg-salvar]')) {
      const ids = [...new Set([...rascunho.keys()].map(k => k.split('.')[0]))]; let primeiro = null; const ov = JSON.parse(JSON.stringify(overrides()));
      ids.forEach(id => { const v = validarRegra(el, id); if (!v.ok && !primeiro) primeiro = el.querySelector(`[data-rg="${CSS.escape(id)}"] [aria-invalid="true"]`); ov[id] = { ...(ov[id] || {}), params: { ...((ov[id] || {}).params || {}), ...v.params } }; });
      if (primeiro) { ctx.ui.toast('Corrija os limites destacados. Nada foi salvo.', { tipo: 'err' }); primeiro.focus(); return; }
      const nomes = ids.map(id => MotorRecs.REGRAS_PADRAO.find(x => x.id === id).nome);
      rascunho.clear();
      salvarOv(ctx, limpar(ov), `ajustou ${nomes.length === 1 ? `a regra "${nomes[0]}"` : `${nomes.length} regras da IA`}`);
      return;
    }
    if (t.closest('[data-rg-padrao]')) {
      const ok = await ctx.ui.confirmar('Todas as regras voltam a ficar ligadas, com os limites originais. O histórico de decisões continua.', { titulo: 'Restaurar as regras padrão?', confirmar: 'Restaurar padrão' });
      if (!ok) return;
      rascunho.clear(); salvarOv(ctx, {}, 'restaurou as regras padrão da IA');
    }
  };
  el.addEventListener('input', onInput); el.addEventListener('click', onClick);
  return () => { el.removeEventListener('input', onInput); el.removeEventListener('click', onClick); };
}
