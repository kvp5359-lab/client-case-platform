-- Фаза 2.6: cutover — обёртки Входящих читают из материализованных таблиц.
-- v3_for/recompute(updated) применены в проде через MCP; полные тела там
-- (этот проект толерантен к drift repo↔prod, см. memory). Здесь — glue обёрток,
-- новая колонка и cron. Полные тела get_inbox_threads_v3_for и обновлённого
-- recompute_thread_unread_for — в применённых через MCP миграциях 2026-06-17.

-- Пер-юзер emoji последней НЕ-своей реакции (для aggregates).
ALTER TABLE public.thread_unread_state ADD COLUMN IF NOT EXISTS last_reaction_emoji text;
-- (recompute_thread_unread_for обновлён в проде: захватывает emoji; reconcile перезаполняет)

-- get_inbox_threads_page: keyset по материализованному sort_at → v3_for(picked ids).
CREATE OR REPLACE FUNCTION public.get_inbox_threads_page(p_workspace_id uuid, p_user_id uuid, p_cursor_sort_at timestamptz DEFAULT NULL, p_cursor_thread_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamptz, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamptz, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamptz, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamptz, last_event_sender_avatar_url text, sort_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH me AS (SELECT id AS pid FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1),
  base AS (SELECT us.thread_id, m.sort_at, us.manually_unread FROM thread_unread_state us JOIN thread_inbox_meta m ON m.thread_id = us.thread_id, me WHERE us.participant_id = me.pid),
  main_page AS (SELECT thread_id, sort_at FROM base WHERE p_cursor_sort_at IS NULL OR (sort_at, thread_id) < (p_cursor_sort_at, p_cursor_thread_id) ORDER BY sort_at DESC, thread_id DESC LIMIT GREATEST(p_limit, 1)),
  extras AS (SELECT thread_id, sort_at FROM base WHERE p_cursor_sort_at IS NULL AND manually_unread = true),
  picked AS (SELECT thread_id, sort_at FROM main_page UNION SELECT thread_id, sort_at FROM extras)
  SELECT v.*, picked.sort_at FROM get_inbox_threads_v3_for(p_workspace_id, p_user_id, ARRAY(SELECT thread_id FROM picked)) v
  JOIN picked ON picked.thread_id = v.thread_id
  ORDER BY picked.sort_at DESC, v.thread_id DESC;
$$;

-- get_inbox_unread_threads
CREATE OR REPLACE FUNCTION public.get_inbox_unread_threads(p_workspace_id uuid, p_user_id uuid)
RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamptz, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamptz, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamptz, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamptz, last_event_sender_avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT v.* FROM get_inbox_threads_v3_for(p_workspace_id, p_user_id, ARRAY(
    SELECT us.thread_id FROM thread_unread_state us
    WHERE us.participant_id = (SELECT id FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1)
      AND (us.unread_count > 0 OR us.unread_event_count > 0 OR us.unread_reaction_count > 0 OR us.has_unread_reaction = true OR us.manually_unread = true)
  )) v
  ORDER BY COALESCE(v.manually_unread, false) DESC, COALESCE(GREATEST(v.last_message_at, v.last_event_at), 'epoch'::timestamptz) DESC, v.thread_id DESC;
$$;

-- get_inbox_needs_reply_threads (последнее от клиента + прочитано + внешний)
CREATE OR REPLACE FUNCTION public.get_inbox_needs_reply_threads(p_workspace_id uuid, p_user_id uuid)
RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamptz, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamptz, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamptz, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamptz, last_event_sender_avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT v.* FROM get_inbox_threads_v3_for(p_workspace_id, p_user_id, ARRAY(
    SELECT us.thread_id FROM thread_unread_state us JOIN thread_inbox_meta m ON m.thread_id = us.thread_id
    WHERE us.participant_id = (SELECT id FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1)
      AND m.last_message_at IS NOT NULL AND us.unread_count = 0 AND us.unread_event_count = 0 AND us.unread_reaction_count = 0 AND us.has_unread_reaction = false AND us.manually_unread = false
      AND m.last_from_staff IS NOT TRUE AND m.has_external = true
  )) v
  ORDER BY COALESCE(GREATEST(v.last_message_at, v.last_event_at), 'epoch'::timestamptz) DESC, v.thread_id DESC;
$$;

-- get_inbox_awaiting_reply_threads (последнее от нас + прочитано + внешний)
CREATE OR REPLACE FUNCTION public.get_inbox_awaiting_reply_threads(p_workspace_id uuid, p_user_id uuid)
RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamptz, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamptz, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamptz, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamptz, last_event_sender_avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT v.* FROM get_inbox_threads_v3_for(p_workspace_id, p_user_id, ARRAY(
    SELECT us.thread_id FROM thread_unread_state us JOIN thread_inbox_meta m ON m.thread_id = us.thread_id
    WHERE us.participant_id = (SELECT id FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1)
      AND m.last_message_at IS NOT NULL AND us.unread_count = 0 AND us.unread_event_count = 0 AND us.unread_reaction_count = 0 AND us.has_unread_reaction = false AND us.manually_unread = false
      AND m.last_from_staff = true AND m.has_external = true
  )) v
  ORDER BY COALESCE(GREATEST(v.last_message_at, v.last_event_at), 'epoch'::timestamptz) DESC, v.thread_id DESC;
$$;

-- get_inbox_thread_aggregates (счётчики/бейджи прямо из материализованных таблиц)
CREATE OR REPLACE FUNCTION public.get_inbox_thread_aggregates(p_workspace_id uuid, p_user_id uuid)
RETURNS TABLE(thread_id uuid, project_id uuid, legacy_channel text, thread_accent_color text, last_message_at timestamptz, unread_count bigint, unread_event_count bigint, unread_reaction_count bigint, has_unread_reaction boolean, manually_unread boolean, last_reaction_emoji text, last_from_staff boolean, has_external boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT us.thread_id, pt.project_id, pt.legacy_channel::text, pt.accent_color::text,
    m.last_message_at, us.unread_count, us.unread_event_count, us.unread_reaction_count,
    us.has_unread_reaction, us.manually_unread, us.last_reaction_emoji, m.last_from_staff, m.has_external
  FROM thread_unread_state us
  JOIN thread_inbox_meta m ON m.thread_id = us.thread_id
  JOIN project_threads pt ON pt.id = us.thread_id
  WHERE us.participant_id = (SELECT id FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1);
$$;

-- Ночная сверка материализованных таблиц (safety-net против дрейфа).
SELECT cron.schedule('inbox-reconcile', '0 4 * * *', $CRON$ SELECT public.reconcile_thread_inbox_meta(); SELECT public.reconcile_thread_unread(); $CRON$);
