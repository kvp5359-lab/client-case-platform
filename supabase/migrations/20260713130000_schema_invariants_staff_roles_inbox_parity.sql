-- Аудит мессенджера 2026-07-13 (продолжение): расширяем инвариант-гард двумя
-- read-only проверками, закрывающими две задокументированные «незащищённые
-- синхронизации» (ledger: «автогарда нет»):
--
--   (A) staff_role_set — набор ролей из тела is_staff_role(text). check-db-invariants
--       сверяет его с STAFF_ROLES из src/types/permissions.ts. Закрывает класс
--       «кириллическая опечатка в SQL-роли» (ledger 2026-06-13 ловил 'Исполнitель'
--       вручную) и рассинхрон SQL-зеркала с TS-каноном (audit-false-positives:
--       is_staff_role — намеренное SQL-зеркало, менять оба).
--
--   (B) inbox_v2_v3_cols_match — совпадают ли ИМЕНА и ПОРЯДОК выходных колонок
--       get_inbox_threads_v2 и get_inbox_threads_v3_for. v3_for — display-резолвер
--       материализованного пути инбокса; его RETURNS TABLE обязан повторять форму
--       v2. Полный поведенческий паритет сверялся вручную (ledger 0/0 на 7 юзерах);
--       функции принимают auth-user id (не participant), поэтому fixture-паритет
--       непрактичен — тут ловим самый частый и опасный дрейф: колонку добавили/
--       переименовали/переставили в одной, но не в другой (зеркало гарда
--       board_out_cols↔workspace_out_cols, который уже ловил прод-аварию 2026-06-24).
--
-- CREATE OR REPLACE сохраняет все прежние поля (recompute_markers, dispatch_markers,
-- board/workspace_out_cols, secdef_public_or_anon) + добавляет два новых.
-- Read-only (pg_get_functiondef + pg_proc), ничего не шлёт.
--
-- ⚠️ Правка _schema_invariants меняет её body_md5 → после применения обновить
-- эталон дрейфа: node scripts/db-drift-check.mjs --update (RPC _schema_manifest
-- не исключает _schema_invariants из хешей).

CREATE OR REPLACE FUNCTION public._schema_invariants()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'recompute_markers', (
      WITH d AS (SELECT pg_get_functiondef('public.recompute_thread_unread_for(uuid,uuid)'::regprocedure) AS def)
      SELECT jsonb_build_object(
        'change_deadline_excluded', def LIKE '%change_deadline%',
        'assignee_event_gate',      def LIKE '%task_assignees%',
        'visibility_gate',          def LIKE '%visibility%',
        'own_message_watermark',    def LIKE '%GREATEST%',
        'subscription_gate',        (def ILIKE '%subscrib%' OR def LIKE '%muted%')
      ) FROM d
    ),
    'dispatch_markers', (
      WITH d AS (SELECT pg_get_functiondef('public.dispatch_message_to_channels(uuid,boolean)'::regprocedure) AS def)
      SELECT jsonb_build_object(
        'visibility_backstop', def LIKE '%IS DISTINCT FROM ''client''%',
        'attachment_skip',     (def LIKE '%has_attachments%' AND def LIKE '%p_force_attachments%')
      ) FROM d
    ),
    -- (A) Набор ролей из тела is_staff_role(text) — сверяется с STAFF_ROLES (TS).
    -- Извлекаем содержимое IN (...) и режем по запятой, снимая кавычки/пробелы.
    'staff_role_set', (
      SELECT coalesce(jsonb_agg(role ORDER BY role), '[]'::jsonb)
      FROM (
        SELECT trim(both '''' FROM trim(x)) AS role
        FROM regexp_split_to_table(
          substring(pg_get_functiondef('public.is_staff_role(text)'::regprocedure) FROM 'IN \(([^)]*)\)'),
          ','
        ) x
      ) roles
    ),
    -- (B) Совпадение имён+порядка выходных колонок v2 и v3_for (материализованный
    -- путь инбокса обязан повторять форму эталона).
    'inbox_v2_v3_cols_match', (
      WITH c AS (
        SELECT p.proname,
          (SELECT string_agg(nm, ',' ORDER BY ord)
           FROM unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a(nm, md, ord)
           WHERE a.md = 't') AS cols
        FROM pg_proc p
        WHERE p.pronamespace='public'::regnamespace
          AND p.proname IN ('get_inbox_threads_v2','get_inbox_threads_v3_for')
      )
      SELECT (SELECT cols FROM c WHERE proname='get_inbox_threads_v2')
           = (SELECT cols FROM c WHERE proname='get_inbox_threads_v3_for')
    ),
    'board_out_cols',     (SELECT count(*) FROM unnest((SELECT proargmodes FROM pg_proc WHERE proname='get_board_filtered_threads' AND pronamespace='public'::regnamespace LIMIT 1)) m WHERE m='t'),
    'workspace_out_cols', (SELECT count(*) FROM unnest((SELECT proargmodes FROM pg_proc WHERE proname='get_workspace_threads' AND pronamespace='public'::regnamespace LIMIT 1)) m WHERE m='t'),
    -- Список SECURITY DEFINER функций public с EXECUTE у PUBLIC/anon, исключая
    -- триггерные (их execute-грант бессмыслен — PostgREST их не вызывает).
    -- CI сверяет с whitelist; появление НОВОГО имени = незакрытая функция.
    'secdef_public_or_anon', (
      SELECT coalesce(jsonb_agg(p.proname ORDER BY p.proname), '[]'::jsonb)
      FROM pg_proc p
      WHERE p.pronamespace='public'::regnamespace
        AND p.prosecdef
        AND p.prorettype <> 'trigger'::regtype
        AND (array_to_string(coalesce(p.proacl,'{}'),' | ') LIKE '=X%'
             OR array_to_string(coalesce(p.proacl,'{}'),' | ') ILIKE '%anon=X%'
             OR p.proacl IS NULL)
    )
  );
$$;
REVOKE ALL ON FUNCTION public._schema_invariants() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._schema_invariants() TO service_role;
