-- Фикс перемещения наборов документов: бэкфилл sort_order + автонумерация при создании.
--
-- Проблема: create_document_kit_from_template не выставлял sort_order, все наборы
-- получали дефолт 0. Swap двух нулей при «Переместить вверх/вниз» — no-op.

-- 1. Бэкфилл существующих данных: пронумеровать наборы в каждом проекте по created_at.
WITH ranked AS (
  SELECT id,
         (ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, id) - 1) AS new_order
  FROM document_kits
)
UPDATE document_kits dk
SET sort_order = r.new_order
FROM ranked r
WHERE dk.id = r.id
  AND dk.sort_order IS DISTINCT FROM r.new_order;

-- 2. RPC создания набора: новый kit идёт в конец списка проекта.
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

    INSERT INTO folder_slots (folder_id, project_id, workspace_id, name, description, sort_order)
    SELECT v_new_folder_id, p_project_id, p_workspace_id, s.name, s.description, s.sort_order
    FROM document_kit_template_folder_slots s
    WHERE s.kit_folder_id = r_folder.id;
  END LOOP;

  RETURN v_kit_id;
END;
$$;
