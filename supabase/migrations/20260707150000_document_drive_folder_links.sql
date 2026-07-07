-- Ссылки на созданные на Google Drive папки: набор документов + его подпапки.
-- Заполняются мастером «Создать папки на Google Drive» (useDriveFoldersWizard)
-- после успешного создания структуры. Используются в шеринге ссылок клиенту
-- (см. get_project_shareable_resources в 20260707140000_client_share_links.sql).
alter table public.document_kits add column if not exists drive_folder_id text;
alter table public.folders add column if not exists drive_folder_id text;
