-- Вкладка «Непрочитанные»: ручной «непрочитанный» сортируется по МОМЕНТУ нажатия
-- кнопки (не по дате последнего сообщения и не «всегда сверху»).
--   • обычные непрочитанные — по времени активности (last_message/last_event);
--   • помеченные вручную — по GREATEST(активность, last_read_at), где last_read_at
--     для manually_unread = момент нажатия (markAsUnread пишет last_read_at=now()).
-- Итог: при нажатии тред встаёт наверх («сейчас»), затем естественно уезжает вниз
-- по мере новых событий у других тредов.
-- CREATE OR REPLACE (сигнатура не меняется) → гранты сохраняются.
-- ⚠️ Тело снято с ПРОДА (drift repo↔prod): функция читает из thread_unread_state
-- + get_inbox_threads_v3_for (cutover Фаза 2.6), а не из v2.

CREATE OR REPLACE FUNCTION public.get_inbox_unread_threads(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT v.* FROM get_inbox_threads_v3_for(p_workspace_id, p_user_id, ARRAY(
    SELECT us.thread_id FROM thread_unread_state us
    WHERE us.participant_id = (SELECT id FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1)
      AND (us.unread_count > 0 OR us.unread_event_count > 0 OR us.unread_reaction_count > 0 OR us.has_unread_reaction = true OR us.manually_unread = true)
  )) v
  ORDER BY GREATEST(
             COALESCE(v.last_message_at, 'epoch'::timestamptz),
             COALESCE(v.last_event_at, 'epoch'::timestamptz),
             CASE WHEN COALESCE(v.manually_unread, false)
                  THEN COALESCE(v.last_read_at, 'epoch'::timestamptz)
                  ELSE 'epoch'::timestamptz END
           ) DESC,
           v.thread_id DESC;
$function$;
