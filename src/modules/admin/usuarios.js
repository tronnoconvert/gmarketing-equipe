// Administração › Usuários — logins, papéis, convites, ativar/desativar, redefinir senha e "ver como".
import { gerarSenha, copiar } from './comum.js';
import { auth } from '../../core/auth.js';

const CORES = ['#0B6BE8', '#7C5CFC', '#0E9F6E', '#D9467A', '#C2700A', '#0891B2', '#4F46E5', '#B45309', '#047857', '#475569'];
const ADMINS = ['dono', 'admin'];

function slug(nome) { return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/)[0].replace(/[^a-z0-9]/g, '') || 'usuario'; }
function novoUserId(db, nome) { const b = `u-${slug(nome)}`; let id = b, i = 2; while (db.get('users', id)) id = `${b}${i++}`; return id; }
const donosAtivos = db => db.list('users', u => u.ativo !== false && u.papel === 'dono');

export function statusUser(u, ui) {
  if (u.ativo === false) return ui.led('off', 'Inativo');
  if (u.senhaTemporaria) return ui.led('warn', 'Senha temporária');
  return ui.led('ok', 'Ativo');
}
function statusInvite(i, fmt) {
  const exp = i.status === 'expirado' || (i.status === 'pendente' && i.expiraEm && new Date(i.expiraEm) < new Date());
  return exp ? ['err', 'Expirado'] : ['warn', `Pendente · expira ${fmt.rel(i.expiraEm)}`];
}
export const convitesAbertos = db => db.list('invites', i => i.status === 'pendente' || i.status === 'expirado');

export function render(ctx) {
  const { ui, fmt, db, perms, query } = ctx; const esc = fmt.esc;
  const me = ctx.real;
  const todos = db.list('users').sort((a, b) => (a.ativo === false) - (b.ativo === false) || perms.PAPEIS_ORDEM.indexOf(a.papel) - perms.PAPEIS_ORDEM.indexOf(b.papel) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const ativos = todos.filter(u => u.ativo !== false), inativos = todos.filter(u => u.ativo === false);
  const convites = convitesAbertos(db);
  const exp = convites.filter(i => statusInvite(i, fmt)[0] === 'err');
  const semana = ativos.filter(u => u.ultimoAcesso && Date.now() - new Date(u.ultimoAcesso) < 7 * 864e5).length;
  const f = query.f || '';
  const papel = query.papel || '';
  const pode = ctx.can('admin', 'editar');

  let linhas = f === 'ativos' ? ativos : f === 'inativos' ? inativos : todos;
  if (papel) linhas = linhas.filter(u => u.papel === papel);

  const kpis = `<div class="g-kpi m-adm-kpis">
${ui.kpi({ rotulo: 'Usuários ativos', valor: String(ativos.length), comp: `de ${todos.length} cadastrados`, ajuda: 'Pessoas que conseguem entrar no app agora.' })}
${ui.kpi({ rotulo: 'Acessaram em 7 dias', valor: String(semana), comp: `${fmt.pct(ativos.length ? (semana / ativos.length) * 100 : 0, 0)} dos ativos`, ajuda: 'Usuários ativos com último acesso nos últimos 7 dias.' })}
${ui.kpi({ rotulo: 'Convites em aberto', valor: String(convites.length), comp: exp.length ? `${exp.length} expirado${exp.length > 1 ? 's' : ''}` : 'nenhum expirado', led: exp.length ? 'warn' : undefined, ajuda: 'Convites enviados que ainda não viraram acesso. Convites expiram em 7 dias; reenvie se preciso.' })}
${ui.kpi({ rotulo: 'Com 2FA', valor: '0', comp: `de ${ativos.filter(u => ADMINS.includes(u.papel)).length} administradores`, led: 'warn', ajuda: 'Verificação em duas etapas (MFA) do Supabase Auth. Recomendado para Dono e Administração antes de ir para produção.' })}
</div>`;

  const chips = ui.chips([
    { id: '', rotulo: 'Todos', n: todos.length }, { id: 'ativos', rotulo: 'Ativos', n: ativos.length },
    { id: 'inativos', rotulo: 'Inativos', n: inativos.length }, { id: 'convites', rotulo: 'Convites', n: convites.length, estado: exp.length ? 'warn' : undefined },
  ], f, 'f');
  const selPapel = `<label class="m-adm-sel"><span class="sr">Filtrar por papel</span><select data-m-adm-papel aria-label="Filtrar por papel"><option value="">Todos os papéis</option>${perms.PAPEIS_ORDEM.map(p => `<option value="${p}"${p === papel ? ' selected' : ''}>${esc(perms.rotuloPapel(p))}</option>`).join('')}</select></label>`;
  const busca = `<label class="m-adm-q">${ui.ic('search')}<input type="search" data-m-adm-q value="${esc(query.q || '')}" placeholder="Buscar nome ou e-mail" aria-label="Buscar usuário"></label>`;

  const tabela = ui.tabela({
    legenda: 'Usuários', ordem: null, mobile: 'cards',
    cols: [
      { k: 'nome', l: 'Usuário', r: u => `<span class="m-adm-pess">${ui.avatar(u, 30)}<span><b>${esc(u.nome)}</b>${u.id === me.id ? ' <span class="mut sm">(você)</span>' : ''}<span class="sub">${esc(u.email)}</span></span></span>` },
      { k: 'papel', l: 'Papel', v: u => perms.rotuloPapel(u.papel), r: u => `<span class="fw6">${esc(perms.rotuloPapel(u.papel))}</span>` },
      { k: 'teamId', l: 'Colaborador', mobile: false, v: u => (db.get('team', u.teamId) || {}).nome || '', r: u => { const t = u.teamId && db.get('team', u.teamId); return t ? `<a href="#/admin/equipe?editar=${esc(t.id)}" data-m-adm-link>${esc(t.cargo || t.nome)}</a><span class="sub">${esc(t.area || '')}</span>` : '<span class="mut">Não vinculado</span>'; } },
      { k: 'ativo', l: 'Status', v: u => (u.ativo === false ? 'b' : 'a'), r: u => statusUser(u, ui) },
      { k: 'ultimoAcesso', l: 'Último acesso', v: u => u.ultimoAcesso || '', r: u => (u.ultimoAcesso ? ui.rel(u.ultimoAcesso) : '<span class="mut">Nunca</span>') },
      { k: 'mfa', l: '2FA', sort: false, mobile: false, r: () => `<span class="mut sm" data-tip="Disponível com o Supabase Auth (MFA). Veja docs/DEPLOY.md.">Não ativado</span>` },
      { k: 'acoes', l: '', sort: false, w: '52px', cls: 'm-adm-ac', r: u => (pode ? ui.btnIc('more', `Ações para ${u.nome}`, { 'data-m-adm-menu': u.id }) : '') },
    ],
    linhas: f === 'convites' ? [] : linhas,
    vazio: f === 'convites' ? { titulo: 'Veja os convites abaixo', texto: 'Esta visão mostra só os convites em aberto.' } : { icone: 'users', titulo: 'Nenhum usuário neste filtro', texto: 'Mude o filtro ou convide alguém.', acao: pode ? { rotulo: 'Convidar usuário', icone: 'user-plus', attrs: { 'data-m-adm-convidar': '' } } : null },
  });

  const convCard = convites.length || f === 'convites' ? ui.card({
    titulo: 'Convites em aberto', sub: 'Expiram 7 dias após o envio', pad: false, ajuda: 'O acesso é criado na hora com uma senha provisória (sem e-mail). "Reenviar" gera uma senha provisória nova.',
    corpo: ui.tabela({
      legenda: 'Convites', cols: [
        { k: 'nome', l: 'Pessoa', r: i => `<b>${esc(i.nome)}</b><span class="sub">${esc(i.email)}</span>` },
        { k: 'papel', l: 'Papel', r: i => esc(perms.rotuloPapel(i.papel)) },
        { k: 'enviadoEm', l: 'Enviado', r: i => `${ui.rel(i.enviadoEm)}<span class="sub">por ${esc((db.get('users', i.enviadoPor) || {}).nome || '—')}${i.reenvios ? ` · reenviado ${i.reenvios}×` : ''}</span>` },
        { k: 'status', l: 'Status', sort: false, r: i => { const [e, t] = statusInvite(i, fmt); return ui.led(e, t); } },
        { k: 'acoes', l: '', sort: false, cls: 'm-adm-ac2', r: i => (pode ? `<span class="row m-adm-ib">${ui.btn({ rotulo: 'Reenviar', sm: true, attrs: { 'data-m-adm-reenviar': i.id } })}${ui.btn({ rotulo: 'Cancelar', sm: true, tipo: 'ghost', attrs: { 'data-m-adm-cancelar': i.id } })}</span>` : '') },
      ],
      linhas: convites, vazio: { icone: 'mail', titulo: 'Nenhum convite em aberto', texto: 'Convites enviados aparecem aqui até a pessoa criar a senha.' },
    }),
  }) : '';

  return `${kpis}
${ui.card({
    pad: false, cls: 'm-adm-users',
    titulo: 'Usuários e acessos', sub: `${fmt.plural(linhas.length, 'pessoa', 'pessoas')} no filtro`,
    acoes: pode ? ui.btn({ rotulo: 'Convidar usuário', icone: 'user-plus', tipo: 'pri', sm: true, attrs: { 'data-m-adm-convidar': '' } }) : '',
    corpo: `<div class="m-adm-bar">${chips}<div class="row m-adm-bar-r">${selPapel}${busca}</div></div>${tabela}`,
  })}
${convCard}`;
}

/* ---------------- ações ---------------- */
function menuAcoes(ctx, anc, u) {
  const { ui } = ctx;
  const eu = u.id === ctx.real.id;
  const it = (icn, txt, acao, o = {}) => `<button type="button" role="menuitem" class="pm-i${o.perigo ? ' m-adm-perigo' : ''}" data-m-adm-acao="${acao}"${o.dis ? ` disabled title="${ctx.fmt.esc(o.dis)}"` : ''}>${ui.ic(icn)}<span>${ctx.fmt.esc(txt)}</span></button>`;
  const html = `<div class="pm-l" role="menu" aria-label="Ações para ${ctx.fmt.esc(u.nome)}">
${it('shield', 'Editar papel', 'papel')}
${it('key', 'Redefinir senha', 'senha', { dis: u.ativo === false ? 'Reative o acesso antes de redefinir a senha.' : '' })}
${it('eye', 'Ver como esta pessoa', 'vercomo', { dis: eu ? 'Você já está vendo como você.' : u.ativo === false ? 'Usuário inativo.' : !auth.podeVerComo() ? 'Só Dono e Administração.' : '' })}
<div class="pm-sep" role="separator"></div>
${u.ativo === false ? it('refresh', 'Reativar acesso', 'reativar') : it('lock', 'Desativar acesso', 'desativar', { perigo: true, dis: eu ? 'Você não pode desativar o próprio acesso.' : '' })}</div>`;
  const pop = ui.popover(anc, html, { cls: 'pm', role: 'presentation', largura: 240 });
  // perto do rodapé da tela: abre para cima (o popover do core sempre abre para baixo)
  const r = anc.getBoundingClientRect(); const h = pop.el.scrollHeight;
  if (r.bottom + 8 + h > innerHeight - 8 && r.top - 8 - h > 8) { pop.el.style.maxHeight = 'none'; pop.el.style.top = `${r.top - 8 - h}px`; }
  pop.el.addEventListener('click', e => {
    const b = e.target.closest('[data-m-adm-acao]'); if (!b || b.disabled) return;
    pop.fechar();
    const a = b.dataset.mAdmAcao;
    if (a === 'papel') editarPapel(ctx, u.id);
    else if (a === 'senha') redefinirSenha(ctx, u.id);
    else if (a === 'vercomo') verComo(ctx, u.id);
    else if (a === 'desativar') desativar(ctx, u.id);
    else if (a === 'reativar') reativar(ctx, u.id);
  });
  const f = pop.el.querySelector('button:not([disabled])'); f && f.focus();
}

function verComo(ctx, id) {
  const { ui } = ctx;
  if (auth.verComo(id)) ui.toast(`Agora você vê o app como ${auth.user().nome}. Use "Voltar" no topo para sair.`, { tipo: 'info' });
}

async function editarPapel(ctx, id) {
  const { ui, db, perms, fmt, notify } = ctx; const esc = fmt.esc;
  const u = db.get('users', id); if (!u) return;
  const eu = u.id === ctx.real.id;
  const modsVisiveis = p => perms.MODULOS_PERM.filter(m => (perms.matriz()[m.id] || {})[p]).map(m => m.rotulo);
  const corpo = `<form class="m-adm-papeis" novalidate><fieldset class="fld"><legend>Papel de ${esc(u.nome)}</legend>
${perms.PAPEIS_ORDEM.map(p => `<label class="m-adm-pp"><input type="radio" name="papel" value="${p}"${p === u.papel ? ' checked' : ''}><span><b>${esc(perms.rotuloPapel(p))}</b><small>${esc(perms.PAPEIS[p].desc)}</small><small class="m-adm-pp-m">Vê: ${esc(modsVisiveis(p).join(', ') || 'nenhum módulo')}</small></span></label>`).join('')}
</fieldset>${eu ? ui.aviso({ tipo: 'warn', titulo: 'Você está alterando o seu próprio papel.', texto: 'Se reduzir o acesso, pode perder a Administração e precisará que outra pessoa devolva.' }) : ''}</form>`;
  let novo = null;
  const ok = await ui.modal({
    titulo: 'Editar papel', sub: u.email, corpo, largura: 'md', confirmar: 'Salvar papel',
    onConfirmar: box => {
      novo = (box.querySelector('[name="papel"]:checked') || {}).value;
      if (!novo || novo === u.papel) return 'Escolha um papel diferente do atual ou clique em Cancelar.';
      if (u.papel === 'dono' && u.ativo !== false && donosAtivos(db).length <= 1) return 'Esta é a única pessoa com papel Dono. Promova outra pessoa a Dono antes de mudar este papel.';
      return true;
    },
  });
  if (!ok) return;
  if (eu && ADMINS.includes(u.papel) && !ADMINS.includes(novo)) {
    const c = await ui.confirmar(`Você vai deixar de ser ${perms.rotuloPapel(u.papel)} e perderá o acesso à Administração imediatamente.`, { titulo: 'Rebaixar o seu próprio papel?', confirmar: 'Sim, alterar meu papel' });
    if (!c) { ui.toast('Nada foi alterado.', { tipo: 'info' }); return; }
  }
  const antes = u.papel;
  db.batch(() => {
    db.update('users', id, { papel: novo }, { log: `alterou o papel de ${u.nome}: ${perms.rotuloPapel(antes)} → ${perms.rotuloPapel(novo)}` });
    if (u.teamId && db.get('team', u.teamId)) db.update('team', u.teamId, { papel: novo });
  });
  if (!eu) notify.enviar({ para: [id], tipo: 'sistema', titulo: `Seu papel mudou para ${perms.rotuloPapel(novo)}`, texto: `Alterado por ${ctx.real.nome}. Seus menus e permissões já foram atualizados.`, link: '#/' });
  ctx.refresh();
  ui.toast(`${u.nome} agora é ${perms.rotuloPapel(novo)}.`, { desfazer: () => db.batch(() => { db.update('users', id, { papel: antes }, { log: `desfez alteração de papel de ${u.nome}` }); if (u.teamId && db.get('team', u.teamId)) db.update('team', u.teamId, { papel: antes }); }) });
}

async function desativar(ctx, id) {
  const { ui, db } = ctx;
  const u = db.get('users', id); if (!u) return;
  if (id === ctx.real.id) { ui.toast('Você não pode desativar o próprio acesso.', { tipo: 'warn' }); return; }
  if (u.papel === 'dono' && donosAtivos(db).length <= 1) { ui.toast('Não é possível desativar o único Dono ativo.', { tipo: 'err' }); return; }
  const ok = await ui.confirmar(`${u.nome} não conseguirá mais entrar no Gmarketing. Os dados, comentários e histórico dessa pessoa continuam salvos.`, { titulo: `Desativar o acesso de ${u.nome}?`, confirmar: 'Desativar acesso' });
  if (!ok) return;
  if (db.mode === 'supabase') { if (!(await ativoServidor(ctx, id, false))) return; }
  setTimeout(() => ctx.refresh(), 0);
  db.update('users', id, { ativo: false, desativadoEm: new Date().toISOString() }, { log: `desativou o acesso de ${u.nome}` });
  ui.toast(`Acesso de ${u.nome} desativado.`, { desfazer: () => db.update('users', id, { ativo: true }, { log: `reativou o acesso de ${u.nome}` }) });
}
/** produção: bloqueia/libera também o login no Supabase Auth (Edge Function admin-invite) */
async function ativoServidor(ctx, id, ativo) {
  const { data, error } = await ctx.db.supabase.functions.invoke('admin-invite', { body: { acao: 'definir_ativo', userId: id, ativo } });
  if (error || (data && data.erro)) { ctx.ui.toast(`Não foi possível ${ativo ? 'reativar' : 'desativar'} no servidor: ${(data && data.erro) || error.message}`, { tipo: 'err' }); return false; }
  return true;
}
async function reativar(ctx, id) {
  const { ui, db } = ctx;
  const u = db.get('users', id); if (!u) return;
  if (db.mode === 'supabase' && !(await ativoServidor(ctx, id, true))) return;
  db.update('users', id, { ativo: true, desativadoEm: null }, { log: `reativou o acesso de ${u.nome}` });
  ui.toast(`Acesso de ${u.nome} reativado.`, { desfazer: () => db.update('users', id, { ativo: false }, { log: `desativou o acesso de ${u.nome}` }) });
}

function modalSenha(ctx, u, senha, titulo) {
  const { ui, fmt } = ctx; const esc = fmt.esc;
  return ui.modal({
    titulo, sub: `${u.nome} · ${u.email}`, confirmar: 'Já anotei', cancelar: false, largura: 'sm',
    corpo: `<div class="stack">
<p class="mb-txt">Senha provisória de <b>${esc(u.email)}</b> (mostrada só agora):</p>
<div class="m-adm-senha"><code data-m-adm-senha>${esc(senha)}</code>${ui.btn({ rotulo: 'Copiar', icone: 'copy', sm: true, attrs: { 'data-m-adm-copiar': '' } })}</div>
${ui.aviso({ tipo: 'warn', titulo: 'Envie por WhatsApp para a pessoa (mensagem privada).', texto: 'Depois de fechar esta janela a senha não aparece mais. No primeiro acesso o app obriga a pessoa a criar a própria senha (mínimo 10 caracteres).' })}
</div>`,
    onAbrir: el => el.querySelector('[data-m-adm-copiar]').addEventListener('click', () => copiar(senha, 'Senha copiada.')),
  });
}

async function redefinirSenha(ctx, id) {
  const { ui, db } = ctx;
  const u = db.get('users', id); if (!u) return;
  if (db.mode === 'supabase') {
    const ok = await ui.confirmar(`A senha atual de ${u.nome} deixa de funcionar e uma senha provisória é gerada. Você envia para a pessoa (WhatsApp) e ela cria a senha nova no próximo acesso.`, { titulo: 'Gerar senha provisória?', confirmar: 'Gerar senha provisória' });
    if (!ok) return;
    const { data, error } = await db.supabase.functions.invoke('admin-invite', { body: { acao: 'redefinir_senha', userId: id } });
    if (error || !data || data.erro || !data.senha) { ui.toast(`Não foi possível gerar a senha: ${(data && data.erro) || (error && error.message) || 'erro no servidor'}`, { tipo: 'err' }); return; }
    await modalSenha(ctx, u, data.senha, 'Senha provisória gerada');
    try { await db.reload(); } catch (e) { /* o realtime traz depois */ }
    ctx.refresh();
    return;
  }
  const ok = await ui.confirmar(`A senha atual de ${u.nome} deixa de funcionar e uma senha temporária é gerada.`, { titulo: 'Redefinir senha?', confirmar: 'Gerar senha temporária' });
  if (!ok) return;
  const senha = gerarSenha();
  db.update('users', id, { senha, senhaTemporaria: true }, { log: `redefiniu a senha de ${u.nome}` });
  await modalSenha(ctx, u, senha, 'Nova senha gerada');
}

export async function convidar(ctx, pre = {}) {
  const { ui, db, perms, fmt } = ctx; const esc = fmt.esc;
  const livres = db.list('team', t => t.ativo !== false && !(t.userId && db.get('users', t.userId))).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const corpo = `<form class="stack" novalidate><div class="fgrid">
${ui.campo({ nome: 'nome', rotulo: 'Nome completo', obrigatorio: true, valor: pre.nome || '', placeholder: 'Ex.: Joana Ribeiro' })}
${ui.campo({ nome: 'email', rotulo: 'E-mail de trabalho', tipo: 'email', obrigatorio: true, valor: pre.email || '', placeholder: 'nome@agencia.com.br' })}
${ui.campo({ nome: 'papel', rotulo: 'Papel', tipo: 'select', obrigatorio: true, valor: pre.papel || '', placeholder: 'Escolha…', opcoes: perms.PAPEIS_ORDEM.map(p => ({ v: p, l: perms.rotuloPapel(p) })), dica: 'Define o que a pessoa vê e edita. Dá para mudar depois.' })}
${ui.campo({ nome: 'teamId', rotulo: 'Vincular a colaborador da equipe', tipo: 'select', valor: pre.teamId || '', placeholder: 'Não vincular agora', opcoes: livres.map(t => ({ v: t.id, l: `${t.nome} · ${t.cargo || t.area || ''}` })), dica: 'Liga o login ao cadastro da equipe (clientes, horas, ocupação).' })}
</div><p class="mut sm m-adm-pdesc" data-m-adm-pdesc></p>
${ui.aviso({ tipo: 'info', texto: db.mode === 'supabase' ? 'O acesso é criado na hora com uma senha provisória, mostrada uma única vez para você enviar à pessoa (WhatsApp). No primeiro acesso ela cria a própria senha. Nenhum e-mail é enviado.' : 'Modo demonstração: o acesso é criado na hora com uma senha temporária, mostrada uma única vez.' })}</form>`;
  let criado = null;
  const ok = await ui.modal({
    titulo: 'Convidar usuário', corpo, confirmar: 'Criar acesso', largura: 'md',
    onAbrir: el => {
      const f = el.querySelector('form'); const pd = el.querySelector('[data-m-adm-pdesc]');
      const desc = () => { const p = f.papel.value; pd.textContent = p ? `${perms.rotuloPapel(p)}: ${perms.PAPEIS[p].desc}` : ''; };
      f.papel.addEventListener('change', desc); desc();
      f.teamId.addEventListener('change', () => {
        const t = db.get('team', f.teamId.value); if (!t) return;
        if (!f.nome.value.trim()) f.nome.value = t.nome;
        if (!f.email.value.trim() && t.email) f.email.value = t.email;
        if (!f.papel.value && t.papel) { f.papel.value = t.papel; desc(); }
      });
    },
    onConfirmar: async el => {
      const f = el.querySelector('form');
      const emailNorm = v => String(v || '').trim().toLowerCase();
      const r = ui.form.validar(f, {
        nome: ['obrigatorio', 'min:3', 'max:80', v => (/\s/.test(String(v).trim()) ? '' : 'Informe nome e sobrenome.')],
        email: ['obrigatorio', v => (db.find('users', u => emailNorm(u.email) === emailNorm(v)) ? 'Já existe um usuário com este e-mail.' : ''), v => (db.find('invites', i => i.status === 'pendente' && emailNorm(i.email) === emailNorm(v)) ? 'Já há um convite pendente para este e-mail. Reenvie na lista de convites.' : '')],
        papel: 'obrigatorio',
      });
      if (!r.ok) return false;
      const d = r.dados; d.email = emailNorm(d.email);
      if (db.mode === 'supabase') {
        const { data, error } = await db.supabase.functions.invoke('admin-invite', { body: { acao: 'convidar', nome: d.nome.trim(), email: d.email, papel: d.papel, teamId: d.teamId || null } });
        if (error || !data || data.erro || !data.senha) return `Não foi possível criar o acesso: ${(data && data.erro) || (error && error.message) || 'erro no servidor'}. Tente de novo ou verifique as Edge Functions.`;
        criado = { servidor: true, senha: data.senha, u: { id: data.userId, nome: d.nome.trim(), email: d.email, papel: d.papel } };
        return true;
      }
      const t = d.teamId ? db.get('team', d.teamId) : null;
      const senha = gerarSenha();
      const id = novoUserId(db, d.nome);
      db.batch(() => {
        const u = db.insert('users', { id, nome: d.nome.trim(), iniciais: fmt.iniciais(d.nome), email: d.email, papel: d.papel, teamId: t ? t.id : null, avatarCor: t ? t.avatarCor : CORES[db.count('users') % CORES.length], cargo: t ? t.cargo : perms.rotuloPapel(d.papel), ativo: true, senha, senhaTemporaria: true, ultimoAcesso: null, convidadoPor: ctx.real.id }, { log: `convidou ${d.nome.trim()} (${perms.rotuloPapel(d.papel)})` });
        if (t) db.update('team', t.id, { userId: u.id, papel: d.papel });
        db.insert('invites', { nome: u.nome, email: u.email, papel: u.papel, teamId: u.teamId, status: 'aceito', enviadoEm: new Date().toISOString(), enviadoPor: ctx.real.id, aceitoEm: new Date().toISOString(), userId: u.id, modo: 'senha_temporaria' });
        criado = { u, senha };
      });
      return true;
    },
  });
  if (!ok || !criado) return;
  if (criado.servidor) {
    await modalSenha(ctx, criado.u, criado.senha, 'Acesso criado');
    try { await db.reload(); } catch (e) { /* o realtime traz depois */ }
    ctx.refresh();
    ui.toast(`${criado.u.nome} já pode entrar com ${criado.u.email} e a senha provisória.`);
    return;
  }
  ctx.notify.enviar({ para: [criado.u.id], tipo: 'sistema', titulo: 'Bem-vindo ao Gmarketing', texto: `${ctx.real.nome} criou seu acesso como ${perms.rotuloPapel(criado.u.papel)}. Troque a senha temporária no primeiro acesso.`, link: '#/notificacoes' });
  await modalSenha(ctx, criado.u, criado.senha, 'Acesso criado');
  ctx.refresh();
  ui.toast(`${criado.u.nome} já pode entrar com ${criado.u.email}.`, { desfazer: () => db.batch(() => { db.remove('users', criado.u.id, { log: `desfez o convite de ${criado.u.nome}` }); if (criado.u.teamId) db.update('team', criado.u.teamId, { userId: null }); }) });
}

async function reenviar(ctx, id) {
  const { db, ui } = ctx;
  const i = db.get('invites', id); if (!i) return;
  if (db.mode === 'supabase') {
    const { data, error } = await db.supabase.functions.invoke('admin-invite', { body: { acao: 'reenviar', email: i.email, inviteId: i.id } });
    if (error || !data || data.erro || !data.senha) { ui.toast(`Não foi possível gerar a senha: ${(data && data.erro) || (error && error.message) || 'erro no servidor'}`, { tipo: 'err' }); return; }
    await modalSenha(ctx, { nome: i.nome, email: i.email }, data.senha, 'Senha provisória gerada');
    try { await db.reload(); } catch (e) { /* o realtime traz depois */ }
    ctx.refresh();
    return;
  }
  const antes = { ...i };
  db.update('invites', id, { status: 'pendente', enviadoEm: new Date().toISOString(), expiraEm: new Date(Date.now() + 7 * 864e5).toISOString(), reenvios: (i.reenvios || 0) + 1, enviadoPor: ctx.real.id }, { log: `reenviou o convite de ${i.nome}` });
  ui.toast(`Convite reenviado para ${i.email}${db.mode === 'demo' ? ' (simulado)' : ''}. Vale por mais 7 dias.`, { desfazer: () => db.insert('invites', antes) });
}
async function cancelarConvite(ctx, id) {
  const { db, ui } = ctx;
  const i = db.get('invites', id); if (!i) return;
  const ok = await ui.confirmar(`O link enviado para ${i.email} deixa de funcionar.`, { titulo: `Cancelar o convite de ${i.nome}?`, confirmar: 'Cancelar convite', cancelar: 'Voltar' });
  if (!ok) return;
  setTimeout(() => ctx.refresh(), 0);
  db.update('invites', id, { status: 'cancelado', canceladoEm: new Date().toISOString() }, { log: `cancelou o convite de ${i.nome}` });
  ui.toast('Convite cancelado.', { desfazer: () => db.update('invites', id, { status: i.status }) });
}

export function mount(el, ctx) {
  const { db, router, fmt } = ctx;
  const filtrar = () => {
    const inp = el.querySelector('[data-m-adm-q]'); if (!inp) return;
    const q = fmt.norm(inp.value.trim());
    el.querySelectorAll('.m-adm-users tbody tr').forEach(tr => { tr.hidden = !!q && !fmt.norm(tr.textContent).includes(q); });
  };
  filtrar();
  let tm;
  const onInput = e => { if (e.target.matches('[data-m-adm-q]')) { filtrar(); clearTimeout(tm); tm = setTimeout(() => router.setQuery({ q: e.target.value.trim() || null }), 300); } };
  const onChange = e => { if (e.target.matches('[data-m-adm-papel]')) router.setQuery({ papel: e.target.value || null }, { render: true }); };
  const onClick = e => {
    const m = e.target.closest('[data-m-adm-menu]');
    if (m) { e.stopPropagation(); const u = db.get('users', m.dataset.mAdmMenu); if (u) menuAcoes(ctx, m, u); return; }
    if (e.target.closest('[data-m-adm-convidar]')) { convidar(ctx); return; }
    const r = e.target.closest('[data-m-adm-reenviar]'); if (r) { reenviar(ctx, r.dataset.mAdmReenviar); return; }
    const c = e.target.closest('[data-m-adm-cancelar]'); if (c) { cancelarConvite(ctx, c.dataset.mAdmCancelar); }
  };
  el.addEventListener('input', onInput); el.addEventListener('change', onChange); el.addEventListener('click', onClick);
  return () => { clearTimeout(tm); el.removeEventListener('input', onInput); el.removeEventListener('change', onChange); el.removeEventListener('click', onClick); };
}
