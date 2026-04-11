-- 2026-04-11: Thread templates can be scoped to a specific project template.
--
-- Two new columns:
--
--   thread_templates.owner_project_template_id — when NULL the template is
--   "global" and shows up in the workspace-wide "Thread templates" settings
--   section and in every project's "+" menu. When set, the template belongs
--   to a specific project template (Type of Project) and is only visible in
--   projects of that type.
--
--   project_threads.source_template_id — set when a thread is instantiated
--   from a template. Lets the "+" menu inside a project hide templates that
--   have already produced a thread in this project, so users don't create
--   duplicates by accident. ON DELETE SET NULL: deleting the template does
--   not delete the thread, we only lose the link.
--
-- Data migration: existing `project_template_tasks` rows are converted to
-- `thread_templates` (thread_type='task') scoped to their project template,
-- with the default access preset that CreateProjectDialog used to hard-code
-- ('roles' with Администратор + Исполнитель). The old table is kept in
-- place for one or two releases as a safety net and will be dropped later.

BEGIN;

-- 1. Add owner_project_template_id to thread_templates.
ALTER TABLE public.thread_templates
  ADD COLUMN IF NOT EXISTS owner_project_template_id uuid
    REFERENCES public.project_templates(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_thread_templates_owner_pt
  ON public.thread_templates(owner_project_template_id)
  WHERE owner_project_template_id IS NOT NULL;

COMMENT ON COLUMN public.thread_templates.owner_project_template_id IS
  'When set, this template belongs to a specific project template and is '
  'only visible inside projects of that type. When NULL, the template is '
  'global and shows up everywhere (workspace settings + every project).';

-- 2. Add source_template_id to project_threads.
ALTER TABLE public.project_threads
  ADD COLUMN IF NOT EXISTS source_template_id uuid
    REFERENCES public.thread_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_threads_source_template
  ON public.project_threads(project_id, source_template_id)
  WHERE source_template_id IS NOT NULL;

COMMENT ON COLUMN public.project_threads.source_template_id IS
  'Thread template this thread was instantiated from. Used by the "+" menu '
  'to hide templates that already produced a thread in this project.';

-- 3. Migrate existing project_template_tasks -> thread_templates.
--    Same default access that CreateProjectDialog used to hard-code.
--    Dedup guard (WHERE NOT EXISTS): idempotent if the migration is re-run.
INSERT INTO public.thread_templates (
  workspace_id,
  owner_project_template_id,
  name,
  thread_type,
  is_email,
  accent_color,
  icon,
  access_type,
  access_roles,
  sort_order
)
SELECT
  pt.workspace_id,
  ptt.project_template_id,
  ptt.name,
  'task',
  false,
  'blue',
  'check-square',
  'roles',
  ARRAY['Администратор', 'Исполнитель']::text[],
  ptt.sort_order
FROM public.project_template_tasks ptt
INNER JOIN public.project_templates pt
  ON pt.id = ptt.project_template_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.thread_templates tt
  WHERE tt.owner_project_template_id = ptt.project_template_id
    AND tt.thread_type = 'task'
    AND tt.name = ptt.name
);

COMMIT;
