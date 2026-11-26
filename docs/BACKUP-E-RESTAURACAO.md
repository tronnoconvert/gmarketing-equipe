# Backups e restauração — Gmarketing

**Para o dono.** Os dados da plataforma ficam guardados em **três cópias independentes, todo dia**. Se uma falhar, há outras duas.
Se acontecer algo grave (alguém apagar dados, problema na conta do Supabase), dá para reconstruir a plataforma a partir de qualquer uma.
O estado das três aparece no **Cockpit** (card **Backups**, só Dono e Admin) com uma luz: verde = backup com menos de 26 h,
âmbar = 26 a 50 h, vermelho = mais antigo, falhou ou não existe.

| # | Cópia | Onde fica | Quando | Quanto tempo guarda |
|---|---|---|---|---|
| 1 | **Backup nativo do Supabase** | No próprio Supabase (cópia completa do banco, inclusive logins e senhas) | Todo dia, automático | 7 dias |
| 2 | **Exportação diária** | Supabase › Storage › bucket **privado** `backups` (`diario/AAAA-MM-DD.json.gz` + manifesto) | Todo dia às **03:10** (Brasília) | 35 dias + o dia 1º de cada mês por 12 meses |
| 3 | **Cópia externa criptografada** | GitHub, ramo `backups` do repositório (fora do Supabase) | Todo dia às **03:40** (Brasília) | Últimos 90 arquivos |

A cópia 3 é criptografada (AES-256) com uma **senha que só você tem** (`BACKUP_PASSPHRASE`). Sem ela o arquivo não abre — nem
para quem invadir o GitHub. **Guarde essa senha num gerenciador de senhas** (1Password, Bitwarden, Chaves do iCloud…). Se a
senha for perdida, as cópias externas ficam inúteis (as outras duas continuam valendo).

---

## O que VOCÊ precisa fazer uma vez (5 minutos)

1. Receba do responsável técnico os dois valores gerados: `BACKUP_DOWNLOAD_SECRET` e `BACKUP_PASSPHRASE` (por canal seguro, nunca por e-mail ou grupo).
2. **Guarde a `BACKUP_PASSPHRASE` no seu gerenciador de senhas** (item "Gmarketing – senha dos backups").
3. Abra https://github.com/tronnoconvert/gmarketing-equipe/settings/secrets/actions
4. Clique em **New repository secret** e crie, um de cada vez (Name exatamente como abaixo → Secret → **Add secret**):
   - `SUPABASE_FUNCTIONS_URL` = `https://hzonfbqsjxiwfmjywdlw.supabase.co/functions/v1`
   - `BACKUP_DOWNLOAD_SECRET` = (o valor recebido)
   - `BACKUP_PASSPHRASE` = (o valor recebido)
5. Teste: abra https://github.com/tronnoconvert/gmarketing-equipe/actions › **backup-diario** › **Run workflow** › **Run workflow**.
   Em 1–2 minutos deve ficar verde, e no Cockpit a luz "Cópia externa (GitHub)" fica verde.
   (Se o arquivo `.github/workflows/backup.yml` ainda não estiver no GitHub, peça para publicá-lo — ver "Situação" no fim.)

---

## Como restaurar (passo a passo)

### Caso A — "Apagaram/estragaram dados nas últimas horas ou dias" → backup nativo (mais completo)
Restaura o banco **inteiro** (inclusive logins e senhas) como estava no dia escolhido. **Tudo o que foi feito depois se perde.**
1. Entre em https://supabase.com/dashboard/project/hzonfbqsjxiwfmjywdlw
2. Menu lateral **Database** › **Backups** › aba **Scheduled backups**.
3. Escolha o dia e clique em **Restore** › confirme. O app fica fora do ar alguns minutos.
4. Depois, abra o app, confira os dados e avise a equipe.

> **Opcional (custa à parte):** o complemento **Point-in-Time Recovery (PITR)** permite voltar ao minuto exato (não só ao dia).
> Fica em Project Settings › Add-ons. Hoje está **desligado** (decisão de custo); os backups diários cobrem o essencial.

### Caso B — "Preciso de um dado de semanas atrás" ou "quero só parte dos dados" → exportação diária (cópia 2)
1. Supabase › **Storage** › bucket `backups` › pasta `diario` › baixe `AAAA-MM-DD.json.gz` (e o `.manifest.json` do mesmo dia).
2. Peça ao responsável técnico para rodar a restauração (seção técnica abaixo). Ela **não apaga** nada do que existe: só
   recoloca/atualiza os registros do arquivo.

### Caso C — "Perdemos o acesso ao Supabase" / projeto apagado → cópia externa (cópia 3)
1. Crie um projeto novo no Supabase e aplique `supabase/schema.sql`, `supabase/policies.sql`, `supabase/cron.sql` e publique as
   Edge Functions (docs/DEPLOY.md).
2. No GitHub: repositório › seletor de ramo › **backups** › pasta `diario` › baixe o `gmarketing-AAAA-MM-DD.json.gz.enc` mais recente.
3. Com a senha do gerenciador de senhas, o responsável técnico roda `scripts/restaurar-backup.mjs` (abaixo) no projeto novo.
4. Recrie os logins pelo app (Admin › Usuários › Convidar): o backup lógico **não contém senhas** (por segurança); cada pessoa
   cria a sua no 1º acesso. Rode o script de novo para restaurar os perfis (papéis) de quem já foi recriado com o mesmo id —
   ou ajuste os papéis na tela de Usuários.
5. Atualize `public/config.js` (URL e anon key novas) e publique o site.

---

## Seção técnica

### O que a exportação diária contém (`backup-diario`)
Edge Function `supabase/functions/backup-diario/index.ts` (verify_jwt **false**; autenticação própria, comparação em tempo constante):

| Ação | Cabeçalho | Faz |
|---|---|---|
| `{}` / `{"acao":"exportar"}` | `x-cron-secret: CRON_SECRET` | exporta e grava `backups/diario/AAAA-MM-DD.json.gz` + `.manifest.json`, apaga os antigos, grava o status |
| `{"acao":"baixar","data?":"AAAA-MM-DD"}` | `x-backup-secret: BACKUP_DOWNLOAD_SECRET` | devolve o `.json.gz` (mais recente ou do dia) com `x-backup-dia` e `x-backup-sha256` |
| `{"acao":"registrar_externo",ok,dia,bytes,sha256,arquivos}` | `x-backup-secret` | o GitHub Actions informa o resultado da cópia 3 |
| `{"acao":"listar"}` | qualquer um dos dois | lista os arquivos |

Tabelas: `records`, `profiles` (sem `senha_temp_hash`), `orgs`, `perm_padrao`, `col_modules`, `receita_colecoes`, `receita_campos`,
`voo_mudancas` e `auth_users` (só `id, email, created_at, role, banned_until` — **sem hash de senha**). Fora: `voo_cache`
(descartável) e `records_feed` (aviso efêmero do realtime). "settings" do app ficam dentro de `records` (`settings:*`).
Formato: `{formato:'gmarketing-backup', versao:1, projeto, gerado_em, dia, contagens, tabelas:{…}}` em gzip; o manifesto tem
contagens, tamanhos e sha256 do JSON e do gz. Retenção: > 35 dias apaga, exceto dia `01` (fica 366 dias).
Agendamento: `supabase/cron.sql` › `aos-backup-diario` (`10 6 * * *` UTC = 03:10 em São Paulo) via `aos_chamar_funcao`.
Status: grava `records backupStatus:diario` (Cockpit) e `routines:r-backup-diario` (Torre › Rotinas); a cópia 3 grava
`backupStatus:externo` e `routines:r-backup-externo`; a auditoria grava `backupStatus:auditoria` e `backupStatus:nativo`
(o app não tem a chave da Management API: o backup nativo é conferido pela auditoria; o LED fica verde se a auditoria conferiu
nos últimos 8 dias e havia backup com < 26 h naquele momento). A coleção `backupStatus` só é lida por Dono/Admin (fora de
`col_modules` + em `receita_colecoes`) e só o servidor grava (gatilho `records_backup_status_guard`).
Bucket `backups`: privado, sem nenhuma política em `storage.objects` (só a service role acessa), limite 500 MB, só gzip/json.

Rodar à mão: `curl -X POST https://hzonfbqsjxiwfmjywdlw.supabase.co/functions/v1/backup-diario -H "x-cron-secret: $CRON_SECRET" -d '{}'`

### Cópia externa (`.github/workflows/backup.yml`)
06:40 UTC + manual. Baixa (`acao: baixar`), confere o sha256 e o JSON, criptografa com
`openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -salt -pass env:BACKUP_PASSPHRASE`, prova que abre, e faz commit
**só do `.enc`** no ramo órfão `backups` (`diario/gmarketing-AAAA-MM-DD.json.gz.enc`, mantém 90; `diario/SHA256-do-gz.txt`
com o hash de cada dia). No fim chama `registrar_externo` (sucesso ou falha) para o LED do Cockpit.
Segredos do repositório: `SUPABASE_FUNCTIONS_URL`, `BACKUP_DOWNLOAD_SECRET`, `BACKUP_PASSPHRASE`.
Os arquivos removidos continuam no histórico do ramo (criptografados); para encolher o ramo, recrie-o órfão.

### Script de restauração (`scripts/restaurar-backup.mjs`)
```bash
# abrir e conferir (não grava nada)
BACKUP_PASSPHRASE='…' node scripts/restaurar-backup.mjs gmarketing-2026-11-25.json.gz.enc --sha256 <hash do SHA256-do-gz.txt>
node scripts/restaurar-backup.mjs 2026-11-25.json.gz                           # arquivo baixado do Storage (sem criptografia)
# simulação contra um projeto (mostra o que faria, quem falta no Auth)
SUPABASE_ACCESS_TOKEN=sbp_… node scripts/restaurar-backup.mjs arquivo.enc --projeto <ref>
# ensaio: executa todo o SQL da restauração e desfaz (rollback) — prova que funciona sem mudar nada
SUPABASE_ACCESS_TOKEN=sbp_… node scripts/restaurar-backup.mjs arquivo.enc --projeto <ref> --ensaio
# restauração de verdade (UPSERT, não apaga nada que já existe; gatilhos desligados na transação)
SUPABASE_ACCESS_TOKEN=sbp_… node scripts/restaurar-backup.mjs arquivo.enc --projeto <ref> --aplicar
# --saida pasta/ grava o JSON aberto (dados sensíveis: apague depois)
```
Ordem: orgs, perm_padrao, col_modules, receita_*, records, voo_mudancas, profiles (só de quem existe no Auth do destino).
Para voltar o estado exatamente ao do backup (apagando o que surgiu depois), apague antes os registros da org no destino.

Testado em 25/11/2026: exportação real (contagens iguais às do banco), download pelo segredo, decriptação com a senha,
senha errada recusada, `--ensaio` contra a produção (todo o SQL executado e desfeito) sem erro.

---

## Auditoria de segurança

`tests/live/auditoria.mjs` confere automaticamente (≈130 itens) as regras de segurança e do dono: RLS em todas as tabelas,
privilégios de anon/authenticated, `search_path` das funções SECURITY DEFINER, realtime sem dados, bucket `backups` privado e
não listável, todas as Edge Functions recusando chamada sem credencial e com segredo errado, e — com usuários **temporários**
criados por SQL (`gestor_trafego`, `cs`, `leitura` e um `dono` de controle, numa organização temporária) — que ninguém além de
Dono/Admin lê receita (MRR, contratos, faturas, caixa, finanças, faturamento, `action_values_purchase`/ROAS) por nenhum caminho
(SELECT direto, `ler_records`, `ler_record`, `records_feed`, `voo-dados`, `windsor-proxy`), que não gravam dados alheios nem de
outra organização, não escalam papel, não usam `admin-invite`; configuração do Auth (cadastro público desligado, senha ≥ 10,
senhas vazadas, `site_url`, rate limits, 2FA TOTP disponível); cabeçalhos do site; ausência de segredos e de links do
Gerenciador de Anúncios no bundle e no histórico do git; "SIM" obrigatório e histórico com autor no Painel de Voo; pausar
nunca excluir; idade dos três backups. Apaga tudo o que criou (também sobras de execuções interrompidas) e grava o resultado
no card do Cockpit. Relatórios: `docs/auditoria/AAAA-MM-DD.md` (sem segredos nem nomes de clientes).

Precisa só do token da Management API (`SUPABASE_ACCESS_TOKEN`, ou o proxy das sessões do Claude Code) (não usa navegador).
Complemento: `tests/live/csp.mjs` (Playwright) prova que o app funciona com o CSP do `netlify.toml`.

### Rodar toda semana (sessão agendada)
Agende uma sessão semanal (ex.: segunda 10h17) neste repositório com o pedido:

> Rode a auditoria de segurança: `cd /home/user/gmarketing-equipe && git pull && NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tests/live/auditoria.mjs --out docs/auditoria/$(TZ=America/Sao_Paulo date +%F).md`.
> Se houver FALHA, explique cada uma em pt-BR e corrija o que for vulnerabilidade real (SQL/funções/netlify.toml), rode de
> novo até ficar limpo e faça commit do relatório. Nunca imprima segredos.

Código de saída 1 = há falha crítica ou alta.

---

## Situação (25/11/2026)
- Cópia 1: ativa (Pro: diária, 7 dias). PITR desligado.
- Cópia 2: publicada, agendada, primeira exportação feita e conferida.
- Cópia 3: workflow pronto; depende dos 3 segredos no GitHub (acima) e de o arquivo `.github/workflows/backup.yml` estar no GitHub.
- Correções da 1ª auditoria: cadastro público desligado, senha mínima 6 → 10, proteção contra senhas vazadas ligada,
  funções de gatilho sem EXECUTE para anon/authenticated, CSP/HSTS/Permissions-Policy no `netlify.toml`.
- A fazer (app): exigir 2FA (TOTP) de Dono/Admin no login — o Supabase já oferece; falta a tela de cadastro do código.
