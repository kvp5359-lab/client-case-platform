-- Кто подключил источник (папку Google Drive). Нужно серверной авто-проверке
-- (sync-source-documents), чтобы выбрать чей токен использовать для сканирования
-- папки без открытого браузера. Проставляется при добавлении источника; для
-- существующих остаётся NULL — тогда авто-проверка перебирает токены сотрудников
-- воркспейса как фолбэк.
alter table public.document_sources
  add column if not exists connected_by_user_id uuid references auth.users(id) on delete set null;
