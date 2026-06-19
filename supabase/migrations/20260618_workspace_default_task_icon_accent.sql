-- Дефолтные иконка и цвет для новых задач на уровне воркспейса.
-- Применяются при быстром добавлении задач (QuickAddModal). Если не заданы —
-- остаётся прежний жёсткий дефолт project_threads (message-square / blue).
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS default_task_icon text NOT NULL DEFAULT 'message-square',
  ADD COLUMN IF NOT EXISTS default_task_accent text NOT NULL DEFAULT 'blue';
