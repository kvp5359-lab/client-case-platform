-- Модуль «План» (сквозная модель): упрощение текстовых блоков.
--
-- Вместо rich-text (Tiptap) — два простых типа: 'heading' (заголовок-секция,
-- одна строка) и 'text' (многострочный простой текст, сворачиваемый).
-- Добавляем 'heading' в допустимые block_type. Форма как у 'text' — без ссылок.

alter table public.project_plan_blocks
  drop constraint if exists project_plan_blocks_block_type_check;
alter table public.project_plan_blocks
  add constraint project_plan_blocks_block_type_check
  check (block_type = any (array['text', 'heading', 'task', 'slot']));

alter table public.project_plan_blocks
  drop constraint if exists project_plan_blocks_shape;
alter table public.project_plan_blocks
  add constraint project_plan_blocks_shape check (
    (block_type in ('text', 'heading') and thread_id is null and folder_slot_id is null)
    or (block_type = 'task' and thread_id is not null and folder_slot_id is null)
    or (block_type = 'slot' and folder_slot_id is not null and thread_id is null)
  );
