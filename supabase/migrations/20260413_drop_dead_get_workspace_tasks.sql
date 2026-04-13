-- 2026-04-13: Drop dead RPC get_workspace_tasks(uuid).
--
-- This single-arg overload was superseded by get_workspace_threads(uuid, uuid)
-- which includes access control and is_deleted filtering for both threads AND
-- projects. The old function only filters pt.is_deleted but not p.is_deleted,
-- meaning soft-deleted projects' tasks would leak through if called manually.
--
-- No code in src/ references get_workspace_tasks — verified via grep.
-- Dropping to eliminate the risk of accidental manual invocation.

DROP FUNCTION IF EXISTS public.get_workspace_tasks(uuid);
