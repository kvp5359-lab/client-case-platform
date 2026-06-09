-- ============================================================================
-- Доступ к треду внутри проекта через исполнителя / участника задачи,
-- даже когда у пользователя НЕТ доступа к самому проекту.
--
-- Контекст. До этой миграции для тредов с project_id функции доступа
-- (can_user_access_thread) и RPC-листинги (get_inbox_threads_v2,
-- get_inbox_thread_aggregates) сначала требовали роль в проекте
-- (project_participants) и обрывались (v_project_roles IS NULL -> false)
-- ещё ДО проверки task_assignees / project_thread_members. В результате
-- назначение сотрудника исполнителем задачи проекта или добавление его
-- участником треда НЕ давало доступа, если у него не было доступа к проекту.
--
-- Для orphan-тредов (project_id IS NULL) этот доступ уже работал
-- (20260520_orphan_thread_access_for_any_type). Эта миграция распространяет
-- ту же логику на треды внутри проекта.
--
-- Решение (чисто аддитивное):
--   1. can_user_access_thread (обе сигнатуры) — проверка assignee + member
--      ПЕРЕД гейтом по project_roles. Участник любого режима доступа.
--   2. get_inbox_threads_v2 / get_inbox_thread_aggregates — третья ветка
--      accessible_threads: треды с project_id, где юзер assignee/member.
--   3. get_workspace_threads — участник треда виден в любом режиме доступа.
--
-- ВАЖНО: сигнатура (uuid, uuid) охраняет также project_messages и message_*,
-- поэтому исполнитель/участник получает доступ и к ПЕРЕПИСКЕ треда. UPDATE/DELETE
-- сообщений дополнительно ограничены автором — чужое править нельзя.
--
-- Тела RPC взяты из ЖИВОЙ БД (с колонками last_message_attachment_mime в
-- inbox_v2 и start_at/end_at в get_workspace_threads — они были применены
-- напрямую без файла-миграции в репо; здесь зафиксированы).
-- ============================================================================

-- ── 1a. RLS row-overload (project_threads, uuid) ───────────────────────────
CREATE OR REPLACE FUNCTION public.can_user_access_thread(
  t public.project_threads,
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id uuid;
  v_project_roles text[];
  v_workspace_roles text[];
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  IF t.project_id IS NULL THEN
    IF t.owner_user_id = p_user_id THEN RETURN true; END IF;
    IF t.created_by = p_user_id THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM task_assignees ta JOIN participants par ON par.id = ta.participant_id
      WHERE ta.thread_id = t.id AND par.user_id = p_user_id AND par.is_deleted = false) THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM project_thread_members ptm JOIN participants par ON par.id = ptm.participant_id
      WHERE ptm.thread_id = t.id AND par.user_id = p_user_id AND par.is_deleted = false) THEN RETURN true; END IF;
    RETURN EXISTS (SELECT 1 FROM participants par
      JOIN workspace_roles wr ON wr.name = ANY(par.workspace_roles) AND wr.workspace_id = par.workspace_id
      WHERE par.user_id = p_user_id AND par.workspace_id = t.workspace_id AND par.is_deleted = false
        AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true));
  END IF;

  SELECT par.id, par.workspace_roles INTO v_participant_id, v_workspace_roles
    FROM participants par
    WHERE par.user_id = p_user_id AND par.workspace_id = t.workspace_id AND par.is_deleted = false;
  IF v_participant_id IS NULL THEN RETURN false; END IF;
  v_workspace_roles := COALESCE(v_workspace_roles, '{}');

  IF EXISTS(SELECT 1 FROM workspace_roles wr
    WHERE wr.workspace_id = t.workspace_id AND wr.name = ANY(v_workspace_roles)
      AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true)) THEN RETURN true; END IF;

  -- Исполнитель задачи — НЕЗАВИСИМО от участия в проекте.
  IF EXISTS(SELECT 1 FROM task_assignees ta
    WHERE ta.thread_id = t.id AND ta.participant_id = v_participant_id) THEN RETURN true; END IF;
  -- Явный участник треда — НЕЗАВИСИМО от участия в проекте и режима.
  IF EXISTS(SELECT 1 FROM project_thread_members ptm
    WHERE ptm.thread_id = t.id AND ptm.participant_id = v_participant_id) THEN RETURN true; END IF;

  IF t.created_by = p_user_id THEN RETURN true; END IF;

  SELECT pp.project_roles INTO v_project_roles
    FROM project_participants pp
    WHERE pp.project_id = t.project_id AND pp.participant_id = v_participant_id;
  IF v_project_roles IS NULL THEN RETURN false; END IF;

  IF 'Администратор' = ANY(v_project_roles) THEN RETURN true; END IF;
  IF t.access_type = 'all' THEN RETURN true; END IF;
  IF t.access_type = 'roles' AND COALESCE(t.access_roles, '{}') && v_project_roles THEN RETURN true; END IF;
  RETURN false;
END;
$function$;

-- ── 1b. RLS (uuid, uuid) ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_user_access_thread(p_thread_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_thread RECORD;
  v_participant_id uuid;
  v_project_roles text[];
  v_workspace_roles text[];
BEGIN
  IF p_thread_id IS NULL OR p_user_id IS NULL THEN RETURN false; END IF;

  SELECT id, type, project_id, workspace_id, access_type, access_roles, created_by, owner_user_id
    INTO v_thread FROM project_threads WHERE id = p_thread_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_thread.project_id IS NULL THEN
    IF v_thread.owner_user_id = p_user_id THEN RETURN true; END IF;
    IF v_thread.created_by = p_user_id THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM task_assignees ta JOIN participants par ON par.id = ta.participant_id
      WHERE ta.thread_id = p_thread_id AND par.user_id = p_user_id AND par.is_deleted = false) THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM project_thread_members ptm JOIN participants par ON par.id = ptm.participant_id
      WHERE ptm.thread_id = p_thread_id AND par.user_id = p_user_id AND par.is_deleted = false) THEN RETURN true; END IF;
    RETURN EXISTS (SELECT 1 FROM participants par
      JOIN workspace_roles wr ON wr.name = ANY(par.workspace_roles) AND wr.workspace_id = par.workspace_id
      WHERE par.user_id = p_user_id AND par.workspace_id = v_thread.workspace_id AND par.is_deleted = false
        AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true));
  END IF;

  SELECT par.id, par.workspace_roles INTO v_participant_id, v_workspace_roles
    FROM participants par
    WHERE par.user_id = p_user_id AND par.workspace_id = v_thread.workspace_id AND par.is_deleted = false;
  IF v_participant_id IS NULL THEN RETURN false; END IF;
  v_workspace_roles := COALESCE(v_workspace_roles, '{}');

  IF EXISTS(SELECT 1 FROM workspace_roles wr
    WHERE wr.workspace_id = v_thread.workspace_id AND wr.name = ANY(v_workspace_roles)
      AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true)) THEN RETURN true; END IF;

  -- Исполнитель задачи — НЕЗАВИСИМО от участия в проекте.
  IF EXISTS(SELECT 1 FROM task_assignees ta
    WHERE ta.thread_id = p_thread_id AND ta.participant_id = v_participant_id) THEN RETURN true; END IF;
  -- Явный участник треда — НЕЗАВИСИМО от участия в проекте и режима.
  IF EXISTS(SELECT 1 FROM project_thread_members ptm
    WHERE ptm.thread_id = p_thread_id AND ptm.participant_id = v_participant_id) THEN RETURN true; END IF;

  IF v_thread.created_by = p_user_id THEN RETURN true; END IF;

  SELECT pp.project_roles INTO v_project_roles
    FROM project_participants pp
    WHERE pp.project_id = v_thread.project_id AND pp.participant_id = v_participant_id;
  IF v_project_roles IS NULL THEN RETURN false; END IF;

  IF 'Администратор' = ANY(v_project_roles) THEN RETURN true; END IF;
  IF v_thread.access_type = 'all' THEN RETURN true; END IF;
  IF v_thread.access_type = 'roles' AND COALESCE(v_thread.access_roles, '{}') && v_project_roles THEN RETURN true; END IF;
  RETURN false;
END;
$function$;

-- ── 2a. get_inbox_threads_v2 (живое тело + третья ветка accessible_threads) ─
CREATE OR REPLACE FUNCTION public.get_inbox_threads_v2(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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
    -- Треды ВНУТРИ проекта, где юзер исполнитель/участник, но НЕТ доступа к проекту.
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
      al.resource_id AS thread_id, al.created_at AS event_at, al.action, al.details, al.user_id AS actor_user_id
    FROM audit_logs al
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
    END::TEXT,
    las.status_color::TEXT, COALESCE(ua.cnt, 0),
    COALESCE(
      NULLIF(TRIM(COALESCE(counter_p.name, '') || ' ' || COALESCE(counter_p.last_name, '')), ''),
      NULLIF(TRIM(COALESCE(email_counter_p.name, '') || ' ' || COALESCE(email_counter_p.last_name, '')), ''),
      lcm.sender_name
    )::TEXT,
    COALESCE(counter_p.avatar_url, email_counter_p.avatar_url, tg_av_business.avatar_url, tg_av_mtproto.avatar_url, tg_av_group.avatar_url, at.wazzup_contact_avatar_url)::TEXT,
    mu.last_read_at
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

-- ── 2b. get_inbox_thread_aggregates (живое тело + третья ветка) ────────────
CREATE OR REPLACE FUNCTION public.get_inbox_thread_aggregates(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, project_id uuid, legacy_channel text, thread_accent_color text, last_message_at timestamp with time zone, unread_count bigint, unread_event_count bigint, unread_reaction_count bigint, has_unread_reaction boolean, manually_unread boolean, last_reaction_emoji text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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
    SELECT proj.id FROM projects proj
    WHERE proj.workspace_id = p_workspace_id AND proj.is_deleted = false
      AND ((SELECT allowed FROM can_view_all) OR proj.id IN (
        SELECT pp.project_id FROM project_participants pp, user_participant up
        WHERE pp.participant_id = up.participant_id))
  ),
  accessible_threads AS (
    SELECT pt.id, pt.project_id, pt.legacy_channel, pt.accent_color
    FROM project_threads pt
    INNER JOIN accessible_projects ap ON ap.id = pt.project_id
    WHERE pt.is_deleted = false
      AND ((pt.legacy_channel IS DISTINCT FROM 'internal') OR ((SELECT allowed FROM user_is_internal)))
    UNION
    SELECT pt.id, pt.project_id, pt.legacy_channel, pt.accent_color
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
    -- Треды внутри проекта, где юзер assignee/member, но НЕТ доступа к проекту.
    SELECT pt.id, pt.project_id, pt.legacy_channel, pt.accent_color
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
  last_msg_at AS (
    SELECT pm.thread_id, MAX(pm.created_at) AS message_at
    FROM project_messages pm
    INNER JOIN accessible_threads at ON at.id = pm.thread_id
    WHERE pm.source != 'telegram_service'::message_source
    GROUP BY pm.thread_id
  ),
  unread_counts AS (
    SELECT pm.thread_id, COUNT(*) AS cnt
    FROM project_messages pm
    INNER JOIN accessible_threads at ON at.id = pm.thread_id
    CROSS JOIN user_participant up
    LEFT JOIN message_read_status mrs ON mrs.participant_id = up.participant_id AND mrs.thread_id = pm.thread_id
    WHERE (mrs.last_read_at IS NULL OR pm.created_at > mrs.last_read_at)
      AND pm.sender_participant_id IS DISTINCT FROM up.participant_id
      AND pm.source != 'telegram_service'::message_source
    GROUP BY pm.thread_id
  ),
  manual_unread AS (
    SELECT mrs.thread_id, mrs.manually_unread, mrs.last_read_at
    FROM message_read_status mrs
    INNER JOIN user_participant up ON up.participant_id = mrs.participant_id
    WHERE mrs.thread_id IN (SELECT id FROM accessible_threads)
  ),
  unread_reaction_counts AS (
    SELECT pm.thread_id, COUNT(*) AS cnt
    FROM message_reactions mr
    INNER JOIN project_messages pm ON pm.id = mr.message_id
    INNER JOIN accessible_threads at ON at.id = pm.thread_id
    CROSS JOIN user_participant up
    LEFT JOIN message_read_status mrs ON mrs.participant_id = up.participant_id AND mrs.thread_id = pm.thread_id
    WHERE mr.participant_id IS DISTINCT FROM up.participant_id
      AND (mrs.last_read_at IS NULL OR mr.created_at > mrs.last_read_at)
    GROUP BY pm.thread_id
  ),
  last_reaction_emoji_cte AS (
    SELECT DISTINCT ON (pm.thread_id)
      pm.thread_id, mr.emoji, mr.created_at AS reaction_at
    FROM message_reactions mr
    INNER JOIN project_messages pm ON pm.id = mr.message_id
    INNER JOIN accessible_threads at ON at.id = pm.thread_id
    CROSS JOIN user_participant up
    WHERE mr.participant_id IS DISTINCT FROM up.participant_id
    ORDER BY pm.thread_id, mr.created_at DESC
  ),
  unread_audit AS (
    SELECT al.resource_id AS thread_id, COUNT(*) AS cnt
    FROM audit_logs al
    CROSS JOIN user_participant up
    LEFT JOIN message_read_status mrs ON mrs.participant_id = up.participant_id AND mrs.thread_id = al.resource_id
    LEFT JOIN statuses s_new
      ON al.action = 'change_status'
     AND (al.details->>'new_status') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND s_new.id = (al.details->>'new_status')::uuid
     AND s_new.workspace_id = p_workspace_id
    WHERE al.resource_id IN (SELECT id FROM accessible_threads)
      AND al.resource_type IN ('task', 'thread')
      AND al.user_id IS DISTINCT FROM p_user_id
      AND (mrs.last_read_at IS NULL OR al.created_at > mrs.last_read_at)
      AND (al.action <> 'change_status' OR COALESCE(s_new.silent_transition, false) = false)
    GROUP BY al.resource_id
  )
  SELECT
    at.id,
    at.project_id,
    at.legacy_channel::text,
    at.accent_color::text,
    lma.message_at,
    COALESCE(uc.cnt, 0),
    COALESCE(ua.cnt, 0),
    COALESCE(urc.cnt, 0),
    (lre.emoji IS NOT NULL AND (mu.last_read_at IS NULL OR lre.reaction_at > mu.last_read_at)),
    COALESCE(mu.manually_unread, FALSE),
    lre.emoji::text
  FROM accessible_threads at
  LEFT JOIN last_msg_at lma ON lma.thread_id = at.id
  LEFT JOIN unread_counts uc ON uc.thread_id = at.id
  LEFT JOIN manual_unread mu ON mu.thread_id = at.id
  LEFT JOIN unread_reaction_counts urc ON urc.thread_id = at.id
  LEFT JOIN last_reaction_emoji_cte lre ON lre.thread_id = at.id
  LEFT JOIN unread_audit ua ON ua.thread_id = at.id;
$function$;

-- ── 3. get_workspace_threads (живое тело + участник в любом режиме) ────────
CREATE OR REPLACE FUNCTION public.get_workspace_threads(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(id uuid, name text, type text, workspace_id uuid, project_id uuid, project_name text, status_id uuid, status_name text, status_color text, status_order integer, status_show_to_creator boolean, deadline timestamp with time zone, start_at timestamp with time zone, end_at timestamp with time zone, accent_color text, icon text, is_pinned boolean, sort_order integer, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id UUID;
  v_workspace_roles TEXT[];
  v_has_view_all BOOLEAN := FALSE;
  v_my_project_ids UUID[];
  v_admin_project_ids UUID[];
  v_member_thread_ids UUID[];
  v_assignee_thread_ids UUID[];
  v_my_roles_by_project JSONB := '{}'::JSONB;
BEGIN
  SELECT par.id, par.workspace_roles INTO v_participant_id, v_workspace_roles
  FROM participants par
  WHERE par.user_id = p_user_id AND par.workspace_id = p_workspace_id AND par.is_deleted = false;

  IF v_participant_id IS NULL THEN RETURN; END IF;
  v_workspace_roles := COALESCE(v_workspace_roles, '{}');

  SELECT EXISTS(
    SELECT 1 FROM workspace_roles wr
    WHERE wr.workspace_id = p_workspace_id AND wr.name = ANY(v_workspace_roles)
      AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true)
  ) INTO v_has_view_all;

  IF v_has_view_all THEN
    RETURN QUERY
    SELECT pt.id, pt.name, pt.type, pt.workspace_id, pt.project_id,
           p.name AS project_name, pt.status_id,
           s.name AS status_name, s.color AS status_color,
           s.order_index AS status_order,
           COALESCE(s.show_to_creator, FALSE) AS status_show_to_creator,
           pt.deadline, pt.start_at, pt.end_at,
           pt.accent_color, pt.icon, pt.is_pinned, pt.sort_order,
           pt.created_at, pt.updated_at, pt.created_by
    FROM project_threads pt
    LEFT JOIN projects p ON p.id = pt.project_id
    LEFT JOIN statuses s ON s.id = pt.status_id
    WHERE pt.workspace_id = p_workspace_id
      AND pt.is_deleted = FALSE
      AND (p.id IS NULL OR p.is_deleted = FALSE)
      AND (pt.project_id IS NOT NULL OR pt.type = 'task' OR pt.owner_user_id = p_user_id)
    ORDER BY pt.sort_order ASC, pt.created_at ASC;
    RETURN;
  END IF;

  SELECT
    COALESCE(array_agg(pp.project_id), '{}'),
    COALESCE(array_agg(pp.project_id) FILTER (WHERE 'Администратор' = ANY(pp.project_roles)), '{}')
  INTO v_my_project_ids, v_admin_project_ids
  FROM project_participants pp WHERE pp.participant_id = v_participant_id;

  SELECT COALESCE(array_agg(ptm.thread_id), '{}') INTO v_member_thread_ids
  FROM project_thread_members ptm WHERE ptm.participant_id = v_participant_id;

  SELECT COALESCE(array_agg(ta.thread_id), '{}') INTO v_assignee_thread_ids
  FROM task_assignees ta WHERE ta.participant_id = v_participant_id;

  SELECT COALESCE(jsonb_object_agg(pp.project_id::text, to_jsonb(pp.project_roles)), '{}'::jsonb)
  INTO v_my_roles_by_project
  FROM project_participants pp WHERE pp.participant_id = v_participant_id;

  RETURN QUERY
  SELECT pt.id, pt.name, pt.type, pt.workspace_id, pt.project_id,
         p.name AS project_name, pt.status_id,
         s.name AS status_name, s.color AS status_color,
         s.order_index AS status_order,
         COALESCE(s.show_to_creator, FALSE) AS status_show_to_creator,
         pt.deadline, pt.start_at, pt.end_at,
         pt.accent_color, pt.icon, pt.is_pinned, pt.sort_order,
         pt.created_at, pt.updated_at, pt.created_by
  FROM project_threads pt
  LEFT JOIN projects p ON p.id = pt.project_id
  LEFT JOIN statuses s ON s.id = pt.status_id
  WHERE pt.workspace_id = p_workspace_id
    AND pt.is_deleted = FALSE
    AND (p.id IS NULL OR p.is_deleted = FALSE)
    AND (
      (pt.project_id IS NULL AND pt.type <> 'task' AND pt.owner_user_id = p_user_id)
      OR (pt.project_id IS NULL AND pt.type = 'task'
          AND (pt.created_by = p_user_id OR pt.id = ANY(v_assignee_thread_ids)))
      OR pt.project_id = ANY(v_admin_project_ids)
      OR (pt.project_id IS NOT NULL AND pt.created_by = p_user_id)
      OR (pt.project_id IS NOT NULL AND pt.id = ANY(v_assignee_thread_ids))
      OR (pt.access_type = 'all' AND pt.project_id = ANY(v_my_project_ids))
      OR (pt.access_type = 'roles'
          AND pt.project_id = ANY(v_my_project_ids)
          AND pt.access_roles && (
            SELECT COALESCE(
              (SELECT array_agg(r)::text[]
               FROM jsonb_array_elements_text(v_my_roles_by_project->(pt.project_id::text)) AS r),
              '{}'::text[]
            )
          ))
      -- Явный участник треда — в ЛЮБОМ режиме доступа, даже без доступа к проекту.
      OR pt.id = ANY(v_member_thread_ids)
    )
  ORDER BY pt.sort_order ASC, pt.created_at ASC;
END;
$function$;
