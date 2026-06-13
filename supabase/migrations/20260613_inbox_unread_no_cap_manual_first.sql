-- get_inbox_unread_threads — снимаем жёсткий потолок 100 + поднимаем осознанно
-- помеченные непрочитанными (manually_unread) в самый верх.
--
-- Проблема (пользовательский кейс): сортировка была по свежести DESC + LIMIT 100.
-- Старое осознанно непрочитанное сообщение (ручной «висяк»-напоминалка) при >100
-- одновременно непрочитанных чатов уезжало вниз по дате активности и срезалось
-- лимитом → пропадало из вкладки «Непрочитанные». В ТГ/Планфиксе «непрочитано =
-- непрочитано» вне зависимости от возраста — здесь это ломалось.
--
-- Почему НЕ keyset-пагинация: вкладка «Непрочитанные» фильтрует доступ на КЛИЕНТЕ
-- (useAccessFilter) поверх ответа RPC. Пагинация по 50 → страница после фильтра
-- доступа схлопывается → бесконечный скролл снова прокачивает весь инбокс
-- каскадом (ровно тот баг, что чинили одношаговым запросом в мае 2026). Поэтому
-- оставляем ОДНОшаговый запрос, но без потолка.
--
-- Стоимость: тот же ~150мс скан get_inbox_threads_v2 (LIMIT применялся ПОСЛЕ
-- материализации — снятие не увеличивает скан, только payload). Число строк
-- естественно ограничено числом доступных пользователю тредов (≈ размер
-- воркспейса), не тысячами. manually_unread всегда первыми — ручные «висяки»
-- видны сразу, что бы ни творилось в инбоксе.

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
  ORDER BY COALESCE(t.manually_unread, false) DESC,
           COALESCE(GREATEST(t.last_message_at, t.last_event_at), 'epoch'::timestamptz) DESC,
           t.thread_id DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_inbox_unread_threads(uuid, uuid) TO authenticated;
