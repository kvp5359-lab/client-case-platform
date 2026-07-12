-- Фаза 1 аудита безопасности, доводка: снять PUBLIC/anon с обёрток.
--
-- Обёртки из 20260712120000 и 20260712121000 создавались через CREATE
-- FUNCTION → PostgreSQL по умолчанию выдал им EXECUTE для PUBLIC (и, как
-- следствие, anon). Гейт auth.uid() внутри всё равно отбивает anon, но
-- держать PUBLIC/anon в ACL SECURITY DEFINER функций — плохая гигиена и
-- регресс относительно оригиналов (у них было только authenticated).
-- Снимаем PUBLIC/anon, оставляя authenticated + service_role (выданы ранее).

DO $$
DECLARE r record;
  names text[] := ARRAY[
    'get_accessible_projects','get_chat_state','get_inbox_awaiting_reply_threads',
    'get_inbox_message_status','get_inbox_muted_threads','get_inbox_needs_reply_threads',
    'get_inbox_search_threads','get_inbox_thread_aggregates','get_inbox_thread_one',
    'get_inbox_threads_page','get_inbox_threads_v2','get_inbox_threads_v3',
    'get_inbox_threads_v3_for','get_inbox_unread_threads','get_project_history',
    'get_sidebar_data','get_total_unread_count','get_user_projects',
    'get_workspace_threads','get_workspaces_with_counts','resolve_template_article_ids'];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.proname = ANY(names)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
  END LOOP;
END $$;
