-- Фиксация живых тел RPC, дрейфанувших от репо (есть в проде, вызываются фронтом,
-- не было исходника в supabase/migrations/).
-- Снято с прода (project zjatohckcpiqmxkmfxbs) через pg_get_functiondef 2026-06-13.
-- НЕ менять логику — это снимок для repo-полноты.
--
-- 26 функций, каждая в одном overload. Тела приведены ровно как отдаёт
-- pg_get_functiondef (CREATE OR REPLACE). Файл — repo-гигиена, как миграцию
-- применять не требуется (функции уже существуют в проде в этом же виде).

-- ===== add_document_version(p_document_id uuid, p_file_path text, p_file_name text, p_file_size bigint, p_mime_type text, p_checksum text, p_file_id uuid) =====
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
$function$;

-- ===== add_folders_to_kit_template(p_kit_template_id uuid, p_folder_template_ids uuid[], p_start_order_index integer) =====
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
$function$;

-- ===== copy_form_template(p_source_template_id uuid, p_workspace_id uuid, p_new_name text) =====
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
$function$;

-- ===== copy_thread_template(p_template_id uuid) =====
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
$function$;

-- ===== create_article_version(p_article_id uuid, p_comment text) =====
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
$function$;

-- ===== create_article_with_group(p_workspace_id uuid, p_group_id uuid) =====
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
$function$;

-- ===== create_status_with_button_label(p_workspace_id uuid, p_name text, p_description text, p_button_label text, p_entity_type text, p_color text, p_order_index integer, p_is_default boolean, p_is_final boolean, p_text_color text) =====
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
$function$;

-- ===== delete_status(p_status_id uuid) =====
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
$function$;

-- ===== fill_slot_atomic(p_slot_id uuid, p_document_id uuid, p_project_id uuid) =====
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
$function$;

-- ===== generate_chat_link_code() =====
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
$function$;

-- ===== get_article_version_history(p_article_id uuid) =====
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
$function$;

-- ===== get_inbox_message_status(p_workspace_id uuid, p_user_id uuid) =====
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
$function$;

-- ===== get_workspaces_with_counts(p_user_id uuid) =====
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
$function$;

-- ===== log_audit_action(p_action text, p_resource_type text, p_resource_id uuid, p_details jsonb, p_ip_address inet, p_workspace_id uuid, p_project_id uuid, p_user_id uuid) =====
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
$function$;

-- ===== merge_telegram_contact(p_source_id uuid, p_target_id uuid, p_workspace_id uuid) =====
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
$function$;

-- ===== move_article_to_group(p_article_id uuid, p_from_group_id uuid, p_to_group_id uuid) =====
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
$function$;

-- ===== reorder_board_list_items(p_list_id uuid, p_item_type text, p_item_ids uuid[]) =====
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
$function$;

-- ===== reorder_documents(p_updates jsonb) =====
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
$function$;

-- ===== resolve_short_id(p_workspace_id uuid, p_entity_type text, p_short_id integer) =====
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
$function$;

-- ===== restore_article_version(p_version_id uuid) =====
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
$function$;

-- ===== swap_board_list_sort_order(p_list_a_id uuid, p_list_b_id uuid) =====
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
$function$;

-- ===== update_article_groups(p_article_id uuid, p_group_ids uuid[]) =====
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
$function$;

-- ===== update_article_tags(p_article_id uuid, p_tag_ids uuid[]) =====
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
$function$;

-- ===== update_qa_groups(p_qa_id uuid, p_group_ids uuid[]) =====
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
$function$;

-- ===== update_qa_tags(p_qa_id uuid, p_tag_ids uuid[]) =====
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
$function$;

-- ===== update_status_with_button_label(status_id uuid, status_name text, status_description text, status_button_label text, status_color text, status_order_index integer, status_is_default boolean, status_is_final boolean, status_text_color text) =====
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
$function$;
