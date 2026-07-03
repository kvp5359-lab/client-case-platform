-- Аудит 2026-07-03, Фаза 2 #5 — индексы на 16 внешних ключей без покрытия.
-- Ускоряет JOIN и каскадные проверки; особенно горячие
-- project_messages.sender_participant_id и thread_unread_state.thread_id.
--
-- В прод применены через CREATE INDEX CONCURRENTLY (без блокировки записи на
-- живой БД). Здесь — обычный CREATE INDEX IF NOT EXISTS: на чистой БД без
-- трафика блокировка неважна, а CONCURRENTLY нельзя внутри транзакции миграции.

CREATE INDEX IF NOT EXISTS idx_project_messages_sender_participant_id ON public.project_messages(sender_participant_id);
CREATE INDEX IF NOT EXISTS idx_thread_unread_state_thread_id ON public.thread_unread_state(thread_id);
CREATE INDEX IF NOT EXISTS idx_interface_presets_created_by ON public.interface_presets(created_by);
CREATE INDEX IF NOT EXISTS idx_interface_presets_owner_user_id ON public.interface_presets(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_notification_mute_workspace_id ON public.notification_mute(workspace_id);
CREATE INDEX IF NOT EXISTS idx_perf_traces_user_id ON public.perf_traces(user_id);
CREATE INDEX IF NOT EXISTS idx_project_context_item_members_participant_id ON public.project_context_item_members(participant_id);
CREATE INDEX IF NOT EXISTS idx_pttt_on_complete_status ON public.project_template_thread_templates(on_complete_set_project_status_id);
CREATE INDEX IF NOT EXISTS idx_pttt_default_status ON public.project_template_thread_templates(default_status_id);
CREATE INDEX IF NOT EXISTS idx_project_threads_on_complete_status ON public.project_threads(on_complete_set_project_status_id);
CREATE INDEX IF NOT EXISTS idx_project_threads_recurring_rule_id ON public.project_threads(recurring_rule_id);
CREATE INDEX IF NOT EXISTS idx_recurring_task_rules_project_id ON public.recurring_task_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_thread_templates_default_project_id ON public.thread_templates(default_project_id);
CREATE INDEX IF NOT EXISTS idx_user_active_preset_preset_id ON public.user_active_preset(preset_id);
CREATE INDEX IF NOT EXISTS idx_user_active_preset_workspace_id ON public.user_active_preset(workspace_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_workspace_id ON public.user_favorites(workspace_id);
