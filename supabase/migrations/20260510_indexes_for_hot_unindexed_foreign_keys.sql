-- Index hot foreign keys flagged by Supabase performance advisor
-- (`unindexed_foreign_keys`). These cover query paths used on every screen:
-- sidebar pinned items, message reply lookups, unread-counter joins,
-- email dispatcher routing, task-panel tabs, status auto-advance triggers.
--
-- Skipped intentionally:
--   - all *_created_by / *_deleted_by / *_user_id columns referencing
--     auth.users — auth.users rows are virtually never deleted, the index
--     cost (INSERT/UPDATE overhead, storage) exceeds the rare lookup gain.

CREATE INDEX IF NOT EXISTS idx_pinned_boards_board_id
  ON public.pinned_boards (board_id);
CREATE INDEX IF NOT EXISTS idx_pinned_boards_workspace_id
  ON public.pinned_boards (workspace_id);
CREATE INDEX IF NOT EXISTS idx_pinned_projects_project_id
  ON public.pinned_projects (project_id);
CREATE INDEX IF NOT EXISTS idx_pinned_projects_workspace_id
  ON public.pinned_projects (workspace_id);

CREATE INDEX IF NOT EXISTS idx_project_messages_reply_to_message_id
  ON public.project_messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_messages_email_send_account_id
  ON public.project_messages (email_send_account_id)
  WHERE email_send_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_message_read_status_thread_id
  ON public.message_read_status (thread_id);
CREATE INDEX IF NOT EXISTS idx_message_read_status_project_id
  ON public.message_read_status (project_id);
CREATE INDEX IF NOT EXISTS idx_history_read_status_project_id
  ON public.history_read_status (project_id);

CREATE INDEX IF NOT EXISTS idx_email_virtual_addresses_target_project_id
  ON public.email_virtual_addresses (target_project_id)
  WHERE target_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_virtual_addresses_target_thread_id
  ON public.email_virtual_addresses (target_thread_id)
  WHERE target_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_virtual_addresses_default_thread_template_id
  ON public.email_virtual_addresses (default_thread_template_id)
  WHERE default_thread_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_accounts_workspace_id
  ON public.email_accounts (workspace_id);
CREATE INDEX IF NOT EXISTS idx_project_telegram_chats_workspace_id
  ON public.project_telegram_chats (workspace_id);

CREATE INDEX IF NOT EXISTS idx_task_panel_tabs_project_id
  ON public.task_panel_tabs (project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_panel_tabs_contact_participant_id
  ON public.task_panel_tabs (contact_participant_id)
  WHERE contact_participant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_threads_source_template_id
  ON public.project_threads (source_template_id)
  WHERE source_template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_thread_templates_default_status_id
  ON public.thread_templates (default_status_id)
  WHERE default_status_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_thread_templates_on_complete_set_project_status_id
  ON public.thread_templates (on_complete_set_project_status_id)
  WHERE on_complete_set_project_status_id IS NOT NULL;
