-- Настройка отображения сроков на уровне воркспейса.
-- Две независимые опции: формат «близкой» даты (с относительным ярлыком:
-- вчера/сегодня/завтра/послезавтра) и формат «дальней» даты (без ярлыка).
-- Дефолты сохраняют текущее поведение списков задач.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS deadline_near_format text NOT NULL DEFAULT 'label',
  ADD COLUMN IF NOT EXISTS deadline_far_format text NOT NULL DEFAULT 'text';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_deadline_near_format_check'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_deadline_near_format_check
      CHECK (deadline_near_format IN ('label', 'label_numeric', 'label_text'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_deadline_far_format_check'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_deadline_far_format_check
      CHECK (deadline_far_format IN ('numeric', 'text', 'text_weekday'));
  END IF;
END $$;
