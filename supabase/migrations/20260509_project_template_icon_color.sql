-- Цвет иконки шаблона проекта в сайдбаре.
--
-- Два режима:
--   'status' — иконка окрашивается цветом текущего статуса проекта
--              (statuses.color). Если у проекта нет статуса — fallback в чёрный.
--   'fixed'  — все проекты этого шаблона рисуются в одном цвете icon_color.
--
-- Дефолт 'status' сохраняет текущее поведение для существующих шаблонов.
ALTER TABLE public.project_templates
  ADD COLUMN IF NOT EXISTS icon_color_mode TEXT NOT NULL DEFAULT 'status'
    CHECK (icon_color_mode IN ('status', 'fixed')),
  ADD COLUMN IF NOT EXISTS icon_color TEXT NOT NULL DEFAULT '#6B7280';

COMMENT ON COLUMN public.project_templates.icon_color_mode IS
  'Режим окраски иконки в сайдбаре: status (по статусу проекта) | fixed (всегда icon_color).';
COMMENT ON COLUMN public.project_templates.icon_color IS
  'Фиксированный HEX-цвет иконки для режима fixed. Игнорируется в режиме status.';

-- Старая глобальная настройка воркспейса больше не нужна — управление
-- перенесено на уровень шаблона проекта.
ALTER TABLE public.workspace_sidebar_settings
  DROP COLUMN IF EXISTS colorize_project_icons;
