-- Расширение notify_telegram_on_new_message на ветку Wazzup.
--
-- Имя функции уже не отражает суть — она маршрутизирует исходящие в любой
-- внешний канал (TG MTProto / TG Business / TG group / Wazzup). Переименовать
-- можно отдельной миграцией; пока просто добавляем ветку.
--
-- Когда из UI пишут в тред с заполненным wazzup_channel_id — шлём через
-- Edge Function wazzup-send. Источник 'wazzup' добавлен в список источников,
-- которые триггер пропускает (иначе ловим эхо-цикл, когда webhook сам
-- инсёртит сообщение с source='wazzup').

CREATE OR REPLACE FUNCTION public.notify_telegram_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tg_chat project_telegram_chats%ROWTYPE;
  v_reply_tg_msg_id BIGINT;
  v_business_connection_id UUID;
  v_mtproto_session_user_id UUID;
  v_mtproto_client_tg_user_id BIGINT;
  v_wazzup_channel_id UUID;
  v_wazzup_chat_id TEXT;
BEGIN
  -- Не реагируем на сами входящие источники, иначе ловим циклы.
  IF NEW.source IN ('telegram', 'telegram_service', 'bot_event', 'telegram_business', 'telegram_mtproto', 'wazzup') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_draft = true THEN
    RETURN NEW;
  END IF;

  IF NEW.has_attachments = true THEN
    RETURN NEW;
  END IF;

  -- ===========================================================
  -- Ветка 1: Telegram MTProto.
  -- ===========================================================
  IF NEW.thread_id IS NOT NULL THEN
    SELECT mtproto_session_user_id, mtproto_client_tg_user_id
    INTO v_mtproto_session_user_id, v_mtproto_client_tg_user_id
    FROM project_threads
    WHERE id = NEW.thread_id;

    IF v_mtproto_session_user_id IS NOT NULL AND v_mtproto_client_tg_user_id IS NOT NULL THEN
      IF NEW.reply_to_message_id IS NOT NULL THEN
        SELECT telegram_message_id INTO v_reply_tg_msg_id
        FROM project_messages
        WHERE id = NEW.reply_to_message_id;
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
          'x-internal-secret', '097e79a971f850687012b96537d389b6b734b4538d29cf25cc7b58234dadcdab'
        )
      );
      RETURN NEW;
    END IF;
  END IF;

  -- ===========================================================
  -- Ветка 2: Telegram Business.
  -- ===========================================================
  IF NEW.thread_id IS NOT NULL THEN
    SELECT business_connection_id INTO v_business_connection_id
    FROM project_threads
    WHERE id = NEW.thread_id;

    IF v_business_connection_id IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/telegram-business-send',
        body := jsonb_build_object('message_id', NEW.id),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', '097e79a971f850687012b96537d389b6b734b4538d29cf25cc7b58234dadcdab'
        )
      );
      RETURN NEW;
    END IF;
  END IF;

  -- ===========================================================
  -- Ветка 3: Wazzup (WhatsApp / Instagram / etc).
  -- ===========================================================
  IF NEW.thread_id IS NOT NULL THEN
    SELECT wazzup_channel_id, wazzup_chat_id
    INTO v_wazzup_channel_id, v_wazzup_chat_id
    FROM project_threads
    WHERE id = NEW.thread_id;

    IF v_wazzup_channel_id IS NOT NULL AND v_wazzup_chat_id IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/wazzup-send',
        body := jsonb_build_object('message_id', NEW.id),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', '097e79a971f850687012b96537d389b6b734b4538d29cf25cc7b58234dadcdab'
        )
      );
      RETURN NEW;
    END IF;
  END IF;

  -- ===========================================================
  -- Ветка 4: групповые TG-чаты через project_telegram_chats.
  -- ===========================================================
  IF NEW.thread_id IS NOT NULL THEN
    SELECT * INTO v_tg_chat
    FROM project_telegram_chats
    WHERE thread_id = NEW.thread_id AND is_active = true;
  END IF;

  IF NOT FOUND AND NEW.thread_id IS NULL AND NEW.channel IS NOT NULL THEN
    SELECT * INTO v_tg_chat
    FROM project_telegram_chats
    WHERE project_id = NEW.project_id
      AND channel = NEW.channel
      AND is_active = true;
  END IF;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.reply_to_message_id IS NOT NULL THEN
    SELECT telegram_message_id INTO v_reply_tg_msg_id
    FROM project_messages
    WHERE id = NEW.reply_to_message_id;
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
      'x-internal-secret', '097e79a971f850687012b96537d389b6b734b4538d29cf25cc7b58234dadcdab'
    )
  );

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.notify_telegram_on_new_message IS
  'Маршрутизация исходящих сообщений в нужный внешний канал: TG MTProto, TG Business, Wazzup или TG group bot. Источники telegram*/wazzup/bot_event пропускаются — это уже принятые входящие.';
