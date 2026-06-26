-- Настраиваемая палитра акцентов воркспейса.
-- jsonb: { "<slug>": { "main": "#hex", "light": "#hex" }, ... } — только
-- переопределённые цвета. Пусто/нет ключа → дефолтный цвет (фолбэк в классах
-- через CSS-переменные с дефолтным hex). См. src/lib/accentPalette.ts.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS accent_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
