-- Регрессия от 20260425_drop_projects_status_text.sql: ряд RPC и триггерных
-- функций всё ещё ссылались на удалённую колонку projects.status (TEXT).
--
-- Симптомы:
--  - /boards: списки проектов после первого refetch пустые
--    (get_accessible_projects падал с «column proj.status does not exist»)
--  - любой UPDATE projects (rename, deadline change) валился в триггере
--    fn_audit_project_update на ELSIF OLD.status IS DISTINCT FROM NEW.status

-- ─── 1. get_accessible_projects: убираем status text из RETURNS TABLE и SELECT.
--     status_id (uuid) остаётся — единственный источник правды.

DROP FUNCTION IF EXISTS public.get_accessible_projects(uuid, uuid);

CREATE FUNCTION public.get_accessible_projects(p_workspace_id uuid, p_user_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  workspace_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  created_by uuid,
  deadline timestamp with time zone,
  status_id uuid,
  template_id uuid,
  google_drive_folder_link text,
  source_folder_id text,
  export_folder_id text,
  messenger_link_code text,
  last_activity_at timestamp with time zone,
  template_name text,
  has_active_deadline_task boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id UUID;
  v_workspace_roles TEXT[];
  v_has_view_all BOOLEAN := FALSE;
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

  RETURN QUERY
  SELECT proj.id, proj.name, proj.description, proj.workspace_id,
         proj.created_at, proj.updated_at, proj.created_by,
         proj.deadline, proj.status_id, proj.template_id,
         proj.google_drive_folder_link, proj.source_folder_id,
         proj.export_folder_id, proj.messenger_link_code,
         proj.last_activity_at,
         pt.name AS template_name,
         EXISTS(
           SELECT 1
           FROM project_threads th
           LEFT JOIN statuses s ON s.id = th.status_id
           WHERE th.project_id = proj.id
             AND th.type = 'task'
             AND th.is_deleted = false
             AND th.deadline IS NOT NULL
             AND (s.id IS NULL OR s.is_final = false)
         ) AS has_active_deadline_task
  FROM projects proj
  LEFT JOIN project_templates pt ON pt.id = proj.template_id
  WHERE proj.workspace_id = p_workspace_id
    AND proj.is_deleted = false
    AND (
      v_has_view_all
      OR EXISTS(
        SELECT 1 FROM project_participants pp
        WHERE pp.project_id = proj.id
          AND pp.participant_id = v_participant_id
      )
    )
  ORDER BY proj.created_at DESC
  LIMIT 200;
END;
$function$;

-- ─── 2. fn_audit_project_update: смотрим на status_id вместо удалённого status.

CREATE OR REPLACE FUNCTION public.fn_audit_project_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_action TEXT;
  v_details JSONB := '{}';
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    v_action := 'rename';
    v_details := jsonb_build_object('old_name', OLD.name, 'new_name', NEW.name);
  ELSIF OLD.status_id IS DISTINCT FROM NEW.status_id THEN
    v_action := 'change_status';
    v_details := jsonb_build_object(
      'old_status_id', OLD.status_id,
      'new_status_id', NEW.status_id
    );
  ELSIF OLD.deadline IS DISTINCT FROM NEW.deadline THEN
    v_action := 'change_deadline';
    v_details := jsonb_build_object('old_deadline', OLD.deadline, 'new_deadline', NEW.deadline);
  ELSE
    RETURN NEW;
  END IF;

  v_details := v_details || jsonb_build_object('name', NEW.name);

  PERFORM fn_write_audit_log(
    v_action,
    'project',
    NEW.id,
    v_details,
    NEW.workspace_id,
    NEW.id
  );
  RETURN NEW;
END;
$function$;

-- ─── 3. get_inbox_threads (v1): дроп. Везде в src/ уже используется v2.
--     v1 ссылалась на удалённую колонку и стала мёртвым кодом.

DROP FUNCTION IF EXISTS public.get_inbox_threads(uuid, uuid);
