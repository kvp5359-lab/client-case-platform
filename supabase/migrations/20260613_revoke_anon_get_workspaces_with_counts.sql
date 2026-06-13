-- Догон к этапу 1: get_workspaces_with_counts — SECURITY DEFINER без auth.uid()-гейта,
-- anon мог подставить чужой p_user_id и получить список чужих воркспейсов со счётчиками.
-- Зовётся только залогиненным фронтом (WorkspacesPage). Отзываем у anon.
-- Применено в прод через MCP 2026-06-13.
REVOKE EXECUTE ON FUNCTION public.get_workspaces_with_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspaces_with_counts(uuid) TO authenticated, service_role;
