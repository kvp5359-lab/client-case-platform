-- Видимость "файл из Telegram потерян": две колонки в project_messages.
--
-- Сегодня: webhook записывает сообщение в БД (content='📎' или caption-текст),
-- параллельно пытается скачать файл через getFile API. Если скачивание упало
-- (429 rate-limit, timeout, expired) — функция molча игнорирует ошибку, файл
-- не сохраняется, у сообщения нет message_attachments. Пользователь в UI
-- видит просто текст без файла, не подозревая что был файл и он потерян.
-- За 3 месяца (фев-май 2026) накоплено минимум 18 явных случаев потери.
--
-- После этой миграции webhook сможет помечать сообщения как 'failed', UI
-- покажет явную красную плашку "Файл не загрузился из Telegram".

ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS attachment_status text
    CHECK (attachment_status IN ('pending', 'failed') OR attachment_status IS NULL);

ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS attachment_error jsonb;

COMMENT ON COLUMN public.project_messages.attachment_status IS
  'NULL — нет ожидаемого вложения или оно успешно загружено. pending — загружается. failed — все попытки скачать упали.';
COMMENT ON COLUMN public.project_messages.attachment_error IS
  'Детали последней ошибки при загрузке вложения: { stage, message, http_status, attempts, file_id }';

-- Backfill: пометить старые "осиротевшие" сообщения (placeholder "📎" без
-- message_attachments) как failed. Это даст пользователю видимость потерь
-- прямо в истории чатов, без необходимости сравнивать с Telegram вручную.
UPDATE public.project_messages pm
SET
  attachment_status = 'failed',
  attachment_error = jsonb_build_object(
    'stage', 'backfill',
    'message', 'Файл был отправлен из Telegram, но загрузка не была завершена. Это сообщение помечено задним числом после исправления бага 2026-05-27.',
    'backfilled_at', NOW()::text
  )
WHERE pm.source IN ('telegram'::message_source, 'telegram_business'::message_source, 'telegram_mtproto'::message_source)
  AND pm.content = '📎'
  AND NOT EXISTS (SELECT 1 FROM public.message_attachments WHERE message_id = pm.id)
  AND pm.attachment_status IS NULL;
