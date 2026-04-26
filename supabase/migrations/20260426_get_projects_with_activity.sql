-- RPC: список проектов воркспейса с активностью за период.
-- Используется страницей "Сводки" в воркспейсе для пакетного прогона.
-- Активность = есть хоть одна запись в audit_logs / project_messages / comments
-- за указанный период (даты включительно, тайм-зона учитывается клиентом — мы получаем
-- готовые границы как timestamptz).

create or replace function public.get_projects_with_activity(
  p_workspace_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns table (
  project_id uuid,
  project_name text,
  events_count bigint,
  has_digest boolean
)
language sql
security definer
set search_path = public
as $$
  with activity as (
    select project_id, count(*) as cnt
    from (
      select project_id from audit_logs
        where project_id is not null and created_at >= p_period_start and created_at < p_period_end
      union all
      select project_id from project_messages
        where created_at >= p_period_start and created_at < p_period_end
      union all
      select project_id from comments
        where created_at >= p_period_start and created_at < p_period_end
    ) sources
    group by project_id
  ),
  digests as (
    select pd.project_id
    from project_digests pd
    where pd.workspace_id = p_workspace_id
      and pd.period_start = (p_period_start at time zone 'Europe/Madrid')::date
      and pd.period_end = ((p_period_end - interval '1 second') at time zone 'Europe/Madrid')::date
  )
  select
    p.id as project_id,
    p.name as project_name,
    a.cnt as events_count,
    (d.project_id is not null) as has_digest
  from projects p
  join activity a on a.project_id = p.id
  left join digests d on d.project_id = p.id
  where p.workspace_id = p_workspace_id
    and coalesce(p.is_deleted, false) = false
    -- доступ: участник проекта или has_workspace_permission view_all_projects
    and (
      exists (
        select 1 from project_participants pp
        join participants pa on pa.id = pp.participant_id
        where pp.project_id = p.id and pa.user_id = auth.uid() and pa.is_deleted = false
      )
      or has_workspace_permission(auth.uid(), p_workspace_id, 'view_all_projects')
    )
  order by a.cnt desc, p.name asc;
$$;

comment on function public.get_projects_with_activity(uuid, timestamptz, timestamptz)
  is 'Список проектов воркспейса с активностью за период. Используется для пакетной генерации сводок в Дневнике.';

grant execute on function public.get_projects_with_activity(uuid, timestamptz, timestamptz) to authenticated;
