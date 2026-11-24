# Prompt — módulo Equipe (controle, monitoramento e performance)

**Objetivo do dono:** em menos de 1 minuto saber quem está sobrecarregado, quem está parado, o que cada pessoa está fazendo agora, se está evoluindo, e agir (redistribuir, conversar, reconhecer). Sem microgerenciar: medir resultado e fluxo, não cliques.

## Telas
1. **Visão do time** (`#/equipe`)
   - KPIs: Ocupação média (zona 70–85%), Entregas no prazo do time, Pessoas acima de 100% (com LED err), Receita por colaborador (MRR ÷ pessoas faturáveis), Horas faturáveis × contratadas (utilização faturável, meta 75–80%), Taxa de retrabalho.
   - Mapa de capacidade: barra por pessoa com zona ideal sombreada 70–85%, cores pelas regras (>100 err, 86–100 warn, 70–85 ok, <70 "ociosa" em azul/neutro), próximas 4 semanas (calor).
   - Cartões por pessoa: avatar, status (LED: online ok, ausente warn, férias/folga off, sobrecarga err), cargo, "Fazendo agora" (tarefa em andamento + cliente), entregas da semana, atrasos, clientes sob responsabilidade, tendência de 6 semanas.
   - Risco de burnout: lista de quem está há ≥2 semanas seguidas >100% (Ana Souza: 3ª semana) com ação "Redistribuir" (modal que sugere para quem passar tarefas, com base em ocupação e skill).
2. **Perfil da pessoa** (`#/equipe/:id` abas)
   - **Agora**: tarefas em andamento, em aprovação, atrasadas; último check-in.
   - **Performance** (KPIs inspirados em Productive.io, Float, Harvest, Teamwork, Asana, Scoro): utilização (horas trabalhadas ÷ capacidade), utilização faturável, entregas no prazo %, throughput (entregas/semana), lead time médio, retrabalho %, aprovação na 1ª tentativa %, SLA de 1ª resposta (CS), receita gerada/gerida (MRR dos clientes sob responsabilidade), resultado dos clientes (health médio, ROAS médio para tráfego), NPS dos clientes dela. Gráfico 12 semanas com metas. Comparação com a média do time (sem ranking humilhante: mostra faixa do time).
   - **Evolução**: metas individuais/OKRs com progresso, PDI (competências 1–5), feedbacks recebidos, reconhecimentos (👏 elogios de clientes), histórico de 1:1 (data, notas, combinados com checkbox).
   - **Clientes**: carteira dela com health, horas reais × contratadas por cliente (overservicing em warn/err).
   - **Horas**: lançamentos de horas (timeEntries) por cliente/projeto, semanas.
   - **Acesso**: papel, permissões efetivas (lê de perms), clientes no escopo, último acesso, ativo/inativo (editável só por dono/admin).
3. **Atividade do time** (`#/equipe/atividade`): feed do que cada um fez hoje (entregas concluídas, alterações em contas, comentários), filtro por pessoa; "check-in diário" (o que fiz / o que farei / bloqueios) que cada um preenche e o dono lê.
4. **Permissões** (`#/equipe/acessos`): matriz papel × módulo (§5 do PLAN) editável por dono/admin, com descrição do que cada papel pode; aviso ao reduzir permissão do próprio usuário.

## Regras
- Ocupação: >100% err · 86–100% warn · 70–85% ok · <70% "ociosa" (neutro, não vermelho).
- Burnout: ≥2 semanas seguidas >100% → alerta warn; ≥3 → err.
- Overservicing: horas reais > 110% das contratadas no cliente → warn; >130% → err.
- Nielsen: explicar cada métrica no `?`; nunca mostrar dado de horas sem contexto (contratadas); ações com confirmação e desfazer.
- Pessoas sem permissão de Equipe veem apenas o próprio perfil.

## Dados de exemplo
Ocupação: Ana 118 (3 semanas >100) · Bruno 96 · Felipe 88 · Carla 82 · Diego 74 · Elisa 58. Status: Ana online, Bruno online, Felipe online, Carla ausente, Diego online, Elisa férias até 28/11. Custos/hora e horas contratadas coerentes (ex.: 160 h/mês).
