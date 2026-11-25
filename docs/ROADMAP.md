# Próximos passos (combinados com o dono)

## Regras permanentes do dono
- **"Visível para mim" = Dono + Rayane Leão (sócia, papel Admin).** Toda vez que o dono pedir algo "só para mim",
  estender automaticamente para a Rayane (ela terá o próprio e-mail de login).
- Head de Tráfego: Allan Vieira — vê a central "Padrões e regras" junto com Dono/Rayane.
- (25/11/2026) **Gestores de tráfego veem e operam TODOS os clientes** (Clientes e Painel de Voo, inclusive Pausar/Orçamento com SIM),
  para cobrir colega ausente. Abrem no filtro "Meus" (alternância "Meus / Todos"). Receita continua invisível para eles (cortada no servidor).
  Contas sem cliente vinculado: só Dono/Admin/Head. CS e produção seguem só com os seus clientes.
- (25/11/2026) **Máximo de 10 mudanças de orçamento por conjunto (ou campanha CBO) por hora** (era 4), garantido no banco.

## Depois de hospedar (prioridade 1 — NÃO ESQUECER)
- ✅ (25/11) **Item 17 · Painel de Voo nativo com dados reais** (`#/torre/voo`, `#/torre/voo/<conta>`). Iframe e `public/torre/`
  removidos (fontes do protótipo continuam em `torre-prototipo/`). Detalhes: `docs/DEPLOY.md` §8.
  - Dados reais via Windsor (Edge Function `voo-dados`, cache no servidor ≤ 5 min; detalhe do cliente sempre **ao vivo**, com
    atualização a cada 2 min, "Atualizar agora" e nova busca depois de cada ação). Receita removida no servidor para quem não é Dono/Admin.
  - Ações (`voo-acao`, Graph API do Meta): pausar campanha/conjunto/anúncio e orçamento diário, SIM obrigatório, 10 mudanças/conjunto/hora
    no banco, só pausar (nunca reativar/excluir), "ver como" recusado, auditoria em `activity` + `clientActions`.
  - Vínculo cliente ↔ conta: `clients.metaContas` (Clientes › Cadastro › Metas, ou "Contas sem cliente vinculado" no painel; Dono/Admin/Head)
    e meta de custo por conversa (`clients.metaCustoConversa`) para o semáforo; teto `tetoDiarioCliente(c)`.
  - **Falta o dono:** gerar o token do usuário do sistema do Meta e gravar `META_ACCESS_TOKEN` (passo a passo em DEPLOY §8.3) —
    até lá a leitura funciona e os botões de ação ficam desligados com a explicação. Vincular as contas aos clientes quando
    os clientes forem cadastrados/importados. Ligar o agendamento `aos-voo-dados` (DEPLOY §8.4).

## Também pendente para a hospedagem
- ✅ (25/11) Regra "receita só para Dono/Admin" aplicada no banco (funções seguras + merge na gravação + realtime sem dados).
- Fotos da equipe no Supabase Storage (hoje ficam no registro como data URL).
- ✅ (25/11) Teste real com usuários de teste (`tests/live/producao.mjs`); falta o checklist com as pessoas reais.
- Tela Campanha (conta própria do dono): **duas contas** — CA01 (act_1906477940242386) e CA02 · HOF (act_848802707655510), via Windsor.
  Adaptar o módulo para várias contas: seletor "CA01 / CA02 / As duas (somadas)".
- Windsor: usar só as contas ATIVAS (72). As 14 inativas ficam de fora por decisão do dono; se faltar alguma, o gestor reconecta seguindo docs/RECONECTAR-CONTA-WINDSOR.md.
- Supabase: projeto "gmarketing-equipe" (ref hzonfbqsjxiwfmjywdlw, us-east-1) — banco, funções e config prontos; vazio.
- ✅ (25/11) Login sem e-mail: senha provisória gerada pelo admin + troca obrigatória no 1º acesso (sem Resend).
- ✅ Painel de Voo (item 17) pronto ANTES de liberar a equipe (falta só o token do Meta para as ações).

## Fora do escopo por decisão do dono
- Item 19 · tour de 60 segundos no primeiro acesso: NÃO fazer.
