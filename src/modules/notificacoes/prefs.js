// prefs.js — preferências de notificação por pessoa (settings `notif:<userId>`).
// Usado pela central (#/notificacoes) e por Administração › Notificações. A Edge Function `notify` lê o mesmo registro no servidor.
import { db } from '../../core/store.js';
import { ui } from '../../core/ui.js';
import { esc } from '../../core/fmt.js';

export const TIPOS_PREF = [
  { id: 'mencao', rotulo: 'Menções', desc: 'Alguém escreveu @seu nome num comentário.' },
  { id: 'atribuicao', rotulo: 'Atribuições', desc: 'Uma tarefa, reunião ou cliente foi atribuído a você.' },
  { id: 'alerta', rotulo: 'Alertas', desc: 'Regras de alerta, rotinas e integrações com falha.' },
  { id: 'mensagem', rotulo: 'Mensagens', desc: 'Mensagens diretas e "Notificar alguém".' },
  { id: 'sistema', rotulo: 'Sistema', desc: 'Avisos de acesso, rotinas atrasadas e manutenção.' },
];
export const CANAIS_PREF = [
  { id: 'app', rotulo: 'App' }, { id: 'whatsapp', rotulo: 'WhatsApp' }, { id: 'email', rotulo: 'E-mail' }, { id: 'slack', rotulo: 'Slack' },
];
const chave = uid => `notif:${uid}`;

export function padrao(papel) {
  const forte = papel === 'dono' || papel === 'admin';
  const t = (whatsapp, email, slack = false) => ({ app: true, whatsapp, email, slack });
  return {
    tipos: { mencao: t(false, true), atribuicao: t(false, true), alerta: t(forte, false, forte), mensagem: t(false, false), sistema: t(false, false) },
    silencio: { ativo: true, de: '22:00', ate: '07:00', furarAlta: true },
    resumoDiario: forte,
    resumoHora: '08:00',
  };
}
/** preferências efetivas (padrão do papel + o que a pessoa salvou) */
export function lerPrefs(userId) {
  const u = db.get('users', userId) || {};
  const p = padrao(u.papel);
  const s = db.config(chave(userId), null);
  if (!s) return Object.assign(p, { salvo: false });
  const tipos = {}; for (const t of TIPOS_PREF) tipos[t.id] = Object.assign({}, p.tipos[t.id], (s.tipos || {})[t.id] || {});
  return { tipos, silencio: Object.assign({}, p.silencio, s.silencio || {}), resumoDiario: s.resumoDiario ?? p.resumoDiario, resumoHora: s.resumoHora || p.resumoHora, salvo: true, atualizadoEm: s.atualizadoEm };
}
export function salvarPrefs(userId, prefs, opts = {}) {
  const antes = db.config(chave(userId), null);
  const v = { tipos: prefs.tipos, silencio: prefs.silencio, resumoDiario: !!prefs.resumoDiario, resumoHora: prefs.resumoHora || '08:00', atualizadoEm: new Date().toISOString() };
  db.setConfig(chave(userId), v, { log: opts.log || 'alterou preferências de notificação' });
  return antes;
}
export function restaurarPrefs(userId, antes) {
  if (antes) db.setConfig(chave(userId), antes); else db.remove('settings', chave(userId));
}
/** canais com algum tipo ligado -> ['App', 'E-mail'] */
export function resumoCanais(p) {
  return CANAIS_PREF.filter(c => TIPOS_PREF.some(t => p.tipos[t.id] && p.tipos[t.id][c.id])).map(c => c.rotulo);
}

/** HTML do formulário (sem <form>): matriz tipo × canal, silêncio e resumo diário */
export function formPrefsHtml(userId, o = {}) {
  const p = lerPrefs(userId);
  const u = db.get('users', userId) || {};
  const t = u.teamId ? db.get('team', u.teamId) : null;
  const semWhats = !(t && t.telefone);
  const dis = o.somenteLeitura;
  const cab = CANAIS_PREF.map(c => `<th scope="col" class="m-ntp-c">${esc(c.rotulo)}</th>`).join('');
  const linhas = TIPOS_PREF.map(tp => `<tr><th scope="row"><b>${esc(tp.rotulo)}</b><span class="sub">${esc(tp.desc)}</span></th>${CANAIS_PREF.map(c => {
    const on = p.tipos[tp.id] && p.tipos[tp.id][c.id];
    const trava = c.id === 'app' && tp.id === 'alerta';
    return `<td class="m-ntp-c" data-l="${esc(c.rotulo)}"><label class="m-ntp-ck"><input type="checkbox" name="t.${tp.id}.${c.id}"${on ? ' checked' : ''}${dis || trava ? ' disabled' : ''} aria-label="${esc(tp.rotulo)} por ${esc(c.rotulo)}"></label></td>`;
  }).join('')}</tr>`).join('');
  return `<div class="m-ntp">
<div class="m-ntp-tw"><table class="m-ntp-t"><thead><tr><th scope="col">Evento</th>${cab}</tr></thead><tbody>${linhas}</tbody></table></div>
<p class="m-ntp-n mut sm">${ui.ic('info')}<span>Alertas no app ficam sempre ligados. ${semWhats ? 'WhatsApp precisa de um telefone no cadastro da equipe. ' : ''}Slack posta no canal da equipe configurado no servidor.</span></p>
<p class="m-ntp-n mut sm" data-ntp-som>${ui.ic('vol')}<span>Notificação nova de outra pessoa toca um aviso sonoro curto no app (sempre ligado, uma vez por notificação).</span></p>
<fieldset class="m-ntp-q"><legend>Horário de silêncio</legend>
<label class="ck"><input type="checkbox" name="sil.ativo"${p.silencio.ativo ? ' checked' : ''}${dis ? ' disabled' : ''}><span>Não enviar WhatsApp, e-mail nem Slack entre</span></label>
<div class="row m-ntp-h"><input type="text" inputmode="numeric" maxlength="5" placeholder="22:00" data-m-hora name="sil.de" value="${esc(p.silencio.de)}" aria-label="Início do silêncio (hh:mm)"${dis ? ' disabled' : ''}><span class="mut">e</span><input type="text" inputmode="numeric" maxlength="5" placeholder="07:00" data-m-hora name="sil.ate" value="${esc(p.silencio.ate)}" aria-label="Fim do silêncio (hh:mm)"${dis ? ' disabled' : ''}></div>
<label class="ck"><input type="checkbox" name="sil.furarAlta"${p.silencio.furarAlta ? ' checked' : ''}${dis ? ' disabled' : ''}><span>Prioridade alta chega mesmo no silêncio</span></label></fieldset>
<fieldset class="m-ntp-q"><legend>Resumo diário</legend>
<label class="ck"><input type="checkbox" name="resumoDiario"${p.resumoDiario ? ' checked' : ''}${dis ? ' disabled' : ''}><span>Receber um resumo do que ficou sem leitura, todo dia às</span></label>
<div class="row m-ntp-h m-ntp-rh"><input type="text" inputmode="numeric" maxlength="5" placeholder="08:00" data-m-hora name="resumoHora" value="${esc(p.resumoHora)}" aria-label="Horário do resumo diário (hh:mm)"${dis ? ' disabled' : ''}><span class="mut sm">por e-mail ou WhatsApp, conforme os canais acima. Só envia se houver algo não lido.</span></div></fieldset>
</div>`;
}
/** lê o formulário e valida. -> {ok, erro, prefs} */
export function lerFormPrefs(el) {
  const tipos = {};
  for (const tp of TIPOS_PREF) { tipos[tp.id] = {}; for (const c of CANAIS_PREF) { const i = el.querySelector(`[name="t.${tp.id}.${c.id}"]`); tipos[tp.id][c.id] = !!(i && i.checked); } }
  tipos.alerta.app = true;
  const v = n => (el.querySelector(`[name="${n}"]`) || {});
  const silencio = { ativo: !!v('sil.ativo').checked, de: v('sil.de').value || '22:00', ate: v('sil.ate').value || '07:00', furarAlta: !!v('sil.furarAlta').checked };
  const hh = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (silencio.ativo && (!hh.test(silencio.de) || !hh.test(silencio.ate))) return { ok: false, erro: 'Horário inválido. Use hh:mm de 00:00 a 23:59 (ex.: 22:00).' };
  if (silencio.ativo && silencio.de === silencio.ate) return { ok: false, erro: 'O início e o fim do silêncio não podem ser iguais. Ajuste os horários.' };
  const resumoDiario = !!v('resumoDiario').checked; const resumoHora = v('resumoHora').value || '08:00';
  if (resumoDiario && !hh.test(resumoHora)) return { ok: false, erro: 'Horário do resumo diário inválido. Use hh:mm (ex.: 08:00).' };
  return { ok: true, prefs: { tipos, silencio, resumoDiario, resumoHora } };
}

/** máscara hh:mm para os campos de horário (delegada no documento, vale para modal e página) */
if (typeof document !== 'undefined') document.addEventListener('input', e => {
  const i = e.target; if (!i.matches || !i.matches('[data-m-hora]')) return;
  const d = i.value.replace(/\D/g, '').slice(0, 4); i.value = d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
});

/** abre o editor num modal e salva com Desfazer */
export async function abrirPrefs(userId) {
  const u = db.get('users', userId); if (!u) return false;
  let antes;
  const ok = await ui.modal({
    titulo: 'Preferências de notificação', sub: u.nome, largura: 'lg', confirmar: 'Salvar preferências',
    corpo: `<form class="m-ntp-f" novalidate>${formPrefsHtml(userId)}</form>`,
    onConfirmar: box => { const r = lerFormPrefs(box); if (!r.ok) return r.erro; antes = salvarPrefs(userId, r.prefs); return true; },
  });
  if (ok) ui.toast('Preferências salvas.', { desfazer: () => restaurarPrefs(userId, antes) });
  return ok;
}
