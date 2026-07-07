-- Материализованный inbox-путь не исключал soft-deleted треды
-- =============================================================
-- Симптом: удалённый (is_deleted=true) email-тред с непрочитанным продолжал
-- висеть во «Входящих» (список + бейдж), его нельзя было ни открыть, ни убрать —
-- даже после F5.
--
-- Корень: после cutover (Фаза 2.6) сегментные вкладки и бейджи читают
-- материализованные таблицы thread_unread_state / thread_inbox_meta через
-- get_inbox_threads_v3_for (список) и get_inbox_thread_aggregates (счётчики).
-- Обе джойнят project_threads БЕЗ фильтра is_deleted, а материализованные
-- таблицы при soft-delete треда не чистятся (нет триггера на project_threads.
-- is_deleted). Живой путь get_inbox_threads_v2 фильтрует is_deleted → отсюда
-- расхождение: v2 тред не отдаёт, а v3_for/aggregates — отдают.
--
-- Фикс: добавить pt.is_deleted = false в оба резолвера (зеркало v2). Данные НЕ
-- мутируем — восстановление треда из корзины (is_deleted → false) вернёт его во
-- «Входящие» корректно с сохранёнными счётчиками.
--
-- Применено в прод через MCP (apply_migration inbox_materialized_exclude_deleted_threads).
-- v3_for живёт только в проде (drift, см. ledger Фаза 2.6) — патчим его через
-- pg_get_functiondef + replace, чтобы не тащить всё тело в репо.

-- 1) get_inbox_threads_v3_for — единый резолвер обёрток unread/needs/awaiting/muted/page
DO $mig$
DECLARE src text;
BEGIN
  IF to_regprocedure('public.get_inbox_threads_v3_for(uuid,uuid,uuid[])') IS NULL THEN
    RAISE NOTICE 'get_inbox_threads_v3_for отсутствует — пропуск (prod-only drift)';
    RETURN;
  END IF;
  src := pg_get_functiondef('get_inbox_threads_v3_for(uuid,uuid,uuid[])'::regprocedure);
  IF strpos(src, 'JOIN project_threads pt ON pt.id = b.thread_id AND pt.is_deleted = false') > 0 THEN
    RAISE NOTICE 'get_inbox_threads_v3_for уже пропатчен';
    RETURN;
  END IF;
  src := replace(
    src,
    'JOIN project_threads pt ON pt.id = b.thread_id',
    'JOIN project_threads pt ON pt.id = b.thread_id AND pt.is_deleted = false'
  );
  EXECUTE src;
END $mig$;

-- 2) get_inbox_thread_aggregates — источник бейджей/счётчиков сегментов
CREATE OR REPLACE FUNCTION public.get_inbox_thread_aggregates(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, project_id uuid, legacy_channel text, thread_accent_color text, last_message_at timestamp with time zone, unread_count bigint, unread_event_count bigint, unread_reaction_count bigint, has_unread_reaction boolean, manually_unread boolean, last_reaction_emoji text, last_from_staff boolean, has_external boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT us.thread_id, pt.project_id, pt.legacy_channel::text, pt.accent_color::text,
    m.last_message_at, us.unread_count, us.unread_event_count, us.unread_reaction_count,
    us.has_unread_reaction, us.manually_unread, us.last_reaction_emoji, m.last_from_staff, m.has_external
  FROM thread_unread_state us
  JOIN thread_inbox_meta m ON m.thread_id = us.thread_id
  JOIN project_threads pt ON pt.id = us.thread_id AND pt.is_deleted = false
  WHERE us.participant_id = (SELECT id FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1);
$function$;
