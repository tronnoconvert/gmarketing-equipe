// Administração › Permissões — matriz papel × módulo (único lugar de edição; o perfil em Equipe › Acesso só lê: perms.matriz/salvarMatriz).
import { shell } from '../../core/shell.js';

const OPCOES = [
  { v: '', l: '—' }, { v: 'ver:proprio', l: 'Ver (próprio)' }, { v: 'ver:seus', l: 'Ver (seus)' }, { v: 'ver', l: 'Ver' },
  { v: 'editar:seus', l: 'Editar (seus)' }, { v: 'editar', l: 'Editar' }, { v: 'admin', l: 'Total' },
];
const NIVEL_CLS = { '': 'n0', ver: 'n1', editar: 'n2', admin: 'n4' };
const TRAVADAS = { 'admin|dono': 'O Dono precisa manter acesso total à Administração (evita ficar sem ninguém para gerenciar acessos).' };

let rascunho = null; // matriz em edição (sobrevive a re-render enquanto não salva)

const rotuloOp = v => (OPCOES.find(o => o.v === v) || { l: v }).l;

/** itens de menu que o papel vê, segundo a matriz m */
function menuDoPapel(m, papel) {
  const out = [];
  for (const mod of shell.modulos()) {
    if (mod.oculto) continue;
    const titulo = mod.titulo || mod.title || mod.id;
    if (mod.sub && mod.sub.length) {
      const subs = mod.sub.filter(s => (m[s.perm || mod.perm || mod.id] || {})[papel]);
      if (subs.length) out.push({ titulo, icone: mod.icone || mod.icon, sub: subs.map(s => `${s.titulo} · ${rotuloOp(m[s.perm || mod.perm || mod.id][papel])}`) });
      continue;
    }
    const v = (m[mod.perm || mod.id] || {})[papel];
    if (v) out.push({ titulo, icone: mod.icone || mod.icon, nivel: rotuloOp(v) });
  }
  return out;
}

export function render(ctx) {
  const { ui, fmt, db, perms, query } = ctx; const esc = fmt.esc;
  const pode = ctx.can('admin', 'editar');
  const salva = perms.matriz();
  const m = rascunho || salva;
  const papeis = perms.PAPEIS_ORDEM;
  const mudou = [];
  for (const mod of perms.MODULOS_PERM) for (const p of papeis) if ((m[mod.id] || {})[p] !== (salva[mod.id] || {})[p]) mudou.push(`${mod.id}|${p}`);
  const difPadrao = perms.MODULOS_PERM.reduce((s, mod) => s + papeis.filter(p => (salva[mod.id] || {})[p] !== (perms.MATRIZ_PADRAO[mod.id] || {})[p]).length, 0);
  const contagem = p => db.count('users', u => u.papel === p && u.ativo !== false);
  const foco = papeis.includes(query.papel) ? query.papel : 'gestor_trafego';

  const thead = `<tr><th scope="col" class="m-pm-mod">Módulo</th>${papeis.map(p => `<th scope="col" class="m-pm-c${p === foco ? ' foco' : ''}"><span data-tip="${esc(perms.PAPEIS[p].desc)}">${esc(perms.rotuloPapel(p))}</span><small class="num">${contagem(p)} ${contagem(p) === 1 ? 'pessoa' : 'pessoas'}</small></th>`).join('')}</tr>`;
  const tbody = perms.MODULOS_PERM.map(mod => `<tr><th scope="row" class="m-pm-mod">${esc(mod.rotulo)}</th>${papeis.map(p => {
    const v = (m[mod.id] || {})[p] || '';
    const [niv] = v.split(':');
    const k = `${mod.id}|${p}`; const trava = TRAVADAS[k];
    const alterada = mudou.includes(k);
    return `<td class="m-pm-c ${NIVEL_CLS[niv] || 'n0'}${alterada ? ' alt' : ''}${p === foco ? ' foco' : ''}">${pode && !trava
      ? `<select data-m-pm="${k}" aria-label="${esc(mod.rotulo)} para ${esc(perms.rotuloPapel(p))}">${OPCOES.map(o => `<option value="${o.v}"${o.v === v ? ' selected' : ''}>${o.l}</option>`).join('')}</select>`
      : `<span class="m-pm-ro"${trava ? ` data-tip="${esc(trava)}"` : ''}>${esc(rotuloOp(v))}${trava ? ui.ic('lock') : ''}</span>`}</td>`;
  }).join('')}</tr>`).join('');

  const barra = mudou.length
    ? `<div class="m-pm-salvar" role="status">${ui.led('warn', `${fmt.plural(mudou.length, 'alteração não salva', 'alterações não salvas')}`)}<span class="row">${ui.btn({ rotulo: 'Descartar', sm: true, attrs: { 'data-m-pm-descartar': '' } })}${ui.btn({ rotulo: 'Salvar permissões', sm: true, tipo: 'pri', icone: 'check', attrs: { 'data-m-pm-salvar': '' } })}</span></div>`
    : '';

  const matriz = ui.card({
    pad: false, cls: 'm-pm-card', titulo: 'Matriz de permissões', sub: difPadrao ? `${fmt.plural(difPadrao, 'célula diferente', 'células diferentes')} do padrão` : 'Igual ao padrão',
    ajuda: 'Ver: só leitura. Editar: cria e altera. Total: também exclui e configura o módulo. "(seus)" limita aos clientes sob responsabilidade da pessoa; "(próprio)" só ao próprio perfil. Cada pessoa vê as próprias permissões (só leitura) na aba Acesso do perfil em Equipe. A matriz protege os dados no servidor (RLS).',
    acoes: pode ? ui.btn({ rotulo: 'Restaurar padrão', icone: 'refresh', sm: true, tipo: 'ghost', attrs: { 'data-m-pm-padrao': '' }, disabled: !difPadrao && !mudou.length }) : '',
    corpo: `${barra}<div class="tbl-w m-pm-w" data-mobile="scroll"><table class="tbl m-pm" aria-label="Permissões por papel e módulo"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>
<p class="m-pm-leg mut sm"><span><i class="m-pm-sw n0"></i>Sem acesso</span><span><i class="m-pm-sw n1"></i>Ver</span><span><i class="m-pm-sw n2"></i>Editar</span><span><i class="m-pm-sw n4"></i>Total</span></p>`,
  });

  const itens = menuDoPapel(m, foco);
  const previa = ui.card({
    titulo: 'O que este papel vê', sub: mudou.length ? 'Inclui alterações ainda não salvas' : `${fmt.plural(contagem(foco), 'pessoa', 'pessoas')} com este papel`,
    corpo: `<label class="m-adm-sel m-pm-foco"><span class="sr">Papel</span><select data-m-pm-foco aria-label="Papel para pré-visualizar">${papeis.map(p => `<option value="${p}"${p === foco ? ' selected' : ''}>${esc(perms.rotuloPapel(p))}</option>`).join('')}</select></label>
<p class="mut sm m-pm-desc">${esc(perms.PAPEIS[foco].desc)}</p>
${itens.length ? `<ul class="m-pm-menu">${itens.map(i => `<li>${ui.ic(i.icone || 'grid')}<span><b>${esc(i.titulo)}</b>${i.sub ? i.sub.map(s => `<small>${esc(s)}</small>`).join('') : `<small>${esc(i.nivel)}</small>`}</span></li>`).join('')}</ul>` : ui.vazio({ compacto: true, icone: 'lock', titulo: 'Nenhum módulo visível', texto: 'Com esta configuração a pessoa só vê a tela de acesso negado. Dê ao menos "Ver" em Notificações.' })}`,
  });

  const papeisCard = ui.card({
    titulo: 'Papéis', sub: 'Quem é cada um',
    corpo: `<ul class="m-pm-pap">${papeis.map(p => `<li><div class="between row"><b>${esc(perms.rotuloPapel(p))}</b><a class="sm" href="#/admin/usuarios?papel=${p}">${fmt.plural(contagem(p), 'pessoa', 'pessoas')}</a></div><p class="mut sm">${esc(perms.PAPEIS[p].desc)}</p></li>`).join('')}</ul>`,
  });

  return `${matriz}<div class="g2 m-pm-g">${previa}${papeisCard}</div>`;
}

export function mount(el, ctx) {
  const { perms, ui, router } = ctx;
  const onChange = e => {
    const s = e.target.closest('[data-m-pm]');
    if (s) {
      const [mod, p] = s.dataset.mPm.split('|');
      rascunho = rascunho || JSON.parse(JSON.stringify(perms.matriz()));
      rascunho[mod] = Object.assign({}, rascunho[mod], { [p]: s.value });
      ctx.refresh(); return;
    }
    const fo = e.target.closest('[data-m-pm-foco]');
    if (fo) router.setQuery({ papel: fo.value }, { render: true });
  };
  const onClick = async e => {
    if (e.target.closest('[data-m-pm-descartar]')) { rascunho = null; ctx.refresh(); ui.toast('Alterações descartadas.', { tipo: 'info' }); return; }
    if (e.target.closest('[data-m-pm-salvar]')) {
      const antes = ctx.db.config('perms', {});
      const novo = rascunho || perms.matriz();
      if (!(novo.notificacoes || {}).dono || !(novo.admin || {}).dono) { ui.toast('O Dono precisa manter acesso à Administração e às Notificações.', { tipo: 'err' }); return; }
      const semNada = perms.PAPEIS_ORDEM.filter(p => ctx.db.count('users', u => u.papel === p && u.ativo !== false) && !perms.MODULOS_PERM.some(m => (novo[m.id] || {})[p]));
      if (semNada.length) {
        const ok = await ui.confirmar(`${semNada.map(perms.rotuloPapel).join(', ')} ficará sem nenhum módulo visível. Quem tem esse papel verá só "acesso negado".`, { titulo: 'Salvar mesmo assim?', confirmar: 'Salvar' });
        if (!ok) return;
      }
      // grava só o que difere do padrão (a matriz efetiva = padrão + diferenças)
      const dif = {};
      for (const mod of Object.keys(novo)) for (const p of Object.keys(novo[mod])) if ((perms.MATRIZ_PADRAO[mod] || {})[p] !== novo[mod][p]) (dif[mod] || (dif[mod] = {}))[p] = novo[mod][p];
      perms.salvarMatriz(dif);
      rascunho = null;
      ctx.notify.enviar({ para: ctx.db.list('users', u => u.ativo !== false && ['dono', 'admin'].includes(u.papel) && u.id !== ctx.real.id).map(u => u.id), tipo: 'sistema', titulo: `${ctx.real.nome} alterou as permissões`, texto: 'A matriz de papéis × módulos foi atualizada. Confira em Administração › Permissões.', link: '#/admin/permissoes' });
      ui.toast('Permissões salvas. Já valem para todos.', { desfazer: () => perms.salvarMatriz(antes, { log: 'desfez alteração de permissões' }) });
      return;
    }
    if (e.target.closest('[data-m-pm-padrao]')) {
      const ok = await ui.confirmar('Todas as células voltam aos valores do plano (PLAN §5). Alterações salvas e não salvas serão perdidas.', { titulo: 'Restaurar permissões padrão?', confirmar: 'Restaurar padrão' });
      if (!ok) return;
      const antes = ctx.db.config('perms', {});
      rascunho = null; perms.restaurarPadrao();
      ui.toast('Permissões padrão restauradas.', { desfazer: () => perms.salvarMatriz(antes, { log: 'desfez restauração de permissões' }) });
    }
  };
  el.addEventListener('change', onChange); el.addEventListener('click', onClick);
  return () => { el.removeEventListener('change', onChange); el.removeEventListener('click', onClick); };
}
export function descartarRascunho() { rascunho = null; }
