// voo-acao — alterações no Meta Ads pelo Painel de Voo (Graph API com o token do usuário do sistema, META_ACCESS_TOKEN).
//
// POST {acao: 'pausar', nivel: 'campanha'|'conjunto'|'anuncio', id, conta, confirmacao: 'SIM', via?}
// POST {acao: 'orcamento', nivel: 'conjunto'|'campanha' (CBO), id, conta, valor (R$/dia), confirmacao: 'SIM', via?}
// POST {acao: 'status'} → {configurado} (o app desabilita os botões quando falta o token)
//
// Regras do dono (valem aqui, não só na tela):
//  - toda alteração exige confirmacao === 'SIM' (sem "não perguntar de novo");
//  - só PAUSAR (nunca reativar, arquivar nem excluir) e mudar orçamento diário;
//  - SEM limite de mudanças por hora (decisão do dono, 25/11/2026): cada mudança é registrada (voo_mudancas) e auditada com autor,
//    cliente, responsável e a marca deOutroGestor; o responsável (e Dono/Admin) recebe notificação quando outra pessoa mexe no cliente;
//  - só quem EDITA o Painel de Voo e só em contas do seu escopo; o objeto precisa ser da conta informada (conferido no Meta);
//  - "Ver como" não chega aqui: o JWT é sempre da pessoa real e o app não envia ações em "ver como"; se vier a marca, recusa.
// Sem META_ACCESS_TOKEN: 503 "não configurado". Toda alteração fica em activity e no histórico do cliente (clientActions).
import { corpo, HttpError, json, servir, texto } from '../_shared/http.ts';
import { adminClient, chamador, gravar, listar, novoId, obter } from '../_shared/supa.ts';
import { graph, listaDias, mapaContas, normConta, podeConta, quemVoo, tokenMeta, lerCache, gravarCache, type Dia } from '../_shared/voo.ts';

const NIVEIS = ['campanha', 'conjunto', 'anuncio'];
const ROT = { campanha: 'a campanha', conjunto: 'o conjunto', anuncio: 'o anúncio' } as Record<string, string>;
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

Deno.serve(servir(async (req) => {
  const c = await chamador(req);
  if (c.sistema) throw new HttpError(403, 'Ações no Meta só com a sessão de uma pessoa.', 'sem_permissao');
  const b = await corpo(req);
  const acao = texto(b.acao, 'acao', { obrigatorio: true });
  if (acao === 'status') return json({ ok: true, configurado: !!tokenMeta() });
  if (!['pausar', 'orcamento'].includes(acao)) throw new HttpError(400, 'Ação não permitida. Pelo Painel de Voo só dá para pausar e mudar o orçamento diário.', 'acao_proibida');
  if (b.vendoComo) throw new HttpError(403, '"Ver como" é só visualização: nenhuma ação no Meta.', 'ver_como');
  if (b.confirmacao !== 'SIM') throw new HttpError(400, 'Confirmação obrigatória: digite SIM.', 'confirmacao');
  const q = await quemVoo(c, req);
  if (q.nivel < 2) throw new HttpError(403, 'Seu acesso ao Painel de Voo é só de leitura.', 'sem_permissao');
  const nivel = texto(b.nivel, 'nivel', { obrigatorio: true });
  if (!NIVEIS.includes(nivel)) throw new HttpError(400, 'Nível inválido.', 'validacao');
  const id = texto(b.id, 'id', { obrigatorio: true, re: /^\d{5,25}$/ });
  const conta = normConta(b.conta);
  if (!conta) throw new HttpError(400, 'Informe a conta.', 'validacao');
  const mapa = await mapaContas(q.org);
  if (!podeConta(q, mapa, conta)) throw new HttpError(403, 'Esta conta não é de um cliente seu.', 'fora_do_escopo');
  // conta em quarentena (Guardião): só a liberação (Dono/Admin + checklist) mexe nela
  const est = await obter(q.org, 'settings', `guardiaoEstado:${conta}`) ?? await obter(q.org, 'settings', `guardiaoEstado:act_${conta}`);
  if ((est?.valor as Record<string, unknown> | undefined)?.quarentena) throw new HttpError(423, 'Conta em quarentena (possível invasão): só a liberação pelo Dono/Admin mexe nela.', 'quarentena');
  if (!tokenMeta()) throw new HttpError(503, 'Ações no Meta aguardando o token do usuário do sistema — peça ao administrador.', 'nao_configurado');

  // o objeto é mesmo desta conta? (lido no Meta, não no que o navegador mandou)
  const atual = await graph(id, { params: { fields: nivel === 'anuncio' ? 'account_id,name,effective_status' : 'account_id,name,effective_status,daily_budget' } });
  if (normConta(atual.account_id) !== conta) throw new HttpError(403, 'Este item não pertence à conta informada.', 'fora_do_escopo');
  const nome = String(atual.name ?? id);
  const vinc = mapa.get(conta);
  const agora = new Date().toISOString();
  let antes = '', depois = '', resultado: Record<string, unknown> = {};

  if (acao === 'pausar') {
    antes = String(atual.effective_status ?? '');
    if (antes !== 'PAUSED') await graph(id, { metodo: 'POST', params: { status: 'PAUSED' } });
    depois = 'PAUSED'; resultado = { st: 'PAUSED' };
    await adminClient().from('voo_mudancas').insert({ org_id: q.org, objeto_id: id, conta_id: conta, tipo: 'pausar', user_id: c.userId, ok: true });
  } else {
    if (nivel === 'anuncio') throw new HttpError(400, 'Anúncio não tem orçamento próprio: mude no conjunto (ABO) ou na campanha (CBO).', 'validacao');
    const valor = Number(b.valor);
    const pad = (await obter(q.org, 'settings', 'padroes'))?.valor as Record<string, unknown> | undefined;
    const minimo = Math.max(6, Number(pad?.['orcamento.minimoDia']) || 6);
    if (!isFinite(valor) || valor < minimo || valor > 100000) throw new HttpError(400, `Orçamento diário inválido: mínimo ${brl(minimo)}, máximo ${brl(100000)}.`, 'validacao');
    if (atual.daily_budget == null) throw new HttpError(400, `Este item não tem orçamento diário próprio (${nivel === 'conjunto' ? 'a campanha é CBO: mude na campanha' : 'a campanha é ABO: mude nos conjuntos'}).`, 'validacao');
    const ant = Number(atual.daily_budget) / 100;
    if (Math.abs(ant - valor) < 0.005) throw new HttpError(400, 'O valor é igual ao atual.', 'validacao');
    // sem limite de mudanças por hora (decisão do dono, 25/11/2026): a reserva só registra a mudança no histórico (voo_mudancas)
    const { data: reserva, error } = await adminClient().rpc('voo_reservar_mudanca', { p_org: q.org, p_objeto: id, p_conta: conta, p_user: c.userId, p_antes: ant, p_depois: valor, p_limite: null });
    if (error) throw error;
    try { await graph(id, { metodo: 'POST', params: { daily_budget: String(Math.round(valor * 100)) } }); }
    catch (e) { await adminClient().from('voo_mudancas').update({ ok: false }).eq('id', reserva); throw e; }
    antes = `${brl(ant)}/dia`; depois = `${brl(valor)}/dia`; resultado = { orc: valor, antes: ant };
  }

  // auditoria + histórico do cliente
  // auditoria (decisão do dono, 25/11/2026): quem mudou, qual cliente, responsável do cliente e se é cliente de outra pessoa
  const autorId = c.perfil?.app_user_id ?? null;
  const resp = vinc?.respId ? await obter(q.org, 'team', vinc.respId) : null;
  const deOutroGestor = !!(vinc?.respId && vinc.respId !== q.teamId);
  const aud = { autorId, autorNome: q.nome, autorTeamId: q.teamId, respId: vinc?.respId ?? null, respNome: resp ? String(resp.nome ?? '') : null, deOutroGestor };
  const nomeCli = vinc?.nome || `act_${conta}`;
  const oqueBase = acao === 'pausar' ? `pausou ${ROT[nivel]} "${nome}" no Meta (Painel de Voo)` : `mudou o orçamento diário de ${ROT[nivel]} "${nome}" de ${antes} para ${depois} (Painel de Voo)`;
  const oque = `${oqueBase} · ${nomeCli}${deOutroGestor ? ` — cliente de ${aud.respNome || 'outro gestor'}` : ''}`;
  const caId = vinc ? novoId('ca') : null;
  if (vinc) await gravar(q.org, 'clientActions', [{ id: caId, clientId: vinc.clientId, data: agora.slice(0, 10), quem: q.teamId, tipo: acao === 'pausar' ? `Pausou ${nivel}` : 'Orçamento alterado', area: 'trafego',
    metrica: acao === 'pausar' ? null : 'Verba', descricao: oqueBase.replace(/^\w/, (x) => x.toUpperCase()), antes, depois, expectativa: '', resultado: '', origem: 'torre', contaMeta: conta, objetoId: id, via: texto(b.via, 'via', { max: 120 }) || null, createdAt: agora, createdBy: autorId, ...aud }]);
  await gravar(q.org, 'activity', [{ id: novoId('act'), quem: autorId, quemNome: q.nome, oque, col: vinc ? 'clientActions' : 'torre', refId: caId, clientId: vinc?.clientId ?? null, quando: agora, ...aud }]);
  if (vinc && deOutroGestor) {
    // avisa o responsável do cliente e Dono/Admin (menos quem fez)
    const users = await listar(q.org, 'users');
    const para = [...new Set([resp?.userId as string | undefined, ...users.filter((u) => u.ativo !== false && ['dono', 'admin'].includes(String(u.papel))).map((u) => String(u.id))])].filter((x): x is string => !!x && x !== autorId);
    if (para.length) await gravar(q.org, 'notifications', para.map((uid) => ({ id: novoId('not'), para: uid, de: autorId, tipo: 'alerta', prioridade: 'alta', canais: ['app'], lida: false, quando: agora,
      titulo: `${q.nome} alterou ${nomeCli} — cliente de ${aud.respNome || 'outro gestor'}`, texto: `${oqueBase.replace(/^\w/, (x) => x.toUpperCase())}.`, link: `#/clientes/${vinc.clientId}/resultados-acoes`, refCol: 'clients', refId: vinc.clientId })));
  }

  // libera a próxima busca ao vivo desta conta (o app busca de novo logo depois da ação)
  await adminClient().from('voo_cache').delete().eq('chave', `vivo:${c.userId}:${conta}`);
  // reflete no cache (a Windsor pode levar alguns minutos para mostrar)
  try {
    const dias = listaDias(); const ch = `dia:${dias[dias.length - 1]}`; const cache = await lerCache([ch]); const d = cache.get(ch)?.dados as Dia | undefined;
    if (d) { const col = nivel === 'campanha' ? 'camps' : nivel === 'conjunto' ? 'sets' : 'ads'; if (d.estr[col][id]) { Object.assign(d.estr[col][id], resultado.st ? { st: resultado.st } : { orc: resultado.orc }); await gravarCache([{ chave: ch, dados: d }]); } }
  } catch (e) { console.error('[voo-acao] cache', (e as Error).message); }

  return json({ ok: true, acao, nivel, id, conta, nome, antes, depois, quando: agora, ...resultado });
}, ['POST']));
