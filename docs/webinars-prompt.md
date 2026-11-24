# Prompt — módulo Webinars (lançamentos)

**Objetivo:** alguém da equipe preenche os dados de cada webinar (antes, durante e depois) e o dono acompanha a performance, compara lives e descobre onde o funil vaza.

## Telas
1. **Painel** (`#/webinars`): KPIs do período (webinars realizados, inscritos, custo por inscrito, taxa de comparecimento, vendas, faturamento, ROAS, lucro), funil consolidado (Impressões → Cliques → Inscritos → Confirmados no grupo → Ao vivo (pico) → Ficaram até a oferta → Cliques no checkout → Vendas), tendência por webinar (barras + linha), tabela comparativa com LED por meta (verde bateu, âmbar perto, vermelho abaixo) e melhores/piores.
2. **Webinar** (`#/webinars/:id`): cabeçalho (tema, data/hora, apresentador, oferta, ticket, status: Planejado / Captação / Ao vivo hoje / Realizado / Encerrado), funil com taxas de conversão entre etapas e benchmark, captação diária (inscritos por dia × investimento), retenção ao vivo (curva de audiência por minuto com marcação do momento da oferta), vendas por dia de carrinho, origem dos inscritos (Meta, Google, orgânico, lista, indicação), checklist do lançamento (página, anúncios, e-mails, WhatsApp, ensaio, link da live, replay), notas e aprendizados, comentários e notificações.
3. **Preencher dados** (`#/webinars/:id/preencher`, e "+ Novo webinar"): formulário em etapas, salvável parcialmente (rascunho), com validação e máscara:
   - Planejamento: nome/tema, data e hora, apresentador, plataforma (YouTube, Zoom, StreamYard…), oferta, ticket (R$), meta de inscritos, meta de vendas, orçamento de tráfego.
   - Captação (pode ser lançada por dia): investimento, impressões, cliques, inscritos, inscritos por origem, entradas no grupo de WhatsApp.
   - Ao vivo: pico simultâneo, presentes únicos, tempo médio assistido (min), presentes no momento da oferta, mensagens no chat, curva de audiência (minuto, pessoas) opcional.
   - Vendas: cliques no checkout, vendas (ao vivo, carrinho, replay), faturamento bruto, reembolsos, boletos/pix pendentes.
   - Pós: replay views, NPS da live, aprendizados.
   - Mostra cálculos automáticos ao vivo enquanto preenche (CPL, comparecimento, conversão, ROAS, lucro) e alerta se algo parece errado (ex.: presentes > inscritos).
## Métricas calculadas
Custo por inscrito = investimento ÷ inscritos · Comparecimento = presentes únicos ÷ inscritos · Retenção até oferta = presentes na oferta ÷ pico · Conversão da live = vendas ÷ presentes únicos · Conversão geral = vendas ÷ inscritos · CAC = investimento ÷ vendas · ROAS = faturamento ÷ investimento · Lucro = faturamento − reembolsos − investimento − custos.
Benchmarks de referência (mercado BR de lançamentos, ilustrativos): comparecimento 25–35%, retenção até oferta 50–65%, conversão da live 3–8%.
## Dados de exemplo
6 webinars nos últimos 6 meses (nomes de tema genéricos, ex.: "Tráfego que Vende 2.0", "Método Agência Lucrativa"), um planejado para dezembro em captação, um "Ao vivo hoje" não; números coerentes.
## Permissões
Dono/admin: tudo. Equipe (produção, tráfego, CS): preencher e editar os webinars em que está escalada; ver o painel. Exclusão só dono/admin.
