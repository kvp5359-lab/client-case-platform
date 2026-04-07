-- Добавляем поле группировки в board_lists
ALTER TABLE board_lists
  ADD COLUMN IF NOT EXISTS group_by TEXT DEFAULT 'none'
    CHECK (group_by IN ('none', 'status', 'project', 'assignee', 'deadline'));

-- Обновляем RPC — добавляем group_by
DROP FUNCTION IF EXISTS public.get_board_lists(UUID);

CREATE OR REPLACE FUNCTION public.get_board_lists(p_board_id UUID)
RETURNS TABLE (
  id UUID,
  board_id UUID,
  name TEXT,
  entity_type TEXT,
  column_index INT,
  sort_order INT,
  filters JSONB,
  sort_by TEXT,
  sort_dir TEXT,
  display_mode TEXT,
  visible_fields TEXT[],
  group_by TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    bl.id, bl.board_id, bl.name, bl.entity_type,
    bl.column_index, bl.sort_order, bl.filters,
    bl.sort_by, bl.sort_dir,
    bl.display_mode, bl.visible_fields,
    bl.group_by,
    bl.created_at, bl.updated_at
  FROM board_lists bl
  WHERE bl.board_id = p_board_id
  ORDER BY bl.column_index ASC, bl.sort_order ASC;
END;
$$;
