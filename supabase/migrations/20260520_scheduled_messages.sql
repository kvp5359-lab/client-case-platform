-- Отложенная отправка сообщений в тредах.
--
-- Модель: переиспользуем существующие поля project_messages.is_draft и
-- project_messages.scheduled_send_at. Запланированное сообщение = строка с
-- is_draft = true И scheduled_send_at = <будущее время>.
--
-- Жизненный цикл:
--   1. Фронт INSERT-ит черновик с is_draft=true и scheduled_send_at в будущем.
--      Триггер AFTER INSERT видит флаги и НЕ отправляет — RETURN NEW.
--   2. pg_cron раз в минуту дёргает dispatch_scheduled_messages().
--      Функция находит созревшие сообщения (scheduled_send_at <= now()),
--      берёт SELECT ... FOR UPDATE SKIP LOCKED, вызывает
--      dispatch_message_to_channels(id), обнуляет флаги.
--   3. dispatch_message_to_channels — это распилённое тело старого триггера.
--      Используется и триггером AFTER INSERT (для немедленных сообщений),
--      и cron-функцией (для запланированных).

-- 1. Helper: маршрутизация одного сообщения по каналам (бывшее тело триггера).
CREATE OR REPLACE FUNCTION public.dispatch_message_to_channels(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  NEW project_messages%ROWTYPE;
  v_tg_chat RECORD;
  v_mtproto_session_user_id UUID;
  v_mtproto_client_tg_user_id BIGINT;
  v_business_connection_id TEXT;
  v_wazzup_channel_id UUID;
  v_wazzup_chat_id TEXT;
  v_email_send_account_id UUID;
  v_is_email_thread BOOLEAN;
  v_reply_tg_msg_id BIGINT;
BEGIN
  SELECT * INTO NEW FROM project_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NEW.source IN (
    'telegram',
    'telegram_service',
    'telegram_business',
    'telegram_mtproto',
    'bot_event',
    'wazzup',
    'email_internal'
  ) THEN
    RETURN;
  END IF;

  IF NEW.sender_participant_id IS NULL AND (NEW.content IS NULL OR NEW.content = '') THEN
    RETURN;
  END IF;

  IF NEW.thread_id IS NOT NULL THEN
    SELECT pt.email_send_account_id,
           (pt.email_send_account_id IS NOT NULL OR EXISTS (
              SELECT 1 FROM project_messages pm2
              WHERE pm2.thread_id = NEW.thread_id
                AND pm2.source = 'email_internal'
              LIMIT 1
           ))
    INTO v_email_send_account_id, v_is_email_thread
    FROM project_threads pt WHERE pt.id = NEW.thread_id;

    IF v_is_email_thread THEN
      PERFORM public.dispatch_send_http(
        'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/email-internal-send',
        jsonb_build_object('message_id', NEW.id),
        NEW.id,
        'email-internal-send'
      );
      RETURN;
    END IF;
  END IF;

  IF NEW.has_attachments = true THEN
    RETURN;
  END IF;

  IF NEW.thread_id IS NOT NULL THEN
    SELECT mtproto_session_user_id, mtproto_client_tg_user_id
    INTO v_mtproto_session_user_id, v_mtproto_client_tg_user_id
    FROM project_threads WHERE id = NEW.thread_id;

    IF v_mtproto_session_user_id IS NOT NULL AND v_mtproto_client_tg_user_id IS NOT NULL THEN
      IF NEW.reply_to_message_id IS NOT NULL THEN
        SELECT telegram_message_id INTO v_reply_tg_msg_id
        FROM project_messages WHERE id = NEW.reply_to_message_id;
      END IF;
      PERFORM public.dispatch_send_http(
        'https://mtproto.kvp-projects.com/messages/send',
        jsonb_build_object(
          'message_id_internal', NEW.id,
          'user_id', v_mtproto_session_user_id,
          'client_tg_user_id', v_mtproto_client_tg_user_id,
          'text', NEW.content,
          'reply_to_telegram_message_id', v_reply_tg_msg_id
        ),
        NEW.id,
        'mtproto-send'
      );
      RETURN;
    END IF;
  END IF;

  IF NEW.thread_id IS NOT NULL THEN
    SELECT business_connection_id INTO v_business_connection_id
    FROM project_threads WHERE id = NEW.thread_id;
    IF v_business_connection_id IS NOT NULL THEN
      PERFORM public.dispatch_send_http(
        'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/telegram-business-send',
        jsonb_build_object('message_id', NEW.id),
        NEW.id,
        'telegram-business-send'
      );
      RETURN;
    END IF;
  END IF;

  IF NEW.thread_id IS NOT NULL THEN
    SELECT wazzup_channel_id, wazzup_chat_id INTO v_wazzup_channel_id, v_wazzup_chat_id
    FROM project_threads WHERE id = NEW.thread_id;
    IF v_wazzup_channel_id IS NOT NULL AND v_wazzup_chat_id IS NOT NULL THEN
      PERFORM public.dispatch_send_http(
        'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/wazzup-send',
        jsonb_build_object('message_id', NEW.id),
        NEW.id,
        'wazzup-send'
      );
      RETURN;
    END IF;
  END IF;

  IF NEW.thread_id IS NOT NULL THEN
    SELECT * INTO v_tg_chat FROM project_telegram_chats
    WHERE thread_id = NEW.thread_id AND is_active = true;
  END IF;

  IF NOT FOUND AND NEW.thread_id IS NULL AND NEW.channel IS NOT NULL THEN
    SELECT * INTO v_tg_chat FROM project_telegram_chats
    WHERE project_id = NEW.project_id AND channel = NEW.channel AND is_active = true;
  END IF;

  IF v_tg_chat.id IS NOT NULL THEN
    IF NEW.reply_to_message_id IS NOT NULL AND v_reply_tg_msg_id IS NULL THEN
      SELECT telegram_message_id INTO v_reply_tg_msg_id
      FROM project_messages WHERE id = NEW.reply_to_message_id;
    END IF;

    PERFORM public.dispatch_send_http(
      'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/telegram-send-message',
      jsonb_build_object(
        'message_id', NEW.id,
        'project_id', NEW.project_id,
        'content', NEW.content,
        'sender_name', NEW.sender_name,
        'sender_role', NEW.sender_role,
        'telegram_chat_id', v_tg_chat.telegram_chat_id,
        'reply_to_telegram_message_id', v_reply_tg_msg_id
      ),
      NEW.id,
      'telegram-send-message'
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.dispatch_message_to_channels(uuid) FROM public, anon, authenticated;

-- 2. Триггерная функция: пропускает черновики/запланированные, иначе делегирует.
CREATE OR REPLACE FUNCTION public.notify_telegram_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Запланированные/черновики не отправляем автоматически —
  -- их активирует dispatch_scheduled_messages() через pg_cron.
  IF NEW.is_draft = true OR NEW.scheduled_send_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.dispatch_message_to_channels(NEW.id);
  RETURN NEW;
END;
$function$;

-- 3. Воркер: публикует созревшие отложенные сообщения.
CREATE OR REPLACE FUNCTION public.dispatch_scheduled_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT id
    FROM project_messages
    WHERE is_draft = true
      AND scheduled_send_at IS NOT NULL
      AND scheduled_send_at <= now()
    ORDER BY scheduled_send_at
    LIMIT 200
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Сначала снимаем флаги, потом шлём — чтобы повторный запуск крона
    -- не отправил то же сообщение второй раз, даже если dispatch упадёт.
    UPDATE project_messages
       SET is_draft = false,
           scheduled_send_at = NULL
     WHERE id = v_row.id;

    BEGIN
      PERFORM public.dispatch_message_to_channels(v_row.id);
    EXCEPTION WHEN OTHERS THEN
      -- Логируем в net._http_response через dispatch_send_http не получится —
      -- здесь просто RAISE WARNING, чтобы в логах Postgres было видно.
      RAISE WARNING 'dispatch_scheduled_messages: dispatch failed for %: %', v_row.id, SQLERRM;
    END;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.dispatch_scheduled_messages() FROM public, anon, authenticated;

-- 4. Индекс для быстрого поиска созревших.
CREATE INDEX IF NOT EXISTS idx_project_messages_scheduled
  ON public.project_messages (scheduled_send_at)
  WHERE is_draft = true AND scheduled_send_at IS NOT NULL;

-- 5. pg_cron — раз в минуту.
DO $$
DECLARE
  v_existing_jobid bigint;
BEGIN
  SELECT jobid INTO v_existing_jobid FROM cron.job WHERE jobname = 'dispatch-scheduled-messages';
  IF v_existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_jobid);
  END IF;
  PERFORM cron.schedule(
    'dispatch-scheduled-messages',
    '* * * * *',
    $cron$ SELECT public.dispatch_scheduled_messages(); $cron$
  );
END $$;
