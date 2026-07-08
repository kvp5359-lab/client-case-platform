-- Пер-проектные переопределения полей шаблона треда.
-- Общий шаблон (thread_templates) = дефолт-«рыба»; связка
-- project_template_thread_templates может переопределить для конкретного
-- типа проекта дедлайн / стартовое сообщение / доступ, а исполнителей —
-- через отдельную таблицу project_template_thread_assignees.
-- NULL в скалярных override-колонках = наследовать из общего шаблона.
-- override_assignees=false = наследовать thread_template_assignees;
-- true = использовать project_template_thread_assignees (даже пустой набор).

ALTER TABLE public.project_template_thread_templates
  ADD COLUMN IF NOT EXISTS deadline_days integer,
  ADD COLUMN IF NOT EXISTS initial_message_html text,
  ADD COLUMN IF NOT EXISTS access_type text,
  ADD COLUMN IF NOT EXISTS access_roles text[],
  ADD COLUMN IF NOT EXISTS override_assignees boolean NOT NULL DEFAULT false;

-- Переопределённые исполнители: пер-(тип проекта × шаблон треда).
CREATE TABLE IF NOT EXISTS public.project_template_thread_assignees (
  template_id uuid NOT NULL,
  thread_template_id uuid NOT NULL,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  PRIMARY KEY (template_id, thread_template_id, participant_id),
  FOREIGN KEY (template_id, thread_template_id)
    REFERENCES public.project_template_thread_templates(template_id, thread_template_id)
    ON DELETE CASCADE
);

ALTER TABLE public.project_template_thread_assignees ENABLE ROW LEVEL SECURITY;

-- SELECT — любой активный участник воркспейса (зеркало pttt_select).
CREATE POLICY ptta_select ON public.project_template_thread_assignees
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1
    FROM public.project_templates pt
    JOIN public.participants p ON p.workspace_id = pt.workspace_id
    WHERE pt.id = project_template_thread_assignees.template_id
      AND p.user_id = (SELECT auth.uid())
      AND p.is_deleted = false
  ));

-- Запись — Владелец/Администратор воркспейса (зеркало pttt_write).
CREATE POLICY ptta_write ON public.project_template_thread_assignees
  FOR ALL TO public
  USING (EXISTS (
    SELECT 1
    FROM public.project_templates pt
    JOIN public.participants p ON p.workspace_id = pt.workspace_id
    WHERE pt.id = project_template_thread_assignees.template_id
      AND p.user_id = (SELECT auth.uid())
      AND p.workspace_roles && ARRAY['Владелец'::text, 'Администратор'::text]
      AND p.is_deleted = false
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.project_templates pt
    JOIN public.participants p ON p.workspace_id = pt.workspace_id
    WHERE pt.id = project_template_thread_assignees.template_id
      AND p.user_id = (SELECT auth.uid())
      AND p.workspace_roles && ARRAY['Владелец'::text, 'Администратор'::text]
      AND p.is_deleted = false
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_template_thread_assignees TO authenticated;
GRANT ALL ON public.project_template_thread_assignees TO service_role;
