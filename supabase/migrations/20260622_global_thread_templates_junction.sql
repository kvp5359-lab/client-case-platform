-- ============================================================================
-- Глобальные шаблоны тредов + junction (модель «как статусы»)
--
-- Шаблон треда становится сущностью УРОВНЯ ВОРКСПЕЙСА (тело: имя, тип, цвет,
-- иконка, доступы, дедлайн, текст). Привязка к шаблону проекта и пер-проектные
-- настройки (порядок, статус задачи по умолчанию, автопереход статуса проекта)
-- переезжают в junction project_template_thread_templates.
--
-- Эталон — project_template_statuses (statuses ↔ project_templates м-к-м).
--
-- Этот шаг ADDITIVE:
--   1. CREATE junction (+RLS, индексы).
--   2. ADD project_threads.on_complete_set_project_status_id — СНАПШОТ правила
--      автоперехода в самой строке треда (отвязывает рантайм проектов от
--      шаблонов). Бэкафилл из текущих thread_templates по source_template_id.
--   3. Переучить триггер auto_advance_project_status читать снапшот-колонку,
--      а не джойнить thread_templates.
--
-- НИЧЕГО не удаляется: ни thread_templates.owner_project_template_id, ни
-- пер-проектные колонки thread_templates, ни существующие треды. Дедуп данных
-- и заполнение junction — отдельной миграцией 20260622_*_dedup. Чистка старых
-- колонок — отдельной миграцией позже, после проверки.
-- ============================================================================

BEGIN;

-- ── 1. Junction: шаблон проекта ↔ шаблон треда ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_template_thread_templates (
  template_id        uuid NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  thread_template_id uuid NOT NULL REFERENCES public.thread_templates(id)  ON DELETE CASCADE,
  sort_order         integer NOT NULL DEFAULT 0,
  -- Пер-проектный статус задачи по умолчанию (статусы привязаны к шаблону проекта).
  default_status_id  uuid REFERENCES public.statuses(id) ON DELETE SET NULL,
  -- Пер-проектное правило автоперехода статуса проекта при завершении треда.
  on_complete_set_project_status_id uuid REFERENCES public.statuses(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, thread_template_id)
);

COMMENT ON TABLE public.project_template_thread_templates IS
  'M-N: project_templates ↔ thread_templates. Один глобальный шаблон треда '
  'привязывается к нескольким шаблонам проектов с пер-проектными настройками '
  '(порядок, статус задачи по умолчанию, автопереход статуса проекта). '
  'Зеркало паттерна project_template_statuses.';

CREATE INDEX IF NOT EXISTS idx_pttt_template
  ON public.project_template_thread_templates(template_id);
CREATE INDEX IF NOT EXISTS idx_pttt_thread_template
  ON public.project_template_thread_templates(thread_template_id);

ALTER TABLE public.project_template_thread_templates ENABLE ROW LEVEL SECURITY;

-- SELECT — любому участнику воркспейса этого шаблона проекта (как pts_select).
DROP POLICY IF EXISTS pttt_select ON public.project_template_thread_templates;
CREATE POLICY pttt_select ON public.project_template_thread_templates
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.project_templates pt
      JOIN public.participants p ON p.workspace_id = pt.workspace_id
    WHERE pt.id = project_template_thread_templates.template_id
      AND p.user_id = (SELECT auth.uid())
      AND p.is_deleted = false
  ));

-- WRITE — владелец/администратор воркспейса (как thread_templates_*).
DROP POLICY IF EXISTS pttt_write ON public.project_template_thread_templates;
CREATE POLICY pttt_write ON public.project_template_thread_templates
  FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.project_templates pt
      JOIN public.participants p ON p.workspace_id = pt.workspace_id
    WHERE pt.id = project_template_thread_templates.template_id
      AND p.user_id = (SELECT auth.uid())
      AND p.workspace_roles && ARRAY['Владелец','Администратор']
      AND p.is_deleted = false
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.project_templates pt
      JOIN public.participants p ON p.workspace_id = pt.workspace_id
    WHERE pt.id = project_template_thread_templates.template_id
      AND p.user_id = (SELECT auth.uid())
      AND p.workspace_roles && ARRAY['Владелец','Администратор']
      AND p.is_deleted = false
  ));

-- ── 2. Снапшот правила автоперехода в самой строке треда ─────────────────────

ALTER TABLE public.project_threads
  ADD COLUMN IF NOT EXISTS on_complete_set_project_status_id uuid
    REFERENCES public.statuses(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.project_threads.on_complete_set_project_status_id IS
  'Снапшот правила автоперехода статуса проекта, скопированный при создании '
  'треда из шаблона. Когда тред переходит в финальный статус — projects.status_id '
  'устанавливается в это значение. Отвязывает рантайм проектов от шаблонов.';

-- Бэкафилл из текущих thread_templates по source_template_id (только пустые).
UPDATE public.project_threads pth
SET on_complete_set_project_status_id = tt.on_complete_set_project_status_id
FROM public.thread_templates tt
WHERE pth.source_template_id = tt.id
  AND pth.on_complete_set_project_status_id IS NULL
  AND tt.on_complete_set_project_status_id IS NOT NULL;

-- ── 3. Триггер автоперехода читает снапшот, а не джойнит thread_templates ────

CREATE OR REPLACE FUNCTION public.auto_advance_project_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_final boolean;
BEGIN
  IF NEW.status_id IS NULL OR NEW.status_id IS NOT DISTINCT FROM OLD.status_id THEN
    RETURN NEW;
  END IF;
  IF NEW.project_id IS NULL OR NEW.on_complete_set_project_status_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.is_final INTO v_is_final
  FROM public.statuses s WHERE s.id = NEW.status_id;
  IF NOT COALESCE(v_is_final, false) THEN
    RETURN NEW;
  END IF;

  -- Last write wins: не сверяемся с текущим status_id проекта
  UPDATE public.projects
  SET status_id = NEW.on_complete_set_project_status_id, updated_at = now()
  WHERE id = NEW.project_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_advance_project_status() IS
  'Когда тред (project_threads) переходит в финальный статус, переводит '
  'projects.status_id в project_threads.on_complete_set_project_status_id '
  '(снапшот из шаблона). Last write wins.';

COMMIT;
