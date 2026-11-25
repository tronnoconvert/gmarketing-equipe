// admin-invite — logins e administração de acessos (só Dono e Administração). SEM e-mail: senha provisória.
// Ações (POST JSON {acao, ...}):
//   convidar           {nome, email, papel, teamId?}   → cria o login no Auth (e-mail já confirmado) com senha provisória,
//                                                        perfil (trocar_senha = true) e registro `users`; devolve {senha} UMA vez
//   redefinir_senha    {userId: 'u-…'}                 → nova senha provisória (a pessoa troca no próximo acesso); devolve {senha}
//   reenviar           {email} ou {userId}             → o mesmo que redefinir_senha (compatibilidade com a tela de convites)
//   definir_ativo      {userId: 'u-…', ativo: boolean} → bloqueia/libera o login no Auth e no perfil
//   status_integracoes {}                              → quais variáveis de ambiente existem (só true/false, nunca valores)
//   bootstrap          {nome, email, papel: 'dono'|'admin', orgId?}  com header x-bootstrap-secret = BOOTSTRAP_SECRET
//                      → cria os primeiros donos (Gabriel e Rayane) quando ainda não há 2 donos/admins na agência.
// A senha provisória nunca é gravada no banco do app: só existe no Supabase Auth (hash) e na resposta desta chamada.
// Segurança: valida o JWT de quem chama, exige papel dono/admin e atua só na org de quem chama.
import { corpo, EMAIL_RE, env, HttpError, json, servir, texto } from '../_shared/http.ts';
import { adminClient, auditar, chamador, exigirPapel, gravar, listar, novoId, obter, PAPEIS, type Obj, type Papel } from '../_shared/supa.ts';
import { canaisConfigurados } from '../_shared/envio.ts';

const CORES = ['#0B6BE8', '#7C5CFC', '#0E9F6E', '#D9467A', '#C2700A', '#0891B2', '#4F46E5', '#B45309', '#047857', '#475569'];
const ENVS = ['WINDSOR_API_KEY', 'WINDSOR_ACCOUNT_ID', 'MONDAY_API_TOKEN', 'MONDAY_BOARD_IDS', 'META_ACCESS_TOKEN', 'META_APP_ID', 'META_APP_SECRET',
  'META_SYSTEM_USER_TOKEN', 'ZAPI_INSTANCE_ID', 'ZAPI_TOKEN', 'ZAPI_CLIENT_TOKEN', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'SLACK_WEBHOOK_URL', 'RESEND_API_KEY', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'CRON_SECRET', 'APP_URL'];

const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().split(/\s+/)[0].replace(/[^a-z0-9]/g, '') || 'usuario';
const iniciais = (n: string) => { const p = n.trim().split(/\s+/).filter((w) => !/^(da|de|do|das|dos|e)$/i.test(w)); return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };

/** senha provisória forte e fácil de ditar: 4 blocos de 4 (sem 0/O/1/l/I), ~95 bits */
export function senhaProvisoria(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  for (;;) {
    const b = crypto.getRandomValues(new Uint32Array(16));
    const s = Array.from(b, (x) => A[x % A.length]).join('');
    if (/[A-Z]/.test(s) && /[a-z]/.test(s) && /\d/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`;
  }
}
/** comparação em tempo constante */
function iguais(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/** cria login (Auth + perfil + users [+ team]) com senha provisória; devolve {id, senha} */
async function criarLogin(org: string, o: { nome: string; email: string; papel: Papel; teamId: string | null; criarTeam?: boolean; convidadoPor: string | null; cargo?: string }) {
  const sb = adminClient();
  const users = await listar(org, 'users');
  if (users.some((u) => String(u.email ?? '').toLowerCase() === o.email)) throw new HttpError(409, 'Já existe um usuário com este e-mail.', 'duplicado');
  let team = o.teamId ? await obter(org, 'team', o.teamId) : null;
  if (o.teamId && !team) throw new HttpError(400, 'Colaborador da equipe não encontrado.', 'validacao');

  let id = `u-${slug(o.nome)}`; let n = 2; const ids = new Set(users.map((u) => u.id));
  while (ids.has(id)) id = `u-${slug(o.nome)}${n++}`;
  let teamId = o.teamId;
  if (!team && o.criarTeam) {
    const times = new Set((await listar(org, 'team')).map((t) => t.id));
    let tid = `t-${slug(o.nome)}`; let k = 2; while (times.has(tid)) tid = `t-${slug(o.nome)}${k++}`;
    teamId = tid;
    team = { id: tid, nome: o.nome, email: o.email, cargo: o.cargo ?? '', area: 'Diretoria', papel: o.papel, userId: id, ativo: true, status: 'online', custoHora: 0, horasMes: 0, skills: [], avatarCor: CORES[users.length % CORES.length], iniciais: iniciais(o.nome) };
  }

  const senha = senhaProvisoria();
  const { data: cu, error: ce } = await sb.auth.admin.createUser({ email: o.email, password: senha, email_confirm: true, user_metadata: { nome: o.nome, org_id: org } });
  if (ce || !cu?.user) {
    if (/already|registered|exists/i.test(ce?.message ?? '')) throw new HttpError(409, 'Este e-mail já tem login no Supabase Auth. Remova-o em Authentication › Users ou use outro e-mail.', 'duplicado');
    throw new HttpError(400, `Não foi possível criar o login: ${ce?.message ?? 'erro no Auth'}.`, 'auth');
  }
  const authId = cu.user.id;
  const { error: pe } = await sb.from('profiles').insert({ user_id: authId, org_id: org, papel: o.papel, team_id: teamId, app_user_id: id, ativo: true, trocar_senha: true });
  if (pe) { await sb.auth.admin.deleteUser(authId); throw new HttpError(500, `Falha ao criar o perfil (login desfeito): ${pe.message}`, 'perfil'); }
  const { error: re } = await sb.rpc('registrar_senha_temporaria', { p_user: authId });
  if (re) { await sb.auth.admin.deleteUser(authId); throw new HttpError(500, `Falha ao registrar a senha provisória (login desfeito): ${re.message}`, 'perfil'); }

  const agora = new Date().toISOString();
  const user: Obj = { id, nome: o.nome, iniciais: iniciais(o.nome), email: o.email, papel: o.papel, teamId, authId, ativo: true, avatarCor: String(team?.avatarCor ?? CORES[users.length % CORES.length]), cargo: String(team?.cargo ?? o.cargo ?? ''), ultimoAcesso: null, convidadoPor: o.convidadoPor, senhaTemporaria: true, createdAt: agora };
  await gravar(org, 'users', [user]);
  if (team) await gravar(org, 'team', [{ ...team, userId: id, papel: o.papel }]);
  return { id, authId, senha, teamId };
}

async function novaSenha(org: string, u: Obj): Promise<string> {
  if (!u.authId) throw new HttpError(400, 'Este usuário ainda não tem login no servidor.', 'sem_login');
  if (u.ativo === false) throw new HttpError(400, 'Reative o acesso antes de redefinir a senha.', 'inativo');
  const sb = adminClient();
  const senha = senhaProvisoria();
  const { error } = await sb.auth.admin.updateUserById(String(u.authId), { password: senha });
  if (error) throw new HttpError(400, `Não foi possível redefinir a senha: ${error.message}`, 'auth');
  const { error: re } = await sb.rpc('registrar_senha_temporaria', { p_user: String(u.authId) });
  if (re) throw new HttpError(500, `Senha trocada, mas não foi possível exigir a troca no próximo acesso: ${re.message}`, 'perfil');
  await gravar(org, 'users', [{ ...u, senhaTemporaria: true }]);
  return senha;
}

/** primeiros donos: protegido por BOOTSTRAP_SECRET e só enquanto a agência tem menos de 2 donos/admins */
async function bootstrap(req: Request): Promise<Response> {
  const segredo = env('BOOTSTRAP_SECRET');
  if (!segredo || segredo.length < 32) throw new HttpError(403, 'Bootstrap desligado (BOOTSTRAP_SECRET não configurado).', 'bootstrap_off');
  if (!iguais(req.headers.get('x-bootstrap-secret') ?? '', segredo)) throw new HttpError(401, 'Segredo de bootstrap inválido.', 'bootstrap_segredo');
  const b = await corpo(req);
  const nome = texto(b.nome, 'nome', { obrigatorio: true, min: 3, max: 80 });
  const email = texto(b.email, 'email', { obrigatorio: true, max: 160, re: EMAIL_RE }).toLowerCase();
  const papel = texto(b.papel, 'papel', { obrigatorio: true }) as Papel;
  if (papel !== 'dono' && papel !== 'admin') throw new HttpError(400, 'No bootstrap o papel precisa ser dono ou admin.', 'validacao');
  const org = texto(b.orgId, 'orgId', { max: 60, re: /^[\w-]+$/ }) || env('DEFAULT_ORG_ID') || 'gmarketing';
  const sb = adminClient();
  const { data: o } = await sb.from('orgs').select('id').eq('id', org).maybeSingle();
  if (!o) throw new HttpError(400, `Agência "${org}" não existe (rode supabase/schema.sql).`, 'validacao');

  // idempotente: mesmo e-mail ainda com senha provisória → nova senha provisória
  const existente = (await listar(org, 'users')).find((x) => String(x.email ?? '').toLowerCase() === email);
  if (existente) {
    const { data: p } = await sb.from('profiles').select('trocar_senha').eq('user_id', String(existente.authId ?? '')).maybeSingle();
    if (!p?.trocar_senha) throw new HttpError(409, 'Este dono já criou a própria senha. Use "Redefinir senha" dentro do app.', 'ja_ativo');
    const senha = await novaSenha(org, existente);
    return json({ ok: true, userId: existente.id, senha, reemitida: true });
  }
  const { count } = await sb.from('profiles').select('user_id', { count: 'exact', head: true }).eq('org_id', org).in('papel', ['dono', 'admin']);
  if ((count ?? 0) >= 2) throw new HttpError(403, 'A agência já tem 2 donos/admins: crie os demais pelo app (Administração › Usuários).', 'bootstrap_fechado');
  const r = await criarLogin(org, { nome, email, papel, teamId: null, criarTeam: true, convidadoPor: null, cargo: papel === 'dono' ? 'Fundador e CEO' : 'Sócia administradora' });
  await auditar(org, { id: null, nome: 'Bootstrap' }, `criou o primeiro acesso de ${nome} (${papel})`, 'users', r.id);
  return json({ ok: true, userId: r.id, teamId: r.teamId, senha: r.senha });
}

Deno.serve(servir(async (req) => {
  if (req.headers.get('x-bootstrap-secret')) return await bootstrap(req);
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
    if (papel === 'dono' && eu.papel !== 'dono') throw new HttpError(403, 'Só um Dono pode criar outro Dono.', 'sem_permissao');
    const teamId = texto(b.teamId, 'teamId', { max: 60, re: /^[\w-]+$/ }) || null;
    const r = await criarLogin(org, { nome, email, papel, teamId, convidadoPor: quem.id });
    const agora = new Date().toISOString();
    await gravar(org, 'invites', [{ id: novoId('inv'), nome, email, papel, teamId, status: 'aceito', modo: 'senha_temporaria', enviadoEm: agora, enviadoPor: quem.id, aceitoEm: agora, userId: r.id }]);
    await auditar(org, quem, `criou o acesso de ${nome} (${papel}) com senha provisória`, 'users', r.id);
    return json({ ok: true, userId: r.id, senha: r.senha });
  }

  if (acao === 'redefinir_senha' || acao === 'reenviar') {
    const userId = texto(b.userId, 'userId', { re: /^u-[\w-]+$/ });
    const email = texto(b.email, 'email', { re: EMAIL_RE }).toLowerCase();
    if (!userId && !email) throw new HttpError(400, 'Informe userId ou email.', 'validacao');
    const u = userId ? await obter(org, 'users', userId) : (await listar(org, 'users')).find((x) => String(x.email ?? '').toLowerCase() === email) ?? null;
    if (!u) throw new HttpError(404, 'Usuário não encontrado nesta agência.', 'nao_encontrado');
    if (u.id === eu.app_user_id) throw new HttpError(400, 'Para trocar a sua própria senha use "Trocar senha" no seu perfil.', 'validacao');
    if (u.papel === 'dono' && eu.papel !== 'dono') throw new HttpError(403, 'Só um Dono redefine a senha de outro Dono.', 'sem_permissao');
    const senha = await novaSenha(org, u);
    const invId = texto(b.inviteId, 'inviteId', { max: 80 });
    const inv = invId ? await obter(org, 'invites', invId) : null;
    if (inv) await gravar(org, 'invites', [{ ...inv, status: 'aceito', modo: 'senha_temporaria', aceitoEm: new Date().toISOString(), reenvios: Number(inv.reenvios ?? 0) + 1 }]);
    await auditar(org, quem, `gerou senha provisória para ${u.nome}`, 'users', u.id);
    return json({ ok: true, userId: u.id, senha });
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

  throw new HttpError(400, `Ação desconhecida: "${acao}". Use convidar, redefinir_senha, reenviar, definir_ativo ou status_integracoes.`, 'acao');
}));
