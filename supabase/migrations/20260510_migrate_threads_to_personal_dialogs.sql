-- Этап 4b рефакторинга «Личные диалоги без проекта».
-- Переносим существующие 42 треда из фейковых системных проектов в project_id = NULL.
-- owner_user_id у них уже выставлен в Этапе 1.

UPDATE public.project_threads pt
SET project_id = NULL
FROM public.projects p
WHERE pt.project_id = p.id
  AND (p.is_system_business_inbox OR p.is_system_wazzup_inbox OR p.is_system_email_inbox);

UPDATE public.project_messages pm
SET project_id = NULL
FROM public.project_threads pt
WHERE pm.thread_id = pt.id
  AND pt.project_id IS NULL
  AND pt.owner_user_id IS NOT NULL;
