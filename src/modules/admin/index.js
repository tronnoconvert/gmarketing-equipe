// Administração — usuários, equipe, permissões, integrações, preferências de notificação e auditoria.
import './data.js';
import { db } from '../../core/store.js';
import { auth } from '../../core/auth.js';
import { norm } from '../../core/fmt.js';
import * as usuarios from './usuarios.js';
import * as equipe from './equipe.js';
import * as permissoes from './permissoes.js';
import * as integracoes from './integracoes.js';
import * as auditoria from './auditoria.js';
import { formPrefsHtml, lerFormPrefs, salvarPrefs, restaurarPrefs, lerPrefs } from '../notificacoes/prefs.js';

const prefsTab = {
  render(ctx) {
    const { ui, fmt, db: d, query, perms } = ctx; const esc = fmt.esc;
    const us = d.list('users', u => u.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const alvo = d.get('users', query.pessoa) || d.get('users', ctx.real.id);
    const p = lerPrefs(alvo.id);
    const lista = `<ul class="m-pf-l">${us.map(u => { const x = lerPrefs(u.id); return `<li><a href="${esc(ctx.router.href('admin/notificacoes', { pessoa: u.id }))}"${u.id === alvo.id ? ' aria-current="true"' : ''}>${ui.avatar(u, 26)}<span><b>${esc(u.nome)}</b><small>${x.salvo ? 'Personalizado' : 'Padrão do papel'} · ${esc(perms.rotuloPapel(u.papel))}</small></span></a></li>`; }).join('')}</ul>`;
    return `<div class="m-pf">
${ui.card({ titulo: 'Pessoas', sub: `${us.length} ativas`, pad: false, cls: 'm-pf-side', corpo: lista })}
${ui.card({ titulo: `Preferências de ${alvo.id === ctx.real.id ? 'você' : alvo.nome}`, sub: p.salvo ? `Atualizado ${fmt.rel(p.atualizadoEm)}` : 'Usando o padrão do papel', ajuda: 'Define quais eventos chegam por qual canal. App é a central de notificações; WhatsApp, e-mail e Slack são enviados pela Edge Function "notify" no servidor (simulados no modo demonstração).',
      acoes: p.salvo ? ui.btn({ rotulo: 'Voltar ao padrão', sm: true, tipo: 'ghost', attrs: { 'data-m-pf-padrao': alvo.id } }) : '',
      corpo: `<form class="m-pf-f" data-m-pf="${esc(alvo.id)}" novalidate>${formPrefsHtml(alvo.id)}<div class="row m-pf-a"><p class="mb-err" role="alert" hidden data-m-pf-err></p>${ui.btn({ rotulo: 'Salvar preferências', tipo: 'pri', icone: 'check', attrs: { 'data-m-pf-salvar': '' } })}</div></form>` })}
</div>`;
  },
  mount(el, ctx) {
    const onClick = e => {
      if (e.target.closest('[data-m-pf-salvar]')) {
        const f = el.querySelector('[data-m-pf]'); const err = el.querySelector('[data-m-pf-err]');
        const r = lerFormPrefs(f);
        if (!r.ok) { err.textContent = r.erro; err.hidden = false; return; }
        err.hidden = true;
        const uid = f.dataset.mPf; const u = ctx.db.get('users', uid);
        const antes = salvarPrefs(uid, r.prefs, { log: uid === ctx.real.id ? 'alterou as próprias preferências de notificação' : `alterou preferências de notificação de ${u.nome}` });
        if (uid !== ctx.real.id) ctx.notify.enviar({ para: [uid], tipo: 'sistema', titulo: 'Suas preferências de notificação mudaram', texto: `${ctx.real.nome} ajustou como você recebe notificações. Confira em Notificações.`, link: '#/notificacoes' });
        ctx.ui.toast('Preferências salvas.', { desfazer: () => restaurarPrefs(uid, antes) });
        return;
      }
      const pd = e.target.closest('[data-m-pf-padrao]');
      if (pd) { const uid = pd.dataset.mPfPadrao; const antes = ctx.db.config(`notif:${uid}`, null); restaurarPrefs(uid, null); ctx.ui.toast('Preferências voltaram ao padrão do papel.', { desfazer: () => restaurarPrefs(uid, antes) }); }
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  },
};

const ABAS = [
  { id: 'usuarios', rotulo: 'Usuários', mod: usuarios, n: () => db.count('users', u => u.ativo !== false) },
  { id: 'equipe', rotulo: 'Equipe', mod: equipe, n: () => db.count('team', t => t.ativo !== false) },
  { id: 'permissoes', rotulo: 'Permissões', mod: permissoes },
  { id: 'integracoes', rotulo: 'Integrações', mod: integracoes },
  { id: 'notificacoes', rotulo: 'Notificações', mod: prefsTab },
  { id: 'auditoria', rotulo: 'Auditoria', mod: auditoria },
];
const SUB = {
  usuarios: 'Quem entra no app, com qual papel. Convide, altere papéis e desative acessos.',
  equipe: 'Cadastro de colaboradores: cargo, custo/hora, horas contratadas, skills e gestor.',
  permissoes: 'O que cada papel vê e edita em cada módulo. Vale no app e no servidor.',
  integracoes: 'Status das chaves e serviços conectados no servidor.',
  notificacoes: 'Como cada pessoa recebe notificações: eventos, canais e horário de silêncio.',
  auditoria: 'Quem fez o quê e quando, com filtros e exportação.',
};
const abaDe = ctx => ABAS.find(a => a.id === ctx.params.aba) || ABAS[0];

export default {
  id: 'admin', titulo: 'Administração', icone: 'shield', grupo: 'sistema', rota: 'admin',
  routes: ['admin', 'admin/:aba'],
  watch: ['users', 'team', 'settings', 'invites', 'activity', 'clients', 'integrations'],
  render(ctx) {
    // rota antiga: o cadastro e a importação de clientes ficam só em Clientes
    if (ctx.params.aba === 'clientes') return `<div class="pg m-admin">${ctx.ui.card({ corpo: ctx.ui.vazio({ icone: 'building', titulo: 'Clientes mudaram de lugar', texto: 'Cadastro e importação por planilha agora ficam em Clientes. Levando você para lá…', acao: { rotulo: 'Abrir Clientes', href: '#/clientes', icone: 'arrow-right' } }) })}</div>`;
    const aba = abaDe(ctx);
    if (ctx.params.aba && !ABAS.some(a => a.id === ctx.params.aba)) return `<div class="pg">${ctx.ui.vazio({ icone: 'shield', titulo: 'Aba não encontrada', texto: 'Escolha uma das seções da Administração.', acao: { rotulo: 'Ir para Usuários', href: '#/admin/usuarios' } })}</div>`;
    ctx.migalha(aba.rotulo);
    const tabs = ctx.ui.tabs(ABAS.map(a => ({ id: a.id, rotulo: a.rotulo, n: a.n ? a.n() : undefined })), aba.id, 'admin');
    const modo = ctx.db.mode === 'demo' ? ctx.ui.led('warn', 'Modo demonstração: e-mails e chaves simulados') : ctx.ui.led('ok', 'Conectado ao servidor');
    const somenteVer = !ctx.can('admin', 'editar') ? ctx.ui.aviso({ tipo: 'info', texto: 'Você tem acesso só de leitura à Administração. Ações de edição ficam ocultas.' }) : '';
    return `<div class="pg m-admin">
${ctx.ui.cabecalho({ titulo: 'Administração', sub: SUB[aba.id], meta: modo })}
${tabs}${somenteVer}
<div class="m-adm-corpo stack">${aba.mod.render(ctx)}</div></div>`;
  },
  mount(el, ctx) {
    if (ctx.params.aba === 'clientes') { setTimeout(() => { if (ctx.router.path === 'admin/clientes') ctx.router.go('clientes', { replace: true }); }, 0); return undefined; }
    ctx._convidar = pre => usuarios.convidar(ctx, pre);
    const aba = abaDe(ctx);
    return aba.mod.mount ? aba.mod.mount(el, ctx) : undefined;
  },
  contador() {
    const r = auth.real(); if (!r || !['dono', 'admin'].includes(r.papel)) return null;
    const exp = usuarios.convitesAbertos(db).filter(i => i.status === 'expirado' || (i.expiraEm && new Date(i.expiraEm) < new Date())).length;
    return exp ? { n: exp, estado: 'warn', rotulo: `${exp} convite${exp > 1 ? 's' : ''} expirado${exp > 1 ? 's' : ''}` } : null;
  },
  busca(q) {
    const out = [];
    db.list('users').filter(u => norm(`${u.nome} ${u.email}`).includes(q)).slice(0, 4).forEach(u => out.push({ tipo: 'Usuários', titulo: u.nome, sub: `${u.email}${u.ativo === false ? ' · inativo' : ''}`, href: `#/admin/usuarios?q=${encodeURIComponent(u.nome)}`, icone: 'user', led: u.ativo === false ? 'off' : 'ok' }));
    ABAS.filter(a => norm(`${a.rotulo} ${SUB[a.id]}`).includes(q)).slice(0, 3).forEach(a => out.push({ tipo: 'Administração', titulo: `Administração › ${a.rotulo}`, sub: SUB[a.id], href: `#/admin/${a.id}`, icone: 'shield' }));
    return out;
  },
};
