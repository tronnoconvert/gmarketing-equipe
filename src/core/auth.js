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
      try { await db.reload(); } catch (e) { await sb.auth.signOut(); return { ok: false, erro: 'Entrou, mas não foi possível carregar seus dados. Tente de novo em instantes.' }; }
      u = db.find('users', x => x.authId === data.user.id || String(x.email).toLowerCase() === email);
      if (!u) { await sb.auth.signOut(); return { ok: false, erro: 'Seu acesso ainda não foi configurado. Peça ao administrador para criar seu perfil.' }; }
      if (u.ativo === false) { await sb.auth.signOut(); return { ok: false, erro: 'Seu acesso está desativado. Fale com o administrador para reativar.' }; }
      const { data: pf } = await sb.from('profiles').select('trocar_senha').eq('user_id', data.user.id).maybeSingle();
      if (pf && pf.trocar_senha) { pendente = { u }; return { ok: false, trocarSenha: true, user: pub(u) }; }
    } else {
      u = db.find('users', x => String(x.email).toLowerCase() === email);
      if (!u || u.senha !== senha) return { ok: false, erro: 'E-mail ou senha incorretos. Confira e tente de novo.' };
    }
    if (u.ativo === false) return { ok: false, erro: 'Seu acesso está desativado. Fale com o administrador para reativar.' };
    return this._entrar(u);
  },
  _entrar(u, extra = {}) {
    sess = { userId: u.id, verComo: null, desde: new Date().toISOString() };
    gravarSessao(sess);
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
      if (u && (!sess || sess.userId !== u.id)) { sess = { userId: u.id, verComo: null }; gravarSessao(sess); }
    } catch (e) { console.warn('[Gmarketing] sessão indisponível', e && e.message); }
  },

  /** tela de login; chama onOk() após entrar */
  renderLogin(root, onOk) {
    const demo = this.demo;
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
if (CFG.debug) window.AOS_AUTH = auth;
export default auth;
