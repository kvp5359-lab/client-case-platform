-- Аудит производительности/БД 2026-06-13.
-- _board_compile_condition: для uuid-поля оператор not_equals с массивом >1 значения
-- генерировал битый SQL `col IS DISTINCT FROM 'a','b'` → синтаксическая ошибка,
-- роняющая весь RPC (нарушая собственный принцип «непонятное → надмножество, не ошибка»).
-- Сейчас из UI для uuid not_equals не предлагается, но защищаемся: разворачиваем
-- в NOT IN (как ветка not_in) — корректно при 1 и N значениях.
-- Меняется ТОЛЬКО ветка uuid/not_equals; остальное тело идентично живому.

CREATE OR REPLACE FUNCTION public._board_compile_condition(p_node jsonb, p_entity text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
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

  IF v_kind = 'none' THEN RETURN 'true'; END IF;

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
        RETURN '(' || v_col || ' IS NOT NULL' ||
          CASE WHEN v_uuids IS NOT NULL THEN ' AND ' || v_col || ' NOT IN (' || v_uuids || ')' ELSE '' END || ')';
      END IF;
      RETURN '(' || v_col || ' IS NULL OR ' || v_col || ' NOT IN (' || v_uuids || '))';
    ELSIF v_op = 'not_equals' THEN
      IF v_uuids IS NULL THEN RETURN 'true'; END IF;
      -- Фикс: разворачиваем в NOT IN (корректно при 1 и N значениях),
      -- раньше было `IS DISTINCT FROM <список>` → битый SQL при >1 значении.
      RETURN '(' || v_col || ' IS NULL OR ' || v_col || ' NOT IN (' || v_uuids || '))';
    ELSIF v_op = 'is_null' THEN
      RETURN v_col || ' IS NULL';
    ELSIF v_op = 'is_not_null' THEN
      RETURN v_col || ' IS NOT NULL';
    END IF;
    RETURN 'true';
  END IF;

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

  IF v_kind = 'bool' THEN
    IF v_op = 'equals' AND jsonb_typeof(v_value) = 'boolean' THEN
      RETURN format('%s = %L::boolean', v_col, (v_value #>> '{}'));
    END IF;
    RETURN 'true';
  END IF;

  RETURN 'true';
END $function$;
