# Próximos passos (combinados com o dono)

## Regras permanentes do dono
- **"Visível para mim" = Dono + Rayane Leão (sócia, papel Admin).** Toda vez que o dono pedir algo "só para mim",
  estender automaticamente para a Rayane (ela terá o próprio e-mail de login).
- Head de Tráfego: Allan Vieira — vê a central "Padrões e regras" junto com Dono/Rayane.

## Depois de hospedar (prioridade 1 — NÃO ESQUECER)
- **Item 17 · Torre Meta Ads nativa dentro do app.** Reconstruir o Painel de Voo (hoje a Torre antiga embutida em iframe,
  `public/torre/`, fontes em /home/user/torre2) como módulo nativo do Agência OS:
  - mesmos clientes (`clients`), equipe (`team`), alertas, sino, permissões e "Ver como" do app;
  - alterações (pausar, verba, criativo) gravadas em `clientActions`/`activity` e visíveis em Clientes › Resultados e ações;
  - dados reais do Meta via Windsor (Edge Function `windsor-proxy`), confirmação "SIM", limite de 4 mudanças de orçamento/conjunto/hora,
    sem links para o Gerenciador ("Criar ou subir campanha: somente pelo Gerenciador, via 4G.");
  - "Ver como" (dono/admin vendo outro gestor) = somente visualização: nenhuma ação no Meta (checar auth.vendoComo()).
  - usar o motor único de recomendações (item 18) e o fluxo "Pedir criativo / Avisar cliente".
  - **teto de verba:** usar o teto de mídia do cadastro do cliente (`client.tetoMidiaMensal`, R$/mês) e o diário
    `tetoDiarioCliente(c)` de `src/modules/clientes/calc.js` (mensal ÷ 30,4) para o aviso de teto de orçamento
    (soma das verbas diárias ativas do cliente > teto diário → avisar antes de confirmar aumento de verba).
  - Depois de pronto, remover o iframe e a pasta public/torre.

## Também pendente para a hospedagem
- ✅ (25/11) Regra "receita só para Dono/Admin" aplicada no banco (funções seguras + merge na gravação + realtime sem dados).
- Fotos da equipe no Supabase Storage (hoje ficam no registro como data URL).
- ✅ (25/11) Teste real com usuários de teste (`tests/live/producao.mjs`); falta o checklist com as pessoas reais.
- Tela Campanha (conta própria do dono): **duas contas** — CA01 (act_1906477940242386) e CA02 · HOF (act_848802707655510), via Windsor.
  Adaptar o módulo para várias contas: seletor "CA01 / CA02 / As duas (somadas)".
- Windsor: 72 contas Meta ativas; 14 inativas precisam de novo login no Windsor (link via get_connector_connect_info na hora de ligar o Painel de Voo).
- Supabase: projeto "gmarketing-equipe" (ref hzonfbqsjxiwfmjywdlw, us-east-1) — banco, funções e config prontos; vazio.
- ✅ (25/11) Login sem e-mail: senha provisória gerada pelo admin + troca obrigatória no 1º acesso (sem Resend).
- Painel de Voo (item 17) pronto ANTES de liberar a equipe.

## Fora do escopo por decisão do dono
- Item 19 · tour de 60 segundos no primeiro acesso: NÃO fazer.
