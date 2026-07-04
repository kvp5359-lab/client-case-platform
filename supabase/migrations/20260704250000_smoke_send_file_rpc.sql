-- Смок-отправка с вложениями: message + files/message_attachments + форс-диспатч.
-- content для file-only = '📎' (CHECK char_length>0). Node грузит байты в бакет
-- `files` заранее. Только allowlist-треды. service_role only. Применено в прод.
CREATE OR REPLACE FUNCTION public.smoke_send_file(
  p_thread_id uuid, p_message_id uuid, p_with_text boolean, p_files jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ws uuid; v_pid uuid; v_uid uuid; v_name text; v_body text; f jsonb; v_file_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM smoke_test_threads WHERE thread_id = p_thread_id) THEN
    RAISE EXCEPTION 'Тред % не в allowlist смок-теста', p_thread_id;
  END IF;
  SELECT workspace_id INTO v_ws FROM project_threads WHERE id = p_thread_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'Тред % не найден', p_thread_id; END IF;
  SELECT id, user_id, TRIM(COALESCE(name,'') || ' ' || COALESCE(last_name,'')) INTO v_pid, v_uid, v_name
  FROM participants WHERE workspace_id=v_ws AND user_id IS NOT NULL AND is_deleted=false
    AND ('Владелец' = ANY(workspace_roles) OR 'Администратор' = ANY(workspace_roles))
  ORDER BY created_at LIMIT 1;
  v_body := CASE WHEN p_with_text
    THEN '🔧 Смок [file+text] ' || to_char(now(),'HH24:MI:SS') || ' — можно игнорировать'
    ELSE '📎' END;
  INSERT INTO project_messages (id, thread_id, workspace_id, sender_name, sender_participant_id, sender_role, content, source, visibility, has_attachments)
  VALUES (p_message_id, p_thread_id, v_ws, COALESCE(NULLIF(v_name,''),'SMOKE-TEST'), v_pid, 'Владелец', v_body, 'web', 'client', true);
  FOR f IN SELECT * FROM jsonb_array_elements(p_files) LOOP
    INSERT INTO files (workspace_id, bucket, storage_path, file_name, file_size, mime_type, uploaded_by)
    VALUES (v_ws, 'files', f->>'path', f->>'name', (f->>'size')::bigint, f->>'mime', v_uid)
    RETURNING id INTO v_file_id;
    INSERT INTO message_attachments (message_id, file_name, file_size, mime_type, storage_path, file_id)
    VALUES (p_message_id, f->>'name', (f->>'size')::bigint, f->>'mime', f->>'path', v_file_id);
  END LOOP;
  PERFORM dispatch_message_to_channels(p_message_id, true);
  RETURN p_message_id;
END;
$$;
REVOKE ALL ON FUNCTION public.smoke_send_file(uuid, uuid, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smoke_send_file(uuid, uuid, boolean, jsonb) TO service_role;
