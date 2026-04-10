-- Trash feature: обновление RPC для исключения тредов из удалённых проектов.
--
-- Раньше фильтровали только pt.is_deleted = false — теперь ещё и p.is_deleted = false.
-- Затронуты: get_workspace_threads, get_sidebar_data, get_my_urgent_tasks_count.
-- get_user_projects обновлена в предыдущей миграции 20260410_trash_feature.sql.

-- ── get_workspace_threads ──
CREATE OR REPLACE FUNCTION public.get_workspace_threads(p_workspace_id uuid, p_user_id uuid)
RETURNS TABLE(id uuid, name text, type text, workspace_id uuid, project_id uuid, project_name text, status_id uuid, status_name text, status_color text, status_order integer, status_show_to_creator boolean, deadline timestamp with time zone, accent_color text, icon text, is_pinned boolean, sort_order integer, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid)
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
      pt.project_id IS NULL
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

-- ── get_sidebar_data ──
CREATE OR REPLACE FUNCTION public.get_sidebar_data(p_workspace_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'threads', COALESCE(
      (SELECT json_agg(json_build_object(
        'id', pt.id,
        'project_id', pt.project_id,
        'access_type', pt.access_type,
        'access_roles', pt.access_roles,
        'created_by', pt.created_by
      ))
       FROM project_threads pt
       LEFT JOIN projects p ON p.id = pt.project_id
       WHERE pt.workspace_id = p_workspace_id
         AND pt.is_deleted = false
         AND (p.id IS NULL OR p.is_deleted = false)),
      '[]'::json
    ),
    'myProjectRoles', COALESCE(
      (SELECT json_agg(json_build_object(
        'project_id', pp.project_id,
        'participant_id', pp.participant_id,
        'project_roles', pp.project_roles
      ))
       FROM project_participants pp
       JOIN participants p ON p.id = pp.participant_id
       WHERE p.user_id = p_user_id
         AND p.workspace_id = p_workspace_id
         AND p.is_deleted = false),
      '[]'::json
    ),
    'myMemberThreadIds', COALESCE(
      (SELECT json_agg(ptm.thread_id)
       FROM project_thread_members ptm
       JOIN participants p ON p.id = ptm.participant_id
       WHERE p.user_id = p_user_id
         AND p.workspace_id = p_workspace_id
         AND p.is_deleted = false),
      '[]'::json
    ),
    'myAssigneeThreadIds', COALESCE(
      (SELECT json_agg(ta.thread_id)
       FROM task_assignees ta
       JOIN participants p ON p.id = ta.participant_id
       WHERE p.user_id = p_user_id
         AND p.workspace_id = p_workspace_id
         AND p.is_deleted = false),
      '[]'::json
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ── get_my_urgent_tasks_count ──
CREATE OR REPLACE FUNCTION public.get_my_urgent_tasks_count(p_workspace_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select count(*) from (
    select t.id
    from project_threads t
    join task_assignees ta on ta.thread_id = t.id
    join participants p on p.id = ta.participant_id
      and p.user_id = auth.uid()
      and p.is_deleted = false
    left join projects pr on pr.id = t.project_id
    left join statuses s on s.id = t.status_id
    where t.workspace_id = p_workspace_id
      and t.type = 'task'
      and t.is_deleted = false
      and (pr.id is null or pr.is_deleted = false)
      and t.deadline is not null
      and (t.deadline at time zone 'Europe/Moscow')::date <= current_date
      and coalesce(s.show_to_creator, false) = false
      and coalesce(s.is_final, false) = false

    union

    select t.id
    from project_threads t
    join statuses s on s.id = t.status_id
      and s.show_to_creator = true
    left join projects pr on pr.id = t.project_id
    where t.workspace_id = p_workspace_id
      and t.type = 'task'
      and t.is_deleted = false
      and (pr.id is null or pr.is_deleted = false)
      and t.created_by = auth.uid()
      and t.deadline is not null
      and (t.deadline at time zone 'Europe/Moscow')::date <= current_date
  ) urgent;
$function$;
