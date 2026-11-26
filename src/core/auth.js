// auth.js — sessão, login (demo e Supabase), "ver como" e tela de login.
import { db } from './store.js';
import { esc } from './fmt.js';
import { svgIc } from './icons.js';
import { toast, avatar } from './ui.js';
import { iniciarCenaLogin } from './login-fx.js';
import { fraseDoDia } from './frases.js';

const SKEY = 'aos-sessao';
const CFG = (typeof window !== 'undefined' && window.AOS_CONFIG) || {};
let mem = null;
function lerSessao() { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return mem; } }
function gravarSessao(s) { mem = s; try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch (e) { /* memória */ } }
let sess = lerSessao();
const listeners = new Set();
const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
const pub = u => (u ? { id: u.id, nome: u.nome, email: u.email, papel: u.papel, teamId: u.teamId, avatarCor: u.avatarCor, cargo: u.cargo, ativo: u.ativo !== false } : null);
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
let pendente = null; // produção: login feito com senha provisória, aguardando a senha nova ({u})
let pendente2fa = null; // login com senha certa aguardando o código de 6 dígitos (aal2): {email, u?}
let mfaAtivo = null; // a pessoa logada tem verificação em duas etapas? null = ainda não sabemos
const mfaOuvintes = new Set();
const mfaSet = v => { if (mfaAtivo === v) return; mfaAtivo = v; mfaOuvintes.forEach(f => { try { f(v); } catch (e) { console.error(e); } }); emit(); };
export const MFA_CODIGO_DEMO = '123456';
const CODIGO_RE = /^\d{6}$/;
const SEGREDO_DEMO = 'GMKT DEMO 2FA7 QX4L'; // fictício
/** QR fictício (modo demonstração): padrão determinístico em SVG, não é um QR válido */
function qrDemo() {
  let x = 7; const r = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const n = 25; let cel = '';
  const marca = (cx, cy) => `<rect x="${cx}" y="${cy}" width="7" height="7" fill="#0E1726"/><rect x="${cx + 1}" y="${cy + 1}" width="5" height="5" fill="#fff"/><rect x="${cx + 2}" y="${cy + 2}" width="3" height="3" fill="#0E1726"/>`;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const canto = (i < 8 && j < 8) || (i < 8 && j > n - 9) || (i > n - 9 && j < 8); if (!canto && r() > 0.52) cel += `<rect x="${j}" y="${i}" width="1" height="1" fill="#0E1726"/>`; }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/>${cel}${marca(0, 0)}${marca(n - 7, 0)}${marca(0, n - 7)}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
const erroMfa = m => (/invalid|expired|incorrect/i.test(m || '') ? 'Código incorreto ou expirado. Confira o relógio do celular e digite o código que aparece agora.' : `Não foi possível verificar: ${m}`);
/** verificação em duas etapas (TOTP do Supabase; no modo demonstração tudo é simulado) */
export const mfa = {
  get ativo() { return mfaAtivo; },
  onChange(fn) { mfaOuvintes.add(fn); return () => mfaOuvintes.delete(fn); },
  /** fatores TOTP: [{id, nome, verificado, criadoEm}] */
  async listar() {
    if (db.mode === 'supabase' && db.supabase) {
      const { data, error } = await db.supabase.auth.mfa.listFactors();
      if (error) throw new Error(error.message);
      const l = ((data && data.all) || (data && data.totp) || []).filter(f => f.factor_type === 'totp').map(f => ({ id: f.id, nome: f.friendly_name || 'Aplicativo autenticador', verificado: f.status === 'verified', criadoEm: f.created_at }));
      mfaSet(l.some(f => f.verificado)); return l;
    }
    const u = sess && db.get('users', sess.userId); const f = u && u.mfaDemo;
    const l = f ? [{ id: f.id, nome: f.nome, verificado: true, criadoEm: f.criadoEm }] : [];
    mfaSet(l.length > 0); return l;
  },
  /** começa o cadastro: devolve {id, qr (imagem), segredo} */
  async iniciar(nome = 'Celular') {
    nome = String(nome || '').trim().slice(0, 40) || 'Celular';
    if (db.mode === 'supabase' && db.supabase) {
      const sb = db.supabase;
      // cadastros abandonados (não verificados) atrapalham um novo: remove antes
      try { const { data } = await sb.auth.mfa.listFactors(); for (const f of ((data && data.all) || []).filter(f => f.factor_type === 'totp' && f.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id }); } catch (e) { /* segue */ }
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `${nome} · ${new Date().toISOString().slice(0, 16)}` });
      if (error) throw new Error(/aal2|assurance/i.test(error.message) ? 'Para adicionar outro aparelho, saia e entre de novo usando o código do aparelho atual.' : error.message);
      const q = String(data.totp.qr_code || ''); // o servidor devolve SVG puro; o supabase-js às vezes já transforma em data URI
      return { id: data.id, qr: q.startsWith('data:') ? q : `data:image/svg+xml;utf8,${encodeURIComponent(q)}`, segredo: data.totp.secret, uri: data.totp.uri };
    }
    return { id: `mfa-demo-${Date.now().toString(36)}`, qr: qrDemo(), segredo: SEGREDO_DEMO, nome, demo: true };
  },
  /** confirma o cadastro com o 1º código do aplicativo */
  async confirmar(id, codigo, nome = 'Celular') {
    codigo = String(codigo || '').replace(/\s/g, '');
    if (!CODIGO_RE.test(codigo)) return { ok: false, erro: 'Digite os 6 números que aparecem no aplicativo.' };
    if (db.mode === 'supabase' && db.supabase) {
      const { error } = await db.supabase.auth.mfa.challengeAndVerify({ factorId: id, code: codigo });
      if (error) return { ok: false, erro: erroMfa(error.message) };
      await this.listar().catch(() => null); return { ok: true };
    }
    if (codigo !== MFA_CODIGO_DEMO) return { ok: false, erro: `Código incorreto. No modo demonstração use ${MFA_CODIGO_DEMO}.` };
    db.update('users', sess.userId, { mfaDemo: { id, nome: String(nome || 'Celular'), criadoEm: new Date().toISOString() } }, { log: 'ativou a verificação em duas etapas' });
    mfaSet(true); return { ok: true };
  },
  async remover(id) {
    if (db.mode === 'supabase' && db.supabase) {
      const { error } = await db.supabase.auth.mfa.unenroll({ factorId: id });
      if (error) return { ok: false, erro: /aal2|assurance/i.test(error.message) ? 'Para remover, saia e entre de novo usando o código do aplicativo (confirma que é você).' : error.message };
      await this.listar().catch(() => null); return { ok: true };
    }
    db.update('users', sess.userId, { mfaDemo: null }, { log: 'desligou a verificação em duas etapas' });
    mfaSet(false); return { ok: true };
  },
  /** produção: a sessão atual precisa do código (aal1 com fator verificado)? */
  async precisaCodigo() {
    if (db.mode !== 'supabase' || !db.supabase) return false;
    const { data, error } = await db.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
  },
};
export const SENHA_MIN = 10;
/** força da senha: 0..4 + dica (mostrada na tela "Crie sua nova senha") */
export function forcaSenha(s) {
  s = String(s || '');
  let p = 0;
  if (s.length >= SENHA_MIN) p++;
  if (s.length >= 14) p++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) p++;
  if (/\d/.test(s) && /[^A-Za-z0-9]/.test(s)) p++;
  if (/^(.)\1+$/.test(s) || /^(123|abc|senha|qwer)/i.test(s)) p = Math.min(p, 1);
  const rot = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'][p];
  const dica = s.length < SENHA_MIN ? `Use pelo menos ${SENHA_MIN} caracteres.` : p < 3 ? 'Misture letras maiúsculas e minúsculas, números e símbolos.' : 'Ótimo: guarde num gerenciador de senhas.';
  return { pontos: p, rotulo: rot, dica };
}

export const auth = {
  get demo() { return db.mode === 'demo'; },
  /** usuário efetivo (o "ver como", se ativo) */
  user() {
    if (!sess) return null;
    const real = db.get('users', sess.userId);
    if (!real || real.ativo === false) return null;
    if (sess.verComo && (real.papel === 'dono' || real.papel === 'admin')) { const v = db.get('users', sess.verComo); if (v) return pub(v); }
    return pub(real);
  },
  /** usuário real (mesmo em "ver como") */
  real() { if (!sess) return null; const u = db.get('users', sess.userId); return u && u.ativo !== false ? pub(u) : null; },
  vendoComo() { const r = this.real(); return !!(r && sess && sess.verComo && sess.verComo !== r.id && this.user() && this.user().id !== r.id); },
  podeVerComo() { const r = this.real(); return !!r && (r.papel === 'dono' || r.papel === 'admin'); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** login(email, senha) -> Promise<{ok:true,user}|{ok:false,erro}> */
  async login(email, senha) {
    email = String(email || '').trim().toLowerCase();
    if (!email || !senha) return { ok: false, erro: 'Informe e-mail e senha.' };
    if (!emailOk(email)) return { ok: false, erro: 'E-mail inválido. Confira o formato (ex.: nome@agencia.com.br).' };
    let u;
    if (db.mode === 'supabase') {
      const sb = db.supabase;
      if (!sb) return { ok: false, erro: 'Não foi possível conectar ao servidor. Verifique sua internet e tente de novo.' };
      const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) return { ok: false, erro: /invalid/i.test(error.message) ? 'E-mail ou senha incorretos. Confira e tente de novo.' : `Não foi possível entrar: ${error.message}` };
      // verificação em duas etapas: com fator verificado, nada é carregado antes do código de 6 dígitos (aal2)
      if (await mfa.precisaCodigo().catch(() => false)) { pendente2fa = { email, authId: data.user.id }; return { ok: false, pedir2fa: true }; }
      return this._posLogin(data.user, email);
    } else {
      u = db.find('users', x => String(x.email).toLowerCase() === email);
      if (!u || u.senha !== senha) return { ok: false, erro: 'E-mail ou senha incorretos. Confira e tente de novo.' };
      if (u.ativo !== false && u.mfaDemo) { pendente2fa = { email, u }; return { ok: false, pedir2fa: true }; }
    }
    if (u.ativo === false) return { ok: false, erro: 'Seu acesso está desativado. Fale com o administrador para reativar.' };
    return this._entrar(u);
  },
  /** produção: depois da senha (e do código, se houver) carrega os dados e entra */
  async _posLogin(authUser, email) {
    const sb = db.supabase; let u;
    {
      const data = { user: authUser };
      try { await db.reload(); } catch (e) { await sb.auth.signOut(); return { ok: false, erro: 'Entrou, mas não foi possível carregar seus dados. Tente de novo em instantes.' }; }
      u = db.find('users', x => x.authId === data.user.id || String(x.email).toLowerCase() === email);
      if (!u) { await sb.auth.signOut(); return { ok: false, erro: 'Seu acesso ainda não foi configurado. Peça ao administrador para criar seu perfil.' }; }
      if (u.ativo === false) { await sb.auth.signOut(); return { ok: false, erro: 'Seu acesso está desativado. Fale com o administrador para reativar.' }; }
      const { data: pf } = await sb.from('profiles').select('trocar_senha').eq('user_id', data.user.id).maybeSingle();
      if (pf && pf.trocar_senha) { pendente = { u }; return { ok: false, trocarSenha: true, user: pub(u) }; }
    }
    return this._entrar(u);
  },
  get pede2fa() { return !!pendente2fa; },
  /** segunda etapa do login: código de 6 dígitos do aplicativo autenticador */
  async verificar2fa(codigo) {
    codigo = String(codigo || '').replace(/\s/g, '');
    if (!pendente2fa) return { ok: false, erro: 'Entre de novo com e-mail e senha.' };
    if (!CODIGO_RE.test(codigo)) return { ok: false, erro: 'Digite os 6 números que aparecem no aplicativo autenticador.' };
    if (db.mode === 'supabase' && db.supabase) {
      const sb = db.supabase;
      const { data: fs, error: e1 } = await sb.auth.mfa.listFactors();
      if (e1) return { ok: false, erro: `Não foi possível verificar: ${e1.message}` };
      const f = ((fs && fs.totp) || []).find(x => x.status === 'verified');
      if (!f) return { ok: false, erro: 'Nenhum aplicativo autenticador encontrado. Entre de novo.' };
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: codigo });
      if (error) return { ok: false, erro: erroMfa(error.message) };
      const { data: us } = await sb.auth.getUser();
      const p = pendente2fa; pendente2fa = null; mfaSet(true);
      return this._posLogin((us && us.user) || { id: p.authId }, p.email);
    }
    if (codigo !== MFA_CODIGO_DEMO) return { ok: false, erro: `Código incorreto. No modo demonstração o código é ${MFA_CODIGO_DEMO}.` };
    const u = pendente2fa.u; pendente2fa = null;
    if (u.ativo === false) return { ok: false, erro: 'Seu acesso está desativado. Fale com o administrador para reativar.' };
    const r = this._entrar(u); mfaSet(true); return r;
  },
  async cancelar2fa() { pendente2fa = null; if (db.mode === 'supabase' && db.supabase) { try { await db.supabase.auth.signOut(); } catch (e) { /* ignora */ } } },
  _entrar(u, extra = {}) {
    sess = { userId: u.id, verComo: null, desde: new Date().toISOString() };
    gravarSessao(sess); mfaAtivo = null; setTimeout(() => { mfa.listar().catch(() => null); }, 0);
    db.update('users', u.id, { ultimoAcesso: new Date().toISOString(), ...extra });
    emit();
    return { ok: true, user: pub(u) };
  },
  /** produção: há um login com senha provisória esperando a senha nova? */
  get trocaPendente() { return !!pendente; },
  /** produção: troca a senha provisória pela definitiva e entra. -> {ok}|{ok:false, erro} */
  async trocarSenha(nova, confirmacao) {
    nova = String(nova || '');
    if (nova.length < SENHA_MIN) return { ok: false, erro: `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.` };
    if (nova !== String(confirmacao || '')) return { ok: false, erro: 'As duas senhas não são iguais. Digite de novo.' };
    if (forcaSenha(nova).pontos < 2) return { ok: false, erro: 'Senha fraca demais. Misture letras maiúsculas e minúsculas, números e símbolos.' };
    if (db.mode !== 'supabase' || !db.supabase || !pendente) return { ok: false, erro: 'Entre de novo com a senha provisória.' };
    const sb = db.supabase;
    const { error } = await sb.auth.updateUser({ password: nova });
    if (error) return { ok: false, erro: /different|same/i.test(error.message) ? 'A senha nova precisa ser diferente da provisória.' : /weak|short|length/i.test(error.message) ? 'Senha fraca demais. Use uma senha mais longa e variada.' : `Não foi possível salvar a senha: ${error.message}` };
    const { error: e2 } = await sb.rpc('concluir_troca_senha');
    if (e2) return { ok: false, erro: `Senha salva, mas não foi possível concluir: ${e2.message}. Tente entrar de novo com a senha nova.` };
    const u = db.get('users', pendente.u.id) || pendente.u;
    pendente = null;
    return this._entrar(u, { senhaTemporaria: false });
  },
  async cancelarTroca() { pendente = null; if (db.supabase) { try { await db.supabase.auth.signOut(); } catch (e) { /* ignora */ } } },
  async logout() {
    if (db.mode === 'supabase' && db.supabase) { try { await db._pendentes(); await db.supabase.auth.signOut(); } catch (e) { /* ignora */ } }
 sess = null; gravarSessao(null); mfaAtivo = null; emit();
  },
  /** "ver como" (só dono/admin) */
  verComo(userId) {
    if (!this.podeVerComo()) return false;
    const alvo = db.get('users', userId);
    if (!alvo || alvo.id === sess.userId) return false;
    sess = { ...sess, verComo: userId }; gravarSessao(sess); emit(); return true;
  },
  voltar() { if (!sess) return; sess = { ...sess, verComo: null }; gravarSessao(sess); emit(); },
  /** "Esqueci minha senha" */
  async esqueci(email) {
    email = String(email || '').trim().toLowerCase();
    if (db.mode !== 'supabase' && !emailOk(email)) return { ok: false, erro: 'Informe um e-mail válido para receber o link.' };
    // produção sem e-mail: a senha provisória é gerada pelo administrador (Administração › Usuários › Redefinir senha)
    if (db.mode === 'supabase') return { ok: true, msg: 'Peça ao administrador uma senha provisória. Ele gera em Administração › Usuários › Redefinir senha e envia para você (por WhatsApp, por exemplo). No primeiro acesso você cria a sua senha nova.' };
    return { ok: true, msg: 'No modo demonstração não enviamos e-mails: o administrador redefine a senha em Administração › Usuários. A senha de teste é demo123.' };
  },
  /** boot: no Supabase, restaura sessão existente */
  async restaurar() {
    if (db.mode !== 'supabase' || !db.supabase) return;
    try {
      const { data } = await db.supabase.auth.getSession();
      const su = data && data.session && data.session.user;
      if (!su) { sess = null; gravarSessao(null); return; }
      const u = db.find('users', x => x.authId === su.id || String(x.email).toLowerCase() === String(su.email).toLowerCase());
      // senha provisória ainda não trocada: não entra direto (precisa passar pela tela "Crie sua nova senha")
      const { data: pf } = await db.supabase.from('profiles').select('trocar_senha').eq('user_id', su.id).maybeSingle();
      if (pf && pf.trocar_senha) { await db.supabase.auth.signOut(); sess = null; gravarSessao(null); return; }
      // sessão que parou na senha (sem o código de 6 dígitos): volta para o login
      if (await mfa.precisaCodigo().catch(() => false)) { await db.supabase.auth.signOut(); sess = null; gravarSessao(null); return; }
      setTimeout(() => { mfa.listar().catch(() => null); }, 0);
      if (u && (!sess || sess.userId !== u.id)) { sess = { userId: u.id, verComo: null }; gravarSessao(sess); }
    } catch (e) { console.warn('[Gmarketing] sessão indisponível', e && e.message); }
  },

  /** tela de login; chama onOk() após entrar */
  renderLogin(root, onOk) {
    const demo = this.demo && db.dadosDemo; // atalhos de login só existem com os usuários de exemplo
    const rapidos = [['Dono', 'gabriel', 'Gabriel Leão'], ['Head de tráfego', 'allan', 'Allan Vieira'], ['Gestor de tráfego', 'ana', 'Ana Souza'], ['CS', 'diego', 'Diego Melo'], ['Produção', 'carla', 'Carla Dias'], ['Financeiro', 'paulo', 'Paulo Reis']];
    const outros = [['Administrador', 'rayane', 'Rayane Leão'], ['Comercial', 'marina', 'Marina Costa'], ['Somente leitura', 'helena', 'Helena Prado']];
    const fr = fraseDoDia();
    const frase = cls => `<figure class="lg-frase ${cls}"><span class="lg-frase-k">${fr.tipo === 'biblia' ? 'Versículo do dia' : 'Frase do dia'}</span><blockquote>“${esc(fr.texto)}”</blockquote><figcaption>— ${esc(fr.autor)}</figcaption></figure>`;
    const btnR = ([rot, k, nome]) => {
      const u = db.get('users', `u-${k}`) || { nome, avatarCor: '#64748B' };
      return `<button type="button" class="lg-q" data-quick="${k}@agencia.demo">${avatar(u, 28)}<span><b>Entrar como ${esc(rot)}</b><small>${esc(nome)}</small></span>${svgIc('arrow-right')}</button>`;
    };
    root.innerHTML = `
<div class="lg lgn">
  <canvas class="lg-fx" aria-hidden="true"></canvas>
  <div class="lg-aurora" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="lg-spot" aria-hidden="true"></div>
  <section class="lg-side" aria-hidden="true">
    <div class="lg-brand"><span class="brand-mk brand-g" aria-hidden="true">G</span><b>Gmarketing</b><span class="lg-live"><i></i>Sistemas no ar</span></div>
    <div class="lg-pitch">
      <span class="lg-eyebrow">Central de comando da agência</span>
      <h2>Onde a performance <em>decola.</em></h2>
      <p>Tráfego, clientes, operação e equipe na mesma cabine — com o motor de recomendações e o Guardião vigiando cada conta, 24 horas por dia.</p>
    </div>
    <div class="lg-stage">
      <div class="lg-fl lg-fl-a" data-prof="26">
        <div class="lg-fl-h"><span>Painel de Voo</span><i class="lg-dot ok"></i></div>
        <svg viewBox="0 0 220 64" class="lg-spark" preserveAspectRatio="none"><defs><linearGradient id="lgsg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3D9BFF" stop-opacity=".45"/><stop offset="1" stop-color="#3D9BFF" stop-opacity="0"/></linearGradient></defs><path d="M0 50 L20 44 L40 47 L60 36 L80 39 L100 28 L120 31 L140 20 L160 24 L180 12 L200 15 L220 6 L220 64 L0 64Z" fill="url(#lgsg)"/><path class="lg-spark-l" d="M0 50 L20 44 L40 47 L60 36 L80 39 L100 28 L120 31 L140 20 L160 24 L180 12 L200 15 L220 6" fill="none" stroke="#5AB4FF" stroke-width="2" stroke-linejoin="round"/></svg>
        <div class="lg-fl-f"><b>Contas Meta</b><span>monitoradas em tempo real</span></div>
      </div>
      <div class="lg-fl lg-fl-b" data-prof="44">
        <div class="lg-fl-h"><span>Guardião</span><i class="lg-dot ok"></i></div>
        <div class="lg-shield">${svgIc('check')}<span>Nenhuma invasão<br><small>vigilância ativa</small></span></div>
      </div>
      <div class="lg-fl lg-fl-c" data-prof="16">
        <div class="lg-fl-h"><span>Motor de recomendações</span></div>
        <div class="lg-bars"><i style="--h:42%"></i><i style="--h:64%"></i><i style="--h:51%"></i><i style="--h:78%"></i><i style="--h:69%"></i><i style="--h:92%"></i><i style="--h:84%"></i></div>
      </div>
    </div>
    ${frase('lg-frase-d')}
    <small class="lg-foot">${demo ? 'Dados ilustrativos no modo demonstração.' : 'Acesso restrito à equipe Gmarketing.'}</small>
  </section>
  <main class="lg-main">
    <div class="lg-card"><span class="lg-card-glow" aria-hidden="true"></span>
      <div class="lg-brand lg-brand-m"><span class="brand-mk brand-g" aria-hidden="true">G</span><b>Gmarketing</b></div>
      <h1>Bem-vindo de volta</h1>
      <p class="lg-sub">Entre com seu e-mail de trabalho para assumir o comando.</p>
      <form class="lg-form" novalidate>
        <div class="fld"><label for="lg-email">E-mail</label><input id="lg-email" name="email" type="email" autocomplete="username" inputmode="email" placeholder="nome@agencia.com.br" required></div>
        <div class="fld"><div class="fld-top"><label for="lg-senha">Senha</label><button type="button" class="lnk" data-esqueci>Esqueci minha senha</button></div>
          <div class="inp-ic"><input id="lg-senha" name="senha" type="password" autocomplete="current-password" required><button type="button" class="inp-btn" data-ver-senha aria-label="Mostrar senha">${svgIc('eye')}</button></div></div>
        <p class="lg-err" role="alert" aria-live="assertive" hidden></p>
        <button class="btn pri lg-go" type="submit">Entrar</button>
      </form>
      ${demo ? `<div class="lg-demo">
        <div class="lg-demo-h"><span class="tag-demo">${svgIc('spark')}Modo demonstração</span><small>Senha de todos: <code>demo123</code></small></div>
        <div class="lg-qs">${rapidos.map(btnR).join('')}</div>
        <details class="lg-more"><summary>Outros papéis</summary><div class="lg-qs">${outros.map(btnR).join('')}</div></details>
      </div>` : ''}
    </div>
    ${frase('lg-frase-m')}
  </main>
</div>`;
    const f = root.querySelector('form'), err = root.querySelector('.lg-err'), go = root.querySelector('.lg-go');
    const mostrar = m => { err.hidden = !m; err.textContent = m || ''; };
    const entrar = async (email, senha) => {
      go.disabled = true; go.textContent = 'Entrando…'; mostrar('');
      const r = await this.login(email, senha);
      go.disabled = false; go.textContent = 'Entrar';
      if (r.trocarSenha) { this.renderTrocaSenha(root, r.user, onOk); return; }
      if (r.pedir2fa) { this.render2fa(root, onOk); return; }
      if (!r.ok) { mostrar(r.erro); f.senha.focus(); return; }
      onOk && onOk(r.user);
    };
    f.addEventListener('submit', e => { e.preventDefault(); entrar(f.email.value, f.senha.value); });
    root.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', () => { f.email.value = b.dataset.quick; f.senha.value = 'demo123'; entrar(b.dataset.quick, 'demo123'); }));
    root.querySelector('[data-ver-senha]').addEventListener('click', e => {
      const b = e.currentTarget, s = f.senha.type === 'password';
      f.senha.type = s ? 'text' : 'password'; b.setAttribute('aria-label', s ? 'Ocultar senha' : 'Mostrar senha'); b.innerHTML = svgIc(s ? 'eye-off' : 'eye');
    });
    root.querySelector('[data-esqueci]').addEventListener('click', async () => {
      const r = await this.esqueci(f.email.value || (demo ? 'gabriel@agencia.demo' : ''));
      if (!r.ok) { mostrar(r.erro); f.email.focus(); return; }
      mostrar('');
      toast(r.msg, { tipo: 'info', duracao: 9000 });
    });
    if (this._pararCena) this._pararCena();
    this._pararCena = iniciarCenaLogin(root);
    setTimeout(() => { if (!f.contains(document.activeElement)) f.email.focus(); }, 30);
  },

 /** 2ª etapa do login: código de 6 dígitos */
  render2fa(root, onOk) {
    const card = root.querySelector('.lg-card');
    card.innerHTML = `<span class="lg-card-glow" aria-hidden="true"></span>
      <div class="lg-brand lg-brand-m"><span class="brand-mk brand-g" aria-hidden="true">G</span><b>Gmarketing</b></div>
      <h1>Verificação em duas etapas</h1>
      <p class="lg-sub">Abra o aplicativo autenticador do seu celular (Google Authenticator, Microsoft Authenticator, 1Password…) e digite o código de 6 números da Gmarketing.</p>
      <form class="lg-form lg-2fa" novalidate>
        <div class="fld"><label for="lg-cod">Código de 6 dígitos</label><input id="lg-cod" name="cod" class="lg-cod num" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="7" placeholder="000 000" required aria-describedby="lg-cod-d">
          <p class="fld-d" id="lg-cod-d">${db.mode === 'supabase' ? 'O código muda a cada 30 segundos.' : `Modo demonstração: o código é ${MFA_CODIGO_DEMO}.`}</p></div>
        <p class="lg-err" role="alert" aria-live="assertive" hidden></p>
        <button class="btn pri lg-go" type="submit">Verificar e entrar</button>
        <button class="btn ghost" type="button" data-cancelar-2fa>Voltar ao login</button>
        <p class="sm mut lg-2fa-aj">Perdeu o celular? Peça ao administrador para remover a verificação do seu acesso (Supabase › Authentication › Users).</p>
      </form>`;
    const f = card.querySelector('form'), err = card.querySelector('.lg-err'), go = card.querySelector('.lg-go');
    const mostrar = m => { err.hidden = !m; err.textContent = m || ''; };
    f.cod.addEventListener('input', () => { const v = f.cod.value.replace(/\D/g, '').slice(0, 6); f.cod.value = v.length > 3 ? `${v.slice(0, 3)} ${v.slice(3)}` : v; if (v.length === 6) f.requestSubmit(); });
    card.querySelector('[data-cancelar-2fa]').addEventListener('click', async () => { await this.cancelar2fa(); this.renderLogin(root, onOk); });
    f.addEventListener('submit', async e => {
      e.preventDefault(); if (go.disabled) return;
      go.disabled = true; go.textContent = 'Verificando…'; mostrar('');
      const r = await this.verificar2fa(f.cod.value);
      go.disabled = false; go.textContent = 'Verificar e entrar';
      if (r.trocarSenha) { this.renderTrocaSenha(root, r.user, onOk); return; }
      if (!r.ok) { mostrar(r.erro); f.cod.value = ''; f.cod.focus(); return; }
      onOk && onOk(r.user);
    });
    setTimeout(() => f.cod.focus(), 30);
  },

  /** produção: "Crie sua nova senha" (obrigatória no 1º acesso com senha provisória) */
  renderTrocaSenha(root, user, onOk) {
    const card = root.querySelector('.lg-card');
    card.innerHTML = `<span class="lg-card-glow" aria-hidden="true"></span>
      <div class="lg-brand lg-brand-m"><span class="brand-mk brand-g" aria-hidden="true">G</span><b>Gmarketing</b></div>
      <h1>Crie sua nova senha</h1>
      <p class="lg-sub">Olá${user && user.nome ? `, ${esc(String(user.nome).split(' ')[0])}` : ''}! Você entrou com uma senha provisória. Antes de continuar, crie a sua senha pessoal — só você vai saber.</p>
      <form class="lg-form lg-troca" novalidate>
        <div class="fld"><label for="lg-nova">Nova senha</label>
          <div class="inp-ic"><input id="lg-nova" name="nova" type="password" autocomplete="new-password" minlength="${SENHA_MIN}" required aria-describedby="lg-forca"><button type="button" class="inp-btn" data-ver-senha aria-label="Mostrar senha">${svgIc('eye')}</button></div>
          <p class="fld-d" id="lg-forca" data-forca aria-live="polite">Use pelo menos ${SENHA_MIN} caracteres.</p></div>
        <div class="fld"><label for="lg-conf">Repita a nova senha</label><input id="lg-conf" name="conf" type="password" autocomplete="new-password" required></div>
        <p class="lg-err" role="alert" aria-live="assertive" hidden></p>
        <button class="btn pri lg-go" type="submit">Salvar senha e entrar</button>
        <button class="btn ghost" type="button" data-cancelar-troca>Voltar ao login</button>
      </form>`;
    const f = card.querySelector('form'), err = card.querySelector('.lg-err'), go = card.querySelector('.lg-go'), fz = card.querySelector('[data-forca]');
    const mostrar = m => { err.hidden = !m; err.textContent = m || ''; };
    f.nova.addEventListener('input', () => { const x = forcaSenha(f.nova.value); fz.textContent = f.nova.value ? `Força: ${x.rotulo}. ${x.dica}` : `Use pelo menos ${SENHA_MIN} caracteres.`; fz.dataset.p = String(x.pontos); });
    card.querySelector('[data-ver-senha]').addEventListener('click', e => {
      const b = e.currentTarget, s = f.nova.type === 'password';
      f.nova.type = s ? 'text' : 'password'; f.conf.type = f.nova.type; b.setAttribute('aria-label', s ? 'Ocultar senha' : 'Mostrar senha'); b.innerHTML = svgIc(s ? 'eye-off' : 'eye');
    });
    card.querySelector('[data-cancelar-troca]').addEventListener('click', async () => { await this.cancelarTroca(); this.renderLogin(root, onOk); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      go.disabled = true; go.textContent = 'Salvando…'; mostrar('');
      const r = await this.trocarSenha(f.nova.value, f.conf.value);
      go.disabled = false; go.textContent = 'Salvar senha e entrar';
      if (!r.ok) { mostrar(r.erro); f.nova.focus(); return; }
      toast('Senha criada. Bem-vindo(a)!', { tipo: 'ok' });
      onOk && onOk(r.user);
    });
    setTimeout(() => f.nova.focus(), 30);
  },
};

db._setUserProvider(() => auth.real());
db._setSomenteLeitura(() => auth.vendoComo(), () => toast('Você está vendo como outra pessoa: somente visualização. Nada foi alterado.', { tipo: 'info' }));
if (CFG.debug) window.AOS_AUTH = auth;
export default auth;
