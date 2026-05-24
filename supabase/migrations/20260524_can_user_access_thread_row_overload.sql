-- Постоянный фикс RLS-цикла для project_threads_select.
-- Добавляет overload can_user_access_thread(project_threads, uuid), который
-- получает row напрямую (NEW.* для INSERT...RETURNING) и не перечитывает
-- таблицу. Это убирает необходимость в short-circuit `created_by = auth.uid()`
-- в полиции project_threads_select — баг с INSERT...RETURNING ловили 5 раз.
--
-- Старая сигнатура (uuid, uuid) остаётся — её используют 8 других политик
-- на смежных таблицах (message_*, project_messages, project_threads
-- delete/update), где проблема перечитывания не возникает.

CREATE OR REPLACE FUNCTION public.can_user_access_thread(
  t public.project_threads,
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id uuid;
  v_project_roles text[];
  v_workspace_roles text[];
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  IF t.project_id IS NULL THEN
    IF t.owner_user_id = p_user_id THEN RETURN true; END IF;
    IF t.created_by = p_user_id THEN RETURN true; END IF;

    IF EXISTS (
      SELECT 1
      FROM task_assignees ta
      JOIN participants par ON par.id = ta.participant_id
      WHERE ta.thread_id = t.id
        AND par.user_id = p_user_id
        AND par.is_deleted = false
    ) THEN RETURN true; END IF;

    IF EXISTS (
      SELECT 1
      FROM project_thread_members ptm
      JOIN participants par ON par.id = ptm.participant_id
      WHERE ptm.thread_id = t.id
        AND par.user_id = p_user_id
        AND par.is_deleted = false
    ) THEN RETURN true; END IF;

    RETURN EXISTS (
      SELECT 1 FROM participants par
      JOIN workspace_roles wr ON wr.name = ANY(par.workspace_roles)
                              AND wr.workspace_id = par.workspace_id
      WHERE par.user_id = p_user_id
        AND par.workspace_id = t.workspace_id
        AND par.is_deleted = false
        AND (wr.is_owner = true
             OR (wr.permissions->>'view_all_projects')::boolean = true)
    );
  END IF;

  SELECT par.id, par.workspace_roles
    INTO v_participant_id, v_workspace_roles
    FROM participants par
    WHERE par.user_id = p_user_id
      AND par.workspace_id = t.workspace_id
      AND par.is_deleted = false;
  IF v_participant_id IS NULL THEN RETURN false; END IF;
  v_workspace_roles := COALESCE(v_workspace_roles, '{}');

  IF EXISTS(
    SELECT 1 FROM workspace_roles wr
    WHERE wr.workspace_id = t.workspace_id
      AND wr.name = ANY(v_workspace_roles)
      AND (wr.is_owner = true
           OR (wr.permissions->>'view_all_projects')::boolean = true)
  ) THEN RETURN true; END IF;

  SELECT pp.project_roles INTO v_project_roles
    FROM project_participants pp
    WHERE pp.project_id = t.project_id
      AND pp.participant_id = v_participant_id;
  IF v_project_roles IS NULL THEN RETURN false; END IF;

  IF 'Администратор' = ANY(v_project_roles) THEN RETURN true; END IF;
  IF t.created_by = p_user_id THEN RETURN true; END IF;

  IF EXISTS(
    SELECT 1 FROM task_assignees ta
    WHERE ta.thread_id = t.id
      AND ta.participant_id = v_participant_id
  ) THEN RETURN true; END IF;

  IF t.access_type = 'all' THEN RETURN true; END IF;

  IF t.access_type = 'roles'
     AND COALESCE(t.access_roles, '{}') && v_project_roles THEN
    RETURN true;
  END IF;

  IF t.access_type = 'custom' AND EXISTS(
    SELECT 1 FROM project_thread_members ptm
    WHERE ptm.thread_id = t.id
      AND ptm.participant_id = v_participant_id
  ) THEN RETURN true; END IF;

  RETURN false;
END;
$function$;

DROP POLICY IF EXISTS project_threads_select ON public.project_threads;

CREATE POLICY project_threads_select ON public.project_threads
  FOR SELECT TO public
  USING (
    public.can_user_access_thread(project_threads, (SELECT auth.uid()))
  );
