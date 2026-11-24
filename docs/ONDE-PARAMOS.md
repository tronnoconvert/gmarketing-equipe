# Onde paramos — 24/11/2026 (retomar quando o dono disser "oi")

## Passo em que paramos (o dono precisa fazer)
**Instalar o aplicativo do Claude no repositório GitHub** — o envio do código foi recusado (403) porque o app não está instalado.
1. Abrir https://github.com/apps/claude/installations/select_target
2. Escolher **tronnoconvert** → "Only select repositories" → selecionar **gmarketing-equipe** → **Install**
   (se aparecer "Configure": em "Repository access" adicionar gmarketing-equipe → **Save**)
3. Voltar na conversa e escrever **pronto** → eu faço `git push` do commit já pronto
   (clone em /home/user/gmarketing-equipe, branch main, commit "Agência OS (Gmarketing): app, backend Supabase e protótipo da Torre").

## Já feito nesta etapa de hospedagem
- Supabase: token de acesso salvo (formulário seguro). Projeto **gmarketing-equipe** (ref hzonfbqsjxiwfmjywdlw, us-east-1), vazio → usar este.
  O token salvo é o 1º (sem organizations_read — não precisa). Sugerido ao dono apagar o 2º token (acesso total) que não está em uso.
- Windsor: 72 contas Meta ativas + 14 inativas (precisam de novo login no Windsor — mandar link na hora do Painel de Voo; dono concordou).
- Campanha (conta própria): **CA01 e CA02** (as duas, com seletor/soma).
- GitHub: repositório **tronnoconvert/gmarketing-equipe** (privado, vazio) conectado à sessão; falta instalar o app (acima).
- Hostinger: dono tem **domínio e hospedagem** → subir as telas (pasta dist/) na hospedagem da Hostinger; endereço do painel ainda não definido (perguntar, ex.: painel.<dominio>).

## Pendente (minha parte), em ordem
1. ✅ Bateria completa 3760/3760 após a frente "Padrões e regras — gestão" (interrompida pelo app) e publicado no Protótipo Oficial. Ainda revisar visualmente a central e o catálogo de gestão: já tem papel **head_trafego**, usuário **Allan Vieira** (allan@agencia.demo), módulo `src/modules/padroes`, catálogo `src/core/padroes/gestao.js` (61 editáveis), `tests/padroes.spec.mjs`, DB_VERSION 4. Rodar a bateria completa e corrigir o que faltar; publicar no Protótipo Oficial.
2. Trocar a marca para **Gmarketing** (topo do menu, login, título). Logo: pedir o arquivo ao dono (PNG transparente ou SVG; claro/escuro) — usar um "G" até chegar.
3. Supabase: aplicar schema.sql + policies.sql (+ regra de receita no banco, papel head_trafego), cron.sql; publicar Edge Functions; senha provisória + troca obrigatória no 1º acesso (sem Resend); testar login real.
4. Hospedar na Hostinger com o domínio do dono; criar logins (dono e Rayane primeiro).
5. **Item 17 — Painel de Voo nativo com dados reais (Windsor)** ANTES de liberar a equipe.
6. Depois: chaves Monday, Windsor, Z-API (WhatsApp), token Meta (Guardião) — o dono cola em Supabase › Edge Functions › Secrets (eu passo os nomes exatos).

## Regras de comunicação com o dono
- Ser 100% específico ao pedir algo: link exato, onde clicar, o que copiar, o que responder.
- "Visível para mim" = Dono + Rayane (admin).
