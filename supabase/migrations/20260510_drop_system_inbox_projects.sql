-- Этап 5 рефакторинга «Личные диалоги без проекта».
-- Удаляем фейковые системные проекты и связанные флаги. Все треды и сообщения
-- мигрированы на project_id = NULL в предыдущей миграции.

DELETE FROM public.project_participants
WHERE project_id IN (
  SELECT id FROM public.projects
  WHERE is_system_business_inbox OR is_system_wazzup_inbox OR is_system_email_inbox
);

DELETE FROM public.projects
WHERE is_system_business_inbox OR is_system_wazzup_inbox OR is_system_email_inbox;

DROP FUNCTION IF EXISTS public.ensure_personal_email_inbox_project(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.ensure_personal_business_inbox_project(uuid, uuid);
DROP FUNCTION IF EXISTS public.ensure_personal_wazzup_inbox_project(uuid, uuid);

ALTER TABLE public.projects DROP COLUMN IF EXISTS is_system_business_inbox;
ALTER TABLE public.projects DROP COLUMN IF EXISTS is_system_wazzup_inbox;
ALTER TABLE public.projects DROP COLUMN IF EXISTS is_system_email_inbox;
ALTER TABLE public.projects DROP COLUMN IF EXISTS system_inbox_user_id;
ALTER TABLE public.projects DROP COLUMN IF EXISTS system_inbox_kind;
