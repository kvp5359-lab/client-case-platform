-- Реаудит 2026-06-13: марафонный этап 1 закрыл функции из enumeration E1-агента,
-- но остался класс anon-доступных SECURITY DEFINER функций с остаточным PUBLIC-грантом
-- (разные миграции, вкл. 20260611 board server-side filter). IDOR/инъекция от anon.
-- Bucket A — cron/watchdog (service_role). Bucket B — frontend-RPC (authenticated).
-- Применено в прод через MCP.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND p.proname = ANY(ARRAY['cleanup_expired_oauth_states','scan_dispatch_failures'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'execute')
      AND pg_catalog.format_type(p.prorettype,NULL) NOT IN ('boolean','trigger')
      AND p.proname NOT IN ('resolve_workspace_by_host','get_workspace_slug_by_id',
                            'cleanup_expired_oauth_states','scan_dispatch_failures')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;
