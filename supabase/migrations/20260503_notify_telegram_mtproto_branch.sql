-- Telegram MTProto: третья ветка триггера notify_telegram_on_new_message.
--
-- Когда сотрудник пишет ответ из UI в системный инбокс (тред с
-- mtproto_session_user_id), триггер шлёт сообщение в наш MTProto-сервис
-- (живёт на VPS, публично доступен по поддомену с TLS) — он передаёт
-- через гарм-сессию сотрудника от его имени.
--
-- URL сервиса захардкожен (обновлять отдельной миграцией при смене
-- домена/инфры). На Supabase Cloud `ALTER DATABASE SET` запрещён, а
-- альтернативный путь через app_config-таблицу — лишняя сложность для
-- одного значения.
--
-- Защита: x-internal-secret такой же, как у telegram-business-send и
-- старого telegram-send-message — единый секрет проекта.

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
BEGIN
  -- Не реагируем на сами telegram-* источники, иначе ловим циклы.
  IF NEW.source IN ('telegram', 'telegram_service', 'bot_event', 'telegram_business', 'telegram_mtproto') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_draft = true THEN
    RETURN NEW;
  END IF;

  IF NEW.has_attachments = true THEN
    RETURN NEW;
  END IF;

  -- ===========================================================
  -- Ветка 1: Telegram MTProto. Самый специфичный — проверяем первой.
  -- ===========================================================
  IF NEW.thread_id IS NOT NULL THEN
    SELECT mtproto_session_user_id, mtproto_client_tg_user_id
    INTO v_mtproto_session_user_id, v_mtproto_client_tg_user_id
    FROM project_threads
    WHERE id = NEW.thread_id;

    IF v_mtproto_session_user_id IS NOT NULL AND v_mtproto_client_tg_user_id IS NOT NULL THEN
      -- Resolv reply_to: ищем оригинал в БД, чтобы передать его
      -- telegram_message_id. content передаём как есть (HTML из tiptap),
      -- сервис сам делает parseMode=html.
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
          'x-internal-secret', '__INTERNAL_FUNCTION_SECRET__'
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
          'x-internal-secret', '__INTERNAL_FUNCTION_SECRET__'
        )
      );
      RETURN NEW;
    END IF;
  END IF;

  -- ===========================================================
  -- Ветка 3: групповые чаты через project_telegram_chats.
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
      'x-internal-secret', '__INTERNAL_FUNCTION_SECRET__'
    )
  );

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.notify_telegram_on_new_message IS
  'Маршрутизация исходящих TG-сообщений из БД в нужный канал: MTProto (если у треда есть mtproto_session_user_id), Telegram Business (если business_connection_id), либо обычный групповой бот (project_telegram_chats). Источники telegram*/bot_event пропускаются — это уже принятые входящие.';
