-- Добавляем поля отображения в board_lists
ALTER TABLE board_lists
  ADD COLUMN IF NOT EXISTS display_mode TEXT DEFAULT 'list'
    CHECK (display_mode IN ('list', 'cards')),
  ADD COLUMN IF NOT EXISTS visible_fields TEXT[] DEFAULT '{status,deadline,assignees,project}';

-- Обновляем RPC — добавляем новые поля
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
    bl.created_at, bl.updated_at
  FROM board_lists bl
  WHERE bl.board_id = p_board_id
  ORDER BY bl.column_index ASC, bl.sort_order ASC;
END;
$$;
