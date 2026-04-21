-- Диагностическая колонка: edge function telegram-send-message пишет сюда
-- причину неудачной доставки (ответ Telegram API, "no attachments found",
-- и т.п.). Позволяет находить корневую причину через простой SQL-запрос:
--   SELECT id, telegram_error_detail FROM project_messages
--   WHERE telegram_attachments_delivered = false;

ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS telegram_error_detail text;
