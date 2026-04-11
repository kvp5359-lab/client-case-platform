-- 2026-04-11: Add covering index for workspace-wide active thread listing.
--
-- `get_workspace_threads` filters by `workspace_id = ? AND is_deleted = false`
-- (plus access checks per row) and sorts by `sort_order, created_at`. The
-- existing `idx_project_threads_active` is keyed on `project_id`, which does
-- not help workspace-level queries, and `project_threads_workspace_deleted_at_idx`
-- is a partial index `WHERE is_deleted = true` scoped to the trash view.
--
-- This adds a partial index on `workspace_id` covering only active rows,
-- which is the 99%-case for the inbox/tasks listing. Currently the table
-- holds ~170 rows so the gain is negligible, but the index becomes
-- load-bearing as the dataset grows — we create it now to avoid a silent
-- deferred regression when a large workspace is onboarded.
--
-- CREATE INDEX IF NOT EXISTS is idempotent; no lock escalation risk at
-- the current row count.

CREATE INDEX IF NOT EXISTS idx_project_threads_workspace_active
  ON public.project_threads (workspace_id, sort_order, created_at)
  WHERE is_deleted = false;

COMMENT ON INDEX public.idx_project_threads_workspace_active IS
  'Covers get_workspace_threads: workspace_id filter + sort_order/created_at ordering, '
  'partial WHERE is_deleted = false to match the 99% active-case path.';
