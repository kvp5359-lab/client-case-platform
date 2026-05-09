-- ============================================================
-- Email (Resend) — RPC и обновление триггера маршрутизации
-- ============================================================

-- 1. resolve_inbound_email_address
-- Разбирает To-адрес входящего письма и возвращает резолюцию:
-- workspace, тип (thread / project / virtual / inbox / unknown_*), плюс параметры.
CREATE OR REPLACE FUNCTION public.resolve_inbound_email_address(p_address text)
RETURNS TABLE (
  workspace_id uuid,
  workspace_slug text,
  resolution_type text,
  thread_id uuid,
  project_id uuid,
  virtual_address_id uuid,
  routing_mode text,
  target_project_id uuid,
  target_thread_id uuid,
  default_thread_template_id uuid,
  default_assignee_user_id uuid,
  auto_reply_enabled boolean,
  auto_reply_text text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local text := lower(split_part(p_address, '@', 1));
  v_domain text := lower(split_part(p_address, '@', 2));
  v_root_domain text := 'clientcase.app';
  v_slug text;
  v_workspace_id uuid;
  v_short_id int;
BEGIN
  -- Резолв slug по поддомену <slug>.clientcase.app или по custom_domain
  IF v_domain LIKE '%.' || v_root_domain THEN
    v_slug := substring(v_domain FROM 1 FOR length(v_domain) - length(v_root_domain) - 1);
    SELECT w.id INTO v_workspace_id FROM workspaces w
      WHERE w.slug = v_slug AND w.is_deleted = false LIMIT 1;
  ELSE
    SELECT w.id, w.slug INTO v_workspace_id, v_slug
    FROM workspaces w WHERE w.custom_domain = v_domain AND w.is_deleted = false LIMIT 1;
  END IF;

  IF v_workspace_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, v_slug, 'unknown_workspace'::text,
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
      NULL::uuid, NULL::uuid, NULL::boolean, NULL::text;
    RETURN;
  END IF;

  -- 1. inbox@... — forward от сотрудника, нужен дополнительный матчинг
  IF v_local = 'inbox' THEN
    RETURN QUERY SELECT v_workspace_id, v_slug, 'inbox'::text,
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
      NULL::uuid, NULL::uuid, NULL::boolean, NULL::text;
    RETURN;
  END IF;

  -- 2. t+<N>@... — конкретный тред
  IF v_local ~ '^t\+[0-9]+$' THEN
    v_short_id := substring(v_local FROM 3)::int;
    RETURN QUERY
      SELECT v_workspace_id, v_slug, 'thread'::text,
        pt.id, pt.project_id, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
        NULL::uuid, NULL::uuid, NULL::boolean, NULL::text
      FROM project_threads pt
      WHERE pt.workspace_id = v_workspace_id AND pt.short_id = v_short_id;
    RETURN;
  END IF;

  -- 3. p+<N>@... — проект
  IF v_local ~ '^p\+[0-9]+$' THEN
    v_short_id := substring(v_local FROM 3)::int;
    RETURN QUERY
      SELECT v_workspace_id, v_slug, 'project'::text,
        NULL::uuid, p.id, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
        NULL::uuid, NULL::uuid, NULL::boolean, NULL::text
      FROM projects p
      WHERE p.workspace_id = v_workspace_id AND p.short_id = v_short_id AND p.is_deleted = false;
    RETURN;
  END IF;

  -- 4. Виртуальный адрес (support@, hh@, leads@…)
  RETURN QUERY
    SELECT v_workspace_id, v_slug, 'virtual'::text,
      NULL::uuid, NULL::uuid, ev.id, ev.routing_mode,
      ev.target_project_id, ev.target_thread_id,
      ev.default_thread_template_id, ev.default_assignee_user_id,
      ev.auto_reply_enabled, ev.auto_reply_text
    FROM email_virtual_addresses ev
    WHERE ev.workspace_id = v_workspace_id
      AND ev.local_part = v_local
      AND ev.is_active = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT v_workspace_id, v_slug, 'unknown_local'::text,
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
      NULL::uuid, NULL::uuid, NULL::boolean, NULL::text;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_inbound_email_address(text) TO service_role;

-- 2. match_inbound_email
-- Для resolution_type='inbox' нужен дополнительный матчинг —
-- адрес-получатель не указывает на конкретный тред.
CREATE OR REPLACE FUNCTION public.match_inbound_email(
  p_workspace_id uuid,
  p_from_address text,
  p_in_reply_to text,
  p_references text[]
)
RETURNS TABLE (
  thread_id uuid,
  project_id uuid,
  match_method text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id uuid;
  v_project_id uuid;
BEGIN
  -- 1. По In-Reply-To
  IF p_in_reply_to IS NOT NULL THEN
    SELECT pm.thread_id, pm.project_id INTO v_thread_id, v_project_id
    FROM project_messages pm
    WHERE pm.workspace_id = p_workspace_id AND pm.email_message_id = p_in_reply_to
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_thread_id, v_project_id, 'in_reply_to'::text;
      RETURN;
    END IF;
  END IF;

  -- 2. По References
  IF p_references IS NOT NULL AND array_length(p_references, 1) > 0 THEN
    SELECT pm.thread_id, pm.project_id INTO v_thread_id, v_project_id
    FROM project_messages pm
    WHERE pm.workspace_id = p_workspace_id AND pm.email_message_id = ANY(p_references)
    ORDER BY pm.created_at DESC
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_thread_id, v_project_id, 'references'::text;
      RETURN;
    END IF;
  END IF;

  -- 3. По From + recent activity (90 дней)
  SELECT pt.id, pt.project_id INTO v_thread_id, v_project_id
  FROM project_threads pt
  WHERE pt.workspace_id = p_workspace_id
    AND pt.email_last_external_address = p_from_address
    AND pt.is_deleted = false
    AND pt.updated_at > now() - interval '90 days'
  ORDER BY pt.updated_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_thread_id, v_project_id, 'from_recent'::text;
    RETURN;
  END IF;

  -- 4. Не нашли
  RETURN QUERY SELECT NULL::uuid, NULL::uuid, 'none'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_inbound_email(uuid, text, text, text[]) TO service_role;

-- 3. get_thread_email_address — формирует t+<short_id>@<slug>.clientcase.app для UI
CREATE OR REPLACE FUNCTION public.get_thread_email_address(p_thread_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_short_id int;
  v_workspace_slug text;
  v_email_active boolean;
BEGIN
  SELECT pt.short_id, w.slug, w.email_active
  INTO v_short_id, v_workspace_slug, v_email_active
  FROM project_threads pt
  JOIN workspaces w ON w.id = pt.workspace_id
  WHERE pt.id = p_thread_id;

  IF v_short_id IS NULL OR v_workspace_slug IS NULL OR NOT v_email_active THEN
    RETURN NULL;
  END IF;

  RETURN 't+' || v_short_id || '@' || v_workspace_slug || '.clientcase.app';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_thread_email_address(uuid) TO authenticated;

-- 4. Обновление триггера: добавляем ветку email + email-источники в skip-list.
CREATE OR REPLACE FUNCTION public.notify_telegram_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tg_chat project_telegram_chats%ROWTYPE;
  v_reply_tg_msg_id BIGINT;
  v_business_connection_id UUID;
  v_mtproto_session_user_id UUID;
  v_mtproto_client_tg_user_id BIGINT;
  v_wazzup_channel_id UUID;
  v_wazzup_chat_id TEXT;
  v_email_send_account_id UUID;
  v_is_email_thread BOOLEAN;
BEGIN
  -- Skip входящих/служебных + email_internal (приём)
  IF NEW.source IN ('telegram', 'telegram_service', 'bot_event',
                    'telegram_business', 'telegram_mtproto', 'wazzup',
                    'email', 'email_internal') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_draft = true THEN
    RETURN NEW;
  END IF;

  IF NEW.has_attachments = true THEN
    RETURN NEW;
  END IF;

  -- ВЕТКА: MTProto
  IF NEW.thread_id IS NOT NULL THEN
    SELECT mtproto_session_user_id, mtproto_client_tg_user_id
    INTO v_mtproto_session_user_id, v_mtproto_client_tg_user_id
    FROM project_threads WHERE id = NEW.thread_id;

    IF v_mtproto_session_user_id IS NOT NULL AND v_mtproto_client_tg_user_id IS NOT NULL THEN
      IF NEW.reply_to_message_id IS NOT NULL THEN
        SELECT telegram_message_id INTO v_reply_tg_msg_id
        FROM project_messages WHERE id = NEW.reply_to_message_id;
      END IF;
      PERFORM net.http_post(
        url := 'https://mtproto.kvp-projects.com/messages/send',
        body := jsonb_build_object(
          'message_id_internal', NEW.id,
          'user_id', v_mtproto_session_user_id,
          'client_tg_user_id', v_mtproto_client_tg_user_id,
          'text', NEW.content,
          'reply_to_telegram_message_id', v_reply_tg_msg_id
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', '097e79a971f850687012b96537d389b6b734b4538d29cf25cc7b58234dadcdab'
        )
      );
      RETURN NEW;
    END IF;
  END IF;

  -- ВЕТКА: Telegram Business
  IF NEW.thread_id IS NOT NULL THEN
    SELECT business_connection_id INTO v_business_connection_id
    FROM project_threads WHERE id = NEW.thread_id;
    IF v_business_connection_id IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/telegram-business-send',
        body := jsonb_build_object('message_id', NEW.id),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', '097e79a971f850687012b96537d389b6b734b4538d29cf25cc7b58234dadcdab'
        )
      );
      RETURN NEW;
    END IF;
  END IF;

  -- ВЕТКА: Wazzup
  IF NEW.thread_id IS NOT NULL THEN
    SELECT wazzup_channel_id, wazzup_chat_id INTO v_wazzup_channel_id, v_wazzup_chat_id
    FROM project_threads WHERE id = NEW.thread_id;
    IF v_wazzup_channel_id IS NOT NULL AND v_wazzup_chat_id IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/wazzup-send',
        body := jsonb_build_object('message_id', NEW.id),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', '097e79a971f850687012b96537d389b6b734b4538d29cf25cc7b58234dadcdab'
        )
      );
      RETURN NEW;
    END IF;
  END IF;

  -- ВЕТКА: Email (employee_mailbox или system_resend)
  -- Тред считается email-каналом если у него явно привязан send_account
  -- ИЛИ в треде уже есть хотя бы одно сообщение с source='email_internal'.
  IF NEW.thread_id IS NOT NULL THEN
    SELECT pt.email_send_account_id,
           (pt.email_send_account_id IS NOT NULL OR EXISTS (
              SELECT 1 FROM project_messages pm2
              WHERE pm2.thread_id = NEW.thread_id
                AND pm2.source = 'email_internal'
              LIMIT 1
           ))
    INTO v_email_send_account_id, v_is_email_thread
    FROM project_threads pt WHERE pt.id = NEW.thread_id;

    IF v_is_email_thread THEN
      PERFORM net.http_post(
        url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/email-internal-send',
        body := jsonb_build_object('message_id', NEW.id),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', '097e79a971f850687012b96537d389b6b734b4538d29cf25cc7b58234dadcdab'
        )
      );
      RETURN NEW;
    END IF;
  END IF;

  -- ВЕТКА: Telegram Group (legacy)
  IF NEW.thread_id IS NOT NULL THEN
    SELECT * INTO v_tg_chat FROM project_telegram_chats
    WHERE thread_id = NEW.thread_id AND is_active = true;
  END IF;

  IF NOT FOUND AND NEW.thread_id IS NULL AND NEW.channel IS NOT NULL THEN
    SELECT * INTO v_tg_chat FROM project_telegram_chats
    WHERE project_id = NEW.project_id AND channel = NEW.channel AND is_active = true;
  END IF;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.reply_to_message_id IS NOT NULL THEN
    SELECT telegram_message_id INTO v_reply_tg_msg_id
    FROM project_messages WHERE id = NEW.reply_to_message_id;
  END IF;

  PERFORM net.http_post(
    url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/telegram-send-message',
    body := jsonb_build_object(
      'message_id', NEW.id,
      'project_id', NEW.project_id,
      'content', NEW.content,
      'sender_name', NEW.sender_name,
      'sender_role', NEW.sender_role,
      'telegram_chat_id', v_tg_chat.telegram_chat_id,
      'reply_to_telegram_message_id', v_reply_tg_msg_id
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', '097e79a971f850687012b96537d389b6b734b4538d29cf25cc7b58234dadcdab'
    )
  );

  RETURN NEW;
END;
$function$;
