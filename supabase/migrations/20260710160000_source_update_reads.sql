-- Отслеживание «прочитанности» обновлений источников по пользователю и проекту.
-- Бейдж раздела «Обновления источников» = число ДОСТУПНЫХ проектов, где есть
-- файл, появившийся позже отметки прочтения этого проекта. Считаем проекты,
-- не документы (по просьбе владельца). «Новый файл» = source_documents.created_at
-- (стабильная метка первого появления; upsert синка её не трогает).

-- Точка отсчёта: всё, что появилось ДО запуска фичи, считается прочитанным.
create table if not exists public.source_updates_config (
  id       integer primary key default 1 check (id = 1),
  epoch_at timestamptz not null default now()
);
insert into public.source_updates_config (id) values (1) on conflict (id) do nothing;
grant select on public.source_updates_config to authenticated, service_role;
-- RLS: epoch не секрет, но public-таблица без RLS = security-warning. Читать
-- может любой залогиненный (RPC get_source_update_unread_projects — INVOKER,
-- цепляет config через cross join, без политики вернул бы пусто).
alter table public.source_updates_config enable row level security;
drop policy if exists suc_select_all on public.source_updates_config;
create policy suc_select_all on public.source_updates_config for select to authenticated using (true);

-- Отметка последнего просмотра обновлений проекта пользователем.
create table if not exists public.source_update_reads (
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index if not exists idx_source_update_reads_user on public.source_update_reads(user_id);

alter table public.source_update_reads enable row level security;
drop policy if exists sur_select_own on public.source_update_reads;
create policy sur_select_own on public.source_update_reads for select
  using (user_id = (select auth.uid()));
drop policy if exists sur_insert_own on public.source_update_reads;
create policy sur_insert_own on public.source_update_reads for insert
  with check (user_id = (select auth.uid()));
drop policy if exists sur_update_own on public.source_update_reads;
create policy sur_update_own on public.source_update_reads for update
  using (user_id = (select auth.uid()));
grant select, insert, update on public.source_update_reads to authenticated, service_role;

-- Проекты воркспейса с непрочитанными обновлениями для вызывающего пользователя.
-- SECURITY INVOKER: опирается на RLS source_documents (виден участнику воркспейса)
-- + RLS source_update_reads (только своя строка). Доступ по ролям (какие проекты
-- реально видит юзер) досекается на клиенте пересечением с accessible-проектами —
-- как и лента страницы. unread_count — число новых файлов (для строки проекта),
-- бейдж считает проекты (число строк).
create or replace function public.get_source_update_unread_projects(p_workspace_id uuid)
returns table(project_id uuid, unread_count integer)
language sql stable security invoker set search_path to 'public'
as $$
  select sd.project_id, count(*)::int
  from source_documents sd
  join projects p on p.id = sd.project_id and p.is_deleted = false
  left join source_update_reads r
    on r.user_id = (select auth.uid()) and r.project_id = sd.project_id
  cross join source_updates_config c
  where sd.workspace_id = p_workspace_id
    and sd.is_hidden = false
    and c.id = 1
    and sd.created_at > coalesce(r.last_seen_at, c.epoch_at)
  group by sd.project_id;
$$;
revoke all on function public.get_source_update_unread_projects(uuid) from public, anon;
grant execute on function public.get_source_update_unread_projects(uuid) to authenticated, service_role;

-- Отметить прочитанными обновления одного проекта.
-- SECURITY INVOKER: пишет только строку самого пользователя (user_id = auth.uid()),
-- RLS-политики own-rows это уже разрешают — DEFINER не нужен.
create or replace function public.mark_source_updates_read(p_project_id uuid)
returns void
language plpgsql security invoker set search_path to 'public'
as $$
begin
  insert into source_update_reads (user_id, project_id, last_seen_at)
  values ((select auth.uid()), p_project_id, now())
  on conflict (user_id, project_id) do update set last_seen_at = excluded.last_seen_at;
end;
$$;
revoke all on function public.mark_source_updates_read(uuid) from public, anon;
grant execute on function public.mark_source_updates_read(uuid) to authenticated, service_role;

-- Отметить прочитанными обновления всех проектов воркспейса.
-- SECURITY INVOKER: и запись (own-rows), и чтение projects/source_documents идут
-- под RLS вызывающего → отмечаем только реально доступные ему проекты.
create or replace function public.mark_all_source_updates_read(p_workspace_id uuid)
returns void
language plpgsql security invoker set search_path to 'public'
as $$
begin
  insert into source_update_reads (user_id, project_id, last_seen_at)
  select (select auth.uid()), p.id, now()
  from projects p
  where p.workspace_id = p_workspace_id and p.is_deleted = false
    and exists (select 1 from source_documents sd where sd.project_id = p.id)
  on conflict (user_id, project_id) do update set last_seen_at = excluded.last_seen_at;
end;
$$;
revoke all on function public.mark_all_source_updates_read(uuid) from public, anon;
grant execute on function public.mark_all_source_updates_read(uuid) to authenticated, service_role;
