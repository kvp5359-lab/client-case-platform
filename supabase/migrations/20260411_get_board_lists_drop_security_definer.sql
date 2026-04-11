-- 2026-04-11: Drop SECURITY DEFINER from get_board_lists.
--
-- The function was running as SECURITY DEFINER (bypassing RLS) but had no
-- access check in its body — any authenticated user knowing a board_id could
-- read its list settings (names, filters, sort, visible_fields).
--
-- RLS policy `board_lists_select` already enforces access via workspace
-- participants, so running the function as INVOKER delegates access control
-- to RLS — the correct layering. The function still uses `search_path =
-- public` to guard against search_path attacks (defence-in-depth).

CREATE OR REPLACE FUNCTION public.get_board_lists(p_board_id uuid)
 RETURNS TABLE(id uuid, board_id uuid, name text, entity_type text, column_index integer, sort_order integer, filters jsonb, sort_by text, sort_dir text, display_mode text, visible_fields text[], group_by text, list_height text, header_color text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    bl.id, bl.board_id, bl.name, bl.entity_type,
    bl.column_index, bl.sort_order, bl.filters,
    bl.sort_by, bl.sort_dir, bl.display_mode,
    bl.visible_fields, bl.group_by, bl.list_height,
    bl.header_color,
    bl.created_at, bl.updated_at
  FROM board_lists bl
  WHERE bl.board_id = p_board_id
  ORDER BY bl.column_index ASC, bl.sort_order ASC;
END;
$function$;
