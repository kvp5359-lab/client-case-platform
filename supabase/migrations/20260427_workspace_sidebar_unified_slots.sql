-- Унификация настроек сайдбара: единая колонка `slots` вместо `items` + `pinned_boards`.
--
-- Структура slots (jsonb-массив):
--   [{ "id": "nav:<key>" | "board:<uuid>",
--      "type": "nav" | "board",
--      "placement": "topbar" | "list",
--      "order": <int>,           -- позиция внутри своей зоны (topbar/list)
--      "badge_mode": "disabled"|"my_active_tasks"|"all_my_tasks"|"overdue_tasks"|"unread_messages"|"unread_threads" }]
--
-- Элементы, отсутствующие в массиве — считаются «доступными» (скрытыми из сайдбара).
-- Раньше скрытые пункты лежали в items с visibility='hidden' — теперь они просто отсутствуют.

alter table public.workspace_sidebar_settings
  add column if not exists slots jsonb not null default '[]'::jsonb;

-- Хелпер для миграции данных. Дропаем в конце.
create or replace function public._build_sidebar_slots(p_items jsonb, p_boards jsonb)
returns jsonb
language sql
immutable
as $$
  with list_base as (
    select coalesce(max((it.value->>'order')::int), -1) + 1 as base
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
    where it.value->>'visibility' = 'list'
  ),
  nav as (
    select
      jsonb_build_object(
        'id', 'nav:' || (it.value->>'key'),
        'type', 'nav',
        'placement', it.value->>'visibility',
        'order', (it.value->>'order')::int,
        'badge_mode', case it.value->>'key'
          when 'inbox' then 'unread_threads'
          when 'tasks' then 'my_active_tasks'
          else 'disabled'
        end
      ) as slot,
      it.value->>'visibility' as plc,
      (it.value->>'order')::int as ord
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
    where it.value->>'visibility' in ('topbar','list')
  ),
  brd as (
    select
      jsonb_build_object(
        'id', 'board:' || (b.value->>'board_id'),
        'type', 'board',
        'placement', 'list',
        'order', (select base from list_base) + (b.value->>'order_index')::int,
        'badge_mode', coalesce(b.value->>'badge_mode', 'disabled')
      ) as slot,
      'list'::text as plc,
      (select base from list_base) + (b.value->>'order_index')::int as ord
    from jsonb_array_elements(coalesce(p_boards, '[]'::jsonb)) b
  ),
  combined as (
    select * from nav
    union all
    select * from brd
  )
  select coalesce(
    jsonb_agg(slot order by case plc when 'topbar' then 0 else 1 end, ord),
    '[]'::jsonb
  )
  from combined;
$$;

update public.workspace_sidebar_settings
set slots = public._build_sidebar_slots(items, pinned_boards)
where slots = '[]'::jsonb;

drop function public._build_sidebar_slots(jsonb, jsonb);

alter table public.workspace_sidebar_settings drop column if exists items;
alter table public.workspace_sidebar_settings drop column if exists pinned_boards;

-- Новый дефолт: тот же набор пунктов, что и раньше, но в новом формате.
alter table public.workspace_sidebar_settings
  alter column slots set default '[
    {"id":"nav:home","type":"nav","placement":"topbar","order":0,"badge_mode":"disabled"},
    {"id":"nav:knowledge_base","type":"nav","placement":"topbar","order":1,"badge_mode":"disabled"},
    {"id":"nav:people","type":"nav","placement":"topbar","order":2,"badge_mode":"disabled"},
    {"id":"nav:templates","type":"nav","placement":"topbar","order":3,"badge_mode":"disabled"},
    {"id":"nav:settings","type":"nav","placement":"topbar","order":4,"badge_mode":"disabled"},
    {"id":"nav:inbox","type":"nav","placement":"list","order":0,"badge_mode":"unread_threads"},
    {"id":"nav:tasks","type":"nav","placement":"list","order":1,"badge_mode":"my_active_tasks"},
    {"id":"nav:boards","type":"nav","placement":"list","order":2,"badge_mode":"disabled"},
    {"id":"nav:digests","type":"nav","placement":"list","order":3,"badge_mode":"disabled"}
  ]'::jsonb;

comment on column public.workspace_sidebar_settings.slots is 'Единый список размещённых элементов сайдбара. Каждый — пункт меню (nav:<key>) или доска (board:<uuid>), с placement (topbar/list), order, badge_mode. Элементы, которых нет в массиве, считаются скрытыми (доступными для добавления).';
