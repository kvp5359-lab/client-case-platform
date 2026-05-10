-- Переименование entity_type 'task' → 'thread' в board_lists и boards.global_filter.
--
-- Контекст: фильтры теперь общие между board_lists и item_lists. Для тредов
-- (project_threads) поддерживаем единое entity_type='thread' с дополнительной
-- фильтрацией по полю type ∈ {task, chat, email}. До этой миграции в досках
-- использовалось entity_type='task' — переименовываем для единства семантики.

BEGIN;

-- 1. Снимаем старый CHECK на board_lists.entity_type.
ALTER TABLE public.board_lists DROP CONSTRAINT IF EXISTS board_lists_entity_type_check;

-- 2. Переименовываем существующие 'task' → 'thread'.
UPDATE public.board_lists SET entity_type = 'thread' WHERE entity_type = 'task';

-- 3. Накладываем новый CHECK с обновлённым списком значений.
ALTER TABLE public.board_lists
  ADD CONSTRAINT board_lists_entity_type_check
  CHECK (entity_type = ANY (ARRAY['thread'::text, 'project'::text, 'inbox'::text]));

-- 4. В boards.global_filter переименовываем JSONB-ключ 'task' → 'thread'.
--    Используем jsonb_build_object, чтобы сохранить порядок ключей предсказуемо.
UPDATE public.boards
SET global_filter = jsonb_build_object(
  'thread', COALESCE(global_filter->'task', '{"logic":"and","rules":[]}'::jsonb),
  'project', COALESCE(global_filter->'project', '{"logic":"and","rules":[]}'::jsonb)
)
WHERE global_filter ? 'task' OR global_filter ? 'project';

COMMIT;
