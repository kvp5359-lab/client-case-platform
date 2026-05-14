-- Личные задачи без проекта: расширяем видимость orphan-тредов
-- (type='task', project_id=NULL).
--
-- Контекст. Миграция 20260510_personal_dialogs_rls + 20260510_fix_rpcs_after_*
-- ввели для project_id=NULL правило «видит только owner_user_id + view_all».
-- Это правильно для личных диалогов (chat/email), но ломает задачи:
-- задачи через «+» в доске/списке создаются с project_id=NULL И owner_user_id=NULL,
-- то есть «сиротеют» — не видны нигде в UI, но при этом учитываются
-- в get_my_task_counts (бейдж сайдбара растёт впустую).
--
-- Решение: для orphan-задач (project_id IS NULL AND type='task') разрешаем
-- видимость assignee + creator + владелец воркспейса/view_all_projects.
-- Личные диалоги не трогаем — у них тип не 'task'.

-- ── can_user_access_thread ────────────────────────────────────────────────
-- В orphan-ветке (project_id IS NULL) добавляем проверку task_assignees,
-- чтобы исполнитель видел задачу-сироту без owner_user_id.

CREATE OR REPLACE FUNCTION public.can_user_access_thread(p_thread_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_thread RECORD;
  v_participant_id uuid;
  v_project_roles text[];
  v_workspace_roles text[];
BEGIN
  IF p_thread_id IS NULL OR p_user_id IS NULL THEN RETURN false; END IF;

  SELECT id, type, project_id, workspace_id, access_type, access_roles, created_by, owner_user_id
    INTO v_thread
    FROM project_threads
    WHERE id = p_thread_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_thread.project_id IS NULL THEN
    -- Личные диалоги (chat/email) — только owner_user_id.
    -- Orphan-задачи (type='task') — owner_user_id ИЛИ creator ИЛИ assignee.
    IF v_thread.owner_user_id = p_user_id THEN RETURN true; END IF;
    IF v_thread.created_by = p_user_id THEN RETURN true; END IF;

    IF v_thread.type = 'task' THEN
      -- Исполнитель orphan-задачи.
      IF EXISTS (
        SELECT 1
        FROM task_assignees ta
        JOIN participants par ON par.id = ta.participant_id
        WHERE ta.thread_id = p_thread_id
          AND par.user_id = p_user_id
          AND par.is_deleted = false
      ) THEN RETURN true; END IF;
    END IF;

    -- Владелец воркспейса / view_all_projects — видит все orphan-треды.
    RETURN EXISTS (
      SELECT 1 FROM participants par
      JOIN workspace_roles wr ON wr.name = ANY(par.workspace_roles)
                              AND wr.workspace_id = par.workspace_id
      WHERE par.user_id = p_user_id
        AND par.workspace_id = v_thread.workspace_id
        AND par.is_deleted = false
        AND (wr.is_owner = true
             OR (wr.permissions->>'view_all_projects')::boolean = true)
    );
  END IF;

  -- Дальше — обычная ветка для тредов с project_id, без изменений.
  SELECT par.id, par.workspace_roles
    INTO v_participant_id, v_workspace_roles
    FROM participants par
    WHERE par.user_id = p_user_id
      AND par.workspace_id = v_thread.workspace_id
      AND par.is_deleted = false;
  IF v_participant_id IS NULL THEN RETURN false; END IF;
  v_workspace_roles := COALESCE(v_workspace_roles, '{}');

  IF EXISTS(
    SELECT 1 FROM workspace_roles wr
    WHERE wr.workspace_id = v_thread.workspace_id
      AND wr.name = ANY(v_workspace_roles)
      AND (wr.is_owner = true
           OR (wr.permissions->>'view_all_projects')::boolean = true)
  ) THEN RETURN true; END IF;

  SELECT pp.project_roles INTO v_project_roles
    FROM project_participants pp
    WHERE pp.project_id = v_thread.project_id
      AND pp.participant_id = v_participant_id;
  IF v_project_roles IS NULL THEN RETURN false; END IF;

  IF 'Администратор' = ANY(v_project_roles) THEN RETURN true; END IF;
  IF v_thread.created_by = p_user_id THEN RETURN true; END IF;

  IF EXISTS(
    SELECT 1 FROM task_assignees ta
    WHERE ta.thread_id = p_thread_id
      AND ta.participant_id = v_participant_id
  ) THEN RETURN true; END IF;

  IF v_thread.access_type = 'all' THEN RETURN true; END IF;

  IF v_thread.access_type = 'roles'
     AND COALESCE(v_thread.access_roles, '{}') && v_project_roles THEN
    RETURN true;
  END IF;

  IF v_thread.access_type = 'custom' AND EXISTS(
    SELECT 1 FROM project_thread_members ptm
    WHERE ptm.thread_id = p_thread_id
      AND ptm.participant_id = v_participant_id
  ) THEN RETURN true; END IF;

  RETURN false;
END;
$function$;

-- ── get_workspace_threads ─────────────────────────────────────────────────
-- В view_all ветке расширяем условие: orphan-задачи (type='task',
-- project_id=NULL) видны всем view_all_projects (включая владельца воркспейса).
-- Личные диалоги (chat/email) — оставляем как было (owner_user_id only).
--
-- В обычной ветке логика уже корректна: задача-сирота попадает через
-- pt.created_by = p_user_id ИЛИ pt.id ANY(v_assignee_thread_ids).

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
      AND (
        pt.project_id IS NOT NULL
        -- Orphan-задачи видны всем view_all_projects.
        OR pt.type = 'task'
        -- Личные диалоги (chat/email без проекта) — только владельца.
        OR pt.owner_user_id = p_user_id
      )
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
      -- Личные диалоги (chat/email project_id=NULL) — только свои.
      (pt.project_id IS NULL AND pt.type <> 'task' AND pt.owner_user_id = p_user_id)
      -- Orphan-задачи (project_id=NULL, type='task') — creator или assignee.
      OR (pt.project_id IS NULL AND pt.type = 'task'
          AND (pt.created_by = p_user_id OR pt.id = ANY(v_assignee_thread_ids)))
      -- Дальше — обычные треды с project_id.
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
      OR (pt.access_type = 'custom' AND pt.id = ANY(v_member_thread_ids))
    )
  ORDER BY pt.sort_order ASC, pt.created_at ASC;
END;
$function$;
