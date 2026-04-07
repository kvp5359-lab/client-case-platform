-- Доски (планировщик): boards, board_members, board_lists
-- Каждая доска содержит колонки со списками, каждый список фильтрует задачи или проекты.

-- ============================================================
-- 1. boards — доски workspace
-- ============================================================
CREATE TABLE IF NOT EXISTS boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Доступ: workspace (все), private (только создатель), custom (по ролям/участникам)
  access_type TEXT NOT NULL DEFAULT 'workspace'
    CHECK (access_type IN ('workspace', 'private', 'custom')),
  access_roles TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_boards_workspace ON boards(workspace_id);

-- ============================================================
-- 2. board_members — доступ конкретным участникам (для custom)
-- ============================================================
CREATE TABLE IF NOT EXISTS board_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(board_id, participant_id)
);

CREATE INDEX idx_board_members_board ON board_members(board_id);

-- ============================================================
-- 3. board_lists — списки внутри доски
-- ============================================================
CREATE TABLE IF NOT EXISTS board_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('task', 'project')),
  column_index INT DEFAULT 0,
  sort_order INT DEFAULT 0,
  filters JSONB NOT NULL DEFAULT '{"logic": "and", "rules": []}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_board_lists_board ON board_lists(board_id);

-- ============================================================
-- 4. RPC: получение досок workspace с проверкой доступа
-- ============================================================
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
  -- Найти participant текущего пользователя
  SELECT p.id, p.workspace_roles INTO v_participant_id, v_roles
  FROM participants p
  WHERE p.workspace_id = p_workspace_id
    AND p.user_id = p_user_id
    AND p.is_deleted = FALSE
  LIMIT 1;

  IF v_participant_id IS NULL THEN
    RETURN; -- нет доступа к workspace
  END IF;

  RETURN QUERY
  SELECT
    b.id, b.workspace_id, b.name, b.description,
    b.access_type, b.access_roles, b.created_by,
    b.sort_order, b.created_at, b.updated_at
  FROM boards b
  WHERE b.workspace_id = p_workspace_id
    AND (
      b.access_type = 'workspace'
      OR (b.access_type = 'private' AND b.created_by = p_user_id)
      OR (b.access_type = 'custom' AND (
        -- Доступ по роли
        v_roles && b.access_roles
        -- Или по конкретному участнику
        OR EXISTS (
          SELECT 1 FROM board_members bm
          WHERE bm.board_id = b.id AND bm.participant_id = v_participant_id
        )
      ))
    )
  ORDER BY b.sort_order ASC, b.created_at ASC;
END;
$$;

-- ============================================================
-- 5. RPC: получение списков доски
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_board_lists(p_board_id UUID)
RETURNS TABLE (
  id UUID,
  board_id UUID,
  name TEXT,
  entity_type TEXT,
  column_index INT,
  sort_order INT,
  filters JSONB,
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
    bl.created_at, bl.updated_at
  FROM board_lists bl
  WHERE bl.board_id = p_board_id
  ORDER BY bl.column_index ASC, bl.sort_order ASC;
END;
$$;
