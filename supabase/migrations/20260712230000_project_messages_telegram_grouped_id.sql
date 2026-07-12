-- Колонка telegram_grouped_id и её индекс существовали в ПРОДЕ вне миграций
-- (дрейф — добавлялись вместе со склейкой альбомов MTProto). Фиксируем в файл,
-- чтобы чистая БД (db push) не падала: приём входящих Telegram теперь пишет
-- это поле (media_group_id → telegram_grouped_id) для склейки альбома на фронте.
-- Идемпотентно: в проде no-op (IF NOT EXISTS), на чистой БД создаёт.

ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS telegram_grouped_id bigint;

-- Партиал-индекс под фронтовую склейку/выборки по группе.
CREATE INDEX IF NOT EXISTS idx_project_messages_telegram_grouped_id
  ON public.project_messages USING btree (thread_id, telegram_grouped_id)
  WHERE (telegram_grouped_id IS NOT NULL);
