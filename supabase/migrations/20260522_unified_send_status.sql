-- Унифицированный статус доставки исходящих сообщений по всем каналам.
--
-- Зачем: до этой миграции «доставлено / нет» вычислялось косвенно — по наличию
-- telegram_message_id / wazzup_message_id / email_message_id / etc. У каждого
-- канала своя комбинация полей. Это раздувало логику в UI и edge functions,
-- и регулярно ломалось на крайних случаях (тихий фейл UPDATE, потеря id,
-- двойные сообщения от cron-retry).
--
-- Новая модель: один enum send_status на сообщение, единая семантика для
-- всех каналов. Cron retry-undelivered-telegram больше не нужен — фронт
-- сам предлагает юзеру кнопку «Повторить» при failed.

-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.outgoing_send_status AS ENUM ('pending', 'sent', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Колонки
ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS send_status public.outgoing_send_status,
  ADD COLUMN IF NOT EXISTS send_failed_reason text,
  ADD COLUMN IF NOT EXISTS send_attempted_at timestamptz;

-- 3. Backfill: всё, что не наш исходящий (source != 'web') — считаем sent
-- (это входящие webhook'и, системные события и т.п. — их мы не отправляем).
-- Наши исходящие (source='web') с уже заполненным id внешнего канала — sent.
-- Остальные исходящие — failed (это битые/застрявшие из прошлых багов;
-- юзер увидит красный бабл и сможет нажать «Повторить»).
UPDATE public.project_messages
SET send_status = 'sent'
WHERE send_status IS NULL
  AND (
    source <> 'web'
    OR telegram_message_id IS NOT NULL
    OR wazzup_message_id IS NOT NULL
    OR email_message_id IS NOT NULL
  );

-- Свежие (<7 дней) без id — failed, юзер ещё помнит контекст и может повторить.
-- Старые помечаем sent (нет смысла плодить красные баблы в истории, клиент уже ушёл).
UPDATE public.project_messages
SET send_status = 'failed',
    send_failed_reason = 'backfill: сообщение из истории без подтверждённой доставки'
WHERE send_status IS NULL
  AND created_at >= now() - interval '7 days';

UPDATE public.project_messages
SET send_status = 'sent'
WHERE send_status IS NULL;

-- 4. NOT NULL + дефолт для новых записей
ALTER TABLE public.project_messages
  ALTER COLUMN send_status SET DEFAULT 'pending',
  ALTER COLUMN send_status SET NOT NULL;

-- 5. Индекс — для глобального тоста о фейлах и для realtime-подписок
CREATE INDEX IF NOT EXISTS idx_project_messages_send_status_failed
  ON public.project_messages (workspace_id, created_at DESC)
  WHERE send_status = 'failed';

-- 6. Триггер: при INSERT исходящего (source='web') ставим pending,
-- остальное — sent. Это разово при INSERT, дальше статус меняют edge functions.
CREATE OR REPLACE FUNCTION public.set_initial_send_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.send_status IS NULL OR NEW.send_status = 'pending' THEN
    IF NEW.source = 'web' AND NEW.is_draft IS NOT TRUE AND NEW.scheduled_send_at IS NULL THEN
      NEW.send_status := 'pending';
      NEW.send_attempted_at := now();
    ELSE
      NEW.send_status := 'sent';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_initial_send_status ON public.project_messages;
CREATE TRIGGER trg_set_initial_send_status
  BEFORE INSERT ON public.project_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_initial_send_status();

-- 7. Дропаем cron-retry для Telegram — больше не нужен, дубль-генератор
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'retry-undelivered-telegram';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.retry_undelivered_telegram_messages();

-- 8. Убираем колонку telegram_retry_count — больше не используется
-- (была драйвером cron-retry; в типах БД и старой миграции упоминается,
-- но в боевом коде edge functions / фронта не читается).
ALTER TABLE public.project_messages DROP COLUMN IF EXISTS telegram_retry_count;
