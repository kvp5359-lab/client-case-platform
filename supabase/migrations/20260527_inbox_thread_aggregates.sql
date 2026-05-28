-- get_inbox_thread_aggregates — лёгкий RPC для счётчиков сайдбара/favicon.
-- Возвращает те же треды, что get_inbox_threads_v2, но БЕЗ тяжёлых полей
-- (имена, текст последнего сообщения, аватары, реакции-превью, email/audit-тексты).
-- Снимает зависимость бейджей в сайдбаре от тяжёлого инбокс-RPC: при росте до 10k тредов
-- бейджи остаются быстрыми, а пагинация основного инбокса (фаза 2) не ломает счётчики.

CREATE OR REPLACE FUNCTION public.get_inbox_thread_aggregates(
  p_workspace_id uuid,
  p_user_id uuid
)
RETURNS TABLE(
  thread_id uuid,
  project_id uuid,
  legacy_channel text,
  thread_accent_color text,
  last_message_at timestamptz,
  unread_count bigint,
  unread_event_count bigint,
  unread_reaction_count bigint,
  has_unread_reaction boolean,
  manually_unread boolean,
  last_reaction_emoji text
)
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

COMMENT ON FUNCTION public.get_inbox_thread_aggregates(uuid, uuid) IS
  'Лёгкий RPC: только агрегатные поля тредов для сайдбар-бейджей и favicon. '
  'Без имён/текстов/аватаров — снимает зависимость счётчиков от роста инбокса. '
  'Клиентская фильтрация по доступу — отдельно через get_sidebar_data.';

GRANT EXECUTE ON FUNCTION public.get_inbox_thread_aggregates(uuid, uuid) TO authenticated;
