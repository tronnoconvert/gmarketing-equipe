// guardiao — Guardião de segurança das contas Meta Ads dos clientes (agendado a cada 2 min via pg_cron + pg_net).
// Para cada conta (clients.metaAdAccountId = act_…): lê campanhas, conjuntos, registro de atividades e gasto por hora,
// roda o motor (motor.js = cópia de src/shared/guardiao.js), e no nível SUPREMO:
//   1. PAUSA todas as campanhas ativas da conta (status=PAUSED; nunca exclui) — única ação automática sem "SIM" (autorizada pelo dono);
//   2. grava o incidente (alerts, area 'seguranca', tipo 'invasao'), o estado de quarentena (settings guardiaoEstado:<act>),
//      a execução (routineRuns r-guardiao), a auditoria (activity) e a ação no cliente (clientActions);
//   3. notifica AO MESMO TEMPO todos os gestores de tráfego + dono + admin (notifications prioridade 'critica', tipo 'invasao'
//      → o app toca a sirene via realtime) e manda WhatsApp + e-mail (ignora preferências e horário de silêncio).
// Em quarentena, cada execução re-pausa o que voltar a ficar ativo e notifica "reincidência". Idempotente (estado + trava).
// Quem pode chamar: agendador (x-cron-secret / service role) ou Dono/Admin ("Rodar agora").
// POST {orgId?, dryRun?: boolean, contas?: ["act_…"]}
// POST {acao: 'liberar', incidenteId, confirmacao: 'SIM', checklist: {…}, selecionadas: [campId], restaurar: true|{campId: bool}}
//   → saída da quarentena (só Dono/Admin, usuário logado): valida SIM + checklist, ajusta orçamentos e reativa SÓ as campanhas escolhidas.
import './motor.js';
import { corpo, env, HttpError, json, lista, servir, texto } from '../_shared/http.ts';
import { auditar, chamador, exigirPapel, gravar, listar, novoId, obter, orgs, type Obj } from '../_shared/supa.ts';
import { email, whatsapp, type Resultado } from '../_shared/envio.ts';
import { aplicarNoMeta, lerConta, metaConfigurado, pausarCampanha, type ResultadoPausa } from './meta.ts';

// deno-lint-ignore no-explicit-any
type Any = any;
interface Motor {
  processar(snap: Any, estado: Any, opts: Any): { estado: Any; achados: Any[]; nivel: string | null; motivo: string; evento: string | null; acoes: { tipo: string; id: string; nome: string }[]; incidente: Any; notificacao: { tipo: string; subtipo?: string; prioridade: string; titulo: string; texto: string } | null; ignoradas: string[] };
  destinatarios(users: Any[]): Any[];
  validarSaida(p: Any): { ok: boolean; erros: Record<string, string> };
  planoReativacao(inc: Any, sel: Any): { ok: boolean; erros: string[]; avisos: string[]; acoes: { tipo: string; nivel: string; id: string; nome: string; de?: number; para?: number }[]; linhas: Any[] };
  sairQuarentena(estado: Any, inc: Any, p: Any): { estado: Any; incidente: Any };
  adaptadores: { metaAtividade(a: Any, ctx?: Any): Any; metaCampanhas(c: Any[], s: Any[], ctx?: Any): Any[]; metaGastoHoras(l: Any[], fusoMin?: number): Any[] };
  versao: string;
}
const G = (globalThis as unknown as { Guardiao: Motor }).Guardiao;

const ACT = /^act_\d{5,25}$/;
const FUSO_MIN = Number(env('GUARDIAO_FUSO_MIN') ?? -180); // Brasília
const TRAVA_MS = 90_000;

interface Conta { act: string; clientId: string | null; nome: string; tetoMensal: number | null }

function contasDaOrg(d: Record<string, Obj[]>, filtro: string[]): Conta[] {
  const out: Conta[] = [];
  for (const c of d.clients) {
    const act = String(c.metaAdAccountId ?? c.contaAnuncios ?? c.adAccountId ?? '').trim();
    if (!ACT.test(act) || c.ativo === false || c.status === 'encerrado') continue;
    if (filtro.length && !filtro.includes(act)) continue;
    out.push({ act, clientId: c.id, nome: String(c.nome ?? act), tetoMensal: Number(c.tetoMidiaMensal) > 0 ? Number(c.tetoMidiaMensal) : null });
  }
  return out;
}

/** usuários do Meta autorizados = settings guardiaoEquipeMeta [{metaUserId}] + team[].metaUserId */
function autorizados(d: Record<string, Obj[]>): string[] {
  const s = d.settings.find((x) => x.id === 'guardiaoEquipeMeta');
  const lista1 = Array.isArray(s?.valor) ? (s!.valor as { metaUserId?: string }[]).map((x) => String(x.metaUserId ?? '')) : [];
  const lista2 = d.team.map((t) => String(t.metaUserId ?? ''));
  return [...new Set([...lista1, ...lista2].filter(Boolean))];
}

async function avisarExterno(org: string, userIds: string[], titulo: string, textoMsg: string, link: string): Promise<Resultado[]> {
  const out: Resultado[] = [];
  await Promise.all(userIds.map(async (uid) => {
    const u = await obter(org, 'users', uid) as (Obj & { email?: string; teamId?: string }) | null;
    if (!u) return;
    const t = u.teamId ? await obter(org, 'team', String(u.teamId)) as (Obj & { telefone?: string }) | null : null;
    const m = { titulo, texto: textoMsg, link, prioridade: 'alta' as const, tipo: 'invasao' };
    // invasão fura preferências e horário de silêncio de propósito (decisão do dono)
    const [w, e] = await Promise.all([whatsapp(String(t?.telefone ?? ''), m).catch((x) => ({ canal: 'whatsapp', para: uid, ok: false, status: 'falhou', detalhe: (x as Error).message }) as Resultado), email(String(u.email ?? ''), m).catch((x) => ({ canal: 'email', para: uid, ok: false, status: 'falhou', detalhe: (x as Error).message }) as Resultado)]);
    out.push(w, e);
  }));
  return out;
}

async function rodarOrg(org: string, o: { dryRun: boolean; contas: string[]; quem: { id: string | null; nome: string } }) {
  const inicio = new Date().toISOString();
  const d: Record<string, Obj[]> = {};
  for (const c of ['clients', 'settings', 'team', 'users', 'alerts']) d[c] = await listar(org, c);

  // trava simples: duas execuções sobrepostas não pausam/notificam em dobro
  const trava = d.settings.find((x) => x.id === 'guardiaoTrava');
  if (!o.dryRun && trava && Date.now() - Date.parse(String(trava.valor ?? '')) < TRAVA_MS) return { org, pulado: 'outra execução em andamento' };
  if (!o.dryRun) await gravar(org, 'settings', [{ id: 'guardiaoTrava', valor: inicio }]);

  const overrides = (d.settings.find((x) => x.id === 'guardiaoRegras')?.valor as Record<string, unknown>) ?? {};
  const auth = autorizados(d);
  const alvos = G.destinatarios(d.users).map((u: Obj) => u.id);
  const contas = contasDaOrg(d, o.contas);
  const resumo: Record<string, unknown>[] = [];
  let incidentes = 0, reincidencias = 0, pausadas = 0, falhas = 0, notifs = 0;

  for (const conta of contas) {
    try {
      const chaveEstado = `guardiaoEstado:${conta.act}`;
      const estadoRec = d.settings.find((x) => x.id === chaveEstado);
      const estado = (estadoRec?.valor as Record<string, unknown>) ?? null;
      const incAtual = estado?.incidenteId ? d.alerts.find((a) => a.id === estado.incidenteId) : null;

      // pausas que falharam na execução anterior: tenta de novo antes de ler a conta
      const pendentes = Array.isArray(estado?.pausasPendentes) ? estado!.pausasPendentes as string[] : [];
      if (pendentes.length && !o.dryRun) for (const id of pendentes) await pausarCampanha(conta.act, id);

      const L = await lerConta(conta.act, { desdeMin: 180 });
      const snap = {
        conta: { id: conta.act, nome: conta.nome, clientId: conta.clientId }, agora: new Date().toISOString(), fusoMin: FUSO_MIN,
        campanhas: G.adaptadores.metaCampanhas(L.campanhas, L.conjuntos),
        eventos: L.atividades.map((a) => G.adaptadores.metaAtividade(a)),
        gastoHoras: L.horas.length ? G.adaptadores.metaGastoHoras(L.horas, FUSO_MIN) : null,
        gastoHoje: L.gastoHoje, autorizados: auth, sistemaIds: (env('META_SYSTEM_USER_ID') ?? '').split(',').filter(Boolean),
        paisesUsados: (estado?.paisesUsados as string[]) ?? ['BR'], tetoMensal: conta.tetoMensal,
      };
      const r = G.processar(snap, estado, { overrides, incidente: incAtual?.incidente ?? null });

      // executa as pausas (só campanhas; nunca exclui)
      const res: ResultadoPausa[] = [];
      if (!o.dryRun) for (const a of r.acoes) if (a.tipo === 'pausar') res.push(await pausarCampanha(conta.act, a.id));
      const falhou = res.filter((x) => !x.ok);
      pausadas += res.filter((x) => x.ok).length; falhas += falhou.length;
      const novoEstado = { ...r.estado, pausasPendentes: falhou.map((x) => x.id), paisesUsados: [...new Set([...(snap.paisesUsados as string[]), ...snap.campanhas.flatMap((c: Any) => c.status === 'ativo' && !r.estado.quarentena ? c.conjuntos.flatMap((s: Any) => s.paises ?? []) : [])])] };
      resumo.push({ conta: conta.act, nivel: r.nivel, evento: r.evento, achados: r.achados.length, pausas: r.acoes.length, falhas: falhou.length, fonte: L.fonteGasto, ignoradas: r.ignoradas });
      if (o.dryRun) continue;

      const agora = new Date().toISOString();
      const gravacoes: Promise<unknown>[] = [gravar(org, 'settings', [{ id: chaveEstado, valor: novoEstado }])];
      if ((r.evento === 'invasao' || r.evento === 'reincidencia') && r.notificacao) {
        if (r.evento === 'invasao') incidentes++; else reincidencias++;
        const inc = r.incidente ?? incAtual?.incidente;
        const incId = String(inc?.id ?? estado?.incidenteId);
        const falhaTxt = falhou.length ? ` ATENÇÃO: não consegui pausar ${falhou.length} campanha(s) (${falhou.map((x) => x.id).join(', ')}) — pause manualmente no Gerenciador agora.` : '';
        const link = `#/alertas?incidente=${incId}`;
        const alerta: Obj = {
          ...(incAtual ?? {}), id: incId, tipo: 'invasao', area: 'Segurança', gravidade: 'err', severidade: 'err', estado: 'err',
          titulo: r.notificacao.titulo, detalhe: r.notificacao.texto + falhaTxt, quando: incAtual?.quando ?? agora, atualizadoEm: agora,
          status: 'aberto', resolvido: false, clientId: conta.clientId, refCol: 'clients', refId: conta.clientId,
          para: alvos, incidente: { ...inc, falhasPausa: falhou }, acao: { rotulo: 'Ver incidente', href: link }, origem: 'guardiao',
        };
        const notificacoes: Obj[] = alvos.map((uid: string) => ({ id: novoId('not'), para: uid, de: null, tipo: 'invasao', subtipo: r.notificacao!.subtipo, titulo: r.notificacao!.titulo, texto: r.notificacao!.texto + falhaTxt, link, lida: false, prioridade: 'critica', quando: agora, canais: ['app', 'whatsapp', 'email'], refCol: 'alerts', refId: incId, sirene: true }));
        notifs += notificacoes.length;
        gravacoes.push(gravar(org, 'alerts', [alerta]), gravar(org, 'notifications', notificacoes));
        if (res.length && conta.clientId) gravacoes.push(gravar(org, 'clientActions', [{ id: novoId('ca'), clientId: conta.clientId, area: 'trafego', tipo: 'Pausa de segurança', titulo: `Guardião pausou ${res.filter((x) => x.ok).length} campanha(s) — ${r.evento === 'invasao' ? 'possível invasão' : 'reincidência'}`, descricao: r.notificacao.texto, quando: agora, origem: 'guardiao', autor: null }]));
        gravacoes.push(auditar(org, o.quem, `${r.evento === 'invasao' ? 'abriu incidente de possível invasão' : 'registrou reincidência'} em ${conta.nome} e pausou ${res.filter((x) => x.ok).length} campanha(s)`, 'alerts', incId));
        await Promise.all(gravacoes);
        await avisarExterno(org, alvos, r.notificacao.titulo, r.notificacao.texto + falhaTxt, link);
      } else {
        await Promise.all(gravacoes);
      }
    } catch (e) {
      console.error('[guardiao]', org, conta.act, e);
      resumo.push({ conta: conta.act, erro: (e as Error).message });
    }
  }
  const erros = resumo.filter((x) => 'erro' in x).length;
  if (!o.dryRun) {
    await gravar(org, 'routineRuns', [{ id: novoId('run'), routineId: 'r-guardiao', inicio, fim: new Date().toISOString(), estado: erros ? (erros === contas.length && contas.length ? 'err' : 'warn') : 'ok', resumo: `${contas.length} contas · ${incidentes} incidentes · ${reincidencias} reincidências · ${pausadas} campanhas pausadas${falhas ? ` · ${falhas} pausas falharam` : ''}${erros ? ` · ${erros} contas com erro` : ''}`, origem: 'guardiao', versaoMotor: G.versao }]);
    await gravar(org, 'settings', [{ id: 'guardiaoTrava', valor: '1970-01-01T00:00:00Z' }]);
  }
  return { org, contas: contas.length, incidentes, reincidencias, pausadas, falhas, notificacoes: notifs, detalhe: resumo };
}

async function liberar(c: Awaited<ReturnType<typeof chamador>>, b: Record<string, unknown>) {
  exigirPapel(c, ['dono', 'admin'], { somenteUsuario: true });
  const org = c.perfil!.org_id;
  const incId = texto(b.incidenteId, 'incidenteId', { obrigatorio: true, max: 120 });
  const v = G.validarSaida({ papel: c.perfil!.papel, confirmacao: b.confirmacao, checklist: b.checklist });
  if (!v.ok) throw new HttpError(400, Object.values(v.erros).join(' '), 'validacao');
  const alerta = await obter(org, 'alerts', incId);
  const inc = alerta?.incidente as Any;
  if (!alerta || !inc || inc.estado === 'encerrado') throw new HttpError(404, 'Incidente não encontrado ou já encerrado.', 'incidente');
  const plano = G.planoReativacao(inc, { selecionadas: lista(b.selecionadas, 'selecionadas', 200), restaurar: b.restaurar ?? true });
  if (!plano.ok) throw new HttpError(400, plano.erros.join(' '), 'plano');
  const resultados: ResultadoPausa[] = [];
  for (const a of plano.acoes) resultados.push(await aplicarNoMeta(a)); // orçamento antes de ativar (ordem do plano)
  const chave = `guardiaoEstado:${inc.contaId}`;
  const estado = (await obter(org, 'settings', chave))?.valor ?? null;
  const quem = { userId: c.perfil!.app_user_id, nome: c.email ?? '' };
  const s = G.sairQuarentena(estado, inc, { quem, checklist: b.checklist, plano });
  await gravar(org, 'settings', [{ id: chave, valor: s.estado }]);
  await gravar(org, 'alerts', [{ ...alerta, incidente: { ...s.incidente, resultadosReativacao: resultados }, status: 'resolvido', resolvido: true, resolvidoEm: new Date().toISOString() }]);
  await auditar(org, { id: c.perfil!.app_user_id, nome: c.email ?? 'Dono/Admin' }, `liberou a quarentena de ${inc.contaNome} e reativou ${plano.acoes.filter((x) => x.tipo === 'ativar').length} campanha(s)`, 'alerts', incId);
  return json({ ok: resultados.every((r) => r.ok), plano, resultados });
}

Deno.serve(servir(async (req) => {
  const c = await chamador(req);
  exigirPapel(c, ['dono', 'admin']);
  const b = await corpo(req);
  if (b.acao === 'liberar') return await liberar(c, b);
  const dryRun = b.dryRun === true || b.dryRun === 'true';
  const contas = lista(b.contas, 'contas', 200);
  if (contas.some((x) => !ACT.test(x))) throw new HttpError(400, 'Use contas no formato act_ seguido de números.', 'validacao');
  const pedido = texto(b.orgId, 'orgId', { max: 60 });
  if (!metaConfigurado() && !env('WINDSOR_API_KEY')) throw new HttpError(503, 'Guardião sem fonte de dados: defina META_SYSTEM_USER_TOKEN (recomendado) ou WINDSOR_API_KEY.', 'nao_configurado');
  const alvo = c.sistema ? (pedido ? [pedido] : env('DEFAULT_ORG_ID') ? [env('DEFAULT_ORG_ID')!] : await orgs()) : [c.perfil!.org_id];
  const quem = { id: c.perfil?.app_user_id ?? null, nome: c.sistema ? 'Guardião (automático)' : 'Rodar agora' };
  const resultado = [];
  for (const org of alvo) {
    try { resultado.push(await rodarOrg(org, { dryRun, contas, quem })); }
    catch (e) {
      console.error('[guardiao]', org, e);
      if (!dryRun) await gravar(org, 'routineRuns', [{ id: novoId('run'), routineId: 'r-guardiao', inicio: new Date().toISOString(), fim: new Date().toISOString(), estado: 'err', resumo: 'Falha na verificação de segurança', erro: (e as Error).message }]).catch(() => {});
      resultado.push({ org, erro: (e as Error).message });
    }
  }
  return json({ ok: resultado.every((r) => !('erro' in r)), dryRun, versaoMotor: G.versao, resultado });
}));
