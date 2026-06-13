-- Реаудит 2026-06-13: get_board_filtered_threads/projects + get_workspace_boards
-- определяли доступ по переданному p_user_id, не по auth.uid() → залогиненный мог
-- подставить чужой user_id и увидеть чужие треды/проекты/доски. Гейт:
-- для authenticated p_user_id обязан = auth.uid(); service_role (auth.uid() NULL) проходит.
-- Тела идентичны живым, добавлена только проверка после BEGIN. Применено через MCP.

CREATE OR REPLACE FUNCTION public.get_board_filtered_threads(p_workspace_id uuid, p_user_id uuid, p_filter jsonb)
 RETURNS TABLE(id uuid, name text, type text, workspace_id uuid, project_id uuid, project_name text, status_id uuid, status_name text, status_color text, status_order integer, status_show_to_creator boolean, deadline timestamp with time zone, start_at timestamp with time zone, end_at timestamp with time zone, accent_color text, icon text, is_pinned boolean, sort_order integer, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_where text;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user mismatch';
  END IF;
  v_where := public._board_compile_group(COALESCE(p_filter, '{"logic":"and","rules":[]}'::jsonb), 'thread');
  RETURN QUERY EXECUTE format(
    'SELECT b.* FROM public.get_workspace_threads(%L, %L) b WHERE %s',
    p_workspace_id, p_user_id, v_where
  );
END $function$;

CREATE OR REPLACE FUNCTION public.get_board_filtered_projects(p_workspace_id uuid, p_user_id uuid, p_filter jsonb)
 RETURNS TABLE(id uuid, name text, description text, workspace_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, deadline timestamp with time zone, status_id uuid, template_id uuid, google_drive_folder_link text, source_folder_id text, export_folder_id text, messenger_link_code text, last_activity_at timestamp with time zone, template_name text, has_active_deadline_task boolean, is_lead_template boolean, final_kind status_final_kind, contact_participant_id uuid, next_task_id uuid, next_task_name text, next_task_deadline timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_where text;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user mismatch';
  END IF;
  v_where := public._board_compile_group(COALESCE(p_filter, '{"logic":"and","rules":[]}'::jsonb), 'project');
  RETURN QUERY EXECUTE format(
    'SELECT b.*, ntd.next_task_id, ntd.next_task_name, ntd.next_task_deadline
       FROM public.get_accessible_projects(%L, %L) b
       LEFT JOIN LATERAL (
         SELECT th.id AS next_task_id, th.name AS next_task_name, th.deadline AS next_task_deadline
         FROM project_threads th
         LEFT JOIN statuses s ON s.id = th.status_id
         WHERE th.project_id = b.id AND th.type = ''task'' AND th.is_deleted = false
           AND th.deadline IS NOT NULL AND (s.id IS NULL OR s.is_final = false)
         ORDER BY th.deadline ASC LIMIT 1
       ) ntd ON true
      WHERE %s',
    p_workspace_id, p_user_id, v_where
  );
END $function$;

CREATE OR REPLACE FUNCTION public.get_workspace_boards(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(id uuid, workspace_id uuid, name text, description text, access_type text, access_roles text[], created_by uuid, sort_order integer, column_widths jsonb, global_filter jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, short_id integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id UUID;
  v_roles TEXT[];
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user mismatch';
  END IF;
  SELECT p.id, p.workspace_roles INTO v_participant_id, v_roles
  FROM participants p
  WHERE p.workspace_id = p_workspace_id
    AND p.user_id = p_user_id
    AND p.is_deleted = FALSE
  LIMIT 1;

  IF v_participant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    b.id, b.workspace_id, b.name, b.description,
    b.access_type, b.access_roles, b.created_by,
    b.sort_order, b.column_widths, b.global_filter,
    b.created_at, b.updated_at, b.short_id
  FROM boards b
  WHERE b.workspace_id = p_workspace_id
    AND (
      b.access_type = 'workspace'
      OR (b.access_type = 'private' AND b.created_by = p_user_id)
      OR (b.access_type = 'custom' AND (
        v_roles && b.access_roles
        OR EXISTS (
          SELECT 1 FROM board_members bm
          WHERE bm.board_id = b.id AND bm.participant_id = v_participant_id
        )
      ))
    )
  ORDER BY b.sort_order ASC, b.created_at ASC;
END;
$function$;
