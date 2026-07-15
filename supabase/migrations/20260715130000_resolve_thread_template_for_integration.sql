-- Обёртка для каналов: эффективные поля шаблона с учётом переопределений канала.
-- Есть привязка (integration_id + thread_template_id) → общая resolve_thread_template_binding;
-- привязки нет (шаблон выбран, но не настраивался) → базовый шаблон как есть.
-- Убирает дублирование folding-логики в edge (приём делает ОДИН вызов).

CREATE OR REPLACE FUNCTION public.resolve_thread_template_for_integration(
  p_integration_id uuid,
  p_thread_template_id uuid
)
RETURNS TABLE (
  thread_template_id uuid,
  thread_type text,
  is_email boolean,
  icon text,
  accent_color text,
  status_id uuid,
  deadline_days integer,
  access_type text,
  access_roles text[],
  initial_message_html text,
  assignee_ids uuid[]
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT r.* FROM public.resolve_thread_template_binding(
    (SELECT b.id FROM public.project_template_thread_templates b
     WHERE b.integration_id = p_integration_id
       AND b.thread_template_id = p_thread_template_id)
  ) r
  UNION ALL
  SELECT
    tt.id, tt.thread_type, tt.is_email, tt.icon, tt.accent_color,
    tt.default_status_id, tt.deadline_days, tt.access_type, tt.access_roles,
    tt.initial_message_html,
    (SELECT COALESCE(array_agg(ta.participant_id), '{}')
     FROM public.thread_template_assignees ta WHERE ta.template_id = tt.id)
  FROM public.thread_templates tt
  WHERE tt.id = p_thread_template_id
    AND NOT EXISTS (
      SELECT 1 FROM public.project_template_thread_templates b
      WHERE b.integration_id = p_integration_id
        AND b.thread_template_id = p_thread_template_id
    );
$$;

REVOKE ALL ON FUNCTION public.resolve_thread_template_for_integration(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_thread_template_for_integration(uuid, uuid) TO authenticated, service_role;
