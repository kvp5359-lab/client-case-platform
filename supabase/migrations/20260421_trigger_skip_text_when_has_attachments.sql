-- Если у сообщения будут файлы (has_attachments=true), триггер НЕ шлёт текст
-- отдельным sendMessage. Frontend потом вызовет telegram-send-message с
-- attachments_only=true + текстом — и текст уйдёт как caption media-group,
-- получится один баббл в TG.

CREATE OR REPLACE FUNCTION public.notify_telegram_on_new_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Если у сообщения будут файлы — edge function отправит всё вместе
  -- (текст как caption медиа-альбома).
  IF NEW.has_attachments = true THEN
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
      'x-internal-secret', 'a9d84c085eceb22deb3e0b5e104a921e2eb8ca6bea8b326e5ac08b36d16dcf28'
    )
  );

  RETURN NEW;
END;
$function$;
