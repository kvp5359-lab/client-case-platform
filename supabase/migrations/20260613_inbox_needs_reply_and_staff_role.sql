-- Трёхсегментная модель «нужно ответить / ждём клиента» во «Входящих».
--
-- Внешние диалоги делятся без пересечений (приоритет — «Непрочитанные»):
--   • Непрочитанные   — есть непрочитанное входящее (RPC get_inbox_unread_threads, не тут).
--   • Нужно ответить  — последним написал КЛИЕНТ, и всё прочитано (ты видел, не ответил).
--   • Ждём клиента    — последним написали МЫ (тоже «прочитано», чтобы не пересекаться).
--
-- «Прочитано» во второй и третьей выборках = НЕ выполнены условия «непрочитанного»
-- из get_inbox_unread_threads → диалог не дублируется между вкладками.

-- ── Хелпер: роль отправителя — из команды (staff). Один источник набора ролей на
--    стороне БД (раньше список инлайнился в каждой RPC). Зеркало фронтового
--    isStaffRole / STAFF_ROLES (permissions.ts) — при изменении набора править оба.
CREATE OR REPLACE FUNCTION public.is_staff_role(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT p_role IN ('Администратор', 'Владелец', 'Сотрудник', 'Исполнитель');
$function$;

REVOKE EXECUTE ON FUNCTION public.is_staff_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff_role(text) TO authenticated, service_role;

-- ── «Ждём клиента»: последнее сообщение от нас + внешний диалог + прочитано.
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
    -- Прочитано: иначе пересекается с «Непрочитанными» (у них приоритет).
    AND COALESCE(t.unread_count, 0) = 0
    AND COALESCE(t.unread_event_count, 0) = 0
    AND COALESCE(t.unread_reaction_count, 0) = 0
    AND t.has_unread_reaction = false
    AND COALESCE(t.manually_unread, false) = false
    -- Последнее НЕ-сервисное сообщение треда — от нас (staff-роль).
    AND is_staff_role((
      SELECT lm.sender_role
      FROM project_messages lm
      WHERE lm.thread_id = t.thread_id
        AND lm.source <> 'telegram_service'::message_source
      ORDER BY lm.created_at DESC
      LIMIT 1
    ))
    -- Реальный внешний диалог (есть сообщение из внешнего канала).
    AND EXISTS (
      SELECT 1 FROM project_messages e
      WHERE e.thread_id = t.thread_id
        AND e.source IN (
          'telegram'::message_source, 'telegram_business'::message_source,
          'telegram_mtproto'::message_source, 'wazzup'::message_source,
          'email_internal'::message_source, 'email'::message_source
        )
    )
  ORDER BY COALESCE(GREATEST(t.last_message_at, t.last_event_at), 'epoch'::timestamptz) DESC,
           t.thread_id DESC;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_inbox_awaiting_reply_threads(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inbox_awaiting_reply_threads(uuid, uuid) TO authenticated, service_role;

-- ── «Нужно ответить»: последнее сообщение от клиента + внешний диалог + прочитано.
--    Инверсия предиката относительно «Ждём клиента»; гейт «прочитано» исключает
--    пересечение с «Непрочитанными».
CREATE OR REPLACE FUNCTION public.get_inbox_needs_reply_threads(
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
    -- Прочитано: непрочитанные живут в «Непрочитанных» (приоритет).
    AND COALESCE(t.unread_count, 0) = 0
    AND COALESCE(t.unread_event_count, 0) = 0
    AND COALESCE(t.unread_reaction_count, 0) = 0
    AND t.has_unread_reaction = false
    AND COALESCE(t.manually_unread, false) = false
    -- Последнее НЕ-сервисное сообщение — НЕ от нас (клиент; NULL-роль = собеседник).
    AND is_staff_role((
      SELECT lm.sender_role
      FROM project_messages lm
      WHERE lm.thread_id = t.thread_id
        AND lm.source <> 'telegram_service'::message_source
      ORDER BY lm.created_at DESC
      LIMIT 1
    )) IS NOT TRUE
    -- Реальный внешний диалог.
    AND EXISTS (
      SELECT 1 FROM project_messages e
      WHERE e.thread_id = t.thread_id
        AND e.source IN (
          'telegram'::message_source, 'telegram_business'::message_source,
          'telegram_mtproto'::message_source, 'wazzup'::message_source,
          'email_internal'::message_source, 'email'::message_source
        )
    )
  ORDER BY COALESCE(GREATEST(t.last_message_at, t.last_event_at), 'epoch'::timestamptz) DESC,
           t.thread_id DESC;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_inbox_needs_reply_threads(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inbox_needs_reply_threads(uuid, uuid) TO authenticated, service_role;
