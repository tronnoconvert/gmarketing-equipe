# Briefing comum — agentes de módulo (Fase 2)

Projeto: /home/user/agencia-os. Leia ANTES de codar: PLAN.md, docs/CORE-API.md (API real — use só ela), docs/spec-dono.md (valores exatos),
e o código de src/core/ui-demo.js (exemplos de uso de todos os componentes e gráficos). Playwright + Chromium já instalados (`require('playwright')`), não rode `playwright install`.

## Regras
1. Edite SOMENTE os arquivos do(s) seu(s) módulo(s): `src/modules/<id>/**` e `tests/<id>.spec.mjs` (+ arquivos extras citados no seu prompt). NÃO edite src/core, build.mjs, tests/run.mjs, registry.js nem módulos de outros. Se achar bug no core, contorne no seu módulo e relate no relatório final.
2. Vários agentes trabalham em paralelo. Sempre compile/teste com saída própria: `OUT=/tmp/aos-<id> npm run build` e `OUT=/tmp/aos-<id> node tests/run.mjs <id>`. Se o build falhar por erro em arquivo de OUTRO módulo (edição em andamento), espere ~1 min e tente de novo; não mexa nele.
3. Texto 100% pt-BR, R$, dd/mm/aaaa. Dados fictícios (nunca nomes reais de clientes). Use `fmt.esc()` em todo texto vindo de dados.
4. Visual: o dono se importa MUITO com visual e disse que pílulas pastel e "tudo arredondado igual" parecem amadoras/"cara de IA". Padrão de SaaS famoso (Linear/Stripe/Vercel): fundo tingido, cards brancos flutuando, hierarquia tipográfica clara, números tabulares, vermelho só para o que exige ação, verde discreto. Use os componentes do core (kpi, card, tabela, led, selo Marcador, charts) para manter consistência. Estilos próprios só em `src/modules/<id>/style.css` com prefixo `.m-<id>`. Funcionar nos temas claro e escuro e em 390 px (sem rolagem horizontal da página).
5. Heurísticas de Nielsen (PLAN §2) em toda tela: status visível (LED + texto, "atualizado há"), linguagem da agência, Cancelar/Desfazer/Esc, consistência, validação antes de salvar e confirmação em ações destrutivas, filtros visíveis e na URL, atalhos onde fizer sentido, só o essencial, mensagens de erro com o que fazer, `?` explicando cada indicador e estados vazios que ensinam o próximo passo.
6. Permissões: respeite `ctx.can(mod, 'editar'|'excluir')` (esconda/desabilite ações com tooltip explicando) e `escopoClientes()` onde houver lista de clientes.
7. Ações reais: toda ação deve FAZER algo no demo (gravar no db, gerar activity, notificar quem precisa via notify, toast com Desfazer quando aplicável). Nada de botão morto.
8. Cada módulo implementa `busca(q)` (para a busca global) e `contador()` quando houver pendência.
9. Qualidade: escreva `tests/<id>.spec.mjs` cobrindo renderização de todas as rotas do módulo, os fluxos principais (criar/editar/ações), permissões básicas, sem erros de console e sem overflow (o runner já checa). Rode até passar nas 3 larguras. Tire screenshots (claro + escuro, 1366 e 390) das telas principais, OLHE para elas com a ferramenta Read e corrija o que estiver feio, apertado, desalinhado ou ilegível. Repita até ficar com cara de produto profissional.
10. Não faça perguntas; decida e documente no relatório final (arquivos, rotas, decisões, resultado dos testes, bugs do core encontrados).

## Mapa de rotas (use estes links entre módulos)
- mesa: `#/mesa` (Minha mesa — início de cs, produção, comercial, financeiro e leitura; dono/admin começam em `#/cockpit`, gestor e head de tráfego em `#/torre/voo`)
- cockpit: `#/cockpit`
- financeiro: `#/financeiro`, `#/financeiro/:aba` (visao, caixa, dre, receber, rentabilidade, unidade) · ação: `#/financeiro/receber?cobrar=<invoiceId>`
- clientes: `#/clientes` (`?f=risco|atraso|inadimplentes|renovam`), `#/clientes/novo`, `#/clientes/:id`, `#/clientes/:id/:aba` (visao, resultados-acoes, entregas, cadastro, financeiro — as antigas resultados, acoes, saude e comentarios redirecionam) · ações: `#/clientes/c-orion?acao=resgate`, `#/clientes/c-technova?acao=agendar`
- operacao: `#/operacao`, `#/operacao/:aba` (visao, quadro, calendario, projetos) · `#/operacao/quadro?tarefa=<id>`
- equipe: `#/equipe`, `#/equipe/atividade`, (`#/equipe/acessos` → redireciona para `#/admin/permissoes`), `#/equipe/:id`, `#/equipe/:id/:aba` (agora, performance, evolucao, clientes, horas, acesso) · ação: `#/equipe/t-ana?acao=redistribuir`
- torre: `#/torre` (rotinas e integrações), `#/torre/rotina/:id` (log), `#/torre/voo` (Painel de Voo nativo), `#/torre/voo/:conta?aba=campanhas|historico` · ação: `#/torre/rotina/r-sync-leads`
- comercial: `#/comercial`, `#/comercial/:aba` (pipeline, desempenho, propostas)
- alertas: `#/alertas`, `#/alertas/regras`
- webinars: `#/webinars`, `#/webinars/novo`, `#/webinars/:id`, `#/webinars/:id/preencher`
- campanha: `#/campanha`, `#/campanha/:aba` (visao, campanhas, criativos, conexao)
- notificacoes: `#/notificacoes` (fora do menu lateral; sino, perfil, barra inferior do celular e paleta Ctrl+K)
- padroes: `#/padroes`, `#/padroes/:secao` (clientes, equipe, operacao, financeiro, webinars, alertas, comercial, acesso, torre, orcamento, recomendacoes, invasao, tudo) · `?item=<id>` rola até o padrão · `?q=` busca
- admin: `#/admin`, `#/admin/:aba` (usuarios, equipe, permissoes, integracoes, notificacoes, auditoria; `#/admin/clientes` → redireciona para `#/clientes`)

## Dono de cada coleção (só o dono semeia; os outros só leem/escrevem)
- core (já semeado): users, team, notifications, comments. IDs: team `t-gabriel, t-ana, t-bruno, t-felipe, t-carla, t-diego, t-elisa, t-rayane, t-marina, t-paulo, ...`; users `u-...` (veja seed-core.js).
- clientes: clients (ids canônicos `c-orion, c-vida, c-alfa, c-technova, c-imob, c-bella, c-studiofit, c-autocenter, c-petfeliz, c-otica, c-cafe` + os demais até 42 ativos), contacts, contracts, healthHistory, meetings, onboarding, clientResults, clientActions.
- cockpit/financeiro: invoices, payables, cash, mrrMoves, finance (séries e DRE), costs.
- equipe/operacao: tasks, deliveries, projects, timeEntries, goals, checkins, oneOnOnes, teamStats (ocupação/status por pessoa — NÃO altere o registro `team` do core; complemente via teamStats com `teamId`).
- torre/alertas/comercial: routines, routineRuns, integrations, alerts, alertRules, insights, deals.
- webinars/campanha: webinars, webinarDaily, campaignAccount, campaignDaily, campaigns, creatives.
- admin: settings (perms já existe), invites.
Se precisar de dado de outra coleção que ainda não existe (o outro agente está fazendo), trate vazio com elegância (estado vazio) — na integração final tudo estará semeado. Pode criar o arquivo de dados da SUA coleção logo no início para destravar os outros.
