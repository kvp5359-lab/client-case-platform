-- Синхронизация слотов набора с шаблоном набора документов.
--
-- Проблема: у слота проекта (folder_slots) не было стабильной ссылки на слот
-- шаблона набора (document_kit_template_folder_slots). Из-за этого «Обновить
-- состав набора» умело обновлять только папки, но не слоты существующих папок —
-- переименование слота в шаблоне и добавление статьи не долетали до проекта.
--
-- Решение: колонка-якорь kit_template_folder_slot_id + бэкафилл существующих
-- связей по имени + заполнение якоря при создании слотов из шаблона.

-- 1. Колонка-якорь: ссылка на слот шаблона набора.
--    ON DELETE SET NULL — если слот удалили из шаблона, проектный слот остаётся
--    (становится «ручным»), синхронизация его больше не трогает.
ALTER TABLE public.folder_slots
  ADD COLUMN IF NOT EXISTS kit_template_folder_slot_id uuid
    REFERENCES public.document_kit_template_folder_slots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_folder_slots_kit_template_folder_slot_id
  ON public.folder_slots (kit_template_folder_slot_id)
  WHERE kit_template_folder_slot_id IS NOT NULL;

-- 2. Бэкафилл существующих связей.
--    Привязываем слот проекта к слоту шаблона той же папки по совпадению имени
--    (пока не переименовали — имена совпадают). При неоднозначности предпочитаем
--    слот с тем же sort_order, затем наименьший sort_order. Слоты, созданные
--    вручную (нет совпадения по имени), остаются без якоря → синхронизация их
--    не трогает.
WITH candidates AS (
  SELECT
    fs.id  AS slot_id,
    kts.id AS kit_slot_id,
    ROW_NUMBER() OVER (
      PARTITION BY fs.id
      ORDER BY (kts.sort_order = fs.sort_order) DESC, kts.sort_order
    ) AS rn
  FROM public.folder_slots fs
  JOIN public.folders f
    ON f.id = fs.folder_id
   AND f.kit_template_folder_id IS NOT NULL
  JOIN public.document_kit_template_folder_slots kts
    ON kts.kit_folder_id = f.kit_template_folder_id
   AND btrim(kts.name) = btrim(fs.name)
  WHERE fs.kit_template_folder_slot_id IS NULL
)
UPDATE public.folder_slots fs
SET kit_template_folder_slot_id = c.kit_slot_id
FROM candidates c
WHERE fs.id = c.slot_id
  AND c.rn = 1;

-- 3. Заполнять якорь (и slot_template_id для fallback «?») при создании набора из
--    шаблона через основную RPC.
CREATE OR REPLACE FUNCTION public.create_document_kit_from_template(
  p_template_id uuid,
  p_project_id uuid,
  p_workspace_id uuid
)
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
      knowledge_article_id, ai_naming_prompt, ai_check_prompt, sort_order,
      slot_template_id, kit_template_folder_slot_id
    )
    SELECT
      v_new_folder_id, p_project_id, p_workspace_id, s.name, s.description,
      s.knowledge_article_id, s.ai_naming_prompt, s.ai_check_prompt, s.sort_order,
      s.slot_template_id, s.id
    FROM document_kit_template_folder_slots s
    WHERE s.kit_folder_id = r_folder.id;
  END LOOP;

  RETURN v_kit_id;
END;
$function$;
