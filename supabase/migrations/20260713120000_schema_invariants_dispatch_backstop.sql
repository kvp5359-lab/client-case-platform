-- Аудит мессенджера 2026-07-13: расширяем инвариант-гард на dispatch_message_to_channels.
--
-- dispatch_message_to_channels — БД-роутер исходящих. Два его правила — самые
-- бизнес-опасные при регрессе:
--   (1) visibility-backstop: `visibility IS DISTINCT FROM 'client'` → внутреннее
--       (team/self/«Заметка») наружу НЕ уходит (иначе внутреннее сообщение
--       утечёт клиенту в канал — класс бага, который edge-страж
--       check-edge-invariants уже ловит на стороне edge; тут зеркалим на БД).
--   (2) skip-вложений: `has_attachments AND NOT p_force_attachments` — вложения
--       шлёт фронт-invoke, не триггер; если это правило пропадёт, dispatch
--       начнёт слать вложения вторым путём → дубли в канале.
--
-- CREATE OR REPLACE _schema_invariants добавляет поле `dispatch_markers`;
-- check-db-invariants.mjs валит CI, если любой маркер исчезнет из тела dispatch.
-- Read-only функция (pg_get_functiondef + LIKE) — ничего не шлёт.

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
