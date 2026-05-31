-- Шаблонная таблица плана: разрешаем block_type='heading'.
--
-- Живая таблица project_plan_blocks уже получила 'heading'
-- (20260530_plan_heading_block.sql), а шаблонная project_template_plan_blocks
-- осталась с ('text','task','slot'). Теперь заголовки/текст задаются и в
-- шаблоне проекта (секция «Задачи»), поэтому добавляем 'heading' и сюда.

alter table public.project_template_plan_blocks
  drop constraint if exists project_template_plan_blocks_block_type_check;
alter table public.project_template_plan_blocks
  add constraint project_template_plan_blocks_block_type_check
  check (block_type = any (array['text', 'heading', 'task', 'slot']));

alter table public.project_template_plan_blocks
  drop constraint if exists project_template_plan_blocks_shape;
alter table public.project_template_plan_blocks
  add constraint project_template_plan_blocks_shape check (
    (block_type in ('text', 'heading') and thread_template_id is null and slot_template_id is null)
    or (block_type = 'task' and thread_template_id is not null and slot_template_id is null)
    or (block_type = 'slot' and slot_template_id is not null and thread_template_id is null)
  );
