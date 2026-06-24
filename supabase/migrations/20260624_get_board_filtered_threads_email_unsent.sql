-- ХОТФИКС: get_board_filtered_threads делает `SELECT b.* FROM
-- get_workspace_threads(...) b` в фиксированный RETURNS TABLE. После добавления
-- столбца email_unsent в get_workspace_threads (миграция 20260623) число колонок
-- b.* (22) перестало совпадать с RETURNS TABLE этой обёртки (21) → RPC падала
-- с 400 → пропали задачи/доски/календарь в проде.
--
-- Фикс: добавить email_unsent и в RETURNS TABLE обёртки. Смена сигнатуры →
-- DROP+CREATE. После пересоздания вернуть гранты (REVOKE PUBLIC/anon).
--
-- ⚠️ ПРАВИЛО: при любом изменении колонок get_workspace_threads СИНХРОННО
-- править get_board_filtered_threads (единственный потребитель, тянет b.*).

DROP FUNCTION IF EXISTS public.get_board_filtered_threads(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.get_board_filtered_threads(p_workspace_id uuid, p_user_id uuid, p_filter jsonb)
 RETURNS TABLE(id uuid, name text, type text, workspace_id uuid, project_id uuid, project_name text, status_id uuid, status_name text, status_color text, status_order integer, status_show_to_creator boolean, deadline timestamp with time zone, start_at timestamp with time zone, end_at timestamp with time zone, accent_color text, icon text, is_pinned boolean, sort_order integer, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, email_unsent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_where text;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user mismatch';
  END IF;
  v_where := public._board_compile_group(COALESCE(p_filter, '{"logic":"and","rules":[]}'::jsonb), 'thread');
  RETURN QUERY EXECUTE format(
    'SELECT b.* FROM public.get_workspace_threads(%L, %L) b WHERE %s',
    p_workspace_id, p_user_id, v_where
  );
END $function$;

REVOKE EXECUTE ON FUNCTION public.get_board_filtered_threads(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_board_filtered_threads(uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_board_filtered_threads(uuid, uuid, jsonb) TO authenticated, service_role;
