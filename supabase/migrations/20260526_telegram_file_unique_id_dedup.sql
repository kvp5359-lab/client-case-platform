-- Fix: multi-file messages from Telegram clients sent within one second
-- were getting deduplicated and silently dropped.
--
-- Old content-based dedup index keyed off md5(content), но у всех файлов
-- content = '📎' (заглушка) — md5 одинаковый. Если клиент отправляет
-- пакет из нескольких файлов одной секундой (telegram_message_date —
-- UNIX timestamp в секундах), UNIQUE отбивал все, кроме первого, как
-- "дубль", даже если файлы разные. См. .claude/rules/gotchas.md.
--
-- Fix: добавляем telegram_file_unique_id (стабильный TG-id файла,
-- одинаковый у разных ботов для одного файла) и включаем его в UNIQUE.
-- Один файл от двух ботов → одинаковый file_unique_id → схлопывается.
-- Разные файлы в одну секунду → разные file_unique_id → оба сохраняются.

ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS telegram_file_unique_id text;

COMMENT ON COLUMN public.project_messages.telegram_file_unique_id IS
  'Telegram file_unique_id первого вложения сообщения (document / photo[last] / video / voice / audio / animation / sticker / video_note). Используется в UNIQUE-индексе uq_project_messages_telegram_content_dedup, чтобы разделять разные файлы в одну секунду от одного юзера и при этом схлопывать одно и то же сообщение, пришедшее от нескольких ботов в multi-bot группе.';

DROP INDEX IF EXISTS public.uq_project_messages_telegram_content_dedup;

CREATE UNIQUE INDEX uq_project_messages_telegram_content_dedup
  ON public.project_messages (
    telegram_chat_id,
    telegram_sender_user_id,
    telegram_message_date,
    md5(COALESCE(content, '')),
    COALESCE(telegram_file_unique_id, '')
  )
  WHERE (
    source = 'telegram'
    AND telegram_chat_id IS NOT NULL
    AND telegram_sender_user_id IS NOT NULL
    AND telegram_message_date IS NOT NULL
  );
