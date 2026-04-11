-- 2026-04-11: Drop project_template_tasks — dead table after merge 8c977ae.
--
-- After the task/chat modules merge (commit 8c977ae) and the thread_templates
-- project-scope migration (20260411_thread_template_project_scope.sql), all
-- template-level "task checklists" moved to thread_templates with
-- thread_type='task' and owner_project_template_id linking to the project
-- template. The original project_template_tasks table was left behind with 14
-- orphaned rows.
--
-- Verified before dropping: all 14 rows already have matching records in
-- thread_templates (same name, same project_template_id owner, thread_type='task').
-- No data loss.
--
-- Code references to the table (useLinkedTemplateTasks hook, addTask/updateTask/
-- removeTask mutations, projectTemplateKeys.tasks factory) were removed in the
-- same commit that applies this migration.

DROP TABLE IF EXISTS public.project_template_tasks CASCADE;
