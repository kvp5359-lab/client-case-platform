-- Ширина колонок на досках
-- Позволяет задать ширину каждой колонки индивидуально через массив по индексу
ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS column_widths JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN boards.column_widths IS
  'Массив ширин колонок в пикселях по индексу. Если массив короче количества колонок — недостающие получают дефолт 340px.';

-- Обновляем RPC get_workspace_boards, чтобы он возвращал column_widths.
-- Нужен DROP, так как PostgreSQL не даёт менять структуру RETURNS TABLE существующей функции.
DROP FUNCTION IF EXISTS public.get_workspace_boards(UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_workspace_boards(
  p_workspace_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  id UUID,
  workspace_id UUID,
  name TEXT,
  description TEXT,
  access_type TEXT,
  access_roles TEXT[],
  created_by UUID,
  sort_order INT,
  column_widths JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_id UUID;
  v_roles TEXT[];
BEGIN
  SELECT p.id, p.workspace_roles INTO v_participant_id, v_roles
  FROM participants p
  WHERE p.workspace_id = p_workspace_id
    AND p.user_id = p_user_id
    AND p.is_deleted = FALSE
  LIMIT 1;

  IF v_participant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    b.id, b.workspace_id, b.name, b.description,
    b.access_type, b.access_roles, b.created_by,
    b.sort_order, b.column_widths,
    b.created_at, b.updated_at
  FROM boards b
  WHERE b.workspace_id = p_workspace_id
    AND (
      b.access_type = 'workspace'
      OR (b.access_type = 'private' AND b.created_by = p_user_id)
      OR (b.access_type = 'custom' AND (
        v_roles && b.access_roles
        OR EXISTS (
          SELECT 1 FROM board_members bm
          WHERE bm.board_id = b.id AND bm.participant_id = v_participant_id
        )
      ))
    )
  ORDER BY b.sort_order ASC, b.created_at ASC;
END;
$$;
