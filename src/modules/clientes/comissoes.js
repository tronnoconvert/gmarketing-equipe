// comissoes.js — comissão variável por cliente (dinheiro: só quem vê receita — dono/admin — vê e edita).
// Modelo (fixo, lido também pelo Financeiro › Comissões):
//   client.comissoes = [{ id, teamId, tipo: 'fixo'|'percentual', valor, meses, inicio: 'aaaa-mm-dd', obs }]
//   fixo → valor em R$/mês · percentual → % do MRR do cliente. Regras e cálculos em calc.js.
import * as K from './calc.js';
import { HOJE } from './data.js';

export const TIPOS_COM = [{ v: 'fixo', l: 'R$ fixo por mês' }, { v: 'percentual', l: '% do MRR' }];
const novoIdCom = () => `cm-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const pessoasCom = db => db.list('team', t => t.ativo !== false && t.papel !== 'leitura');
const ROT_ST = { ativa: ['ok', 'Ativa'], encerrando: ['warn', 'Encerra em ≤ 1 mês'], encerrada: ['off', 'Encerrada'], futura: ['info', 'Começa depois'] };
export const seloStatusCom = (ui, st) => ui.selo(...(ROT_ST[st] || ROT_ST.ativa));

/** campo de valor conforme o tipo (R$ ou %) */
function campoValor(ctx, com, i) {
  const pct = com.tipo === 'percentual';
  return ctx.ui.campo({ nome: `cm-valor-${i}`, rotulo: pct ? 'Percentual do MRR' : 'Valor por mês', tipo: pct ? 'percent' : 'moeda', valor: com.valor ?? '', obrigatorio: true, placeholder: pct ? 'Ex.: 3' : 'R$ 0,00' });
}
/** uma linha do editor */
export function comissaoLinha(ctx, com, i) {
  const { ui, fmt, db } = ctx;
  const ppl = pessoasCom(db);
  return `<div class="m-clientes-cmr" data-cm="${i}"><input type="hidden" name="cm-id-${i}" value="${fmt.esc(com.id || '')}">
<div class="row between"><b class="sm">Comissão ${i + 1}</b>${ui.btnIc('trash', 'Remover comissão', { 'data-rm-cm': i })}</div>
<div class="fgrid m-clientes-cmg">${ui.campo({ nome: `cm-team-${i}`, rotulo: 'Pessoa da equipe', tipo: 'select', placeholder: 'Escolha…', opcoes: ppl.map(t => ({ v: t.id, l: `${t.nome} · ${t.area}` })), valor: com.teamId || '', obrigatorio: true })}
${ui.campo({ nome: `cm-tipo-${i}`, rotulo: 'Tipo', tipo: 'select', opcoes: TIPOS_COM, valor: com.tipo || 'fixo', attrs: { 'data-cm-tipo': i } })}
<div class="m-clientes-cmv" data-cm-valor="${i}">${campoValor(ctx, com, i)}</div>
${ui.campo({ nome: `cm-meses-${i}`, rotulo: 'Por quantos meses', tipo: 'number', valor: com.meses ?? 6, obrigatorio: true, attrs: { min: '1', max: '60', step: '1' }, dica: 'De 1 a 60 meses.' })}
${ui.campo({ nome: `cm-inicio-${i}`, rotulo: 'Início', tipo: 'data', valor: com.inicio || HOJE, obrigatorio: true })}
${ui.campo({ nome: `cm-obs-${i}`, rotulo: 'Motivo / observação', valor: com.obs || '', placeholder: 'Ex.: bônus pela renovação' })}</div></div>`;
}
/** seção completa (linhas + adicionar) */
export function comissoesEditor(ctx, lista) {
  const { ui } = ctx;
  return `<div class="m-clientes-cms" data-cms>${(lista || []).map((x, i) => comissaoLinha(ctx, x, i)).join('')}</div>
<p class="sm mut m-clientes-cmvz"${(lista || []).length ? ' hidden' : ''}>Nenhuma comissão variável neste cliente. Use para bônus por resultado, renovação ou indicação — a pessoa vê o valor em Equipe › Comissões.</p>
${ui.btn({ rotulo: 'Adicionar comissão', icone: 'plus', sm: true, tipo: 'ghost', attrs: { 'data-add-cm': '' } })}`;
}

/** lê as linhas do formulário (dados = ui.form.ler) */
export function lerComissoes(f, d) {
  return Array.from(f.querySelectorAll('.m-clientes-cmr')).map(b => {
    const i = b.dataset.cm;
    return { id: d[`cm-id-${i}`] || novoIdCom(), teamId: d[`cm-team-${i}`] || '', tipo: d[`cm-tipo-${i}`] === 'percentual' ? 'percentual' : 'fixo', valor: d[`cm-valor-${i}`] ?? null, meses: d[`cm-meses-${i}`] == null ? null : Number(d[`cm-meses-${i}`]), inicio: d[`cm-inicio-${i}`] || '', obs: String(d[`cm-obs-${i}`] || '').trim() };
  });
}
/** remove as chaves cm-* de um objeto de dados (o rascunho guarda só o array) */
export function limparChavesCm(d) { Object.keys(d).forEach(k => { if (/^cm-/.test(k)) delete d[k]; }); return d; }

/** mensagens de erro de uma comissão (vazio = ok) — por campo */
export function errosComissao(com) {
  const e = {};
  if (!com.teamId) e.team = 'Escolha a pessoa da equipe.';
  if (com.valor == null || !(Number(com.valor) > 0)) e.valor = 'Informe um valor maior que zero.';
  else if (com.tipo === 'percentual' && Number(com.valor) > 100) e.valor = 'O percentual vai até 100%.';
  if (!Number.isInteger(Number(com.meses)) || com.meses < 1 || com.meses > 60) e.meses = 'Entre 1 e 60 meses.';
  if (!com.inicio || !/^\d{4}-\d{2}-\d{2}$/.test(com.inicio)) e.inicio = 'Informe a data de início.';
  return e;
}
/** regras para ui.form.validar a partir das linhas presentes no formulário */
export function regrasComissoes(f) {
  const r = {};
  f.querySelectorAll('.m-clientes-cmr').forEach(b => {
    const i = b.dataset.cm;
    r[`cm-team-${i}`] = 'obrigatorio';
    r[`cm-valor-${i}`] = [(v, d) => errosComissao({ teamId: 'x', tipo: d[`cm-tipo-${i}`], valor: v, meses: 1, inicio: '2000-01-01' }).valor || ''];
    r[`cm-meses-${i}`] = [v => errosComissao({ teamId: 'x', valor: 1, meses: v == null ? null : Number(v), inicio: '2000-01-01' }).meses || ''];
    r[`cm-inicio-${i}`] = 'obrigatorio';
  });
  return r;
}

/** texto do valor mensal para a pessoa (sempre em R$) */
export const textoComissao = (fmt, mensal, meses) => `${fmt.brl2(mensal).replace(/,00$/, '')}/mês por ${fmt.plural(meses, 'mês', 'meses')}`;

/** notifica quem ganhou (ou teve alterada) uma comissão */
export function notificarComissoes(ctx, c, antes, depois) {
  const { notify, fmt, db } = ctx;
  const ant = new Map((antes || []).map(x => [x.id, x]));
  const mudou = (a, b) => ['teamId', 'tipo', 'valor', 'meses', 'inicio'].some(k => String(a[k]) !== String(b[k]));
  (depois || []).forEach(com => {
    const a = ant.get(com.id);
    if (a && !mudou(a, com)) return;
    const p = db.get('team', com.teamId); const uid = p && p.userId;
    if (!uid || (ctx.real && uid === ctx.real.id)) return;
    const mensal = K.comissaoMensal(c, com);
    const criadas = notify.enviar({
      para: [uid], tipo: 'sistema',
      titulo: `${a && a.teamId === com.teamId ? 'Sua comissão variável foi atualizada' : 'Você tem uma comissão variável'}: ${c.nome} — ${textoComissao(fmt, mensal, com.meses)}`,
      texto: `Vale de ${fmt.data(com.inicio)} até ${fmt.data(K.terminoComissao(com))}.${com.obs ? ` Motivo: ${com.obs}.` : ''} Acompanhe em Equipe › Comissões.`,
      link: `#/equipe/${com.teamId}/comissoes`, refCol: 'clients', refId: c.id,
    });
    // O valor é da própria pessoa: não deve ser redigido pela regra "receita só para dono/admin" das Notificações
    // (que pula notificações já marcadas com semValores). valorProprio documenta o motivo.
    (criadas || []).forEach(n => db.update('notifications', n.id, { semValores: true, valorProprio: 'comissao' }));
  });
}

/** card de leitura na aba Cadastro (só para quem vê receita) */
export function cardComissoes(ctx, c, podeEditar) {
  const { ui, fmt } = ctx;
  const l = (c.comissoes || []).map(com => ({ com, mensal: K.comissaoMensal(c, com), st: K.statusComissao(com), rest: K.mesesRestantes(com), termina: K.terminoComissao(com) }));
  const ativas = l.filter(x => K.comissaoAtiva(x.com));
  const corpo = l.length ? `<ul class="m-clientes-cml">${l.map(x => `<li>${ui.avatar(x.com.teamId, 28)}<div class="trunc"><b>${fmt.esc(K.nomePessoa(x.com.teamId))}</b><span class="sm mut">${x.com.tipo === 'percentual' ? `${fmt.pct(x.com.valor, x.com.valor % 1 ? 1 : 0)} do MRR` : 'Valor fixo'} · ${fmt.plural(x.com.meses, 'mês', 'meses')} desde ${fmt.data(x.com.inicio)}${x.com.obs ? ` · ${fmt.esc(x.com.obs)}` : ''}</span></div><div class="m-clientes-cmn"><b class="num">${fmt.brl2(x.mensal)}</b><span class="sm mut">${x.st === 'encerrada' ? `terminou ${fmt.data(x.termina)}` : `${fmt.plural(x.rest, 'mês restante', 'meses restantes')} · até ${fmt.data(x.termina)}`}</span>${seloStatusCom(ui, x.st)}</div></li>`).join('')}</ul>`
    : ui.vazio({ titulo: 'Nenhuma comissão variável', texto: podeEditar ? 'Em "Editar cadastro" você adiciona um valor fixo por mês ou um % do MRR para alguém da equipe, por um número de meses.' : 'Sem comissões cadastradas para este cliente.', compacto: true });
  return ui.card({ titulo: 'Comissão variável', icone: 'dollar', sub: ativas.length ? `${fmt.brl2(ativas.reduce((a, x) => a + x.mensal, 0))}/mês ativos · ${fmt.plural(ativas.length, 'comissão', 'comissões')}` : 'visível só para administradores', ajuda: 'Bônus por cliente para alguém da equipe: valor fixo por mês ou % do MRR, por N meses a partir do início. A pessoa vê só o valor em R$ no próprio perfil (Equipe › Comissões). Total do mês em Financeiro › Comissões.', corpo });
}

/** eventos do editor (adicionar, remover com Desfazer, trocar tipo) */
export function mountComissoes(el, ctx, { aoMudar } = {}) {
  const { ui } = ctx;
  const box = () => el.querySelector('[data-cms]');
  const vazio = () => { const v = el.querySelector('.m-clientes-cmvz'); if (v) v.hidden = !!el.querySelector('.m-clientes-cmr'); };
  const onClick = e => {
    if (e.target.closest('[data-add-cm]')) {
      const w = box(); if (!w) return;
      const i = Math.max(-1, ...Array.from(w.querySelectorAll('.m-clientes-cmr')).map(b => Number(b.dataset.cm))) + 1;
      w.insertAdjacentHTML('beforeend', comissaoLinha(ctx, { tipo: 'fixo', meses: 6, inicio: HOJE }, i));
      vazio(); const s = w.querySelector(`[name="cm-team-${i}"]`); s && s.focus(); aoMudar && aoMudar(); return;
    }
    const rm = e.target.closest('[data-rm-cm]');
    if (rm) {
      const b = el.querySelector(`.m-clientes-cmr[data-cm="${rm.dataset.rmCm}"]`); if (!b) return;
      const prox = b.nextElementSibling; const pai = b.parentElement;
      const nome = (b.querySelector('select[name^="cm-team-"]') || {}).selectedOptions?.[0]?.textContent || '';
      b.remove(); vazio(); aoMudar && aoMudar();
      ui.toast(`Comissão${nome && !/Escolha/.test(nome) ? ` de ${nome.split(' · ')[0]}` : ''} removida (salve para confirmar).`, { tipo: 'info', desfazer: () => { if (!pai.isConnected) return; pai.insertBefore(b, prox && prox.parentElement === pai ? prox : null); vazio(); aoMudar && aoMudar(); } });
    }
  };
  const onChange = e => {
    const t = e.target.closest('[data-cm-tipo]'); if (!t) return;
    const i = t.dataset.cmTipo; const w = el.querySelector(`[data-cm-valor="${i}"]`); if (!w) return;
    const inp = w.querySelector('input'); const v = inp ? ui.form.ler(w)[`cm-valor-${i}`] : null;
    w.innerHTML = campoValor(ctx, { tipo: t.value, valor: t.value === 'percentual' && v > 100 ? '' : v }, i);
  };
  el.addEventListener('click', onClick); el.addEventListener('change', onChange);
  return () => { el.removeEventListener('click', onClick); el.removeEventListener('change', onChange); };
}
