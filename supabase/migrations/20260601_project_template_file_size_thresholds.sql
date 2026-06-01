-- Пороги размера файла для подсветки тегов размера в наборах документов.
-- Заданы на уровне шаблона проекта. NULL → подсветка по этому порогу выключена.
-- Единицы — мегабайты (МБ).

ALTER TABLE public.project_templates
  ADD COLUMN IF NOT EXISTS file_size_warn_mb numeric,
  ADD COLUMN IF NOT EXISTS file_size_danger_mb numeric;

COMMENT ON COLUMN public.project_templates.file_size_warn_mb
  IS 'Порог размера файла (МБ) для жёлтой подсветки тега размера. NULL — выключено.';
COMMENT ON COLUMN public.project_templates.file_size_danger_mb
  IS 'Порог размера файла (МБ) для красной подсветки тега размера. NULL — выключено.';
