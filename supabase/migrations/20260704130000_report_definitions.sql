-- Система отчётов: таблица report_definitions.
--
-- Отчёт = сохранённая конфигурация (config jsonb): датасет, фильтр,
-- группировки, показатели, режим вывода. Исполняется RPC run_report
-- (отдельная миграция) — сборка SQL из whitelist-реестра на сервере.
--
-- Модель владения — зеркало item_lists:
--   owner_user_id IS NULL  → общий отчёт воркспейса (видят все участники,
--     меняют менеджеры с manage_workspace_settings и владельцы).
--   owner_user_id NOT NULL → личный отчёт этого юзера.

CREATE TABLE IF NOT EXISTS public.report_definitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  description     text,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  is_deleted      boolean NOT NULL DEFAULT false,
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.report_definitions IS 'Сохранённые отчёты воркспейса (конструктор отчётов).';
COMMENT ON COLUMN public.report_definitions.owner_user_id IS 'NULL = общий отчёт воркспейса; NOT NULL = личный отчёт этого юзера.';
COMMENT ON COLUMN public.report_definitions.config IS 'ReportConfig из src/types/reports.ts: {dataset, mode, groupBy, measures, filter, columns}. Исполняется run_report.';

CREATE INDEX IF NOT EXISTS idx_report_definitions_workspace
  ON public.report_definitions(workspace_id) WHERE is_deleted = false;

-- ── Триггер автообновления updated_at ────────────────────

CREATE OR REPLACE FUNCTION public.touch_report_definitions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_report_definitions_touch_updated_at ON public.report_definitions;
CREATE TRIGGER trg_report_definitions_touch_updated_at
  BEFORE UPDATE ON public.report_definitions
  FOR EACH ROW EXECUTE FUNCTION public.touch_report_definitions_updated_at();

-- ── RLS (зеркало item_lists) ─────────────────────────────

ALTER TABLE public.report_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_definitions_select ON public.report_definitions;
CREATE POLICY report_definitions_select ON public.report_definitions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.workspace_id = report_definitions.workspace_id
      AND p.user_id = (SELECT auth.uid())
      AND p.is_deleted = false
  )
  AND (owner_user_id IS NULL OR owner_user_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS report_definitions_insert ON public.report_definitions;
CREATE POLICY report_definitions_insert ON public.report_definitions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.workspace_id = report_definitions.workspace_id
      AND p.user_id = (SELECT auth.uid())
      AND p.is_deleted = false
  )
  AND created_by = (SELECT auth.uid())
  AND (
    owner_user_id = (SELECT auth.uid())
    OR
    (owner_user_id IS NULL AND (
      public.is_workspace_owner((SELECT auth.uid()), report_definitions.workspace_id)
      OR public.has_workspace_permission((SELECT auth.uid()), report_definitions.workspace_id, 'manage_workspace_settings')
    ))
  )
);

DROP POLICY IF EXISTS report_definitions_update ON public.report_definitions;
CREATE POLICY report_definitions_update ON public.report_definitions
FOR UPDATE
USING (
  (owner_user_id = (SELECT auth.uid()))
  OR (owner_user_id IS NULL AND (
    public.is_workspace_owner((SELECT auth.uid()), report_definitions.workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), report_definitions.workspace_id, 'manage_workspace_settings')
  ))
)
WITH CHECK (
  (owner_user_id = (SELECT auth.uid()))
  OR (owner_user_id IS NULL AND (
    public.is_workspace_owner((SELECT auth.uid()), report_definitions.workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), report_definitions.workspace_id, 'manage_workspace_settings')
  ))
);

DROP POLICY IF EXISTS report_definitions_delete ON public.report_definitions;
CREATE POLICY report_definitions_delete ON public.report_definitions
FOR DELETE
USING (
  (owner_user_id = (SELECT auth.uid()))
  OR (owner_user_id IS NULL AND (
    public.is_workspace_owner((SELECT auth.uid()), report_definitions.workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), report_definitions.workspace_id, 'manage_workspace_settings')
  ))
);
