// resultados.js — aba "Resultados e ações": Desde que entramos → gráfico real × meta com as ações marcadas →
// Impacto das ações → linha do tempo das ações da equipe (filtros + Registrar ação). Resumo mensal em modal.
import * as K from './calc.js';
import { ABA_RA } from './ficha.js';
import { SEMANAS, NSEM, HOJE, TIPOS_ACAO, AREAS } from './data.js';

export const COR_AREA = { trafego: 'var(--c1)', producao: 'var(--c4)', cs: 'var(--c3)', torre: 'var(--c2)' };
const curto = (s, n = 70) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));

/* ================= Resultados e ações ================= */
export function abaResultadosAcoes(ctx, c) {
  return `${blocoResultados(ctx, c)}<div id="m-clientes-acoes" data-foco="acoes" class="m-clientes-fs">${abaAcoes(ctx, c)}</div>`;
}

function blocoResultados(ctx, c) {
  const { ui, fmt, charts } = ctx;
  const rs = K.resultados(c); const mets = K.metricasDe(c);
  if (!rs || !mets.length) {
    return ui.card({ titulo: 'Resultados', corpo: ui.vazio({ icone: 'target', titulo: c.status === 'onboarding' ? 'Resultados chegam após a 1ª entrega' : 'Sem metas ou dados de resultado', texto: 'Cadastre as metas (ROAS, CPL, leads/mês, faturamento) e conecte as contas de anúncio e o analytics na aba Cadastro. Os dados semanais aparecem aqui com as ações da equipe marcadas no gráfico. Enquanto isso, registre abaixo o que a equipe já fez.', acao: { rotulo: 'Abrir cadastro', href: `#/clientes/${c.id}/cadastro`, icone: 'edit' } }) });
  }
  const k = mets.includes(ctx.query.m) ? ctx.query.m : mets[0];
  const M = K.METRICAS[k]; const meta = c.metas[M.meta]; const serie = rs[k];
  const acoes = K.acoes(c);
  const inicio = serie.findIndex(v => v != null);

  // desde que entramos
  const base = c.baseline || {};
  const baseKey = { roas: 'roas', cpl: 'cpl', leads: 'leadsMes', faturamento: 'faturamento' };
  const tiles = mets.map(m => {
    const Mm = K.METRICAS[m]; const b = base[baseKey[m]]; const v = K.ultimo(rs[m]); const p = K.melhoria(m, b, v); const mt = c.metas[Mm.meta];
    const r = K.razao(m, v, mt); const e = r == null ? 'off' : r >= 1 ? 'ok' : r >= 0.75 ? 'warn' : 'err';
    return `<a class="m-clientes-dq${m === k ? ' on' : ''}" href="${ctx.router.href(`clientes/${c.id}/${ABA_RA}`, { m })}" aria-current="${m === k}">
<span class="m-clientes-dqk">${fmt.esc(Mm.rotulo)} ${ui.ajuda(Mm.ajuda)}</span>
<span class="m-clientes-dqv"><b class="num">${Mm.fmt(v)}</b>${p == null ? '' : ui.delta(`${(K.METRICAS[m].melhor === 'menor' ? p <= 0 : p >= 0) ? '▲' : '▼'} ${fmt.pct(Math.abs(p), 0)}`, p >= 0)}</span>
<span class="sm mut num">início ${b == null ? '—' : Mm.fmt(b)} → hoje · meta ${Mm.fmt(mt)}</span>
<span class="sm">${ui.selo(e, { ok: 'Na meta', warn: 'Perto da meta', err: 'Abaixo da meta', off: 'Sem meta' }[e], { cls: 'm-clientes-selo' })}</span></a>`;
  }).join('');
  const desde = ui.card({ titulo: 'Desde que entramos', sub: `Linha de base: ${fmt.mesAno(base.data || c.desde)} (1º mês de contrato) × última semana`, ajuda: 'Compara o resultado do 1º mês de contrato com o da última semana. Para CPL, queda é melhora. Clique num indicador para vê-lo no gráfico.',
    acoes: ui.btn({ rotulo: 'Resumo para o cliente', icone: 'copy', sm: true, attrs: { 'data-resumo': '' } }), corpo: `<div class="m-clientes-dqs">${tiles}</div>` });

  // gráfico com marcos
  const porSemana = {};
  acoes.forEach(a => { const w = K.semanaDe(a.data); if (w < 0 || w < inicio) return; (porSemana[w] = porSemana[w] || []).push(a); });
  const marcos = Object.entries(porSemana).map(([w, l]) => ({ i: Number(w), cor: COR_AREA[l[0].area] || 'var(--c4)', rotulo: l.map(a => `${K.nomePessoa(a.quem)} · ${a.tipo}: ${curto(a.descricao, 80)}`).join('\n') }));
  const grafico = charts.linhas({
    series: [{ nome: `${M.rotulo} real`, dados: serie, area: true }], rotulos: SEMANAS.map(fmt.dataCurta),
    formato: { eixo: v => (k === 'faturamento' ? fmt.brlK(v, { short: true }) : k === 'cpl' ? `R$ ${fmt.num(v)}` : k === 'roas' ? fmt.dec(v, 1) : fmt.compacto(v)), tip: M.fmt },
    metas: [{ valor: meta, rotulo: `Meta ${M.fmt(meta)}` }], marcos, rotuloMarcos: 'Ações da equipe', altura: 300, min: 0,
    destaque: { i: NSEM - 1, texto: `Hoje · ${M.fmt(K.ultimo(serie))}` },
    rotulo: `${M.rotulo} semanal de ${c.nome} com meta ${M.fmt(meta)} e ${marcos.length} ações da equipe marcadas`,
  });
  const legenda = `<div class="m-clientes-leg">${Object.entries(AREAS).map(([a, n]) => `<span><i style="--k:${COR_AREA[a]}"></i>${fmt.esc(n)}</span>`).join('')}<span class="mut">Passe o mouse nos pontos do topo para ver cada ação.</span></div>`;
  const nAbaixo = K.semanasAbaixo(k, serie, meta);
  const chartCard = ui.card({
    titulo: `${M.rotulo}: real × meta`, sub: `26 semanas · ${fmt.plural(acoes.filter(a => K.semanaDe(a.data) >= inicio).length, 'ação', 'ações')} da equipe no período`,
    ajuda: `${M.ajuda} Os pontos coloridos no topo são as ações da equipe (tráfego, produção, atendimento e Torre de Controle) — compare o antes e o depois de cada uma. A lista completa está na linha do tempo abaixo.`,
    acoes: ui.btn({ rotulo: 'Ver linha do tempo', sm: true, tipo: 'ghost', iconeDir: 'arrow-down', attrs: { 'data-ir-acoes': '' } }),
    corpo: `${nAbaixo >= 2 ? ui.aviso({ tipo: 'err', titulo: `${M.rotulo} abaixo de 70% da meta há ${nAbaixo} semanas.`, texto: 'Registre as ações de correção para medir o efeito de cada uma.' }) : ''}${grafico}${legenda}`,
  });

  // impacto das ações
  const comImp = acoes.filter(a => K.semanaDe(a.data) >= Math.max(inicio, 0)).map(a => ({ a, imp: K.impacto(a, c, rs) })).filter(x => x.imp);
  const impTbl = comImp.length ? ui.tabela({
    cols: [
      { k: 'data', l: 'Data', v: x => x.a.data, r: x => `<span class="nowrap">${fmt.dataCurta(x.a.data)}</span>` },
      { k: 'acao', l: 'Ação', v: x => x.a.tipo, r: x => `<div class="m-clientes-ia"><i class="m-clientes-dot" style="--k:${COR_AREA[x.a.area] || 'var(--c4)'}"></i><div><b>${fmt.esc(x.a.tipo)}</b><span class="sub">${fmt.esc(K.nomePessoa(x.a.quem))}${x.a.origem === 'torre' ? ' (automática)' : ''} · ${fmt.esc(curto(x.a.descricao, 110))}</span></div></div>` },
      { k: 'met', l: 'Métrica', v: x => x.imp.k, r: x => `${fmt.esc(K.METRICAS[x.imp.k].curta)}${x.imp.inferido ? ` <span class="mut sm" title="Ação sem métrica específica: usamos a principal do cliente">*</span>` : ''}`, mobile: false },
      { k: 'antes', l: '14 d antes', num: true, v: x => x.imp.antes, r: x => K.METRICAS[x.imp.k].fmt(x.imp.antes) },
      { k: 'depois', l: '14 d depois', num: true, v: x => x.imp.depois ?? -1, r: x => (x.imp.pendente ? '<span class="mut">—</span>' : K.METRICAS[x.imp.k].fmt(x.imp.depois)) },
      { k: 'pct', l: 'Efeito', num: true, v: x => (x.imp.pendente ? -999 : x.imp.pct), r: x => (x.imp.pendente ? `<span class="sm mut">aguardando ${fmt.plural(x.imp.faltam, 'dia')}</span>` : ui.delta(`${(K.METRICAS[x.imp.k].melhor === 'menor' ? x.imp.pct <= 0 : x.imp.pct >= 0) ? '▲' : '▼'} ${fmt.pct(Math.abs(x.imp.pct), 1)}`, Math.abs(x.imp.pct) < 1 ? null : x.imp.pct > 0)) },
    ], linhas: comImp, legenda: 'Impacto das ações', ordem: { k: 'data', dir: 'desc' }, densa: true,
  }) : ui.vazio({ titulo: 'Nenhuma ação registrada no período', texto: 'Registre as ações da equipe para ver o efeito de cada uma no resultado.', compacto: true });
  const impCard = ui.card({ titulo: 'Impacto das ações', sub: 'Média das 2 semanas antes × 2 semanas depois', pad: comImp.length ? false : undefined, ajuda: 'Para cada ação, compara a métrica afetada nos 14 dias anteriores com os 14 dias seguintes. Verde = melhorou (para CPL, cair é melhorar). * = ação sem métrica própria, medida pela métrica principal. Correlação, não prova de causa: outras coisas mudam ao mesmo tempo.', corpo: impTbl });

  return `${desde}${chartCard}<div class="m-clientes-rr">${impCard}</div>`;
}

/** modal com o resumo mensal pronto para colar no WhatsApp/e-mail; copiar + "Registrar envio" */
export async function abrirResumo(ctx, c) {
  const { ui, fmt, db } = ctx;
  const texto = resumoMensal(ctx, c);
  let copiou = false;
  const ok = await ui.modal({
    titulo: 'Resumo mensal para o cliente', sub: `${c.nome} · ${fmt.mesLongo(HOJE)}/${HOJE.slice(0, 4)} · revise antes de enviar`, largura: 'lg', confirmar: 'Copiar resumo',
    corpo: `<p class="sm mut">Gerado a partir dos resultados das últimas 4 semanas e das ações registradas no mês. Você pode ajustar o texto antes de copiar.</p><textarea class="m-clientes-rel" rows="14" aria-label="Resumo mensal para o cliente">${fmt.esc(texto)}</textarea>`,
    onConfirmar: box => {
      const ta = box.querySelector('.m-clientes-rel');
      try { ta.focus(); ta.select(); copiou = document.execCommand('copy'); } catch (er) { copiou = false; }
      if (!copiou && navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(ta.value).catch(() => {}); copiou = true; }
      return copiou ? true : 'Não foi possível copiar automaticamente: o texto está selecionado, use Ctrl+C.';
    },
  });
  if (!ok) return;
  const pode = ctx.can('clientes', 'editar');
  ui.toast('Resumo copiado. Cole no WhatsApp ou e-mail do cliente.', {
    tipo: 'ok',
    acao: pode ? { rotulo: 'Registrar envio', fn: () => { db.insert('clientActions', { clientId: c.id, data: HOJE, quem: ctx.user && ctx.user.teamId, tipo: 'Relatório de resultados', area: 'cs', metrica: null, descricao: 'Resumo mensal de resultados enviado ao cliente.', antes: '', depois: '', expectativa: '', resultado: '', origem: 'manual' }, { log: `enviou o resumo mensal para ${c.nome}` }); ui.toast('Envio registrado na linha do tempo de ações.'); } } : null,
  });
}

export function resumoMensal(ctx, c, rs, mets) {
  const { fmt } = ctx;
  rs = rs || K.resultados(c); mets = mets || K.metricasDe(c);
  const mes = `${fmt.mesLongo(HOJE)} de ${HOJE.slice(0, 4)}`;
  const linhas = mets.map(k => {
    const M = K.METRICAS[k]; const s = rs[k]; const atual = K.mediaArr(s.slice(-4)); const ant = K.mediaArr(s.slice(-8, -4)); const meta = c.metas[M.meta];
    const p = K.melhoria(k, ant, atual); const r = K.razao(k, atual, meta);
    return `• ${M.rotulo}: ${M.fmt(atual)} (meta ${M.fmt(meta)})${p == null ? '' : ` — ${p >= 0 ? 'melhora' : 'queda'} de ${fmt.pct(Math.abs(p), 0)} vs mês anterior`}${r != null && r >= 1 ? ' ✔ meta atingida' : ''}`;
  });
  const ini = K.addDias(HOJE, -30);
  const acoesMes = K.acoes(c).filter(a => a.data >= ini && a.area !== 'cs').slice(0, 5);
  const pp = K.proximosPassos(c).filter(p => p.estado !== 'ok').slice(0, 3);
  const dc = K.decisor(c);
  return [
    `Olá${dc ? `, ${fmt.primeiro(dc.nome)}` : ''}! Segue o resumo de resultados de ${c.nome} — ${mes}.`,
    '',
    'RESULTADOS (média das últimas 4 semanas)',
    ...linhas,
    '',
    'O QUE FIZEMOS NO MÊS',
    ...(acoesMes.length ? acoesMes.map(a => `• ${fmt.dataCurta(a.data)} — ${a.tipo}: ${curto(a.descricao, 110)}`) : ['• Rotina de otimização das campanhas e conteúdos.']),
    '',
    'PRÓXIMOS PASSOS',
    ...(pp.length ? pp.map(p => `• ${p.titulo}`) : ['• Manter a estratégia atual e escalar o que está acima da meta.']),
    '',
    `Qualquer dúvida, estamos à disposição. — ${K.nomePessoa(c.respId)}, Agência`,
  ].join('\n');
}

/* ================= Ações da equipe ================= */
function itensTimeline(ctx, c) {
  const { db } = ctx;
  const a = K.acoes(c).map(x => ({ ...x, fonte: 'acao' }));
  const act = db.list('activity', x => x.refId === c.id && x.col !== 'clientActions').map(x => ({ id: x.id, data: String(x.quando || '').slice(0, 10), quando: x.quando, quem: (db.find('team', t => t.userId === x.quem) || {}).id || null, quemNome: x.quemNome, tipo: 'Registro no sistema', area: 'cs', descricao: x.oque, fonte: 'activity', origem: 'manual' }));
  const tk = db.list('tasks', x => x.clientId === c.id && /^(feito|feita|concluid|entregue|done)/i.test(String(x.status || ''))).map(x => ({ id: x.id, data: String(x.concluidaEm || x.updatedAt || x.prazo || '').slice(0, 10), quem: x.respId, tipo: 'Tarefa concluída', area: 'producao', descricao: x.titulo, fonte: 'task', origem: 'manual' }));
  return [...a, ...act, ...tk].filter(x => x.data).sort((x, y) => String(y.data).localeCompare(String(x.data)));
}
export function abaAcoes(ctx, c) {
  const { ui, fmt, db, query } = ctx;
  const todos = itensTimeline(ctx, c);
  const per = ['30', '90', '180', 'tudo'].includes(query.per) ? query.per : 'tudo';
  const area = query.area && (AREAS[query.area]) ? query.area : 'todas';
  const pessoaSel = query.pessoa || '';
  const ini = per === 'tudo' ? '0000' : K.addDias(HOJE, -Number(per));
  const l = todos.filter(x => x.data >= ini && (area === 'todas' || x.area === area) && (!pessoaSel || (pessoaSel === 'torre' ? x.origem === 'torre' : x.quem === pessoaSel)));
  const pessoas = [...new Set(todos.map(x => x.quem).filter(Boolean))].map(id => ({ v: id, l: K.nomePessoa(id) }));
  const nPor = a => todos.filter(x => x.data >= ini && x.area === a && (!pessoaSel || (pessoaSel === 'torre' ? x.origem === 'torre' : x.quem === pessoaSel))).length;
  const filtros = `<div class="m-clientes-af">
${ui.chips([{ id: 'todas', rotulo: 'Todas', n: todos.filter(x => x.data >= ini).length }, ...Object.entries(AREAS).map(([id, r]) => ({ id, rotulo: r, n: nPor(id) }))], area, 'area', { rotulo: 'Filtrar por área' })}
<div class="row m-clientes-af2"><label class="m-clientes-sel"><span class="sm mut">Pessoa</span><select data-f-pessoa aria-label="Filtrar por pessoa"><option value="">Todas as pessoas</option>${pessoas.map(p => `<option value="${p.v}"${p.v === pessoaSel ? ' selected' : ''}>${fmt.esc(p.l)}</option>`).join('')}<option value="torre"${pessoaSel === 'torre' ? ' selected' : ''}>Torre de Controle (automático)</option></select></label>
<div data-seg-manual class="m-clientes-per">${ui.seg([{ id: '30', rotulo: '30 dias' }, { id: '90', rotulo: '90 dias' }, { id: '180', rotulo: '6 meses' }, { id: 'tudo', rotulo: 'Tudo' }], per, { rotulo: 'Período' })}</div></div></div>`;
  const ICO = k => (TIPOS_ACAO[k] || {}).icone || (k === 'Tarefa concluída' ? 'check' : 'activity');
  const grupos = {};
  l.forEach(x => { const m = fmt.mesAno(x.data); (grupos[m] = grupos[m] || []).push(x); });
  const rs = K.resultados(c);
  const tl = l.length ? Object.entries(grupos).map(([m, it]) => `<section class="m-clientes-tlg"><h3>${fmt.esc(m)}</h3><ol class="m-clientes-tl">${it.map(x => {
    const imp = x.fonte === 'acao' ? K.impacto(x, c, rs) : null;
    const quem = x.origem === 'torre' ? `<span class="m-clientes-tav" style="--k:${COR_AREA.torre}" title="Torre de Controle">${ui.ic('radio-tower')}</span>` : x.quem ? ui.avatar(x.quem, 30) : `<span class="m-clientes-tav">${ui.ic('activity')}</span>`;
    const nome = x.origem === 'torre' ? `Torre de Controle${x.aprovadoPor ? ` · aprovado por ${K.nomePessoa(x.aprovadoPor)}` : ''}` : (x.quem ? K.nomePessoa(x.quem) : x.quemNome || 'Sistema');
    return `<li class="m-clientes-tli" style="--k:${COR_AREA[x.area] || 'var(--c4)'}">
<div class="m-clientes-tlw">${quem}</div>
<div class="m-clientes-tlc"><div class="m-clientes-tlh"><b>${fmt.esc(x.tipo)}</b><span class="m-clientes-tlarea">${ui.ic(ICO(x.tipo))}${fmt.esc(AREAS[x.area] || '')}</span><span class="mut sm">${fmt.esc(nome)} · ${fmt.data(x.data)}</span></div>
<p>${fmt.esc(x.descricao)}</p>
${x.antes || x.depois ? `<p class="m-clientes-ad sm"><span class="mut">Antes</span> ${fmt.esc(x.antes || '—')} <span aria-hidden="true">→</span><span class="sr">depois</span> <b>${fmt.esc(x.depois || '—')}</b></p>` : ''}
${x.expectativa ? `<p class="sm mut">Expectativa: ${fmt.esc(x.expectativa)}</p>` : ''}
${x.resultado || imp ? `<p class="m-clientes-res sm">${imp && !imp.pendente && imp.pct != null ? `${ui.delta(`${(K.METRICAS[imp.k].melhor === 'menor' ? imp.pct <= 0 : imp.pct >= 0) ? '▲' : '▼'} ${fmt.pct(Math.abs(imp.pct), 1)} ${K.METRICAS[imp.k].curta}`, Math.abs(imp.pct) < 1 ? null : imp.pct > 0)} ` : imp && imp.pendente ? `<span class="mut">Efeito medido em ${fmt.plural(imp.faltam, 'dia')}${x.resultado ? ' · ' : ''}</span>` : ''}${x.resultado ? fmt.esc(x.resultado) : ''}</p>` : ''}
</div></li>`;
  }).join('')}</ol></section>`).join('') : ui.vazio({ icone: 'activity', titulo: 'Nenhuma ação com estes filtros', texto: 'Mude o período, a área ou a pessoa — ou registre o que foi feito para este cliente.', acao: ctx.can('clientes', 'editar') ? { rotulo: 'Registrar ação', icone: 'plus', attrs: { 'data-reg-acao': '' } } : null, compacto: true });
  const torre = todos.filter(x => x.origem === 'torre').length;
  return ui.card({
    titulo: 'Ações da equipe', sub: `${fmt.plural(l.length, 'registro')} · tráfego, produção, atendimento${torre ? ` e ${fmt.plural(torre, 'ajuste automático', 'ajustes automáticos')} da Torre` : ''}`,
    ajuda: 'Tudo o que a agência fez por este cliente: ações registradas pela equipe, ajustes automáticos da Torre de Controle (verba, pausas), tarefas concluídas e alterações no cadastro. As ações com métrica aparecem no gráfico acima.',
    acoes: ctx.can('clientes', 'editar') ? ui.btn({ rotulo: 'Registrar ação', icone: 'plus', tipo: 'pri', sm: true, attrs: { 'data-reg-acao': '' } }) : ui.btn({ rotulo: 'Registrar ação', icone: 'plus', sm: true, disabled: true, title: 'Sem permissão para editar este cliente.' }),
    corpo: `${filtros}<div class="m-clientes-tlw0">${tl}</div>`,
  });
}

/* ================= Registrar ação ================= */
export async function registrarAcao(ctx, c) {
  const { ui, fmt, db, notify } = ctx;
  const time = db.list('team', t => t.ativo !== false && t.papel !== 'leitura').map(t => ({ v: t.id, l: t.nome }));
  const metOps = [{ v: '', l: 'Nenhuma (ação de relacionamento)' }, ...Object.entries(K.METRICAS).map(([k, m]) => ({ v: k, l: m.rotulo }))];
  const corpo = `<form class="stack" novalidate><div class="fgrid">
${ui.campo({ nome: 'tipo', rotulo: 'Tipo de ação', tipo: 'select', obrigatorio: true, placeholder: 'Escolha…', opcoes: Object.keys(TIPOS_ACAO) })}
${ui.campo({ nome: 'data', rotulo: 'Data', tipo: 'data', valor: HOJE, obrigatorio: true })}
${ui.campo({ nome: 'descricao', rotulo: 'O que foi feito', tipo: 'textarea', obrigatorio: true, cls: 'full', placeholder: 'Ex.: Pausei 3 anúncios com CPA acima de R$ 60 e dobrei a verba do criativo campeão.' })}
${ui.campo({ nome: 'metrica', rotulo: 'Métrica afetada', tipo: 'select', opcoes: metOps, ajuda: 'A ação aparece no gráfico desta métrica e o efeito é medido 14 dias antes × 14 dias depois.' })}
${ui.campo({ nome: 'quem', rotulo: 'Quem fez', tipo: 'select', opcoes: time, valor: (ctx.user && ctx.user.teamId) || c.respId })}
${ui.campo({ nome: 'antes', rotulo: 'Antes', placeholder: 'Ex.: R$ 300/dia' })}
${ui.campo({ nome: 'depois', rotulo: 'Depois', placeholder: 'Ex.: R$ 450/dia' })}
${ui.campo({ nome: 'expectativa', rotulo: 'Expectativa', cls: 'full', placeholder: 'Ex.: ROAS de volta a 2,5 em 14 dias' })}
</div></form>`;
  let nova = null;
  const ok = await ui.modal({
    titulo: 'Registrar ação', sub: c.nome, corpo, confirmar: 'Registrar ação', largura: 'md',
    onAbrir: box => {
      const tipo = box.querySelector('[name="tipo"]'), met = box.querySelector('[name="metrica"]');
      tipo.addEventListener('change', () => { const t = TIPOS_ACAO[tipo.value]; if (t && !met.dataset.mexeu) met.value = t.metrica || ''; });
      met.addEventListener('change', () => { met.dataset.mexeu = '1'; });
    },
    onConfirmar: box => {
      const f = box.querySelector('form');
      const r = ui.form.validar(f, { descricao: 'obrigatorio|min:10', data: ['obrigatorio', v => (v && K.dias(v) > 0 ? 'A data não pode estar no futuro.' : '')] });
      if (!r.ok) return false;
      const d = r.dados; const t = TIPOS_ACAO[d.tipo] || {};
      nova = db.insert('clientActions', { clientId: c.id, data: d.data, quem: d.quem, tipo: d.tipo, area: t.area || 'cs', metrica: d.metrica || null, descricao: d.descricao, antes: d.antes, depois: d.depois, expectativa: d.expectativa, resultado: '', origem: 'manual' }, { log: `registrou ação "${d.tipo}" em ${c.nome}` });
      const resp = K.userDe(c.respId);
      if (resp && (!ctx.real || resp !== ctx.real.id)) notify.enviar({ para: [resp], titulo: `Nova ação em ${c.nome}: ${d.tipo}`, texto: d.descricao, link: `#/clientes/${c.id}/${ABA_RA}?foco=acoes`, tipo: 'mensagem', refCol: 'clients', refId: c.id });
      return true;
    },
  });
  if (ok && nova) { const id = nova.id; ui.toast('Ação registrada. Ela já aparece na linha do tempo e no gráfico de resultados.', { desfazer: () => db.remove('clientActions', id), acao: { rotulo: 'Ver no gráfico', fn: () => ctx.router.go(`clientes/${c.id}/${ABA_RA}${nova.metrica ? `?m=${nova.metrica}` : ''}`) } }); }
  return ok;
}
