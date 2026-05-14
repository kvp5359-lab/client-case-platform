-- Дефолтные вкладки боковой панели для шаблона проекта.
--
-- Хранит, какие системные вкладки (tasks/documents/history/forms/materials/assistant)
-- и какие шаблоны тредов (по thread_template_id) должны быть закреплены в
-- боковой панели у нового проекта данного шаблона.
--
-- NULL — старое поведение (хардкод: tasks + history).
-- []   — ничего не закреплять.
-- [...] — список элементов в порядке закрепления.
--
-- Формат элементов JSONB:
--   { "type": "system", "key": "tasks" }
--   { "type": "thread_template", "id": "<uuid>" }
--
-- Применяется только к НОВЫМ проектам — пользователи, у которых уже есть запись
-- в task_panel_tabs для этого проекта, не затрагиваются.

ALTER TABLE public.project_templates
  ADD COLUMN IF NOT EXISTS default_panel_tabs jsonb;
