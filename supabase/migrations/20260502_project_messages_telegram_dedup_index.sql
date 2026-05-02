-- Поля и уникальный индекс для атомарного дедупа входящих Telegram-сообщений.
-- Telegram-апдейт об одном физическом сообщении приходит на webhook'и
-- разных ботов (секретарь + личный бот сотрудника) с разными
-- per-bot message_id. Но поля (from.id, message.date) одинаковы у обоих —
-- они идентифицируют отправителя-человека и момент отправки. Пара
-- (chat_id, sender_user_id, message_date) глобально уникальна для одного
-- сообщения, и используется как ключ дедупа.

ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS telegram_sender_user_id bigint,
  ADD COLUMN IF NOT EXISTS telegram_message_date timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_messages_telegram_dedup
  ON public.project_messages (telegram_chat_id, telegram_sender_user_id, telegram_message_date)
  WHERE source = 'telegram'
    AND telegram_sender_user_id IS NOT NULL
    AND telegram_message_date IS NOT NULL;
