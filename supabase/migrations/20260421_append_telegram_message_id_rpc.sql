-- RPC для безопасного добавления telegram_message_id в массив
-- telegram_message_ids у project_messages. Используется edge-функцией
-- telegram-send-message, чтобы сохранить ID каждого TG-сообщения (не только
-- первого при media group или нескольких документах).

CREATE OR REPLACE FUNCTION public.append_telegram_message_id(
  p_message_id uuid,
  p_tg_msg_id bigint,
  p_chat_id bigint
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.project_messages
  SET telegram_message_ids = array_append(
        COALESCE(telegram_message_ids, '{}'),
        p_tg_msg_id
      ),
      telegram_chat_id = p_chat_id
  WHERE id = p_message_id
    AND NOT (telegram_message_ids @> ARRAY[p_tg_msg_id]);
$$;
