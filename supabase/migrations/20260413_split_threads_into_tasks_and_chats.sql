-- Разделение модуля 'threads' на 'tasks' + 'chats'.
-- Ранее (20260411) три модуля (tasks, messenger, internal_messenger) были
-- объединены в один 'threads'. Теперь разбиваем обратно на два — чтобы
-- можно было давать роли доступ к чатам без задач и наоборот.

BEGIN;

-- 1. project_templates.enabled_modules:
--    Заменяем 'threads' на 'tasks' + 'chats'.
UPDATE public.project_templates
SET enabled_modules = (
  SELECT array_agg(DISTINCT m ORDER BY m)
  FROM (
    -- Все существующие модули, кроме 'threads' → заменяем на 'tasks'
    SELECT CASE WHEN x = 'threads' THEN 'tasks' ELSE x END AS m
    FROM unnest(enabled_modules) AS x
    UNION
    -- Если был 'threads' — добавляем также 'chats'
    SELECT 'chats' AS m
    WHERE 'threads' = ANY(enabled_modules)
  ) sub
)
WHERE 'threads' = ANY(enabled_modules);

-- 2. project_roles.module_access:
--    Заменяем "threads": bool на "tasks": bool + "chats": bool.
UPDATE public.project_roles
SET module_access = (
  module_access - 'threads'
) || jsonb_build_object(
  'tasks', COALESCE((module_access->>'threads')::boolean, false),
  'chats', COALESCE((module_access->>'threads')::boolean, false)
)
WHERE module_access ? 'threads';

-- 3. project_roles.module_access:
--    Переносим card_view → documents.
--    Вкладка «Документы» раньше гейтилась правом card_view (историческое название).
--    Теперь используем documents. Переносим значение и удаляем card_view.
UPDATE public.project_roles
SET module_access = (
  module_access - 'card_view'
) || jsonb_build_object(
  'documents', COALESCE((module_access->>'card_view')::boolean, false)
)
WHERE module_access ? 'card_view';

COMMIT;
