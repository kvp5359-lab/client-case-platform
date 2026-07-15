-- Единый механизм для всех владельцев: «базовый шаблон + переопределения».
--
-- Режим 'extend' («дополнить исполнителей шаблона») был заведён ради отдельного
-- поля у лид-бота. Он давал третий режим только у каналов, второй экран записи
-- и, как следствие, конфликт двух путей. Решение владельца: у канала — такое же
-- переопределение, как у шаблона проекта (заменить целиком), больше ничего.
--
-- Существующие 'extend'-привязки материализуем: их эффективный набор
-- (шаблон + дополнительные) записываем как переопределение → состав
-- исполнителей у уже настроенных ботов не меняется.

-- 1. Досыпаем исполнителей шаблона в набор привязки (пока режим ещё 'extend').
INSERT INTO public.project_template_thread_assignees (binding_id, participant_id)
SELECT b.id, ta.participant_id
FROM public.project_template_thread_templates b
JOIN public.thread_template_assignees ta ON ta.template_id = b.thread_template_id
WHERE b.assignees_mode = 'extend'
ON CONFLICT DO NOTHING;

-- 2. Режим → «заменить» (набор уже полный, поведение прежнее).
UPDATE public.project_template_thread_templates
SET assignees_mode = 'override'
WHERE assignees_mode = 'extend';

-- 3. Оставляем два режима — как у шаблонов проекта.
ALTER TABLE public.project_template_thread_templates
  DROP CONSTRAINT IF EXISTS chk_pttt_assignees_mode;
ALTER TABLE public.project_template_thread_templates
  ADD CONSTRAINT chk_pttt_assignees_mode
  CHECK (assignees_mode IN ('inherit', 'override'));

COMMENT ON COLUMN public.project_template_thread_templates.assignees_mode IS
  'Исполнители привязки: inherit = из базового шаблона, override = только из '
  'project_template_thread_assignees этой привязки. Источник правды; булев '
  'override_assignees синхронизирует триггер pttt_sync_assignees_mode (мост '
  'совместимости, дропнуть вместе с колонкой после выката).';

-- 4. Применение: два режима.
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
      -- «Заменить»: только из привязки (пустой набор = «никого»).
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
