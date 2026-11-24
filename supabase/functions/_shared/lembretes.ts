// _shared/lembretes.ts — lembretes automáticos de vencimento por WhatsApp para o CLIENTE (Financeiro › Automação).
// Espelho de src/modules/financeiro/lembretes.js (mantenha as regras iguais).
// Config em settings 'financeiro.lembretes' = { ativo, quando: ['antes','dia','depois'], hora: 'HH:MM', modelo }.
// Chamado pela routines-runner (a cada 15 min): envia a partir do horário configurado (fuso TZ_AGENCIA), uma vez por
// fatura + tipo + dia (o registro em invoices.lembretes[] com {tipo, dia} é a trava de idempotência).
import { env } from './http.ts';
import { gravar, listar, obter, auditar, type Obj } from './supa.ts';
import { whatsapp } from './envio.ts';

export const RODAPE = '⚠️ Mensagem automática — por favor, não responda. Dúvidas: fale com {responsavel}.';
export const MODELO_PADRAO = 'Olá, {cliente}! Passando para lembrar da mensalidade de {valor}, com vencimento em {vencimento}. Para pagar por boleto ou Pix, use o link: {link_boleto}';
const TIPOS_PADRAO: Record<string, number> = { antes: 3, dia: 0, depois: -3 };
/** dias antes/depois da central "Padrões e regras" (settings 'padroes': financeiro.lembrete.antes / .depois) */
export function tiposDe(padroes?: Record<string, unknown> | null): Record<string, number> {
  const n = (k: string, d: number) => { const v = Number(padroes?.[k]); return Number.isFinite(v) && v >= 1 && v <= 30 ? v : d; };
  return { antes: n('financeiro.lembrete.antes', 3), dia: 0, depois: -n('financeiro.lembrete.depois', 3) };
}
const TZ = () => env('TZ_AGENCIA') ?? 'America/Sao_Paulo';

/** data (aaaa-mm-dd) e hora (HH:MM) locais da agência */
export function agoraLocal(d = new Date()): { dia: string; hora: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate.slice(0, 10)}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 864e5);
const brl2 = (v: number) => `R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;
const dataBR = (iso: string) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

export function tipoDoDia(f: Obj, hoje: string, quando: string[], TIPOS: Record<string, number> = TIPOS_PADRAO): string | null {
  if (!f || f.status === 'paga' || !f.clientId || !f.vencimento) return null;
  if (!/mensalidade/i.test(String(f.descricao ?? '')) && f.tipo !== 'mensalidade') return null;
  const d = diasEntre(hoje, String(f.vencimento));
  const t = Object.keys(TIPOS).find((k) => TIPOS[k] === d);
  return t && quando.includes(t) ? t : null;
}
export function montarMensagem(modelo: string, dados: Record<string, string>): string {
  const corpo = String(modelo || MODELO_PADRAO).replace(/\{(\w+)\}/g, (m, k) => (k !== 'responsavel' && dados[k] != null ? dados[k] : m)).trim();
  return `${corpo}\n\n${RODAPE.replace('{responsavel}', dados.responsavel)}`;
}
function destinatario(contatos: Obj[]): { nome: string; telefone: string; papel: string } | null {
  const tel = (c: Obj) => String(typeof c.whatsapp === 'string' ? c.whatsapp : (c.telefone ?? c.celular ?? ''));
  const ok = (c: Obj) => c.whatsapp !== false && !!tel(c);
  const fin = contatos.find((c) => /financ/i.test(`${c.papel ?? ''} ${c.cargo ?? ''}`) && ok(c));
  const dec = contatos.find((c) => /decisor/i.test(String(c.papel ?? '')) && ok(c));
  const pri = contatos.find((c) => c.principal && ok(c)) ?? contatos.find(ok);
  const c = fin ?? dec ?? pri;
  return c ? { nome: String(c.nome ?? ''), telefone: tel(c), papel: fin ? 'financeiro' : dec ? 'decisor' : 'principal' } : null;
}

/** roda os lembretes de uma organização. Retorna contadores para o log da routines-runner. */
export async function rodarLembretes(org: string, o: { dryRun: boolean; agora?: Date }) {
  const cfgRec = await obter(org, 'settings', 'financeiro.lembretes');
  const padroesRec = await obter(org, 'settings', 'padroes');
  const tipos = tiposDe((padroesRec?.valor as Record<string, unknown>) ?? null);
  const cfg = { ativo: false, quando: ['antes', 'dia', 'depois'], hora: '09:00', modelo: MODELO_PADRAO, ...((cfgRec?.valor as Record<string, unknown>) ?? {}) } as { ativo: boolean; quando: string[]; hora: string; modelo: string };
  const r = { ativo: !!cfg.ativo, elegiveis: 0, enviados: 0, falhas: 0, semContato: 0, jaEnviados: 0, foraDoHorario: false };
  if (!cfg.ativo) return r;
  const { dia, hora } = agoraLocal(o.agora);
  if (hora < String(cfg.hora || '09:00')) { r.foraDoHorario = true; return r; }
  const [faturas, clientes, contatos, time] = await Promise.all([listar(org, 'invoices'), listar(org, 'clients'), listar(org, 'contacts'), listar(org, 'team')]);
  const base = (env('PAGAMENTO_URL_BASE') ?? '').replace(/\/$/, '');
  const atualizadas: Obj[] = [];
  for (const f of faturas) {
    const tipo = tipoDoDia(f, dia, Array.isArray(cfg.quando) ? cfg.quando : [], tipos);
    if (!tipo) continue;
    r.elegiveis++;
    const lst = Array.isArray(f.lembretes) ? f.lembretes as Obj[] : [];
    if (lst.some((l) => l.tipo === tipo && (l.dia ?? String(l.quando ?? '').slice(0, 10)) === dia)) { r.jaEnviados++; continue; }
    const cli = clientes.find((c) => c.id === f.clientId);
    const para = destinatario(contatos.filter((c) => c.clientId === f.clientId));
    if (!para) { r.semContato++; continue; }
    const resp = cli?.respId ? time.find((t) => t.id === cli.respId) : null;
    const link = String(f.linkBoleto ?? f.boletoUrl ?? (base ? `${base}/${encodeURIComponent(String(f.numero ?? f.id))}` : ''));
    const texto = montarMensagem(cfg.modelo, { cliente: String(cli?.nome ?? f.cliente ?? 'cliente'), valor: brl2(Number(f.valor)), vencimento: dataBR(String(f.vencimento)), link_boleto: link || '(link no e-mail da fatura)', responsavel: String(resp?.nome ?? 'o atendimento da agência') });
    if (o.dryRun) { r.enviados++; continue; }
    // o provedor (Z-API ou Twilio) já configurado; texto vai puro (sem título/prioridade)
    const res = await whatsapp(para.telefone, { titulo: texto });
    const status = res.ok ? 'enviado' : res.status === 'nao_configurado' ? 'falhou (WhatsApp não configurado)' : `falhou${res.detalhe ? ` (${res.detalhe})` : ''}`;
    if (res.ok) r.enviados++; else r.falhas++;
    atualizadas.push({ ...f, lembretes: [...lst, { quando: new Date().toISOString(), dia, canal: 'whatsapp', tipo, para: para.telefone, paraNome: para.nome, mensagem: texto, status, por: 'Lembrete automático' }] });
  }
  if (atualizadas.length) {
    await gravar(org, 'invoices', atualizadas);
    await auditar(org, { id: null, nome: 'Sistema' }, `enviou ${r.enviados} lembrete(s) automático(s) de vencimento por WhatsApp${r.falhas ? ` · ${r.falhas} falha(s)` : ''}`, 'invoices', null);
  }
  return r;
}
