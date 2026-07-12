-- Фаза 1.1 аудита безопасности: закрытие системного IDOR в data-RPC.
--
-- Проблема: ~20 SECURITY DEFINER функций принимали p_user_id параметром и
-- фильтровали данные по нему, НЕ сверяя его с auth.uid(). Так как они
-- SECURITY DEFINER (RLS обойдён) и имеют EXECUTE для authenticated, любой
-- залогиненный пользователь, подставив чужой user_id + workspace_id, читал
-- чужой рабочий контекст (инбокс, проекты, сайдбар, историю, счётчики).
-- Отзыв anon (миграции 20260703/20260613) закрывал только anon, но не
-- authenticated<->authenticated.
--
-- Решение (паттерн "обёртка + _impl", логику НЕ трогаем): оригинал
-- переименовывается в <name>_impl, у него отзываются ВСЕ права (вызывается
-- только изнутри обёртки от owner), сверху создаётся одноимённая обёртка с
-- гейтом. Гейт пропускает: (а) p_user_id == auth.uid() — обычный юзер и
-- имперсонация (JWT sub = целевой юзер); (б) auth.role() = 'service_role' —
-- серверные вызовы (смок, скрипты через service-key). anon/чужой uid → 42501.
--
-- Генеративный DO-блок строит обёртки из системного каталога, поэтому на
-- проде и на fresh `db push` результат идентичен. Идемпотентно: пропускает
-- функцию, если у неё уже есть <name>_impl (обёртка уже наложена).

DO $mig$
DECLARE
  r record; args_id text; args_full text; ret text; params text; body text; cnt int := 0;
  names text[] := ARRAY[
    'get_accessible_projects','get_chat_state','get_inbox_awaiting_reply_threads',
    'get_inbox_message_status','get_inbox_muted_threads','get_inbox_needs_reply_threads',
    'get_inbox_search_threads','get_inbox_thread_aggregates','get_inbox_thread_one',
    'get_inbox_threads_page','get_inbox_threads_v2','get_inbox_threads_v3',
    'get_inbox_threads_v3_for','get_inbox_unread_threads','get_project_history',
    'get_sidebar_data','get_total_unread_count','get_user_projects',
    'get_workspace_threads','get_workspaces_with_counts'];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.proretset, p.pronargs
    FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname = ANY(names)
      AND NOT EXISTS (SELECT 1 FROM pg_proc i
                      WHERE i.proname = p.proname||'_impl' AND i.pronamespace=p.pronamespace)
  LOOP
    args_id   := pg_get_function_identity_arguments(r.oid);
    args_full := pg_get_function_arguments(r.oid);
    ret       := pg_get_function_result(r.oid);
    params    := (SELECT string_agg('$'||g::text, ', ' ORDER BY g)
                  FROM generate_series(1, r.pronargs) g);
    body := CASE WHEN r.proretset
      THEN 'RETURN QUERY SELECT * FROM public.'||quote_ident(r.proname||'_impl')||'('||params||');'
      ELSE 'RETURN public.'||quote_ident(r.proname||'_impl')||'('||params||');' END;

    EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I',
                   r.proname, args_id, r.proname||'_impl');
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated, service_role',
                   r.proname||'_impl', args_id);
    EXECUTE format(
      'CREATE FUNCTION public.%I(%s) RETURNS %s '
      'LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''public'' AS $b$ '
      'BEGIN IF p_user_id IS DISTINCT FROM (SELECT auth.uid()) '
      'AND coalesce(auth.role(), '''') <> ''service_role'' THEN '
      'RAISE EXCEPTION ''access denied: p_user_id must equal the authenticated caller'' '
      'USING ERRCODE=''42501''; END IF; %s END; $b$',
      r.proname, args_full, ret, body);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
                   r.proname, args_id);
    cnt := cnt + 1;
  END LOOP;
  RAISE NOTICE 'idor_gate_data_rpcs: wrapped % functions', cnt;
END $mig$;
