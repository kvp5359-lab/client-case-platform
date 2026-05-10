-- Этап 4 рефакторинга «Личные диалоги без проекта».
-- Сужаем доступ к тредам с project_id = NULL: видит только owner_user_id плюс
-- участники с правом view_all_projects (или владелец воркспейса).

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

  SELECT id, project_id, workspace_id, access_type, access_roles, created_by, owner_user_id
    INTO v_thread
    FROM project_threads
    WHERE id = p_thread_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_thread.project_id IS NULL THEN
    IF v_thread.owner_user_id = p_user_id THEN RETURN true; END IF;
    IF v_thread.created_by = p_user_id THEN RETURN true; END IF;
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

DROP POLICY IF EXISTS project_threads_select ON public.project_threads;
DROP POLICY IF EXISTS project_threads_insert ON public.project_threads;
DROP POLICY IF EXISTS project_threads_update ON public.project_threads;
DROP POLICY IF EXISTS project_threads_delete ON public.project_threads;

CREATE POLICY project_threads_select ON public.project_threads FOR SELECT
  USING (
    can_user_access_thread(id, (SELECT auth.uid()))
  );

CREATE POLICY project_threads_insert ON public.project_threads FOR INSERT
  WITH CHECK (
    (
      project_id IS NOT NULL AND project_id IN (
        SELECT p.id FROM projects p
        JOIN participants part ON part.workspace_id = p.workspace_id
        WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
      )
    )
    OR (
      project_id IS NULL AND (
        owner_user_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM participants par
          JOIN workspace_roles wr ON wr.name = ANY(par.workspace_roles)
                                  AND wr.workspace_id = par.workspace_id
          WHERE par.user_id = (SELECT auth.uid())
            AND par.workspace_id = project_threads.workspace_id
            AND par.is_deleted = false
            AND (wr.is_owner = true
                 OR (wr.permissions->>'manage_workspace_settings')::boolean = true)
        )
      )
    )
  );

CREATE POLICY project_threads_update ON public.project_threads FOR UPDATE
  USING (
    can_user_access_thread(id, (SELECT auth.uid()))
  );

CREATE POLICY project_threads_delete ON public.project_threads FOR DELETE
  USING (
    can_user_access_thread(id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS project_messages_select ON public.project_messages;
CREATE POLICY project_messages_select ON public.project_messages FOR SELECT
  USING (
    (
      thread_id IS NOT NULL AND can_user_access_thread(thread_id, (SELECT auth.uid()))
    )
    AND ((channel = 'client'::text) OR is_internal_member(workspace_id, (SELECT auth.uid())))
    AND ((is_draft = false) OR (sender_participant_id IN (
      SELECT participants.id FROM participants
      WHERE participants.user_id = (SELECT auth.uid())
    )))
  );

DROP POLICY IF EXISTS project_messages_update ON public.project_messages;
CREATE POLICY project_messages_update ON public.project_messages FOR UPDATE
  USING (
    (
      thread_id IS NOT NULL AND can_user_access_thread(thread_id, auth.uid())
    )
    AND ((channel = 'client'::text) OR is_internal_member(workspace_id, auth.uid()))
  );

DROP POLICY IF EXISTS project_messages_delete ON public.project_messages;
CREATE POLICY project_messages_delete ON public.project_messages FOR DELETE
  USING (
    (
      sender_participant_id IN (SELECT id FROM participants WHERE user_id = auth.uid())
      OR (thread_id IS NOT NULL AND can_user_access_thread(thread_id, auth.uid())
          AND EXISTS (
            SELECT 1 FROM participants p
            JOIN workspace_roles wr ON wr.name = ANY(p.workspace_roles)
                                    AND wr.workspace_id = p.workspace_id
            WHERE p.user_id = auth.uid()
              AND p.workspace_id = project_messages.workspace_id
              AND ((wr.is_owner = true) OR ((wr.permissions->>'edit_all_projects')::boolean = true))
          )
      )
    )
    AND ((channel = 'client'::text) OR is_internal_member(workspace_id, auth.uid()))
  );
