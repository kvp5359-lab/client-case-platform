-- Performance: заменяем auth.uid() на (SELECT auth.uid()) в RLS-политиках
-- email_accounts и project_thread_email_links. Семантика идентичная, но Postgres
-- кэширует результат подзапроса на запрос (вместо вызова на каждую строку).
-- Это убирает 252× auth_rls_initplan из Supabase performance advisors.
--
-- Источник: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- + COMMENT для telegram_bot_sessions — RLS включена без политик намеренно
-- (доступ только service-role из edge functions).

-- ─── email_accounts ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own email accounts" ON public.email_accounts;
CREATE POLICY "Users can view own email accounts" ON public.email_accounts
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own email accounts" ON public.email_accounts;
CREATE POLICY "Users can insert own email accounts" ON public.email_accounts
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own email accounts" ON public.email_accounts;
CREATE POLICY "Users can update own email accounts" ON public.email_accounts
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own email accounts" ON public.email_accounts;
CREATE POLICY "Users can delete own email accounts" ON public.email_accounts
  FOR DELETE USING (user_id = (SELECT auth.uid()));

-- ─── project_thread_email_links ──────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view email links" ON public.project_thread_email_links;
CREATE POLICY "Users can view email links" ON public.project_thread_email_links
  FOR SELECT USING (
    thread_id IN (
      SELECT pt.id
      FROM project_threads pt
      JOIN participants part ON part.workspace_id = pt.workspace_id
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )
  );

DROP POLICY IF EXISTS "Users can insert email links" ON public.project_thread_email_links;
CREATE POLICY "Users can insert email links" ON public.project_thread_email_links
  FOR INSERT WITH CHECK (
    thread_id IN (
      SELECT pt.id
      FROM project_threads pt
      JOIN participants part ON part.workspace_id = pt.workspace_id
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )
  );

DROP POLICY IF EXISTS "Users can update email links" ON public.project_thread_email_links;
CREATE POLICY "Users can update email links" ON public.project_thread_email_links
  FOR UPDATE USING (
    thread_id IN (
      SELECT pt.id
      FROM project_threads pt
      JOIN participants part ON part.workspace_id = pt.workspace_id
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )
  );

DROP POLICY IF EXISTS "Users can delete email links" ON public.project_thread_email_links;
CREATE POLICY "Users can delete email links" ON public.project_thread_email_links
  FOR DELETE USING (
    thread_id IN (
      SELECT pt.id
      FROM project_threads pt
      JOIN participants part ON part.workspace_id = pt.workspace_id
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )
  );

-- ─── telegram_bot_sessions: документация ─────────────────────────────────────

COMMENT ON TABLE public.telegram_bot_sessions IS
  'Таблица сессий Telegram-бота. RLS включена БЕЗ политик намеренно: доступ только из edge functions через service-role. Не добавлять policies без явной необходимости.';
