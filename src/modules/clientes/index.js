// Módulo Clientes — carteira, matriz risco × valor, ficha do cliente (resultados × ações da equipe), cadastro.
// Rotas: #/clientes (?f=risco|atraso|inadimplentes|renovam, ?q=, ?m=todos) · #/clientes/novo · #/clientes/:id · #/clientes/:id/:aba
// Abas: (visão geral) · resultados-acoes · entregas · cadastro · financeiro (só quem vê receita).
// Abas antigas redirecionam: visao → visão geral · resultados → resultados-acoes · acoes → resultados-acoes (rola até a linha do tempo)
//   · saude → visão geral com o cálculo aberto · comentarios → visão geral com o painel de comentários aberto.
// Ações por URL: ?acao=resgate · ?acao=agendar · ?novo=1 (registrar ação) · ?comentarios=1 · ?calc=1 · ?foco=acoes|saude
import { HOJE } from './data.js';
import * as K from './calc.js';
import { renderLista, mountLista } from './lista.js';
import { cabecalhoFicha, tabsFicha, painelComentarios, corpoComentarios, comAberto, setComAberto, nComentarios, abaVisao, abaEntregas, abaFinanceiro, planoResgate, agendarReuniao, ABA_IDS, ABA_RA, ABAS_ANTIGAS } from './ficha.js';
import { abaResultadosAcoes, registrarAcao, abrirResumo } from './resultados.js';
import { abaCadastro, mountCadastro, renderNovo, mountNovo, edicao } from './cadastro.js';

const abaDe = ctx => ctx.params.aba || '';
const DESKTOP = '(min-width: 1200px)';
/** destino de uma aba antiga (ou null) */
function redirecionamento(ctx) {
  const r = ABAS_ANTIGAS[ctx.params.aba]; if (!r) return null;
  const q = { ...ctx.query, ...(r.q || {}) };
  return ctx.router.href(`clientes/${ctx.params.id}${r.aba ? `/${r.aba}` : ''}`, q, false);
}

function renderFicha(ctx) {
  const { ui, db, params } = ctx;
  const c = db.get('clients', params.id);
  if (!c) return `<div class="pg">${ui.cabecalho({ titulo: 'Cliente não encontrado', voltar: { href: '#/clientes', rotulo: 'Carteira' } })}${ui.card({ corpo: ui.vazio({ icone: 'search', titulo: 'Este cliente não existe ou foi removido', texto: `Não encontramos "${params.id}". Confira o link ou procure na carteira.`, acao: { rotulo: 'Ir para a carteira', href: '#/clientes' } }) })}</div>`;
  if (!K.podeVer(c.id)) return `<div class="pg">${ui.cabecalho({ titulo: 'Acesso restrito', voltar: { href: '#/clientes', rotulo: 'Carteira' } })}${ui.card({ corpo: ui.vazio({ icone: 'lock', titulo: 'Este cliente não está na sua carteira', texto: 'Você vê apenas os clientes em que é responsável ou faz parte da equipe. Peça ao responsável ou ao administrador para incluir você.', acao: { rotulo: 'Ver meus clientes', href: '#/clientes' } }) })}</div>`;
  ctx.migalha(c.nome);
  if (redirecionamento(ctx)) return `<div class="pg m-clientes">${ui.skeleton({ linhas: 6 })}</div>`;
  const aba = abaDe(ctx);
  const casca = corpo => `<div class="pg m-clientes m-clientes-ficha${comAberto() ? ' com-on' : ''}">${cabecalhoFicha(ctx, c, aba)}
<div class="m-clientes-fx"><div class="m-clientes-main">${tabsFicha(ctx, c, aba)}<div class="pg m-clientes-aba">${corpo}</div></div>${comAberto() ? painelComentarios(ctx, c) : ''}</div></div>`;
  if (aba === 'financeiro' && !K.veReceita()) return casca(ui.card({ corpo: ui.vazio({ icone: 'lock', titulo: 'Financeiro do cliente restrito', texto: 'Valores de contrato, MRR e faturas são visíveis só para administradores. Resultados, entregas e health score continuam nas outras abas.', acao: { rotulo: 'Visão geral', href: `#/clientes/${c.id}` } }) }));
  if (!ABA_IDS.includes(aba)) return casca(ui.card({ corpo: ui.vazio({ titulo: 'Aba não encontrada', texto: 'Este endereço não corresponde a nenhuma seção da ficha.', acao: { rotulo: 'Visão geral', href: `#/clientes/${c.id}` } }) }));
  const corpo = { '': abaVisao, [ABA_RA]: abaResultadosAcoes, entregas: abaEntregas, financeiro: abaFinanceiro, cadastro: abaCadastro }[aba](ctx, c);
  return casca(corpo);
}

/** gaveta de comentários (telas < 1200 px); fecha sozinha se a pessoa sair da ficha (voltar do navegador) */
let gaveta = null;
function gavetaComentarios(ctx, c) {
  if (gaveta) gaveta.fechar();
  gaveta = ctx.ui.drawer({ titulo: `Comentários (${nComentarios(ctx.db, c)})`, sub: `${c.nome} · digite @ para mencionar`, largura: 460, corpo: corpoComentarios(ctx, c) });
  const g = gaveta; g.fechado.then(() => { if (gaveta === g) gaveta = null; });
  return g;
}

function mountFicha(el, ctx) {
  const { db, router, ui, params, query } = ctx;
  const c0 = db.get('clients', params.id);
  if (!c0 || !K.podeVer(c0.id)) return null;
  const dest = redirecionamento(ctx);
  if (dest) { const de = ctx.path; setTimeout(() => { if (router.path === de) router.go(dest, { replace: true }); }, 0); return null; }
  const pode = ctx.can('clientes', 'editar');
  const cli = () => db.get('clients', params.id) || c0;
  const aba = abaDe(ctx);
  const offCad = aba === 'cadastro' ? mountCadastro(el, ctx, c0) : null;
  const desktop = () => window.matchMedia(DESKTOP).matches;
  const rerender = () => router.setQuery({}, { render: true }); // re-render com a URL atual (ctx.refresh reusa a rota antiga)
  const abrirComentarios = () => {
    if (desktop()) { setComAberto(true); rerender(); setTimeout(() => { const ta = document.querySelector('#m-clientes-com textarea'); ta && ta.focus({ preventScroll: true }); }, 200); }
    else gavetaComentarios(ctx, cli());
  };
  const onClick = async e => {
    if (e.target.closest('[data-resgate]')) { if (pode) planoResgate(ctx, cli()); return; }
    if (e.target.closest('[data-agendar]')) { if (pode) agendarReuniao(ctx, cli()); return; }
    if (e.target.closest('[data-reg-acao]')) { if (pode) registrarAcao(ctx, cli()); return; }
    if (e.target.closest('[data-resumo]')) { abrirResumo(ctx, cli()); return; }
    if (e.target.closest('[data-ir-acoes]')) { const t = el.querySelector('#m-clientes-acoes'); t && t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (e.target.closest('[data-com-toggle]')) { if (desktop() && comAberto()) { setComAberto(false); rerender(); } else abrirComentarios(); return; }
    if (e.target.closest('[data-com-fechar]')) { setComAberto(false); rerender(); return; }
    if (e.target.closest('[data-calc]')) { router.setQuery({ calc: query.calc === '1' ? null : '1' }, { render: true }); return; }
    const sg = e.target.closest('.m-clientes-per [data-seg]');
    if (sg) { router.setQuery({ per: sg.dataset.seg === 'tudo' ? null : sg.dataset.seg }, { render: true }); }
  };
  const onChange = e => {
    const s = e.target.closest('[data-f-pessoa]');
    if (s) router.setQuery({ pessoa: s.value || null }, { render: true });
  };
  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  // parâmetros de uso único (?foco, ?comentarios, ?acao, ?novo): limpa a URL e re-renderiza ANTES de agir.
  // (ctx.refresh/db reaproveitam a rota guardada pelo shell; sem limpar, a ação se repetiria a cada re-render)
  const acao = query.acao || (query.novo === '1' ? 'registrar' : null);
  const foco = query.foco; const abrirCom = query.comentarios === '1';
  if (foco || abrirCom || acao) {
    if (abrirCom && desktop()) setComAberto(true);
    router.setQuery({ foco: null, comentarios: null, acao: null, novo: null }); // já (hashchange + popstate disparam 2 renders)
    setTimeout(() => {
      rerender();
      setTimeout(() => {
        if (foco) { const t = document.querySelector(`.m-clientes [data-foco="${foco}"]`); t && t.scrollIntoView({ block: 'start' }); }
        if (abrirCom) { if (desktop()) { const ta = document.querySelector('#m-clientes-com textarea'); ta && ta.focus({ preventScroll: true }); } else gavetaComentarios(ctx, cli()); }
        if (!acao) return;
        if (!pode) { ui.toast('Você pode ver este cliente, mas não tem permissão para esta ação.', { tipo: 'warn' }); return; }
        if (acao === 'resgate') planoResgate(ctx, cli());
        else if (acao === 'agendar') agendarReuniao(ctx, cli());
        else if (acao === 'registrar') registrarAcao(ctx, cli());
      }, 80);
    }, 0);
  }
  return () => {
    el.removeEventListener('click', onClick); el.removeEventListener('change', onChange); offCad && offCad();
    setTimeout(() => { if (gaveta && !location.hash.startsWith(`#/clientes/${c0.id}`)) gaveta.fechar(); }, 0);
  };
}

export default {
  id: 'clientes',
  titulo: 'Clientes',
  icone: 'building',
  grupo: 'gestao',
  rota: 'clientes',
  routes: ['clientes', 'clientes/:id', 'clientes/:id/:aba'],
  watch: ['clients', 'contacts', 'contracts', 'meetings', 'onboarding', 'clientResults', 'clientActions', 'healthHistory', 'tasks', 'deliveries', 'invoices', 'timeEntries', 'team', 'settings', 'comments'],
  render(ctx) {
    if (!ctx.params.id) return renderLista(ctx);
    if (ctx.params.id === 'novo' && !ctx.params.aba) return renderNovo(ctx);
    return renderFicha(ctx);
  },
  mount(el, ctx) {
    if (!ctx.params.id) return mountLista(el, ctx);
    if (ctx.params.id === 'novo' && !ctx.params.aba) return mountNovo(el, ctx);
    if (edicao.id && edicao.id !== ctx.params.id) { edicao.id = null; edicao.sujo = false; }
    return mountFicha(el, ctx);
  },
  contador() {
    const n = K.visiveis().filter(K.emRisco).length;
    return n ? { n, estado: 'err', rotulo: `${n} ${n === 1 ? 'cliente' : 'clientes'} em risco` } : null;
  },
  busca(q) {
    return K.buscar(q).slice(0, 8).map(c => ({ tipo: 'Clientes', titulo: c.nome, sub: `${c.segmento} · ${c.cnpj} · health ${c.health}`, href: `#/clientes/${c.id}`, led: K.estH(c.health), icone: 'building' }));
  },
};
