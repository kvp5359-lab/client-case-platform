-- Пагинированный inbox через keyset cursor (фаза 2 пагинации).
--
-- get_inbox_threads_page(p_workspace_id, p_user_id, p_cursor_sort_at, p_cursor_thread_id, p_limit):
--   Возвращает LIMIT тредов, отсортированных по последнему сообщению или audit-событию
--   (DESC, NULLS LAST). Для следующей страницы клиент передаёт keyset из последнего ряда.
--
-- Sort key: COALESCE(GREATEST(last_message_at, last_event_at), thread.created_at) — гарантирует NOT NULL.
-- Tie-breaker: thread_id (для устойчивого порядка при равенстве sort_at).
--
-- Старый get_inbox_threads_v2 НЕ удалён — оставлен как legacy, чтобы можно было откатиться.
-- После полного перехода фронта на пагинацию его можно дропнуть отдельной миграцией.

-- Полезный индекс для быстрого первого выборки (для случая когда нет keyset).
-- На воркспейсах с 10k+ тредов поможет планировщику не делать seq scan.
CREATE INDEX IF NOT EXISTS idx_project_threads_workspace_created
  ON public.project_threads (workspace_id, created_at DESC, id DESC)
  WHERE is_deleted = false;

CREATE OR REPLACE FUNCTION public.get_inbox_threads_page(
  p_workspace_id uuid,
  p_user_id uuid,
  p_cursor_sort_at timestamptz DEFAULT NULL,
  p_cursor_thread_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE(
  thread_id uuid,
  thread_name text,
  thread_icon text,
  thread_accent_color text,
  thread_type text,
  project_id uuid,
  project_name text,
  channel_type text,
  legacy_channel text,
  last_message_at timestamptz,
  last_message_text text,
  last_message_attachment_name text,
  last_message_attachment_count integer,
  last_message_attachment_mime text,
  last_sender_name text,
  last_sender_avatar_url text,
  unread_count bigint,
  manually_unread boolean,
  has_unread_reaction boolean,
  unread_reaction_count bigint,
  last_reaction_emoji text,
  last_reaction_at timestamptz,
  last_reaction_sender_name text,
  last_reaction_sender_avatar_url text,
  last_reaction_message_preview text,
  email_contact text,
  email_subject text,
  last_event_at timestamptz,
  last_event_text text,
  last_event_status_color text,
  unread_event_count bigint,
  counterpart_name text,
  counterpart_avatar_url text,
  last_read_at timestamptz,
  sort_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH full_result AS (
    SELECT
      t.*,
      COALESCE(GREATEST(t.last_message_at, t.last_event_at), pt_meta.created_at) AS sort_at
    FROM get_inbox_threads_v2(p_workspace_id, p_user_id) t
    LEFT JOIN project_threads pt_meta ON pt_meta.id = t.thread_id
  )
  SELECT *
  FROM full_result
  WHERE p_cursor_sort_at IS NULL
     OR (sort_at, thread_id) < (p_cursor_sort_at, p_cursor_thread_id)
  ORDER BY sort_at DESC, thread_id DESC
  LIMIT GREATEST(p_limit, 1);
$function$;

COMMENT ON FUNCTION public.get_inbox_threads_page(uuid, uuid, timestamptz, uuid, int) IS
  'Пагинированный inbox: keyset cursor по (sort_at, thread_id). '
  'sort_at = COALESCE(GREATEST(last_message_at, last_event_at), created_at). '
  'Для первой страницы — cursor=NULL. Клиент берёт keyset из последнего ряда для следующего вызова.';

GRANT EXECUTE ON FUNCTION public.get_inbox_threads_page(uuid, uuid, timestamptz, uuid, int) TO authenticated;
