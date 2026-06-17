-- Вкладка «Настройки» (карточка проекта) для проектной роли «Исполнитель».
-- Видимость вкладки = module_access.settings у роли пользователя. У исполнителя
-- флаг был выключен. Включаем: (1) в дефолте роли для новых воркспейсов,
-- (2) бэкфилл существующих ролей «Исполнитель».
-- Редактирование внутри вкладки остаётся по отдельным permissions.settings.

-- 1. Дефолт для новых воркспейсов
CREATE OR REPLACE FUNCTION public.get_project_executor_module_access()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select '{
    "settings": true, "forms": true, "documents": true, "threads": true,
    "history": true, "card_view": true, "knowledge_base": true,
    "ai_document_check": true, "ai_form_autofill": true, "ai_knowledge_all": true,
    "ai_knowledge_project": true, "ai_project_assistant": true, "comments": true,
    "digest": true, "project_context": true, "plan": true
  }'::jsonb;
$function$;

-- 2. Бэкфилл существующих ролей «Исполнитель»
UPDATE project_roles
SET module_access = jsonb_set(coalesce(module_access, '{}'::jsonb), '{settings}', 'true'::jsonb)
WHERE name = 'Исполнитель'
  AND module_access->>'settings' IS DISTINCT FROM 'true';
