-- Обновления источников считаются/показываются ТОЛЬКО исполнителям проекта.
-- «Исполнитель проекта» = участник (project_participants) с ролью 'Исполнитель'
-- в массиве project_roles (text[]). Администраторам/клиентам/владельцу без этой
-- роли новые файлы не считаются и не показываются. Счётчик и отметка прочтения
-- остаются пер-пользователь (source_update_reads).

-- Хелпер: проекты воркспейса, где вызывающий — исполнитель.
create or replace function public.get_my_executor_project_ids(p_workspace_id uuid)
returns table(project_id uuid)
language sql stable security invoker set search_path to 'public'
as $$
  select distinct pp.project_id
  from project_participants pp
  join participants pa on pa.id = pp.participant_id
  join projects p on p.id = pp.project_id
    and p.is_deleted = false and p.workspace_id = p_workspace_id
  where pa.user_id = (select auth.uid())
    and 'Исполнитель' = any(pp.project_roles);
$$;
revoke all on function public.get_my_executor_project_ids(uuid) from public, anon;
grant execute on function public.get_my_executor_project_ids(uuid) to authenticated, service_role;

-- Непрочитанные обновления — только по проектам, где вызывающий исполнитель.
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
    and exists (
      select 1 from project_participants pp
      join participants pa on pa.id = pp.participant_id
      where pp.project_id = sd.project_id
        and pa.user_id = (select auth.uid())
        and 'Исполнитель' = any(pp.project_roles)
    )
  group by sd.project_id;
$$;
revoke all on function public.get_source_update_unread_projects(uuid) from public, anon;
grant execute on function public.get_source_update_unread_projects(uuid) to authenticated, service_role;

-- «Прочитать всё» — только по проектам, где вызывающий исполнитель.
create or replace function public.mark_all_source_updates_read(p_workspace_id uuid)
returns void language plpgsql security invoker set search_path to 'public'
as $$
begin
  insert into source_update_reads (user_id, project_id, last_seen_at)
  select (select auth.uid()), p.id, now()
  from projects p
  where p.workspace_id = p_workspace_id and p.is_deleted = false
    and exists (select 1 from source_documents sd where sd.project_id = p.id)
    and exists (
      select 1 from project_participants pp
      join participants pa on pa.id = pp.participant_id
      where pp.project_id = p.id and pa.user_id = (select auth.uid())
        and 'Исполнитель' = any(pp.project_roles)
    )
  on conflict (user_id, project_id) do update set last_seen_at = excluded.last_seen_at;
end;$$;
revoke all on function public.mark_all_source_updates_read(uuid) from public, anon;
grant execute on function public.mark_all_source_updates_read(uuid) to authenticated, service_role;
