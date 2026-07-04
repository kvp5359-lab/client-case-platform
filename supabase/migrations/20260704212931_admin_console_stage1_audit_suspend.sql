-- Админка платформы, этап 1: аудит действий админа + блокировка воркспейса +
-- карточка воркспейса + последняя активность.
-- План: docs/feature-backlog/2026-07-04-platform-admin-console.md

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Журнал действий платформенного админа (только service_role/RPC)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_admin_audit (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_user_id  uuid NOT NULL,
  action         text NOT NULL,          -- set_plan / suspend_workspace / ...
  workspace_id   uuid,
  target_user_id uuid,
  details        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_created
  ON public.platform_admin_audit (created_at DESC);
ALTER TABLE public.platform_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admin_audit FROM anon, authenticated;
GRANT ALL ON public.platform_admin_audit TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Внутренние хелперы (клиентам напрямую не выдаются)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.require_platform_admin()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := (SELECT auth.uid());
BEGIN
  IF NOT is_platform_admin(v_uid) THEN
    RAISE EXCEPTION 'Доступ только для администратора платформы';
  END IF;
  RETURN v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public.require_platform_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.require_platform_admin() TO service_role;

CREATE OR REPLACE FUNCTION public._platform_admin_log(
  p_admin uuid, p_action text, p_workspace uuid DEFAULT NULL,
  p_target_user uuid DEFAULT NULL, p_details jsonb DEFAULT NULL
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  INSERT INTO platform_admin_audit (admin_user_id, action, workspace_id, target_user_id, details)
  VALUES (p_admin, p_action, p_workspace, p_target_user, p_details);
$$;
REVOKE ALL ON FUNCTION public._platform_admin_log(uuid, text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._platform_admin_log(uuid, text, uuid, uuid, jsonb) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Блокировка воркспейса целиком
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

-- Проверка для server-гарда в layout (не зависит от RLS на workspaces).
CREATE OR REPLACE FUNCTION public.is_workspace_suspended(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT w.is_suspended FROM workspaces w WHERE w.id = p_workspace_id), false);
$$;
REVOKE ALL ON FUNCTION public.is_workspace_suspended(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_suspended(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_suspend_workspace(p_workspace_id uuid, p_suspended boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_admin uuid;
BEGIN
  v_admin := require_platform_admin();
  UPDATE workspaces
     SET is_suspended = p_suspended,
         suspended_at = CASE WHEN p_suspended THEN now() ELSE NULL END
   WHERE id = p_workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Воркспейс не найден';
  END IF;
  PERFORM _platform_admin_log(
    v_admin,
    CASE WHEN p_suspended THEN 'suspend_workspace' ELSE 'unsuspend_workspace' END,
    p_workspace_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_suspend_workspace(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_suspend_workspace(uuid, boolean) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. admin_set_workspace_plan — то же поведение + запись в аудит
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_workspace_plan(p_workspace_id uuid, p_plan_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_plan_id uuid; v_admin uuid;
BEGIN
  v_admin := require_platform_admin();

  IF p_plan_code IS NULL THEN
    DELETE FROM workspace_billing WHERE workspace_id = p_workspace_id;
    PERFORM _platform_admin_log(v_admin, 'set_plan', p_workspace_id, NULL,
      jsonb_build_object('plan_code', NULL));
    RETURN;
  END IF;

  SELECT id INTO v_plan_id FROM plans WHERE code = p_plan_code;
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Тариф не найден: %', p_plan_code;
  END IF;

  INSERT INTO workspace_billing (workspace_id, plan_id, status, current_period_start, updated_at)
  VALUES (p_workspace_id, v_plan_id, 'active', now(), now())
  ON CONFLICT (workspace_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    updated_at = now();

  PERFORM _platform_admin_log(v_admin, 'set_plan', p_workspace_id, NULL,
    jsonb_build_object('plan_code', p_plan_code));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_workspace_plan(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_workspace_plan(uuid, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. admin_list_workspaces v2 — + статус, владелец, активность, биллинг-даты.
--    Набор колонок меняется → DROP + CREATE (гранты восстановить!).
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_list_workspaces();
CREATE FUNCTION public.admin_list_workspaces()
RETURNS TABLE(
  workspace_id uuid, workspace_name text, created_at timestamptz,
  is_suspended boolean, is_deleted boolean,
  owner_name text, owner_email text,
  plan_code text, plan_name text, billing_status text,
  trial_ends_at timestamptz, paid_until timestamptz,
  participants_count integer, projects_count integer, storage_mb integer,
  ai_tokens_used bigint, ai_tokens_monthly bigint,
  last_activity_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM require_platform_admin();
  RETURN QUERY
  SELECT
    w.id, w.name, w.created_at,
    w.is_suspended, w.is_deleted,
    ow.owner_name, ow.owner_email,
    pl.code, pl.name, b.status,
    b.trial_ends_at, b.current_period_end,
    (SELECT count(*)::int FROM participants p WHERE p.workspace_id=w.id AND p.is_deleted=false),
    (SELECT count(*)::int FROM projects pr WHERE pr.workspace_id=w.id AND pr.is_deleted=false),
    (SELECT COALESCE(round(sum(f.file_size)/1048576.0),0)::int FROM files f WHERE f.workspace_id=w.id),
    (SELECT COALESCE(sum(m.total_tokens),0)::bigint FROM ai_usage_monthly m
       WHERE m.workspace_id=w.id AND m.period=date_trunc('month', now())::date),
    pl.ai_tokens_monthly,
    (SELECT max(pr.last_activity_at) FROM projects pr WHERE pr.workspace_id=w.id)
  FROM workspaces w
  LEFT JOIN workspace_billing b ON b.workspace_id=w.id
  LEFT JOIN plans pl ON pl.id=b.plan_id
  LEFT JOIN LATERAL (
    SELECT trim(concat_ws(' ', p.name, p.last_name)) AS owner_name, p.email AS owner_email
    FROM participants p
    WHERE p.workspace_id=w.id AND p.is_deleted=false AND 'Владелец' = ANY(p.workspace_roles)
    ORDER BY p.created_at LIMIT 1
  ) ow ON true
  ORDER BY w.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_workspaces() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_workspaces() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Карточка воркспейса
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_workspace_details(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM require_platform_admin();
  SELECT jsonb_build_object(
    'workspace', (SELECT jsonb_build_object(
        'id', w.id, 'name', w.name, 'slug', w.slug, 'created_at', w.created_at,
        'is_suspended', w.is_suspended, 'suspended_at', w.suspended_at, 'is_deleted', w.is_deleted)
      FROM workspaces w WHERE w.id = p_workspace_id),
    'owner', (SELECT jsonb_build_object(
        'name', trim(concat_ws(' ', p.name, p.last_name)),
        'email', p.email, 'phone', p.phone, 'user_id', p.user_id)
      FROM participants p
      WHERE p.workspace_id = p_workspace_id AND p.is_deleted=false
        AND 'Владелец' = ANY(p.workspace_roles)
      ORDER BY p.created_at LIMIT 1),
    'billing', (SELECT jsonb_build_object(
        'plan_code', pl.code, 'plan_name', pl.name, 'status', b.status,
        'trial_ends_at', b.trial_ends_at, 'paid_until', b.current_period_end)
      FROM workspace_billing b LEFT JOIN plans pl ON pl.id=b.plan_id
      WHERE b.workspace_id = p_workspace_id),
    'usage', jsonb_build_object(
        'participants', (SELECT count(*) FROM participants p WHERE p.workspace_id=p_workspace_id AND p.is_deleted=false),
        'projects', (SELECT count(*) FROM projects pr WHERE pr.workspace_id=p_workspace_id AND pr.is_deleted=false),
        'threads', (SELECT count(*) FROM project_threads t WHERE t.workspace_id=p_workspace_id AND t.is_deleted=false),
        'storage_mb', (SELECT COALESCE(round(sum(f.file_size)/1048576.0),0) FROM files f WHERE f.workspace_id=p_workspace_id),
        'messages_30d', (SELECT count(*) FROM project_messages m WHERE m.workspace_id=p_workspace_id AND m.created_at > now() - interval '30 days'),
        'ai_tokens_month', (SELECT COALESCE(sum(m.total_tokens),0) FROM ai_usage_monthly m
           WHERE m.workspace_id=p_workspace_id AND m.period=date_trunc('month', now())::date),
        'last_activity_at', (SELECT max(pr.last_activity_at) FROM projects pr WHERE pr.workspace_id=p_workspace_id)),
    'integrations', jsonb_build_object(
        'telegram_bots', (SELECT count(*) FROM workspace_integrations wi
           WHERE wi.workspace_id=p_workspace_id AND wi.is_active
             AND wi.type IN ('telegram_workspace_bot','telegram_employee_bot')),
        'wazzup_channels', (SELECT count(*) FROM wazzup_channels wc WHERE wc.workspace_id=p_workspace_id AND wc.is_active),
        'email_accounts', (SELECT count(*) FROM email_accounts ea WHERE ea.workspace_id=p_workspace_id AND ea.is_active),
        'email_watch_expired', (SELECT count(*) FROM email_accounts ea
           WHERE ea.workspace_id=p_workspace_id AND ea.is_active AND ea.watch_expires_at < now()),
        'mtproto_sessions', (SELECT count(*) FROM telegram_mtproto_sessions ms WHERE ms.workspace_id=p_workspace_id AND ms.is_active),
        'business_connections', (SELECT count(*) FROM telegram_business_connections bc
           WHERE bc.workspace_id=p_workspace_id AND bc.is_enabled AND bc.disconnected_at IS NULL)),
    'participants', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', trim(concat_ws(' ', p.name, p.last_name)),
        'email', p.email, 'roles', p.workspace_roles, 'can_login', p.can_login,
        'has_account', p.user_id IS NOT NULL, 'created_at', p.created_at)
        ORDER BY p.created_at), '[]'::jsonb)
      FROM (SELECT * FROM participants p2
            WHERE p2.workspace_id=p_workspace_id AND p2.is_deleted=false
            ORDER BY p2.created_at LIMIT 200) p),
    'ai_monthly', (SELECT COALESCE(jsonb_agg(jsonb_build_object('period', x.period, 'total_tokens', x.tok)
        ORDER BY x.period DESC), '[]'::jsonb)
      FROM (SELECT m.period, sum(m.total_tokens) AS tok FROM ai_usage_monthly m
            WHERE m.workspace_id=p_workspace_id GROUP BY m.period ORDER BY m.period DESC LIMIT 6) x)
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_workspace_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_workspace_details(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Журнал в UI
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_audit(p_limit integer DEFAULT 200)
RETURNS TABLE(
  id bigint, created_at timestamptz, admin_email text, action text,
  workspace_id uuid, workspace_name text, target_user_id uuid, details jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM require_platform_admin();
  RETURN QUERY
  SELECT a.id, a.created_at, u.email::text, a.action,
         a.workspace_id, w.name, a.target_user_id, a.details
  FROM platform_admin_audit a
  LEFT JOIN auth.users u ON u.id = a.admin_user_id
  LEFT JOIN workspaces w ON w.id = a.workspace_id
  ORDER BY a.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_audit(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_audit(integer) TO authenticated, service_role;
