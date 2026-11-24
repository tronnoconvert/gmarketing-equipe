// admin-invite — convites e administração de acessos (só Dono e Administração).
// Ações (POST JSON {acao, ...}):
//   convidar           {nome, email, papel, teamId?, redirectTo?}  → cria usuário no Auth (e-mail de convite), perfil e registro `users`
//   reenviar           {email, inviteId?, redirectTo?}             → reenvia o convite (ou link de acesso, se já confirmado)
//   definir_ativo      {userId: 'u-…', ativo: boolean}             → bloqueia/libera o login no Auth e no perfil
//   status_integracoes {}                                          → quais variáveis de ambiente existem (só true/false, nunca valores)
// Segurança: valida o JWT de quem chama, exige papel dono/admin e atua só na org de quem chama.
import { corpo, EMAIL_RE, env, HttpError, json, servir, texto } from '../_shared/http.ts';
import { adminClient, auditar, chamador, exigirPapel, gravar, listar, novoId, obter, PAPEIS, type Obj, type Papel } from '../_shared/supa.ts';
import { canaisConfigurados } from '../_shared/envio.ts';

const CORES = ['#0B6BE8', '#7C5CFC', '#0E9F6E', '#D9467A', '#C2700A', '#0891B2', '#4F46E5', '#B45309', '#047857', '#475569'];
const ENVS = ['WINDSOR_API_KEY', 'WINDSOR_ACCOUNT_ID', 'MONDAY_API_TOKEN', 'MONDAY_BOARD_IDS', 'META_ACCESS_TOKEN', 'META_APP_ID', 'META_APP_SECRET',
  'ZAPI_INSTANCE_ID', 'ZAPI_TOKEN', 'ZAPI_CLIENT_TOKEN', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'SLACK_WEBHOOK_URL', 'RESEND_API_KEY', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'CRON_SECRET', 'APP_URL'];

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/)[0].replace(/[^a-z0-9]/g, '') || 'usuario';
const iniciais = (n: string) => { const p = n.trim().split(/\s+/).filter((w) => !/^(da|de|do|das|dos|e)$/i.test(w)); return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
const redirecionar = (v: unknown) => { const s = typeof v === 'string' ? v : ''; return /^https:\/\//.test(s) ? s : env('APP_URL'); };

Deno.serve(servir(async (req) => {
  const c = await chamador(req);
  exigirPapel(c, ['dono', 'admin'], { somenteUsuario: true });
  const eu = c.perfil!; const org = eu.org_id;
  const meuUser = eu.app_user_id ? await obter(org, 'users', eu.app_user_id) : null;
  const quem = { id: eu.app_user_id, nome: String(meuUser?.nome ?? c.email ?? 'Administração') };
  const b = await corpo(req);
  const acao = texto(b.acao, 'acao', { obrigatorio: true });
  const sb = adminClient();

  if (acao === 'status_integracoes') {
    const status = Object.fromEntries(ENVS.map((k) => [k, !!env(k)]));
    return json({ status, canais: canaisConfigurados(), verificadoEm: new Date().toISOString() });
  }

  if (acao === 'convidar') {
    const nome = texto(b.nome, 'nome', { obrigatorio: true, min: 3, max: 80 });
    const email = texto(b.email, 'email', { obrigatorio: true, max: 160, re: EMAIL_RE }).toLowerCase();
    const papel = texto(b.papel, 'papel', { obrigatorio: true }) as Papel;
    if (!PAPEIS.includes(papel)) throw new HttpError(400, `Papel inválido. Use: ${PAPEIS.join(', ')}.`, 'validacao');
    if (papel === 'dono' && eu.papel !== 'dono') throw new HttpError(403, 'Só um Dono pode convidar outro Dono.', 'sem_permissao');
    const teamId = texto(b.teamId, 'teamId', { max: 60, re: /^[\w-]+$/ }) || null;

    const users = await listar(org, 'users');
    if (users.some((u) => String(u.email ?? '').toLowerCase() === email)) throw new HttpError(409, 'Já existe um usuário com este e-mail.', 'duplicado');
    const team = teamId ? await obter(org, 'team', teamId) : null;
    if (teamId && !team) throw new HttpError(400, 'Colaborador da equipe não encontrado.', 'validacao');

    const { data: inv, error: ie } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: redirecionar(b.redirectTo), data: { nome, org_id: org } });
    if (ie || !inv?.user) throw new HttpError(400, `Não foi possível convidar: ${ie?.message ?? 'erro no Auth'}.`, 'auth');
    const authId = inv.user.id;

    let id = `u-${slug(nome)}`; let n = 2; const ids = new Set(users.map((u) => u.id));
    while (ids.has(id)) id = `u-${slug(nome)}${n++}`;
    const { error: pe } = await sb.from('profiles').insert({ user_id: authId, org_id: org, papel, team_id: teamId, app_user_id: id, ativo: true });
    if (pe) { await sb.auth.admin.deleteUser(authId); throw new HttpError(500, `Falha ao criar o perfil (convite desfeito): ${pe.message}`, 'perfil'); }

    const agora = new Date().toISOString();
    const user: Obj = { id, nome, iniciais: iniciais(nome), email, papel, teamId, authId, ativo: true, avatarCor: String(team?.avatarCor ?? CORES[users.length % CORES.length]), cargo: String(team?.cargo ?? ''), ultimoAcesso: null, convidadoPor: quem.id, createdAt: agora };
    const invite: Obj = { id: novoId('inv'), nome, email, papel, teamId, status: 'pendente', enviadoEm: agora, enviadoPor: quem.id, expiraEm: new Date(Date.now() + 7 * 864e5).toISOString(), userId: id, reenvios: 0 };
    await gravar(org, 'users', [user]);
    await gravar(org, 'invites', [invite]);
    if (team) await gravar(org, 'team', [{ ...team, userId: id, papel }]);
    await auditar(org, quem, `convidou ${nome} (${papel})`, 'users', id);
    return json({ ok: true, userId: id, inviteId: invite.id });
  }

  if (acao === 'reenviar') {
    const email = texto(b.email, 'email', { obrigatorio: true, re: EMAIL_RE }).toLowerCase();
    const u = (await listar(org, 'users')).find((x) => String(x.email ?? '').toLowerCase() === email);
    if (!u) throw new HttpError(404, 'Usuário não encontrado nesta agência.', 'nao_encontrado');
    let { error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: redirecionar(b.redirectTo) });
    if (error && /already|registered|exists/i.test(error.message)) {
      // já confirmou o e-mail: manda link para criar/redefinir senha
      ({ error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirecionar(b.redirectTo) }));
    }
    if (error) throw new HttpError(400, `Não foi possível reenviar: ${error.message}`, 'auth');
    const invId = texto(b.inviteId, 'inviteId', { max: 80 });
    const inv = invId ? await obter(org, 'invites', invId) : null;
    if (inv) await gravar(org, 'invites', [{ ...inv, status: 'pendente', enviadoEm: new Date().toISOString(), expiraEm: new Date(Date.now() + 7 * 864e5).toISOString(), reenvios: Number(inv.reenvios ?? 0) + 1 }]);
    await auditar(org, quem, `reenviou o convite de ${u.nome}`, 'users', u.id);
    return json({ ok: true });
  }

  if (acao === 'definir_ativo') {
    const userId = texto(b.userId, 'userId', { obrigatorio: true, re: /^u-[\w-]+$/ });
    const ativo = b.ativo === true;
    const u = await obter(org, 'users', userId);
    if (!u) throw new HttpError(404, 'Usuário não encontrado nesta agência.', 'nao_encontrado');
    if (userId === eu.app_user_id && !ativo) throw new HttpError(400, 'Você não pode desativar o próprio acesso.', 'validacao');
    if (u.papel === 'dono' && !ativo) {
      const donos = (await listar(org, 'users')).filter((x) => x.papel === 'dono' && x.ativo !== false && x.id !== userId);
      if (!donos.length) throw new HttpError(400, 'É preciso manter pelo menos um Dono ativo.', 'ultimo_dono');
    }
    if (u.authId) {
      const { error } = await sb.auth.admin.updateUserById(String(u.authId), { ban_duration: ativo ? 'none' : '876000h' });
      if (error) throw new HttpError(400, `Não foi possível atualizar o login: ${error.message}`, 'auth');
      await sb.from('profiles').update({ ativo }).eq('user_id', String(u.authId)).eq('org_id', org);
    }
    await gravar(org, 'users', [{ ...u, ativo }]);
    await auditar(org, quem, `${ativo ? 'reativou' : 'desativou'} o acesso de ${u.nome}`, 'users', userId);
    return json({ ok: true });
  }

  throw new HttpError(400, `Ação desconhecida: "${acao}". Use convidar, reenviar, definir_ativo ou status_integracoes.`, 'acao');
}));
