// routines-runner — avaliador de regras de alerta (agendado, ex.: a cada 15 min via pg_cron + pg_net).
// Lê `alertRules` (as 7 regras essenciais do módulo Alertas) e os dados das coleções, cria/atualiza `alerts`,
// notifica os destinatários (in-app + canais da regra, respeitando preferências) e registra a execução em `routineRuns`.
// Quem pode chamar: agendador (x-cron-secret / service role) ou Dono/Admin ("Rodar agora").
// Também envia os lembretes automáticos de vencimento por WhatsApp para os clientes (Financeiro › Automação):
// no horário configurado, uma vez por fatura + tipo + dia (ver _shared/lembretes.ts).
// POST {orgId?, dryRun?: boolean, regras?: string[], lembretes?: boolean (padrão true)}
import { corpo, env, HttpError, json, lista, servir, texto } from '../_shared/http.ts';
import { auditar, chamador, exigirPapel, gravar, listar, novoId, orgs, type Obj } from '../_shared/supa.ts';
import { enviarParaUsuario, type Canal } from '../_shared/envio.ts';
import { avaliar } from '../_shared/regras.ts';
import { rodarLembretes } from '../_shared/lembretes.ts';

async function rodarOrg(org: string, o: { dryRun: boolean; regras: string[]; lembretes: boolean; quem: { id: string | null; nome: string } }) {
  const inicio = new Date().toISOString();
  const cols = ['alertRules', 'alerts', 'clients', 'tasks', 'deliveries', 'invoices', 'routines', 'integrations', 'teamStats', 'team', 'users', 'meetings', 'finance'];
  const d: Record<string, Obj[]> = {};
  for (const c of cols) d[c] = await listar(org, c);
  const regras = d.alertRules.filter((r) => !o.regras.length || o.regras.includes(r.id));
  const achados = avaliar(regras, d);
  const userDoTeam = (tid?: string | null) => (tid ? String(d.team.find((t) => t.id === tid)?.userId ?? d.users.find((u) => u.teamId === tid)?.id ?? '') : '');
  const existentes = new Map(d.alerts.map((a) => [a.id, a]));
  const novos: Obj[] = []; const atualizados: Obj[] = []; const notifs: Obj[] = []; const externos: { para: string; canais: Canal[]; n: Obj }[] = [];
  const agora = new Date().toISOString();

  for (const a of achados) {
    const id = `auto-${a.regraId}-${a.refId}`.slice(0, 120);
    const regra = regras.find((r) => r.id === a.regraId)!;
    const ex = existentes.get(id);
    if (ex && ex.resolvido !== true && ex.status !== 'resolvido') { atualizados.push({ ...ex, detalhe: a.detalhe, verificadoEm: agora }); continue; }
    if (ex && ex.adiadoAte && new Date(String(ex.adiadoAte)) > new Date()) continue;
    const paraTeam = [...new Set([...(Array.isArray(regra.destinatarios) ? regra.destinatarios as string[] : []), ...(regra.resp && a.respTeam ? [a.respTeam] : [])])];
    const alerta: Obj = { id, gravidade: regra.gravidade ?? 'warn', area: regra.area ?? 'Alertas', titulo: a.titulo, detalhe: a.detalhe, quando: agora, regraId: a.regraId, refCol: a.refCol, refId: a.refId, para: paraTeam, status: 'aberto', resolvido: false, atribuidoA: null, adiadoAte: null, acao: { rotulo: 'Abrir', href: a.link }, origem: 'routines-runner' };
    novos.push(alerta);
    const canais: Canal[] = Array.isArray(regra.canais) ? regra.canais as Canal[] : ['app'];
    for (const tid of paraTeam) {
      const uid = userDoTeam(tid); if (!uid) continue;
      const nn: Obj = { id: novoId('not'), para: uid, de: null, tipo: 'alerta', titulo: a.titulo, texto: a.detalhe, link: a.link, lida: false, prioridade: regra.gravidade === 'err' ? 'alta' : 'normal', quando: agora, canais, refCol: 'alerts', refId: id };
      notifs.push(nn);
      if (canais.some((c) => c !== 'app')) externos.push({ para: uid, canais, n: nn });
    }
  }

  // lembretes de vencimento para os clientes (falha aqui não derruba as regras de alerta)
  let lem: Awaited<ReturnType<typeof rodarLembretes>> | { erro: string } | null = null;
  if (o.lembretes) { try { lem = await rodarLembretes(org, { dryRun: o.dryRun }); } catch (e) { console.error('[routines-runner] lembretes', org, e); lem = { erro: (e as Error).message }; } }
  const lemTxt = lem && 'enviados' in lem && lem.ativo && !lem.foraDoHorario ? ` · ${lem.enviados} lembretes de vencimento` : lem && 'erro' in lem ? ' · lembretes de vencimento falharam' : '';

  let envios = 0;
  if (!o.dryRun) {
    await gravar(org, 'alerts', [...novos, ...atualizados]);
    await gravar(org, 'notifications', notifs);
    for (const e of externos) {
      const r = await enviarParaUsuario(org, e.para, e.canais, { titulo: String(e.n.titulo), texto: String(e.n.texto ?? ''), link: String(e.n.link ?? ''), prioridade: e.n.prioridade as 'normal' | 'alta', tipo: 'alerta' });
      envios += r.filter((x) => x.ok).length;
    }
    // contadores das regras
    const disparadas = new Set(novos.map((x) => x.regraId as string));
    if (disparadas.size) await gravar(org, 'alertRules', regras.filter((r) => disparadas.has(r.id)).map((r) => ({ ...r, ultimoDisparo: agora, disparos30: Number(r.disparos30 ?? 0) + novos.filter((x) => x.regraId === r.id).length })));
    await gravar(org, 'routineRuns', [{ id: novoId('run'), routineId: 'r-routines-runner', inicio, fim: new Date().toISOString(), estado: 'ok', resumo: `${regras.length} regras · ${novos.length} alertas novos · ${notifs.length} notificações · ${envios} envios externos${lemTxt}`, origem: 'routines-runner' }]);
    if (novos.length) await auditar(org, o.quem, `criou ${novos.length} alertas automáticos`, 'alerts', null);
  }
  return { org, regras: regras.length, achados: achados.length, novos: novos.length, jaAbertos: atualizados.length, notificacoes: notifs.length, envios, lembretes: lem, amostra: o.dryRun ? novos.slice(0, 10) : undefined };
}

Deno.serve(servir(async (req) => {
  const c = await chamador(req);
  exigirPapel(c, ['dono', 'admin']);
  const b = await corpo(req);
  const dryRun = b.dryRun === true || b.dryRun === 'true';
  const regras = lista(b.regras, 'regras', 20);
  const lembretes = !(b.lembretes === false || b.lembretes === 'false');
  const pedido = texto(b.orgId, 'orgId', { max: 60 });
  const alvo = c.sistema ? (pedido ? [pedido] : env('DEFAULT_ORG_ID') ? [env('DEFAULT_ORG_ID')!] : await orgs()) : [c.perfil!.org_id];
  if (!alvo.length) throw new HttpError(400, 'Nenhuma organização encontrada.', 'org');
  const quem = { id: c.perfil?.app_user_id ?? null, nome: c.sistema ? 'Sistema' : 'Rodar agora' };
  const resultado = [];
  for (const org of alvo) {
    try { resultado.push(await rodarOrg(org, { dryRun, regras, lembretes, quem })); }
    catch (e) {
      console.error('[routines-runner]', org, e);
      if (!dryRun) await gravar(org, 'routineRuns', [{ id: novoId('run'), routineId: 'r-routines-runner', inicio: new Date().toISOString(), fim: new Date().toISOString(), estado: 'err', resumo: 'Falha ao avaliar regras', erro: (e as Error).message }]).catch(() => {});
      resultado.push({ org, erro: (e as Error).message });
    }
  }
  return json({ ok: resultado.every((r) => !('erro' in r)), dryRun, resultado });
}));

