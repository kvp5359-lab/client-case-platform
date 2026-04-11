-- 2026-04-11: Re-apply tasks_update / tasks_delete policies idempotently.
--
-- This migration is a no-op in terms of behaviour — it re-creates the same
-- two-policy split we already had on public.tasks/UPDATE. The audit asked
-- whether the `multiple_permissive_policies` advisor could be resolved by
-- merging the policies; the answer turned out to be "no, not safely":
--
--   tasks_update   USING (is_deleted = false) → "edits only live tasks"
--   tasks_delete   WITH CHECK (is_deleted = true) → "only transition to deleted"
--
-- Together they block reviving a soft-deleted task via a plain UPDATE:
-- tasks_update won't match (USING fails because is_deleted = true), and
-- tasks_delete won't match either (WITH CHECK fails because is_deleted = false
-- isn't the target). Postgres RLS can't compare OLD.col with NEW.col in a
-- single policy, so the soft-delete invariant cannot be preserved by a single
-- merged policy.
--
-- The `multiple_permissive_policies` advisor on tasks/UPDATE therefore stays
-- open — it's an intentional trade-off, not an oversight. This migration
-- exists in the repo so a fresh checkout lands on the same policy shape; it
-- will be a no-op against a DB that already has these policies.

DROP POLICY IF EXISTS tasks_update ON public.tasks;
DROP POLICY IF EXISTS tasks_delete ON public.tasks;

CREATE POLICY tasks_update
  ON public.tasks FOR UPDATE TO public
  USING (
    (is_deleted = false) AND (
      created_by = (SELECT auth.uid())
      OR project_id IN (
        SELECT pp.project_id
        FROM (project_participants pp JOIN participants p ON p.id = pp.participant_id)
        WHERE p.user_id = (SELECT auth.uid())
          AND p.is_deleted = false
          AND 'administrator'::text = ANY (pp.project_roles)
      )
    )
  );

CREATE POLICY tasks_delete
  ON public.tasks FOR UPDATE TO public
  USING (
    created_by = (SELECT auth.uid())
    OR project_id IN (
      SELECT pp.project_id
      FROM (project_participants pp JOIN participants p ON p.id = pp.participant_id)
      WHERE p.user_id = (SELECT auth.uid())
        AND p.is_deleted = false
        AND 'administrator'::text = ANY (pp.project_roles)
    )
  )
  WITH CHECK (is_deleted = true);
