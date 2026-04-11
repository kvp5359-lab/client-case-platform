-- 2026-04-11: Merge three separate module ids into one — `threads`.
--
-- Previously the project_templates.enabled_modules array (and
-- project_roles.module_access JSONB) carried three independent module ids:
--   'tasks'              — tasks tab inside a project
--   'messenger'          — client-facing chat panel
--   'internal_messenger' — internal team chat panel
--
-- They always had to be configured together in practice (a project needs
-- both tasks and chats, you can't meaningfully have one without the other),
-- and the UI now presents them as a single "Задачи и чаты" section with
-- a unified list of thread templates. The three ids are collapsed into
-- `threads`.
--
-- This migration is intentionally destructive: old ids are removed from
-- every existing record so the codebase can drop backward-compatibility
-- fallbacks entirely.

BEGIN;

-- 1. project_templates.enabled_modules:
--    replace all occurrences of the three old ids with a single 'threads',
--    dedup, preserve other module ids untouched.
UPDATE public.project_templates
SET enabled_modules = (
  SELECT array_agg(DISTINCT m ORDER BY m)
  FROM (
    SELECT CASE
      WHEN x IN ('tasks', 'messenger', 'internal_messenger') THEN 'threads'
      ELSE x
    END AS m
    FROM unnest(enabled_modules) AS x
  ) sub
)
WHERE enabled_modules && ARRAY['tasks', 'messenger', 'internal_messenger'];

-- 2. project_roles.module_access:
--    introduce one new boolean `threads` = OR of the three old flags,
--    then drop the old keys. If a role had even one of the three enabled,
--    it will get `threads = true`.
UPDATE public.project_roles
SET module_access = (
  module_access
    - 'tasks'
    - 'messenger'
    - 'internal_messenger'
) || jsonb_build_object(
  'threads',
  COALESCE((module_access->>'tasks')::boolean, false)
    OR COALESCE((module_access->>'messenger')::boolean, false)
    OR COALESCE((module_access->>'internal_messenger')::boolean, false)
)
WHERE module_access ?| ARRAY['tasks', 'messenger', 'internal_messenger'];

COMMIT;
