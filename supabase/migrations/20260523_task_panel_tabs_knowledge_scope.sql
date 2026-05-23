-- Третий scope боковой панели вкладок: knowledge — глобальный per-user-per-workspace
-- пул для статей базы знаний, открываемых с общей KB-страницы (где нет project/contact
-- контекста). Колонка workspace_id, partial-unique-индекс и расширенный CHECK.

ALTER TABLE public.task_panel_tabs
  ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- Уникальность knowledge-scope: одна строка на (user, workspace) при NULL'ах в
-- остальных полях. Не пересекается с существующими индексами task_panel_tabs_uq_project
-- и task_panel_tabs_uq_contact (там project_id или contact_participant_id NOT NULL).
CREATE UNIQUE INDEX task_panel_tabs_uq_knowledge
  ON public.task_panel_tabs(user_id, workspace_id)
  WHERE workspace_id IS NOT NULL
    AND project_id IS NULL
    AND contact_participant_id IS NULL;

-- Расширяем CHECK: ровно один из трёх scope'ов должен быть задан.
ALTER TABLE public.task_panel_tabs DROP CONSTRAINT task_panel_tabs_scope_check;

ALTER TABLE public.task_panel_tabs ADD CONSTRAINT task_panel_tabs_scope_check
  CHECK (
    (project_id IS NOT NULL AND contact_participant_id IS NULL AND workspace_id IS NULL)
    OR (project_id IS NULL AND contact_participant_id IS NOT NULL AND workspace_id IS NULL)
    OR (project_id IS NULL AND contact_participant_id IS NULL AND workspace_id IS NOT NULL)
  );
