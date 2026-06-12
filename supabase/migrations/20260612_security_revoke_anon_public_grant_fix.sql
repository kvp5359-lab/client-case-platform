-- Фикс к 20260612_security_revoke_anon_and_api_key_gates:
-- REVOKE FROM anon не работает, пока EXECUTE выдан через PUBLIC (anon наследует).
-- Для блока 2/3 снимаем PUBLIC-грант и возвращаем явно authenticated + service_role.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname = ANY(ARRAY[
      'set_workspace_api_key', 'delete_workspace_api_key',
      'set_workspace_google_api_key', 'delete_workspace_google_api_key',
      'set_workspace_voyageai_api_key', 'delete_workspace_voyageai_api_key',
      'get_chat_state', 'get_current_document_file', 'get_document_file_history',
      'add_document_version', 'restore_document_version', 'reorder_documents',
      'add_message_pair', 'toggle_message_reaction',
      'update_task_assignees', 'create_task_with_assignees',
      'delete_status', 'convert_external_event_to_task',
      'match_knowledge_chunks', 'match_knowledge_chunks_by_articles', 'match_knowledge_chunks_by_sources',
      'upsert_knowledge_embeddings',
      'get_accessible_projects', 'get_user_projects', 'get_workspace_threads',
      'get_inbox_threads_v2', 'get_inbox_threads_page', 'get_inbox_thread_aggregates',
      'get_inbox_unread_threads', 'get_inbox_thread_one', 'get_inbox_search_threads',
      'get_inbox_message_status',
      'get_total_unread_count', 'get_sidebar_data', 'get_project_history',
      'get_short_id_by_uuid', 'resolve_short_id',
      'get_personal_dialogs', 'merge_participants', 'merge_telegram_contact',
      'fill_folder_slot', 'fill_slot_atomic', 'move_thread_to_project',
      'set_my_preferred_language', 'end_impersonation_session'
    ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;
