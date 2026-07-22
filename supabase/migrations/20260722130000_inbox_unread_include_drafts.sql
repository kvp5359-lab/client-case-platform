-- Вкладка «Непрочитанные» дополнительно показывает треды, где у меня есть
-- НАЧАТЫЙ черновик (набранный текст или прикреплённые файлы).
--
-- Стало возможным после переноса черновиков в БД: раньше они лежали только в
-- localStorage браузера, и серверный список о них знать не мог.
--
-- Фильтры: только мои черновики (d.user_id = p_user_id), только этот воркспейс
-- и только живые треды — удалённые из списков инбокса исключаются всегда
-- (иначе тред из корзины залипал бы во «Входящих»).
--
-- SECURITY DEFINER обходит RLS, поэтому принадлежность черновика проверяем явно;
-- публичная обёртка get_inbox_unread_threads уже требует p_user_id = auth.uid().

CREATE OR REPLACE FUNCTION public.get_inbox_unread_threads_impl(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT v.* FROM get_inbox_threads_v3_for(p_workspace_id, p_user_id, ARRAY(
    SELECT us.thread_id FROM thread_unread_state us
    WHERE us.participant_id = (SELECT id FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1)
      AND (us.unread_count > 0 OR us.unread_event_count > 0 OR us.unread_reaction_count > 0 OR us.has_unread_reaction = true OR us.manually_unread = true)
    UNION
    SELECT d.thread_id FROM thread_input_drafts d
    JOIN project_threads dt ON dt.id = d.thread_id
    WHERE d.user_id = p_user_id
      AND dt.workspace_id = p_workspace_id
      AND dt.is_deleted = false
    UNION
    SELECT df.thread_id FROM thread_input_draft_files df
    JOIN project_threads ft ON ft.id = df.thread_id
    WHERE df.user_id = p_user_id
      AND ft.workspace_id = p_workspace_id
      AND ft.is_deleted = false
  )) v
  ORDER BY GREATEST(
             COALESCE(v.last_message_at, 'epoch'::timestamptz),
             COALESCE(v.last_event_at, 'epoch'::timestamptz),
             CASE WHEN COALESCE(v.manually_unread, false)
                  THEN COALESCE(v.last_read_at, 'epoch'::timestamptz)
                  ELSE 'epoch'::timestamptz END,
             CASE WHEN COALESCE(v.has_unread_reaction, false)
                  THEN COALESCE(v.last_reaction_at, 'epoch'::timestamptz)
                  ELSE 'epoch'::timestamptz END
           ) DESC,
           v.thread_id DESC;
$function$;
