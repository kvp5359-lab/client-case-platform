-- Реакция на сообщение — одна на пользователя. Выбор другого эмодзи заменяет
-- предыдущую реакцию того же участника.
--
-- Возвращаемое значение:
--   TRUE  — реакция установлена (добавлена или заменена);
--   FALSE — реакция снята (повторный клик по тому же эмодзи).

CREATE OR REPLACE FUNCTION public.toggle_message_reaction(
  p_message_id uuid,
  p_participant_id uuid,
  p_emoji text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_emoji TEXT;
BEGIN
  SELECT emoji INTO v_existing_emoji
  FROM message_reactions
  WHERE message_id = p_message_id
    AND participant_id = p_participant_id
  LIMIT 1;

  IF v_existing_emoji IS NOT NULL THEN
    DELETE FROM message_reactions
    WHERE message_id = p_message_id
      AND participant_id = p_participant_id;

    IF v_existing_emoji = p_emoji THEN
      -- Повторный клик по тому же эмодзи — снимаем.
      RETURN FALSE;
    END IF;
  END IF;

  INSERT INTO message_reactions (message_id, participant_id, emoji)
  VALUES (p_message_id, p_participant_id, p_emoji);

  RETURN TRUE;
END;
$function$;
