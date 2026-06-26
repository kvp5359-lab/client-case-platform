-- route_incoming_to_project: иконка/цвет нового треда-лида берутся из
-- настраиваемых дефолтов канала (workspaces.channel_defaults) через
-- resolve_channel_default, а не из жёсткого CASE. Заодно фикс 'red' → 'rose'
-- (старый CASE писал невалидный для фронта 'red' email-лидам).
--
-- Тело снято с прода (drift repo↔prod) и изменён ТОЛЬКО блок icon/accent_color
-- при INSERT нового треда. Остальная логика без изменений.

CREATE OR REPLACE FUNCTION public.route_incoming_to_project(
  p_workspace_id uuid,
  p_source text,
  p_channel_type text,
  p_external_id text,
  p_sender_name text DEFAULT NULL::text,
  p_thread_name text DEFAULT NULL::text
)
RETURNS TABLE(participant_id uuid, project_id uuid, thread_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id uuid;
  v_project_id uuid;
  v_thread_id uuid;
  v_template_id uuid;
  v_status_id uuid;
  v_status text;
  v_normalized_external_id text;
  v_channel_key text;
  v_def_icon text;
  v_def_accent text;
BEGIN
  v_normalized_external_id := trim(p_external_id);
  IF p_channel_type = 'email' THEN
    v_normalized_external_id := lower(v_normalized_external_id);
  END IF;

  IF v_normalized_external_id = '' THEN
    RETURN;
  END IF;

  SELECT pc.participant_id INTO v_participant_id
  FROM participant_channels pc
  WHERE pc.workspace_id = p_workspace_id
    AND pc.channel_type = p_channel_type
    AND pc.external_id = v_normalized_external_id
  LIMIT 1;

  IF v_participant_id IS NULL THEN
    INSERT INTO participants (
      workspace_id, name, email,
      workspace_roles, can_login, user_id
    ) VALUES (
      p_workspace_id,
      COALESCE(NULLIF(trim(p_sender_name), ''), 'Без имени'),
      CASE
        WHEN p_channel_type = 'email' THEN v_normalized_external_id
        ELSE p_channel_type || '_' || substr(md5(v_normalized_external_id || clock_timestamp()::text), 1, 12) || '@' || p_channel_type || '.placeholder'
      END,
      '{}'::text[],
      false,
      NULL
    )
    RETURNING id INTO v_participant_id;

    INSERT INTO participant_channels (
      participant_id, workspace_id, channel_type, external_id, is_primary
    ) VALUES (
      v_participant_id, p_workspace_id, p_channel_type, v_normalized_external_id, true
    )
    ON CONFLICT (workspace_id, channel_type, external_id) DO NOTHING;
  END IF;

  SELECT pr.id INTO v_project_id
  FROM projects pr
  LEFT JOIN statuses st ON st.id = pr.status_id
  WHERE pr.workspace_id = p_workspace_id
    AND pr.contact_participant_id = v_participant_id
    AND pr.is_deleted = false
    AND (st.id IS NULL OR st.is_final = false)
  ORDER BY pr.last_activity_at DESC NULLS LAST, pr.created_at DESC
  LIMIT 1;

  IF v_project_id IS NOT NULL THEN
    v_status := 'matched';
  ELSE
    SELECT (default_lead_template_per_source->>p_source)::uuid INTO v_template_id
    FROM workspaces WHERE id = p_workspace_id;

    IF v_template_id IS NULL THEN
      participant_id := v_participant_id;
      project_id := NULL;
      thread_id := NULL;
      status := 'no_template';
      RETURN NEXT;
      RETURN;
    END IF;

    SELECT s.id INTO v_status_id
    FROM project_template_statuses pts
    JOIN statuses s ON s.id = pts.status_id
    WHERE pts.template_id = v_template_id
    ORDER BY pts.is_default DESC, pts.order_index ASC
    LIMIT 1;

    INSERT INTO projects (
      workspace_id, name, template_id, status_id,
      contact_participant_id, created_by
    ) VALUES (
      p_workspace_id,
      COALESCE(NULLIF(trim(p_sender_name), ''), 'Без имени') ||
        ' (' ||
        CASE p_source
          WHEN 'email' THEN 'Email'
          WHEN 'telegram' THEN 'Telegram'
          WHEN 'telegram_business' THEN 'Telegram'
          WHEN 'telegram_mtproto' THEN 'Telegram'
          WHEN 'wazzup' THEN 'WhatsApp'
          ELSE p_source
        END ||
        ')',
      v_template_id,
      v_status_id,
      v_participant_id,
      NULL
    ) RETURNING id INTO v_project_id;

    v_status := 'new_lead';
  END IF;

  SELECT pt.id INTO v_thread_id
  FROM project_threads pt
  JOIN participant_channels pc
    ON pc.workspace_id = p_workspace_id
   AND pc.channel_type = p_channel_type
   AND pc.external_id = v_normalized_external_id
  WHERE pt.project_id = v_project_id
    AND pt.is_deleted = false
  LIMIT 1;

  IF v_thread_id IS NULL THEN
    -- Дефолты иконки/цвета канала (настраиваемые на воркспейсе).
    v_channel_key := CASE p_source
      WHEN 'telegram'          THEN 'telegram'
      WHEN 'telegram_business' THEN 'telegram_personal'
      WHEN 'telegram_mtproto'  THEN 'telegram_personal'
      WHEN 'wazzup'            THEN 'wazzup'
      WHEN 'email'             THEN 'email'
      ELSE 'telegram'
    END;
    SELECT rcd.icon, rcd.accent_color INTO v_def_icon, v_def_accent
    FROM resolve_channel_default(p_workspace_id, v_channel_key) rcd;

    INSERT INTO project_threads (
      project_id, workspace_id, name, type, access_type,
      icon, accent_color, created_by
    ) VALUES (
      v_project_id,
      p_workspace_id,
      COALESCE(NULLIF(trim(p_thread_name), ''), 'Новое сообщение'),
      'chat',
      'all',
      v_def_icon,
      v_def_accent,
      NULL
    ) RETURNING id INTO v_thread_id;
  END IF;

  participant_id := v_participant_id;
  project_id := v_project_id;
  thread_id := v_thread_id;
  status := v_status;
  RETURN NEXT;
  RETURN;
END;
$function$;
