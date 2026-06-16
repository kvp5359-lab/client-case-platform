-- Инбокс: аватар автора события (кто менял статус/дедлайн) для превью.
-- Добавляем колонку last_event_sender_avatar_url в get_inbox_threads_v2 и
-- пробрасываем её через ВСЕ обёртки (page/unread/needs/awaiting/search/thread_one),
-- т.к. каждая объявляет колонки явно и тянет t.* из v2 → добавление колонки в v2
-- ломает их, если не расширить RETURNS TABLE. Колонка добавляется ПОСЛЕ
-- last_read_at (в page — перед sort_at), чтобы порядок t.* совпал.
--
-- Автор события резолвится одним LATERAL-джойном (имя + аватар за один лукап).
-- Доп. нагрузка ~ноль: участника по (user_id, workspace_id) мы уже искали ради
-- имени; обёртки только пробрасывают t.*, не считают.

-- Добавление колонки = смена типа возврата → CREATE OR REPLACE нельзя, нужен
-- DROP+CREATE. Дропаем дочерние (page/обёртки) до v2; создаём v2 первой
-- (check_function_bodies требует, чтобы вызываемая v2 уже существовала).
-- После — восстанавливаем гранты (anon только у needs/awaiting, как в проде).
DROP FUNCTION IF EXISTS public.get_inbox_threads_page(uuid, uuid, timestamptz, uuid, integer);
DROP FUNCTION IF EXISTS public.get_inbox_thread_one(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.get_inbox_unread_threads(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_inbox_needs_reply_threads(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_inbox_awaiting_reply_threads(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_inbox_search_threads(uuid, uuid, text, integer);
DROP FUNCTION IF EXISTS public.get_inbox_threads_v2(uuid, uuid);

-- ── 1. Базовая функция ────────────────────────────────────────────────────
CREATE FUNCTION public.get_inbox_threads_v2(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  user_participant AS (
    SELECT p.id AS participant_id, p.workspace_roles
    FROM participants p
    WHERE p.workspace_id = p_workspace_id AND p.user_id = p_user_id AND p.is_deleted = FALSE
    LIMIT 1
  ),
  user_is_internal AS (SELECT is_internal_member(p_workspace_id, p_user_id) AS allowed),
  can_view_all AS (
    SELECT EXISTS (
      SELECT 1 FROM workspace_roles wr, user_participant up
      WHERE wr.workspace_id = p_workspace_id AND wr.name = ANY(up.workspace_roles)
        AND (wr.is_owner = TRUE OR (wr.permissions->>'view_all_projects')::boolean = TRUE)
    ) AS allowed
  ),
  accessible_projects AS (
    SELECT proj.id, proj.name FROM projects proj
    WHERE proj.workspace_id = p_workspace_id AND proj.is_deleted = false
      AND ((SELECT allowed FROM can_view_all) OR proj.id IN (
        SELECT pp.project_id FROM project_participants pp, user_participant up
        WHERE pp.participant_id = up.participant_id))
  ),
  accessible_threads AS (
    SELECT pt.id, pt.project_id, pt.name, pt.icon, pt.accent_color, pt.legacy_channel, pt.access_type, pt.type,
           pt.business_client_tg_user_id, pt.mtproto_client_tg_user_id, pt.wazzup_contact_avatar_url,
           pt.email_last_external_address
    FROM project_threads pt
    INNER JOIN accessible_projects ap ON ap.id = pt.project_id
    WHERE pt.is_deleted = false
      AND ((pt.legacy_channel IS DISTINCT FROM 'internal') OR ((SELECT allowed FROM user_is_internal)))
    UNION
    SELECT pt.id, pt.project_id, pt.name, pt.icon, pt.accent_color, pt.legacy_channel, pt.access_type, pt.type,
           pt.business_client_tg_user_id, pt.mtproto_client_tg_user_id, pt.wazzup_contact_avatar_url,
           pt.email_last_external_address
    FROM project_threads pt
    WHERE pt.workspace_id = p_workspace_id
      AND pt.project_id IS NULL
      AND pt.is_deleted = false
      AND (
        pt.owner_user_id = p_user_id
        OR EXISTS (
          SELECT 1 FROM task_assignees ta
          JOIN participants par ON par.id = ta.participant_id
          WHERE ta.thread_id = pt.id AND par.user_id = p_user_id AND par.is_deleted = false
        )
        OR EXISTS (
          SELECT 1 FROM project_thread_members ptm
          JOIN participants par ON par.id = ptm.participant_id
          WHERE ptm.thread_id = pt.id AND par.user_id = p_user_id AND par.is_deleted = false
        )
      )
    UNION
    SELECT pt.id, pt.project_id, pt.name, pt.icon, pt.accent_color, pt.legacy_channel, pt.access_type, pt.type,
           pt.business_client_tg_user_id, pt.mtproto_client_tg_user_id, pt.wazzup_contact_avatar_url,
           pt.email_last_external_address
    FROM project_threads pt
    WHERE pt.workspace_id = p_workspace_id
      AND pt.project_id IS NOT NULL
      AND pt.is_deleted = false
      AND ((pt.legacy_channel IS DISTINCT FROM 'internal') OR ((SELECT allowed FROM user_is_internal)))
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          JOIN participants par ON par.id = ta.participant_id
          WHERE ta.thread_id = pt.id AND par.user_id = p_user_id AND par.is_deleted = false
        )
        OR EXISTS (
          SELECT 1 FROM project_thread_members ptm
          JOIN participants par ON par.id = ptm.participant_id
          WHERE ptm.thread_id = pt.id AND par.user_id = p_user_id AND par.is_deleted = false
        )
      )
  ),
  last_messages AS (
    SELECT DISTINCT ON (pm.thread_id)
      pm.id AS message_id, pm.thread_id, pm.created_at AS message_at,
      pm.content AS message_text, pm.sender_name, pm.sender_participant_id
    FROM project_messages pm
    INNER JOIN accessible_threads at ON at.id = pm.thread_id
    CROSS JOIN user_participant up
    LEFT JOIN message_read_status mrs ON mrs.thread_id = pm.thread_id AND mrs.participant_id = up.participant_id
    WHERE pm.source != 'telegram_service'::message_source
    ORDER BY
      pm.thread_id,
      (CASE
         WHEN pm.sender_participant_id IS DISTINCT FROM up.participant_id
          AND (mrs.last_read_at IS NULL OR pm.created_at > mrs.last_read_at)
         THEN 0 ELSE 1
       END) ASC,
      pm.created_at DESC
  ),
  last_client_messages AS (
    SELECT DISTINCT ON (pm.thread_id)
      pm.thread_id, pm.sender_name, pm.sender_participant_id, pm.telegram_sender_user_id, pm.source
    FROM project_messages pm
    INNER JOIN accessible_threads at ON at.id = pm.thread_id
    WHERE pm.source != 'telegram_service'::message_source
      AND (pm.sender_role IS NULL OR pm.sender_role NOT IN ('Администратор','Владелец','Сотрудник','Исполнитель'))
    ORDER BY pm.thread_id, pm.created_at DESC
  ),
  last_message_attachments AS (
    SELECT lm.thread_id,
      (SELECT ma.file_name FROM message_attachments ma WHERE ma.message_id = lm.message_id ORDER BY ma.created_at ASC LIMIT 1) AS first_file_name,
      (SELECT ma.mime_type FROM message_attachments ma WHERE ma.message_id = lm.message_id ORDER BY ma.created_at ASC LIMIT 1) AS first_mime_type,
      (SELECT COUNT(*)::int FROM message_attachments ma WHERE ma.message_id = lm.message_id) AS file_count
    FROM last_messages lm
  ),
  unread_counts AS (
    SELECT pm.thread_id, COUNT(*) AS cnt FROM project_messages pm
    INNER JOIN accessible_threads at ON at.id = pm.thread_id
    CROSS JOIN user_participant up
    LEFT JOIN message_read_status mrs ON mrs.participant_id = up.participant_id AND mrs.thread_id = pm.thread_id
    WHERE (mrs.last_read_at IS NULL OR pm.created_at > mrs.last_read_at)
      AND pm.sender_participant_id IS DISTINCT FROM up.participant_id
      AND pm.source != 'telegram_service'::message_source
    GROUP BY pm.thread_id
  ),
  manual_unread AS (
    SELECT mrs.thread_id, mrs.manually_unread, mrs.last_read_at FROM message_read_status mrs
    INNER JOIN user_participant up ON up.participant_id = mrs.participant_id
    WHERE mrs.thread_id IN (SELECT id FROM accessible_threads)
  ),
  last_reactions AS (
    SELECT DISTINCT ON (pm.thread_id)
      pm.thread_id, mr.emoji, mr.created_at AS reaction_at, mr.participant_id AS reactor_participant_id,
      mr.telegram_user_id AS reactor_telegram_user_id, mr.telegram_user_name AS reactor_telegram_user_name,
      pm.content AS reacted_message_text
    FROM message_reactions mr
    INNER JOIN project_messages pm ON pm.id = mr.message_id
    INNER JOIN accessible_threads at ON at.id = pm.thread_id
    CROSS JOIN user_participant up
    WHERE mr.participant_id IS DISTINCT FROM up.participant_id
    ORDER BY pm.thread_id, mr.created_at DESC
  ),
  unread_reaction_counts AS (
    SELECT pm.thread_id, COUNT(*) AS cnt FROM message_reactions mr
    INNER JOIN project_messages pm ON pm.id = mr.message_id
    INNER JOIN accessible_threads at ON at.id = pm.thread_id
    CROSS JOIN user_participant up
    LEFT JOIN message_read_status mrs ON mrs.participant_id = up.participant_id AND mrs.thread_id = pm.thread_id
    WHERE mr.participant_id IS DISTINCT FROM up.participant_id
      AND (mrs.last_read_at IS NULL OR mr.created_at > mrs.last_read_at)
    GROUP BY pm.thread_id
  ),
  telegram_links AS (
    SELECT ptc.thread_id FROM project_telegram_chats ptc
    WHERE ptc.thread_id IN (SELECT id FROM accessible_threads) AND ptc.is_active = true
  ),
  email_links AS (
    SELECT el.thread_id, el.contact_email, el.subject FROM project_thread_email_links el
    WHERE el.thread_id IN (SELECT id FROM accessible_threads) AND el.is_active = true
  ),
  last_audit AS (
    SELECT DISTINCT ON (al.resource_id)
      al.resource_id AS thread_id, al.created_at AS event_at, al.action, al.details, al.user_id AS actor_user_id,
      actor.actor_name, actor.actor_avatar_url
    FROM audit_logs al
    LEFT JOIN LATERAL (
      SELECT NULLIF(TRIM(COALESCE(pa.name, '') || ' ' || COALESCE(pa.last_name, '')), '') AS actor_name,
             pa.avatar_url AS actor_avatar_url
      FROM participants pa
      WHERE pa.user_id = al.user_id AND pa.workspace_id = p_workspace_id AND pa.is_deleted = FALSE
      LIMIT 1
    ) actor ON true
    WHERE al.resource_id IN (SELECT id FROM accessible_threads)
      AND al.resource_type IN ('task', 'thread') AND al.user_id IS DISTINCT FROM p_user_id
    ORDER BY al.resource_id, al.created_at DESC
  ),
  unread_audit AS (
    SELECT al.resource_id AS thread_id, COUNT(*) AS cnt FROM audit_logs al
    CROSS JOIN user_participant up
    LEFT JOIN message_read_status mrs ON mrs.participant_id = up.participant_id AND mrs.thread_id = al.resource_id
    LEFT JOIN statuses s_new
      ON al.action = 'change_status'
     AND (al.details->>'new_status') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND s_new.id = (al.details->>'new_status')::uuid AND s_new.workspace_id = p_workspace_id
    WHERE al.resource_id IN (SELECT id FROM accessible_threads)
      AND al.resource_type IN ('task', 'thread') AND al.user_id IS DISTINCT FROM p_user_id
      AND (mrs.last_read_at IS NULL OR al.created_at > mrs.last_read_at)
      AND (al.action <> 'change_status' OR COALESCE(s_new.silent_transition, false) = false)
    GROUP BY al.resource_id
  ),
  last_audit_status AS (
    SELECT la.thread_id, s.name AS status_name, s.color AS status_color FROM last_audit la
    LEFT JOIN statuses s
      ON la.action = 'change_status'
     AND (la.details->>'new_status') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND s.id = (la.details->>'new_status')::uuid AND s.workspace_id = p_workspace_id
  )
  SELECT
    at.id, at.name::TEXT, at.icon::TEXT, at.accent_color::TEXT, at.type::TEXT, at.project_id, ap.name::TEXT,
    CASE WHEN tl.thread_id IS NOT NULL THEN 'telegram' WHEN el.thread_id IS NOT NULL OR at.type = 'email' THEN 'email' ELSE 'web' END::TEXT,
    at.legacy_channel::TEXT, lm.message_at, lm.message_text::TEXT,
    lma.first_file_name::TEXT, COALESCE(lma.file_count, 0), lma.first_mime_type::TEXT,
    COALESCE(
      NULLIF(TRIM(COALESCE(sender_p.name, '') || ' ' || COALESCE(sender_p.last_name, '')), ''),
      NULLIF(TRIM(COALESCE(email_counter_p.name, '') || ' ' || COALESCE(email_counter_p.last_name, '')), ''),
      lm.sender_name
    )::TEXT,
    COALESCE(sender_p.avatar_url, email_counter_p.avatar_url)::TEXT,
    COALESCE(uc.cnt, 0), COALESCE(mu.manually_unread, FALSE),
    CASE WHEN lr.reaction_at IS NOT NULL AND (mu.last_read_at IS NULL OR lr.reaction_at > mu.last_read_at) THEN TRUE ELSE FALSE END,
    COALESCE(urc.cnt, 0), lr.emoji::TEXT, lr.reaction_at,
    COALESCE(reactor_p.name, reactor_tg_p.name, lr.reactor_telegram_user_name)::TEXT,
    COALESCE(reactor_p.avatar_url, reactor_tg_p.avatar_url)::TEXT,
    lr.reacted_message_text::TEXT, COALESCE(el.contact_email, at.email_last_external_address)::TEXT, el.subject::TEXT, la.event_at,
    (COALESCE(la.actor_name || ' · ', '') ||
    CASE
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
      ELSE la.action
    END)::TEXT,
    las.status_color::TEXT, COALESCE(ua.cnt, 0),
    COALESCE(
      NULLIF(TRIM(COALESCE(counter_p.name, '') || ' ' || COALESCE(counter_p.last_name, '')), ''),
      NULLIF(TRIM(COALESCE(email_counter_p.name, '') || ' ' || COALESCE(email_counter_p.last_name, '')), ''),
      lcm.sender_name
    )::TEXT,
    COALESCE(counter_p.avatar_url, email_counter_p.avatar_url, tg_av_business.avatar_url, tg_av_mtproto.avatar_url, tg_av_group.avatar_url, at.wazzup_contact_avatar_url)::TEXT,
    mu.last_read_at,
    la.actor_avatar_url::TEXT
  FROM accessible_threads at
  LEFT JOIN accessible_projects ap ON ap.id = at.project_id
  LEFT JOIN last_messages lm ON lm.thread_id = at.id
  LEFT JOIN last_client_messages lcm ON lcm.thread_id = at.id
  LEFT JOIN participants counter_p ON counter_p.id = lcm.sender_participant_id AND counter_p.is_deleted = FALSE
  LEFT JOIN telegram_user_avatars tg_av_business
    ON at.business_client_tg_user_id IS NOT NULL AND tg_av_business.tg_user_id = at.business_client_tg_user_id AND tg_av_business.is_missing = FALSE
  LEFT JOIN telegram_user_avatars tg_av_mtproto
    ON at.mtproto_client_tg_user_id IS NOT NULL AND tg_av_mtproto.tg_user_id = at.mtproto_client_tg_user_id AND tg_av_mtproto.is_missing = FALSE
  LEFT JOIN telegram_user_avatars tg_av_group
    ON lcm.telegram_sender_user_id IS NOT NULL AND tg_av_group.tg_user_id = lcm.telegram_sender_user_id AND tg_av_group.is_missing = FALSE
  LEFT JOIN last_message_attachments lma ON lma.thread_id = at.id
  LEFT JOIN participants sender_p ON sender_p.id = lm.sender_participant_id
  LEFT JOIN unread_counts uc ON uc.thread_id = at.id
  LEFT JOIN manual_unread mu ON mu.thread_id = at.id
  LEFT JOIN last_reactions lr ON lr.thread_id = at.id
  LEFT JOIN unread_reaction_counts urc ON urc.thread_id = at.id
  LEFT JOIN participants reactor_p ON reactor_p.id = lr.reactor_participant_id AND reactor_p.is_deleted = FALSE
  LEFT JOIN participants reactor_tg_p
    ON reactor_p.id IS NULL AND lr.reactor_telegram_user_id IS NOT NULL
   AND reactor_tg_p.workspace_id = p_workspace_id AND reactor_tg_p.telegram_user_id = lr.reactor_telegram_user_id AND reactor_tg_p.is_deleted = FALSE
  LEFT JOIN telegram_links tl ON tl.thread_id = at.id
  LEFT JOIN email_links el ON el.thread_id = at.id
  LEFT JOIN participants email_counter_p
    ON email_counter_p.workspace_id = p_workspace_id
   AND email_counter_p.is_deleted = FALSE
   AND lower(email_counter_p.email) = lower(COALESCE(el.contact_email, at.email_last_external_address))
  LEFT JOIN last_audit la ON la.thread_id = at.id
  LEFT JOIN last_audit_status las ON las.thread_id = at.id
  LEFT JOIN unread_audit ua ON ua.thread_id = at.id
  ORDER BY GREATEST(lm.message_at, la.event_at) DESC NULLS LAST;
$function$;

-- ── 2. Пагинированная обёртка (page) ──────────────────────────────────────
CREATE FUNCTION public.get_inbox_threads_page(p_workspace_id uuid, p_user_id uuid, p_cursor_sort_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_thread_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text, sort_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH full_result AS (
    SELECT
      t.*,
      COALESCE(
        pt_meta.inbox_sort_at,
        GREATEST(t.last_message_at, t.last_event_at),
        pt_meta.created_at
      ) AS sort_at
    FROM get_inbox_threads_v2(p_workspace_id, p_user_id) t
    LEFT JOIN project_threads pt_meta ON pt_meta.id = t.thread_id
  ),
  main_page AS (
    SELECT *
    FROM full_result
    WHERE p_cursor_sort_at IS NULL
       OR (sort_at, thread_id) < (p_cursor_sort_at, p_cursor_thread_id)
    ORDER BY sort_at DESC, thread_id DESC
    LIMIT GREATEST(p_limit, 1)
  ),
  manual_unread_extras AS (
    SELECT *
    FROM full_result
    WHERE p_cursor_sort_at IS NULL
      AND manually_unread = true
  )
  SELECT *
  FROM (
    SELECT * FROM main_page
    UNION
    SELECT * FROM manual_unread_extras
  ) AS combined
  ORDER BY sort_at DESC, thread_id DESC;
$function$;

-- ── 3. Обёртки-фильтры (SELECT t.*) ───────────────────────────────────────
CREATE FUNCTION public.get_inbox_thread_one(p_workspace_id uuid, p_user_id uuid, p_thread_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.*
  FROM get_inbox_threads_v2(p_workspace_id, p_user_id) t
  WHERE t.thread_id = p_thread_id
  LIMIT 1;
$function$;

CREATE FUNCTION public.get_inbox_unread_threads(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.*
  FROM get_inbox_threads_v2(p_workspace_id, p_user_id) t
  WHERE COALESCE(t.unread_count, 0) > 0
     OR COALESCE(t.unread_event_count, 0) > 0
     OR COALESCE(t.unread_reaction_count, 0) > 0
     OR t.has_unread_reaction = true
     OR t.manually_unread = true
  ORDER BY COALESCE(t.manually_unread, false) DESC,
           COALESCE(GREATEST(t.last_message_at, t.last_event_at), 'epoch'::timestamptz) DESC,
           t.thread_id DESC;
$function$;

CREATE FUNCTION public.get_inbox_needs_reply_threads(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.*
  FROM get_inbox_threads_v2(p_workspace_id, p_user_id) t
  WHERE t.last_message_at IS NOT NULL
    AND COALESCE(t.unread_count, 0) = 0
    AND COALESCE(t.unread_event_count, 0) = 0
    AND COALESCE(t.unread_reaction_count, 0) = 0
    AND t.has_unread_reaction = false
    AND COALESCE(t.manually_unread, false) = false
    AND is_staff_role((
      SELECT lm.sender_role
      FROM project_messages lm
      WHERE lm.thread_id = t.thread_id
        AND lm.source <> 'telegram_service'::message_source
      ORDER BY lm.created_at DESC
      LIMIT 1
    )) IS NOT TRUE
    AND EXISTS (
      SELECT 1 FROM project_messages e
      WHERE e.thread_id = t.thread_id
        AND e.source IN (
          'telegram'::message_source, 'telegram_business'::message_source,
          'telegram_mtproto'::message_source, 'wazzup'::message_source,
          'email_internal'::message_source, 'email'::message_source
        )
    )
  ORDER BY COALESCE(GREATEST(t.last_message_at, t.last_event_at), 'epoch'::timestamptz) DESC,
           t.thread_id DESC;
$function$;

CREATE FUNCTION public.get_inbox_awaiting_reply_threads(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.*
  FROM get_inbox_threads_v2(p_workspace_id, p_user_id) t
  WHERE t.last_message_at IS NOT NULL
    AND COALESCE(t.unread_count, 0) = 0
    AND COALESCE(t.unread_event_count, 0) = 0
    AND COALESCE(t.unread_reaction_count, 0) = 0
    AND t.has_unread_reaction = false
    AND COALESCE(t.manually_unread, false) = false
    AND is_staff_role((
      SELECT lm.sender_role
      FROM project_messages lm
      WHERE lm.thread_id = t.thread_id
        AND lm.source <> 'telegram_service'::message_source
      ORDER BY lm.created_at DESC
      LIMIT 1
    ))
    AND EXISTS (
      SELECT 1 FROM project_messages e
      WHERE e.thread_id = t.thread_id
        AND e.source IN (
          'telegram'::message_source, 'telegram_business'::message_source,
          'telegram_mtproto'::message_source, 'wazzup'::message_source,
          'email_internal'::message_source, 'email'::message_source
        )
    )
  ORDER BY COALESCE(GREATEST(t.last_message_at, t.last_event_at), 'epoch'::timestamptz) DESC,
           t.thread_id DESC;
$function$;

CREATE FUNCTION public.get_inbox_search_threads(p_workspace_id uuid, p_user_id uuid, p_query text, p_limit integer DEFAULT 50)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pat
  )
  SELECT t.*
  FROM get_inbox_threads_v2(p_workspace_id, p_user_id) t, q
  WHERE btrim(p_query) <> ''
    AND (
      t.thread_name ILIKE q.pat ESCAPE '\'
      OR t.project_name ILIKE q.pat ESCAPE '\'
    )
  ORDER BY COALESCE(GREATEST(t.last_message_at, t.last_event_at), 'epoch'::timestamptz) DESC,
           t.thread_id DESC
  LIMIT GREATEST(p_limit, 1);
$function$;

-- ── 4. Восстановление грантов (DROP их снёс; anon вернётся по умолчанию) ───
REVOKE ALL ON FUNCTION public.get_inbox_threads_v2(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_inbox_threads_page(uuid, uuid, timestamptz, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_inbox_thread_one(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_inbox_unread_threads(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_inbox_search_threads(uuid, uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_inbox_needs_reply_threads(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_inbox_awaiting_reply_threads(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_inbox_threads_v2(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_inbox_threads_page(uuid, uuid, timestamptz, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_inbox_thread_one(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_inbox_unread_threads(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_inbox_search_threads(uuid, uuid, text, integer) TO authenticated, service_role;
-- needs/awaiting в проде имели anon EXECUTE — сохраняем как было.
GRANT EXECUTE ON FUNCTION public.get_inbox_needs_reply_threads(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_inbox_awaiting_reply_threads(uuid, uuid) TO anon, authenticated, service_role;
