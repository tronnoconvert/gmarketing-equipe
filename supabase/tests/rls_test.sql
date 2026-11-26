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

-- gravação exatamente como o app (src/core/store.js → rpc gravar_record)
create or replace function t.upsert(p_col text, p_data jsonb) returns void language sql as $$
  select public.gravar_record(p_col, p_data)
$$;
-- upsert direto na tabela (como o supabase-js faria sem a função) — usado pela service role e para provar o bloqueio
create or replace function t.upsert_direto(p_col text, p_data jsonb) returns void language sql as $$
  insert into public.records (id, col, data, org_id, updated_at)
  values (p_col || ':' || (p_data->>'id'), p_col, p_data, null, now())
  on conflict (id) do update set col = excluded.col, data = excluded.data, org_id = excluded.org_id, updated_at = excluded.updated_at
$$;
-- leitura como o app (rpc ler_records / ler_record)
create or replace function t.n(p_col text) returns bigint language sql as $$
  select count(*) from public.ler_records('', 1000) where col = p_col
$$;
create or replace function t.r(p_id text) returns jsonb language sql as $$ select public.ler_record(p_id) $$;
grant execute on function t.upsert(text, jsonb), t.upsert_direto(text, jsonb), t.n(text), t.r(text) to authenticated, service_role, anon;
-- a ação precisa ser negada (42501 = violação de RLS ou guarda)
create or replace function t.nega(p_sql text, msg text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when insufficient_privilege then raise notice 'ok - % (negado)', msg; return; end;
  raise exception 'FALHOU: % (deveria ser negado)', msg;
end $$;
grant execute on function t.nega(text, text) to authenticated, anon;

-- ---------------------------------------------------------------- dados (superusuário ignora RLS)
truncate public.records; delete from public.profiles; delete from auth.users;
insert into public.orgs (id, nome) values ('outra', 'Outra agência'), ('minha-agencia', 'Minha Agência') on conflict do nothing;
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
insert into public.orgs (id, nome) values ('outra', 'Outra agência'), ('minha-agencia', 'Minha Agência') on conflict do nothing;
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

-- ================================================================ Ana (gestor de tráfego: vê todos os clientes desde 25/11/2026, sem receita)
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select t.ok(public.my_role() = 'gestor_trafego', 'my_role() da Ana');
select t.ok(t.n('clients') = 2, 'Ana (gestora) vê todos os clientes da org (cobre colega) e nada de outra org');
select t.ok(not public.escopo_limitado('clients'), 'gestor de tráfego sem escopo limitado');
select t.ok(t.n('contacts') = 2, 'Ana vê contatos de todos os clientes');
select t.ok(t.n('invoices') = 0, 'Ana não vê faturas (receita só para quem tem a permissão)');
select t.ok(t.n('deals') = 0, 'Ana não vê o comercial');
select t.ok(t.n('tasks') = 1, 'Ana vê tarefa de cliente de outro responsável');
select t.ok(t.n('alerts') = 1, 'Ana vê só alertas endereçados a ela / dos seus clientes');
select t.ok(t.n('notifications') = 1, 'Ana lê só as próprias notificações');
select t.ok(t.n('users') = 3, 'diretório de usuários visível');
select t.ok((select count(*) from public.ler_records('', 1000) where id like 'settings:notif:%') = 0, 'preferências dos outros ocultas');
-- escrita
select t.upsert('contacts', '{"id":"ct-3","clientId":"c-orion","nome":"Novo contato"}');
select t.ok(exists (select 1 from public.records where id = 'contacts:ct-3'), 'Ana cria contato do seu cliente via upsert (org_id preenchido pelo trigger)');
select t.upsert('contacts', '{"id":"ct-4","clientId":"c-vida","nome":"x"}');
select t.ok(exists (select 1 from public.records where id = 'contacts:ct-4'), 'Ana edita cliente de outro responsável (cobre colega)');
select t.nega($$select t.upsert('deals', '{"id":"d-2","nome":"x"}')$$, 'Ana não grava no comercial');
-- notificar alguém: insere notificação para outra pessoa (upsert do front)
select t.upsert('notifications', '{"id":"n-3","para":"u-gabriel","de":"u-ana","titulo":"Aprova?","lida":false}');
select t.ok(true, 'Ana envia notificação para Gabriel via upsert');
select t.nega($$select t.upsert('notifications', '{"id":"n-4","para":"u-gabriel","de":"u-paulo","titulo":"falso","lida":false}')$$, 'não envia notificação em nome de outra pessoa');
select t.upsert('notifications', '{"id":"n-1","para":"u-ana","titulo":"Oi Ana","lida":true}');
select t.ok((t.r('notifications:n-1')->>'lida')::boolean, 'Ana marca a própria notificação como lida');
select t.upsert('notifications', '{"id":"n-1","para":"u-ana","titulo":"editado","lida":true}');
select t.ok(t.r('notifications:n-1')->>'titulo' = 'Oi Ana', 'só o campo lida muda (o resto é ignorado pelo servidor)');
update public.records set data = jsonb_set(data, '{lida}', 'true') where id = 'notifications:n-2';  -- RLS: 0 linhas afetadas
select t.ok(t.r('notifications:n-2') is null, 'notificação de outra pessoa invisível');
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
select t.ok(t.n('activity') = 1, 'Ana (Equipe: ver próprio) vê só a própria atividade');
commit;

select t.ok((select (data->>'lida')::boolean = false from public.records where id = 'notifications:n-2'), 'update na notificação de outra pessoa não teve efeito');

-- ================================================================ Paulo (financeiro)
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select t.ok(t.n('invoices') = 0, 'Paulo (financeiro, sem a permissão receita) não vê faturas');
select t.ok(t.n('clients') = 2, 'Paulo vê todos os clientes da org (sem escopo)');
select t.nega($$select t.upsert('invoices', '{"id":"i-1","clientId":"c-orion","valor":14200,"status":"paga"}')$$, 'Paulo não edita fatura (dinheiro que entra)');
select t.nega($$select t.upsert('clients', '{"id":"c-vida","nome":"x"}')$$, 'Paulo não edita clientes (só ver)');
delete from public.records where id = 'invoices:i-1';  -- RLS: 0 linhas
select t.ok(t.r('invoices:i-1') is null, 'Paulo não exclui nem lê fatura');
select t.ok(t.n('activity') = 2, 'Paulo (Equipe: ver) vê o feed de atividade');
commit;

-- ================================================================ Helena (somente leitura)
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select t.ok(t.n('clients') = 2, 'leitura vê clientes');
select t.nega($$select t.upsert('clients', '{"id":"c-novo","nome":"x"}')$$, 'leitura não cria cliente');
select t.nega($$select t.upsert('notifications', '{"id":"n-9","para":"u-ana","de":"u-helena","titulo":"x","lida":false}')$$ , 'leitura (Notificações = ver) não envia notificações');
commit;

-- ================================================================ Gabriel (dono)
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select t.ok(t.n('clients') = 2, 'dono vê todos os clientes da org');
select t.ok(t.n('activity') >= 1, 'dono vê auditoria');
select t.ok(public.can_col('clients', 'delete'), 'dono pode excluir clientes');
select t.upsert('settings', '{"id":"perms","valor":{"comercial":{"cs":"ver","gestor_trafego":"ver"}}}');
select t.ok(true, 'dono salva matriz de permissões');
select t.nega($$select t.upsert('users', '{"id":"u-gabriel","nome":"Gabriel","papel":"admin","ativo":true,"authId":"00000000-0000-0000-0000-000000000001","teamId":"t-gabriel"}')$$, 'último dono não pode ser rebaixado');
select t.upsert('users', '{"id":"u-ana","nome":"Ana","papel":"cs","ativo":true,"authId":"00000000-0000-0000-0000-000000000002","teamId":"t-ana"}');
commit;
select t.ok((select papel from public.profiles where user_id = '00000000-0000-0000-0000-000000000002') = 'cs', 'trocar papel em users sincroniza profiles');
-- CS continua com escopo "seus clientes"
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select t.ok(t.n('clients') = 1 and public.escopo_limitado('clients'), 'CS vê só os seus clientes');
select t.nega($$select t.upsert('contacts', '{"id":"ct-5","clientId":"c-vida","nome":"x"}')$$, 'CS não cria contato de cliente alheio');
commit;
update public.profiles set papel = 'gestor_trafego' where user_id = '00000000-0000-0000-0000-000000000002';

-- ================================================================ Ana depois da matriz alterada pelo dono
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select t.ok(public.perm_valor('comercial', 'gestor_trafego') = 'ver', 'perm_valor lê settings:perms');
select t.ok(t.n('deals') = 1, 'Ana passa a ver o Comercial após mudança na matriz');
select t.nega($$select t.upsert('deals', '{"id":"d-3","nome":"x"}')$$, 'mas continua sem editar (só ver)');
commit;


-- ================================================================ RECEITA: dinheiro que entra só para quem tem 'receita'
truncate public.records_feed;
insert into public.records (id, col, data, org_id) values
  ('clients:c-rec', 'clients', '{"id":"c-rec","nome":"Cliente Receita","respId":"t-ana","equipe":["t-ana","t-carla"],"mrr":1000,"segmento":"Varejo","comissoes":[{"id":"cm-1","teamId":"t-ana","tipo":"percentual","valor":10,"meses":6,"inicio":"2026-11-01"},{"id":"cm-2","teamId":"t-carla","tipo":"fixo","valor":150,"meses":3,"inicio":"2026-11-01"}]}', 'minha-agencia'),
  ('contracts:ctr-rec', 'contracts', '{"id":"ctr-rec","clientId":"c-rec","mrr":1000,"indice":"IPCA"}', 'minha-agencia'),
  ('webinars:wb-1', 'webinars', '{"id":"wb-1","tema":"Live","ticket":997,"orcamento":5000,"vendas":{"checkout":30,"reembolsos":2,"pendentes":3,"custos":400,"taxa":5}}', 'minha-agencia'),
  ('webinarDaily:wd-1', 'webinarDaily', '{"id":"wd-1","webinarId":"wb-1","tipo":"venda","data":"2026-11-20","canal":"ao_vivo","vendas":10,"faturamento":9970}', 'minha-agencia'),
  ('deals:d-rec', 'deals', '{"id":"d-rec","empresa":"Lead X","valor":3200,"etapa":"proposta"}', 'minha-agencia'),
  ('alerts:a-mrr', 'alerts', '{"id":"a-mrr","titulo":"MRR caiu 8%","detalhe":"x","refCol":"clients","refId":"c-rec","para":["t-ana"]}', 'minha-agencia'),
  ('alerts:a-hs', 'alerts', '{"id":"a-hs","titulo":"Cliente Alfa: score caiu","detalhe":"Health 41 · MRR R$ 1.000 · 3 entregas atrasadas","refCol":"clients","refId":"c-rec","para":["t-ana"]}', 'minha-agencia'),
  ('routines:r-mrr', 'routines', '{"id":"r-mrr","nome":"Cálculo de MRR"}', 'minha-agencia'),
  ('routines:r-sync', 'routines', '{"id":"r-sync","nome":"Sync de leads"}', 'minha-agencia'),
  ('notifications:n-rs', 'notifications', '{"id":"n-rs","para":"u-ana","de":"u-gabriel","titulo":"Fatura de R$ 1.000 paga","texto":"Cliente Alfa · R$ 1.000 · em dia","lida":false}', 'minha-agencia'),
  ('settings:comercialMetas', 'settings', '{"id":"comercialMetas","valor":{"novoMrr":20000,"propostas":18}}', 'minha-agencia'),
  ('invoices:i-rec', 'invoices', '{"id":"i-rec","clientId":"c-rec","valor":1000}', 'minha-agencia'),
  ('mrrMoves:mm-1', 'mrrMoves', '{"id":"mm-1","valor":1000}', 'minha-agencia');

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select t.ok(not public.ve_receita(), 'Ana (gestor de tráfego) não tem a permissão receita');
select t.ok((select count(*) from public.records where col = 'clients') = 0, 'Ana não lê clients direto na tabela (só pela função segura)');
select t.ok((select count(*) from public.records where col = 'contacts') = t.n('contacts') and t.n('contacts') >= 1, 'coleções sem receita continuam legíveis direto');
select t.ok(t.r('clients:c-rec') is not null and not (t.r('clients:c-rec') ? 'mrr'), 'ler_record: cliente sem mrr');
select t.ok((select bool_and(not data ? 'mrr') from public.ler_records('', 1000) where col = 'clients'), 'ler_records: nenhum cliente com mrr');
select t.ok(jsonb_array_length(t.r('clients:c-rec')->'comissoes') = 1, 'Ana vê só a própria comissão');
select t.ok(t.r('clients:c-rec')->'comissoes'->0->>'tipo' = 'fixo' and (t.r('clients:c-rec')->'comissoes'->0->>'valor')::numeric = 100, 'comissão percentual vira R$/mês (10% de 1000 = 100), sem revelar o MRR');
select t.ok(not (t.r('contracts:ctr-rec') ? 'mrr'), 'contrato sem valor');
select t.ok(not (t.r('webinars:wb-1') ? 'ticket') and not (t.r('webinars:wb-1')->'vendas' ? 'reembolsos') and (t.r('webinars:wb-1')->'vendas'->>'checkout')::int = 30, 'webinar sem ticket/reembolsos, com volumes');
select t.ok(not (t.r('webinarDaily:wd-1') ? 'faturamento') and (t.r('webinarDaily:wd-1')->>'vendas')::int = 10, 'linha diária sem faturamento, com vendas');
select t.ok(t.n('invoices') = 0 and t.n('mrrMoves') = 0, 'faturas e movimentos de MRR invisíveis');
select t.ok(t.r('alerts:a-mrr') is null, 'alerta com MRR no título é invisível');
select t.ok(t.r('alerts:a-hs')->>'detalhe' = 'Health 41 · 3 entregas atrasadas', 'alerta: trecho com R$ sai do detalhe');
select t.ok(t.r('routines:r-mrr') is null and t.r('routines:r-sync') is not null, 'rotina de MRR invisível; as demais visíveis');
select t.ok(t.r('notifications:n-rs')->>'titulo' = 'Fatura de valor restrito paga' and (t.r('notifications:n-rs')->>'semValores')::boolean, 'notificação com R$ chega sem o valor');
select t.ok(not (t.r('settings:comercialMetas')->'valor' ? 'novoMrr') and (t.r('settings:comercialMetas')->'valor'->>'propostas')::int = 18, 'metas comerciais sem a meta de MRR');
-- escrita: Ana edita um campo comum; o servidor preserva mrr e comissões
select t.upsert('clients', (t.r('clients:c-rec') || '{"segmento":"Moda"}'::jsonb));
select t.upsert('contracts', (t.r('contracts:ctr-rec') || '{"indice":"IGP-M"}'::jsonb));
select t.upsert('webinars', (t.r('webinars:wb-1') || '{"tema":"Live 2","ticket":null}'::jsonb));
select t.upsert('webinarDaily', (t.r('webinarDaily:wd-1') || '{"vendas":11}'::jsonb));
select t.ok(public.restaurar_receita('alerts', t.r('alerts:a-hs') || '{"lido":true}', '{"id":"a-hs","detalhe":"Health 41 · MRR R$ 1.000 · 3 entregas atrasadas"}')->>'detalhe' = 'Health 41 · MRR R$ 1.000 · 3 entregas atrasadas', 'merge: detalhe do alerta sem valores volta ao original');
select t.upsert('notifications', (t.r('notifications:n-rs') || '{"lida":true}'::jsonb));
select t.nega($$select t.upsert('invoices', '{"id":"i-rec","clientId":"c-rec","valor":1}')$$, 'Ana não grava fatura');
select t.nega($$select t.upsert('alerts', '{"id":"a-mrr","titulo":"x","refCol":"clients","refId":"c-rec","para":["t-ana"]}')$$, 'Ana não altera alerta que não pode ver');
select t.nega($$select t.upsert_direto('clients', '{"id":"c-rec","nome":"direto","respId":"t-ana"}')$$, 'upsert direto na tabela é bloqueado para quem não vê receita');
update public.records set data = data - 'mrr' where id = 'clients:c-rec';  -- RLS: 0 linhas
select t.ok(true, 'update direto não alcança registros com receita');
select t.ok((select count(*) from public.records_feed where col = 'invoices') = 0 and (select count(*) from public.records_feed where col = 'clients') >= 1, 'feed do realtime: sem faturas para quem não vê receita');
commit;

select t.ok((select data->>'segmento' = 'Moda' and (data->>'mrr')::int = 1000 and jsonb_array_length(data->'comissoes') = 2 from public.records where id = 'clients:c-rec'), 'banco: segmento mudou, MRR 1000 e as 2 comissões preservados');
select t.ok((select data->>'indice' = 'IGP-M' and (data->>'mrr')::int = 1000 from public.records where id = 'contracts:ctr-rec'), 'banco: contrato com valor preservado');
select t.ok((select data->>'tema' = 'Live 2' and (data->>'ticket')::int = 997 and (data->'vendas'->>'reembolsos')::int = 2 and (data->'vendas'->>'taxa')::int = 5 from public.records where id = 'webinars:wb-1'), 'banco: webinar com ticket/reembolsos/taxa preservados');
select t.ok((select (data->>'vendas')::int = 11 and (data->>'faturamento')::int = 9970 from public.records where id = 'webinarDaily:wd-1'), 'banco: faturamento do dia preservado');
select t.ok((select data->>'titulo' = 'Fatura de R$ 1.000 paga' and (data->>'lida')::boolean and not data ? 'semValores' from public.records where id = 'notifications:n-rs'), 'banco: notificação marcada como lida, texto original preservado');
select t.ok((select (data->>'valor')::int = 1000 from public.records where id = 'invoices:i-rec'), 'banco: fatura intacta');

-- Paulo (financeiro, Comercial = ver): pipeline sem valores
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select t.ok(t.r('deals:d-rec') is not null and not (t.r('deals:d-rec') ? 'valor'), 'Paulo vê a oportunidade sem o valor');
commit;

-- Rayane (admin) e Gabriel (dono) veem tudo
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select t.ok(public.ve_receita(), 'Rayane (admin) tem receita');
select t.ok((t.r('clients:c-rec')->>'mrr')::int = 1000 and jsonb_array_length(t.r('clients:c-rec')->'comissoes') = 2, 'Rayane vê MRR e todas as comissões');
select t.ok(t.n('invoices') >= 1 and (select count(*) from public.records where col = 'clients') >= 1, 'Rayane lê faturas e clientes (também direto)');
select t.ok(t.r('alerts:a-mrr') is not null and (t.r('deals:d-rec')->>'valor')::int = 3200, 'Rayane vê alerta de MRR e valor do pipeline');
select t.upsert('clients', (t.r('clients:c-rec') || '{"mrr":1200}'::jsonb));
commit;
select t.ok((select (data->>'mrr')::int = 1200 from public.records where id = 'clients:c-rec'), 'quem vê receita altera o MRR');

-- matriz: o dono libera receita para gestor de tráfego → Ana passa a ver; depois volta
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select t.upsert('settings', '{"id":"perms","valor":{"comercial":{"cs":"ver","gestor_trafego":"ver"},"receita":{"gestor_trafego":"ver"}}}');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select t.ok(public.ve_receita() and (t.r('clients:c-rec')->>'mrr')::int = 1200, 'com receita liberada na matriz, Ana vê o MRR');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select t.upsert('settings', '{"id":"perms","valor":{"comercial":{"cs":"ver","gestor_trafego":"ver"}}}');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select t.ok(not public.ve_receita() and not (t.r('clients:c-rec') ? 'mrr'), 'matriz restaurada: Ana volta a não ver o MRR');
commit;

-- ================================================================ senha provisória
update auth.users set encrypted_password = 'hash-provisoria' where id = '00000000-0000-0000-0000-000000000002';
select public.registrar_senha_temporaria('00000000-0000-0000-0000-000000000002');
update public.records set data = data || '{"senhaTemporaria":true}' where id = 'users:u-ana';
select t.ok((select trocar_senha and senha_temp_hash = 'hash-provisoria' from public.profiles where user_id = '00000000-0000-0000-0000-000000000002'), 'senha provisória registrada');
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select t.nega($$select public.registrar_senha_temporaria('00000000-0000-0000-0000-000000000001')$$, 'usuário não chama registrar_senha_temporaria');
select t.ok((select trocar_senha from public.profiles where user_id = auth.uid()), 'Ana lê o próprio aviso de troca de senha');
do $$ begin perform public.concluir_troca_senha(); raise exception 'FALHOU: aceitou sem trocar a senha'; exception when invalid_parameter_value then raise notice 'ok - não conclui sem trocar a senha'; end $$;
commit;
update auth.users set encrypted_password = 'hash-nova' where id = '00000000-0000-0000-0000-000000000002';
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select t.ok(public.concluir_troca_senha(), 'concluir_troca_senha depois da senha nova');
commit;
select t.ok((select not trocar_senha and senha_temp_hash is null from public.profiles where user_id = '00000000-0000-0000-0000-000000000002')
        and (select data->>'senhaTemporaria' = 'false' from public.records where id = 'users:u-ana'), 'troca concluída: perfil e registro users atualizados');

-- anônimo não chama as funções de gravação
begin;
set local role anon;
select t.nega($$select public.gravar_record('clients', '{"id":"c-anon2","nome":"x"}')$$, 'anon não chama gravar_record');
select t.ok((select count(*) from public.ler_records('', 1000)) = 0, 'anon: ler_records vazio');
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
select t.ok((select count(*) from public.records where col = 'clients') = 4, 'service role vê tudo (inclusive outra org)');
select t.upsert_direto('notifications', '{"id":"n-sys","para":"u-ana","titulo":"Rotina falhou","lida":false}');
commit;
\echo 'TODOS OS TESTES DE RLS PASSARAM'
