-- Служебные варианты add_document_version и fill_slot_atomic для вызова из
-- edge-функций через service-role.
--
-- Оригинальные RPC проверяют auth.uid() — при вызове из бота он NULL,
-- проверка падает. Эти варианты доверяют вызывающему (бот проверяет
-- принадлежность группы проекту самостоятельно по project_telegram_chats).

CREATE OR REPLACE FUNCTION public.add_document_version_service(
  p_document_id uuid,
  p_file_path text,
  p_file_name text,
  p_file_size bigint,
  p_mime_type text,
  p_checksum text DEFAULT NULL,
  p_file_id uuid DEFAULT NULL,
  p_uploaded_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.fill_slot_atomic_service(
  p_slot_id uuid,
  p_document_id uuid,
  p_project_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;
