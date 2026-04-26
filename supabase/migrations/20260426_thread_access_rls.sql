-- Защищаем доступ к тредам и сообщениям на уровне RLS.
-- До этой миграции:
--   project_threads_select / project_messages_select разрешали чтение всем
--   участникам проекта (или воркспейса для thread без проекта). Уровневые
--   ограничения треда (access_type='roles'/'custom', участники, исполнители,
--   создатель) проверялись только на клиенте — клиент со включённой вкладкой
--   «История» видел все сообщения из всех тредов проекта.
--
-- Теперь обе политики дополнительно вызывают can_user_access_thread(...),
-- зеркалирующую правила из src/utils/threadAccess.ts (ровно те же 8 пунктов).
-- Workspace-level треды (project_id IS NULL) видят все участники воркспейса.

-- ─── 1. Helper: проверка доступа пользователя к треду по правилам Thread Access.

CREATE OR REPLACE FUNCTION public.can_user_access_thread(p_thread_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread RECORD;
  v_participant_id uuid;
  v_project_roles text[];
  v_workspace_roles text[];
BEGIN
  IF p_thread_id IS NULL OR p_user_id IS NULL THEN RETURN false; END IF;

  SELECT id, project_id, workspace_id, access_type, access_roles, created_by
    INTO v_thread
    FROM project_threads
    WHERE id = p_thread_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- 1. Workspace-level тред (без проекта) — видит любой участник воркспейса.
  IF v_thread.project_id IS NULL THEN
    RETURN EXISTS(
      SELECT 1 FROM participants
      WHERE user_id = p_user_id
        AND workspace_id = v_thread.workspace_id
        AND is_deleted = false
    );
  END IF;

  -- Участник воркспейса?
  SELECT par.id, par.workspace_roles
    INTO v_participant_id, v_workspace_roles
    FROM participants par
    WHERE par.user_id = p_user_id
      AND par.workspace_id = v_thread.workspace_id
      AND par.is_deleted = false;
  IF v_participant_id IS NULL THEN RETURN false; END IF;
  v_workspace_roles := COALESCE(v_workspace_roles, '{}');

  -- 2. view_all_projects / workspace owner → доступ ко всему.
  IF EXISTS(
    SELECT 1 FROM workspace_roles wr
    WHERE wr.workspace_id = v_thread.workspace_id
      AND wr.name = ANY(v_workspace_roles)
      AND (wr.is_owner = true
           OR (wr.permissions->>'view_all_projects')::boolean = true)
  ) THEN RETURN true; END IF;

  -- Роли пользователя в проекте треда.
  SELECT pp.project_roles INTO v_project_roles
    FROM project_participants pp
    WHERE pp.project_id = v_thread.project_id
      AND pp.participant_id = v_participant_id;
  -- Не участник проекта → нет доступа.
  IF v_project_roles IS NULL THEN RETURN false; END IF;

  -- 3. Администратор проекта.
  IF 'Администратор' = ANY(v_project_roles) THEN RETURN true; END IF;

  -- 4. Создатель треда.
  IF v_thread.created_by = p_user_id THEN RETURN true; END IF;

  -- 5. Исполнитель задачи.
  IF EXISTS(
    SELECT 1 FROM task_assignees ta
    WHERE ta.thread_id = p_thread_id
      AND ta.participant_id = v_participant_id
  ) THEN RETURN true; END IF;

  -- 6. access_type = 'all' (все участники проекта).
  IF v_thread.access_type = 'all' THEN RETURN true; END IF;

  -- 7. access_type = 'roles' (пересечение ролей).
  IF v_thread.access_type = 'roles'
     AND COALESCE(v_thread.access_roles, '{}') && v_project_roles THEN
    RETURN true;
  END IF;

  -- 8. access_type = 'custom' (явное членство).
  IF v_thread.access_type = 'custom' AND EXISTS(
    SELECT 1 FROM project_thread_members ptm
    WHERE ptm.thread_id = p_thread_id
      AND ptm.participant_id = v_participant_id
  ) THEN RETURN true; END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_user_access_thread(uuid, uuid) TO authenticated, anon;

-- ─── 2. project_threads_select — добавляем гейт по can_user_access_thread.

DROP POLICY IF EXISTS project_threads_select ON public.project_threads;
CREATE POLICY project_threads_select
  ON public.project_threads FOR SELECT TO public
  USING (
    -- Workspace-level тред — любой участник воркспейса.
    ((project_id IS NULL) AND (workspace_id IN (
      SELECT part.workspace_id FROM participants part
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )))
    OR
    -- Project-level тред — гейт по правилам Thread Access.
    ((project_id IS NOT NULL) AND public.can_user_access_thread(id, (SELECT auth.uid())))
  );

-- ─── 3. project_messages_select — добавляем гейт по треду.
--     Дополнительно к старым условиям (project_participant + channel/internal).
--     Сообщения без thread_id (если такие есть) гейтятся как раньше — по проекту.

DROP POLICY IF EXISTS project_messages_select ON public.project_messages;
CREATE POLICY project_messages_select
  ON public.project_messages FOR SELECT TO public
  USING (
    (
      ((project_id IS NOT NULL) AND (EXISTS (
        SELECT 1
        FROM project_participants pp
        JOIN participants p ON p.id = pp.participant_id
        WHERE pp.project_id = project_messages.project_id
          AND p.user_id = (SELECT auth.uid())
      )))
      OR
      ((project_id IS NULL) AND (workspace_id IN (
        SELECT part.workspace_id FROM participants part
        WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
      )))
    )
    AND (channel = 'client' OR is_internal_member(workspace_id, (SELECT auth.uid())))
    AND (is_draft = false OR sender_participant_id IN (
      SELECT participants.id FROM participants
      WHERE participants.user_id = (SELECT auth.uid())
    ))
    AND (
      thread_id IS NULL
      OR public.can_user_access_thread(thread_id, (SELECT auth.uid()))
    )
  );
