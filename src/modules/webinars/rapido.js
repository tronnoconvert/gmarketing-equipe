// rapido.js — "Lançar dia": lançamento diário rápido (captação e dias de carrinho) para quem preenche todo dia.
// Grava em webinarDaily no mesmo formato do formulário de 5 etapas (form.js): o total do webinar continua sendo a soma das linhas.
// Extras por linha (não usados pelo formulário): captação.origem {meta, google, …} e venda.checkout — servem para editar o dia
// sem contar duas vezes os totais guardados no webinar (captacao.origem e vendas.checkout).
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import { ui } from '../../core/ui.js';
import { notify } from '../../core/notify.js';
import { auth } from '../../core/auth.js';
import { status, podeEditar, ORIGENS, CANAIS, veReceita, hojeISO } from './calc.js';

const esc = fmt.esc;
const dig = s => String(s ?? '').replace(/\D/g, '');
const fmtInt = v => (v === null || v === undefined || v === '' ? '' : fmt.num(Number(v)));
const lerInt = v => { const d = dig(v); return d === '' ? null : Number(d); };
const div = (a, b) => (a == null || !b ? null : a / b);

/** que tipo de lançamento faz sentido hoje: 'captacao' antes da live, 'venda' do dia da live até 7 dias depois */
export function modoLancamento(w) {
  const dd = fmt.diasAte(w.data);
  if (dd === null) return null;
  if (dd > 0) return 'captacao';
  if (dd >= -7) return 'venda';
  return null;
}
/** mostra o botão "Lançar dia"? (webinar em captação ou carrinho aberto + quem pode editar) */
export function podeLancar(w) { return !!w && !!modoLancamento(w) && !w.rascunho && podeEditar(w); }

function linhasDe(w, tipo) { return db.list('webinarDaily', d => d.webinarId === w.id && d.tipo === tipo).sort((a, b) => String(a.data).localeCompare(String(b.data))); }
function anterior(w, tipo, data, canal) { return linhasDe(w, tipo).filter(d => d.data < data && (!canal || d.canal === canal)).pop() || null; }
function existente(w, tipo, data, canal) { return db.find('webinarDaily', d => d.webinarId === w.id && d.tipo === tipo && d.data === data && (tipo !== 'venda' || d.canal === canal)) || null; }

const int = (nome, rotulo, v, o = {}) => ui.campo({ nome, rotulo, valor: fmtInt(v), placeholder: '0', ajuda: o.ajuda, cls: o.cls, attrs: { 'data-int': '', inputmode: 'numeric', autocomplete: 'off' } });
const moeda = (nome, rotulo, v, o = {}) => ui.campo({ nome, rotulo, tipo: 'moeda', valor: v ?? '', ajuda: o.ajuda, cls: o.cls });

function corpoCaptacao(w, r) {
  const org = r.origem || {};
  const temOrg = ORIGENS.some(([k]) => org[k] != null);
  return `${moeda('investimento', 'Investimento (R$)', r.investimento, { ajuda: 'Valor gasto em anúncios neste dia (Gerenciador de Anúncios → coluna Valor usado).' })}
${int('impressoes', 'Impressões', r.impressoes)}
${int('cliques', 'Cliques no link', r.cliques, { ajuda: 'Cliques no link do anúncio (não use “cliques (todos)”).' })}
${int('inscritos', 'Inscritos', r.inscritos, { ajuda: 'Cadastros novos na página de inscrição neste dia.' })}
${int('grupo', 'Entradas no grupo', r.grupo, { ajuda: 'Pessoas que entraram no grupo de WhatsApp/Telegram neste dia.' })}
<div class="full m-webinars-qp" data-q-prev aria-live="polite"></div>
<details class="full m-webinars-qo"${temOrg ? ' open' : ''}><summary>Inscritos por origem <span class="mut">(opcional)</span></summary>
<div class="fgrid m-webinars-qog">${ORIGENS.map(([k, l]) => int(`origem.${k}`, l, org[k])).join('')}</div>
<p class="sm mut" data-q-org></p></details>`;
}
function corpoVenda(w, r, canal) {
  const rec = veReceita();
  return `${ui.campo({ nome: 'canal', rotulo: 'Canal', tipo: 'select', valor: canal, opcoes: Object.entries(CANAIS).map(([v, l]) => ({ v, l })) })}
${int('vendas', 'Quantidade de vendas', r.vendas)}
${int('checkout', 'Cliques no checkout', r.checkout, { ajuda: 'Quantas pessoas clicaram para o checkout neste dia. Soma no total de cliques no checkout do webinar.' })}
${rec ? moeda('faturamento', 'Faturamento (R$)', r.faturamento, { ajuda: 'Valor bruto das vendas do dia. Em branco: quantidade × ticket.' }) : ''}
<div class="full m-webinars-qp" data-q-prev aria-live="polite"></div>`;
}

/** abre o modal de lançamento. o = {data, tipo} */
export async function lancarDia(ctx, w0, o = {}) {
  const w = db.get('webinars', w0.id) || w0;
  if (!podeEditar(w)) { ui.toast('Só quem está escalado neste webinar pode lançar dados.', { tipo: 'warn' }); return false; }
  const tipo = o.tipo || modoLancamento(w) || 'captacao';
  const hoje = hojeISO();
  let data = o.data || (tipo === 'venda' && w.data > hoje ? w.data : hoje);
  if (data > hoje) data = hoje;
  const canalPadrao = d => (d === w.data ? 'ao_vivo' : 'carrinho');
  let canal = o.canal || canalPadrao(data);
  let ex = existente(w, tipo, data, canal);
  const rec = veReceita();
  const titulo = tipo === 'captacao' ? 'Lançar dia de captação' : 'Lançar dia de vendas';
  const corpo = `<form class="fgrid m-webinars-q" novalidate data-q-form>
${ui.campo({ nome: 'data', rotulo: 'Dia', tipo: 'data', valor: data, obrigatorio: true })}
<div class="fld m-webinars-qst" data-q-st aria-live="polite"></div>
<div class="full m-webinars-qsep"></div>
<div class="fgrid full m-webinars-qf" data-q-campos>${tipo === 'captacao' ? corpoCaptacao(w, ex || {}) : corpoVenda(w, ex || {}, canal)}</div>
</form>`;
  let salvo = null;
  const ok = await ui.modal({
    titulo, sub: `${w.tema} · live em ${fmt.data(w.data)}`, corpo, confirmar: 'Salvar dia', largura: 'md',
    onAbrir(box) {
      const f = box.querySelector('[data-q-form]');
      const campos = () => f.querySelector('[data-q-campos]');
      const okb = box.querySelector('[data-ok]');
      const st = f.querySelector('[data-q-st]');
      const prev = f.querySelector('[data-q-prev]');
      const lerDados = () => ui.form.ler(f);
      const preencher = r => {
        campos().querySelectorAll('[data-int]').forEach(i => { const k = i.name; const v = k.startsWith('origem.') ? (r.origem || {})[k.slice(7)] : r[k]; i.value = fmtInt(v); });
        campos().querySelectorAll('[data-mask="moeda"]').forEach(i => { const v = r[i.name]; i.value = v == null || v === '' ? '' : ui.mascaras.moeda(v); });
        const det = campos().querySelector('details'); if (det && r.origem && ORIGENS.some(([k]) => r.origem[k] != null)) det.open = true;
      };
      const atualizarEstado = () => {
        const d = lerDados(); const dia = d.data;
        const valida = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia);
        if (!valida) { st.innerHTML = ''; ex = null; okb.textContent = 'Salvar dia'; return; }
        if (tipo === 'venda') canal = d.canal || canal;
        const novoEx = existente(w, tipo, dia, canal);
        if (dia > hoje) st.innerHTML = `<span class="t-err sm">${ui.ic('alert')} Dia no futuro. Lance só o que já aconteceu (até hoje, ${fmt.data(hoje)}).</span>`;
        else if (novoEx) st.innerHTML = `<span class="t-warn sm">${ui.ic('edit')} ${fmt.data(dia)} já foi lançado${tipo === 'venda' ? ` (${CANAIS[canal]})` : ''}. Você está <b>editando</b> esse dia.</span>`;
        else st.innerHTML = `<span class="mut sm">${ui.ic('plus')} Dia ainda não lançado</span>`;
        if ((novoEx && novoEx !== ex && (!ex || novoEx.id !== ex.id)) || (!novoEx && ex)) { preencher(novoEx || {}); }
        ex = novoEx;
        okb.textContent = ex ? 'Salvar alterações' : 'Salvar dia';
      };
      const atualizarPrev = () => {
        const d = lerDados(); const dia = d.data && /^\d{4}-\d{2}-\d{2}$/.test(d.data) ? d.data : hoje;
        const ints = {}; campos().querySelectorAll('[data-int]').forEach(i => { ints[i.name] = lerInt(i.value); });
        if (tipo === 'captacao') {
          const inv = d.investimento === '' || d.investimento == null ? null : Number(d.investimento);
          const cpl = div(inv, ints.inscritos), ctr = ints.cliques != null && ints.impressoes ? (ints.cliques / ints.impressoes) * 100 : null;
          const a = anterior(w, 'captacao', dia);
          const cplA = a ? div(a.investimento, a.inscritos) : null, ctrA = a && a.impressoes ? (a.cliques / a.impressoes) * 100 : null;
          const comp = (v, va, f, inverso, pp) => {
            if (v == null) return '<span class="mut">—</span>';
            let dl = '';
            if (va != null && va) { const x = pp ? v - va : ((v - va) / va) * 100; const bom = inverso ? x < 0 : x > 0; dl = Math.abs(x) < (pp ? 0.005 : 0.05) ? '<span class="mut sm">igual</span>' : `<span class="sm ${bom ? 't-ok' : 't-err'}">${x > 0 ? '▲' : '▼'} ${pp ? `${fmt.dec(Math.abs(x), 2)} pp` : fmt.pct(Math.abs(x), 1)}</span>`; }
            return `<b class="num">${f(v)}</b> ${dl}`;
          };
          prev.innerHTML = `<div class="m-webinars-qpg"><div><span class="sm mut">Custo por inscrito</span>${comp(cpl, cplA, fmt.brl2, true)}<span class="sm mut">${a ? `${fmt.dataCurta(a.data)}: ${cplA != null ? fmt.brl2(cplA) : '—'}` : 'primeiro dia lançado'}</span></div>
<div><span class="sm mut">CTR</span>${comp(ctr, ctrA, v => fmt.pct(v, 2), false, true)}<span class="sm mut">${a ? `${fmt.dataCurta(a.data)}: ${ctrA != null ? fmt.pct(ctrA, 2) : '—'}` : 'ref. 0,8–1,5%'}</span></div>
<div><span class="sm mut">Entrada no grupo</span>${ints.grupo != null && ints.inscritos ? `<b class="num">${fmt.pct((ints.grupo / ints.inscritos) * 100, 0)}</b>` : '<span class="mut">—</span>'}<span class="sm mut">dos inscritos · ref. 50–70%</span></div></div>`;
          const og = f.querySelector('[data-q-org]');
          if (og) { const vs = ORIGENS.map(([k]) => ints[`origem.${k}`]).filter(v => v != null); const s = vs.reduce((x, y) => x + y, 0); og.textContent = vs.length ? (ints.inscritos != null && s !== ints.inscritos ? `Soma por origem: ${fmt.num(s)} · difere dos ${fmt.num(ints.inscritos)} inscritos do dia.` : `Soma por origem: ${fmt.num(s)}.`) : 'Deixe em branco se não souber; dá para completar depois no formulário completo.'; og.className = `sm ${vs.length && ints.inscritos != null && s !== ints.inscritos ? 't-warn' : 'mut'}`; }
        } else {
          const vt = linhasDe(w, 'venda').filter(x => !ex || x.id !== ex.id).reduce((s, x) => s + (Number(x.vendas) || 0), 0) + (ints.vendas || 0);
          const conv = ints.vendas != null && ints.checkout ? (ints.vendas / ints.checkout) * 100 : null;
          prev.innerHTML = `<div class="m-webinars-qpg"><div><span class="sm mut">Vendas no lançamento</span><b class="num">${fmt.num(vt)}</b><span class="sm mut">${w.metaVendas ? `meta ${fmt.num(w.metaVendas)}` : 'sem meta'}</span></div>
<div><span class="sm mut">Checkout → venda</span>${conv != null ? `<b class="num">${fmt.pct(conv, 0)}</b>` : '<span class="mut">—</span>'}<span class="sm mut">ref. 20–40%</span></div>
${rec && w.ticket ? `<div><span class="sm mut">Pelo ticket</span><b class="num">${ints.vendas != null ? fmt.brl(ints.vendas * w.ticket) : '—'}</b><span class="sm mut">${fmt.brl(w.ticket)} por venda</span></div>` : ''}</div>`;
        }
      };
      f.addEventListener('input', e => {
        const t = e.target;
        if (t.hasAttribute('data-int')) { const d = dig(t.value).slice(0, 10); const nv = d === '' ? '' : fmt.num(Number(d)); if (nv !== t.value) t.value = nv; }
        // a máscara de data do core formata depois deste handler: lê no próximo ciclo
        if (t.name === 'data' || t.name === 'canal') { setTimeout(() => { atualizarEstado(); atualizarPrev(); }, 0); return; }
        atualizarPrev();
      });
      f.addEventListener('change', e => { if (e.target.name === 'canal' || e.target.name === 'data') { atualizarEstado(); atualizarPrev(); } });
      atualizarEstado(); atualizarPrev();
      // foco no primeiro número (a data já vem com hoje)
      setTimeout(() => { const p = campos().querySelector(tipo === 'captacao' ? '[name="investimento"]' : '[name="vendas"]'); p && p.focus(); }, 30);
    },
    onConfirmar(box) {
      const f = box.querySelector('[data-q-form]');
      ui.form.limparErros(f);
      const d = ui.form.ler(f);
      const erro = (nome, msg) => { const i = f.querySelector(`[name="${nome}"]`); const det = i && i.closest('details'); if (det) det.open = true; ui.form.validar(f, { [nome]: [() => msg] }); if (i) i.focus(); return false; };
      if (!d.data || !/^\d{4}-\d{2}-\d{2}$/.test(d.data)) return erro('data', 'Informe o dia no formato dd/mm/aaaa.');
      if (d.data > hoje) return erro('data', `O dia não pode ser no futuro. Use até ${fmt.data(hoje)}.`);
      const ints = {}; f.querySelectorAll('[data-int]').forEach(i => { ints[i.name] = lerInt(i.value); });
      const usuario = auth.user();
      let linha, log;
      if (tipo === 'captacao') {
        const inv = d.investimento === '' || d.investimento == null ? null : Number(d.investimento);
        const vals = { investimento: inv, impressoes: ints.impressoes, cliques: ints.cliques, inscritos: ints.inscritos, grupo: ints.grupo };
        if (Object.values(vals).every(v => v == null)) return erro('investimento', 'Preencha pelo menos um número do dia (investimento, impressões, cliques, inscritos ou grupo).');
        if (inv != null && inv < 0) return erro('investimento', 'O investimento não pode ser negativo.');
        if (vals.cliques != null && vals.impressoes != null && vals.cliques > vals.impressoes) return erro('cliques', `Cliques (${fmt.num(vals.cliques)}) maiores que impressões (${fmt.num(vals.impressoes)}). Confira os números no Gerenciador.`);
        if (vals.grupo != null && vals.inscritos != null && vals.grupo > vals.inscritos * 3) return erro('grupo', 'Entradas no grupo muito acima dos inscritos do dia. Confira o número.');
        const org = {}; ORIGENS.forEach(([k]) => { if (ints[`origem.${k}`] != null) org[k] = ints[`origem.${k}`]; });
        const temOrg = Object.keys(org).length > 0;
        if (temOrg && vals.inscritos != null) { const s = Object.values(org).reduce((a, b) => a + b, 0); if (s !== vals.inscritos) return erro('origem.meta', `A soma por origem (${fmt.num(s)}) precisa bater com os ${fmt.num(vals.inscritos)} inscritos do dia, ou deixe a origem em branco.`); }
        linha = { ...vals, ...(temOrg ? { origem: org } : {}) };
        log = `${ex ? 'editou' : 'lançou'} a captação de ${fmt.dataCurta(d.data)} do webinar "${w.tema}"`;
      } else {
        const can = d.canal || canal;
        const vals = { vendas: ints.vendas, checkout: ints.checkout };
        if (vals.vendas == null && vals.checkout == null && !(rec && d.faturamento)) return erro('vendas', 'Preencha a quantidade de vendas ou os cliques no checkout do dia.');
        if (vals.vendas != null && vals.checkout != null && vals.vendas > vals.checkout && can !== 'replay') return erro('vendas', `Vendas (${fmt.num(vals.vendas)}) maiores que cliques no checkout (${fmt.num(vals.checkout)}). Confira os números.`);
        let fat;
        if (rec) fat = d.faturamento === '' || d.faturamento == null ? (vals.vendas != null && w.ticket ? vals.vendas * w.ticket : null) : Number(d.faturamento);
        else fat = ex ? ex.faturamento ?? null : null; // mesmo critério do formulário: sem permissão de receita, não mexe em dinheiro
        linha = { canal: can, vendas: vals.vendas ?? 0, faturamento: fat, ...(vals.checkout != null ? { checkout: vals.checkout } : {}) };
        canal = can;
        log = `${ex ? 'editou' : 'lançou'} as vendas (${CANAIS[can].toLowerCase()}) de ${fmt.dataCurta(d.data)} do webinar "${w.tema}"`;
      }
      // grava: linha diária + totais derivados no webinar (origem e checkout), num único evento
      const antesW = db.get('webinars', w.id); const antesL = ex ? { ...ex } : null;
      const patch = {};
      if (tipo === 'captacao' && (linha.origem || (antesL && antesL.origem))) {
        const o0 = { ...((antesW.captacao || {}).origem || {}) };
        ORIGENS.forEach(([k]) => { const novo = (linha.origem || {})[k] || 0, velho = ((antesL && antesL.origem) || {})[k] || 0; if (novo !== velho || o0[k] != null) o0[k] = Math.max(0, (Number(o0[k]) || 0) + novo - velho); });
        patch.captacao = { ...(antesW.captacao || {}), origem: o0 };
      }
      if (tipo === 'venda' && (linha.checkout != null || (antesL && antesL.checkout != null))) {
        const c0 = Number((antesW.vendas || {}).checkout) || 0; const novo = linha.checkout || 0, velho = (antesL && antesL.checkout) || 0;
        patch.vendas = { ...(antesW.vendas || {}), checkout: Math.max(0, c0 + novo - velho) };
      }
      db.batch(() => {
        if (ex) salvo = db.update('webinarDaily', ex.id, { ...linha, data: d.data });
        else salvo = db.insert('webinarDaily', { id: `wd-${w.id}-${tipo === 'captacao' ? 'c' : 'v'}-${d.data.replace(/-/g, '')}-${Date.now().toString(36)}`, webinarId: w.id, tipo: tipo === 'captacao' ? 'captacao' : 'venda', data: d.data, ...linha });
        db.update('webinars', w.id, patch, { log });
      });
      // pedidos de preenchimento desta parte que estavam abertos para mim: resolvidos
      const sec = tipo === 'captacao' ? 'captacao' : 'vendas';
      const minhas = usuario ? db.list('notifications', n => n.para === usuario.id && !n.lida && n.refCol === 'webinars' && n.refId === w.id && String(n.link || '').includes(`etapa=${sec}`)) : [];
      minhas.forEach(n => notify.marcarLida(n.id, true));
      const desfazer = () => db.batch(() => {
        if (antesL) db.insert('webinarDaily', antesL); else db.remove('webinarDaily', salvo.id);
        db.insert('webinars', antesW);
        minhas.forEach(n => notify.marcarLida(n.id, false));
      });
      const resumo = tipo === 'captacao'
        ? [linha.inscritos != null ? fmt.plural(linha.inscritos, 'inscrito') : '', linha.investimento != null && linha.inscritos ? `CPL ${fmt.brl2(linha.investimento / linha.inscritos)}` : ''].filter(Boolean).join(' · ')
        : [fmt.plural(linha.vendas || 0, 'venda'), linha.checkout != null ? `${fmt.num(linha.checkout)} no checkout` : ''].filter(Boolean).join(' · ');
      ui.toast(`${fmt.data(d.data)} ${ex ? 'atualizado' : 'lançado'}${resumo ? `: ${resumo}` : ''}.${minhas.length ? ' Pedido de preenchimento resolvido.' : ''}`, { desfazer });
      return true;
    },
  });
  return ok ? salvo : false;
}

/** comandos para a paleta do core: um por webinar em captação que eu posso preencher */
export function comandosLancar() {
  return db.list('webinars', w => !w.rascunho && modoLancamento(w) === 'captacao' && (status(w) === 'captacao' || fmt.diasAte(w.data) <= 21) && podeEditar(w))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))
    .map(w => ({ id: `webinars:lancar:${w.id}`, titulo: 'Lançar dia do webinar', sub: w.tema, icone: 'plus', href: `#/webinars/${w.id}?lancar=1`, palavras: ['lançar dia', 'captação', 'inscritos', 'investimento', w.tema] }));
}
