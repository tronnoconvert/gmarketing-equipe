// comum.js — constantes e utilitários compartilhados pelas abas da Administração.
import { db } from '../../core/store.js';
import { toast } from '../../core/ui.js';

/**
 * Coleção → módulo de permissão. Mesmo mapa usado no servidor (supabase/policies.sql, tabela public.col_modules).
 * O primeiro módulo da lista é o "dono" (usado na Auditoria para rotular o módulo).
 */
export const COL_MOD = {
  users: ['admin'], team: ['equipe', 'admin'], invites: ['admin'], settings: ['admin'],
  clients: ['clientes'], contacts: ['clientes'], contracts: ['clientes'], services: ['clientes'], healthHistory: ['clientes'],
  meetings: ['clientes'], onboarding: ['clientes'], clientResults: ['clientes'], clientActions: ['clientes'],
  deliveries: ['operacao'], tasks: ['operacao'], projects: ['operacao'], timeEntries: ['operacao', 'equipe'],
  goals: ['equipe'], checkins: ['equipe'], oneOnOnes: ['equipe'], teamStats: ['equipe'],
  invoices: ['financeiro'], payables: ['financeiro'], cash: ['financeiro'], mrrMoves: ['financeiro'], finance: ['financeiro'], costs: ['financeiro'],
  deals: ['comercial'], routines: ['torre'], routineRuns: ['torre'], integrations: ['torre'],
  alerts: ['alertas'], alertRules: ['alertas'], insights: ['alertas'],
  webinars: ['webinars'], webinarDaily: ['webinars'],
  campaignAccount: ['campanha'], campaignDaily: ['campanha'], campaigns: ['campanha'], creatives: ['campanha'],
  notifications: ['notificacoes'], comments: ['notificacoes'], activity: ['admin'],
};
export const MOD_ROTULO = {
  cockpit: 'Cockpit', financeiro: 'Financeiro', clientes: 'Clientes', operacao: 'Operação', equipe: 'Equipe', torre: 'Torre de Controle', torre_voo: 'Painel de Voo',
  comercial: 'Comercial', alertas: 'Alertas', webinars: 'Webinars', campanha: 'Campanha', notificacoes: 'Notificações', admin: 'Administração',
};
export const modDaCol = col => (COL_MOD[col] || ['admin'])[0];

/** link para o registro citado em activity (quando existe rota) */
export function linkRef(col, id) {
  if (!id) return '';
  const m = {
    clients: `#/clientes/${id}`, team: `#/equipe/${id}`, users: '#/admin/usuarios', routines: `#/torre/rotina/${id}`,
    webinars: `#/webinars/${id}`, tasks: `#/operacao/quadro?tarefa=${id}`, settings: id === 'perms' ? '#/admin/permissoes' : /^notif:/.test(id) ? `#/admin/notificacoes?pessoa=${id.slice(6)}` : '', invites: '#/admin/usuarios?f=convites',
    invoices: '#/financeiro/receber', deals: '#/comercial', integrations: '#/admin/integracoes', campaigns: '#/campanha/campanhas',
  };
  return m[col] || '';
}

/** integrações de servidor: só o STATUS chega ao navegador; as chaves ficam nas Edge Functions */
export const INTEGRACOES = [
  { id: 'windsor', nome: 'Windsor.ai', icone: 'chart', uso: 'Dados da conta de Campanha (Meta Ads via Windsor).', funcao: 'windsor-proxy', envs: ['WINDSOR_API_KEY'], opc: ['WINDSOR_ACCOUNT_ID'], casa: /windsor/i },
  { id: 'monday', nome: 'monday.com', icone: 'grid', uso: 'Sincroniza o cadastro de clientes e o Painel de Voo (quadros 18425955775 e 18425955783).', funcao: 'monday-sync', envs: ['MONDAY_API_TOKEN'], opc: ['MONDAY_BOARD_IDS'], casa: /monday/i },
  { id: 'meta', nome: 'Meta Ads', icone: 'megaphone', uso: 'Leads dos formulários e métricas das contas dos clientes.', funcao: 'routines-runner', envs: ['META_ACCESS_TOKEN'], opc: ['META_APP_ID', 'META_APP_SECRET'], casa: /meta/i },
  { id: 'whatsapp', nome: 'WhatsApp API', icone: 'message', uso: 'Envio de notificações e do resumo diário por WhatsApp (Z-API ou Twilio).', funcao: 'notify', envs: ['ZAPI_INSTANCE_ID', 'ZAPI_TOKEN', 'ZAPI_CLIENT_TOKEN'], alt: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'], casa: /whats/i },
  { id: 'slack', nome: 'Slack', icone: 'hash', uso: 'Alertas da Torre e das regras no canal da equipe.', funcao: 'notify', envs: ['SLACK_WEBHOOK_URL'], casa: /slack/i },
  { id: 'email', nome: 'E-mail (Resend ou SMTP)', icone: 'mail', uso: 'Convites, redefinição de senha e notificações por e-mail.', funcao: 'notify', envs: ['RESEND_API_KEY', 'EMAIL_FROM'], alt: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'], casa: /e-?mail|smtp|resend/i },
];

/** status simulado no modo demonstração (usa a coleção integrations da Torre quando houver o mesmo nome) */
const DEMO_PADRAO = { windsor: ['off', 'Não configurado', 'A conta de Campanha será informada depois.'], monday: ['ok', 'Configurado', ''], meta: ['err', 'Token expirado', 'OAuthException 190: reconecte o Meta Ads e atualize META_ACCESS_TOKEN.'], whatsapp: ['ok', 'Configurado', ''], slack: ['off', 'Não configurado', ''], email: ['ok', 'Configurado', ''] };
export function statusDemo(it) {
  const torre = db.list('integrations', x => it.casa.test(String(x.nome || x.titulo || x.id || '')))[0];
  const salvo = (db.config('admin.integracoes', {}) || {})[it.id] || {};
  // sem dados de exemplo (teste "produção vazia") não há estado simulado a mostrar: neutro até haver um registro real
  let [estado, rotulo, detalhe] = db.dadosDemo ? DEMO_PADRAO[it.id] : ['off', 'Não verificado', 'Sem servidor neste ambiente.'];
  if (torre && torre.estado) { estado = torre.ativo === false ? 'off' : torre.estado; rotulo = estado === 'ok' ? 'Configurado' : estado === 'off' ? 'Desativado' : estado === 'warn' ? 'Atenção' : 'Com erro'; detalhe = torre.erro || torre.detalhe || torre.status || detalhe; }
  return { estado, rotulo, detalhe, verificadoEm: salvo.verificadoEm || null, configurado: estado !== 'off' };
}

/* ---------------- senhas, cópia, download ---------------- */
export function gerarSenha() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz', D = '23456789', S = '!@#$%*?';
  const pick = (s, n) => Array.from({ length: n }, () => s[Math.floor(rnd() * s.length)]).join('');
  const raw = pick(L, 6) + pick(D, 3) + pick(S, 1) + pick(L, 2);
  return raw.split('').sort(() => rnd() - 0.5).join('');
}
function rnd() { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32; } catch (e) { return Math.random(); } }

export async function copiar(texto, msg = 'Copiado.') {
  try { await navigator.clipboard.writeText(texto); toast(msg); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = texto; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* */ } ta.remove();
    toast(ok ? msg : 'Não foi possível copiar automaticamente. Selecione o texto e use Ctrl+C.', { tipo: ok ? 'ok' : 'warn' }); return ok;
  }
}
export function baixar(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob([conteudo], { type: tipo }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- CSV ---------------- */
/** gera CSV com ; (padrão do Excel em pt-BR) e BOM para acentos */
export function paraCsv(linhas, cols) {
  const q = v => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [cols.map(c => q(c.l)).join(';'), ...linhas.map(r => cols.map(c => q(c.v(r))).join(';'))].join('\r\n');
}
/** lê CSV (separador ; ou , detectado pela 1ª linha), com aspas. -> array de arrays */
export function lerCsv(texto) {
  const t = String(texto || '').replace(/^﻿/, '');
  const prim = t.split(/\r?\n/)[0] || '';
  const sep = (prim.match(/;/g) || []).length >= (prim.match(/,/g) || []).length ? ';' : ',';
  const out = []; let lin = [], cel = '', aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) { if (c === '"') { if (t[i + 1] === '"') { cel += '"'; i++; } else aspas = false; } else cel += c; continue; }
    if (c === '"') aspas = true;
    else if (c === sep) { lin.push(cel); cel = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; lin.push(cel); cel = ''; if (lin.some(x => x.trim() !== '')) out.push(lin); lin = []; }
    else cel += c;
  }
  lin.push(cel); if (lin.some(x => x.trim() !== '')) out.push(lin);
  return out.map(l => l.map(x => x.trim()));
}
