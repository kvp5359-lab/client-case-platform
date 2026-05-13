-- Защита от дублей входящих Telegram-сообщений между несколькими ботами в
-- одной группе. Контекст:
--
-- В группе с несколькими ботами (например workspace_bot + 2 employee_bot)
-- Telegram присваивает каждому боту СВОЙ message_id для одного и того же
-- сообщения (per-bot последовательности из-за privacy mode). Поэтому
-- существующий UNIQUE (telegram_chat_id, telegram_message_id) НЕ дедупит —
-- каждый бот успешно записывает свою копию, и в треде у пользователя
-- появляется 2-3 одинаковых сообщения.
--
-- Решение: добавить второй UNIQUE по (chat_id, sender_user_id, message_date,
-- md5(content)). Первый бот успевает записать — остальные webhook'и получают
-- 23505 (unique violation), и существующий код в syncTelegramIncomingMessage
-- помечает их как outcome='duplicate'. Telegram message_date — это unix-time
-- сообщения в секундах; коллизия возможна только если один user шлёт
-- абсолютно идентичный текст в ту же секунду через тот же чат — приемлемый
-- edge case.

CREATE UNIQUE INDEX uq_project_messages_telegram_content_dedup
  ON public.project_messages (
    telegram_chat_id,
    telegram_sender_user_id,
    telegram_message_date,
    md5(COALESCE(content, ''))
  )
  WHERE source = 'telegram'
    AND telegram_chat_id IS NOT NULL
    AND telegram_sender_user_id IS NOT NULL
    AND telegram_message_date IS NOT NULL;
