-- 2026-04-11: Wrap auth.uid() in (select auth.uid()) for hot-path RLS policies.
--
-- Postgres re-evaluates auth.uid() for every row because the function is
-- STABLE (not IMMUTABLE). Wrapping it in a subquery lets the planner cache
-- the result once per query — this is Supabase's official recommendation
-- for scaling RLS (auth_rls_initplan advisor).
--
-- This migration covers the hottest tables: projects, project_threads, tasks,
-- boards, board_lists, board_members, documents, statuses, participants,
-- workspaces, project_participants. The same pattern should be applied to
-- remaining tables in a follow-up pass — this migration is intentionally
-- scoped to hot-path to keep the blast radius manageable.
--
-- Semantics are identical; the only change is evaluation caching.

-- projects (4 policies)
DROP POLICY IF EXISTS "Users can view projects in their workspace" ON public.projects;
CREATE POLICY "Users can view projects in their workspace"
  ON public.projects FOR SELECT TO public
  USING (
    workspace_id IN (
      SELECT participants.workspace_id FROM participants
      WHERE participants.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create projects in their workspace" ON public.projects;
CREATE POLICY "Users can create projects in their workspace"
  ON public.projects FOR INSERT TO public
  WITH CHECK (
    workspace_id IN (
      SELECT participants.workspace_id FROM participants
      WHERE participants.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update projects in their workspace" ON public.projects;
CREATE POLICY "Users can update projects in their workspace"
  ON public.projects FOR UPDATE TO public
  USING (
    workspace_id IN (
      SELECT participants.workspace_id FROM participants
      WHERE participants.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete projects in their workspace" ON public.projects;
CREATE POLICY "Users can delete projects in their workspace"
  ON public.projects FOR DELETE TO public
  USING (
    workspace_id IN (
      SELECT participants.workspace_id FROM participants
      WHERE participants.user_id = (SELECT auth.uid())
    )
  );

-- project_threads (4 policies)
DROP POLICY IF EXISTS project_threads_select ON public.project_threads;
CREATE POLICY project_threads_select
  ON public.project_threads FOR SELECT TO public
  USING (
    ((project_id IS NOT NULL) AND (project_id IN (
      SELECT p.id FROM (projects p JOIN participants part ON part.workspace_id = p.workspace_id)
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )))
    OR ((project_id IS NULL) AND (workspace_id IN (
      SELECT part.workspace_id FROM participants part
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )))
  );

DROP POLICY IF EXISTS project_threads_insert ON public.project_threads;
CREATE POLICY project_threads_insert
  ON public.project_threads FOR INSERT TO public
  WITH CHECK (
    ((project_id IS NOT NULL) AND (project_id IN (
      SELECT p.id FROM (projects p JOIN participants part ON part.workspace_id = p.workspace_id)
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )))
    OR ((project_id IS NULL) AND (workspace_id IN (
      SELECT part.workspace_id FROM participants part
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )))
  );

DROP POLICY IF EXISTS project_threads_update ON public.project_threads;
CREATE POLICY project_threads_update
  ON public.project_threads FOR UPDATE TO public
  USING (
    ((project_id IS NOT NULL) AND (project_id IN (
      SELECT p.id FROM (projects p JOIN participants part ON part.workspace_id = p.workspace_id)
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )))
    OR ((project_id IS NULL) AND (workspace_id IN (
      SELECT part.workspace_id FROM participants part
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )))
  );

DROP POLICY IF EXISTS project_threads_delete ON public.project_threads;
CREATE POLICY project_threads_delete
  ON public.project_threads FOR DELETE TO public
  USING (
    ((project_id IS NOT NULL) AND (project_id IN (
      SELECT p.id FROM (projects p JOIN participants part ON part.workspace_id = p.workspace_id)
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )))
    OR ((project_id IS NULL) AND (workspace_id IN (
      SELECT part.workspace_id FROM participants part
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )))
  );

-- boards (4 policies)
DROP POLICY IF EXISTS boards_select ON public.boards;
CREATE POLICY boards_select
  ON public.boards FOR SELECT TO public
  USING (
    workspace_id IN (
      SELECT p.workspace_id FROM participants p
      WHERE p.user_id = (SELECT auth.uid()) AND p.is_deleted = false
    )
  );

DROP POLICY IF EXISTS boards_insert ON public.boards;
CREATE POLICY boards_insert
  ON public.boards FOR INSERT TO public
  WITH CHECK (
    workspace_id IN (
      SELECT p.workspace_id FROM participants p
      WHERE p.user_id = (SELECT auth.uid()) AND p.is_deleted = false
    )
  );

DROP POLICY IF EXISTS boards_update ON public.boards;
CREATE POLICY boards_update
  ON public.boards FOR UPDATE TO public
  USING (
    workspace_id IN (
      SELECT p.workspace_id FROM participants p
      WHERE p.user_id = (SELECT auth.uid()) AND p.is_deleted = false
    )
  );

DROP POLICY IF EXISTS boards_delete ON public.boards;
CREATE POLICY boards_delete
  ON public.boards FOR DELETE TO public
  USING (
    workspace_id IN (
      SELECT p.workspace_id FROM participants p
      WHERE p.user_id = (SELECT auth.uid()) AND p.is_deleted = false
    )
  );

-- board_lists (4 policies)
DROP POLICY IF EXISTS board_lists_select ON public.board_lists;
CREATE POLICY board_lists_select
  ON public.board_lists FOR SELECT TO public
  USING (
    board_id IN (
      SELECT b.id FROM boards b
      WHERE b.workspace_id IN (
        SELECT p.workspace_id FROM participants p
        WHERE p.user_id = (SELECT auth.uid()) AND p.is_deleted = false
      )
    )
  );

DROP POLICY IF EXISTS board_lists_insert ON public.board_lists;
CREATE POLICY board_lists_insert
  ON public.board_lists FOR INSERT TO public
  WITH CHECK (
    board_id IN (
      SELECT b.id FROM boards b
      WHERE b.workspace_id IN (
        SELECT p.workspace_id FROM participants p
        WHERE p.user_id = (SELECT auth.uid()) AND p.is_deleted = false
      )
    )
  );

DROP POLICY IF EXISTS board_lists_update ON public.board_lists;
CREATE POLICY board_lists_update
  ON public.board_lists FOR UPDATE TO public
  USING (
    board_id IN (
      SELECT b.id FROM boards b
      WHERE b.workspace_id IN (
        SELECT p.workspace_id FROM participants p
        WHERE p.user_id = (SELECT auth.uid()) AND p.is_deleted = false
      )
    )
  );

DROP POLICY IF EXISTS board_lists_delete ON public.board_lists;
CREATE POLICY board_lists_delete
  ON public.board_lists FOR DELETE TO public
  USING (
    board_id IN (
      SELECT b.id FROM boards b
      WHERE b.workspace_id IN (
        SELECT p.workspace_id FROM participants p
        WHERE p.user_id = (SELECT auth.uid()) AND p.is_deleted = false
      )
    )
  );

-- board_members (3 policies)
DROP POLICY IF EXISTS board_members_select ON public.board_members;
CREATE POLICY board_members_select
  ON public.board_members FOR SELECT TO public
  USING (
    board_id IN (
      SELECT b.id FROM boards b
      WHERE b.workspace_id IN (
        SELECT p.workspace_id FROM participants p
        WHERE p.user_id = (SELECT auth.uid()) AND p.is_deleted = false
      )
    )
  );

DROP POLICY IF EXISTS board_members_insert ON public.board_members;
CREATE POLICY board_members_insert
  ON public.board_members FOR INSERT TO public
  WITH CHECK (
    board_id IN (
      SELECT b.id FROM boards b
      WHERE b.workspace_id IN (
        SELECT p.workspace_id FROM participants p
        WHERE p.user_id = (SELECT auth.uid()) AND p.is_deleted = false
      )
    )
  );

DROP POLICY IF EXISTS board_members_delete ON public.board_members;
CREATE POLICY board_members_delete
  ON public.board_members FOR DELETE TO public
  USING (
    board_id IN (
      SELECT b.id FROM boards b
      WHERE b.workspace_id IN (
        SELECT p.workspace_id FROM participants p
        WHERE p.user_id = (SELECT auth.uid()) AND p.is_deleted = false
      )
    )
  );

-- documents (1 policy — FOR ALL)
DROP POLICY IF EXISTS documents_access ON public.documents;
CREATE POLICY documents_access
  ON public.documents FOR ALL TO public
  USING (
    workspace_id IN (
      SELECT participants.workspace_id FROM participants
      WHERE participants.user_id = (SELECT auth.uid()) AND participants.is_deleted = false
    )
  );

-- tasks (4 policies — сохраняем текущую семантику tasks_update / tasks_delete)
DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select
  ON public.tasks FOR SELECT TO public
  USING (
    (is_deleted = false) AND (
      EXISTS (
        SELECT 1 FROM (project_participants pp JOIN participants p ON p.id = pp.participant_id)
        WHERE pp.project_id = tasks.project_id
          AND p.user_id = (SELECT auth.uid())
          AND p.is_deleted = false
      )
      OR has_workspace_permission((SELECT auth.uid()), workspace_id, 'view_all_projects'::text)
    )
  );

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert
  ON public.tasks FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (project_participants pp JOIN participants p ON p.id = pp.participant_id)
      WHERE pp.project_id = tasks.project_id
        AND p.user_id = (SELECT auth.uid())
        AND p.is_deleted = false
    )
    OR has_workspace_permission((SELECT auth.uid()), workspace_id, 'edit_all_projects'::text)
  );

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update
  ON public.tasks FOR UPDATE TO public
  USING (
    (is_deleted = false) AND (
      created_by = (SELECT auth.uid())
      OR project_id IN (
        SELECT pp.project_id FROM (project_participants pp JOIN participants p ON p.id = pp.participant_id)
        WHERE p.user_id = (SELECT auth.uid())
          AND p.is_deleted = false
          AND 'administrator'::text = ANY (pp.project_roles)
      )
    )
  );

DROP POLICY IF EXISTS tasks_delete ON public.tasks;
CREATE POLICY tasks_delete
  ON public.tasks FOR UPDATE TO public
  USING (
    created_by = (SELECT auth.uid())
    OR project_id IN (
      SELECT pp.project_id FROM (project_participants pp JOIN participants p ON p.id = pp.participant_id)
      WHERE p.user_id = (SELECT auth.uid())
        AND p.is_deleted = false
        AND 'administrator'::text = ANY (pp.project_roles)
    )
  )
  WITH CHECK (is_deleted = true);

-- statuses (4 policies)
DROP POLICY IF EXISTS statuses_select ON public.statuses;
CREATE POLICY statuses_select
  ON public.statuses FOR SELECT TO public
  USING (
    workspace_id IN (
      SELECT participants.workspace_id FROM participants
      WHERE participants.user_id = (SELECT auth.uid()) AND participants.is_deleted = false
    )
  );

DROP POLICY IF EXISTS statuses_insert ON public.statuses;
CREATE POLICY statuses_insert
  ON public.statuses FOR INSERT TO public
  WITH CHECK (has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_statuses'::text));

DROP POLICY IF EXISTS statuses_update ON public.statuses;
CREATE POLICY statuses_update
  ON public.statuses FOR UPDATE TO public
  USING (has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_statuses'::text));

DROP POLICY IF EXISTS statuses_delete ON public.statuses;
CREATE POLICY statuses_delete
  ON public.statuses FOR DELETE TO public
  USING ((is_system = false) AND has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_statuses'::text));

-- project_participants (select policy)
DROP POLICY IF EXISTS project_participants_select ON public.project_participants;
CREATE POLICY project_participants_select
  ON public.project_participants FOR SELECT TO public
  USING (
    project_id IN (
      SELECT p.id FROM (projects p JOIN participants part ON part.workspace_id = p.workspace_id)
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )
  );

-- participants (3 policies — auth.role() обернуть не критично, но для единообразия)
DROP POLICY IF EXISTS "Authenticated users can view all participants" ON public.participants;
CREATE POLICY "Authenticated users can view all participants"
  ON public.participants FOR SELECT TO public
  USING (((SELECT auth.role()) = 'authenticated'::text) AND (is_deleted = false));

DROP POLICY IF EXISTS "Authenticated users can create participants" ON public.participants;
CREATE POLICY "Authenticated users can create participants"
  ON public.participants FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'authenticated'::text);

DROP POLICY IF EXISTS "Authenticated users can update participants" ON public.participants;
CREATE POLICY "Authenticated users can update participants"
  ON public.participants FOR UPDATE TO public
  USING (((SELECT auth.role()) = 'authenticated'::text) AND (is_deleted = false));

-- workspaces (3 policies)
DROP POLICY IF EXISTS "Authenticated users can view workspaces" ON public.workspaces;
CREATE POLICY "Authenticated users can view workspaces"
  ON public.workspaces FOR SELECT TO public
  USING (((SELECT auth.role()) = 'authenticated'::text) AND (is_deleted = false));

DROP POLICY IF EXISTS "Authenticated users can create workspaces" ON public.workspaces;
CREATE POLICY "Authenticated users can create workspaces"
  ON public.workspaces FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'authenticated'::text);

DROP POLICY IF EXISTS "Authenticated users can update workspaces" ON public.workspaces;
CREATE POLICY "Authenticated users can update workspaces"
  ON public.workspaces FOR UPDATE TO public
  USING (((SELECT auth.role()) = 'authenticated'::text) AND (is_deleted = false));
