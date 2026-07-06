-- get_workspace_threads: исполнитель видит orphan-тред (без проекта) любого типа
--
-- Баг: у тредов без проекта (project_id IS NULL) исполнители (task_assignees)
-- учитывались ТОЛЬКО для типа 'task'. Для orphan email/chat смотрелся лишь
-- owner_user_id → коллега, добавленная в исполнители email-треда без проекта,
-- не видела его в списках «Задачи»/досках, хотя RLS (can_user_access_thread)
-- доступ ей уже давал. Зеркалим RLS: добавляем исполнителей в ветку
-- «orphan, не-задача». Участники треда (project_thread_members) уже покрыты
-- общим `OR id = ANY(v_member_thread_ids)` ниже.
--
-- Сигнатура НЕ меняется → get_board_filtered_threads (тянет b.*) не ломается.
-- Тело снято с прода (drift repo↔prod), правка — одна строка в WHERE.

CREATE OR REPLACE FUNCTION public.get_workspace_threads(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(id uuid, name text, type text, workspace_id uuid, project_id uuid, project_name text, status_id uuid, status_name text, status_color text, status_order integer, status_show_to_creator boolean, deadline timestamp with time zone, start_at timestamp with time zone, end_at timestamp with time zone, accent_color text, icon text, is_pinned boolean, sort_order integer, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, email_unsent boolean)
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
  SELECT par.id, par.workspace_roles INTO v_participant_id, v_workspace_roles
  FROM participants par
  WHERE par.user_id = p_user_id AND par.workspace_id = p_workspace_id AND par.is_deleted = false;

  IF v_participant_id IS NULL THEN RETURN; END IF;
  v_workspace_roles := COALESCE(v_workspace_roles, '{}');

  SELECT EXISTS(
    SELECT 1 FROM workspace_roles wr
    WHERE wr.workspace_id = p_workspace_id AND wr.name = ANY(v_workspace_roles)
      AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true)
  ) INTO v_has_view_all;

  IF v_has_view_all THEN
    RETURN QUERY
    SELECT pt.id, pt.name, pt.type, pt.workspace_id, pt.project_id,
           p.name AS project_name, pt.status_id,
           s.name AS status_name, s.color AS status_color,
           s.order_index AS status_order,
           COALESCE(s.show_to_creator, FALSE) AS status_show_to_creator,
           pt.deadline, pt.start_at, pt.end_at,
           pt.accent_color, pt.icon, pt.is_pinned, pt.sort_order,
           pt.created_at, pt.updated_at, pt.created_by,
           (pt.type = 'email' AND NOT EXISTS (
              SELECT 1 FROM project_messages pm
              WHERE pm.thread_id = pt.id AND COALESCE(pm.is_draft, FALSE) = FALSE
           )) AS email_unsent
    FROM project_threads pt
    LEFT JOIN projects p ON p.id = pt.project_id
    LEFT JOIN statuses s ON s.id = pt.status_id
    WHERE pt.workspace_id = p_workspace_id
      AND pt.is_deleted = FALSE
      AND (p.id IS NULL OR p.is_deleted = FALSE)
      AND (pt.project_id IS NOT NULL OR pt.type = 'task' OR pt.owner_user_id = p_user_id)
    ORDER BY pt.sort_order ASC, pt.created_at ASC;
    RETURN;
  END IF;

  SELECT
    COALESCE(array_agg(pp.project_id), '{}'),
    COALESCE(array_agg(pp.project_id) FILTER (WHERE 'Администратор' = ANY(pp.project_roles)), '{}')
  INTO v_my_project_ids, v_admin_project_ids
  FROM project_participants pp WHERE pp.participant_id = v_participant_id;

  SELECT COALESCE(array_agg(ptm.thread_id), '{}') INTO v_member_thread_ids
  FROM project_thread_members ptm WHERE ptm.participant_id = v_participant_id;

  SELECT COALESCE(array_agg(ta.thread_id), '{}') INTO v_assignee_thread_ids
  FROM task_assignees ta WHERE ta.participant_id = v_participant_id;

  SELECT COALESCE(jsonb_object_agg(pp.project_id::text, to_jsonb(pp.project_roles)), '{}'::jsonb)
  INTO v_my_roles_by_project
  FROM project_participants pp WHERE pp.participant_id = v_participant_id;

  RETURN QUERY
  SELECT pt.id, pt.name, pt.type, pt.workspace_id, pt.project_id,
         p.name AS project_name, pt.status_id,
         s.name AS status_name, s.color AS status_color,
         s.order_index AS status_order,
         COALESCE(s.show_to_creator, FALSE) AS status_show_to_creator,
         pt.deadline, pt.start_at, pt.end_at,
         pt.accent_color, pt.icon, pt.is_pinned, pt.sort_order,
         pt.created_at, pt.updated_at, pt.created_by,
         (pt.type = 'email' AND NOT EXISTS (
            SELECT 1 FROM project_messages pm
            WHERE pm.thread_id = pt.id AND COALESCE(pm.is_draft, FALSE) = FALSE
         )) AS email_unsent
  FROM project_threads pt
  LEFT JOIN projects p ON p.id = pt.project_id
  LEFT JOIN statuses s ON s.id = pt.status_id
  WHERE pt.workspace_id = p_workspace_id
    AND pt.is_deleted = FALSE
    AND (p.id IS NULL OR p.is_deleted = FALSE)
    AND (
      (pt.project_id IS NULL AND pt.type <> 'task'
          AND (pt.owner_user_id = p_user_id OR pt.id = ANY(v_assignee_thread_ids)))
      OR (pt.project_id IS NULL AND pt.type = 'task'
          AND (pt.created_by = p_user_id OR pt.id = ANY(v_assignee_thread_ids)))
      OR pt.project_id = ANY(v_admin_project_ids)
      OR (pt.project_id IS NOT NULL AND pt.created_by = p_user_id)
      OR (pt.project_id IS NOT NULL AND pt.id = ANY(v_assignee_thread_ids))
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
      OR pt.id = ANY(v_member_thread_ids)
    )
  ORDER BY pt.sort_order ASC, pt.created_at ASC;
END;
$function$;
