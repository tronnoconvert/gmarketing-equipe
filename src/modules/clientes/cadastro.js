// cadastro.js — aba "Cadastro" (todos os campos do §7, edição com validação e Desfazer) e #/clientes/novo (cadastro em etapas).
import * as K from './calc.js';
import { HOJE, SEMANAS, NSEM, PESOS } from './data.js';
import { agendarReuniao } from './ficha.js';
import { comissoesEditor, lerComissoes, limparChavesCm, regrasComissoes, errosComissao, notificarComissoes, cardComissoes, mountComissoes } from './comissoes.js';

export const SERVICOS = ['Tráfego', 'Google', 'Social', 'Conteúdo', 'Site', 'CRM', 'E-mail marketing'];
export const SEGMENTOS = ['Varejo', 'E-commerce', 'Saúde', 'Construção', 'Imobiliário', 'Tecnologia', 'Educação', 'Alimentação', 'Moda', 'Fitness', 'Automotivo', 'Pet', 'Ótica', 'Serviços', 'Serviços jurídicos', 'Turismo', 'Logística', 'Agronegócio', 'Energia', 'Outro'];
const PAPEIS_CT = [{ v: 'decisor', l: 'Decisor' }, { v: 'dia_a_dia', l: 'Contato do dia a dia' }, { v: 'financeiro', l: 'Financeiro' }, { v: 'outro', l: 'Outro' }];
const CORES = ['#0B6BE8', '#7C5CFC', '#0E9F6E', '#C2700A', '#D9467A', '#0891B2', '#4F46E5', '#B45309', '#047857', '#DC2626', '#475569', '#0F766E'];
const ACESSOS_POR_SERV = { 'Tráfego': [['Meta Ads — conta de anúncios', 'anuncios']], Google: [['Google Ads', 'anuncios']], Social: [['Instagram e Facebook (página)', 'social']], Site: [['Site (WordPress)', 'site']], CRM: [['CRM (RD Station)', 'crm']], 'E-mail marketing': [['Ferramenta de e-mail', 'email']], 'Conteúdo': [] };
const LED_ROT = { ok: 'Conectado', warn: 'Atenção', err: 'Com erro', off: 'Pendente / pausado' };
const dig = s => String(s || '').replace(/\D/g, '');
const semPerm = 'Sem permissão para editar este cliente. Peça ao administrador.';

/* ---------- estado de edição (sobrevive a re-render) ---------- */
export const edicao = { id: null, sujo: false };

/* ---------- validações compartilhadas ---------- */
export function cnpjDuplicado(db, cnpj, ignorarId) { const d = dig(cnpj); if (d.length !== 14) return null; return db.find('clients', c => c.id !== ignorarId && dig(c.cnpj) === d) || null; }
export function nomeDuplicado(db, fmt, nome, ignorarId) { const n = fmt.norm(nome).trim(); if (!n) return null; return db.find('clients', c => c.id !== ignorarId && fmt.norm(c.nome).trim() === n) || null; }

/* ================= Aba Cadastro ================= */
function acessoLinha(ctx, a, i, editar) {
  const { ui, fmt } = ctx;
  return `<li class="m-clientes-acc" data-acc="${i}">
<span class="m-clientes-accl">${ui.led(a.estado, false, { aria: LED_ROT[a.estado] })}</span>
<div class="m-clientes-accm"><b>${fmt.esc(a.nome)}</b><span class="sm ${a.estado === 'err' ? 't-err' : 'mut'}">${fmt.esc(LED_ROT[a.estado] || '')}${a.obs ? ` · ${fmt.esc(a.obs)}` : ''}${a.testadoEm ? ` · testado ${fmt.esc(fmt.rel(a.testadoEm))}` : ''}</span></div>
<div class="m-clientes-acca">${ui.btn({ rotulo: 'Testar conexão', icone: 'refresh', sm: true, attrs: { 'data-testar': i } })}${editar ? ui.btnIc('trash', `Remover acesso ${a.nome}`, { 'data-rm-acc': i }) : ''}</div></li>`;
}
function contatoBloco(ctx, ct, i) {
  const { ui } = ctx;
  return `<div class="m-clientes-ctb" data-ct="${i}"><input type="hidden" name="ct-id-${i}" value="${ctx.fmt.esc(ct.id || '')}">
<div class="row between"><b class="sm">Contato ${i + 1}</b>${ui.btnIc('trash', 'Remover contato', { 'data-rm-ct': i })}</div>
<div class="fgrid">${ui.campo({ nome: `ct-nome-${i}`, rotulo: 'Nome', valor: ct.nome, obrigatorio: true })}
${ui.campo({ nome: `ct-papel-${i}`, rotulo: 'Papel', tipo: 'select', opcoes: PAPEIS_CT, valor: ct.papel || 'outro' })}
${ui.campo({ nome: `ct-email-${i}`, rotulo: 'E-mail', tipo: 'email', valor: ct.email, obrigatorio: true, placeholder: 'nome@empresa.com.br' })}
${ui.campo({ nome: `ct-tel-${i}`, rotulo: 'Telefone / WhatsApp', tipo: 'telefone', valor: ct.telefone })}
${ui.campo({ nome: `ct-cargo-${i}`, rotulo: 'Cargo', valor: ct.cargo })}
${ui.campo({ nome: `ct-wa-${i}`, rotulo: 'Usa WhatsApp para falar com a agência', tipo: 'checkbox', valor: ct.whatsapp !== false })}</div></div>`;
}

export function abaCadastro(ctx, c) {
  const { ui, fmt, db } = ctx;
  const pode = ctx.can('clientes', 'editar');
  const editar = pode && ctx.query.editar === '1';
  if (edicao.id !== c.id || !editar) { edicao.id = editar ? c.id : null; if (!editar) edicao.sujo = false; }
  const cts = K.contatos(c);
  const ctr = db.find('contracts', x => x.clientId === c.id) || {};
  const time = db.list('team', t => t.ativo !== false && t.papel !== 'leitura');
  const reun = K.reunioes(c);
  const ent = K.entregasDe(c);
  const regs = (c.registros || []).slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const acc = `<ul class="m-clientes-accs">${(c.acessos || []).map((a, i) => acessoLinha(ctx, a, i, editar)).join('')}</ul>`;
  const hist = `<div class="g2 m-clientes-hist">
<div><div class="row between"><b class="sm">Reuniões</b>${pode ? ui.btn({ rotulo: 'Agendar', icone: 'plus', sm: true, tipo: 'ghost', attrs: { 'data-agendar': '' } }) : ''}</div>${ui.lista(reun.slice(0, 5).map(m => ({ estado: m.status === 'agendada' ? 'ok' : 'off', titulo: m.titulo, sub: `${fmt.dataHora(m.quando)} · ${m.status}` })), { vazio: { titulo: 'Nenhuma reunião', compacto: true } })}</div>
<div><div class="row between"><b class="sm">Entregas</b><a class="sm" href="#/clientes/${c.id}/entregas">ver todas (${ent.length})</a></div>${ui.lista(ent.slice(0, 4).map(x => ({ estado: x.atrasada ? 'err' : x.feito ? 'ok' : 'warn', titulo: x.titulo || 'Entrega', sub: `${x.prazo ? `prazo ${fmt.data(x.prazo)}` : ''}${x.atrasada ? ' · atrasada' : x.feito ? ' · concluída' : ''}` })), { vazio: { titulo: c.atrasadas ? `${fmt.plural(c.atrasadas, 'entrega atrasada', 'entregas atrasadas')} (cálculo do health)` : 'Nenhuma entrega registrada', compacto: true } })}</div>
<div class="m-clientes-reg"><div class="row between"><b class="sm">Reclamações e elogios</b>${pode ? ui.btn({ rotulo: 'Registrar', icone: 'plus', sm: true, tipo: 'ghost', attrs: { 'data-reg': '' } }) : ''}</div>${ui.lista(regs.map(r => ({ estado: r.tipo === 'reclamacao' ? 'warn' : 'ok', titulo: `${r.tipo === 'reclamacao' ? 'Reclamação' : 'Elogio'} · ${fmt.data(r.data)}`, sub: `${r.texto} — ${K.nomePessoa(r.quem)}` })), { vazio: { titulo: 'Nada registrado', texto: 'Registre reclamações e elogios para entender o humor do cliente.', compacto: true } })}</div></div>`;

  if (!editar) {
    const dc = cts.map(x => [`${(PAPEIS_CT.find(p => p.v === x.papel) || {}).l || 'Contato'}`, `<b>${fmt.esc(x.nome)}</b>${x.cargo ? ` <span class="mut">· ${fmt.esc(x.cargo)}</span>` : ''}<br><a href="mailto:${fmt.esc(x.email)}">${fmt.esc(x.email)}</a><br><span class="num">${fmt.esc(x.telefone || '')}</span>${x.whatsapp ? ' <span class="mut sm">· WhatsApp</span>' : ''}${x.ultimaResposta ? `<br><span class="sm ${-K.dias(x.ultimaResposta) >= 7 ? 't-err' : 'mut'}">Última resposta ${-K.dias(x.ultimaResposta) <= 0 ? 'hoje' : -K.dias(x.ultimaResposta) === 1 ? 'ontem' : `há ${-K.dias(x.ultimaResposta)} dias`}</span>` : ''}`]);
    const m = c.metas || {};
    const btn = pode ? ui.btn({ rotulo: 'Editar cadastro', icone: 'edit', tipo: 'pri', href: ctx.router.href(`clientes/${c.id}/cadastro`, { editar: '1' }) }) : ui.btn({ rotulo: 'Editar cadastro', icone: 'edit', disabled: true, title: semPerm });
    return `<div class="m-clientes-cadh row between"><p class="sm mut">Atualizado ${c.updatedAt ? fmt.rel(c.updatedAt) : 'na importação'} · todos os campos do cadastro do cliente</p>${btn}</div>
<div class="g2">${ui.card({ titulo: 'Dados', icone: 'building', corpo: `<div class="row" style="margin-bottom:12px">${logoMini(c)}<span class="sm mut">Logo (cor de identificação)</span></div>${ui.pares([['Nome fantasia', fmt.esc(c.nome)], ['Razão social', fmt.esc(c.razaoSocial)], ['CNPJ', `<span class="num">${fmt.esc(c.cnpj)}</span>`], ['Segmento', fmt.esc(c.segmento)], ['Cidade', fmt.esc(c.cidade || '—')], ['Cliente desde', fmt.data(c.desde)]])}` })}
${ui.card({ titulo: 'Contatos', icone: 'users', corpo: dc.length ? ui.pares(dc, { colunas: 2 }) : ui.vazio({ titulo: 'Nenhum contato', compacto: true }) })}</div>
<div class="g2">${ui.card({ titulo: 'Contrato', icone: 'file', corpo: ui.pares([['Início', fmt.data(ctr.inicio || c.desde)], ...(K.veReceita() ? [['MRR', fmt.brl(c.mrr)]] : []), ['Índice de reajuste', `${fmt.esc(ctr.indice || '—')}${ctr.reajustePct ? ` · ${fmt.pct(ctr.reajustePct)}` : ''}`], ['Data do reajuste', fmt.data(ctr.reajusteData)], ['Fidelidade', ctr.fidelidadeMeses ? `${ctr.fidelidadeMeses} meses` : 'Sem fidelidade'], ['Renovação', `${fmt.data(c.renova)} · ${ctr.renovacaoAuto === false ? 'manual' : 'automática'}`], ['Contrato (PDF)', ctr.pdf ? `<span class="row">${ui.ic('file')}${fmt.esc(ctr.pdf)}</span>` : '—']]) })}
${ui.card({ titulo: 'Serviços e metas', icone: 'target', corpo: `<div class="m-clientes-tags">${(c.servicos || []).map(s => `<span>${fmt.esc(s)}</span>`).join('')}</div>${ui.pares([['ROAS', m.roas != null ? fmt.dec(m.roas, 1) : '—'], ['CPL', m.cpl != null ? fmt.brl2(m.cpl) : '—'], ['Leads/mês', m.leadsMes != null ? fmt.num(m.leadsMes) : '—'], ['Faturamento/mês', m.faturamento != null ? fmt.brl(m.faturamento) : '—'], ['Teto de mídia', tetoTexto(ctx, c.tetoMidiaMensal)]])}` })}</div>
${K.veReceita() ? cardComissoes(ctx, c, pode) : ''}
<div class="g-2-1">${ui.card({ titulo: 'Acessos', icone: 'key', ajuda: 'LED de conexão de cada acesso: verde conectado, âmbar atenção (permissão expirando, dados faltando), vermelho com erro, cinza pendente/pausado. "Testar conexão" verifica na hora.', corpo: (c.acessos || []).length ? acc : ui.vazio({ titulo: 'Nenhum acesso cadastrado', compacto: true }) })}
${ui.card({ titulo: 'Responsável interno', icone: 'user', corpo: `<div class="row" style="flex-wrap:nowrap">${ui.avatar(c.respId, 36)}<div><b>${fmt.esc(K.nomePessoa(c.respId))}</b><div class="sm mut">${fmt.esc((K.pessoa(c.respId) || {}).cargo || '')}</div></div></div><p class="sm mut" style="margin:14px 0 6px">Equipe do cliente</p><div class="m-clientes-eq">${(c.equipe || []).map(id => `<span class="row" style="flex-wrap:nowrap">${ui.avatar(id, 24)}<span class="sm">${fmt.esc(K.nomePessoa(id))}</span></span>`).join('')}</div>` })}</div>
${ui.card({ titulo: 'Histórico', icone: 'clock', corpo: hist })}`;
  }

  // ---------- modo edição ----------
  const m = c.metas || {};
  const fsec = (titulo, corpo, id) => `<section class="fsec m-clientes-fs" id="${id}"><h3>${titulo}</h3>${corpo}</section>`;
  const form = `<form id="m-clientes-cad" class="m-clientes-form" novalidate data-cliente="${c.id}">
${fsec('Dados', `<div class="fgrid">${ui.campo({ nome: 'nome', rotulo: 'Nome fantasia', valor: c.nome, obrigatorio: true })}${ui.campo({ nome: 'razaoSocial', rotulo: 'Razão social', valor: c.razaoSocial, obrigatorio: true })}
${ui.campo({ nome: 'cnpj', rotulo: 'CNPJ', tipo: 'cnpj', valor: c.cnpj, obrigatorio: true })}${ui.campo({ nome: 'segmento', rotulo: 'Segmento', tipo: 'select', opcoes: SEGMENTOS.includes(c.segmento) ? SEGMENTOS : [c.segmento, ...SEGMENTOS], valor: c.segmento, obrigatorio: true })}
${ui.campo({ nome: 'cidade', rotulo: 'Cidade/UF', valor: c.cidade })}${ui.campo({ nome: 'desde', rotulo: 'Cliente desde', tipo: 'data', valor: c.desde, obrigatorio: true })}
${ui.campo({ nome: 'logoCor', rotulo: 'Cor do logo', tipo: 'select', opcoes: CORES.map(x => ({ v: x, l: x })), valor: c.logoCor, dica: 'Usada no logo com as iniciais até o upload do arquivo.' })}</div>`, 'sec-dados')}
${fsec('Contatos', `<div class="m-clientes-cts">${cts.map((ct, i) => contatoBloco(ctx, ct, i)).join('')}</div>${ui.btn({ rotulo: 'Adicionar contato', icone: 'plus', sm: true, tipo: 'ghost', attrs: { 'data-add-ct': '' } })}`, 'sec-contatos')}
${fsec('Contrato', `<div class="fgrid">${ui.campo({ nome: 'inicio', rotulo: 'Início', tipo: 'data', valor: ctr.inicio || c.desde, obrigatorio: true })}${K.veReceita() ? ui.campo({ nome: 'mrr', rotulo: 'MRR', tipo: 'moeda', valor: c.mrr, obrigatorio: true, ajuda: 'Valor mensal recorrente do contrato.' }) : ''}
${ui.campo({ nome: 'indice', rotulo: 'Índice de reajuste', tipo: 'select', opcoes: ['IPCA', 'IGP-M', 'INPC', 'Sem reajuste'], valor: ctr.indice || 'IPCA' })}${ui.campo({ nome: 'reajustePct', rotulo: 'Reajuste previsto', tipo: 'percent', valor: ctr.reajustePct ?? 0 })}
${ui.campo({ nome: 'reajusteData', rotulo: 'Data do reajuste', tipo: 'data', valor: ctr.reajusteData || '' })}${ui.campo({ nome: 'fidelidadeMeses', rotulo: 'Fidelidade', tipo: 'select', opcoes: [{ v: '0', l: 'Sem fidelidade' }, { v: '6', l: '6 meses' }, { v: '12', l: '12 meses' }, { v: '24', l: '24 meses' }], valor: String(ctr.fidelidadeMeses ?? 12) })}
${ui.campo({ nome: 'renova', rotulo: 'Renovação', tipo: 'data', valor: c.renova, obrigatorio: true })}${ui.campo({ nome: 'pdf', rotulo: 'Contrato (PDF)', valor: ctr.pdf || '', placeholder: 'contrato-cliente.pdf', dica: 'Nome do arquivo no drive da agência.' })}
${ui.campo({ nome: 'renovacaoAuto', rotulo: 'Renovação automática', tipo: 'checkbox', valor: ctr.renovacaoAuto !== false })}</div>${K.veReceita() ? '' : `<p class="sm mut m-clientes-nrec">${ui.ic('lock')}<span>Valor do contrato (MRR): visível e editável só para administradores.</span></p>`}`, 'sec-contrato')}
${K.veReceita() ? fsec('Comissão variável', `<p class="fld-d m-clientes-cmd">Valor fixo por mês ou % do MRR para alguém da equipe, por N meses. Só administradores veem esta seção; a pessoa vê apenas o valor em R$ no próprio perfil.</p>${comissoesEditor(ctx, c.comissoes || [])}`, 'sec-comissao') : ''}
${fsec('Serviços', `<div class="m-clientes-svs" role="group" aria-label="Serviços contratados">${SERVICOS.map(s => `<label class="ck"><input type="checkbox" name="servicos" value="${fmt.esc(s)}"${(c.servicos || []).includes(s) ? ' checked' : ''}><span>${fmt.esc(s)}</span></label>`).join('')}</div>`, 'sec-servicos')}
${fsec('Metas', `<div class="fgrid">${ui.campo({ nome: 'm-roas', rotulo: 'ROAS', tipo: 'number', valor: m.roas ?? '', attrs: { step: '0.1', min: '0' }, placeholder: 'Ex.: 3,0' })}${ui.campo({ nome: 'm-cpl', rotulo: 'CPL', tipo: 'moeda', valor: m.cpl ?? '' })}
${ui.campo({ nome: 'm-leads', rotulo: 'Leads por mês', tipo: 'number', valor: m.leadsMes ?? '', attrs: { min: '0' } })}${ui.campo({ nome: 'm-fat', rotulo: 'Faturamento por mês', tipo: 'moeda', valor: m.faturamento ?? '' })}
${campoTeto(ctx, c.tetoMidiaMensal, (c.servicos || []).some(x => x === 'Tráfego' || x === 'Google'))}</div>`, 'sec-metas')}
${fsec('Acessos', `<ul class="m-clientes-accs" id="m-clientes-accs">${(c.acessos || []).map((a, i) => acessoLinha(ctx, a, i, true)).join('')}</ul><input type="hidden" name="acessos" value="${fmt.esc(JSON.stringify(c.acessos || []))}">
<div class="row m-clientes-addacc"><input type="text" id="m-clientes-novoacc" placeholder="Novo acesso, ex.: TikTok Ads" aria-label="Nome do novo acesso">${ui.btn({ rotulo: 'Adicionar', icone: 'plus', sm: true, attrs: { 'data-add-acc': '' } })}</div>`, 'sec-acessos')}
${fsec('Responsável interno', `<div class="fgrid">${ui.campo({ nome: 'respId', rotulo: 'Responsável', tipo: 'select', opcoes: time.map(t => ({ v: t.id, l: `${t.nome} · ${t.area}` })), valor: c.respId, obrigatorio: true })}</div>
<fieldset class="fld"><legend>Equipe do cliente</legend><div class="m-clientes-part">${time.map(t => `<label class="ck"><input type="checkbox" name="equipe" value="${t.id}"${(c.equipe || []).includes(t.id) ? ' checked' : ''}><span>${fmt.esc(t.nome)}</span></label>`).join('')}</div></fieldset>`, 'sec-resp')}
</form>`;
  const nav = `<nav class="m-clientes-secnav" aria-label="Seções do cadastro">${[['sec-dados', 'Dados'], ['sec-contatos', 'Contatos'], ['sec-contrato', 'Contrato'], ...(K.veReceita() ? [['sec-comissao', 'Comissão']] : []), ['sec-servicos', 'Serviços'], ['sec-metas', 'Metas'], ['sec-acessos', 'Acessos'], ['sec-resp', 'Responsável']].map(([id, r]) => `<a href="#" data-sec="${id}">${r}</a>`).join('')}</nav>`;
  const barra = `<div class="m-clientes-savebar" role="region" aria-label="Salvar cadastro"><span class="sm mut" id="m-clientes-dirty">${edicao.sujo ? 'Alterações não salvas' : 'Nenhuma alteração ainda'}</span><div class="row">${ui.btn({ rotulo: 'Cancelar', attrs: { 'data-cancelar': '' } })}${ui.btn({ rotulo: 'Salvar cadastro', icone: 'check', tipo: 'pri', attrs: { 'data-salvar': '' } })}</div></div>`;
  return `${ui.card({ titulo: 'Editar cadastro', sub: c.nome, corpo: `${nav}${form}` })}${barra}
${ui.card({ titulo: 'Histórico', icone: 'clock', corpo: hist })}`;
}
/** "R$ 45.000/mês · ≈ R$ 1.480/dia" ou "Não informado" */
export function tetoTexto(ctx, v) {
  const { fmt } = ctx; const m = Number(v) || 0;
  return m > 0 ? `<span class="num">${fmt.brl(m)}/mês</span> <span class="mut num">· ≈ ${fmt.brl(K.tetoDiarioCliente({ tetoMidiaMensal: m }))}/dia</span>` : '<span class="mut">Não informado</span>';
}
/** campo do teto de mídia (R$/mês) com o equivalente diário ao vivo */
function campoTeto(ctx, v, pagos) {
  const { ui, fmt } = ctx; const d = K.tetoDiarioCliente({ tetoMidiaMensal: v });
  return `<div class="m-clientes-tetof">${ui.campo({ nome: 'tetoMidiaMensal', rotulo: 'Teto de mídia por mês', tipo: 'moeda', valor: v ?? '', ajuda: 'Quanto o cliente aceita investir em anúncios por mês, no máximo (Meta Ads + Google Ads). Não é receita da agência. A Torre usa o teto diário (mensal ÷ 30,4) para avisar quando a verba passa do limite.', dica: pagos ? 'Recomendado para clientes de Tráfego e Google.' : 'Opcional.' })}<p class="sm mut m-clientes-tetod" data-teto-dia aria-live="polite">${d ? `≈ ${fmt.brl(d)} por dia` : 'O valor diário aparece aqui.'}</p></div>`;
}
/** liga a atualização do "≈ R$ Y por dia" */
function ligarTeto(el, ctx) {
  const on = e => { if (!e.target.matches || !e.target.matches('[name="tetoMidiaMensal"]')) return; const p = el.querySelector('[data-teto-dia]'); if (!p) return; const d = K.tetoDiarioCliente({ tetoMidiaMensal: ctx.ui.parse.moeda(e.target.value) }); p.textContent = d ? `≈ ${ctx.fmt.brl(d)} por dia` : 'O valor diário aparece aqui.'; };
  el.addEventListener('input', on); return () => el.removeEventListener('input', on);
}
/** "Dados (CNPJ), Contatos (E-mail)" a partir dos erros do formulário de edição */
function resumoErros(f, erros) {
  const g = new Map();
  Object.keys(erros).forEach(k => {
    const c = f.querySelector(`[name="${k}"]`); const sec = c && c.closest('.fsec'); const h = sec ? sec.querySelector('h3').textContent.trim() : 'Cadastro';
    const lab = c && c.closest('.fld') ? (c.closest('.fld').querySelector('label,legend') || {}).textContent || k : k;
    if (!g.has(h)) g.set(h, []); g.get(h).push(String(lab).replace(/\*/g, '').trim());
  });
  return [...g].map(([h, l]) => `${h} (${l.join(', ')})`).join(', ');
}
function logoMini(c) { return `<span class="m-clientes-logo" style="--lc:${c.logoCor || '#64748B'};width:36px;height:36px;font-size:14px" aria-hidden="true">${String(c.nome || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>`; }

/* ---------- testar conexão (simulado) ---------- */
export function resultadoTeste(a) {
  if (a.estado === 'err' && /token/i.test(a.obs || '')) return { estado: 'err', obs: 'Falhou: token expirado. Reconecte o Meta Ads em Torre › Integrações.' };
  if (a.estado === 'err') return { estado: 'err', obs: 'Sem acesso ainda — peça ao cliente para aceitar o convite.' };
  if (a.estado === 'off' && /pausad|arquivad/i.test(a.obs || '')) return { estado: 'off', obs: a.obs };
  if (a.estado === 'off') return { estado: 'warn', obs: 'Convite enviado; aguardando o cliente aceitar.' };
  if (a.estado === 'warn') return { estado: 'ok', obs: 'Conexão verificada agora.' };
  return { estado: 'ok', obs: 'Conexão verificada agora.' };
}

/* ---------- leitura e validação do formulário de edição ---------- */
export function validarCadastro(ctx, f, c) {
  const { ui, db, fmt } = ctx;
  const regras = {
    nome: ['obrigatorio', 'min:2', v => { const d = nomeDuplicado(db, fmt, v, c && c.id); return d ? `Já existe o cliente "${d.nome}" com esse nome.` : ''; }],
    razaoSocial: 'obrigatorio|min:3',
    cnpj: ['obrigatorio', ui.valida.cnpj, v => { const d = cnpjDuplicado(db, v, c && c.id); return d ? `CNPJ já cadastrado para ${d.nome}.` : ''; }],
    ...(K.veReceita() ? { mrr: ['obrigatorio', v => (v != null && v <= 0 ? 'Informe um valor maior que zero.' : '')] } : {}),
    renova: ['obrigatorio', (v, d) => (v && d.inicio && v <= d.inicio ? 'A renovação deve ser depois do início do contrato.' : '')],
    servicos: [v => (!v || !v.length ? 'Marque pelo menos um serviço.' : '')],
    'm-roas': [v => (v != null && (v < 0 || v > 50) ? 'ROAS entre 0 e 50.' : '')],
    tetoMidiaMensal: [v => (v != null && v < 0 ? 'Informe um valor positivo ou deixe em branco.' : '')],
    ...regrasComissoes(f),
  };
  f.querySelectorAll('.m-clientes-ctb').forEach(b => { const i = b.dataset.ct; regras[`ct-nome-${i}`] = 'obrigatorio|min:3'; });
  const r = ui.form.validar(f, regras);
  if (!r.ok && r.erros.servicos) { const g = f.querySelector('.m-clientes-svs'); g && g.insertAdjacentHTML('afterend', `<p class="fld-err">${ui.ic('alert-circle')}${fmt.esc(r.erros.servicos)}</p>`); }
  return r;
}
function lerContatos(f, d, clientId) {
  return Array.from(f.querySelectorAll('.m-clientes-ctb')).map(b => { const i = b.dataset.ct; return { id: d[`ct-id-${i}`] || null, clientId, nome: d[`ct-nome-${i}`], papel: d[`ct-papel-${i}`], email: d[`ct-email-${i}`], telefone: d[`ct-tel-${i}`], cargo: d[`ct-cargo-${i}`], whatsapp: !!d[`ct-wa-${i}`] }; });
}

export async function salvarCadastro(ctx, el, c) {
  const { ui, db, fmt, router } = ctx;
  const f = el.querySelector('#m-clientes-cad'); if (!f) return;
  const r = validarCadastro(ctx, f, c);
  if (!r.ok) { ui.toast(`Faltam: ${resumoErros(f, r.erros)}. Corrija os campos destacados e salve de novo.`, { tipo: 'err' }); return false; }
  const d = r.dados;
  let acessos = []; try { acessos = JSON.parse(d.acessos || '[]'); } catch (e) { acessos = c.acessos || []; }
  const antes = { cliente: db.get('clients', c.id), contatos: db.list('contacts', x => x.clientId === c.id), contrato: db.find('contracts', x => x.clientId === c.id) };
  const patch = {
    nome: d.nome.trim(), razaoSocial: d.razaoSocial.trim(), cnpj: ui.mascaras.cnpj(d.cnpj), segmento: d.segmento, cidade: d.cidade, desde: d.desde, logoCor: d.logoCor,
    mrr: K.veReceita() ? d.mrr : antes.cliente.mrr, ...(K.veReceita() ? { mrrPendente: false } : {}), renova: d.renova, servicos: d.servicos || [], respId: d.respId, equipe: [...new Set([d.respId, ...(d.equipe || [])])], acessos,
    metas: { roas: d['m-roas'] ?? null, cpl: d['m-cpl'] ?? null, leadsMes: d['m-leads'] ?? null, faturamento: d['m-fat'] ?? null },
    tetoMidiaMensal: d.tetoMidiaMensal > 0 ? d.tetoMidiaMensal : null,
    ...(K.veReceita() ? { comissoes: lerComissoes(f, d) } : {}),
  };
  const novos = lerContatos(f, d, c.id);
  db.batch(() => {
    db.update('clients', c.id, patch, { log: `editou o cadastro de ${patch.nome}` });
    const manter = new Set(novos.map(x => x.id).filter(Boolean));
    antes.contatos.filter(x => !manter.has(x.id)).forEach(x => db.remove('contacts', x.id));
    novos.forEach((x, i) => { const o = { ...x, principal: i === 0 }; if (x.id && db.get('contacts', x.id)) db.update('contacts', x.id, o); else { delete o.id; db.insert('contacts', o); } });
    const ctp = { clientId: c.id, inicio: d.inicio, mrr: K.veReceita() ? d.mrr : (antes.contrato ? antes.contrato.mrr : antes.cliente.mrr), indice: d.indice, reajustePct: d.reajustePct ?? 0, reajusteData: d.reajusteData || null, fidelidadeMeses: Number(d.fidelidadeMeses), renovacao: d.renova, renovacaoAuto: !!d.renovacaoAuto, pdf: d.pdf };
    if (antes.contrato) db.update('contracts', antes.contrato.id, ctp); else db.insert('contracts', { ...ctp, status: 'vigente' });
  });
  if (patch.comissoes) notificarComissoes(ctx, { ...antes.cliente, ...patch }, antes.cliente.comissoes || [], patch.comissoes);
  edicao.sujo = false;
  router.go(`clientes/${c.id}/cadastro`);
  ui.toast('Cadastro salvo.', {
    desfazer: () => db.batch(() => {
      db.insert('clients', antes.cliente);
      db.list('contacts', x => x.clientId === c.id).forEach(x => db.remove('contacts', x.id));
      antes.contatos.forEach(x => db.insert('contacts', x));
      if (antes.contrato) db.insert('contracts', antes.contrato);
    }),
  });
  return true;
}

export function mountCadastro(el, ctx, c) {
  const { ui, db, fmt, router } = ctx;
  const f = el.querySelector('#m-clientes-cad');
  const lbl = () => { const s = el.querySelector('#m-clientes-dirty'); if (s) { s.textContent = edicao.sujo ? 'Alterações não salvas' : 'Nenhuma alteração ainda'; s.classList.toggle('t-warn', edicao.sujo); } };
  const sujar = () => { if (!edicao.sujo) { edicao.sujo = true; lbl(); } };
  const offs = [];
  if (f) {
    f.addEventListener('input', sujar); f.addEventListener('change', sujar);
    const beforeUnload = e => { if (edicao.sujo) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload); offs.push(() => window.removeEventListener('beforeunload', beforeUnload));
    // aviso ao sair com alterações não salvas (links internos)
    const guarda = async e => {
      const a = e.target.closest('a[href^="#"]'); if (!a || !edicao.sujo || a.closest('.m-clientes-secnav')) return;
      const dest = a.getAttribute('href'); if (!dest || dest === '#' || dest === location.hash) return;
      e.preventDefault(); e.stopPropagation();
      const ok = await ui.confirmar('Você alterou o cadastro e ainda não salvou. Se sair agora, as alterações serão perdidas.', { titulo: 'Sair sem salvar?', confirmar: 'Sair sem salvar', cancelar: 'Continuar editando' });
      if (ok) { edicao.sujo = false; location.hash = dest.replace(/^#/, ''); }
    };
    document.addEventListener('click', guarda, true); offs.push(() => document.removeEventListener('click', guarda, true));
  }
  if (f) { offs.push(mountComissoes(el, ctx, { aoMudar: sujar })); offs.push(ligarTeto(el, ctx)); }
  const accInput = () => el.querySelector('input[name="acessos"]');
  const lerAcc = () => { try { return JSON.parse(accInput().value); } catch (e) { return []; } };
  const gravarAcc = l => { accInput().value = JSON.stringify(l); el.querySelector('#m-clientes-accs').innerHTML = l.map((a, i) => acessoLinha(ctx, a, i, true)).join(''); };
  const onClick = async e => {
    const sec = e.target.closest('[data-sec]');
    if (sec) { e.preventDefault(); const s = el.querySelector('#' + sec.dataset.sec); s && s.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (e.target.closest('[data-salvar]')) { salvarCadastro(ctx, el, c); return; }
    if (e.target.closest('[data-cancelar]')) {
      if (edicao.sujo && !(await ui.confirmar('As alterações feitas no cadastro serão descartadas.', { titulo: 'Descartar alterações?', confirmar: 'Descartar', cancelar: 'Continuar editando' }))) return;
      edicao.sujo = false; router.go(`clientes/${c.id}/cadastro`); return;
    }
    if (e.target.closest('[data-add-ct]')) {
      const w = el.querySelector('.m-clientes-cts'); const i = Math.max(-1, ...Array.from(w.querySelectorAll('.m-clientes-ctb')).map(b => Number(b.dataset.ct))) + 1;
      w.insertAdjacentHTML('beforeend', contatoBloco(ctx, { papel: 'outro' }, i)); w.querySelector(`[name="ct-nome-${i}"]`).focus(); sujar(); return;
    }
    const rmc = e.target.closest('[data-rm-ct]');
    if (rmc) { const b = el.querySelector(`.m-clientes-ctb[data-ct="${rmc.dataset.rmCt}"]`); if (el.querySelectorAll('.m-clientes-ctb').length <= 1) { ui.toast('O cliente precisa de pelo menos um contato.', { tipo: 'warn' }); return; } b && b.remove(); sujar(); return; }
    const rma = e.target.closest('[data-rm-acc]');
    if (rma) { const l = lerAcc(); const [x] = l.splice(Number(rma.dataset.rmAcc), 1); gravarAcc(l); sujar(); ui.toast(`Acesso "${x.nome}" removido (salve para confirmar).`, { tipo: 'info' }); return; }
    if (e.target.closest('[data-add-acc]')) {
      const inp = el.querySelector('#m-clientes-novoacc'); const nome = inp.value.trim();
      if (nome.length < 3) { ui.toast('Digite o nome do acesso (ex.: TikTok Ads).', { tipo: 'warn' }); inp.focus(); return; }
      const l = lerAcc(); l.push({ nome, tipo: 'outro', estado: 'off', obs: 'Aguardando liberação pelo cliente' }); gravarAcc(l); inp.value = ''; sujar(); return;
    }
    const tb = e.target.closest('[data-testar]');
    if (tb) {
      const i = Number(tb.dataset.testar); tb.disabled = true; const sp = tb.querySelector('span'); if (sp) sp.textContent = 'Testando…';
      const li = tb.closest('.m-clientes-acc'); const ledEl = li && li.querySelector('.led'); if (ledEl) { ledEl.className = 'led warn'; }
      await new Promise(r => setTimeout(r, 700));
      const emEdicao = !!f;
      const lista = emEdicao ? lerAcc() : (db.get('clients', c.id).acessos || []).map(x => ({ ...x }));
      const a = lista[i]; if (!a) return;
      const res = resultadoTeste(a); Object.assign(a, res, { testadoEm: new Date().toISOString() });
      if (emEdicao) { gravarAcc(lista); sujar(); }
      else db.update('clients', c.id, { acessos: lista }, { log: `testou o acesso "${a.nome}" de ${c.nome}` });
      ui.toast(res.estado === 'ok' ? `${a.nome}: conexão ok.` : `${a.nome}: ${res.obs}`, { tipo: res.estado === 'ok' ? 'ok' : res.estado === 'err' ? 'err' : 'warn' });
      return;
    }
    if (e.target.closest('[data-reg]')) { registrarHistorico(ctx, c); return; }
  };
  el.addEventListener('click', onClick);
  return () => { el.removeEventListener('click', onClick); offs.forEach(fn => fn()); };
}

async function registrarHistorico(ctx, c) {
  const { ui, db, fmt } = ctx;
  let reg = null;
  const ok = await ui.modal({
    titulo: 'Registrar no histórico', sub: c.nome, largura: 'sm', confirmar: 'Registrar',
    corpo: `<form class="stack" novalidate>${ui.campo({ nome: 'tipo', rotulo: 'Tipo', tipo: 'radio', opcoes: [{ v: 'reclamacao', l: 'Reclamação' }, { v: 'elogio', l: 'Elogio' }], valor: 'reclamacao' })}${ui.campo({ nome: 'data', rotulo: 'Data', tipo: 'data', valor: HOJE, obrigatorio: true })}${ui.campo({ nome: 'texto', rotulo: 'O que o cliente disse', tipo: 'textarea', obrigatorio: true })}</form>`,
    onConfirmar: box => {
      const r = ui.form.validar(box.querySelector('form'), { texto: 'obrigatorio|min:5' }); if (!r.ok) return false;
      const atual = db.get('clients', c.id);
      reg = { id: `rg-${Date.now().toString(36)}`, tipo: r.dados.tipo, data: r.dados.data, quem: (ctx.user && ctx.user.teamId) || c.respId, texto: r.dados.texto };
      db.update('clients', c.id, { registros: [...(atual.registros || []), reg] }, { log: `registrou ${reg.tipo === 'reclamacao' ? 'reclamação' : 'elogio'} de ${c.nome}` });
      return true;
    },
  });
  if (ok && reg) { const id = reg.id; ui.toast(`${reg.tipo === 'reclamacao' ? 'Reclamação' : 'Elogio'} registrado.`, { desfazer: () => { const a = db.get('clients', c.id); db.update('clients', c.id, { registros: (a.registros || []).filter(x => x.id !== id) }); } }); }
}

/* ================= #/clientes/novo ================= */
// Navegação livre: todas as etapas são clicáveis a qualquer momento (para frente e para trás) e "Continuar" sempre avança,
// guardando o que foi digitado no rascunho. Cada etapa mostra o estado (completa · N pendentes · não visitada).
// A validação que BLOQUEIA acontece só em "Cadastrar cliente": aí aparece "Faltam: Dados (CNPJ), Contatos (e-mail do decisor)"
// com links que levam à etapa e focam o campo. A Revisão lista o que falta a qualquer momento.
const RASCUNHO = 'aos-clientes-rascunho';
const ETAPAS = [{ id: 'dados', rotulo: 'Dados' }, { id: 'contatos', rotulo: 'Contatos' }, { id: 'contrato', rotulo: 'Contrato e serviços' }, { id: 'metas', rotulo: 'Metas e acessos' }, { id: 'revisao', rotulo: 'Revisão' }];
const ULTIMA = ETAPAS.length - 1;
export const wizard = { passo: 0, dados: null, visitados: [0], foco: null, dicas: false, tentou: false };
const lsGet = () => { try { return JSON.parse(localStorage.getItem(RASCUNHO) || 'null'); } catch (e) { return null; } };
const lsSet = v => { try { if (v) localStorage.setItem(RASCUNHO, JSON.stringify(v)); else localStorage.removeItem(RASCUNHO); } catch (e) { /* sem armazenamento */ } };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function padrao(ctx) {
  const eu = ctx.user && ctx.user.teamId; const resp = ctx.db.get('team', eu) && ['head_trafego', 'gestor_trafego', 'cs'].includes(ctx.user.papel) ? eu : 't-diego';
  return { nome: '', razaoSocial: '', cnpj: '', segmento: '', cidade: '', inicio: HOJE, 'd-nome': '', 'd-email': '', 'd-tel': '', 'd-cargo': '', 'a-nome': '', 'a-email': '', 'a-tel': '', mrr: null, indice: 'IPCA', reajustePct: 4.5, fidelidadeMeses: '12', renova: K.addDias(HOJE, 365), servicos: [], respId: resp, equipe: [], 'm-roas': null, 'm-cpl': null, 'm-leads': null, 'm-fat': null, tetoMidiaMensal: null, comissoes: [], acessosPedir: [], nomeRepetidoOk: false };
}
const visitar = i => { if (!wizard.visitados.includes(i)) wizard.visitados.push(i); };
function zerar(ctx, dados) { Object.assign(wizard, { dados: dados || padrao(ctx), passo: 0, visitados: [0], foco: null, dicas: false, tentou: false }); }
function carregar(ctx) {
  const dealId = ctx.query && ctx.query.deal;
  if (dealId && wizard.dealId !== dealId) {
    const dl = ctx.db.get('deals', dealId);
    if (dl) {
      const d = padrao(ctx);
      Object.assign(d, { nome: dl.empresa || '', 'd-nome': dl.contato || '', 'd-cargo': dl.cargo || '', 'd-email': dl.email || '', 'd-tel': dl.telefone || '', mrr: K.veReceita() ? dl.valor ?? null : null,
        servicos: (dl.servicos || []).filter(x => SERVICOS.includes(x)) });
      zerar(ctx, d); wizard.restaurado = false; wizard.dealId = dealId; wizard.deDeal = dl.empresa;
      salvarRascunho();
    }
  }
  if (!wizard.dados) {
    const r = lsGet();
    wizard.dados = r && r.dados ? { ...padrao(ctx), ...r.dados } : padrao(ctx);
    wizard.passo = r ? Math.min(r.passo || 0, ULTIMA) : 0;
    wizard.visitados = r && Array.isArray(r.visitados) ? r.visitados : r ? Array.from({ length: (r.maxPasso ?? r.passo ?? 0) + 1 }, (_, i) => i) : [0];
    wizard.restaurado = !!(r && r.dados && r.dados.nome);
  }
  visitar(wizard.passo);
  return wizard.dados;
}
const salvarRascunho = () => lsSet({ dados: wizard.dados, passo: wizard.passo, visitados: wizard.visitados, quando: new Date().toISOString() });

/** pendências por etapa, calculadas dos DADOS do rascunho (não do DOM): [[{campo, rotulo, msg}], …] */
export function pendencias(ctx, d) {
  const { ui, db, fmt } = ctx;
  const P = ETAPAS.map(() => []);
  const add = (i, campo, rotulo, msg) => P[i].push({ campo, rotulo, msg });
  const t = v => String(v ?? '').trim();
  if (t(d.nome).length < 2) add(0, 'nome', 'nome fantasia', 'Informe o nome fantasia.');
  if (t(d.razaoSocial).length < 3) add(0, 'razaoSocial', 'razão social', 'Informe a razão social.');
  const dupC = cnpjDuplicado(db, d.cnpj);
  if (!t(d.cnpj)) add(0, 'cnpj', 'CNPJ', 'Informe o CNPJ.');
  else if (ui.valida.cnpj(d.cnpj)) add(0, 'cnpj', 'CNPJ', ui.valida.cnpj(d.cnpj));
  else if (dupC) add(0, 'cnpj', 'CNPJ', `CNPJ já cadastrado para ${dupC.nome}.`);
  if (!t(d.segmento)) add(0, 'segmento', 'segmento', 'Escolha o segmento.');
  if (!t(d.inicio)) add(0, 'inicio', 'início do contrato', 'Informe o início do contrato.');
  if (nomeDuplicado(db, fmt, d.nome) && !d.nomeRepetidoOk) add(0, 'nomeRepetidoOk', 'nome repetido', 'Confirme que é outro cliente com o mesmo nome.');
  if (t(d['d-nome']).length < 3) add(1, 'd-nome', 'nome do decisor', 'Informe o nome do decisor.');
  if (!EMAIL.test(t(d['d-email']))) add(1, 'd-email', 'e-mail do decisor', t(d['d-email']) ? 'E-mail do decisor inválido.' : 'Informe o e-mail do decisor.');
  if (!t(d['d-tel']) || ui.valida.telefone(d['d-tel'])) add(1, 'd-tel', 'telefone do decisor', 'Informe o telefone com DDD.');
  if (!t(d['a-nome']) && (t(d['a-email']) || t(d['a-tel']))) add(1, 'a-nome', 'nome do contato do dia a dia', 'Informe o nome do contato.');
  if (t(d['a-email']) && !EMAIL.test(t(d['a-email']))) add(1, 'a-email', 'e-mail do contato do dia a dia', 'E-mail inválido.');
  if (K.veReceita() && !(Number(d.mrr) > 0)) add(2, 'mrr', 'MRR', 'Informe o MRR (maior que zero).');
  if (!t(d.renova)) add(2, 'renova', 'renovação', 'Informe a data de renovação.');
  else if (d.renova <= HOJE) add(2, 'renova', 'renovação', 'A renovação deve ser uma data futura.');
  if (!(d.servicos || []).length) add(2, 'servicos', 'serviços', 'Marque pelo menos um serviço.');
  if (!t(d.respId)) add(2, 'respId', 'responsável', 'Escolha o responsável interno.');
  if (K.veReceita()) (d.comissoes || []).forEach((com, i) => { const e = errosComissao(com); const k = Object.keys(e)[0]; if (k) add(2, `cm-${k}-${i}`, `comissão ${i + 1}`, e[k]); });
  if (d['m-leads'] == null || d['m-leads'] === '') add(3, 'm-leads', 'meta de leads', 'Informe a meta de leads por mês.');
  if (d['m-roas'] != null && d['m-roas'] !== '' && (d['m-roas'] < 0 || d['m-roas'] > 50)) add(3, 'm-roas', 'meta de ROAS', 'ROAS entre 0 e 50.');
  return P;
}
/** "Dados (CNPJ, segmento)" como links que levam à etapa e focam o 1º campo */
function linksFaltam(ctx, P) {
  return P.map((l, i) => (l.length ? ctx.ui.btn({ rotulo: `${ETAPAS[i].rotulo} (${[...new Set(l.map(x => x.rotulo))].join(', ')})`, tipo: 'link', sm: true, attrs: { 'data-ir': i, 'data-foco': l[0].campo } }) : '')).filter(Boolean).join('<span class="mut">, </span>');
}

export function renderNovo(ctx) {
  const { ui, fmt, db, query } = ctx;
  if (!ctx.can('clientes', 'editar')) return `<div class="pg">${ui.cabecalho({ titulo: 'Cadastrar cliente', voltar: { href: '#/clientes', rotulo: 'Carteira' } })}${ui.card({ corpo: ui.vazio({ icone: 'lock', titulo: 'Sem permissão para cadastrar clientes', texto: 'Seu papel permite apenas visualizar clientes. Peça ao administrador para cadastrar ou liberar a permissão.', acao: { rotulo: 'Voltar à carteira', href: '#/clientes' } }) })}</div>`;
  if (query.ok) {
    const c = db.get('clients', query.ok);
    if (c) return `<div class="pg m-clientes">${ui.cabecalho({ titulo: 'Cliente cadastrado', voltar: { href: '#/clientes', rotulo: 'Carteira' } })}${ui.card({ corpo: `<div class="m-clientes-ok">${ui.ic('check-circle')}<h2>${fmt.esc(c.nome)} foi cadastrado e entrou em onboarding</h2><p class="mut">${fmt.esc(K.nomePessoa(c.respId))} foi notificado(a) como responsável. Próxima etapa: liberar os acessos (${fmt.plural((c.acessos || []).length, 'acesso pedido', 'acessos pedidos')} ao cliente).</p><div class="row" style="justify-content:center">${ui.btn({ rotulo: 'Abrir ficha', icone: 'arrow-right', tipo: 'pri', href: `#/clientes/${c.id}` })}${ui.btn({ rotulo: 'Ver acessos', icone: 'key', href: `#/clientes/${c.id}/cadastro` })}${ui.btn({ rotulo: 'Cadastrar outro', icone: 'plus', href: '#/clientes/novo', attrs: { 'data-outro': '' } })}</div></div>` })}</div>`;
  }
  const d = carregar(ctx);
  const p = wizard.passo;
  const P = pendencias(ctx, d);
  const total = P.reduce((a, l) => a + l.length, 0);
  const time = db.list('team', t => t.ativo !== false && t.papel !== 'leitura');
  const estado = i => (i === ULTIMA ? (wizard.visitados.includes(i) && !total ? 'feito' : wizard.visitados.includes(i) ? 'pend' : '') : !wizard.visitados.includes(i) ? '' : P[i].length ? 'pend' : 'feito');
  const passos = `<ol class="m-clientes-steps" aria-label="Etapas do cadastro">${ETAPAS.map((e, i) => {
    const st = estado(i); const n = i === ULTIMA ? total : P[i].length;
    const sub = st === 'pend' ? `<small class="t-warn">${fmt.plural(n, 'pendente', 'pendentes')}</small>` : st === 'feito' ? '<small class="mut">completa</small>' : '<small class="mut">não visitada</small>';
    const marca = st === 'feito' ? ui.ic('check') : st === 'pend' ? '<span class="m-clientes-stpd" aria-hidden="true"></span>' : i + 1;
    const rot = `${e.rotulo}: ${st === 'feito' ? 'completa' : st === 'pend' ? fmt.plural(n, 'pendente', 'pendentes') : 'não visitada'}`;
    return `<li class="${i === p ? 'on ' : ''}${st}"><button type="button" data-ir="${i}"${i === p ? ' aria-current="step"' : ''} aria-label="${fmt.esc(rot)}"><i>${marca}</i><span class="m-clientes-stpt"><b>${e.rotulo}</b>${sub}</span></button></li>`;
  }).join('')}</ol>`;
  const dupN = nomeDuplicado(db, fmt, d.nome);
  const pagos = (d.servicos || []).some(s => s === 'Tráfego' || s === 'Google');
  let corpo = '';
  if (p === 0) corpo = `<div class="fgrid">${ui.campo({ nome: 'nome', rotulo: 'Nome fantasia', valor: d.nome, obrigatorio: true, placeholder: 'Ex.: Padaria Pão Nosso' })}${ui.campo({ nome: 'razaoSocial', rotulo: 'Razão social', valor: d.razaoSocial, obrigatorio: true, placeholder: 'Ex.: Pão Nosso Alimentos Ltda.' })}
${ui.campo({ nome: 'cnpj', rotulo: 'CNPJ', tipo: 'cnpj', valor: d.cnpj, obrigatorio: true })}${ui.campo({ nome: 'segmento', rotulo: 'Segmento', tipo: 'select', placeholder: 'Escolha…', opcoes: SEGMENTOS, valor: d.segmento, obrigatorio: true })}
${ui.campo({ nome: 'cidade', rotulo: 'Cidade/UF', valor: d.cidade, placeholder: 'Ex.: Campinas/SP' })}${ui.campo({ nome: 'inicio', rotulo: 'Início do contrato', tipo: 'data', valor: d.inicio, obrigatorio: true })}</div>
${dupN ? dupHtml(ctx, dupN, d.nomeRepetidoOk) : ''}`;
  else if (p === 1) corpo = `<h3 class="m-clientes-h3">Decisor</h3><div class="fgrid">${ui.campo({ nome: 'd-nome', rotulo: 'Nome', valor: d['d-nome'], obrigatorio: true })}${ui.campo({ nome: 'd-cargo', rotulo: 'Cargo', valor: d['d-cargo'], placeholder: 'Ex.: Sócio-diretor' })}
${ui.campo({ nome: 'd-email', rotulo: 'E-mail', tipo: 'email', valor: d['d-email'], obrigatorio: true, placeholder: 'nome@empresa.com.br' })}${ui.campo({ nome: 'd-tel', rotulo: 'Telefone / WhatsApp', tipo: 'telefone', valor: d['d-tel'], obrigatorio: true })}</div>
<h3 class="m-clientes-h3">Contato do dia a dia <span class="mut sm">(opcional)</span></h3><div class="fgrid">${ui.campo({ nome: 'a-nome', rotulo: 'Nome', valor: d['a-nome'] })}${ui.campo({ nome: 'a-email', rotulo: 'E-mail', tipo: 'email', valor: d['a-email'] })}${ui.campo({ nome: 'a-tel', rotulo: 'Telefone / WhatsApp', tipo: 'telefone', valor: d['a-tel'] })}</div>`;
  else if (p === 2) corpo = `${K.veReceita() ? '' : `<p class="sm mut m-clientes-nrec">${ui.ic('lock')}<span>Valor do contrato (MRR): preenchido pela administração depois do cadastro.</span></p>`}<div class="fgrid">${K.veReceita() ? ui.campo({ nome: 'mrr', rotulo: 'MRR', tipo: 'moeda', valor: d.mrr ?? '', obrigatorio: true, ajuda: 'Valor mensal recorrente do contrato.' }) : ''}${ui.campo({ nome: 'renova', rotulo: 'Renovação', tipo: 'data', valor: d.renova, obrigatorio: true })}
${ui.campo({ nome: 'indice', rotulo: 'Índice de reajuste', tipo: 'select', opcoes: ['IPCA', 'IGP-M', 'INPC', 'Sem reajuste'], valor: d.indice })}${ui.campo({ nome: 'reajustePct', rotulo: 'Reajuste previsto', tipo: 'percent', valor: d.reajustePct ?? '' })}
${ui.campo({ nome: 'fidelidadeMeses', rotulo: 'Fidelidade', tipo: 'select', opcoes: [{ v: '0', l: 'Sem fidelidade' }, { v: '6', l: '6 meses' }, { v: '12', l: '12 meses' }, { v: '24', l: '24 meses' }], valor: String(d.fidelidadeMeses) })}${ui.campo({ nome: 'respId', rotulo: 'Responsável interno', tipo: 'select', opcoes: time.map(t => ({ v: t.id, l: `${t.nome} · ${t.area}` })), valor: d.respId, obrigatorio: true })}</div>
<fieldset class="fld"><legend>Serviços contratados<span class="req" aria-hidden="true">*</span></legend><div class="m-clientes-svs">${SERVICOS.map(s => `<label class="ck"><input type="checkbox" name="servicos" value="${fmt.esc(s)}"${(d.servicos || []).includes(s) ? ' checked' : ''}><span>${fmt.esc(s)}</span></label>`).join('')}</div></fieldset>
<fieldset class="fld"><legend>Equipe do cliente</legend><div class="m-clientes-part">${time.map(t => `<label class="ck"><input type="checkbox" name="equipe" value="${t.id}"${(d.equipe || []).includes(t.id) ? ' checked' : ''}><span>${fmt.esc(t.nome)}</span></label>`).join('')}</div></fieldset>
${K.veReceita() ? `<fieldset class="fld m-clientes-cmf"><legend>Comissão variável</legend><p class="fld-d">Opcional · só administradores veem. Valor fixo por mês ou % do MRR para alguém da equipe, por N meses. A pessoa é avisada e vê só o valor em R$.</p>${comissoesEditor(ctx, d.comissoes || [])}</fieldset>` : ''}`;
  else if (p === 3) {
    const sugest = [...new Set((d.servicos || []).flatMap(s => (ACESSOS_POR_SERV[s] || []).map(x => x[0])).concat(['Google Analytics 4', 'Pasta de arquivos (Drive)']))];
    corpo = `<div class="fgrid">${campoTeto(ctx, d.tetoMidiaMensal, pagos)}${pagos ? `${ui.campo({ nome: 'm-roas', rotulo: 'Meta de ROAS', tipo: 'number', valor: d['m-roas'] ?? '', attrs: { step: '0.1', min: '0' }, placeholder: 'Ex.: 3,0' })}${ui.campo({ nome: 'm-cpl', rotulo: 'Meta de CPL', tipo: 'moeda', valor: d['m-cpl'] ?? '' })}` : ''}
${ui.campo({ nome: 'm-leads', rotulo: 'Meta de leads por mês', tipo: 'number', valor: d['m-leads'] ?? '', attrs: { min: '0' }, obrigatorio: true })}${ui.campo({ nome: 'm-fat', rotulo: 'Meta de faturamento por mês', tipo: 'moeda', valor: d['m-fat'] ?? '' })}</div>
${pagos ? '' : `<p class="sm mut">ROAS e CPL aparecem quando o cliente contrata Tráfego ou Google.</p>`}
<fieldset class="fld"><legend>Acessos a pedir ao cliente</legend><p class="fld-d">Viram a lista de acessos com LED (começam como pendentes) e a etapa "Acessos" do onboarding.</p><div class="m-clientes-svs">${sugest.map(a => `<label class="ck"><input type="checkbox" name="acessosPedir" value="${fmt.esc(a)}"${!d.acessosPedir || !d.acessosPedir.length || d.acessosPedir.includes(a) ? ' checked' : ''}><span>${fmt.esc(a)}</span></label>`).join('')}</div></fieldset>`;
  } else {
    const t = K.pessoa(d.respId) || {};
    const coms = (d.comissoes || []).filter(x => x.teamId);
    // (ui.aviso escapa o texto; aqui o texto leva links para as etapas)
    const faltam = total ? `<div class="av-box t-${wizard.tentou ? 'err' : 'warn'} m-clientes-faltabox" role="${wizard.tentou ? 'alert' : 'status'}">${ui.ic(wizard.tentou ? 'alert-circle' : 'alert')}<div><b>${wizard.tentou ? `Não dá para cadastrar ainda: ${fmt.plural(total, 'pendência', 'pendências')}.` : `${fmt.plural(total, 'pendência', 'pendências')} antes de cadastrar`}</b><span class="m-clientes-faltam">Faltam: ${linksFaltam(ctx, P)}</span></div></div>`
      : ui.aviso({ tipo: 'ok', titulo: 'Tudo pronto para cadastrar.', texto: 'Ao cadastrar, o cliente entra em onboarding (etapa Acessos), o responsável é notificado e a equipe vê o cliente na carteira.' });
    const tetoRec = pagos && !(d.tetoMidiaMensal > 0) ? `<p class="sm mut m-clientes-tetorec">${ui.ic('info')}<span>Recomendado: informar o teto de mídia (cliente com Tráfego/Google). ${ui.btn({ rotulo: 'Informar agora', tipo: 'link', sm: true, attrs: { 'data-ir': 3, 'data-foco': 'tetoMidiaMensal' } })}</span></p>` : '';
    corpo = `${faltam}${tetoRec}<div class="g2">${ui.pares([['Nome fantasia', fmt.esc(d.nome || '—')], ['Razão social', fmt.esc(d.razaoSocial || '—')], ['CNPJ', fmt.esc(d.cnpj || '—')], ['Segmento', fmt.esc(d.segmento || '—')], ['Cidade', fmt.esc(d.cidade || '—')], ['Início', d.inicio ? fmt.data(d.inicio) : '—']])}
${ui.pares([['Decisor', d['d-nome'] ? `${fmt.esc(d['d-nome'])}<br><span class="sm mut">${fmt.esc(d['d-email'] || 'sem e-mail')} · ${fmt.esc(d['d-tel'] || 'sem telefone')}</span>` : '—'], ['Dia a dia', d['a-nome'] ? fmt.esc(d['a-nome']) : '—'], ...(K.veReceita() ? [['MRR', d.mrr ? fmt.brl(d.mrr) : '—']] : []), ['Renovação', d.renova ? fmt.data(d.renova) : '—'], ['Serviços', fmt.esc((d.servicos || []).join(', ') || '—')], ['Responsável', fmt.esc(t.nome || '—')], ['Metas', fmt.esc([d['m-roas'] ? `ROAS ${fmt.dec(d['m-roas'], 1)}` : '', d['m-cpl'] ? `CPL ${fmt.brl2(d['m-cpl'])}` : '', d['m-leads'] ? `${fmt.num(d['m-leads'])} leads/mês` : '', d['m-fat'] ? `${fmt.brl(d['m-fat'])}/mês` : ''].filter(Boolean).join(' · ') || '—')], ['Teto de mídia', tetoTexto(ctx, d.tetoMidiaMensal)], ...(K.veReceita() ? [['Comissão variável', coms.length ? coms.map(x => `${fmt.esc(K.nomePessoa(x.teamId))}: ${x.tipo === 'percentual' ? `${fmt.pct(x.valor || 0, 1)} do MRR` : `${fmt.brl2(x.valor || 0)}/mês`} · ${fmt.plural(x.meses || 0, 'mês', 'meses')}`).join('<br>') : '—']] : []), ['Acessos a pedir', fmt.plural((d.acessosPedir || []).length, 'acesso')]])}</div>`;
  }
  const nav = `<div class="m-clientes-wnav">${p > 0 ? ui.btn({ rotulo: 'Voltar', icone: 'arrow-left', attrs: { 'data-voltar': '' } }) : ui.btn({ rotulo: 'Cancelar', href: '#/clientes' })}<span class="sm mut m-clientes-rasc">${wizard.restaurado ? 'Rascunho restaurado · ' : ''}${wizard.deDeal ? `Pré-preenchido com a oportunidade ganha (${fmt.esc(wizard.deDeal)}) · ` : ''}rascunho salvo automaticamente ${ui.btn({ rotulo: 'Descartar rascunho', tipo: 'link', sm: true, attrs: { 'data-descartar': '' } })}</span>${p < ULTIMA ? ui.btn({ rotulo: 'Continuar', iconeDir: 'arrow-right', tipo: 'pri', attrs: { 'data-avancar': '' } }) : ui.btn({ rotulo: 'Cadastrar cliente', icone: 'check', tipo: 'pri', attrs: { 'data-criar': '' } })}</div>`;
  return `<div class="pg m-clientes">${ui.cabecalho({ titulo: 'Cadastrar cliente', sub: 'Leva uns 3 minutos. Pule entre as etapas quando quiser: o que faltar aparece na Revisão.', voltar: { href: '#/clientes', rotulo: 'Carteira' } })}
${ui.card({ cls: 'm-clientes-wiz', corpo: `${passos}<form id="m-clientes-wf" class="stack" novalidate data-passo="${p}"><h2 class="m-clientes-wt">${p + 1}. ${ETAPAS[p].rotulo}${p < ULTIMA && wizard.visitados.includes(p) && P[p].length ? ` <small class="t-warn m-clientes-wtp">${fmt.plural(P[p].length, 'pendente', 'pendentes')}</small>` : ''}</h2>${corpo}</form>${nav}` })}</div>`;
}

function dupHtml(ctx, dupN, marcado) {
  const { ui } = ctx;
  return `<div class="m-clientes-dup">${ui.aviso({ tipo: 'warn', titulo: `Já existe um cliente chamado "${dupN.nome}".`, texto: 'Se for outro cliente com o mesmo nome, confirme abaixo. Se for o mesmo, abra a ficha existente.', acao: ui.btn({ rotulo: 'Abrir ficha', sm: true, href: `#/clientes/${dupN.id}` }) })}${ui.campo({ nome: 'nomeRepetidoOk', rotulo: 'É outro cliente, com o mesmo nome', tipo: 'checkbox', valor: marcado })}</div>`;
}
/** marca no formulário (sem bloquear) os campos pendentes da etapa atual */
function dicasPasso(ctx, f, p) {
  const { ui, db, fmt } = ctx;
  const R = {
    0: { nome: ['obrigatorio', 'min:2'], razaoSocial: 'obrigatorio|min:3', cnpj: ['obrigatorio', ui.valida.cnpj, v => { const d = cnpjDuplicado(db, v); return d ? `CNPJ já cadastrado para ${d.nome}. Abra a ficha existente em vez de duplicar.` : ''; }], segmento: 'obrigatorio', inicio: 'obrigatorio',
      nomeRepetidoOk: [(v, d) => (nomeDuplicado(db, fmt, d.nome) && !v ? 'Confirme que é outro cliente ou abra a ficha existente.' : '')] },
    1: { 'd-nome': 'obrigatorio|min:3', 'a-nome': [(v, d) => (!v && (d['a-email'] || d['a-tel']) ? 'Informe o nome do contato.' : '')] },
    2: { ...(K.veReceita() ? { mrr: ['obrigatorio', v => (v != null && v <= 0 ? 'Informe um valor maior que zero.' : '')] } : {}), renova: ['obrigatorio', v => (v && v <= HOJE ? 'A renovação deve ser uma data futura.' : '')], servicos: [v => (!v || !v.length ? 'Marque pelo menos um serviço.' : '')], ...regrasComissoes(f) },
    3: { 'm-roas': [v => (v != null && (v < 0 || v > 50) ? 'ROAS entre 0 e 50.' : '')] },
  }[p];
  if (!R) return null;
  const foco = document.activeElement;
  const r = ui.form.validar(f, R); // (o erro de "servicos" já sai no fieldset)
  if (foco && foco !== document.body && foco.isConnected) foco.focus({ preventScroll: true });
  return r;
}

function slug(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18) || 'cliente'; }
function criarCliente(ctx) {
  const { db, fmt, notify, ui } = ctx; const d = wizard.dados;
  let id = `c-${slug(d.nome)}`; let n = 2; while (db.get('clients', id)) id = `c-${slug(d.nome)}${n++}`;
  const pagos = (d.servicos || []).some(s => s === 'Tráfego' || s === 'Google');
  const acessos = (d.acessosPedir || []).map(nome => ({ nome, tipo: 'outro', estado: 'off', obs: 'Aguardando liberação pelo cliente' }));
  const comps = { resultado: 60, prazo: 100, engajamento: 75, pagamento: 96 };
  const health = Math.round(Object.keys(PESOS).reduce((a, k) => a + (comps[k] * PESOS[k]) / 100, 0));
  const cli = {
    id, nome: d.nome.trim(), razaoSocial: d.razaoSocial.trim(), cnpj: ui.mascaras.cnpj(d.cnpj), segmento: d.segmento, cidade: d.cidade, desde: d.inicio, servicos: d.servicos, mrr: K.veReceita() ? d.mrr : 0, ...(K.veReceita() ? {} : { mrrPendente: true }),
    health, tendencia: [health, health, health, health, health, health], noPrazo: 100, pagamento: { estado: 'ok', texto: 'Em dia' }, renova: d.renova, respId: d.respId,
    equipe: [...new Set([d.respId, ...(d.equipe || []), ...(pagos ? ['t-ana'] : [])])], metas: { roas: pagos ? d['m-roas'] ?? null : null, cpl: pagos ? d['m-cpl'] ?? null : null, leadsMes: d['m-leads'] ?? null, faturamento: d['m-fat'] ?? null },
    tetoMidiaMensal: d.tetoMidiaMensal > 0 ? d.tetoMidiaMensal : null, comissoes: K.veReceita() ? (d.comissoes || []).filter(x => x.teamId) : [],
    acessos, riscoChurn: 25, atrasadas: 0, logoCor: CORES[Math.floor(Math.random() * CORES.length)], ativo: true, status: 'onboarding', componentes: comps, delta30: 0,
    baseline: { data: d.inicio, roas: null, cpl: null, leadsMes: null, faturamento: null }, registros: [],
  };
  db.batch(() => {
    db.insert('clients', cli, { log: `cadastrou o cliente ${cli.nome}` });
    db.insert('contacts', { clientId: id, nome: d['d-nome'], papel: 'decisor', cargo: d['d-cargo'], email: d['d-email'], telefone: d['d-tel'], whatsapp: true, principal: true, ultimaResposta: HOJE });
    if (d['a-nome']) db.insert('contacts', { clientId: id, nome: d['a-nome'], papel: 'dia_a_dia', cargo: '', email: d['a-email'], telefone: d['a-tel'], whatsapp: true, principal: false });
    db.insert('contracts', { clientId: id, inicio: d.inicio, mrr: cli.mrr, indice: d.indice, reajustePct: d.reajustePct ?? 0, reajusteData: d.renova, fidelidadeMeses: Number(d.fidelidadeMeses), renovacao: d.renova, renovacaoAuto: true, pdf: '', status: 'vigente' });
    db.insert('onboarding', { clientId: id, respId: d.respId, etapas: { contrato: { estado: 'feito', data: HOJE }, acessos: { estado: 'pendente', data: null }, kickoff: { estado: 'pendente', data: null }, entrega: { estado: 'pendente', data: null }, resultado: { estado: 'pendente', data: null } }, etapaAtual: 'acessos', paradoDesde: HOJE, pendencia: `${fmt.plural(acessos.length, 'acesso')} a liberar`, concluido: false });
    db.insert('healthHistory', { id: `hh-${id.slice(2)}`, clientId: id, semanas: SEMANAS, valores: SEMANAS.map((_, i) => (i === NSEM - 1 ? health : null)) });
    db.insert('clientResults', { id: `cr-${id.slice(2)}`, clientId: id, semanas: SEMANAS, roas: null, cpl: null, leads: SEMANAS.map(() => null), faturamento: SEMANAS.map(() => null) });
  });
  const para = [...new Set(cli.equipe.map(K.userDe).filter(u => u && (!ctx.real || u !== ctx.real.id)))];
  if (para.length) notify.enviar({ para, titulo: `Novo cliente: ${cli.nome}`, texto: `Você está na equipe de ${cli.nome}. Responsável: ${K.nomePessoa(cli.respId)}. Próxima etapa: liberar acessos e marcar o kickoff.`, link: `#/clientes/${id}`, tipo: 'atribuicao', refCol: 'clients', refId: id });
  if (cli.comissoes.length) notificarComissoes(ctx, cli, [], cli.comissoes);
  if (cli.mrrPendente) {
    const adm = K.usuariosReceita().filter(u => !ctx.real || u !== ctx.real.id);
    if (adm.length) notify.enviar({ para: adm, titulo: `Preencher o MRR de ${cli.nome}`, texto: `${ctx.real ? ctx.real.nome : 'A equipe'} cadastrou o cliente sem o valor do contrato. Complete o MRR no cadastro.`, link: `#/clientes/${id}/cadastro?editar=1`, tipo: 'atribuicao', refCol: 'clients', refId: id });
  }
  return cli;
}

export function mountNovo(el, ctx) {
  const { ui, router } = ctx;
  const f = el.querySelector('#m-clientes-wf');
  const lerPasso = () => {
    if (!f) return;
    const d = ui.form.ler(f);
    ['servicos', 'equipe', 'acessosPedir'].forEach(k => { const x = f.querySelector(`[name="${k}"]`); if (x && !Array.isArray(d[k])) d[k] = d[k] ? [x.value] : []; });
    if (f.querySelector('[data-cms]')) d.comissoes = lerComissoes(f, d);
    limparChavesCm(d);
    Object.assign(wizard.dados, d); salvarRascunho();
  };
  let t = null;
  const onInput = () => { clearTimeout(t); t = setTimeout(lerPasso, 250); };
  f && f.addEventListener('input', onInput); f && f.addEventListener('change', onInput);
  const offs = [];
  if (f) { offs.push(mountComissoes(el, ctx, { aoMudar: lerPasso })); offs.push(ligarTeto(el, ctx)); }
  // nome repetido: re-render leve ao sair do campo
  const nome = f && f.querySelector('[name="nome"]');
  nome && nome.addEventListener('blur', () => {
    lerPasso(); const dup = nomeDuplicado(ctx.db, ctx.fmt, wizard.dados.nome); const box = f.querySelector('.m-clientes-dup');
    if (dup && !box) f.querySelector('.fgrid').insertAdjacentHTML('afterend', dupHtml(ctx, dup, wizard.dados.nomeRepetidoOk));
    else if (!dup && box) box.remove();
  });
  if (f && !ctx.query.ok) {
    // ao voltar a uma etapa já visitada (ou pelo link "Faltam"), mostra o que falta sem bloquear
    if (wizard.dicas) { wizard.dicas = false; dicasPasso(ctx, f, wizard.passo); }
    const alvo = wizard.foco && (f.querySelector(`[name="${wizard.foco}"]`) || (wizard.foco === 'servicos' && f.querySelector('.m-clientes-svs input')));
    wizard.foco = null;
    if (alvo) { alvo.focus({ preventScroll: true }); alvo.scrollIntoView({ block: 'center' }); }
    else { const first = f.querySelector('input:not([type=hidden]),select'); if (first && !document.activeElement.closest('.m-clientes-wiz')) first.focus({ preventScroll: true }); }
  }
  const ir = (i, foco) => {
    lerPasso(); const de = wizard.passo;
    wizard.passo = Math.max(0, Math.min(ULTIMA, i)); visitar(wizard.passo);
    wizard.foco = foco || null; wizard.dicas = wizard.passo !== de || !!foco; wizard.restaurado = false;
    if (wizard.passo !== ULTIMA) wizard.tentou = false;
    salvarRascunho(); ctx.refresh(); if (!foco) window.scrollTo(0, 0);
  };
  const onClick = e => {
    if (e.target.closest('[data-outro]')) { wizard.dealId = null; wizard.deDeal = null; wizard.dados = null; wizard.passo = 0; wizard.visitados = [0]; lsSet(null); return; }
    const b = e.target.closest('[data-ir]');
    if (b) { e.preventDefault(); ir(Number(b.dataset.ir), b.dataset.foco); return; }
    if (e.target.closest('[data-voltar]')) { ir(wizard.passo - 1); return; }
    if (e.target.closest('[data-avancar]')) { ir(wizard.passo + 1); return; }
    if (e.target.closest('[data-descartar]')) {
      const ant = { dados: wizard.dados, passo: wizard.passo, visitados: wizard.visitados.slice() };
      zerar(ctx); wizard.restaurado = false; lsSet(null); ctx.refresh();
      ui.toast('Rascunho descartado.', { desfazer: () => { Object.assign(wizard, ant); salvarRascunho(); ctx.refresh(); } });
      return;
    }
    if (e.target.closest('[data-criar]')) {
      // a validação que bloqueia acontece só aqui (o rascunho pode ter sido editado em outra aba)
      lerPasso();
      const P = pendencias(ctx, wizard.dados);
      const tot = P.reduce((a, l) => a + l.length, 0);
      if (tot) {
        ETAPAS.forEach((_, i) => visitar(i)); wizard.tentou = true; salvarRascunho();
        const txt = P.map((l, i) => (l.length ? `${ETAPAS[i].rotulo} (${[...new Set(l.map(x => x.rotulo))].join(', ')})` : '')).filter(Boolean).join(', ');
        ui.toast(`Faltam: ${txt}.`, { tipo: 'err' });
        ctx.refresh(); setTimeout(() => { const a = document.querySelector('.m-clientes-faltam [data-ir]'); a && a.focus(); }, 60);
        return;
      }
      const cli = criarCliente(ctx);
      if (wizard.dealId && ctx.db.get('deals', wizard.dealId)) ctx.db.update('deals', wizard.dealId, { clienteId: cli.id }, { log: `virou cliente: ${cli.nome}` });
      wizard.dados = null; wizard.passo = 0; wizard.visitados = [0]; wizard.tentou = false; wizard.dealId = null; wizard.deDeal = null; lsSet(null);
      router.go(`clientes/novo?ok=${cli.id}`);
      ui.toast(`${cli.nome} cadastrado.`, { acao: { rotulo: 'Abrir ficha', fn: () => router.go(`clientes/${cli.id}`) } });
    }
  };
  el.addEventListener('click', onClick);
  return () => { el.removeEventListener('click', onClick); clearTimeout(t); offs.forEach(fn => fn()); };
}

export { agendarReuniao };
