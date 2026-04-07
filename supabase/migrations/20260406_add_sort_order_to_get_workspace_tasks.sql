-- Обновление RPC get_workspace_tasks: добавлено поле sort_order
-- для поддержки drag & drop сортировки задач на странице «Задачи».
--
-- sort_order уже есть в таблице project_threads, просто не выбиралось в RPC.

DROP FUNCTION IF EXISTS public.get_workspace_tasks(UUID);

CREATE OR REPLACE FUNCTION public.get_workspace_tasks(p_workspace_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  workspace_id UUID,
  project_id UUID,
  project_name TEXT,
  status_id UUID,
  status_name TEXT,
  status_color TEXT,
  status_order INT,
  status_show_to_creator BOOLEAN,
  deadline TIMESTAMPTZ,
  accent_color TEXT,
  icon TEXT,
  is_pinned BOOLEAN,
  sort_order INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pt.id,
    pt.name,
    pt.workspace_id,
    pt.project_id,
    p.name AS project_name,
    pt.status_id,
    s.name AS status_name,
    s.color AS status_color,
    s.order_index AS status_order,
    COALESCE(s.show_to_creator, FALSE) AS status_show_to_creator,
    pt.deadline,
    pt.accent_color,
    pt.icon,
    pt.is_pinned,
    pt.sort_order,
    pt.created_at,
    pt.updated_at,
    pt.created_by
  FROM project_threads pt
  LEFT JOIN projects p ON p.id = pt.project_id
  LEFT JOIN statuses s ON s.id = pt.status_id
  WHERE pt.workspace_id = p_workspace_id
    AND pt.type = 'task'
    AND pt.is_deleted = FALSE
  ORDER BY pt.sort_order ASC, pt.created_at ASC;
END;
$$;
