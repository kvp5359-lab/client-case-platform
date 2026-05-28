-- Фаза 3 пагинации: треды с manually_unread=true всегда видны на первой странице,
-- даже если их last_message_at глубоко в истории (за пределами LIMIT).
-- Это закрывает кейс «пользователь пометил старый тред непрочитанным → он уехал
-- за пределы пагинации → счётчик в сайдбаре показывает точку, а в самом инбоксе
-- треда нет → растерянность».
--
-- Решение: UNION страницы (с LIMIT) и набора manually_unread тредов (без LIMIT).
-- На последующих страницах (cursor != NULL) manually_unread не дублируются —
-- они уже были на первой.

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
    -- Только на первой странице докладываем manually_unread поверх лимита.
    -- На последующих страницах не нужны — они уже есть в первой.
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
