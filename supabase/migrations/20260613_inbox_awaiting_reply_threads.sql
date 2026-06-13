-- Вкладка «Ждут ответа» во «Входящих».
--
-- get_inbox_awaiting_reply_threads — диалоги с внешним собеседником, где
-- ПОСЛЕДНЕЕ сообщение отправили мы (sender_role ∈ команда), т.е. ждём ответа
-- клиента. Обёртка над get_inbox_threads_v2 (тот же приём, что
-- get_inbox_unread_threads). Решает кейс «написал клиенту первым в TG/WhatsApp —
-- тред создаётся, но в "Непрочитанных" не виден (unread_count=0)».
--
-- Предикат:
--   1) последнее по времени НЕ-сервисное сообщение треда отправлено сотрудником
--      (sender_role IN team-роли). NULL / 'Клиент' / 'Telegram' / 'Email' = это
--      собеседник, такой тред в выборку НЕ попадает (там ждут ответа от нас —
--      он в «Непрочитанных»). Зеркально CTE last_client_messages в v2.
--   2) тред — реальный ВНЕШНИЙ диалог: есть хотя бы одно сообщение из внешнего
--      канала. Без этого гейта в выборку попали бы внутренние проектные задачи,
--      где последним писал сотрудник (замер 2026-06-13: 202 таких таска-шумелки).
--      Наши исходящие-эхо (wazzup) и MTProto-out сами имеют внешний source, так
--      что первый контакт с одним исходящим проходит гейт.
--
-- Взаимоисключающе с «Непрочитанными» по построению: там последнее сообщение —
-- входящее (от собеседника), здесь — наше.

CREATE OR REPLACE FUNCTION public.get_inbox_awaiting_reply_threads(
  p_workspace_id uuid,
  p_user_id uuid
)
RETURNS TABLE(
  thread_id uuid, thread_name text, thread_icon text, thread_accent_color text,
  thread_type text, project_id uuid, project_name text, channel_type text,
  legacy_channel text, last_message_at timestamp with time zone, last_message_text text,
  last_message_attachment_name text, last_message_attachment_count integer,
  last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text,
  unread_count bigint, manually_unread boolean, has_unread_reaction boolean,
  unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone,
  last_reaction_sender_name text, last_reaction_sender_avatar_url text,
  last_reaction_message_preview text, email_contact text, email_subject text,
  last_event_at timestamp with time zone, last_event_text text, last_event_status_color text,
  unread_event_count bigint, counterpart_name text, counterpart_avatar_url text,
  last_read_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.*
  FROM get_inbox_threads_v2(p_workspace_id, p_user_id) t
  WHERE t.last_message_at IS NOT NULL
    AND (
      SELECT lm.sender_role
      FROM project_messages lm
      WHERE lm.thread_id = t.thread_id
        AND lm.source <> 'telegram_service'::message_source
      ORDER BY lm.created_at DESC
      LIMIT 1
    ) IN ('Администратор', 'Владелец', 'Сотрудник', 'Исполнитель')
    AND EXISTS (
      SELECT 1 FROM project_messages e
      WHERE e.thread_id = t.thread_id
        AND e.source IN (
          'telegram'::message_source,
          'telegram_business'::message_source,
          'telegram_mtproto'::message_source,
          'wazzup'::message_source,
          'email_internal'::message_source,
          'email'::message_source
        )
    )
  ORDER BY COALESCE(GREATEST(t.last_message_at, t.last_event_at), 'epoch'::timestamptz) DESC,
           t.thread_id DESC;
$function$;

-- После CREATE функция получает PUBLIC EXECUTE по умолчанию. Снимаем PUBLIC и
-- выдаём явно — иначе anon сохранит доступ (см. security-волну 2026-06-12).
REVOKE EXECUTE ON FUNCTION public.get_inbox_awaiting_reply_threads(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inbox_awaiting_reply_threads(uuid, uuid) TO authenticated, service_role;
