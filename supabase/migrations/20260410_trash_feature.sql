-- Trash feature (мягкое удаление проектов и тредов)
--
-- Добавляет поля мягкого удаления в projects и project_threads,
-- индексы для быстрого чтения раздела «Корзина»,
-- обновляет RPC-функции, чтобы исключать удалённые записи из обычных списков.
--
-- В корзину попадают: проекты, задачи, чаты, email-треды.
-- Восстановление и окончательное удаление — через раздел «Корзина» в настройках воркспейса.

-- ── 1. projects: добавляем поля ──

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Индекс для быстрого исключения удалённых из списков проектов
CREATE INDEX IF NOT EXISTS projects_workspace_is_deleted_idx
  ON public.projects (workspace_id, is_deleted);

-- Индекс для быстрого чтения раздела «Корзина» (workspace → удалённые, отсортированные по времени удаления)
CREATE INDEX IF NOT EXISTS projects_workspace_deleted_at_idx
  ON public.projects (workspace_id, deleted_at DESC)
  WHERE is_deleted = true;

-- ── 2. project_threads: добавляем недостающие поля аудита ──
-- (колонка is_deleted уже существует)

ALTER TABLE public.project_threads
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Индекс для чтения корзины по workspace
CREATE INDEX IF NOT EXISTS project_threads_workspace_deleted_at_idx
  ON public.project_threads (workspace_id, deleted_at DESC)
  WHERE is_deleted = true;

-- ── 3. RPC get_user_projects: исключать удалённые проекты ──

CREATE OR REPLACE FUNCTION public.get_user_projects(
  p_workspace_id uuid,
  p_user_id uuid,
  p_can_view_all boolean DEFAULT false
)
RETURNS SETOF projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_can_view_all THEN
    RETURN QUERY
      SELECT * FROM projects
      WHERE workspace_id = p_workspace_id
        AND is_deleted = false
      ORDER BY created_at DESC;
  ELSE
    RETURN QUERY
      SELECT p.* FROM projects p
      INNER JOIN project_participants pp ON pp.project_id = p.id
      INNER JOIN participants part ON part.id = pp.participant_id
      WHERE p.workspace_id = p_workspace_id
        AND p.is_deleted = false
        AND part.user_id = p_user_id
        AND part.is_deleted = false
      ORDER BY p.created_at DESC;
  END IF;
END;
$function$;

COMMENT ON COLUMN public.projects.is_deleted IS
  'Мягкое удаление: true — проект в корзине, скрыт из списков. Восстанавливается из раздела «Корзина».';
COMMENT ON COLUMN public.project_threads.deleted_at IS
  'Время мягкого удаления треда. Используется в разделе «Корзина».';
