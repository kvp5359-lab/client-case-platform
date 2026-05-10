-- Этап 7 «Личных диалогов»: scope боковой панели вкладок может быть либо
-- проектом, либо контактом. Для тредов без project_id вкладки группируются
-- по contact_participant_id.

ALTER TABLE public.task_panel_tabs
  ADD COLUMN contact_participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE;

ALTER TABLE public.task_panel_tabs DROP CONSTRAINT task_panel_tabs_pkey;

ALTER TABLE public.task_panel_tabs ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE public.task_panel_tabs ADD COLUMN id UUID DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.task_panel_tabs ADD PRIMARY KEY (id);

CREATE UNIQUE INDEX task_panel_tabs_uq_project
  ON public.task_panel_tabs(user_id, project_id)
  WHERE project_id IS NOT NULL AND contact_participant_id IS NULL;

CREATE UNIQUE INDEX task_panel_tabs_uq_contact
  ON public.task_panel_tabs(user_id, contact_participant_id)
  WHERE contact_participant_id IS NOT NULL AND project_id IS NULL;

ALTER TABLE public.task_panel_tabs ADD CONSTRAINT task_panel_tabs_scope_check
  CHECK (
    (project_id IS NOT NULL AND contact_participant_id IS NULL)
    OR (project_id IS NULL AND contact_participant_id IS NOT NULL)
  );
