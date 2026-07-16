-- Отчёты: модель «колонки + группировка поверх них» (как в Планфиксе).
--
-- Что это меняет против первой версии движка (20260704130100):
--   * нет режимов «сводка/список» — вид следует из настроек конфига;
--   * нет отдельных «показателей» — агрегат стал свойством колонки
--     («при группировке выводить»: count/sum/avg/min/max), поэтому суммировать
--     можно ЛЮБУЮ числовую колонку, а не только заранее описанные показатели;
--   * группировка вешается на поле колонки: значение группы показывается в её
--     же колонке, а записи — в тех же колонках (пустых блоков не возникает);
--   * подытоги считаются на КАЖДОМ уровне (GROUP BY GROUPING SETS по
--     префиксам групп) + level в строке;
--   * записи внутри группы догружаются отдельным вызовом (recordsFor), чтобы
--     лимит 500 действовал на группу, а не на весь отчёт.
--
-- Реестр датасетов вынесен в _report_registry(): раньше он лежал в теле
-- run_report, и любая правка функции требовала копировать 105 строк JSON.
--
-- Датасет «Проекты» дополнен финансами проекта (услуги/доходы/расходы/долг):
-- суммы берутся LATERAL-подзапросами по каждому проекту — обычный JOIN к
-- услугам и платежам задвоил бы строки и суммы.
--
-- Безопасность не менялась: клиент передаёт только КЛЮЧИ (датасет/поля/
-- агрегаты/операторы) — они резолвятся через whitelist-реестр; значения
-- фильтров и recordsFor экранируются quote_literal. SECURITY INVOKER — RLS
-- нижележащих таблиц применяется к вызывающему.

CREATE OR REPLACE FUNCTION public._report_registry()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $reg$
SELECT $REG$
{
  "transactions": {
    "from": "public.project_transactions t JOIN public.projects pr ON pr.id = t.project_id AND pr.is_deleted = false LEFT JOIN public.participants pa ON pa.id = t.participant_id LEFT JOIN public.finance_transaction_categories c ON c.id = t.category_id LEFT JOIN public.participants cl ON cl.id = pr.contact_participant_id LEFT JOIN public.statuses pst ON pst.id = pr.status_id",
    "where": "t.is_deleted = false AND pr.workspace_id = __WS__",
    "detail_order": "t.date DESC, t.created_at DESC",
    "detail_default": [
      "date",
      "type",
      "amount",
      "category",
      "project",
      "participant",
      "comment"
    ],
    "fields": {
      "type": {
        "expr": "CASE t.type WHEN 'income' THEN 'Доход' ELSE 'Расход' END",
        "fexpr": "t.type",
        "type": "text",
        "group": true
      },
      "date": {
        "expr": "t.date",
        "fexpr": "t.date",
        "type": "date",
        "group": true
      },
      "amount": {
        "expr": "t.amount",
        "fexpr": "t.amount",
        "type": "number",
        "group": false
      },
      "comment": {
        "expr": "COALESCE(t.comment, '')",
        "fexpr": "t.comment",
        "type": "text",
        "group": false
      },
      "category": {
        "expr": "COALESCE(c.name, 'Без категории')",
        "fexpr": "t.category_id",
        "type": "uuid",
        "group": true
      },
      "participant": {
        "expr": "COALESCE(NULLIF(TRIM(COALESCE(pa.name, '') || ' ' || COALESCE(pa.last_name, '')), ''), '—')",
        "fexpr": "t.participant_id",
        "type": "uuid",
        "group": true
      },
      "project": {
        "expr": "pr.name",
        "fexpr": "t.project_id",
        "type": "uuid",
        "group": true,
        "link": "project",
        "link_id": "pr.id"
      },
      "client": {
        "expr": "COALESCE(NULLIF(TRIM(COALESCE(cl.name, '') || ' ' || COALESCE(cl.last_name, '')), ''), '—')",
        "fexpr": "pr.contact_participant_id",
        "type": "uuid",
        "group": true
      },
      "project_status": {
        "expr": "COALESCE(pst.name, '—')",
        "fexpr": "pr.status_id",
        "type": "uuid",
        "group": true
      }
    }
  },
  "services": {
    "from": "public.project_services s JOIN public.projects pr ON pr.id = s.project_id AND pr.is_deleted = false LEFT JOIN public.participants cl ON cl.id = pr.contact_participant_id LEFT JOIN public.statuses pst ON pst.id = pr.status_id",
    "where": "s.is_deleted = false AND pr.workspace_id = __WS__",
    "detail_order": "s.created_at DESC",
    "detail_default": [
      "service",
      "project",
      "client",
      "quantity",
      "price",
      "total"
    ],
    "fields": {
      "service": {
        "expr": "s.name",
        "fexpr": "s.service_id",
        "type": "uuid",
        "group": true
      },
      "project": {
        "expr": "pr.name",
        "fexpr": "s.project_id",
        "type": "uuid",
        "group": true,
        "link": "project",
        "link_id": "pr.id"
      },
      "client": {
        "expr": "COALESCE(NULLIF(TRIM(COALESCE(cl.name, '') || ' ' || COALESCE(cl.last_name, '')), ''), '—')",
        "fexpr": "pr.contact_participant_id",
        "type": "uuid",
        "group": true
      },
      "project_status": {
        "expr": "COALESCE(pst.name, '—')",
        "fexpr": "pr.status_id",
        "type": "uuid",
        "group": true
      },
      "quantity": {
        "expr": "s.quantity",
        "fexpr": "s.quantity",
        "type": "number",
        "group": false
      },
      "price": {
        "expr": "s.price",
        "fexpr": "s.price",
        "type": "number",
        "group": false
      },
      "total": {
        "expr": "s.total",
        "fexpr": "s.total",
        "type": "number",
        "group": false
      },
      "created": {
        "expr": "s.created_at::date",
        "fexpr": "s.created_at::date",
        "type": "date",
        "group": true
      }
    }
  },
  "client_balance": {
    "from": "(SELECT pr.id AS project_id, pr.name AS project_name, pr.status_id, pr.contact_participant_id, pr.template_id, pr.created_at, COALESCE((SELECT SUM(s.total) FROM public.project_services s WHERE s.project_id = pr.id AND s.is_deleted = false), 0) AS billed, COALESCE((SELECT SUM(tr.amount) FROM public.project_transactions tr WHERE tr.project_id = pr.id AND tr.type = 'income' AND tr.is_deleted = false), 0) AS paid, COALESCE((SELECT SUM(tr.amount) FROM public.project_transactions tr WHERE tr.project_id = pr.id AND tr.type = 'expense' AND tr.is_deleted = false), 0) AS expenses FROM public.projects pr WHERE pr.workspace_id = __WS__ AND pr.is_deleted = false) t LEFT JOIN public.participants cl ON cl.id = t.contact_participant_id LEFT JOIN public.statuses pst ON pst.id = t.status_id LEFT JOIN public.project_templates tp ON tp.id = t.template_id",
    "where": "true",
    "detail_order": "(t.billed - t.paid) DESC",
    "detail_default": [
      "client",
      "project",
      "project_status",
      "billed",
      "paid",
      "balance"
    ],
    "fields": {
      "project": {
        "expr": "t.project_name",
        "fexpr": "t.project_id",
        "type": "uuid",
        "group": true,
        "link": "project",
        "link_id": "t.project_id"
      },
      "client": {
        "expr": "COALESCE(NULLIF(TRIM(COALESCE(cl.name, '') || ' ' || COALESCE(cl.last_name, '')), ''), '—')",
        "fexpr": "t.contact_participant_id",
        "type": "uuid",
        "group": true
      },
      "project_status": {
        "expr": "COALESCE(pst.name, '—')",
        "fexpr": "t.status_id",
        "type": "uuid",
        "group": true
      },
      "template": {
        "expr": "COALESCE(tp.name, '—')",
        "fexpr": "t.template_id",
        "type": "uuid",
        "group": true
      },
      "created": {
        "expr": "t.created_at::date",
        "fexpr": "t.created_at::date",
        "type": "date",
        "group": true
      },
      "billed": {
        "expr": "t.billed",
        "fexpr": "t.billed",
        "type": "number",
        "group": false
      },
      "paid": {
        "expr": "t.paid",
        "fexpr": "t.paid",
        "type": "number",
        "group": false
      },
      "expenses": {
        "expr": "t.expenses",
        "fexpr": "t.expenses",
        "type": "number",
        "group": false
      },
      "balance": {
        "expr": "(t.billed - t.paid)",
        "fexpr": "(t.billed - t.paid)",
        "type": "number",
        "group": false
      }
    }
  },
  "projects": {
    "from": "public.projects pr LEFT JOIN public.statuses pst ON pst.id = pr.status_id LEFT JOIN public.project_templates tp ON tp.id = pr.template_id LEFT JOIN public.participants cl ON cl.id = pr.contact_participant_id LEFT JOIN LATERAL (SELECT COALESCE(SUM(s.total), 0) AS billed FROM public.project_services s WHERE s.project_id = pr.id AND s.is_deleted = false) fs ON true LEFT JOIN LATERAL (SELECT COALESCE(SUM(tr.amount) FILTER (WHERE tr.type = 'income'), 0) AS paid, COALESCE(SUM(tr.amount) FILTER (WHERE tr.type = 'expense'), 0) AS expenses FROM public.project_transactions tr WHERE tr.project_id = pr.id AND tr.is_deleted = false) ft ON true",
    "where": "pr.workspace_id = __WS__ AND pr.is_deleted = false",
    "detail_order": "pr.created_at DESC",
    "detail_default": [
      "project",
      "status",
      "template",
      "client",
      "created"
    ],
    "fields": {
      "project": {
        "expr": "pr.name",
        "fexpr": "pr.id",
        "type": "uuid",
        "group": false,
        "link": "project",
        "link_id": "pr.id"
      },
      "status": {
        "expr": "COALESCE(pst.name, '—')",
        "fexpr": "pr.status_id",
        "type": "uuid",
        "group": true
      },
      "template": {
        "expr": "COALESCE(tp.name, '—')",
        "fexpr": "pr.template_id",
        "type": "uuid",
        "group": true
      },
      "client": {
        "expr": "COALESCE(NULLIF(TRIM(COALESCE(cl.name, '') || ' ' || COALESCE(cl.last_name, '')), ''), '—')",
        "fexpr": "pr.contact_participant_id",
        "type": "uuid",
        "group": true
      },
      "created": {
        "expr": "pr.created_at::date",
        "fexpr": "pr.created_at::date",
        "type": "date",
        "group": true
      },
      "deadline": {
        "expr": "pr.deadline::date",
        "fexpr": "pr.deadline::date",
        "type": "date",
        "group": true
      },
      "billed": {
        "expr": "fs.billed",
        "fexpr": "fs.billed",
        "type": "number",
        "group": false
      },
      "paid": {
        "expr": "ft.paid",
        "fexpr": "ft.paid",
        "type": "number",
        "group": false
      },
      "expenses": {
        "expr": "ft.expenses",
        "fexpr": "ft.expenses",
        "type": "number",
        "group": false
      },
      "balance": {
        "expr": "(fs.billed - ft.paid)",
        "fexpr": "(fs.billed - ft.paid)",
        "type": "number",
        "group": false
      }
    }
  },
  "threads": {
    "from": "public.project_threads th LEFT JOIN public.projects pr ON pr.id = th.project_id AND pr.is_deleted = false LEFT JOIN public.statuses st ON st.id = th.status_id",
    "where": "th.workspace_id = __WS__ AND th.is_deleted = false",
    "detail_order": "th.created_at DESC",
    "detail_default": [
      "thread",
      "thread_type",
      "status",
      "project",
      "created",
      "deadline"
    ],
    "fields": {
      "thread": {
        "expr": "th.name",
        "fexpr": "th.id",
        "type": "uuid",
        "group": false,
        "link": "thread",
        "link_id": "th.id",
        "link_project": "th.project_id"
      },
      "thread_type": {
        "expr": "CASE th.type WHEN 'task' THEN 'Задача' WHEN 'chat' THEN 'Чат' ELSE 'Email' END",
        "fexpr": "th.type",
        "type": "text",
        "group": true
      },
      "status": {
        "expr": "COALESCE(st.name, '—')",
        "fexpr": "th.status_id",
        "type": "uuid",
        "group": true
      },
      "project": {
        "expr": "COALESCE(pr.name, 'Без проекта')",
        "fexpr": "th.project_id",
        "type": "uuid",
        "group": true,
        "link": "project",
        "link_id": "th.project_id"
      },
      "created": {
        "expr": "th.created_at::date",
        "fexpr": "th.created_at::date",
        "type": "date",
        "group": true
      },
      "deadline": {
        "expr": "th.deadline::date",
        "fexpr": "th.deadline::date",
        "type": "date",
        "group": true
      }
    }
  }
}
$REG$::jsonb
$reg$;

REVOKE EXECUTE ON FUNCTION public._report_registry() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._report_registry() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.run_report(p_workspace_id uuid, p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  -- Whitelist-реестр датасетов: одно место на проект — _report_registry().
  -- Зеркало на клиенте: src/lib/reports/registry.ts.
  v_registry jsonb := public._report_registry();

  v_ds      text := p_config ->> 'dataset';
  v_dsdef   jsonb;
  v_fields  jsonb;
  v_from    text;
  v_where   text;
  v_fsql    text;

  v_show_records boolean := COALESCE((p_config ->> 'showRecords')::boolean, false);
  v_records_for  jsonb   := p_config -> 'recordsFor';
  v_group_json   jsonb   := COALESCE(p_config -> 'groupBy', '[]'::jsonb);
  v_cols_json    jsonb   := COALESCE(p_config -> 'columns', '[]'::jsonb);
  v_want_records boolean := false;

  v_gexpr   text[] := '{}';
  v_galias  text[] := '{}';
  v_sets    text[] := '{}';
  v_gterms  text[] := '{}';
  v_sel     text[] := '{}';
  v_asel    text[] := '{}';   -- только агрегаты (для строки «Итого»)
  v_g       jsonb;
  v_f       jsonb;
  v_col     jsonb;
  v_key     text;
  v_agg     text;
  v_aggsql  text;
  v_expr    text;
  v_gran    text;
  v_fmt     text;
  v_val     jsonb;
  v_gcount  int := 0;
  v_ccount  int := 0;
  i         int;

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

  v_fields := v_dsdef -> 'fields';
  v_from   := replace(v_dsdef ->> 'from', '__WS__', quote_literal(p_workspace_id::text) || '::uuid');
  v_where  := replace(COALESCE(v_dsdef ->> 'where', 'true'), '__WS__', quote_literal(p_workspace_id::text) || '::uuid');

  IF p_config ? 'filter' THEN
    v_fsql := public._report_filter_sql(p_config -> 'filter', v_fields);
    IF v_fsql IS NOT NULL THEN
      v_where := v_where || ' AND (' || v_fsql || ')';
    END IF;
  END IF;

  IF jsonb_array_length(v_cols_json) = 0 THEN
    RAISE EXCEPTION 'report: не выбраны колонки';
  END IF;

  -- Выражения группировки: нужны и для уровней, и для отбора записей группы.
  FOR v_g IN SELECT * FROM jsonb_array_elements(v_group_json)
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
    v_gexpr  := v_gexpr || v_expr;
    v_galias := v_galias || ('g' || v_gcount);
    v_gcount := v_gcount + 1;
  END LOOP;

  -- Что именно строим.
  IF v_records_for IS NOT NULL AND jsonb_typeof(v_records_for) = 'array' THEN
    IF jsonb_array_length(v_records_for) <> v_gcount THEN
      RAISE EXCEPTION 'report: recordsFor (%) не совпадает с числом группировок (%)',
        jsonb_array_length(v_records_for), v_gcount;
    END IF;
    v_want_records := true;
    -- Записи ровно этой группы: сравниваем по ТЕМ ЖЕ выражениям, по которым
    -- строилась группа, — состав записей всегда совпадает с её агрегатом.
    FOR i IN 1 .. v_gcount LOOP
      v_val := v_records_for -> (i - 1);
      IF v_val IS NULL OR jsonb_typeof(v_val) = 'null' THEN
        v_where := v_where || ' AND (' || v_gexpr[i] || ') IS NULL';
      ELSE
        v_where := v_where || ' AND (' || v_gexpr[i] || ')::text = ' || quote_literal(v_val #>> '{}');
      END IF;
    END LOOP;
  ELSIF v_gcount = 0 AND v_show_records THEN
    v_want_records := true;
  END IF;

  IF v_want_records THEN
    -- Записи: значения всех колонок. Ключ ответа = индекс колонки (cN), т.к.
    -- поле может повторяться (Сумма и Среднее по одному полю).
    FOR v_col IN SELECT * FROM jsonb_array_elements(v_cols_json)
    LOOP
      IF v_ccount >= 15 THEN
        RAISE EXCEPTION 'report: максимум 15 колонок';
      END IF;
      v_key := v_col ->> 'key';
      v_f := v_fields -> v_key;
      IF v_f IS NULL THEN
        RAISE EXCEPTION 'report: неизвестная колонка "%"', v_key;
      END IF;
      v_sel := v_sel || format('%s AS %I', v_f ->> 'expr', 'c' || v_ccount);
      -- Ссылочные поля (проект/тред) отдают ещё и id — фронту он нужен, чтобы
      -- построить настоящий <a href> (иначе не работает средняя кнопка мыши).
      IF v_f ? 'link' THEN
        v_sel := v_sel || format('%s AS %I', v_f ->> 'link_id', 'c' || v_ccount || '_id');
        IF v_f ? 'link_project' THEN
          v_sel := v_sel || format('%s AS %I', v_f ->> 'link_project', 'c' || v_ccount || '_pid');
        END IF;
      END IF;
      v_ccount := v_ccount + 1;
    END LOOP;

    -- Порядок записей: по выбранной колонке (sort.by = cN), иначе дефолт датасета.
    v_sort := p_config -> 'sort';
    IF v_sort IS NOT NULL AND (v_sort ->> 'by') ~ '^c[0-9]{1,2}$' THEN
      v_col := v_cols_json -> ((substring(v_sort ->> 'by' from 2))::int);
      IF v_col IS NOT NULL THEN
        v_f := v_fields -> (v_col ->> 'key');
        IF v_f IS NOT NULL THEN
          v_order := (v_f ->> 'expr')
            || CASE WHEN lower(COALESCE(v_sort ->> 'dir', 'asc')) = 'desc' THEN ' DESC' ELSE ' ASC' END
            || ' NULLS LAST';
        END IF;
      END IF;
    END IF;

    v_limit := 500;
    v_sql := 'SELECT ' || array_to_string(v_sel, ', ')
          || ' FROM ' || v_from
          || ' WHERE ' || v_where
          || ' ORDER BY ' || COALESCE(v_order, v_dsdef ->> 'detail_order')
          || ' LIMIT ' || v_limit;
  ELSE
    -- Строки групп: значение уровня + агрегаты колонок.
    FOR i IN 1 .. v_gcount LOOP
      v_sel    := v_sel || (v_gexpr[i] || ' AS ' || v_galias[i]);
      v_gterms := v_gterms || ('GROUPING(' || v_gexpr[i] || ')');
      v_sets   := v_sets || ('(' || array_to_string(v_gexpr[1:i], ', ') || ')');
    END LOOP;

    FOR v_col IN SELECT * FROM jsonb_array_elements(v_cols_json)
    LOOP
      IF v_ccount >= 15 THEN
        RAISE EXCEPTION 'report: максимум 15 колонок';
      END IF;
      v_key := v_col ->> 'key';
      v_agg := COALESCE(v_col ->> 'agg', 'none');
      v_f := v_fields -> v_key;
      IF v_f IS NULL THEN
        RAISE EXCEPTION 'report: неизвестная колонка "%"', v_key;
      END IF;
      IF v_agg NOT IN ('none', 'count', 'sum', 'avg', 'min', 'max') THEN
        RAISE EXCEPTION 'report: неизвестный агрегат "%"', v_agg;
      END IF;
      IF v_agg IN ('sum', 'avg', 'min', 'max') AND (v_f ->> 'type') <> 'number' THEN
        RAISE EXCEPTION 'report: агрегат "%" недоступен для поля "%"', v_agg, v_key;
      END IF;
      IF v_agg <> 'none' THEN
        v_expr := v_f ->> 'expr';
        v_aggsql := CASE v_agg
          WHEN 'count' THEN 'COUNT(*)'
          WHEN 'sum'   THEN 'ROUND(SUM(' || v_expr || ')::numeric, 2)'
          WHEN 'avg'   THEN 'ROUND(AVG(' || v_expr || ')::numeric, 2)'
          WHEN 'min'   THEN 'MIN(' || v_expr || ')'
          ELSE              'MAX(' || v_expr || ')'
        END;
        v_sel  := v_sel  || (v_aggsql || ' AS c' || v_ccount);
        v_asel := v_asel || (v_aggsql || ' AS c' || v_ccount);
      END IF;
      v_ccount := v_ccount + 1;
    END LOOP;

    IF array_length(v_asel, 1) IS NULL AND v_gcount = 0 THEN
      RAISE EXCEPTION 'report: не выбраны ни агрегаты, ни записи';
    END IF;

    -- Уровень строки = сколько группировок НЕ свёрнуто в подытог.
    -- GROUPING() отличает подытог от настоящего пустого значения группы.
    IF v_gcount > 0 THEN
      v_sel := v_sel || ('(' || v_gcount || ' - ' || array_to_string(v_gterms, ' - ') || ') AS level');
    END IF;

    -- Порядок узлов дерева задаёт клиент (он умеет сортировать и по
    -- агрегату колонки); здесь — только стабильность выборки под LIMIT.
    IF v_gcount > 0 THEN
      v_order := array_to_string(v_galias, ' ASC, ') || ' ASC';
    END IF;

    v_limit := 1000;
    v_sql := 'SELECT ' || array_to_string(v_sel, ', ')
          || ' FROM ' || v_from
          || ' WHERE ' || v_where
          || CASE
               WHEN v_gcount > 0 THEN ' GROUP BY GROUPING SETS (' || array_to_string(v_sets, ', ') || ')'
               ELSE ''
             END
          || CASE WHEN v_order IS NOT NULL THEN ' ORDER BY ' || v_order ELSE '' END
          || ' LIMIT ' || v_limit;

    -- «Итого» — те же агрегаты по всем данным отчёта.
    IF v_gcount > 0 AND array_length(v_asel, 1) IS NOT NULL THEN
      EXECUTE 'SELECT row_to_json(q)::jsonb FROM (SELECT ' || array_to_string(v_asel, ', ')
           || ' FROM ' || v_from || ' WHERE ' || v_where || ') q'
        INTO v_totals;
    END IF;
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

REVOKE EXECUTE ON FUNCTION public.run_report(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_report(uuid, jsonb) TO authenticated, service_role;

-- ── Перенос сохранённых конфигов ──────────────────────────
-- Отчётов было два; смысл каждого сохранён: «Баланс клиентов» был плоским
-- списком (mode=detail), «Количество заказов» — группировкой со счётчиком.
-- Идемпотентно: трогаем только конфиги старого формата (с mode/measures).

UPDATE public.report_definitions
SET config = jsonb_build_object(
  'dataset', 'client_balance',
  'groupBy', '[]'::jsonb,
  'showRecords', true,
  'filter', config -> 'filter',
  'columns', jsonb_build_array(
    jsonb_build_object('key', 'project'),
    jsonb_build_object('key', 'project_status'),
    jsonb_build_object('key', 'billed', 'agg', 'sum'),
    jsonb_build_object('key', 'paid', 'agg', 'sum'),
    jsonb_build_object('key', 'balance', 'agg', 'sum')
  )
)
WHERE config ->> 'dataset' = 'client_balance'
  AND (config ? 'mode' OR config ? 'measures');

UPDATE public.report_definitions
SET config = jsonb_build_object(
  'dataset', 'projects',
  'groupBy', COALESCE(config -> 'groupBy', '[]'::jsonb),
  'showRecords', true,
  'filter', config -> 'filter',
  'columns', jsonb_build_array(
    jsonb_build_object('key', 'template'),
    jsonb_build_object('key', 'project', 'agg', 'count'),
    jsonb_build_object('key', 'status'),
    jsonb_build_object('key', 'created')
  )
)
WHERE config ->> 'dataset' = 'projects'
  AND (config ? 'mode' OR config ? 'measures');
