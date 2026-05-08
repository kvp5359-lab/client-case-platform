-- Этап 4.2 CRM-фрейма: добавляем в RPC get_accessible_projects колонки,
-- по которым теперь можно фильтровать в фильтрах досок.
--
-- 1. is_lead_template — из project_templates.is_lead_template (для фильтра «только лиды»).
-- 2. final_kind — из statuses.final_kind текущего статуса проекта
--    (для фильтра «только выигранные/проигранные/слитые»).
-- 3. contact_participant_id — из самой проекты (для фильтра «проекты этого контакта»).
--
-- DROP перед CREATE — Postgres не позволяет менять returns-shape через CREATE OR REPLACE.

DROP FUNCTION IF EXISTS public.get_accessible_projects(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_accessible_projects(p_workspace_id uuid, p_user_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  workspace_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  deadline timestamptz,
  status_id uuid,
  template_id uuid,
  google_drive_folder_link text,
  source_folder_id text,
  export_folder_id text,
  messenger_link_code text,
  last_activity_at timestamptz,
  template_name text,
  has_active_deadline_task boolean,
  -- Этап 4.2: новые колонки для фильтров
  is_lead_template boolean,
  final_kind public.status_final_kind,
  contact_participant_id uuid
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
             AND th.is_deleted = false
             AND th.deadline IS NOT NULL
             AND (s.id IS NULL OR s.is_final = false)
         ) AS has_active_deadline_task,
         COALESCE(pt.is_lead_template, false) AS is_lead_template,
         ps.final_kind AS final_kind,
         proj.contact_participant_id
  FROM projects proj
  LEFT JOIN project_templates pt ON pt.id = proj.template_id
  LEFT JOIN statuses ps ON ps.id = proj.status_id
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
