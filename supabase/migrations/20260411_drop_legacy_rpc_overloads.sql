-- 2026-04-11: Drop 5 legacy RPC overloads that were kept alongside new ones.
--
-- Each of these functions had two parallel versions in the DB: the original
-- (missing a parameter) and the newer one with the extra parameter. Postgres
-- resolves the overload by argument list, so as long as the client sends the
-- full set the new function wins. But the old versions sat there as loaded
-- guns — any manual SQL call or migration script that forgot a parameter
-- would hit the legacy code path.
--
-- Verified all src/ callers use the new signatures:
--   - add_document_version: src/hooks/useDocumentUpload.ts passes p_file_id
--   - create_status_with_button_label: src/components/directories/hooks/
--     useStatusesDirectory.ts passes p_text_color
--   - update_status_with_button_label: same file passes status_text_color
--   - log_audit_action: src/services/auditService.ts passes p_project_id,
--     p_user_id
--   - fn_write_audit_log: no TS callers (trigger-internal helper only)

DROP FUNCTION IF EXISTS public.add_document_version(
  p_document_id uuid,
  p_file_path text,
  p_file_name text,
  p_file_size bigint,
  p_mime_type text,
  p_checksum text
);

DROP FUNCTION IF EXISTS public.create_status_with_button_label(
  p_workspace_id uuid,
  p_name text,
  p_description text,
  p_button_label text,
  p_entity_type text,
  p_color text,
  p_order_index integer,
  p_is_default boolean,
  p_is_final boolean
);

DROP FUNCTION IF EXISTS public.update_status_with_button_label(
  status_id uuid,
  status_name text,
  status_description text,
  status_button_label text,
  status_color text,
  status_order_index integer,
  status_is_default boolean,
  status_is_final boolean
);

DROP FUNCTION IF EXISTS public.log_audit_action(
  p_action text,
  p_resource_type text,
  p_resource_id uuid,
  p_details jsonb,
  p_ip_address inet,
  p_workspace_id uuid
);

DROP FUNCTION IF EXISTS public.fn_write_audit_log(
  p_action text,
  p_resource_type text,
  p_resource_id uuid,
  p_details jsonb,
  p_workspace_id uuid
);
