-- Этап 6 «Личных диалогов»: связь треда с контактом из справочника участников.
-- contact_participant_id указывает на participants.id — это «с кем мы переписываемся».
-- Один participant может объединять несколько каналов (email + TG + WhatsApp).

ALTER TABLE public.project_threads
  ADD COLUMN contact_participant_id UUID REFERENCES public.participants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_threads_contact_participant_id
  ON public.project_threads(contact_participant_id)
  WHERE contact_participant_id IS NOT NULL;

COMMENT ON COLUMN public.project_threads.contact_participant_id IS
  'Контакт собеседника (participants.id). Используется для личных диалогов: группировка тредов одного клиента в карточку контакта. Заполняется webhook''ами при создании треда (поиск по email/phone/telegram_user_id) и при ручном слиянии контактов.';

-- ===========================================================================
-- Backfill существующих тредов без проекта.
-- ===========================================================================

UPDATE public.project_threads pt
SET contact_participant_id = p.id
FROM public.participants p
WHERE pt.contact_participant_id IS NULL
  AND pt.is_deleted = false
  AND pt.project_id IS NULL
  AND p.workspace_id = pt.workspace_id
  AND p.is_deleted = false
  AND p.telegram_user_id IS NOT NULL
  AND p.telegram_user_id = COALESCE(pt.business_client_tg_user_id, pt.mtproto_client_tg_user_id);

UPDATE public.project_threads pt
SET contact_participant_id = p.id
FROM public.participants p
WHERE pt.contact_participant_id IS NULL
  AND pt.is_deleted = false
  AND pt.project_id IS NULL
  AND pt.wazzup_chat_id IS NOT NULL
  AND p.workspace_id = pt.workspace_id
  AND p.is_deleted = false
  AND p.phone IS NOT NULL
  AND regexp_replace(p.phone, '\D', '', 'g') = regexp_replace(pt.wazzup_chat_id, '\D', '', 'g');

UPDATE public.project_threads pt
SET contact_participant_id = p.id
FROM public.participants p
WHERE pt.contact_participant_id IS NULL
  AND pt.is_deleted = false
  AND pt.project_id IS NULL
  AND pt.email_last_external_address IS NOT NULL
  AND p.workspace_id = pt.workspace_id
  AND p.is_deleted = false
  AND lower(p.email) = lower(pt.email_last_external_address);

-- Auto-create participants для оставшихся тредов без contact.
WITH new_contacts AS (
  INSERT INTO public.participants (
    workspace_id, name, email, telegram_user_id, can_login, workspace_roles
  )
  SELECT DISTINCT ON (pt.workspace_id, COALESCE(pt.business_client_tg_user_id, pt.mtproto_client_tg_user_id))
    pt.workspace_id, pt.name,
    'tg-' || COALESCE(pt.business_client_tg_user_id, pt.mtproto_client_tg_user_id) || '@no-email.local',
    COALESCE(pt.business_client_tg_user_id, pt.mtproto_client_tg_user_id),
    false, ARRAY['Клиент']
  FROM public.project_threads pt
  WHERE pt.contact_participant_id IS NULL
    AND pt.is_deleted = false
    AND pt.project_id IS NULL
    AND (pt.business_client_tg_user_id IS NOT NULL OR pt.mtproto_client_tg_user_id IS NOT NULL)
  RETURNING id, workspace_id, telegram_user_id
)
UPDATE public.project_threads pt
SET contact_participant_id = nc.id
FROM new_contacts nc
WHERE pt.workspace_id = nc.workspace_id
  AND COALESCE(pt.business_client_tg_user_id, pt.mtproto_client_tg_user_id) = nc.telegram_user_id
  AND pt.contact_participant_id IS NULL;

WITH new_contacts AS (
  INSERT INTO public.participants (
    workspace_id, name, email, phone, can_login, workspace_roles
  )
  SELECT DISTINCT ON (pt.workspace_id, regexp_replace(pt.wazzup_chat_id, '\D', '', 'g'))
    pt.workspace_id, pt.name,
    'phone-' || regexp_replace(pt.wazzup_chat_id, '\D', '', 'g') || '@no-email.local',
    pt.wazzup_chat_id, false, ARRAY['Клиент']
  FROM public.project_threads pt
  WHERE pt.contact_participant_id IS NULL
    AND pt.is_deleted = false
    AND pt.project_id IS NULL
    AND pt.wazzup_chat_id IS NOT NULL
  RETURNING id, workspace_id, phone
)
UPDATE public.project_threads pt
SET contact_participant_id = nc.id
FROM new_contacts nc
WHERE pt.workspace_id = nc.workspace_id
  AND regexp_replace(pt.wazzup_chat_id, '\D', '', 'g') = regexp_replace(nc.phone, '\D', '', 'g')
  AND pt.contact_participant_id IS NULL;

WITH new_contacts AS (
  INSERT INTO public.participants (
    workspace_id, name, email, can_login, workspace_roles
  )
  SELECT DISTINCT ON (pt.workspace_id, lower(pt.email_last_external_address))
    pt.workspace_id, pt.name,
    pt.email_last_external_address, false, ARRAY['Клиент']
  FROM public.project_threads pt
  WHERE pt.contact_participant_id IS NULL
    AND pt.is_deleted = false
    AND pt.project_id IS NULL
    AND pt.email_last_external_address IS NOT NULL
  RETURNING id, workspace_id, email
)
UPDATE public.project_threads pt
SET contact_participant_id = nc.id
FROM new_contacts nc
WHERE pt.workspace_id = nc.workspace_id
  AND lower(pt.email_last_external_address) = lower(nc.email)
  AND pt.contact_participant_id IS NULL;
