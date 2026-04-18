-- notify_telegram_on_new_message шлёт новые project_messages обратно в Telegram
-- через telegram-send-message. Для 'bot_event' это создавало дубликат: бот уже
-- прислал пользователю сообщение о загрузке (с кнопками), а триггер шлёт его
-- второй раз как обычный текст. Добавляем 'bot_event' в список исключений.

CREATE OR REPLACE FUNCTION public.notify_telegram_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tg_chat project_telegram_chats%ROWTYPE;
  v_reply_tg_msg_id BIGINT;
BEGIN
  IF NEW.source IN ('telegram', 'telegram_service', 'bot_event') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_draft = true THEN
    RETURN NEW;
  END IF;

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
      'x-internal-secret', 'c62e08cdca71914b1468c609813de6ed9bed5e997dc5aa391f2472bd4fb4b809'
    )
  );

  RETURN NEW;
END;
$$;
