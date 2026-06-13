-- Мёртвая RPC: фронт-кластер taskKeys удалён (архитектурный аудит T4),
-- ни одна функция/триггер/cron/edge/фронт её не зовёт. Живой счётчик задач —
-- get_my_task_counts. Дроп. Применено через MCP apply_migration.
DROP FUNCTION IF EXISTS public.get_my_urgent_tasks_count(uuid);
