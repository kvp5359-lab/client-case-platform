-- =====================================================================
-- Security hardening: fix mutable search_path + revoke client access
-- to trigger/internal SECURITY DEFINER functions.
--
-- 1) Pin search_path to (public, pg_temp) on 5 functions flagged by
--    Supabase performance advisor as `function_search_path_mutable`.
--    Without a pinned search_path a logged-in role could shadow schema
--    objects and trick the DEFINER into calling their version.
--
-- 2) REVOKE EXECUTE FROM anon, authenticated on functions that are
--    only meant to fire from triggers or be invoked by the service
--    role / cron. Triggers still run them (they execute with the
--    owner's rights regardless of grants), but clients can no longer
--    bypass our app layer.
--
--    Skipped (intentionally exposed via supabase.rpc on the client):
--      - sync_form_kit_structure  (formKitService.ts:104)
--      - log_audit_action         (auditService.ts:61)
-- =====================================================================

-- 1) search_path
ALTER FUNCTION public.fn_audit_project_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_finance_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_pfv_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.tg_participant_channels_touch_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_workspace_integrations_updated_at() SET search_path = public, pg_temp;

-- 2) REVOKE on trigger functions
REVOKE EXECUTE ON FUNCTION public.add_creator_as_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_advance_project_status() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_default_roles_and_statuses() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_owner_participant() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_user_settings() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_document_delete() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_document_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_document_kit_delete() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_document_kit_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_document_update() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_folder_delete() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_folder_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_form_field_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_participant_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_project_delete() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_project_update() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_task_delete() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_task_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_task_update() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_project_last_activity() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_project_last_activity_from_form_values() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_project_last_activity_self() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_participant_to_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_telegram_on_new_message() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_writes_during_impersonation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_board_short_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_knowledge_article_created_by() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_project_short_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_project_thread_short_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_participant_channels_touch_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_finance_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_pfv_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_workspace_integrations_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_message_on_reaction_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_project_last_activity() FROM anon, authenticated;

-- 3) REVOKE on internal helpers (service-role only)
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_oauth_states() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_short_id(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.append_telegram_message_id(uuid, bigint, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_write_audit_log(text, text, uuid, jsonb, uuid, uuid) FROM anon, authenticated;
