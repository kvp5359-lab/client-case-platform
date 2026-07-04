-- Платформенная админка: супер-админ назначает тарифы воркспейсам и видит расход.
-- Отдельный уровень доступа НАД воркспейсами (владелец платформы, не воркспейса).
-- План: docs/feature-backlog/2026-07-04-billing-plans-and-ai-metering.md (Фаза 4)

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
-- Прямого доступа к таблице нет ни у кого из клиентов — только через функции ниже.
REVOKE ALL ON public.platform_admins FROM anon, authenticated;
GRANT ALL ON public.platform_admins TO service_role;

-- Сид: владелец платформы.
INSERT INTO public.platform_admins (user_id)
VALUES ('8f5fb8ae-a3e2-48a2-817b-0f22e0d8bfe3')
ON CONFLICT (user_id) DO NOTHING;

-- Проверка «супер-админ».
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins pa
    WHERE pa.user_id = COALESCE(p_user_id, (SELECT auth.uid()))
  );
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

-- Список всех воркспейсов с тарифом и потреблением (только супер-админ).
CREATE OR REPLACE FUNCTION public.admin_list_workspaces()
RETURNS TABLE(
  workspace_id uuid, workspace_name text, created_at timestamptz,
  plan_code text, plan_name text, billing_status text,
  participants_count integer, projects_count integer, storage_mb integer,
  ai_tokens_used bigint, ai_tokens_monthly bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_platform_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Доступ только для администратора платформы';
  END IF;
  RETURN QUERY
  SELECT
    w.id, w.name, w.created_at,
    pl.code, pl.name, b.status,
    (SELECT count(*)::int FROM participants p WHERE p.workspace_id=w.id AND p.is_deleted=false),
    (SELECT count(*)::int FROM projects pr WHERE pr.workspace_id=w.id AND pr.is_deleted=false),
    (SELECT COALESCE(round(sum(f.file_size)/1048576.0),0)::int FROM files f WHERE f.workspace_id=w.id),
    (SELECT COALESCE(sum(m.total_tokens),0)::bigint FROM ai_usage_monthly m
       WHERE m.workspace_id=w.id AND m.period=date_trunc('month', now())::date),
    pl.ai_tokens_monthly
  FROM workspaces w
  LEFT JOIN workspace_billing b ON b.workspace_id=w.id
  LEFT JOIN plans pl ON pl.id=b.plan_id
  ORDER BY w.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_workspaces() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_workspaces() TO authenticated, service_role;

-- Назначить/сменить тариф воркспейсу. p_plan_code NULL → снять тариф (безлимит).
CREATE OR REPLACE FUNCTION public.admin_set_workspace_plan(p_workspace_id uuid, p_plan_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_plan_id uuid;
BEGIN
  IF NOT is_platform_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Доступ только для администратора платформы';
  END IF;

  IF p_plan_code IS NULL THEN
    DELETE FROM workspace_billing WHERE workspace_id = p_workspace_id;
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
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_workspace_plan(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_workspace_plan(uuid, text) TO authenticated, service_role;
