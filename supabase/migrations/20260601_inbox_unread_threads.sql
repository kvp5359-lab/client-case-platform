-- get_inbox_unread_threads — все непрочитанные треды инбокса одним запросом, без пагинации.
--
-- Зачем: вкладка «Непрочитанные» фильтровала непрочитанные на клиенте поверх
-- keyset-пагинации (get_inbox_threads_page). Непрочитанные разбросаны по всему
-- списку → бесконечный скролл вынужден прокачать весь инбокс, чтобы их собрать
-- (каскад из ~N последовательных запросов = подвисание «Загружаем ещё…» 3-4 сек).
--
-- Решение: непрочитанных всегда единицы — отдаём их все одним вызовом.
-- Обёртка над get_inbox_threads_v2: переиспользует ВСЮ его логику (доступ по
-- проекту, личные диалоги по owner_user_id, превью с приоритетом непрочитанного
-- собеседника) — ничего не дублируем и не можем рассинхронить. Фильтр непрочитанного
-- идентичен клиентскому isUnread() и серверному счётчику из get_inbox_thread_aggregates.
--
-- Тяжёлый RPC get_inbox_threads_page (вкладка «Все»), триггеры и v2 не трогаем.

CREATE OR REPLACE FUNCTION public.get_inbox_unread_threads(
  p_workspace_id uuid,
  p_user_id uuid
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
  WHERE COALESCE(t.unread_count, 0) > 0
     OR COALESCE(t.unread_event_count, 0) > 0
     OR COALESCE(t.unread_reaction_count, 0) > 0
     OR t.has_unread_reaction = true
     OR t.manually_unread = true
  ORDER BY COALESCE(GREATEST(t.last_message_at, t.last_event_at), 'epoch'::timestamptz) DESC,
           t.thread_id DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.get_inbox_unread_threads(uuid, uuid) TO authenticated;
