-- Периодический полный пересчёт thread_inbox_meta (safety-net против дрейфа).
-- Идемпотентно. Подключить к pg_cron при включении read-cutover.
CREATE OR REPLACE FUNCTION public.reconcile_thread_inbox_meta()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
  r RECORD;
BEGIN
  DELETE FROM thread_inbox_meta m
  WHERE NOT EXISTS (SELECT 1 FROM project_threads t WHERE t.id = m.thread_id AND t.is_deleted = false);
  FOR r IN SELECT id FROM project_threads WHERE is_deleted = false LOOP
    PERFORM compute_thread_inbox_meta(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_thread_inbox_meta() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_thread_inbox_meta() TO service_role;
