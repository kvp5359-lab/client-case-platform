-- Аудит корзина C (лимиты) + B1 (экспорт данных). Применено в прод через MCP.
-- Всё аддитивно/read-only: без строк в workspace_limits = безлимитно, экспорт —
-- только чтение. Жёсткое применение лимитов (гейты в создании участника/проекта)
-- НЕ подключено — по числам/решению владельца, хелпер workspace_at_limit готов.

CREATE TABLE IF NOT EXISTS public.workspace_limits (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  max_participants integer,       -- NULL = без лимита
  max_projects integer,
  max_storage_mb integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspace_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_limits_select ON public.workspace_limits;
CREATE POLICY workspace_limits_select ON public.workspace_limits FOR SELECT TO authenticated
  USING (is_workspace_participant(workspace_id, (SELECT auth.uid())));
DROP POLICY IF EXISTS workspace_limits_manage ON public.workspace_limits;
CREATE POLICY workspace_limits_manage ON public.workspace_limits FOR ALL TO authenticated
  USING (is_workspace_owner((SELECT auth.uid()), workspace_id) OR has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_workspace_settings'))
  WITH CHECK (is_workspace_owner((SELECT auth.uid()), workspace_id) OR has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_workspace_settings'));
REVOKE ALL ON public.workspace_limits FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_limits TO authenticated;
GRANT ALL ON public.workspace_limits TO service_role;

CREATE OR REPLACE FUNCTION public.get_workspace_usage_and_limits(p_workspace_id uuid)
RETURNS TABLE(
  participants_count integer, projects_count integer, storage_mb integer,
  max_participants integer, max_projects integer, max_storage_mb integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    (SELECT count(*)::int FROM participants p WHERE p.workspace_id=p_workspace_id AND p.is_deleted=false),
    (SELECT count(*)::int FROM projects pr WHERE pr.workspace_id=p_workspace_id AND pr.is_deleted=false),
    (SELECT COALESCE(round(sum(f.file_size)/1048576.0),0)::int FROM files f WHERE f.workspace_id=p_workspace_id),
    l.max_participants, l.max_projects, l.max_storage_mb
  FROM (SELECT 1) x
  LEFT JOIN workspace_limits l ON l.workspace_id=p_workspace_id
  WHERE is_workspace_participant(p_workspace_id, (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.get_workspace_usage_and_limits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_usage_and_limits(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.workspace_at_limit(p_workspace_id uuid, p_kind text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE p_kind
    WHEN 'participants' THEN
      (SELECT l.max_participants IS NOT NULL AND
         (SELECT count(*) FROM participants p WHERE p.workspace_id=p_workspace_id AND p.is_deleted=false) >= l.max_participants
       FROM workspace_limits l WHERE l.workspace_id=p_workspace_id)
    WHEN 'projects' THEN
      (SELECT l.max_projects IS NOT NULL AND
         (SELECT count(*) FROM projects pr WHERE pr.workspace_id=p_workspace_id AND pr.is_deleted=false) >= l.max_projects
       FROM workspace_limits l WHERE l.workspace_id=p_workspace_id)
    ELSE false
  END IS TRUE;
$$;
REVOKE ALL ON FUNCTION public.workspace_at_limit(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_at_limit(uuid, text) TO authenticated, service_role;

-- Экспорт структурных данных воркспейса (портируемость данных, только владелец).
-- Полная выгрузка сообщений/файлов — отдельный стриминговый edge-джоб.
CREATE OR REPLACE FUNCTION public.export_workspace_data(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT is_workspace_owner((SELECT auth.uid()), p_workspace_id) THEN
    RAISE EXCEPTION 'Только владелец воркспейса может выгружать данные';
  END IF;
  SELECT jsonb_build_object(
    'exported_at', now(),
    'workspace', (SELECT to_jsonb(w) - 'default_ai_check_prompt' - 'default_ai_naming_prompt' FROM workspaces w WHERE w.id=p_workspace_id),
    'projects', (SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM projects p WHERE p.workspace_id=p_workspace_id AND p.is_deleted=false),
    'participants', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',pt.id,'name',pt.name,'last_name',pt.last_name,'email',pt.email,'phone',pt.phone,'workspace_roles',pt.workspace_roles)), '[]'::jsonb) FROM participants pt WHERE pt.workspace_id=p_workspace_id AND pt.is_deleted=false),
    'threads', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',th.id,'name',th.name,'type',th.type,'project_id',th.project_id,'status_id',th.status_id,'created_at',th.created_at)), '[]'::jsonb) FROM project_threads th WHERE th.workspace_id=p_workspace_id AND th.is_deleted=false),
    'counts', jsonb_build_object(
      'projects', (SELECT count(*) FROM projects WHERE workspace_id=p_workspace_id AND is_deleted=false),
      'participants', (SELECT count(*) FROM participants WHERE workspace_id=p_workspace_id AND is_deleted=false),
      'threads', (SELECT count(*) FROM project_threads WHERE workspace_id=p_workspace_id AND is_deleted=false),
      'messages', (SELECT count(*) FROM project_messages WHERE workspace_id=p_workspace_id)
    )
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.export_workspace_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_workspace_data(uuid) TO authenticated, service_role;
