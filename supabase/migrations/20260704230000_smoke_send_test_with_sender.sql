-- Смок-отправка с отправителем-сотрудником (владелец/админ воркспейса), чтобы
-- тестовый бабл рисовался ИСХОДЯЩИМ, а не входящим/непрочитанным. Применено в прод.
CREATE OR REPLACE FUNCTION public.smoke_send_test(p_thread_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ws uuid; v_id uuid; v_pid uuid; v_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM smoke_test_threads WHERE thread_id = p_thread_id) THEN
    RAISE EXCEPTION 'Тред % не в allowlist смок-теста — отправка запрещена', p_thread_id;
  END IF;
  SELECT workspace_id INTO v_ws FROM project_threads WHERE id = p_thread_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'Тред % не найден', p_thread_id; END IF;
  SELECT id, TRIM(COALESCE(name,'') || ' ' || COALESCE(last_name,'')) INTO v_pid, v_name
  FROM participants
  WHERE workspace_id = v_ws AND user_id IS NOT NULL AND is_deleted = false
    AND ('Владелец' = ANY(workspace_roles) OR 'Администратор' = ANY(workspace_roles))
  ORDER BY created_at LIMIT 1;
  INSERT INTO project_messages (thread_id, workspace_id, sender_name, sender_participant_id, sender_role, content, source, visibility)
  VALUES (p_thread_id, v_ws, COALESCE(NULLIF(v_name,''),'SMOKE-TEST'), v_pid, 'Владелец',
          '🔧 Смок-тест канала ' || to_char(now(), 'HH24:MI:SS') || ' — можно игнорировать',
          'web', 'client')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.smoke_send_test(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smoke_send_test(uuid) TO service_role;
