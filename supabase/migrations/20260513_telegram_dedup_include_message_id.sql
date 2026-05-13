-- Расширить ключ дедупа Telegram-сообщений: добавить telegram_message_id.
--
-- Старый индекс (chat_id, sender_user_id, message_date) с точностью до
-- секунды молча отбрасывал:
--   * альбомы из нескольких файлов (все приходят с одинаковым date),
--   * текстовые сообщения, отправленные подряд в одну секунду.
--
-- Telegram присваивает каждому сообщению (в том числе каждому файлу
-- внутри альбома) уникальный telegram_message_id внутри чата —
-- добавляем его в ключ.
--
-- Cross-bot дедуп (когда секретарь и личный бот сидят в одном групповом
-- чате и видят одно физическое сообщение): в групповом чате Telegram
-- присваивает одинаковый message_id обоим webhook'ам, поэтому конфликт
-- 23505 продолжает срабатывать и enrich-ветка в
-- _shared/syncTelegramIncomingMessage.ts отрабатывает как раньше.

DROP INDEX IF EXISTS public.uq_project_messages_telegram_dedup;

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_messages_telegram_dedup
  ON public.project_messages (
    telegram_chat_id,
    telegram_sender_user_id,
    telegram_message_date,
    telegram_message_id
  )
  WHERE source = 'telegram'
    AND telegram_sender_user_id IS NOT NULL
    AND telegram_message_date IS NOT NULL
    AND telegram_message_id IS NOT NULL;
