-- Email: фикс race condition при отправке с вложениями.
--
-- Симптом: при отправке email-сообщения с N вложениями письмо уходит с
-- меньшим количеством файлов (обычно 1). Edge function email-internal-send
-- запускалась триггером сразу при INSERT в project_messages, ДО того как
-- фронт успевал загрузить файлы и записать message_attachments. Функция
-- ждала появления хотя бы одной строки и сразу шла отправлять — остальные
-- файлы записывались позже и в это письмо уже не попадали.
--
-- Решение симметрично паттерну для Telegram/Wazzup/MTProto/Business: при
-- has_attachments=true триггер email-ветке делает early RETURN, а фронт
-- после uploadAttachments сам зовёт edge function (как уже делает для
-- остальных каналов).
--
-- Изменение только в одной ветке функции dispatch_message_to_channels —
-- email-блок теперь проверяет has_attachments и пропускает обработку, если
-- TRUE. Все остальные ветки не тронуты.

CREATE OR REPLACE FUNCTION public.dispatch_message_to_channels(p_message_id uuid, p_force_attachments boolean DEFAULT false)
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
  v_attach_flag BOOLEAN;
BEGIN
  SELECT * INTO NEW FROM project_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NEW.source IN (
    'telegram','telegram_service','telegram_business','telegram_mtproto',
    'bot_event','wazzup','email_internal'
  ) THEN
    RETURN;
  END IF;

  IF NEW.sender_participant_id IS NULL AND (NEW.content IS NULL OR NEW.content = '') THEN
    RETURN;
  END IF;

  -- Email-треды: edge function сама умеет вложения.
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
      -- has_attachments=true: триггер early-return, фронт сам зовёт
      -- email-internal-send после uploadAttachments (как для других
      -- каналов). Без этого был race — функция стартовала до того, как
      -- attachments оказались в БД, и письмо уходило с неполным набором.
      -- При cron-пути (p_force_attachments=true) триггер не вызывается,
      -- так что эта ветка тоже не запустится — cron явно зовёт edge
      -- function отдельно. Поэтому проверка только has_attachments.
      IF NEW.has_attachments = true THEN
        RETURN;
      END IF;

      PERFORM public.dispatch_send_http(
        'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/email-internal-send',
        jsonb_build_object('message_id', NEW.id),
        NEW.id,
        'email-internal-send'
      );
      RETURN;
    END IF;
  END IF;

  IF NEW.has_attachments = true AND NOT p_force_attachments THEN
    RETURN;
  END IF;

  v_attach_flag := (NEW.has_attachments = true AND p_force_attachments);

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
        jsonb_build_object('message_id', NEW.id)
          || CASE WHEN v_attach_flag THEN jsonb_build_object('attachments_only', true) ELSE '{}'::jsonb END,
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
        jsonb_build_object('message_id', NEW.id)
          || CASE WHEN v_attach_flag THEN jsonb_build_object('attachments_only', true) ELSE '{}'::jsonb END,
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
      )
        || CASE WHEN v_attach_flag THEN jsonb_build_object('attachments_only', true) ELSE '{}'::jsonb END,
      NEW.id,
      'telegram-send-message'
    );
  END IF;
END;
$function$;
