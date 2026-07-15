-- Третий режим исполнителей в привязке: помимо «наследовать» и «заменить»
-- появляется «дополнить» (шаблонные + указанные). Нужен каналам: у лид-бота
-- исполнители шаблона остаются, а к ним добавляются свои.
--
-- Проектный редактор продолжает писать override_assignees (true/false) и о новом
-- режиме не знает — его строки остаются в 'inherit', поведение не меняется
-- (сверено: 38 привязок → 0 расхождений).
ALTER TABLE public.project_template_thread_templates
  ADD COLUMN IF NOT EXISTS assignees_mode text NOT NULL DEFAULT 'inherit';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pttt_assignees_mode') THEN
    ALTER TABLE public.project_template_thread_templates
      ADD CONSTRAINT chk_pttt_assignees_mode
      CHECK (assignees_mode IN ('inherit', 'override', 'extend'));
  END IF;
END $$;

COMMENT ON COLUMN public.project_template_thread_templates.assignees_mode IS
  'inherit = исполнители базового шаблона; override = только из привязки (эквивалент override_assignees=true); extend = базовые + из привязки (каналы).';

-- Полное тело resolve_thread_template_binding с учётом режима — см. прод/
-- миграцию 20260715120000 (здесь заменяется CASE по исполнителям на 3 ветки).
CREATE OR REPLACE FUNCTION public.resolve_thread_template_binding(p_binding_id uuid)
RETURNS TABLE (
  thread_template_id uuid, thread_type text, is_email boolean, icon text,
  accent_color text, status_id uuid, deadline_days integer, access_type text,
  access_roles text[], initial_message_html text, assignee_ids uuid[]
)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT
    tt.id, tt.thread_type, tt.is_email, tt.icon, tt.accent_color,
    b.default_status_id,
    COALESCE(b.deadline_days, tt.deadline_days),
    COALESCE(b.access_type, tt.access_type),
    CASE WHEN b.access_type IS NOT NULL THEN COALESCE(b.access_roles, '{}'::text[])
         ELSE tt.access_roles END,
    COALESCE(b.initial_message_html, tt.initial_message_html),
    CASE
      WHEN b.assignees_mode = 'extend' THEN (
        SELECT COALESCE(array_agg(DISTINCT pid), '{}')
        FROM (
          SELECT ta.participant_id AS pid FROM public.thread_template_assignees ta
          WHERE ta.template_id = tt.id
          UNION
          SELECT a.participant_id FROM public.project_template_thread_assignees a
          WHERE a.binding_id = b.id
        ) u
      )
      WHEN b.override_assignees OR b.assignees_mode = 'override' THEN (
        SELECT COALESCE(array_agg(a.participant_id), '{}')
        FROM public.project_template_thread_assignees a WHERE a.binding_id = b.id
      )
      ELSE (
        SELECT COALESCE(array_agg(ta.participant_id), '{}')
        FROM public.thread_template_assignees ta WHERE ta.template_id = tt.id
      )
    END
  FROM public.project_template_thread_templates b
  JOIN public.thread_templates tt ON tt.id = b.thread_template_id
  WHERE b.id = p_binding_id;
$$;
