-- move_thread_to_project: поддержка NULL-таргета (перенос в «Без проекта»).
--
-- Контекст: кнопка выбора проекта в шапке боковой панели применяет перенос
-- сразу (без «Сохранить»). Раньше единственный фронт-путь смены проекта
-- (updateProjectMutation в настройках чата) делал прямой UPDATE только
-- project_threads.project_id — сообщения оставались привязаны к старому проекту
-- (рассинхрон project_messages.project_id). Эта RPC двигает И тред, И сообщения
-- атомарно (SECURITY DEFINER), но раньше требовала НЕ-null target.
--
-- Здесь добавляем ветку NULL: перенос треда обратно в «личные» (project_id=NULL).
-- Не-null поведение не меняется.

CREATE OR REPLACE FUNCTION public.move_thread_to_project(
  p_thread_id uuid,
  p_target_project_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- NULL-таргет = перенос в «Без проекта». Пропускаем проверку проекта;
  -- членство проверяем по воркспейсу самого треда.
  IF p_target_project_id IS NOT NULL THEN
    SELECT workspace_id INTO v_target_workspace_id
    FROM projects WHERE id = p_target_project_id AND is_deleted = false;
    IF v_target_workspace_id IS NULL THEN
      RAISE EXCEPTION 'target project not found';
    END IF;

    IF v_thread_workspace_id <> v_target_workspace_id THEN
      RAISE EXCEPTION 'cross-workspace move not allowed';
    END IF;
  END IF;

  -- Простая проверка: вызывающий участвует в воркспейсе.
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
$function$;
