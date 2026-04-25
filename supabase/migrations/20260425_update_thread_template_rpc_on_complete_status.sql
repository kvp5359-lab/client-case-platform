-- Обновление RPC update_thread_template_with_assignees: поддержка нового
-- поля thread_templates.on_complete_set_project_status_id (правило
-- автоперехода статуса проекта при завершении задачи).

CREATE OR REPLACE FUNCTION public.update_thread_template_with_assignees(
  p_template_id uuid, p_updates jsonb, p_assignee_ids uuid[]
)
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
$function$;
