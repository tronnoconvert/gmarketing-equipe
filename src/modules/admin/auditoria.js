// Administração › Auditoria — registro de atividades (coleção `activity`) com filtros na URL e exportação CSV.
import { MOD_ROTULO, modDaCol, linkRef, paraCsv, baixar } from './comum.js';

const PERIODOS = [{ id: '7', rotulo: '7 dias', dias: 7 }, { id: '30', rotulo: '30 dias', dias: 30 }, { id: '90', rotulo: '90 dias', dias: 90 }, { id: 'tudo', rotulo: 'Tudo', dias: null }];
const LIMITE = 200;
/** nome legível do registro citado (cai no id quando não há nome) */
function nomeRef(db, a) {
  if (!a.refId) return '';
  if (a.col === 'settings' && a.refId === 'perms') return 'Matriz de permissões';
  const o = a.col && db.get(a.col, a.refId);
  return (o && (o.nome || o.titulo || o.name || o.email)) || a.refId;
}

export function filtrar(ctx) {
  const { db, query } = ctx;
  const per = PERIODOS.find(p => p.id === query.per) || PERIODOS[1];
  const desde = per.dias ? Date.now() - per.dias * 864e5 : 0;
  return {
    per,
    linhas: db.list('activity', a => (!query.pessoa || (query.pessoa === 'sistema' ? !a.quem : a.quem === query.pessoa)) && (!query.mod || modDaCol(a.col) === query.mod) && (!desde || new Date(a.quando).getTime() >= desde) && (query.outro !== '1' || a.deOutroGestor === true))
      .sort((a, b) => String(b.quando).localeCompare(String(a.quando))),
  };
}

export function render(ctx) {
  const { ui, fmt, db, query } = ctx; const esc = fmt.esc;
  const { per, linhas } = filtrar(ctx);
  const todas = db.list('activity');
  const pessoasIds = [...new Set(todas.map(a => a.quem).filter(Boolean))];
  const pessoas = pessoasIds.map(id => db.get('users', id) || { id, nome: (todas.find(a => a.quem === id) || {}).quemNome || id }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const mods = [...new Set(todas.map(a => modDaCol(a.col)))].sort((a, b) => (MOD_ROTULO[a] || a).localeCompare(MOD_ROTULO[b] || b, 'pt-BR'));
  const sel = (nome, rot, ops, val) => `<label class="m-adm-fl"><span>${rot}</span><select data-m-aud="${nome}">${ops.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(val || '') ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>`;
  const filtros = `<div class="m-adm-bar m-aud-f">
${sel('pessoa', 'Pessoa', [{ v: '', l: 'Todas' }, ...pessoas.map(p => ({ v: p.id, l: p.nome })), { v: 'sistema', l: 'Sistema (automático)' }], query.pessoa)}
${sel('mod', 'Módulo', [{ v: '', l: 'Todos' }, ...mods.map(m => ({ v: m, l: MOD_ROTULO[m] || m }))], query.mod)}
${sel('outro', 'Tipo', [{ v: '', l: 'Todas as alterações' }, { v: '1', l: 'Alterações em clientes de outro gestor' }], query.outro)}
<div class="m-adm-fl"><span>Período</span>${ui.seg(PERIODOS.map(p => ({ id: p.id, rotulo: p.rotulo })), per.id, { rotulo: 'Período' })}</div>
${query.pessoa || query.mod || query.per || query.outro ? ui.btn({ rotulo: 'Limpar filtros', sm: true, tipo: 'ghost', href: '#/admin/auditoria' }) : ''}</div>`;
  const pessoasNoFiltro = new Set(linhas.map(a => a.quem)).size;
  const tabela = ui.tabela({
    legenda: 'Registro de atividades', ordem: null,
    cols: [
      { k: 'quando', l: 'Quando', r: a => `<span class="num" title="${esc(fmt.dataHora(a.quando))}">${fmt.data(a.quando)} ${fmt.hora(a.quando)}</span><span class="sub">${esc(fmt.rel(a.quando))}</span>` },
      { k: 'quemNome', l: 'Pessoa', r: a => (a.quem ? `<span class="m-adm-pess">${ui.avatar(a.quem, 22)}<span>${esc(a.quemNome || (db.get('users', a.quem) || {}).nome || a.quem)}</span></span>` : `<span class="mut">${ui.ic('settings')} Sistema</span>`) },
      { k: 'oque', l: 'Ação', r: a => `${esc(a.oque)}${a.deOutroGestor ? `<span class="sub t-warn" data-de-outro>${ui.ic('users')} Cliente de outro gestor (${esc(a.respNome || '—')})</span>` : ''}` },
      { k: 'col', l: 'Módulo', v: a => MOD_ROTULO[modDaCol(a.col)] || a.col, r: a => esc(MOD_ROTULO[modDaCol(a.col)] || a.col || '—') },
      { k: 'refId', l: 'Registro', mobile: false, v: a => nomeRef(db, a), r: a => { const h = linkRef(a.col, a.refId); const n = nomeRef(db, a); return a.refId ? (h ? `<a href="${esc(h)}" class="sm">${esc(n)}</a>` : `<span class="sm mut">${esc(n)}</span>`) : '<span class="mut">—</span>'; } },
    ],
    linhas: linhas.slice(0, LIMITE),
    vazio: { icone: 'activity', titulo: 'Nenhuma atividade neste filtro', texto: 'Amplie o período ou limpe os filtros. Toda alteração feita no app entra aqui automaticamente.' },
  });
  return ui.card({
    pad: false, titulo: 'Registro de atividades', sub: `${fmt.plural(linhas.length, 'registro', 'registros')} · ${fmt.plural(pessoasNoFiltro, 'pessoa', 'pessoas')} · ${per.dias ? `últimos ${per.rotulo}` : 'todo o período'}${linhas.length > LIMITE ? ` · mostrando os ${LIMITE} mais recentes` : ''}`,
    ajuda: 'Cada alteração relevante (cadastros, papéis, permissões, cobranças, rotinas) grava quem fez, o quê e quando. O registro não pode ser editado pelo app; no servidor só aceita inserção (RLS).',
    acoes: ui.btn({ rotulo: 'Exportar CSV', icone: 'download', sm: true, disabled: !linhas.length, attrs: { 'data-m-aud-csv': '' } }),
    corpo: `${filtros}${tabela}`,
  });
}

export function mount(el, ctx) {
  const { router, fmt, ui } = ctx;
  const onChange = e => { const s = e.target.closest('[data-m-aud]'); if (s) router.setQuery({ [s.dataset.mAud]: s.value || null }, { render: true }); };
  const onClick = e => {
    const sg = e.target.closest('.m-aud-f [data-seg]');
    if (sg) { router.setQuery({ per: sg.dataset.seg === '30' ? null : sg.dataset.seg }, { render: true }); return; }
    if (e.target.closest('[data-m-aud-csv]')) {
      const { linhas } = filtrar(ctx);
      const csv = paraCsv(linhas, [
        { l: 'Data', v: a => fmt.data(a.quando) }, { l: 'Hora', v: a => fmt.hora(a.quando) }, { l: 'Pessoa', v: a => a.quemNome || 'Sistema' },
        { l: 'Ação', v: a => a.oque }, { l: 'Cliente de outro gestor', v: a => (a.deOutroGestor ? `sim (responsável: ${a.respNome || ''})` : '') }, { l: 'Módulo', v: a => MOD_ROTULO[modDaCol(a.col)] || a.col }, { l: 'Coleção', v: a => a.col }, { l: 'Registro', v: a => nomeRef(ctx.db, a) }, { l: 'ID', v: a => a.refId || '' },
      ]);
      baixar(`auditoria-${fmt.iso(new Date())}.csv`, csv);
      ui.toast(`${fmt.plural(linhas.length, 'registro exportado', 'registros exportados')}.`);
    }
  };
  el.addEventListener('change', onChange); el.addEventListener('click', onClick);
  return () => { el.removeEventListener('change', onChange); el.removeEventListener('click', onClick); };
}
