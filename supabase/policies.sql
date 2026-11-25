-- =====================================================================================
-- Agência OS — segurança (RLS) do Supabase. Rode DEPOIS de schema.sql. Idempotente.
--
-- Ideia: a mesma matriz de permissões do app (PLAN §5, editável em Administração › Permissões e
-- guardada em records 'settings:perms') decide o que cada papel lê e grava no banco.
--   1) public.perm_padrao   = matriz padrão (igual a MATRIZ_PADRAO de src/core/perms.js)
--   2) settings:perms       = diferenças salvas pelo app (sobrepõem o padrão)
--   3) public.col_modules   = de qual(is) módulo(s) cada coleção depende (mapa abaixo)
--   4) can_col(col, ação)   = o papel tem o nível exigido em algum módulo da coleção
--   5) escopo de clientes   = gestor_trafego, cs e produção só veem registros dos SEUS clientes
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
  ('clientes',     array['admin','editar','editar','editar:seus','editar:seus','ver:seus','ver','ver','ver']),
  ('operacao',     array['admin','editar','editar','editar','editar','editar:seus','','','ver']),
  ('equipe',       array['admin','editar','ver:proprio','ver:proprio','ver:proprio','ver:proprio','ver','ver:proprio','']),
  ('torre',        array['admin','editar','editar','ver','ver','','','','ver']),
  ('torre_voo',    array['admin','editar','editar','editar:seus','ver','','','','ver']),
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
     and (public.my_role() in ('gestor_trafego','cs','producao') or public.perm_escopo('clientes') = 'seus')
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

-- ---------------------------------------------------------------- RLS
alter table public.records     enable row level security;
alter table public.profiles    enable row level security;
alter table public.orgs        enable row level security;
alter table public.perm_padrao enable row level security;
alter table public.col_modules enable row level security;
alter table public.records     force row level security;

-- records: leitura
drop policy if exists records_select on public.records;
create policy records_select on public.records for select to authenticated
using (
  org_id = public.my_org()
  and case col
    -- destinatário lê; o remetente também enxerga o que ELE enviou (exigência do upsert do front:
    -- INSERT ... ON CONFLICT DO UPDATE só passa se a nova linha também for visível a quem grava)
    when 'notifications' then data->>'para' = public.my_app_user() or (data->>'de' = public.my_app_user() and data->>'de' is not null)
    when 'users'    then true
    when 'team'     then true
    when 'settings' then id not like 'settings:notif:%' or id = 'settings:notif:' || public.my_app_user() or public.perm_rank('admin') >= 1
    -- auditoria: Administração ou Equipe (escopo todos) leem tudo; os demais só o que eles mesmos fizeram
    when 'activity' then data->>'quem' = public.my_app_user() or public.perm_rank('admin') >= 1
                         or (public.perm_rank('equipe') >= 1 and public.perm_escopo('equipe') = 'todos')
    when 'comments' then coalesce(data->>'refCol', '') = '' or (public.can_col(data->>'refCol', 'select')
                         and (data->>'refCol' <> 'clients' or not public.escopo_limitado('clients') or data->>'refId' = any (public.my_client_ids())))
    else public.can_col(col, 'select') and public.no_escopo(col, data)
  end
);

-- records: inserção
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated
with check (
  org_id = public.my_org()
  and case col
    -- remetente = eu (e posso editar Notificações), ou é minha própria notificação: o upsert do front
    -- (INSERT ... ON CONFLICT DO UPDATE) checa esta política também quando só marca 'lida'
    when 'notifications' then (coalesce(data->>'de', public.my_app_user()) = public.my_app_user() and public.perm_rank('notificacoes') >= 2)
                              or data->>'para' = public.my_app_user()
    when 'activity'      then true                         -- conteúdo validado no trigger
    when 'comments'      then data->>'autor' = public.my_app_user() and public.perm_rank('notificacoes') >= 2
    when 'settings'      then public.pode_settings(id)
    -- o próprio registro (o login grava ultimoAcesso via upsert); papel/ativo protegidos pelo trigger
    when 'users'         then public.can_col('users', 'insert') or data->>'id' = public.my_app_user()
    else public.can_col(col, 'insert') and public.no_escopo(col, data)
  end
);

-- records: atualização (o upsert do front cai aqui quando o id já existe)
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated
using (
  org_id = public.my_org()
  and case col
    when 'notifications' then data->>'para' = public.my_app_user()
    when 'activity'      then false
    when 'comments'      then data->>'autor' = public.my_app_user()
    when 'settings'      then public.pode_settings(id)
    when 'users'         then public.can_col('users', 'update') or data->>'id' = public.my_app_user()
    else public.can_col(col, 'update') and public.no_escopo(col, data)
  end
)
with check (
  org_id = public.my_org()
  and case col
    when 'notifications' then data->>'para' = public.my_app_user()
    when 'activity'      then false
    when 'comments'      then data->>'autor' = public.my_app_user()
    when 'settings'      then public.pode_settings(id)
    when 'users'         then public.can_col('users', 'update') or data->>'id' = public.my_app_user()
    else public.can_col(col, 'update') and public.no_escopo(col, data)
  end
);

-- records: exclusão
drop policy if exists records_delete on public.records;
create policy records_delete on public.records for delete to authenticated
using (
  org_id = public.my_org()
  and case col
    when 'notifications' then data->>'para' = public.my_app_user() or public.perm_rank('admin') >= 2
    when 'activity'      then false
    when 'comments'      then data->>'autor' = public.my_app_user()
    when 'settings'      then public.pode_settings(id)
    else public.can_col(col, 'delete') and public.no_escopo(col, data)
  end
);

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
revoke all on public.records, public.profiles, public.orgs, public.perm_padrao, public.col_modules from anon;
-- anon pode CONSULTAR records, mas nenhuma política vale para anon → sempre 0 linhas. Isso evita erro no
-- carregamento do app antes do login (store.js lê records ao abrir a página, ainda sem sessão).
grant select on public.records to anon;
grant select, insert, update, delete on public.records to authenticated;
grant select on public.profiles, public.orgs, public.perm_padrao, public.col_modules to authenticated;
grant execute on function public.my_role(), public.my_org(), public.my_team(), public.my_app_user(), public.can_col(text, text),
  public.perm_rank(text), public.perm_escopo(text), public.perm_valor(text, text), public.my_client_ids(), public.no_escopo(text, jsonb),
  public.escopo_limitado(text), public.pode_settings(text) to authenticated;
