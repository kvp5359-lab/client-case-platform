-- Обновления источников: считаются/показываются исполнителям И администраторам
-- проекта (project_roles содержит 'Исполнитель' ИЛИ 'Администратор'). Клиенты,
-- участники и владелец без такой роли — по-прежнему не видят. Условие — через
-- пересечение массивов (`&&`).

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
    and pp.project_roles && array['Исполнитель','Администратор']::text[];
$$;

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
        and pp.project_roles && array['Исполнитель','Администратор']::text[]
    )
  group by sd.project_id;
$$;

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
        and pp.project_roles && array['Исполнитель','Администратор']::text[]
    )
  on conflict (user_id, project_id) do update set last_seen_at = excluded.last_seen_at;
end;$$;
