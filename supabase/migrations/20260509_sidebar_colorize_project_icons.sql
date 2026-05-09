-- Флаг «Использовать цвет статуса для иконки проекта в сайдбаре».
-- Если true (по умолчанию) — иконка проекта в сайдбаре окрашивается
-- цветом его текущего статуса (statuses.color). Если false — иконка
-- остаётся в нейтральном сером, без привязки к цвету статуса.
ALTER TABLE public.workspace_sidebar_settings
  ADD COLUMN IF NOT EXISTS colorize_project_icons BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.workspace_sidebar_settings.colorize_project_icons IS
  'Если true — иконка проекта в сайдбаре окрашивается цветом его статуса. Если false — серым.';
