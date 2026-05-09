-- Иконка типа проекта — отображается в сайдбаре для всех проектов этого типа.
-- Цвет иконки в UI берётся динамически от статуса проекта (statuses.color),
-- поэтому в шаблоне храним только id иконки. Дефолт 'folder-open' соответствует
-- текущей жёстко закодированной иконке в ProjectListItem.
ALTER TABLE public.project_templates
  ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'folder-open';

COMMENT ON COLUMN public.project_templates.icon IS
  'ID иконки из набора PROJECT_ICONS (src/components/ui/project-icons.tsx). Отображается в сайдбаре для всех проектов этого шаблона. Цвет берётся от статуса проекта.';
