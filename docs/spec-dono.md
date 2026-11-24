# Painel do Dono de Agência — conteúdo e dados (documento do dono, valores exatos)

Todos os números, clientes e pessoas são ilustrativos. Não define layout, exceto as luzes de status.

## 1. Luzes de status
| Estado | Cor | Comportamento | Significado |
|---|---|---|---|
| ok | Verde #34D399 | Acesa e parada, brilho suave | Funcionando normalmente |
| warn | Âmbar #FBBF24 | Pulsa devagar (2 s) | Atenção: atrasada, perto de expirar, fora da meta |
| err | Vermelho #F87171 | Pisca rápido (0,8 s) + anel que se expande | Falhou ou é crítico; exige ação |
| off | Cinza #4B5370 | Apagada | Pausada ou desativada |

```css
.led{width:10px;height:10px;border-radius:50%;display:inline-block;position:relative;flex:none}
.led.ok{background:#34D399;box-shadow:0 0 10px rgba(52,211,153,.85)}
.led.warn{background:#FBBF24;animation:pw 2s ease-in-out infinite}
.led.err{background:#F87171;animation:pe .8s ease-in-out infinite}
.led.err::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid #F87171;animation:ring 1.2s ease-out infinite}
.led.off{background:#4B5370}
@keyframes pw{0%,100%{box-shadow:0 0 12px rgba(251,191,36,.9)}50%{opacity:.4;box-shadow:0 0 2px rgba(251,191,36,.2)}}
@keyframes pe{0%,100%{box-shadow:0 0 14px rgba(248,113,113,1)}50%{opacity:.45}}
@keyframes ring{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.9);opacity:0}}
```
Onde aparecem: luz mestra no topo (ex.: vermelha "2 alertas críticos"); cada rotina e integração; status de pagamento de cada cliente; cada item de "Precisa de você hoje"; mapa da carteira (uma por cliente, pelo health score).

## 2. Seções
Cockpit · Financeiro · Clientes · Operação · Equipe · Torre de Controle · Comercial · Alertas e Insights.
Contadores: Clientes 5 (em risco), Torre de Controle 1 (falha).
Globais em todas as telas: seletor de período (Mês / Trimestre / 12 meses), busca global (cliente, pessoa, tarefa), luz mestra, notificações, perfil.

## 3. Cockpit
### 3.1 Indicadores
| Indicador | Valor | Variação | Complemento | Histórico |
|---|---|---|---|---|
| MRR | R$ 186,4 mil | ▲ 8,2% | vs outubro | 150,152,151,155,158,157,160,163,165,164,168,171,173,176,175,178,181,183,186 |
| Margem líquida | 27,4% | ▲ 1,1 pp | vs outubro | 22,23,22,24,25,24,25,26,25,26,27,26,27,27.4 |
| Caixa | R$ 412 mil | 6,8 meses | de runway | 360,372,368,380,390,385,395,402,398,405,412 |
| Clientes ativos | 42 | ▲ 3 | no mês | 35,36,36,37,38,38,39,39,40,39,41,42 |
| MRR em risco (DESTACAR COMO ALERTA) | R$ 23,9 mil | 5 clientes | 12,8% do MRR | 9,11,10,13,14,16,15,18,20,22,23.9 |
| Entregas no prazo | 91% | ▼ 2 pp | meta 95% | 94,95,93,96,94,93,95,92,93,91 |

### 3.2 Saúde da agência
Score geral 78/100 (▲ 3 pts vs outubro). Componentes: Financeiro 84 · Clientes 71 · Operação 76 · Equipe 80.

### 3.3 Receita × Custos (R$ mil)
Dez 148/112 · Jan 152/114 · Fev 155/118 · Mar 151/117 · Abr 160/120 · Mai 164/121 · Jun 168/124 · Jul 171/126 · Ago 170/127 · Set 176/129 · Out 181/132 · Nov (atual) 186,4/135,3 · Dez (proj.) 190 · Jan (proj.) 194 · Fev (proj.) 199.
Destaque: Nov, R$ 186,4 mil, margem de 27%.

### 3.4 Mapa da carteira (MRR × health)
Grupo Orion 14,2k 41 err · Clínica Vida 12,8k 88 ok · Construtora Alfa 11,5k 82 ok · TechNova 9,7k 63 warn · Imob Prime 8,9k 79 ok · Bella Moda 6,8k 48 err · Studio Fit 6,1k 85 ok · Auto Center Sul 5,6k 66 warn · Pet Feliz 4,9k 90 ok · Ótica Visão 4,2k 77 ok · Café Raiz 3,4k 61 warn · +31 clientes R$ 98,3k ok.
Faixas: ≥75 ok, 60–74 warn, <60 err.

### 3.5 Torre (resumo)
Torre de Controle — ok · há 4 min — ok
Sync leads Meta → CRM — falhou 2× · 23:42 — err
Relatório semanal — ok · seg 08:00 — ok
Cobrança automática — ok · há 1 h — ok
Health score clientes — atrasada 35 min — warn
Resumo no WhatsApp — ok · 07:30 — ok
Alerta verba de mídia — ok · há 12 min — ok
Backup de criativos — pausada — off

### 3.6 Precisa de você hoje
err · Grupo Orion: score caiu 22 pts · 3 entregas atrasadas · ROAS 1,8 vs meta 3,0 · [Abrir ficha]
err · Rotina "Sync de leads" falhou 2× · Erro de token Meta · última tentativa 23:42 · [Ver log]
warn · Fatura vencida: Bella Moda · R$ 6.800 · 9 dias em atraso · [Cobrar]
warn · Ana Souza em 118% de ocupação · 3ª semana seguida acima de 100% · [Redistribuir]
warn · TechNova renova em 6 dias · Nenhuma reunião de renovação marcada · [Agendar]

### 3.7 Capacidade do time
Zona ideal 70–85%. >100% crítico; 86–100% atenção; 70–85% ideal; <70% ociosa.
Ana Souza Tráfego 118% · Bruno Lima Social 96% · Felipe Nunes Dev 88% · Carla Dias Design 82% · Diego Melo Atendimento 74% · Elisa Rocha Copy 58%

### 3.8 Renovações (60 dias)
30/nov TechNova R$ 9,7k 63 · 08/dez Clínica Vida R$ 12,8k 88 · 15/dez Café Raiz R$ 3,4k 61 · 09/jan Studio Fit R$ 6,1k 85

## 4. Torre de Controle (rotinas e integrações)
Atualizada continuamente ("atualizado há 20 s"). Ações: Configurar alertas, + Nova rotina.
### 4.1 Resumo: ok 11 · warn 2 · err 1 · off 1
### 4.2 Rotinas
Campos: nome, descrição, status (luz + Operando/Atenção/Falhou/Pausada), última execução, próxima, sucesso 30d, histórico 30 dias, responsável, frequência, erro, ações Ver log e Rodar agora (ou Retomar se pausada).
| Rotina | Descrição | Status | Última | Próxima | Sucesso 30d | Resp. | Frequência | Erro / histórico |
|---|---|---|---|---|---|---|---|---|
| Sync de leads Meta → CRM | Puxa leads dos formulários e cria contatos no CRM | err | 23:42 · falhou | retry 00:12 | 86,7% | DM | a cada 15 min | OAuthException 190: token de acesso expirado · falhas dias 28 e 30, atenção 22 e 23 |
| Health score dos clientes | Recalcula o score com entregas, resultado e pagamentos | warn | 23:25 · 35 min atraso | 00:00 | 93,3% | FN | a cada hora | atenção dias 13, 29 e 30 |
| Torre de Controle | Monitora todas as rotinas e dispara alertas | ok | há 4 min · 3 s | em 1 min | 100% | FN | a cada 5 min | — |
| Cobrança automática | Envia boletos e lembretes de vencimento | ok | há 1 h · 12 s | 09:00 | 100% | EU | diária | — |
| Relatório semanal de clientes | Gera e envia o PDF de resultados para cada cliente | ok | seg 08:00 · 4 min | seg 08:00 | 100% | BL | semanal | — |
| Alerta de verba de mídia | Avisa quando uma conta passa de 90% do orçamento | ok | há 12 min · 6 s | em 18 min | 99,1% | AS | a cada 30 min | atenção dia 10 |
| Resumo diário no WhatsApp | Manda o pulso da agência para o dono às 07:30 | ok | hoje 07:30 · 8 s | amanhã 07:30 | 100% | EU | diária | — |
| Conciliação bancária | Cruza extrato com contas a receber | warn | ontem 22:00 · 3 itens sem par | hoje 22:00 | 96,7% | EU | diária | atenção dia 30 |
| Backup de criativos | Copia artes aprovadas para o drive | off | há 5 dias | — | 100% | CD | diária · pausada | pausada últimos 5 dias |
Taxa de sucesso: ≥98% ok, 90–97,9% warn, <90% err. (O resumo conta 15 rotinas: complete com 6 rotinas ok coerentes, ex.: Sync Google Ads, Atualização de MRR, Lembrete de reuniões, Monitor de entregas, Lembrete de renovações (terças 08:00; substituiu a antiga Captura de NPS — NPS removido a pedido do dono), Sync monday.com.)
### 4.3 Integrações
Meta Ads err token expirado · Google Ads ok · CRM warn token expira em 5 dias · Banco/boletos ok · WhatsApp API ok · monday.com ok · Google Analytics 4 ok · Google Drive ok
### 4.4 Execuções de ontem (00–24h)
Sync de leads: a cada 1h30 até 22h ok; 22:36 warn; 23:12 err; 23:42 err · Health score: de hora em hora até 22h ok; 23:24 warn · Torre: a cada 45 min ok · Alerta de verba: de hora em hora ok · Cobrança: 09:00 ok · Resumo WhatsApp: 07:30 ok

## 5. Clientes
Ação: + Cadastrar cliente.
### 5.1 KPIs: Clientes ativos 42 (▲3 no mês) · Health médio 74 (▼2 pts) · Em risco 5 (R$ 23,9 mil de MRR) · Renovam em 30 dias 3 (substitui o antigo KPI de NPS, removido a pedido do dono) · Churn 12m 8,3% (meta <10%)
### 5.2 Matriz risco × valor
Quadrantes: Proteger e expandir (valor alto, risco baixo) · Ação imediata (alto, alto) · Manter (baixo, baixo) · Revisar escopo (baixo, alto).
Grupo Orion 86% 14,2 41 · Clínica Vida 14 12,8 88 · Construtora Alfa 22 11,5 82 · TechNova 61 9,7 63 · Imob Prime 30 8,9 79 · Bella Moda 80 6,8 48 · Studio Fit 12 6,1 85 · Auto Center Sul 58 5,6 66 · Pet Feliz 8 4,9 90 · Ótica Visão 34 4,2 77 · Café Raiz 66 3,4 61 · outros: (20%, 2,6, 81) (42%, 2,1, 72) (72%, 1,8, 55)
### 5.3 Ficha Grupo Orion
Varejo · cliente há 14 meses · resp. Ana Souza · Health 41 (err) · MRR R$ 14.200 · Renovação 12/fev · Score 30d ▼22.
Componentes (atual × meta): Resultado 30×80 · Prazo 45×90 · Engajamento 32×75 · Pagamento 90×95 (46 ponderado − 5 de queda aguda = 41).
Por que está em risco: ROAS 1,8 vs meta 3,0 há 6 semanas · 3 entregas atrasadas no mês · Decisor não responde há 11 dias.
Ações: Plano de resgate · Abrir cadastro.
### 5.4 Carteira
Filtros: Todos (42) · Em risco (5) · Com atraso (4) · Inadimplentes (2) · Renovam em 30 dias (3).
| Cliente | Desde | Serviços | MRR | Health | Tendência 6m | No prazo | Pagamento | Renova | Resp. |
|---|---|---|---|---|---|---|---|---|---|
| Grupo Orion | set/2025 | Tráfego, Social | 14.200 | 41 | 70,66,63,58,49,41 | 62% | Em dia (ok) | 12 fev | AS |
| Clínica Vida | mar/2024 | Tráfego, Site | 12.800 | 88 | 82,84,85,86,87,88 | 98% | Em dia (ok) | 08 dez | BL |
| Construtora Alfa | jan/2025 | Tráfego, CRM | 11.500 | 82 | 78,80,79,81,82,82 | 95% | Em dia (ok) | 20 mar | AS |
| TechNova | dez/2024 | Social, Conteúdo | 9.700 | 63 | 74,72,70,67,65,63 | 84% | Em dia (ok) | 30 nov | BL |
| Imob Prime | jun/2025 | Tráfego | 8.900 | 79 | 72,74,75,77,78,79 | 93% | Em dia (ok) | 02 jun | DM |
| Bella Moda | fev/2025 | Social, Tráfego | 6.800 | 48 | 66,63,60,55,51,48 | 78% | 9 dias de atraso (err) | 18 abr | BL |
| Studio Fit | ago/2024 | Social | 6.100 | 85 | 80,82,83,83,84,85 | 100% | Em dia (ok) | 09 jan | DM |
| Auto Center Sul | abr/2025 | Tráfego, Google | 5.600 | 66 | 70,69,69,67,66,66 | 88% | Vence amanhã (warn) | 11 mai | AS |
| Pet Feliz | nov/2023 | Tráfego, Social | 4.900 | 90 | 86,88,88,89,90,90 | 100% | Em dia (ok) | 25 fev | DM |
| Café Raiz | out/2025 | Social | 3.400 | 61 | 68,66,64,63,62,61 | 80% | 3 dias de atraso (warn) | 15 dez | BL |
(Ótica Visão: Ótica, 4.200, health 77 — complete coerente.) No prazo: ≥90 ok, 75–89 warn, <75 err.
### 5.5 Retenção por safra (M0..M5)
Jun 100,100,92,92,85,85 · Jul 100,95,95,90,90 · Ago 100,100,88,88 · Set 100,92,92 · Out 100,100 · Nov 100
### 5.6 Onboarding: Contrato assinado 4 · Acessos liberados 3 · Kickoff feito 2 · 1ª entrega 2 · 1º resultado 1. Alerta: 2 clientes parados em "Acessos" há mais de 5 dias.

## 6. Health score
0–100. Pesos: Resultado vs meta 35% · Entregas no prazo 25% · Engajamento 20% · Pagamento em dia 20%. Faixas ≥75 ok · 60–74 warn · <60 err.
**NPS removido a pedido do dono** (nov/2026): saiu do health score, dos KPIs de Clientes, da ficha, do cadastro e da Equipe; os pesos foram redistribuídos (antes: Resultado 30 · Prazo 20 · Engajamento 20 · Pagamento 15 · NPS 15) mantendo os scores exibidos dos clientes. O "NPS da live" dos Webinars não é NPS de cliente e continua.

## 7. Cadastro do cliente
Dados (razão social, nome fantasia, CNPJ, segmento, logo) · Contatos (decisor, contato do dia a dia, telefone/WhatsApp, e-mail) · Contrato (início, MRR, índice e data de reajuste, fidelidade, renovação, PDF) · Serviços (tráfego, social, site, CRM, conteúdo, Google…) · Metas (ROAS, CPL, leads/mês, faturamento…) · Teto de mídia (R$/mês que o cliente aceita investir em anúncios; diário = mensal ÷ 30,4 — orçamento do cliente, visível à equipe dele) · Comissão variável (só dono/admin: pessoa da equipe, R$ fixo/mês ou % do MRR, por N meses a partir do início) · Acessos (contas de anúncio, analytics, site, com LED de conexão) · Responsável interno · Histórico (reuniões, entregas, reclamações, elogios) · Resultados vs metas · Health score e histórico.

## 8. A detalhar
Financeiro: ponte de MRR; fluxo de caixa com projeção 90d; DRE simplificada; contas a receber por faixa (a vencer, 1–15, 16–30, 30+); rentabilidade por cliente (receita × margem × horas); concentração (alerta top 3 > 40%); margem por serviço; CAC, LTV, LTV/CAC, payback.
Operação: contadores (a fazer, andamento, aprovação, atrasado); entregas atrasadas (dias); % no prazo por semana (meta 90–95%); calendário de carga; projetos e marcos; retrabalho e tempo de aprovação; SLA de 1ª resposta.
Equipe: status (online, ausente, férias) com luz; ocupação, entregas, atrasos; clientes sob responsabilidade; horas reais × contratadas por cliente; risco de burnout (semanas seguidas >100%); receita por colaborador.
Comercial: pipeline por etapa e valor; receita ponderada; conversão e ciclo; propostas enviadas × ganhas.
Alertas: feed acionável; regras configuráveis (limite, canal, destinatário), WhatsApp/Slack.
Alertas essenciais: cliente de MRR alto com score caindo · entrega atrasada > 2 dias · fatura vencida > 7 dias · rotina/integração vermelha · pessoa > 100% de ocupação · renovação < 30 dias sem reunião · runway < 3 meses.

## Equipe de exemplo (usar em todo o app)
Dono: Gabriel Leão (dono). Ana Souza (AS, Tráfego, gestor_trafego) · Bruno Lima (BL, Social, cs/atendimento de contas) · Felipe Nunes (FN, Dev, producao) · Carla Dias (CD, Design, producao) · Diego Melo (DM, Atendimento, cs) · Elisa Rocha (EU, Copy, producao — iniciais EU no documento) · Rayane Leão (admin) · Marina Costa (comercial) · Paulo Reis (financeiro).
