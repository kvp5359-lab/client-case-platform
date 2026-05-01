-- Добавить тип поля "directory_ref" — ссылка на запись пользовательского справочника
-- В options jsonb хранится { "ref_directory_id": "<custom_directories.id>" }.
-- В значениях полей (form_kit_field_values, project_field_values и т.п.)
-- хранится UUID записи справочника (custom_directory_entries.id).

ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'directory_ref';
