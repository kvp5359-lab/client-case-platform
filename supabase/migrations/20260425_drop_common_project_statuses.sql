-- Упрощение модели: project-статусы существуют ТОЛЬКО на уровне шаблона
-- проекта. Концепция «общих воркспейсных» project-статусов убрана —
-- по факту они никем не использовались.
--
-- Что делаем:
-- 1. Очищаем projects.status_id (никто не успел осмысленно их выставить).
-- 2. Удаляем все project-статусы с project_template_id IS NULL.
-- 3. Добавляем CHECK constraint: project-статус обязан иметь project_template_id.
--    Для других entity_type (task/document/document_kit/form/knowledge_article)
--    project_template_id остаётся NULL — они работают на уровне воркспейса.

UPDATE public.projects SET status_id = NULL WHERE status_id IS NOT NULL;

DELETE FROM public.statuses
  WHERE entity_type='project' AND project_template_id IS NULL;

ALTER TABLE public.statuses
  DROP CONSTRAINT IF EXISTS project_status_must_have_template;
ALTER TABLE public.statuses
  ADD CONSTRAINT project_status_must_have_template
  CHECK (entity_type <> 'project' OR project_template_id IS NOT NULL);
