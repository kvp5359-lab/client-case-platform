-- Админка платформы, этап 4: пользователи (бан на уровне платформы) + объявления.
-- План: docs/feature-backlog/2026-07-04-platform-admin-console.md

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Пользователи платформы
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_users(p_search text DEFAULT NULL, p_limit integer DEFAULT 200)
RETURNS TABLE(
  user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
  is_banned boolean, workspaces jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM require_platform_admin();
  RETURN QUERY
  SELECT
    u.id, u.email::text, u.created_at, u.last_sign_in_at,
    COALESCE(u.banned_until > now(), false),
    COALESCE(pw.ws, '[]'::jsonb)
  FROM auth.users u
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
        'workspace_id', w.id, 'workspace_name', w.name,
        'roles', p.workspace_roles, 'can_login', p.can_login)
        ORDER BY w.created_at) AS ws
    FROM participants p JOIN workspaces w ON w.id = p.workspace_id
    WHERE p.user_id = u.id AND p.is_deleted = false
  ) pw ON true
  WHERE p_search IS NULL OR u.email ILIKE '%' || p_search || '%'
  ORDER BY u.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_users(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, integer) TO authenticated, service_role;

-- Бан аккаунта на уровне платформы: banned_until + отзыв всех сессий.
-- Токен живёт до часа, но server-гарды и refresh отрежут доступ раньше.
CREATE OR REPLACE FUNCTION public.admin_set_user_banned(p_user_id uuid, p_banned boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_admin uuid;
BEGIN
  v_admin := require_platform_admin();
  IF p_banned AND is_platform_admin(p_user_id) THEN
    RAISE EXCEPTION 'Нельзя заблокировать администратора платформы';
  END IF;

  UPDATE auth.users
     SET banned_until = CASE WHEN p_banned THEN '9999-01-01'::timestamptz ELSE NULL END
   WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Пользователь не найден';
  END IF;

  IF p_banned THEN
    DELETE FROM auth.sessions WHERE user_id = p_user_id;
    DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id;
  END IF;

  PERFORM _platform_admin_log(v_admin, CASE WHEN p_banned THEN 'ban_user' ELSE 'unban_user' END,
    NULL, p_user_id, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_user_banned(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_banned(uuid, boolean) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Объявления (баннер в сервисе)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message       text NOT NULL,
  level         text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning')),
  starts_at     timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz,
  workspace_ids uuid[],                -- NULL = всем воркспейсам
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_announcements FROM anon, authenticated;
GRANT ALL ON public.platform_announcements TO service_role;

-- Активные объявления для баннера (любой залогиненный, свой воркспейс).
CREATE OR REPLACE FUNCTION public.get_active_announcements(p_workspace_id uuid)
RETURNS TABLE(id uuid, message text, level text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT a.id, a.message, a.level
  FROM platform_announcements a
  WHERE a.is_active
    AND a.starts_at <= now()
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND (a.workspace_ids IS NULL OR p_workspace_id = ANY(a.workspace_ids))
    AND is_workspace_participant(p_workspace_id, (SELECT auth.uid()))
  ORDER BY a.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_active_announcements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_announcements(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_announcements()
RETURNS SETOF public.platform_announcements
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM require_platform_admin();
  RETURN QUERY SELECT * FROM platform_announcements ORDER BY created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_announcements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_announcements() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_upsert_announcement(p jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_admin uuid; v_id uuid; v_ws uuid[];
BEGIN
  v_admin := require_platform_admin();
  IF COALESCE(p->>'message', '') = '' THEN
    RAISE EXCEPTION 'Текст объявления пуст';
  END IF;
  v_ws := CASE
    WHEN p->'workspace_ids' IS NULL OR jsonb_typeof(p->'workspace_ids') = 'null' THEN NULL
    ELSE (SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(p->'workspace_ids') x)
  END;

  IF p->>'id' IS NOT NULL THEN
    UPDATE platform_announcements SET
      message       = p->>'message',
      level         = COALESCE(p->>'level', 'info'),
      starts_at     = COALESCE((p->>'starts_at')::timestamptz, starts_at),
      ends_at       = (p->>'ends_at')::timestamptz,
      workspace_ids = v_ws,
      is_active     = COALESCE((p->>'is_active')::boolean, true),
      updated_at    = now()
    WHERE id = (p->>'id')::uuid
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Объявление не найдено'; END IF;
  ELSE
    INSERT INTO platform_announcements (message, level, starts_at, ends_at, workspace_ids, is_active, created_by)
    VALUES (p->>'message', COALESCE(p->>'level', 'info'),
            COALESCE((p->>'starts_at')::timestamptz, now()), (p->>'ends_at')::timestamptz,
            v_ws, COALESCE((p->>'is_active')::boolean, true), v_admin)
    RETURNING id INTO v_id;
  END IF;

  PERFORM _platform_admin_log(v_admin, 'upsert_announcement', NULL, NULL,
    jsonb_build_object('id', v_id, 'message', left(p->>'message', 80)));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_upsert_announcement(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_announcement(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_announcement(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_admin uuid; v_msg text;
BEGIN
  v_admin := require_platform_admin();
  DELETE FROM platform_announcements WHERE id = p_id RETURNING left(message, 80) INTO v_msg;
  PERFORM _platform_admin_log(v_admin, 'delete_announcement', NULL, NULL, jsonb_build_object('message', v_msg));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_announcement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_announcement(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Выгрузка email владельцев (для рассылок вручную)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_owner_emails()
RETURNS TABLE(workspace_name text, owner_name text, owner_email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM require_platform_admin();
  RETURN QUERY
  SELECT w.name, trim(concat_ws(' ', p.name, p.last_name)), p.email
  FROM workspaces w
  JOIN participants p ON p.workspace_id = w.id AND p.is_deleted = false
    AND 'Владелец' = ANY(p.workspace_roles) AND p.email IS NOT NULL AND p.email <> ''
  WHERE w.is_deleted = false
  ORDER BY w.name;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_owner_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_owner_emails() TO authenticated, service_role;
