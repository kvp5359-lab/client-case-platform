-- Каноничный пересчёт счётчиков для пары (participant, thread). Точная формула v2.
-- ВАЖНО: SELECT INTO без строки обнуляет переменные → явный COALESCE для manually_unread.
CREATE OR REPLACE FUNCTION public.recompute_thread_unread_for(p_participant_id uuid, p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid; v_last_read timestamptz; v_manual boolean;
  v_unread bigint; v_events bigint; v_reactions bigint;
  v_last_reaction_at timestamptz; v_has_unread_reaction boolean;
BEGIN
  SELECT user_id INTO v_user_id FROM participants WHERE id = p_participant_id;
  SELECT last_read_at, manually_unread INTO v_last_read, v_manual
    FROM message_read_status WHERE participant_id = p_participant_id AND thread_id = p_thread_id;
  v_manual := COALESCE(v_manual, false);

  SELECT count(*) INTO v_unread FROM project_messages pm
  WHERE pm.thread_id = p_thread_id AND pm.source <> 'telegram_service'::message_source
    AND pm.sender_participant_id IS DISTINCT FROM p_participant_id
    AND (v_last_read IS NULL OR pm.created_at > v_last_read);

  SELECT count(*) INTO v_events FROM audit_logs al
  LEFT JOIN statuses s ON al.action = 'change_status'
    AND (al.details->>'new_status') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND s.id = (al.details->>'new_status')::uuid
  WHERE al.resource_id = p_thread_id AND al.resource_type IN ('task','thread')
    AND al.user_id IS DISTINCT FROM v_user_id
    AND (v_last_read IS NULL OR al.created_at > v_last_read)
    AND (al.action <> 'change_status' OR COALESCE(s.silent_transition, false) = false);

  SELECT count(*) INTO v_reactions FROM message_reactions mr
  JOIN project_messages pm ON pm.id = mr.message_id
  WHERE pm.thread_id = p_thread_id AND mr.participant_id IS DISTINCT FROM p_participant_id
    AND (v_last_read IS NULL OR mr.created_at > v_last_read);

  SELECT max(mr.created_at) INTO v_last_reaction_at FROM message_reactions mr
  JOIN project_messages pm ON pm.id = mr.message_id
  WHERE pm.thread_id = p_thread_id AND mr.participant_id IS DISTINCT FROM p_participant_id;
  v_has_unread_reaction := v_last_reaction_at IS NOT NULL AND (v_last_read IS NULL OR v_last_reaction_at > v_last_read);

  INSERT INTO thread_unread_state AS u (
    participant_id, thread_id, unread_count, unread_event_count, unread_reaction_count,
    has_unread_reaction, manually_unread, last_read_at, updated_at
  ) VALUES (
    p_participant_id, p_thread_id, v_unread, v_events, v_reactions,
    v_has_unread_reaction, v_manual, v_last_read, now()
  )
  ON CONFLICT (participant_id, thread_id) DO UPDATE SET
    unread_count = EXCLUDED.unread_count, unread_event_count = EXCLUDED.unread_event_count,
    unread_reaction_count = EXCLUDED.unread_reaction_count, has_unread_reaction = EXCLUDED.has_unread_reaction,
    manually_unread = EXCLUDED.manually_unread, last_read_at = EXCLUDED.last_read_at, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_thread_unread_for(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_thread_unread_for(uuid, uuid) TO service_role;

-- Бэкафилл всех текущих пар доступа.
SELECT count(public.recompute_thread_unread_for(a.participant_id, t.id))
FROM public.project_threads t
CROSS JOIN LATERAL public.inbox_accessible_participant_ids(t.id) a
WHERE t.is_deleted = false;
