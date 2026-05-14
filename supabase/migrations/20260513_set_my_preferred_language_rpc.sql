-- RPC чтобы юзер мог обновить preferred_language во всех своих participants
-- разом (один язык на все воркспейсы пользователя). UI один глобальный,
-- а хранение остаётся per-workspace на случай будущей дифференциации.
CREATE OR REPLACE FUNCTION public.set_my_preferred_language(p_language text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_language IS NULL OR length(p_language) < 2 OR length(p_language) > 10 THEN
    RAISE EXCEPTION 'Invalid language code';
  END IF;
  UPDATE public.participants
     SET preferred_language = p_language,
         updated_at = now()
   WHERE user_id = auth.uid()
     AND is_deleted = false;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_preferred_language(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_preferred_language(text) TO authenticated;
