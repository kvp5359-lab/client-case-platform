-- Закрепления досок в сайдбаре — на уровне воркспейса (а не пользователя).
-- Заменяем `board_badges` (объект board_id → mode) на `pinned_boards` (массив {board_id, badge_mode, order_index}).
-- (Колонка `pinned_boards` дальше унифицируется в `slots` миграцией 20260427_workspace_sidebar_unified_slots.sql.)

alter table public.workspace_sidebar_settings
  add column if not exists pinned_boards jsonb not null default '[]'::jsonb;

update public.workspace_sidebar_settings ws
set pinned_boards = sub.arr
from (
  select x.workspace_id,
         coalesce(jsonb_agg(jsonb_build_object(
           'board_id', x.key,
           'badge_mode', x.value,
           'order_index', x.rn - 1
         ) order by x.rn), '[]'::jsonb) as arr
  from (
    select w.workspace_id, kv.key, kv.value,
           row_number() over (partition by w.workspace_id order by kv.key) as rn
    from public.workspace_sidebar_settings w,
         lateral jsonb_each_text(w.board_badges) as kv
  ) x
  group by x.workspace_id
) sub
where ws.workspace_id = sub.workspace_id
  and ws.board_badges <> '{}'::jsonb;

alter table public.workspace_sidebar_settings drop column if exists board_badges;

comment on column public.workspace_sidebar_settings.pinned_boards is 'Закреплённые в сайдбаре доски (на уровне воркспейса): массив {board_id, badge_mode, order_index}.';
