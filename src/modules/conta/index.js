// Minha conta (#/conta) — dados do acesso e "Verificação em duas etapas" (TOTP do Supabase Auth; no modo demonstração, simulado).
// Fora do menu lateral: acesso pelo menu do perfil, pela faixa de recomendação (Dono/Admin sem 2FA) e pela paleta.
// Decisão (26/11/2026): a verificação NÃO é obrigatória ainda (para não trancar os donos fora); Dono/Admin veem uma faixa
// recomendando até ativar. Quem tem um aplicativo verificado precisa do código de 6 dígitos no login (aal2).
import { auth, mfa, MFA_CODIGO_DEMO } from '../../core/auth.js';
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';
import { perms } from '../../core/perms.js';

const esc = fmt.esc;
const est = { fatores: null, carregando: false, erro: null, cadastro: null, erroCad: null, salvando: false };
let ouvinte = null;
async function carregar(refresh) {
  if (est.carregando) return; est.carregando = true; est.erro = null;
  try { est.fatores = await mfa.listar(); } catch (e) { est.erro = e.message || String(e); }
  est.carregando = false; refresh();
}
const rec = u => u && ['dono', 'admin'].includes(u.papel);

function cartao2fa(ctx) {
  const { ui } = ctx; const u = auth.real(); const l = (est.fatores || []).filter(f => f.verificado);
  const ativo = l.length > 0;
  const topo = `<div class="row between m-conta-st">${ativo ? ui.led('ok', 'Ativada · o login pede o código do aplicativo') : ui.led(rec(u) ? 'warn' : 'off', 'Desativada · o login pede só a senha')}</div>`;
  let corpo;
  if (est.fatores === null) corpo = est.erro ? ui.aviso({ tipo: 'err', titulo: 'Não foi possível ler a verificação', texto: `${est.erro} Atualize a página.` }) : `<p class="sm mut">Carregando…</p>`;
  else if (est.cadastro) {
    const c = est.cadastro;
    corpo = `<ol class="m-conta-passos">
<li><b>Instale um aplicativo autenticador</b> no celular: Google Authenticator, Microsoft Authenticator, 1Password ou Authy.</li>
<li><b>Escaneie o QR code</b> com o aplicativo (botão "+" › "Ler código QR").${c.demo ? ' <span class="mut">(Demonstração: QR fictício.)</span>' : ''}
<div class="m-conta-qr"><img src="${esc(c.qr)}" alt="QR code para o aplicativo autenticador" width="176" height="176"><div class="m-conta-sg"><span class="sm mut">Não consegue escanear? Digite esta chave no aplicativo:</span><code data-segredo>${esc(c.segredo)}</code></div></div></li>
<li><b>Digite o código de 6 números</b> que o aplicativo mostra para a Gmarketing.
<form class="m-conta-cf" novalidate>${ui.campo({ nome: 'codigo', rotulo: 'Código de 6 dígitos', placeholder: '000 000', obrigatorio: true, attrs: { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '7', 'data-codigo': '' }, dica: c.demo ? `Modo demonstração: use ${MFA_CODIGO_DEMO}.` : 'O código muda a cada 30 segundos.' })}
${est.erroCad ? `<p class="m-conta-err" role="alert">${esc(est.erroCad)}</p>` : ''}
<div class="row">${ui.btn({ rotulo: est.salvando ? 'Verificando…' : 'Ativar verificação', icone: 'check', tipo: 'pri', submit: true, disabled: est.salvando })}${ui.btn({ rotulo: 'Cancelar', tipo: 'ghost', attrs: { 'data-cancelar': '' } })}</div></form></li></ol>`;
  } else if (ativo) {
    corpo = `<table class="tbl densa m-conta-fat"><thead><tr><th>Aplicativo</th><th>Ativado em</th><th></th></tr></thead><tbody>${l.map(f => `<tr><td><b>${esc(String(f.nome).split(' · ')[0])}</b></td><td class="num">${f.criadoEm ? fmt.data(f.criadoEm) : '—'}</td><td class="n">${ui.btn({ rotulo: 'Remover', sm: true, tipo: 'ghost', icone: 'trash', attrs: { 'data-remover': f.id } })}</td></tr>`).join('')}</tbody></table>
<p class="sm mut">Trocou de celular? Ative no aparelho novo antes de remover o antigo. Perdeu o celular? Peça ao administrador para remover a verificação do seu acesso.</p>`;
  } else {
    corpo = `<p>Além da senha, o login passa a pedir um código de 6 números que muda a cada 30 segundos no seu celular. Mesmo que alguém descubra sua senha, não entra sem o seu celular.</p>
${rec(u) ? ui.aviso({ tipo: 'warn', titulo: 'Fortemente recomendado para o seu papel', texto: `Como ${perms.rotuloPapel(u.papel)}, você vê o faturamento e pode mudar acessos da equipe. Leva 1 minuto.` }) : ''}
<div class="row">${ui.btn({ rotulo: 'Ativar verificação em duas etapas', icone: 'shield', tipo: 'pri', attrs: { 'data-iniciar': '' } })}</div>`;
  }
  return ui.card({ titulo: 'Verificação em duas etapas', icone: 'shield', sub: 'Código do aplicativo autenticador no login', ajuda: 'Padrão TOTP (RFC 6238), o mesmo do Google e dos bancos. O código é conferido pelo Supabase Auth; o app não guarda nenhum segredo.', corpo: `<div class="stack">${topo}${corpo}</div>` });
}

export default {
  id: 'conta', titulo: 'Minha conta', icone: 'user', grupo: 'sistema', rota: 'conta', perm: 'notificacoes', menu: false,
  palavras: ['verificação em duas etapas', '2fa', 'autenticador', 'segurança', 'minha conta'],
  routes: ['conta'],
  render(ctx) {
    const { ui } = ctx; const u = auth.real();
    if (!u) return '';
    if (est.fatores === null && !est.carregando && !est.erro) carregar(() => ctx.refresh());
    return `<div class="pg m-conta">${ui.cabecalho({ titulo: 'Minha conta', sub: 'Seus dados de acesso e a segurança do seu login.' })}
<div class="g-2-1">${cartao2fa(ctx)}
${ui.card({ titulo: 'Acesso', icone: 'user', corpo: ui.pares([['Nome', esc(u.nome)], ['E-mail', esc(u.email || '—')], ['Papel', esc(perms.rotuloPapel(u.papel))], ['Modo', db.dadosDemo ? 'Demonstração (dados ilustrativos)' : 'Produção']]) })}</div></div>`;
  },
  mount(el, ctx) {
    const re = () => ctx.refresh();
    const onClick = async e => {
      const t = e.target;
      if (t.closest('[data-iniciar]')) {
        try { est.cadastro = await mfa.iniciar('Celular'); est.erroCad = null; } catch (er) { ctx.ui.toast(er.message || String(er), { tipo: 'err' }); }
        re(); setTimeout(() => { const i = document.querySelector('.m-conta [data-codigo]'); if (i) i.focus(); }, 30); return;
      }
      if (t.closest('[data-cancelar]')) { est.cadastro = null; est.erroCad = null; re(); return; }
      const rm = t.closest('[data-remover]');
      if (rm) {
        const ok = await ctx.ui.modal({ titulo: 'Remover a verificação em duas etapas?', perigo: true, confirmar: 'Remover', largura: 'sm', corpo: '<p>O login volta a pedir só a senha. Você pode ativar de novo quando quiser.</p>' });
        if (!ok) return;
        const r = await mfa.remover(rm.dataset.remover);
        if (!r.ok) { ctx.ui.toast(r.erro, { tipo: 'err' }); return; }
        est.fatores = null; ctx.ui.toast('Verificação em duas etapas removida.', { tipo: 'info' }); carregar(re);
      }
    };
    const onSub = async e => {
      const f = e.target.closest('.m-conta-cf'); if (!f) return; e.preventDefault();
      if (est.salvando) return; est.salvando = true; est.erroCad = null;
      const cod = f.querySelector('[data-codigo]').value;
      const r = await mfa.confirmar(est.cadastro.id, cod, 'Celular');
      est.salvando = false;
      if (!r.ok) { est.erroCad = r.erro; re(); setTimeout(() => { const i = document.querySelector('.m-conta [data-codigo]'); if (i) { i.setAttribute('aria-invalid', 'true'); i.focus(); } }, 30); return; }
      est.cadastro = null; est.fatores = null;
      ctx.ui.toast('Verificação em duas etapas ativada. No próximo login o app vai pedir o código.', { tipo: 'ok' });
      carregar(re);
    };
    const onInput = e => { const i = e.target.closest('[data-codigo]'); if (!i) return; const v = i.value.replace(/\D/g, '').slice(0, 6); i.value = v.length > 3 ? `${v.slice(0, 3)} ${v.slice(3)}` : v; };
    el.addEventListener('click', onClick); el.addEventListener('submit', onSub); el.addEventListener('input', onInput);
    if (ouvinte) ouvinte(); ouvinte = auth.onChange(() => { if (!auth.real()) { est.fatores = null; est.cadastro = null; } });
    return () => { el.removeEventListener('click', onClick); el.removeEventListener('submit', onSub); el.removeEventListener('input', onInput); };
  },
};
