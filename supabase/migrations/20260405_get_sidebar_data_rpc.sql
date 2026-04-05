-- get_sidebar_data RPC — агрегирует все данные, нужные сайдбару, в один запрос.
--
-- Заменяет 4 отдельных клиентских запроса:
--   1. project_threads (access info для фильтрации inbox)
--   2. project_participants (мои роли во всех проектах)
--   3. project_thread_members (мои membership в custom тредах)
--   4. task_assignees (мои исполнения задач)
--
-- Вместо 4 HTTP round-trips — один вызов RPC.
-- Результат — JSON, который клиент разбирает в нужные структуры.

CREATE OR REPLACE FUNCTION public.get_sidebar_data(
  p_workspace_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    -- Все треды workspace с данными доступа
    'threads', COALESCE(
      (SELECT json_agg(json_build_object(
        'id', pt.id,
        'project_id', pt.project_id,
        'access_type', pt.access_type,
        'access_roles', pt.access_roles,
        'created_by', pt.created_by
      ))
       FROM project_threads pt
       WHERE pt.workspace_id = p_workspace_id
         AND pt.is_deleted = false),
      '[]'::json
    ),
    -- Мои роли во всех проектах workspace
    'myProjectRoles', COALESCE(
      (SELECT json_agg(json_build_object(
        'project_id', pp.project_id,
        'participant_id', pp.participant_id,
        'project_roles', pp.project_roles
      ))
       FROM project_participants pp
       JOIN participants p ON p.id = pp.participant_id
       WHERE p.user_id = p_user_id
         AND p.workspace_id = p_workspace_id
         AND p.is_deleted = false),
      '[]'::json
    ),
    -- Мои memberships в custom тредах
    'myMemberThreadIds', COALESCE(
      (SELECT json_agg(ptm.thread_id)
       FROM project_thread_members ptm
       JOIN participants p ON p.id = ptm.participant_id
       WHERE p.user_id = p_user_id
         AND p.workspace_id = p_workspace_id
         AND p.is_deleted = false),
      '[]'::json
    ),
    -- Мои assignees в задачах
    'myAssigneeThreadIds', COALESCE(
      (SELECT json_agg(ta.thread_id)
       FROM task_assignees ta
       JOIN participants p ON p.id = ta.participant_id
       WHERE p.user_id = p_user_id
         AND p.workspace_id = p_workspace_id
         AND p.is_deleted = false),
      '[]'::json
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Разрешаем вызывать функцию авторизованным пользователям
GRANT EXECUTE ON FUNCTION public.get_sidebar_data(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.get_sidebar_data IS
  'Агрегирует данные для фильтрации inbox в сайдбаре (треды, роли, memberships, assignees) — один HTTP запрос вместо 4.';
