-- Серверная фильтрация досок (вариант A — union-prefilter).
--
-- Идея: сервер ГРУБО сужает выборку по фильтру доски (union всех списков),
-- а точную фильтрацию по-прежнему делает клиентский движок (src/lib/filters).
-- Поэтому компилятор фильтра обязан возвращать НАДМНОЖЕСТВО того, что отдаёт
-- TS-движок: любое условие, которое он не понимает на 100% (даты, неизвестные
-- поля, неразрешённые sentinel'ы), компилируется в `true` — мы вернём лишнее,
-- но никогда не потеряем нужную строку. Это ключ к надёжности: баг компилятора
-- = чуть больше данных, а не неправильный список.
--
-- Доступ и вычисляемые поля не дублируем — оборачиваем существующие RPC
-- (get_workspace_threads / get_accessible_projects) как подзапрос с алиасом `b`.
--
-- Инъекции невозможны: имена колонок берутся из белого списка (CASE), значения
-- проходят через quote_literal / валидацию uuid-регуляркой.

-- ── Хелперы для значений ──────────────────────────────────────────────

-- Список валидных uuid из jsonb-значения (массив или скаляр) → "'a','b'" или NULL.
-- Невалидные элементы (sentinel'ы, имена) отбрасываются — для uuid-колонки они
-- всё равно никогда не совпали бы, так что отбрасывание сохраняет семантику.
CREATE OR REPLACE FUNCTION public._board_filter_uuid_list(p_value jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT string_agg(quote_literal(v), ',')
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p_value) = 'array' THEN p_value ELSE jsonb_build_array(p_value) END
  ) AS v
  WHERE v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

-- Список текстовых значений (массив или скаляр) → "'x','y'" или NULL.
-- Sentinel'ы вида __me__/__no_status__ отбрасываются.
CREATE OR REPLACE FUNCTION public._board_filter_text_list(p_value jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT string_agg(quote_literal(v), ',')
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p_value) = 'array' THEN p_value ELSE jsonb_build_array(p_value) END
  ) AS v
  WHERE v !~ '^__.*__$';
$$;

-- Есть ли в значении конкретный sentinel (например '__no_status__').
CREATE OR REPLACE FUNCTION public._board_value_has_sentinel(p_value jsonb, p_sentinel text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(p_value) = 'array' THEN p_value ELSE jsonb_build_array(p_value) END
    ) AS v WHERE v = p_sentinel
  );
$$;

-- ── Компиляция одного условия ─────────────────────────────────────────
-- Возвращает булево SQL-выражение над алиасом `b` (строка таблицы базовой RPC).
CREATE OR REPLACE FUNCTION public._board_compile_condition(p_node jsonb, p_entity text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_field text := p_node->>'field';
  v_op    text := p_node->>'operator';
  v_value jsonb := p_node->'value';
  v_col    text;
  v_kind   text := 'none';
  v_jtable text;
  v_jcol   text;
  v_uuids  text;
  v_texts  text;
  v_has_no_status boolean;
  v_like   text;
BEGIN
  -- Белый список (entity, field) → колонка + тип.
  IF p_entity = 'thread' THEN
    CASE v_field
      WHEN 'name'       THEN v_col := 'b.name';       v_kind := 'text';
      WHEN 'type'       THEN v_col := 'b.type';       v_kind := 'text';
      WHEN 'status_id'  THEN v_col := 'b.status_id';  v_kind := 'uuid';
      WHEN 'project_id' THEN v_col := 'b.project_id'; v_kind := 'uuid';
      WHEN 'is_pinned'  THEN v_col := 'b.is_pinned';  v_kind := 'bool';
      WHEN 'created_by' THEN v_col := 'b.created_by'; v_kind := 'uuid';
      WHEN 'assignees'  THEN v_kind := 'junction'; v_jtable := 'task_assignees'; v_jcol := 'thread_id';
      ELSE v_kind := 'none';
    END CASE;
  ELSIF p_entity = 'project' THEN
    CASE v_field
      WHEN 'status_id'              THEN v_col := 'b.status_id';              v_kind := 'uuid';
      WHEN 'template_id'            THEN v_col := 'b.template_id';            v_kind := 'uuid';
      WHEN 'created_by'             THEN v_col := 'b.created_by';             v_kind := 'uuid';
      WHEN 'contact_participant_id' THEN v_col := 'b.contact_participant_id'; v_kind := 'uuid';
      WHEN 'final_kind'             THEN v_col := 'b.final_kind::text';       v_kind := 'text';
      WHEN 'has_active_deadline_task' THEN v_col := 'b.has_active_deadline_task'; v_kind := 'bool';
      WHEN 'is_lead_template'       THEN v_col := 'b.is_lead_template';       v_kind := 'bool';
      WHEN 'participants'           THEN v_kind := 'junction'; v_jtable := 'project_participants'; v_jcol := 'project_id';
      ELSE v_kind := 'none';
    END CASE;
  END IF;

  -- Неизвестное поле или даты (в v1 не сужаем) → не сужаем (надмножество).
  IF v_kind = 'none' THEN RETURN 'true'; END IF;

  -- ── junction (assignees / participants) ──
  IF v_kind = 'junction' THEN
    v_uuids := public._board_filter_uuid_list(v_value);
    IF v_op IN ('in', 'equals') THEN
      IF v_uuids IS NULL THEN RETURN 'true'; END IF;
      RETURN format('EXISTS(SELECT 1 FROM %I j WHERE j.%I = b.id AND j.participant_id IN (%s))', v_jtable, v_jcol, v_uuids);
    ELSIF v_op = 'not_in' THEN
      IF v_uuids IS NULL THEN RETURN 'true'; END IF;
      RETURN format('NOT EXISTS(SELECT 1 FROM %I j WHERE j.%I = b.id AND j.participant_id IN (%s))', v_jtable, v_jcol, v_uuids);
    ELSIF v_op = 'is_null' THEN
      RETURN format('NOT EXISTS(SELECT 1 FROM %I j WHERE j.%I = b.id)', v_jtable, v_jcol);
    ELSIF v_op = 'is_not_null' THEN
      RETURN format('EXISTS(SELECT 1 FROM %I j WHERE j.%I = b.id)', v_jtable, v_jcol);
    END IF;
    RETURN 'true';
  END IF;

  -- ── uuid ──
  IF v_kind = 'uuid' THEN
    v_uuids := public._board_filter_uuid_list(v_value);
    v_has_no_status := public._board_value_has_sentinel(v_value, '__no_status__');
    IF v_op IN ('in', 'equals') THEN
      IF v_uuids IS NULL AND NOT v_has_no_status THEN RETURN 'false'; END IF;
      RETURN '(' || concat_ws(' OR ',
        CASE WHEN v_uuids IS NOT NULL THEN v_col || ' IN (' || v_uuids || ')' END,
        CASE WHEN v_has_no_status THEN v_col || ' IS NULL' END
      ) || ')';
    ELSIF v_op = 'not_in' THEN
      IF v_uuids IS NULL AND NOT v_has_no_status THEN RETURN 'true'; END IF;
      IF v_has_no_status THEN
        -- движок исключает строки без значения
        RETURN '(' || v_col || ' IS NOT NULL' ||
          CASE WHEN v_uuids IS NOT NULL THEN ' AND ' || v_col || ' NOT IN (' || v_uuids || ')' ELSE '' END || ')';
      END IF;
      -- движок оставляет строки без значения (null не входит в список)
      RETURN '(' || v_col || ' IS NULL OR ' || v_col || ' NOT IN (' || v_uuids || '))';
    ELSIF v_op = 'not_equals' THEN
      IF v_uuids IS NULL THEN RETURN 'true'; END IF;
      RETURN '(' || v_col || ' IS DISTINCT FROM ' || v_uuids || ')';
    ELSIF v_op = 'is_null' THEN
      RETURN v_col || ' IS NULL';
    ELSIF v_op = 'is_not_null' THEN
      RETURN v_col || ' IS NOT NULL';
    END IF;
    RETURN 'true';
  END IF;

  -- ── text ──
  IF v_kind = 'text' THEN
    IF v_op = 'contains' THEN
      IF jsonb_typeof(v_value) <> 'string' THEN RETURN 'true'; END IF;
      v_like := replace(replace(replace(v_value #>> '{}', '\', '\\'), '%', '\%'), '_', '\_');
      RETURN format('%s ILIKE %L ESCAPE %L', v_col, '%' || v_like || '%', '\');
    ELSIF v_op = 'equals' THEN
      IF jsonb_typeof(v_value) = 'array' THEN
        v_texts := public._board_filter_text_list(v_value);
        IF v_texts IS NULL THEN RETURN 'true'; END IF;
        RETURN '(' || v_col || ' IN (' || v_texts || '))';
      END IF;
      RETURN format('%s = %L', v_col, v_value #>> '{}');
    ELSIF v_op = 'in' THEN
      v_texts := public._board_filter_text_list(v_value);
      IF v_texts IS NULL THEN RETURN 'true'; END IF;
      RETURN '(' || v_col || ' IN (' || v_texts || '))';
    ELSIF v_op = 'not_in' THEN
      v_texts := public._board_filter_text_list(v_value);
      IF v_texts IS NULL THEN RETURN 'true'; END IF;
      RETURN '(' || v_col || ' IS NULL OR ' || v_col || ' NOT IN (' || v_texts || '))';
    ELSIF v_op = 'not_equals' THEN
      IF jsonb_typeof(v_value) <> 'string' THEN RETURN 'true'; END IF;
      RETURN format('%s IS DISTINCT FROM %L', v_col, v_value #>> '{}');
    ELSIF v_op = 'is_null' THEN
      RETURN v_col || ' IS NULL';
    ELSIF v_op = 'is_not_null' THEN
      RETURN v_col || ' IS NOT NULL';
    END IF;
    RETURN 'true';
  END IF;

  -- ── bool ──
  IF v_kind = 'bool' THEN
    IF v_op = 'equals' AND jsonb_typeof(v_value) = 'boolean' THEN
      RETURN format('%s = %L::boolean', v_col, (v_value #>> '{}'));
    END IF;
    RETURN 'true';
  END IF;

  RETURN 'true';
END $$;

-- ── Рекурсивная компиляция группы ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public._board_compile_group(p_group jsonb, p_entity text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_rule  jsonb;
  v_logic text := lower(COALESCE(p_group->>'logic', 'and'));
  v_parts text[] := '{}';
  v_expr  text;
BEGIN
  IF p_group IS NULL
     OR jsonb_typeof(p_group->'rules') <> 'array'
     OR jsonb_array_length(p_group->'rules') = 0 THEN
    RETURN 'true';
  END IF;

  FOR v_rule IN SELECT * FROM jsonb_array_elements(p_group->'rules') LOOP
    IF v_rule->>'type' = 'group' THEN
      v_expr := public._board_compile_group(v_rule->'group', p_entity);
    ELSE
      v_expr := public._board_compile_condition(v_rule, p_entity);
    END IF;
    v_parts := v_parts || v_expr;
  END LOOP;

  IF v_logic = 'or' THEN
    RETURN '(' || array_to_string(v_parts, ' OR ') || ')';
  END IF;
  RETURN '(' || array_to_string(v_parts, ' AND ') || ')';
END $$;

-- ── Публичные RPC ─────────────────────────────────────────────────────

-- Треды доски, отфильтрованные по union-фильтру (грубое сужение на сервере).
-- Та же сигнатура колонок, что у get_workspace_threads — клиент работает с ней
-- как раньше, только массив меньше.
CREATE OR REPLACE FUNCTION public.get_board_filtered_threads(
  p_workspace_id uuid,
  p_user_id uuid,
  p_filter jsonb
)
RETURNS TABLE(
  id uuid, name text, type text, workspace_id uuid, project_id uuid,
  project_name text, status_id uuid, status_name text, status_color text,
  status_order integer, status_show_to_creator boolean,
  deadline timestamptz, start_at timestamptz, end_at timestamptz,
  accent_color text, icon text, is_pinned boolean, sort_order integer,
  created_at timestamptz, updated_at timestamptz, created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_where text;
BEGIN
  v_where := public._board_compile_group(
    COALESCE(p_filter, '{"logic":"and","rules":[]}'::jsonb), 'thread'
  );
  RETURN QUERY EXECUTE format(
    'SELECT b.* FROM public.get_workspace_threads(%L, %L) b WHERE %s',
    p_workspace_id, p_user_id, v_where
  );
END $$;

-- Проекты доски, отфильтрованные по union-фильтру. Дополнительно отдаёт
-- next_task_deadline (дедлайн ближайшей активной задачи) — раньше это
-- вычислялось на клиенте из полного кэша задач; теперь — на сервере, чтобы
-- проектные списки не зависели от загрузки всех тредов.
CREATE OR REPLACE FUNCTION public.get_board_filtered_projects(
  p_workspace_id uuid,
  p_user_id uuid,
  p_filter jsonb
)
RETURNS TABLE(
  id uuid, name text, description text, workspace_id uuid,
  created_at timestamptz, updated_at timestamptz, created_by uuid,
  deadline timestamptz, status_id uuid, template_id uuid,
  google_drive_folder_link text, source_folder_id text, export_folder_id text,
  messenger_link_code text, last_activity_at timestamptz, template_name text,
  has_active_deadline_task boolean, is_lead_template boolean,
  final_kind status_final_kind, contact_participant_id uuid,
  next_task_id uuid, next_task_name text, next_task_deadline timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_where text;
BEGIN
  v_where := public._board_compile_group(
    COALESCE(p_filter, '{"logic":"and","rules":[]}'::jsonb), 'project'
  );
  RETURN QUERY EXECUTE format(
    'SELECT b.*, ntd.next_task_id, ntd.next_task_name, ntd.next_task_deadline
       FROM public.get_accessible_projects(%L, %L) b
       LEFT JOIN LATERAL (
         SELECT th.id AS next_task_id, th.name AS next_task_name, th.deadline AS next_task_deadline
         FROM project_threads th
         LEFT JOIN statuses s ON s.id = th.status_id
         WHERE th.project_id = b.id
           AND th.type = ''task''
           AND th.is_deleted = false
           AND th.deadline IS NOT NULL
           AND (s.id IS NULL OR s.is_final = false)
         ORDER BY th.deadline ASC
         LIMIT 1
       ) ntd ON true
      WHERE %s',
    p_workspace_id, p_user_id, v_where
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_board_filtered_threads(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_board_filtered_projects(uuid, uuid, jsonb) TO authenticated;
