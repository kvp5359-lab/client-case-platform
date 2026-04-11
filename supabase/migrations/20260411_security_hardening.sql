-- Security hardening — fixes from second audit of 2026-04-11
--
-- 1. oauth_states had RLS enabled but no policies. Adds per-user policies
--    so an authenticated user can only see / manage their own rows.
--    Service role bypasses RLS, so server-side OAuth flows keep working.
--
-- 2. retry_undelivered_telegram_messages was the one SECURITY DEFINER
--    function in public without search_path set. Pinning it to `public`
--    closes the classic search-path hijack vector.

-- ── oauth_states policies ────────────────────────────────────────────────

DROP POLICY IF EXISTS "oauth_states_select_own" ON public.oauth_states;
CREATE POLICY "oauth_states_select_own"
  ON public.oauth_states
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "oauth_states_insert_own" ON public.oauth_states;
CREATE POLICY "oauth_states_insert_own"
  ON public.oauth_states
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "oauth_states_delete_own" ON public.oauth_states;
CREATE POLICY "oauth_states_delete_own"
  ON public.oauth_states
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- No UPDATE policy on purpose: state tokens are write-once, then deleted.

-- ── retry_undelivered_telegram_messages: pin search_path ─────────────────

ALTER FUNCTION public.retry_undelivered_telegram_messages()
  SET search_path = public;
