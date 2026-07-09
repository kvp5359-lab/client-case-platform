-- Для наборов из Google Drive файл источника связывается с папкой набора по
-- ID Drive-подпапки первого уровня (устойчиво к переименованию/дефисам/вложенности),
-- а не по имени. Пусто = файл лежит в корне папки набора.
alter table public.source_documents
  add column if not exists parent_drive_folder_id text;
