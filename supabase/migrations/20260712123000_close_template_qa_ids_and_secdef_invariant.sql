-- Фаза 1.2-доп + Фаза 3.1 аудита безопасности.
--
-- (1) resolve_template_qa_ids — близнец resolve_template_article_ids: LANGUAGE
--     sql, SECURITY DEFINER, anon-исполним, без проверки доступа (читал QA БЗ по
--     любому template_id → кросс-воркспейс). Аудит-агент его пропустил, нашёл
--     инвариант (ниже). Закрываем паттерном обёртка+_impl с гейтом членства.
--     Единственный вызывающий — get_shareable_qa (уже гейтит team_member),
--     каскад не ломается; прямой anon-вызов теперь отбивается.
-- (2) get_shareable_qa — уже защищён гейтом is_workspace_team_member, но держал
--     anon в ACL: чистим (гигиена).
-- (3) _schema_invariants — правило против регресса: список SECURITY DEFINER
--     функций (кроме триггерных) с EXECUTE у PUBLIC/anon. CI (check-db-invariants)
--     сверяет его с whitelist — новая незакрытая функция валит сборку.

-- (1) resolve_template_qa_ids → обёртка + _impl
ALTER FUNCTION public.resolve_template_qa_ids(uuid) RENAME TO resolve_template_qa_ids_impl;
REVOKE ALL ON FUNCTION public.resolve_template_qa_ids_impl(uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.resolve_template_qa_ids(p_template_id uuid)
RETURNS TABLE(qa_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_ws uuid;
BEGIN
  SELECT workspace_id INTO v_ws FROM project_templates WHERE id = p_template_id;
  IF v_ws IS NULL
     OR NOT (coalesce(auth.role(),'') = 'service_role'
             OR public.is_workspace_participant(v_ws, (SELECT auth.uid()))) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.resolve_template_qa_ids_impl(p_template_id);
END;
$function$;
-- CREATE FUNCTION по умолчанию выдаёт PUBLIC — снимаем сразу (гейт и так держит).
REVOKE ALL ON FUNCTION public.resolve_template_qa_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_template_qa_ids(uuid) TO authenticated, service_role;

-- (2) чистим anon у get_shareable_qa (гейт team_member остаётся)
REVOKE ALL ON FUNCTION public.get_shareable_qa(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shareable_qa(uuid, uuid) TO authenticated, service_role;

-- (3) правило инварианта: SECURITY DEFINER с PUBLIC/anon execute (кроме триггеров)
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
