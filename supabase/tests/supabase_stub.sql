-- Simula o mínimo do Supabase num Postgres local, para validar schema.sql + policies.sql offline.
-- NÃO rode isto no Supabase de verdade (lá o schema auth e os papéis já existem).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, encrypted_password text);
alter table auth.users add column if not exists encrypted_password text;
do $$ begin if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if; end $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', current_user)
$$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
-- no Supabase, service_role tem todos os privilégios nas tabelas de public
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on functions to service_role;
