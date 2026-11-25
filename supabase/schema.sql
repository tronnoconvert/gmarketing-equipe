-- =====================================================================================
-- Agência OS — schema do Supabase (Postgres 15+)
-- Rode PRIMEIRO este arquivo e DEPOIS policies.sql (SQL Editor do Supabase ou `psql`).
-- Idempotente: pode rodar de novo sem perder dados.
--
-- Modelo: o app guarda TODAS as coleções numa tabela genérica `records`, exatamente como o
-- SupabaseAdapter de src/core/store.js espera:
--   id   text  = '<coleção>:<id do objeto>'   (ex.: 'clients:c-orion')
--   col  text  = nome da coleção               (ex.: 'clients')
--   data jsonb = o objeto inteiro               (ex.: {"id":"c-orion","nome":"Grupo Orion",...})
--   org_id, created_at, updated_at, created_by
-- O front faz: select id,col,data · upsert {id,col,data,org_id,updated_at} · delete where id = ...
-- Recomendação: um projeto Supabase por agência (org). org_id já existe para separar dados se um
-- dia houver várias agências no mesmo projeto.
-- =====================================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- organizações
create table if not exists public.orgs (
  id         text primary key,                       -- ex.: 'minha-agencia' (mesmo valor de orgId em public/config.js)
  nome       text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- perfis (1 por login)
-- Liga o usuário do Supabase Auth ao papel e ao registro `users` do app.
create table if not exists public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  org_id      text not null references public.orgs (id) on delete restrict,
  papel       text not null default 'leitura'
              check (papel in ('dono','admin','head_trafego','gestor_trafego','cs','producao','financeiro','comercial','leitura')),
  team_id     text,                                  -- id em `team` (ex.: 't-ana'); usado no escopo "seus clientes"
  app_user_id text,                                  -- id em `users` (ex.: 'u-ana'); usado em notificações (data->>'para')
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists profiles_org_app_user_uk on public.profiles (org_id, app_user_id) where app_user_id is not null;
create index if not exists profiles_org_idx on public.profiles (org_id);

-- ---------------------------------------------------------------- registros (todas as coleções)
create table if not exists public.records (
  id         text primary key,                       -- '<col>:<id>'
  col        text not null,
  data       jsonb not null default '{}'::jsonb,
  org_id     text references public.orgs (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint records_id_formato check (id = col || ':' || (data->>'id'))
);
create index if not exists records_org_col_idx   on public.records (org_id, col);
create index if not exists records_col_idx       on public.records (col);
create index if not exists records_updated_idx   on public.records (updated_at desc);
-- campos usados nas políticas (escopo de clientes e notificações)
create index if not exists records_client_idx    on public.records ((data->>'clientId')) where data ? 'clientId';
create index if not exists records_para_idx      on public.records ((data->>'para')) where col = 'notifications';
create index if not exists records_resp_idx      on public.records ((data->>'respId')) where col = 'clients';
create index if not exists records_data_gin      on public.records using gin (data jsonb_path_ops);

-- ---------------------------------------------------------------- triggers de manutenção
-- updated_at automático
create or replace function public.tg_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists records_updated_at on public.records;
create trigger records_updated_at before update on public.records
  for each row execute function public.tg_set_updated_at();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- Defaults que o front não manda: org_id (o upsert envia null quando config.js não tem orgId),
-- created_by preservado nas atualizações, e senhas de demonstração nunca gravadas.
create or replace function public.tg_records_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org text;
begin
  if new.org_id is null then
    select p.org_id into v_org from public.profiles p where p.user_id = auth.uid();
    new.org_id := v_org;
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.org_id     := old.org_id;                 -- registro não muda de org
  elsif new.created_by is null then
    new.created_by := auth.uid();
  end if;
  -- o modo demonstração guarda `senha` em users; em produção a senha só existe no Supabase Auth
  if new.col = 'users' and new.data ? 'senha' then
    new.data := new.data - 'senha';
  end if;
  return new;
end $$;

drop trigger if exists records_defaults on public.records;
create trigger records_defaults before insert or update on public.records
  for each row execute function public.tg_records_defaults();

-- Mantém profiles em sincronia com o registro `users` do app (papel, ativo, time).
-- Assim, mudar o papel em Administração › Usuários já muda o que o RLS libera.
-- (policies.sql substitui esta função por uma versão que só aceita mudanças de quem administra usuários.)
create or replace function public.tg_users_sync_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.col <> 'users' or coalesce(new.data->>'authId', '') = '' then
    return new;
  end if;
  update public.profiles p
     set papel       = coalesce(nullif(new.data->>'papel', ''), p.papel),
         ativo       = coalesce((new.data->>'ativo')::boolean, true),
         team_id     = nullif(new.data->>'teamId', ''),
         app_user_id = new.data->>'id'
   where p.user_id = (new.data->>'authId')::uuid;
  return new;
end $$;

drop trigger if exists records_users_sync on public.records;
create trigger records_users_sync after insert or update on public.records
  for each row when (new.col = 'users') execute function public.tg_users_sync_profile();

-- ---------------------------------------------------------------- realtime (feed leve, sem dados)
-- O front NÃO assina a tabela `records` (o payload levaria valores de receita a quem não pode ver).
-- Cada gravação gera uma linha em `records_feed` (só id, coleção e operação); o app recebe o aviso pelo
-- Realtime e busca o registro de novo pela função segura `ler_record` (policies.sql), já sem os campos
-- de receita para quem não tem a permissão.
create table if not exists public.records_feed (
  seq     bigint generated always as identity primary key,
  rec_id  text not null,
  col     text not null,
  op      text not null check (op in ('INSERT','UPDATE','DELETE')),
  org_id  text,
  em      timestamptz not null default now()
);
create index if not exists records_feed_em_idx on public.records_feed (em);

create or replace function public.tg_records_feed() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old);
begin
  insert into public.records_feed (rec_id, col, op, org_id) values (r.id, r.col, tg_op, r.org_id);
  if random() < 0.02 then delete from public.records_feed where em < now() - interval '2 days'; end if;
  return null;
end $$;
drop trigger if exists records_feed_tg on public.records;
create trigger records_feed_tg after insert or update or delete on public.records
  for each row execute function public.tg_records_feed();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records') then
      execute 'alter publication supabase_realtime drop table public.records';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records_feed') then
      execute 'alter publication supabase_realtime add table public.records_feed';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------- senha provisória (migração idempotente)
-- O admin cria o login com uma senha provisória (Edge Function admin-invite, sem e-mail). No 1º acesso o app
-- obriga a criar uma senha nova. trocar_senha = precisa trocar; senha_temp_hash = hash da provisória (a troca só
-- é aceita quando o hash em auth.users mudou — ver concluir_troca_senha em policies.sql).
alter table public.profiles add column if not exists trocar_senha boolean not null default false;
alter table public.profiles add column if not exists senha_temp_hash text;

-- ---------------------------------------------------------------- primeira organização
-- Troque 'minha-agencia' e o nome (o mesmo id vai em public/config.js → orgId).
insert into public.orgs (id, nome) values ('gmarketing', 'Gmarketing')
on conflict (id) do nothing;
