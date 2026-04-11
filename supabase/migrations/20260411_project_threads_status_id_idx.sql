-- 2026-04-11: Add partial index on project_threads.status_id for kanban grouping.
--
-- project_threads.status_id is a FK to statuses without a covering index.
-- The kanban board groups threads by status_id, and per-status counts/filters
-- require a lookup on this column. Without the index, queries fall back to
-- sequential scan of project_threads.
--
-- Partial WHERE is_deleted = false matches the 99%-case (live threads only),
-- keeping the index compact and aligned with other hot-path partials
-- (idx_project_threads_active, idx_project_threads_workspace_active).

CREATE INDEX IF NOT EXISTS idx_project_threads_status_id
  ON public.project_threads (status_id)
  WHERE is_deleted = false AND status_id IS NOT NULL;

COMMENT ON INDEX public.idx_project_threads_status_id IS
  'Covers kanban grouping by status_id, partial WHERE is_deleted = false AND status_id IS NOT NULL to match the live-thread 99% case.';
