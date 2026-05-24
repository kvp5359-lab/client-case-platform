-- Добавляем header_color в form_template_sections и form_kit_sections.
-- NULL = дефолтный (светло-серый) фон заголовка.

ALTER TABLE public.form_template_sections
  ADD COLUMN IF NOT EXISTS header_color text;

ALTER TABLE public.form_kit_sections
  ADD COLUMN IF NOT EXISTS header_color text;

-- Обновляем create_form_kit_from_template — копируем header_color из шаблона.
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
$function$;

-- Обновляем sync_form_kit_structure — копируем header_color при ре-синхронизации.
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
    is_required, sort_order
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
$function$;
