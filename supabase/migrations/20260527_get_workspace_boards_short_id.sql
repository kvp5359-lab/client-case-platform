-- get_workspace_boards теперь возвращает short_id.
-- Нужен сайдбару: URL досок может быть как /boards/<uuid>, так и /boards/<short_id>
-- (на subdomain'е активны короткие пути). Без short_id подсветка пинней доски
-- в сайдбаре не работает при URL с коротким идентификатором.
--
-- DROP перед CREATE: PostgreSQL не разрешает менять RETURNS TABLE через
-- CREATE OR REPLACE (42P13 cannot change return type of existing function).

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
   created_at timestamp with time zone,
   updated_at timestamp with time zone,
   short_id integer
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
    b.created_at, b.updated_at, b.short_id
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
