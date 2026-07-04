-- Админка платформы, этап 6: вход под владельца любого воркспейса (support-режим).
-- Расширение start_impersonation_session: платформенный админ (platform_admins)
-- может импersonировать ВЛАДЕЛЬЦА любого воркспейса. Read-only и TTL 30 мин —
-- как у обычной импersonации (prevent_impersonation_writes + TTL в edge).
-- Каждый такой вход пишется в platform_admin_audit.
-- Тело снято с прода (drift-правило) + добавлены ветки платформенного админа.
-- План: docs/feature-backlog/2026-07-04-platform-admin-console.md

CREATE OR REPLACE FUNCTION public.start_impersonation_session(
  p_owner_user_id uuid, p_workspace_id uuid, p_target_user_id uuid,
  p_jti text, p_expires_at timestamptz,
  p_user_agent text DEFAULT NULL, p_ip text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_session_id  uuid;
  v_target_is_owner boolean;
  v_target_is_member boolean;
  v_is_platform_admin boolean;
BEGIN
  IF p_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'owner_user_id required' USING ERRCODE = '22023';
  END IF;

  v_is_platform_admin := public.is_platform_admin(p_owner_user_id);

  IF NOT v_is_platform_admin AND NOT public.is_workspace_owner(p_owner_user_id, p_workspace_id) THEN
    RAISE EXCEPTION 'only workspace owner can impersonate'
      USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id = p_owner_user_id THEN
    RAISE EXCEPTION 'cannot impersonate self'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.participants
    WHERE user_id = p_target_user_id
      AND workspace_id = p_workspace_id
      AND is_deleted = false
      AND can_login = true
  ) INTO v_target_is_member;

  IF NOT v_target_is_member THEN
    RAISE EXCEPTION 'target is not an active workspace member'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.participants
    WHERE user_id = p_target_user_id
      AND workspace_id = p_workspace_id
      AND is_deleted = false
      AND 'Владелец' = ANY(workspace_roles)
  ) INTO v_target_is_owner;

  -- Владелец воркспейса не может входить под другого владельца.
  -- Платформенный админ — может (в этом и смысл support-режима).
  IF v_target_is_owner AND NOT v_is_platform_admin THEN
    RAISE EXCEPTION 'cannot impersonate another workspace owner'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.impersonation_sessions (
    owner_user_id, target_user_id, workspace_id, jti, expires_at, user_agent, ip
  ) VALUES (
    p_owner_user_id, p_target_user_id, p_workspace_id, p_jti, p_expires_at, p_user_agent, p_ip
  ) RETURNING id INTO v_session_id;

  -- Аудит платформенного входа (когда сработал именно admin-путь,
  -- а не обычное право владельца этого воркспейса).
  IF v_is_platform_admin AND NOT public.is_workspace_owner(p_owner_user_id, p_workspace_id) THEN
    PERFORM public._platform_admin_log(
      p_owner_user_id, 'impersonate_workspace_owner', p_workspace_id, p_target_user_id, NULL);
  END IF;

  RETURN v_session_id;
END;
$function$;
