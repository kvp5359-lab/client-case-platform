-- Единый справочник project-статусов + junction-таблица.
-- Раньше project-статус принадлежал одному шаблону через
-- statuses.project_template_id. Теперь статусы существуют в общем пуле,
-- а связь м-к-м описывается project_template_statuses (template_id,
-- status_id, order_index, is_default, is_final). Флаги default/final —
-- per-template, т.к. один и тот же «На согласовании» в разных шаблонах
-- может играть разные роли.

CREATE TABLE IF NOT EXISTS public.project_template_statuses (
  template_id   uuid NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  status_id     uuid NOT NULL REFERENCES public.statuses(id)         ON DELETE CASCADE,
  order_index   integer NOT NULL DEFAULT 0,
  is_default    boolean NOT NULL DEFAULT false,
  is_final      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, status_id)
);

CREATE INDEX IF NOT EXISTS idx_pts_template ON public.project_template_statuses(template_id);
CREATE INDEX IF NOT EXISTS idx_pts_status   ON public.project_template_statuses(status_id);

-- Миграция данных
INSERT INTO public.project_template_statuses
  (template_id, status_id, order_index, is_default, is_final)
SELECT
  s.project_template_id, s.id, s.order_index, s.is_default, s.is_final
FROM public.statuses s
WHERE s.entity_type='project' AND s.project_template_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE public.project_template_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pts_select ON public.project_template_statuses;
CREATE POLICY pts_select ON public.project_template_statuses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.project_templates pt
      JOIN public.participants p ON p.workspace_id = pt.workspace_id
      WHERE pt.id = template_id
        AND p.user_id = (SELECT auth.uid())
        AND p.is_deleted = false
    )
  );

DROP POLICY IF EXISTS pts_write ON public.project_template_statuses;
CREATE POLICY pts_write ON public.project_template_statuses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.project_templates pt
      WHERE pt.id = template_id
        AND public.has_workspace_permission(
          (SELECT auth.uid()), pt.workspace_id, 'manage_statuses')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_templates pt
      WHERE pt.id = template_id
        AND public.has_workspace_permission(
          (SELECT auth.uid()), pt.workspace_id, 'manage_statuses')
    )
  );

-- Снимаем CHECK и дропаем устаревшую колонку.
ALTER TABLE public.statuses
  DROP CONSTRAINT IF EXISTS project_status_must_have_template;
ALTER TABLE public.statuses
  DROP COLUMN IF EXISTS project_template_id;

COMMENT ON TABLE public.project_template_statuses IS
  'M-to-M между project_templates и statuses (entity_type=project). Хранит per-template флаги order_index, is_default, is_final.';
