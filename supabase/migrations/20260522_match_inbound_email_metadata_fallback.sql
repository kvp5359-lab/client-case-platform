-- Расширяем match_inbound_email: fallback'ом ищем Message-ID не только в
-- основном поле email_message_id, но и в email_metadata->>'message_id_header'.
--
-- Контекст: новые исходящие email (через email-internal-send) пишут
-- Message-ID в оба места — основное поле и metadata. Но старые сообщения
-- (отправленные до перехода на унифицированный email-flow через old
-- gmail-send) хранят его только в email_metadata.message_id_header.
-- Без fallback'а матчинг по In-Reply-To/References для старых тредов не
-- срабатывал, и ответы клиентов создавались отдельными orphan-тредами.

CREATE OR REPLACE FUNCTION public.match_inbound_email(
  p_workspace_id uuid,
  p_from_address text,
  p_in_reply_to text,
  p_references text[]
)
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
    -- Сначала быстрый поиск по основному полю.
    SELECT pm.thread_id, pm.project_id INTO v_thread_id, v_project_id
    FROM project_messages pm
    WHERE pm.workspace_id = p_workspace_id AND pm.email_message_id = p_in_reply_to
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_thread_id, v_project_id, 'in_reply_to'::text;
      RETURN;
    END IF;
    -- Fallback на старые сообщения, где Message-ID лежит только в metadata.
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
    -- Fallback на metadata.
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
$function$;
