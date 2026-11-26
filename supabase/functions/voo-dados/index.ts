// voo-dados — dados do Painel de Voo (Meta Ads de todas as contas, via Windsor.ai), sem expor a chave.
//
// POST {acao: 'ler'}                → visão geral pelo cache do servidor (no máximo 5 min; se passou, devolve o que tem e
//                                     atualiza em segundo plano — o app mostra "atualizado há X min" e busca de novo)
// POST {acao: 'conta', conta: id}   → busca AO VIVO só desta conta (hoje + 14 dias, campanha/conjunto/anúncio com status e
//                                     orçamento), ignora o cache e grava o resultado nele. Mínimo de 20 s entre buscas da
//                                     mesma conta pela mesma pessoa. Com META_ACCESS_TOKEN, status e orçamento vêm direto do Meta.
// POST {acao: 'atualizar'}          → (cron, x-cron-secret) atualiza o cache da visão geral. Agendado a cada 5 min (cron.sql).
//
// Quem pode: permissão torre_voo (ver). Escopo: dono/admin/head (escopo "todos") veem todas as contas, inclusive as que ainda
// não têm cliente vinculado; gestor de tráfego e demais com "seus clientes" só veem contas ligadas aos seus clientes
// (clients.metaContas). Receita (action_values_purchase) sai para quem não tem a permissão "receita".
import { corpo, HttpError, json, servir, texto } from '../_shared/http.ts';
import { chamador } from '../_shared/supa.ts';
import { atualizarTudo, buscarContasVivo, DIAS, gravarCache, lerCache, listaDias, mapaContas, mesclarNoCache, montarPacote, mudancasHora, normConta, podeConta, quemVoo, statusMetaAoVivo, tokenMeta, TTL_MIN, VIVO_MIN_S, type Conta, type Dia } from '../_shared/voo.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const fundo = (p: Promise<unknown>) => { const q = p.catch((e) => console.error('[voo-dados] fundo', e?.message ?? e)); if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(q); };

Deno.serve(servir(async (req) => {
  const c = await chamador(req);
  const b = await corpo(req);
  const acao = texto(b.acao, 'acao') || 'ler';

  if (c.sistema) {
    if (acao !== 'atualizar') throw new HttpError(400, 'O agendador só usa {acao:"atualizar"}.', 'validacao');
    fundo(atualizarTudo({ forcar: b.forcar === true }).then((r) => console.log('[voo-dados] cron', JSON.stringify(r))));
    return json({ ok: true, agendado: true }, 202);
  }

  const q = await quemVoo(c, req);
  const mapa = await mapaContas(q.org);
  const acoes = { configurado: !!tokenMeta() };

  if (acao === 'conta') {
    const conta = normConta(b.conta);
    if (!conta) throw new HttpError(400, 'Informe a conta de anúncios.', 'validacao');
    if (!podeConta(q, mapa, conta)) throw new HttpError(403, 'Esta conta não é de um cliente seu.', 'fora_do_escopo');
    const chaveVivo = `vivo:${c.userId}:${conta}`;
    const ant = (await lerCache([chaveVivo, 'contas'])); const ultimo = ant.get(chaveVivo);
    const espera = ultimo ? VIVO_MIN_S * 1000 - (Date.now() - Date.parse(ultimo.em)) : 0;
    let diasDados: Map<string, Dia>; let atualizadoEm: string; let fonte = 'vivo'; let statusMeta = false;
    if (espera > 0) {
      // muito cedo: devolve o que acabou de ser buscado (do cache) e diz quando pode buscar de novo
      const cache = await lerCache(listaDias().map((d) => `dia:${d}`));
      diasDados = new Map([...cache].map(([k, v]) => [k.slice(4), v.dados as Dia]));
      atualizadoEm = ultimo!.em; fonte = 'recente';
    } else {
      await gravarCache([{ chave: chaveVivo, dados: { em: Date.now() } }]);
      diasDados = await buscarContasVivo([conta]);
      const hoje = listaDias()[DIAS - 1];
      const ultimoDia = diasDados.get(hoje) ?? [...diasDados.values()].pop();
      if (ultimoDia) statusMeta = await statusMetaAoVivo(conta, ultimoDia.estr);
      // a estrutura (status/orçamento) mais recente vale para todos os dias da conta
      if (ultimoDia) for (const d of diasDados.values()) for (const k of ['camps', 'sets', 'ads'] as const) for (const [id, v] of Object.entries(ultimoDia.estr[k])) if (d.estr[k][id]) d.estr[k][id] = { ...d.estr[k][id], st: v.st, ...(k !== 'ads' ? { orc: v.orc } : {}) };
      await mesclarNoCache([conta], diasDados);
      atualizadoEm = new Date().toISOString();
    }
    const contas = ((ant.get('contas')?.dados as Conta[]) ?? []).filter((x) => x.id === conta);
    const pacote = montarPacote(q, contas.length ? contas : [{ id: conta, nome: `Conta ${conta}`, status: 'ACTIVE', moeda: 'BRL' }], diasDados, mapa, { soContas: [conta] });
    return json({ ok: true, ...pacote, atualizadoEm, fonte, statusMeta, proximaBuscaEm: new Date(Date.now() + Math.max(espera, VIVO_MIN_S * 1000)).toISOString(), mudancasHora: await mudancasHora([conta]), acoes });
  }

  if (acao !== 'ler' && acao !== 'atualizar') throw new HttpError(400, 'Ação inválida. Use "ler" ou "conta".', 'validacao');
  const dias = listaDias();
  const cache = await lerCache(['contas', ...dias.map((d) => `dia:${d}`)]);
  const hoje = cache.get(`dia:${dias[DIAS - 1]}`); const ontem = cache.get(`dia:${dias[DIAS - 2]}`);
  const vazio = !cache.get('contas') && !hoje && !ontem;
  const idade = hoje ? Date.now() - Date.parse(hoje.em) : Infinity;
  const velho = idade > TTL_MIN * 60000 || (acao === 'atualizar' && idade > 60000);
  if (velho) fundo(atualizarTudo());
  if (vazio) return json({ ok: true, carregando: true, mensagem: 'Buscando os dados do Meta pela primeira vez (até 2 minutos)…', acoes });
  const diasDados = new Map([...cache].filter(([k]) => k.startsWith('dia:')).map(([k, v]) => [k.slice(4), v.dados as Dia]));
  const pacote = montarPacote(q, (cache.get('contas')?.dados as Conta[]) ?? [], diasDados, mapa);
  return json({ ok: true, ...pacote, atualizadoEm: hoje?.em ?? ontem?.em ?? null, atualizando: velho, fonte: 'cache', mudancasHora: await mudancasHora(pacote.contas.map((x) => x.id)), acoes });
}, ['POST']));
