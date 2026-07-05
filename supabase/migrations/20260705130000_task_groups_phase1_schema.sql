-- Группы задач (Фаза 1) — аддитивная схема. Ничего не переносит: все элементы
-- по умолчанию group_id=NULL (верхний уровень) → поведение как сегодня.
-- Группа = раздел, внутри которого по порядку лежат задачи, тексты и слоты.

-- ── Группы в проекте ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_task_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  accent_color text,
  sort_order integer NOT NULL DEFAULT 0,
  is_collapsed boolean NOT NULL DEFAULT false,
  visible_to_client boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_task_groups_project
  ON public.project_task_groups(project_id, sort_order);

ALTER TABLE public.project_task_groups ENABLE ROW LEVEL SECURITY;

-- RLS 1:1 с project_plan_blocks (модуль 'plan')
CREATE POLICY project_task_groups_select ON public.project_task_groups
  FOR SELECT TO public USING (
    has_project_module_access((SELECT auth.uid()), project_id, 'plan')
    OR has_workspace_permission((SELECT auth.uid()), workspace_id, 'view_all_projects')
  );
CREATE POLICY project_task_groups_insert ON public.project_task_groups
  FOR INSERT TO public WITH CHECK (
    has_project_module_access((SELECT auth.uid()), project_id, 'plan')
    OR has_workspace_permission((SELECT auth.uid()), workspace_id, 'edit_all_projects')
  );
CREATE POLICY project_task_groups_update ON public.project_task_groups
  FOR UPDATE TO public USING (
    has_project_module_access((SELECT auth.uid()), project_id, 'plan')
    OR has_workspace_permission((SELECT auth.uid()), workspace_id, 'edit_all_projects')
  );
CREATE POLICY project_task_groups_delete ON public.project_task_groups
  FOR DELETE TO public USING (
    has_project_module_access((SELECT auth.uid()), project_id, 'plan')
    OR has_workspace_permission((SELECT auth.uid()), workspace_id, 'edit_all_projects')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_task_groups TO authenticated;
GRANT ALL ON public.project_task_groups TO service_role;

-- ── Принадлежность элементов группе (NULL = верхний уровень) ─────────
ALTER TABLE public.project_threads
  ADD COLUMN IF NOT EXISTS task_group_id uuid
  REFERENCES public.project_task_groups(id) ON DELETE SET NULL;
ALTER TABLE public.project_plan_blocks
  ADD COLUMN IF NOT EXISTS group_id uuid
  REFERENCES public.project_task_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_project_threads_task_group
  ON public.project_threads(task_group_id) WHERE task_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_plan_blocks_group
  ON public.project_plan_blocks(group_id) WHERE group_id IS NOT NULL;

-- ── Группы в шаблоне проекта (зеркало) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_template_task_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_template_id uuid NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  accent_color text,
  sort_order integer NOT NULL DEFAULT 0,
  visible_to_client boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_template_task_groups_template
  ON public.project_template_task_groups(project_template_id, sort_order);

ALTER TABLE public.project_template_task_groups ENABLE ROW LEVEL SECURITY;

-- RLS 1:1 с project_template_plan_blocks
CREATE POLICY template_task_groups_select ON public.project_template_task_groups
  FOR SELECT TO public USING (
    EXISTS (SELECT 1 FROM public.participants p
            WHERE p.workspace_id = project_template_task_groups.workspace_id
              AND p.user_id = (SELECT auth.uid()) AND p.is_deleted = false)
  );
CREATE POLICY template_task_groups_insert ON public.project_template_task_groups
  FOR INSERT TO public WITH CHECK (
    is_workspace_owner((SELECT auth.uid()), workspace_id)
    OR has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_workspace_settings')
  );
CREATE POLICY template_task_groups_update ON public.project_template_task_groups
  FOR UPDATE TO public USING (
    is_workspace_owner((SELECT auth.uid()), workspace_id)
    OR has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_workspace_settings')
  );
CREATE POLICY template_task_groups_delete ON public.project_template_task_groups
  FOR DELETE TO public USING (
    is_workspace_owner((SELECT auth.uid()), workspace_id)
    OR has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_workspace_settings')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_template_task_groups TO authenticated;
GRANT ALL ON public.project_template_task_groups TO service_role;

ALTER TABLE public.thread_templates
  ADD COLUMN IF NOT EXISTS task_group_id uuid
  REFERENCES public.project_template_task_groups(id) ON DELETE SET NULL;
ALTER TABLE public.project_template_plan_blocks
  ADD COLUMN IF NOT EXISTS group_id uuid
  REFERENCES public.project_template_task_groups(id) ON DELETE SET NULL;
