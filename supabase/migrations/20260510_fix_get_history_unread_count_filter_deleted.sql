-- Audit_logs are kept after project soft-delete (for restore-from-trash).
-- The unread counter must not include events on deleted projects, otherwise
-- the sidebar shows ghost unread badges. JOIN projects + filter is_deleted.
CREATE OR REPLACE FUNCTION public.get_history_unread_count(p_project_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count BIGINT;
  v_last_read TIMESTAMPTZ;
  v_user_id UUID;
  v_project_active BOOLEAN;
BEGIN
  v_user_id := auth.uid();

  -- Skip counting on a soft-deleted project — its events are inert.
  SELECT NOT p.is_deleted INTO v_project_active
  FROM public.projects p
  WHERE p.id = p_project_id;
  IF v_project_active IS NOT TRUE THEN
    RETURN 0;
  END IF;

  SELECT hrs.last_read_at INTO v_last_read
  FROM public.history_read_status hrs
  WHERE hrs.user_id = v_user_id AND hrs.project_id = p_project_id;

  SELECT COUNT(*) INTO v_count
  FROM public.audit_logs al
  WHERE al.project_id = p_project_id
    AND (v_last_read IS NULL OR al.created_at > v_last_read)
    AND al.user_id IS DISTINCT FROM v_user_id;

  RETURN v_count;
END;
$function$;
