-- Группировка задач-шаблонов: с глобального thread_templates.task_group_id на
-- junction project_template_thread_templates.task_group_id (пер-проект-шаблон).
--
-- Причина: задача-«рыба» (thread_templates) шарится между несколькими
-- проект-шаблонами через junction, а группа (project_template_task_groups)
-- принадлежит ОДНОМУ проект-шаблону. Глобальное поле прятало задачу в редакторах
-- чужих шаблонов (редактор рисует только группы своего шаблона). Теперь каждый
-- проект-шаблон группирует общую задачу независимо.
--
-- thread_templates.task_group_id ОСТАВЛЕН (deprecated) на время выката фронта:
-- задеплоенный прод-фронт ещё читает глобальное поле. Дропнуть отдельным заходом
-- после cutover фронта.

ALTER TABLE public.project_template_thread_templates
  ADD COLUMN IF NOT EXISTS task_group_id uuid
  REFERENCES public.project_template_task_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pttt_task_group
  ON public.project_template_thread_templates (template_id, task_group_id);

-- Бэкфилл: переносим текущую глобальную группу на junction ТОЛЬКО там, где группа
-- принадлежит этому же проект-шаблону. Иначе оставляем NULL — задача была скрыта в
-- чужом шаблоне, теперь показывается несгруппированной (= восстановление видимости).
UPDATE public.project_template_thread_templates j
SET task_group_id = tt.task_group_id
FROM public.thread_templates tt, public.project_template_task_groups g
WHERE j.thread_template_id = tt.id
  AND tt.task_group_id = g.id
  AND g.project_template_id = j.template_id
  AND j.template_id IS NOT NULL;
