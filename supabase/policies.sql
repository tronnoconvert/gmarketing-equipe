-- =====================================================================================
-- Agência OS — segurança (RLS) do Supabase. Rode DEPOIS de schema.sql. Idempotente.
--
-- Ideia: a mesma matriz de permissões do app (PLAN §5, editável em Administração › Permissões e
-- guardada em records 'settings:perms') decide o que cada papel lê e grava no banco.
--   1) public.perm_padrao   = matriz padrão (igual a MATRIZ_PADRAO de src/core/perms.js)
--   2) settings:perms       = diferenças salvas pelo app (sobrepõem o padrão)
--   3) public.col_modules   = de qual(is) módulo(s) cada coleção depende (mapa abaixo)
--   4) can_col(col, ação)   = o papel tem o nível exigido em algum módulo da coleção
--   5) escopo de clientes   = cs e produção só veem registros dos SEUS clientes (gestor de tráfego vê todos desde 25/11/2026;
--                             a receita continua cortada por ve_receita)
--
-- Níveis: '' (sem acesso) < ver (1) < editar (2) < admin/Total (4). Sufixos :seus / :proprio = escopo.
-- Ações: select exige ver · insert/update exigem editar · delete exige admin, ou dono/admin com editar
-- (mesma regra de perms.can no front).
--
-- Mapa coleção → módulo (leitura: basta 'ver' em QUALQUER módulo listado; escrita: 'editar' em um
-- módulo marcado com escreve = true):
--   clientes   : clients contacts contracts services healthHistory meetings onboarding clientResults clientActions
--                (leitura também por cockpit, financeiro, operacao, comercial, alertas, webinars, torre_voo)
--   operacao   : deliveries tasks projects timeEntries (tasks/deliveries também lidos por clientes, equipe, cockpit)
--   equipe     : goals checkins oneOnOnes teamStats timeEntries (team também por admin)
--   financeiro : invoices payables cash mrrMoves finance costs (leitura também por cockpit)
--   comercial  : deals          torre: routines routineRuns integrations (leitura também por cockpit, alertas)
--   alertas    : alerts alertRules insights (leitura também por cockpit)
--   webinars   : webinars webinarDaily     campanha: campaignAccount campaignDaily campaigns creatives
--   admin      : users invites (escrita) · team (escrita admin/equipe)
--   especiais  : users/team = diretório (todos da org leem) · settings = todos leem (exceto notif:* de outros)
--                notifications = só o destinatário lê (e o remetente, o que enviou); destinatário só altera 'lida' · comments = autor grava/apaga
--                activity = qualquer um insere o próprio registro; ninguém altera/apaga (auditoria);
--                lida por Administração/Equipe (escopo todos); os demais leem só as próprias ações
-- Coleções não mapeadas: leitura/escrita só para quem tem 'editar' em admin (dono/admin).
-- Edge Functions usam a service role (ignora RLS) e validam o papel no código.
-- =====================================================================================

-- ---------------------------------------------------------------- matriz padrão (PLAN §5)
create table if not exists public.perm_padrao (
  mod   text not null,
  papel text not null,
  valor text not null default '',
  primary key (mod, papel)
);
insert into public.perm_padrao (mod, papel, valor)
select m, p, v from (values
  -- colunas: dono, admin, head_trafego, gestor_trafego, cs, producao, financeiro, comercial, leitura (igual a src/core/perms.js)
  ('mesa',         array['editar','editar','editar','editar','editar','editar','editar','editar','ver']),
  ('cockpit',      array['admin','editar','','','','','','','']),
  ('financeiro',   array['admin','editar','','','','','','','']),
  ('clientes',     array['admin','editar','editar','editar','editar:seus','ver:seus','ver','ver','ver']),
  ('operacao',     array['admin','editar','editar','editar','editar','editar:seus','','','ver']),
  ('equipe',       array['admin','editar','ver:proprio','ver:proprio','ver:proprio','ver:proprio','ver','ver:proprio','']),
  ('torre',        array['admin','editar','editar','ver','ver','','','','ver']),
  ('torre_voo',    array['admin','editar','editar','editar','ver','','','','ver']),
  ('comercial',    array['admin','editar','','','','','ver','editar','']),
  ('alertas',      array['admin','editar','ver','ver:seus','ver:seus','ver:seus','ver:seus','ver:seus','ver']),
  ('webinars',     array['admin','editar','editar','editar','editar','editar:seus','ver','ver','ver']),
  ('campanha',     array['admin','admin','','','','','','','']),
  ('notificacoes', array['editar','editar','editar','editar','editar','editar','editar','editar','ver']),
  ('admin',        array['admin','editar','','','','','','','']),
  ('receita',      array['admin','admin','','','','','','','']),
  ('padroes',      array['admin','editar','editar','','','','','',''])
) as t(m, vals),
lateral unnest(vals, array['dono','admin','head_trafego','gestor_trafego','cs','producao','financeiro','comercial','leitura']) as u(v, p)
on conflict (mod, papel) do update set valor = excluded.valor;

-- ---------------------------------------------------------------- coleção → módulos
create table if not exists public.col_modules (
  col            text not null,
  mod            text not null,
  escreve        boolean not null default false,   -- este módulo pode gravar a coleção (com 'editar')
  escopo_cliente boolean not null default false,   -- papéis com escopo "seus" só veem registros dos seus clientes
  primary key (col, mod)
);
truncate public.col_modules;
insert into public.col_modules (col, mod, escreve, escopo_cliente) values
  -- clientes
  ('clients','clientes',true,true),('clients','cockpit',false,true),('clients','financeiro',false,true),('clients','operacao',false,true),
  ('clients','comercial',false,true),('clients','alertas',false,true),('clients','webinars',false,true),('clients','torre_voo',false,true),('clients','equipe',false,true),
  ('contacts','clientes',true,true),('contracts','clientes',true,true),('contracts','financeiro',false,true),('contracts','cockpit',false,true),
  ('services','clientes',true,true),('healthHistory','clientes',true,true),('healthHistory','cockpit',false,true),
  ('meetings','clientes',true,true),('meetings','operacao',true,true),('onboarding','clientes',true,true),
  ('clientResults','clientes',true,true),('clientActions','clientes',true,true),('clientActions','operacao',true,true),('clientActions','torre_voo',true,true),
  -- operação
  ('tasks','operacao',true,true),('tasks','clientes',false,true),('tasks','equipe',false,true),('tasks','cockpit',false,true),
  ('deliveries','operacao',true,true),('deliveries','clientes',false,true),('deliveries','cockpit',false,true),
  ('projects','operacao',true,true),('timeEntries','operacao',true,true),('timeEntries','equipe',true,true),
  -- equipe
  ('goals','equipe',true,false),('checkins','equipe',true,false),('oneOnOnes','equipe',true,false),('teamStats','equipe',true,false),('teamStats','cockpit',false,false),
  -- financeiro
  ('invoices','financeiro',true,true),('invoices','cockpit',false,true),('invoices','clientes',false,true),
  ('payables','financeiro',true,false),('cash','financeiro',true,false),('cash','cockpit',false,false),
  ('mrrMoves','financeiro',true,false),('mrrMoves','cockpit',false,false),('finance','financeiro',true,false),('finance','cockpit',false,false),
  ('costs','financeiro',true,false),
  -- comercial, torre, alertas
  ('deals','comercial',true,false),('deals','cockpit',false,false),
  ('routines','torre',true,false),('routines','cockpit',false,false),('routines','alertas',false,false),
  ('routineRuns','torre',true,false),('integrations','torre',true,false),('integrations','cockpit',false,false),('integrations','alertas',false,false),
  ('alerts','alertas',true,false),('alerts','cockpit',false,false),('alertRules','alertas',true,false),('insights','alertas',true,false),('insights','cockpit',false,false),
  -- webinars e campanha
  ('webinars','webinars',true,false),('webinarDaily','webinars',true,false),
  ('recsLog','campanha',true,false),('recsLog','torre_voo',true,false),
  ('relatorios','mesa',true,true),('relatorios','torre_voo',false,true),('relatorios','clientes',false,true),
  ('campaignAccount','campanha',true,false),('campaignDaily','campanha',true,false),('campaigns','campanha',true,false),('creatives','campanha',true,false),
  -- administração
  ('users','admin',true,false),('invites','admin',true,false),('team','admin',true,false),('team','equipe',true,false),
  ('activity','admin',false,false),('activity','equipe',false,false),('activity','clientes',false,false);

-- ---------------------------------------------------------------- funções auxiliares
-- Todas SECURITY DEFINER (leem profiles/records sem recursão de RLS) e STABLE (cache por consulta).
create or replace function public.my_profile() returns public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where user_id = auth.uid() and ativo
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.profiles where user_id = auth.uid() and ativo
$$;

create or replace function public.my_org() returns text
language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where user_id = auth.uid() and ativo
$$;

create or replace function public.my_team() returns text
language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where user_id = auth.uid() and ativo
$$;

create or replace function public.my_app_user() returns text
language sql stable security definer set search_path = public as $$
  select app_user_id from public.profiles where user_id = auth.uid() and ativo
$$;

-- valor da célula (mod, papel): diferença salva em settings:perms, senão o padrão
create or replace function public.perm_valor(p_mod text, p_papel text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select r.data->'valor'->p_mod->>p_papel from public.records r
      where r.id = 'settings:perms' and r.org_id = public.my_org()),
    (select valor from public.perm_padrao where mod = p_mod and papel = p_papel),
    '')
$$;

-- nível numérico do usuário logado no módulo: 0, 1 (ver), 2 (editar), 4 (admin)
create or replace function public.perm_rank(p_mod text) returns int
language sql stable security definer set search_path = public as $$
  select case split_part(public.perm_valor(p_mod, public.my_role()), ':', 1)
           when 'admin' then 4 when 'editar' then 2 when 'ver' then 1 else 0 end
$$;

-- escopo do usuário logado no módulo: 'todos' | 'seus' | 'proprio'
create or replace function public.perm_escopo(p_mod text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(split_part(public.perm_valor(p_mod, public.my_role()), ':', 2), ''), 'todos')
$$;

-- pode executar a ação ('select'|'insert'|'update'|'delete') na coleção?
create or replace function public.can_col(p_col text, p_action text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_need int := case lower(p_action) when 'select' then 1 when 'delete' then 4 else 2 end;
  v_role text := public.my_role();
  v_ok boolean;
begin
  if v_role is null then return false; end if;
  if not exists (select 1 from public.col_modules where col = p_col) then
    -- coleção não mapeada: só quem administra
    return public.perm_rank('admin') >= 2;
  end if;
  select exists (
    select 1 from public.col_modules cm
     where cm.col = p_col
       and (lower(p_action) = 'select' or cm.escreve)
       and (
         public.perm_rank(cm.mod) >= v_need
         -- excluir: nível admin, ou papel dono/admin com editar (regra de perms.can)
         or (lower(p_action) = 'delete' and v_role in ('dono','admin') and public.perm_rank(cm.mod) >= 2)
       )
  ) into v_ok;
  return coalesce(v_ok, false);
end $$;

-- clientes sob responsabilidade do usuário (clients.respId = meu time ou clients.equipe contém meu time)
create or replace function public.my_client_ids() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(r.data->>'id'), '{}')
    from public.records r
   where r.col = 'clients' and r.org_id = public.my_org()
     and public.my_team() is not null
     and (r.data->>'respId' = public.my_team() or coalesce(r.data->'equipe', '[]'::jsonb) ? public.my_team())
$$;

-- o usuário tem escopo limitado a "seus clientes" nesta coleção?
create or replace function public.escopo_limitado(p_col text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.col_modules where col = p_col and escopo_cliente)
     and (public.my_role() in ('cs','producao') or public.perm_escopo('clientes') = 'seus')
$$;

-- o registro está no escopo do usuário? (para coleções ligadas a clientes)
create or replace function public.no_escopo(p_col text, p_data jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_col = 'alerts' and public.perm_escopo('alertas') = 'seus' then
         coalesce(p_data->'para', '[]'::jsonb) ? coalesce(public.my_team(), '')
      or (p_data->>'refCol' = 'clients' and p_data->>'refId' = any (public.my_client_ids()))
      or (p_data->>'refCol' = 'team' and p_data->>'refId' = public.my_team())
    when not public.escopo_limitado(p_col) then true
    when p_col = 'clients' then p_data->>'id' = any (public.my_client_ids())
    when p_data ? 'clientId' and p_data->>'clientId' is not null then p_data->>'clientId' = any (public.my_client_ids())
    -- registros internos sem cliente (ex.: tarefa interna): visíveis; tarefas "suas" para produção
    when p_col in ('tasks','deliveries','timeEntries') and public.perm_escopo('operacao') = 'seus'
      then coalesce(p_data->>'respId', p_data->>'responsavel', p_data->>'teamId', public.my_team()) = public.my_team()
    else true
  end
$$;

-- é registro de configuração que o usuário pode gravar?
create or replace function public.pode_settings(p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_id = 'settings:perms' then public.perm_rank('admin') >= 2
    when p_id like 'settings:notif:%' then substr(p_id, length('settings:notif:') + 1) = public.my_app_user() or public.perm_rank('admin') >= 2
    -- central "Padrões e regras" (limites, faixas, pesos e regras dos motores): só quem edita o módulo padroes
    when p_id in ('settings:padroes', 'settings:padroesHistorico', 'settings:motorRegras', 'settings:guardiaoRegras') then public.perm_rank('padroes') >= 2 or public.perm_rank('admin') >= 2
    else exists (select 1 from public.perm_padrao pp where public.perm_rank(pp.mod) >= 2 and pp.mod <> 'notificacoes')
  end
$$;

-- ---------------------------------------------------------------- guardas (triggers)
-- service role (Edge Functions) e SQL do dono do banco passam direto
create or replace function public.e_servidor() returns boolean
language sql stable as $$
  select auth.uid() is null or coalesce(auth.role(), '') = 'service_role'
$$;

create or replace function public.tg_records_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_donos int;
begin
  if public.e_servidor() then return coalesce(new, old); end if;

  -- notificações: o destinatário só altera 'lida' (e os carimbos de atualização)
  if tg_op = 'UPDATE' and new.col = 'notifications' then
    if (new.data - 'lida' - 'updatedAt' - 'updatedBy') is distinct from (old.data - 'lida' - 'updatedAt' - 'updatedBy') then
      raise exception 'Notificações só podem ser marcadas como lidas/não lidas.' using errcode = '42501';
    end if;
  end if;

  -- auditoria é só inserção, e sempre em nome de quem grava
  if tg_op <> 'DELETE' and new.col = 'activity' then
    if tg_op = 'UPDATE' then raise exception 'O registro de auditoria não pode ser alterado.' using errcode = '42501'; end if;
    if coalesce(new.data->>'quem', public.my_app_user()) is distinct from public.my_app_user() then
      raise exception 'Auditoria precisa ser gravada em nome de quem fez a ação.' using errcode = '42501';
    end if;
  end if;

  -- usuários: quem não administra só altera o próprio registro e sem mexer em papel/ativo/e-mail/vínculos
  if tg_op = 'UPDATE' and new.col = 'users' and not public.can_col('users', 'update') then
    if (new.data->>'papel') is distinct from (old.data->>'papel')
       or (new.data->>'ativo') is distinct from (old.data->>'ativo')
       or (new.data->>'email') is distinct from (old.data->>'email')
       or (new.data->>'authId') is distinct from (old.data->>'authId')
       or (new.data->>'teamId') is distinct from (old.data->>'teamId') then
      raise exception 'Só a Administração altera papel, status, e-mail e vínculo de usuários.' using errcode = '42501';
    end if;
  end if;

  -- nunca ficar sem um Dono ativo
  if tg_op in ('UPDATE','DELETE') and old.col = 'users'
     and old.data->>'papel' = 'dono' and coalesce((old.data->>'ativo')::boolean, true)
     and (tg_op = 'DELETE' or new.data->>'papel' is distinct from 'dono' or not coalesce((new.data->>'ativo')::boolean, true)) then
    select count(*) into v_donos from public.records r
     where r.col = 'users' and r.org_id = old.org_id and r.id <> old.id
       and r.data->>'papel' = 'dono' and coalesce((r.data->>'ativo')::boolean, true);
    if v_donos = 0 then
      raise exception 'É preciso manter pelo menos um Dono ativo. Promova outra pessoa antes.' using errcode = '42501';
    end if;
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists records_guard on public.records;
create trigger records_guard before update or delete on public.records
  for each row execute function public.tg_records_guard();
drop trigger if exists records_guard_ins on public.records;
create trigger records_guard_ins before insert on public.records
  for each row when (new.col = 'activity') execute function public.tg_records_guard();

-- ---------------------------------------------------------------- sincronia users → profiles (versão segura)
-- Só aplica papel/ativo vindos de `users` quando quem grava administra usuários (ou é o servidor).
create or replace function public.tg_users_sync_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.col <> 'users' or coalesce(new.data->>'authId', '') = '' then return new; end if;
  if not (public.e_servidor() or public.can_col('users', 'update')) then return new; end if;
  update public.profiles p
     set papel       = coalesce(nullif(new.data->>'papel', ''), p.papel),
         ativo       = coalesce((new.data->>'ativo')::boolean, true),
         team_id     = nullif(new.data->>'teamId', ''),
         app_user_id = new.data->>'id'
   where p.user_id = (new.data->>'authId')::uuid
     and p.org_id = new.org_id;
  return new;
end $$;

-- ---------------------------------------------------------------- predicados de RLS (funções)
-- As regras ficam em funções para serem usadas pelas políticas E pelas funções seguras ler_records /
-- gravar_record / apagar_record (mais abaixo), que o app usa no lugar do SELECT/UPSERT direto.
create or replace function public.rls_ler(p_id text, p_col text, p_data jsonb, p_org text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_org = public.my_org()
  and case p_col
    -- destinatário lê; o remetente também enxerga o que ELE enviou
    when 'notifications' then p_data->>'para' = public.my_app_user() or (p_data->>'de' = public.my_app_user() and p_data->>'de' is not null)
    when 'users'    then true
    when 'team'     then true
    when 'settings' then p_id not like 'settings:notif:%' or p_id = 'settings:notif:' || public.my_app_user() or public.perm_rank('admin') >= 1
    -- auditoria: Administração ou Equipe (escopo todos) leem tudo; os demais só o que eles mesmos fizeram
    when 'activity' then p_data->>'quem' = public.my_app_user() or public.perm_rank('admin') >= 1
                         or (public.perm_rank('equipe') >= 1 and public.perm_escopo('equipe') = 'todos')
    when 'comments' then coalesce(p_data->>'refCol', '') = '' or (public.can_col(p_data->>'refCol', 'select')
                         and (p_data->>'refCol' <> 'clients' or not public.escopo_limitado('clients') or p_data->>'refId' = any (public.my_client_ids())))
    else public.can_col(p_col, 'select') and public.no_escopo(p_col, p_data)
  end
$$;

create or replace function public.rls_inserir(p_id text, p_col text, p_data jsonb, p_org text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_org = public.my_org()
  and case p_col
    -- remetente = eu (e posso editar Notificações), ou é minha própria notificação
    when 'notifications' then (coalesce(p_data->>'de', public.my_app_user()) = public.my_app_user() and public.perm_rank('notificacoes') >= 2)
                              or p_data->>'para' = public.my_app_user()
    when 'activity'      then true                         -- conteúdo validado no trigger
    when 'comments'      then p_data->>'autor' = public.my_app_user() and public.perm_rank('notificacoes') >= 2
    when 'settings'      then public.pode_settings(p_id)
    -- o próprio registro (o login grava ultimoAcesso); papel/ativo protegidos pelo trigger
    when 'users'         then public.can_col('users', 'insert') or p_data->>'id' = public.my_app_user()
    else public.can_col(p_col, 'insert') and public.no_escopo(p_col, p_data)
  end
$$;

-- vale para a linha antiga (USING) e para a nova (WITH CHECK)
create or replace function public.rls_atualizar(p_id text, p_col text, p_data jsonb, p_org text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_org = public.my_org()
  and case p_col
    when 'notifications' then p_data->>'para' = public.my_app_user()
    when 'activity'      then false
    when 'comments'      then p_data->>'autor' = public.my_app_user()
    when 'settings'      then public.pode_settings(p_id)
    when 'users'         then public.can_col('users', 'update') or p_data->>'id' = public.my_app_user()
    else public.can_col(p_col, 'update') and public.no_escopo(p_col, p_data)
  end
$$;

create or replace function public.rls_excluir(p_id text, p_col text, p_data jsonb, p_org text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_org = public.my_org()
  and case p_col
    when 'notifications' then p_data->>'para' = public.my_app_user() or public.perm_rank('admin') >= 2
    when 'activity'      then false
    when 'comments'      then p_data->>'autor' = public.my_app_user()
    when 'settings'      then public.pode_settings(p_id)
    else public.can_col(p_col, 'delete') and public.no_escopo(p_col, p_data)
  end
$$;

-- =====================================================================================
-- RECEITA — "dinheiro que entra (MRR, faturamento, receita, ticket, ROAS da agência, lucro, valores de
-- contrato, comissões) só para Dono e Admin". Vale para quem NÃO tem a permissão 'receita' na matriz
-- (padrão: só dono/admin; editável em Administração › Permissões → settings:perms).
--   1) receita_colecoes : coleções que são só dinheiro → invisíveis (faturas, contas, caixa, MRR, DRE, custos)
--   2) receita_campos   : chaves removidas dos registros mistos (clients.mrr, contracts.mrr, webinars.ticket…)
--   3) filtrar_receita  : remove as chaves, esconde alertas/insights/rotinas de receita e tira R$ dos textos
--   4) quem não vê receita NÃO lê essas coleções direto na tabela (política records_select): lê pela
--      função ler_records/ler_record (SECURITY DEFINER), que devolve os registros já filtrados
--   5) gravar_record    : grava pelo servidor e PRESERVA as chaves de receita já gravadas (merge)
-- =====================================================================================
create table if not exists public.receita_colecoes (col text primary key);
truncate public.receita_colecoes;
insert into public.receita_colecoes (col) values ('invoices'),('payables'),('cash'),('mrrMoves'),('finance'),('costs');

create table if not exists public.receita_campos (
  col     text not null,
  caminho text[] not null,               -- caminho dentro de data (ex.: {vendas,reembolsos})
  excecao text,                          -- 'comercial' = quem edita o Comercial também vê (valores do pipeline)
  doc_id  text,                          -- só este registro (ex.: settings 'comercialMetas')
  primary key (col, caminho)
);
truncate public.receita_campos;
insert into public.receita_campos (col, caminho, excecao, doc_id) values
  ('clients',        '{mrr}', null, null),
  ('clients',        '{comissoes}', null, null),          -- a pessoa recebe só as próprias, já em R$/mês (ver abaixo)
  ('contracts',      '{mrr}', null, null),
  ('contracts',      '{valor}', null, null),
  ('deals',          '{valor}', 'comercial', null),
  ('deals',          '{mrr}', 'comercial', null),
  ('settings',       '{valor,novoMrr}', 'comercial', 'comercialMetas'),
  ('webinars',       '{ticket}', null, null),
  ('webinars',       '{faturamento}', null, null),
  ('webinars',       '{vendas,reembolsos}', null, null),
  ('webinars',       '{vendas,pendentes}', null, null),
  ('webinars',       '{vendas,custos}', null, null),
  ('webinars',       '{vendas,taxa}', null, null),
  ('webinarDaily',   '{faturamento}', null, null),
  ('campaignDaily',  '{action_values_purchase}', null, null),
  ('campaigns',      '{action_values_purchase}', null, null);

-- coleções com algum filtro de receita (direto na tabela só para quem vê receita)
create or replace function public.col_receita(p_col text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.receita_colecoes where col = p_col)
      or exists (select 1 from public.receita_campos where col = p_col)
      or p_col in ('alerts','insights','alertRules','routines','routineRuns','notifications','activity','meetings')
$$;

create or replace function public.ve_receita() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() is not null and public.perm_rank('receita') >= 1
$$;

-- textos: "R$ 14.200", "R$ 14,2 mil/mês" → "valor restrito"; trechos " · " com dinheiro saem
create or replace function public.tem_dinheiro(t text) returns boolean
language sql immutable as $$ select coalesce(t, '') ~* '(R\$|\mMRR\M|faturamento|\mreceita\M)' $$;
create or replace function public.tem_rs(t text) returns boolean
language sql immutable as $$ select coalesce(t, '') ~ 'R\$\s?\d' $$;
create or replace function public.sem_rs(t text) returns text
language sql immutable as $$ select regexp_replace(t, 'R\$\s?[0-9.,]+(\s?(mil|k))?(/m[eê]s)?', 'valor restrito', 'gi') $$;
create or replace function public.sem_trechos_dinheiro(t text) returns text
language sql immutable as $$
  select array_to_string(array(select p from unnest(string_to_array(coalesce(t, ''), ' · ')) with ordinality as x(p, o)
                               where not public.tem_dinheiro(p) order by o), ' · ')
$$;

-- grava v no caminho p criando os objetos intermediários
create or replace function public.jsonb_set_caminho(d jsonb, p text[], v jsonb) returns jsonb
language plpgsql immutable as $$
declare i int;
begin
  for i in 1 .. coalesce(array_length(p, 1), 0) - 1 loop
    if jsonb_typeof(d #> p[1:i]) is distinct from 'object' then d := jsonb_set(d, p[1:i], '{}'::jsonb, true); end if;
  end loop;
  return jsonb_set(d, p, v, true);
end $$;

-- caminhos removidos para o usuário logado nesta coleção/registro
create or replace function public.caminhos_receita(p_col text, p_doc text) returns setof text[]
language sql stable security definer set search_path = public as $$
  select caminho from public.receita_campos
   where col = p_col and (doc_id is null or doc_id = p_doc)
     and not (excecao = 'comercial' and public.perm_rank('comercial') >= 2)
$$;

-- registro como quem NÃO vê receita deve receber (null = invisível)
create or replace function public.filtrar_receita(p_col text, p_data jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d jsonb := p_data;
  c text[];
  v_team text := public.my_team();
  v_mrr numeric;
  v_com jsonb;
begin
  if p_data is null then return null; end if;
  if exists (select 1 from public.receita_colecoes where col = p_col) then return null; end if;
  for c in select * from public.caminhos_receita(p_col, p_data->>'id') loop
    d := d #- c;
  end loop;

  if p_col = 'clients' then
    -- comissões: a pessoa vê só as próprias, sempre como valor fixo em R$/mês (o % do MRR revelaria o MRR)
    v_mrr := case when jsonb_typeof(p_data->'mrr') = 'number' then (p_data->>'mrr')::numeric else 0 end;
    select coalesce(jsonb_agg(
             case when x->>'tipo' = 'percentual'
                  then x || jsonb_build_object('tipo', 'fixo', 'valor',
                         round(coalesce(nullif(x->>'valor', '')::numeric, 0) / 100 * v_mrr, 2))
                  else x end), '[]'::jsonb)
      into v_com
      from jsonb_array_elements(case when jsonb_typeof(p_data->'comissoes') = 'array' then p_data->'comissoes' else '[]'::jsonb end) x
     where v_team is not null and x->>'teamId' = v_team;
    d := d || jsonb_build_object('comissoes', v_com);
  elsif p_col = 'alerts' then
    if public.tem_dinheiro(p_data->>'titulo') then return null; end if;
    if d ? 'detalhe' then d := jsonb_set(d, '{detalhe}', to_jsonb(public.sem_trechos_dinheiro(d->>'detalhe'))); end if;
  elsif p_col = 'insights' then
    if not (p_data->>'area' = 'Comercial' and public.perm_rank('comercial') >= 2)
       and public.tem_dinheiro(coalesce(p_data->>'tituloEquipe', p_data->>'titulo') || ' ' || coalesce(p_data->>'textoEquipe', p_data->>'texto')) then
      return null;
    end if;
  elsif p_col = 'alertRules' then
    if p_data->>'area' = 'Financeiro' then return null; end if;
  elsif p_col = 'routines' then
    if p_data->>'id' in ('r-mrr', 'r-conciliacao', 'r-cobranca') or coalesce((p_data->>'receita')::boolean, false) then return null; end if;
  elsif p_col = 'routineRuns' then
    if coalesce(p_data->>'rotinaId', p_data->>'routineId') in ('r-mrr', 'r-conciliacao', 'r-cobranca') then return null; end if;
  elsif p_col = 'notifications' then
    if not coalesce((p_data->>'semValores')::boolean, false) and coalesce(p_data->>'valorProprio', '') <> 'comissao'
       and (public.tem_rs(p_data->>'titulo') or public.tem_rs(p_data->>'texto'))
       and not (coalesce(p_data->>'link', '') ~ '^#/comercial' and public.perm_rank('comercial') >= 2) then
      d := d || jsonb_build_object(
        'titulo', public.sem_rs(coalesce(p_data->>'titulo', '')),
        'texto', coalesce(nullif(public.sem_rs(array_to_string(array(
                   select p from unnest(string_to_array(coalesce(p_data->>'texto', ''), ' · ')) with ordinality as x(p, o)
                    where not public.tem_rs(p) order by o), ' · ')), ''), 'Valores visíveis só para administradores.'),
        'semValores', true);
    end if;
  elsif p_col = 'activity' then
    if d ? 'oque' then d := jsonb_set(d, '{oque}', to_jsonb(public.sem_rs(d->>'oque'))); end if;
  elsif p_col = 'meetings' then
    if d ? 'pauta' then d := jsonb_set(d, '{pauta}', to_jsonb(public.sem_rs(d->>'pauta'))); end if;
  end if;
  return d;
end $$;

-- o que um usuário SEM receita gravou, com as chaves de receita do registro antigo preservadas
create or replace function public.restaurar_receita(p_col text, p_novo jsonb, p_antigo jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d jsonb := p_novo;
  c text[];
begin
  if p_antigo is null then return p_novo; end if;
  for c in select * from public.caminhos_receita(p_col, p_antigo->>'id') loop
    if p_antigo #> c is not null then d := public.jsonb_set_caminho(d, c, p_antigo #> c);
    else d := d #- c; end if;
  end loop;
  if p_col = 'notifications' then
    -- quem não vê receita só marca lida/não lida (o texto que ela recebeu pode estar sem os valores)
    d := p_antigo || jsonb_strip_nulls(jsonb_build_object('lida', p_novo->'lida', 'updatedAt', p_novo->'updatedAt', 'updatedBy', p_novo->'updatedBy'));
  elsif p_col = 'alerts' and p_novo->>'detalhe' is not distinct from public.sem_trechos_dinheiro(p_antigo->>'detalhe') then
    d := jsonb_set(d, '{detalhe}', coalesce(p_antigo->'detalhe', 'null'::jsonb));
  elsif p_col = 'meetings' and p_novo->>'pauta' is not distinct from public.sem_rs(p_antigo->>'pauta') then
    d := jsonb_set(d, '{pauta}', coalesce(p_antigo->'pauta', 'null'::jsonb));
  end if;
  return d;
end $$;

-- ---------------------------------------------------------------- RLS
alter table public.records     enable row level security;
alter table public.profiles    enable row level security;
alter table public.orgs        enable row level security;
alter table public.perm_padrao enable row level security;
alter table public.col_modules enable row level security;
alter table public.records     force row level security;
alter table public.records_feed     enable row level security;
alter table public.receita_colecoes enable row level security;
alter table public.receita_campos   enable row level security;

-- records: leitura direta. Coleções com receita: só para quem vê receita (os demais usam ler_records).
drop policy if exists records_select on public.records;
create policy records_select on public.records for select to authenticated
using (public.rls_ler(id, col, data, org_id) and (not public.col_receita(col) or public.ve_receita()));

drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated
with check (public.rls_inserir(id, col, data, org_id) and (not public.col_receita(col) or public.ve_receita()));

drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated
using (public.rls_atualizar(id, col, data, org_id) and (not public.col_receita(col) or public.ve_receita()))
with check (public.rls_atualizar(id, col, data, org_id));

drop policy if exists records_delete on public.records;
create policy records_delete on public.records for delete to authenticated
using (public.rls_excluir(id, col, data, org_id) and (not public.col_receita(col) or public.ve_receita()));

-- feed do realtime: só id/coleção/operação; coleções só de receita ficam de fora para quem não vê receita
drop policy if exists records_feed_select on public.records_feed;
create policy records_feed_select on public.records_feed for select to authenticated
using (org_id = public.my_org() and (public.ve_receita() or not exists (select 1 from public.receita_colecoes rc where rc.col = records_feed.col)));

drop policy if exists receita_colecoes_select on public.receita_colecoes;
create policy receita_colecoes_select on public.receita_colecoes for select to authenticated using (true);
drop policy if exists receita_campos_select on public.receita_campos;
create policy receita_campos_select on public.receita_campos for select to authenticated using (true);

-- ---------------------------------------------------------------- funções que o app usa (store.js)
-- ler_records: carga inicial, paginada por id (keyset). Aplica as mesmas regras do RLS e o filtro de receita.
create or replace function public.ler_records(p_apos text default '', p_limite int default 1000)
returns table (id text, col text, data jsonb)
language plpgsql stable security definer set search_path = public as $$
declare v_org text := public.my_org(); v_rec boolean := public.ve_receita();
begin
  if v_org is null then return; end if;
  return query
    select r.id, r.col, x.d
      from public.records r
      cross join lateral (select case when v_rec or not public.col_receita(r.col) then r.data else public.filtrar_receita(r.col, r.data) end as d) x
     where r.org_id = v_org and r.id > coalesce(p_apos, '')
       and public.rls_ler(r.id, r.col, r.data, r.org_id)
       and x.d is not null
     order by r.id
     limit least(greatest(coalesce(p_limite, 1000), 1), 1000);
end $$;

-- ler_record: um registro (depois de um aviso do realtime). null = não existe ou não é visível.
create or replace function public.ler_record(p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.records;
begin
  select * into r from public.records where records.id = p_id;
  if not found or not public.rls_ler(r.id, r.col, r.data, r.org_id) then return null; end if;
  if public.ve_receita() or not public.col_receita(r.col) then return r.data; end if;
  return public.filtrar_receita(r.col, r.data);
end $$;

-- gravar_record: insere ou atualiza (o "upsert" do app), com as regras do RLS e o merge de receita
create or replace function public.gravar_record(p_col text, p_data jsonb) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_org text := public.my_org();
  v_id text;
  v_old public.records;
  v_data jsonb := p_data;
  v_rec boolean := public.ve_receita();
begin
  if auth.uid() is null or v_org is null then
    raise exception 'Sessão inválida ou acesso não configurado.' using errcode = '42501';
  end if;
  if p_col is null or p_data is null or coalesce(p_data->>'id', '') = '' then
    raise exception 'Registro sem id.' using errcode = '22023';
  end if;
  v_id := p_col || ':' || (p_data->>'id');
  select * into v_old from public.records where records.id = v_id for update;
  if found then
    if not v_rec and public.col_receita(p_col) then
      if public.filtrar_receita(p_col, v_old.data) is null then
        raise exception 'Sem permissão para alterar este registro.' using errcode = '42501';
      end if;
      v_data := public.restaurar_receita(p_col, p_data, v_old.data);
    end if;
    if not (public.rls_atualizar(v_old.id, v_old.col, v_old.data, v_old.org_id) and public.rls_atualizar(v_id, p_col, v_data, v_org)) then
      raise exception 'Sem permissão para alterar este registro.' using errcode = '42501';
    end if;
    update public.records set data = v_data, updated_at = now() where records.id = v_id;
  else
    if not v_rec and exists (select 1 from public.receita_colecoes where col = p_col) then
      raise exception 'Sem permissão para gravar valores de receita.' using errcode = '42501';
    end if;
    if not public.rls_inserir(v_id, p_col, v_data, v_org) then
      raise exception 'Sem permissão para criar este registro.' using errcode = '42501';
    end if;
    insert into public.records (id, col, data, org_id) values (v_id, p_col, v_data, v_org);
  end if;
end $$;

-- apagar_record: exclusão com as regras do RLS
create or replace function public.apagar_record(p_id text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_old public.records;
begin
  if auth.uid() is null or public.my_org() is null then
    raise exception 'Sessão inválida ou acesso não configurado.' using errcode = '42501';
  end if;
  select * into v_old from public.records where records.id = p_id for update;
  if not found then return; end if;
  if not public.rls_excluir(v_old.id, v_old.col, v_old.data, v_old.org_id)
     or (not public.ve_receita() and public.col_receita(v_old.col) and public.filtrar_receita(v_old.col, v_old.data) is null) then
    raise exception 'Sem permissão para excluir este registro.' using errcode = '42501';
  end if;
  delete from public.records where records.id = p_id;
end $$;


-- (service role) a pessoa (id 'u-…' do app) vê receita? Usado pelas Edge Functions antes de mandar WhatsApp/e-mail.
create or replace function public.usuario_ve_receita(p_org text, p_app_user text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select split_part(coalesce(
             (select r.data->'valor'->'receita'->>p.papel from public.records r where r.id = 'settings:perms' and r.org_id = p_org),
             (select pp.valor from public.perm_padrao pp where pp.mod = 'receita' and pp.papel = p.papel), ''), ':', 1) in ('ver', 'editar', 'admin')
      from public.profiles p where p.org_id = p_org and p.app_user_id = p_app_user and p.ativo
    limit 1), false)
$$;

-- ---------------------------------------------------------------- senha provisória
-- (service role) guarda o hash da senha provisória e liga a troca obrigatória
create or replace function public.registrar_senha_temporaria(p_user uuid) returns void
language sql volatile security definer set search_path = public as $$
  update public.profiles
     set trocar_senha = true,
         senha_temp_hash = (select u.encrypted_password from auth.users u where u.id = p_user)
   where user_id = p_user
$$;

-- (usuário logado) depois de supabase.auth.updateUser({password}): só aceita se a senha mudou de verdade
create or replace function public.concluir_troca_senha() returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_p public.profiles; v_hash text;
begin
  select * into v_p from public.profiles where user_id = auth.uid();
  if not found then raise exception 'Acesso não configurado.' using errcode = '42501'; end if;
  if not v_p.trocar_senha then return true; end if;
  select u.encrypted_password into v_hash from auth.users u where u.id = auth.uid();
  if v_p.senha_temp_hash is not null and v_hash is not distinct from v_p.senha_temp_hash then
    raise exception 'A senha ainda é a provisória. Crie uma senha nova.' using errcode = '22023';
  end if;
  update public.profiles set trocar_senha = false, senha_temp_hash = null where user_id = auth.uid();
  if v_p.app_user_id is not null then
    update public.records set data = data || '{"senhaTemporaria": false}'::jsonb
     where records.id = 'users:' || v_p.app_user_id and org_id = v_p.org_id;
  end if;
  return true;
end $$;

-- profiles: cada um lê o próprio; dono/admin leem os da org. Escrita só pela service role (admin-invite)
-- ou pelo trigger de sincronia com `users`.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (user_id = auth.uid() or (org_id = public.my_org() and public.perm_rank('admin') >= 1));

-- orgs: membros leem a própria
drop policy if exists orgs_select on public.orgs;
create policy orgs_select on public.orgs for select to authenticated using (id = public.my_org());

-- tabelas de referência: leitura para logados (escrita só por SQL/service role)
drop policy if exists perm_padrao_select on public.perm_padrao;
create policy perm_padrao_select on public.perm_padrao for select to authenticated using (true);
drop policy if exists col_modules_select on public.col_modules;
create policy col_modules_select on public.col_modules for select to authenticated using (true);

-- privilégios: anon não lê nada; authenticated usa as políticas acima
revoke all on public.records, public.profiles, public.orgs, public.perm_padrao, public.col_modules, public.records_feed, public.receita_colecoes, public.receita_campos from anon;
-- anon pode CONSULTAR records, mas nenhuma política vale para anon → sempre 0 linhas. Isso evita erro no
-- carregamento do app antes do login (store.js lê records ao abrir a página, ainda sem sessão).
grant select on public.records to anon;
-- TRUNCATE/TRIGGER/REFERENCES não passam pelo RLS: ninguém do app recebe
revoke truncate, references, trigger on public.records, public.profiles, public.orgs, public.perm_padrao, public.col_modules,
  public.records_feed, public.receita_colecoes, public.receita_campos from anon, authenticated;
-- Edge Functions (service role): em projetos novos o Supabase não concede mais as tabelas de public automaticamente
grant select, insert, update, delete on public.records, public.profiles, public.orgs, public.perm_padrao, public.col_modules,
  public.records_feed, public.receita_colecoes, public.receita_campos to service_role;
grant select, insert, update, delete on public.records to authenticated;
grant select on public.profiles, public.orgs, public.perm_padrao, public.col_modules, public.records_feed, public.receita_colecoes, public.receita_campos to authenticated;
grant execute on function public.my_role(), public.my_org(), public.my_team(), public.my_app_user(), public.can_col(text, text),
  public.perm_rank(text), public.perm_escopo(text), public.perm_valor(text, text), public.my_client_ids(), public.no_escopo(text, jsonb),
  public.escopo_limitado(text), public.pode_settings(text) to authenticated;
grant execute on function public.ler_records(text, int), public.ler_record(text), public.gravar_record(text, jsonb), public.apagar_record(text),
  public.ve_receita(), public.concluir_troca_senha() to authenticated;
-- senha provisória: só o servidor (Edge Function admin-invite com a service role)
revoke execute on function public.registrar_senha_temporaria(uuid), public.usuario_ve_receita(text, text) from public, anon, authenticated;
grant execute on function public.registrar_senha_temporaria(uuid), public.usuario_ve_receita(text, text) to service_role;
-- as funções de gravação não valem para anon
revoke execute on function public.gravar_record(text, jsonb), public.apagar_record(text), public.concluir_troca_senha() from public, anon;
grant execute on function public.gravar_record(text, jsonb), public.apagar_record(text), public.concluir_troca_senha() to authenticated;

-- =====================================================================================
-- PAINEL DE VOO (item 17) — cache dos dados do Meta (Windsor) e limite de mudanças de orçamento.
-- Só o servidor (Edge Functions voo-dados / voo-acao, service role) lê e grava: RLS ligado e nenhuma política
-- para anon/authenticated. O app recebe os dados já filtrados pelo escopo e sem receita pela função voo-dados.
-- =====================================================================================
create table if not exists public.voo_cache (
  chave         text primary key,                    -- 'contas' | 'dia:aaaa-mm-dd' | 'trava'
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
create table if not exists public.voo_mudancas (
  id        bigint generated always as identity primary key,
  org_id    text,
  objeto_id text not null,                           -- id do conjunto (ou campanha CBO / anúncio) no Meta
  conta_id  text,
  tipo      text not null check (tipo in ('orcamento', 'pausar')),
  user_id   uuid,
  quando    timestamptz not null default now(),
  antes     numeric,
  depois    numeric,
  ok        boolean not null default true
);
create index if not exists voo_mudancas_obj_idx on public.voo_mudancas (objeto_id, quando desc);
alter table public.voo_cache enable row level security;
alter table public.voo_mudancas enable row level security;
revoke all on public.voo_cache, public.voo_mudancas from anon, authenticated;
grant select, insert, update, delete on public.voo_cache, public.voo_mudancas to service_role;

-- reserva atômica de uma mudança de orçamento: no máximo p_limite por objeto na última hora (regra do dono: 10/conjunto/hora).
-- Devolve o id da reserva ou -1 se o limite foi atingido. A função voo-acao marca ok=false se o Meta recusar.
create or replace function public.voo_reservar_mudanca(p_org text, p_objeto text, p_conta text, p_user uuid, p_antes numeric, p_depois numeric, p_limite int)
returns bigint language plpgsql security definer set search_path = public as $$
declare n int; v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('voo:' || p_objeto));
  select count(*) into n from public.voo_mudancas
   where objeto_id = p_objeto and tipo = 'orcamento' and ok and quando > now() - interval '1 hour';
  if n >= greatest(1, least(coalesce(p_limite, 10), 10)) then return -1; end if;
  insert into public.voo_mudancas (org_id, objeto_id, conta_id, tipo, user_id, antes, depois)
  values (p_org, p_objeto, p_conta, 'orcamento', p_user, p_antes, p_depois) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.voo_reservar_mudanca(text, text, text, uuid, numeric, numeric, int) from public, anon, authenticated;
grant execute on function public.voo_reservar_mudanca(text, text, text, uuid, numeric, numeric, int) to service_role;

-- =====================================================================================
-- BACKUPS E AUDITORIA (docs/BACKUP-E-RESTAURACAO.md) — seção acrescentada; não altera as de cima.
-- * Status dos backups e da auditoria em records 'backupStatus:<nativo|diario|externo|auditoria>' (card "Backups" do Cockpit).
--   Leitura: só Dono/Admin — a coleção não está em col_modules (can_col exige o módulo admin) E está em receita_colecoes
--   (quem não vê receita não recebe nem por ler_records/ler_record/realtime). Gravação: só o servidor (Edge Function
--   backup-diario / SQL da auditoria); ninguém do app grava nem apaga.
-- * Bucket privado `backups` do Storage: sem nenhuma política para anon/authenticated (só a service role acessa).
-- =====================================================================================
insert into public.receita_colecoes (col) values ('backupStatus') on conflict do nothing;

create or replace function public.tg_backup_status_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.e_servidor() then return coalesce(new, old); end if;
  if (tg_op = 'DELETE' and old.col = 'backupStatus') or (tg_op <> 'DELETE' and (new.col = 'backupStatus' or new.id like 'backupStatus:%'))
     or (tg_op = 'UPDATE' and old.col = 'backupStatus') then
    raise exception 'O status dos backups só é gravado pelo servidor.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.tg_backup_status_guard() from public, anon, authenticated;
drop trigger if exists records_backup_status_guard on public.records;
create trigger records_backup_status_guard before insert or update or delete on public.records
  for each row execute function public.tg_backup_status_guard();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 524288000, array['application/gzip', 'application/json'])
on conflict (id) do update set public = false;
