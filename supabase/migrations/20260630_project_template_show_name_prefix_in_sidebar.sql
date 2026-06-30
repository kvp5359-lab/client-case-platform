-- Префикс названия проекта: опциональное отображение в боковом сайдбаре.
-- Раньше default_name_prefix вшивался в projects.name при создании проекта.
-- Теперь префикс — свойство шаблона; при включённом флаге сайдбар рисует
-- «<префикс> <имя проекта>», не меняя само имя.
ALTER TABLE public.project_templates
  ADD COLUMN IF NOT EXISTS show_name_prefix_in_sidebar boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.project_templates.show_name_prefix_in_sidebar IS
  'Если true — в боковом сайдбаре имя проекта этого типа рендерится с префиксом default_name_prefix впереди. Префикс больше НЕ вшивается в projects.name при создании.';
