-- Храним массив всех telegram message_id, связанных с одним project_messages.
-- Одно сообщение в ЛК = несколько сообщений в Telegram (текст + каждый файл).
-- Раньше сохранялся только один id, и реакции на остальные tg-сообщения
-- не находили исходник и падали в fallback (создавали паразитные сообщения).

ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS telegram_message_ids bigint[] NOT NULL DEFAULT '{}';

-- Бэкфилл: у сообщений, где уже есть один telegram_message_id — положить его в массив.
UPDATE public.project_messages
SET telegram_message_ids = ARRAY[telegram_message_id]
WHERE telegram_message_id IS NOT NULL
  AND (telegram_message_ids = '{}' OR telegram_message_ids IS NULL);

-- GIN-индекс для быстрого поиска по `@>` / `ANY` в webhook.
CREATE INDEX IF NOT EXISTS idx_project_messages_telegram_message_ids
  ON public.project_messages
  USING GIN (telegram_message_ids);
