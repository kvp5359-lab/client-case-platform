-- =====================================================================
-- Final cleanup of `multiple_permissive_policies` SELECT-hits on tables
-- where two policies have the same role and overlapping intent.
-- All are own-resource policy + workspace-manager-view policy → can be
-- collapsed into one OR'd policy.
--
-- Additionally: drop the overly permissive `Authenticated users can read
-- allowed_users` on docbuilder_allowed_users — it had USING(true) which
-- exposed all allowed emails to any authenticated user. The narrower
-- `allowed_users_select` (docbuilder admin OR own email) stays.
--
-- + add COMMENT ON TABLE for 3 service tables with RLS-enabled-no-policy
-- (advisor `rls_enabled_no_policy` INFO) so it's clear they're
-- service-role only by design.
-- =====================================================================

-- telegram_business_connections
DROP POLICY IF EXISTS "Users see own business connections" ON public.telegram_business_connections;
DROP POLICY IF EXISTS "Workspace managers see all business connections" ON public.telegram_business_connections;
CREATE POLICY "telegram_business_connections_select" ON public.telegram_business_connections
  FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM participants p
      JOIN workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY (p.workspace_roles)
      WHERE p.user_id = (SELECT auth.uid())
        AND p.workspace_id = telegram_business_connections.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions ->> 'manage_workspace_settings')::boolean = true
    )
  );

-- telegram_mtproto_sessions
DROP POLICY IF EXISTS "Users see own mtproto session" ON public.telegram_mtproto_sessions;
DROP POLICY IF EXISTS "Workspace managers see all mtproto sessions" ON public.telegram_mtproto_sessions;
CREATE POLICY "telegram_mtproto_sessions_select" ON public.telegram_mtproto_sessions
  FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM participants p
      JOIN workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY (p.workspace_roles)
      WHERE p.user_id = (SELECT auth.uid())
        AND p.workspace_id = telegram_mtproto_sessions.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions ->> 'manage_workspace_settings')::boolean = true
    )
  );

-- user_telegram_links (workspace-manager check is via participants join,
-- not direct workspace_id on the table)
DROP POLICY IF EXISTS "Users see own tg link" ON public.user_telegram_links;
DROP POLICY IF EXISTS "Workspace managers see participants tg links" ON public.user_telegram_links;
CREATE POLICY "user_telegram_links_select" ON public.user_telegram_links
  FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM participants p
      JOIN workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY (p.workspace_roles)
      JOIN participants p_target
        ON p_target.workspace_id = p.workspace_id
       AND p_target.user_id = user_telegram_links.user_id
      WHERE p.user_id = (SELECT auth.uid())
        AND p.is_deleted = false
        AND p_target.is_deleted = false
        AND (wr.permissions ->> 'manage_workspace_settings')::boolean = true
    )
  );

-- wazzup_channels
DROP POLICY IF EXISTS "Users see own wazzup channels" ON public.wazzup_channels;
DROP POLICY IF EXISTS "Workspace managers see all wazzup channels" ON public.wazzup_channels;
CREATE POLICY "wazzup_channels_select" ON public.wazzup_channels
  FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM participants p
      JOIN workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY (p.workspace_roles)
      WHERE p.user_id = (SELECT auth.uid())
        AND p.workspace_id = wazzup_channels.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions ->> 'manage_workspace_settings')::boolean = true
    )
  );

-- impersonation_sessions (owner OR active target)
DROP POLICY IF EXISTS "owner reads own sessions" ON public.impersonation_sessions;
DROP POLICY IF EXISTS "target reads own active session" ON public.impersonation_sessions;
CREATE POLICY "impersonation_sessions_select" ON public.impersonation_sessions
  FOR SELECT
  USING (
    owner_user_id = (SELECT auth.uid())
    OR (target_user_id = (SELECT auth.uid()) AND ended_at IS NULL)
  );

-- docbuilder_allowed_users — drop the overly broad USING(true) policy.
-- The narrower allowed_users_select (admin OR own email) stays.
DROP POLICY IF EXISTS "Authenticated users can read allowed_users" ON public.docbuilder_allowed_users;

-- Document service-role-only tables (advisor `rls_enabled_no_policy`).
COMMENT ON TABLE public.external_outgoing_dedup IS
  'Service-role only. RLS enabled, no policies — clients have no access. Used by Edge Functions to dedupe outgoing messages across channels.';
COMMENT ON TABLE public.telegram_bot_sessions IS
  'Service-role only. RLS enabled, no policies — clients have no access. Used by telegram-* webhooks to track bot sessions.';
COMMENT ON TABLE public.telegram_mtproto_auth_states IS
  'Service-role only. RLS enabled, no policies — clients have no access. Used by telegram-mtproto-auth Edge Function for short-lived phone/code/2FA flow state.';
