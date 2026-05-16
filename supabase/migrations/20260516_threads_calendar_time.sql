-- Календарь: интервал времени у тредов-задач
--
-- Добавляем start_at/end_at для отображения задач в time-grid календаре
-- (день/неделя). Задача попадает в календарь только если ОБА поля заполнены.
-- Это отличается от due_date (точечный дедлайн) — задача может иметь и то,
-- и другое: «дедлайн пятница, но делать буду в четверг 15:00-17:00».

ALTER TABLE public.project_threads
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz;

-- Индекс для выборок календаря по диапазону.
CREATE INDEX IF NOT EXISTS idx_project_threads_calendar
  ON public.project_threads (workspace_id, start_at, end_at)
  WHERE start_at IS NOT NULL
    AND end_at IS NOT NULL
    AND is_deleted = false;

COMMENT ON COLUMN public.project_threads.start_at IS
  'Запланированное начало задачи в календаре (time-grid). NULL = задача не запланирована во времени.';
COMMENT ON COLUMN public.project_threads.end_at IS
  'Запланированный конец задачи в календаре. Должен быть > start_at. NULL = задача не запланирована во времени.';
