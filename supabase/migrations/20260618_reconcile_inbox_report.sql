-- Ручная сверка Входящих с отчётом (кнопка в Настройках → Общие). Только владелец.
-- + детерминированные тай-брейки (id DESC) в compute_thread_inbox_meta /
--   recompute_thread_unread_for — чтобы пересчёт был стабилен и отчёт честен (0 на здоровой).
-- Полные тела этих двух функций обновлены в проде через MCP (drift-толерантность проекта);
-- здесь — функция-отчёт (главное новое).
CREATE OR REPLACE FUNCTION public.reconcile_inbox_report()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v jsonb;
  v_meta_fixed int; v_meta_added int; v_meta_removed int; v_meta_total int;
  v_unread_fixed int; v_unread_added int; v_unread_removed int; v_unread_total int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM participants p
    JOIN workspace_roles wr ON wr.workspace_id = p.workspace_id AND wr.name = ANY(p.workspace_roles)
    WHERE p.user_id = (SELECT auth.uid()) AND p.is_deleted = false AND wr.is_owner = true
  ) THEN RAISE EXCEPTION 'Только владелец может запускать сверку'; END IF;

  CREATE TEMP TABLE _m0 ON COMMIT DROP AS
    SELECT thread_id, md5((to_jsonb(t) - 'updated_at')::text) AS h FROM thread_inbox_meta t;
  CREATE TEMP TABLE _u0 ON COMMIT DROP AS
    SELECT participant_id, thread_id, md5((to_jsonb(t) - 'updated_at')::text) AS h FROM thread_unread_state t;

  PERFORM reconcile_thread_inbox_meta();
  PERFORM reconcile_thread_unread();

  v_meta_total := (SELECT count(*) FROM thread_inbox_meta);
  v_meta_fixed := (SELECT count(*) FROM thread_inbox_meta a JOIN _m0 b USING (thread_id) WHERE md5((to_jsonb(a) - 'updated_at')::text) <> b.h);
  v_meta_added := (SELECT count(*) FROM thread_inbox_meta a WHERE NOT EXISTS (SELECT 1 FROM _m0 b WHERE b.thread_id = a.thread_id));
  v_meta_removed := (SELECT count(*) FROM _m0 b WHERE NOT EXISTS (SELECT 1 FROM thread_inbox_meta a WHERE a.thread_id = b.thread_id));
  v_unread_total := (SELECT count(*) FROM thread_unread_state);
  v_unread_fixed := (SELECT count(*) FROM thread_unread_state a JOIN _u0 b USING (participant_id, thread_id) WHERE md5((to_jsonb(a) - 'updated_at')::text) <> b.h);
  v_unread_added := (SELECT count(*) FROM thread_unread_state a WHERE NOT EXISTS (SELECT 1 FROM _u0 b WHERE b.participant_id = a.participant_id AND b.thread_id = a.thread_id));
  v_unread_removed := (SELECT count(*) FROM _u0 b WHERE NOT EXISTS (SELECT 1 FROM thread_unread_state a WHERE a.participant_id = b.participant_id AND a.thread_id = b.thread_id));

  v := jsonb_build_object(
    'meta_total', v_meta_total, 'meta_fixed', v_meta_fixed, 'meta_added', v_meta_added, 'meta_removed', v_meta_removed,
    'unread_total', v_unread_total, 'unread_fixed', v_unread_fixed, 'unread_added', v_unread_added, 'unread_removed', v_unread_removed,
    'total_discrepancies', v_meta_fixed + v_meta_added + v_meta_removed + v_unread_fixed + v_unread_added + v_unread_removed
  );
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_inbox_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_inbox_report() TO authenticated, service_role;
