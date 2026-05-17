-- Расширяем RPC get_board_lists: добавляем calendar_settings.
DROP FUNCTION IF EXISTS public.get_board_lists(UUID);

CREATE OR REPLACE FUNCTION public.get_board_lists(p_board_id UUID)
RETURNS TABLE(
  id uuid,
  board_id uuid,
  name text,
  entity_type text,
  column_index integer,
  sort_order integer,
  filters jsonb,
  sort_by text,
  sort_dir text,
  display_mode text,
  visible_fields text[],
  group_by text,
  list_height text,
  header_color text,
  card_layout jsonb,
  calendar_settings jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    bl.id, bl.board_id, bl.name, bl.entity_type,
    bl.column_index, bl.sort_order, bl.filters,
    bl.sort_by, bl.sort_dir, bl.display_mode,
    bl.visible_fields, bl.group_by, bl.list_height,
    bl.header_color, bl.card_layout, bl.calendar_settings,
    bl.created_at, bl.updated_at
  FROM board_lists bl
  WHERE bl.board_id = p_board_id
  ORDER BY bl.column_index ASC, bl.sort_order ASC;
END;
$function$;
