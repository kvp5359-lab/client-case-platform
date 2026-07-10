-- Advisor hygiene (Supabase performance advisors), applied to prod + here for parity.
--
-- 1. perf_traces RLS initplan: auth.uid() was re-evaluated per row. Wrap in
--    (select auth.uid()) so the planner evaluates it once (InitPlan). Only the
--    diagnostic perf_traces table showed this; the rest of the app already uses
--    the (select auth.uid()) pattern.
ALTER POLICY perf_traces_select_own ON public.perf_traces USING ((user_id = (select auth.uid())));
ALTER POLICY perf_traces_insert ON public.perf_traces WITH CHECK ((user_id = (select auth.uid())));

-- 2. Covering indexes for foreign keys that had none (advisor: unindexed_foreign_keys).
--    All on low-traffic config/template/report tables — additive, safe.
create index if not exists idx_article_share_links_created_by on public.article_share_links (created_by);
create index if not exists idx_article_share_links_workspace_id on public.article_share_links (workspace_id);
create index if not exists idx_document_sources_connected_by_user_id on public.document_sources (connected_by_user_id);
create index if not exists idx_document_sources_workspace_id on public.document_sources (workspace_id);
create index if not exists idx_knowledge_article_views_created_by on public.knowledge_article_views (created_by);
create index if not exists idx_project_task_groups_workspace_id on public.project_task_groups (workspace_id);
create index if not exists idx_project_template_plan_blocks_group_id on public.project_template_plan_blocks (group_id);
create index if not exists idx_project_template_task_groups_workspace_id on public.project_template_task_groups (workspace_id);
create index if not exists idx_project_template_thread_assignees_participant_id on public.project_template_thread_assignees (participant_id);
create index if not exists idx_report_definitions_created_by on public.report_definitions (created_by);
create index if not exists idx_report_definitions_deleted_by on public.report_definitions (deleted_by);
create index if not exists idx_report_definitions_owner_user_id on public.report_definitions (owner_user_id);
create index if not exists idx_source_update_reads_project_id on public.source_update_reads (project_id);
create index if not exists idx_thread_templates_task_group_id on public.thread_templates (task_group_id);
create index if not exists idx_workspace_billing_plan_id on public.workspace_billing (plan_id);
