-- Аудит 2026-06-13 (карантин, одобрено): отложенное сообщение из треда,
-- отправленного в корзину до срока, всё равно уходило клиенту.
-- Теперь для удалённого треда отправку ОТМЕНЯЕМ (снимаем черновик/расписание,
-- чтобы не перевыбирать вечно), но dispatch не вызываем.
-- Применено в прод через MCP 2026-06-13.
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
    SELECT m.id, m.has_attachments, COALESCE(t.is_deleted, false) AS thread_deleted
    FROM project_messages m
    LEFT JOIN project_threads t ON t.id = m.thread_id
    WHERE m.is_draft = true
      AND m.scheduled_send_at IS NOT NULL
      AND m.scheduled_send_at <= now()
    ORDER BY m.scheduled_send_at
    LIMIT 200
    FOR UPDATE OF m SKIP LOCKED
  LOOP
    UPDATE project_messages
       SET is_draft = false,
           scheduled_send_at = NULL
     WHERE id = v_row.id;

    IF v_row.thread_deleted THEN
      CONTINUE;
    END IF;

    BEGIN
      PERFORM public.dispatch_message_to_channels(v_row.id, v_row.has_attachments);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'dispatch_scheduled_messages: dispatch failed for %: %', v_row.id, SQLERRM;
    END;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;
