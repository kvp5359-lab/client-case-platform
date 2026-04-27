-- Настройки сайдбара воркспейса: видимость и порядок пунктов меню,
-- режимы бейджей для закреплённых досок.
--
-- Конфигурация на уровне воркспейса (не на пользователя). Если у пользователя
-- нет прав на конкретный раздел — фронт всё равно скроет его независимо от настройки.
--
-- Структура items (jsonb-массив):
--   [{ "key": "home"|"inbox"|"tasks"|"boards"|"knowledge_base"|"people"|"templates"|"digests"|"settings",
--      "visibility": "topbar"|"list"|"hidden",
--      "order": <int> }]
--
-- Структура board_badges (jsonb-объект):
--   { "<board_id>": "my_active_tasks"|"all_my_tasks"|"overdue_tasks"|"unread_messages"|"unread_threads"|"disabled" }

create table if not exists public.workspace_sidebar_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  items jsonb not null default '[
    {"key":"home","visibility":"topbar","order":0},
    {"key":"knowledge_base","visibility":"topbar","order":1},
    {"key":"people","visibility":"topbar","order":2},
    {"key":"templates","visibility":"topbar","order":3},
    {"key":"settings","visibility":"topbar","order":4},
    {"key":"inbox","visibility":"list","order":0},
    {"key":"tasks","visibility":"list","order":1},
    {"key":"boards","visibility":"list","order":2},
    {"key":"digests","visibility":"list","order":3}
  ]'::jsonb,
  board_badges jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.workspace_sidebar_settings enable row level security;

-- SELECT: любой активный участник воркспейса (нужно сайдбару при загрузке).
create policy "workspace_sidebar_settings_select"
  on public.workspace_sidebar_settings for select
  using (
    exists (
      select 1 from participants p
      where p.workspace_id = workspace_sidebar_settings.workspace_id
        and p.user_id = (select auth.uid())
        and p.is_deleted = false
    )
  );

-- INSERT/UPDATE/DELETE: только владелец воркспейса.
create policy "workspace_sidebar_settings_insert"
  on public.workspace_sidebar_settings for insert
  with check (is_workspace_owner((select auth.uid()), workspace_id));

create policy "workspace_sidebar_settings_update"
  on public.workspace_sidebar_settings for update
  using (is_workspace_owner((select auth.uid()), workspace_id))
  with check (is_workspace_owner((select auth.uid()), workspace_id));

create policy "workspace_sidebar_settings_delete"
  on public.workspace_sidebar_settings for delete
  using (is_workspace_owner((select auth.uid()), workspace_id));

comment on table public.workspace_sidebar_settings is 'Настройки сайдбара воркспейса: видимость/порядок пунктов меню и режимы бейджей закреплённых досок. Если строки нет — фронт использует дефолты из кода.';

-- ── RPC get_my_task_counts ───────────────────────────────────────────────────
-- Возвращает три счётчика «моих» задач для бейджей сайдбара одним запросом:
--   active   — на сегодня + просроченные (как get_my_urgent_tasks_count)
--   all      — все «мои» активные задачи (без фильтра по дате)
--   overdue  — только просроченные (deadline < сегодня)
-- «Мои» = я в task_assignees ИЛИ создатель задачи в статусе show_to_creator.

create or replace function public.get_my_task_counts(p_workspace_id uuid)
returns json
language sql
stable security definer
set search_path to 'public'
as $function$
  with my_tasks as (
    -- я назначен на задачу
    select t.id, t.deadline, false as is_creator_view
    from project_threads t
    join task_assignees ta on ta.thread_id = t.id
    join participants p on p.id = ta.participant_id
      and p.user_id = auth.uid()
      and p.is_deleted = false
    left join projects pr on pr.id = t.project_id
    left join statuses s on s.id = t.status_id
    where t.workspace_id = p_workspace_id
      and t.type = 'task'
      and t.is_deleted = false
      and (pr.id is null or pr.is_deleted = false)
      and coalesce(s.show_to_creator, false) = false
      and coalesce(s.is_final, false) = false

    union

    -- я создал задачу, статус show_to_creator (вернулась мне на доработку)
    select t.id, t.deadline, true as is_creator_view
    from project_threads t
    join statuses s on s.id = t.status_id and s.show_to_creator = true
    left join projects pr on pr.id = t.project_id
    where t.workspace_id = p_workspace_id
      and t.type = 'task'
      and t.is_deleted = false
      and (pr.id is null or pr.is_deleted = false)
      and t.created_by = auth.uid()
  )
  select json_build_object(
    'active', (
      select count(*) from my_tasks
      where deadline is not null
        and (deadline at time zone 'Europe/Moscow')::date <= current_date
    ),
    'all', (select count(*) from my_tasks),
    'overdue', (
      select count(*) from my_tasks
      where deadline is not null
        and (deadline at time zone 'Europe/Moscow')::date < current_date
    )
  );
$function$;

comment on function public.get_my_task_counts(uuid) is 'Возвращает три счётчика моих задач (active/all/overdue) одним запросом для бейджей сайдбара.';
