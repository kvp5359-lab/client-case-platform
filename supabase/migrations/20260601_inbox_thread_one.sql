-- get_inbox_thread_one — одна строка инбокса для КОНКРЕТНОГО треда.
--
-- Зачем: после перехода инбокса на keyset-пагинацию (май 2026) useInboxThreadsV2
-- содержит только загруженные страницы. useLastReadAt искал тред в этом списке —
-- и для треда за пределами первых страниц получал last_read_at = null. MessageList
-- трактует null как «тред никогда не открывали» → красит ВСЕ чужие сообщения как
-- непрочитанные, хотя на сервере тред давно прочитан (unread_count = 0).
--
-- Решение: для открытого треда брать его строку напрямую по thread_id, не завися
-- от того, попал ли тред в пагинированный список. Обёртка над get_inbox_threads_v2
-- с фильтром по одному треду — та же логика last_read_at/unread, что и в инбоксе,
-- расхождений быть не может.

CREATE OR REPLACE FUNCTION public.get_inbox_thread_one(
  p_workspace_id uuid,
  p_user_id uuid,
  p_thread_id uuid
)
RETURNS TABLE (
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
  last_read_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.*
  FROM get_inbox_threads_v2(p_workspace_id, p_user_id) t
  WHERE t.thread_id = p_thread_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_inbox_thread_one(uuid, uuid, uuid) TO authenticated;
