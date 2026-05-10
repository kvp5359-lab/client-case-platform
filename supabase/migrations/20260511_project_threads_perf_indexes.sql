-- Составные индексы для горячих фильтров project_threads.
-- RPC get_workspace_threads, get_inbox_threads_v2, get_sidebar_data
-- постоянно WHERE workspace_id = $1 AND is_deleted = false (+ часто type='task').
-- Существующих одиночных индексов не хватает на средне-крупном воркспейсе.

CREATE INDEX IF NOT EXISTS idx_project_threads_workspace_is_deleted
  ON public.project_threads (workspace_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_project_threads_workspace_type_is_deleted
  ON public.project_threads (workspace_id, type, is_deleted);

-- project_id + is_deleted — для get_user_projects / get_workspace_threads
-- при выборках по конкретному проекту.
CREATE INDEX IF NOT EXISTS idx_project_threads_project_is_deleted
  ON public.project_threads (project_id, is_deleted);
