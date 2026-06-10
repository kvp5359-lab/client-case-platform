-- get_inbox_search_threads — поиск по тредам входящих по названию треда / проекта.
--
-- Зачем: поиск в списке «Входящие» фильтровал только уже загруженные страницы
-- (keyset-пагинация, первая страница = 50). Тред дальше 50-й позиции не находился.
-- Раньше это маскировалось каскадной догрузкой всего инбокса; после её отключения
-- (фикс подвисания «Загружаем ещё») баг обнажился.
--
-- Решение: серверный поиск по ВСЕМ тредам инбокса (а не по загруженным в браузер).
-- Обёртка над get_inbox_threads_v2 — та же логика доступа/превью, возвращает те же
-- поля InboxThreadEntry, чтобы фронт рендерил результаты как обычные строки списка.
-- Поиск только по названию треда и имени проекта (не по тексту сообщений).

CREATE OR REPLACE FUNCTION public.get_inbox_search_threads(
  p_workspace_id uuid,
  p_user_id uuid,
  p_query text,
  p_limit int DEFAULT 50
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
  WITH q AS (
    -- Экранируем спецсимволы LIKE (% _ \), чтобы ввод трактовался буквально.
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
$$;

GRANT EXECUTE ON FUNCTION public.get_inbox_search_threads(uuid, uuid, text, int) TO authenticated;
