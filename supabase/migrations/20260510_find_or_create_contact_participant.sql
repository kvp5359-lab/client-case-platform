-- RPC для webhook'ов: ищет participant по любому из заданных идентификаторов
-- (email, phone, telegram_user_id), если не находит — создаёт «лёгкого»
-- (can_login=false, роль 'Клиент'). Возвращает participants.id.

CREATE OR REPLACE FUNCTION public.find_or_create_contact_participant(
  p_workspace_id uuid,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_telegram_user_id bigint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_email text;
  v_phone_norm text;
BEGIN
  v_phone_norm := CASE WHEN p_phone IS NOT NULL THEN regexp_replace(p_phone, '\D', '', 'g') ELSE NULL END;

  IF p_telegram_user_id IS NOT NULL THEN
    SELECT id INTO v_id FROM participants
    WHERE workspace_id = p_workspace_id AND telegram_user_id = p_telegram_user_id AND is_deleted = false
    LIMIT 1;
  END IF;

  IF v_id IS NULL AND p_email IS NOT NULL THEN
    SELECT id INTO v_id FROM participants
    WHERE workspace_id = p_workspace_id AND lower(email) = lower(p_email) AND is_deleted = false
    LIMIT 1;
  END IF;

  IF v_id IS NULL AND v_phone_norm IS NOT NULL AND v_phone_norm != '' THEN
    SELECT id INTO v_id FROM participants
    WHERE workspace_id = p_workspace_id
      AND phone IS NOT NULL
      AND regexp_replace(phone, '\D', '', 'g') = v_phone_norm
      AND is_deleted = false
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    v_email := COALESCE(
      p_email,
      CASE WHEN p_telegram_user_id IS NOT NULL THEN 'tg-' || p_telegram_user_id || '@no-email.local' END,
      CASE WHEN v_phone_norm IS NOT NULL AND v_phone_norm != '' THEN 'phone-' || v_phone_norm || '@no-email.local' END
    );
    IF v_email IS NULL THEN RETURN NULL; END IF;

    INSERT INTO participants (
      workspace_id, name, email, phone, telegram_user_id, can_login, workspace_roles
    ) VALUES (
      p_workspace_id,
      COALESCE(NULLIF(trim(p_name), ''), 'Контакт'),
      v_email, p_phone, p_telegram_user_id, false, ARRAY['Клиент']
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  UPDATE participants
  SET
    telegram_user_id = COALESCE(telegram_user_id, p_telegram_user_id),
    phone = COALESCE(phone, p_phone),
    updated_at = now()
  WHERE id = v_id
    AND (
      (telegram_user_id IS NULL AND p_telegram_user_id IS NOT NULL)
      OR (phone IS NULL AND p_phone IS NOT NULL)
    );

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.find_or_create_contact_participant(uuid, text, text, text, bigint) TO authenticated, service_role;
