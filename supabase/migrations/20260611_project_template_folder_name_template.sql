-- Настраиваемый шаблон имени создаваемой папки проекта в Google Drive.
-- folder_name_template: строка с переменными {project_name}, {date}, {contact_name} и т.д.
--   NULL/пусто → старое поведение (буквально «БП_<дата>_<название>_<описание>»).
-- folder_name_replace_spaces: заменять ли пробелы в итоговом имени на «_».
-- Применено в проде 2026-06-11; файл фиксирует изменение в истории схемы.
ALTER TABLE public.project_templates
  ADD COLUMN IF NOT EXISTS folder_name_template text,
  ADD COLUMN IF NOT EXISTS folder_name_replace_spaces boolean NOT NULL DEFAULT true;
