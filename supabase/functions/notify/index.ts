// notify — envia por WhatsApp, e-mail e/ou Slack notificações que o app já gravou em `notifications`.
// Chamado pelo front (src/core/notify.js → functions.invoke('notify', {body: {ids, canais}})) ou pelo servidor.
//   POST {ids: string[], canais?: ('whatsapp'|'email'|'slack')[]}
// Regras: quem chama precisa ser o remetente das notificações (campo `de`) ou Dono/Admin; o servidor pode tudo.
// Cada destinatário recebe só pelos canais ligados nas preferências (settings notif:<userId>) e fora do horário
// de silêncio (prioridade alta fura, se a pessoa permitiu). Sem provedor configurado = no-op com log.
import { corpo, HttpError, json, lista, servir } from '../_shared/http.ts';
import { chamador, obter, gravar, type Obj } from '../_shared/supa.ts';
import { enviarParaUsuario, type Canal, type Resultado } from '../_shared/envio.ts';

const VALIDOS: Canal[] = ['whatsapp', 'email', 'slack'];

Deno.serve(servir(async (req) => {
  const c = await chamador(req);
  const b = await corpo(req);
  const ids = lista(b.ids, 'ids', 200).filter((x) => /^[\w-]{1,80}$/.test(x));
  if (!ids.length) throw new HttpError(400, 'Informe "ids" com as notificações a enviar.', 'validacao');
  const pedidos = lista(b.canais, 'canais', 3) as Canal[];
  const invalidos = pedidos.filter((x) => !VALIDOS.includes(x));
  if (invalidos.length) throw new HttpError(400, `Canal inválido: ${invalidos.join(', ')}. Use whatsapp, email ou slack.`, 'validacao');
  const org = c.sistema ? String(b.orgId ?? '') : c.perfil!.org_id;
  if (!org) throw new HttpError(400, 'Informe orgId (chamada do servidor).', 'validacao');
  const admin = c.sistema || ['dono', 'admin'].includes(c.perfil!.papel);

  const resultados: (Resultado & { notificacao: string })[] = [];
  for (const id of ids) {
    const n = await obter(org, 'notifications', id) as (Obj & { para?: string; de?: string | null; titulo?: string; texto?: string; link?: string; prioridade?: 'normal' | 'alta'; tipo?: string; canais?: string[] }) | null;
    if (!n) { resultados.push({ notificacao: id, canal: 'app', para: '', ok: false, status: 'pulado', detalhe: 'notificação não encontrada' }); continue; }
    if (!admin && n.de !== c.perfil!.app_user_id) throw new HttpError(403, 'Você só pode disparar notificações que você mesmo enviou.', 'sem_permissao');
    const canais = (pedidos.length ? pedidos : (n.canais ?? []).filter((x): x is Canal => VALIDOS.includes(x as Canal)));
    if (!canais.length) continue;
    const r = await enviarParaUsuario(org, String(n.para), canais, { titulo: String(n.titulo ?? 'Notificação'), texto: n.texto, link: n.link, prioridade: n.prioridade, tipo: n.tipo, semRedigir: n.valorProprio === 'comissao' });
    resultados.push(...r.map((x) => ({ ...x, notificacao: id })));
    // registra o resultado na própria notificação (o app mostra "enviado por WhatsApp" se quiser)
    await gravar(org, 'notifications', [{ ...n, entregas: r.map((x) => ({ canal: x.canal, status: x.status, detalhe: x.detalhe ?? null, quando: new Date().toISOString() })) }]);
  }
  const enviados = resultados.filter((r) => r.ok).length;
  return json({ ok: true, enviados, resultados });
}));
