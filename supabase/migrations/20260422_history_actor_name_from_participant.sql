-- Актор в истории — берём имя из participants.name (это имя пользователя
-- в сервисе), а не из raw_user_meta_data (там могло осесть имя из Google OAuth,
-- которое уже устарело — например, пользователь переименован в сервисе, но
-- профиль Google Диска показывает старое имя).
--
-- Fallback-цепочка:
--   1. participants.name + participants.last_name — имя, заданное в сервисе.
--   2. raw_user_meta_data->>'full_name' / 'name' — из OAuth-профиля.
--   3. split_part(email, '@', 1) — локальная часть почты.
--
-- Участник ищется в воркспейсе проекта (чтобы не перепутать с однофамильцем
-- в другом воркспейсе), user_id совпадает с audit_logs.user_id.

CREATE OR REPLACE FUNCTION public.get_project_history(
  p_project_id uuid,
  p_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_limit integer DEFAULT 20,
  p_resource_types text[] DEFAULT NULL::text[],
  p_actions text[] DEFAULT NULL::text[],
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid,
  action text,
  resource_type text,
  resource_id uuid,
  details jsonb,
  created_at timestamp with time zone,
  actor_user_id uuid,
  actor_email text,
  actor_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
BEGIN
  -- pr.id квалифицирован, иначе конфликт с колонкой RETURN TABLE id uuid
  SELECT pr.workspace_id INTO v_workspace_id FROM projects pr WHERE pr.id = p_project_id;

  RETURN QUERY
  SELECT
    al.id,
    al.action,
    al.resource_type,
    al.resource_id,
    al.details,
    al.created_at,
    al.user_id AS actor_user_id,
    u.email::TEXT AS actor_email,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', p.name, p.last_name)), ''),
      (u.raw_user_meta_data->>'full_name'),
      (u.raw_user_meta_data->>'name'),
      split_part(u.email::TEXT, '@', 1)
    ) AS actor_name
  FROM public.audit_logs al
  LEFT JOIN auth.users u ON u.id = al.user_id
  LEFT JOIN public.participants p
    ON p.user_id = al.user_id
   AND p.workspace_id = v_workspace_id
   AND p.is_deleted = false
  WHERE al.project_id = p_project_id
    AND (p_cursor IS NULL OR al.created_at < p_cursor)
    AND (p_resource_types IS NULL OR al.resource_type = ANY(p_resource_types))
    AND (p_actions IS NULL OR al.action = ANY(p_actions))
    AND (p_user_id IS NULL OR al.user_id = p_user_id)
  ORDER BY al.created_at DESC
  LIMIT p_limit;
END;
$function$;
