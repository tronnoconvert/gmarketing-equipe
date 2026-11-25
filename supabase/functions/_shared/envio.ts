// _shared/envio.ts — canais externos (WhatsApp via Z-API ou Twilio, e-mail via Resend ou SMTP, Slack via webhook).
// Sem a variável de ambiente do provedor, o canal vira "no-op" com log (não quebra nada).
import { buscar, env } from './http.ts';
import { adminClient, obter, type Obj } from './supa.ts';

export type Canal = 'app' | 'whatsapp' | 'email' | 'slack';
export interface Resultado { canal: Canal; para: string; ok: boolean; status: 'enviado' | 'nao_configurado' | 'pulado' | 'falhou'; detalhe?: string }
export interface Mensagem { titulo: string; texto?: string; link?: string; prioridade?: 'normal' | 'alta'; tipo?: string; semRedigir?: boolean }

/* ---------------- receita: valores em R$ só para quem tem a permissão (mesma regra do app e do banco) ---------------- */
const RS = /R\$\s?[\d.,]+(\s?(mil|k))?(\/m[eê]s)?/gi;
const temRS = (t?: string) => /R\$\s?\d/.test(String(t ?? ''));
export function redigir(m: Mensagem): Mensagem {
  if (!temRS(m.titulo) && !temRS(m.texto)) return m;
  const partes = String(m.texto ?? '').split(' · ').filter((p) => !temRS(p));
  let texto = partes.join(' · ').replace(RS, 'valor restrito');
  if (!texto.trim()) texto = 'Valores visíveis só para administradores.';
  return { ...m, titulo: m.titulo.replace(RS, 'valor restrito'), texto };
}
async function veReceita(org: string, userId: string): Promise<boolean> {
  const { data, error } = await adminClient().rpc('usuario_ve_receita', { p_org: org, p_app_user: userId });
  if (error) { console.warn('[notify] usuario_ve_receita falhou; enviando sem valores', error.message); return false; }
  return data === true;
}

const APP_URL = () => env('APP_URL') ?? '';
const linkAbs = (l?: string) => (l && l.startsWith('#') && APP_URL() ? `${APP_URL().replace(/\/$/, '')}/${l}` : l ?? '');
const corpoTexto = (m: Mensagem) => [m.prioridade === 'alta' ? '⚠️ Prioridade alta' : '', m.titulo, m.texto ?? '', linkAbs(m.link)].filter(Boolean).join('\n');
const so = (s: string) => s.replace(/[^\d]/g, '');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function canaisConfigurados(): Record<Exclude<Canal, 'app'>, boolean> {
  return {
    whatsapp: !!((env('ZAPI_INSTANCE_ID') && env('ZAPI_TOKEN')) || (env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_WHATSAPP_FROM'))),
    email: !!((env('RESEND_API_KEY') || env('SMTP_HOST')) && env('EMAIL_FROM')),
    slack: !!env('SLACK_WEBHOOK_URL'),
  };
}

export async function whatsapp(telefone: string, m: Mensagem): Promise<Resultado> {
  const r: Resultado = { canal: 'whatsapp', para: telefone, ok: false, status: 'nao_configurado' };
  let fone = so(telefone); if (fone.length <= 11) fone = `55${fone}`;
  if (fone.length < 12) return { ...r, status: 'pulado', detalhe: 'telefone ausente ou inválido' };
  const txt = corpoTexto(m);
  if (env('ZAPI_INSTANCE_ID') && env('ZAPI_TOKEN')) {
    const url = `https://api.z-api.io/instances/${env('ZAPI_INSTANCE_ID')}/token/${env('ZAPI_TOKEN')}/send-text`;
    const res = await buscar(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(env('ZAPI_CLIENT_TOKEN') ? { 'Client-Token': env('ZAPI_CLIENT_TOKEN')! } : {}) }, body: JSON.stringify({ phone: fone, message: txt }) });
    return { ...r, ok: res.ok, status: res.ok ? 'enviado' : 'falhou', detalhe: res.ok ? 'Z-API' : `Z-API HTTP ${res.status}` };
  }
  if (env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_WHATSAPP_FROM')) {
    const sid = env('TWILIO_ACCOUNT_SID')!;
    const form = new URLSearchParams({ From: `whatsapp:${env('TWILIO_WHATSAPP_FROM')}`, To: `whatsapp:+${fone}`, Body: txt });
    const res = await buscar(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${btoa(`${sid}:${env('TWILIO_AUTH_TOKEN')}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    return { ...r, ok: res.ok, status: res.ok ? 'enviado' : 'falhou', detalhe: res.ok ? 'Twilio' : `Twilio HTTP ${res.status}` };
  }
  console.log('[notify] WhatsApp não configurado (ZAPI_* ou TWILIO_*); mensagem não enviada para', fone.slice(0, 4) + '…');
  return r;
}

export async function email(para: string, m: Mensagem): Promise<Resultado> {
  const r: Resultado = { canal: 'email', para, ok: false, status: 'nao_configurado' };
  if (!para || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(para)) return { ...r, status: 'pulado', detalhe: 'e-mail ausente ou inválido' };
  const from = env('EMAIL_FROM');
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#0F172A">${m.prioridade === 'alta' ? '<p style="color:#DC2626;font-weight:600">Prioridade alta</p>' : ''}<h2 style="font-size:17px;margin:0 0 8px">${esc(m.titulo)}</h2>${m.texto ? `<p>${esc(m.texto).replace(/\n/g, '<br>')}</p>` : ''}${m.link ? `<p><a href="${esc(linkAbs(m.link))}">Abrir no Agência OS</a></p>` : ''}<p style="color:#64748B;font-size:12px">Você recebe este e-mail pelas suas preferências de notificação.</p></div>`;
  if (env('RESEND_API_KEY') && from) {
    const res = await buscar('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [para], subject: m.titulo.slice(0, 140), html, text: corpoTexto(m) }) });
    return { ...r, ok: res.ok, status: res.ok ? 'enviado' : 'falhou', detalhe: res.ok ? 'Resend' : `Resend HTTP ${res.status}` };
  }
  if (env('SMTP_HOST') && from) {
    try {
      // Supabase bloqueia as portas 25 e 587; use SMTP com TLS na porta 465.
      const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
      const cli = new SMTPClient({ connection: { hostname: env('SMTP_HOST')!, port: Number(env('SMTP_PORT') ?? 465), tls: true, auth: { username: env('SMTP_USER') ?? '', password: env('SMTP_PASS') ?? '' } } });
      await cli.send({ from, to: para, subject: m.titulo.slice(0, 140), content: corpoTexto(m), html });
      await cli.close();
      return { ...r, ok: true, status: 'enviado', detalhe: 'SMTP' };
    } catch (e) {
      return { ...r, status: 'falhou', detalhe: `SMTP: ${(e as Error).message}` };
    }
  }
  console.log('[notify] E-mail não configurado (RESEND_API_KEY/SMTP_* + EMAIL_FROM); não enviado.');
  return r;
}

export async function slack(m: Mensagem, quem?: string): Promise<Resultado> {
  const r: Resultado = { canal: 'slack', para: 'canal', ok: false, status: 'nao_configurado' };
  const url = env('SLACK_WEBHOOK_URL');
  if (!url) { console.log('[notify] Slack não configurado (SLACK_WEBHOOK_URL); não enviado.'); return r; }
  const text = `${m.prioridade === 'alta' ? ':rotating_light: ' : ''}*${m.titulo}*${quem ? ` (para ${quem})` : ''}${m.texto ? `\n${m.texto}` : ''}${m.link && APP_URL() ? `\n<${linkAbs(m.link)}|Abrir no Agência OS>` : ''}`;
  const res = await buscar(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  return { ...r, ok: res.ok, status: res.ok ? 'enviado' : 'falhou', detalhe: res.ok ? undefined : `Slack HTTP ${res.status}` };
}

/* ---------------- preferências (settings notif:<userId>, mesmas do app) ---------------- */
interface Prefs { tipos?: Record<string, Record<string, boolean>>; silencio?: { ativo?: boolean; de?: string; ate?: string; furarAlta?: boolean } }

/** hora local "HH:MM" no fuso da agência */
function horaLocal(d = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: env('TZ_AGENCIA') ?? 'America/Sao_Paulo' }).format(d);
}
export function emSilencio(p: Prefs, agora = horaLocal()): boolean {
  const s = p.silencio; if (!s || !s.ativo || !s.de || !s.ate) return false;
  return s.de < s.ate ? agora >= s.de && agora < s.ate : agora >= s.de || agora < s.ate; // atravessa a meia-noite
}

/**
 * Envia uma mensagem para um usuário do app (id 'u-…') pelos canais pedidos, respeitando as preferências
 * (tipo × canal) e o horário de silêncio (prioridade alta fura, se a pessoa permitiu).
 */
export async function enviarParaUsuario(org: string, userId: string, canais: Canal[], m: Mensagem): Promise<Resultado[]> {
  const out: Resultado[] = [];
  const u = await obter(org, 'users', userId) as (Obj & { email?: string; teamId?: string; nome?: string; ativo?: boolean }) | null;
  if (!u || u.ativo === false) return [{ canal: 'app', para: userId, ok: false, status: 'pulado', detalhe: 'usuário inexistente ou inativo' }];
  const prefsRec = await obter(org, 'settings', `notif:${userId}`);
  const prefs = ((prefsRec?.valor as Prefs) ?? {}) as Prefs;
  const t = u.teamId ? await obter(org, 'team', String(u.teamId)) as (Obj & { telefone?: string }) | null : null;
  if (!m.semRedigir && (temRS(m.titulo) || temRS(m.texto)) && !(await veReceita(org, userId))) m = redigir(m);
  const silencio = emSilencio(prefs) && !(m.prioridade === 'alta' && prefs.silencio?.furarAlta !== false);
  for (const c of canais) {
    if (c === 'app') continue; // a notificação in-app já é o registro em `notifications`
    const pref = prefs.tipos?.[m.tipo ?? 'mensagem']?.[c];
    if (pref === false) { out.push({ canal: c, para: userId, ok: false, status: 'pulado', detalhe: 'desligado nas preferências' }); continue; }
    if (silencio) { out.push({ canal: c, para: userId, ok: false, status: 'pulado', detalhe: 'horário de silêncio' }); continue; }
    try {
      if (c === 'whatsapp') out.push(await whatsapp(String(t?.telefone ?? ''), m));
      else if (c === 'email') out.push(await email(String(u.email ?? ''), m));
      else if (c === 'slack') out.push(await slack(m, String(u.nome ?? '')));
    } catch (e) {
      out.push({ canal: c, para: userId, ok: false, status: 'falhou', detalhe: (e as Error).message });
    }
  }
  return out;
}
