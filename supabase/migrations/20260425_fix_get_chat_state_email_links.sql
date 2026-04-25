-- Fix get_chat_state: ссылалась на несуществующую таблицу email_links.
-- Правильное имя — project_thread_email_links. Колонки те же
-- (id, thread_id, contact_email, subject), так что меняем только имя таблицы.
-- Также добавил фильтр is_active = true (как в обычном чтении).
--
-- Симптомы до фикса: открытие чата валило 404 на /rest/v1/rpc/get_chat_state
-- (на самом деле 500 из-за relation не existing, PostgREST показывал 404),
-- что роняло MessengerTabContent в ErrorBoundary. Иногда отправка сообщений
-- (особенно с файлами) падала — повторная попытка проходила, потому что
-- падал только preload-запрос, а не сам send.

CREATE OR REPLACE FUNCTION public.get_chat_state(
  p_thread_id uuid,
  p_user_id uuid,
  p_project_id uuid DEFAULT NULL::uuid,
  p_workspace_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id UUID;
  v_participant_name TEXT;
  v_participant_last_name TEXT;
  v_participant_avatar TEXT;
  v_participant_role TEXT;
  v_telegram_link JSON;
  v_email_link JSON;
  v_unread_count INTEGER;
  v_last_read_at TIMESTAMPTZ;
  v_manually_unread BOOLEAN;
BEGIN
  IF p_project_id IS NOT NULL THEN
    SELECT p.id, p.name, p.last_name, p.avatar_url, pp.project_roles[1]
    INTO v_participant_id, v_participant_name, v_participant_last_name,
         v_participant_avatar, v_participant_role
    FROM participants p
    JOIN project_participants pp ON pp.participant_id = p.id
    WHERE p.user_id = p_user_id
      AND pp.project_id = p_project_id
      AND p.is_deleted = false
    LIMIT 1;
  ELSIF p_workspace_id IS NOT NULL THEN
    SELECT id, name, last_name, avatar_url, workspace_roles[1]
    INTO v_participant_id, v_participant_name, v_participant_last_name,
         v_participant_avatar, v_participant_role
    FROM participants
    WHERE user_id = p_user_id
      AND workspace_id = p_workspace_id
      AND is_deleted = false
    LIMIT 1;
  END IF;

  SELECT json_build_object(
    'id', id,
    'project_id', project_id,
    'telegram_chat_id', telegram_chat_id,
    'telegram_chat_title', telegram_chat_title,
    'is_active', is_active,
    'channel', channel
  )
  INTO v_telegram_link
  FROM project_telegram_chats
  WHERE thread_id = p_thread_id
    AND is_active = true
  LIMIT 1;

  SELECT json_build_object(
    'id', id,
    'thread_id', thread_id,
    'contact_email', contact_email,
    'subject', subject
  )
  INTO v_email_link
  FROM project_thread_email_links
  WHERE thread_id = p_thread_id
    AND is_active = true
  LIMIT 1;

  IF v_participant_id IS NOT NULL THEN
    SELECT last_read_at, manually_unread
    INTO v_last_read_at, v_manually_unread
    FROM message_read_status
    WHERE participant_id = v_participant_id
      AND thread_id = p_thread_id
    LIMIT 1;

    SELECT public.get_unread_messages_count(
      p_participant_id := v_participant_id,
      p_project_id := p_project_id,
      p_channel := 'client',
      p_thread_id := p_thread_id
    )
    INTO v_unread_count;
  END IF;

  RETURN json_build_object(
    'participant', CASE WHEN v_participant_id IS NOT NULL THEN
      json_build_object(
        'participantId', v_participant_id,
        'name', v_participant_name,
        'lastName', v_participant_last_name,
        'avatarUrl', v_participant_avatar,
        'role', v_participant_role
      )
    ELSE NULL END,
    'telegramLink', v_telegram_link,
    'emailLink', v_email_link,
    'unreadCount', COALESCE(v_unread_count, 0),
    'lastReadAt', v_last_read_at,
    'manuallyUnread', COALESCE(v_manually_unread, false)
  );
END;
$function$;
