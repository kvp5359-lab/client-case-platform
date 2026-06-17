-- Единая функция материализации одной строки thread_inbox_meta.
-- Используется бэкафиллом, триггерами и сверочным джобом (один источник логики).
CREATE OR REPLACE FUNCTION public.compute_thread_inbox_meta(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_thread RECORD;
  v_lm RECORD;
  v_le RECORD;
  v_lr RECORD;
BEGIN
  SELECT id, type, inbox_sort_at, created_at, email_last_external_address
    INTO v_thread FROM project_threads WHERE id = p_thread_id AND is_deleted = false;
  IF NOT FOUND THEN
    DELETE FROM thread_inbox_meta WHERE thread_id = p_thread_id;
    RETURN;
  END IF;

  SELECT pm.id, pm.created_at, pm.content, pm.sender_participant_id, pm.sender_name, pm.sender_role
    INTO v_lm
    FROM project_messages pm
    WHERE pm.thread_id = p_thread_id AND pm.source <> 'telegram_service'::message_source
    ORDER BY pm.created_at DESC LIMIT 1;

  SELECT al.id, al.created_at, al.action, al.details, al.user_id
    INTO v_le
    FROM audit_logs al
    WHERE al.resource_id = p_thread_id AND al.resource_type IN ('task','thread')
    ORDER BY al.created_at DESC LIMIT 1;

  SELECT mr.id, mr.emoji, mr.created_at, pm.id AS msg_id, pm.content, mr.participant_id, mr.telegram_user_id
    INTO v_lr
    FROM message_reactions mr
    JOIN project_messages pm ON pm.id = mr.message_id
    WHERE pm.thread_id = p_thread_id
    ORDER BY mr.created_at DESC LIMIT 1;

  INSERT INTO thread_inbox_meta AS m (
    thread_id, last_message_id, last_message_at, last_message_text, last_sender_participant_id,
    last_sender_name, last_sender_role,
    last_message_attachment_name, last_message_attachment_mime, last_message_attachment_count,
    last_event_id, last_event_at, last_event_action, last_event_details, last_event_actor_user_id,
    last_reaction_id, last_reaction_emoji, last_reaction_at, last_reaction_message_id,
    last_reaction_message_text, last_reactor_participant_id, last_reactor_telegram_user_id,
    channel_type, has_external, last_from_staff, email_contact, email_subject, sort_at, updated_at
  ) VALUES (
    p_thread_id, v_lm.id, v_lm.created_at, v_lm.content, v_lm.sender_participant_id,
    v_lm.sender_name, v_lm.sender_role,
    (SELECT ma.file_name FROM message_attachments ma WHERE ma.message_id = v_lm.id ORDER BY ma.created_at ASC LIMIT 1),
    (SELECT ma.mime_type FROM message_attachments ma WHERE ma.message_id = v_lm.id ORDER BY ma.created_at ASC LIMIT 1),
    COALESCE((SELECT count(*)::int FROM message_attachments ma WHERE ma.message_id = v_lm.id), 0),
    v_le.id, v_le.created_at, v_le.action, v_le.details, v_le.user_id,
    v_lr.id, v_lr.emoji, v_lr.created_at, v_lr.msg_id,
    v_lr.content, v_lr.participant_id, v_lr.telegram_user_id,
    CASE
      WHEN EXISTS(SELECT 1 FROM project_telegram_chats ptc WHERE ptc.thread_id = p_thread_id AND ptc.is_active) THEN 'telegram'
      WHEN EXISTS(SELECT 1 FROM project_thread_email_links el WHERE el.thread_id = p_thread_id AND el.is_active) OR v_thread.type = 'email' THEN 'email'
      ELSE 'web'
    END,
    EXISTS(SELECT 1 FROM project_messages e WHERE e.thread_id = p_thread_id
           AND e.source IN ('telegram'::message_source,'telegram_business'::message_source,'telegram_mtproto'::message_source,'wazzup'::message_source,'email_internal'::message_source,'email'::message_source)),
    is_staff_role(v_lm.sender_role),
    COALESCE((SELECT el.contact_email FROM project_thread_email_links el WHERE el.thread_id = p_thread_id AND el.is_active ORDER BY el.created_at LIMIT 1), v_thread.email_last_external_address),
    (SELECT el.subject FROM project_thread_email_links el WHERE el.thread_id = p_thread_id AND el.is_active ORDER BY el.created_at LIMIT 1),
    COALESCE(v_thread.inbox_sort_at, GREATEST(v_lm.created_at, v_le.created_at), v_thread.created_at),
    now()
  )
  ON CONFLICT (thread_id) DO UPDATE SET
    last_message_id = EXCLUDED.last_message_id, last_message_at = EXCLUDED.last_message_at,
    last_message_text = EXCLUDED.last_message_text, last_sender_participant_id = EXCLUDED.last_sender_participant_id,
    last_sender_name = EXCLUDED.last_sender_name, last_sender_role = EXCLUDED.last_sender_role,
    last_message_attachment_name = EXCLUDED.last_message_attachment_name,
    last_message_attachment_mime = EXCLUDED.last_message_attachment_mime,
    last_message_attachment_count = EXCLUDED.last_message_attachment_count,
    last_event_id = EXCLUDED.last_event_id, last_event_at = EXCLUDED.last_event_at,
    last_event_action = EXCLUDED.last_event_action, last_event_details = EXCLUDED.last_event_details,
    last_event_actor_user_id = EXCLUDED.last_event_actor_user_id,
    last_reaction_id = EXCLUDED.last_reaction_id, last_reaction_emoji = EXCLUDED.last_reaction_emoji,
    last_reaction_at = EXCLUDED.last_reaction_at, last_reaction_message_id = EXCLUDED.last_reaction_message_id,
    last_reaction_message_text = EXCLUDED.last_reaction_message_text,
    last_reactor_participant_id = EXCLUDED.last_reactor_participant_id,
    last_reactor_telegram_user_id = EXCLUDED.last_reactor_telegram_user_id,
    channel_type = EXCLUDED.channel_type, has_external = EXCLUDED.has_external,
    last_from_staff = EXCLUDED.last_from_staff, email_contact = EXCLUDED.email_contact,
    email_subject = EXCLUDED.email_subject, sort_at = EXCLUDED.sort_at, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.compute_thread_inbox_meta(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_thread_inbox_meta(uuid) TO service_role;

-- Бэкафилл существующих тредов.
SELECT public.compute_thread_inbox_meta(id) FROM public.project_threads WHERE is_deleted = false;
