-- Testes de RLS (Postgres local + supabase_stub.sql). Uso:
--   psql -v ON_ERROR_STOP=1 -f tests/supabase_stub.sql -f schema.sql -f policies.sql -f tests/rls_test.sql
-- Cada verificação que falha interrompe o script com "FALHOU: ...".
\set ON_ERROR_STOP 1
create schema if not exists t;
create or replace function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALHOU: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant usage on schema t to authenticated, anon, service_role; grant execute on function t.ok(boolean, text) to authenticated, anon, service_role;

-- upsert exatamente como o supabase-js (PostgREST) faz
create or replace function t.upsert(p_col text, p_data jsonb) returns void language sql as $$
  insert into public.records (id, col, data, org_id, updated_at)
  values (p_col || ':' || (p_data->>'id'), p_col, p_data, null, now())
  on conflict (id) do update set col = excluded.col, data = excluded.data, org_id = excluded.org_id, updated_at = excluded.updated_at
$$;
grant execute on function t.upsert(text, jsonb) to authenticated, service_role;
-- a ação precisa ser negada (42501 = violação de RLS ou guarda)
create or replace function t.nega(p_sql text, msg text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when insufficient_privilege then raise notice 'ok - % (negado)', msg; return; end;
  raise exception 'FALHOU: % (deveria ser negado)', msg;
end $$;
grant execute on function t.nega(text, text) to authenticated, anon;

-- ---------------------------------------------------------------- dados (superusuário ignora RLS)
truncate public.records; delete from public.profiles; delete from auth.users;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'gabriel@x.com'), ('00000000-0000-0000-0000-000000000002', 'ana@x.com'),
  ('00000000-0000-0000-0000-000000000003', 'paulo@x.com'),   ('00000000-0000-0000-0000-000000000004', 'helena@x.com'),
  ('00000000-0000-0000-0000-000000000005', 'rayane@x.com'),  ('00000000-0000-0000-0000-000000000006', 'carla@x.com');
insert into public.profiles (user_id, org_id, papel, team_id, app_user_id) values
  ('00000000-0000-0000-0000-000000000001', 'minha-agencia', 'dono', 't-gabriel', 'u-gabriel'),
  ('00000000-0000-0000-0000-000000000002', 'minha-agencia', 'gestor_trafego', 't-ana', 'u-ana'),
  ('00000000-0000-0000-0000-000000000003', 'minha-agencia', 'financeiro', 't-paulo', 'u-paulo'),
  ('00000000-0000-0000-0000-000000000004', 'minha-agencia', 'leitura', 't-helena', 'u-helena'),
  ('00000000-0000-0000-0000-000000000005', 'minha-agencia', 'admin', 't-rayane', 'u-rayane'),
  ('00000000-0000-0000-0000-000000000006', 'minha-agencia', 'producao', 't-carla', 'u-carla');
insert into public.orgs (id, nome) values ('outra', 'Outra agência') on conflict do nothing;
insert into public.records (id, col, data, org_id) values
  ('users:u-gabriel', 'users', '{"id":"u-gabriel","nome":"Gabriel","papel":"dono","ativo":true,"authId":"00000000-0000-0000-0000-000000000001","teamId":"t-gabriel"}', 'minha-agencia'),
  ('users:u-ana', 'users', '{"id":"u-ana","nome":"Ana","papel":"gestor_trafego","ativo":true,"authId":"00000000-0000-0000-0000-000000000002","teamId":"t-ana"}', 'minha-agencia'),
  ('users:u-rayane', 'users', '{"id":"u-rayane","nome":"Rayane","papel":"admin","ativo":true,"authId":"00000000-0000-0000-0000-000000000005","teamId":"t-rayane"}', 'minha-agencia'),
  ('team:t-ana', 'team', '{"id":"t-ana","nome":"Ana"}', 'minha-agencia'),
  ('clients:c-orion', 'clients', '{"id":"c-orion","nome":"Grupo Orion","respId":"t-ana","equipe":["t-ana","t-carla"]}', 'minha-agencia'),
  ('clients:c-vida', 'clients', '{"id":"c-vida","nome":"Clínica Vida","respId":"t-bruno","equipe":["t-bruno"]}', 'minha-agencia'),
  ('contacts:ct-1', 'contacts', '{"id":"ct-1","clientId":"c-orion","nome":"Decisor Orion"}', 'minha-agencia'),
  ('contacts:ct-2', 'contacts', '{"id":"ct-2","clientId":"c-vida","nome":"Decisor Vida"}', 'minha-agencia'),
  ('invoices:i-1', 'invoices', '{"id":"i-1","clientId":"c-orion","valor":14200}', 'minha-agencia'),
  ('tasks:tk-1', 'tasks', '{"id":"tk-1","clientId":"c-vida","respId":"t-bruno"}', 'minha-agencia'),
  ('alerts:a-1', 'alerts', '{"id":"a-1","refCol":"clients","refId":"c-vida","para":["t-gabriel"]}', 'minha-agencia'),
  ('alerts:a-2', 'alerts', '{"id":"a-2","refCol":"clients","refId":"c-orion","para":["t-gabriel","t-ana"]}', 'minha-agencia'),
  ('notifications:n-1', 'notifications', '{"id":"n-1","para":"u-ana","titulo":"Oi Ana","lida":false}', 'minha-agencia'),
  ('notifications:n-2', 'notifications', '{"id":"n-2","para":"u-gabriel","titulo":"Oi Gabriel","lida":false}', 'minha-agencia'),
  ('settings:notif:u-gabriel', 'settings', '{"id":"notif:u-gabriel","valor":{}}', 'minha-agencia'),
  ('activity:act-0', 'activity', '{"id":"act-0","quem":"u-gabriel","oque":"aprovou plano","col":"clients","refId":"c-orion"}', 'minha-agencia'),
  ('deals:d-1', 'deals', '{"id":"d-1","nome":"Rede Sabor"}', 'minha-agencia'),
  ('clients:c-x', 'clients', '{"id":"c-x","nome":"Cliente de outra org","respId":"t-ana"}', 'outra');

-- ================================================================ Ana (gestor de tráfego, escopo "seus")
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select t.ok(public.my_role() = 'gestor_trafego', 'my_role() da Ana');
select t.ok((select count(*) from public.records where col = 'clients') = 1, 'Ana vê só o próprio cliente (e nada de outra org)');
select t.ok((select count(*) from public.records where col = 'contacts') = 1, 'Ana vê só contatos dos seus clientes (clientId)');
select t.ok((select count(*) from public.records where col = 'invoices') = 1, 'Ana vê só faturas dos seus clientes (aba Financeiro da ficha)');
select t.ok((select count(*) from public.records where col = 'deals') = 0, 'Ana não vê o comercial');
select t.ok((select count(*) from public.records where col = 'tasks') = 0, 'Ana não vê tarefa de cliente fora do escopo');
select t.ok((select count(*) from public.records where col = 'alerts') = 1, 'Ana vê só alertas endereçados a ela / dos seus clientes');
select t.ok((select count(*) from public.records where col = 'notifications') = 1, 'Ana lê só as próprias notificações');
select t.ok((select count(*) from public.records where col = 'users') = 3, 'diretório de usuários visível');
select t.ok((select count(*) from public.records where id like 'settings:notif:%') = 0, 'preferências dos outros ocultas');
-- escrita
select t.upsert('contacts', '{"id":"ct-3","clientId":"c-orion","nome":"Novo contato"}');
select t.ok(exists (select 1 from public.records where id = 'contacts:ct-3'), 'Ana cria contato do seu cliente via upsert (org_id preenchido pelo trigger)');
select t.nega($$select t.upsert('contacts', '{"id":"ct-4","clientId":"c-vida","nome":"x"}')$$, 'Ana não cria contato de cliente alheio');
select t.nega($$select t.upsert('deals', '{"id":"d-2","nome":"x"}')$$, 'Ana não grava no comercial');
-- notificar alguém: insere notificação para outra pessoa (upsert do front)
select t.upsert('notifications', '{"id":"n-3","para":"u-gabriel","de":"u-ana","titulo":"Aprova?","lida":false}');
select t.ok(true, 'Ana envia notificação para Gabriel via upsert');
select t.nega($$select t.upsert('notifications', '{"id":"n-4","para":"u-gabriel","de":"u-paulo","titulo":"falso","lida":false}')$$, 'não envia notificação em nome de outra pessoa');
select t.upsert('notifications', '{"id":"n-1","para":"u-ana","titulo":"Oi Ana","lida":true}');
select t.ok((select (data->>'lida')::boolean from public.records where id = 'notifications:n-1'), 'Ana marca a própria notificação como lida');
select t.nega($$select t.upsert('notifications', '{"id":"n-1","para":"u-ana","titulo":"editado","lida":true}')$$, 'só o campo lida pode mudar');
update public.records set data = jsonb_set(data, '{lida}', 'true') where id = 'notifications:n-2';  -- RLS: 0 linhas afetadas
select t.ok((select count(*) from public.records where id = 'notifications:n-2') = 0, 'notificação de outra pessoa invisível');
-- usuários: atualizar o próprio último acesso, sem trocar papel
select t.upsert('users', '{"id":"u-ana","nome":"Ana","papel":"gestor_trafego","ativo":true,"authId":"00000000-0000-0000-0000-000000000002","teamId":"t-ana","ultimoAcesso":"2026-11-24T10:00:00Z","senha":"demo123"}');
select t.ok((select data ? 'ultimoAcesso' and not data ? 'senha' from public.records where id = 'users:u-ana'), 'Ana atualiza o próprio último acesso; senha descartada');
select t.nega($$select t.upsert('users', '{"id":"u-ana","nome":"Ana","papel":"dono","ativo":true,"authId":"00000000-0000-0000-0000-000000000002","teamId":"t-ana"}')$$, 'Ana não se promove a dono');
select t.nega($$select t.upsert('settings', '{"id":"perms","valor":{"admin":{"gestor_trafego":"admin"}}}')$$, 'Ana não altera a matriz de permissões');
select t.upsert('settings', '{"id":"notif:u-ana","valor":{"resumoDiario":true}}');
select t.ok(true, 'Ana salva as próprias preferências de notificação');
-- auditoria
select t.upsert('activity', '{"id":"act-1","quem":"u-ana","oque":"teste","col":"clients","refId":"c-orion"}');
select t.ok(true, 'Ana grava auditoria em nome próprio');
select t.nega($$select t.upsert('activity', '{"id":"act-2","quem":"u-gabriel","oque":"falso"}')$$, 'auditoria em nome de outro é negada');
select t.nega($$select t.upsert('activity', '{"id":"act-1","quem":"u-ana","oque":"alterado"}')$$, 'auditoria não pode ser alterada');
select t.ok((select count(*) from public.records where col = 'activity') = 1, 'Ana (Equipe: ver próprio) vê só a própria atividade');
commit;

select t.ok((select (data->>'lida')::boolean = false from public.records where id = 'notifications:n-2'), 'update na notificação de outra pessoa não teve efeito');

-- ================================================================ Paulo (financeiro)
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select t.ok((select count(*) from public.records where col = 'invoices') = 1, 'Paulo vê faturas');
select t.ok((select count(*) from public.records where col = 'clients') = 2, 'Paulo vê todos os clientes da org (sem escopo)');
select t.upsert('invoices', '{"id":"i-1","clientId":"c-orion","valor":14200,"status":"paga"}');
select t.ok((select data->>'status' from public.records where id = 'invoices:i-1') = 'paga', 'Paulo edita fatura');
select t.nega($$select t.upsert('clients', '{"id":"c-vida","nome":"x"}')$$, 'Paulo não edita clientes (só ver)');
delete from public.records where id = 'invoices:i-1';  -- RLS: 0 linhas
select t.ok(exists (select 1 from public.records where id = 'invoices:i-1'), 'Paulo (editar) não exclui fatura; excluir é só dono/admin');
select t.ok((select count(*) from public.records where col = 'activity') = 2, 'Paulo (Equipe: ver) vê o feed de atividade');
commit;

-- ================================================================ Helena (somente leitura)
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select t.ok((select count(*) from public.records where col = 'clients') = 2, 'leitura vê clientes');
select t.nega($$select t.upsert('clients', '{"id":"c-novo","nome":"x"}')$$, 'leitura não cria cliente');
select t.nega($$select t.upsert('notifications', '{"id":"n-9","para":"u-ana","de":"u-helena","titulo":"x","lida":false}')$$ , 'leitura (Notificações = ver) não envia notificações');
commit;

-- ================================================================ Gabriel (dono)
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select t.ok((select count(*) from public.records where col = 'clients') = 2, 'dono vê todos os clientes da org');
select t.ok((select count(*) from public.records where col = 'activity') >= 1, 'dono vê auditoria');
select t.ok(public.can_col('clients', 'delete'), 'dono pode excluir clientes');
select t.upsert('settings', '{"id":"perms","valor":{"comercial":{"cs":"ver","gestor_trafego":"ver"}}}');
select t.ok(true, 'dono salva matriz de permissões');
select t.nega($$select t.upsert('users', '{"id":"u-gabriel","nome":"Gabriel","papel":"admin","ativo":true,"authId":"00000000-0000-0000-0000-000000000001","teamId":"t-gabriel"}')$$, 'último dono não pode ser rebaixado');
select t.upsert('users', '{"id":"u-ana","nome":"Ana","papel":"cs","ativo":true,"authId":"00000000-0000-0000-0000-000000000002","teamId":"t-ana"}');
commit;
select t.ok((select papel from public.profiles where user_id = '00000000-0000-0000-0000-000000000002') = 'cs', 'trocar papel em users sincroniza profiles');
update public.profiles set papel = 'gestor_trafego' where user_id = '00000000-0000-0000-0000-000000000002';

-- ================================================================ Ana depois da matriz alterada pelo dono
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select t.ok(public.perm_valor('comercial', 'gestor_trafego') = 'ver', 'perm_valor lê settings:perms');
select t.ok((select count(*) from public.records where col = 'deals') = 1, 'Ana passa a ver o Comercial após mudança na matriz');
select t.nega($$select t.upsert('deals', '{"id":"d-3","nome":"x"}')$$, 'mas continua sem editar (só ver)');
commit;

-- ================================================================ anônimo
begin;
set local role anon;
select t.ok((select count(*) from public.records) = 0, 'anon consulta mas não vê nenhuma linha');
select t.nega($$select t.upsert('clients', '{"id":"c-anon","nome":"x"}')$$, 'anon não grava');
commit;

-- ================================================================ service role (Edge Functions ignoram RLS)
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select t.ok((select count(*) from public.records where col = 'clients') = 3, 'service role vê tudo (inclusive outra org)');
select t.upsert('notifications', '{"id":"n-sys","para":"u-ana","titulo":"Rotina falhou","lida":false}');
commit;
\echo 'TODOS OS TESTES DE RLS PASSARAM'
