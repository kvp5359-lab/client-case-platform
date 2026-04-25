-- Удаляем устаревшую текстовую колонку projects.status (DEPRECATED 2026-04-25,
-- planned removal 2026-05-09 — досрочно по решению пользователя).
--
-- Все читатели и писатели уже мигрированы на projects.status_id (uuid → statuses.id).
-- Перед DROP COLUMN пересоздаём 2 триггера, которые ссылались на старую колонку
-- (`OLD.status` / `NEW.status`) — теперь смотрим на `status_id`.

DROP TRIGGER IF EXISTS trg_audit_project_update ON public.projects;
CREATE TRIGGER trg_audit_project_update
  AFTER UPDATE ON public.projects
  FOR EACH ROW
  WHEN (
    (OLD.name IS DISTINCT FROM NEW.name)
    OR (OLD.status_id IS DISTINCT FROM NEW.status_id)
    OR (OLD.deadline IS DISTINCT FROM NEW.deadline)
  )
  EXECUTE FUNCTION fn_audit_project_update();

DROP TRIGGER IF EXISTS trg_project_self_activity ON public.projects;
CREATE TRIGGER trg_project_self_activity
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  WHEN (
    (OLD.name IS DISTINCT FROM NEW.name)
    OR (OLD.status_id IS DISTINCT FROM NEW.status_id)
    OR (OLD.description IS DISTINCT FROM NEW.description)
  )
  EXECUTE FUNCTION fn_update_project_last_activity_self();

ALTER TABLE public.projects DROP COLUMN IF EXISTS status;
