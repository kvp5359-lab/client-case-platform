-- Один источник правды об исполнителях привязки: assignees_mode.
--
-- Было два поля: override_assignees (булев, пишет проектный редактор) и
-- assignees_mode (inherit/override/extend, пишет UI канала). Функция применения
-- читала оба → два пути записи конфликтовали: сохранение переопределений канала
-- сбрасывало «дополнительных исполнителей», выставленных в блоке бота.
--
-- Теперь: применение читает ТОЛЬКО assignees_mode, а триггер держит булев в
-- согласии с ним в обе стороны — чтобы прод-фронт (пишущий старое поле)
-- продолжал работать до выката нового кода. Дроп override_assignees — отдельным
-- шагом, когда все читатели переедут.

CREATE OR REPLACE FUNCTION public.pttt_sync_assignees_mode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Пишут булев (старый путь) и не трогают режим → выводим режим из булева.
  IF TG_OP = 'UPDATE'
     AND NEW.override_assignees IS DISTINCT FROM OLD.override_assignees
     AND NEW.assignees_mode IS NOT DISTINCT FROM OLD.assignees_mode THEN
    NEW.assignees_mode := CASE WHEN NEW.override_assignees THEN 'override' ELSE 'inherit' END;
  ELSIF TG_OP = 'INSERT' AND NEW.override_assignees AND NEW.assignees_mode = 'inherit' THEN
    NEW.assignees_mode := 'override';
  END IF;

  -- Режим — источник правды: булев всегда его отражение ('extend' → false).
  NEW.override_assignees := (NEW.assignees_mode = 'override');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pttt_sync_assignees_mode ON public.project_template_thread_templates;
CREATE TRIGGER trg_pttt_sync_assignees_mode
  BEFORE INSERT OR UPDATE ON public.project_template_thread_templates
  FOR EACH ROW EXECUTE FUNCTION public.pttt_sync_assignees_mode();

-- Приводим существующие строки к инварианту (на проде все inherit/false — no-op,
-- но миграция должна быть верна и на любой другой базе).
UPDATE public.project_template_thread_templates
SET assignees_mode = 'override'
WHERE override_assignees AND assignees_mode = 'inherit';

-- Применение: только assignees_mode, без ветки по булеву.
CREATE OR REPLACE FUNCTION public.resolve_thread_template_binding(p_binding_id uuid)
RETURNS TABLE(
  thread_template_id uuid, thread_type text, is_email boolean, icon text,
  accent_color text, status_id uuid, deadline_days integer, access_type text,
  access_roles text[], initial_message_html text, assignee_ids uuid[]
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
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
      -- «Дополнить»: исполнители шаблона + указанные в привязке (без дублей).
      WHEN b.assignees_mode = 'extend' THEN (
        SELECT COALESCE(array_agg(DISTINCT pid), '{}')
        FROM (
          SELECT ta.participant_id AS pid
          FROM public.thread_template_assignees ta WHERE ta.template_id = tt.id
          UNION
          SELECT a.participant_id
          FROM public.project_template_thread_assignees a WHERE a.binding_id = b.id
        ) u
      )
      -- «Заменить»: только из привязки.
      WHEN b.assignees_mode = 'override' THEN (
        SELECT COALESCE(array_agg(a.participant_id), '{}')
        FROM public.project_template_thread_assignees a
        WHERE a.binding_id = b.id
      )
      -- «Наследовать»: исполнители базового шаблона.
      ELSE (
        SELECT COALESCE(array_agg(ta.participant_id), '{}')
        FROM public.thread_template_assignees ta
        WHERE ta.template_id = tt.id
      )
    END
  FROM public.project_template_thread_templates b
  JOIN public.thread_templates tt ON tt.id = b.thread_template_id
  WHERE b.id = p_binding_id;
$function$;
