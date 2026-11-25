// form.js — "Preencher dados" / "Novo webinar": formulário em etapas, rascunho automático, máscaras, cálculos ao vivo e alertas de coerência.
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import { ui } from '../../core/ui.js';
import { notify } from '../../core/notify.js';
import { auth } from '../../core/auth.js';
import { metricas, diario, SECOES, CANAIS, ORIGENS, PLATAFORMAS, BENCH, ledBench, temValor, userDoTime, nomeTime, hojeISO, veReceita } from './calc.js';
import { checklistPadrao, EQUIPE_PADRAO } from './data.js';

const esc = fmt.esc;
const KEY = id => `aos-wb-rasc:${id || 'novo'}`;
const ETAPAS = SECOES.map(s => s.id);
const SEC_EQ = [['captacao', 'Captação'], ['aovivo', 'Ao vivo'], ['vendas', 'Vendas'], ['pos', 'Pós']];

const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { /* sem storage */ } };

const dig = s => String(s ?? '').replace(/\D/g, '');
const fmtInt = v => (v === null || v === undefined || v === '' ? '' : fmt.num(Number(v)));
const parseInt0 = s => { const d = dig(s); return d === '' ? null : Number(d); };
const maskHora = v => { const d = dig(v).slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d; };
const somaD = (l, k) => l.reduce((a, x) => a + (Number(x[k]) || 0), 0);

const NOTA_RECEITA = 'Valores de faturamento: visíveis só para administradores.';
const VENDAS_DINHEIRO = ['reembolsos', 'pendentes', 'custos', 'taxa'];
/** quem não vê receita não recebe ticket, faturamento, reembolsos, pendentes, custos nem taxa no estado (nem no rascunho local) */
function semDinheiro(st) {
  if (veReceita()) return st;
  const vendas = { ...(st.vendas || {}) }; VENDAS_DINHEIRO.forEach(k => { delete vendas[k]; });
  return { ...st, ticket: null, vendas, ven: (st.ven || []).map(v => ({ ...v, faturamento: null })) };
}
/** ao salvar sem ver receita: os valores em R$ vêm do que já está gravado (ninguém apaga o que não vê) */
function preservarDinheiro(st, antes, linhasAntes) {
  if (veReceita()) return st;
  const vAnt = (antes && antes.vendas) || {}; const vendas = { ...st.vendas };
  VENDAS_DINHEIRO.forEach(k => { if (vAnt[k] !== undefined) vendas[k] = vAnt[k]; else delete vendas[k]; });
  const usadas = new Set();
  const ven = st.ven.map(v => {
    const par = linhasAntes.find(d => d.tipo === 'venda' && !usadas.has(d.id) && d.data === v.data && d.canal === v.canal);
    if (par) usadas.add(par.id);
    // _par: a linha já gravada continua com o mesmo id (o servidor preserva o faturamento que esta pessoa não vê)
    return { ...v, faturamento: par ? par.faturamento ?? null : null, ...(par ? { _par: par.id } : {}) };
  });
  return { ...st, ticket: antes ? antes.ticket ?? null : null, vendas, ven };
}

/** estado do formulário a partir de um webinar (ou vazio) */
function estadoDe(w) { return semDinheiro(estadoDe0(w)); }
function estadoDe0(w) {
  if (!w) {
    return {
      id: null, tema: '', data: '', hora: '20:00', apresentador: db.dadosDemo ? 't-gabriel' : ((auth.user() || {}).teamId || ''), plataforma: 'YouTube', oferta: '', ticket: null, metaInscritos: null, metaVendas: null, orcamento: null,
      // equipe sugerida: a de exemplo no modo demonstração; em produção só quem existe no cadastro
      equipe: EQUIPE_PADRAO.filter(e => db.dadosDemo || db.get('team', e.id)).map(e => ({ ...e, secoes: [...e.secoes] })), origem: {}, aovivo: { curva: [] }, vendas: {}, pos: {}, notas: '', cap: [], ven: [],
    };
  }
  const d = diario(w.id);
  return {
    id: w.id, tema: w.tema || '', data: w.data || '', hora: w.hora || '', apresentador: w.apresentador || '', plataforma: w.plataforma || '', oferta: w.oferta || '',
    ticket: w.ticket ?? null, metaInscritos: w.metaInscritos ?? null, metaVendas: w.metaVendas ?? null, orcamento: w.orcamento ?? null,
    equipe: (w.equipe || []).map(e => ({ ...e, secoes: [...(e.secoes || [])] })), origem: { ...((w.captacao || {}).origem || {}) },
    aovivo: { ...(w.aovivo || {}), curva: ((w.aovivo || {}).curva || []).map(p => [...p]) }, vendas: { ...(w.vendas || {}) }, pos: { ...(w.pos || {}) }, notas: w.notas || '',
    cap: d.captacao.map(({ data, investimento, impressoes, cliques, inscritos, grupo }) => ({ data, investimento, impressoes, cliques, inscritos, grupo })),
    ven: d.vendas.map(({ data, canal, vendas, faturamento }) => ({ data, canal, vendas, faturamento })),
  };
}

/* ---------------- campos ---------------- */
const inp = (o) => {
  const k = o.k; const v = o.v;
  let val = '', attrs = '';
  if (o.t === 'moeda') { val = v == null || v === '' ? '' : ui.mascaras.moeda(Number(v)); attrs = ' data-mask="moeda" inputmode="numeric" placeholder="R$ 0,00"'; }
  else if (o.t === 'int') { val = fmtInt(v); attrs = ` data-wm="int" inputmode="numeric" placeholder="${esc(o.ph || '0')}"`; }
  else if (o.t === 'data') { val = v ? ui.mascaras.data(v) : ''; attrs = ' data-mask="data" inputmode="numeric" placeholder="dd/mm/aaaa"'; }
  else if (o.t === 'hora') { val = v || ''; attrs = ' data-wm="hora" inputmode="numeric" placeholder="hh:mm"'; }
  else { val = v ?? ''; attrs = o.ph ? ` placeholder="${esc(o.ph)}"` : ''; }
  return `<input type="text" autocomplete="off" aria-label="${esc(o.l)}"${o.name ? ` name="${esc(o.name)}"` : ''}${o.r ? ` data-r="${o.r}" data-i="${o.i}" data-k="${k}"` : ''} value="${esc(val)}"${attrs}>`;
};
/** campo com rótulo, ajuda, dica */
function fld(o) {
  const id = ui.novoId('wf');
  const ctl = o.t === 'select'
    ? `<select id="${id}" name="${esc(o.name)}">${o.ph ? `<option value="">${esc(o.ph)}</option>` : ''}${o.opcoes.map(x => `<option value="${esc(x.v)}"${String(o.v ?? '') === String(x.v) ? ' selected' : ''}>${esc(x.l)}</option>`).join('')}</select>`
    : o.t === 'textarea' ? `<textarea id="${id}" name="${esc(o.name)}" rows="${o.linhas || 3}" placeholder="${esc(o.ph || '')}">${esc(o.v ?? '')}</textarea>`
      : o.t === 'percent' ? `<div class="inp-suf"><input id="${id}" type="text" name="${esc(o.name)}" data-mask="percent" inputmode="decimal" autocomplete="off" value="${esc(o.v == null ? '' : String(o.v).replace('.', ','))}" placeholder="0,0"><span>%</span></div>`
        : inp({ ...o }).replace('<input ', `<input id="${id}" `);
  return `<div class="fld${o.cls ? ' ' + o.cls : ''}"><label for="${id}">${esc(o.l)}${o.req ? '<span class="req" aria-hidden="true">*</span>' : ''}${o.ajuda ? ui.ajuda(o.ajuda) : ''}</label>${ctl}${o.dica ? `<p class="fld-d">${esc(o.dica)}</p>` : ''}</div>`;
}

/* ---------------- linhas ---------------- */
const btnRm = (r, i, l) => `<button type="button" class="ib m-webinars-rm" data-rm="${r}" data-i="${i}" aria-label="${esc(l)}" title="${esc(l)}">${ui.ic('trash')}</button>`;
const cel = (l, html, cls = '') => `<div class="m-webinars-cel${cls ? ' ' + cls : ''}"><span class="m-webinars-cl">${esc(l)}</span>${html}</div>`;

function linhasCap(st) {
  const cols = ['Data', 'Investimento', 'Impressões', 'Cliques', 'Inscritos', 'Entraram no grupo'];
  const rows = st.cap.map((d, i) => `<div class="m-webinars-rw c6">${cel('Data', inp({ r: 'cap', i, k: 'data', t: 'data', v: d.data, l: `Data do dia ${i + 1}` }))}${cel('Investimento', inp({ r: 'cap', i, k: 'investimento', t: 'moeda', v: d.investimento, l: `Investimento do dia ${i + 1}` }))}${cel('Impressões', inp({ r: 'cap', i, k: 'impressoes', t: 'int', v: d.impressoes, l: `Impressões do dia ${i + 1}` }))}${cel('Cliques', inp({ r: 'cap', i, k: 'cliques', t: 'int', v: d.cliques, l: `Cliques do dia ${i + 1}` }))}${cel('Inscritos', inp({ r: 'cap', i, k: 'inscritos', t: 'int', v: d.inscritos, l: `Inscritos do dia ${i + 1}` }))}${cel('Grupo', inp({ r: 'cap', i, k: 'grupo', t: 'int', v: d.grupo, l: `Entradas no grupo do dia ${i + 1}` }))}${btnRm('cap', i, `Remover dia ${i + 1}`)}</div>`).join('');
  const tot = st.cap.length ? `<div class="m-webinars-rw c6 tot"><div>Total · ${fmt.plural(st.cap.length, 'dia')}</div><div class="num">${fmt.brl2(somaD(st.cap, 'investimento'))}</div><div class="num">${fmt.num(somaD(st.cap, 'impressoes'))}</div><div class="num">${fmt.num(somaD(st.cap, 'cliques'))}</div><div class="num">${fmt.num(somaD(st.cap, 'inscritos'))}</div><div class="num">${fmt.num(somaD(st.cap, 'grupo'))}</div><span></span></div>` : '';
  return `<div class="m-webinars-rows" data-rows="cap">${st.cap.length ? `<div class="m-webinars-rw c6 hd">${cols.map(c => `<span>${c}</span>`).join('')}<span></span></div>` : ''}${rows || `<p class="sm mut m-webinars-rv">Nenhum dia lançado. Adicione um dia por vez (o app sugere a data seguinte).</p>`}${tot}</div>`;
}
function linhasVen(st) {
  if (!veReceita()) return linhasVenSemValor(st);
  const rows = st.ven.map((d, i) => `<div class="m-webinars-rw c4">${cel('Data', inp({ r: 'ven', i, k: 'data', t: 'data', v: d.data, l: `Data da venda ${i + 1}` }))}${cel('Canal', `<select data-r="ven" data-i="${i}" data-k="canal" aria-label="Canal da venda ${i + 1}">${Object.entries(CANAIS).map(([k, l]) => `<option value="${k}"${d.canal === k ? ' selected' : ''}>${l}</option>`).join('')}</select>`)}${cel('Vendas', inp({ r: 'ven', i, k: 'vendas', t: 'int', v: d.vendas, l: `Quantidade de vendas ${i + 1}` }))}${cel('Faturamento', inp({ r: 'ven', i, k: 'faturamento', t: 'moeda', v: d.faturamento, l: `Faturamento ${i + 1}` }))}${btnRm('ven', i, `Remover lançamento ${i + 1}`)}</div>`).join('');
  const tot = st.ven.length ? `<div class="m-webinars-rw c4 tot"><div>Total</div><div class="sm">${Object.entries(CANAIS).map(([k, l]) => `${l} ${fmt.num(somaD(st.ven.filter(v => v.canal === k), 'vendas'))}`).join(' · ')}</div><div class="num">${fmt.num(somaD(st.ven, 'vendas'))}</div><div class="num">${fmt.brl2(somaD(st.ven, 'faturamento'))}</div><span></span></div>` : '';
  return `<div class="m-webinars-rows" data-rows="ven">${st.ven.length ? `<div class="m-webinars-rw c4 hd"><span>Data</span><span>Canal</span><span>Vendas</span><span>Faturamento</span><span></span></div>` : ''}${rows || '<p class="sm mut m-webinars-rv">Nenhuma venda lançada. Lance as vendas ao vivo no dia da live e as do carrinho a cada dia.</p>'}${tot}</div>`;
}
/** vendas por dia sem a coluna de faturamento (quem não vê receita lança só a quantidade) */
function linhasVenSemValor(st) {
  const rows = st.ven.map((d, i) => `<div class="m-webinars-rw c3">${cel('Data', inp({ r: 'ven', i, k: 'data', t: 'data', v: d.data, l: `Data da venda ${i + 1}` }))}${cel('Canal', `<select data-r="ven" data-i="${i}" data-k="canal" aria-label="Canal da venda ${i + 1}">${Object.entries(CANAIS).map(([k, l]) => `<option value="${k}"${d.canal === k ? ' selected' : ''}>${l}</option>`).join('')}</select>`)}${cel('Vendas', inp({ r: 'ven', i, k: 'vendas', t: 'int', v: d.vendas, l: `Quantidade de vendas ${i + 1}` }))}${btnRm('ven', i, `Remover lançamento ${i + 1}`)}</div>`).join('');
  const tot = st.ven.length ? `<div class="m-webinars-rw c3 tot"><div>Total</div><div class="sm">${Object.entries(CANAIS).map(([k, l]) => `${l} ${fmt.num(somaD(st.ven.filter(v => v.canal === k), 'vendas'))}`).join(' · ')}</div><div class="num">${fmt.num(somaD(st.ven, 'vendas'))}</div><span></span></div>` : '';
  return `<div class="m-webinars-rows" data-rows="ven">${st.ven.length ? '<div class="m-webinars-rw c3 hd"><span>Data</span><span>Canal</span><span>Vendas</span><span></span></div>' : ''}${rows || '<p class="sm mut m-webinars-rv">Nenhuma venda lançada. Lance as vendas ao vivo no dia da live e as do carrinho a cada dia.</p>'}${tot}</div>`;
}
function linhasCurva(st) {
  const c = st.aovivo.curva || [];
  const rows = c.map((p, i) => `<div class="m-webinars-rw c2">${cel('Minuto', inp({ r: 'curva', i, k: '0', t: 'int', v: p[0], l: `Minuto do ponto ${i + 1}` }))}${cel('Pessoas', inp({ r: 'curva', i, k: '1', t: 'int', v: p[1], l: `Pessoas no ponto ${i + 1}` }))}${btnRm('curva', i, `Remover ponto ${i + 1}`)}</div>`).join('');
  return `<div class="m-webinars-rows" data-rows="curva">${c.length ? '<div class="m-webinars-rw c2 hd"><span>Minuto</span><span>Pessoas ao vivo</span><span></span></div>' : ''}${rows || '<p class="sm mut m-webinars-rv">Sem pontos. Cole os dados acima ou adicione ponto a ponto.</p>'}</div>`;
}
function linhasEq(st) {
  const time = db.list('team', t => t.ativo !== false && t.papel !== 'leitura');
  const rows = st.equipe.map((e, i) => `<div class="m-webinars-eqr">
<select data-r="eq" data-i="${i}" data-k="id" aria-label="Pessoa ${i + 1}"><option value="">Escolha…</option>${time.map(t => `<option value="${t.id}"${t.id === e.id ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}</select>
<input type="text" data-r="eq" data-i="${i}" data-k="funcao" value="${esc(e.funcao || '')}" placeholder="Função (ex.: moderação do chat)" aria-label="Função de ${esc(nomeTime(e.id) || 'pessoa ' + (i + 1))}">
<div class="m-webinars-eqs" role="group" aria-label="Preenche">${SEC_EQ.map(([k, l]) => `<label class="ck"><input type="checkbox" data-r="eq" data-i="${i}" data-k="sec:${k}"${(e.secoes || []).includes(k) ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>
${btnRm('eq', i, `Tirar ${nomeTime(e.id) || 'pessoa'} da equipe`)}</div>`).join('');
  return `<div class="m-webinars-eqw" data-rows="eq">${rows || '<p class="sm mut">Ninguém escalado ainda.</p>'}</div>`;
}

/* ---------------- etapas ---------------- */
function etapaHtml(id, st) {
  const time = db.list('team', t => t.ativo !== false && t.papel !== 'leitura');
  if (id === 'planejamento') {
    return `<div class="fsec"><h3>Planejamento</h3><div class="fgrid">
${fld({ name: 'tema', l: 'Nome / tema', v: st.tema, req: true, cls: 'full', ph: 'Ex.: Tráfego que Vende 3.0' })}
${fld({ name: 'data', l: 'Data', t: 'data', v: st.data, req: true })}
${fld({ name: 'hora', l: 'Horário', t: 'hora', v: st.hora, dica: 'Horário de Brasília' })}
${fld({ name: 'apresentador', l: 'Apresentador', t: 'select', v: st.apresentador, ph: 'Escolha…', opcoes: time.map(t => ({ v: t.id, l: t.nome })) })}
${fld({ name: 'plataforma', l: 'Plataforma', t: 'select', v: st.plataforma, ph: 'Escolha…', opcoes: PLATAFORMAS.map(p => ({ v: p, l: p })) })}
${fld({ name: 'oferta', l: 'Oferta', v: st.oferta, ph: 'Produto ou programa vendido na live', cls: 'full' })}
${veReceita() ? fld({ name: 'ticket', l: 'Ticket', t: 'moeda', v: st.ticket, ajuda: 'Preço cheio da oferta. Usado para conferir o faturamento por venda.' }) : ''}
${fld({ name: 'orcamento', l: 'Orçamento de tráfego', t: 'moeda', v: st.orcamento })}
${fld({ name: 'metaInscritos', l: 'Meta de inscritos', t: 'int', v: st.metaInscritos })}
${fld({ name: 'metaVendas', l: 'Meta de vendas', t: 'int', v: st.metaVendas })}
</div></div>
<div class="fsec"><div class="row between"><h3>Equipe escalada</h3>${ui.btn({ rotulo: 'Adicionar pessoa', icone: 'user-plus', sm: true, attrs: { 'data-add': 'eq' } })}</div>
<p class="sm mut">Quem entrar na equipe recebe uma notificação ao salvar. Marque o que cada pessoa preenche: é para ela que vai o "Pedir preenchimento".</p>${linhasEq(st)}</div>`;
  }
  if (id === 'captacao') {
    return `<div class="fsec"><div class="row between"><h3>Captação diária</h3>${ui.btn({ rotulo: 'Adicionar dia', icone: 'plus', sm: true, attrs: { 'data-add': 'cap' } })}</div>
<p class="sm mut">Um lançamento por dia de anúncios. Os totais do webinar são a soma destes dias.</p>${linhasCap(st)}</div>
<div class="fsec"><h3>Inscritos por origem</h3><div class="fgrid m-webinars-g5">${ORIGENS.map(([k, l]) => fld({ name: `origem.${k}`, l, t: 'int', v: st.origem[k] })).join('')}</div></div>`;
  }
  if (id === 'aovivo') {
    const a = st.aovivo;
    return `<div class="fsec"><h3>Ao vivo</h3><div class="fgrid">
${fld({ name: 'aovivo.pico', l: 'Pico simultâneo', t: 'int', v: a.pico, ajuda: 'Maior número de pessoas assistindo ao mesmo tempo.' })}
${fld({ name: 'aovivo.presentes', l: 'Presentes únicos', t: 'int', v: a.presentes, ajuda: 'Pessoas diferentes que entraram na live (relatório da plataforma).' })}
${fld({ name: 'aovivo.tempoMedio', l: 'Tempo médio assistido (min)', t: 'int', v: a.tempoMedio })}
${fld({ name: 'aovivo.naOferta', l: 'Presentes no momento da oferta', t: 'int', v: a.naOferta })}
${fld({ name: 'aovivo.chat', l: 'Mensagens no chat', t: 'int', v: a.chat })}
${fld({ name: 'aovivo.minOferta', l: 'Minuto da oferta', t: 'int', v: a.minOferta, dica: 'Marca a oferta na curva de audiência.' })}
</div></div>
<div class="fsec"><div class="row between"><h3>Curva de audiência <span class="mut fw6 sm">(opcional)</span></h3>${ui.btn({ rotulo: 'Adicionar ponto', icone: 'plus', sm: true, attrs: { 'data-add': 'curva' } })}</div>
<div class="fld"><label for="wf-colar">Colar do relatório da plataforma</label><textarea id="wf-colar" rows="3" data-colar placeholder="0;320&#10;5;610&#10;10;780"></textarea><p class="fld-d">Uma linha por ponto no formato minuto;pessoas (aceita vírgula ou tab).</p>
<div class="row">${ui.btn({ rotulo: 'Importar linhas', icone: 'upload', sm: true, attrs: { 'data-importar': '' } })}<span class="sm mut" data-import-msg></span></div></div>
${linhasCurva(st)}</div>`;
  }
  if (id === 'vendas') {
    const v = st.vendas; const rec = veReceita();
    return `<div class="fsec"><div class="row between"><h3>Vendas por dia</h3>${ui.btn({ rotulo: 'Adicionar lançamento', icone: 'plus', sm: true, attrs: { 'data-add': 'ven' } })}</div>
<p class="sm mut">Vendas ao vivo no dia da live, depois uma linha por dia de carrinho e as do replay.${rec ? '' : ' Lance a quantidade de vendas; os valores em R$ são lançados pela administração.'}</p>${linhasVen(st)}</div>
${!rec ? `<div class="fsec"><h3>Checkout</h3><div class="fgrid">
${fld({ name: 'vendas.checkout', l: 'Cliques no checkout', t: 'int', v: v.checkout })}
</div><p class="m-webinars-nrec sm mut" data-nota-receita>${ui.ic('lock')}<span>${NOTA_RECEITA}</span></p></div>` : `<div class="fsec"><h3>Checkout e custos</h3><div class="fgrid">
${fld({ name: 'vendas.checkout', l: 'Cliques no checkout', t: 'int', v: v.checkout })}
${fld({ name: 'vendas.reembolsos', l: 'Reembolsos', t: 'moeda', v: v.reembolsos })}
${fld({ name: 'vendas.pendentes', l: 'Boletos/Pix pendentes', t: 'moeda', v: v.pendentes, ajuda: 'Valor gerado e ainda não pago. Não entra no faturamento até ser pago.' })}
${fld({ name: 'vendas.custos', l: 'Outros custos da live', t: 'moeda', v: v.custos, ajuda: 'Equipe extra, ferramentas, convidados, brindes. Entra no lucro.' })}
${fld({ name: 'vendas.taxa', l: 'Taxa da plataforma de pagamento', t: 'percent', v: v.taxa, ajuda: 'Percentual cobrado sobre o faturamento (ex.: 4,99%). Entra nos custos.' })}
</div></div>`}`;
  }
  const p = st.pos;
  return `<div class="fsec"><h3>Pós-live</h3><div class="fgrid">
${fld({ name: 'pos.replayViews', l: 'Visualizações do replay', t: 'int', v: p.replayViews })}
${fld({ name: 'pos.nps', l: 'NPS da live', t: 'text', v: p.nps, ph: '-100 a 100', ajuda: '% promotores − % detratores da pesquisa enviada depois da live.' })}
${fld({ name: 'pos.aprendizados', l: 'Aprendizados', t: 'textarea', v: p.aprendizados, cls: 'full', linhas: 4, ph: 'O que funcionou, o que mudar na próxima live…' })}
${fld({ name: 'notas', l: 'Notas internas', t: 'textarea', v: st.notas, cls: 'full', linhas: 3 })}
</div></div>`;
}

/* ---------------- cálculos ao vivo e alertas ---------------- */
function calcular(st) {
  const w = { aovivo: st.aovivo, vendas: st.vendas };
  return metricas(w, st.cap, st.ven);
}
function alertas(st, m) {
  const a = []; const add = (tipo, txt) => a.push({ tipo, txt });
  const N = v => (v === null || v === undefined || v === '' ? null : Number(v));
  const pres = N(st.aovivo.presentes), pico = N(st.aovivo.pico), oferta = N(st.aovivo.naOferta);
  if (pres != null && m.inscritos != null && pres > m.inscritos) add('err', `Presentes únicos (${fmt.num(pres)}) maior que inscritos (${fmt.num(m.inscritos)}). Confira se a captação está completa.`);
  if (pico != null && pres != null && pico > pres) add('err', `Pico simultâneo (${fmt.num(pico)}) maior que presentes únicos (${fmt.num(pres)}): o pico não pode passar do total de pessoas.`);
  if (oferta != null && pico != null && oferta > pico) add('err', `Presentes na oferta (${fmt.num(oferta)}) maior que o pico (${fmt.num(pico)}).`);
  if (m.cliques != null && m.impressoes != null && m.cliques > m.impressoes) add('err', 'Cliques maior que impressões em algum dia. Verifique se as colunas não foram trocadas.');
  st.cap.forEach((d, i) => { if (N(d.cliques) != null && N(d.impressoes) != null && N(d.cliques) > N(d.impressoes)) add('err', `Dia ${i + 1}: cliques maior que impressões.`); });
  if (m.grupo != null && m.inscritos != null && m.grupo > m.inscritos) add('warn', 'Entradas no grupo maior que inscritos.');
  const ckt = N(st.vendas.checkout);
  if (m.vendas != null && ckt != null && m.vendas > ckt) add('warn', `Vendas (${fmt.num(m.vendas)}) maior que cliques no checkout (${fmt.num(ckt)}).`);
  if (m.vendas != null && pres != null && m.porCanal.ao_vivo > pres) add('err', 'Vendas ao vivo maior que presentes únicos.');
  const org = ORIGENS.map(([k]) => N(st.origem[k])).filter(v => v != null);
  if (org.length && m.inscritos != null) { const s = org.reduce((x, y) => x + y, 0); if (s !== m.inscritos) add('warn', `Soma por origem (${fmt.num(s)}) diferente do total de inscritos (${fmt.num(m.inscritos)}).`); }
  const reemb = N(st.vendas.reembolsos);
  if (reemb != null && m.faturamento != null && reemb > m.faturamento) add('err', 'Reembolsos maiores que o faturamento.');
  const orc = N(st.orcamento);
  if (orc && m.investimento != null && m.investimento > orc) add('warn', `Investimento ${fmt.pct(((m.investimento - orc) / orc) * 100, 0)} acima do orçamento (${fmt.brl(orc)}).`);
  const tk = N(st.ticket);
  st.ven.forEach((v, i) => { if (tk && N(v.vendas) && N(v.faturamento) != null) { const pm = N(v.faturamento) / N(v.vendas); if (Math.abs(pm - tk) / tk > 0.35) add('warn', `Lançamento ${i + 1}: ${fmt.brl2(pm)} por venda, longe do ticket (${fmt.brl(tk)}). Confira o faturamento.`); } });
  const curva = st.aovivo.curva || [];
  if (curva.length && pico != null) { const mx = Math.max(...curva.map(p => Number(p[1]) || 0)); if (mx > pico * 1.05) add('warn', `A curva chega a ${fmt.num(mx)} pessoas, acima do pico informado (${fmt.num(pico)}).`); }
  const nps = N(String(st.pos.nps ?? '').replace(',', '.'));
  if (st.pos.nps !== '' && st.pos.nps != null && (Number.isNaN(nps) || nps < -100 || nps > 100)) add('err', 'NPS deve ficar entre -100 e 100.');
  if (m.comparecimento != null && m.comparecimento < BENCH.comparecimento.min * 0.6) add('info', `Comparecimento de ${fmt.pct(m.comparecimento)} está bem abaixo da referência (25–35%). Se os números estão certos, registre o aprendizado no pós.`);
  return a;
}
function painelCalc(st) {
  const m = calcular(st); const al = alertas(st, m);
  const v = (x, f) => (x == null || Number.isNaN(x) ? '<span class="mut">—</span>' : f(x));
  const linha = (rot, html, ajuda, e) => `<div class="m-webinars-cr"><span>${esc(rot)}${ajuda ? ui.ajuda(ajuda) : ''}</span><b class="num">${e ? ui.led(e, false) : ''}${html}</b></div>`;
  return `<div class="m-webinars-calc" aria-live="polite">
<h3>Cálculos ao vivo</h3>
${linha('Inscritos', v(m.inscritos, fmt.num))}
${linha('Custo por inscrito', v(m.cpl, fmt.brl2), 'Investimento ÷ inscritos')}
${linha('Comparecimento', v(m.comparecimento, x => fmt.pct(x)), `Presentes únicos ÷ inscritos (ref. ${fmt.dec(BENCH.comparecimento.min, BENCH.comparecimento.min % 1 ? 1 : 0)}–${fmt.dec(BENCH.comparecimento.max, BENCH.comparecimento.max % 1 ? 1 : 0)}%)`, m.comparecimento != null ? ledBench(m.comparecimento, BENCH.comparecimento) : '')}
${linha('Retenção até a oferta', v(m.retencao, x => fmt.pct(x)), `Presentes na oferta ÷ pico (ref. ${fmt.dec(BENCH.retencao.min, BENCH.retencao.min % 1 ? 1 : 0)}–${fmt.dec(BENCH.retencao.max, BENCH.retencao.max % 1 ? 1 : 0)}%)`, m.retencao != null ? ledBench(m.retencao, BENCH.retencao) : '')}
${linha('Conversão da live', v(m.convLive, x => fmt.pct(x)), `Vendas ÷ presentes únicos (ref. ${fmt.dec(BENCH.convLive.min, BENCH.convLive.min % 1 ? 1 : 0)}–${fmt.dec(BENCH.convLive.max, BENCH.convLive.max % 1 ? 1 : 0)}%)`, m.convLive != null ? ledBench(m.convLive, BENCH.convLive) : '')}
${linha('Conversão geral', v(m.convGeral, x => fmt.pct(x, 2)), 'Vendas ÷ inscritos')}
${linha('CAC', v(m.cac, fmt.brl2), 'Investimento ÷ vendas')}
${veReceita() ? `${linha('ROAS', v(m.roas, x => fmt.dec(x, 2) + '×'), 'Faturamento ÷ investimento')}
${linha('Lucro', v(m.lucro, x => `<span class="${x < 0 ? 't-err' : ''}">${fmt.brl(x)}</span>`), 'Faturamento − reembolsos − investimento − custos (inclui a taxa da plataforma)')}` : `${linha('Investimento', v(m.investimento, fmt.brl2), 'Soma da captação diária')}`}
${al.length ? `<div class="m-webinars-al"><h4>${ui.ic('alert')}Confira antes de salvar</h4><ul>${al.map(x => `<li class="t-${x.tipo === 'info' ? 'info' : x.tipo}">${ui.led(x.tipo === 'info' ? 'off' : x.tipo, false)}<span>${esc(x.txt)}</span></li>`).join('')}</ul></div>` : '<p class="sm mut m-webinars-okm">Nenhuma inconsistência encontrada.</p>'}
</div>`;
}

/* ---------------- completude das etapas ---------------- */
function completude(id, st) {
  if (id === 'planejamento') { const ks = ['tema', 'data', 'hora', 'oferta', ...(veReceita() ? ['ticket'] : []), 'metaInscritos', 'metaVendas']; const f = ks.filter(k => temValor(st[k])).length; return f === ks.length ? 'ok' : f ? 'warn' : 'off'; }
  if (id === 'captacao') return st.cap.length ? 'ok' : 'off';
  if (id === 'aovivo') { const f = ['pico', 'presentes', 'naOferta'].filter(k => temValor(st.aovivo[k])).length; return f === 3 ? 'ok' : f ? 'warn' : 'off'; }
  if (id === 'vendas') return st.ven.length && temValor(st.vendas.checkout) ? 'ok' : st.ven.length || temValor(st.vendas.checkout) ? 'warn' : 'off';
  const f = ['replayViews', 'nps', 'aprendizados'].filter(k => temValor(st.pos[k])).length; return f === 3 ? 'ok' : f ? 'warn' : 'off';
}
/* ---------------- pendências (o que falta em cada etapa) ----------------
 * Nenhuma etapa trava a navegação: dá para pular para frente e para trás sem preencher.
 * bloq = impede só a ação final (criar / salvar e concluir); erro = formato inválido. */
const okData = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const okHora = v => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const npsInvalido = v => { const s = String(v ?? '').trim().replace(',', '.'); return s !== '' && (Number.isNaN(Number(s)) || Number(s) < -100 || Number(s) > 100); };
function pendencias(id, st) {
  const p = []; const add = (msg, sel, bloq = false, erro = false) => p.push({ etapa: id, msg, sel, bloq, erro });
  const linhasData = (l, r, rot) => l.forEach((d, i) => { if (!d.data) add(`${rot} ${i + 1}: informe a data`, `[data-r="${r}"][data-i="${i}"][data-k="data"]`, true, true); else if (!okData(d.data)) add(`${rot} ${i + 1}: data inválida (use dd/mm/aaaa)`, `[data-r="${r}"][data-i="${i}"][data-k="data"]`, true, true); });
  if (id === 'planejamento') {
    const t = String(st.tema || '').trim();
    if (!t) add('Nome / tema do webinar', '[name="tema"]', true); else if (t.length < 3) add('Nome / tema: use pelo menos 3 caracteres', '[name="tema"]', true, true);
    if (!st.data) add('Data da live', '[name="data"]', true); else if (!okData(st.data)) add('Data da live inválida (use dd/mm/aaaa)', '[name="data"]', true, true);
    if (!st.hora) add('Horário', '[name="hora"]'); else if (!okHora(st.hora)) add('Horário inválido (use hh:mm, ex.: 20:00)', '[name="hora"]', true, true);
    if (!temValor(st.oferta)) add('Oferta', '[name="oferta"]');
    if (veReceita() && !temValor(st.ticket)) add('Ticket', '[name="ticket"]');
    if (!temValor(st.metaInscritos)) add('Meta de inscritos', '[name="metaInscritos"]');
    if (!temValor(st.metaVendas)) add('Meta de vendas', '[name="metaVendas"]');
    const sel = (st.equipe || []).map(e => e.id);
    const iDup = sel.findIndex((v, i) => v && sel.indexOf(v) !== i);
    if (iDup >= 0) add(`${nomeTime(sel[iDup])} aparece duas vezes na equipe`, `[data-r="eq"][data-i="${iDup}"][data-k="id"]`, true, true);
  } else if (id === 'captacao') {
    if (!st.cap.length) add('Pelo menos um dia de captação', '[data-add="cap"]');
    linhasData(st.cap, 'cap', 'Dia');
  } else if (id === 'aovivo') {
    [['pico', 'Pico simultâneo'], ['presentes', 'Presentes únicos'], ['naOferta', 'Presentes no momento da oferta']].forEach(([k, l]) => { if (!temValor(st.aovivo[k])) add(l, `[name="aovivo.${k}"]`); });
  } else if (id === 'vendas') {
    if (!st.ven.length) add('Pelo menos um lançamento de vendas', '[data-add="ven"]');
    linhasData(st.ven, 'ven', 'Lançamento');
    if (!temValor(st.vendas.checkout)) add('Cliques no checkout', '[name="vendas.checkout"]');
  } else {
    if (!temValor(st.pos.replayViews)) add('Visualizações do replay', '[name="pos.replayViews"]');
    if (npsInvalido(st.pos.nps)) add('NPS fora da faixa (-100 a 100)', '[name="pos.nps"]', true, true); else if (!temValor(st.pos.nps)) add('NPS da live', '[name="pos.nps"]');
    if (!temValor(st.pos.aprendizados)) add('Aprendizados', '[name="pos.aprendizados"]');
  }
  return p;
}
/** ok = sem pendências · warn/err = visitada ou com dados, faltando algo · novo = não visitada */
function estadoEtapa(id, st, vis) {
  const p = pendencias(id, st);
  if (!p.length) return { e: 'ok', n: 0, txt: 'Completa' };
  if (vis.has(id) || completude(id, st) !== 'off') return { e: p.some(x => x.erro) ? 'err' : 'warn', n: p.length, txt: `${fmt.plural(p.length, 'pendente')}` };
  return { e: 'novo', n: p.length, txt: 'Não visitada' };
}
function passoInfo(s, i, st, vis) {
  const x = estadoEtapa(s.id, st, vis);
  return { cls: `is-${x.e}`, aria: `Etapa ${i + 1}: ${s.rotulo} (${x.txt})`, title: `${s.rotulo}: ${x.txt}`, sn: x.e === 'ok' ? ui.ic('check') : String(i + 1), ss: `${x.e === 'warn' || x.e === 'err' ? '<i class="m-webinars-dot" aria-hidden="true"></i>' : ''}${x.txt}` };
}
const itensEtapas = (st, atual, vis) => SECOES.map((s, i) => {
  const x = passoInfo(s, i, st, vis);
  return `<li><button type="button" class="${x.cls}" data-ir="${s.id}"${s.id === atual ? ' aria-current="step"' : ''} aria-label="${esc(x.aria)}" title="${esc(x.title)}"><span class="m-webinars-sn" data-v="${esc(x.sn)}">${x.sn}</span><span class="m-webinars-sx"><span class="m-webinars-st">${esc(s.rotulo)}</span><span class="m-webinars-ss" data-v="${esc(x.ss)}">${x.ss}</span></span></button></li>`;
}).join('');
/** atualiza o stepper no lugar (sem trocar os botões: trocar no meio de um clique faria o clique se perder) */
function atualizarPassos(ol, st, atual, vis) {
  SECOES.forEach((s, i) => {
    const b = ol.querySelector(`[data-ir="${s.id}"]`); if (!b) return;
    const x = passoInfo(s, i, st, vis);
    if (b.className !== x.cls) b.className = x.cls;
    if (b.getAttribute('aria-label') !== x.aria) { b.setAttribute('aria-label', x.aria); b.title = x.title; }
    if (s.id === atual) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    const sn = b.querySelector('.m-webinars-sn'); if (sn.dataset.v !== x.sn) { sn.innerHTML = x.sn; sn.dataset.v = x.sn; }
    const ss = b.querySelector('.m-webinars-ss'); if (ss.dataset.v !== x.ss) { ss.innerHTML = x.ss; ss.dataset.v = x.ss; }
  });
}
const navEtapas = (st, atual, vis) => `<ol class="m-webinars-steps" aria-label="Etapas do cadastro (todas podem ser abertas a qualquer momento)">${itensEtapas(st, atual, vis)}</ol>`;
const ROT_FINAL = w => (w ? 'Salvar e concluir' : 'Criar webinar');

/* ---------------- render ---------------- */
export function renderForm(ctx, w) {
  const rasc = lsGet(KEY(w && w.id));
  const usarRasc = rasc && rasc.st && (!w || !w.updatedAt || rasc.em > w.updatedAt);
  const st = usarRasc ? semDinheiro(rasc.st) : estadoDe(w);
  const etapa = ETAPAS.includes(ctx.query.etapa) ? ctx.query.etapa : 'planejamento';
  ctx.migalha(w ? 'Preencher dados' : 'Novo webinar');
  const idx = ETAPAS.indexOf(etapa);
  const vis = new Set([...(usarRasc && Array.isArray(rasc.vis) ? rasc.vis : []), etapa]);
  return `<div class="pg m-webinars m-webinars-form">
${ui.cabecalho({ voltar: { href: w ? `#/webinars/${w.id}` : '#/webinars', rotulo: w ? w.tema : 'Webinars' }, titulo: w ? 'Preencher dados' : 'Novo webinar', sub: w ? `${w.tema} · ${fmt.data(w.data)}` : 'Preencha na ordem que quiser: dá para pular etapas e voltar depois. Só criar o webinar exige nome e data.', meta: `<span class="sm mut" data-rasc-st>${usarRasc ? `Rascunho deste navegador de ${fmt.dataHora(rasc.em)}` : 'Rascunho salvo automaticamente neste navegador enquanto você digita'}</span>` })}
${usarRasc ? ui.aviso({ tipo: 'info', titulo: 'Rascunho restaurado.', texto: `Você tinha alterações não salvas de ${fmt.dataHora(rasc.em)}.`, acao: ui.btn({ rotulo: 'Descartar rascunho', sm: true, attrs: { 'data-descartar': '' } }) }) : ''}
${navEtapas(st, etapa, vis)}
<div class="m-webinars-fl">
<form class="card m-webinars-fc" data-wf="${esc(w ? w.id : '')}" novalidate><div class="card-b">
<div data-pend-box></div>
${ETAPAS.map(id => `<section data-etapa="${id}"${id === etapa ? '' : ' hidden'}>${etapaHtml(id, st)}</section>`).join('')}
</div><footer class="card-f m-webinars-ff">
${ui.btn({ rotulo: 'Cancelar', href: w ? `#/webinars/${w.id}` : '#/webinars', tipo: 'ghost' })}
<span class="sp"></span>
${ui.btn({ rotulo: 'Salvar rascunho', icone: 'download', attrs: { 'data-salvar': 'rascunho' } })}
${ui.btn({ rotulo: 'Anterior', icone: 'chev-left', attrs: { 'data-passo': '-1' }, disabled: idx === 0 })}
${idx < ETAPAS.length - 1 ? ui.btn({ rotulo: 'Continuar', iconeDir: 'chev', tipo: 'pri', attrs: { 'data-passo': '1' } }) : ui.btn({ rotulo: ROT_FINAL(w), icone: 'check', tipo: 'pri', attrs: { 'data-salvar': 'concluir' } })}
</footer></form>
<aside class="card m-webinars-side" data-calc>${painelCalc(st)}</aside>
</div></div>`;
}

/* ---------------- leitura ---------------- */
function setPath(o, path, v) { const ks = path.split('.'); let x = o; ks.slice(0, -1).forEach(k => { x = x[k] || (x[k] = {}); }); x[ks[ks.length - 1]] = v; }
function lerCampo(e) {
  const v = String(e.value || '').trim();
  if (e.dataset.mask === 'moeda') return ui.parse.moeda(v);
  if (e.dataset.mask === 'percent') return ui.parse.percent(v);
  if (e.dataset.mask === 'data') return ui.parse.data(v) || v;
  if (e.dataset.wm === 'int') return parseInt0(v);
  return v;
}
function ler(form, st0) {
  const st = JSON.parse(JSON.stringify(st0));
  form.querySelectorAll('[name]').forEach(e => { if (e.closest('[data-rows]')) return; setPath(st, e.name, lerCampo(e)); });
  const rows = { cap: [], ven: [], curva: [], eq: [] };
  form.querySelectorAll('[data-r]').forEach(e => {
    const r = e.dataset.r, i = Number(e.dataset.i), k = e.dataset.k;
    const alvo = rows[r][i] || (rows[r][i] = r === 'curva' ? [] : r === 'eq' ? { secoes: [] } : {});
    if (r === 'eq' && k.startsWith('sec:')) { if (e.checked) alvo.secoes.push(k.slice(4)); return; }
    alvo[k] = lerCampo(e);
  });
  st.cap = rows.cap.filter(Boolean); st.ven = rows.ven.filter(Boolean);
  st.aovivo.curva = rows.curva.filter(Boolean).map(p => [Number(p[0]) || 0, Number(p[1]) || 0]);
  st.equipe = rows.eq.filter(Boolean);
  return st;
}

/* ---------------- mount ---------------- */
export function mountForm(el, ctx) {
  const form = el.querySelector('[data-wf]');
  const wid = form.dataset.wf || null;
  const w0 = wid ? db.get('webinars', wid) : null;
  const rasc = lsGet(KEY(wid));
  let st = rasc && rasc.st && (!w0 || !w0.updatedAt || rasc.em > w0.updatedAt) ? semDinheiro(rasc.st) : estadoDe(w0);
  let etapa = ETAPAS.includes(ctx.query.etapa) ? ctx.query.etapa : 'planejamento';
  const vis = new Set([...(rasc && Array.isArray(rasc.vis) && rasc.st && (!w0 || !w0.updatedAt || rasc.em > w0.updatedAt) ? rasc.vis : []), etapa]);
  let tmr = null;
  let resumo = null; // pendências que impediram a ação final (lista com links), recalculada enquanto digita
  const side = el.querySelector('[data-calc]');
  const pendBox = el.querySelector('[data-pend-box]');

  const atualizar = () => { st = ler(form, st); side.innerHTML = painelCalc(st); atualizarNav(); if (resumo) mostrarResumo(); };
  const atualizarNav = () => { const ol = el.querySelector('.m-webinars-steps'); if (ol) atualizarPassos(ol, st, etapa, vis); };
  const salvarLocal = () => {
    clearTimeout(tmr);
    tmr = setTimeout(() => { const em = new Date().toISOString(); if (lsSet(KEY(wid), { em, st, vis: [...vis] })) { const s = el.querySelector('[data-rasc-st]'); if (s) s.textContent = `Rascunho salvo neste navegador às ${fmt.hora(em)}`; } }, 700);
  };
  const redesenhar = r => {
    const box = el.querySelector(`[data-rows="${r}"]`); if (!box) return;
    box.outerHTML = r === 'cap' ? linhasCap(st) : r === 'ven' ? linhasVen(st) : r === 'curva' ? linhasCurva(st) : linhasEq(st);
    side.innerHTML = painelCalc(st); atualizarNav();
  };
  const irPara = (id, foco = true) => {
    if (!ETAPAS.includes(id)) return;
    if (id !== etapa) marcarEtapa(etapa);
    etapa = id; vis.add(id);
    el.querySelectorAll('[data-etapa]').forEach(s => { s.hidden = s.dataset.etapa !== id; });
    atualizarNav();
    const i = ETAPAS.indexOf(id);
    const ant = el.querySelector('[data-passo="-1"]'); if (ant) ant.disabled = i === 0;
    const ff = el.querySelector('.m-webinars-ff'); const prox = ff.querySelector('[data-passo="1"], [data-salvar="concluir"]');
    prox.outerHTML = i < ETAPAS.length - 1 ? ui.btn({ rotulo: 'Continuar', iconeDir: 'chev', tipo: 'pri', attrs: { 'data-passo': '1' } }) : ui.btn({ rotulo: ROT_FINAL(w0), icone: 'check', tipo: 'pri', attrs: { 'data-salvar': 'concluir' } });
    ctx.router.setQuery({ etapa: id === 'planejamento' ? null : id });
    salvarLocal();
    const top = el.querySelector('.m-webinars-steps'); if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start' });
    if (foco) { const f0 = el.querySelector(`[data-etapa="${id}"] input, [data-etapa="${id}"] select, [data-etapa="${id}"] textarea`); f0 && f0.focus({ preventScroll: true }); }
  };

  /** dicas no próprio campo (não travam nada): obrigatórios em branco em âmbar, formatos inválidos em vermelho */
  function marcarEtapa(id) {
    const sec = el.querySelector(`[data-etapa="${id}"]`); if (!sec) return;
    ui.form.limparErros(sec); sec.querySelectorAll('.m-webinars-rerr').forEach(x => x.remove());
    pendencias(id, st).filter(x => x.bloq).forEach(x => {
      const inpEl = sec.querySelector(x.sel); if (!inpEl) return;
      const cls = x.erro ? 'fld-err' : 'fld-err m-webinars-hint';
      const msg = x.erro ? x.msg.replace(/^(Dia|Lançamento) \d+: /, '') : 'Obrigatório para concluir. Pode continuar e voltar depois.';
      inpEl.setAttribute('aria-invalid', 'true');
      const box = inpEl.closest('[data-rows]');
      if (box) { if (!box.querySelector('.m-webinars-rerr')) box.insertAdjacentHTML('beforeend', `<p class="${cls} m-webinars-rerr">${ui.ic('alert-circle')}${esc(x.msg)}</p>`); }
      else { const f = inpEl.closest('.fld'); if (f) f.insertAdjacentHTML('beforeend', `<p class="${cls}">${ui.ic(x.erro ? 'alert-circle' : 'info')}${esc(msg)}</p>`); }
    });
  }
  /** resumo do que falta para concluir, com links que levam à etapa e ao campo */
  function mostrarResumo() {
    resumo = ETAPAS.flatMap(id => pendencias(id, st)).filter(x => x.bloq);
    if (!resumo.length) { pendBox.innerHTML = ui.aviso({ tipo: 'ok', titulo: 'Tudo certo para concluir.', texto: 'As informações obrigatórias estão preenchidas.' }); return; }
    const rot = id => { const i = ETAPAS.indexOf(id); return `${i + 1}. ${SECOES[i].rotulo}`; };
    pendBox.innerHTML = `<div class="m-webinars-pend" role="alert" tabindex="-1"><h4>${ui.ic('alert-circle')}Falta${resumo.length > 1 ? 'm' : ''} ${fmt.plural(resumo.length, 'item', 'itens')} para ${w0 ? 'concluir' : 'criar o webinar'}</h4>
<p class="sm mut">O resto pode ficar em branco. Clique para ir direto ao campo.</p>
<ul>${resumo.map((x, i) => `<li><button type="button" class="m-webinars-pl" data-pend="${i}"><span class="m-webinars-pe">${esc(rot(x.etapa))}</span><span>${esc(x.msg)}</span>${ui.ic('arrow-right')}</button></li>`).join('')}</ul></div>`;
  }
  function irParaPendencia(x) {
    irPara(x.etapa, false); marcarEtapa(x.etapa);
    const alvo = el.querySelector(`[data-etapa="${x.etapa}"] ${x.sel}`);
    if (alvo) { alvo.scrollIntoView({ block: 'center' }); alvo.focus({ preventScroll: true }); }
  }

  async function salvar(modo) {
    st = ler(form, st);
    if (modo === 'concluir') {
      // única ação que valida tudo: lista o que falta com links para a etapa e o campo
      mostrarResumo();
      if (resumo.length) {
        ETAPAS.forEach(marcarEtapa);
        ui.toast(`${fmt.plural(resumo.length, 'item obrigatório', 'itens obrigatórios')} em aberto. Veja a lista no topo do formulário.`, { tipo: 'err' });
        const box = pendBox.querySelector('.m-webinars-pend'); if (box) { box.scrollIntoView({ block: 'start' }); box.focus({ preventScroll: true }); }
        return;
      }
    }
    // rascunho sempre salva: o que estiver em formato inválido fica só no rascunho deste navegador
    const stLocal = JSON.parse(JSON.stringify(st));
    let soLocal = 0;
    if (modo === 'rascunho') {
      if (st.data && !okData(st.data)) { st.data = ''; soLocal++; }
      if (!okHora(st.hora)) { st.hora = ''; soLocal++; }
      if (npsInvalido(st.pos.nps)) { st.pos.nps = ''; soLocal++; }
      const nc = st.cap.length, nv = st.ven.length;
      st.cap = st.cap.filter(d => okData(d.data)); st.ven = st.ven.filter(d => okData(d.data));
      soLocal += nc - st.cap.length + nv - st.ven.length;
    }
    const m = calcular(st); const al = alertas(st, m).filter(x => x.tipo === 'err');
    if (modo === 'concluir' && al.length) {
      const ok = await ui.confirmar(`${fmt.plural(al.length, 'inconsistência')}: ${al.map(x => x.txt).join(' ')} Salvar mesmo assim?`, { titulo: 'Os números parecem errados', confirmar: 'Salvar mesmo assim', perigo: false });
      if (!ok) return;
    }
    const antes = w0 ? db.get('webinars', w0.id) : null;
    const linhasAntes = w0 ? db.list('webinarDaily', d => d.webinarId === w0.id) : [];
    st = preservarDinheiro(st, antes, linhasAntes);
    const npsN = String(st.pos.nps ?? '').trim() === '' ? null : Number(String(st.pos.nps).replace(',', '.'));
    const rec = {
      tema: st.tema.trim() || (antes && antes.tema) || 'Webinar sem nome', data: st.data || null, hora: st.hora, apresentador: st.apresentador, plataforma: st.plataforma, oferta: st.oferta, ticket: st.ticket,
      metaInscritos: st.metaInscritos, metaVendas: st.metaVendas, orcamento: st.orcamento, equipe: st.equipe.filter(e => e.id),
      captacao: { origem: st.origem }, aovivo: st.aovivo, vendas: st.vendas, pos: { ...st.pos, nps: npsN }, notas: st.notas, rascunho: modo === 'rascunho' && !w0 ? true : (antes ? !!antes.rascunho && modo === 'rascunho' : false),
    };
    let salvo;
    db.batch(() => {
      if (w0) salvo = db.update('webinars', w0.id, rec, { log: `${modo === 'rascunho' ? 'salvou rascunho do' : 'preencheu dados do'} webinar "${rec.tema}"` });
      else salvo = db.insert('webinars', { ...rec, checklist: checklistPadrao(rec.data, null) }, { log: `criou o webinar "${rec.tema}"` });
      const manter = new Set(st.ven.map(d => d._par).filter(Boolean));
      linhasAntes.forEach(d => { if (!manter.has(d.id)) db.remove('webinarDaily', d.id); });
      st.cap.forEach((d, i) => db.insert('webinarDaily', { id: `wd-${salvo.id}-c${i}-${Date.now().toString(36)}`, webinarId: salvo.id, tipo: 'captacao', ...d }));
      st.ven.forEach((d, i) => {
        const { _par, ...v } = d;
        if (_par) db.update('webinarDaily', _par, { webinarId: salvo.id, tipo: 'venda', ...v });
        else db.insert('webinarDaily', { id: `wd-${salvo.id}-v${i}-${Date.now().toString(36)}`, webinarId: salvo.id, tipo: 'venda', ...v });
      });
    });
    // notifica quem entrou na equipe
    const antigos = new Set((w0 ? (antes.equipe || []) : []).map(e => e.id));
    const eu = auth.real() || auth.user();
    const novos = rec.equipe.filter(e => !antigos.has(e.id) && (!eu || e.id !== eu.teamId));
    novos.forEach(e => { const u = userDoTime(e.id); if (u) notify.enviar({ para: [u], tipo: 'atribuicao', titulo: `${eu ? eu.nome : 'Alguém'} escalou você no webinar "${rec.tema}"`, texto: `Função: ${e.funcao || 'equipe'}${(e.secoes || []).length ? ` · você preenche: ${e.secoes.map(s => (SECOES.find(x => x.id === s) || {}).rotulo).join(', ')}` : ''}. Live em ${fmt.data(rec.data)}${rec.hora ? ' às ' + rec.hora : ''}.`, link: `#/webinars/${salvo.id}`, refCol: 'webinars', refId: salvo.id }); });
    lsDel(KEY(wid)); if (!w0) lsDel(KEY(salvo.id));
    if (soLocal) lsSet(KEY(salvo.id), { em: new Date(Date.now() + 1000).toISOString(), st: stLocal, vis: [...vis] });
    const msgN = novos.length ? ` ${novos.map(e => fmt.primeiro(nomeTime(e.id))).join(', ')} ${novos.length > 1 ? 'foram notificados' : 'foi notificado(a)'}.` : '';
    const desfazer = w0 ? () => db.batch(() => { db.list('webinarDaily', d => d.webinarId === w0.id).forEach(d => db.remove('webinarDaily', d.id)); db.insert('webinars', antes); linhasAntes.forEach(d => db.insert('webinarDaily', d)); })
      : () => db.batch(() => { db.list('webinarDaily', d => d.webinarId === salvo.id).forEach(d => db.remove('webinarDaily', d.id)); db.remove('webinars', salvo.id); });
    if (modo === 'rascunho') {
      ui.toast(`Rascunho salvo.${msgN}${soLocal ? ` ${fmt.plural(soLocal, 'campo com formato inválido ficou', 'campos com formato inválido ficaram')} só no rascunho deste navegador.` : ''}`, { desfazer });
      if (!w0) ctx.router.go(`webinars/${salvo.id}/preencher${etapa !== 'planejamento' ? `?etapa=${etapa}` : ''}`);
    } else {
      ui.toast(`${w0 ? 'Dados salvos' : 'Webinar criado'}.${msgN}`, { desfazer });
      ctx.router.go(`webinars/${salvo.id}`);
    }
  }

  const onInput = e => {
    const t = e.target;
    if (t.dataset.wm === 'int') { const d = dig(t.value).slice(0, 12); const nv = d === '' ? '' : fmt.num(Number(d)); if (nv !== t.value) { t.value = nv; try { t.setSelectionRange(nv.length, nv.length); } catch (x) { /* */ } } }
    if (t.dataset.wm === 'hora') { const nv = maskHora(t.value); if (nv !== t.value) t.value = nv; }
    if (t.hasAttribute('data-colar')) return;
    if (t.getAttribute('aria-invalid')) { t.removeAttribute('aria-invalid'); const f = t.closest('.fld'); f && f.querySelector('.fld-err') && f.querySelector('.fld-err').remove(); }
    atualizar(); salvarLocal();
  };
  const onClick = e => {
    const ir = e.target.closest('[data-ir]'); if (ir) { atualizar(); irPara(ir.dataset.ir); return; }
    const pl = e.target.closest('[data-pend]'); if (pl) { const x = resumo && resumo[Number(pl.dataset.pend)]; if (x) irParaPendencia(x); return; }
    const ps = e.target.closest('[data-passo]');
    if (ps) { atualizar(); const i = ETAPAS.indexOf(etapa) + Number(ps.dataset.passo); irPara(ETAPAS[Math.max(0, Math.min(ETAPAS.length - 1, i))]); return; }
    const sv = e.target.closest('[data-salvar]'); if (sv) { salvar(sv.dataset.salvar); return; }
    const add = e.target.closest('[data-add]');
    if (add) {
      st = ler(form, st); const r = add.dataset.add;
      if (r === 'cap') { const ult = st.cap[st.cap.length - 1]; const base = ult && ult.data ? fmt.toDate(ult.data) : new Date(); if (ult && ult.data) base.setDate(base.getDate() + 1); st.cap.push({ data: fmt.iso(base), investimento: null, impressoes: null, cliques: null, inscritos: null, grupo: null }); }
      else if (r === 'ven') { const ult = st.ven[st.ven.length - 1]; const base = ult && ult.data ? fmt.toDate(ult.data) : (st.data ? fmt.toDate(st.data) : new Date()); if (ult && ult.data) base.setDate(base.getDate() + 1); st.ven.push({ data: fmt.iso(base), canal: ult ? 'carrinho' : 'ao_vivo', vendas: null, faturamento: null }); }
      else if (r === 'curva') { const c = st.aovivo.curva; const ult = c[c.length - 1]; c.push([ult ? ult[0] + 5 : 0, null]); }
      else if (r === 'eq') st.equipe.push({ id: '', funcao: '', secoes: [] });
      redesenhar(r); salvarLocal();
      const box = el.querySelector(`[data-rows="${r}"]`); const ins = box && box.querySelectorAll('input:not([type=checkbox]), select'); if (ins && ins.length) { const alvo = r === 'cap' || r === 'ven' ? ins[ins.length - (r === 'cap' ? 5 : veReceita() ? 2 : 1)] : ins[ins.length - (r === 'eq' ? 2 : 1)]; alvo && alvo.focus(); }
      return;
    }
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      st = ler(form, st); const r = rm.dataset.rm, i = Number(rm.dataset.i);
      const lista = r === 'cap' ? st.cap : r === 'ven' ? st.ven : r === 'curva' ? st.aovivo.curva : st.equipe;
      const [tirado] = lista.splice(i, 1); redesenhar(r); salvarLocal();
      ui.toast('Linha removida.', { tipo: 'info', desfazer: () => { st = ler(form, st); const l2 = r === 'cap' ? st.cap : r === 'ven' ? st.ven : r === 'curva' ? st.aovivo.curva : st.equipe; l2.splice(i, 0, tirado); redesenhar(r); salvarLocal(); } });
      return;
    }
    if (e.target.closest('[data-importar]')) {
      const ta = el.querySelector('[data-colar]'); const msg = el.querySelector('[data-import-msg]');
      const linhas = String(ta.value || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const pts = []; let ruins = 0;
      linhas.forEach(l => { const m = /^(\d+)\s*[;,\t ]\s*([\d.]+)$/.exec(l); if (m) pts.push([Number(m[1]), Number(m[2].replace(/\./g, ''))]); else ruins++; });
      if (!pts.length) { msg.textContent = 'Nenhuma linha válida. Use minuto;pessoas, uma por linha.'; msg.className = 'sm t-err'; return; }
      st = ler(form, st); st.aovivo.curva = pts.sort((a, b) => a[0] - b[0]); ta.value = '';
      redesenhar('curva'); salvarLocal();
      el.querySelector('[data-import-msg]').textContent = `${fmt.plural(pts.length, 'ponto importado', 'pontos importados')}${ruins ? ` · ${fmt.plural(ruins, 'linha ignorada', 'linhas ignoradas')}` : ''}.`;
      el.querySelector('[data-import-msg]').className = 'sm t-ok';
      return;
    }
    if (e.target.closest('[data-descartar]')) {
      lsDel(KEY(wid)); ui.toast('Rascunho descartado.', { tipo: 'info' }); ctx.refresh();
    }
  };
  const onKey = e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') e.preventDefault(); if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); salvar('rascunho'); } };
  el.addEventListener('input', onInput); el.addEventListener('change', onInput); el.addEventListener('click', onClick); form.addEventListener('keydown', onKey);
  return () => { clearTimeout(tmr); el.removeEventListener('input', onInput); el.removeEventListener('change', onInput); el.removeEventListener('click', onClick); form.removeEventListener('keydown', onKey); };
}
