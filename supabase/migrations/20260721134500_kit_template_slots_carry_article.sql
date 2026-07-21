-- Стык «шаблон папки → шаблон набора» терял статью и связь со справочником.
--
-- Кнопка «Из шаблона» (RPC add_folders_to_kit_template) при копировании слотов
-- folder_template_slots → document_kit_template_folder_slots переносила только
-- name и sort_order, выбрасывая knowledge_article_id, slot_template_id,
-- description и AI-промпты. Из-за этого статья, заданная в шаблоне слота/папки,
-- не доходила до шаблона набора и, как следствие, до проекта.

-- 1. Чиним RPC: переносим все содержательные поля слота.
CREATE OR REPLACE FUNCTION public.add_folders_to_kit_template(
  p_kit_template_id uuid,
  p_folder_template_ids uuid[],
  p_start_order_index integer DEFAULT 0
)
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
    -- (со статьёй, связью со справочником, описанием и AI-промптами).
    IF v_new_folder_id IS NOT NULL THEN
      INSERT INTO document_kit_template_folder_slots (
        kit_folder_id, name, sort_order, description,
        knowledge_article_id, ai_naming_prompt, ai_check_prompt, slot_template_id
      )
      SELECT
        v_new_folder_id, fts.name, fts.sort_order, fts.description,
        fts.knowledge_article_id, fts.ai_naming_prompt, fts.ai_check_prompt, fts.slot_template_id
      FROM folder_template_slots fts
      WHERE fts.folder_template_id = v_ft_id;
    END IF;

    RETURN NEXT v_new_folder_id;
    v_idx := v_idx + 1;
  END LOOP;
END;
$function$;

-- 2. Бэкафилл существующих шаблонов наборов: дозаполняем ПУСТЫЕ поля слотов
--    из соответствующих слотов шаблона папки (по folder_template + имени слота).
--    COALESCE не перетирает уже заданные вручную значения.
WITH src AS (
  SELECT
    kts.id AS slot_id,
    fts.description          AS description,
    fts.knowledge_article_id AS knowledge_article_id,
    fts.ai_naming_prompt     AS ai_naming_prompt,
    fts.ai_check_prompt      AS ai_check_prompt,
    fts.slot_template_id     AS slot_template_id,
    ROW_NUMBER() OVER (
      PARTITION BY kts.id
      ORDER BY (fts.sort_order = kts.sort_order) DESC, fts.sort_order
    ) AS rn
  FROM document_kit_template_folder_slots kts
  JOIN document_kit_template_folders ktf
    ON ktf.id = kts.kit_folder_id
   AND ktf.folder_template_id IS NOT NULL
  JOIN folder_template_slots fts
    ON fts.folder_template_id = ktf.folder_template_id
   AND btrim(fts.name) = btrim(kts.name)
  WHERE kts.knowledge_article_id IS NULL
     OR kts.slot_template_id IS NULL
     OR kts.description IS NULL
     OR kts.ai_naming_prompt IS NULL
     OR kts.ai_check_prompt IS NULL
)
UPDATE document_kit_template_folder_slots kts
SET
  knowledge_article_id = COALESCE(kts.knowledge_article_id, src.knowledge_article_id),
  slot_template_id     = COALESCE(kts.slot_template_id,     src.slot_template_id),
  description          = COALESCE(kts.description,          src.description),
  ai_naming_prompt     = COALESCE(kts.ai_naming_prompt,     src.ai_naming_prompt),
  ai_check_prompt      = COALESCE(kts.ai_check_prompt,      src.ai_check_prompt)
FROM src
WHERE src.slot_id = kts.id
  AND src.rn = 1;
