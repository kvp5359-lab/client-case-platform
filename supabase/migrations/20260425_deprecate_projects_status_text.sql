-- Помечаем устаревшую текстовую колонку projects.status. Все читатели и
-- писатели UI переведены на projects.status_id. Колонку оставляем как
-- safety-net на 1-2 недели — после подтверждения работы в проде дропнем
-- отдельной миграцией.

COMMENT ON COLUMN public.projects.status IS
  'DEPRECATED 2026-04-25 — use projects.status_id (FK to statuses) instead. '
  'Kept for safety until UI migration is verified in prod. '
  'Remove after 2026-05-09.';
