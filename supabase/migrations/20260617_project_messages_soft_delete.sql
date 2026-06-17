-- Soft-delete для сообщений: вместо физического стирания при удалении в Telegram
-- (MTProto UpdateDeleteMessages) помечаем строку удалённой, сохраняя содержимое.
-- В ленте такое сообщение остаётся плашкой «Сообщение удалено» с раскрытием текста.
ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
