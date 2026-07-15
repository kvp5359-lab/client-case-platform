-- Фаза 2 обобщения: ЕДИНАЯ функция применения «базовый шаблон + переопределения
-- привязки» → эффективные поля создаваемого треда. Владелец-агностична: работает
-- и для проект-шаблона, и для канала (интеграции) — важен только binding_id.
--
-- Folding зеркалит фронтовую логику (seedProjectContent / useThreadTemplateForm):
-- скалярные переопределения = override ?? база; исполнители = флаг override_assignees.
-- Иконку/цвет junction не переопределяет — они всегда из базового шаблона.
--
-- SECURITY INVOKER: RLS привязки применяется к вызывающему (service_role в edge
-- её обходит штатно, фронт видит только свои).

CREATE OR REPLACE FUNCTION public.resolve_thread_template_binding(p_binding_id uuid)
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
  SELECT
    tt.id,
    tt.thread_type,
    tt.is_email,
    tt.icon,
    tt.accent_color,
    b.default_status_id,
    COALESCE(b.deadline_days, tt.deadline_days),
    COALESCE(b.access_type, tt.access_type),
    -- Роли следуют за access_type (зеркало фронта): задано переопределение
    -- access_type → берём его роли (пусто = «никаких»), иначе базовые.
    CASE
      WHEN b.access_type IS NOT NULL THEN COALESCE(b.access_roles, '{}'::text[])
      ELSE tt.access_roles
    END,
    COALESCE(b.initial_message_html, tt.initial_message_html),
    CASE
      WHEN b.override_assignees THEN (
        SELECT COALESCE(array_agg(a.participant_id), '{}')
        FROM public.project_template_thread_assignees a
        WHERE a.binding_id = b.id
      )
      ELSE (
        SELECT COALESCE(array_agg(ta.participant_id), '{}')
        FROM public.thread_template_assignees ta
        WHERE ta.template_id = tt.id
      )
    END
  FROM public.project_template_thread_templates b
  JOIN public.thread_templates tt ON tt.id = b.thread_template_id
  WHERE b.id = p_binding_id;
$$;

REVOKE ALL ON FUNCTION public.resolve_thread_template_binding(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_thread_template_binding(uuid) TO authenticated, service_role;
