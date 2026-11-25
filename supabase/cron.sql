-- =====================================================================================
-- Agência OS — agendamentos (opcional). Rode depois de publicar as Edge Functions.
-- Usa as extensões pg_cron e pg_net (Database › Extensions no painel do Supabase).
-- Antes, troque:
--   SEU-PROJETO     → o "Reference ID" do projeto (Settings › General)
--   SUA_ANON_KEY    → a anon key (Settings › API) — pública, serve só para passar pelo gateway
--   SEU_CRON_SECRET → o mesmo valor que você gravou com: supabase secrets set CRON_SECRET=...
-- Os segredos ficam no Vault (não aparecem em texto no agendamento).
-- =====================================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://SEU-PROJETO.supabase.co/functions/v1', 'aos_functions_url')
 where not exists (select 1 from vault.secrets where name = 'aos_functions_url');
select vault.create_secret('SUA_ANON_KEY', 'aos_anon_key')
 where not exists (select 1 from vault.secrets where name = 'aos_anon_key');
select vault.create_secret('SEU_CRON_SECRET', 'aos_cron_secret')
 where not exists (select 1 from vault.secrets where name = 'aos_cron_secret');

create or replace function public.aos_chamar_funcao(p_nome text, p_corpo jsonb default '{}'::jsonb) returns bigint
language sql security definer set search_path = public as $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'aos_functions_url') || '/' || p_nome,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aos_anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'aos_cron_secret')),
    body    := p_corpo,
    timeout_milliseconds := 60000)
$$;
revoke all on function public.aos_chamar_funcao(text, jsonb) from public, anon, authenticated;

-- regras de alerta a cada 15 minutos
select cron.unschedule('aos-routines-runner') where exists (select 1 from cron.job where jobname = 'aos-routines-runner');
select cron.schedule('aos-routines-runner', '*/15 * * * *', $$select public.aos_chamar_funcao('routines-runner')$$);

-- sincronização com o monday.com de hora em hora (minuto 7)
select cron.unschedule('aos-monday-sync') where exists (select 1 from cron.job where jobname = 'aos-monday-sync');
select cron.schedule('aos-monday-sync', '7 * * * *', $$select public.aos_chamar_funcao('monday-sync')$$);

-- Guardião de segurança (possível invasão nas contas Meta Ads) a cada 2 minutos.
-- Pausa automaticamente as campanhas de contas com incidente SUPREMO e vigia a quarentena (docs/SEGURANCA-INVASAO.md).
select cron.unschedule('aos-guardiao') where exists (select 1 from cron.job where jobname = 'aos-guardiao');
select cron.schedule('aos-guardiao', '*/2 * * * *', $$select public.aos_chamar_funcao('guardiao')$$);

-- Painel de Voo (item 17): atualiza o cache da visão geral (dados do Meta via Windsor) a cada 5 minutos.
-- O detalhe de cada cliente é buscado ao vivo quando alguém abre; sem este agendamento a visão geral se atualiza
-- quando alguém abre o painel e o cache passou de 5 minutos (mostra o que tem e atualiza em segundo plano).
select cron.unschedule('aos-voo-dados') where exists (select 1 from cron.job where jobname = 'aos-voo-dados');
select cron.schedule('aos-voo-dados', '*/5 * * * *', $$select public.aos_chamar_funcao('voo-dados', '{"acao":"atualizar"}'::jsonb)$$);

-- Backup lógico diário (docs/BACKUP-E-RESTAURACAO.md): todas as tabelas do app em gzip no bucket PRIVADO `backups`
-- (diario/AAAA-MM-DD.json.gz + manifesto com contagens e sha256). 06:10 UTC = 03:10 em São Paulo.
-- Retenção feita pela própria função: 35 dias; o dia 1º de cada mês fica 12 meses.
select cron.unschedule('aos-backup-diario') where exists (select 1 from cron.job where jobname = 'aos-backup-diario');
select cron.schedule('aos-backup-diario', '10 6 * * *', $$select public.aos_chamar_funcao('backup-diario', '{"acao":"exportar"}'::jsonb)$$);
