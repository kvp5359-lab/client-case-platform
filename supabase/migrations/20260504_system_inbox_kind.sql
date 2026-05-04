-- Зона 4 рефакторинга: единое поле `system_inbox_kind` вместо двух
-- булевых флагов (`is_system_business_inbox`, `is_system_wazzup_inbox`).
-- Расширяемо: при добавлении новых каналов — просто новое значение,
-- а не ещё один boolean.

ALTER TABLE public.projects
  ADD COLUMN system_inbox_kind text;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_system_inbox_kind_check
  CHECK (system_inbox_kind IS NULL OR system_inbox_kind IN ('telegram_business', 'wazzup'));

UPDATE public.projects SET system_inbox_kind = 'telegram_business' WHERE is_system_business_inbox = true;
UPDATE public.projects SET system_inbox_kind = 'wazzup' WHERE is_system_wazzup_inbox = true;

CREATE UNIQUE INDEX uq_projects_system_inbox_kind_per_user
  ON public.projects(workspace_id, system_inbox_user_id, system_inbox_kind)
  WHERE system_inbox_kind IS NOT NULL;

DROP INDEX IF EXISTS uq_projects_system_inbox_per_user;
DROP INDEX IF EXISTS uq_projects_system_wazzup_inbox_per_user;

COMMENT ON COLUMN public.projects.system_inbox_kind IS
  'Тип системного инбокса (если это инбокс): telegram_business / wazzup. NULL = обычный проект.';
