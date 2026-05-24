-- Унификация слотов с папками: добавляем AI-промпты на все три уровня слотов.
--
-- Иерархия резолва промпта при AI-проверке документа (check-document edge):
--   1. folder_slots.ai_*_prompt (если документ привязан к слоту через folder_slots.document_id)
--   2. folders.ai_*_prompt
--   3. workspaces.default_ai_*_prompt
--
-- Поля копируются по цепочке: slot_templates → folder_template_slots /
-- document_kit_template_folder_slots → folder_slots (как сейчас копируется description).

ALTER TABLE slot_templates
  ADD COLUMN IF NOT EXISTS ai_naming_prompt TEXT,
  ADD COLUMN IF NOT EXISTS ai_check_prompt TEXT;

ALTER TABLE folder_template_slots
  ADD COLUMN IF NOT EXISTS ai_naming_prompt TEXT,
  ADD COLUMN IF NOT EXISTS ai_check_prompt TEXT;

ALTER TABLE document_kit_template_folder_slots
  ADD COLUMN IF NOT EXISTS ai_naming_prompt TEXT,
  ADD COLUMN IF NOT EXISTS ai_check_prompt TEXT;

ALTER TABLE folder_slots
  ADD COLUMN IF NOT EXISTS ai_naming_prompt TEXT,
  ADD COLUMN IF NOT EXISTS ai_check_prompt TEXT;

-- Пересоздаём RPC create_document_kit_from_template — теперь копирует AI-промпты слотов.
CREATE OR REPLACE FUNCTION create_document_kit_from_template(
  p_template_id UUID,
  p_project_id UUID,
  p_workspace_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
