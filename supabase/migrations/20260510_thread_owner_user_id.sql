-- Этап 1 рефакторинга «Личные диалоги без проекта».
-- Добавляем владельца треда — используется когда тред живёт без project_id (личный диалог).
ALTER TABLE public.project_threads
  ADD COLUMN owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.project_threads.owner_user_id IS
  'Владелец треда без проекта (личный диалог TG/Wazzup/Email). Резолв доступа: если project_id IS NULL, видит только этот юзер + менеджеры воркспейса. Если project_id NOT NULL, поле игнорируется и доступ резолвится через участников проекта.';

CREATE INDEX IF NOT EXISTS idx_project_threads_owner_user_id
  ON public.project_threads(owner_user_id)
  WHERE owner_user_id IS NOT NULL;

-- Заполняем владельца для тредов, которые сейчас лежат в фейковых системных инбоксах.
UPDATE public.project_threads pt
SET owner_user_id = p.system_inbox_user_id
FROM public.projects p
WHERE pt.project_id = p.id
  AND p.system_inbox_user_id IS NOT NULL
  AND (p.is_system_business_inbox OR p.is_system_wazzup_inbox OR p.is_system_email_inbox);
