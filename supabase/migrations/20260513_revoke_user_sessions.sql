-- RPC для безусловного сброса всех активных сессий юзера.
-- Используется Edge Function set-participant-access при блокировке участника,
-- чтобы существующий refresh-token не позволил юзеру дальше работать.
-- auth.admin.signOut(jwt) требует access-token самого юзера — в нашем сценарии
-- его нет, поэтому удаляем строки напрямую через SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.revoke_all_user_sessions(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = '22023';
  END IF;

  -- refresh_tokens каскадно зависят от sessions (FK), плюс есть отдельные
  -- висячие refresh-токены до миграции на sessions. Удаляем оба источника.
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_all_user_sessions(uuid) FROM PUBLIC;
-- Доступ только service_role: вызывается из Edge Functions, не из фронта.
GRANT EXECUTE ON FUNCTION public.revoke_all_user_sessions(uuid) TO service_role;

COMMENT ON FUNCTION public.revoke_all_user_sessions(uuid) IS
  'Удаляет все auth.sessions и auth.refresh_tokens юзера. Вызывается из Edge Function set-participant-access. Доступно только service_role.';
