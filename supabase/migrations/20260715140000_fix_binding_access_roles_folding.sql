-- Фикс folding access_roles в resolve_thread_template_binding: роли следуют за
-- access_type (зеркало фронта seedProjectContent), а не берутся независимым
-- COALESCE. Полное тело — в 20260715120000 (там же исправлено); эта миграция
-- фиксирует факт правки прода после сверки (38 привязок → 0 расхождений).
-- Идемпотентно: применяет то же тело, что лежит в 20260715120000.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'resolve_thread_template_binding'
  ) THEN
    RAISE EXCEPTION 'resolve_thread_template_binding отсутствует — примените 20260715120000';
  END IF;
END $$;
