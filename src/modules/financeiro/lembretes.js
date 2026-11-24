// financeiro/lembretes.js — Lembretes automáticos de vencimento por WhatsApp para o CLIENTE (aba Financeiro › Automação).
// Configuração em settings 'financeiro.lembretes' (a mesma que a Edge Function routines-runner lê em produção):
//   { ativo, quando: ['antes','dia','depois'], hora: '09:00', modelo }
// Regras: mensalidades em aberto que vencem em 3 dias ('antes'), hoje ('dia') ou venceram há 3 dias ('depois').
// Destinatário: contato financeiro do cliente com WhatsApp (Cadastro › Contatos); sem financeiro, o decisor.
// Cada envio fica na fatura: lembretes: [{quando, canal:'whatsapp', tipo, dia, para, status}] — idempotente por fatura + tipo + dia.
// Espelho no servidor: supabase/functions/_shared/lembretes.ts (mantenha os dois iguais).
import { db as DB } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import { nomeFatura } from './calc.js';
import { padrao } from '../../core/padroes/index.js';

export const CHAVE = 'financeiro.lembretes';
export const VARS = [
  { k: 'cliente', d: 'Nome do cliente' }, { k: 'valor', d: 'Valor da fatura (R$ 1.234,56)' },
  { k: 'vencimento', d: 'Data de vencimento (dd/mm/aaaa)' }, { k: 'link_boleto', d: 'Link do boleto/Pix' },
];
export const RODAPE = '⚠️ Mensagem automática — por favor, não responda. Dúvidas: fale com {responsavel}.';
export const MODELO_PADRAO = 'Olá, {cliente}! Passando para lembrar da mensalidade de {valor}, com vencimento em {vencimento}. Para pagar por boleto ou Pix, use o link: {link_boleto}';
// dias antes/depois vêm da central "Padrões e regras" (padrão 3 e 3). O espelho do servidor (_shared/lembretes.ts) lê settings 'padroes'.
const nAntes = () => padrao('financeiro.lembrete.antes', 3), nDepois = () => padrao('financeiro.lembrete.depois', 3);
const dTxt = n => `${n} ${n === 1 ? 'dia' : 'dias'}`;
export const TIPOS = [
  { id: 'antes', get rotulo() { return `${dTxt(nAntes())} antes`; }, get curto() { return `${dTxt(nAntes())} antes`; }, get dias() { return nAntes(); } },
  { id: 'dia', rotulo: 'No dia do vencimento', curto: 'no dia', dias: 0 },
  { id: 'depois', get rotulo() { return `${dTxt(nDepois())} depois (se ainda em aberto)`; }, get curto() { return `${dTxt(nDepois())} depois`; }, get dias() { return -nDepois(); } },
];
export const HORAS = Array.from({ length: 27 }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`); // 07:00–20:00
export const PADRAO = { ativo: false, quando: ['antes', 'dia', 'depois'], hora: '09:00', modelo: MODELO_PADRAO };

export function config(db = DB) { const c = db.config(CHAVE, null) || {}; return { ...PADRAO, ...c, quando: Array.isArray(c.quando) ? c.quando : PADRAO.quando }; }

/* ---------- regras ---------- */
const ehMensalidade = f => /mensalidade/i.test(f.descricao || '') || f.tipo === 'mensalidade';
/** tipo de lembrete que a fatura pede hoje (ou null) */
export function tipoHoje(f, quando = PADRAO.quando, desloc = 0) {
  if (!f || f.status === 'paga' || !f.clientId || !ehMensalidade(f)) return null;
  const d = fmt.diasAte(f.vencimento) - desloc;
  const t = TIPOS.find(x => x.dias === d);
  return t && quando.includes(t.id) ? t.id : null;
}
export const jaEnviado = (f, tipo, dia) => (f.lembretes || []).some(l => l.tipo === tipo && (l.dia || String(l.quando || '').slice(0, 10)) === dia);

/** contato que recebe: financeiro com WhatsApp → decisor → principal */
export function destinatario(clientId, db = DB) {
  const ct = db.list('contacts', c => c.clientId === clientId);
  const tel = c => c && (typeof c.whatsapp === 'string' ? c.whatsapp : c.telefone || c.celular || '');
  const temZap = c => c && c.whatsapp !== false && !!tel(c);
  const fin = ct.find(c => /financ/i.test(`${c.papel || ''} ${c.cargo || ''}`) && temZap(c));
  const dec = ct.find(c => /decisor/i.test(c.papel || '') && temZap(c));
  const pri = ct.find(c => c.principal && temZap(c)) || ct.find(temZap);
  const c = fin || dec || pri;
  return c ? { nome: c.nome, papel: fin ? 'Financeiro' : dec ? 'Decisor' : 'Contato principal', telefone: tel(c), contatoId: c.id } : null;
}
export function linkBoleto(f) { return f.linkBoleto || f.boletoUrl || `https://pagamento.agencia.demo/fatura/${encodeURIComponent(f.numero || f.id)}`; }
export function responsavel(clientId, db = DB) { const c = db.get('clients', clientId); const t = c && c.respId ? db.get('team', c.respId) : null; return t ? t.nome : 'o atendimento da agência'; }
export function dadosFatura(f, db = DB) {
  return { cliente: nomeFatura(f), valor: fmt.brl2(f.valor), vencimento: fmt.data(f.vencimento), link_boleto: linkBoleto(f), responsavel: responsavel(f.clientId, db) };
}
/** mensagem final = modelo com variáveis + rodapé fixo (não removível) */
export function montarMensagem(modelo, dados) {
  const corpo = String(modelo || MODELO_PADRAO).replace(/\{(\w+)\}/g, (m, k) => (k !== 'responsavel' && dados[k] != null ? dados[k] : m)).trim();
  return `${corpo}\n\n${RODAPE.replace('{responsavel}', dados.responsavel)}`;
}
/** variáveis desconhecidas no modelo (validação) */
export function varsInvalidas(modelo) { return [...String(modelo || '').matchAll(/\{([^}]*)\}/g)].map(m => m[1]).filter(k => !VARS.some(v => v.k === k)); }

/** faturas que recebem lembrete em um dia (desloc = dias a partir de hoje) */
export function agenda(cfg = config(), desloc = 0, db = DB) {
  return db.list('invoices').map(f => ({ f, tipo: tipoHoje(f, cfg.quando, desloc) })).filter(x => x.tipo)
    .map(x => ({ ...x, para: destinatario(x.f.clientId, db) }));
}
const hojeIso = () => fmt.iso(new Date());
/** quando (ISO) do envio de hoje no horário configurado */
export function quandoEnvio(hora) { const [h, m] = String(hora || '09:00').split(':').map(Number); const d = new Date(); d.setHours(h || 0, m || 0, 0, 0); return d.toISOString(); }

/**
 * Demo: "Simular envio de hoje" — registra o lembrete em cada fatura que se encaixa nas regras e ainda não recebeu
 * o mesmo tipo hoje. Retorna {enviados:[{f, tipo, para}], semContato:[...], jaEnviados:n, antes:[{id, lembretes}]}
 */
export function simularHoje(ctx) {
  const { db } = ctx; const cfg = config(db); const dia = hojeIso(); const quando = quandoEnvio(cfg.hora);
  const r = { enviados: [], semContato: [], jaEnviados: 0, antes: [] };
  const lst = agenda(cfg, 0, db);
  db.batch(() => {
    for (const x of lst) {
      if (jaEnviado(x.f, x.tipo, dia)) { r.jaEnviados++; continue; }
      if (!x.para) { r.semContato.push(x); continue; }
      const msg = montarMensagem(cfg.modelo, dadosFatura(x.f, db));
      r.antes.push({ id: x.f.id, lembretes: x.f.lembretes || [] });
      const tipoR = TIPOS.find(t => t.id === x.tipo).curto;
      db.update('invoices', x.f.id, { lembretes: [...(x.f.lembretes || []), { quando, dia, canal: 'whatsapp', tipo: x.tipo, para: x.para.telefone, paraNome: x.para.nome, mensagem: msg, status: 'enviado (simulado)', por: 'Lembrete automático' }] },
        { log: `enviou lembrete automático de vencimento (${tipoR}) por WhatsApp para ${nomeFatura(x.f)} — fatura nº ${x.f.numero} (simulado)` });
      r.enviados.push(x);
    }
  });
  return r;
}
export function ultimoLembrete(f) { const l = (f.lembretes || []).slice().sort((a, b) => String(a.quando).localeCompare(String(b.quando))); return l[l.length - 1] || null; }
export const rotLembrete = l => { const d = new Date(l.quando); return `Lembrete WhatsApp ${/falh/i.test(l.status || '') ? 'falhou' : 'enviado'} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${fmt.hora(l.quando)}`; };

/* ============================== aba Automação ============================== */
function bolha(texto) {
  return `<div class="mf-zap" aria-label="Prévia da mensagem no WhatsApp"><div class="mf-zap-b">${fmt.esc(texto).replace(/\n/g, '<br>')}<span class="mf-zap-h">${fmt.hora(new Date())} ✓✓</span></div></div>`;
}
/** fatura usada na prévia: uma da agenda de hoje, senão a próxima mensalidade em aberto */
export function faturaPrevia(db = DB, id) {
  if (id) { const f = db.get('invoices', id); if (f) return f; }
  const hoje = agenda(config(db), 0, db)[0]; if (hoje) return hoje.f;
  return db.list('invoices', f => f.status !== 'paga' && f.clientId && ehMensalidade(f)).sort((a, b) => String(b.vencimento).localeCompare(String(a.vencimento)))[0] || db.list('invoices', f => f.clientId)[0] || null;
}
export function previaHtml(ctx, modelo, invId) {
  const { db, ui } = ctx; const f = faturaPrevia(db, invId);
  if (!f) return ui.vazio({ compacto: true, icone: 'message', titulo: 'Sem fatura para a prévia', texto: 'Quando houver uma mensalidade cadastrada, a prévia usa os dados reais dela.' });
  const para = destinatario(f.clientId, db);
  const opcoes = db.list('invoices', x => x.status !== 'paga' && x.clientId && ehMensalidade(x)).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
  if (!opcoes.some(x => x.id === f.id)) opcoes.unshift(f);
  return `<div class="mf-prev-top">${ui.campo({ nome: 'previaFatura', rotulo: 'Fatura usada na prévia', tipo: 'select', valor: f.id, opcoes: opcoes.map(x => ({ v: x.id, l: `${nomeFatura(x)} · ${fmt.brl(x.valor)} · vence ${fmt.dataCurta(x.vencimento)}` })), attrs: { 'data-previa-fatura': '' } })}</div>
<p class="mf-prev-para sm">${ui.ic('phone')}<span>${para ? `Para <b>${fmt.esc(para.nome)}</b> (${fmt.esc(para.papel)}) · <span class="mf-nw">${fmt.esc(para.telefone)}</span>` : '<span class="t-warn">Cliente sem contato com WhatsApp. Cadastre o financeiro ou o decisor.</span>'}</span></p>
${bolha(montarMensagem(modelo, dadosFatura(f, db)))}`;
}

export function abaAutomacao(ctx, pode) {
  const { ui, db } = ctx; const cfg = config(db);
  const SEM = 'Seu perfil só pode visualizar o Financeiro. Peça acesso de edição ao administrador.';
  const hoje = agenda(cfg, 0, db); const diaH = hojeIso();
  const prox = []; for (let i = 1; i <= 7; i++) agenda(cfg, i, db).forEach(x => prox.push({ ...x, em: i }));
  const estado = cfg.ativo ? ui.led('ok', 'Ligado') : ui.led('off', 'Desligado');
  const form = `<form class="stack mf-lem" data-lem-form novalidate>
${ui.campo({ nome: 'ativo', rotulo: 'Enviar lembretes automáticos de vencimento para os clientes', tipo: 'checkbox', valor: cfg.ativo, desabilitado: !pode, dica: 'Vale para as mensalidades em aberto. Faturas pagas ou sem cliente cadastrado não recebem.' })}
<fieldset class="fld mf-lem-q"><legend>Quando enviar</legend><div class="mf-lem-qs">${TIPOS.map(t => `<label class="ck"><input type="checkbox" name="quando" value="${t.id}"${cfg.quando.includes(t.id) ? ' checked' : ''}${pode ? '' : ' disabled'}><span>${fmt.esc(t.rotulo)}</span></label>`).join('')}</div></fieldset>
<div class="fgrid">${ui.campo({ nome: 'hora', rotulo: 'Horário do envio', tipo: 'select', valor: cfg.hora, obrigatorio: true, desabilitado: !pode, opcoes: HORAS.includes(cfg.hora) ? HORAS : [cfg.hora, ...HORAS], dica: 'Horário de Brasília. O servidor envia uma vez por dia nesse horário.' })}
<div class="fld"><span class="mf-lem-lb">Quem recebe</span><p class="sm mf-lem-dest">${ui.ic('users')}<span>WhatsApp do contato <b>financeiro</b> do cliente (Cadastro › Contatos). Sem financeiro, vai para o <b>decisor</b>.</span></p></div></div>
${ui.campo({ nome: 'modelo', rotulo: 'Mensagem', tipo: 'textarea', linhas: 5, valor: cfg.modelo, obrigatorio: true, desabilitado: !pode, attrs: { 'data-lem-modelo': '' } })}
<div class="mf-lem-vars" role="group" aria-label="Inserir variável">${VARS.map(v => `<button type="button" class="chip" data-lem-var="${v.k}" title="${fmt.esc(v.d)}"${pode ? '' : ' disabled'}>{${v.k}}</button>`).join('')}<span class="mut sm">Clique para inserir no cursor.</span></div>
<div class="mf-lem-rod" aria-label="Rodapé fixo">${ui.ic('lock')}<div><span class="mut sm">Rodapé fixo, sempre enviado (não pode ser removido)</span><p>${fmt.esc(RODAPE)}</p><span class="mut sm">{responsavel} = responsável pelo cliente na agência.</span></div></div>
<div class="mf-lem-a">${ui.btn({ rotulo: 'Restaurar mensagem padrão', tipo: 'ghost', sm: true, attrs: { 'data-f': 'lem-padrao' }, disabled: !pode })}${ui.btn({ rotulo: 'Salvar', icone: 'check', tipo: 'pri', submit: true, disabled: !pode, title: pode ? 'Salvar configuração' : SEM })}</div>
</form>`;
  const linhaAgenda = (x, i) => {
    const t = TIPOS.find(y => y.id === x.tipo); const env = jaEnviado(x.f, x.tipo, diaH) ? ultimoLembrete(x.f) : null;
    return { estado: env ? 'ok' : x.para ? (cfg.ativo ? 'warn' : 'off') : 'err', titulo: `${nomeFatura(x.f)} · ${fmt.brl(x.f.valor)}`,
      sub: `${t.curto} · vence ${fmt.data(x.f.vencimento)} · ${x.para ? `${x.para.nome} (${x.para.papel})` : 'sem contato com WhatsApp'}`,
      meta: env ? rotLembrete(env) : x.para ? (i == null ? `às ${cfg.hora}` : `em ${fmt.plural(i, 'dia')}`) : 'cadastre o contato', href: `#/financeiro/receber?f=todas&fatura=${x.f.id}` };
  };
  const enviadosHoje = hoje.filter(x => jaEnviado(x.f, x.tipo, diaH)).length;
  const simular = db.mode === 'demo'
    ? ui.btn({ rotulo: 'Simular envio de hoje', icone: 'send', tipo: 'pri', sm: true, attrs: { 'data-f': 'lem-simular' }, disabled: !pode || !cfg.ativo, title: !pode ? SEM : !cfg.ativo ? 'Ligue os lembretes automáticos para simular o envio.' : 'Registra os lembretes de hoje nas faturas (envio simulado no modo demonstração)' })
    : `<span class="sm mut">Envio automático às ${fmt.esc(cfg.hora)}</span>`;
  const cardHoje = ui.card({ titulo: 'Envios de hoje', sub: hoje.length ? `${fmt.plural(hoje.length, 'fatura')} · ${enviadosHoje} ${enviadosHoje === 1 ? 'enviado' : 'enviados'}` : 'nenhuma fatura nas regras', acoes: simular,
    ajuda: 'Mensalidades em aberto que hoje estão a 3 dias do vencimento, vencem hoje ou venceram há 3 dias (conforme as opções marcadas). Cada fatura recebe no máximo um lembrete de cada tipo por dia.',
    corpo: hoje.length ? ui.lista(hoje.map(x => linhaAgenda(x))) : ui.vazio({ compacto: true, icone: 'calendar', titulo: 'Nada para enviar hoje', texto: prox.length ? `O próximo lembrete sai ${prox[0].em === 1 ? 'amanhã' : `em ${prox[0].em} dias`} (${nomeFatura(prox[0].f)}).` : 'Nenhuma mensalidade vence nos próximos dias.' }) });
  const cardProx = ui.card({ titulo: 'Próximos 7 dias', sub: prox.length ? fmt.plural(prox.length, 'lembrete') : '', corpo: prox.length ? ui.lista(prox.map(x => linhaAgenda(x, x.em))) : ui.vazio({ compacto: true, icone: 'calendar', titulo: 'Sem lembretes programados', texto: 'Nenhuma mensalidade em aberto entra nas regras nos próximos 7 dias.' }) });
  const hist = db.list('invoices', f => (f.lembretes || []).length).flatMap(f => f.lembretes.map(l => ({ ...l, f }))).sort((a, b) => String(b.quando).localeCompare(String(a.quando))).slice(0, 12);
  const cardHist = hist.length ? ui.card({ titulo: 'Últimos lembretes enviados', pad: false, corpo: ui.tabela({
    cols: [
      { k: 'quando', l: 'Quando', r: l => `${fmt.data(l.quando)} ${fmt.hora(l.quando)}`, w: '140px' },
      { k: 'cli', l: 'Cliente', v: l => nomeFatura(l.f), r: l => `<b>${fmt.esc(nomeFatura(l.f))}</b><span class="sub">fatura nº ${fmt.esc(l.f.numero)} · ${fmt.brl(l.f.valor)}</span>` },
      { k: 'tipo', l: 'Regra', r: l => fmt.esc((TIPOS.find(t => t.id === l.tipo) || {}).curto || l.tipo) },
      { k: 'para', l: 'Para', r: l => `${fmt.esc(l.paraNome || '')}<span class="sub">${fmt.esc(l.para || '')}</span>` },
      { k: 'st', l: 'Situação', r: l => ui.led(/falh/i.test(l.status || '') ? 'err' : 'ok', l.status || 'enviado') },
    ], linhas: hist, legenda: 'Lembretes enviados', densa: true }) }) : '';
  return `${ui.aviso({ tipo: 'info', texto: db.mode === 'demo' ? 'Modo demonstração: nada é enviado de verdade. "Simular envio de hoje" registra os lembretes nas faturas como enviados (simulado).' : `Em produção o servidor (rotina routines-runner) envia pelo WhatsApp configurado (Z-API ou Twilio) às ${cfg.hora}, uma vez por fatura e regra.` })}
<div class="g-2-1 mf-lem-g">${ui.card({ titulo: 'Lembretes automáticos de vencimento (WhatsApp)', sub: 'Mensagem para o cliente: "Aviso automático — não responda"', acoes: estado, corpo: form })}
${ui.card({ titulo: 'Prévia', sub: 'Com os dados de uma fatura real', corpo: `<div data-lem-previa>${previaHtml(ctx, cfg.modelo)}</div>` })}</div>
<div class="g2">${cardHoje}${cardProx}</div>${cardHist}`;
}
