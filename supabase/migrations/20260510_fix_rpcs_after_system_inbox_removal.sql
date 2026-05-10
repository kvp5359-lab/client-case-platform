-- Этап 5b: чиним RPC, которые ссылались на удалённые столбцы
-- (is_system_business_inbox / system_inbox_user_id и т.п.).
-- Проблемы выявились на верификации: /projects показывал «Проекты не найдены»,
-- потому что get_user_projects падал на отсутствующем столбце.

CREATE OR REPLACE FUNCTION public.get_user_projects(
  p_workspace_id uuid,
  p_user_id uuid,
  p_can_view_all boolean DEFAULT false
)
RETURNS SETOF projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_can_view_all THEN
    RETURN QUERY
      SELECT * FROM projects
      WHERE workspace_id = p_workspace_id
        AND is_deleted = false
      ORDER BY created_at DESC;
  ELSE
    RETURN QUERY
      SELECT p.* FROM projects p
      INNER JOIN project_participants pp ON pp.project_id = p.id
      INNER JOIN participants part ON part.id = pp.participant_id
      WHERE p.workspace_id = p_workspace_id
        AND p.is_deleted = false
        AND part.user_id = p_user_id
        AND part.is_deleted = false
      ORDER BY p.created_at DESC;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_workspace_threads(
  p_workspace_id uuid,
  p_user_id uuid
)
RETURNS TABLE(
  id uuid, name text, type text, workspace_id uuid, project_id uuid,
  project_name text, status_id uuid, status_name text, status_color text,
  status_order integer, status_show_to_creator boolean,
  deadline timestamp with time zone, accent_color text, icon text,
  is_pinned boolean, sort_order integer,
  created_at timestamp with time zone, updated_at timestamp with time zone,
  created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id UUID;
  v_workspace_roles TEXT[];
  v_has_view_all BOOLEAN := FALSE;
  v_my_project_ids UUID[];
  v_admin_project_ids UUID[];
  v_member_thread_ids UUID[];
  v_assignee_thread_ids UUID[];
  v_my_roles_by_project JSONB := '{}'::JSONB;
BEGIN
  SELECT par.id, par.workspace_roles
  INTO v_participant_id, v_workspace_roles
  FROM participants par
  WHERE par.user_id = p_user_id
    AND par.workspace_id = p_workspace_id
    AND par.is_deleted = false;

  IF v_participant_id IS NULL THEN RETURN; END IF;
  v_workspace_roles := COALESCE(v_workspace_roles, '{}');

  SELECT EXISTS(
    SELECT 1 FROM workspace_roles wr
    WHERE wr.workspace_id = p_workspace_id
      AND wr.name = ANY(v_workspace_roles)
      AND (wr.is_owner = true
           OR (wr.permissions->>'view_all_projects')::boolean = true)
  ) INTO v_has_view_all;

  IF v_has_view_all THEN
    RETURN QUERY
    SELECT pt.id, pt.name, pt.type, pt.workspace_id, pt.project_id,
           p.name AS project_name, pt.status_id,
           s.name AS status_name, s.color AS status_color,
           s.order_index AS status_order,
           COALESCE(s.show_to_creator, FALSE) AS status_show_to_creator,
           pt.deadline, pt.accent_color, pt.icon, pt.is_pinned, pt.sort_order,
           pt.created_at, pt.updated_at, pt.created_by
    FROM project_threads pt
    LEFT JOIN projects p ON p.id = pt.project_id
    LEFT JOIN statuses s ON s.id = pt.status_id
    WHERE pt.workspace_id = p_workspace_id
      AND pt.is_deleted = FALSE
      AND (p.id IS NULL OR p.is_deleted = FALSE)
      -- Личные диалоги (project_id=NULL) — только своего владельца.
      AND (pt.project_id IS NOT NULL OR pt.owner_user_id = p_user_id)
    ORDER BY pt.sort_order ASC, pt.created_at ASC;
    RETURN;
  END IF;

  SELECT
    COALESCE(array_agg(pp.project_id), '{}'),
    COALESCE(array_agg(pp.project_id) FILTER (WHERE 'Администратор' = ANY(pp.project_roles)), '{}')
  INTO v_my_project_ids, v_admin_project_ids
  FROM project_participants pp
  WHERE pp.participant_id = v_participant_id;

  SELECT COALESCE(array_agg(ptm.thread_id), '{}') INTO v_member_thread_ids
  FROM project_thread_members ptm
  WHERE ptm.participant_id = v_participant_id;

  SELECT COALESCE(array_agg(ta.thread_id), '{}') INTO v_assignee_thread_ids
  FROM task_assignees ta
  WHERE ta.participant_id = v_participant_id;

  SELECT COALESCE(jsonb_object_agg(pp.project_id::text, to_jsonb(pp.project_roles)), '{}'::jsonb)
  INTO v_my_roles_by_project
  FROM project_participants pp
  WHERE pp.participant_id = v_participant_id;

  RETURN QUERY
  SELECT pt.id, pt.name, pt.type, pt.workspace_id, pt.project_id,
         p.name AS project_name, pt.status_id,
         s.name AS status_name, s.color AS status_color,
         s.order_index AS status_order,
         COALESCE(s.show_to_creator, FALSE) AS status_show_to_creator,
         pt.deadline, pt.accent_color, pt.icon, pt.is_pinned, pt.sort_order,
         pt.created_at, pt.updated_at, pt.created_by
  FROM project_threads pt
  LEFT JOIN projects p ON p.id = pt.project_id
  LEFT JOIN statuses s ON s.id = pt.status_id
  WHERE pt.workspace_id = p_workspace_id
    AND pt.is_deleted = FALSE
    AND (p.id IS NULL OR p.is_deleted = FALSE)
    AND (
      -- Личные диалоги (project_id=NULL) — только свои.
      (pt.project_id IS NULL AND pt.owner_user_id = p_user_id)
      OR pt.project_id = ANY(v_admin_project_ids)
      OR pt.created_by = p_user_id
      OR pt.id = ANY(v_assignee_thread_ids)
      OR (pt.access_type = 'all' AND pt.project_id = ANY(v_my_project_ids))
      OR (pt.access_type = 'roles'
          AND pt.project_id = ANY(v_my_project_ids)
          AND pt.access_roles && (
            SELECT COALESCE(
              (SELECT array_agg(r)::text[]
               FROM jsonb_array_elements_text(v_my_roles_by_project->(pt.project_id::text)) AS r),
              '{}'::text[]
            )
          ))
      OR (pt.access_type = 'custom' AND pt.id = ANY(v_member_thread_ids))
    )
  ORDER BY pt.sort_order ASC, pt.created_at ASC;
END;
$function$;
