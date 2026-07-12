-- Bus factor / автосмок: smoke_send_test принимает p_visibility, чтобы
-- smoke-matrix мог end-to-end проверить гейт утечки (внутреннее сообщение
-- НЕ должно уходить в канал). allowlist-защита сохранена. service_role-only.
DROP FUNCTION IF EXISTS public.smoke_send_test(uuid, uuid, text);
CREATE FUNCTION public.smoke_send_test(
  p_thread_id uuid,
  p_reply_to uuid DEFAULT NULL::uuid,
  p_label text DEFAULT NULL::text,
  p_visibility text DEFAULT 'client'::text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_ws uuid; v_id uuid; v_pid uuid; v_name text; v_body text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM smoke_test_threads WHERE thread_id = p_thread_id) THEN
    RAISE EXCEPTION 'Тред % не в allowlist смок-теста — отправка запрещена', p_thread_id;
  END IF;
  SELECT workspace_id INTO v_ws FROM project_threads WHERE id = p_thread_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'Тред % не найден', p_thread_id; END IF;
  IF p_reply_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM project_messages WHERE id = p_reply_to AND thread_id = p_thread_id
  ) THEN
    RAISE EXCEPTION 'reply-оригинал % не в треде', p_reply_to;
  END IF;

  SELECT id, TRIM(COALESCE(name,'') || ' ' || COALESCE(last_name,'')) INTO v_pid, v_name
  FROM participants
  WHERE workspace_id = v_ws AND user_id IS NOT NULL AND is_deleted = false
    AND ('Владелец' = ANY(workspace_roles) OR 'Администратор' = ANY(workspace_roles))
  ORDER BY created_at LIMIT 1;

  v_body := '🔧 Смок' || COALESCE(' ['||p_label||']','') || ' ' || to_char(now(), 'HH24:MI:SS') || ' — можно игнорировать';

  INSERT INTO project_messages (thread_id, workspace_id, sender_name, sender_participant_id, sender_role, content, source, visibility, reply_to_message_id)
  VALUES (p_thread_id, v_ws, COALESCE(NULLIF(v_name,''),'SMOKE-TEST'), v_pid, 'Владелец', v_body, 'web', COALESCE(p_visibility,'client'), p_reply_to)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.smoke_send_test(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smoke_send_test(uuid, uuid, text, text) TO service_role;
