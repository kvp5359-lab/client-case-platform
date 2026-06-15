-- «Название по умолчанию» у типа проекта (CRM): префикс имени нового проекта.
--
-- При создании проекта из этого шаблона (особенно лида из треда) префикс
-- подставляется в начало имени; пользователь может изменить дальше.
ALTER TABLE public.project_templates
  ADD COLUMN IF NOT EXISTS default_name_prefix text;

COMMENT ON COLUMN public.project_templates.default_name_prefix IS
  'Префикс, подставляемый в начало имени нового проекта этого типа (напр. "Лид:"). Пользователь может изменить имя после.';
