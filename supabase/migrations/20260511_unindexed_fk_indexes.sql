-- Добавление индексов на все неиндексированные foreign keys.
-- Supabase performance advisor отчёт от 2026-05-11: 70 FK без индексов.
--
-- Почему: без индекса на FK-колонке Postgres делает Seq Scan при каскадных
-- DELETE/UPDATE и при JOIN по этой колонке. На больших таблицах это медленно.
-- Если индекс окажется бесполезным (его не используют запросы) — он попадёт
-- в unused_indexes отчёт через 1-2 месяца и можно будет удалить.
--
-- IF NOT EXISTS — чтобы миграция была идемпотентной.

CREATE INDEX IF NOT EXISTS idx_board_members_participant_id ON public.board_members (participant_id);
CREATE INDEX IF NOT EXISTS idx_boards_created_by ON public.boards (created_by);
CREATE INDEX IF NOT EXISTS idx_comments_created_by ON public.comments (created_by);
CREATE INDEX IF NOT EXISTS idx_comments_resolved_by ON public.comments (resolved_by);
CREATE INDEX IF NOT EXISTS idx_comments_workspace_id ON public.comments (workspace_id);
CREATE INDEX IF NOT EXISTS idx_custom_directories_created_by ON public.custom_directories (created_by);
CREATE INDEX IF NOT EXISTS idx_custom_directory_entries_created_by ON public.custom_directory_entries (created_by);
CREATE INDEX IF NOT EXISTS idx_docbuilder_blocks_section_id ON public.docbuilder_blocks (section_id);
CREATE INDEX IF NOT EXISTS idx_docbuilder_project_documents_project_id ON public.docbuilder_project_documents (project_id);
CREATE INDEX IF NOT EXISTS idx_docbuilder_projects_style_id ON public.docbuilder_projects (style_id);
CREATE INDEX IF NOT EXISTS idx_docbuilder_projects_user_id ON public.docbuilder_projects (user_id);
CREATE INDEX IF NOT EXISTS idx_docbuilder_templates_user_id ON public.docbuilder_templates (user_id);
CREATE INDEX IF NOT EXISTS idx_document_generations_created_by ON public.document_generations (created_by);
CREATE INDEX IF NOT EXISTS idx_document_generations_document_template_id ON public.document_generations (document_template_id);
CREATE INDEX IF NOT EXISTS idx_document_generations_workspace_id ON public.document_generations (workspace_id);
CREATE INDEX IF NOT EXISTS idx_document_kit_template_folder_slots_knowledge_article_id ON public.document_kit_template_folder_slots (knowledge_article_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_created_by ON public.document_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_email_inbound_unmatched_resolved_by ON public.email_inbound_unmatched (resolved_by);
CREATE INDEX IF NOT EXISTS idx_email_inbound_unmatched_resolved_thread_id ON public.email_inbound_unmatched (resolved_thread_id);
CREATE INDEX IF NOT EXISTS idx_email_virtual_addresses_created_by ON public.email_virtual_addresses (created_by);
CREATE INDEX IF NOT EXISTS idx_email_virtual_addresses_default_assignee_user_id ON public.email_virtual_addresses (default_assignee_user_id);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON public.files (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_finance_services_deleted_by ON public.finance_services (deleted_by);
CREATE INDEX IF NOT EXISTS idx_finance_tax_rates_deleted_by ON public.finance_tax_rates (deleted_by);
CREATE INDEX IF NOT EXISTS idx_finance_transaction_categories_deleted_by ON public.finance_transaction_categories (deleted_by);
CREATE INDEX IF NOT EXISTS idx_folder_slots_folder_template_slot_id ON public.folder_slots (folder_template_slot_id);
CREATE INDEX IF NOT EXISTS idx_folder_slots_knowledge_article_id ON public.folder_slots (knowledge_article_id);
CREATE INDEX IF NOT EXISTS idx_folder_template_slots_knowledge_article_id ON public.folder_template_slots (knowledge_article_id);
CREATE INDEX IF NOT EXISTS idx_form_kit_field_values_composite_field_id ON public.form_kit_field_values (composite_field_id);
CREATE INDEX IF NOT EXISTS idx_form_kits_template_id ON public.form_kits (template_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_workspace_id ON public.impersonation_sessions (workspace_id);
CREATE INDEX IF NOT EXISTS idx_item_lists_created_by ON public.item_lists (created_by);
CREATE INDEX IF NOT EXISTS idx_item_lists_deleted_by ON public.item_lists (deleted_by);
CREATE INDEX IF NOT EXISTS idx_knowledge_article_tags_tag_id ON public.knowledge_article_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_article_versions_created_by ON public.knowledge_article_versions (created_by);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_created_by ON public.knowledge_articles (created_by);
CREATE INDEX IF NOT EXISTS idx_knowledge_groups_parent_id ON public.knowledge_groups (parent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_qa_created_by ON public.knowledge_qa (created_by);
CREATE INDEX IF NOT EXISTS idx_knowledge_qa_groups_group_id ON public.knowledge_qa_groups (group_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_qa_tags_tag_id ON public.knowledge_qa_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_tags_workspace_id ON public.knowledge_tags (workspace_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_participant_id ON public.message_reactions (participant_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_oauth_states_user_id ON public.oauth_states (user_id);
CREATE INDEX IF NOT EXISTS idx_project_digests_created_by ON public.project_digests (created_by);
CREATE INDEX IF NOT EXISTS idx_project_service_groups_service_id ON public.project_service_groups (service_id);
CREATE INDEX IF NOT EXISTS idx_project_service_items_service_id ON public.project_service_items (service_id);
CREATE INDEX IF NOT EXISTS idx_project_services_deleted_by ON public.project_services (deleted_by);
CREATE INDEX IF NOT EXISTS idx_project_templates_created_by ON public.project_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_project_thread_assignees_assigned_by ON public.project_thread_assignees (assigned_by);
CREATE INDEX IF NOT EXISTS idx_project_thread_assignees_participant_id ON public.project_thread_assignees (participant_id);
CREATE INDEX IF NOT EXISTS idx_project_thread_members_participant_id ON public.project_thread_members (participant_id);
CREATE INDEX IF NOT EXISTS idx_project_threads_created_by ON public.project_threads (created_by);
CREATE INDEX IF NOT EXISTS idx_project_threads_deleted_by ON public.project_threads (deleted_by);
CREATE INDEX IF NOT EXISTS idx_project_threads_email_send_account_id ON public.project_threads (email_send_account_id);
CREATE INDEX IF NOT EXISTS idx_project_transactions_deleted_by ON public.project_transactions (deleted_by);
CREATE INDEX IF NOT EXISTS idx_projects_deleted_by ON public.projects (deleted_by);
CREATE INDEX IF NOT EXISTS idx_quick_reply_templates_project_template_id ON public.quick_reply_templates (project_template_id);
CREATE INDEX IF NOT EXISTS idx_slot_templates_knowledge_article_id ON public.slot_templates (knowledge_article_id);
CREATE INDEX IF NOT EXISTS idx_telegram_business_connections_user_id ON public.telegram_business_connections (user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_business_link_tokens_workspace_id ON public.telegram_business_link_tokens (workspace_id);
CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_created_by ON public.telegram_link_tokens (created_by);
CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_workspace_id ON public.telegram_link_tokens (workspace_id);
CREATE INDEX IF NOT EXISTS idx_telegram_mtproto_auth_states_workspace_id ON public.telegram_mtproto_auth_states (workspace_id);
CREATE INDEX IF NOT EXISTS idx_thread_template_assignees_participant_id ON public.thread_template_assignees (participant_id);
CREATE INDEX IF NOT EXISTS idx_thread_templates_created_by ON public.thread_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_user_settings_last_workspace_id ON public.user_settings (last_workspace_id);
CREATE INDEX IF NOT EXISTS idx_wazzup_channels_user_id ON public.wazzup_channels (user_id);
CREATE INDEX IF NOT EXISTS idx_wazzup_settings_created_by ON public.wazzup_settings (created_by);
CREATE INDEX IF NOT EXISTS idx_workspace_digest_settings_updated_by ON public.workspace_digest_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_workspace_sidebar_settings_updated_by ON public.workspace_sidebar_settings (updated_by);
