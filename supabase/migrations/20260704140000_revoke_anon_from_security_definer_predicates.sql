-- Аудит 2026-07-04, Фаза 1 #12 (D8) — снять anon EXECUTE со ВСЕХ SECURITY DEFINER
-- функций public, кроме 4 резолверов коротких ссылок (нужны anon в middleware).
--
-- Дополняет ранний REVOKE (20260703120000, только inbox-RPC). Здесь — предикаты
-- (is_workspace_owner, has_*_permission, can_user_access_*…), триггер-функции и
-- generate_recurring_tasks. Все НЕ возвращают данных клиенту (boolean/trigger/
-- void/cron), вызываются внутри RLS (в контексте владельца) или триггерами/cron —
-- прямой anon-вызов им не нужен. Закрывает лишнюю поверхность (advisor
-- anon_security_definer_function_executable).
--
-- Два прохода: (1) REVOKE FROM PUBLIC + GRANT authenticated,service_role там, где
-- anon шёл через PUBLIC; (2) REVOKE FROM anon там, где грант был прямым.
-- Резолверы (resolve_short_id, resolve_workspace_by_host, get_short_id_by_uuid,
-- get_workspace_slug_by_id) сохраняют anon.

DO $$
DECLARE r record;
BEGIN
  -- (1) anon через PUBLIC → снять PUBLIC, вернуть явные гранты
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
      AND p.proname NOT IN ('resolve_short_id','resolve_workspace_by_host','get_short_id_by_uuid','get_workspace_slug_by_id')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
  -- (2) прямой грант anon → снять
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname NOT IN ('resolve_short_id','resolve_workspace_by_host','get_short_id_by_uuid','get_workspace_slug_by_id')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;
