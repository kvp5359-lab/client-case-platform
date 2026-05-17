-- В миграции 20260511_notify_email_allow_attachments.sql случайно упростил
-- payload в ветке группового Telegram (telegram-send-message) до {message_id}.
-- Edge function требует content/sender_name/telegram_chat_id, поэтому первая
-- попытка через триггер отбивалась 400 «Missing field: content», и работала
-- только кнопка «Повторить отправку» (фронт шлёт полный body).
--
-- Восстанавливаем полный payload + reply_to_telegram_message_id, как было до
-- регрессии. Email/MTProto/Business ветки остаются без изменений.

CREATE OR REPLACE FUNCTION public.notify_telegram_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  IF NEW.source IN (
    'telegram_service',
    'telegram_business',
    'telegram_mtproto',
    'wazzup',
    'email_internal'
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_participant_id IS NULL AND (NEW.content IS NULL OR NEW.content = '') THEN
    RETURN NEW;
  END IF;

  -- Email — ПЕРЕД guard'ом has_attachments.
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
      PERFORM net.http_post(
        url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/email-internal-send',
        body := jsonb_build_object('message_id', NEW.id),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', '__INTERNAL_FUNCTION_SECRET__'
        )
      );
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.has_attachments = true THEN
    RETURN NEW;
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
      PERFORM net.http_post(
        url := 'https://mtproto.kvp-projects.com/messages/send',
        body := jsonb_build_object(
          'message_id_internal', NEW.id,
          'user_id', v_mtproto_session_user_id,
          'client_tg_user_id', v_mtproto_client_tg_user_id,
          'text', NEW.content,
          'reply_to_telegram_message_id', v_reply_tg_msg_id
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', '__INTERNAL_FUNCTION_SECRET__'
        )
      );
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.thread_id IS NOT NULL THEN
    SELECT business_connection_id INTO v_business_connection_id
    FROM project_threads WHERE id = NEW.thread_id;
    IF v_business_connection_id IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/telegram-business-send',
        body := jsonb_build_object('message_id', NEW.id),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', '__INTERNAL_FUNCTION_SECRET__'
        )
      );
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.thread_id IS NOT NULL THEN
    SELECT wazzup_channel_id, wazzup_chat_id INTO v_wazzup_channel_id, v_wazzup_chat_id
    FROM project_threads WHERE id = NEW.thread_id;
    IF v_wazzup_channel_id IS NOT NULL AND v_wazzup_chat_id IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/wazzup-send',
        body := jsonb_build_object('message_id', NEW.id),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', '__INTERNAL_FUNCTION_SECRET__'
        )
      );
      RETURN NEW;
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
    -- reply_to для группового бота — отдельный lookup (mtproto-ветка имеет свой).
    IF NEW.reply_to_message_id IS NOT NULL AND v_reply_tg_msg_id IS NULL THEN
      SELECT telegram_message_id INTO v_reply_tg_msg_id
      FROM project_messages WHERE id = NEW.reply_to_message_id;
    END IF;

    PERFORM net.http_post(
      url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/telegram-send-message',
      body := jsonb_build_object(
        'message_id', NEW.id,
        'project_id', NEW.project_id,
        'content', NEW.content,
        'sender_name', NEW.sender_name,
        'sender_role', NEW.sender_role,
        'telegram_chat_id', v_tg_chat.telegram_chat_id,
        'reply_to_telegram_message_id', v_reply_tg_msg_id
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', '__INTERNAL_FUNCTION_SECRET__'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;
