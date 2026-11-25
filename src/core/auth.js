// auth.js — sessão, login (demo e Supabase), "ver como" e tela de login.
import { db } from './store.js';
import { esc } from './fmt.js';
import { svgIc } from './icons.js';
import { toast, avatar } from './ui.js';

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
      try { await db.reload(); } catch (e) { await sb.auth.signOut(); return { ok: false, erro: 'Entrou, mas não foi possível carregar seus dados. Tente de novo em instantes.' }; }
      u = db.find('users', x => x.authId === data.user.id || String(x.email).toLowerCase() === email);
      if (!u) { await sb.auth.signOut(); return { ok: false, erro: 'Seu acesso ainda não foi configurado. Peça ao administrador para criar seu perfil.' }; }
    } else {
      u = db.find('users', x => String(x.email).toLowerCase() === email);
      if (!u || u.senha !== senha) return { ok: false, erro: 'E-mail ou senha incorretos. Confira e tente de novo.' };
    }
    if (u.ativo === false) return { ok: false, erro: 'Seu acesso está desativado. Fale com o administrador para reativar.' };
    sess = { userId: u.id, verComo: null, desde: new Date().toISOString() };
    gravarSessao(sess);
    db.update('users', u.id, { ultimoAcesso: new Date().toISOString() });
    emit();
    return { ok: true, user: pub(u) };
  },
  async logout() {
    if (db.mode === 'supabase' && db.supabase) { try { await db.supabase.auth.signOut(); } catch (e) { /* ignora */ } }
    sess = null; gravarSessao(null); emit();
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
    if (!emailOk(email)) return { ok: false, erro: 'Informe um e-mail válido para receber o link.' };
    if (db.mode === 'supabase' && db.supabase) {
      const { error } = await db.supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) return { ok: false, erro: `Não foi possível enviar: ${error.message}` };
      return { ok: true, msg: `Se ${email} estiver cadastrado, você receberá um link para criar uma nova senha.` };
    }
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
      if (u && (!sess || sess.userId !== u.id)) { sess = { userId: u.id, verComo: null }; gravarSessao(sess); }
    } catch (e) { console.warn('[Gmarketing] sessão indisponível', e && e.message); }
  },

  /** tela de login; chama onOk() após entrar */
  renderLogin(root, onOk) {
    const demo = this.demo;
    const rapidos = [['Dono', 'gabriel', 'Gabriel Leão'], ['Head de tráfego', 'allan', 'Allan Vieira'], ['Gestor de tráfego', 'ana', 'Ana Souza'], ['CS', 'diego', 'Diego Melo'], ['Produção', 'carla', 'Carla Dias'], ['Financeiro', 'paulo', 'Paulo Reis']];
    const outros = [['Administrador', 'rayane', 'Rayane Leão'], ['Comercial', 'marina', 'Marina Costa'], ['Somente leitura', 'helena', 'Helena Prado']];
    const btnR = ([rot, k, nome]) => {
      const u = db.get('users', `u-${k}`) || { nome, avatarCor: '#64748B' };
      return `<button type="button" class="lg-q" data-quick="${k}@agencia.demo">${avatar(u, 28)}<span><b>Entrar como ${esc(rot)}</b><small>${esc(nome)}</small></span>${svgIc('arrow-right')}</button>`;
    };
    root.innerHTML = `
<div class="lg lgn">
  <section class="lg-side" aria-hidden="true">
    <div class="lg-brand"><span class="brand-mk brand-g" aria-hidden="true">G</span><b>Gmarketing</b></div>
    <div class="lg-pitch">
      <h2>O painel de controle da sua agência.</h2>
      <p>Receita, clientes, operação, equipe e tráfego em um só lugar — com luzes que mostram o que precisa de você hoje.</p>
      <ul class="lg-feat">
        <li><span class="led-w"><i class="led ok"></i>Rotinas e integrações operando</span></li>
        <li><span class="led-w"><i class="led warn"></i>Renovações e entregas que pedem atenção</span></li>
        <li><span class="led-w"><i class="led err"></i>Falhas e clientes em risco, antes de virarem churn</span></li>
      </ul>
    </div>
    <small class="lg-foot">Dados ilustrativos no modo demonstração.</small>
  </section>
  <main class="lg-main">
    <div class="lg-card">
      <div class="lg-brand lg-brand-m"><span class="brand-mk brand-g" aria-hidden="true">G</span><b>Gmarketing</b></div>
      <h1>Entrar</h1>
      <p class="lg-sub">Use seu e-mail de trabalho e senha.</p>
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
  </main>
</div>`;
    const f = root.querySelector('form'), err = root.querySelector('.lg-err'), go = root.querySelector('.lg-go');
    const mostrar = m => { err.hidden = !m; err.textContent = m || ''; };
    const entrar = async (email, senha) => {
      go.disabled = true; go.textContent = 'Entrando…'; mostrar('');
      const r = await this.login(email, senha);
      go.disabled = false; go.textContent = 'Entrar';
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
    setTimeout(() => { if (!f.contains(document.activeElement)) f.email.focus(); }, 30);
  },
};

db._setUserProvider(() => auth.real());
if (CFG.debug) window.AOS_AUTH = auth;
export default auth;
