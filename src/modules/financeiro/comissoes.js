// financeiro/comissoes.js — Comissões variáveis por cliente (client.comissoes) + aba Financeiro › Comissões.
// Modelo (cadastrado pelo módulo Clientes, aba Cadastro): client.comissoes = [{ id, teamId, tipo: 'fixo'|'percentual', valor, meses, inicio, obs }]
//   valor mensal = fixo ? valor : valor/100 × client.mrr · ativa enquanto inicio ≤ hoje < inicio + meses.
// Os cálculos vêm de src/modules/clientes/calc.js (comissaoMensal, comissaoAtiva, mesesRestantes, statusComissao…): uma regra só no app.
import { db as DB } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import { comissaoMensal, comissaoAtiva, mesesRestantes, statusComissao, fimComissao, terminoComissao } from '../clientes/calc.js';

export { comissaoMensal, comissaoAtiva, mesesRestantes };

/** situação para exibir: ativa | encerra (≤ 1 mês restante) | encerrada | futura */
export function situacao(com) {
  const st = statusComissao(com);
  if (st === 'futura') return { id: 'futura', estado: 'off', rotulo: `Começa em ${fmt.data(com.inicio)}` };
  if (st === 'encerrada') return { id: 'encerrada', estado: 'off', rotulo: `Encerrada em ${fmt.data(terminoComissao(com))}` };
  if (st === 'encerrando') { const dias = Math.max(1, fmt.diasAte(fimComissao(com)) || 1); return { id: 'encerra', estado: 'warn', rotulo: `Encerra em ${dias === 1 ? '1 dia' : `${dias} dias`}` }; }
  return { id: 'ativa', estado: 'ok', rotulo: 'Ativa' };
}

/** todas as comissões cadastradas nos clientes, já calculadas */
export function todasComissoes(db = DB) {
  const out = [];
  for (const c of db.list('clients', x => Array.isArray(x.comissoes) && x.comissoes.length)) {
    for (const com of c.comissoes) {
      if (!com || !com.teamId || !com.inicio) continue;
      const ativa = comissaoAtiva(com);
      out.push({ ...com, id: com.id || `${c.id}:${com.teamId}`, clientId: c.id, cliente: c.nome || c.fantasia || c.id, mensal: comissaoMensal(c, com), ativa, restantes: ativa ? mesesRestantes(com) : 0, fim: terminoComissao(com), sit: situacao(com) });
    }
  }
  return out;
}
/** comissões de uma pessoa (teamId) */
export function comissoesDe(teamId, db = DB) { return todasComissoes(db).filter(x => x.teamId === teamId); }
/** total mensal das comissões ativas em uma data (para a DRE) */
export function totalComissoesEm(data, db = DB) {
  const h = fmt.iso(data || new Date()); let t = 0;
  for (const c of db.list('clients', x => Array.isArray(x.comissoes) && x.comissoes.length)) {
    for (const com of c.comissoes) if (com && com.inicio && comissaoAtiva(com, h)) t += comissaoMensal(c, com);
  }
  return t;
}

/* ============================== aba Comissões ============================== */
const regra = com => (com.tipo === 'percentual' ? `${fmt.dec(Number(com.valor) || 0, (Number(com.valor) % 1) ? 1 : 0)}% do MRR` : `Fixo ${fmt.brl(Number(com.valor) || 0)}`);
const pessoaNome = id => (DB.get('team', id) || {}).nome || 'Pessoa removida';

export function abaComissoes(ctx) {
  const { ui, query, router } = ctx;
  const todas = todasComissoes(ctx.db);
  const ativas = todas.filter(x => x.ativa);
  const total = ativas.reduce((a, x) => a + x.mensal, 0);
  const pessoas = [...new Set(todas.map(x => x.teamId))].sort((a, b) => pessoaNome(a).localeCompare(pessoaNome(b), 'pt-BR'));
  const fP = pessoas.includes(query.pessoa) ? query.pessoa : '';
  const fS = ['ativas', 'encerradas', 'todas'].includes(query.st) ? query.st : 'ativas';
  const encerrando = ativas.filter(x => x.sit.id === 'encerra');
  if (!todas.length) {
    return ui.card({ titulo: 'Comissões variáveis', corpo: ui.vazio({ icone: 'users', titulo: 'Nenhuma comissão cadastrada', texto: 'Comissões por cliente (valor fixo ou % do MRR, por um número de meses) são cadastradas na ficha do cliente, aba Cadastro. Elas aparecem aqui somadas por pessoa e entram na DRE.', acao: { rotulo: 'Ir para Clientes', href: '#/clientes', icone: 'building' } }) });
  }
  const porPessoa = pessoas.map(id => {
    const l = ativas.filter(x => x.teamId === id);
    const prox = l.map(x => x.fim).filter(Boolean).sort()[0] || null;
    return { id, nome: pessoaNome(id), n: l.length, clientes: l.map(x => x.cliente), mensal: l.reduce((a, x) => a + x.mensal, 0), prox, warn: l.some(x => x.sit.id === 'encerra') };
  }).filter(p => p.n).sort((a, b) => b.mensal - a.mensal);
  const kpis = `<div class="g-kpi mf-kpis mf-com-k">
${ui.kpi({ rotulo: 'Total variável do mês', valor: fmt.brl(total), comp: `${fmt.plural(ativas.length, 'comissão ativa', 'comissões ativas')}`, ajuda: 'Soma das comissões ativas hoje. Fixo = valor do cadastro; percentual = % × MRR atual do cliente. Entra na DRE como "Comissões variáveis" (dentro de Pessoal).' })}
${ui.kpi({ rotulo: 'Pessoas com comissão', valor: fmt.num(porPessoa.length), comp: 'com pelo menos uma ativa', ajuda: 'Pessoas da equipe com alguma comissão ativa hoje.' })}
${ui.kpi({ rotulo: 'Encerram em até 1 mês', valor: fmt.num(encerrando.length), comp: encerrando.length ? fmt.brl(encerrando.reduce((a, x) => a + x.mensal, 0)) + '/mês a menos' : 'nenhuma', led: encerrando.length ? 'warn' : 'ok', ajuda: 'Comissões cujo prazo (início + meses) termina nos próximos 31 dias. Combine com a pessoa antes do fim.' })}
${ui.kpi({ rotulo: 'Encerradas', valor: fmt.num(todas.filter(x => x.sit.id === 'encerrada').length), comp: 'histórico no cadastro', ajuda: 'Comissões que já passaram do prazo. Ficam no cadastro do cliente como histórico.' })}
</div>`;
  const tabPessoa = ui.tabela({
    cols: [
      { k: 'nome', l: 'Pessoa', r: p => `<a class="mf-pes" href="${fmt.esc(router.href(null, { pessoa: fP === p.id ? null : p.id }))}" aria-current="${fP === p.id}">${ui.avatar(p.id, 28)}<span class="mf-pes-t"><b>${fmt.esc(p.nome)}</b><span class="sub">${fmt.plural(p.n, 'cliente')}${p.prox ? ` · ${p.warn ? 'uma encerra' : 'próxima encerra'} ${fmt.data(p.prox)}` : ''}</span></span></a>` },
      { k: 'mensal', l: 'Valor mensal', num: true, r: p => `${p.warn ? `<span class="mf-ledm">${ui.led('warn', false, { aria: 'Uma comissão encerra em até 1 mês' })}</span>` : ''}<b>${fmt.brl(p.mensal)}</b>` },
    ],
    linhas: porPessoa, legenda: 'Comissões por pessoa', mobile: 'scroll',
    vazio: { titulo: 'Nenhuma comissão ativa', texto: 'As comissões cadastradas já encerraram.' },
    rodape: porPessoa.length > 1 ? `<tr class="mf-tot"><td class="t1"><b>Total</b></td><td class="n num"><b>${fmt.brl(total)}</b></td></tr>` : '',
  });
  let lista = todas.filter(x => (!fP || x.teamId === fP) && (fS === 'todas' || (fS === 'ativas' ? x.ativa : !x.ativa)));
  const ord = { encerra: 0, ativa: 1, futura: 2, encerrada: 3 };
  lista = lista.sort((a, b) => ord[a.sit.id] - ord[b.sit.id] || b.mensal - a.mensal);
  const tab = ui.tabela({
    cols: [
      { k: 'pessoa', l: 'Pessoa', v: x => pessoaNome(x.teamId), r: x => `<span class="mf-pes">${ui.avatar(x.teamId, 22)}<span>${fmt.esc(fmt.primeiro(pessoaNome(x.teamId)))}</span></span>` },
      { k: 'cliente', l: 'Cliente', r: x => `<a class="fw6" href="#/clientes/${fmt.esc(x.clientId)}/cadastro"${x.obs ? ` data-tip="${fmt.esc(x.obs)}"` : ''}>${fmt.esc(x.cliente)}</a><span class="sub">${fmt.esc(regra(x))}</span>` },
      { k: 'mensal', l: 'Valor mensal', num: true, r: x => (x.ativa ? fmt.brl(x.mensal) : `<span class="mut">${fmt.brl(x.mensal)}</span>`) },
      { k: 'fim', l: 'Vigência', v: x => x.fim || '', r: x => `<span class="num mf-nw">até ${fmt.data(x.fim)}</span><span class="sub">${x.ativa ? fmt.plural(x.restantes, 'mês restante', 'meses restantes') : `desde ${fmt.data(x.inicio)} · ${fmt.plural(Number(x.meses) || 0, 'mês', 'meses')}`}</span>` },
      { k: 'st', l: 'Situação', v: x => ord[x.sit.id], r: x => ui.led(x.sit.estado, x.sit.rotulo) },
      { k: 'a', l: '', sort: false, w: '44px', mobile: false, r: x => `<a class="ib" href="#/clientes/${fmt.esc(x.clientId)}/cadastro" aria-label="${fmt.esc(`Editar no cadastro de ${x.cliente}`)}" title="${fmt.esc(`Editar no cadastro de ${x.cliente}`)}">${ui.ic('edit')}</a>` },
    ],
    linhas: lista, legenda: 'Comissões cadastradas', mobile: 'cards',
    vazio: { titulo: 'Nenhuma comissão neste filtro', texto: 'Troque a pessoa ou a situação nos filtros acima.' },
  });
  const chipsP = ui.chips([{ id: '', rotulo: 'Todas as pessoas', n: todas.length }].concat(pessoas.map(id => ({ id, rotulo: fmt.primeiro(pessoaNome(id)), n: todas.filter(x => x.teamId === id).length }))), fP, 'pessoa', { rotulo: 'Filtrar por pessoa' });
  const chipsS = ui.chips([{ id: 'ativas', rotulo: 'Ativas', n: ativas.length }, { id: 'encerradas', rotulo: 'Encerradas', n: todas.length - ativas.length }, { id: 'todas', rotulo: 'Todas', n: todas.length }], fS, 'st', { rotulo: 'Filtrar por situação' });
  const csv = ui.btn({ rotulo: 'Exportar CSV', icone: 'download', sm: true, tipo: 'ghost', attrs: { 'data-f': 'com-csv' }, title: 'Baixa as comissões do filtro atual (abre no Excel/Planilhas)' });
  return `${kpis}
<div class="g-1-2">${ui.card({ titulo: 'Por pessoa', sub: `${fmt.brl(total)}/mês`, ajuda: 'Comissões ativas somadas por pessoa. Clique no nome para filtrar a lista ao lado.', pad: false, corpo: tabPessoa })}
${ui.card({ titulo: 'Todas as comissões', sub: fP ? `de ${pessoaNome(fP)}` : `${fmt.plural(lista.length, 'comissão', 'comissões')}`, acoes: csv, pad: false, ajuda: 'LED verde = ativa; âmbar = encerra em até 1 mês; cinza = encerrada. Para criar ou editar, abra o cadastro do cliente.', corpo: `<div class="mf-fil mf-fil2">${chipsP}${chipsS}</div>${tab}` })}</div>`;
}

/** CSV (separador ; e vírgula decimal — abre direto no Excel em pt-BR) */
export function csvComissoes(ctx) {
  const { query } = ctx;
  const fP = query.pessoa || ''; const fS = ['ativas', 'encerradas', 'todas'].includes(query.st) ? query.st : 'ativas';
  const l = todasComissoes(ctx.db).filter(x => (!fP || x.teamId === fP) && (fS === 'todas' || (fS === 'ativas' ? x.ativa : !x.ativa)));
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const num = v => String((Math.round((Number(v) || 0) * 100) / 100).toFixed(2)).replace('.', ',');
  const linhas = [['Pessoa', 'Cliente', 'Tipo', 'Valor cadastrado', 'Valor mensal (R$)', 'Meses', 'Início', 'Fim', 'Meses restantes', 'Situação', 'Observação'].map(q).join(';')]
    .concat(l.map(x => [pessoaNome(x.teamId), x.cliente, x.tipo === 'percentual' ? 'Percentual do MRR' : 'Fixo', x.tipo === 'percentual' ? `${num(x.valor)}%` : num(x.valor), num(x.mensal), x.meses, fmt.data(x.inicio), x.fim ? fmt.data(x.fim) : '', x.restantes, x.sit.rotulo, x.obs || ''].map(q).join(';')));
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `comissoes-${fmt.iso(new Date())}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  return l.length;
}
