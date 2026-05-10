-- =====================================================================
-- Cleanup `multiple_permissive_policies` advisor hits on hot tables.
--
-- In Supabase, the `service_role` JWT **bypasses RLS entirely** —
-- service-role-only policies that just check `auth.role() = 'service_role'`
-- add nothing to security but force Postgres to evaluate an extra policy
-- on every row for every other role too. Dropping them is safe.
--
-- For tables where multiple user-facing policies cover the SAME action
-- with similar predicates, we merge them into a single policy with
-- OR'd conditions. Behavior is equivalent; the planner gets to evaluate
-- one predicate instead of N.
-- =====================================================================

-- ─── email_accounts ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access on email_accounts" ON public.email_accounts;
DROP POLICY IF EXISTS "Users can view own email accounts" ON public.email_accounts;
DROP POLICY IF EXISTS "Workspace managers can view all email accounts" ON public.email_accounts;

CREATE POLICY "email_accounts_select" ON public.email_accounts
  FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM participants p
      JOIN workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY (p.workspace_roles)
      WHERE p.user_id = (SELECT auth.uid())
        AND p.workspace_id = email_accounts.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions ->> 'manage_workspace_settings')::boolean = true
    )
  );

-- ─── project_thread_email_links ───────────────────────────────────────
-- 4 user policies (SELECT/INSERT/UPDATE/DELETE) all share an identical
-- predicate. Collapse into ONE FOR ALL policy. Service-role one is
-- redundant — drop too.
DROP POLICY IF EXISTS "Service role full access on email_links" ON public.project_thread_email_links;
DROP POLICY IF EXISTS "Users can view email links" ON public.project_thread_email_links;
DROP POLICY IF EXISTS "Users can insert email links" ON public.project_thread_email_links;
DROP POLICY IF EXISTS "Users can update email links" ON public.project_thread_email_links;
DROP POLICY IF EXISTS "Users can delete email links" ON public.project_thread_email_links;

CREATE POLICY "project_thread_email_links_all" ON public.project_thread_email_links
  FOR ALL
  USING (
    thread_id IN (
      SELECT pt.id
      FROM project_threads pt
      JOIN participants part ON part.workspace_id = pt.workspace_id
      WHERE part.user_id = (SELECT auth.uid())
        AND part.is_deleted = false
    )
  )
  WITH CHECK (
    thread_id IN (
      SELECT pt.id
      FROM project_threads pt
      JOIN participants part ON part.workspace_id = pt.workspace_id
      WHERE part.user_id = (SELECT auth.uid())
        AND part.is_deleted = false
    )
  );

-- ─── audit_logs ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role can write audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Project participants can view project audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Workspace admins can view audit logs" ON public.audit_logs;

CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT
  USING (
    (
      project_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM project_participants pp
        JOIN participants part ON part.id = pp.participant_id
        WHERE pp.project_id = audit_logs.project_id
          AND part.user_id = (SELECT auth.uid())
          AND part.is_deleted = false
      )
    )
    OR (
      workspace_id IS NOT NULL
      AND has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_workspace_settings')
    )
  );

-- INSERT/UPDATE/DELETE on audit_logs: only service-role processes
-- (triggers / Edge Functions) need write. service_role bypasses RLS,
-- so no policy needed — RLS will reject any client write attempt.
