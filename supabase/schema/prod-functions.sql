-- ЭТАЛОН функций боевой базы (снимок через MCP). НЕ применять напрямую.
-- Источник правды для сверки дрейфа repo↔prod. Обновлять при изменении функций.
-- Снято: 2026-07-04. Функций: 311.


CREATE OR REPLACE FUNCTION public._board_compile_condition(p_node jsonb, p_entity text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
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
END $function$


CREATE OR REPLACE FUNCTION public._board_compile_group(p_group jsonb, p_entity text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
END $function$


CREATE OR REPLACE FUNCTION public._board_filter_text_list(p_value jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT string_agg(quote_literal(v), ',')
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p_value) = 'array' THEN p_value ELSE jsonb_build_array(p_value) END
  ) AS v
  WHERE v !~ '^__.*__$';
$function$


CREATE OR REPLACE FUNCTION public._board_filter_uuid_list(p_value jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT string_agg(quote_literal(v), ',')
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p_value) = 'array' THEN p_value ELSE jsonb_build_array(p_value) END
  ) AS v
  WHERE v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$function$


CREATE OR REPLACE FUNCTION public._board_value_has_sentinel(p_value jsonb, p_sentinel text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(p_value) = 'array' THEN p_value ELSE jsonb_build_array(p_value) END
    ) AS v WHERE v = p_sentinel
  );
$function$


CREATE OR REPLACE FUNCTION public._report_condition_sql(p_cond jsonb, p_fields jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public._report_filter_sql(p_group jsonb, p_fields jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public._schema_function_manifest()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.name, t.args), '[]'::jsonb)
  FROM (
    SELECT p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS returns,
           l.lanname AS lang,
           CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END AS security,
           md5(pg_get_functiondef(p.oid)) AS body_md5
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname <> '_schema_function_manifest'
  ) t;
$function$


CREATE OR REPLACE FUNCTION public.add_creator_as_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  creator_participant_id UUID;
BEGIN
  -- Находим participant_id создателя проекта
  SELECT p.id INTO creator_participant_id
  FROM participants p
  WHERE p.user_id = NEW.created_by
  AND p.workspace_id = NEW.workspace_id
  AND p.is_deleted = false
  LIMIT 1;
  
  -- Если нашли участника, добавляем его как администратора проекта
  IF creator_participant_id IS NOT NULL THEN
    INSERT INTO project_participants (project_id, participant_id, project_roles)
    VALUES (NEW.id, creator_participant_id, ARRAY['Администратор']); -- Исправлено с 'administrator' на 'Администратор'
  END IF;
  
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.add_document_version(p_document_id uuid, p_file_path text, p_file_name text, p_file_size bigint, p_mime_type text, p_checksum text DEFAULT NULL::text, p_file_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_version INT;
  v_new_id UUID;
  v_workspace_id UUID;
BEGIN
  -- Получить workspace_id документа
  SELECT workspace_id INTO v_workspace_id
  FROM documents WHERE id = p_document_id;
  
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;
  
  -- Получить следующий номер версии
  SELECT COALESCE(MAX(version), 0) + 1 
  INTO v_new_version
  FROM document_files 
  WHERE document_id = p_document_id;
  
  -- Сбросить флаг is_current у всех версий
  UPDATE document_files 
  SET is_current = false 
  WHERE document_id = p_document_id;
  
  -- Вставить новую версию
  INSERT INTO document_files (
    document_id, workspace_id, version, is_current,
    file_path, file_name, file_size, mime_type, checksum,
    uploaded_by, file_id
  ) VALUES (
    p_document_id, v_workspace_id, v_new_version, true,
    p_file_path, p_file_name, p_file_size, p_mime_type, p_checksum,
    auth.uid(), p_file_id
  ) RETURNING id INTO v_new_id;
  
  RETURN v_new_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.add_document_version_service(p_document_id uuid, p_file_path text, p_file_name text, p_file_size bigint, p_mime_type text, p_checksum text DEFAULT NULL::text, p_file_id uuid DEFAULT NULL::uuid, p_uploaded_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_version INT;
  v_new_id UUID;
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM documents WHERE id = p_document_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_new_version
  FROM document_files
  WHERE document_id = p_document_id;

  UPDATE document_files
  SET is_current = false
  WHERE document_id = p_document_id;

  INSERT INTO document_files (
    document_id, workspace_id, version, is_current,
    file_path, file_name, file_size, mime_type, checksum,
    uploaded_by, file_id
  ) VALUES (
    p_document_id, v_workspace_id, v_new_version, true,
    p_file_path, p_file_name, p_file_size, p_mime_type, p_checksum,
    p_uploaded_by, p_file_id
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.add_external_contact_role_to_new_workspace()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO workspace_roles (workspace_id, name, is_system, is_owner, order_index, permissions, color)
  VALUES (
    NEW.id,
    'Внешний контакт',
    true,
    false,
    100,
    '{
      "manage_roles": false, "create_projects": false, "manage_features": false,
      "manage_statuses": false, "delete_workspace": false, "manage_templates": false,
      "edit_all_projects": false, "view_all_projects": false, "delete_all_projects": false,
      "manage_participants": false, "view_knowledge_base": false, "manage_knowledge_base": false,
      "view_workspace_digest": false, "manage_workspace_settings": false
    }'::jsonb,
    '#94a3b8'
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.add_folders_to_kit_template(p_kit_template_id uuid, p_folder_template_ids uuid[], p_start_order_index integer DEFAULT 0)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ft_id UUID;
  v_new_folder_id UUID;
  v_idx INT := 0;
BEGIN
  FOREACH v_ft_id IN ARRAY p_folder_template_ids
  LOOP
    -- Копируем данные из folder_templates в document_kit_template_folders
    INSERT INTO document_kit_template_folders (
      kit_template_id,
      folder_template_id,
      name,
      description,
      ai_naming_prompt,
      ai_check_prompt,
      knowledge_article_id,
      order_index
    )
    SELECT
      p_kit_template_id,
      ft.id,
      ft.name,
      ft.description,
      ft.ai_naming_prompt,
      ft.ai_check_prompt,
      ft.knowledge_article_id,
      p_start_order_index + v_idx
    FROM folder_templates ft
    WHERE ft.id = v_ft_id
    RETURNING id INTO v_new_folder_id;

    -- Копируем слоты из folder_template_slots в document_kit_template_folder_slots
    IF v_new_folder_id IS NOT NULL THEN
      INSERT INTO document_kit_template_folder_slots (kit_folder_id, name, sort_order)
      SELECT v_new_folder_id, fts.name, fts.sort_order
      FROM folder_template_slots fts
      WHERE fts.folder_template_id = v_ft_id;
    END IF;

    RETURN NEXT v_new_folder_id;
    v_idx := v_idx + 1;
  END LOOP;
END;
$function$


CREATE OR REPLACE FUNCTION public.add_message_pair(p_conversation_id uuid, p_user_message text, p_assistant_message text, p_user_id uuid, p_document_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_msg_id UUID;
  v_assistant_msg_id UUID;
  v_doc_id UUID;
  v_result JSON;
BEGIN
  -- 1. Вставляем сообщение пользователя
  INSERT INTO messages (conversation_id, content, sender_type, sender_id)
  VALUES (p_conversation_id, p_user_message, 'user', p_user_id)
  RETURNING id INTO v_user_msg_id;

  -- 2. Вставляем ответ AI
  INSERT INTO messages (conversation_id, content, sender_type, sender_id)
  VALUES (p_conversation_id, p_assistant_message, 'assistant', NULL)
  RETURNING id INTO v_assistant_msg_id;

  -- 3. Привязываем документы к обоим сообщениям
  IF array_length(p_document_ids, 1) > 0 THEN
    FOREACH v_doc_id IN ARRAY p_document_ids LOOP
      INSERT INTO message_context (message_id, context_type, context_id)
      VALUES (v_user_msg_id, 'document', v_doc_id);

      INSERT INTO message_context (message_id, context_type, context_id)
      VALUES (v_assistant_msg_id, 'document', v_doc_id);
    END LOOP;
  END IF;

  -- 4. Возвращаем данные ответа AI (как раньше возвращал addMessagePair)
  SELECT json_build_object(
    'id', m.id,
    'conversation_id', m.conversation_id,
    'content', m.content,
    'sender_type', m.sender_type,
    'sender_id', m.sender_id,
    'created_at', m.created_at
  ) INTO v_result
  FROM messages m
  WHERE m.id = v_assistant_msg_id;

  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_list_workspaces()
 RETURNS TABLE(workspace_id uuid, workspace_name text, created_at timestamp with time zone, plan_code text, plan_name text, billing_status text, participants_count integer, projects_count integer, storage_mb integer, ai_tokens_used bigint, ai_tokens_monthly bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_platform_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Доступ только для администратора платформы';
  END IF;
  RETURN QUERY
  SELECT
    w.id, w.name, w.created_at,
    pl.code, pl.name, b.status,
    (SELECT count(*)::int FROM participants p WHERE p.workspace_id=w.id AND p.is_deleted=false AND p.user_id IS NOT NULL),
    (SELECT count(*)::int FROM projects pr WHERE pr.workspace_id=w.id AND pr.is_deleted=false),
    (SELECT COALESCE(round(sum(f.file_size)/1048576.0),0)::int FROM files f WHERE f.workspace_id=w.id),
    (SELECT COALESCE(sum(m.total_tokens),0)::bigint FROM ai_usage_monthly m
       WHERE m.workspace_id=w.id AND m.period=date_trunc('month', now())::date),
    pl.ai_tokens_monthly
  FROM workspaces w
  LEFT JOIN workspace_billing b ON b.workspace_id=w.id
  LEFT JOIN plans pl ON pl.id=b.plan_id
  ORDER BY w.created_at;
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_set_workspace_plan(p_workspace_id uuid, p_plan_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_plan_id uuid;
BEGIN
  IF NOT is_platform_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Доступ только для администратора платформы';
  END IF;
  IF p_plan_code IS NULL THEN
    DELETE FROM workspace_billing WHERE workspace_id = p_workspace_id;
    RETURN;
  END IF;
  SELECT id INTO v_plan_id FROM plans WHERE code = p_plan_code;
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Тариф не найден: %', p_plan_code;
  END IF;
  INSERT INTO workspace_billing (workspace_id, plan_id, status, current_period_start, updated_at)
  VALUES (p_workspace_id, v_plan_id, 'active', now(), now())
  ON CONFLICT (workspace_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id, status = 'active', updated_at = now();
END;
$function$


CREATE OR REPLACE FUNCTION public.append_telegram_message_id(p_message_id uuid, p_tg_msg_id bigint, p_chat_id bigint)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.project_messages
  SET telegram_message_ids = array_append(
        COALESCE(telegram_message_ids, '{}'),
        p_tg_msg_id
      ),
      telegram_chat_id = p_chat_id
  WHERE id = p_message_id
    AND NOT (telegram_message_ids @> ARRAY[p_tg_msg_id]);
$function$


CREATE OR REPLACE FUNCTION public.auto_advance_project_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_final boolean;
BEGIN
  IF NEW.status_id IS NULL OR NEW.status_id IS NOT DISTINCT FROM OLD.status_id THEN
    RETURN NEW;
  END IF;
  IF NEW.project_id IS NULL OR NEW.on_complete_set_project_status_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.is_final INTO v_is_final
  FROM public.statuses s WHERE s.id = NEW.status_id;
  IF NOT COALESCE(v_is_final, false) THEN
    RETURN NEW;
  END IF;

  UPDATE public.projects
  SET status_id = NEW.on_complete_set_project_status_id, updated_at = now()
  WHERE id = NEW.project_id;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.auto_resolve_send_failures_on_sent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.send_status = 'sent' AND OLD.send_status IS DISTINCT FROM 'sent' THEN
    -- resolved_by НЕ трогаем: колонка имеет FK на auth.users(id), а
    -- NEW.sender_participant_id — это participants.id (другая таблица).
    -- Запись participant.id сюда давала 23503 (FK violation), что валило
    -- КАЖДЫЙ переход send_status в 'sent' → сообщение залипало в 'failed'
    -- несмотря на реальную доставку в Telegram → дубль при «Повторить».
    -- Авто-закрытие системное, «кем» не важно — достаточно resolved_at.
    UPDATE public.message_send_failures
    SET resolved_at = now()
    WHERE resolved_at IS NULL
      AND metadata->>'message_id' = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.calculate_service_group_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_id UUID;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_group_id := OLD.group_id;
  ELSE
    v_group_id := NEW.group_id;
  END IF;

  IF v_group_id IS NOT NULL THEN
    UPDATE project_service_groups
    SET total_amount = COALESCE(
      (SELECT SUM(total_amount) FROM project_service_items WHERE group_id = v_group_id AND deleted_at IS NULL),
      0
    )
    WHERE id = v_group_id;
  END IF;

  IF (TG_OP = 'UPDATE' AND OLD.group_id IS DISTINCT FROM NEW.group_id) THEN
    IF OLD.group_id IS NOT NULL THEN
      UPDATE project_service_groups
      SET total_amount = COALESCE(
        (SELECT SUM(total_amount) FROM project_service_items WHERE group_id = OLD.group_id AND deleted_at IS NULL),
        0
      )
      WHERE id = OLD.group_id;
    END IF;
  END IF;

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.calculate_service_item_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.total_amount = NEW.quantity * NEW.price;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.can_user_access_board(b boards, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id uuid;
  v_roles text[];
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  SELECT par.id, par.workspace_roles INTO v_participant_id, v_roles
    FROM participants par
    WHERE par.user_id = p_user_id
      AND par.workspace_id = b.workspace_id
      AND par.is_deleted = false;
  IF v_participant_id IS NULL THEN RETURN false; END IF;
  v_roles := COALESCE(v_roles, '{}');

  IF EXISTS (SELECT 1 FROM board_members bm
    WHERE bm.board_id = b.id AND bm.participant_id = v_participant_id) THEN
    RETURN true;
  END IF;

  IF b.access_type = 'private' THEN
    RETURN b.created_by = p_user_id;
  END IF;

  IF b.access_type = 'workspace' THEN
    RETURN EXISTS (SELECT 1 FROM unnest(v_roles) r WHERE public.is_staff_role(r));
  END IF;

  IF b.access_type = 'custom' THEN
    RETURN v_roles && COALESCE(b.access_roles, '{}');
  END IF;

  RETURN false;
END;
$function$


CREATE OR REPLACE FUNCTION public.can_user_access_board(p_board_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_board public.boards;
BEGIN
  IF p_board_id IS NULL OR p_user_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_board FROM public.boards WHERE id = p_board_id;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN public.can_user_access_board(v_board, p_user_id);
END;
$function$


CREATE OR REPLACE FUNCTION public.can_user_access_thread(p_thread_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_thread RECORD;
  v_participant_id uuid;
  v_project_roles text[];
  v_workspace_roles text[];
BEGIN
  IF p_thread_id IS NULL OR p_user_id IS NULL THEN RETURN false; END IF;

  SELECT id, type, project_id, workspace_id, access_type, access_roles, created_by, owner_user_id
    INTO v_thread FROM project_threads WHERE id = p_thread_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_thread.project_id IS NULL THEN
    IF v_thread.owner_user_id = p_user_id THEN RETURN true; END IF;
    IF v_thread.created_by = p_user_id THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM task_assignees ta JOIN participants par ON par.id = ta.participant_id
      WHERE ta.thread_id = p_thread_id AND par.user_id = p_user_id AND par.is_deleted = false) THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM project_thread_members ptm JOIN participants par ON par.id = ptm.participant_id
      WHERE ptm.thread_id = p_thread_id AND par.user_id = p_user_id AND par.is_deleted = false) THEN RETURN true; END IF;
    RETURN EXISTS (SELECT 1 FROM participants par
      JOIN workspace_roles wr ON wr.name = ANY(par.workspace_roles) AND wr.workspace_id = par.workspace_id
      WHERE par.user_id = p_user_id AND par.workspace_id = v_thread.workspace_id AND par.is_deleted = false
        AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true));
  END IF;

  SELECT par.id, par.workspace_roles INTO v_participant_id, v_workspace_roles
    FROM participants par
    WHERE par.user_id = p_user_id AND par.workspace_id = v_thread.workspace_id AND par.is_deleted = false;
  IF v_participant_id IS NULL THEN RETURN false; END IF;
  v_workspace_roles := COALESCE(v_workspace_roles, '{}');

  IF EXISTS(SELECT 1 FROM workspace_roles wr
    WHERE wr.workspace_id = v_thread.workspace_id AND wr.name = ANY(v_workspace_roles)
      AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true)) THEN RETURN true; END IF;

  -- Исполнитель задачи — НЕЗАВИСИМО от участия в проекте.
  IF EXISTS(SELECT 1 FROM task_assignees ta
    WHERE ta.thread_id = p_thread_id AND ta.participant_id = v_participant_id) THEN RETURN true; END IF;
  -- Явный участник треда — НЕЗАВИСИМО от участия в проекте и режима.
  IF EXISTS(SELECT 1 FROM project_thread_members ptm
    WHERE ptm.thread_id = p_thread_id AND ptm.participant_id = v_participant_id) THEN RETURN true; END IF;

  IF v_thread.created_by = p_user_id THEN RETURN true; END IF;

  SELECT pp.project_roles INTO v_project_roles
    FROM project_participants pp
    WHERE pp.project_id = v_thread.project_id AND pp.participant_id = v_participant_id;
  IF v_project_roles IS NULL THEN RETURN false; END IF;

  IF 'Администратор' = ANY(v_project_roles) THEN RETURN true; END IF;
  IF v_thread.access_type = 'all' THEN RETURN true; END IF;
  IF v_thread.access_type = 'roles' AND COALESCE(v_thread.access_roles, '{}') && v_project_roles THEN RETURN true; END IF;
  RETURN false;
END;
$function$


CREATE OR REPLACE FUNCTION public.can_user_access_thread(t project_threads, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id uuid;
  v_project_roles text[];
  v_workspace_roles text[];
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  IF t.project_id IS NULL THEN
    IF t.owner_user_id = p_user_id THEN RETURN true; END IF;
    IF t.created_by = p_user_id THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM task_assignees ta JOIN participants par ON par.id = ta.participant_id
      WHERE ta.thread_id = t.id AND par.user_id = p_user_id AND par.is_deleted = false) THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM project_thread_members ptm JOIN participants par ON par.id = ptm.participant_id
      WHERE ptm.thread_id = t.id AND par.user_id = p_user_id AND par.is_deleted = false) THEN RETURN true; END IF;
    RETURN EXISTS (SELECT 1 FROM participants par
      JOIN workspace_roles wr ON wr.name = ANY(par.workspace_roles) AND wr.workspace_id = par.workspace_id
      WHERE par.user_id = p_user_id AND par.workspace_id = t.workspace_id AND par.is_deleted = false
        AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true));
  END IF;

  SELECT par.id, par.workspace_roles INTO v_participant_id, v_workspace_roles
    FROM participants par
    WHERE par.user_id = p_user_id AND par.workspace_id = t.workspace_id AND par.is_deleted = false;
  IF v_participant_id IS NULL THEN RETURN false; END IF;
  v_workspace_roles := COALESCE(v_workspace_roles, '{}');

  IF EXISTS(SELECT 1 FROM workspace_roles wr
    WHERE wr.workspace_id = t.workspace_id AND wr.name = ANY(v_workspace_roles)
      AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true)) THEN RETURN true; END IF;

  -- Исполнитель задачи — НЕЗАВИСИМО от участия в проекте.
  IF EXISTS(SELECT 1 FROM task_assignees ta
    WHERE ta.thread_id = t.id AND ta.participant_id = v_participant_id) THEN RETURN true; END IF;
  -- Явный участник треда — НЕЗАВИСИМО от участия в проекте и режима.
  IF EXISTS(SELECT 1 FROM project_thread_members ptm
    WHERE ptm.thread_id = t.id AND ptm.participant_id = v_participant_id) THEN RETURN true; END IF;

  IF t.created_by = p_user_id THEN RETURN true; END IF;

  SELECT pp.project_roles INTO v_project_roles
    FROM project_participants pp
    WHERE pp.project_id = t.project_id AND pp.participant_id = v_participant_id;
  IF v_project_roles IS NULL THEN RETURN false; END IF;

  IF 'Администратор' = ANY(v_project_roles) THEN RETURN true; END IF;
  IF t.access_type = 'all' THEN RETURN true; END IF;
  IF t.access_type = 'roles' AND COALESCE(t.access_roles, '{}') && v_project_roles THEN RETURN true; END IF;
  RETURN false;
END;
$function$


CREATE OR REPLACE FUNCTION public.can_view_conversation(p_conversation_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conversation RECORD;
BEGIN
  SELECT c.created_by, c.visibility, c.workspace_id, c.project_id
  INTO v_conversation
  FROM conversations c
  WHERE c.id = p_conversation_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Создатель всегда видит свой диалог
  IF v_conversation.created_by = p_user_id THEN
    RETURN TRUE;
  END IF;
  
  -- Проверка по visibility
  CASE v_conversation.visibility
    WHEN 'private' THEN
      RETURN FALSE;
    WHEN 'team' THEN
      RETURN is_workspace_team_member(v_conversation.workspace_id, p_user_id);
    WHEN 'all' THEN
      IF v_conversation.project_id IS NOT NULL THEN
        RETURN is_project_participant(v_conversation.project_id, p_user_id);
      ELSE
        RETURN is_workspace_team_member(v_conversation.workspace_id, p_user_id);
      END IF;
  END CASE;
  
  RETURN FALSE;
END;
$function$


CREATE OR REPLACE FUNCTION public.can_view_thread(p_thread_id uuid, p_workspace_id uuid, p_access_type text, p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- No project = workspace-level thread
    WHEN p_project_id IS NULL THEN
      EXISTS (
        SELECT 1 FROM public.participants
        WHERE workspace_id = p_workspace_id
          AND user_id = auth.uid()
          AND is_deleted = false
      )

    -- access_type = 'all' → any project participant
    WHEN p_access_type = 'all' THEN
      EXISTS (
        SELECT 1
        FROM public.project_participants pp
        JOIN public.participants p ON p.id = pp.participant_id
        WHERE pp.project_id = p_project_id
          AND p.user_id = auth.uid()
          AND p.is_deleted = false
      )

    -- access_type = 'roles' → user's project_roles overlap thread's access_roles
    WHEN p_access_type = 'roles' THEN
      EXISTS (
        SELECT 1
        FROM public.project_participants pp
        JOIN public.participants p ON p.id = pp.participant_id
        JOIN public.project_threads pt ON pt.id = p_thread_id
        WHERE pp.project_id = p_project_id
          AND p.user_id = auth.uid()
          AND p.is_deleted = false
          AND pp.project_roles && pt.access_roles
      )

    -- access_type = 'custom' → user is a member or creator
    WHEN p_access_type = 'custom' THEN
      EXISTS (
        SELECT 1
        FROM public.project_thread_members ptm
        JOIN public.participants p ON p.id = ptm.participant_id
        WHERE ptm.thread_id = p_thread_id
          AND p.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.project_threads
        WHERE id = p_thread_id AND created_by = auth.uid()
      )

    ELSE false
  END;
$function$


CREATE OR REPLACE FUNCTION public.check_workspace_participant(p_workspace_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result BOOLEAN;
  v_auth_uid UUID;
BEGIN
  -- Получаем auth.uid() для логирования
  v_auth_uid := auth.uid();
  
  -- Проверяем участие
  SELECT EXISTS (
    SELECT 1 FROM participants p
    WHERE p.workspace_id = p_workspace_id
      AND p.user_id = p_user_id
      AND p.is_deleted = false
  ) INTO v_result;
  
  -- Логируем результат через RAISE NOTICE (будет в логах Postgres)
  RAISE LOG 'check_workspace_participant: workspace_id=%, user_id=%, auth_uid=%, result=%', 
    p_workspace_id, p_user_id, v_auth_uid, v_result;
  
  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_states()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM oauth_states WHERE expires_at < now() - interval '1 hour';
END;
$function$


CREATE OR REPLACE FUNCTION public.cleanup_old_export_progress()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM export_progress
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$function$


CREATE OR REPLACE FUNCTION public.compute_thread_inbox_meta(p_thread_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_thread RECORD; v_lm RECORD; v_le RECORD; v_lr RECORD;
BEGIN
  SELECT id, type, inbox_sort_at, created_at, email_last_external_address
    INTO v_thread FROM project_threads WHERE id = p_thread_id AND is_deleted = false;
  IF NOT FOUND THEN DELETE FROM thread_inbox_meta WHERE thread_id = p_thread_id; RETURN; END IF;

  SELECT pm.id, pm.created_at, pm.content, pm.sender_participant_id, pm.sender_name, pm.sender_role INTO v_lm
    FROM project_messages pm WHERE pm.thread_id = p_thread_id AND pm.source <> 'telegram_service'::message_source
    ORDER BY pm.created_at DESC, pm.id DESC LIMIT 1;

  SELECT al.id, al.created_at, al.action, al.details, al.user_id INTO v_le
    FROM audit_logs al WHERE al.resource_id = p_thread_id AND al.resource_type IN ('task','thread')
    ORDER BY al.created_at DESC, al.id DESC LIMIT 1;

  SELECT mr.id, mr.emoji, mr.created_at, pm.id AS msg_id, pm.content, mr.participant_id, mr.telegram_user_id INTO v_lr
    FROM message_reactions mr JOIN project_messages pm ON pm.id = mr.message_id
    WHERE pm.thread_id = p_thread_id ORDER BY mr.created_at DESC, mr.id DESC LIMIT 1;

  INSERT INTO thread_inbox_meta AS m (
    thread_id, last_message_id, last_message_at, last_message_text, last_sender_participant_id,
    last_sender_name, last_sender_role, last_message_attachment_name, last_message_attachment_mime, last_message_attachment_count,
    last_event_id, last_event_at, last_event_action, last_event_details, last_event_actor_user_id,
    last_reaction_id, last_reaction_emoji, last_reaction_at, last_reaction_message_id,
    last_reaction_message_text, last_reactor_participant_id, last_reactor_telegram_user_id,
    channel_type, has_external, last_from_staff, email_contact, email_subject, sort_at, updated_at
  ) VALUES (
    p_thread_id, v_lm.id, v_lm.created_at, v_lm.content, v_lm.sender_participant_id,
    v_lm.sender_name, v_lm.sender_role,
    (SELECT ma.file_name FROM message_attachments ma WHERE ma.message_id = v_lm.id ORDER BY ma.created_at ASC, ma.id ASC LIMIT 1),
    (SELECT ma.mime_type FROM message_attachments ma WHERE ma.message_id = v_lm.id ORDER BY ma.created_at ASC, ma.id ASC LIMIT 1),
    COALESCE((SELECT count(*)::int FROM message_attachments ma WHERE ma.message_id = v_lm.id), 0),
    v_le.id, v_le.created_at, v_le.action, v_le.details, v_le.user_id,
    v_lr.id, v_lr.emoji, v_lr.created_at, v_lr.msg_id, v_lr.content, v_lr.participant_id, v_lr.telegram_user_id,
    CASE WHEN EXISTS(SELECT 1 FROM project_telegram_chats ptc WHERE ptc.thread_id = p_thread_id AND ptc.is_active) THEN 'telegram'
         WHEN EXISTS(SELECT 1 FROM project_thread_email_links el WHERE el.thread_id = p_thread_id AND el.is_active) OR v_thread.type = 'email' THEN 'email'
         ELSE 'web' END,
    EXISTS(SELECT 1 FROM project_messages e WHERE e.thread_id = p_thread_id
           AND e.source IN ('telegram'::message_source,'telegram_business'::message_source,'telegram_mtproto'::message_source,'wazzup'::message_source,'email_internal'::message_source,'email'::message_source)),
    is_staff_role(v_lm.sender_role),
    COALESCE((SELECT el.contact_email FROM project_thread_email_links el WHERE el.thread_id = p_thread_id AND el.is_active ORDER BY el.created_at LIMIT 1), v_thread.email_last_external_address),
    (SELECT el.subject FROM project_thread_email_links el WHERE el.thread_id = p_thread_id AND el.is_active ORDER BY el.created_at LIMIT 1),
    COALESCE(v_thread.inbox_sort_at, GREATEST(v_lm.created_at, v_le.created_at), v_thread.created_at), now()
  )
  ON CONFLICT (thread_id) DO UPDATE SET
    last_message_id=EXCLUDED.last_message_id, last_message_at=EXCLUDED.last_message_at, last_message_text=EXCLUDED.last_message_text,
    last_sender_participant_id=EXCLUDED.last_sender_participant_id, last_sender_name=EXCLUDED.last_sender_name, last_sender_role=EXCLUDED.last_sender_role,
    last_message_attachment_name=EXCLUDED.last_message_attachment_name, last_message_attachment_mime=EXCLUDED.last_message_attachment_mime,
    last_message_attachment_count=EXCLUDED.last_message_attachment_count, last_event_id=EXCLUDED.last_event_id, last_event_at=EXCLUDED.last_event_at,
    last_event_action=EXCLUDED.last_event_action, last_event_details=EXCLUDED.last_event_details, last_event_actor_user_id=EXCLUDED.last_event_actor_user_id,
    last_reaction_id=EXCLUDED.last_reaction_id, last_reaction_emoji=EXCLUDED.last_reaction_emoji, last_reaction_at=EXCLUDED.last_reaction_at,
    last_reaction_message_id=EXCLUDED.last_reaction_message_id, last_reaction_message_text=EXCLUDED.last_reaction_message_text,
    last_reactor_participant_id=EXCLUDED.last_reactor_participant_id, last_reactor_telegram_user_id=EXCLUDED.last_reactor_telegram_user_id,
    channel_type=EXCLUDED.channel_type, has_external=EXCLUDED.has_external, last_from_staff=EXCLUDED.last_from_staff,
    email_contact=EXCLUDED.email_contact, email_subject=EXCLUDED.email_subject, sort_at=EXCLUDED.sort_at, updated_at=now();
END;
$function$


CREATE OR REPLACE FUNCTION public.context_note_visible(p_project_id uuid, p_workspace_id uuid, p_access_type text, p_access_roles text[], p_created_by uuid, p_item_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id uuid;
  v_project_roles text[];
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  -- Автор заметки — всегда
  IF p_created_by = p_user_id THEN RETURN true; END IF;

  -- Владелец / админ воркспейса (view_all_projects) — всегда
  IF EXISTS (
    SELECT 1 FROM participants par
    JOIN workspace_roles wr ON wr.name = ANY(par.workspace_roles) AND wr.workspace_id = par.workspace_id
    WHERE par.user_id = p_user_id AND par.workspace_id = p_workspace_id AND par.is_deleted = false
      AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true)
  ) THEN
    RETURN true;
  END IF;

  -- Личность в проекте
  SELECT par.id INTO v_participant_id
    FROM participants par
    WHERE par.user_id = p_user_id AND par.workspace_id = p_workspace_id AND par.is_deleted = false;
  IF v_participant_id IS NULL THEN RETURN false; END IF;

  -- Явный участник заметки (режим custom) — всегда
  IF EXISTS (
    SELECT 1 FROM project_context_item_members m
    WHERE m.item_id = p_item_id AND m.participant_id = v_participant_id
  ) THEN
    RETURN true;
  END IF;

  SELECT pp.project_roles INTO v_project_roles
    FROM project_participants pp
    WHERE pp.project_id = p_project_id AND pp.participant_id = v_participant_id;
  v_project_roles := COALESCE(v_project_roles, '{}');

  -- Команда (Администратор / Исполнитель) видит всегда — по требованию
  IF 'Администратор' = ANY(v_project_roles) OR 'Исполнитель' = ANY(v_project_roles) THEN
    RETURN true;
  END IF;

  IF p_access_type = 'all' THEN RETURN true; END IF;
  IF p_access_type = 'roles' AND COALESCE(p_access_roles, '{}') && v_project_roles THEN RETURN true; END IF;
  RETURN false;
END;
$function$


CREATE OR REPLACE FUNCTION public.convert_external_event_to_task(p_workspace_id uuid, p_project_id uuid, p_name text, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_calendar_id uuid, p_google_event_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_thread_id uuid;
  v_user_id uuid := auth.uid();
  v_participant_id uuid;
  v_sort_order int := 10;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM set_config('clientcase.skip_mirror', 'on', true);

  IF p_project_id IS NOT NULL THEN
    SELECT COALESCE(MAX(sort_order), 0) + 10 INTO v_sort_order
    FROM project_threads
    WHERE project_id = p_project_id AND is_deleted = false;
  END IF;

  INSERT INTO project_threads (
    project_id, workspace_id, name, type, access_type,
    sort_order, start_at, end_at
  )
  VALUES (
    p_project_id, p_workspace_id, p_name, 'task', 'all',
    v_sort_order, p_start_at, p_end_at
  )
  RETURNING id INTO v_thread_id;

  INSERT INTO task_google_event_map (thread_id, user_id, calendar_id, google_event_id)
  VALUES (v_thread_id, v_user_id, p_calendar_id, p_google_event_id);

  SELECT id INTO v_participant_id
  FROM participants
  WHERE user_id = v_user_id
    AND workspace_id = p_workspace_id
    AND is_deleted = false
  LIMIT 1;

  IF v_participant_id IS NOT NULL THEN
    INSERT INTO task_assignees (thread_id, participant_id)
    VALUES (v_thread_id, v_participant_id)
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM set_config('clientcase.skip_mirror', 'off', true);

  PERFORM net.http_post(
    url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/google-calendar-mirror-task',
    body := jsonb_build_object('thread_id', v_thread_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', 'cce57c7a05d202805fefdcc9a63678b60355b523991c0abe1e74e8f85a3f8657'
    ),
    timeout_milliseconds := 30000
  );

  RETURN v_thread_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.copy_form_template(p_source_template_id uuid, p_workspace_id uuid, p_new_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_template_id UUID;
  v_section RECORD;
  v_new_section_id UUID;
BEGIN
  -- Создаём новый шаблон
  INSERT INTO form_templates (workspace_id, name, description)
  SELECT p_workspace_id, p_new_name, description
  FROM form_templates
  WHERE id = p_source_template_id
  RETURNING id INTO v_new_template_id;

  IF v_new_template_id IS NULL THEN
    RAISE EXCEPTION 'Source template not found';
  END IF;

  -- Копируем секции и маппим ID
  FOR v_section IN
    SELECT id, name, description, sort_order
    FROM form_template_sections
    WHERE form_template_id = p_source_template_id
    ORDER BY sort_order
  LOOP
    INSERT INTO form_template_sections (form_template_id, name, description, sort_order)
    VALUES (v_new_template_id, v_section.name, v_section.description, v_section.sort_order)
    RETURNING id INTO v_new_section_id;

    -- Копируем поля этой секции
    INSERT INTO form_template_fields (
      form_template_id, field_definition_id, form_template_section_id,
      is_required, sort_order, options, description
    )
    SELECT
      v_new_template_id, field_definition_id, v_new_section_id,
      is_required, sort_order, options, description
    FROM form_template_fields
    WHERE form_template_id = p_source_template_id
      AND form_template_section_id = v_section.id;
  END LOOP;

  -- Копируем поля без секции
  INSERT INTO form_template_fields (
    form_template_id, field_definition_id, form_template_section_id,
    is_required, sort_order, options, description
  )
  SELECT
    v_new_template_id, field_definition_id, NULL,
    is_required, sort_order, options, description
  FROM form_template_fields
  WHERE form_template_id = p_source_template_id
    AND form_template_section_id IS NULL;

  RETURN v_new_template_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.copy_thread_template(p_template_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_id UUID;
BEGIN
  -- Проверяем доступ
  IF NOT EXISTS (
    SELECT 1
    FROM thread_templates tt
    JOIN participants p ON p.workspace_id = tt.workspace_id
    WHERE tt.id = p_template_id
      AND p.user_id = auth.uid()
      AND p.can_login = true
  ) THEN
    RAISE EXCEPTION 'Access denied or template not found';
  END IF;

  -- Копируем шаблон
  INSERT INTO thread_templates (
    workspace_id, name, description, thread_type, is_email,
    thread_name_template, accent_color, icon, access_type, access_roles,
    default_status_id, deadline_days, default_contact_email,
    email_subject_template, initial_message_html, created_by
  )
  SELECT
    workspace_id, name || ' (копия)', description, thread_type, is_email,
    thread_name_template, accent_color, icon, access_type, access_roles,
    default_status_id, deadline_days, default_contact_email,
    email_subject_template, initial_message_html, auth.uid()
  FROM thread_templates
  WHERE id = p_template_id
  RETURNING id INTO v_new_id;

  -- Копируем исполнителей
  INSERT INTO thread_template_assignees (template_id, participant_id)
  SELECT v_new_id, participant_id
  FROM thread_template_assignees
  WHERE template_id = p_template_id;

  RETURN v_new_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_article_version(p_article_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_version INT;
  v_new_id UUID;
  v_workspace_id UUID;
  v_title TEXT;
  v_content TEXT;
BEGIN
  -- Получить текущее состояние статьи
  SELECT workspace_id, title, content
  INTO v_workspace_id, v_title, v_content
  FROM knowledge_articles
  WHERE id = p_article_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Article not found';
  END IF;

  -- Следующий номер версии
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_new_version
  FROM knowledge_article_versions
  WHERE article_id = p_article_id;

  -- Сбросить is_current у всех предыдущих
  UPDATE knowledge_article_versions
  SET is_current = false
  WHERE article_id = p_article_id;

  -- Вставить новую версию
  INSERT INTO knowledge_article_versions (
    article_id, workspace_id, version, is_current,
    title, content, comment, created_by
  ) VALUES (
    p_article_id, v_workspace_id, v_new_version, true,
    v_title, v_content, p_comment, auth.uid()
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_article_with_group(p_workspace_id uuid, p_group_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_article_id UUID;
BEGIN
  INSERT INTO knowledge_articles (workspace_id, title, content, access_mode, is_published)
  VALUES (p_workspace_id, 'Новая статья', '', 'read_only', false)
  RETURNING id INTO v_article_id;

  IF p_group_id IS NOT NULL THEN
    INSERT INTO knowledge_article_groups (article_id, group_id)
    VALUES (v_article_id, p_group_id);
  END IF;

  RETURN v_article_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_conversation_with_context(p_project_id uuid, p_workspace_id uuid, p_created_by uuid, p_title text DEFAULT NULL::text, p_visibility text DEFAULT 'private'::text, p_type text DEFAULT 'ai'::text, p_document_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conversation_id UUID;
  v_doc_id UUID;
BEGIN
  INSERT INTO conversations (project_id, workspace_id, created_by, title, visibility, type)
  VALUES (p_project_id, p_workspace_id, p_created_by, p_title, p_visibility, p_type)
  RETURNING id INTO v_conversation_id;

  IF array_length(p_document_ids, 1) > 0 THEN
    FOREACH v_doc_id IN ARRAY p_document_ids
    LOOP
      INSERT INTO conversation_context (conversation_id, context_type, context_id)
      VALUES (v_conversation_id, 'document', v_doc_id);
    END LOOP;
  END IF;

  RETURN v_conversation_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_default_project_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Администратор проекта
  INSERT INTO project_roles (workspace_id, name, description, color, order_index, is_system, module_access, permissions)
  VALUES (
    NEW.id, 
    'Администратор', 
    'Полный доступ к проекту', 
    '#EF4444', 
    0, 
    true,
    get_project_admin_module_access(),
    get_project_admin_permissions()
  );
  
  -- Исполнитель
  INSERT INTO project_roles (workspace_id, name, description, color, order_index, is_system, module_access, permissions)
  VALUES (
    NEW.id, 
    'Исполнитель', 
    'Работа с документами и анкетами', 
    '#3B82F6', 
    1, 
    true,
    get_project_executor_module_access(),
    get_project_executor_permissions()
  );
  
  -- Клиент
  INSERT INTO project_roles (workspace_id, name, description, color, order_index, is_system, module_access, permissions)
  VALUES (
    NEW.id, 
    'Клиент', 
    'Ограниченный доступ (просмотр, заполнение)', 
    '#10B981', 
    2, 
    true,
    get_project_client_module_access(),
    get_project_client_permissions()
  );
  
  -- Участник (наблюдатель)
  INSERT INTO project_roles (workspace_id, name, description, color, order_index, is_system, module_access, permissions)
  VALUES (
    NEW.id, 
    'Участник', 
    'Минимальный доступ (наблюдатель)', 
    '#6B7280', 
    3, 
    true,
    get_project_participant_module_access(),
    get_project_participant_permissions()
  );
  
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_default_roles_and_statuses()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO project_roles (workspace_id, name, description, color, order_index, is_system) VALUES
    (NEW.id, 'administrator', 'Администратор проекта', '#DC2626', 0, true),
    (NEW.id, 'executor', 'Исполнитель', '#2563EB', 1, true),
    (NEW.id, 'client', 'Клиент', '#16A34A', 2, true),
    (NEW.id, 'observer', 'Наблюдатель', '#6B7280', 3, true);

  INSERT INTO statuses (workspace_id, name, entity_type, color, order_index, is_default, is_final, is_system) VALUES
    (NEW.id, 'Новый', 'project', '#3B82F6', 0, true, false, true),
    (NEW.id, 'В работе', 'project', '#F59E0B', 1, false, false, true),
    (NEW.id, 'На проверке', 'project', '#8B5CF6', 2, false, false, true),
    (NEW.id, 'Завершён', 'project', '#10B981', 3, false, true, true),
    (NEW.id, 'Отменён', 'project', '#EF4444', 4, false, true, true);

  INSERT INTO statuses (workspace_id, name, entity_type, color, order_index, is_default, is_final, is_system) VALUES
    (NEW.id, 'Новая', 'task', '#3B82F6', 0, true, false, true),
    (NEW.id, 'В работе', 'task', '#F59E0B', 1, false, false, true),
    (NEW.id, 'Выполнена', 'task', '#10B981', 2, false, true, true),
    (NEW.id, 'Отменена', 'task', '#EF4444', 3, false, true, true);

  INSERT INTO statuses (workspace_id, name, entity_type, color, order_index, is_default, is_final, is_system) VALUES
    (NEW.id, 'Загружен', 'document', '#3B82F6', 0, true, false, true),
    (NEW.id, 'На проверке', 'document', '#F59E0B', 1, false, false, true),
    (NEW.id, 'Одобрен', 'document', '#10B981', 2, false, true, true),
    (NEW.id, 'Отклонён', 'document', '#EF4444', 3, false, true, true);

  INSERT INTO statuses (workspace_id, name, entity_type, color, order_index, is_default, is_final, is_system) VALUES
    (NEW.id, 'Черновик', 'form', '#6B7280', 0, true, false, true),
    (NEW.id, 'Заполняется', 'form', '#3B82F6', 1, false, false, true),
    (NEW.id, 'На проверке', 'form', '#F59E0B', 2, false, false, true),
    (NEW.id, 'Завершена', 'form', '#10B981', 3, false, true, true);

  INSERT INTO statuses (workspace_id, name, entity_type, color, order_index, is_default, is_final, is_system) VALUES
    (NEW.id, 'Пустой', 'document_kit', '#6B7280', 0, true, false, true),
    (NEW.id, 'Собирается', 'document_kit', '#3B82F6', 1, false, false, true),
    (NEW.id, 'Полный', 'document_kit', '#10B981', 2, false, true, true);

  INSERT INTO statuses (workspace_id, name, entity_type, color, order_index, is_default, is_final, is_system) VALUES
    (NEW.id, 'Черновик', 'knowledge_article', '#6B7280', 0, true, false, true),
    (NEW.id, 'На модерации', 'knowledge_article', '#F59E0B', 1, false, false, true),
    (NEW.id, 'Опубликована', 'knowledge_article', '#10B981', 2, false, false, true),
    (NEW.id, 'Архив', 'knowledge_article', '#EF4444', 3, false, true, true);

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_default_workspace_features()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO workspace_features (workspace_id, features)
  VALUES (
    NEW.id,
    '{
      "ai_document_check": true,
      "ai_form_autofill": true,
      "ai_chat_assistant": true,
      "google_drive_integration": true,
      "comments": false,
      "email_notifications": false,
      "analytics": false,
      "finance_module": false
    }'::JSONB
  );
  
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_default_workspace_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Владелец (is_owner = true, is_system = true)
  INSERT INTO workspace_roles (workspace_id, name, description, color, order_index, is_system, is_owner, permissions)
  VALUES (
    NEW.id, 
    'Владелец', 
    'Создатель workspace. Полный доступ ко всему.', 
    '#7C3AED', 
    0, 
    true,
    true,
    get_owner_permissions()
  );
  
  -- Администратор (is_system = true)
  INSERT INTO workspace_roles (workspace_id, name, description, color, order_index, is_system, is_owner, permissions)
  VALUES (
    NEW.id, 
    'Администратор', 
    'Полный доступ к управлению рабочим пространством', 
    '#EF4444', 
    1, 
    true,
    false,
    get_admin_permissions()
  );
  
  -- Сотрудник (is_system = true)
  INSERT INTO workspace_roles (workspace_id, name, description, color, order_index, is_system, is_owner, permissions)
  VALUES (
    NEW.id, 
    'Сотрудник', 
    'Работает с проектами и документами', 
    '#3B82F6', 
    2, 
    true,
    false,
    get_employee_permissions()
  );
  
  -- Клиент (is_system = true)
  INSERT INTO workspace_roles (workspace_id, name, description, color, order_index, is_system, is_owner, permissions)
  VALUES (
    NEW.id, 
    'Клиент', 
    'Ограниченный доступ к проектам', 
    '#10B981', 
    3, 
    true,
    false,
    get_client_ws_permissions()
  );
  
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_document_kit_from_template(p_template_id uuid, p_project_id uuid, p_workspace_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kit_id UUID;
  v_template_name TEXT;
  v_next_sort_order INT;
  r_folder RECORD;
  v_new_folder_id UUID;
BEGIN
  SELECT name INTO v_template_name
  FROM document_kit_templates
  WHERE id = p_template_id AND workspace_id = p_workspace_id;

  IF v_template_name IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  SELECT COALESCE(MAX(sort_order) + 1, 0) INTO v_next_sort_order
  FROM document_kits
  WHERE project_id = p_project_id;

  INSERT INTO document_kits (project_id, workspace_id, template_id, name, sort_order)
  VALUES (p_project_id, p_workspace_id, p_template_id, v_template_name, v_next_sort_order)
  RETURNING id INTO v_kit_id;

  FOR r_folder IN
    SELECT id, folder_template_id, name, description, ai_naming_prompt, ai_check_prompt,
           knowledge_article_id, order_index
    FROM document_kit_template_folders
    WHERE kit_template_id = p_template_id
    ORDER BY order_index
  LOOP
    INSERT INTO folders (
      document_kit_id, project_id, workspace_id, folder_template_id,
      kit_template_folder_id, name, description, ai_naming_prompt,
      ai_check_prompt, knowledge_article_id, sort_order
    ) VALUES (
      v_kit_id, p_project_id, p_workspace_id, r_folder.folder_template_id,
      r_folder.id, r_folder.name, r_folder.description, r_folder.ai_naming_prompt,
      r_folder.ai_check_prompt, r_folder.knowledge_article_id, r_folder.order_index
    ) RETURNING id INTO v_new_folder_id;

    INSERT INTO folder_slots (
      folder_id, project_id, workspace_id, name, description,
      knowledge_article_id, ai_naming_prompt, ai_check_prompt, sort_order
    )
    SELECT
      v_new_folder_id, p_project_id, p_workspace_id, s.name, s.description,
      s.knowledge_article_id, s.ai_naming_prompt, s.ai_check_prompt, s.sort_order
    FROM document_kit_template_folder_slots s
    WHERE s.kit_folder_id = r_folder.id;
  END LOOP;

  RETURN v_kit_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_document_version_atomic(p_document_id uuid, p_workspace_id uuid, p_version integer, p_file_path text, p_file_name text, p_file_size bigint, p_mime_type text, p_uploaded_by uuid, p_file_id uuid DEFAULT NULL::uuid, p_is_compressed boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_record document_files;
BEGIN
  -- 1. Помечаем все существующие версии как не текущие
  UPDATE document_files
  SET is_current = false
  WHERE document_id = p_document_id AND is_current = true;

  -- 2. Вставляем новую версию
  INSERT INTO document_files (
    document_id, workspace_id, version, is_current,
    file_path, file_name, file_size, mime_type, checksum, uploaded_by, file_id, is_compressed
  )
  VALUES (
    p_document_id, p_workspace_id, p_version, true,
    p_file_path, p_file_name, p_file_size, p_mime_type, NULL, p_uploaded_by, p_file_id, p_is_compressed
  )
  RETURNING * INTO v_new_record;

  RETURN row_to_json(v_new_record);
END;
$function$


CREATE OR REPLACE FUNCTION public.create_form_kit_from_template(p_template_id uuid, p_project_id uuid, p_workspace_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kit_id UUID;
  v_template RECORD;
  v_section RECORD;
  v_section_mapping JSONB := '{}'::JSONB;
  v_new_section_id UUID;
BEGIN
  SELECT id, name, description
  INTO v_template
  FROM form_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;

  INSERT INTO form_kits (project_id, workspace_id, template_id, name, description)
  VALUES (p_project_id, p_workspace_id, p_template_id, v_template.name, v_template.description)
  RETURNING id INTO v_kit_id;

  FOR v_section IN
    SELECT id, name, description, sort_order, header_color
    FROM form_template_sections
    WHERE form_template_id = p_template_id
    ORDER BY sort_order
  LOOP
    INSERT INTO form_kit_sections (form_kit_id, name, description, sort_order, header_color)
    VALUES (v_kit_id, v_section.name, v_section.description, v_section.sort_order, v_section.header_color)
    RETURNING id INTO v_new_section_id;

    v_section_mapping := v_section_mapping || jsonb_build_object(v_section.id::TEXT, v_new_section_id::TEXT);
  END LOOP;

  INSERT INTO form_kit_fields (
    form_kit_id,
    form_kit_section_id,
    field_definition_id,
    name,
    field_type,
    description,
    placeholder,
    help_text,
    options,
    validation,
    is_required,
    risk_assessment_enabled,
    sort_order
  )
  SELECT
    v_kit_id,
    CASE
      WHEN tf.form_template_section_id IS NOT NULL
      THEN (v_section_mapping ->> tf.form_template_section_id::TEXT)::UUID
      ELSE NULL
    END,
    tf.field_definition_id,
    fd.name,
    fd.field_type,
    COALESCE(tf.description, fd.description),
    fd.placeholder,
    fd.help_text,
    CASE
      WHEN tf.options IS NOT NULL AND tf.options != 'null'::JSONB
      THEN (COALESCE(fd.options, '{}'::JSONB) || (tf.options - 'defaultRows'))
      ELSE fd.options
    END,
    fd.validation,
    COALESCE(tf.is_required, FALSE),
    COALESCE(tf.risk_assessment_enabled, FALSE),
    tf.sort_order
  FROM form_template_fields tf
  JOIN field_definitions fd ON fd.id = tf.field_definition_id
  WHERE tf.form_template_id = p_template_id
  ORDER BY tf.sort_order;

  INSERT INTO form_kit_field_values (form_kit_id, field_definition_id, value)
  SELECT
    v_kit_id,
    tf.field_definition_id,
    (tf.options -> 'defaultRows')::TEXT
  FROM form_template_fields tf
  JOIN field_definitions fd ON fd.id = tf.field_definition_id
  WHERE tf.form_template_id = p_template_id
    AND fd.field_type = 'key-value-table'
    AND tf.options IS NOT NULL
    AND tf.options -> 'defaultRows' IS NOT NULL
    AND jsonb_array_length(tf.options -> 'defaultRows') > 0;

  UPDATE form_kits
  SET structure_synced_at = NOW()
  WHERE id = v_kit_id;

  RETURN v_kit_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_owner_participant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  -- Получаем текущего пользователя
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Получаем email пользователя
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_user_id;
  
  IF v_user_email IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Создаём participant с ролью Владелец
  INSERT INTO participants (
    workspace_id,
    user_id,
    email,
    name,
    workspace_roles,
    can_login
  ) VALUES (
    NEW.id,
    v_user_id,
    v_user_email,
    COALESCE(
      (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_user_id),
      split_part(v_user_email, '@', 1)
    ),
    ARRAY['Владелец'],
    true
  );
  
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_status_with_button_label(p_workspace_id uuid, p_name text, p_description text, p_button_label text, p_entity_type text, p_color text, p_order_index integer, p_is_default boolean, p_is_final boolean, p_text_color text DEFAULT '#1F2937'::text)
 RETURNS statuses
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_status public.statuses;
BEGIN
  INSERT INTO public.statuses (
    workspace_id, name, description, button_label, entity_type,
    color, order_index, is_default, is_final, text_color
  ) VALUES (
    p_workspace_id, p_name, p_description, p_button_label, p_entity_type::entity_type,
    p_color, p_order_index, p_is_default, p_is_final, p_text_color
  )
  RETURNING * INTO new_status;
  RETURN new_status;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_task_with_assignees(p_workspace_id uuid, p_project_id uuid, p_title text, p_description text DEFAULT NULL::text, p_deadline timestamp with time zone DEFAULT NULL::timestamp with time zone, p_document_id uuid DEFAULT NULL::uuid, p_document_kit_id uuid DEFAULT NULL::uuid, p_form_kit_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid, p_assignee_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_task_id UUID;
  v_status_id UUID;
  v_sort_order INTEGER;
  v_assignee_id UUID;
BEGIN
  -- Дефолтный статус
  SELECT id INTO v_status_id
  FROM statuses
  WHERE workspace_id = p_workspace_id AND entity_type = 'task' AND is_default = true
  LIMIT 1;

  -- Порядковый номер: MAX + 1 в рамках проекта
  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_sort_order
  FROM tasks
  WHERE project_id = p_project_id AND is_deleted = false;

  INSERT INTO tasks (
    workspace_id, project_id, title, description, deadline,
    status_id, document_id, document_kit_id, form_kit_id,
    created_by, sort_order
  )
  VALUES (
    p_workspace_id, p_project_id, p_title, p_description, p_deadline,
    v_status_id, p_document_id, p_document_kit_id, p_form_kit_id,
    p_created_by, v_sort_order
  )
  RETURNING id INTO v_task_id;

  -- Добавляем исполнителей
  IF array_length(p_assignee_ids, 1) > 0 THEN
    FOREACH v_assignee_id IN ARRAY p_assignee_ids
    LOOP
      INSERT INTO task_assignees (task_id, participant_id, assigned_by)
      VALUES (v_task_id, v_assignee_id, p_created_by);
    END LOOP;
  END IF;

  RETURN v_task_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_user_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.delete_status(p_status_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.statuses
  WHERE id = p_status_id AND is_system = false;
END;
$function$


CREATE OR REPLACE FUNCTION public.delete_workspace_api_key(workspace_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  key_id uuid;
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' THEN
    IF NOT (
      public.is_workspace_owner(auth.uid(), workspace_uuid)
      OR public.has_workspace_permission(auth.uid(), workspace_uuid, 'manage_workspace_settings')
    ) THEN
      RAISE EXCEPTION 'Access denied: manage_workspace_settings required';
    END IF;
  ELSIF coalesce(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT anthropic_api_key_id INTO key_id
  FROM workspaces
  WHERE id = workspace_uuid;

  IF key_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM vault.secrets WHERE id = key_id;

  UPDATE workspaces
  SET anthropic_api_key_id = NULL
  WHERE id = workspace_uuid;

  RETURN true;
END;
$function$


CREATE OR REPLACE FUNCTION public.delete_workspace_google_api_key(workspace_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key_id uuid;
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' THEN
    IF NOT (
      public.is_workspace_owner(auth.uid(), workspace_uuid)
      OR public.has_workspace_permission(auth.uid(), workspace_uuid, 'manage_workspace_settings')
    ) THEN
      RAISE EXCEPTION 'Access denied: manage_workspace_settings required';
    END IF;
  ELSIF coalesce(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT google_api_key_id INTO v_key_id
  FROM workspaces
  WHERE id = workspace_uuid;

  IF v_key_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM vault.secrets WHERE id = v_key_id;

  UPDATE workspaces
  SET google_api_key_id = NULL
  WHERE id = workspace_uuid;

  RETURN true;
END;
$function$


CREATE OR REPLACE FUNCTION public.delete_workspace_voyageai_api_key(workspace_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key_id uuid;
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' THEN
    IF NOT (
      public.is_workspace_owner(auth.uid(), workspace_uuid)
      OR public.has_workspace_permission(auth.uid(), workspace_uuid, 'manage_workspace_settings')
    ) THEN
      RAISE EXCEPTION 'Access denied: manage_workspace_settings required';
    END IF;
  ELSIF coalesce(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT voyageai_api_key_id INTO v_key_id
  FROM workspaces
  WHERE id = workspace_uuid;

  IF v_key_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM vault.secrets WHERE id = v_key_id;

  UPDATE workspaces
  SET voyageai_api_key_id = NULL
  WHERE id = workspace_uuid;

  RETURN true;
END;
$function$


CREATE OR REPLACE FUNCTION public.dispatch_message_to_channels(p_message_id uuid, p_force_attachments boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  NEW project_messages%ROWTYPE;
  v_tg_chat RECORD;
  v_mtproto_session_user_id UUID;
  v_mtproto_client_tg_user_id BIGINT;
  v_business_connection_id TEXT;
  v_wazzup_channel_id UUID;
  v_wazzup_chat_id TEXT;
  v_email_send_account_id UUID;
  v_is_email_thread BOOLEAN;
  v_reply_tg_msg_id BIGINT;
  v_attach_flag BOOLEAN;
BEGIN
  SELECT * INTO NEW FROM project_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NEW.source IN (
    'telegram','telegram_service','telegram_business','telegram_mtproto',
    'bot_event','wazzup','email_internal'
  ) THEN
    RETURN;
  END IF;

  IF NEW.sender_participant_id IS NULL AND (NEW.content IS NULL OR NEW.content = '') THEN
    RETURN;
  END IF;

  IF NEW.visibility IS DISTINCT FROM 'client'::message_visibility THEN
    UPDATE public.project_messages
    SET send_status = 'sent', send_failed_reason = NULL
    WHERE id = NEW.id AND send_status = 'pending';
    RETURN;
  END IF;

  v_attach_flag := (NEW.has_attachments = true AND p_force_attachments);

  IF NEW.thread_id IS NOT NULL THEN
    SELECT pt.email_send_account_id,
           (pt.email_send_account_id IS NOT NULL OR EXISTS (
              SELECT 1 FROM project_messages pm2
              WHERE pm2.thread_id = NEW.thread_id
                AND pm2.source = 'email_internal'
              LIMIT 1
           ))
    INTO v_email_send_account_id, v_is_email_thread
    FROM project_threads pt WHERE pt.id = NEW.thread_id;

    IF v_is_email_thread THEN
      IF NEW.has_attachments = true THEN
        RETURN;
      END IF;

      PERFORM public.dispatch_send_http(
        'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/email-internal-send',
        jsonb_build_object('message_id', NEW.id),
        NEW.id,
        'email-internal-send'
      );
      RETURN;
    END IF;
  END IF;

  IF NEW.thread_id IS NOT NULL THEN
    SELECT mtproto_session_user_id, mtproto_client_tg_user_id
    INTO v_mtproto_session_user_id, v_mtproto_client_tg_user_id
    FROM project_threads WHERE id = NEW.thread_id;

    IF v_mtproto_session_user_id IS NOT NULL AND v_mtproto_client_tg_user_id IS NOT NULL THEN
      IF NEW.has_attachments = true AND NOT p_force_attachments THEN
        RETURN;
      END IF;
      IF NEW.reply_to_message_id IS NOT NULL THEN
        SELECT telegram_message_id INTO v_reply_tg_msg_id
        FROM project_messages WHERE id = NEW.reply_to_message_id;
      END IF;
      PERFORM public.dispatch_send_http(
        'https://mtproto.kvp-projects.com/messages/send',
        jsonb_build_object(
          'message_id_internal', NEW.id,
          'user_id', v_mtproto_session_user_id,
          'client_tg_user_id', v_mtproto_client_tg_user_id,
          'text', NEW.content,
          'reply_to_telegram_message_id', v_reply_tg_msg_id
        ),
        NEW.id,
        'mtproto-send'
      );
      RETURN;
    END IF;
  END IF;

  IF NEW.thread_id IS NOT NULL THEN
    SELECT business_connection_id INTO v_business_connection_id
    FROM project_threads WHERE id = NEW.thread_id;
    IF v_business_connection_id IS NOT NULL THEN
      IF NEW.has_attachments = true AND NOT p_force_attachments THEN
        RETURN;
      END IF;
      PERFORM public.dispatch_send_http(
        'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/telegram-business-send',
        jsonb_build_object('message_id', NEW.id)
          || CASE WHEN v_attach_flag THEN jsonb_build_object('attachments_only', true) ELSE '{}'::jsonb END,
        NEW.id,
        'telegram-business-send'
      );
      RETURN;
    END IF;
  END IF;

  IF NEW.thread_id IS NOT NULL THEN
    SELECT wazzup_channel_id, wazzup_chat_id INTO v_wazzup_channel_id, v_wazzup_chat_id
    FROM project_threads WHERE id = NEW.thread_id;
    IF v_wazzup_channel_id IS NOT NULL AND v_wazzup_chat_id IS NOT NULL THEN
      IF NEW.has_attachments = true AND NOT p_force_attachments THEN
        RETURN;
      END IF;
      PERFORM public.dispatch_send_http(
        'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/wazzup-send',
        jsonb_build_object('message_id', NEW.id)
          || CASE WHEN v_attach_flag THEN jsonb_build_object('attachments_only', true) ELSE '{}'::jsonb END,
        NEW.id,
        'wazzup-send'
      );
      RETURN;
    END IF;
  END IF;

  IF NEW.thread_id IS NOT NULL THEN
    SELECT * INTO v_tg_chat FROM project_telegram_chats
    WHERE thread_id = NEW.thread_id AND is_active = true;
  END IF;

  IF NOT FOUND AND NEW.thread_id IS NULL AND NEW.channel IS NOT NULL THEN
    SELECT * INTO v_tg_chat FROM project_telegram_chats
    WHERE project_id = NEW.project_id AND channel = NEW.channel AND is_active = true;
  END IF;

  IF v_tg_chat.id IS NOT NULL THEN
    IF NEW.has_attachments = true AND NOT p_force_attachments THEN
      RETURN;
    END IF;
    IF NEW.reply_to_message_id IS NOT NULL AND v_reply_tg_msg_id IS NULL THEN
      SELECT telegram_message_id INTO v_reply_tg_msg_id
      FROM project_messages WHERE id = NEW.reply_to_message_id;
    END IF;

    PERFORM public.dispatch_send_http(
      'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/telegram-send-message',
      jsonb_build_object(
        'message_id', NEW.id,
        'project_id', NEW.project_id,
        'content', NEW.content,
        'sender_name', NEW.sender_name,
        'sender_role', NEW.sender_role,
        'telegram_chat_id', v_tg_chat.telegram_chat_id,
        'reply_to_telegram_message_id', v_reply_tg_msg_id
      )
        || CASE WHEN v_attach_flag THEN jsonb_build_object('attachments_only', true) ELSE '{}'::jsonb END,
      NEW.id,
      'telegram-send-message'
    );
    RETURN;
  END IF;

  UPDATE public.project_messages
  SET send_status = 'sent',
      send_failed_reason = NULL
  WHERE id = NEW.id
    AND send_status = 'pending';
END;
$function$


CREATE OR REPLACE FUNCTION public.dispatch_scheduled_messages()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT m.id, m.has_attachments, COALESCE(t.is_deleted, false) AS thread_deleted
    FROM project_messages m
    LEFT JOIN project_threads t ON t.id = m.thread_id
    WHERE m.is_draft = true
      AND m.scheduled_send_at IS NOT NULL
      AND m.scheduled_send_at <= now()
    ORDER BY m.scheduled_send_at
    LIMIT 200
    FOR UPDATE OF m SKIP LOCKED
  LOOP
    UPDATE project_messages
       SET is_draft = false,
           scheduled_send_at = NULL
     WHERE id = v_row.id;

    -- Тред в корзине → отправку отменяем (черновик уже снят выше).
    IF v_row.thread_deleted THEN
      CONTINUE;
    END IF;

    BEGIN
      PERFORM public.dispatch_message_to_channels(v_row.id, v_row.has_attachments);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'dispatch_scheduled_messages: dispatch failed for %: %', v_row.id, SQLERRM;
    END;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.dispatch_send_http(p_url text, p_body jsonb, p_message_id uuid, p_function_name text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id bigint;
BEGIN
  SELECT net.http_post(
    url := p_url,
    body := p_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', 'cce57c7a05d202805fefdcc9a63678b60355b523991c0abe1e74e8f85a3f8657'
    ),
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  IF p_message_id IS NOT NULL AND v_request_id IS NOT NULL THEN
    INSERT INTO public.message_send_dispatch (request_id, message_id, function_name)
    VALUES (v_request_id, p_message_id, p_function_name)
    ON CONFLICT (request_id) DO NOTHING;
  END IF;

  RETURN v_request_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.docbuilder_grant_creator_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  insert into docbuilder_project_access (project_id, user_email)
  values (new.id, docbuilder_user_email())
  on conflict (project_id, user_email) do nothing;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.docbuilder_has_project_access(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1 from docbuilder_project_access
    where project_id = p_project_id
    and lower(user_email) = docbuilder_user_email()
  );
$function$


CREATE OR REPLACE FUNCTION public.docbuilder_has_template_access(p_template_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1 from docbuilder_template_access
    where template_id = p_template_id
    and lower(user_email) = docbuilder_user_email()
  )
  or exists (
    select 1 from docbuilder_projects p
    join docbuilder_project_access pa on pa.project_id = p.id
    where p.template_id = p_template_id
    and lower(pa.user_email) = docbuilder_user_email()
  );
$function$


CREATE OR REPLACE FUNCTION public.docbuilder_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1 from docbuilder_allowed_users u
    where lower(u.email) = docbuilder_user_email()
    and u.role = 'admin'
  );
$function$


CREATE OR REPLACE FUNCTION public.docbuilder_update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.docbuilder_user_email()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select lower(email) from auth.users where id = auth.uid();
$function$


CREATE OR REPLACE FUNCTION public.duplicate_project_template(p_template_id uuid, p_new_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_src public.project_templates%ROWTYPE;
  v_new_id uuid;
  v_uid uuid := auth.uid();
  v_next_order integer;
  v_tt RECORD;
  v_new_tt uuid;
BEGIN
  SELECT * INTO v_src FROM public.project_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.participants
    WHERE workspace_id = v_src.workspace_id
      AND user_id = v_uid
      AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT COALESCE(MAX(order_index), -1) + 1 INTO v_next_order
  FROM public.project_templates WHERE workspace_id = v_src.workspace_id;

  INSERT INTO public.project_templates (
    workspace_id, name, description, created_by, enabled_modules,
    is_lead_template, icon, icon_color_mode, icon_color, default_panel_tabs, order_index
  ) VALUES (
    v_src.workspace_id,
    COALESCE(NULLIF(btrim(p_new_name), ''), v_src.name || ' (копия)'),
    v_src.description, v_uid, v_src.enabled_modules,
    v_src.is_lead_template, v_src.icon, v_src.icon_color_mode, v_src.icon_color,
    v_src.default_panel_tabs, v_next_order
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.project_template_statuses (template_id, status_id, order_index, is_default, is_final)
  SELECT v_new_id, status_id, order_index, is_default, is_final
  FROM public.project_template_statuses WHERE template_id = p_template_id;

  INSERT INTO public.project_template_forms (project_template_id, form_template_id, order_index)
  SELECT v_new_id, form_template_id, order_index
  FROM public.project_template_forms WHERE project_template_id = p_template_id;

  INSERT INTO public.project_template_document_kits (project_template_id, document_kit_template_id, order_index)
  SELECT v_new_id, document_kit_template_id, order_index
  FROM public.project_template_document_kits WHERE project_template_id = p_template_id;

  INSERT INTO public.project_template_field_links (template_id, field_definition_id, order_index, is_required)
  SELECT v_new_id, field_definition_id, order_index, is_required
  FROM public.project_template_field_links WHERE template_id = p_template_id;

  INSERT INTO public.knowledge_article_templates (article_id, project_template_id)
  SELECT article_id, v_new_id FROM public.knowledge_article_templates WHERE project_template_id = p_template_id;

  INSERT INTO public.knowledge_group_templates (group_id, project_template_id)
  SELECT group_id, v_new_id FROM public.knowledge_group_templates WHERE project_template_id = p_template_id;

  INSERT INTO public.quick_reply_group_templates (group_id, project_template_id)
  SELECT group_id, v_new_id FROM public.quick_reply_group_templates WHERE project_template_id = p_template_id;

  INSERT INTO public.quick_reply_templates (reply_id, project_template_id)
  SELECT reply_id, v_new_id FROM public.quick_reply_templates WHERE project_template_id = p_template_id;

  CREATE TEMP TABLE _tt_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;

  FOR v_tt IN
    SELECT * FROM public.thread_templates WHERE owner_project_template_id = p_template_id
  LOOP
    INSERT INTO public.thread_templates (
      workspace_id, name, description, thread_type, is_email, thread_name_template,
      accent_color, icon, access_type, access_roles, default_status_id, deadline_days,
      email_subject_template, initial_message_html, sort_order, created_by,
      default_contact_email, owner_project_template_id, on_complete_set_project_status_id
    ) VALUES (
      v_tt.workspace_id, v_tt.name, v_tt.description, v_tt.thread_type, v_tt.is_email, v_tt.thread_name_template,
      v_tt.accent_color, v_tt.icon, v_tt.access_type, v_tt.access_roles, v_tt.default_status_id, v_tt.deadline_days,
      v_tt.email_subject_template, v_tt.initial_message_html, v_tt.sort_order, v_uid,
      v_tt.default_contact_email, v_new_id, v_tt.on_complete_set_project_status_id
    ) RETURNING id INTO v_new_tt;

    INSERT INTO _tt_map VALUES (v_tt.id, v_new_tt);

    INSERT INTO public.thread_template_assignees (template_id, participant_id)
    SELECT v_new_tt, participant_id
    FROM public.thread_template_assignees WHERE template_id = v_tt.id;
  END LOOP;

  INSERT INTO public.project_template_plan_blocks (
    workspace_id, project_template_id, block_type, sort_order, visible_to_client,
    content, thread_template_id, slot_template_id
  )
  SELECT
    pb.workspace_id, v_new_id, pb.block_type, pb.sort_order, pb.visible_to_client,
    pb.content,
    COALESCE(m.new_id, pb.thread_template_id),
    pb.slot_template_id
  FROM public.project_template_plan_blocks pb
  LEFT JOIN _tt_map m ON m.old_id = pb.thread_template_id
  WHERE pb.project_template_id = p_template_id;

  RETURN v_new_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.email_thread_assign_owner_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id UUID;
BEGIN
  IF NEW.type <> 'email' THEN RETURN NEW; END IF;
  v_participant_id := public.resolve_email_thread_assignee(NEW);
  IF v_participant_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO task_assignees (thread_id, participant_id)
  VALUES (NEW.id, v_participant_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.email_thread_auto_setup_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.type <> 'email' THEN RETURN NEW; END IF;
  IF NEW.deadline IS NULL THEN
    NEW.deadline := public.today_madrid_midnight();
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.email_thread_reopen_on_incoming_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_thread project_threads%ROWTYPE;
  v_is_inbound BOOLEAN;
  v_is_final BOOLEAN;
  v_sender_user_id UUID;
  v_participant_id UUID;
BEGIN
  SELECT * INTO v_thread FROM project_threads WHERE id = NEW.thread_id;
  IF v_thread.id IS NULL OR v_thread.type <> 'email' THEN RETURN NEW; END IF;

  IF NEW.sender_participant_id IS NULL THEN
    v_is_inbound := TRUE;
  ELSE
    SELECT user_id INTO v_sender_user_id FROM participants WHERE id = NEW.sender_participant_id;
    v_is_inbound := (v_sender_user_id IS NULL);
  END IF;

  IF NOT v_is_inbound THEN RETURN NEW; END IF;

  IF v_thread.status_id IS NOT NULL THEN
    SELECT is_final INTO v_is_final FROM statuses WHERE id = v_thread.status_id;
    IF v_is_final IS TRUE THEN
      UPDATE project_threads SET status_id = NULL WHERE id = v_thread.id;
    END IF;
  END IF;

  IF v_thread.deadline IS NULL THEN
    UPDATE project_threads
    SET deadline = public.today_madrid_midnight()
    WHERE id = v_thread.id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM task_assignees WHERE thread_id = v_thread.id) THEN
    v_participant_id := public.resolve_email_thread_assignee(v_thread);
    IF v_participant_id IS NOT NULL THEN
      INSERT INTO task_assignees (thread_id, participant_id)
      VALUES (v_thread.id, v_participant_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.end_impersonation_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_from_claim uuid := public.impersonating_owner_id();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.impersonation_sessions
  SET ended_at = now()
  WHERE id = p_session_id
    AND ended_at IS NULL
    AND (
      owner_user_id  = v_user_id
      OR target_user_id = v_user_id
      OR owner_user_id = v_owner_from_claim
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.export_workspace_data(p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT is_workspace_owner((SELECT auth.uid()), p_workspace_id) THEN
    RAISE EXCEPTION 'Только владелец воркспейса может выгружать данные';
  END IF;
  SELECT jsonb_build_object(
    'exported_at', now(),
    'workspace', (SELECT to_jsonb(w) - 'default_ai_check_prompt' - 'default_ai_naming_prompt' FROM workspaces w WHERE w.id=p_workspace_id),
    'projects', (SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM projects p WHERE p.workspace_id=p_workspace_id AND p.is_deleted=false),
    'participants', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',pt.id,'name',pt.name,'last_name',pt.last_name,'email',pt.email,'phone',pt.phone,'workspace_roles',pt.workspace_roles)), '[]'::jsonb) FROM participants pt WHERE pt.workspace_id=p_workspace_id AND pt.is_deleted=false),
    'threads', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',th.id,'name',th.name,'type',th.type,'project_id',th.project_id,'status_id',th.status_id,'created_at',th.created_at)), '[]'::jsonb) FROM project_threads th WHERE th.workspace_id=p_workspace_id AND th.is_deleted=false),
    'counts', jsonb_build_object(
      'projects', (SELECT count(*) FROM projects WHERE workspace_id=p_workspace_id AND is_deleted=false),
      'participants', (SELECT count(*) FROM participants WHERE workspace_id=p_workspace_id AND is_deleted=false),
      'threads', (SELECT count(*) FROM project_threads WHERE workspace_id=p_workspace_id AND is_deleted=false),
      'messages', (SELECT count(*) FROM project_messages WHERE workspace_id=p_workspace_id)
    )
  ) INTO result;
  RETURN result;
END;
$function$


CREATE OR REPLACE FUNCTION public.fill_folder_slot(p_slot_id uuid, p_document_id uuid, p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM folder_slots fs
    JOIN participants p ON p.workspace_id = fs.workspace_id
    WHERE fs.id = p_slot_id
      AND fs.project_id = p_project_id
      AND p.user_id = auth.uid()
      AND p.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Слот не найден или нет доступа';
  END IF;

  UPDATE folder_slots
  SET document_id = p_document_id,
      updated_at = now()
  WHERE id = p_slot_id
    AND project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Слот не найден';
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.fill_slot_atomic(p_slot_id uuid, p_document_id uuid, p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_folder_id       UUID;
  v_document_kit_id UUID;
BEGIN
  -- Проверяем права: пользователь должен быть участником проекта
  IF NOT EXISTS (
    SELECT 1
    FROM project_participants pp
    JOIN participants p ON p.id = pp.participant_id
    WHERE pp.project_id = p_project_id
      AND p.user_id = auth.uid()
      AND p.can_login = true
  ) THEN
    RAISE EXCEPTION 'Access denied or project not found';
  END IF;

  -- Получаем folder_id и document_kit_id из слота
  SELECT
    fs.folder_id,
    f.document_kit_id
  INTO v_folder_id, v_document_kit_id
  FROM folder_slots fs
  LEFT JOIN folders f ON f.id = fs.folder_id
  WHERE fs.id = p_slot_id
    AND fs.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Slot not found';
  END IF;

  -- Отвязываем документ от других слотов проекта
  UPDATE folder_slots
  SET document_id = NULL
  WHERE project_id = p_project_id
    AND document_id = p_document_id
    AND id <> p_slot_id;

  -- Привязываем документ к целевому слоту
  UPDATE folder_slots
  SET document_id = p_document_id
  WHERE id = p_slot_id
    AND project_id = p_project_id;

  -- Обновляем document_kit_id и folder_id документа
  UPDATE documents
  SET
    document_kit_id = COALESCE(v_document_kit_id, document_kit_id),
    folder_id       = COALESCE(v_folder_id, folder_id)
  WHERE id = p_document_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.fill_slot_atomic_service(p_slot_id uuid, p_document_id uuid, p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_folder_id       UUID;
  v_document_kit_id UUID;
BEGIN
  SELECT fs.folder_id, f.document_kit_id
  INTO v_folder_id, v_document_kit_id
  FROM folder_slots fs
  LEFT JOIN folders f ON f.id = fs.folder_id
  WHERE fs.id = p_slot_id
    AND fs.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Slot not found';
  END IF;

  UPDATE folder_slots
  SET document_id = NULL
  WHERE project_id = p_project_id
    AND document_id = p_document_id
    AND id <> p_slot_id;

  UPDATE folder_slots
  SET document_id = p_document_id
  WHERE id = p_slot_id
    AND project_id = p_project_id;

  UPDATE documents
  SET
    document_kit_id = COALESCE(v_document_kit_id, document_kit_id),
    folder_id       = COALESCE(v_folder_id, folder_id)
  WHERE id = p_document_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.fill_thread_id_from_channel()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.thread_id IS NULL AND NEW.channel IS NOT NULL THEN
    SELECT id INTO NEW.thread_id
    FROM project_threads
    WHERE project_id = NEW.project_id
      AND legacy_channel = NEW.channel
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.find_or_create_contact_participant(p_workspace_id uuid, p_name text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_telegram_user_id bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_email text;
  v_phone_norm text;
BEGIN
  v_phone_norm := CASE WHEN p_phone IS NOT NULL THEN regexp_replace(p_phone, '\D', '', 'g') ELSE NULL END;

  -- Поиск по telegram_user_id
  IF p_telegram_user_id IS NOT NULL THEN
    SELECT id INTO v_id FROM participants
    WHERE workspace_id = p_workspace_id
      AND telegram_user_id = p_telegram_user_id
      AND is_deleted = false
    LIMIT 1;
  END IF;

  -- Поиск по email (case-insensitive)
  IF v_id IS NULL AND p_email IS NOT NULL THEN
    SELECT id INTO v_id FROM participants
    WHERE workspace_id = p_workspace_id
      AND lower(email) = lower(p_email)
      AND is_deleted = false
    LIMIT 1;
  END IF;

  -- Поиск по phone (нормализованному)
  IF v_id IS NULL AND v_phone_norm IS NOT NULL AND v_phone_norm != '' THEN
    SELECT id INTO v_id FROM participants
    WHERE workspace_id = p_workspace_id
      AND phone IS NOT NULL
      AND regexp_replace(phone, '\D', '', 'g') = v_phone_norm
      AND is_deleted = false
    LIMIT 1;
  END IF;

  -- Не нашли — создаём.
  IF v_id IS NULL THEN
    -- email обязателен в participants. Если реального нет, синтезируем заглушку.
    v_email := COALESCE(
      p_email,
      CASE WHEN p_telegram_user_id IS NOT NULL THEN 'tg-' || p_telegram_user_id || '@no-email.local' END,
      CASE WHEN v_phone_norm IS NOT NULL AND v_phone_norm != '' THEN 'phone-' || v_phone_norm || '@no-email.local' END
    );
    IF v_email IS NULL THEN
      -- Совсем нет идентификаторов — нечего создавать.
      RETURN NULL;
    END IF;

    INSERT INTO participants (
      workspace_id, name, email, phone, telegram_user_id,
      can_login, workspace_roles
    ) VALUES (
      p_workspace_id,
      COALESCE(NULLIF(trim(p_name), ''), 'Контакт'),
      v_email,
      p_phone,
      p_telegram_user_id,
      false,
      ARRAY['Клиент']
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  -- Нашли — досыпаем недостающие поля.
  UPDATE participants
  SET
    telegram_user_id = COALESCE(telegram_user_id, p_telegram_user_id),
    phone = COALESCE(phone, p_phone),
    -- email не перезаписываем — там может быть «настоящий» адрес.
    updated_at = now()
  WHERE id = v_id
    AND (
      (telegram_user_id IS NULL AND p_telegram_user_id IS NOT NULL)
      OR (phone IS NULL AND p_phone IS NOT NULL)
    );

  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_audit_document_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_project_id UUID;
BEGIN
  SELECT p.workspace_id, p.id INTO v_workspace_id, v_project_id
  FROM document_kits dk
  JOIN projects p ON p.id = dk.project_id
  WHERE dk.id = OLD.document_kit_id;

  PERFORM fn_write_audit_log(
    'delete',
    'document',
    OLD.id,
    jsonb_build_object(
      'name', OLD.name,
      'document_kit_id', OLD.document_kit_id,
      'folder_id', OLD.folder_id
    ),
    v_workspace_id,
    v_project_id  -- NULL if project already deleted (FOUND = false)
  );
  RETURN OLD;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_audit_document_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT p.workspace_id INTO v_workspace_id
  FROM projects p WHERE p.id = NEW.project_id;

  PERFORM fn_write_audit_log(
    'create',
    'document',
    NEW.id,
    jsonb_build_object(
      'name', NEW.name,
      'document_kit_id', NEW.document_kit_id,
      'folder_id', NEW.folder_id
    ),
    v_workspace_id,
    NEW.project_id
  );
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_audit_document_kit_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_project_exists BOOLEAN;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM projects WHERE id = OLD.project_id;

  v_project_exists := FOUND;

  PERFORM fn_write_audit_log(
    'delete',
    'document_kit',
    OLD.id,
    jsonb_build_object(
      'name', OLD.name,
      'project_id', OLD.project_id
    ),
    v_workspace_id,
    CASE WHEN v_project_exists THEN OLD.project_id ELSE NULL END
  );
  RETURN OLD;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_audit_document_kit_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM projects WHERE id = NEW.project_id;

  PERFORM fn_write_audit_log(
    'create',
    'document_kit',
    NEW.id,
    jsonb_build_object(
      'name', NEW.name,
      'project_id', NEW.project_id
    ),
    v_workspace_id,
    NEW.project_id
  );
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_audit_document_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_action TEXT;
  v_old_status_name TEXT;
  v_new_status_name TEXT;
BEGIN
  IF OLD.is_deleted = false AND NEW.is_deleted = true THEN
    v_action := 'soft_delete';
  ELSIF OLD.is_deleted = true AND NEW.is_deleted = false THEN
    v_action := 'restore';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    v_action := 'change_status';
    -- Резолвим имена статусов: если UUID — ищем в statuses, иначе берём как есть
    IF OLD.status IS NOT NULL AND OLD.status ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT name INTO v_old_status_name FROM statuses WHERE id = OLD.status::UUID;
    ELSE
      v_old_status_name := OLD.status;
    END IF;
    IF NEW.status IS NOT NULL AND NEW.status ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT name INTO v_new_status_name FROM statuses WHERE id = NEW.status::UUID;
    ELSE
      v_new_status_name := NEW.status;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT p.workspace_id INTO v_workspace_id
  FROM projects p WHERE p.id = NEW.project_id;

  PERFORM fn_write_audit_log(
    v_action,
    'document',
    NEW.id,
    jsonb_build_object(
      'name', NEW.name,
      'old_status', COALESCE(v_old_status_name, ''),
      'new_status', COALESCE(v_new_status_name, ''),
      'is_deleted', NEW.is_deleted
    ),
    v_workspace_id,
    NEW.project_id
  );
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_audit_folder_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_project_id UUID;
BEGIN
  SELECT p.workspace_id, p.id INTO v_workspace_id, v_project_id
  FROM document_kits dk
  JOIN projects p ON p.id = dk.project_id
  WHERE dk.id = OLD.document_kit_id;

  PERFORM fn_write_audit_log(
    'delete',
    'folder',
    OLD.id,
    jsonb_build_object(
      'name', OLD.name,
      'document_kit_id', OLD.document_kit_id
    ),
    v_workspace_id,
    v_project_id  -- NULL if project already deleted
  );
  RETURN OLD;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_audit_folder_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT p.workspace_id INTO v_workspace_id
  FROM projects p WHERE p.id = NEW.project_id;

  PERFORM fn_write_audit_log(
    'create',
    'folder',
    NEW.id,
    jsonb_build_object(
      'name', NEW.name,
      'document_kit_id', NEW.document_kit_id
    ),
    v_workspace_id,
    NEW.project_id
  );
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_audit_form_field_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_project_id UUID;
  v_form_kit_name TEXT;
  v_field_label TEXT;
  v_action TEXT;
BEGIN
  SELECT fk.project_id, p.workspace_id, fk.name
  INTO v_project_id, v_workspace_id, v_form_kit_name
  FROM form_kits fk
  JOIN projects p ON p.id = fk.project_id
  WHERE fk.id = NEW.form_kit_id;

  SELECT fd.name INTO v_field_label
  FROM field_definitions fd
  WHERE fd.id = NEW.field_definition_id;

  IF TG_OP = 'INSERT' THEN
    v_action := 'fill_field';
  ELSE
    v_action := 'update_field';
  END IF;

  PERFORM fn_write_audit_log(
    v_action,
    'form_kit',
    NEW.form_kit_id,
    jsonb_build_object(
      'form_kit_name', v_form_kit_name,
      'field_label', COALESCE(v_field_label, 'поле'),
      'field_definition_id', NEW.field_definition_id
    ),
    v_workspace_id,
    v_project_id
  );
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_audit_participant_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_project_id UUID;
  v_project_exists BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_project_id := OLD.project_id;
  ELSE
    v_project_id := NEW.project_id;
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM projects WHERE id = v_project_id;

  v_project_exists := FOUND;

  IF TG_OP = 'INSERT' THEN
    PERFORM fn_write_audit_log(
      'add_participant',
      'project_participant',
      NEW.id,
      jsonb_build_object(
        'project_id', NEW.project_id,
        'participant_id', NEW.participant_id,
        'roles', NEW.project_roles
      ),
      v_workspace_id,
      v_project_id
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM fn_write_audit_log(
      'remove_participant',
      'project_participant',
      OLD.id,
      jsonb_build_object(
        'project_id', OLD.project_id,
        'participant_id', OLD.participant_id,
        'roles', OLD.project_roles
      ),
      v_workspace_id,
      CASE WHEN v_project_exists THEN v_project_id ELSE NULL END
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.project_roles IS DISTINCT FROM NEW.project_roles THEN
      PERFORM fn_write_audit_log(
        'update_roles',
        'project_participant',
        NEW.id,
        jsonb_build_object(
          'project_id', NEW.project_id,
          'participant_id', NEW.participant_id,
          'old_roles', OLD.project_roles,
          'new_roles', NEW.project_roles
        ),
        v_workspace_id,
        v_project_id
      );
    END IF;
    RETURN NEW;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_audit_project_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM fn_write_audit_log(
    'delete',
    'project',
    OLD.id,
    jsonb_build_object(
      'name', OLD.name,
      'workspace_id', OLD.workspace_id
    ),
    OLD.workspace_id,
    NULL::uuid
  );
  RETURN OLD;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_audit_project_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_action TEXT;
  v_details JSONB := '{}';
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    v_action := 'rename';
    v_details := jsonb_build_object('old_name', OLD.name, 'new_name', NEW.name);
  ELSIF OLD.status_id IS DISTINCT FROM NEW.status_id THEN
    v_action := 'change_status';
    v_details := jsonb_build_object(
      'old_status_id', OLD.status_id,
      'new_status_id', NEW.status_id
    );
  ELSIF OLD.deadline IS DISTINCT FROM NEW.deadline THEN
    v_action := 'change_deadline';
    v_details := jsonb_build_object('old_deadline', OLD.deadline, 'new_deadline', NEW.deadline);
  ELSE
    RETURN NEW;
  END IF;

  v_details := v_details || jsonb_build_object('name', NEW.name);

  PERFORM fn_write_audit_log(
    v_action,
    'project',
    NEW.id,
    v_details,
    NEW.workspace_id,
    NEW.id
  );
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_audit_task_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_project_exists BOOLEAN;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM projects WHERE id = OLD.project_id;

  v_project_exists := FOUND;

  PERFORM fn_write_audit_log(
    'delete',
    'task',
    OLD.id,
    jsonb_build_object(
      'title', OLD.title,
      'project_id', OLD.project_id
    ),
    v_workspace_id,
    CASE WHEN v_project_exists THEN OLD.project_id ELSE NULL END
  );
  RETURN OLD;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_audit_task_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM projects WHERE id = NEW.project_id;

  PERFORM fn_write_audit_log(
    'create',
    'task',
    NEW.id,
    jsonb_build_object(
      'title', NEW.title,
      'project_id', NEW.project_id
    ),
    v_workspace_id,
    NEW.project_id
  );
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_audit_task_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_action TEXT;
  v_old_status_name TEXT;
  v_new_status_name TEXT;
BEGIN
  IF OLD.is_deleted = false AND NEW.is_deleted = true THEN
    v_action := 'delete';
  ELSIF OLD.status_id IS DISTINCT FROM NEW.status_id THEN
    v_action := 'change_status';
    SELECT name INTO v_old_status_name FROM statuses WHERE id = OLD.status_id;
    SELECT name INTO v_new_status_name FROM statuses WHERE id = NEW.status_id;
  ELSE
    RETURN NEW;
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM projects WHERE id = NEW.project_id;

  PERFORM fn_write_audit_log(
    v_action,
    'task',
    NEW.id,
    jsonb_build_object(
      'title', NEW.title,
      'project_id', NEW.project_id,
      'old_status', COALESCE(v_old_status_name, ''),
      'new_status', COALESCE(v_new_status_name, ''),
      'is_deleted', NEW.is_deleted
    ),
    v_workspace_id,
    NEW.project_id
  );
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_update_project_last_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
BEGIN
  -- Get project_id from the row (works for tables with direct project_id)
  IF TG_OP = 'DELETE' THEN
    v_project_id := OLD.project_id;
  ELSE
    v_project_id := NEW.project_id;
  END IF;

  IF v_project_id IS NOT NULL THEN
    UPDATE projects SET last_activity_at = now() WHERE id = v_project_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_update_project_last_activity_from_form_values()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
BEGIN
  SELECT fk.project_id INTO v_project_id
  FROM form_kits fk
  WHERE fk.id = NEW.form_kit_id;

  IF v_project_id IS NOT NULL THEN
    UPDATE projects SET last_activity_at = now() WHERE id = v_project_id;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_update_project_last_activity_self()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Avoid recursion: only set if something other than last_activity_at changed
  IF NEW.last_activity_at = OLD.last_activity_at OR NEW.last_activity_at IS NULL THEN
    NEW.last_activity_at := now();
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_write_audit_log(p_action text, p_resource_type text, p_resource_id uuid, p_details jsonb, p_workspace_id uuid, p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, details, workspace_id, project_id)
  VALUES (
    auth.uid(),
    p_action,
    p_resource_type,
    p_resource_id,
    p_details,
    p_workspace_id,
    p_project_id
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.generate_chat_link_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  code TEXT;
  exists_already BOOLEAN;
BEGIN
  LOOP
    code := upper(substr(md5(random()::text), 1, 8));
    SELECT EXISTS(SELECT 1 FROM project_threads WHERE link_code = code) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN code;
END;
$function$


CREATE OR REPLACE FUNCTION public.generate_messenger_link_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  code TEXT;
  exists_already BOOLEAN;
BEGIN
  LOOP
    code := upper(substr(md5(random()::text), 1, 8));
    SELECT EXISTS(SELECT 1 FROM projects WHERE messenger_link_code = code) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN code;
END;
$function$


CREATE OR REPLACE FUNCTION public.generate_recurring_tasks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rule record;
  v_thread_id uuid;
  v_name text;
  v_project_name text;
  v_sort int;
  v_occ_date date;
  v_deadline timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_next timestamptz;
  v_pid uuid;
  v_count int := 0;
begin
  for v_rule in
    select * from recurring_task_rules r
    where r.is_active and not r.is_deleted
      and r.next_occurrence_at is not null
      and now() >= r.next_occurrence_at - make_interval(mins => r.create_lead_minutes)
    order by r.next_occurrence_at
    for update skip locked
  loop
    if v_rule.until_date is not null
       and (v_rule.next_occurrence_at at time zone v_rule.timezone)::date > v_rule.until_date then
      update recurring_task_rules set is_active = false where id = v_rule.id;
      continue;
    end if;

    v_project_name := null;
    if v_rule.project_id is not null then
      select name into v_project_name from projects where id = v_rule.project_id;
    end if;

    v_occ_date := (v_rule.next_occurrence_at at time zone v_rule.timezone)::date;

    v_name := v_rule.title;
    v_name := replace(v_name, '{project_name}', coalesce(v_project_name, ''));
    v_name := replace(v_name, '{date}', to_char(v_occ_date, 'DD.MM.YYYY'));
    if length(trim(v_name)) = 0 then v_name := 'Задача'; end if;

    if v_rule.project_id is not null then
      select coalesce(max(sort_order), 0) + 10 into v_sort
        from project_threads where project_id = v_rule.project_id and not is_deleted;
    else
      v_sort := 0;
    end if;

    v_start := null;
    v_end := null;
    if v_rule.end_time is not null then
      v_start := v_rule.next_occurrence_at;
      v_end := (v_occ_date + v_rule.end_time) at time zone v_rule.timezone;
      if v_end <= v_start then v_end := v_end + interval '1 day'; end if;
      v_deadline := v_end;
    else
      v_deadline := v_rule.next_occurrence_at;
    end if;

    insert into project_threads (
      workspace_id, project_id, name, type, status_id,
      accent_color, icon, access_type, access_roles,
      created_by, owner_user_id, source_template_id, recurring_rule_id,
      deadline, start_at, end_at, description, sort_order
    ) values (
      v_rule.workspace_id, v_rule.project_id, v_name, 'task', v_rule.status_id,
      v_rule.accent_color, v_rule.icon, v_rule.access_type, coalesce(v_rule.access_roles, '{}'),
      v_rule.created_by, v_rule.owner_user_id, v_rule.source_template_id, v_rule.id,
      v_deadline, v_start, v_end, v_rule.description, v_sort
    ) returning id into v_thread_id;

    if array_length(v_rule.assignee_participant_ids, 1) is not null then
      foreach v_pid in array v_rule.assignee_participant_ids loop
        insert into task_assignees (thread_id, participant_id)
        values (v_thread_id, v_pid) on conflict do nothing;
      end loop;
    end if;

    if v_rule.access_type = 'custom'
       and array_length(v_rule.member_participant_ids, 1) is not null then
      foreach v_pid in array v_rule.member_participant_ids loop
        insert into project_thread_members (thread_id, participant_id)
        values (v_thread_id, v_pid) on conflict do nothing;
      end loop;
    end if;

    v_next := public.recurring_next_occurrence(
      v_rule.next_occurrence_at, v_rule.freq, v_rule.byweekday, v_rule.bymonthday,
      v_rule.fire_time, v_rule.timezone, v_rule.starts_on);
    while v_next is not null and v_next <= now() loop
      v_next := public.recurring_next_occurrence(
        v_next, v_rule.freq, v_rule.byweekday, v_rule.bymonthday,
        v_rule.fire_time, v_rule.timezone, v_rule.starts_on);
    end loop;

    if v_next is null
       or (v_rule.until_date is not null and (v_next at time zone v_rule.timezone)::date > v_rule.until_date) then
      update recurring_task_rules
        set is_active = false, next_occurrence_at = null,
            occurrences_count = occurrences_count + 1,
            last_run_at = now(), last_generated_thread_id = v_thread_id
        where id = v_rule.id;
    else
      update recurring_task_rules
        set next_occurrence_at = v_next,
            occurrences_count = occurrences_count + 1,
            last_run_at = now(), last_generated_thread_id = v_thread_id
        where id = v_rule.id;
    end if;

    v_count := v_count + 1;
  end loop;
  return v_count;
end $function$


CREATE OR REPLACE FUNCTION public.generate_thread_link_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  code TEXT;
  exists_already BOOLEAN;
BEGIN
  LOOP
    code := upper(substr(md5(random()::text), 1, 8));
    SELECT EXISTS(
      SELECT 1 FROM project_threads WHERE link_code = code
      UNION ALL
      SELECT 1 FROM projects WHERE messenger_link_code = code
    ) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN code;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_accessible_projects(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(id uuid, name text, description text, workspace_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, deadline timestamp with time zone, status_id uuid, template_id uuid, google_drive_folder_link text, source_folder_id text, export_folder_id text, messenger_link_code text, last_activity_at timestamp with time zone, template_name text, has_active_deadline_task boolean, is_lead_template boolean, final_kind status_final_kind, contact_participant_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id UUID;
  v_workspace_roles TEXT[];
  v_has_view_all BOOLEAN := FALSE;
BEGIN
  SELECT par.id, par.workspace_roles
  INTO v_participant_id, v_workspace_roles
  FROM participants par
  WHERE par.user_id = p_user_id
    AND par.workspace_id = p_workspace_id
    AND par.is_deleted = false;

  IF v_participant_id IS NULL THEN RETURN; END IF;
  v_workspace_roles := COALESCE(v_workspace_roles, '{}');

  SELECT EXISTS(
    SELECT 1 FROM workspace_roles wr
    WHERE wr.workspace_id = p_workspace_id
      AND wr.name = ANY(v_workspace_roles)
      AND (wr.is_owner = true
           OR (wr.permissions->>'view_all_projects')::boolean = true)
  ) INTO v_has_view_all;

  RETURN QUERY
  SELECT proj.id, proj.name, proj.description, proj.workspace_id,
         proj.created_at, proj.updated_at, proj.created_by,
         proj.deadline, proj.status_id, proj.template_id,
         proj.google_drive_folder_link, proj.source_folder_id,
         proj.export_folder_id, proj.messenger_link_code,
         proj.last_activity_at,
         pt.name AS template_name,
         EXISTS(
           SELECT 1
           FROM project_threads th
           LEFT JOIN statuses s ON s.id = th.status_id
           WHERE th.project_id = proj.id
             AND th.is_deleted = false
             AND th.deadline IS NOT NULL
             AND (s.id IS NULL OR s.is_final = false)
         ) AS has_active_deadline_task,
         COALESCE(pt.is_lead_template, false) AS is_lead_template,
         ps.final_kind AS final_kind,
         proj.contact_participant_id
  FROM projects proj
  LEFT JOIN project_templates pt ON pt.id = proj.template_id
  LEFT JOIN statuses ps ON ps.id = proj.status_id
  WHERE proj.workspace_id = p_workspace_id
    AND proj.is_deleted = false
    AND (
      v_has_view_all
      OR EXISTS(
        SELECT 1 FROM project_participants pp
        WHERE pp.project_id = proj.id
          AND pp.participant_id = v_participant_id
      )
    )
  ORDER BY proj.created_at DESC
  LIMIT 200;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_admin_permissions()
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
begin
  return '{
    "manage_workspace_settings": true,
    "delete_workspace": false,
    "manage_participants": true,
    "manage_roles": true,
    "manage_templates": true,
    "manage_statuses": true,
    "manage_features": true,
    "create_projects": true,
    "view_all_projects": true,
    "edit_all_projects": true,
    "delete_all_projects": false,
    "view_workspace_digest": true
  }'::jsonb;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_article_version_history(p_article_id uuid)
 RETURNS TABLE(id uuid, version integer, title text, comment text, created_by uuid, created_at timestamp with time zone, is_current boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    kav.id, kav.version, kav.title,
    kav.comment, kav.created_by,
    kav.created_at, kav.is_current
  FROM knowledge_article_versions kav
  WHERE kav.article_id = p_article_id
  ORDER BY kav.version DESC;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_board_filtered_projects(p_workspace_id uuid, p_user_id uuid, p_filter jsonb)
 RETURNS TABLE(id uuid, name text, description text, workspace_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, deadline timestamp with time zone, status_id uuid, template_id uuid, google_drive_folder_link text, source_folder_id text, export_folder_id text, messenger_link_code text, last_activity_at timestamp with time zone, template_name text, has_active_deadline_task boolean, is_lead_template boolean, final_kind status_final_kind, contact_participant_id uuid, next_task_id uuid, next_task_name text, next_task_deadline timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_where text;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user mismatch';
  END IF;
  v_where := public._board_compile_group(COALESCE(p_filter, '{"logic":"and","rules":[]}'::jsonb), 'project');
  RETURN QUERY EXECUTE format(
    'SELECT b.*, ntd.next_task_id, ntd.next_task_name, ntd.next_task_deadline
       FROM public.get_accessible_projects(%L, %L) b
       LEFT JOIN LATERAL (
         SELECT th.id AS next_task_id, th.name AS next_task_name, th.deadline AS next_task_deadline
         FROM project_threads th
         LEFT JOIN statuses s ON s.id = th.status_id
         WHERE th.project_id = b.id AND th.type = ''task'' AND th.is_deleted = false
           AND th.deadline IS NOT NULL AND (s.id IS NULL OR s.is_final = false)
         ORDER BY th.deadline ASC LIMIT 1
       ) ntd ON true
      WHERE %s',
    p_workspace_id, p_user_id, v_where
  );
END $function$


CREATE OR REPLACE FUNCTION public.get_board_filtered_threads(p_workspace_id uuid, p_user_id uuid, p_filter jsonb)
 RETURNS TABLE(id uuid, name text, type text, workspace_id uuid, project_id uuid, project_name text, status_id uuid, status_name text, status_color text, status_order integer, status_show_to_creator boolean, deadline timestamp with time zone, start_at timestamp with time zone, end_at timestamp with time zone, accent_color text, icon text, is_pinned boolean, sort_order integer, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, email_unsent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_where text;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user mismatch';
  END IF;
  v_where := public._board_compile_group(COALESCE(p_filter, '{"logic":"and","rules":[]}'::jsonb), 'thread');
  RETURN QUERY EXECUTE format(
    'SELECT b.* FROM public.get_workspace_threads(%L, %L) b WHERE %s',
    p_workspace_id, p_user_id, v_where
  );
END $function$


CREATE OR REPLACE FUNCTION public.get_board_lists(p_board_id uuid)
 RETURNS TABLE(id uuid, board_id uuid, name text, entity_type text, column_index integer, sort_order integer, filters jsonb, sort_by text, sort_dir text, display_mode text, visible_fields text[], group_by text, list_height text, header_color text, card_layout jsonb, calendar_settings jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    bl.id, bl.board_id, bl.name, bl.entity_type,
    bl.column_index, bl.sort_order, bl.filters,
    bl.sort_by, bl.sort_dir, bl.display_mode,
    bl.visible_fields, bl.group_by, bl.list_height,
    bl.header_color, bl.card_layout, bl.calendar_settings,
    bl.created_at, bl.updated_at
  FROM board_lists bl
  WHERE bl.board_id = p_board_id
  ORDER BY bl.column_index ASC, bl.sort_order ASC;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_chat_state(p_thread_id uuid, p_user_id uuid, p_project_id uuid DEFAULT NULL::uuid, p_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id UUID;
  v_participant_name TEXT;
  v_participant_last_name TEXT;
  v_participant_avatar TEXT;
  v_participant_role TEXT;
  v_telegram_link JSON;
  v_email_link JSON;
  v_unread_count INTEGER;
  v_last_read_at TIMESTAMPTZ;
  v_manually_unread BOOLEAN;
BEGIN
  IF p_project_id IS NOT NULL THEN
    SELECT p.id, p.name, p.last_name, p.avatar_url, pp.project_roles[1]
    INTO v_participant_id, v_participant_name, v_participant_last_name,
         v_participant_avatar, v_participant_role
    FROM participants p
    JOIN project_participants pp ON pp.participant_id = p.id
    WHERE p.user_id = p_user_id
      AND pp.project_id = p_project_id
      AND p.is_deleted = false
    LIMIT 1;
  ELSIF p_workspace_id IS NOT NULL THEN
    SELECT id, name, last_name, avatar_url, workspace_roles[1]
    INTO v_participant_id, v_participant_name, v_participant_last_name,
         v_participant_avatar, v_participant_role
    FROM participants
    WHERE user_id = p_user_id
      AND workspace_id = p_workspace_id
      AND is_deleted = false
    LIMIT 1;
  END IF;

  SELECT json_build_object(
    'id', id,
    'project_id', project_id,
    'telegram_chat_id', telegram_chat_id,
    'telegram_chat_title', telegram_chat_title,
    'is_active', is_active,
    'channel', channel
  )
  INTO v_telegram_link
  FROM project_telegram_chats
  WHERE thread_id = p_thread_id
    AND is_active = true
  LIMIT 1;

  SELECT json_build_object(
    'id', id,
    'thread_id', thread_id,
    'contact_email', contact_email,
    'subject', subject
  )
  INTO v_email_link
  FROM project_thread_email_links
  WHERE thread_id = p_thread_id
    AND is_active = true
  LIMIT 1;

  IF v_participant_id IS NOT NULL THEN
    SELECT last_read_at, manually_unread
    INTO v_last_read_at, v_manually_unread
    FROM message_read_status
    WHERE participant_id = v_participant_id
      AND thread_id = p_thread_id
    LIMIT 1;

    SELECT public.get_unread_messages_count(
      p_participant_id := v_participant_id,
      p_project_id := p_project_id,
      p_channel := 'client',
      p_thread_id := p_thread_id
    )
    INTO v_unread_count;
  END IF;

  RETURN json_build_object(
    'participant', CASE WHEN v_participant_id IS NOT NULL THEN
      json_build_object(
        'participantId', v_participant_id,
        'name', v_participant_name,
        'lastName', v_participant_last_name,
        'avatarUrl', v_participant_avatar,
        'role', v_participant_role
      )
    ELSE NULL END,
    'telegramLink', v_telegram_link,
    'emailLink', v_email_link,
    'unreadCount', COALESCE(v_unread_count, 0),
    'lastReadAt', v_last_read_at,
    'manuallyUnread', COALESCE(v_manually_unread, false)
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.get_client_ws_permissions()
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
begin
  return '{
    "manage_workspace_settings": false,
    "delete_workspace": false,
    "manage_participants": false,
    "manage_roles": false,
    "manage_templates": false,
    "manage_statuses": false,
    "manage_features": false,
    "create_projects": false,
    "view_all_projects": false,
    "edit_all_projects": false,
    "delete_all_projects": false,
    "view_workspace_digest": false
  }'::jsonb;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_current_document_file(p_document_id uuid)
 RETURNS TABLE(id uuid, version integer, file_path text, file_name text, file_size bigint, mime_type text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    df.id, df.version, df.file_path, 
    df.file_name, df.file_size, df.mime_type,
    df.created_at
  FROM document_files df
  WHERE df.document_id = p_document_id 
    AND df.is_current = true;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_document_file_history(p_document_id uuid)
 RETURNS TABLE(id uuid, version integer, file_name text, file_size bigint, uploaded_by uuid, created_at timestamp with time zone, is_current boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    df.id, df.version, df.file_name, 
    df.file_size, df.uploaded_by, 
    df.created_at, df.is_current
  FROM document_files df
  WHERE df.document_id = p_document_id
  ORDER BY df.version DESC;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_employee_permissions()
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
begin
  return '{
    "manage_workspace_settings": false,
    "delete_workspace": false,
    "manage_participants": false,
    "manage_roles": false,
    "manage_templates": false,
    "manage_statuses": false,
    "manage_features": false,
    "create_projects": true,
    "view_all_projects": false,
    "edit_all_projects": false,
    "delete_all_projects": false,
    "view_workspace_digest": true
  }'::jsonb;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_history_unread_count(p_project_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count BIGINT;
  v_last_read TIMESTAMPTZ;
  v_user_id UUID;
  v_project_active BOOLEAN;
BEGIN
  v_user_id := auth.uid();

  -- Skip counting on a soft-deleted project — its events are inert.
  SELECT NOT p.is_deleted INTO v_project_active
  FROM public.projects p
  WHERE p.id = p_project_id;
  IF v_project_active IS NOT TRUE THEN
    RETURN 0;
  END IF;

  SELECT hrs.last_read_at INTO v_last_read
  FROM public.history_read_status hrs
  WHERE hrs.user_id = v_user_id AND hrs.project_id = p_project_id;

  SELECT COUNT(*) INTO v_count
  FROM public.audit_logs al
  WHERE al.project_id = p_project_id
    AND (v_last_read IS NULL OR al.created_at > v_last_read)
    AND al.user_id IS DISTINCT FROM v_user_id;

  RETURN v_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_inbox_awaiting_reply_threads(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT v.* FROM get_inbox_threads_v3_for(p_workspace_id, p_user_id, ARRAY(
    SELECT us.thread_id FROM thread_unread_state us JOIN thread_inbox_meta m ON m.thread_id = us.thread_id
    WHERE us.participant_id = (SELECT id FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1)
      AND m.last_message_at IS NOT NULL
      AND us.unread_count = 0 AND us.unread_event_count = 0 AND us.unread_reaction_count = 0 AND us.has_unread_reaction = false AND us.manually_unread = false
      AND m.last_from_staff = true AND m.has_external = true
  )) v
  ORDER BY COALESCE(GREATEST(v.last_message_at, v.last_event_at), 'epoch'::timestamptz) DESC, v.thread_id DESC;
$function$


CREATE OR REPLACE FUNCTION public.get_inbox_message_status(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, delivery_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH up AS (
    SELECT p.id AS participant_id
    FROM participants p
    WHERE p.workspace_id = p_workspace_id AND p.user_id = p_user_id AND p.is_deleted = FALSE
    LIMIT 1
  ),
  last_msg AS (
    SELECT DISTINCT ON (pm.thread_id)
      pm.thread_id,
      pm.sender_participant_id,
      pm.send_status,
      pm.recipient_read_at,
      pm.wazzup_status,
      pm.email_delivery_status
    FROM project_messages pm
    JOIN project_threads pt ON pt.id = pm.thread_id AND pt.workspace_id = p_workspace_id
    CROSS JOIN up
    LEFT JOIN message_read_status mrs
      ON mrs.thread_id = pm.thread_id AND mrs.participant_id = up.participant_id
    WHERE pm.source != 'telegram_service'::message_source
    ORDER BY
      pm.thread_id,
      (CASE
         WHEN pm.sender_participant_id IS DISTINCT FROM up.participant_id
          AND (mrs.last_read_at IS NULL OR pm.created_at > mrs.last_read_at)
         THEN 0 ELSE 1
       END) ASC,
      pm.created_at DESC
  )
  SELECT
    lm.thread_id,
    CASE
      -- входящее (последнее не наше) → нет индикатора
      WHEN lm.sender_participant_id IS DISTINCT FROM (SELECT participant_id FROM up) THEN NULL
      WHEN lm.send_status::text = 'failed' THEN 'failed'
      WHEN lm.send_status::text = 'pending' THEN 'pending'
      WHEN lm.recipient_read_at IS NOT NULL THEN 'read'
      WHEN lm.wazzup_status = 'read' THEN 'read'
      WHEN lm.email_delivery_status IN ('opened', 'clicked') THEN 'read'
      ELSE 'sent'
    END::text AS delivery_status
  FROM last_msg lm;
$function$


CREATE OR REPLACE FUNCTION public.get_inbox_muted_threads(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT id FROM participants
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1
  )
  SELECT
    v.thread_id, v.thread_name, v.thread_icon, v.thread_accent_color, v.thread_type,
    v.project_id, v.project_name, v.channel_type, v.legacy_channel,
    v.last_message_at, v.last_message_text, v.last_message_attachment_name,
    v.last_message_attachment_count, v.last_message_attachment_mime,
    v.last_sender_name, v.last_sender_avatar_url,
    us.muted_unread_count AS unread_count,
    v.manually_unread,
    us.muted_has_unread_reaction AS has_unread_reaction,
    us.muted_unread_reaction_count AS unread_reaction_count,
    us.muted_last_reaction_emoji AS last_reaction_emoji,
    v.last_reaction_at, v.last_reaction_sender_name, v.last_reaction_sender_avatar_url,
    v.last_reaction_message_preview, v.email_contact, v.email_subject,
    v.last_event_at, v.last_event_text, v.last_event_status_color,
    us.muted_unread_event_count AS unread_event_count,
    v.counterpart_name, v.counterpart_avatar_url, v.last_read_at, v.last_event_sender_avatar_url
  FROM get_inbox_threads_v3_for(p_workspace_id, p_user_id, ARRAY(
    SELECT us2.thread_id FROM thread_unread_state us2, me
    WHERE us2.participant_id = me.id
      AND (us2.muted_unread_count > 0 OR us2.muted_unread_event_count > 0
           OR us2.muted_unread_reaction_count > 0 OR us2.muted_has_unread_reaction = true)
  )) v
  JOIN me ON true
  JOIN thread_unread_state us ON us.thread_id = v.thread_id AND us.participant_id = me.id
  ORDER BY GREATEST(
             COALESCE(v.last_message_at, 'epoch'::timestamptz),
             COALESCE(v.last_event_at, 'epoch'::timestamptz)
           ) DESC, v.thread_id DESC;
$function$


CREATE OR REPLACE FUNCTION public.get_inbox_needs_reply_threads(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT v.* FROM get_inbox_threads_v3_for(p_workspace_id, p_user_id, ARRAY(
    SELECT us.thread_id FROM thread_unread_state us JOIN thread_inbox_meta m ON m.thread_id = us.thread_id
    WHERE us.participant_id = (SELECT id FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1)
      AND m.last_message_at IS NOT NULL
      AND us.unread_count = 0 AND us.unread_event_count = 0 AND us.unread_reaction_count = 0 AND us.has_unread_reaction = false AND us.manually_unread = false
      AND m.last_from_staff IS NOT TRUE AND m.has_external = true
  )) v
  ORDER BY COALESCE(GREATEST(v.last_message_at, v.last_event_at), 'epoch'::timestamptz) DESC, v.thread_id DESC;
$function$


CREATE OR REPLACE FUNCTION public.get_inbox_search_threads(p_workspace_id uuid, p_user_id uuid, p_query text, p_limit integer DEFAULT 50)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pat
  )
  SELECT t.*
  FROM get_inbox_threads_v2(p_workspace_id, p_user_id) t, q
  WHERE btrim(p_query) <> ''
    AND (
      t.thread_name ILIKE q.pat ESCAPE '\'
      OR t.project_name ILIKE q.pat ESCAPE '\'
    )
  ORDER BY COALESCE(GREATEST(t.last_message_at, t.last_event_at), 'epoch'::timestamptz) DESC,
           t.thread_id DESC
  LIMIT GREATEST(p_limit, 1);
$function$


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
  JOIN project_threads pt ON pt.id = us.thread_id
  WHERE us.participant_id = (SELECT id FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1);
$function$


CREATE OR REPLACE FUNCTION public.get_inbox_thread_one(p_workspace_id uuid, p_user_id uuid, p_thread_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.*
  FROM get_inbox_threads_v2(p_workspace_id, p_user_id) t
  WHERE t.thread_id = p_thread_id
  LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.get_inbox_threads_page(p_workspace_id uuid, p_user_id uuid, p_cursor_sort_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_thread_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text, sort_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT id AS pid FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1),
  base AS (
    SELECT us.thread_id, m.sort_at, us.manually_unread
    FROM thread_unread_state us JOIN thread_inbox_meta m ON m.thread_id = us.thread_id, me
    WHERE us.participant_id = me.pid
  ),
  main_page AS (
    SELECT thread_id, sort_at FROM base
    WHERE p_cursor_sort_at IS NULL OR (sort_at, thread_id) < (p_cursor_sort_at, p_cursor_thread_id)
    ORDER BY sort_at DESC, thread_id DESC LIMIT GREATEST(p_limit, 1)
  ),
  extras AS (SELECT thread_id, sort_at FROM base WHERE p_cursor_sort_at IS NULL AND manually_unread = true),
  picked AS (SELECT thread_id, sort_at FROM main_page UNION SELECT thread_id, sort_at FROM extras)
  SELECT v.*, picked.sort_at
  FROM get_inbox_threads_v3_for(p_workspace_id, p_user_id, ARRAY(SELECT thread_id FROM picked)) v
  JOIN picked ON picked.thread_id = v.thread_id
  ORDER BY picked.sort_at DESC, v.thread_id DESC;
$function$


CREATE OR REPLACE FUNCTION public.get_inbox_threads_v2(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  user_participant AS (
    SELECT p.id AS participant_id, p.workspace_roles
    FROM participants p
    WHERE p.workspace_id = p_workspace_id AND p.user_id = p_user_id AND p.is_deleted = FALSE
    LIMIT 1
  ),
  user_is_internal AS (SELECT is_internal_member(p_workspace_id, p_user_id) AS allowed),
  can_view_all AS (
    SELECT EXISTS (
      SELECT 1 FROM workspace_roles wr, user_participant up
      WHERE wr.workspace_id = p_workspace_id AND wr.name = ANY(up.workspace_roles)
        AND (wr.is_owner = TRUE OR (wr.permissions->>'view_all_projects')::boolean = TRUE)
    ) AS allowed
  ),
  accessible_projects AS (
    SELECT proj.id, proj.name FROM projects proj
    WHERE proj.workspace_id = p_workspace_id AND proj.is_deleted = false
      AND ((SELECT allowed FROM can_view_all) OR proj.id IN (
        SELECT pp.project_id FROM project_participants pp, user_participant up
        WHERE pp.participant_id = up.participant_id))
  ),
  accessible_threads AS (
    SELECT pt.id, pt.project_id, pt.name, pt.icon, pt.accent_color, pt.legacy_channel, pt.access_type, pt.type,
           pt.business_client_tg_user_id, pt.mtproto_client_tg_user_id, pt.wazzup_contact_avatar_url,
           pt.email_last_external_address
    FROM project_threads pt
    INNER JOIN accessible_projects ap ON ap.id = pt.project_id
    WHERE pt.is_deleted = false
      AND ((pt.legacy_channel IS DISTINCT FROM 'internal') OR ((SELECT allowed FROM user_is_internal)))
    UNION
    SELECT pt.id, pt.project_id, pt.name, pt.icon, pt.accent_color, pt.legacy_channel, pt.access_type, pt.type,
           pt.business_client_tg_user_id, pt.mtproto_client_tg_user_id, pt.wazzup_contact_avatar_url,
           pt.email_last_external_address
    FROM project_threads pt
    WHERE pt.workspace_id = p_workspace_id
      AND pt.project_id IS NULL
      AND pt.is_deleted = false
      AND (
        pt.owner_user_id = p_user_id
        OR EXISTS (
          SELECT 1 FROM task_assignees ta
          JOIN participants par ON par.id = ta.participant_id
          WHERE ta.thread_id = pt.id AND par.user_id = p_user_id AND par.is_deleted = false
        )
        OR EXISTS (
          SELECT 1 FROM project_thread_members ptm
          JOIN participants par ON par.id = ptm.participant_id
          WHERE ptm.thread_id = pt.id AND par.user_id = p_user_id AND par.is_deleted = false
        )
      )
    UNION
    SELECT pt.id, pt.project_id, pt.name, pt.icon, pt.accent_color, pt.legacy_channel, pt.access_type, pt.type,
           pt.business_client_tg_user_id, pt.mtproto_client_tg_user_id, pt.wazzup_contact_avatar_url,
           pt.email_last_external_address
    FROM project_threads pt
    WHERE pt.workspace_id = p_workspace_id
      AND pt.project_id IS NOT NULL
      AND pt.is_deleted = false
      AND ((pt.legacy_channel IS DISTINCT FROM 'internal') OR ((SELECT allowed FROM user_is_internal)))
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          JOIN participants par ON par.id = ta.participant_id
          WHERE ta.thread_id = pt.id AND par.user_id = p_user_id AND par.is_deleted = false
        )
        OR EXISTS (
          SELECT 1 FROM project_thread_members ptm
          JOIN participants par ON par.id = ptm.participant_id
          WHERE ptm.thread_id = pt.id AND par.user_id = p_user_id AND par.is_deleted = false
        )
      )
  ),
  last_messages AS (
    SELECT DISTINCT ON (pm.thread_id)
      pm.id AS message_id, pm.thread_id, pm.created_at AS message_at,
      pm.content AS message_text, pm.sender_name, pm.sender_participant_id
    FROM project_messages pm
    INNER JOIN accessible_threads at ON at.id = pm.thread_id
    CROSS JOIN user_participant up
    LEFT JOIN message_read_status mrs ON mrs.thread_id = pm.thread_id AND mrs.participant_id = up.participant_id
    WHERE pm.source != 'telegram_service'::message_source
    ORDER BY
      pm.thread_id,
      (CASE
         WHEN pm.sender_participant_id IS DISTINCT FROM up.participant_id
          AND (mrs.last_read_at IS NULL OR pm.created_at > mrs.last_read_at)
         THEN 0 ELSE 1
       END) ASC,
      pm.created_at DESC
  ),
  last_client_messages AS (
    SELECT DISTINCT ON (pm.thread_id)
      pm.thread_id, pm.sender_name, pm.sender_participant_id, pm.telegram_sender_user_id, pm.source
    FROM project_messages pm
    INNER JOIN accessible_threads at ON at.id = pm.thread_id
    WHERE pm.source != 'telegram_service'::message_source
      AND (pm.sender_role IS NULL OR pm.sender_role NOT IN ('Администратор','Владелец','Сотрудник','Исполнитель'))
    ORDER BY pm.thread_id, pm.created_at DESC
  ),
  last_message_attachments AS (
    SELECT lm.thread_id,
      (SELECT ma.file_name FROM message_attachments ma WHERE ma.message_id = lm.message_id ORDER BY ma.created_at ASC LIMIT 1) AS first_file_name,
      (SELECT ma.mime_type FROM message_attachments ma WHERE ma.message_id = lm.message_id ORDER BY ma.created_at ASC LIMIT 1) AS first_mime_type,
      (SELECT COUNT(*)::int FROM message_attachments ma WHERE ma.message_id = lm.message_id) AS file_count
    FROM last_messages lm
  ),
  unread_counts AS (
    SELECT pm.thread_id, COUNT(*) AS cnt FROM project_messages pm
    INNER JOIN accessible_threads at ON at.id = pm.thread_id
    CROSS JOIN user_participant up
    LEFT JOIN message_read_status mrs ON mrs.participant_id = up.participant_id AND mrs.thread_id = pm.thread_id
    WHERE (mrs.last_read_at IS NULL OR pm.created_at > mrs.last_read_at)
      AND pm.sender_participant_id IS DISTINCT FROM up.participant_id
      AND pm.source != 'telegram_service'::message_source
    GROUP BY pm.thread_id
  ),
  manual_unread AS (
    SELECT mrs.thread_id, mrs.manually_unread, mrs.last_read_at FROM message_read_status mrs
    INNER JOIN user_participant up ON up.participant_id = mrs.participant_id
    WHERE mrs.thread_id IN (SELECT id FROM accessible_threads)
  ),
  last_reactions AS (
    SELECT DISTINCT ON (pm.thread_id)
      pm.thread_id, mr.emoji, mr.created_at AS reaction_at, mr.participant_id AS reactor_participant_id,
      mr.telegram_user_id AS reactor_telegram_user_id, mr.telegram_user_name AS reactor_telegram_user_name,
      pm.content AS reacted_message_text
    FROM message_reactions mr
    INNER JOIN project_messages pm ON pm.id = mr.message_id
    INNER JOIN accessible_threads at ON at.id = pm.thread_id
    CROSS JOIN user_participant up
    WHERE mr.participant_id IS DISTINCT FROM up.participant_id
    ORDER BY pm.thread_id, mr.created_at DESC
  ),
  unread_reaction_counts AS (
    SELECT pm.thread_id, COUNT(*) AS cnt FROM message_reactions mr
    INNER JOIN project_messages pm ON pm.id = mr.message_id
    INNER JOIN accessible_threads at ON at.id = pm.thread_id
    CROSS JOIN user_participant up
    LEFT JOIN message_read_status mrs ON mrs.participant_id = up.participant_id AND mrs.thread_id = pm.thread_id
    WHERE mr.participant_id IS DISTINCT FROM up.participant_id
      AND (mrs.last_read_at IS NULL OR mr.created_at > mrs.last_read_at)
    GROUP BY pm.thread_id
  ),
  telegram_links AS (
    SELECT ptc.thread_id FROM project_telegram_chats ptc
    WHERE ptc.thread_id IN (SELECT id FROM accessible_threads) AND ptc.is_active = true
  ),
  email_links AS (
    SELECT el.thread_id, el.contact_email, el.subject FROM project_thread_email_links el
    WHERE el.thread_id IN (SELECT id FROM accessible_threads) AND el.is_active = true
  ),
  last_audit AS (
    SELECT DISTINCT ON (al.resource_id)
      al.resource_id AS thread_id, al.created_at AS event_at, al.action, al.details, al.user_id AS actor_user_id,
      actor.actor_name, actor.actor_avatar_url
    FROM audit_logs al
    LEFT JOIN LATERAL (
      SELECT NULLIF(TRIM(COALESCE(pa.name, '') || ' ' || COALESCE(pa.last_name, '')), '') AS actor_name,
             pa.avatar_url AS actor_avatar_url
      FROM participants pa
      WHERE pa.user_id = al.user_id AND pa.workspace_id = p_workspace_id AND pa.is_deleted = FALSE
      LIMIT 1
    ) actor ON true
    WHERE al.resource_id IN (SELECT id FROM accessible_threads)
      AND al.resource_type IN ('task', 'thread') AND al.user_id IS DISTINCT FROM p_user_id
    ORDER BY al.resource_id, al.created_at DESC
  ),
  unread_audit AS (
    SELECT al.resource_id AS thread_id, COUNT(*) AS cnt FROM audit_logs al
    CROSS JOIN user_participant up
    LEFT JOIN message_read_status mrs ON mrs.participant_id = up.participant_id AND mrs.thread_id = al.resource_id
    LEFT JOIN statuses s_new
      ON al.action = 'change_status'
     AND (al.details->>'new_status') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND s_new.id = (al.details->>'new_status')::uuid AND s_new.workspace_id = p_workspace_id
    WHERE al.resource_id IN (SELECT id FROM accessible_threads)
      AND al.resource_type IN ('task', 'thread') AND al.user_id IS DISTINCT FROM p_user_id
      AND (mrs.last_read_at IS NULL OR al.created_at > mrs.last_read_at)
      AND (al.action <> 'change_status' OR COALESCE(s_new.silent_transition, false) = false)
    GROUP BY al.resource_id
  ),
  last_audit_status AS (
    SELECT la.thread_id, s.name AS status_name, s.color AS status_color FROM last_audit la
    LEFT JOIN statuses s
      ON la.action = 'change_status'
     AND (la.details->>'new_status') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND s.id = (la.details->>'new_status')::uuid AND s.workspace_id = p_workspace_id
  )
  SELECT
    at.id, at.name::TEXT, at.icon::TEXT, at.accent_color::TEXT, at.type::TEXT, at.project_id, ap.name::TEXT,
    CASE WHEN tl.thread_id IS NOT NULL THEN 'telegram' WHEN el.thread_id IS NOT NULL OR at.type = 'email' THEN 'email' ELSE 'web' END::TEXT,
    at.legacy_channel::TEXT, lm.message_at, lm.message_text::TEXT,
    lma.first_file_name::TEXT, COALESCE(lma.file_count, 0), lma.first_mime_type::TEXT,
    COALESCE(
      NULLIF(TRIM(COALESCE(sender_p.name, '') || ' ' || COALESCE(sender_p.last_name, '')), ''),
      NULLIF(TRIM(COALESCE(email_counter_p.name, '') || ' ' || COALESCE(email_counter_p.last_name, '')), ''),
      lm.sender_name
    )::TEXT,
    COALESCE(sender_p.avatar_url, email_counter_p.avatar_url)::TEXT,
    COALESCE(uc.cnt, 0), COALESCE(mu.manually_unread, FALSE),
    CASE WHEN lr.reaction_at IS NOT NULL AND (mu.last_read_at IS NULL OR lr.reaction_at > mu.last_read_at) THEN TRUE ELSE FALSE END,
    COALESCE(urc.cnt, 0), lr.emoji::TEXT, lr.reaction_at,
    COALESCE(reactor_p.name, reactor_tg_p.name, lr.reactor_telegram_user_name)::TEXT,
    COALESCE(reactor_p.avatar_url, reactor_tg_p.avatar_url)::TEXT,
    lr.reacted_message_text::TEXT, COALESCE(el.contact_email, at.email_last_external_address)::TEXT, el.subject::TEXT, la.event_at,
    (COALESCE(la.actor_name || ' · ', '') ||
    CASE
      WHEN la.action = 'change_status' AND las.status_name IS NOT NULL THEN 'Статус: ' || las.status_name
      WHEN la.action = 'change_status' THEN 'Изменён статус'
      WHEN la.action = 'change_deadline' THEN 'Изменён дедлайн'
      WHEN la.action = 'rename' THEN 'Переименовано'
      WHEN la.action = 'create' THEN 'Создано'
      WHEN la.action = 'delete' THEN 'Удалено'
      WHEN la.action = 'change_settings' THEN 'Изменены настройки'
      WHEN la.action = 'pin' THEN 'Закреплено'
      WHEN la.action = 'unpin' THEN 'Откреплено'
      WHEN la.action = 'change_assignees' THEN 'Изменены исполнители'
      ELSE la.action
    END)::TEXT,
    las.status_color::TEXT, COALESCE(ua.cnt, 0),
    COALESCE(
      NULLIF(TRIM(COALESCE(counter_p.name, '') || ' ' || COALESCE(counter_p.last_name, '')), ''),
      NULLIF(TRIM(COALESCE(email_counter_p.name, '') || ' ' || COALESCE(email_counter_p.last_name, '')), ''),
      lcm.sender_name
    )::TEXT,
    COALESCE(counter_p.avatar_url, email_counter_p.avatar_url, tg_av_business.avatar_url, tg_av_mtproto.avatar_url, tg_av_group.avatar_url, at.wazzup_contact_avatar_url)::TEXT,
    mu.last_read_at,
    la.actor_avatar_url::TEXT
  FROM accessible_threads at
  LEFT JOIN accessible_projects ap ON ap.id = at.project_id
  LEFT JOIN last_messages lm ON lm.thread_id = at.id
  LEFT JOIN last_client_messages lcm ON lcm.thread_id = at.id
  LEFT JOIN participants counter_p ON counter_p.id = lcm.sender_participant_id AND counter_p.is_deleted = FALSE
  LEFT JOIN telegram_user_avatars tg_av_business
    ON at.business_client_tg_user_id IS NOT NULL AND tg_av_business.tg_user_id = at.business_client_tg_user_id AND tg_av_business.is_missing = FALSE
  LEFT JOIN telegram_user_avatars tg_av_mtproto
    ON at.mtproto_client_tg_user_id IS NOT NULL AND tg_av_mtproto.tg_user_id = at.mtproto_client_tg_user_id AND tg_av_mtproto.is_missing = FALSE
  LEFT JOIN telegram_user_avatars tg_av_group
    ON lcm.telegram_sender_user_id IS NOT NULL AND tg_av_group.tg_user_id = lcm.telegram_sender_user_id AND tg_av_group.is_missing = FALSE
  LEFT JOIN last_message_attachments lma ON lma.thread_id = at.id
  LEFT JOIN participants sender_p ON sender_p.id = lm.sender_participant_id
  LEFT JOIN unread_counts uc ON uc.thread_id = at.id
  LEFT JOIN manual_unread mu ON mu.thread_id = at.id
  LEFT JOIN last_reactions lr ON lr.thread_id = at.id
  LEFT JOIN unread_reaction_counts urc ON urc.thread_id = at.id
  LEFT JOIN participants reactor_p ON reactor_p.id = lr.reactor_participant_id AND reactor_p.is_deleted = FALSE
  LEFT JOIN participants reactor_tg_p
    ON reactor_p.id IS NULL AND lr.reactor_telegram_user_id IS NOT NULL
   AND reactor_tg_p.workspace_id = p_workspace_id AND reactor_tg_p.telegram_user_id = lr.reactor_telegram_user_id AND reactor_tg_p.is_deleted = FALSE
  LEFT JOIN telegram_links tl ON tl.thread_id = at.id
  LEFT JOIN email_links el ON el.thread_id = at.id
  LEFT JOIN LATERAL (
    SELECT ecp.name, ecp.last_name, ecp.avatar_url
    FROM participants ecp
    WHERE ecp.workspace_id = p_workspace_id
      AND ecp.is_deleted = FALSE
      AND lower(ecp.email) = lower(COALESCE(el.contact_email, at.email_last_external_address))
    ORDER BY ecp.created_at ASC
    LIMIT 1
  ) email_counter_p ON TRUE
  LEFT JOIN last_audit la ON la.thread_id = at.id
  LEFT JOIN last_audit_status las ON las.thread_id = at.id
  LEFT JOIN unread_audit ua ON ua.thread_id = at.id
  ORDER BY GREATEST(lm.message_at, la.event_at) DESC NULLS LAST;
$function$


CREATE OR REPLACE FUNCTION public.get_inbox_threads_v3(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT p.id AS participant_id,
      EXISTS(SELECT 1 FROM workspace_roles wr WHERE wr.workspace_id = p_workspace_id AND wr.name = ANY(p.workspace_roles)
             AND (wr.is_owner OR (wr.permissions->>'view_all_projects')::boolean)) AS can_view_all
    FROM participants p WHERE p.workspace_id = p_workspace_id AND p.user_id = p_user_id AND p.is_deleted = false LIMIT 1
  ),
  base AS (
    SELECT us.thread_id, us.unread_count, us.unread_event_count, us.unread_reaction_count,
           us.has_unread_reaction, us.manually_unread, us.last_read_at,
           m.channel_type, m.email_contact, m.email_subject,
           me.participant_id AS my_participant, me.can_view_all
    FROM thread_unread_state us
    JOIN me ON me.participant_id = us.participant_id
    JOIN thread_inbox_meta m ON m.thread_id = us.thread_id
  )
  SELECT
    b.thread_id, pt.name::text, pt.icon::text, pt.accent_color::text, pt.type::text, pt.project_id, pr.name::text,
    b.channel_type::text, pt.legacy_channel::text,
    lm.message_at, lm.message_text::text,
    (SELECT ma.file_name FROM message_attachments ma WHERE ma.message_id = lm.message_id ORDER BY ma.created_at ASC LIMIT 1)::text,
    COALESCE((SELECT count(*)::int FROM message_attachments ma WHERE ma.message_id = lm.message_id), 0),
    (SELECT ma.mime_type FROM message_attachments ma WHERE ma.message_id = lm.message_id ORDER BY ma.created_at ASC LIMIT 1)::text,
    COALESCE(
      NULLIF(TRIM(COALESCE(sender_p.name,'')||' '||COALESCE(sender_p.last_name,'')),''),
      NULLIF(TRIM(COALESCE(email_counter_p.name,'')||' '||COALESCE(email_counter_p.last_name,'')),''),
      lm.sender_name
    )::text,
    COALESCE(sender_p.avatar_url, email_counter_p.avatar_url)::text,
    b.unread_count, COALESCE(b.manually_unread, false),
    b.has_unread_reaction, b.unread_reaction_count, lr.emoji::text, lr.reaction_at,
    COALESCE(reactor_p.name, reactor_tg_p.name, lr.reactor_telegram_user_name)::text,
    COALESCE(reactor_p.avatar_url, reactor_tg_p.avatar_url)::text,
    lr.reacted_message_text::text, b.email_contact::text, b.email_subject::text, la.event_at,
    (COALESCE(la.actor_name || ' · ', '') ||
      CASE
        WHEN la.action = 'change_status' AND las.status_name IS NOT NULL THEN 'Статус: ' || las.status_name
        WHEN la.action = 'change_status' THEN 'Изменён статус'
        WHEN la.action = 'change_deadline' THEN 'Изменён дедлайн'
        WHEN la.action = 'rename' THEN 'Переименовано'
        WHEN la.action = 'create' THEN 'Создано'
        WHEN la.action = 'delete' THEN 'Удалено'
        WHEN la.action = 'change_settings' THEN 'Изменены настройки'
        WHEN la.action = 'pin' THEN 'Закреплено'
        WHEN la.action = 'unpin' THEN 'Откреплено'
        WHEN la.action = 'change_assignees' THEN 'Изменены исполнители'
        ELSE la.action
      END)::text,
    las.status_color::text, b.unread_event_count,
    COALESCE(
      NULLIF(TRIM(COALESCE(counter_p.name,'')||' '||COALESCE(counter_p.last_name,'')),''),
      NULLIF(TRIM(COALESCE(email_counter_p.name,'')||' '||COALESCE(email_counter_p.last_name,'')),''),
      lcm.sender_name
    )::text,
    COALESCE(counter_p.avatar_url, email_counter_p.avatar_url, tg_av_business.avatar_url, tg_av_mtproto.avatar_url, tg_av_group.avatar_url, pt.wazzup_contact_avatar_url)::text,
    b.last_read_at,
    la.actor_avatar_url::text
  FROM base b
  JOIN project_threads pt ON pt.id = b.thread_id
  LEFT JOIN projects pr ON pr.id = pt.project_id AND pr.is_deleted = false
    AND (b.can_view_all OR EXISTS(SELECT 1 FROM project_participants pp WHERE pp.project_id = pr.id AND pp.participant_id = b.my_participant))
  LEFT JOIN LATERAL (
    SELECT pm.id AS message_id, pm.created_at AS message_at, pm.content AS message_text, pm.sender_name, pm.sender_participant_id
    FROM project_messages pm
    WHERE pm.thread_id = b.thread_id AND pm.source <> 'telegram_service'::message_source
    ORDER BY (CASE WHEN pm.sender_participant_id IS DISTINCT FROM b.my_participant
                    AND (b.last_read_at IS NULL OR pm.created_at > b.last_read_at) THEN 0 ELSE 1 END) ASC,
             pm.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT pm.sender_name, pm.sender_participant_id, pm.telegram_sender_user_id
    FROM project_messages pm
    WHERE pm.thread_id = b.thread_id AND pm.source <> 'telegram_service'::message_source
      AND (pm.sender_role IS NULL OR pm.sender_role NOT IN ('Администратор','Владелец','Сотрудник','Исполнитель'))
    ORDER BY pm.created_at DESC LIMIT 1
  ) lcm ON true
  LEFT JOIN LATERAL (
    SELECT mr.emoji, mr.created_at AS reaction_at, mr.participant_id AS reactor_participant_id,
           mr.telegram_user_id AS reactor_telegram_user_id, mr.telegram_user_name AS reactor_telegram_user_name,
           pm.content AS reacted_message_text
    FROM message_reactions mr JOIN project_messages pm ON pm.id = mr.message_id
    WHERE pm.thread_id = b.thread_id AND mr.participant_id IS DISTINCT FROM b.my_participant
    ORDER BY mr.created_at DESC LIMIT 1
  ) lr ON true
  LEFT JOIN LATERAL (
    SELECT al.created_at AS event_at, al.action, al.details, al.user_id AS actor_user_id,
           actor.actor_name, actor.actor_avatar_url
    FROM audit_logs al
    LEFT JOIN LATERAL (
      SELECT NULLIF(TRIM(COALESCE(pa.name,'')||' '||COALESCE(pa.last_name,'')),'') AS actor_name, pa.avatar_url AS actor_avatar_url
      FROM participants pa WHERE pa.user_id = al.user_id AND pa.workspace_id = p_workspace_id AND pa.is_deleted = false LIMIT 1
    ) actor ON true
    WHERE al.resource_id = b.thread_id AND al.resource_type IN ('task','thread') AND al.user_id IS DISTINCT FROM p_user_id
    ORDER BY al.created_at DESC LIMIT 1
  ) la ON true
  LEFT JOIN statuses las_s ON la.action = 'change_status'
    AND (la.details->>'new_status') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND las_s.id = (la.details->>'new_status')::uuid AND las_s.workspace_id = p_workspace_id
  LEFT JOIN LATERAL (SELECT las_s.name AS status_name, las_s.color AS status_color) las ON true
  LEFT JOIN participants sender_p ON sender_p.id = lm.sender_participant_id
  LEFT JOIN participants counter_p ON counter_p.id = lcm.sender_participant_id AND counter_p.is_deleted = false
  LEFT JOIN participants reactor_p ON reactor_p.id = lr.reactor_participant_id AND reactor_p.is_deleted = false
  LEFT JOIN participants reactor_tg_p ON reactor_p.id IS NULL AND lr.reactor_telegram_user_id IS NOT NULL
    AND reactor_tg_p.workspace_id = p_workspace_id AND reactor_tg_p.telegram_user_id = lr.reactor_telegram_user_id AND reactor_tg_p.is_deleted = false
  LEFT JOIN telegram_user_avatars tg_av_business ON pt.business_client_tg_user_id IS NOT NULL
    AND tg_av_business.tg_user_id = pt.business_client_tg_user_id AND tg_av_business.is_missing = false
  LEFT JOIN telegram_user_avatars tg_av_mtproto ON pt.mtproto_client_tg_user_id IS NOT NULL
    AND tg_av_mtproto.tg_user_id = pt.mtproto_client_tg_user_id AND tg_av_mtproto.is_missing = false
  LEFT JOIN telegram_user_avatars tg_av_group ON lcm.telegram_sender_user_id IS NOT NULL
    AND tg_av_group.tg_user_id = lcm.telegram_sender_user_id AND tg_av_group.is_missing = false
  LEFT JOIN LATERAL (
    SELECT ecp.name, ecp.last_name, ecp.avatar_url FROM participants ecp
    WHERE ecp.workspace_id = p_workspace_id AND ecp.is_deleted = false
      AND lower(ecp.email) = lower(COALESCE(b.email_contact, pt.email_last_external_address))
    ORDER BY ecp.created_at ASC LIMIT 1
  ) email_counter_p ON true
  ORDER BY GREATEST(lm.message_at, la.event_at) DESC NULLS LAST;
$function$


CREATE OR REPLACE FUNCTION public.get_inbox_threads_v3_for(p_workspace_id uuid, p_user_id uuid, p_thread_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT p.id AS participant_id,
      EXISTS(SELECT 1 FROM workspace_roles wr WHERE wr.workspace_id = p_workspace_id AND wr.name = ANY(p.workspace_roles)
             AND (wr.is_owner OR (wr.permissions->>'view_all_projects')::boolean)) AS can_view_all
    FROM participants p WHERE p.workspace_id = p_workspace_id AND p.user_id = p_user_id AND p.is_deleted = false LIMIT 1
  ),
  base AS (
    SELECT us.thread_id, us.unread_count, us.unread_event_count, us.unread_reaction_count,
           us.has_unread_reaction, us.manually_unread, us.last_read_at,
           m.channel_type, m.email_contact, m.email_subject,
           me.participant_id AS my_participant, me.can_view_all
    FROM thread_unread_state us
    JOIN me ON me.participant_id = us.participant_id
    JOIN thread_inbox_meta m ON m.thread_id = us.thread_id
    WHERE p_thread_ids IS NULL OR us.thread_id = ANY(p_thread_ids)
  )
  SELECT
    b.thread_id, pt.name::text, pt.icon::text, pt.accent_color::text, pt.type::text, pt.project_id, pr.name::text,
    b.channel_type::text, pt.legacy_channel::text,
    lm.message_at, lm.message_text::text,
    (SELECT ma.file_name FROM message_attachments ma WHERE ma.message_id = lm.message_id ORDER BY ma.created_at ASC LIMIT 1)::text,
    COALESCE((SELECT count(*)::int FROM message_attachments ma WHERE ma.message_id = lm.message_id), 0),
    (SELECT ma.mime_type FROM message_attachments ma WHERE ma.message_id = lm.message_id ORDER BY ma.created_at ASC LIMIT 1)::text,
    COALESCE(NULLIF(TRIM(COALESCE(sender_p.name,'')||' '||COALESCE(sender_p.last_name,'')),''),
             NULLIF(TRIM(COALESCE(email_counter_p.name,'')||' '||COALESCE(email_counter_p.last_name,'')),''),
             lm.sender_name)::text,
    COALESCE(sender_p.avatar_url, email_counter_p.avatar_url)::text,
    b.unread_count, COALESCE(b.manually_unread, false),
    b.has_unread_reaction, b.unread_reaction_count, lr.emoji::text, lr.reaction_at,
    COALESCE(reactor_p.name, reactor_tg_p.name, lr.reactor_telegram_user_name)::text,
    COALESCE(reactor_p.avatar_url, reactor_tg_p.avatar_url)::text,
    lr.reacted_message_text::text, b.email_contact::text, b.email_subject::text, la.event_at,
    (COALESCE(la.actor_name || ' · ', '') || CASE
        WHEN la.action = 'change_status' AND las.status_name IS NOT NULL THEN 'Статус: ' || las.status_name
        WHEN la.action = 'change_status' THEN 'Изменён статус'
        WHEN la.action = 'change_deadline' THEN 'Изменён дедлайн'
        WHEN la.action = 'rename' THEN 'Переименовано'
        WHEN la.action = 'create' THEN 'Создано'
        WHEN la.action = 'delete' THEN 'Удалено'
        WHEN la.action = 'change_settings' THEN 'Изменены настройки'
        WHEN la.action = 'pin' THEN 'Закреплено'
        WHEN la.action = 'unpin' THEN 'Откреплено'
        WHEN la.action = 'change_assignees' THEN 'Изменены исполнители'
        ELSE la.action END)::text,
    las.status_color::text, b.unread_event_count,
    COALESCE(NULLIF(TRIM(COALESCE(counter_p.name,'')||' '||COALESCE(counter_p.last_name,'')),''),
             NULLIF(TRIM(COALESCE(email_counter_p.name,'')||' '||COALESCE(email_counter_p.last_name,'')),''),
             lcm.sender_name)::text,
    COALESCE(counter_p.avatar_url, email_counter_p.avatar_url, tg_av_business.avatar_url, tg_av_mtproto.avatar_url, tg_av_group.avatar_url, pt.wazzup_contact_avatar_url)::text,
    b.last_read_at, la.actor_avatar_url::text
  FROM base b
  JOIN project_threads pt ON pt.id = b.thread_id
  LEFT JOIN projects pr ON pr.id = pt.project_id AND pr.is_deleted = false
    AND (b.can_view_all OR EXISTS(SELECT 1 FROM project_participants pp WHERE pp.project_id = pr.id AND pp.participant_id = b.my_participant))
  LEFT JOIN LATERAL (
    SELECT pm.id AS message_id, pm.created_at AS message_at, pm.content AS message_text, pm.sender_name, pm.sender_participant_id
    FROM project_messages pm WHERE pm.thread_id = b.thread_id AND pm.source <> 'telegram_service'::message_source
    ORDER BY (CASE WHEN pm.sender_participant_id IS DISTINCT FROM b.my_participant AND (b.last_read_at IS NULL OR pm.created_at > b.last_read_at) THEN 0 ELSE 1 END) ASC, pm.created_at DESC
    LIMIT 1) lm ON true
  LEFT JOIN LATERAL (
    SELECT pm.sender_name, pm.sender_participant_id, pm.telegram_sender_user_id
    FROM project_messages pm WHERE pm.thread_id = b.thread_id AND pm.source <> 'telegram_service'::message_source
      AND (pm.sender_role IS NULL OR pm.sender_role NOT IN ('Администратор','Владелец','Сотрудник','Исполнитель'))
    ORDER BY pm.created_at DESC LIMIT 1) lcm ON true
  LEFT JOIN LATERAL (
    SELECT mr.emoji, mr.created_at AS reaction_at, mr.participant_id AS reactor_participant_id,
           mr.telegram_user_id AS reactor_telegram_user_id, mr.telegram_user_name AS reactor_telegram_user_name, pm.content AS reacted_message_text
    FROM message_reactions mr JOIN project_messages pm ON pm.id = mr.message_id
    WHERE pm.thread_id = b.thread_id AND mr.participant_id IS DISTINCT FROM b.my_participant
    ORDER BY mr.created_at DESC LIMIT 1) lr ON true
  LEFT JOIN LATERAL (
    SELECT al.created_at AS event_at, al.action, al.details, al.user_id AS actor_user_id, actor.actor_name, actor.actor_avatar_url
    FROM audit_logs al
    LEFT JOIN statuses evs ON al.action = 'change_status'
      AND (al.details->>'new_status') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND evs.id = (al.details->>'new_status')::uuid AND evs.workspace_id = p_workspace_id
    LEFT JOIN LATERAL (SELECT NULLIF(TRIM(COALESCE(pa.name,'')||' '||COALESCE(pa.last_name,'')),'') AS actor_name, pa.avatar_url AS actor_avatar_url
      FROM participants pa WHERE pa.user_id = al.user_id AND pa.workspace_id = p_workspace_id AND pa.is_deleted = false LIMIT 1) actor ON true
    WHERE al.resource_id = b.thread_id AND al.resource_type IN ('task','thread') AND al.user_id IS DISTINCT FROM p_user_id
      AND al.action <> 'change_deadline'
      AND (al.action <> 'change_status' OR COALESCE(evs.silent_transition, false) = false)
    ORDER BY al.created_at DESC LIMIT 1) la ON true
  LEFT JOIN statuses las_s ON la.action = 'change_status'
    AND (la.details->>'new_status') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND las_s.id = (la.details->>'new_status')::uuid AND las_s.workspace_id = p_workspace_id
  LEFT JOIN LATERAL (SELECT las_s.name AS status_name, las_s.color AS status_color) las ON true
  LEFT JOIN participants sender_p ON sender_p.id = lm.sender_participant_id
  LEFT JOIN participants counter_p ON counter_p.id = lcm.sender_participant_id AND counter_p.is_deleted = false
  LEFT JOIN participants reactor_p ON reactor_p.id = lr.reactor_participant_id AND reactor_p.is_deleted = false
  LEFT JOIN participants reactor_tg_p ON reactor_p.id IS NULL AND lr.reactor_telegram_user_id IS NOT NULL
    AND reactor_tg_p.workspace_id = p_workspace_id AND reactor_tg_p.telegram_user_id = lr.reactor_telegram_user_id AND reactor_tg_p.is_deleted = false
  LEFT JOIN telegram_user_avatars tg_av_business ON pt.business_client_tg_user_id IS NOT NULL AND tg_av_business.tg_user_id = pt.business_client_tg_user_id AND tg_av_business.is_missing = false
  LEFT JOIN telegram_user_avatars tg_av_mtproto ON pt.mtproto_client_tg_user_id IS NOT NULL AND tg_av_mtproto.tg_user_id = pt.mtproto_client_tg_user_id AND tg_av_mtproto.is_missing = false
  LEFT JOIN telegram_user_avatars tg_av_group ON lcm.telegram_sender_user_id IS NOT NULL AND tg_av_group.tg_user_id = lcm.telegram_sender_user_id AND tg_av_group.is_missing = false
  LEFT JOIN LATERAL (SELECT ecp.name, ecp.last_name, ecp.avatar_url FROM participants ecp
    WHERE ecp.workspace_id = p_workspace_id AND ecp.is_deleted = false
      AND lower(ecp.email) = lower(COALESCE(b.email_contact, pt.email_last_external_address))
    ORDER BY ecp.created_at ASC LIMIT 1) email_counter_p ON true
  ORDER BY GREATEST(lm.message_at, la.event_at) DESC NULLS LAST;
$function$


CREATE OR REPLACE FUNCTION public.get_inbox_unread_threads(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT v.* FROM get_inbox_threads_v3_for(p_workspace_id, p_user_id, ARRAY(
    SELECT us.thread_id FROM thread_unread_state us
    WHERE us.participant_id = (SELECT id FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1)
      AND (us.unread_count > 0 OR us.unread_event_count > 0 OR us.unread_reaction_count > 0 OR us.has_unread_reaction = true OR us.manually_unread = true)
  )) v
  ORDER BY GREATEST(
             COALESCE(v.last_message_at, 'epoch'::timestamptz),
             COALESCE(v.last_event_at, 'epoch'::timestamptz),
             CASE WHEN COALESCE(v.manually_unread, false)
                  THEN COALESCE(v.last_read_at, 'epoch'::timestamptz)
                  ELSE 'epoch'::timestamptz END
           ) DESC,
           v.thread_id DESC;
$function$


CREATE OR REPLACE FUNCTION public.get_my_task_counts(p_workspace_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with my_tasks as (
    select t.id, t.deadline
    from project_threads t
    join task_assignees ta on ta.thread_id = t.id
    join participants p on p.id = ta.participant_id
      and p.user_id = auth.uid()
      and p.is_deleted = false
    left join projects pr on pr.id = t.project_id
    left join statuses s on s.id = t.status_id
    where t.workspace_id = p_workspace_id
      and t.type = 'task'
      and t.is_deleted = false
      and (pr.id is null or pr.is_deleted = false)
      and coalesce(s.show_to_creator, false) = false
      and coalesce(s.is_final, false) = false

    union

    select t.id, t.deadline
    from project_threads t
    join statuses s on s.id = t.status_id and s.show_to_creator = true
    left join projects pr on pr.id = t.project_id
    where t.workspace_id = p_workspace_id
      and t.type = 'task'
      and t.is_deleted = false
      and (pr.id is null or pr.is_deleted = false)
      and t.created_by = auth.uid()
  )
  select json_build_object(
    'active', (
      select count(*) from my_tasks
      where deadline is not null
        and (deadline at time zone 'Europe/Moscow')::date <= current_date
    ),
    'all', (select count(*) from my_tasks),
    'overdue', (
      select count(*) from my_tasks
      where deadline is not null
        and (deadline at time zone 'Europe/Moscow')::date < current_date
    )
  );
$function$


CREATE OR REPLACE FUNCTION public.get_my_thread_notify_level(p_thread_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pid uuid; v_ws uuid; v_state text;
BEGIN
  SELECT workspace_id INTO v_ws FROM project_threads WHERE id = p_thread_id AND is_deleted = false;
  IF v_ws IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_pid FROM participants
    WHERE workspace_id = v_ws AND user_id = (SELECT auth.uid()) AND is_deleted = false LIMIT 1;
  IF v_pid IS NULL THEN RETURN NULL; END IF;

  SELECT state INTO v_state FROM project_thread_subscriptions
    WHERE thread_id = p_thread_id AND participant_id = v_pid;

  IF v_state = 'muted' THEN RETURN 'off';
  ELSIF v_state = 'muted_events' THEN RETURN 'messages';
  ELSIF v_state = 'subscribed' THEN RETURN 'all';
  ELSE
    RETURN CASE WHEN inbox_default_subscribed(p_thread_id, v_pid) THEN 'all' ELSE 'off' END;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_owner_permissions()
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
begin
  return '{
    "manage_workspace_settings": true,
    "delete_workspace": true,
    "manage_participants": true,
    "manage_roles": true,
    "manage_templates": true,
    "manage_statuses": true,
    "manage_features": true,
    "create_projects": true,
    "view_all_projects": true,
    "edit_all_projects": true,
    "delete_all_projects": true,
    "view_workspace_digest": true
  }'::jsonb;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_personal_dialogs(p_workspace_id uuid, p_target_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, email_contact text, email_subject text, owner_user_id uuid, contact_participant_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  caller_participant AS (
    SELECT p.id AS participant_id, p.workspace_roles
    FROM participants p
    WHERE p.workspace_id = p_workspace_id AND p.user_id = auth.uid() AND p.is_deleted = FALSE
    LIMIT 1
  ),
  caller_can_view_all AS (
    SELECT EXISTS (
      SELECT 1 FROM workspace_roles wr, caller_participant cp
      WHERE wr.workspace_id = p_workspace_id AND wr.name = ANY(cp.workspace_roles)
        AND (wr.is_owner = TRUE OR (wr.permissions->>'view_all_projects')::boolean = TRUE)
    ) AS allowed
  ),
  authorized AS (
    SELECT (auth.uid() = p_target_user_id) OR (SELECT allowed FROM caller_can_view_all) AS ok
  ),
  target_participant AS (
    SELECT p.id AS participant_id FROM participants p
    WHERE p.workspace_id = p_workspace_id AND p.user_id = p_target_user_id AND p.is_deleted = FALSE LIMIT 1
  ),
  personal_threads AS (
    SELECT pt.id, pt.project_id, pt.name, pt.icon, pt.accent_color,
           pt.legacy_channel, pt.type, pt.owner_user_id, pt.contact_participant_id,
           pt.business_connection_id, pt.mtproto_session_user_id,
           pt.wazzup_channel_id, pt.email_subject_root
    FROM project_threads pt
    WHERE pt.workspace_id = p_workspace_id
      AND pt.owner_user_id = p_target_user_id
      AND pt.is_deleted = false
      AND (SELECT ok FROM authorized)
  ),
  last_messages AS (
    SELECT DISTINCT ON (pm.thread_id)
      pm.id AS message_id, pm.thread_id, pm.created_at AS message_at,
      pm.content AS message_text, pm.sender_name, pm.sender_participant_id
    FROM project_messages pm
    INNER JOIN personal_threads pt ON pt.id = pm.thread_id
    WHERE pm.source != 'telegram_service'::message_source
    ORDER BY pm.thread_id, pm.created_at DESC
  ),
  last_message_attachments AS (
    SELECT lm.thread_id,
      (SELECT ma.file_name FROM message_attachments ma WHERE ma.message_id = lm.message_id ORDER BY ma.created_at ASC LIMIT 1) AS first_file_name,
      (SELECT COUNT(*)::int FROM message_attachments ma WHERE ma.message_id = lm.message_id) AS file_count
    FROM last_messages lm
  ),
  unread_counts AS (
    SELECT pm.thread_id, COUNT(*) AS cnt
    FROM project_messages pm
    INNER JOIN personal_threads pt ON pt.id = pm.thread_id
    CROSS JOIN target_participant tp
    LEFT JOIN message_read_status mrs ON mrs.participant_id = tp.participant_id AND mrs.thread_id = pm.thread_id
    WHERE (mrs.last_read_at IS NULL OR pm.created_at > mrs.last_read_at)
      AND pm.sender_participant_id IS DISTINCT FROM tp.participant_id
      AND pm.source != 'telegram_service'::message_source
    GROUP BY pm.thread_id
  ),
  manual_unread AS (
    SELECT mrs.thread_id, mrs.manually_unread FROM message_read_status mrs
    INNER JOIN target_participant tp ON tp.participant_id = mrs.participant_id
    WHERE mrs.thread_id IN (SELECT id FROM personal_threads)
  ),
  email_links AS (
    SELECT el.thread_id, el.contact_email, el.subject FROM project_thread_email_links el
    WHERE el.thread_id IN (SELECT id FROM personal_threads) AND el.is_active = true
  ),
  projects_lookup AS (
    SELECT p.id, p.name FROM projects p
    WHERE p.id IN (SELECT project_id FROM personal_threads WHERE project_id IS NOT NULL)
  )
  SELECT
    pt.id, pt.name::text, pt.icon::text, pt.accent_color::text, pt.type::text,
    pt.project_id, pl.name::text,
    CASE
      WHEN pt.business_connection_id IS NOT NULL THEN 'telegram_business'
      WHEN pt.mtproto_session_user_id IS NOT NULL THEN 'telegram_mtproto'
      WHEN pt.wazzup_channel_id IS NOT NULL THEN 'wazzup'
      WHEN el.thread_id IS NOT NULL OR pt.email_subject_root IS NOT NULL THEN 'email'
      ELSE 'other'
    END::text,
    pt.legacy_channel::text,
    lm.message_at, lm.message_text::text, lma.first_file_name::text,
    COALESCE(lma.file_count, 0),
    lm.sender_name::text, sender_p.avatar_url::text,
    COALESCE(uc.cnt, 0), COALESCE(mu.manually_unread, false),
    el.contact_email::text, el.subject::text,
    pt.owner_user_id, pt.contact_participant_id
  FROM personal_threads pt
  LEFT JOIN projects_lookup pl ON pl.id = pt.project_id
  LEFT JOIN last_messages lm ON lm.thread_id = pt.id
  LEFT JOIN last_message_attachments lma ON lma.thread_id = pt.id
  LEFT JOIN participants sender_p ON sender_p.id = lm.sender_participant_id
  LEFT JOIN unread_counts uc ON uc.thread_id = pt.id
  LEFT JOIN manual_unread mu ON mu.thread_id = pt.id
  LEFT JOIN email_links el ON el.thread_id = pt.id
  ORDER BY lm.message_at DESC NULLS LAST;
$function$


CREATE OR REPLACE FUNCTION public.get_project_admin_module_access()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select '{
    "settings": true, "forms": true, "documents": true, "threads": true,
    "history": true, "card_view": true, "knowledge_base": true,
    "ai_document_check": true, "ai_form_autofill": true, "ai_knowledge_all": true,
    "ai_knowledge_project": true, "ai_project_assistant": true, "comments": true,
    "digest": true, "project_context": true, "plan": true
  }'::jsonb;
$function$


CREATE OR REPLACE FUNCTION public.get_project_admin_permissions()
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN '{
    "settings": {
      "edit_project_info": true,
      "manage_project_participants": true,
      "manage_google_drive": true,
      "delete_project": true
    },
    "forms": {
      "add_forms": true,
      "fill_forms": true,
      "edit_own_form_answers": true,
      "view_others_form_answers": true
    },
    "documents": {
      "add_documents": true,
      "view_documents": true,
      "edit_documents": true,
      "download_documents": true,
      "move_documents": true,
      "delete_documents": true,
      "compress_pdf": true,
      "view_document_technical_info": true,
      "create_folders": true,
      "add_document_kits": true
    },
    "comments": {
      "view_comments": true,
      "edit_comments": true,
      "manage_comments": true
    }
  }'::JSONB;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_project_client_module_access()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select '{
    "settings": false, "forms": true, "documents": true, "threads": true,
    "history": false, "card_view": true, "knowledge_base": false,
    "ai_document_check": false, "ai_form_autofill": true, "ai_knowledge_all": false,
    "ai_knowledge_project": false, "ai_project_assistant": false, "comments": true,
    "digest": false, "project_context": false, "plan": false
  }'::jsonb;
$function$


CREATE OR REPLACE FUNCTION public.get_project_client_permissions()
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN '{
    "settings": {
      "edit_project_info": false,
      "manage_project_participants": false,
      "manage_google_drive": false,
      "delete_project": false
    },
    "forms": {
      "add_forms": false,
      "fill_forms": true,
      "edit_own_form_answers": true,
      "view_others_form_answers": false
    },
    "documents": {
      "add_documents": true,
      "view_documents": true,
      "edit_documents": false,
      "download_documents": true,
      "move_documents": false,
      "delete_documents": false,
      "compress_pdf": false,
      "view_document_technical_info": false,
      "create_folders": false,
      "add_document_kits": false
    },
    "comments": {
      "view_comments": true,
      "edit_comments": true,
      "manage_comments": false
    }
  }'::JSONB;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_project_executor_module_access()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select '{
    "settings": true, "forms": true, "documents": true, "threads": true,
    "history": true, "card_view": true, "knowledge_base": true,
    "ai_document_check": true, "ai_form_autofill": true, "ai_knowledge_all": true,
    "ai_knowledge_project": true, "ai_project_assistant": true, "comments": true,
    "digest": true, "project_context": true, "plan": true
  }'::jsonb;
$function$


CREATE OR REPLACE FUNCTION public.get_project_executor_permissions()
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN '{
    "settings": {
      "edit_project_info": false,
      "manage_project_participants": false,
      "manage_google_drive": false,
      "delete_project": false
    },
    "forms": {
      "add_forms": true,
      "fill_forms": true,
      "edit_own_form_answers": true,
      "view_others_form_answers": true
    },
    "documents": {
      "add_documents": true,
      "view_documents": true,
      "edit_documents": true,
      "download_documents": true,
      "move_documents": true,
      "delete_documents": false,
      "compress_pdf": true,
      "view_document_technical_info": true,
      "create_folders": true,
      "add_document_kits": true
    },
    "comments": {
      "view_comments": true,
      "edit_comments": true,
      "manage_comments": false
    }
  }'::JSONB;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_project_history(p_project_id uuid, p_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 20, p_resource_types text[] DEFAULT NULL::text[], p_actions text[] DEFAULT NULL::text[], p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, action text, resource_type text, resource_id uuid, details jsonb, created_at timestamp with time zone, actor_user_id uuid, actor_email text, actor_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT pr.workspace_id INTO v_workspace_id FROM projects pr WHERE pr.id = p_project_id;

  RETURN QUERY
  SELECT
    al.id,
    al.action,
    al.resource_type,
    al.resource_id,
    al.details,
    al.created_at,
    al.user_id AS actor_user_id,
    u.email::TEXT AS actor_email,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', p.name, p.last_name)), ''),
      (u.raw_user_meta_data->>'full_name'),
      (u.raw_user_meta_data->>'name'),
      split_part(u.email::TEXT, '@', 1)
    ) AS actor_name
  FROM public.audit_logs al
  LEFT JOIN auth.users u ON u.id = al.user_id
  LEFT JOIN public.participants p
    ON p.user_id = al.user_id
   AND p.workspace_id = v_workspace_id
   AND p.is_deleted = false
  WHERE al.project_id = p_project_id
    AND (p_cursor IS NULL OR al.created_at < p_cursor)
    AND (p_resource_types IS NULL OR al.resource_type = ANY(p_resource_types))
    AND (p_actions IS NULL OR al.action = ANY(p_actions))
    AND (p_user_id IS NULL OR al.user_id = p_user_id)
  ORDER BY al.created_at DESC
  LIMIT p_limit;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_project_participant_module_access()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select '{
    "settings": false, "forms": true, "documents": true, "threads": false,
    "history": false, "card_view": false, "knowledge_base": false,
    "ai_document_check": false, "ai_form_autofill": false, "ai_knowledge_all": false,
    "ai_knowledge_project": false, "ai_project_assistant": false, "comments": false,
    "digest": false, "project_context": false, "plan": false
  }'::jsonb;
$function$


CREATE OR REPLACE FUNCTION public.get_project_participant_permissions()
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN '{
    "settings": {
      "edit_project_info": false,
      "manage_project_participants": false,
      "manage_google_drive": false,
      "delete_project": false
    },
    "forms": {
      "add_forms": false,
      "fill_forms": false,
      "edit_own_form_answers": false,
      "view_others_form_answers": false
    },
    "documents": {
      "add_documents": false,
      "view_documents": true,
      "edit_documents": false,
      "download_documents": true,
      "move_documents": false,
      "delete_documents": false,
      "compress_pdf": false,
      "view_document_technical_info": false,
      "create_folders": false,
      "add_document_kits": false
    },
    "comments": {
      "view_comments": true,
      "edit_comments": false,
      "manage_comments": false
    }
  }'::JSONB;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_projects_with_activity(p_workspace_id uuid, p_period_start timestamp with time zone, p_period_end timestamp with time zone)
 RETURNS TABLE(project_id uuid, project_name text, events_count bigint, has_digest boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with activity as (
    select project_id, count(*) as cnt
    from (
      select project_id from audit_logs
        where project_id is not null and created_at >= p_period_start and created_at < p_period_end
      union all
      select project_id from project_messages
        where created_at >= p_period_start and created_at < p_period_end
      union all
      select project_id from comments
        where created_at >= p_period_start and created_at < p_period_end
    ) sources
    group by project_id
  ),
  digests as (
    select pd.project_id
    from project_digests pd
    where pd.workspace_id = p_workspace_id
      and pd.period_start = (p_period_start at time zone 'Europe/Madrid')::date
      and pd.period_end = ((p_period_end - interval '1 second') at time zone 'Europe/Madrid')::date
  )
  select
    p.id as project_id,
    p.name as project_name,
    a.cnt as events_count,
    (d.project_id is not null) as has_digest
  from projects p
  join activity a on a.project_id = p.id
  left join digests d on d.project_id = p.id
  where p.workspace_id = p_workspace_id
    and coalesce(p.is_deleted, false) = false
    -- доступ: участник проекта или has_workspace_permission view_all_projects
    and (
      exists (
        select 1 from project_participants pp
        join participants pa on pa.id = pp.participant_id
        where pp.project_id = p.id and pa.user_id = auth.uid() and pa.is_deleted = false
      )
      or has_workspace_permission(auth.uid(), p_workspace_id, 'view_all_projects')
    )
  order by a.cnt desc, p.name asc;
$function$


CREATE OR REPLACE FUNCTION public.get_recently_viewed(p_workspace_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(entity_type text, entity_id uuid, title text, subtitle text, project_id uuid, thread_type text, accent_color text, project_template_id uuid, project_status_id uuid, opened_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT rv.entity_type, rv.entity_id, rv.opened_at
    FROM public.recently_viewed rv
    WHERE rv.user_id = (SELECT auth.uid())
      AND rv.workspace_id = p_workspace_id
    ORDER BY rv.opened_at DESC
    LIMIT p_limit * 3
  )
  SELECT
    'thread'::text, t.id, t.name, p.name,
    t.project_id, t.type, t.accent_color, p.template_id, p.status_id, b.opened_at
  FROM base b
  JOIN public.project_threads t ON t.id = b.entity_id AND b.entity_type = 'thread'
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.is_deleted = false
    AND t.workspace_id = p_workspace_id

  UNION ALL

  SELECT
    'project'::text, pr.id, pr.name, NULL,
    pr.id, NULL, NULL::text, pr.template_id, pr.status_id, b.opened_at
  FROM base b
  JOIN public.projects pr ON pr.id = b.entity_id AND b.entity_type = 'project'
  WHERE pr.is_deleted = false
    AND pr.workspace_id = p_workspace_id

  UNION ALL

  SELECT
    'knowledge_article'::text, ka.id, ka.title, ka.summary,
    NULL, NULL, NULL::text, NULL::uuid, NULL::uuid, b.opened_at
  FROM base b
  JOIN public.knowledge_articles ka ON ka.id = b.entity_id AND b.entity_type = 'knowledge_article'
  WHERE ka.workspace_id = p_workspace_id

  UNION ALL

  SELECT
    'participant'::text, pa.id,
    trim(coalesce(pa.name, '') || ' ' || coalesce(pa.last_name, '')),
    coalesce(pa.email, pa.phone),
    NULL, NULL, NULL::text, NULL::uuid, NULL::uuid, b.opened_at
  FROM base b
  JOIN public.participants pa ON pa.id = b.entity_id AND b.entity_type = 'participant'
  WHERE pa.is_deleted = false
    AND pa.workspace_id = p_workspace_id

  ORDER BY opened_at DESC
  LIMIT p_limit;
$function$


CREATE OR REPLACE FUNCTION public.get_short_id_by_uuid(p_entity_type text, p_uuid uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_short integer;
BEGIN
  IF p_entity_type = 'project' THEN
    SELECT short_id INTO v_short FROM projects WHERE id = p_uuid LIMIT 1;
  ELSIF p_entity_type = 'thread' THEN
    SELECT short_id INTO v_short FROM project_threads WHERE id = p_uuid LIMIT 1;
  ELSIF p_entity_type = 'board' THEN
    SELECT short_id INTO v_short FROM boards WHERE id = p_uuid LIMIT 1;
  END IF;
  RETURN v_short;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_sidebar_data(p_workspace_id uuid, p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'threads', COALESCE(
      (SELECT json_agg(json_build_object(
        'id', pt.id,
        'project_id', pt.project_id,
        'access_type', pt.access_type,
        'access_roles', pt.access_roles,
        'created_by', pt.created_by
      ))
       FROM project_threads pt
       LEFT JOIN projects p ON p.id = pt.project_id
       WHERE pt.workspace_id = p_workspace_id
         AND pt.is_deleted = false
         AND (p.id IS NULL OR p.is_deleted = false)),
      '[]'::json
    ),
    'myProjectRoles', COALESCE(
      (SELECT json_agg(json_build_object(
        'project_id', pp.project_id,
        'participant_id', pp.participant_id,
        'project_roles', pp.project_roles
      ))
       FROM project_participants pp
       JOIN participants p ON p.id = pp.participant_id
       WHERE p.user_id = p_user_id
         AND p.workspace_id = p_workspace_id
         AND p.is_deleted = false),
      '[]'::json
    ),
    'myMemberThreadIds', COALESCE(
      (SELECT json_agg(ptm.thread_id)
       FROM project_thread_members ptm
       JOIN participants p ON p.id = ptm.participant_id
       WHERE p.user_id = p_user_id
         AND p.workspace_id = p_workspace_id
         AND p.is_deleted = false),
      '[]'::json
    ),
    'myAssigneeThreadIds', COALESCE(
      (SELECT json_agg(ta.thread_id)
       FROM task_assignees ta
       JOIN participants p ON p.id = ta.participant_id
       WHERE p.user_id = p_user_id
         AND p.workspace_id = p_workspace_id
         AND p.is_deleted = false),
      '[]'::json
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_thread_email_address(p_thread_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_short_id int;
  v_workspace_slug text;
  v_email_active boolean;
BEGIN
  SELECT pt.short_id, w.slug, w.email_active
  INTO v_short_id, v_workspace_slug, v_email_active
  FROM project_threads pt
  JOIN workspaces w ON w.id = pt.workspace_id
  WHERE pt.id = p_thread_id;

  IF v_short_id IS NULL OR v_workspace_slug IS NULL OR NOT v_email_active THEN
    RETURN NULL;
  END IF;

  RETURN 't+' || v_short_id || '@' || v_workspace_slug || '.clientcase.app';
END;
$function$


CREATE OR REPLACE FUNCTION public.get_thread_subscribers(p_thread_id uuid)
 RETURNS TABLE(participant_id uuid, subscribed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.participant_id, is_thread_subscribed(a.participant_id, p_thread_id)
  FROM inbox_accessible_participant_ids(p_thread_id) a
  WHERE can_user_access_thread(p_thread_id, (SELECT auth.uid()));
$function$


CREATE OR REPLACE FUNCTION public.get_total_unread_count(p_workspace_id uuid, p_user_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  user_participant AS (
    SELECT p.id AS participant_id, p.workspace_roles
    FROM participants p
    WHERE p.workspace_id = p_workspace_id AND p.user_id = p_user_id AND p.is_deleted = FALSE
    LIMIT 1
  ),
  user_is_internal AS (
    SELECT is_internal_member(p_workspace_id, p_user_id) AS allowed
  ),
  can_view_all AS (
    SELECT EXISTS (
      SELECT 1 FROM workspace_roles wr, user_participant up
      WHERE wr.workspace_id = p_workspace_id AND wr.name = ANY(up.workspace_roles)
        AND (wr.is_owner = TRUE OR (wr.permissions->>'view_all_projects')::boolean = TRUE)
    ) AS allowed
  ),
  accessible_projects AS (
    SELECT proj.id FROM projects proj
    WHERE proj.workspace_id = p_workspace_id
      AND ((SELECT allowed FROM can_view_all)
        OR proj.id IN (
          SELECT pp.project_id FROM project_participants pp, user_participant up
          WHERE pp.participant_id = up.participant_id))
  ),
  projects_with_unread AS (
    SELECT DISTINCT pm.project_id
    FROM project_messages pm
    INNER JOIN accessible_projects ap ON ap.id = pm.project_id
    CROSS JOIN user_participant up
    LEFT JOIN message_read_status mrs
      ON mrs.participant_id = up.participant_id AND mrs.project_id = pm.project_id AND mrs.channel = pm.channel
    WHERE (mrs.last_read_at IS NULL OR pm.created_at > mrs.last_read_at)
      AND pm.sender_participant_id IS DISTINCT FROM up.participant_id
      AND (pm.channel = 'client' OR (SELECT allowed FROM user_is_internal))
  ),
  projects_manually_unread AS (
    SELECT mrs.project_id
    FROM message_read_status mrs
    INNER JOIN user_participant up ON up.participant_id = mrs.participant_id
    INNER JOIN accessible_projects ap ON ap.id = mrs.project_id
    WHERE mrs.manually_unread = TRUE
      AND mrs.project_id NOT IN (SELECT project_id FROM projects_with_unread)
  )
  SELECT (SELECT COUNT(*) FROM projects_with_unread) + (SELECT COUNT(*) FROM projects_manually_unread);
$function$


CREATE OR REPLACE FUNCTION public.get_unread_messages_count(p_participant_id uuid, p_project_id uuid, p_channel text DEFAULT 'client'::text, p_thread_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)
  FROM project_messages pm
  LEFT JOIN message_read_status mrs
    ON mrs.participant_id = p_participant_id
    AND mrs.thread_id = COALESCE(p_thread_id, pm.thread_id)
  WHERE
    CASE
      WHEN p_thread_id IS NOT NULL THEN pm.thread_id = p_thread_id
      ELSE pm.project_id = p_project_id AND pm.channel = p_channel
    END
    AND (mrs.last_read_at IS NULL OR pm.created_at > mrs.last_read_at)
    AND pm.sender_participant_id IS DISTINCT FROM p_participant_id
    AND pm.source != 'telegram_service'::message_source;
$function$


CREATE OR REPLACE FUNCTION public.get_user_projects(p_workspace_id uuid, p_user_id uuid, p_can_view_all boolean DEFAULT false)
 RETURNS SETOF projects
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_can_view_all THEN
    RETURN QUERY
      SELECT * FROM projects
      WHERE workspace_id = p_workspace_id
        AND is_deleted = false
      ORDER BY created_at DESC;
  ELSE
    RETURN QUERY
      SELECT p.* FROM projects p
      INNER JOIN project_participants pp ON pp.project_id = p.id
      INNER JOIN participants part ON part.id = pp.participant_id
      WHERE p.workspace_id = p_workspace_id
        AND p.is_deleted = false
        AND part.user_id = p_user_id
        AND part.is_deleted = false
      ORDER BY p.created_at DESC;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_workspace_ai_usage(p_workspace_id uuid, p_period date DEFAULT NULL::date)
 RETURNS TABLE(period date, total_tokens bigint, input_tokens bigint, output_tokens bigint, request_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(p_period, date_trunc('month', now())::date) AS period,
    COALESCE(sum(m.total_tokens), 0)::bigint,
    COALESCE(sum(m.input_tokens), 0)::bigint,
    COALESCE(sum(m.output_tokens), 0)::bigint,
    COALESCE(sum(m.request_count), 0)::int
  FROM ai_usage_monthly m
  WHERE m.workspace_id = p_workspace_id
    AND m.period = COALESCE(p_period, date_trunc('month', now())::date)
    AND is_workspace_participant(p_workspace_id, (SELECT auth.uid()));
$function$


CREATE OR REPLACE FUNCTION public.get_workspace_api_key(workspace_uuid uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key_id uuid;
  v_decrypted_key text;
BEGIN
  -- Get the key_id from workspaces
  SELECT anthropic_api_key_id INTO v_key_id
  FROM workspaces
  WHERE id = workspace_uuid;
  
  IF v_key_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get decrypted secret from vault
  SELECT decrypted_secret INTO v_decrypted_key
  FROM vault.decrypted_secrets
  WHERE id = v_key_id;
  
  RETURN v_decrypted_key;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_workspace_boards(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(id uuid, workspace_id uuid, name text, description text, access_type text, access_roles text[], created_by uuid, sort_order integer, column_widths jsonb, global_filter jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, short_id integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user mismatch';
  END IF;

  RETURN QUERY
  SELECT
    b.id, b.workspace_id, b.name, b.description,
    b.access_type, b.access_roles, b.created_by,
    b.sort_order, b.column_widths, b.global_filter,
    b.created_at, b.updated_at, b.short_id
  FROM boards b
  WHERE b.workspace_id = p_workspace_id
    AND public.can_user_access_board(b, p_user_id)
  ORDER BY b.sort_order ASC, b.created_at ASC;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_workspace_google_api_key(workspace_uuid uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key_id uuid;
  decrypted_key text;
BEGIN
  SELECT google_api_key_id INTO v_key_id
  FROM workspaces
  WHERE id = workspace_uuid;

  IF v_key_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO decrypted_key
  FROM vault.decrypted_secrets
  WHERE id = v_key_id;

  RETURN decrypted_key;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_workspace_slug_by_id(p_id uuid)
 RETURNS TABLE(id uuid, slug text, custom_domain text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
    SELECT w.id, w.slug, w.custom_domain
    FROM workspaces w
    WHERE w.id = p_id AND w.is_deleted = false
    LIMIT 1;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_workspace_threads(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(id uuid, name text, type text, workspace_id uuid, project_id uuid, project_name text, status_id uuid, status_name text, status_color text, status_order integer, status_show_to_creator boolean, deadline timestamp with time zone, start_at timestamp with time zone, end_at timestamp with time zone, accent_color text, icon text, is_pinned boolean, sort_order integer, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, email_unsent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id UUID;
  v_workspace_roles TEXT[];
  v_has_view_all BOOLEAN := FALSE;
  v_my_project_ids UUID[];
  v_admin_project_ids UUID[];
  v_member_thread_ids UUID[];
  v_assignee_thread_ids UUID[];
  v_my_roles_by_project JSONB := '{}'::JSONB;
BEGIN
  SELECT par.id, par.workspace_roles INTO v_participant_id, v_workspace_roles
  FROM participants par
  WHERE par.user_id = p_user_id AND par.workspace_id = p_workspace_id AND par.is_deleted = false;

  IF v_participant_id IS NULL THEN RETURN; END IF;
  v_workspace_roles := COALESCE(v_workspace_roles, '{}');

  SELECT EXISTS(
    SELECT 1 FROM workspace_roles wr
    WHERE wr.workspace_id = p_workspace_id AND wr.name = ANY(v_workspace_roles)
      AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true)
  ) INTO v_has_view_all;

  IF v_has_view_all THEN
    RETURN QUERY
    SELECT pt.id, pt.name, pt.type, pt.workspace_id, pt.project_id,
           p.name AS project_name, pt.status_id,
           s.name AS status_name, s.color AS status_color,
           s.order_index AS status_order,
           COALESCE(s.show_to_creator, FALSE) AS status_show_to_creator,
           pt.deadline, pt.start_at, pt.end_at,
           pt.accent_color, pt.icon, pt.is_pinned, pt.sort_order,
           pt.created_at, pt.updated_at, pt.created_by,
           (pt.type = 'email' AND NOT EXISTS (
              SELECT 1 FROM project_messages pm
              WHERE pm.thread_id = pt.id AND COALESCE(pm.is_draft, FALSE) = FALSE
           )) AS email_unsent
    FROM project_threads pt
    LEFT JOIN projects p ON p.id = pt.project_id
    LEFT JOIN statuses s ON s.id = pt.status_id
    WHERE pt.workspace_id = p_workspace_id
      AND pt.is_deleted = FALSE
      AND (p.id IS NULL OR p.is_deleted = FALSE)
      AND (pt.project_id IS NOT NULL OR pt.type = 'task' OR pt.owner_user_id = p_user_id)
    ORDER BY pt.sort_order ASC, pt.created_at ASC;
    RETURN;
  END IF;

  SELECT
    COALESCE(array_agg(pp.project_id), '{}'),
    COALESCE(array_agg(pp.project_id) FILTER (WHERE 'Администратор' = ANY(pp.project_roles)), '{}')
  INTO v_my_project_ids, v_admin_project_ids
  FROM project_participants pp WHERE pp.participant_id = v_participant_id;

  SELECT COALESCE(array_agg(ptm.thread_id), '{}') INTO v_member_thread_ids
  FROM project_thread_members ptm WHERE ptm.participant_id = v_participant_id;

  SELECT COALESCE(array_agg(ta.thread_id), '{}') INTO v_assignee_thread_ids
  FROM task_assignees ta WHERE ta.participant_id = v_participant_id;

  SELECT COALESCE(jsonb_object_agg(pp.project_id::text, to_jsonb(pp.project_roles)), '{}'::jsonb)
  INTO v_my_roles_by_project
  FROM project_participants pp WHERE pp.participant_id = v_participant_id;

  RETURN QUERY
  SELECT pt.id, pt.name, pt.type, pt.workspace_id, pt.project_id,
         p.name AS project_name, pt.status_id,
         s.name AS status_name, s.color AS status_color,
         s.order_index AS status_order,
         COALESCE(s.show_to_creator, FALSE) AS status_show_to_creator,
         pt.deadline, pt.start_at, pt.end_at,
         pt.accent_color, pt.icon, pt.is_pinned, pt.sort_order,
         pt.created_at, pt.updated_at, pt.created_by,
         (pt.type = 'email' AND NOT EXISTS (
            SELECT 1 FROM project_messages pm
            WHERE pm.thread_id = pt.id AND COALESCE(pm.is_draft, FALSE) = FALSE
         )) AS email_unsent
  FROM project_threads pt
  LEFT JOIN projects p ON p.id = pt.project_id
  LEFT JOIN statuses s ON s.id = pt.status_id
  WHERE pt.workspace_id = p_workspace_id
    AND pt.is_deleted = FALSE
    AND (p.id IS NULL OR p.is_deleted = FALSE)
    AND (
      (pt.project_id IS NULL AND pt.type <> 'task' AND pt.owner_user_id = p_user_id)
      OR (pt.project_id IS NULL AND pt.type = 'task'
          AND (pt.created_by = p_user_id OR pt.id = ANY(v_assignee_thread_ids)))
      OR pt.project_id = ANY(v_admin_project_ids)
      OR (pt.project_id IS NOT NULL AND pt.created_by = p_user_id)
      OR (pt.project_id IS NOT NULL AND pt.id = ANY(v_assignee_thread_ids))
      OR (pt.access_type = 'all' AND pt.project_id = ANY(v_my_project_ids))
      OR (pt.access_type = 'roles'
          AND pt.project_id = ANY(v_my_project_ids)
          AND pt.access_roles && (
            SELECT COALESCE(
              (SELECT array_agg(r)::text[]
               FROM jsonb_array_elements_text(v_my_roles_by_project->(pt.project_id::text)) AS r),
              '{}'::text[]
            )
          ))
      OR pt.id = ANY(v_member_thread_ids)
    )
  ORDER BY pt.sort_order ASC, pt.created_at ASC;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_workspace_usage_and_limits(p_workspace_id uuid)
 RETURNS TABLE(participants_count integer, projects_count integer, storage_mb integer, max_participants integer, max_projects integer, max_storage_mb integer, plan_code text, plan_name text, ai_tokens_used bigint, ai_tokens_monthly bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*)::int FROM participants p WHERE p.workspace_id=p_workspace_id AND p.is_deleted=false AND p.user_id IS NOT NULL),
    (SELECT count(*)::int FROM projects pr WHERE pr.workspace_id=p_workspace_id AND pr.is_deleted=false),
    (SELECT COALESCE(round(sum(f.file_size)/1048576.0),0)::int FROM files f WHERE f.workspace_id=p_workspace_id),
    COALESCE(wl.max_participants, pl.max_participants),
    COALESCE(wl.max_projects,     pl.max_projects),
    COALESCE(wl.max_storage_mb,   pl.max_storage_mb),
    pl.code, pl.name,
    (SELECT COALESCE(sum(m.total_tokens),0)::bigint FROM ai_usage_monthly m
       WHERE m.workspace_id=p_workspace_id AND m.period=date_trunc('month', now())::date),
    pl.ai_tokens_monthly
  FROM (SELECT 1) x
  LEFT JOIN workspace_billing b ON b.workspace_id=p_workspace_id
  LEFT JOIN plans pl ON pl.id=b.plan_id
  LEFT JOIN workspace_limits wl ON wl.workspace_id=p_workspace_id
  WHERE is_workspace_participant(p_workspace_id, (SELECT auth.uid()));
$function$


CREATE OR REPLACE FUNCTION public.get_workspace_voyageai_api_key(workspace_uuid uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key_id uuid;
  v_decrypted_key text;
BEGIN
  SELECT voyageai_api_key_id INTO v_key_id
  FROM workspaces
  WHERE id = workspace_uuid;

  IF v_key_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_decrypted_key
  FROM vault.decrypted_secrets
  WHERE id = v_key_id;

  RETURN v_decrypted_key;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_workspaces_with_counts(p_user_id uuid)
 RETURNS TABLE(workspace_id uuid, participants_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
    SELECT w.id AS workspace_id, COUNT(p.id) AS participants_count
    FROM workspaces w
    LEFT JOIN participants p ON p.workspace_id = w.id AND p.is_deleted = false
    WHERE w.is_deleted = false
      AND EXISTS (
        SELECT 1 FROM participants p2
        WHERE p2.workspace_id = w.id
          AND p2.user_id = p_user_id
          AND p2.is_deleted = false
      )
    GROUP BY w.id;
END;
$function$


CREATE OR REPLACE FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_query_trgm$function$


CREATE OR REPLACE FUNCTION public.gin_extract_value_trgm(text, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_value_trgm$function$


CREATE OR REPLACE FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_consistent$function$


CREATE OR REPLACE FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)
 RETURNS "char"
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_triconsistent$function$


CREATE OR REPLACE FUNCTION public.global_search(p_workspace_id uuid, p_query text, p_limit integer DEFAULT 8)
 RETURNS TABLE(entity_type text, entity_id uuid, title text, subtitle text, snippet text, rank real, project_id uuid, thread_type text, thread_id uuid, accent_color text, project_template_id uuid, project_status_id uuid)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_query text := trim(coalesce(p_query, ''));
  v_ts    tsquery;
  v_thr   real := 0.4;
BEGIN
  IF length(v_query) < 2 THEN
    RETURN;
  END IF;

  v_ts := websearch_to_tsquery('russian', v_query);

  RETURN QUERY
  SELECT
    'thread'::text, t.id, t.name, p.name, NULL::text,
    GREATEST(ts_rank(t.search_vector, v_ts), word_similarity(v_query, coalesce(t.name, '')))::real AS r,
    t.project_id, t.type, t.id, t.accent_color, p.template_id, p.status_id
  FROM public.project_threads t
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.workspace_id = p_workspace_id
    AND t.is_deleted = false
    AND (t.search_vector @@ v_ts OR word_similarity(v_query, coalesce(t.name, '')) > v_thr)
  ORDER BY r DESC
  LIMIT p_limit;

  RETURN QUERY
  SELECT
    'project'::text, pr.id, pr.name, NULL::text, NULL::text,
    GREATEST(ts_rank(pr.search_vector, v_ts), word_similarity(v_query, coalesce(pr.name, '')))::real AS r,
    pr.id, NULL::text, NULL::uuid, NULL::text, pr.template_id, pr.status_id
  FROM public.projects pr
  WHERE pr.workspace_id = p_workspace_id
    AND pr.is_deleted = false
    AND (pr.search_vector @@ v_ts OR word_similarity(v_query, coalesce(pr.name, '')) > v_thr)
  ORDER BY r DESC
  LIMIT p_limit;

  RETURN QUERY
  SELECT
    'knowledge_article'::text, ka.id, ka.title, ka.summary,
    ts_headline('russian',
      coalesce(regexp_replace(ka.content, '<[^>]+>', ' ', 'g'), ''),
      v_ts,
      'MaxFragments=1,MinWords=3,MaxWords=15,ShortWord=2,HighlightAll=false,StartSel=<mark>,StopSel=</mark>'
    ),
    GREATEST(ts_rank(ka.search_vector, v_ts), word_similarity(v_query, coalesce(ka.title, '')))::real AS r,
    NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid
  FROM public.knowledge_articles ka
  WHERE ka.workspace_id = p_workspace_id
    AND (ka.search_vector @@ v_ts OR word_similarity(v_query, coalesce(ka.title, '')) > v_thr)
  ORDER BY r DESC
  LIMIT p_limit;

  RETURN QUERY
  SELECT
    'participant'::text, pa.id,
    trim(coalesce(pa.name, '') || ' ' || coalesce(pa.last_name, '')),
    coalesce(pa.email, pa.phone),
    NULL::text,
    GREATEST(
      ts_rank(pa.search_vector, v_ts),
      word_similarity(v_query, coalesce(pa.name, '') || ' ' || coalesce(pa.last_name, ''))
    )::real AS r,
    NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid
  FROM public.participants pa
  WHERE pa.workspace_id = p_workspace_id
    AND pa.is_deleted = false
    AND (
      pa.search_vector @@ v_ts
      OR word_similarity(v_query, coalesce(pa.name, '') || ' ' || coalesce(pa.last_name, '')) > v_thr
      OR (pa.email IS NOT NULL AND pa.email ILIKE '%' || v_query || '%')
      OR (pa.phone IS NOT NULL AND pa.phone ILIKE '%' || v_query || '%')
    )
  ORDER BY r DESC
  LIMIT p_limit;

  RETURN QUERY
  SELECT
    'message'::text, m.id, t.name, p.name,
    ts_headline('russian',
      coalesce(regexp_replace(m.content, '<[^>]+>', ' ', 'g'), ''),
      v_ts,
      'MaxFragments=1,MinWords=3,MaxWords=15,ShortWord=2,HighlightAll=false,StartSel=<mark>,StopSel=</mark>'
    ),
    ts_rank(m.search_vector, v_ts)::real AS r,
    m.project_id, t.type, m.thread_id, t.accent_color, p.template_id, p.status_id
  FROM public.project_messages m
  JOIN public.project_threads t ON t.id = m.thread_id AND t.is_deleted = false
  LEFT JOIN public.projects p ON p.id = m.project_id
  WHERE m.workspace_id = p_workspace_id
    AND m.search_vector @@ v_ts
  ORDER BY r DESC
  LIMIT p_limit;
END;
$function$


CREATE OR REPLACE FUNCTION public.gtrgm_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_compress$function$


CREATE OR REPLACE FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_consistent$function$


CREATE OR REPLACE FUNCTION public.gtrgm_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_decompress$function$


CREATE OR REPLACE FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_distance$function$


CREATE OR REPLACE FUNCTION public.gtrgm_in(cstring)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_in$function$


CREATE OR REPLACE FUNCTION public.gtrgm_options(internal)
 RETURNS void
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE
AS '$libdir/pg_trgm', $function$gtrgm_options$function$


CREATE OR REPLACE FUNCTION public.gtrgm_out(gtrgm)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_out$function$


CREATE OR REPLACE FUNCTION public.gtrgm_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_penalty$function$


CREATE OR REPLACE FUNCTION public.gtrgm_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_picksplit$function$


CREATE OR REPLACE FUNCTION public.gtrgm_same(gtrgm, gtrgm, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_same$function$


CREATE OR REPLACE FUNCTION public.gtrgm_union(internal, internal)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_union$function$


CREATE OR REPLACE FUNCTION public.has_project_module_access(p_user_id uuid, p_project_id uuid, p_module text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from project_participants pp
    join participants p on p.id = pp.participant_id
    join project_roles pr
      on pr.workspace_id = p.workspace_id
     and pr.name = any (pp.project_roles)
    where pp.project_id = p_project_id
      and p.user_id = p_user_id
      and p.is_deleted = false
      and coalesce((pr.module_access ->> p_module)::boolean, false) = true
  );
$function$


CREATE OR REPLACE FUNCTION public.has_project_permission(p_user_id uuid, p_project_id uuid, p_module text, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_roles TEXT[];
  v_has_permission BOOLEAN := false;
BEGIN
  -- Получаем workspace_id проекта
  SELECT workspace_id INTO v_workspace_id
  FROM projects
  WHERE id = p_project_id;
  
  IF v_workspace_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Получаем роли участника в проекте
  SELECT pp.project_roles INTO v_roles
  FROM project_participants pp
  JOIN participants p ON p.id = pp.participant_id
  WHERE p.user_id = p_user_id 
  AND pp.project_id = p_project_id
  AND p.is_deleted = false;
  
  IF v_roles IS NULL THEN
    RETURN false;
  END IF;
  
  -- Проверяем разрешение по принципу ИЛИ
  SELECT EXISTS (
    SELECT 1 FROM project_roles pr
    WHERE pr.workspace_id = v_workspace_id
    AND pr.name = ANY(v_roles)
    AND (pr.permissions->p_module->>p_permission)::boolean = true
  ) INTO v_has_permission;
  
  RETURN v_has_permission;
END;
$function$


CREATE OR REPLACE FUNCTION public.has_workspace_permission(p_user_id uuid, p_workspace_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_roles TEXT[];
  v_has_permission BOOLEAN := false;
BEGIN
  -- Получаем роли участника
  SELECT workspace_roles INTO v_roles
  FROM participants
  WHERE user_id = p_user_id 
  AND workspace_id = p_workspace_id 
  AND is_deleted = false;
  
  IF v_roles IS NULL THEN
    RETURN false;
  END IF;
  
  -- Проверяем разрешение по принципу ИЛИ (если хотя бы одна роль даёт право)
  SELECT EXISTS (
    SELECT 1 FROM workspace_roles wr
    WHERE wr.workspace_id = p_workspace_id
    AND wr.name = ANY(v_roles)
    AND (wr.permissions->p_permission)::boolean = true
  ) INTO v_has_permission;
  
  RETURN v_has_permission;
END;
$function$


CREATE OR REPLACE FUNCTION public.impersonating_owner_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT NULLIF(auth.jwt() #>> '{app_metadata,impersonated_by}', '')::uuid;
$function$


CREATE OR REPLACE FUNCTION public.inbox_accessible_participant_ids(p_thread_id uuid)
 RETURNS TABLE(participant_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH t AS (
    SELECT id, workspace_id, project_id, owner_user_id, legacy_channel
    FROM project_threads WHERE id = p_thread_id AND is_deleted = false
  )
  SELECT p.id
  FROM t
  JOIN participants p ON p.workspace_id = t.workspace_id AND p.is_deleted = false
  WHERE
    CASE
      WHEN t.project_id IS NOT NULL THEN
        (t.legacy_channel IS DISTINCT FROM 'internal' OR is_internal_member(t.workspace_id, p.user_id))
        AND (
          (
            EXISTS (SELECT 1 FROM projects pr WHERE pr.id = t.project_id AND pr.is_deleted = false)
            AND (
              EXISTS (SELECT 1 FROM workspace_roles wr
                      WHERE wr.workspace_id = t.workspace_id AND wr.name = ANY(p.workspace_roles)
                        AND (wr.is_owner OR (wr.permissions->>'view_all_projects')::boolean))
              OR EXISTS (SELECT 1 FROM project_participants pp WHERE pp.project_id = t.project_id AND pp.participant_id = p.id)
            )
          )
          OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.thread_id = t.id AND ta.participant_id = p.id)
          OR EXISTS (SELECT 1 FROM project_thread_members ptm WHERE ptm.thread_id = t.id AND ptm.participant_id = p.id)
        )
      ELSE
        p.user_id = t.owner_user_id
        OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.thread_id = t.id AND ta.participant_id = p.id)
        OR EXISTS (SELECT 1 FROM project_thread_members ptm WHERE ptm.thread_id = t.id AND ptm.participant_id = p.id)
    END;
$function$


CREATE OR REPLACE FUNCTION public.inbox_default_subscribed(p_thread_id uuid, p_participant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH t AS (
    SELECT id, project_id, owner_user_id
    FROM project_threads WHERE id = p_thread_id AND is_deleted = false
  )
  SELECT EXISTS (
    SELECT 1 FROM t
    WHERE
      CASE
        WHEN t.project_id IS NOT NULL THEN
          EXISTS (SELECT 1 FROM project_participants pp WHERE pp.project_id = t.project_id AND pp.participant_id = p_participant_id)
          OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.thread_id = t.id AND ta.participant_id = p_participant_id)
          OR EXISTS (SELECT 1 FROM project_thread_members ptm WHERE ptm.thread_id = t.id AND ptm.participant_id = p_participant_id)
        ELSE
          EXISTS (SELECT 1 FROM participants p WHERE p.id = p_participant_id AND p.user_id = t.owner_user_id)
          OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.thread_id = t.id AND ta.participant_id = p_participant_id)
          OR EXISTS (SELECT 1 FROM project_thread_members ptm WHERE ptm.thread_id = t.id AND ptm.participant_id = p_participant_id)
      END
  );
$function$


CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_workspace_id uuid, p_feature text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled BOOLEAN := false;
BEGIN
  SELECT (features->p_feature)::boolean INTO v_enabled
  FROM workspace_features
  WHERE workspace_id = p_workspace_id;
  
  RETURN COALESCE(v_enabled, false);
END;
$function$


CREATE OR REPLACE FUNCTION public.is_impersonating()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT COALESCE(
    (auth.jwt() #>> '{app_metadata,impersonated_by}') IS NOT NULL,
    false
  );
$function$


CREATE OR REPLACE FUNCTION public.is_internal_member(p_workspace_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM participants p
    JOIN workspace_roles wr ON wr.name = ANY(p.workspace_roles) AND wr.workspace_id = p.workspace_id
    WHERE p.workspace_id = p_workspace_id
      AND p.user_id = p_user_id
      AND p.is_deleted = false
      AND wr.name NOT IN ('Клиент', 'Telegram-контакт')
  );
$function$


CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins pa
    WHERE pa.user_id = COALESCE(p_user_id, (SELECT auth.uid()))
  );
$function$


CREATE OR REPLACE FUNCTION public.is_project_participant(p_project_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM project_participants pp
    JOIN participants p ON pp.participant_id = p.id
    WHERE pp.project_id = p_project_id
      AND p.user_id = p_user_id
      AND p.is_deleted = false
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.is_staff_role(p_role text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT p_role IN ('Администратор', 'Владелец', 'Сотрудник', 'Исполнитель');
$function$


CREATE OR REPLACE FUNCTION public.is_thread_subscribed(p_participant_id uuid, p_thread_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM project_thread_subscriptions s
                 WHERE s.thread_id = p_thread_id AND s.participant_id = p_participant_id AND s.state = 'muted') THEN false
    WHEN EXISTS (SELECT 1 FROM project_thread_subscriptions s
                 WHERE s.thread_id = p_thread_id AND s.participant_id = p_participant_id
                   AND s.state IN ('subscribed','muted_events')) THEN true
    ELSE inbox_default_subscribed(p_thread_id, p_participant_id)
  END;
$function$


CREATE OR REPLACE FUNCTION public.is_thread_subscribed_me(p_thread_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pid uuid; v_ws uuid;
BEGIN
  SELECT workspace_id INTO v_ws FROM project_threads WHERE id = p_thread_id AND is_deleted = false;
  IF v_ws IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_pid FROM participants
    WHERE workspace_id = v_ws AND user_id = (SELECT auth.uid()) AND is_deleted = false LIMIT 1;
  IF v_pid IS NULL THEN RETURN NULL; END IF;
  RETURN is_thread_subscribed(v_pid, p_thread_id);
END;
$function$


CREATE OR REPLACE FUNCTION public.is_workspace_owner(p_user_id uuid, p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.participants
    WHERE user_id = p_user_id
      AND workspace_id = p_workspace_id
      AND 'Владелец' = ANY(workspace_roles)
      AND is_deleted = false
      AND can_login = true
  );
$function$


CREATE OR REPLACE FUNCTION public.is_workspace_participant(p_workspace_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Проверяем, что пользователь является участником workspace
  RETURN EXISTS (
    SELECT 1 FROM participants p
    WHERE p.workspace_id = p_workspace_id
      AND p.user_id = p_user_id
      AND p.is_deleted = false
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.is_workspace_team_member(p_workspace_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Проверяем, что пользователь является сотрудником (не клиентом)
  -- Клиенты обычно имеют роль 'client' или похожую
  RETURN EXISTS (
    SELECT 1 FROM participants p
    WHERE p.workspace_id = p_workspace_id
      AND p.user_id = p_user_id
      AND p.is_deleted = false
      AND NOT ('client' = ANY(p.workspace_roles))
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.link_participant_to_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Обновляем все participants с таким email, у которых ещё нет user_id
  UPDATE participants
  SET user_id = NEW.id
  WHERE email = NEW.email AND user_id IS NULL;
  
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.log_ai_usage(p_workspace_id uuid, p_input_tokens bigint, p_output_tokens bigint, p_function_name text DEFAULT NULL::text, p_provider text DEFAULT NULL::text, p_model text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_feature text DEFAULT NULL::text, p_meta jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_in  bigint := GREATEST(COALESCE(p_input_tokens, 0), 0);
  v_out bigint := GREATEST(COALESCE(p_output_tokens, 0), 0);
  v_period date := date_trunc('month', now())::date;
  v_model text := COALESCE(p_model, '');
BEGIN
  IF p_workspace_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.ai_usage_events
    (workspace_id, function_name, provider, model, input_tokens, output_tokens, total_tokens, user_id, feature, meta)
  VALUES
    (p_workspace_id, p_function_name, p_provider, p_model, v_in, v_out, v_in + v_out, p_user_id, p_feature, p_meta);
  INSERT INTO public.ai_usage_monthly
    (workspace_id, period, model, input_tokens, output_tokens, total_tokens, request_count, updated_at)
  VALUES
    (p_workspace_id, v_period, v_model, v_in, v_out, v_in + v_out, 1, now())
  ON CONFLICT (workspace_id, period, model) DO UPDATE SET
    input_tokens  = ai_usage_monthly.input_tokens  + EXCLUDED.input_tokens,
    output_tokens = ai_usage_monthly.output_tokens + EXCLUDED.output_tokens,
    total_tokens  = ai_usage_monthly.total_tokens  + EXCLUDED.total_tokens,
    request_count = ai_usage_monthly.request_count + 1,
    updated_at    = now();
END;
$function$


CREATE OR REPLACE FUNCTION public.log_audit_action(p_action text, p_resource_type text, p_resource_id uuid DEFAULT NULL::uuid, p_details jsonb DEFAULT '{}'::jsonb, p_ip_address inet DEFAULT NULL::inet, p_workspace_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _log_id UUID;
  _resolved_user_id UUID;
BEGIN
  -- Use explicit user_id if provided, otherwise fall back to JWT claim
  _resolved_user_id := COALESCE(
    p_user_id,
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID
  );

  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, details, ip_address, workspace_id, project_id)
  VALUES (
    _resolved_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_details,
    p_ip_address,
    p_workspace_id,
    p_project_id
  )
  RETURNING id INTO _log_id;

  RETURN _log_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.mark_thread_read_on_final_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_final BOOLEAN;
  v_user_id UUID;
  v_participant_id UUID;
BEGIN
  IF NEW.status_id IS NULL OR NEW.status_id IS NOT DISTINCT FROM OLD.status_id THEN
    RETURN NEW;
  END IF;

  SELECT is_final INTO v_is_final FROM statuses WHERE id = NEW.status_id;
  IF v_is_final IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS NOT NULL THEN
    SELECT p.id INTO v_participant_id
    FROM participants p
    JOIN project_participants pp
      ON pp.participant_id = p.id AND pp.project_id = NEW.project_id
    WHERE p.user_id = v_user_id AND p.is_deleted = false
    LIMIT 1;
  ELSE
    SELECT id INTO v_participant_id
    FROM participants
    WHERE user_id = v_user_id
      AND workspace_id = NEW.workspace_id
      AND is_deleted = false
    LIMIT 1;
  END IF;

  IF v_participant_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO message_read_status (participant_id, thread_id, project_id, channel, last_read_at, manually_unread)
  VALUES (v_participant_id, NEW.id, NEW.project_id, 'client', NOW(), false)
  ON CONFLICT (participant_id, thread_id) DO UPDATE
  SET last_read_at = NOW(), manually_unread = false;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.match_inbound_email(p_workspace_id uuid, p_from_address text, p_in_reply_to text, p_references text[])
 RETURNS TABLE(thread_id uuid, project_id uuid, match_method text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_thread_id uuid;
  v_project_id uuid;
BEGIN
  IF p_in_reply_to IS NOT NULL THEN
    SELECT pm.thread_id, pm.project_id INTO v_thread_id, v_project_id
    FROM project_messages pm
    WHERE pm.workspace_id = p_workspace_id AND pm.email_message_id = p_in_reply_to
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_thread_id, v_project_id, 'in_reply_to'::text;
      RETURN;
    END IF;
    SELECT pm.thread_id, pm.project_id INTO v_thread_id, v_project_id
    FROM project_messages pm
    WHERE pm.workspace_id = p_workspace_id
      AND pm.email_metadata->>'message_id_header' = p_in_reply_to
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_thread_id, v_project_id, 'in_reply_to'::text;
      RETURN;
    END IF;
  END IF;

  IF p_references IS NOT NULL AND array_length(p_references, 1) > 0 THEN
    SELECT pm.thread_id, pm.project_id INTO v_thread_id, v_project_id
    FROM project_messages pm
    WHERE pm.workspace_id = p_workspace_id AND pm.email_message_id = ANY(p_references)
    ORDER BY pm.created_at DESC
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_thread_id, v_project_id, 'references'::text;
      RETURN;
    END IF;
    SELECT pm.thread_id, pm.project_id INTO v_thread_id, v_project_id
    FROM project_messages pm
    WHERE pm.workspace_id = p_workspace_id
      AND pm.email_metadata->>'message_id_header' = ANY(p_references)
    ORDER BY pm.created_at DESC
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_thread_id, v_project_id, 'references'::text;
      RETURN;
    END IF;
  END IF;

  SELECT pt.id, pt.project_id INTO v_thread_id, v_project_id
  FROM project_threads pt
  WHERE pt.workspace_id = p_workspace_id
    AND pt.email_last_external_address = p_from_address
    AND pt.is_deleted = false
    AND pt.updated_at > now() - interval '90 days'
  ORDER BY pt.updated_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_thread_id, v_project_id, 'from_recent'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::uuid, NULL::uuid, 'none'::text;
END;
$function$


CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(query_embedding text, match_workspace_id uuid, match_threshold double precision DEFAULT 0.15, match_count integer DEFAULT 20)
 RETURNS TABLE(id uuid, article_id uuid, qa_id uuid, chunk_index integer, chunk_text text, similarity double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ke.id,
    ke.article_id,
    ke.qa_id,
    ke.chunk_index,
    ke.chunk_text,
    1 - (ke.embedding <=> query_embedding::extensions.vector) AS similarity
  FROM knowledge_embeddings ke
  WHERE ke.workspace_id = match_workspace_id
    AND 1 - (ke.embedding <=> query_embedding::extensions.vector) > match_threshold
  ORDER BY ke.embedding <=> query_embedding::extensions.vector
  LIMIT match_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.match_knowledge_chunks_by_articles(query_embedding text, article_ids uuid[], match_threshold double precision DEFAULT 0.15, match_count integer DEFAULT 20)
 RETURNS TABLE(id uuid, article_id uuid, qa_id uuid, chunk_index integer, chunk_text text, similarity double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ke.id,
    ke.article_id,
    ke.qa_id,
    ke.chunk_index,
    ke.chunk_text,
    1 - (ke.embedding <=> query_embedding::extensions.vector) AS similarity
  FROM knowledge_embeddings ke
  WHERE ke.article_id = ANY(article_ids)
    AND 1 - (ke.embedding <=> query_embedding::extensions.vector) > match_threshold
  ORDER BY ke.embedding <=> query_embedding::extensions.vector
  LIMIT match_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.match_knowledge_chunks_by_sources(query_embedding text, filter_article_ids uuid[] DEFAULT '{}'::uuid[], filter_qa_ids uuid[] DEFAULT '{}'::uuid[], match_threshold double precision DEFAULT 0.15, match_count integer DEFAULT 20)
 RETURNS TABLE(id uuid, article_id uuid, qa_id uuid, chunk_index integer, chunk_text text, similarity double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ke.id,
    ke.article_id,
    ke.qa_id,
    ke.chunk_index,
    ke.chunk_text,
    1 - (ke.embedding <=> query_embedding::extensions.vector) AS similarity
  FROM knowledge_embeddings ke
  WHERE (
    (cardinality(filter_article_ids) > 0 AND ke.article_id = ANY(filter_article_ids))
    OR (cardinality(filter_qa_ids) > 0 AND ke.qa_id = ANY(filter_qa_ids))
  )
  AND 1 - (ke.embedding <=> query_embedding::extensions.vector) > match_threshold
  ORDER BY ke.embedding <=> query_embedding::extensions.vector
  LIMIT match_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.merge_participants(p_target_id uuid, p_source_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target RECORD;
  v_source RECORD;
  v_workspace_id uuid;
BEGIN
  IF p_target_id = p_source_id THEN
    RAISE EXCEPTION 'merge_participants: target = source';
  END IF;

  SELECT * INTO v_target FROM participants WHERE id = p_target_id;
  IF NOT FOUND OR v_target.is_deleted THEN
    RAISE EXCEPTION 'merge_participants: target not found or deleted';
  END IF;

  SELECT * INTO v_source FROM participants WHERE id = p_source_id;
  IF NOT FOUND OR v_source.is_deleted THEN
    RAISE EXCEPTION 'merge_participants: source not found or deleted';
  END IF;

  IF v_target.workspace_id <> v_source.workspace_id THEN
    RAISE EXCEPTION 'merge_participants: different workspaces';
  END IF;
  v_workspace_id := v_target.workspace_id;

  -- Защита: source не может быть реальным пользователем с логином.
  IF v_source.user_id IS NOT NULL OR v_source.can_login THEN
    RAISE EXCEPTION 'merge_participants: source участника с логином объединять нельзя — выберите контакт';
  END IF;

  -- Проверка прав вызвавшего: владелец воркспейса или manage_participants.
  IF NOT EXISTS (
    SELECT 1 FROM participants par
    JOIN workspace_roles wr ON wr.name = ANY(par.workspace_roles)
                            AND wr.workspace_id = par.workspace_id
    WHERE par.user_id = auth.uid()
      AND par.workspace_id = v_workspace_id
      AND par.is_deleted = false
      AND (wr.is_owner = true OR (wr.permissions->>'manage_participants')::boolean = true)
  ) THEN
    RAISE EXCEPTION 'merge_participants: access denied';
  END IF;

  -- 1. Простые перепривязки (single-FK, без unique constraint'ов на pair).
  UPDATE project_threads SET contact_participant_id = p_target_id
    WHERE contact_participant_id = p_source_id;
  UPDATE projects SET contact_participant_id = p_target_id
    WHERE contact_participant_id = p_source_id;
  UPDATE project_messages SET sender_participant_id = p_target_id
    WHERE sender_participant_id = p_source_id;
  UPDATE telegram_link_tokens SET participant_id = p_target_id
    WHERE participant_id = p_source_id;
  UPDATE folders SET assignee_id = p_target_id WHERE assignee_id = p_source_id;
  UPDATE folder_slots SET assignee_id = p_target_id WHERE assignee_id = p_source_id;
  UPDATE services SET default_assignee_id = p_target_id WHERE default_assignee_id = p_source_id;
  UPDATE project_service_items SET executor_id = p_target_id WHERE executor_id = p_source_id;
  UPDATE project_money_movements SET receiver_id = p_target_id WHERE receiver_id = p_source_id;
  UPDATE project_money_movements SET payer_id = p_target_id WHERE payer_id = p_source_id;
  UPDATE project_transactions SET participant_id = p_target_id
    WHERE participant_id = p_source_id;

  -- 2. Перепривязки с возможным UNIQUE-конфликтом — сначала удаляем дубли.
  DELETE FROM project_participants pp
  WHERE pp.participant_id = p_source_id
    AND EXISTS (
      SELECT 1 FROM project_participants pp2
      WHERE pp2.participant_id = p_target_id AND pp2.project_id = pp.project_id
    );
  UPDATE project_participants SET participant_id = p_target_id
    WHERE participant_id = p_source_id;

  DELETE FROM project_thread_members ptm
  WHERE ptm.participant_id = p_source_id
    AND EXISTS (
      SELECT 1 FROM project_thread_members ptm2
      WHERE ptm2.participant_id = p_target_id AND ptm2.thread_id = ptm.thread_id
    );
  UPDATE project_thread_members SET participant_id = p_target_id
    WHERE participant_id = p_source_id;

  DELETE FROM project_thread_assignees pta
  WHERE pta.participant_id = p_source_id
    AND EXISTS (
      SELECT 1 FROM project_thread_assignees pta2
      WHERE pta2.participant_id = p_target_id AND pta2.thread_id = pta.thread_id
    );
  UPDATE project_thread_assignees SET participant_id = p_target_id
    WHERE participant_id = p_source_id;

  DELETE FROM task_assignees ta
  WHERE ta.participant_id = p_source_id
    AND EXISTS (
      SELECT 1 FROM task_assignees ta2
      WHERE ta2.participant_id = p_target_id AND ta2.thread_id = ta.thread_id
    );
  UPDATE task_assignees SET participant_id = p_target_id
    WHERE participant_id = p_source_id;

  DELETE FROM board_members bm
  WHERE bm.participant_id = p_source_id
    AND EXISTS (
      SELECT 1 FROM board_members bm2
      WHERE bm2.participant_id = p_target_id AND bm2.board_id = bm.board_id
    );
  UPDATE board_members SET participant_id = p_target_id
    WHERE participant_id = p_source_id;

  DELETE FROM message_reactions mr
  WHERE mr.participant_id = p_source_id
    AND EXISTS (
      SELECT 1 FROM message_reactions mr2
      WHERE mr2.participant_id = p_target_id
        AND mr2.message_id = mr.message_id
        AND mr2.emoji = mr.emoji
    );
  UPDATE message_reactions SET participant_id = p_target_id
    WHERE participant_id = p_source_id;

  DELETE FROM message_read_status mrs
  WHERE mrs.participant_id = p_source_id
    AND EXISTS (
      SELECT 1 FROM message_read_status mrs2
      WHERE mrs2.participant_id = p_target_id AND mrs2.thread_id = mrs.thread_id
    );
  UPDATE message_read_status SET participant_id = p_target_id
    WHERE participant_id = p_source_id;

  UPDATE participant_channels SET participant_id = p_target_id
    WHERE participant_id = p_source_id;

  -- 3. Доливаем недостающие идентификаторы из source в target.
  UPDATE participants
  SET
    telegram_user_id = COALESCE(telegram_user_id, v_source.telegram_user_id),
    phone = COALESCE(phone, v_source.phone),
    -- email НЕ перезаписываем, чтобы не сломать матчинг по нему.
    avatar_url = COALESCE(avatar_url, v_source.avatar_url),
    last_name = COALESCE(last_name, v_source.last_name),
    notes = CASE
      WHEN v_source.notes IS NOT NULL AND v_source.notes != ''
      THEN COALESCE(notes, '') || CASE WHEN notes IS NOT NULL AND notes != '' THEN E'\n---\n' ELSE '' END || v_source.notes
      ELSE notes
    END,
    updated_at = now()
  WHERE id = p_target_id;

  -- 4. Помечаем source удалённым.
  UPDATE participants
  SET is_deleted = true, deleted_at = now(), updated_at = now()
  WHERE id = p_source_id;

  RETURN json_build_object(
    'target_id', p_target_id,
    'source_id', p_source_id,
    'workspace_id', v_workspace_id
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.merge_telegram_contact(p_source_id uuid, p_target_id uuid, p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source RECORD;
  v_target RECORD;
BEGIN
  -- 1. Загружаем source (проверяем что это Telegram-контакт из нужного workspace)
  SELECT id, telegram_user_id, avatar_url, workspace_id
  INTO v_source
  FROM participants
  WHERE id = p_source_id
    AND workspace_id = p_workspace_id
    AND is_deleted = false
    AND 'Telegram-контакт' = ANY(workspace_roles);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source participant not found or not a Telegram contact';
  END IF;

  -- 2. Загружаем target (проверяем что из того же workspace и не удалён)
  SELECT id, telegram_user_id, avatar_url
  INTO v_target
  FROM participants
  WHERE id = p_target_id
    AND workspace_id = p_workspace_id
    AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found';
  END IF;

  -- 3. Переносим telegram_user_id на target
  -- Сначала обнуляем у source чтобы не нарушить unique index
  UPDATE participants
  SET telegram_user_id = NULL
  WHERE id = p_source_id;

  UPDATE participants
  SET telegram_user_id = v_source.telegram_user_id
  WHERE id = p_target_id;

  -- 4. Переносим avatar если у target нет
  IF v_target.avatar_url IS NULL AND v_source.avatar_url IS NOT NULL THEN
    UPDATE participants
    SET avatar_url = v_source.avatar_url
    WHERE id = p_target_id;
  END IF;

  -- 5. Перелинковываем все сообщения
  UPDATE project_messages
  SET sender_participant_id = p_target_id
  WHERE sender_participant_id = p_source_id;

  -- 6. Перелинковываем реакции с participant_id
  UPDATE message_reactions
  SET participant_id = p_target_id
  WHERE participant_id = p_source_id;

  -- 7. Перелинковываем реакции по telegram_user_id (которые были без participant_id)
  UPDATE message_reactions
  SET participant_id = p_target_id
  WHERE telegram_user_id = v_source.telegram_user_id
    AND participant_id IS NULL;

  -- 8. Soft-delete source
  UPDATE participants
  SET is_deleted = true, deleted_at = NOW()
  WHERE id = p_source_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.move_article_to_group(p_article_id uuid, p_from_group_id uuid DEFAULT NULL::uuid, p_to_group_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Remove from old group
  IF p_from_group_id IS NOT NULL THEN
    DELETE FROM knowledge_article_groups
    WHERE article_id = p_article_id AND group_id = p_from_group_id;
  END IF;

  -- Add to new group
  IF p_to_group_id IS NOT NULL THEN
    INSERT INTO knowledge_article_groups (article_id, group_id, sort_order)
    VALUES (p_article_id, p_to_group_id, 9999)
    ON CONFLICT (article_id, group_id) DO NOTHING;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.move_thread_to_project(p_thread_id uuid, p_target_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_thread_workspace_id uuid;
  v_target_workspace_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT workspace_id INTO v_thread_workspace_id
  FROM project_threads WHERE id = p_thread_id AND is_deleted = false;
  IF v_thread_workspace_id IS NULL THEN
    RAISE EXCEPTION 'thread not found';
  END IF;

  IF p_target_project_id IS NOT NULL THEN
    SELECT workspace_id INTO v_target_workspace_id
    FROM projects WHERE id = p_target_project_id AND is_deleted = false;
    IF v_target_workspace_id IS NULL THEN
      RAISE EXCEPTION 'target project not found';
    END IF;

    IF v_thread_workspace_id <> v_target_workspace_id THEN
      RAISE EXCEPTION 'cross-workspace move not allowed';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM participants p
    WHERE p.user_id = v_user_id
      AND p.workspace_id = v_thread_workspace_id
      AND p.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'not a workspace member';
  END IF;

  UPDATE project_threads
     SET project_id = p_target_project_id, updated_at = now()
   WHERE id = p_thread_id;

  UPDATE project_messages
     SET project_id = p_target_project_id
   WHERE thread_id = p_thread_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.next_short_id(p_workspace_id uuid, p_entity_type text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next integer;
BEGIN
  INSERT INTO workspace_counters AS c (workspace_id, entity_type, next_id)
  VALUES (p_workspace_id, p_entity_type, 2)
  ON CONFLICT (workspace_id, entity_type) DO UPDATE
    SET next_id = c.next_id + 1, updated_at = now()
  RETURNING next_id - 1 INTO v_next;

  RETURN v_next;
END;
$function$


CREATE OR REPLACE FUNCTION public.notify_google_calendar_mirror()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_thread_id uuid;
BEGIN
  IF current_setting('clientcase.skip_mirror', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'project_threads' THEN
    v_thread_id := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'project_thread_members' THEN
    v_thread_id := COALESCE(NEW.thread_id, OLD.thread_id);
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM net.http_post(
    url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/google-calendar-mirror-task',
    body := jsonb_build_object('thread_id', v_thread_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', 'cce57c7a05d202805fefdcc9a63678b60355b523991c0abe1e74e8f85a3f8657'
    ),
    timeout_milliseconds := 30000
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.notify_on_send_status_retry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.send_status = 'failed' AND NEW.send_status = 'pending' THEN
    PERFORM public.dispatch_message_to_channels(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.notify_telegram_on_new_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_draft = true OR NEW.scheduled_send_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM public.dispatch_message_to_channels(NEW.id);
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.prevent_writes_during_impersonation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF public.is_impersonating() THEN
    RAISE EXCEPTION 'Impersonation mode is read-only. Writes are blocked.'
      USING ERRCODE = '42501',
            HINT = 'Exit impersonation mode to make changes.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.publish_scheduled_message(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sender uuid;
  v_workspace uuid;
  v_is_draft boolean;
  v_has_att boolean;
BEGIN
  SELECT pm.workspace_id, pm.is_draft, pm.has_attachments, p.user_id
    INTO v_workspace, v_is_draft, v_has_att, v_sender
  FROM public.project_messages pm
  LEFT JOIN public.participants p ON p.id = pm.sender_participant_id
  WHERE pm.id = p_message_id;

  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF v_sender IS NULL OR v_sender <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT v_is_draft THEN
    RETURN;
  END IF;

  UPDATE public.project_messages
     SET is_draft = false,
         scheduled_send_at = NULL
   WHERE id = p_message_id;

  PERFORM public.dispatch_message_to_channels(p_message_id, v_has_att);
END;
$function$


CREATE OR REPLACE FUNCTION public.recompute_thread_unread_for(p_participant_id uuid, p_thread_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid; v_last_read timestamptz; v_manual boolean; v_is_staff boolean;
  v_unread bigint; v_events bigint; v_reactions bigint; v_priority bigint;
  v_last_reaction_at timestamptz; v_last_reaction_emoji text; v_has_unread_reaction boolean;
  v_subscribed boolean; v_state text;
  o_unread bigint; o_events bigint; o_reactions bigint; o_has_reaction boolean; o_emoji text;
  m_unread bigint; m_events bigint; m_reactions bigint; m_has_reaction boolean; m_emoji text;
BEGIN
  SELECT user_id,
         EXISTS (SELECT 1 FROM unnest(workspace_roles) r WHERE is_staff_role(r))
    INTO v_user_id, v_is_staff
    FROM participants WHERE id = p_participant_id;
  SELECT last_read_at, manually_unread INTO v_last_read, v_manual
    FROM message_read_status WHERE participant_id = p_participant_id AND thread_id = p_thread_id;
  v_manual := COALESCE(v_manual, false);

  SELECT count(*) INTO v_unread FROM project_messages pm
  WHERE pm.thread_id = p_thread_id AND pm.source <> 'telegram_service'::message_source
    AND pm.sender_participant_id IS DISTINCT FROM p_participant_id
    AND (v_last_read IS NULL OR pm.created_at > v_last_read)
    AND (
      pm.visibility = 'client'
      OR (pm.visibility = 'team' AND COALESCE(v_is_staff, false) AND (
            pm.notify_subscribers = true
            OR EXISTS (SELECT 1 FROM message_mentions mm
                       WHERE mm.message_id = pm.id AND mm.participant_id = p_participant_id)
         ))
    );

  SELECT count(*) INTO v_priority FROM project_messages pm
  WHERE pm.thread_id = p_thread_id AND pm.source <> 'telegram_service'::message_source
    AND pm.sender_participant_id IS DISTINCT FROM p_participant_id
    AND (v_last_read IS NULL OR pm.created_at > v_last_read)
    AND (
      pm.visibility = 'client'
      OR (pm.visibility = 'team' AND COALESCE(v_is_staff, false) AND (
            pm.notify_subscribers = true
            OR EXISTS (SELECT 1 FROM message_mentions mm
                       WHERE mm.message_id = pm.id AND mm.participant_id = p_participant_id)
         ))
    )
    AND (
      EXISTS (SELECT 1 FROM message_mentions mm
              WHERE mm.message_id = pm.id AND mm.participant_id = p_participant_id)
      OR EXISTS (SELECT 1 FROM project_messages orig
                 WHERE orig.id = pm.reply_to_message_id
                   AND orig.sender_participant_id = p_participant_id)
    );

  SELECT count(*) INTO v_events FROM audit_logs al
  LEFT JOIN statuses s ON al.action = 'change_status'
    AND (al.details->>'new_status') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND s.id = (al.details->>'new_status')::uuid
  WHERE al.resource_id = p_thread_id AND al.resource_type IN ('task','thread') AND al.user_id IS DISTINCT FROM v_user_id
    AND (v_last_read IS NULL OR al.created_at > v_last_read)
    AND al.action <> 'change_deadline'
    AND (al.action <> 'change_status' OR COALESCE(s.silent_transition, false) = false);

  SELECT count(*) INTO v_reactions FROM message_reactions mr JOIN project_messages pm ON pm.id = mr.message_id
  WHERE pm.thread_id = p_thread_id AND mr.participant_id IS DISTINCT FROM p_participant_id
    AND (v_last_read IS NULL OR mr.created_at > v_last_read);

  SELECT mr.created_at, mr.emoji INTO v_last_reaction_at, v_last_reaction_emoji
  FROM message_reactions mr JOIN project_messages pm ON pm.id = mr.message_id
  WHERE pm.thread_id = p_thread_id AND mr.participant_id IS DISTINCT FROM p_participant_id
  ORDER BY mr.created_at DESC, mr.id DESC LIMIT 1;
  v_has_unread_reaction := v_last_reaction_at IS NOT NULL AND (v_last_read IS NULL OR v_last_reaction_at > v_last_read);

  v_subscribed := is_thread_subscribed(p_participant_id, p_thread_id);
  SELECT state INTO v_state FROM project_thread_subscriptions
    WHERE thread_id = p_thread_id AND participant_id = p_participant_id;

  IF v_subscribed THEN
    o_unread := v_unread;
    o_events := CASE WHEN v_state = 'muted_events' THEN 0 ELSE v_events END;
    o_reactions := v_reactions;
    o_has_reaction := v_has_unread_reaction; o_emoji := v_last_reaction_emoji;
    m_unread := 0; m_events := 0; m_reactions := 0; m_has_reaction := false; m_emoji := NULL;
  ELSIF v_state = 'muted' THEN
    o_unread := v_priority; o_events := 0; o_reactions := 0;
    o_has_reaction := false; o_emoji := NULL;
    m_unread := v_unread; m_events := v_events; m_reactions := v_reactions;
    m_has_reaction := v_has_unread_reaction; m_emoji := v_last_reaction_emoji;
  ELSE
    o_unread := v_priority; o_events := 0; o_reactions := 0;
    o_has_reaction := false; o_emoji := NULL;
    m_unread := 0; m_events := 0; m_reactions := 0; m_has_reaction := false; m_emoji := NULL;
  END IF;

  INSERT INTO thread_unread_state AS u (
    participant_id, thread_id, unread_count, unread_event_count, unread_reaction_count,
    has_unread_reaction, manually_unread, last_read_at, last_reaction_emoji,
    muted_unread_count, muted_unread_event_count, muted_unread_reaction_count,
    muted_has_unread_reaction, muted_last_reaction_emoji, updated_at
  ) VALUES (
    p_participant_id, p_thread_id, o_unread, o_events, o_reactions,
    o_has_reaction, v_manual, v_last_read, o_emoji,
    m_unread, m_events, m_reactions, m_has_reaction, m_emoji, now()
  )
  ON CONFLICT (participant_id, thread_id) DO UPDATE SET
    unread_count=EXCLUDED.unread_count, unread_event_count=EXCLUDED.unread_event_count, unread_reaction_count=EXCLUDED.unread_reaction_count,
    has_unread_reaction=EXCLUDED.has_unread_reaction, manually_unread=EXCLUDED.manually_unread, last_read_at=EXCLUDED.last_read_at,
    last_reaction_emoji=EXCLUDED.last_reaction_emoji,
    muted_unread_count=EXCLUDED.muted_unread_count, muted_unread_event_count=EXCLUDED.muted_unread_event_count,
    muted_unread_reaction_count=EXCLUDED.muted_unread_reaction_count, muted_has_unread_reaction=EXCLUDED.muted_has_unread_reaction,
    muted_last_reaction_emoji=EXCLUDED.muted_last_reaction_emoji, updated_at=now();
END;
$function$


CREATE OR REPLACE FUNCTION public.recompute_thread_unread_pairs(p_thread_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM count(recompute_thread_unread_for(a.participant_id, p_thread_id))
  FROM inbox_accessible_participant_ids(p_thread_id) a;
END;
$function$


CREATE OR REPLACE FUNCTION public.reconcile_inbox_report()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  v_meta_fixed int; v_meta_added int; v_meta_removed int; v_meta_total int;
  v_unread_fixed int; v_unread_added int; v_unread_removed int; v_unread_total int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM participants p
    JOIN workspace_roles wr ON wr.workspace_id = p.workspace_id AND wr.name = ANY(p.workspace_roles)
    WHERE p.user_id = (SELECT auth.uid()) AND p.is_deleted = false AND wr.is_owner = true
  ) THEN
    RAISE EXCEPTION 'Только владелец может запускать сверку';
  END IF;

  CREATE TEMP TABLE _m0 ON COMMIT DROP AS
    SELECT thread_id, md5((to_jsonb(t) - 'updated_at')::text) AS h FROM thread_inbox_meta t;
  CREATE TEMP TABLE _u0 ON COMMIT DROP AS
    SELECT participant_id, thread_id, md5((to_jsonb(t) - 'updated_at')::text) AS h FROM thread_unread_state t;

  PERFORM reconcile_thread_inbox_meta();
  PERFORM reconcile_thread_unread();

  v_meta_total := (SELECT count(*) FROM thread_inbox_meta);
  v_meta_fixed := (SELECT count(*) FROM thread_inbox_meta a JOIN _m0 b USING (thread_id)
                   WHERE md5((to_jsonb(a) - 'updated_at')::text) <> b.h);
  v_meta_added := (SELECT count(*) FROM thread_inbox_meta a WHERE NOT EXISTS (SELECT 1 FROM _m0 b WHERE b.thread_id = a.thread_id));
  v_meta_removed := (SELECT count(*) FROM _m0 b WHERE NOT EXISTS (SELECT 1 FROM thread_inbox_meta a WHERE a.thread_id = b.thread_id));

  v_unread_total := (SELECT count(*) FROM thread_unread_state);
  v_unread_fixed := (SELECT count(*) FROM thread_unread_state a JOIN _u0 b USING (participant_id, thread_id)
                     WHERE md5((to_jsonb(a) - 'updated_at')::text) <> b.h);
  v_unread_added := (SELECT count(*) FROM thread_unread_state a WHERE NOT EXISTS (SELECT 1 FROM _u0 b WHERE b.participant_id = a.participant_id AND b.thread_id = a.thread_id));
  v_unread_removed := (SELECT count(*) FROM _u0 b WHERE NOT EXISTS (SELECT 1 FROM thread_unread_state a WHERE a.participant_id = b.participant_id AND a.thread_id = b.thread_id));

  v := jsonb_build_object(
    'meta_total', v_meta_total, 'meta_fixed', v_meta_fixed, 'meta_added', v_meta_added, 'meta_removed', v_meta_removed,
    'unread_total', v_unread_total, 'unread_fixed', v_unread_fixed, 'unread_added', v_unread_added, 'unread_removed', v_unread_removed,
    'total_discrepancies', v_meta_fixed + v_meta_added + v_meta_removed + v_unread_fixed + v_unread_added + v_unread_removed
  );
  RETURN v;
END;
$function$


CREATE OR REPLACE FUNCTION public.reconcile_thread_inbox_meta()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  r RECORD;
BEGIN
  -- удалить осиротевшие (тред удалён/нет)
  DELETE FROM thread_inbox_meta m
  WHERE NOT EXISTS (SELECT 1 FROM project_threads t WHERE t.id = m.thread_id AND t.is_deleted = false);
  -- пересчитать живые
  FOR r IN SELECT id FROM project_threads WHERE is_deleted = false LOOP
    PERFORM compute_thread_inbox_meta(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.reconcile_thread_unread()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  DELETE FROM thread_unread_state u WHERE NOT EXISTS (
    SELECT 1 FROM project_threads t
    WHERE t.id = u.thread_id AND t.is_deleted = false
      AND u.participant_id IN (SELECT participant_id FROM inbox_accessible_participant_ids(t.id))
  );
  SELECT count(recompute_thread_unread_for(a.participant_id, t.id)) INTO v_count
  FROM project_threads t CROSS JOIN LATERAL inbox_accessible_participant_ids(t.id) a
  WHERE t.is_deleted = false;
  RETURN v_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.recurring_next_occurrence(p_after timestamp with time zone, p_freq text, p_byweekday integer[], p_bymonthday integer, p_fire_time time without time zone, p_timezone text, p_starts_on date)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_base date;
  v_cand date;
  v_last int;
  v_target int;
  v_ts timestamptz;
  i int;
begin
  v_base := (p_after at time zone p_timezone)::date;
  for i in 0..400 loop
    v_cand := v_base + i;
    if p_starts_on is not null and v_cand < p_starts_on then
      continue;
    end if;

    if p_freq = 'daily' then
      null;
    elsif p_freq = 'weekly' then
      if p_byweekday is null or array_length(p_byweekday, 1) is null
         or not (extract(isodow from v_cand)::int = any(p_byweekday)) then
        continue;
      end if;
    elsif p_freq = 'monthly' then
      v_last := extract(day from (date_trunc('month', v_cand::timestamp) + interval '1 month - 1 day'))::int;
      if p_bymonthday = -1 then
        v_target := v_last;
      else
        v_target := least(coalesce(p_bymonthday, 1), v_last);
      end if;
      if extract(day from v_cand)::int <> v_target then
        continue;
      end if;
    else
      return null;
    end if;

    v_ts := (v_cand + p_fire_time) at time zone p_timezone;
    if v_ts > p_after then
      return v_ts;
    end if;
  end loop;
  return null;
end $function$


CREATE OR REPLACE FUNCTION public.recurring_task_rules_set_next()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.is_active and new.next_occurrence_at is null then
      new.next_occurrence_at := public.recurring_next_occurrence(
        now(), new.freq, new.byweekday, new.bymonthday, new.fire_time, new.timezone, new.starts_on);
    end if;
    return new;
  end if;

  if (new.freq is distinct from old.freq
      or new.byweekday is distinct from old.byweekday
      or new.bymonthday is distinct from old.bymonthday
      or new.fire_time is distinct from old.fire_time
      or new.timezone is distinct from old.timezone
      or new.starts_on is distinct from old.starts_on
      or (new.is_active and not old.is_active))
  then
    new.next_occurrence_at := public.recurring_next_occurrence(
      now(), new.freq, new.byweekday, new.bymonthday, new.fire_time, new.timezone, new.starts_on);
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.recurring_task_rules_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.refresh_thread_unread_pairs(p_thread_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM thread_unread_state u
  WHERE u.thread_id = p_thread_id
    AND NOT EXISTS (SELECT 1 FROM inbox_accessible_participant_ids(p_thread_id) a WHERE a.participant_id = u.participant_id);
  PERFORM recompute_thread_unread_pairs(p_thread_id);
END;
$function$


CREATE OR REPLACE FUNCTION public.reorder_board_list_items(p_list_id uuid, p_item_type text, p_item_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_item_type NOT IN ('thread','project') THEN
    RAISE EXCEPTION 'reorder_board_list_items: invalid item_type %', p_item_type;
  END IF;

  DELETE FROM public.board_list_item_order
   WHERE list_id = p_list_id AND item_type = p_item_type;

  INSERT INTO public.board_list_item_order (list_id, item_type, item_id, position)
  SELECT p_list_id, p_item_type, t.item_id, (t.idx - 1) * 10
    FROM unnest(p_item_ids) WITH ORDINALITY AS t(item_id, idx);
END;
$function$


CREATE OR REPLACE FUNCTION public.reorder_documents(p_updates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb;
  old_folder_id uuid;
  new_folder_id uuid;
  doc_id uuid;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    doc_id := (item->>'id')::uuid;
    new_folder_id := NULL;

    -- Определяем новый folder_id (если передан)
    IF item ? 'folder_id' THEN
      new_folder_id := (item->>'folder_id')::uuid;

      -- Получаем текущий folder_id документа
      SELECT folder_id INTO old_folder_id FROM documents WHERE id = doc_id;

      -- Если папка меняется — отвязываем документ от слотов в старой папке
      IF old_folder_id IS DISTINCT FROM new_folder_id THEN
        UPDATE folder_slots
        SET document_id = NULL
        WHERE document_id = doc_id
          AND folder_id IS DISTINCT FROM new_folder_id;
      END IF;
    END IF;

    UPDATE documents
    SET
      sort_order = (item->>'sort_order')::int,
      folder_id = CASE
        WHEN item ? 'folder_id' THEN (item->>'folder_id')::uuid
        ELSE folder_id
      END,
      document_kit_id = CASE
        WHEN item ? 'document_kit_id' AND item->>'document_kit_id' IS NOT NULL
        THEN (item->>'document_kit_id')::uuid
        ELSE document_kit_id
      END
    WHERE id = doc_id;
  END LOOP;
END;
$function$


CREATE OR REPLACE FUNCTION public.resolve_channel_default(p_workspace_id uuid, p_channel_key text)
 RETURNS TABLE(icon text, accent_color text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cfg AS (
    SELECT (channel_defaults -> p_channel_key) AS v
    FROM workspaces
    WHERE id = p_workspace_id
  ),
  fb AS (
    SELECT
      CASE p_channel_key
        WHEN 'wazzup'            THEN 'whatsapp'
        WHEN 'email'             THEN 'mail'
        WHEN 'telegram'          THEN 'telegram'
        WHEN 'telegram_personal' THEN 'telegram'
        ELSE 'message-circle'
      END AS icon,
      CASE p_channel_key
        WHEN 'wazzup' THEN 'emerald'
        WHEN 'email'  THEN 'rose'
        ELSE 'blue'
      END AS accent_color
  )
  SELECT
    COALESCE(NULLIF((SELECT v ->> 'icon' FROM cfg), ''), (SELECT icon FROM fb)),
    COALESCE(NULLIF((SELECT v ->> 'accent_color' FROM cfg), ''), (SELECT accent_color FROM fb));
$function$


CREATE OR REPLACE FUNCTION public.resolve_email_thread_assignee(p_thread project_threads)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_participant_id UUID;
BEGIN
  IF p_thread.owner_user_id IS NOT NULL THEN
    v_user_id := p_thread.owner_user_id;
  ELSIF p_thread.email_send_account_id IS NOT NULL THEN
    SELECT user_id INTO v_user_id FROM email_accounts WHERE id = p_thread.email_send_account_id;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_participant_id
  FROM participants
  WHERE user_id = v_user_id
    AND workspace_id = p_thread.workspace_id
    AND is_deleted = false
  LIMIT 1;

  RETURN v_participant_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.resolve_inbound_email_address(p_address text)
 RETURNS TABLE(workspace_id uuid, workspace_slug text, resolution_type text, thread_id uuid, project_id uuid, virtual_address_id uuid, routing_mode text, target_project_id uuid, target_thread_id uuid, default_thread_template_id uuid, default_assignee_user_id uuid, auto_reply_enabled boolean, auto_reply_text text, resolved_email_account_id uuid, resolved_user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_local text := lower(split_part(p_address, '@', 1));
  v_domain text := lower(split_part(p_address, '@', 2));
  v_root_domain text := 'clientcase.app';
  v_slug text;
  v_workspace_id uuid;
  v_short_id int;
  v_inbox_suffix text;
  v_account_id uuid;
  v_account_user_id uuid;
BEGIN
  IF v_domain LIKE '%.' || v_root_domain THEN
    v_slug := substring(v_domain FROM 1 FOR length(v_domain) - length(v_root_domain) - 1);
    SELECT w.id INTO v_workspace_id FROM workspaces w
      WHERE w.slug = v_slug AND w.is_deleted = false LIMIT 1;
  ELSE
    SELECT w.id, w.slug INTO v_workspace_id, v_slug
    FROM workspaces w WHERE w.custom_domain = v_domain AND w.is_deleted = false LIMIT 1;
  END IF;

  IF v_workspace_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, v_slug, 'unknown_workspace'::text,
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
      NULL::uuid, NULL::uuid, NULL::boolean, NULL::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 1a. inbox+<id>@... — персональный адрес конкретного сотрудника
  IF v_local LIKE 'inbox+%' THEN
    v_inbox_suffix := substring(v_local FROM 7);
    SELECT ea.id, ea.user_id INTO v_account_id, v_account_user_id
    FROM email_accounts ea
    WHERE ea.workspace_id = v_workspace_id
      AND ea.is_active = true
      AND lower(split_part(ea.email, '@', 1)) = v_inbox_suffix
    LIMIT 1;
    -- Найден — возвращаем как inbox_personal с привязкой
    IF v_account_id IS NOT NULL THEN
      RETURN QUERY SELECT v_workspace_id, v_slug, 'inbox_personal'::text,
        NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
        NULL::uuid, NULL::uuid, NULL::boolean, NULL::text,
        v_account_id, v_account_user_id;
      RETURN;
    END IF;
    -- Не найден — fallback на обычный inbox (webhook попытается найти по headers)
    RETURN QUERY SELECT v_workspace_id, v_slug, 'inbox'::text,
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
      NULL::uuid, NULL::uuid, NULL::boolean, NULL::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 1b. inbox@... — общий адрес воркспейса (legacy/fallback)
  IF v_local = 'inbox' THEN
    RETURN QUERY SELECT v_workspace_id, v_slug, 'inbox'::text,
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
      NULL::uuid, NULL::uuid, NULL::boolean, NULL::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 2. t+<N>@... — конкретный тред
  IF v_local ~ '^t\+[0-9]+$' THEN
    v_short_id := substring(v_local FROM 3)::int;
    RETURN QUERY
      SELECT v_workspace_id, v_slug, 'thread'::text,
        pt.id, pt.project_id, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
        NULL::uuid, NULL::uuid, NULL::boolean, NULL::text, NULL::uuid, NULL::uuid
      FROM project_threads pt
      WHERE pt.workspace_id = v_workspace_id AND pt.short_id = v_short_id;
    RETURN;
  END IF;

  -- 3. p+<N>@... — проект
  IF v_local ~ '^p\+[0-9]+$' THEN
    v_short_id := substring(v_local FROM 3)::int;
    RETURN QUERY
      SELECT v_workspace_id, v_slug, 'project'::text,
        NULL::uuid, p.id, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
        NULL::uuid, NULL::uuid, NULL::boolean, NULL::text, NULL::uuid, NULL::uuid
      FROM projects p
      WHERE p.workspace_id = v_workspace_id AND p.short_id = v_short_id AND p.is_deleted = false;
    RETURN;
  END IF;

  -- 4. Виртуальный адрес
  RETURN QUERY
    SELECT v_workspace_id, v_slug, 'virtual'::text,
      NULL::uuid, NULL::uuid, ev.id, ev.routing_mode,
      ev.target_project_id, ev.target_thread_id,
      ev.default_thread_template_id, ev.default_assignee_user_id,
      ev.auto_reply_enabled, ev.auto_reply_text, NULL::uuid, NULL::uuid
    FROM email_virtual_addresses ev
    WHERE ev.workspace_id = v_workspace_id
      AND ev.local_part = v_local
      AND ev.is_active = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT v_workspace_id, v_slug, 'unknown_local'::text,
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
      NULL::uuid, NULL::uuid, NULL::boolean, NULL::text, NULL::uuid, NULL::uuid;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.resolve_short_id(p_workspace_id uuid, p_entity_type text, p_short_id integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uuid uuid;
BEGIN
  IF p_entity_type = 'project' THEN
    SELECT id INTO v_uuid FROM projects
      WHERE workspace_id = p_workspace_id AND short_id = p_short_id AND is_deleted = false LIMIT 1;
  ELSIF p_entity_type = 'thread' THEN
    SELECT id INTO v_uuid FROM project_threads
      WHERE workspace_id = p_workspace_id AND short_id = p_short_id LIMIT 1;
  ELSIF p_entity_type = 'board' THEN
    SELECT id INTO v_uuid FROM boards
      WHERE workspace_id = p_workspace_id AND short_id = p_short_id LIMIT 1;
  END IF;
  RETURN v_uuid;
END;
$function$


CREATE OR REPLACE FUNCTION public.resolve_workspace_by_host(p_host text)
 RETURNS TABLE(id uuid, name text, slug text, custom_domain text, resolved_via text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_root_domain text := 'clientcase.app';
  v_subdomain text;
BEGIN
  -- Сначала точное совпадение по custom_domain
  RETURN QUERY
    SELECT w.id, w.name, w.slug, w.custom_domain, 'custom_domain'::text
    FROM workspaces w
    WHERE w.custom_domain = p_host
      AND w.is_deleted = false
    LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Если host = <slug>.clientcase.app
  IF p_host LIKE '%.' || v_root_domain THEN
    v_subdomain := substring(p_host FROM 1 FOR length(p_host) - length(v_root_domain) - 1);
    -- Системные поддомены не резолвим в воркспейсы
    IF v_subdomain NOT IN ('my', 'www', 'api', 'admin', 'mail', 'app', 'static', 'assets', 'cdn', 'help', 'docs', 'blog', 'support', 'inbox', 'auth', 'login', 'register', 'public', 'webhook', 'webhooks') THEN
      RETURN QUERY
        SELECT w.id, w.name, w.slug, w.custom_domain, 'subdomain'::text
        FROM workspaces w
        WHERE w.slug = v_subdomain
          AND w.is_deleted = false
        LIMIT 1;
    END IF;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.resolve_workspace_plan(p_workspace_id uuid)
 RETURNS TABLE(plan_code text, plan_name text, status text, max_participants integer, max_projects integer, max_tasks integer, max_storage_mb integer, ai_tokens_monthly bigint, enabled_modules text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    pl.code, pl.name, b.status,
    COALESCE(wl.max_participants, pl.max_participants),
    COALESCE(wl.max_projects,     pl.max_projects),
    pl.max_tasks,
    COALESCE(wl.max_storage_mb,   pl.max_storage_mb),
    pl.ai_tokens_monthly,
    COALESCE(pl.enabled_modules, '{}')
  FROM (SELECT 1) x
  LEFT JOIN workspace_billing b ON b.workspace_id = p_workspace_id
  LEFT JOIN plans pl ON pl.id = b.plan_id
  LEFT JOIN workspace_limits wl ON wl.workspace_id = p_workspace_id
  WHERE is_workspace_participant(p_workspace_id, (SELECT auth.uid()));
$function$


CREATE OR REPLACE FUNCTION public.restore_article_version(p_version_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_article_id UUID;
  v_version_title TEXT;
  v_version_content TEXT;
  v_version_number INT;
  v_new_id UUID;
BEGIN
  -- Получить данные из версии
  SELECT article_id, title, content, version
  INTO v_article_id, v_version_title, v_version_content, v_version_number
  FROM knowledge_article_versions
  WHERE id = p_version_id;

  IF v_article_id IS NULL THEN
    RAISE EXCEPTION 'Version not found';
  END IF;

  -- Обновить статью контентом выбранной версии
  UPDATE knowledge_articles
  SET title = v_version_title,
      content = v_version_content,
      updated_at = now()
  WHERE id = v_article_id;

  -- Создать новую версию
  SELECT create_article_version(
    v_article_id,
    'Восстановлено из версии ' || v_version_number
  ) INTO v_new_id;

  RETURN v_new_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.restore_document_version(p_version_id uuid, p_document_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_version_to_restore document_files%ROWTYPE;
  v_new_version INT;
  v_workspace_id UUID;
  v_new_file_id UUID;
BEGIN
  -- Получаем версию для восстановления
  SELECT * INTO v_version_to_restore
  FROM document_files
  WHERE id = p_version_id AND document_id = p_document_id;
  
  IF v_version_to_restore IS NULL THEN
    RAISE EXCEPTION 'Version not found';
  END IF;
  
  -- Получаем workspace_id
  SELECT workspace_id INTO v_workspace_id
  FROM documents WHERE id = p_document_id;
  
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;
  
  -- Получаем следующий номер версии
  SELECT COALESCE(MAX(version), 0) + 1 
  INTO v_new_version
  FROM document_files 
  WHERE document_id = p_document_id;
  
  -- Сбрасываем флаг is_current у всех версий
  UPDATE document_files 
  SET is_current = false 
  WHERE document_id = p_document_id;
  
  -- Вставляем новую версию (копия старой)
  INSERT INTO document_files (
    document_id, workspace_id, version, is_current,
    file_path, file_name, file_size, mime_type, checksum,
    uploaded_by
  ) VALUES (
    p_document_id, v_workspace_id, v_new_version, true,
    v_version_to_restore.file_path, 
    v_version_to_restore.file_name, 
    v_version_to_restore.file_size, 
    v_version_to_restore.mime_type, 
    v_version_to_restore.checksum,
    auth.uid()
  ) RETURNING id INTO v_new_file_id;
  
  RETURN v_new_file_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.revoke_all_user_sessions(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = '22023';
  END IF;

  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
END;
$function$


CREATE OR REPLACE FUNCTION public.route_incoming_to_project(p_workspace_id uuid, p_source text, p_channel_type text, p_external_id text, p_sender_name text DEFAULT NULL::text, p_thread_name text DEFAULT NULL::text)
 RETURNS TABLE(participant_id uuid, project_id uuid, thread_id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id uuid;
  v_project_id uuid;
  v_thread_id uuid;
  v_template_id uuid;
  v_status_id uuid;
  v_status text;
  v_normalized_external_id text;
  v_channel_key text;
  v_def_icon text;
  v_def_accent text;
BEGIN
  v_normalized_external_id := trim(p_external_id);
  IF p_channel_type = 'email' THEN
    v_normalized_external_id := lower(v_normalized_external_id);
  END IF;

  IF v_normalized_external_id = '' THEN
    RETURN;
  END IF;

  SELECT pc.participant_id INTO v_participant_id
  FROM participant_channels pc
  WHERE pc.workspace_id = p_workspace_id
    AND pc.channel_type = p_channel_type
    AND pc.external_id = v_normalized_external_id
  LIMIT 1;

  IF v_participant_id IS NULL THEN
    INSERT INTO participants (
      workspace_id, name, email,
      workspace_roles, can_login, user_id
    ) VALUES (
      p_workspace_id,
      COALESCE(NULLIF(trim(p_sender_name), ''), 'Без имени'),
      CASE
        WHEN p_channel_type = 'email' THEN v_normalized_external_id
        ELSE p_channel_type || '_' || substr(md5(v_normalized_external_id || clock_timestamp()::text), 1, 12) || '@' || p_channel_type || '.placeholder'
      END,
      '{}'::text[],
      false,
      NULL
    )
    RETURNING id INTO v_participant_id;

    INSERT INTO participant_channels (
      participant_id, workspace_id, channel_type, external_id, is_primary
    ) VALUES (
      v_participant_id, p_workspace_id, p_channel_type, v_normalized_external_id, true
    )
    ON CONFLICT (workspace_id, channel_type, external_id) DO NOTHING;
  END IF;

  SELECT pr.id INTO v_project_id
  FROM projects pr
  LEFT JOIN statuses st ON st.id = pr.status_id
  WHERE pr.workspace_id = p_workspace_id
    AND pr.contact_participant_id = v_participant_id
    AND pr.is_deleted = false
    AND (st.id IS NULL OR st.is_final = false)
  ORDER BY pr.last_activity_at DESC NULLS LAST, pr.created_at DESC
  LIMIT 1;

  IF v_project_id IS NOT NULL THEN
    v_status := 'matched';
  ELSE
    SELECT (default_lead_template_per_source->>p_source)::uuid INTO v_template_id
    FROM workspaces WHERE id = p_workspace_id;

    IF v_template_id IS NULL THEN
      participant_id := v_participant_id;
      project_id := NULL;
      thread_id := NULL;
      status := 'no_template';
      RETURN NEXT;
      RETURN;
    END IF;

    SELECT s.id INTO v_status_id
    FROM project_template_statuses pts
    JOIN statuses s ON s.id = pts.status_id
    WHERE pts.template_id = v_template_id
    ORDER BY pts.is_default DESC, pts.order_index ASC
    LIMIT 1;

    INSERT INTO projects (
      workspace_id, name, template_id, status_id,
      contact_participant_id, created_by
    ) VALUES (
      p_workspace_id,
      COALESCE(NULLIF(trim(p_sender_name), ''), 'Без имени') ||
        ' (' ||
        CASE p_source
          WHEN 'email' THEN 'Email'
          WHEN 'telegram' THEN 'Telegram'
          WHEN 'telegram_business' THEN 'Telegram'
          WHEN 'telegram_mtproto' THEN 'Telegram'
          WHEN 'wazzup' THEN 'WhatsApp'
          ELSE p_source
        END ||
        ')',
      v_template_id,
      v_status_id,
      v_participant_id,
      NULL
    ) RETURNING id INTO v_project_id;

    v_status := 'new_lead';
  END IF;

  SELECT pt.id INTO v_thread_id
  FROM project_threads pt
  JOIN participant_channels pc
    ON pc.workspace_id = p_workspace_id
   AND pc.channel_type = p_channel_type
   AND pc.external_id = v_normalized_external_id
  WHERE pt.project_id = v_project_id
    AND pt.is_deleted = false
  LIMIT 1;

  IF v_thread_id IS NULL THEN
    v_channel_key := CASE p_source
      WHEN 'telegram'          THEN 'telegram'
      WHEN 'telegram_business' THEN 'telegram_personal'
      WHEN 'telegram_mtproto'  THEN 'telegram_personal'
      WHEN 'wazzup'            THEN 'wazzup'
      WHEN 'email'             THEN 'email'
      ELSE 'telegram'
    END;
    SELECT rcd.icon, rcd.accent_color INTO v_def_icon, v_def_accent
    FROM resolve_channel_default(p_workspace_id, v_channel_key) rcd;

    INSERT INTO project_threads (
      project_id, workspace_id, name, type, access_type,
      icon, accent_color, created_by
    ) VALUES (
      v_project_id,
      p_workspace_id,
      COALESCE(NULLIF(trim(p_thread_name), ''), 'Новое сообщение'),
      'chat',
      'all',
      v_def_icon,
      v_def_accent,
      NULL
    ) RETURNING id INTO v_thread_id;
  END IF;

  participant_id := v_participant_id;
  project_id := v_project_id;
  thread_id := v_thread_id;
  status := v_status;
  RETURN NEXT;
  RETURN;
END;
$function$


CREATE OR REPLACE FUNCTION public.run_report(p_workspace_id uuid, p_config jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
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

  IF p_config ? 'filter' THEN
    v_fsql := public._report_filter_sql(p_config -> 'filter', v_fields);
    IF v_fsql IS NOT NULL THEN
      v_where := v_where || ' AND (' || v_fsql || ')';
    END IF;
  END IF;

  IF v_mode = 'summary' THEN
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

    IF v_gcount > 0 THEN
      EXECUTE 'SELECT row_to_json(q)::jsonb FROM (SELECT ' || array_to_string(v_msel, ', ')
           || ' FROM ' || v_from || ' WHERE ' || v_where || ') q'
        INTO v_totals;
    END IF;

  ELSE
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
$function$


CREATE OR REPLACE FUNCTION public.scan_dispatch_failures()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dispatch RECORD;
  v_msg RECORD;
  v_existing_id uuid;
  v_error_text text;
  v_error_code text;
  v_count integer := 0;
BEGIN
  FOR v_dispatch IN
    SELECT sd.request_id, sd.message_id, sd.function_name, sd.dispatched_at,
           r.status_code, r.error_msg, r.content
    FROM public.message_send_dispatch sd
    JOIN net._http_response r ON r.id = sd.request_id
    WHERE sd.processed_at IS NULL
    ORDER BY sd.dispatched_at
    LIMIT 200
  LOOP
    -- 2xx — успех, просто помечаем processed
    IF v_dispatch.status_code BETWEEN 200 AND 299 THEN
      UPDATE public.message_send_dispatch SET processed_at = now()
        WHERE request_id = v_dispatch.request_id;
      CONTINUE;
    END IF;

    -- Не-2xx: edge function упала или сервис недоступен.
    -- 1. Подстраховка: переведём сообщение в send_status='failed', если
    --    функция не успела это сделать сама (markMessageFailed бросило
    --    исключение и не дописало статус, либо вообще не дошло до кода).
    --    Перезаписывать 'sent' нельзя — это поломает уже доставленные.
    IF v_dispatch.status_code IS NULL THEN
      v_error_text := 'Сервис ' || v_dispatch.function_name || ' не ответил'
        || COALESCE(': ' || v_dispatch.error_msg, '');
      v_error_code := 'NETWORK_ERROR';
    ELSE
      v_error_text := 'Сервис ' || v_dispatch.function_name || ' вернул ошибку '
        || v_dispatch.status_code
        || COALESCE(': ' || LEFT(v_dispatch.content::text, 300), '');
      v_error_code := 'HTTP_' || v_dispatch.status_code;
    END IF;

    UPDATE public.project_messages
    SET send_status = 'failed',
        send_failed_reason = COALESCE(send_failed_reason, LEFT(v_error_text, 500))
    WHERE id = v_dispatch.message_id
      AND send_status = 'pending';

    -- 2. Edge function могла уже сама создать failure (через markMessageFailed).
    -- Не дублируем — ищем failure для этого dispatch_request_id или для этого
    -- сообщения с created_at в окне ±60 сек от dispatched_at.
    SELECT id INTO v_existing_id FROM public.message_send_failures f
      WHERE (f.metadata->>'dispatch_request_id')::bigint = v_dispatch.request_id
         OR (f.thread_id IS NOT DISTINCT FROM (
              SELECT thread_id FROM public.project_messages WHERE id = v_dispatch.message_id
            )
            AND f.created_at >= v_dispatch.dispatched_at - interval '5 seconds'
            AND f.created_at <= v_dispatch.dispatched_at + interval '60 seconds')
      LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      UPDATE public.message_send_dispatch SET processed_at = now()
        WHERE request_id = v_dispatch.request_id;
      CONTINUE;
    END IF;

    SELECT pm.thread_id, pm.workspace_id, pm.project_id, pm.sender_participant_id,
           pm.content,
           p.user_id
    INTO v_msg
    FROM public.project_messages pm
    LEFT JOIN public.participants p ON p.id = pm.sender_participant_id
    WHERE pm.id = v_dispatch.message_id;

    IF v_msg IS NULL OR v_msg.user_id IS NULL THEN
      UPDATE public.message_send_dispatch SET processed_at = now()
        WHERE request_id = v_dispatch.request_id;
      CONTINUE;
    END IF;

    INSERT INTO public.message_send_failures (
      workspace_id, project_id, thread_id, user_id, participant_id,
      content, error_text, error_code, source,
      metadata, created_at
    ) VALUES (
      v_msg.workspace_id, v_msg.project_id, v_msg.thread_id, v_msg.user_id, v_msg.sender_participant_id,
      LEFT(COALESCE(v_msg.content, ''), 500),
      v_error_text, v_error_code, v_dispatch.function_name,
      jsonb_build_object(
        'dispatch_request_id', v_dispatch.request_id,
        'origin', 'dispatch_watchdog',
        'http_status', v_dispatch.status_code,
        'message_id', v_dispatch.message_id
      ),
      now()
    );

    UPDATE public.message_send_dispatch SET processed_at = now()
      WHERE request_id = v_dispatch.request_id;
    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.message_send_dispatch
  WHERE processed_at IS NOT NULL AND processed_at < now() - interval '3 days';

  RETURN v_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.seed_read_status_on_assignee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO message_read_status (participant_id, thread_id, project_id, channel, last_read_at, manually_unread)
  SELECT NEW.participant_id, t.id, t.project_id, 'client', NEW.assigned_at, false
  FROM project_threads t
  WHERE t.id = NEW.thread_id
    AND t.is_deleted = false
  ON CONFLICT (participant_id, thread_id) DO NOTHING;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.seed_read_status_on_project_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO message_read_status (participant_id, thread_id, project_id, channel, last_read_at, manually_unread)
  SELECT NEW.participant_id, t.id, t.project_id, 'client', NEW.added_at, false
  FROM project_threads t
  WHERE t.project_id = NEW.project_id
    AND t.is_deleted = false
  ON CONFLICT (participant_id, thread_id) DO NOTHING;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.seed_read_status_on_thread_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO message_read_status (participant_id, thread_id, project_id, channel, last_read_at, manually_unread)
  SELECT NEW.participant_id, t.id, t.project_id, 'client', NEW.added_at, false
  FROM project_threads t
  WHERE t.id = NEW.thread_id
    AND t.is_deleted = false
  ON CONFLICT (participant_id, thread_id) DO NOTHING;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_board_short_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.short_id IS NULL THEN
    NEW.short_id := public.next_short_id(NEW.workspace_id, 'board');
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_default_external_contact_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.can_login = true THEN RETURN NEW; END IF;
  IF NEW.workspace_roles IS NOT NULL AND array_length(NEW.workspace_roles, 1) > 0 THEN
    RETURN NEW;
  END IF;
  NEW.workspace_roles := ARRAY['Внешний контакт'];
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_initial_send_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.send_status IS NULL OR NEW.send_status = 'pending' THEN
    IF NEW.source = 'web' AND NEW.is_draft IS NOT TRUE AND NEW.scheduled_send_at IS NULL THEN
      NEW.send_status := 'pending';
      NEW.send_attempted_at := now();
    ELSE
      NEW.send_status := 'sent';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_knowledge_article_created_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  IF NEW.created_by IS NOT NULL THEN
    IF NEW.author_email IS NULL THEN
      SELECT email INTO NEW.author_email FROM auth.users WHERE id = NEW.created_by;
    END IF;
    IF NEW.author_name IS NULL THEN
      SELECT raw_user_meta_data->>'full_name' INTO NEW.author_name FROM auth.users WHERE id = NEW.created_by;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_limit(real)
 RETURNS real
 LANGUAGE c
 STRICT
AS '$libdir/pg_trgm', $function$set_limit$function$


CREATE OR REPLACE FUNCTION public.set_my_preferred_language(p_language text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_language IS NULL OR length(p_language) < 2 OR length(p_language) > 10 THEN
    RAISE EXCEPTION 'Invalid language code';
  END IF;
  UPDATE public.participants
     SET preferred_language = p_language,
         updated_at = now()
   WHERE user_id = auth.uid()
     AND is_deleted = false;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_my_thread_notify_level(p_thread_id uuid, p_level text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pid uuid; v_ws uuid; v_state text;
BEGIN
  IF p_level NOT IN ('all','messages','off') THEN RAISE EXCEPTION 'invalid level: %', p_level; END IF;
  SELECT workspace_id INTO v_ws FROM project_threads WHERE id = p_thread_id AND is_deleted = false;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;
  SELECT id INTO v_pid FROM participants
    WHERE workspace_id = v_ws AND user_id = (SELECT auth.uid()) AND is_deleted = false LIMIT 1;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'participant not found'; END IF;

  v_state := CASE p_level WHEN 'all' THEN 'subscribed' WHEN 'messages' THEN 'muted_events' ELSE 'muted' END;

  INSERT INTO project_thread_subscriptions (thread_id, participant_id, state, source)
  VALUES (p_thread_id, v_pid, v_state, 'manual')
  ON CONFLICT (thread_id, participant_id)
  DO UPDATE SET state = EXCLUDED.state, source = 'manual', updated_at = now();

  RETURN p_level;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_my_thread_subscription(p_thread_id uuid, p_subscribed boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pid uuid; v_ws uuid;
BEGIN
  SELECT workspace_id INTO v_ws FROM project_threads WHERE id = p_thread_id AND is_deleted = false;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;
  SELECT id INTO v_pid FROM participants
    WHERE workspace_id = v_ws AND user_id = (SELECT auth.uid()) AND is_deleted = false LIMIT 1;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'participant not found'; END IF;

  INSERT INTO project_thread_subscriptions (thread_id, participant_id, state, source)
  VALUES (p_thread_id, v_pid, CASE WHEN p_subscribed THEN 'subscribed' ELSE 'muted' END, 'manual')
  ON CONFLICT (thread_id, participant_id)
  DO UPDATE SET state = EXCLUDED.state, source = 'manual', updated_at = now();

  RETURN p_subscribed;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_project_short_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.short_id IS NULL THEN
    NEW.short_id := public.next_short_id(NEW.workspace_id, 'project');
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_project_thread_short_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id uuid;
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO v_workspace_id FROM projects WHERE id = NEW.project_id;
    NEW.workspace_id := v_workspace_id;
  END IF;
  IF NEW.short_id IS NULL AND NEW.workspace_id IS NOT NULL THEN
    NEW.short_id := public.next_short_id(NEW.workspace_id, 'thread');
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_thread_created_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_thread_subscription_for(p_thread_id uuid, p_participant_id uuid, p_subscribed boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ws uuid; v_authorized boolean;
BEGIN
  SELECT workspace_id INTO v_ws FROM project_threads WHERE id = p_thread_id AND is_deleted = false;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM participants WHERE id = p_participant_id AND workspace_id = v_ws AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'participant not in workspace';
  END IF;

  v_authorized :=
    EXISTS (SELECT 1 FROM participants WHERE id = p_participant_id AND user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM participants p
      JOIN workspace_roles wr ON wr.name = ANY(p.workspace_roles) AND wr.workspace_id = p.workspace_id
      WHERE p.workspace_id = v_ws AND p.user_id = (SELECT auth.uid()) AND p.is_deleted = false
        AND (wr.is_owner OR (wr.permissions->>'manage_workspace_settings')::boolean)
    );
  IF NOT v_authorized THEN RAISE EXCEPTION 'not authorized'; END IF;

  INSERT INTO project_thread_subscriptions (thread_id, participant_id, state, source)
  VALUES (p_thread_id, p_participant_id, CASE WHEN p_subscribed THEN 'subscribed' ELSE 'muted' END, 'manual')
  ON CONFLICT (thread_id, participant_id)
  DO UPDATE SET state = EXCLUDED.state, source = 'manual', updated_at = now();

  RETURN p_subscribed;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_workspace_api_key(workspace_uuid uuid, api_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing_key_id uuid;
  new_key_id uuid;
  key_name text;
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' THEN
    IF NOT (
      public.is_workspace_owner(auth.uid(), workspace_uuid)
      OR public.has_workspace_permission(auth.uid(), workspace_uuid, 'manage_workspace_settings')
    ) THEN
      RAISE EXCEPTION 'Access denied: manage_workspace_settings required';
    END IF;
  ELSIF coalesce(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  key_name := 'anthropic_key_' || workspace_uuid::text;

  SELECT anthropic_api_key_id INTO existing_key_id
  FROM workspaces
  WHERE id = workspace_uuid;

  IF existing_key_id IS NOT NULL THEN
    PERFORM vault.update_secret(existing_key_id, api_key, key_name, 'Anthropic API key for workspace');
    RETURN existing_key_id;
  ELSE
    SELECT vault.create_secret(api_key, key_name, 'Anthropic API key for workspace') INTO new_key_id;

    UPDATE workspaces
    SET anthropic_api_key_id = new_key_id
    WHERE id = workspace_uuid;

    RETURN new_key_id;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_workspace_google_api_key(workspace_uuid uuid, api_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_key_id uuid;
  v_new_key_id uuid;
  v_key_name text;
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' THEN
    IF NOT (
      public.is_workspace_owner(auth.uid(), workspace_uuid)
      OR public.has_workspace_permission(auth.uid(), workspace_uuid, 'manage_workspace_settings')
    ) THEN
      RAISE EXCEPTION 'Access denied: manage_workspace_settings required';
    END IF;
  ELSIF coalesce(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_key_name := 'google_key_' || workspace_uuid::text;

  SELECT google_api_key_id INTO v_existing_key_id
  FROM workspaces
  WHERE id = workspace_uuid;

  IF v_existing_key_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_key_id, api_key, v_key_name, 'Google API key for workspace');
    RETURN v_existing_key_id;
  ELSE
    SELECT vault.create_secret(api_key, v_key_name, 'Google API key for workspace') INTO v_new_key_id;

    UPDATE workspaces
    SET google_api_key_id = v_new_key_id
    WHERE id = workspace_uuid;

    RETURN v_new_key_id;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_workspace_voyageai_api_key(workspace_uuid uuid, api_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_key_id uuid;
  v_new_key_id uuid;
  v_key_name text;
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' THEN
    IF NOT (
      public.is_workspace_owner(auth.uid(), workspace_uuid)
      OR public.has_workspace_permission(auth.uid(), workspace_uuid, 'manage_workspace_settings')
    ) THEN
      RAISE EXCEPTION 'Access denied: manage_workspace_settings required';
    END IF;
  ELSIF coalesce(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_key_name := 'voyageai_key_' || workspace_uuid::text;

  SELECT voyageai_api_key_id INTO v_existing_key_id
  FROM workspaces
  WHERE id = workspace_uuid;

  IF v_existing_key_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_key_id, api_key, v_key_name, 'VoyageAI API key for workspace');
    RETURN v_existing_key_id;
  ELSE
    SELECT vault.create_secret(api_key, v_key_name, 'VoyageAI API key for workspace') INTO v_new_key_id;

    UPDATE workspaces
    SET voyageai_api_key_id = v_new_key_id
    WHERE id = workspace_uuid;

    RETURN v_new_key_id;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.show_limit()
 RETURNS real
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_limit$function$


CREATE OR REPLACE FUNCTION public.show_trgm(text)
 RETURNS text[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_trgm$function$


CREATE OR REPLACE FUNCTION public.similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity$function$


CREATE OR REPLACE FUNCTION public.similarity_dist(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_dist$function$


CREATE OR REPLACE FUNCTION public.similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_op$function$


CREATE OR REPLACE FUNCTION public.start_impersonation_session(p_owner_user_id uuid, p_workspace_id uuid, p_target_user_id uuid, p_jti text, p_expires_at timestamp with time zone, p_user_agent text DEFAULT NULL::text, p_ip text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_session_id  uuid;
  v_target_is_owner boolean;
  v_target_is_member boolean;
BEGIN
  IF p_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'owner_user_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_workspace_owner(p_owner_user_id, p_workspace_id) THEN
    RAISE EXCEPTION 'only workspace owner can impersonate'
      USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id = p_owner_user_id THEN
    RAISE EXCEPTION 'cannot impersonate self'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.participants
    WHERE user_id = p_target_user_id
      AND workspace_id = p_workspace_id
      AND is_deleted = false
      AND can_login = true
  ) INTO v_target_is_member;

  IF NOT v_target_is_member THEN
    RAISE EXCEPTION 'target is not an active workspace member'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.participants
    WHERE user_id = p_target_user_id
      AND workspace_id = p_workspace_id
      AND is_deleted = false
      AND 'Владелец' = ANY(workspace_roles)
  ) INTO v_target_is_owner;

  IF v_target_is_owner THEN
    RAISE EXCEPTION 'cannot impersonate another workspace owner'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.impersonation_sessions (
    owner_user_id, target_user_id, workspace_id, jti, expires_at, user_agent, ip
  ) VALUES (
    p_owner_user_id, p_target_user_id, p_workspace_id, p_jti, p_expires_at, p_user_agent, p_ip
  ) RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.strict_word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity$function$


CREATE OR REPLACE FUNCTION public.strict_word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_commutator_op$function$


CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_commutator_op$function$


CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_op$function$


CREATE OR REPLACE FUNCTION public.strict_word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_op$function$


CREATE OR REPLACE FUNCTION public.swap_board_list_sort_order(p_list_a_id uuid, p_list_b_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_a INT;
  v_order_b INT;
  v_board_a UUID;
  v_board_b UUID;
BEGIN
  SELECT sort_order, board_id INTO v_order_a, v_board_a
  FROM board_lists WHERE id = p_list_a_id;

  SELECT sort_order, board_id INTO v_order_b, v_board_b
  FROM board_lists WHERE id = p_list_b_id;

  IF v_board_a IS NULL OR v_board_b IS NULL THEN
    RAISE EXCEPTION 'One or both lists not found';
  END IF;

  IF v_board_a <> v_board_b THEN
    RAISE EXCEPTION 'Lists belong to different boards';
  END IF;

  UPDATE board_lists SET sort_order = v_order_b, updated_at = now() WHERE id = p_list_a_id;
  UPDATE board_lists SET sort_order = v_order_a, updated_at = now() WHERE id = p_list_b_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.sync_form_kit_structure(p_kit_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_template_id uuid;
  v_section_mapping jsonb := '{}';
  v_ts record;
  v_inserted_section_id uuid;
BEGIN
  SELECT template_id INTO v_template_id
  FROM form_kits
  WHERE id = p_kit_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Анкета не привязана к шаблону';
  END IF;

  DELETE FROM form_kit_fields WHERE form_kit_id = p_kit_id;
  DELETE FROM form_kit_sections WHERE form_kit_id = p_kit_id;

  FOR v_ts IN
    SELECT id, name, description, sort_order, header_color
    FROM form_template_sections
    WHERE form_template_id = v_template_id
    ORDER BY sort_order
  LOOP
    INSERT INTO form_kit_sections (form_kit_id, name, description, sort_order, header_color)
    VALUES (p_kit_id, v_ts.name, v_ts.description, v_ts.sort_order, v_ts.header_color)
    RETURNING id INTO v_inserted_section_id;

    v_section_mapping := v_section_mapping || jsonb_build_object(v_ts.id::text, v_inserted_section_id::text);
  END LOOP;

  INSERT INTO form_kit_fields (
    form_kit_id, form_kit_section_id, field_definition_id,
    name, field_type, description, options, placeholder, help_text, validation,
    is_required, risk_assessment_enabled, sort_order
  )
  SELECT
    p_kit_id,
    CASE
      WHEN tf.form_template_section_id IS NOT NULL
      THEN (v_section_mapping ->> tf.form_template_section_id::text)::uuid
      ELSE NULL
    END,
    tf.field_definition_id,
    fd.name,
    fd.field_type,
    COALESCE(tf.description, fd.description),
    CASE
      WHEN tf.options IS NOT NULL AND tf.options != '{}'::jsonb
      THEN COALESCE(fd.options, '{}'::jsonb) || tf.options
      ELSE fd.options
    END,
    fd.placeholder,
    fd.help_text,
    fd.validation,
    COALESCE(tf.is_required, false),
    COALESCE(tf.risk_assessment_enabled, false),
    tf.sort_order
  FROM form_template_fields tf
  JOIN field_definitions fd ON fd.id = tf.field_definition_id
  WHERE tf.form_template_id = v_template_id
  ORDER BY tf.sort_order;

  INSERT INTO form_kit_field_values (form_kit_id, field_definition_id, value)
  SELECT
    p_kit_id,
    tf.field_definition_id,
    (tf.options ->> 'defaultRows')
  FROM form_template_fields tf
  JOIN field_definitions fd ON fd.id = tf.field_definition_id
  WHERE tf.form_template_id = v_template_id
    AND fd.field_type = 'key-value-table'
    AND tf.options IS NOT NULL
    AND tf.options ? 'defaultRows'
    AND jsonb_array_length(tf.options -> 'defaultRows') > 0
    AND NOT EXISTS (
      SELECT 1 FROM form_kit_field_values fkfv
      WHERE fkfv.form_kit_id = p_kit_id
        AND fkfv.field_definition_id = tf.field_definition_id
        AND fkfv.composite_field_id IS NULL
    );

  UPDATE form_kits
  SET structure_synced_at = now()
  WHERE id = p_kit_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.sync_knowledge_article_is_published()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  status_name TEXT;
BEGIN
  -- Если status_id не изменился — ничего не делаем
  IF TG_OP = 'UPDATE' AND OLD.status_id IS NOT DISTINCT FROM NEW.status_id THEN
    RETURN NEW;
  END IF;

  -- Определяем имя нового статуса
  IF NEW.status_id IS NULL THEN
    NEW.is_published := false;
  ELSE
    SELECT name INTO status_name FROM statuses WHERE id = NEW.status_id;
    NEW.is_published := (status_name = 'Опубликована');
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.sync_telegram_message_ids()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.telegram_message_id IS NOT NULL
     AND NOT (NEW.telegram_message_ids @> ARRAY[NEW.telegram_message_id]) THEN
    NEW.telegram_message_ids := array_append(
      COALESCE(NEW.telegram_message_ids, '{}'),
      NEW.telegram_message_id
    );
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.sync_thread_deadline_end_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_duration interval;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.end_at IS NOT NULL THEN
      NEW.deadline := NEW.end_at;
    END IF;
    RETURN NEW;
  END IF;

  -- Правило 1: меняется ТОЛЬКО end_at (deadline без изменений).
  IF NEW.end_at IS DISTINCT FROM OLD.end_at
     AND NEW.deadline IS NOT DISTINCT FROM OLD.deadline THEN
    NEW.deadline := NEW.end_at;
    RETURN NEW;
  END IF;

  -- Правило 2: меняется ТОЛЬКО deadline у задачи-в-календаре.
  IF NEW.deadline IS DISTINCT FROM OLD.deadline
     AND NEW.end_at IS NOT DISTINCT FROM OLD.end_at
     AND OLD.start_at IS NOT NULL
     AND OLD.end_at IS NOT NULL THEN
    IF NEW.deadline IS NULL THEN
      NEW.start_at := NULL;
      NEW.end_at := NULL;
    ELSE
      v_duration := OLD.end_at - OLD.start_at;
      NEW.end_at := NEW.deadline;
      NEW.start_at := NEW.deadline - v_duration;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.tg_participant_channels_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.tg_update_inbox_sort_at_from_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.resource_type IN ('task', 'thread') AND NEW.resource_id IS NOT NULL THEN
    UPDATE public.project_threads
    SET inbox_sort_at = GREATEST(COALESCE(inbox_sort_at, NEW.created_at), NEW.created_at)
    WHERE id = NEW.resource_id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_update_inbox_sort_at_from_audit failed for resource %: % (SQLSTATE %)',
    NEW.resource_id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.tg_update_inbox_sort_at_from_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.thread_id IS NOT NULL AND NEW.source IS DISTINCT FROM 'telegram_service'::message_source THEN
    UPDATE public.project_threads
    SET inbox_sort_at = GREATEST(COALESCE(inbox_sort_at, NEW.created_at), NEW.created_at)
    WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_update_inbox_sort_at_from_message failed for thread %: % (SQLSTATE %)',
    NEW.thread_id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.today_madrid_midnight()
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT ((now() AT TIME ZONE 'Europe/Madrid')::date)::timestamp AT TIME ZONE 'Europe/Madrid';
$function$


CREATE OR REPLACE FUNCTION public.toggle_message_reaction(p_message_id uuid, p_participant_id uuid, p_emoji text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_emoji TEXT;
BEGIN
  SELECT emoji INTO v_existing_emoji
  FROM message_reactions
  WHERE message_id = p_message_id
    AND participant_id = p_participant_id
  LIMIT 1;

  IF v_existing_emoji IS NOT NULL THEN
    DELETE FROM message_reactions
    WHERE message_id = p_message_id
      AND participant_id = p_participant_id;

    IF v_existing_emoji = p_emoji THEN
      RETURN FALSE;
    END IF;
  END IF;

  INSERT INTO message_reactions (message_id, participant_id, emoji)
  VALUES (p_message_id, p_participant_id, p_emoji);

  RETURN TRUE;
END;
$function$


CREATE OR REPLACE FUNCTION public.touch_calendars_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.touch_finance_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.touch_item_lists_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.touch_mirror_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.touch_pfv_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.touch_plan_block_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.touch_project_context_items_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.touch_report_definitions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.touch_workspace_integrations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.track_recent_view(p_workspace_id uuid, p_entity_type recent_entity_type, p_entity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := (SELECT auth.uid());
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.recently_viewed (user_id, workspace_id, entity_type, entity_id, opened_at)
  VALUES (v_user, p_workspace_id, p_entity_type, p_entity_id, now())
  ON CONFLICT (user_id, workspace_id, entity_type, entity_id)
  DO UPDATE SET opened_at = EXCLUDED.opened_at;

  DELETE FROM public.recently_viewed
  WHERE user_id = v_user
    AND workspace_id = p_workspace_id
    AND (entity_type, entity_id) NOT IN (
      SELECT entity_type, entity_id
      FROM public.recently_viewed
      WHERE user_id = v_user AND workspace_id = p_workspace_id
      ORDER BY opened_at DESC
      LIMIT 100
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.trg_inbox_broadcast()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ws uuid; v_project uuid; v_thread uuid; v_msg uuid; v_has_attach boolean := false;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'project_messages' THEN
      v_ws := COALESCE(NEW.workspace_id, OLD.workspace_id);
      v_project := COALESCE(NEW.project_id, OLD.project_id);
      v_thread := COALESCE(NEW.thread_id, OLD.thread_id);
      v_msg := COALESCE(NEW.id, OLD.id);
      v_has_attach := COALESCE(NEW.has_attachments, false);
    ELSIF TG_TABLE_NAME = 'project_threads' THEN
      v_ws := COALESCE(NEW.workspace_id, OLD.workspace_id);
      v_project := COALESCE(NEW.project_id, OLD.project_id);
      v_thread := COALESCE(NEW.id, OLD.id);
    ELSIF TG_TABLE_NAME = 'message_reactions' THEN
      SELECT pt.workspace_id, pt.project_id, pt.id INTO v_ws, v_project, v_thread
      FROM project_messages pm JOIN project_threads pt ON pt.id = pm.thread_id
      WHERE pm.id = COALESCE(NEW.message_id, OLD.message_id);
    END IF;
    IF v_ws IS NOT NULL THEN
      PERFORM realtime.send(
        jsonb_build_object(
          'project_id', v_project,
          'tbl', TG_TABLE_NAME,
          'thread_id', v_thread,
          'message_id', v_msg,
          'op', TG_OP,
          'has_attachments', v_has_attach
        ),
        'inbox_changed',
        'inbox:' || v_ws::text,
        true
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.trg_mention_recompute()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_thread uuid;
BEGIN
  BEGIN
    SELECT thread_id INTO v_thread FROM project_messages WHERE id = NEW.message_id;
    IF v_thread IS NOT NULL THEN
      PERFORM recompute_thread_unread_for(NEW.participant_id, v_thread);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.trg_thread_inbox_meta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_thread uuid;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'project_messages' THEN
      v_thread := COALESCE(NEW.thread_id, OLD.thread_id);
    ELSIF TG_TABLE_NAME = 'message_reactions' THEN
      SELECT pm.thread_id INTO v_thread FROM project_messages pm WHERE pm.id = COALESCE(NEW.message_id, OLD.message_id);
    ELSIF TG_TABLE_NAME = 'message_attachments' THEN
      SELECT pm.thread_id INTO v_thread FROM project_messages pm WHERE pm.id = COALESCE(NEW.message_id, OLD.message_id);
    ELSIF TG_TABLE_NAME = 'audit_logs' THEN
      IF COALESCE(NEW.resource_type, OLD.resource_type) IN ('task','thread') THEN
        v_thread := COALESCE(NEW.resource_id, OLD.resource_id);
      END IF;
    END IF;
    IF v_thread IS NOT NULL THEN
      PERFORM compute_thread_inbox_meta(v_thread);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- НИКОГДА не блокируем исходную операцию (вставку сообщения/реакции/события).
    -- Свежесть меты вторична — расхождение поймает сверочный джоб.
    NULL;
  END;
  RETURN NULL; -- AFTER-триггер, возврат игнорируется
END;
$function$


CREATE OR REPLACE FUNCTION public.trg_thread_unread()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_thread uuid;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'project_messages' THEN
      v_thread := COALESCE(NEW.thread_id, OLD.thread_id);
    ELSIF TG_TABLE_NAME = 'message_reactions' THEN
      SELECT pm.thread_id INTO v_thread FROM project_messages pm WHERE pm.id = COALESCE(NEW.message_id, OLD.message_id);
    ELSIF TG_TABLE_NAME = 'audit_logs' THEN
      IF COALESCE(NEW.resource_type, OLD.resource_type) IN ('task','thread') THEN
        v_thread := COALESCE(NEW.resource_id, OLD.resource_id);
      END IF;
    END IF;
    IF v_thread IS NOT NULL THEN PERFORM recompute_thread_unread_pairs(v_thread); END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.trg_thread_unread_access_project()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_project uuid; r RECORD;
BEGIN
  BEGIN
    v_project := COALESCE(NEW.project_id, OLD.project_id);
    IF v_project IS NOT NULL THEN
      FOR r IN SELECT id FROM project_threads WHERE project_id = v_project AND is_deleted = false LOOP
        PERFORM refresh_thread_unread_pairs(r.id);
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.trg_thread_unread_access_thread()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_thread uuid;
BEGIN
  BEGIN
    v_thread := COALESCE(NEW.thread_id, OLD.thread_id);
    IF v_thread IS NOT NULL THEN PERFORM refresh_thread_unread_pairs(v_thread); END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.trg_thread_unread_read_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM recompute_thread_unread_for(COALESCE(NEW.participant_id, OLD.participant_id), COALESCE(NEW.thread_id, OLD.thread_id));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.trg_thread_unread_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM recompute_thread_unread_for(
    COALESCE(NEW.participant_id, OLD.participant_id),
    COALESCE(NEW.thread_id, OLD.thread_id)
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.unaccent(regdictionary, text)
 RETURNS text
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/unaccent', $function$unaccent_dict$function$


CREATE OR REPLACE FUNCTION public.unaccent(text)
 RETURNS text
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/unaccent', $function$unaccent_dict$function$


CREATE OR REPLACE FUNCTION public.unaccent_init(internal)
 RETURNS internal
 LANGUAGE c
 PARALLEL SAFE
AS '$libdir/unaccent', $function$unaccent_init$function$


CREATE OR REPLACE FUNCTION public.unaccent_lexize(internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 PARALLEL SAFE
AS '$libdir/unaccent', $function$unaccent_lexize$function$


CREATE OR REPLACE FUNCTION public.update_article_groups(p_article_id uuid, p_group_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_id UUID;
BEGIN
  DELETE FROM knowledge_article_groups WHERE article_id = p_article_id;

  IF array_length(p_group_ids, 1) > 0 THEN
    FOREACH v_group_id IN ARRAY p_group_ids
    LOOP
      INSERT INTO knowledge_article_groups (article_id, group_id)
      VALUES (p_article_id, v_group_id);
    END LOOP;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_article_tags(p_article_id uuid, p_tag_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tag_id UUID;
BEGIN
  DELETE FROM knowledge_article_tags WHERE article_id = p_article_id;

  IF array_length(p_tag_ids, 1) > 0 THEN
    FOREACH v_tag_id IN ARRAY p_tag_ids
    LOOP
      INSERT INTO knowledge_article_tags (article_id, tag_id)
      VALUES (p_article_id, v_tag_id);
    END LOOP;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_conversation_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE conversations 
  SET updated_at = NOW() 
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_export_progress_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_form_kit_field_values_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_form_kit_structure_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_knowledge_articles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_knowledge_groups_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_message_on_reaction_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE project_messages
  SET updated_at = now()
  WHERE id = COALESCE(NEW.message_id, OLD.message_id);
  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.update_project_last_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE projects
  SET last_activity_at = NOW()
  WHERE id = NEW.project_id;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_project_templates_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.update_projects_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_qa_groups(p_qa_id uuid, p_group_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM knowledge_qa_groups WHERE qa_id = p_qa_id;
  IF array_length(p_group_ids, 1) > 0 THEN
    INSERT INTO knowledge_qa_groups (qa_id, group_id)
    SELECT p_qa_id, unnest(p_group_ids);
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_qa_tags(p_qa_id uuid, p_tag_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM knowledge_qa_tags WHERE qa_id = p_qa_id;
  IF array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO knowledge_qa_tags (qa_id, tag_id)
    SELECT p_qa_id, unnest(p_tag_ids);
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_source_documents_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_status_with_button_label(status_id uuid, status_name text, status_description text, status_button_label text, status_color text, status_order_index integer, status_is_default boolean, status_is_final boolean, status_text_color text DEFAULT '#1F2937'::text)
 RETURNS statuses
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_status public.statuses;
BEGIN
  UPDATE public.statuses
  SET
    name = status_name,
    description = status_description,
    button_label = status_button_label,
    color = status_color,
    order_index = status_order_index,
    is_default = status_is_default,
    is_final = status_is_final,
    text_color = status_text_color,
    updated_at = NOW()
  WHERE id = status_id
  RETURNING * INTO updated_status;
  RETURN updated_status;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_task_assignees(p_task_id uuid, p_assignee_ids uuid[], p_assigned_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_assignee_id UUID;
BEGIN
  -- Удаляем всех текущих
  DELETE FROM task_assignees WHERE task_id = p_task_id;

  -- Добавляем новых
  IF array_length(p_assignee_ids, 1) > 0 THEN
    FOREACH v_assignee_id IN ARRAY p_assignee_ids
    LOOP
      INSERT INTO task_assignees (task_id, participant_id, assigned_by)
      VALUES (p_task_id, v_assignee_id, p_assigned_by);
    END LOOP;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_thread_template_with_assignees(p_template_id uuid, p_updates jsonb, p_assignee_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM thread_templates tt
    JOIN participants p ON p.workspace_id = tt.workspace_id
    WHERE tt.id = p_template_id
      AND p.user_id = auth.uid()
      AND p.can_login = true
  ) THEN
    RAISE EXCEPTION 'Access denied or template not found';
  END IF;

  UPDATE thread_templates
  SET
    name                  = COALESCE((p_updates->>'name'),                  name),
    description           = COALESCE((p_updates->>'description'),           description),
    default_description   = CASE
                              WHEN p_updates ? 'default_description'
                              THEN NULLIF(p_updates->>'default_description', '')
                              ELSE default_description
                            END,
    thread_type           = COALESCE((p_updates->>'thread_type'),           thread_type),
    is_email              = COALESCE((p_updates->>'is_email')::boolean,     is_email),
    thread_name_template  = COALESCE((p_updates->>'thread_name_template'),  thread_name_template),
    accent_color          = COALESCE((p_updates->>'accent_color'),          accent_color),
    icon                  = COALESCE((p_updates->>'icon'),                  icon),
    access_type           = COALESCE((p_updates->>'access_type'),           access_type),
    access_roles          = CASE
                              WHEN p_updates ? 'access_roles'
                              THEN (SELECT ARRAY(SELECT jsonb_array_elements_text(p_updates->'access_roles')))
                              ELSE access_roles
                            END,
    default_status_id     = CASE
                              WHEN p_updates ? 'default_status_id'
                              THEN NULLIF(p_updates->>'default_status_id', '')::UUID
                              ELSE default_status_id
                            END,
    default_project_id    = CASE
                              WHEN p_updates ? 'default_project_id'
                              THEN NULLIF(p_updates->>'default_project_id', '')::UUID
                              ELSE default_project_id
                            END,
    deadline_days         = CASE
                              WHEN p_updates ? 'deadline_days'
                              THEN NULLIF(p_updates->>'deadline_days', '')::INTEGER
                              ELSE deadline_days
                            END,
    on_complete_set_project_status_id = CASE
                              WHEN p_updates ? 'on_complete_set_project_status_id'
                              THEN NULLIF(p_updates->>'on_complete_set_project_status_id', '')::UUID
                              ELSE on_complete_set_project_status_id
                            END,
    default_contact_email = COALESCE((p_updates->>'default_contact_email'), default_contact_email),
    email_subject_template= COALESCE((p_updates->>'email_subject_template'),email_subject_template),
    initial_message_html  = COALESCE((p_updates->>'initial_message_html'),  initial_message_html),
    updated_at            = NOW()
  WHERE id = p_template_id;

  DELETE FROM thread_template_assignees
  WHERE template_id = p_template_id;

  IF array_length(p_assignee_ids, 1) > 0 THEN
    INSERT INTO thread_template_assignees (template_id, participant_id)
    SELECT p_template_id, unnest(p_assignee_ids);
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.upsert_knowledge_embeddings(p_article_id uuid DEFAULT NULL::uuid, p_qa_id uuid DEFAULT NULL::uuid, p_workspace_id uuid DEFAULT NULL::uuid, p_embeddings jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Delete old embeddings
  IF p_article_id IS NOT NULL THEN
    DELETE FROM knowledge_embeddings WHERE article_id = p_article_id;
  ELSIF p_qa_id IS NOT NULL THEN
    DELETE FROM knowledge_embeddings WHERE qa_id = p_qa_id;
  ELSE
    RAISE EXCEPTION 'Either p_article_id or p_qa_id must be provided';
  END IF;

  -- Insert new embeddings (if any)
  IF jsonb_array_length(p_embeddings) > 0 THEN
    INSERT INTO knowledge_embeddings (article_id, qa_id, workspace_id, chunk_index, chunk_text, embedding)
    SELECT
      p_article_id,
      p_qa_id,
      p_workspace_id,
      (item->>'chunk_index')::int,
      item->>'chunk_text',
      (item->>'embedding')::vector
    FROM jsonb_array_elements(p_embeddings) AS item;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity$function$


CREATE OR REPLACE FUNCTION public.word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_commutator_op$function$


CREATE OR REPLACE FUNCTION public.word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_commutator_op$function$


CREATE OR REPLACE FUNCTION public.word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_op$function$


CREATE OR REPLACE FUNCTION public.word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_op$function$


CREATE OR REPLACE FUNCTION public.workspace_at_limit(p_workspace_id uuid, p_kind text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_p int; v_max_pr int; v_max_tok bigint;
BEGIN
  SELECT COALESCE(wl.max_participants, pl.max_participants),
         COALESCE(wl.max_projects,     pl.max_projects),
         pl.ai_tokens_monthly
    INTO v_max_p, v_max_pr, v_max_tok
  FROM (SELECT 1) x
  LEFT JOIN workspace_billing b ON b.workspace_id=p_workspace_id
  LEFT JOIN plans pl ON pl.id=b.plan_id
  LEFT JOIN workspace_limits wl ON wl.workspace_id=p_workspace_id;
  RETURN CASE p_kind
    WHEN 'participants' THEN v_max_p IS NOT NULL AND
      (SELECT count(*) FROM participants p WHERE p.workspace_id=p_workspace_id AND p.is_deleted=false AND p.user_id IS NOT NULL) >= v_max_p
    WHEN 'projects' THEN v_max_pr IS NOT NULL AND
      (SELECT count(*) FROM projects pr WHERE pr.workspace_id=p_workspace_id AND pr.is_deleted=false) >= v_max_pr
    WHEN 'ai_tokens' THEN v_max_tok IS NOT NULL AND
      (SELECT COALESCE(sum(m.total_tokens),0) FROM ai_usage_monthly m
         WHERE m.workspace_id=p_workspace_id AND m.period=date_trunc('month', now())::date) >= v_max_tok
    ELSE false
  END;
END;
$function$

