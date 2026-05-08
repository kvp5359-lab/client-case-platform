-- Этап 4.1 CRM-фрейма: фильтр на уровне всей доски.
--
-- Хранится как jsonb с двумя независимыми FilterGroup'ами для разных
-- entity_type. Inbox-списки имеют собственную логику фильтрации
-- (default_filter), поэтому в global_filter не участвуют.
--
-- На рендере фильтр доски комбинируется AND с фильтром каждого списка
-- соответствующего entity_type. Если оба пустые — поведение не меняется.

ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS global_filter jsonb NOT NULL DEFAULT
    '{"project":{"logic":"and","rules":[]},"task":{"logic":"and","rules":[]}}'::jsonb;

COMMENT ON COLUMN public.boards.global_filter IS
  'Фильтр на уровне всей доски (CRM-фрейм этап 4.1). Структура: '
  '{ "project": FilterGroup, "task": FilterGroup }. Применяется AND к фильтру '
  'каждого списка соответствующего entity_type. Inbox-списки игнорируют этот фильтр.';

-- ============================================================================
-- Обновление RPC get_workspace_boards — добавить колонку global_filter в возврат.
-- DROP перед CREATE необходим: Postgres не позволяет менять returns-shape
-- через CREATE OR REPLACE, если signature OUT параметров изменилась.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_workspace_boards(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_workspace_boards(p_workspace_id uuid, p_user_id uuid)
RETURNS TABLE(
  id uuid,
  workspace_id uuid,
  name text,
  description text,
  access_type text,
  access_roles text[],
  created_by uuid,
  sort_order integer,
  column_widths jsonb,
  global_filter jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    b.sort_order, b.column_widths, b.global_filter,
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
$function$;
