-- RPC для переноса треда из системного инбокса (Wazzup, TG Business)
-- в обычный рабочий проект — или вообще между любыми проектами одного
-- воркспейса. Меняет project_id у треда и всех его сообщений.

CREATE OR REPLACE FUNCTION public.move_thread_to_project(
  p_thread_id uuid,
  p_target_project_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_workspace_id uuid;
  v_target_workspace_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT workspace_id INTO v_thread_workspace_id
  FROM project_threads WHERE id = p_thread_id AND is_deleted = false;
  IF v_thread_workspace_id IS NULL THEN
    RAISE EXCEPTION 'thread not found';
  END IF;

  SELECT workspace_id INTO v_target_workspace_id
  FROM projects WHERE id = p_target_project_id AND is_deleted = false;
  IF v_target_workspace_id IS NULL THEN
    RAISE EXCEPTION 'target project not found';
  END IF;

  IF v_thread_workspace_id <> v_target_workspace_id THEN
    RAISE EXCEPTION 'cross-workspace move not allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM participants p
    WHERE p.user_id = v_user_id
      AND p.workspace_id = v_thread_workspace_id
      AND p.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'not a workspace member';
  END IF;

  UPDATE project_threads
     SET project_id = p_target_project_id, updated_at = now()
   WHERE id = p_thread_id;

  UPDATE project_messages
     SET project_id = p_target_project_id
   WHERE thread_id = p_thread_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_thread_to_project(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.move_thread_to_project IS
  'Переносит тред (и все его сообщения) из одного проекта воркспейса в другой. Использовать для извлечения тредов из системных инбоксов (Wazzup, Telegram Business) в обычные рабочие проекты.';
