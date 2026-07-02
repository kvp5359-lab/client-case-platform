-- Превью события в инбоксе (last_event_text) брало ПОСЛЕДНЕЕ audit-событие любого
-- типа. Из-за этого тред, непрочитанный по смене статуса, показывал «Изменён дедлайн»
-- (перенос срока лёг позже). Теперь превью выбирает последнее ЗНАЧИМОЕ событие:
-- исключены change_deadline (фон, не сигнал) и silent-переходы статуса (silent_transition).
-- Тело снято с ПРОДА (drift), изменён только LATERAL `la`. Сигнатура та же → гранты целы.
CREATE OR REPLACE FUNCTION public.get_inbox_threads_v3_for(p_workspace_id uuid, p_user_id uuid, p_thread_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT p.id AS participant_id,
      EXISTS(SELECT 1 FROM workspace_roles wr WHERE wr.workspace_id = p_workspace_id AND wr.name = ANY(p.workspace_roles)
             AND (wr.is_owner OR (wr.permissions->>'view_all_projects')::boolean)) AS can_view_all
    FROM participants p WHERE p.workspace_id = p_workspace_id AND p.user_id = p_user_id AND p.is_deleted = false LIMIT 1
  ),
  base AS (
    SELECT us.thread_id, us.unread_count, us.unread_event_count, us.unread_reaction_count,
           us.has_unread_reaction, us.manually_unread, us.last_read_at,
           m.channel_type, m.email_contact, m.email_subject,
           me.participant_id AS my_participant, me.can_view_all
    FROM thread_unread_state us
    JOIN me ON me.participant_id = us.participant_id
    JOIN thread_inbox_meta m ON m.thread_id = us.thread_id
    WHERE p_thread_ids IS NULL OR us.thread_id = ANY(p_thread_ids)
  )
  SELECT
    b.thread_id, pt.name::text, pt.icon::text, pt.accent_color::text, pt.type::text, pt.project_id, pr.name::text,
    b.channel_type::text, pt.legacy_channel::text,
    lm.message_at, lm.message_text::text,
    (SELECT ma.file_name FROM message_attachments ma WHERE ma.message_id = lm.message_id ORDER BY ma.created_at ASC LIMIT 1)::text,
    COALESCE((SELECT count(*)::int FROM message_attachments ma WHERE ma.message_id = lm.message_id), 0),
    (SELECT ma.mime_type FROM message_attachments ma WHERE ma.message_id = lm.message_id ORDER BY ma.created_at ASC LIMIT 1)::text,
    COALESCE(NULLIF(TRIM(COALESCE(sender_p.name,'')||' '||COALESCE(sender_p.last_name,'')),''),
             NULLIF(TRIM(COALESCE(email_counter_p.name,'')||' '||COALESCE(email_counter_p.last_name,'')),''),
             lm.sender_name)::text,
    COALESCE(sender_p.avatar_url, email_counter_p.avatar_url)::text,
    b.unread_count, COALESCE(b.manually_unread, false),
    b.has_unread_reaction, b.unread_reaction_count, lr.emoji::text, lr.reaction_at,
    COALESCE(reactor_p.name, reactor_tg_p.name, lr.reactor_telegram_user_name)::text,
    COALESCE(reactor_p.avatar_url, reactor_tg_p.avatar_url)::text,
    lr.reacted_message_text::text, b.email_contact::text, b.email_subject::text, la.event_at,
    (COALESCE(la.actor_name || ' · ', '') || CASE
        WHEN la.action = 'change_status' AND las.status_name IS NOT NULL THEN 'Статус: ' || las.status_name
        WHEN la.action = 'change_status' THEN 'Изменён статус'
        WHEN la.action = 'change_deadline' THEN 'Изменён дедлайн'
        WHEN la.action = 'rename' THEN 'Переименовано'
        WHEN la.action = 'create' THEN 'Создано'
        WHEN la.action = 'delete' THEN 'Удалено'
        WHEN la.action = 'change_settings' THEN 'Изменены настройки'
        WHEN la.action = 'pin' THEN 'Закреплено'
        WHEN la.action = 'unpin' THEN 'Откреплено'
        WHEN la.action = 'change_assignees' THEN 'Изменены исполнители'
        ELSE la.action END)::text,
    las.status_color::text, b.unread_event_count,
    COALESCE(NULLIF(TRIM(COALESCE(counter_p.name,'')||' '||COALESCE(counter_p.last_name,'')),''),
             NULLIF(TRIM(COALESCE(email_counter_p.name,'')||' '||COALESCE(email_counter_p.last_name,'')),''),
             lcm.sender_name)::text,
    COALESCE(counter_p.avatar_url, email_counter_p.avatar_url, tg_av_business.avatar_url, tg_av_mtproto.avatar_url, tg_av_group.avatar_url, pt.wazzup_contact_avatar_url)::text,
    b.last_read_at, la.actor_avatar_url::text
  FROM base b
  JOIN project_threads pt ON pt.id = b.thread_id
  LEFT JOIN projects pr ON pr.id = pt.project_id AND pr.is_deleted = false
    AND (b.can_view_all OR EXISTS(SELECT 1 FROM project_participants pp WHERE pp.project_id = pr.id AND pp.participant_id = b.my_participant))
  LEFT JOIN LATERAL (
    SELECT pm.id AS message_id, pm.created_at AS message_at, pm.content AS message_text, pm.sender_name, pm.sender_participant_id
    FROM project_messages pm WHERE pm.thread_id = b.thread_id AND pm.source <> 'telegram_service'::message_source
    ORDER BY (CASE WHEN pm.sender_participant_id IS DISTINCT FROM b.my_participant AND (b.last_read_at IS NULL OR pm.created_at > b.last_read_at) THEN 0 ELSE 1 END) ASC, pm.created_at DESC
    LIMIT 1) lm ON true
  LEFT JOIN LATERAL (
    SELECT pm.sender_name, pm.sender_participant_id, pm.telegram_sender_user_id
    FROM project_messages pm WHERE pm.thread_id = b.thread_id AND pm.source <> 'telegram_service'::message_source
      AND (pm.sender_role IS NULL OR pm.sender_role NOT IN ('Администратор','Владелец','Сотрудник','Исполнитель'))
    ORDER BY pm.created_at DESC LIMIT 1) lcm ON true
  LEFT JOIN LATERAL (
    SELECT mr.emoji, mr.created_at AS reaction_at, mr.participant_id AS reactor_participant_id,
           mr.telegram_user_id AS reactor_telegram_user_id, mr.telegram_user_name AS reactor_telegram_user_name, pm.content AS reacted_message_text
    FROM message_reactions mr JOIN project_messages pm ON pm.id = mr.message_id
    WHERE pm.thread_id = b.thread_id AND mr.participant_id IS DISTINCT FROM b.my_participant
    ORDER BY mr.created_at DESC LIMIT 1) lr ON true
  LEFT JOIN LATERAL (
    SELECT al.created_at AS event_at, al.action, al.details, al.user_id AS actor_user_id, actor.actor_name, actor.actor_avatar_url
    FROM audit_logs al
    LEFT JOIN statuses evs ON al.action = 'change_status'
      AND (al.details->>'new_status') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND evs.id = (al.details->>'new_status')::uuid AND evs.workspace_id = p_workspace_id
    LEFT JOIN LATERAL (SELECT NULLIF(TRIM(COALESCE(pa.name,'')||' '||COALESCE(pa.last_name,'')),'') AS actor_name, pa.avatar_url AS actor_avatar_url
      FROM participants pa WHERE pa.user_id = al.user_id AND pa.workspace_id = p_workspace_id AND pa.is_deleted = false LIMIT 1) actor ON true
    WHERE al.resource_id = b.thread_id AND al.resource_type IN ('task','thread') AND al.user_id IS DISTINCT FROM p_user_id
      AND al.action <> 'change_deadline'
      AND (al.action <> 'change_status' OR COALESCE(evs.silent_transition, false) = false)
    ORDER BY al.created_at DESC LIMIT 1) la ON true
  LEFT JOIN statuses las_s ON la.action = 'change_status'
    AND (la.details->>'new_status') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND las_s.id = (la.details->>'new_status')::uuid AND las_s.workspace_id = p_workspace_id
  LEFT JOIN LATERAL (SELECT las_s.name AS status_name, las_s.color AS status_color) las ON true
  LEFT JOIN participants sender_p ON sender_p.id = lm.sender_participant_id
  LEFT JOIN participants counter_p ON counter_p.id = lcm.sender_participant_id AND counter_p.is_deleted = false
  LEFT JOIN participants reactor_p ON reactor_p.id = lr.reactor_participant_id AND reactor_p.is_deleted = false
  LEFT JOIN participants reactor_tg_p ON reactor_p.id IS NULL AND lr.reactor_telegram_user_id IS NOT NULL
    AND reactor_tg_p.workspace_id = p_workspace_id AND reactor_tg_p.telegram_user_id = lr.reactor_telegram_user_id AND reactor_tg_p.is_deleted = false
  LEFT JOIN telegram_user_avatars tg_av_business ON pt.business_client_tg_user_id IS NOT NULL AND tg_av_business.tg_user_id = pt.business_client_tg_user_id AND tg_av_business.is_missing = false
  LEFT JOIN telegram_user_avatars tg_av_mtproto ON pt.mtproto_client_tg_user_id IS NOT NULL AND tg_av_mtproto.tg_user_id = pt.mtproto_client_tg_user_id AND tg_av_mtproto.is_missing = false
  LEFT JOIN telegram_user_avatars tg_av_group ON lcm.telegram_sender_user_id IS NOT NULL AND tg_av_group.tg_user_id = lcm.telegram_sender_user_id AND tg_av_group.is_missing = false
  LEFT JOIN LATERAL (SELECT ecp.name, ecp.last_name, ecp.avatar_url FROM participants ecp
    WHERE ecp.workspace_id = p_workspace_id AND ecp.is_deleted = false
      AND lower(ecp.email) = lower(COALESCE(b.email_contact, pt.email_last_external_address))
    ORDER BY ecp.created_at ASC LIMIT 1) email_counter_p ON true
  ORDER BY GREATEST(lm.message_at, la.event_at) DESC NULLS LAST;
$function$;
