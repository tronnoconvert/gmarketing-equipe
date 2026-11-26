# Motor único de recomendações (item 18)

Um só motor gera as recomendações da **Torre de Controle** (contas dos clientes) e da **Campanha** (conta própria do dono).

| Arquivo | O que é |
|---|---|
| `src/shared/motor-recs.js` | O motor. JavaScript puro, **sem import/export**: `var MotorRecs = (function(){…})(); globalThis.MotorRecs = MotorRecs;`. Pode ser concatenado no build da Torre (`torre2/build.js`, antes de `ov.js`). |
| `src/shared/motor-recs.mjs` | Wrapper ES module para o app (`import MotorRecs from '../../shared/motor-recs.mjs'`). O esbuild empacota; `window.MotorRecs` fica disponível no app. |
| `src/modules/campanha/engine.js` | Adaptador da conta própria (`snapshot()`), estado das decisões e registro de aprendizado (`recsLog`). |
| `src/modules/campanha/regras.js` | Aba **Regras da IA** (`#/campanha/regras`). |
| `MotorRecs.adaptadores.torre(conta, {hoje, invDia})` | Adaptador das contas do protótipo da Torre (`torre2/data.js`). |
| `tests/motor.spec.mjs` | Testes unitários (Node) de cada regra, orçamento total, teto, validação, log e adaptador da Torre. |

## API

```js
MotorRecs.recomendar(snapshot, { overrides } | { regras })   // → [recomendação], ordenadas por prioridade (agora, hoje, semana)
MotorRecs.regras(overrides)            // regras efetivas = padrão + overrides (valores inválidos são ignorados)
MotorRecs.validar(regraId, params)     // → {ok, erros: {chave: 'mensagem'}} (faixa, inteiro, restrições entre campos)
MotorRecs.orcamentoConta(snapshot, troca?)   // orçamento diário da conta; troca = {id, v} simula novo valor
MotorRecs.registrarDecisao(rec, 'aceita'|'recusada'|'adiada', quem, quando?)  // → entrada do log (quem grava é o app)
MotorRecs.pendentesDeAvaliacao(log, hoje)      // aceitas com 7 dias vencidos e sem resultado
MotorRecs.avaliarResultado(entrada, depois)    // → {metrica, antes, depois, melhorou}
MotorRecs.estatisticas(log, {dias: 30, hoje, pendentes})  // → {regraId: {sugestoes, aceitas, recusadas, adiadas, decididas, taxaAceite, avaliadas, deramCerto, taxaSucesso}}
MotorRecs.REGRAS_PADRAO · ROTULO_PRIO · ROTULO_ACAO · ROTULO_NIVEL · fmt · versao
```

## Snapshot (entrada normalizada)

```js
{
  conta: { id, nome },
  hoje: '2026-11-23' | Date,                 // data de referência (padrão: agora)
  meta: { tipoResultado: 'lead'|'conversa'|'compra', custoAlvo: 10, roasAlvo: 3|null },
  orcamentoDiarioConta: 1160,                // opcional; padrão = soma dos donos de orçamento ativos (abaixo)
  tetoDiario: 1500 | null,                   // teto combinado com o cliente
  orcamentoMinimo: 6,                        // piso de orçamento por conjunto (R$/dia), padrão 6
  arredondarOrcamento: 0.01 | 1,             // passo de arredondamento do novo orçamento (padrão 0,01)
  campanhas: [{
    id, nome, status: 'ativo'|'pausado'|'erro', cbo: bool, orc /* R$/dia, só se cbo */,
    objetivo: 'mensagem'|'lead'|'compra'|…, aprendizado: 'aprendendo'|'limitado'|null, alteradoEm: ISO|null,
    meta?: { tipoResultado, custoAlvo, roasAlvo },      // sobrepõe a meta da conta (custoAlvo null = sem regras de custo)
    metricas3d?, metricas7d?, metricas14d?, metricas7dAnterior?,   // opcionais: padrão = soma dos conjuntos
    conjuntos: [{
      id, nome, status, orc /* R$/dia, se não for CBO */, aprendizado, diasEmAprendizado?, alteradoEm?,
      metricas3d?, metricas7d?, metricas14d?, metricas7dAnterior?,  // padrão = soma dos anúncios
      anuncios: [{ id, nome, status, formato, alteradoEm?, metricas3d, metricas7d, metricas14d, metricas7dAnterior? }],
    }],
  }],
  metricas3d?, metricas7d?, metricas14d?, metricas7dAnterior?,   // da conta; padrão = soma das campanhas
  gastoPorDia?: [{ data, gasto }],           // últimos dias (mais recente no fim)
  gastoUltimos2Dias?: 0,                     // alternativa a gastoPorDia
  diasComDados?: 60,                         // dias com gasto (regra "dados insuficientes")
  diasSemOtimizar?: 4,                       // informativo
  ultimaMensagemCliente?: ISO | null,        // ou diasSemMensagem; null = sem cliente (conta própria)
  statusConta?: 'Pagamento pendente', riscoCancelamento?: 'Alto',
}
```

**Janela de métricas** (`metricas3d`, `metricas7d`, `metricas14d`): `{ gasto, impressoes, cliques, resultados, valor?, alcance?, frequencia? }`.
O motor deriva `custo = gasto/resultados`, `ctr = cliques/impressoes×100`, `cpm`, `cpc`, `roas`, e `frequencia` (de alcance, se faltar).
A janela **7 dias anteriores** = `metricas14d − metricas7d` (somas; frequência ponderada por impressões), ou `metricas7dAnterior` se vier pronta.
Somas entre níveis: aditivas por soma, frequência ponderada por impressões.

**Dono do orçamento**: campanha CBO ativa (orçamento na campanha) ou conjunto ativo de campanha ativa sem CBO.
`alteradoEm` em qualquer nível abaixo do dono conta como "mexido recentemente" (regras de verba esperam `esperaDias`).

## Regras (dados — `MotorRecs.REGRAS_PADRAO`)

Cada regra: `{ id, nome, descricao, nivel: conta|campanha|conjunto|anuncio, acao, prioridade: agora|hoje|semana, ativo, exigeDados, sucesso, params: [{chave, rotulo, valor, unidade: %|×|dias|n|R$, min, max, passo, ajuda}], restricoes? }`.
Percentuais são números de 0 a 100. Overrides (settings `motorRegras` no app; `localStorage 'torre-motor-regras'` na Torre isolada):
`{ 'escalar-verba': { ativo: true, params: { aumento: 10 } } }` — só o que difere do padrão.

| id | Nível | Ação | Prioridade | Condição (padrões) | Sucesso medido 7 dias depois |
|---|---|---|---|---|---|
| `escalar-verba` | conjunto/CBO | orcamento (+15%) | semana | custo 7d ≤ 70% do alvo, ≥ 10 resultados, fora do aprendizado, custo 3d ≤ alvo, sem mudança há 3 dias. Aumento ≤ limite por mudança (20%) e limitado ao teto (sem folga: mantém e marca `excedeTeto`) | resultados subiram e custo ≤ alvo |
| `reduzir-verba` | conjunto/CBO | orcamento (−20%) | hoje (**agora** se ≥ 150% ou sem resultado) | custo 3d ≥ 125% do alvo, gasto 3d ≥ 1× alvo, sem mudança há 3 dias, piso R$ 6 | custo caiu |
| `pausar-anuncio` | anúncio | pausar | hoje | frequência 7d > 3,5, CTR caiu > 30% vs 7 dias anteriores, custo do anúncio > média do conjunto, ≥ 1.000 impressões, conjunto com outro anúncio ativo | custo caiu |
| `trocar-criativo` | conjunto | **pedirCriativo** | hoje | todos os anúncios ativos do conjunto cansados (frequência > 3,5 e CTR −30%) | CTR subiu |
| `conta-parada` | conta | verificar | agora | gasto 0 nos últimos 2 dias com campanha ativa | voltou a gastar |
| `dados-insuficientes` | conta | aguardar | semana | < 3 dias com gasto ou < 10 resultados em 7 dias — **bloqueia** as regras de desempenho | — |
| `sem-campanha-mensagem` | conta | mensagemCliente | semana | meta = conversa, há campanha ativa, mas nenhuma de mensagem | — |
| `aprendizado-limitado` | conjunto/CBO | verificar | semana | status "limitado", ou aprendendo há ≥ 7 dias com < 50 resultados/semana | custo caiu |
| `revisar-publico` | conjunto | publico | semana | CPM 7d > +40% vs 7 dias anteriores com CTR variando ≤ 10%, ≥ 2.000 impressões | CPM caiu |
| `conversar-cliente` | conta | mensagemCliente | hoje | resultados −20% (ou custo +20%) na semana e ≥ 7 dias sem mensagem ao cliente | resultados subiram |

**Causa antes do corte**: se `reduzir-verba` e uma regra de causa (`pausar-anuncio`, `trocar-criativo`, `revisar-publico`) apontam para o mesmo conjunto, a redução é suprimida; a recomendação da causa herda a urgência e ganha o `aviso` "O custo do conjunto está X× o alvo… Resolva a causa primeiro".

## Saída (sempre o mesmo formato)

```js
{
  id: 'escalar-verba:cj-lw-lal',            // regraId:alvoId (estável → decisões ficam ligadas a ele)
  regraId, regraNome,
  acao: { tipo: 'orcamento'|'pausar'|'pedirCriativo'|'mensagemCliente'|'verificar'|'aguardar'|'publico', rotulo },
  alvo: { nivel, id, nome, campanhaId, conjuntoId },
  titulo, rotuloAcao,                        // "Aumentar a verba de … em 15%" · "Aumentar 15%"
  impactoEsperado,                           // frase com números
  porque,                                    // 1–2 frases em linguagem simples, com os números
  detalhes: ['Regra: …'],                    // limites usados (para o "Por quê")
  de, para,                                  // só orçamento (R$/dia); senão null
  orcamentoDiarioContaDepois: { antes, depois, teto, excedeTeto, frase: 'A conta passa a investir R$ X por dia (hoje R$ Y).', avisoTeto } | null,  // SEMPRE em ações de orçamento
  aviso,                                     // teto, causa antes do corte… ou null
  prioridade: 'agora'|'hoje'|'semana',
  confianca: 'alta'|'média'|'baixa',         // volume: ≥30 resultados alta, ≥10 média (regras de anúncio/público: ≥20.000 / ≥5.000 impressões)
  base: { gasto, resultados, custo, ctr, cpm, frequencia },   // métrica "antes" para o registro de aprendizado
  alvoCusto,
}
```

## Registro de aprendizado

Entrada (`registrarDecisao`): `{ id, recId, regraId, decisao: aceita|recusada|adiada, quem, quando, alvo, acao, titulo, de, para, antes, alvoCusto, avaliarEm (quando +7 dias, só aceitas), resultado: null }`.
Sete dias depois o app mede o alvo nos 7 dias seguintes à decisão e grava `resultado = avaliarResultado(entrada, depois)`.
`estatisticas` usa a decisão mais recente de cada recomendação (adiada → depois aceita conta como aceita) e soma as pendentes como sugestões.

- **App (Campanha)**: coleção nova **`recsLog`** (gravada via `db.insert`; `origem: 'campanha'`). Precisa entrar em `COLS` de `src/core/store.js` para o Supabase carregar/semear — no modo demo já funciona. A demonstração semeia 18 decisões ilustrativas (`demo: true`).
- O estado da tela (pendente/aplicada/ignorada/adiada até a data, com cópia da recomendação) fica em `campaignAccount.decisoes`.

## Torre de Controle

- Isolada: lê overrides de `localStorage['torre-motor-regras']`.
- Embutida no app: o host envia `iframe.contentWindow.postMessage({ tipo: 'motorRegras', regras: db.config('motorRegras', {}) }, '*')` (ao carregar e quando `settings.motorRegras` mudar). A Torre grava em `localStorage` e recalcula.
- O adaptador distribui gasto/resultados de 7 dias (`g7/res`) por conjunto e anúncio e escala as janelas de 3/14 dias da série da conta. Como o protótipo não tem frequência/CTR por anúncio, os sinais de diagnóstico da conta viram métricas: `fadiga 'Saturado'` → 1º anúncio ativo do conjunto principal com frequência 3,6 e CTR −38%; semáforo "Atenção" sem fadiga → CPM +50% com CTR estável. Com dados reais (Windsor) o adaptador recebe as métricas por anúncio e esses sinais saem.

### Integração no protótipo (torre2)

- `build.js` concatena `data.js` → **`motor-recs.js`** (lido de `agencia-os/src/shared/motor-recs.js`, com cópia local para build isolado) → **`motor-torre.js`** → `ov.js` → …
- `motor-torre.js`: `recsDaConta(a)` (adaptador + motor → formato da Torre `{id, status, tipo: budget|pause|publico|msg|criativo|verificar|aguardar, titulo, motivo, impacto, prioridade, aviso, alvo, de, para, frase, _m}`), uma sugestão por regra por conta; `gerarRecs()` (regera mantendo decisões); `recAberta/recFeita` (pedido de criativo feito = resolvido); listener `message` `{tipo:'motorRegras'}`; registro `logRec` em `localStorage['torre-recs-log']` + `paraHost({tipo:'recDecisao', entrada})` para o Agência OS gravar em `recsLog`.
- `ov.js`: `porque()` = `r.motivo` do motor; `prioridade(a)` = prioridade da 1ª recomendação aberta (agora/hoje/semana) + estado operacional (conta parada, pagamento, revisão com erro, alertas ≥ 2).
- `app.js`: "Fazer agora" por tipo (orçamento e pausa com SIM, sem limite por hora (decisão de 25/11/2026), autoria auditada; público abre o editor; criativo abre "Pedir criativo"; verificar/aguardar registram), "Impacto esperado" e aviso do motor no card.
- Testes: `t6.js` (motor na Torre: formato, Por quê, fila, teto, regras por localStorage e postMessage, registro).
