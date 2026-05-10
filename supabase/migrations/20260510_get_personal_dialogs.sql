-- RPC для страницы «Личные диалоги».
-- Возвращает треды, у которых owner_user_id = p_target_user_id (личные диалоги сотрудника).
-- Сейчас такие треды могут лежать в фейковых системных проектах (Этап 1) — после Этапа 4
-- они переедут в project_id = NULL. RPC работает в обоих режимах.
--
-- Разрешения: смотреть свои диалоги может любой сотрудник; чужие — только владелец воркспейса
-- или участник с permission 'view_all_projects'.

CREATE OR REPLACE FUNCTION public.get_personal_dialogs(
  p_workspace_id uuid,
  p_target_user_id uuid
)
RETURNS TABLE(
  thread_id uuid,
  thread_name text,
  thread_icon text,
  thread_accent_color text,
  thread_type text,
  project_id uuid,
  project_name text,
  channel text,
  legacy_channel text,
  last_message_at timestamp with time zone,
  last_message_text text,
  last_message_attachment_name text,
  last_message_attachment_count integer,
  last_sender_name text,
  last_sender_avatar_url text,
  unread_count bigint,
  manually_unread boolean,
  email_contact text,
  email_subject text,
  owner_user_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  caller_participant AS (
    SELECT p.id AS participant_id, p.workspace_roles
    FROM participants p
    WHERE p.workspace_id = p_workspace_id
      AND p.user_id = auth.uid()
      AND p.is_deleted = FALSE
    LIMIT 1
  ),
  caller_can_view_all AS (
    SELECT EXISTS (
      SELECT 1 FROM workspace_roles wr, caller_participant cp
      WHERE wr.workspace_id = p_workspace_id
        AND wr.name = ANY(cp.workspace_roles)
        AND (wr.is_owner = TRUE OR (wr.permissions->>'view_all_projects')::boolean = TRUE)
    ) AS allowed
  ),
  authorized AS (
    SELECT
      (auth.uid() = p_target_user_id) OR (SELECT allowed FROM caller_can_view_all) AS ok
  ),
  target_participant AS (
    SELECT p.id AS participant_id
    FROM participants p
    WHERE p.workspace_id = p_workspace_id
      AND p.user_id = p_target_user_id
      AND p.is_deleted = FALSE
    LIMIT 1
  ),
  personal_threads AS (
    SELECT pt.id, pt.project_id, pt.name, pt.icon, pt.accent_color,
           pt.legacy_channel, pt.type, pt.owner_user_id,
           pt.business_connection_id, pt.mtproto_session_user_id,
           pt.wazzup_channel_id, pt.email_subject_root
    FROM project_threads pt
    WHERE pt.workspace_id = p_workspace_id
      AND pt.owner_user_id = p_target_user_id
      AND pt.is_deleted = false
      AND (SELECT ok FROM authorized)
  ),
  last_messages AS (
    SELECT DISTINCT ON (pm.thread_id)
      pm.id AS message_id, pm.thread_id, pm.created_at AS message_at,
      pm.content AS message_text, pm.sender_name, pm.sender_participant_id
    FROM project_messages pm
    INNER JOIN personal_threads pt ON pt.id = pm.thread_id
    WHERE pm.source != 'telegram_service'::message_source
    ORDER BY pm.thread_id, pm.created_at DESC
  ),
  last_message_attachments AS (
    SELECT lm.thread_id,
      (SELECT ma.file_name FROM message_attachments ma
        WHERE ma.message_id = lm.message_id
        ORDER BY ma.created_at ASC LIMIT 1) AS first_file_name,
      (SELECT COUNT(*)::int FROM message_attachments ma
        WHERE ma.message_id = lm.message_id) AS file_count
    FROM last_messages lm
  ),
  unread_counts AS (
    SELECT pm.thread_id, COUNT(*) AS cnt
    FROM project_messages pm
    INNER JOIN personal_threads pt ON pt.id = pm.thread_id
    CROSS JOIN target_participant tp
    LEFT JOIN message_read_status mrs
      ON mrs.participant_id = tp.participant_id
      AND mrs.thread_id = pm.thread_id
    WHERE (mrs.last_read_at IS NULL OR pm.created_at > mrs.last_read_at)
      AND pm.sender_participant_id IS DISTINCT FROM tp.participant_id
      AND pm.source != 'telegram_service'::message_source
    GROUP BY pm.thread_id
  ),
  manual_unread AS (
    SELECT mrs.thread_id, mrs.manually_unread
    FROM message_read_status mrs
    INNER JOIN target_participant tp ON tp.participant_id = mrs.participant_id
    WHERE mrs.thread_id IN (SELECT id FROM personal_threads)
  ),
  email_links AS (
    SELECT el.thread_id, el.contact_email, el.subject
    FROM project_thread_email_links el
    WHERE el.thread_id IN (SELECT id FROM personal_threads) AND el.is_active = true
  ),
  projects_lookup AS (
    SELECT p.id, p.name FROM projects p
    WHERE p.id IN (SELECT project_id FROM personal_threads WHERE project_id IS NOT NULL)
  )
  SELECT
    pt.id,
    pt.name::text,
    pt.icon::text,
    pt.accent_color::text,
    pt.type::text,
    pt.project_id,
    pl.name::text,
    CASE
      WHEN pt.business_connection_id IS NOT NULL THEN 'telegram_business'
      WHEN pt.mtproto_session_user_id IS NOT NULL THEN 'telegram_mtproto'
      WHEN pt.wazzup_channel_id IS NOT NULL THEN 'wazzup'
      WHEN el.thread_id IS NOT NULL OR pt.email_subject_root IS NOT NULL THEN 'email'
      ELSE 'other'
    END::text,
    pt.legacy_channel::text,
    lm.message_at,
    lm.message_text::text,
    lma.first_file_name::text,
    COALESCE(lma.file_count, 0),
    lm.sender_name::text,
    sender_p.avatar_url::text,
    COALESCE(uc.cnt, 0),
    COALESCE(mu.manually_unread, false),
    el.contact_email::text,
    el.subject::text,
    pt.owner_user_id
  FROM personal_threads pt
  LEFT JOIN projects_lookup pl ON pl.id = pt.project_id
  LEFT JOIN last_messages lm ON lm.thread_id = pt.id
  LEFT JOIN last_message_attachments lma ON lma.thread_id = pt.id
  LEFT JOIN participants sender_p ON sender_p.id = lm.sender_participant_id
  LEFT JOIN unread_counts uc ON uc.thread_id = pt.id
  LEFT JOIN manual_unread mu ON mu.thread_id = pt.id
  LEFT JOIN email_links el ON el.thread_id = pt.id
  ORDER BY lm.message_at DESC NULLS LAST;
$function$;

GRANT EXECUTE ON FUNCTION public.get_personal_dialogs(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_personal_dialogs(uuid, uuid) IS
  'Список тредов «Личные диалоги» сотрудника. Доступ: свои всегда, чужие — только при view_all_projects/owner.';
