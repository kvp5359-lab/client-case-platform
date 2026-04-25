-- ============================================================================
-- Project-template statuses + auto-advance on task completion
--
-- 1. statuses.project_template_id — статус принадлежит шаблону проекта
--    (NULL = общий статус воркспейса, фолбэк для проектов без шаблона)
-- 2. projects.status_id — FK на statuses вместо текстового projects.status
-- 3. thread_templates.on_complete_set_project_status_id — правило автоперехода
-- 4. trigger auto_advance_project_status — выполняет правило
-- ============================================================================

BEGIN;

-- 1. statuses.project_template_id
ALTER TABLE public.statuses
  ADD COLUMN IF NOT EXISTS project_template_id uuid
    REFERENCES public.project_templates(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_statuses_project_template
  ON public.statuses(project_template_id)
  WHERE project_template_id IS NOT NULL;

COMMENT ON COLUMN public.statuses.project_template_id IS
  'When set, this status belongs to a specific project template and is only '
  'visible to projects created from that template. NULL = workspace-wide '
  'status (fallback for projects without a template).';

-- 2. projects.status_id (заменяет текстовый projects.status)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS status_id uuid
    REFERENCES public.statuses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_status_id
  ON public.projects(status_id)
  WHERE status_id IS NOT NULL;

-- Миграция данных: текстовый projects.status → projects.status_id.
-- Маппинг: 'completed' → первый is_final, всё остальное → is_default.
-- Берём только статусы с project_template_id IS NULL (общие воркспейсные).
UPDATE public.projects p
SET status_id = (
  SELECT s.id FROM public.statuses s
  WHERE s.workspace_id = p.workspace_id
    AND s.entity_type = 'project'
    AND s.project_template_id IS NULL
    AND (
      (p.status = 'completed' AND s.is_final)
      OR (p.status <> 'completed' AND s.is_default)
    )
  ORDER BY s.order_index
  LIMIT 1
)
WHERE p.status_id IS NULL;

-- 3. thread_templates.on_complete_set_project_status_id
ALTER TABLE public.thread_templates
  ADD COLUMN IF NOT EXISTS on_complete_set_project_status_id uuid
    REFERENCES public.statuses(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.thread_templates.on_complete_set_project_status_id IS
  'When a thread created from this template moves to a final status, the '
  'parent project status_id is auto-advanced to this value. NULL = no rule.';

-- 4. Триггер автоперехода
CREATE OR REPLACE FUNCTION public.auto_advance_project_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_final boolean;
  v_target_status uuid;
BEGIN
  IF NEW.status_id IS NULL OR NEW.status_id IS NOT DISTINCT FROM OLD.status_id THEN
    RETURN NEW;
  END IF;
  IF NEW.project_id IS NULL OR NEW.source_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.is_final INTO v_is_final
  FROM public.statuses s WHERE s.id = NEW.status_id;
  IF NOT COALESCE(v_is_final, false) THEN
    RETURN NEW;
  END IF;

  SELECT tt.on_complete_set_project_status_id INTO v_target_status
  FROM public.thread_templates tt WHERE tt.id = NEW.source_template_id;
  IF v_target_status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Last write wins: не сверяемся с текущим status_id проекта
  UPDATE public.projects
  SET status_id = v_target_status, updated_at = now()
  WHERE id = NEW.project_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_advance_project_status ON public.project_threads;
CREATE TRIGGER trg_auto_advance_project_status
AFTER UPDATE OF status_id ON public.project_threads
FOR EACH ROW EXECUTE FUNCTION public.auto_advance_project_status();

COMMENT ON FUNCTION public.auto_advance_project_status() IS
  'When a thread (project_threads row) created from a thread_template moves '
  'into a final status, advance projects.status_id to '
  'thread_templates.on_complete_set_project_status_id. Last write wins.';

COMMIT;
