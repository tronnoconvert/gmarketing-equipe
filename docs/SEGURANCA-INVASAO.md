# Guardião de segurança — possível invasão nas contas Meta Ads

Pedido do dono: quando alguém invadir a conta de anúncios de um cliente (ex.: sobe muito o orçamento de uma campanha, o gasto
dispara), a conta deve ser **pausada na hora** (pausar, **nunca excluir**), continuar vigiada (se acontecer de novo ou alguém
reativar, pausa de novo) e **todos** os gestores de tráfego + dono + admin são avisados **ao mesmo tempo**, com uma **sirene**
que toca para todo mundo até alguém assumir.

| Arquivo | O que é |
|---|---|
| `src/shared/guardiao.js` | O motor: detecção (regras como dados), agregação em incidente, plano de resposta, quarentena/vigilância, saída da quarentena e reativação seletiva. JS puro, **sem import/export**: `var Guardiao = (function(){…})(); globalThis.Guardiao = Guardiao;`. Concatenável no build da Torre (`torre2/build.js`, antes de `ov.js`). Sem efeitos colaterais: quem pausa, grava e notifica é quem chama. |
| `src/shared/guardiao.mjs` | Wrapper ES module para o app (`import Guardiao from '../../shared/guardiao.mjs'`). |
| `src/core/sirene.js` | Sirene sintetizada com WebAudio (dois tons alternados), repetição a cada ~10 s, desbloqueio de autoplay, "Silenciar neste aparelho". |
| `supabase/functions/guardiao/` | Edge Function de produção (a cada 2 min): lê o Meta, roda o motor, pausa, grava incidente, notifica todos. `motor.js` é **cópia gerada** do motor (`node supabase/functions/guardiao/sync-motor.mjs`; o teste falha se estiver desatualizada). |
| `tests/guardiao.spec.mjs` | Testes unitários (Node) de cada regra, agregação, pausa total, quarentena, reincidência, idempotência, saída e reativação, adaptadores. |

## 1. Regras de detecção (padrões; editáveis em `settings.guardiaoRegras`)

Cada regra: `{id, nome, descricao, severidade: critica|alta|media, ativo, params:[{chave, rotulo, valor, unidade, min, max, passo}]}`.
Overrides só com o que difere: `{ 'gasto-pico': { params: { fator: 6 } }, rajada: { ativo: false }, 'pagamento-alterado': { severidade: 'critica' } }`.
Valores fora da faixa são ignorados (`Guardiao.validar(id, params)` devolve as mensagens em pt-BR para o formulário).

| id | Severidade | Dispara quando (padrões) |
|---|---|---|
| `orcamento-salto` | **crítica** | uma alteração sobe o orçamento de campanha/conjunto **> 100%** ou **> R$ 500/dia**; ou alterações seguidas no mesmo item somam **> 150% em 60 min** |
| `gasto-pico` | **crítica** | gasto da última hora **> 4×** a média por hora dos últimos 7 dias **e > R$ 50** (sem gasto em 7 dias e > R$ 50 também dispara) |
| `campanha-nova` | **crítica** | campanha criada por usuário fora da lista de autorizados, ou por canal fora de `app`/`gerenciador` |
| `admin-novo` | **crítica** | administrador/parceiro adicionado à conta de anúncios ou ao BM (mesmo que tenha sido alguém da equipe: confirme) |
| `fora-horario` | alta | qualquer alteração entre **00h e 06h** (Brasília) |
| `ator-desconhecido` | alta | alteração feita por usuário do Meta fora da lista da equipe (sem lista cadastrada a regra fica de fora e aparece em `ignoradas`) |
| `destino-alterado` | alta | objetivo, URL de destino ou **número de WhatsApp** trocado em anúncio ativo |
| `pagamento-alterado` | alta | forma de pagamento ou limite de gastos alterado/removido |
| `pais-novo` | alta | segmentação passa a incluir país nunca usado pela conta (padrão: só BR) |
| `teto-projetado` | alta | investimento projetado de hoje (orçamentos ativos ou ritmo do gasto de hoje) **> teto diário + 50%**; teto diário = `client.tetoMidiaMensal ÷ 30,4` |
| `rajada` | alta | **mais de 10 alterações em 10 min** |

**Incidente SUPREMO** (`agregacao`, editável): qualquer regra **crítica**, ou **2+ regras altas diferentes** dentro de **30 min**
(também entre execuções: o estado guarda os achados das últimas 2 h). Só eventos dos últimos 120 min são avaliados.
Uma regra alta sozinha vira **alerta comum** (sem pausa). Eventos do próprio Guardião (`atorId: 'guardiao'` / usuário do sistema) e
eventos automáticos do Meta (revisão de anúncio, cobrança, entrega) não contam.

## 2. Resposta automática (SUPREMO)

1. **Pausa a conta inteira** = pausa **todas as campanhas ativas** (status `PAUSED`). Nada é excluído nem arquivado.
2. Registra exatamente o que pausou: para cada campanha, orçamento atual e **orçamento anterior ao incidente** (o "antes" da 1ª
   alteração suspeita), também por conjunto (ABO), e se a campanha foi **criada durante o incidente** (provável invasor).
3. Conta em **quarentena** (estado preto/vermelho na Torre). Incidente `{id, contaId, clientId, nivel:'supremo', estado:'aberto'|'assumido'|'encerrado', achados, pausados, reincidencias, assumidoPor}`.
4. **Vigilância**: a cada verificação (produção: 2 min), se algo na conta em quarentena voltar a ficar ativo ou aparecer
   alteração nova (exceto pausas) → **pausa de novo** e escala com notificação **"REINCIDÊNCIA"** (a sirene volta a tocar,
   inclusive para quem silenciou). Idempotente: a mesma situação verificada de novo não gera ação nem notificação.

> **Exceção autorizada pelo dono:** esta pausa automática é a **única** alteração feita sem a confirmação "SIM" — a regra
> "toda alteração pede confirmação SIM" continua valendo para todo o resto. Motivo: em invasão cada minuto custa dinheiro
> do cliente; pausar é reversível e o sistema guarda o estado anterior. A **reativação** sempre pede SIM.

### Notificação (todos ao mesmo tempo)
- Destinatários: todo usuário ativo com papel `gestor_trafego`, `dono` ou `admin` (`Guardiao.destinatarios(users)`).
- In-app: `notifications` com `tipo:'invasao'`, `prioridade:'critica'`, `refCol:'alerts'`, `refId:<incidente>`, `sirene:true`.
- Produção: WhatsApp + e-mail pela função (ignora preferências e horário de silêncio — é emergência).
- Alerta: registro em `alerts` com `id` = id do incidente, `tipo:'invasao'`, `area:'Segurança'`, `gravidade/severidade:'err'`, `incidente:{…}`.
- Execução em `routineRuns` (`routineId:'r-guardiao'`), auditoria em `activity`, linha do tempo do cliente em `clientActions`.

### Tela (banner + sirene)
- Banner vermelho em tela cheia no shell (qualquer página) para os usuários-alvo:
  **"POSSÍVEL INVASÃO — Conta <cliente> pausada automaticamente"**, o que foi detectado, o que foi pausado e os botões
  **Assumir incidente** (registra quem assumiu e mostra para todos), **Ver detalhes** e **Silenciar neste aparelho**.
- **Sirene** (`src/core/sirene.js`): dois tons alternados (960/640 Hz), ~3,2 s, repete a cada ~10 s até alguém clicar
  **Assumir incidente** (para para todos) ou a pessoa clicar **Silenciar neste aparelho** (só local; o banner fica até alguém assumir).
  Produção: dispara pelo realtime do Supabase no insert da notificação; demonstração: `db.on` + evento `storage` entre abas.
  Autoplay: `sirene.instalarDesbloqueio()` libera o áudio no primeiro gesto depois do login; se o alerta chegar antes, o banner
  aparece e a sirene começa no primeiro clique/tecla.

## 3. Saída da quarentena

Só **Dono ou Admin**, digitando **SIM** e marcando o checklist (`Guardiao.CHECKLIST`):
1. Senha do Business Manager (e do Facebook de quem tem acesso) trocada
2. Autenticação em dois fatores ativa para todos os administradores
3. Administradores e parceiros da conta/BM revisados (intrusos removidos)
4. Forma de pagamento e limite de gastos verificados
5. Orçamentos revisados

Depois, **reativação seletiva** (`Guardiao.planoReativacao(incidente, {selecionadas, restaurar})`): só campanhas pausadas pelo
Guardião neste incidente; a tela mostra orçamento **antes do incidente → atual** e oferece **"Restaurar orçamento anterior ao
incidente"** (padrão ligado) para não reativar o orçamento inflado pelo invasor. Campanhas criadas durante o incidente vêm
desmarcadas com aviso. O plano põe o ajuste de orçamento **antes** de ativar. `Guardiao.sairQuarentena()` encerra o incidente
(registro de quem liberou, checklist, o que voltou).

## 4. API do motor

```js
Guardiao.processar(snapshot, estado|null, { overrides, incidente })
  // → { estado, achados (novos), nivel: 'supremo'|'alto'|'medio'|null, motivo, evento: 'invasao'|'reincidencia'|'alerta'|null,
  //     acoes: [{tipo:'pausar', nivel:'campanha', id, nome}], incidente, notificacao: {tipo, subtipo, prioridade, titulo, texto}, ignoradas }
Guardiao.avaliar(snapshot, { overrides }) · Guardiao.regras(overrides) · Guardiao.validar(id, params)
Guardiao.aplicarAcoes(snapshot, acoes)          // simulador/testes: muda status/orçamento, nunca remove
Guardiao.assumir(incidente, {userId, nome}, quando)
Guardiao.validarSaida({papel, confirmacao, checklist}) · Guardiao.planoReativacao(incidente, {selecionadas, restaurar}) · Guardiao.sairQuarentena(estado, incidente, {quem, checklist, plano})
Guardiao.destinatarios(users) · Guardiao.simularInvasao(snapshot, {ator, mediaHora})   // cenário de demonstração
Guardiao.adaptadores.torre(conta, ctx) · .metaAtividade(act) · .metaCampanhas(campaigns, adsets) · .metaGastoHoras(insights) · .tipoMeta(event_type)
```

**Snapshot**:
```js
{ conta: {id, nome, clientId}, agora: ISO, fusoMin: -180,
  campanhas: [{id, nome, status: 'ativo'|'pausado', cbo, orc /* R$/dia se CBO */, conjuntos: [{id, nome, status, orc, paises?}]}],
  eventos: [{id, quando, atorId, atorNome, via: 'app'|'gerenciador'|'api'|'sistema', tipo, nivel, alvoId, alvoNome, antes, depois, anuncioAtivo?}],
  gastoHoras: [{inicio: ISO, gasto}] | gasto: {ultimaHora, mediaHora7d, inicio}, gastoHoje?,
  autorizados: [metaUserId], sistemaIds: [ids do próprio robô], paisesUsados: ['BR'], tetoMensal: number|null }
```
Tipos de evento: `orcamento, status, criacao_campanha, objetivo, url_destino, whatsapp, admin_adicionado, pagamento, segmentacao, outro, sistema_meta`.
**Estado** por conta (`settings guardiaoEstado:<act>`): `{quarentena, incidenteId, desde, processados:{chave: quando}, recentes, reincidencias, pausasPendentes, paisesUsados}` (podado em 48 h).

## 5. Produção (Edge Function `guardiao`)

Agendada em `supabase/cron.sql` (`*/2 * * * *`). Para cada cliente com `metaAdAccountId` (`act_…`, aceita também `contaAnuncios`/`adAccountId`):
- **Graph API do Meta** (recomendado, `META_SYSTEM_USER_TOKEN`):
  `GET /act_<id>/campaigns` (status, daily_budget), `GET /act_<id>/adsets` (orçamento, países),
  `GET /act_<id>/activities?since=…` (registro de atividades: quem mudou o quê — base das regras de ator, horário, admin, pagamento, destino, rajada),
  `GET /act_<id>/insights?breakdowns=hourly_stats_aggregated_by_advertiser_time_zone` (gasto por hora, 7 dias + hoje).
  Pausa: `POST /<campaign_id>` com `status=PAUSED`.
- **Windsor** (reserva): sem token do Meta, lê só o gasto de hoje (`connectors.windsor.ai/facebook`, `date_preset=today`) — valem as
  regras de gasto/teto; não há registro de atividades. Para pausar pela Windsor use `GUARDIAO_PAUSA_VIA=windsor`: ação de escrita
  `pause_campaign {campaign_id}` do conector `facebook` (também existem `enable_campaign`, `set_campaign_budget`, `set_adset_budget`,
  `pause_adset` — conferidas na lista de ações da Windsor), com `WINDSOR_ACTIONS_URL` informado pelo suporte da Windsor.
- O mapeamento dos `event_type` do Meta (`Guardiao.adaptadores.tipoMeta`) é por padrão de nome (ex.: `update_campaign_budget` → orcamento,
  `ad_account_add_user_to_role` → admin_adicionado, `add_funding_source` → pagamento, `update_ad_set_target_spec` → segmentacao,
  `create_campaign_group` → criacao_campanha). Orçamentos do Meta vêm em centavos (divididos por 100). Valide com uma conta real
  antes de confiar 100% (`{"dryRun": true}` devolve o que faria sem pausar nem notificar).
- Pausa que falhar fica em `pausasPendentes` e é tentada de novo na próxima execução; a notificação diz "pause manualmente".
- Trava de 90 s (`settings guardiaoTrava`) evita execuções sobrepostas.
- **Usuários autorizados** do Meta: `team[].metaUserId` e/ou `settings guardiaoEquipeMeta = [{metaUserId, nome, teamId}]`.
  `META_SYSTEM_USER_ID` (ids separados por vírgula) = usuário do sistema que o próprio Guardião usa (as pausas dele não contam).

Variáveis: ver `docs/DEPLOY.md` › "Guardião de segurança".

## 6. Integração no app e na Torre

| Onde | O quê |
|---|---|
| `src/core/invasao.js` | Shell (qualquer página): banner vermelho em tela cheia + sirene para gestor de tráfego/dono/admin enquanto houver incidente **aberto**; "Assumir incidente" (para a sirene de todos, registra quem assumiu e avisa os outros), "Ver detalhes" (próximos passos e reincidências), "Silenciar neste aparelho" (`localStorage aos-sirene-silenciada:<uid>` = incidente + nº de reincidências: uma reincidência volta a tocar). Esc não fecha; foco preso. Depois de assumido, faixa compacta "Conta X em quarentena · assumido por…" até a liberação. Gaveta do incidente (`abrirIncidente(id)`) e modal de saída (`abrirSaida(id)`: checklist + campanhas com orçamento antes → no incidente + "Restaurar orçamento anterior ao incidente" + SIM). Em produção, `liberar()` chama a Edge Function `guardiao` `{acao:'liberar', …}` (orçamento e status ACTIVE no Meta). `window.AOS_INVASAO` para testes. Iniciado em `shell.iniciar()`. |
| `src/core/sirene.js` | Usa o mesmo `AudioContext` do aviso sonoro (`src/core/som.js`, `window.__aosAudioCtx`), destravado no primeiro gesto. O "plim" de `som.js` não toca para notificações com `sirene:true` (a sirene já toca). |
| `src/core/notify.js` | Tipo `invasao` (ícone escudo, "Segurança") e prioridade `critica` ("Crítico · segurança"). |
| `src/modules/torre/voo.js` | Ponte: recebe `{tipo:'invasao', evento, incidente}` da Torre → `invasao.registrarIncidente()` (alerta, notificações críticas a todos os alvos, `routineRuns` r-guardiao, `clientActions` se o cliente existir; idempotente); recebe `{tipo:'quarentenaEncerrada'}` (liberação feita na Torre por Dono/Admin). Envia à Torre `usuario` (papel), `guardiaoRegras`, `guardiaoSync` (incidentes: a Torre reaplica a quarentena ao recarregar) e `guardiaoLiberar` (liberação feita no app). |
| `src/modules/alertas` | Área **Segurança** no feed (item "Supremo" com estado da quarentena, "Ver incidente", "Assumir incidente"); `#/alertas?incidente=<id>` abre a gaveta; em `#/alertas/regras` o card **"Possível invasão (pausa automática)"** mostra os 11 sinais e "Editar limites" (Dono/Admin) grava `settings.guardiaoRegras` (validado pelo motor), "Testar sirene". |
| `src/modules/torre/data.js` | Rotina **"Guardião de segurança (a cada 2 min)"** (`r-guardiao`, 16 rotinas: 12 ok · 2 atenção · 1 falha · 1 pausada). `DB_VERSION` 3. |
| `torre2/guardiao-torre.js`, `torre2/guardiao.css` | Na Torre: botão **"Simular invasão (demonstração)"** (só Dono/Admin), linha/cartão/cabeçalho preto-vermelho com selo "Quarentena", faixa de contas em quarentena, painel do incidente na conta (detectado, pausado com orçamento antes → no incidente, registro do Guardião), vigilância a cada 4 s, "Simular reativação pelo invasor", reativação pela equipe bloqueada com explicação, saída da quarentena (Dono/Admin + checklist + SIM + reativação seletiva com orçamento anterior). Isolada: sirene local e "Assumir incidente"; estado em `localStorage torre-guardiao`. `build.js` concatena `guardiao.js` (do agencia-os) antes de `ov.js` e `guardiao-torre.js` antes de `app.js`. |

Testes: `tests/guardiao.spec.mjs` (motor), `tests/seguranca.spec.mjs` (ponta a ponta: sirene para Ana e Gabriel e Rayane, não para Carla; banner até assumir; assumir para para todos; reincidência; liberação), `tests/torre.spec.mjs` (ponte host), `torre2/t7.js` (Torre isolada).
