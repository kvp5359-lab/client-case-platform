-- Аудит безопасности 2026-06-12, этап 1.1.
-- 1) Гейт прав внутри set/delete_workspace_*_api_key: фронт зовёт их напрямую под
--    authenticated, но до этого ЛЮБОЙ залогиненный мог перезаписать/удалить ключи
--    любого воркспейса. Теперь — только владелец или manage_workspace_settings.
--    service_role / триггеры / cron проходят без гейта (auth.role() у них не 'authenticated').
-- 2) REVOKE EXECUTE: Supabase по умолчанию даёт PUBLIC EXECUTE всем RPC.
--    Блок 1 — service_role-only функции (Vault-чтение, webhook-роутинг, сессии, http-диспетчер).
--    Блок 2/3 — продуктовые RPC: отзываем у anon (фронт всегда authenticated;
--    pre-auth middleware использует только resolve_workspace_by_host и
--    get_workspace_slug_by_id — их НЕ трогаем).
-- 3) DROP debug_auth_context — отладочный мусор в проде.

-- ============================================================
-- 1. Гейты прав на функции управления API-ключами (Vault)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_workspace_api_key(workspace_uuid uuid, api_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing_key_id uuid;
  new_key_id uuid;
  key_name text;
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' THEN
    IF NOT (
      public.is_workspace_owner(auth.uid(), workspace_uuid)
      OR public.has_workspace_permission(auth.uid(), workspace_uuid, 'manage_workspace_settings')
    ) THEN
      RAISE EXCEPTION 'Access denied: manage_workspace_settings required';
    END IF;
  ELSIF coalesce(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  key_name := 'anthropic_key_' || workspace_uuid::text;

  SELECT anthropic_api_key_id INTO existing_key_id
  FROM workspaces
  WHERE id = workspace_uuid;

  IF existing_key_id IS NOT NULL THEN
    PERFORM vault.update_secret(existing_key_id, api_key, key_name, 'Anthropic API key for workspace');
    RETURN existing_key_id;
  ELSE
    SELECT vault.create_secret(api_key, key_name, 'Anthropic API key for workspace') INTO new_key_id;

    UPDATE workspaces
    SET anthropic_api_key_id = new_key_id
    WHERE id = workspace_uuid;

    RETURN new_key_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_workspace_api_key(workspace_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  key_id uuid;
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' THEN
    IF NOT (
      public.is_workspace_owner(auth.uid(), workspace_uuid)
      OR public.has_workspace_permission(auth.uid(), workspace_uuid, 'manage_workspace_settings')
    ) THEN
      RAISE EXCEPTION 'Access denied: manage_workspace_settings required';
    END IF;
  ELSIF coalesce(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT anthropic_api_key_id INTO key_id
  FROM workspaces
  WHERE id = workspace_uuid;

  IF key_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM vault.secrets WHERE id = key_id;

  UPDATE workspaces
  SET anthropic_api_key_id = NULL
  WHERE id = workspace_uuid;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_workspace_google_api_key(workspace_uuid uuid, api_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_key_id uuid;
  v_new_key_id uuid;
  v_key_name text;
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' THEN
    IF NOT (
      public.is_workspace_owner(auth.uid(), workspace_uuid)
      OR public.has_workspace_permission(auth.uid(), workspace_uuid, 'manage_workspace_settings')
    ) THEN
      RAISE EXCEPTION 'Access denied: manage_workspace_settings required';
    END IF;
  ELSIF coalesce(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_key_name := 'google_key_' || workspace_uuid::text;

  SELECT google_api_key_id INTO v_existing_key_id
  FROM workspaces
  WHERE id = workspace_uuid;

  IF v_existing_key_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_key_id, api_key, v_key_name, 'Google API key for workspace');
    RETURN v_existing_key_id;
  ELSE
    SELECT vault.create_secret(api_key, v_key_name, 'Google API key for workspace') INTO v_new_key_id;

    UPDATE workspaces
    SET google_api_key_id = v_new_key_id
    WHERE id = workspace_uuid;

    RETURN v_new_key_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_workspace_google_api_key(workspace_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key_id uuid;
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' THEN
    IF NOT (
      public.is_workspace_owner(auth.uid(), workspace_uuid)
      OR public.has_workspace_permission(auth.uid(), workspace_uuid, 'manage_workspace_settings')
    ) THEN
      RAISE EXCEPTION 'Access denied: manage_workspace_settings required';
    END IF;
  ELSIF coalesce(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT google_api_key_id INTO v_key_id
  FROM workspaces
  WHERE id = workspace_uuid;

  IF v_key_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM vault.secrets WHERE id = v_key_id;

  UPDATE workspaces
  SET google_api_key_id = NULL
  WHERE id = workspace_uuid;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_workspace_voyageai_api_key(workspace_uuid uuid, api_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_key_id uuid;
  v_new_key_id uuid;
  v_key_name text;
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' THEN
    IF NOT (
      public.is_workspace_owner(auth.uid(), workspace_uuid)
      OR public.has_workspace_permission(auth.uid(), workspace_uuid, 'manage_workspace_settings')
    ) THEN
      RAISE EXCEPTION 'Access denied: manage_workspace_settings required';
    END IF;
  ELSIF coalesce(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_key_name := 'voyageai_key_' || workspace_uuid::text;

  SELECT voyageai_api_key_id INTO v_existing_key_id
  FROM workspaces
  WHERE id = workspace_uuid;

  IF v_existing_key_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_key_id, api_key, v_key_name, 'VoyageAI API key for workspace');
    RETURN v_existing_key_id;
  ELSE
    SELECT vault.create_secret(api_key, v_key_name, 'VoyageAI API key for workspace') INTO v_new_key_id;

    UPDATE workspaces
    SET voyageai_api_key_id = v_new_key_id
    WHERE id = workspace_uuid;

    RETURN v_new_key_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_workspace_voyageai_api_key(workspace_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key_id uuid;
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' THEN
    IF NOT (
      public.is_workspace_owner(auth.uid(), workspace_uuid)
      OR public.has_workspace_permission(auth.uid(), workspace_uuid, 'manage_workspace_settings')
    ) THEN
      RAISE EXCEPTION 'Access denied: manage_workspace_settings required';
    END IF;
  ELSIF coalesce(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT voyageai_api_key_id INTO v_key_id
  FROM workspaces
  WHERE id = workspace_uuid;

  IF v_key_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM vault.secrets WHERE id = v_key_id;

  UPDATE workspaces
  SET voyageai_api_key_id = NULL
  WHERE id = workspace_uuid;

  RETURN true;
END;
$function$;

-- ============================================================
-- 2. REVOKE: блок 1 — service_role-only (anon И authenticated)
--    Vault-чтение зовут только Edge Functions (service_role),
--    webhook-роутинг — Next API route на service-клиенте,
--    dispatch_send_http — только SECURITY DEFINER триггер-цепочка
--    (проверено: вся цепочка prosecdef=true, выполняется от владельца).
-- ============================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname = ANY(ARRAY[
      'get_workspace_api_key',
      'get_workspace_google_api_key',
      'get_workspace_voyageai_api_key',
      'dispatch_send_http',
      'revoke_all_user_sessions',
      'add_document_version_service',
      'fill_slot_atomic_service',
      'route_incoming_to_project',
      'match_inbound_email',
      'resolve_inbound_email_address',
      'find_or_create_contact_participant',
      'append_telegram_message_id'
    ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    -- PUBLIC-грант был единственным: вернуть EXECUTE service_role явно,
    -- иначе Edge Functions (PostgREST под service_role) потеряют доступ
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ============================================================
-- 3. REVOKE: блоки 2-3 — отзываем только у anon
--    (фронт зовёт их залогиненным; pre-auth функции
--    resolve_workspace_by_host / get_workspace_slug_by_id не трогаем)
-- ============================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname = ANY(ARRAY[
      -- ключи (set/delete остаются authenticated с внутренним гейтом)
      'set_workspace_api_key', 'delete_workspace_api_key',
      'set_workspace_google_api_key', 'delete_workspace_google_api_key',
      'set_workspace_voyageai_api_key', 'delete_workspace_voyageai_api_key',
      -- данные/мутации по параметрам
      'get_chat_state', 'get_current_document_file', 'get_document_file_history',
      'add_document_version', 'restore_document_version', 'reorder_documents',
      'add_message_pair', 'toggle_message_reaction',
      'update_task_assignees', 'create_task_with_assignees',
      'delete_status', 'convert_external_event_to_task',
      'match_knowledge_chunks', 'match_knowledge_chunks_by_articles', 'match_knowledge_chunks_by_sources',
      'upsert_knowledge_embeddings',
      'get_accessible_projects', 'get_user_projects', 'get_workspace_threads',
      'get_inbox_threads_v2', 'get_inbox_threads_page', 'get_inbox_thread_aggregates',
      'get_inbox_unread_threads', 'get_inbox_thread_one', 'get_inbox_search_threads',
      'get_inbox_message_status',
      'get_total_unread_count', 'get_sidebar_data', 'get_project_history',
      'get_short_id_by_uuid', 'resolve_short_id',
      -- гигиена (внутри уже есть auth.uid()-гейт)
      'get_personal_dialogs', 'merge_participants', 'merge_telegram_contact',
      'fill_folder_slot', 'fill_slot_atomic', 'move_thread_to_project',
      'set_my_preferred_language', 'end_impersonation_session'
    ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- ============================================================
-- 4. Отладочный мусор
-- ============================================================

DROP FUNCTION IF EXISTS public.debug_auth_context();
