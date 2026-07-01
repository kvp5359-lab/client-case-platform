-- Per-file внешние id вложений — для точечного удаления ОДНОГО файла из
-- мультифайлового сообщения в подключённом канале.
--
-- До этого внешний id хранился только на сообщении (project_messages), поэтому
-- удалить один файл из альбома в канале было нельзя. Теперь при отправке каждый
-- файл запоминает свой адрес:
--   telegram_message_id — для TG-группы, MTProto и Business (id сообщения Telegram);
--   wazzup_message_id   — для Wazzup (id сообщения Wazzup, каждый файл — отдельное).
--
-- Аддитивно и обратимо: колонки nullable, у старых вложений остаются NULL
-- (для них точечное удаление в канале недоступно — только из сервиса).

ALTER TABLE public.message_attachments
  ADD COLUMN IF NOT EXISTS telegram_message_id bigint,
  ADD COLUMN IF NOT EXISTS wazzup_message_id text;

COMMENT ON COLUMN public.message_attachments.telegram_message_id IS
  'Внешний id этого файла в Telegram (группа/MTProto/Business) — для точечного удаления файла в канале. NULL у файлов, отправленных до 2026-07-01.';
COMMENT ON COLUMN public.message_attachments.wazzup_message_id IS
  'Внешний id этого файла в Wazzup — для точечного удаления файла в канале. NULL у файлов до 2026-07-01.';
