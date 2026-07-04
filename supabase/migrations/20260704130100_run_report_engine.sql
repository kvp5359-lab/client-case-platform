-- Движок отчётов: RPC run_report(p_workspace_id, p_config).
--
-- Принцип безопасности: клиент передаёт ТОЛЬКО ключи (dataset, поля, меры,
-- операторы) — они резолвятся через whitelist-реестр внутри функции. Ни один
-- идентификатор из конфига не попадает в SQL напрямую; значения фильтров
-- экранируются quote_literal. Функция SECURITY INVOKER — RLS нижележащих
-- таблиц применяется к вызывающему (finance/threads/projects видны ровно
-- настолько, насколько видны пользователю).
--
-- Формат config (src/types/reports.ts):
-- {
--   "dataset": "transactions" | "services" | "client_balance" | "projects" | "threads",
--   "mode": "summary" | "detail",
--   "groupBy": [{"field": "category"}, {"field": "date", "granularity": "month"}],
--   "measures": ["sum_amount", "count"],
--   "filter": FilterGroup (@/lib/filters/types — тот же формат, что у досок),
--   "columns": ["date", "amount", ...]        -- для mode=detail
--   "sort": {"by": "a0"|"g0", "dir": "asc"|"desc"}
-- }
--
-- Результат: {"rows": [...], "totals": {...}|null, "rowCount": n, "limitHit": bool}
-- Ключи строк: summary → g0..gN (группы), a0..aM (меры); detail → ключи полей.
--
-- При добавлении датасета/поля: править v_registry здесь + клиентский зеркальный
-- реестр src/lib/reports/registry.ts (лейблы/типы должны совпадать по ключам).

-- ── Хелпер: одно условие фильтра → SQL ────────────────────

CREATE OR REPLACE FUNCTION public._report_condition_sql(p_cond jsonb, p_fields jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
  v_f     jsonb;
  v_expr  text;
  v_type  text;
  v_op    text;
  v_val   jsonb;
  v_cast  text;
  v_items text[];
  v_a     text;
  v_b     text;
BEGIN
  v_f := p_fields -> (p_cond ->> 'field');
  IF v_f IS NULL THEN
    RAISE EXCEPTION 'report: неизвестное поле фильтра "%"', p_cond ->> 'field';
  END IF;
  v_expr := COALESCE(v_f ->> 'fexpr', v_f ->> 'expr');
  v_type := v_f ->> 'type';
  v_op   := p_cond ->> 'operator';
  v_val  := p_cond -> 'value';
  v_cast := CASE v_type
    WHEN 'number' THEN '::numeric'
    WHEN 'date'   THEN '::date'
    WHEN 'uuid'   THEN '::uuid'
    ELSE ''
  END;

  IF v_op IN ('is_null', 'is_not_null') THEN
    RETURN '(' || v_expr || CASE WHEN v_op = 'is_null' THEN ' IS NULL)' ELSE ' IS NOT NULL)' END;
  END IF;

  IF v_val IS NULL OR jsonb_typeof(v_val) = 'null' THEN
    RAISE EXCEPTION 'report: пустое значение фильтра для поля "%"', p_cond ->> 'field';
  END IF;

  CASE v_op
    WHEN 'equals' THEN
      RETURN '(' || v_expr || ' = ' || quote_literal(v_val #>> '{}') || v_cast || ')';
    WHEN 'not_equals' THEN
      RETURN '(' || v_expr || ' IS DISTINCT FROM ' || quote_literal(v_val #>> '{}') || v_cast || ')';
    WHEN 'contains' THEN
      RETURN '(' || v_expr || '::text ILIKE ' || quote_literal('%' || (v_val #>> '{}') || '%') || ')';
    WHEN 'before' THEN
      RETURN '(' || v_expr || ' < ' || quote_literal(v_val #>> '{}') || v_cast || ')';
    WHEN 'before_eq' THEN
      RETURN '(' || v_expr || ' <= ' || quote_literal(v_val #>> '{}') || v_cast || ')';
    WHEN 'after' THEN
      RETURN '(' || v_expr || ' > ' || quote_literal(v_val #>> '{}') || v_cast || ')';
    WHEN 'after_eq' THEN
      RETURN '(' || v_expr || ' >= ' || quote_literal(v_val #>> '{}') || v_cast || ')';
    WHEN 'between' THEN
      IF jsonb_typeof(v_val) <> 'array' OR jsonb_array_length(v_val) < 2 THEN
        RAISE EXCEPTION 'report: between требует массив [от, до]';
      END IF;
      v_a := v_val -> 0 #>> '{}';
      v_b := v_val -> 1 #>> '{}';
      RETURN '(' || v_expr || ' >= ' || quote_literal(v_a) || v_cast
          || ' AND ' || v_expr || ' <= ' || quote_literal(v_b) || v_cast || ')';
    WHEN 'in', 'not_in' THEN
      IF jsonb_typeof(v_val) <> 'array' THEN
        RAISE EXCEPTION 'report: in/not_in требует массив значений';
      END IF;
      SELECT array_agg(quote_literal(x.v) || v_cast)
        INTO v_items
        FROM (SELECT jsonb_array_elements_text(v_val) AS v) x;
      IF v_items IS NULL THEN
        RETURN CASE WHEN v_op = 'in' THEN 'false' ELSE 'true' END;
      END IF;
      RETURN '(' || v_expr
          || CASE WHEN v_op = 'not_in' THEN ' NOT IN (' ELSE ' IN (' END
          || array_to_string(v_items, ', ') || '))';
    ELSE
      RAISE EXCEPTION 'report: неизвестный оператор "%"', v_op;
  END CASE;
END;
$fn$;

-- ── Хелпер: FilterGroup (рекурсивно) → SQL ────────────────

CREATE OR REPLACE FUNCTION public._report_filter_sql(p_group jsonb, p_fields jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
  v_logic text;
  v_parts text[] := '{}';
  v_rule  jsonb;
  v_sql   text;
BEGIN
  IF p_group IS NULL OR jsonb_typeof(p_group) <> 'object' THEN
    RETURN NULL;
  END IF;
  v_logic := CASE WHEN lower(COALESCE(p_group ->> 'logic', 'and')) = 'or' THEN ' OR ' ELSE ' AND ' END;
  FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(p_group -> 'rules', '[]'::jsonb))
  LOOP
    IF v_rule ->> 'type' = 'group' THEN
      v_sql := public._report_filter_sql(v_rule -> 'group', p_fields);
      IF v_sql IS NOT NULL THEN
        v_parts := v_parts || ('(' || v_sql || ')');
      END IF;
    ELSE
      v_parts := v_parts || public._report_condition_sql(v_rule, p_fields);
    END IF;
  END LOOP;
  IF array_length(v_parts, 1) IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN array_to_string(v_parts, v_logic);
END;
$fn$;

-- ── Основная функция ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.run_report(p_workspace_id uuid, p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  -- Whitelist-реестр датасетов. __WS__ подменяется на литерал workspace_id.
  -- Зеркало на клиенте: src/lib/reports/registry.ts (ключи должны совпадать).
  v_registry jsonb := $REG$
  {
    "transactions": {
      "from": "public.project_transactions t JOIN public.projects pr ON pr.id = t.project_id AND pr.is_deleted = false LEFT JOIN public.participants pa ON pa.id = t.participant_id LEFT JOIN public.finance_transaction_categories c ON c.id = t.category_id LEFT JOIN public.participants cl ON cl.id = pr.contact_participant_id LEFT JOIN public.statuses pst ON pst.id = pr.status_id",
      "where": "t.is_deleted = false AND pr.workspace_id = __WS__",
      "detail_order": "t.date DESC, t.created_at DESC",
      "detail_default": ["date", "type", "amount", "category", "project", "participant", "comment"],
      "fields": {
        "type":           {"expr": "CASE t.type WHEN 'income' THEN 'Доход' ELSE 'Расход' END", "fexpr": "t.type", "type": "text", "group": true},
        "date":           {"expr": "t.date", "fexpr": "t.date", "type": "date", "group": true},
        "amount":         {"expr": "t.amount", "fexpr": "t.amount", "type": "number", "group": false},
        "comment":        {"expr": "COALESCE(t.comment, '')", "fexpr": "t.comment", "type": "text", "group": false},
        "category":       {"expr": "COALESCE(c.name, 'Без категории')", "fexpr": "t.category_id", "type": "uuid", "group": true},
        "participant":    {"expr": "COALESCE(NULLIF(TRIM(COALESCE(pa.name, '') || ' ' || COALESCE(pa.last_name, '')), ''), '—')", "fexpr": "t.participant_id", "type": "uuid", "group": true},
        "project":        {"expr": "pr.name", "fexpr": "t.project_id", "type": "uuid", "group": true},
        "client":         {"expr": "COALESCE(NULLIF(TRIM(COALESCE(cl.name, '') || ' ' || COALESCE(cl.last_name, '')), ''), '—')", "fexpr": "pr.contact_participant_id", "type": "uuid", "group": true},
        "project_status": {"expr": "COALESCE(pst.name, '—')", "fexpr": "pr.status_id", "type": "uuid", "group": true}
      },
      "measures": {
        "sum_amount": {"sql": "ROUND(SUM(t.amount)::numeric, 2)"},
        "avg_amount": {"sql": "ROUND(AVG(t.amount)::numeric, 2)"},
        "count":      {"sql": "COUNT(*)"}
      }
    },
    "services": {
      "from": "public.project_services s JOIN public.projects pr ON pr.id = s.project_id AND pr.is_deleted = false LEFT JOIN public.participants cl ON cl.id = pr.contact_participant_id LEFT JOIN public.statuses pst ON pst.id = pr.status_id",
      "where": "s.is_deleted = false AND pr.workspace_id = __WS__",
      "detail_order": "s.created_at DESC",
      "detail_default": ["service", "project", "client", "quantity", "price", "total"],
      "fields": {
        "service":        {"expr": "s.name", "fexpr": "s.service_id", "type": "uuid", "group": true},
        "project":        {"expr": "pr.name", "fexpr": "s.project_id", "type": "uuid", "group": true},
        "client":         {"expr": "COALESCE(NULLIF(TRIM(COALESCE(cl.name, '') || ' ' || COALESCE(cl.last_name, '')), ''), '—')", "fexpr": "pr.contact_participant_id", "type": "uuid", "group": true},
        "project_status": {"expr": "COALESCE(pst.name, '—')", "fexpr": "pr.status_id", "type": "uuid", "group": true},
        "quantity":       {"expr": "s.quantity", "fexpr": "s.quantity", "type": "number", "group": false},
        "price":          {"expr": "s.price", "fexpr": "s.price", "type": "number", "group": false},
        "total":          {"expr": "s.total", "fexpr": "s.total", "type": "number", "group": false},
        "created":        {"expr": "s.created_at::date", "fexpr": "s.created_at::date", "type": "date", "group": true}
      },
      "measures": {
        "sum_total":    {"sql": "ROUND(SUM(s.total)::numeric, 2)"},
        "sum_quantity": {"sql": "ROUND(SUM(s.quantity)::numeric, 2)"},
        "count":        {"sql": "COUNT(*)"}
      }
    },
    "client_balance": {
      "from": "(SELECT pr.id AS project_id, pr.name AS project_name, pr.status_id, pr.contact_participant_id, pr.template_id, pr.created_at, COALESCE((SELECT SUM(s.total) FROM public.project_services s WHERE s.project_id = pr.id AND s.is_deleted = false), 0) AS billed, COALESCE((SELECT SUM(tr.amount) FROM public.project_transactions tr WHERE tr.project_id = pr.id AND tr.type = 'income' AND tr.is_deleted = false), 0) AS paid, COALESCE((SELECT SUM(tr.amount) FROM public.project_transactions tr WHERE tr.project_id = pr.id AND tr.type = 'expense' AND tr.is_deleted = false), 0) AS expenses FROM public.projects pr WHERE pr.workspace_id = __WS__ AND pr.is_deleted = false) t LEFT JOIN public.participants cl ON cl.id = t.contact_participant_id LEFT JOIN public.statuses pst ON pst.id = t.status_id LEFT JOIN public.project_templates tp ON tp.id = t.template_id",
      "where": "true",
      "detail_order": "(t.billed - t.paid) DESC",
      "detail_default": ["client", "project", "project_status", "billed", "paid", "balance"],
      "fields": {
        "project":        {"expr": "t.project_name", "fexpr": "t.project_id", "type": "uuid", "group": true},
        "client":         {"expr": "COALESCE(NULLIF(TRIM(COALESCE(cl.name, '') || ' ' || COALESCE(cl.last_name, '')), ''), '—')", "fexpr": "t.contact_participant_id", "type": "uuid", "group": true},
        "project_status": {"expr": "COALESCE(pst.name, '—')", "fexpr": "t.status_id", "type": "uuid", "group": true},
        "template":       {"expr": "COALESCE(tp.name, '—')", "fexpr": "t.template_id", "type": "uuid", "group": true},
        "created":        {"expr": "t.created_at::date", "fexpr": "t.created_at::date", "type": "date", "group": true},
        "billed":         {"expr": "t.billed", "fexpr": "t.billed", "type": "number", "group": false},
        "paid":           {"expr": "t.paid", "fexpr": "t.paid", "type": "number", "group": false},
        "expenses":       {"expr": "t.expenses", "fexpr": "t.expenses", "type": "number", "group": false},
        "balance":        {"expr": "(t.billed - t.paid)", "fexpr": "(t.billed - t.paid)", "type": "number", "group": false}
      },
      "measures": {
        "sum_billed":   {"sql": "ROUND(SUM(t.billed)::numeric, 2)"},
        "sum_paid":     {"sql": "ROUND(SUM(t.paid)::numeric, 2)"},
        "sum_expenses": {"sql": "ROUND(SUM(t.expenses)::numeric, 2)"},
        "sum_balance":  {"sql": "ROUND(SUM(t.billed - t.paid)::numeric, 2)"},
        "count":        {"sql": "COUNT(*)"}
      }
    },
    "projects": {
      "from": "public.projects pr LEFT JOIN public.statuses pst ON pst.id = pr.status_id LEFT JOIN public.project_templates tp ON tp.id = pr.template_id LEFT JOIN public.participants cl ON cl.id = pr.contact_participant_id",
      "where": "pr.workspace_id = __WS__ AND pr.is_deleted = false",
      "detail_order": "pr.created_at DESC",
      "detail_default": ["project", "status", "template", "client", "created"],
      "fields": {
        "project":  {"expr": "pr.name", "fexpr": "pr.id", "type": "uuid", "group": false},
        "status":   {"expr": "COALESCE(pst.name, '—')", "fexpr": "pr.status_id", "type": "uuid", "group": true},
        "template": {"expr": "COALESCE(tp.name, '—')", "fexpr": "pr.template_id", "type": "uuid", "group": true},
        "client":   {"expr": "COALESCE(NULLIF(TRIM(COALESCE(cl.name, '') || ' ' || COALESCE(cl.last_name, '')), ''), '—')", "fexpr": "pr.contact_participant_id", "type": "uuid", "group": true},
        "created":  {"expr": "pr.created_at::date", "fexpr": "pr.created_at::date", "type": "date", "group": true},
        "deadline": {"expr": "pr.deadline::date", "fexpr": "pr.deadline::date", "type": "date", "group": true}
      },
      "measures": {
        "count": {"sql": "COUNT(*)"}
      }
    },
    "threads": {
      "from": "public.project_threads th LEFT JOIN public.projects pr ON pr.id = th.project_id AND pr.is_deleted = false LEFT JOIN public.statuses st ON st.id = th.status_id",
      "where": "th.workspace_id = __WS__ AND th.is_deleted = false",
      "detail_order": "th.created_at DESC",
      "detail_default": ["thread", "thread_type", "status", "project", "created", "deadline"],
      "fields": {
        "thread":      {"expr": "th.name", "fexpr": "th.id", "type": "uuid", "group": false},
        "thread_type": {"expr": "CASE th.type WHEN 'task' THEN 'Задача' WHEN 'chat' THEN 'Чат' ELSE 'Email' END", "fexpr": "th.type", "type": "text", "group": true},
        "status":      {"expr": "COALESCE(st.name, '—')", "fexpr": "th.status_id", "type": "uuid", "group": true},
        "project":     {"expr": "COALESCE(pr.name, 'Без проекта')", "fexpr": "th.project_id", "type": "uuid", "group": true},
        "created":     {"expr": "th.created_at::date", "fexpr": "th.created_at::date", "type": "date", "group": true},
        "deadline":    {"expr": "th.deadline::date", "fexpr": "th.deadline::date", "type": "date", "group": true}
      },
      "measures": {
        "count": {"sql": "COUNT(*)"}
      }
    }
  }
  $REG$::jsonb;

  v_ds      text := p_config ->> 'dataset';
  v_mode    text := COALESCE(p_config ->> 'mode', 'summary');
  v_dsdef   jsonb;
  v_fields  jsonb;
  v_meas    jsonb;
  v_from    text;
  v_where   text;
  v_fsql    text;

  v_sel     text[] := '{}';
  v_grp     text[] := '{}';
  v_msel    text[] := '{}';
  v_g       jsonb;
  v_f       jsonb;
  v_md      jsonb;
  v_mkey    text;
  v_expr    text;
  v_gran    text;
  v_fmt     text;
  v_gcount  int := 0;
  v_mcount  int := 0;

  v_cols    jsonb;
  v_col     text;

  v_sort    jsonb;
  v_order   text := NULL;

  v_sql     text;
  v_rows    jsonb;
  v_totals  jsonb := NULL;
  v_limit   int;
  v_count   int;
BEGIN
  -- Защита: вызывающий должен быть активным участником воркспейса.
  IF NOT EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.workspace_id = p_workspace_id
      AND p.user_id = auth.uid()
      AND p.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'report: нет доступа к воркспейсу';
  END IF;

  v_dsdef := v_registry -> v_ds;
  IF v_dsdef IS NULL THEN
    RAISE EXCEPTION 'report: неизвестный датасет "%"', v_ds;
  END IF;
  IF v_mode NOT IN ('summary', 'detail') THEN
    RAISE EXCEPTION 'report: неизвестный режим "%"', v_mode;
  END IF;

  v_fields := v_dsdef -> 'fields';
  v_meas   := v_dsdef -> 'measures';
  v_from   := replace(v_dsdef ->> 'from', '__WS__', quote_literal(p_workspace_id::text) || '::uuid');
  v_where  := replace(COALESCE(v_dsdef ->> 'where', 'true'), '__WS__', quote_literal(p_workspace_id::text) || '::uuid');

  -- Фильтр (FilterGroup).
  IF p_config ? 'filter' THEN
    v_fsql := public._report_filter_sql(p_config -> 'filter', v_fields);
    IF v_fsql IS NOT NULL THEN
      v_where := v_where || ' AND (' || v_fsql || ')';
    END IF;
  END IF;

  IF v_mode = 'summary' THEN
    -- Группировки (до 3).
    FOR v_g IN SELECT * FROM jsonb_array_elements(COALESCE(p_config -> 'groupBy', '[]'::jsonb))
    LOOP
      IF v_gcount >= 3 THEN
        RAISE EXCEPTION 'report: максимум 3 уровня группировки';
      END IF;
      v_f := v_fields -> (v_g ->> 'field');
      IF v_f IS NULL OR COALESCE((v_f ->> 'group')::boolean, false) = false THEN
        RAISE EXCEPTION 'report: поле "%" не поддерживает группировку', v_g ->> 'field';
      END IF;
      v_expr := v_f ->> 'expr';
      IF v_f ->> 'type' = 'date' THEN
        v_gran := COALESCE(v_g ->> 'granularity', 'day');
        IF v_gran NOT IN ('day', 'week', 'month', 'quarter', 'year') THEN
          RAISE EXCEPTION 'report: неизвестная гранулярность "%"', v_gran;
        END IF;
        v_fmt := CASE v_gran
          WHEN 'day'     THEN 'YYYY-MM-DD'
          WHEN 'week'    THEN 'IYYY-"W"IW'
          WHEN 'month'   THEN 'YYYY-MM'
          WHEN 'quarter' THEN 'YYYY-"Q"Q'
          ELSE 'YYYY'
        END;
        v_expr := 'to_char(date_trunc(' || quote_literal(v_gran) || ', (' || v_expr || ')::timestamp), ' || quote_literal(v_fmt) || ')';
      END IF;
      v_sel := v_sel || (v_expr || ' AS g' || v_gcount);
      v_grp := v_grp || ('g' || v_gcount);
      v_gcount := v_gcount + 1;
    END LOOP;

    -- Показатели (до 6). Пусто → COUNT(*).
    FOR v_mkey IN SELECT * FROM jsonb_array_elements_text(COALESCE(p_config -> 'measures', '[]'::jsonb))
    LOOP
      IF v_mcount >= 6 THEN
        RAISE EXCEPTION 'report: максимум 6 показателей';
      END IF;
      v_md := v_meas -> v_mkey;
      IF v_md IS NULL THEN
        RAISE EXCEPTION 'report: неизвестный показатель "%"', v_mkey;
      END IF;
      v_msel := v_msel || ((v_md ->> 'sql') || ' AS a' || v_mcount);
      v_mcount := v_mcount + 1;
    END LOOP;
    IF v_mcount = 0 THEN
      v_msel := ARRAY['COUNT(*) AS a0'];
      v_mcount := 1;
    END IF;
    v_sel := v_sel || v_msel;

    -- Сортировка: явная (gN/aN) или по группам по возрастанию.
    v_sort := p_config -> 'sort';
    IF v_sort IS NOT NULL AND (v_sort ->> 'by') ~ '^[ga][0-9]$' THEN
      IF (left(v_sort ->> 'by', 1) = 'g' AND right(v_sort ->> 'by', 1)::int < v_gcount)
         OR (left(v_sort ->> 'by', 1) = 'a' AND right(v_sort ->> 'by', 1)::int < v_mcount) THEN
        v_order := (v_sort ->> 'by')
          || CASE WHEN lower(COALESCE(v_sort ->> 'dir', 'desc')) = 'asc' THEN ' ASC' ELSE ' DESC' END
          || ' NULLS LAST';
      END IF;
    END IF;
    IF v_order IS NULL AND v_gcount > 0 THEN
      v_order := array_to_string(v_grp, ' ASC, ') || ' ASC';
    END IF;

    v_limit := 1000;
    v_sql := 'SELECT ' || array_to_string(v_sel, ', ')
          || ' FROM ' || v_from
          || ' WHERE ' || v_where
          || CASE WHEN v_gcount > 0 THEN ' GROUP BY ' || array_to_string(v_grp, ', ') ELSE '' END
          || CASE WHEN v_order IS NOT NULL THEN ' ORDER BY ' || v_order ELSE '' END
          || ' LIMIT ' || v_limit;

    -- Общий итог (те же меры без группировки) — только когда есть группы.
    IF v_gcount > 0 THEN
      EXECUTE 'SELECT row_to_json(q)::jsonb FROM (SELECT ' || array_to_string(v_msel, ', ')
           || ' FROM ' || v_from || ' WHERE ' || v_where || ') q'
        INTO v_totals;
    END IF;

  ELSE
    -- Режим списка: явные колонки или дефолтный набор датасета.
    v_cols := COALESCE(NULLIF(p_config -> 'columns', '[]'::jsonb), v_dsdef -> 'detail_default');
    FOR v_col IN SELECT * FROM jsonb_array_elements_text(v_cols)
    LOOP
      IF v_gcount >= 15 THEN
        RAISE EXCEPTION 'report: максимум 15 колонок';
      END IF;
      v_f := v_fields -> v_col;
      IF v_f IS NULL THEN
        RAISE EXCEPTION 'report: неизвестная колонка "%"', v_col;
      END IF;
      v_sel := v_sel || format('%s AS %I', v_f ->> 'expr', v_col);
      v_gcount := v_gcount + 1;
    END LOOP;
    IF v_gcount = 0 THEN
      RAISE EXCEPTION 'report: не выбраны колонки';
    END IF;

    v_limit := 500;
    v_sql := 'SELECT ' || array_to_string(v_sel, ', ')
          || ' FROM ' || v_from
          || ' WHERE ' || v_where
          || ' ORDER BY ' || (v_dsdef ->> 'detail_order')
          || ' LIMIT ' || v_limit;
  END IF;

  EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(q)::jsonb), ''[]''::jsonb) FROM (' || v_sql || ') q'
    INTO v_rows;

  v_count := jsonb_array_length(v_rows);

  RETURN jsonb_build_object(
    'rows', v_rows,
    'totals', v_totals,
    'rowCount', v_count,
    'limitHit', v_count >= v_limit
  );
END;
$fn$;

-- ── Гранты ────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public._report_condition_sql(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._report_filter_sql(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.run_report(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._report_condition_sql(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._report_filter_sql(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_report(uuid, jsonb) TO authenticated, service_role;
