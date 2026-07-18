-- Карточка контакта: все треды, где контакт участвует (не только прямой чат).
--
-- Объединяет сигналы участия для одного контакта P:
--   1. собеседник треда           — project_threads.contact_participant_id = P
--   2. личный TG-диалог по tg-id   — mtproto_client_tg_user_id / business_client_tg_user_id = P.telegram_user_id
--      (личные диалоги не всегда несут contact_participant_id — матчим по числовому tg-id)
--   3. треды проектов клиента      — project_id ∈ проекты, где P участник (project_participants)
--                                    ИЛИ клиент проекта (projects.contact_participant_id = P)
--
-- project_name_prefix — серый префикс проекта из шаблона (как в сайдбаре):
-- default_name_prefix под гейтом show_name_prefix_in_sidebar.
--
-- SECURITY INVOKER → RLS на project_threads/projects режет выдачу под смотрящего:
-- рядовой сотрудник увидит только те треды контакта, к которым сам имеет доступ.
DROP FUNCTION IF EXISTS public.get_contact_participation_threads(uuid);

CREATE FUNCTION public.get_contact_participation_threads(p_participant_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  icon text,
  accent_color text,
  channel text,
  project_id uuid,
  project_name text,
  project_name_prefix text,
  last_message_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH me AS (
    SELECT pt.id, pt.telegram_user_id
    FROM participants pt
    WHERE pt.id = p_participant_id
  ),
  my_projects AS (
    SELECT pp.project_id AS project_id
    FROM project_participants pp
    WHERE pp.participant_id = p_participant_id
    UNION
    SELECT pr.id AS project_id
    FROM projects pr
    WHERE pr.contact_participant_id = p_participant_id
  )
  SELECT DISTINCT
    t.id,
    t.name,
    t.type,
    t.icon,
    t.accent_color,
    CASE
      WHEN t.business_connection_id IS NOT NULL THEN 'telegram_business'
      WHEN t.mtproto_session_user_id IS NOT NULL THEN 'telegram_mtproto'
      WHEN t.wazzup_chat_id IS NOT NULL THEN 'wazzup'
      WHEN t.email_subject_root IS NOT NULL OR t.type = 'email' THEN 'email'
      ELSE 'other'
    END AS channel,
    t.project_id,
    pr.name AS project_name,
    CASE
      WHEN tmpl.show_name_prefix_in_sidebar
      THEN NULLIF(btrim(tmpl.default_name_prefix), '')
    END AS project_name_prefix,
    t.updated_at AS last_message_at
  FROM project_threads t
  CROSS JOIN me
  LEFT JOIN projects pr ON pr.id = t.project_id AND pr.is_deleted = false
  LEFT JOIN project_templates tmpl ON tmpl.id = pr.template_id
  WHERE t.is_deleted = false
    AND (
      t.contact_participant_id = p_participant_id
      OR (me.telegram_user_id IS NOT NULL AND t.mtproto_client_tg_user_id = me.telegram_user_id)
      OR (me.telegram_user_id IS NOT NULL AND t.business_client_tg_user_id = me.telegram_user_id)
      OR t.project_id IN (SELECT project_id FROM my_projects)
    )
  ORDER BY t.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_contact_participation_threads(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_contact_participation_threads(uuid) TO authenticated, service_role;
