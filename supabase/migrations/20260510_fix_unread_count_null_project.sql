-- Фикс get_unread_messages_count: пропускал треды без проекта (project_id=NULL).
-- WHERE pm.project_id = p_project_id давал NULL для NULL=NULL → COUNT=0.
-- Теперь: если задан p_thread_id, фильтруем только по нему. Иначе требуем
-- совпадение по project_id (старое поведение).

CREATE OR REPLACE FUNCTION public.get_unread_messages_count(
  p_participant_id uuid,
  p_project_id uuid,
  p_channel text DEFAULT 'client'::text,
  p_thread_id uuid DEFAULT NULL::uuid
)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)
  FROM project_messages pm
  LEFT JOIN message_read_status mrs
    ON mrs.participant_id = p_participant_id
    AND mrs.thread_id = COALESCE(p_thread_id, pm.thread_id)
  WHERE
    CASE
      WHEN p_thread_id IS NOT NULL THEN pm.thread_id = p_thread_id
      ELSE pm.project_id = p_project_id AND pm.channel = p_channel
    END
    AND (mrs.last_read_at IS NULL OR pm.created_at > mrs.last_read_at)
    AND pm.sender_participant_id IS DISTINCT FROM p_participant_id
    AND pm.source != 'telegram_service'::message_source;
$function$;
