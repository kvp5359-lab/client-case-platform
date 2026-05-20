-- ============================================================================
-- Орфан-треды (project_id IS NULL): доступ исполнителям и custom-members
-- для ЛЮБОГО типа треда (chat / email / task), а не только 'task'.
--
-- Контекст: можно создавать orphan-чаты (личные диалоги) и добавлять туда
-- исполнителей через UI. До этой миграции RLS-функция проверяла
-- task_assignees / project_thread_members только при type='task'. Для
-- chat/email эти таблицы игнорировались → исполнитель не видел тред,
-- хотя в UI был добавлен как assignee.
--
-- Что меняем: убираем условие `IF v_thread.type = 'task'` и проверяем
-- assignees + members независимо от типа. Это чисто аддитивная правка —
-- только добавляет ветки RETURN true, ничего не запрещает.
--
-- Не затрагивает: short-circuit `created_by = auth.uid()` в полиции
-- project_threads_select (он отдельный механизм), MTProto/Business/Wazzup
-- orphan-треды (у них нет assignees, новая ветка просто не сработает).
-- ============================================================================

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
    IF v_thread.owner_user_id = p_user_id THEN RETURN true; END IF;
    IF v_thread.created_by = p_user_id THEN RETURN true; END IF;

    -- Исполнитель orphan-треда (для любого типа: task / chat / email).
    IF EXISTS (
      SELECT 1
      FROM task_assignees ta
      JOIN participants par ON par.id = ta.participant_id
      WHERE ta.thread_id = p_thread_id
        AND par.user_id = p_user_id
        AND par.is_deleted = false
    ) THEN RETURN true; END IF;

    -- Явно расшаренный участник orphan-треда (custom access, для любого типа).
    IF EXISTS (
      SELECT 1
      FROM project_thread_members ptm
      JOIN participants par ON par.id = ptm.participant_id
      WHERE ptm.thread_id = p_thread_id
        AND par.user_id = p_user_id
        AND par.is_deleted = false
    ) THEN RETURN true; END IF;

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
