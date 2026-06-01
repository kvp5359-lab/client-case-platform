-- 1) Сортировка списков шаблонов: order_index на project_templates и document_kit_templates.
--    Бэкфилл по created_at (стабильный порядок внутри воркспейса).
-- 2) RPC duplicate_project_template — полная копия шаблона проекта со всеми привязками.

-- ── order_index ────────────────────────────────────────────────────────────

ALTER TABLE public.project_templates
  ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;

ALTER TABLE public.document_kit_templates
  ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY workspace_id ORDER BY created_at) - 1 AS rn
  FROM public.project_templates
)
UPDATE public.project_templates t
SET order_index = r.rn
FROM ranked r
WHERE r.id = t.id;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY workspace_id ORDER BY created_at) - 1 AS rn
  FROM public.document_kit_templates
)
UPDATE public.document_kit_templates t
SET order_index = r.rn
FROM ranked r
WHERE r.id = t.id;

CREATE INDEX IF NOT EXISTS idx_project_templates_ws_order
  ON public.project_templates (workspace_id, order_index);
CREATE INDEX IF NOT EXISTS idx_document_kit_templates_ws_order
  ON public.document_kit_templates (workspace_id, order_index);

-- ── duplicate_project_template ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.duplicate_project_template(
  p_template_id uuid,
  p_new_name text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Доступ: участник воркспейса (SECURITY DEFINER обходит RLS, проверяем явно)
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

  -- 1. Базовый шаблон. brief_template_sheet_id / root_folder_id НЕ копируем —
  --    это внешние Google-ресурсы, привязанные к конкретному шаблону.
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

  -- 2. Статусы
  INSERT INTO public.project_template_statuses (template_id, status_id, order_index, is_default, is_final)
  SELECT v_new_id, status_id, order_index, is_default, is_final
  FROM public.project_template_statuses WHERE template_id = p_template_id;

  -- 3. Формы / анкеты
  INSERT INTO public.project_template_forms (project_template_id, form_template_id, order_index)
  SELECT v_new_id, form_template_id, order_index
  FROM public.project_template_forms WHERE project_template_id = p_template_id;

  -- 4. Наборы документов
  INSERT INTO public.project_template_document_kits (project_template_id, document_kit_template_id, order_index)
  SELECT v_new_id, document_kit_template_id, order_index
  FROM public.project_template_document_kits WHERE project_template_id = p_template_id;

  -- 5. Привязанные поля
  INSERT INTO public.project_template_field_links (template_id, field_definition_id, order_index, is_required)
  SELECT v_new_id, field_definition_id, order_index, is_required
  FROM public.project_template_field_links WHERE template_id = p_template_id;

  -- 6. Ссылки на базу знаний
  INSERT INTO public.knowledge_article_templates (article_id, project_template_id)
  SELECT article_id, v_new_id FROM public.knowledge_article_templates WHERE project_template_id = p_template_id;

  INSERT INTO public.knowledge_group_templates (group_id, project_template_id)
  SELECT group_id, v_new_id FROM public.knowledge_group_templates WHERE project_template_id = p_template_id;

  -- 7. Быстрые ответы
  INSERT INTO public.quick_reply_group_templates (group_id, project_template_id)
  SELECT group_id, v_new_id FROM public.quick_reply_group_templates WHERE project_template_id = p_template_id;

  INSERT INTO public.quick_reply_templates (reply_id, project_template_id)
  SELECT reply_id, v_new_id FROM public.quick_reply_templates WHERE project_template_id = p_template_id;

  -- 8. Треды/задачи шаблона + маппинг старый→новый id
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

    -- Исполнители треда
    INSERT INTO public.thread_template_assignees (template_id, participant_id)
    SELECT v_new_tt, participant_id
    FROM public.thread_template_assignees WHERE template_id = v_tt.id;
  END LOOP;

  -- 9. Блоки плана (thread_template_id ремапим через маппинг, slot_template_id оставляем как есть)
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
$$;

GRANT EXECUTE ON FUNCTION public.duplicate_project_template(uuid, text) TO authenticated;
