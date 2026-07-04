-- Лимит «участники» = места команды (participants с user_id), НЕ контакты/клиенты.
-- Контакты создаются автоматически из входящих (Telegram/Wazzup/Email) — их нельзя
-- лимитировать, иначе приём сообщений упрётся в лимит. Правит подсчёт в трёх
-- функциях: get_workspace_usage_and_limits, workspace_at_limit, admin_list_workspaces.
-- Применено в прод через MCP.

DROP FUNCTION IF EXISTS public.get_workspace_usage_and_limits(uuid);
CREATE OR REPLACE FUNCTION public.get_workspace_usage_and_limits(p_workspace_id uuid)
RETURNS TABLE(
  participants_count integer, projects_count integer, storage_mb integer,
  max_participants integer, max_projects integer, max_storage_mb integer,
  plan_code text, plan_name text,
  ai_tokens_used bigint, ai_tokens_monthly bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    (SELECT count(*)::int FROM participants p WHERE p.workspace_id=p_workspace_id AND p.is_deleted=false AND p.user_id IS NOT NULL),
    (SELECT count(*)::int FROM projects pr WHERE pr.workspace_id=p_workspace_id AND pr.is_deleted=false),
    (SELECT COALESCE(round(sum(f.file_size)/1048576.0),0)::int FROM files f WHERE f.workspace_id=p_workspace_id),
    COALESCE(wl.max_participants, pl.max_participants),
    COALESCE(wl.max_projects,     pl.max_projects),
    COALESCE(wl.max_storage_mb,   pl.max_storage_mb),
    pl.code, pl.name,
    (SELECT COALESCE(sum(m.total_tokens),0)::bigint FROM ai_usage_monthly m
       WHERE m.workspace_id=p_workspace_id AND m.period=date_trunc('month', now())::date),
    pl.ai_tokens_monthly
  FROM (SELECT 1) x
  LEFT JOIN workspace_billing b ON b.workspace_id=p_workspace_id
  LEFT JOIN plans pl ON pl.id=b.plan_id
  LEFT JOIN workspace_limits wl ON wl.workspace_id=p_workspace_id
  WHERE is_workspace_participant(p_workspace_id, (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.get_workspace_usage_and_limits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_usage_and_limits(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.workspace_at_limit(p_workspace_id uuid, p_kind text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_max_p int; v_max_pr int; v_max_tok bigint;
BEGIN
  SELECT COALESCE(wl.max_participants, pl.max_participants),
         COALESCE(wl.max_projects,     pl.max_projects),
         pl.ai_tokens_monthly
    INTO v_max_p, v_max_pr, v_max_tok
  FROM (SELECT 1) x
  LEFT JOIN workspace_billing b ON b.workspace_id=p_workspace_id
  LEFT JOIN plans pl ON pl.id=b.plan_id
  LEFT JOIN workspace_limits wl ON wl.workspace_id=p_workspace_id;
  RETURN CASE p_kind
    WHEN 'participants' THEN v_max_p IS NOT NULL AND
      (SELECT count(*) FROM participants p WHERE p.workspace_id=p_workspace_id AND p.is_deleted=false AND p.user_id IS NOT NULL) >= v_max_p
    WHEN 'projects' THEN v_max_pr IS NOT NULL AND
      (SELECT count(*) FROM projects pr WHERE pr.workspace_id=p_workspace_id AND pr.is_deleted=false) >= v_max_pr
    WHEN 'ai_tokens' THEN v_max_tok IS NOT NULL AND
      (SELECT COALESCE(sum(m.total_tokens),0) FROM ai_usage_monthly m
         WHERE m.workspace_id=p_workspace_id AND m.period=date_trunc('month', now())::date) >= v_max_tok
    ELSE false
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.workspace_at_limit(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_at_limit(uuid, text) TO authenticated, service_role;

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
    (SELECT count(*)::int FROM participants p WHERE p.workspace_id=w.id AND p.is_deleted=false AND p.user_id IS NOT NULL),
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
