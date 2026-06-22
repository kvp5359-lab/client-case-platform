-- Ужесточение доступа к доскам: клиент не должен читать структуру чужих досок
-- даже прямым запросом (.from('boards') / .from('board_lists')).
--
-- ДО: RLS boards_select / board_lists_select пускали ЛЮБОГО участника
-- воркспейса ко ВСЕМ доскам и спискам. access_type (workspace/private/custom)
-- проверялся ТОЛЬКО в RPC get_workspace_boards — прямой SELECT его обходил.
--
-- Модель доступа (решение владельца):
--   • board_members            → видит всегда (явный шеринг, любой access_type)
--   • access_type='private'    → только создатель
--   • access_type='workspace'  → только STAFF-роли (Владелец/Администратор/
--                                Сотрудник/Исполнитель). Клиент/Внешний — нет.
--   • access_type='custom'     → совпадение роли с access_roles
--
-- Единый источник правды — can_user_access_board() (как can_user_access_thread
-- для тредов). Применяется и в RLS, и в RPC get_workspace_boards, чтобы
-- UI-список досок был байт-в-байт равен тому, что реально читается.

-- ── 1. Предикат доступа (row-overload — терпим к INSERT...RETURNING) ────────
CREATE OR REPLACE FUNCTION public.can_user_access_board(
  b public.boards,
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id uuid;
  v_roles text[];
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  SELECT par.id, par.workspace_roles INTO v_participant_id, v_roles
    FROM participants par
    WHERE par.user_id = p_user_id
      AND par.workspace_id = b.workspace_id
      AND par.is_deleted = false;
  IF v_participant_id IS NULL THEN RETURN false; END IF;
  v_roles := COALESCE(v_roles, '{}');

  -- Явный участник доски — независимо от access_type (в т.ч. клиент).
  IF EXISTS (SELECT 1 FROM board_members bm
    WHERE bm.board_id = b.id AND bm.participant_id = v_participant_id) THEN
    RETURN true;
  END IF;

  IF b.access_type = 'private' THEN
    RETURN b.created_by = p_user_id;
  END IF;

  IF b.access_type = 'workspace' THEN
    -- «весь воркспейс» = вся КОМАНДA, без клиентов/внешних.
    RETURN EXISTS (SELECT 1 FROM unnest(v_roles) r WHERE public.is_staff_role(r));
  END IF;

  IF b.access_type = 'custom' THEN
    RETURN v_roles && COALESCE(b.access_roles, '{}');
  END IF;

  RETURN false;
END;
$function$;

-- ── 1b. uuid-overload для board_lists (читает row через id, без рекурсии) ───
CREATE OR REPLACE FUNCTION public.can_user_access_board(
  p_board_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_board public.boards;
BEGIN
  IF p_board_id IS NULL OR p_user_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_board FROM public.boards WHERE id = p_board_id;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN public.can_user_access_board(v_board, p_user_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.can_user_access_board(public.boards, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_user_access_board(uuid, uuid) TO authenticated, service_role;

-- ── 2. RLS: чтение доски и её списков — только при наличии доступа ──────────
DROP POLICY IF EXISTS boards_select ON public.boards;
CREATE POLICY boards_select ON public.boards
  FOR SELECT TO public
  USING (public.can_user_access_board(boards, (SELECT auth.uid())));

DROP POLICY IF EXISTS board_lists_select ON public.board_lists;
CREATE POLICY board_lists_select ON public.board_lists
  FOR SELECT TO public
  USING (public.can_user_access_board(board_id, (SELECT auth.uid())));

-- ── 3. RPC get_workspace_boards на тот же предикат (UI-список = RLS) ────────
CREATE OR REPLACE FUNCTION public.get_workspace_boards(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(id uuid, workspace_id uuid, name text, description text, access_type text, access_roles text[], created_by uuid, sort_order integer, column_widths jsonb, global_filter jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, short_id integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user mismatch';
  END IF;

  RETURN QUERY
  SELECT
    b.id, b.workspace_id, b.name, b.description,
    b.access_type, b.access_roles, b.created_by,
    b.sort_order, b.column_widths, b.global_filter,
    b.created_at, b.updated_at, b.short_id
  FROM boards b
  WHERE b.workspace_id = p_workspace_id
    AND public.can_user_access_board(b, p_user_id)
  ORDER BY b.sort_order ASC, b.created_at ASC;
END;
$function$;
