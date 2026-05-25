-- convert_external_event_to_task: добавляем создателя как исполнителя задачи.
--
-- Раньше задача создавалась без assignees — пользователь жаловался, что,
-- сконвертив своё событие в задачу, он сам в неё не назначен. Логика: тот,
-- кто конвертит, скорее всего этой задачей и будет заниматься (это ЕГО
-- встреча в его календаре). Если нужен другой исполнитель — поменяет через
-- TaskPanel.
--
-- Резолв participant_id: workspace-level participant текущего auth.uid()
-- в `participants`. Если participant'а нет (юзер только что добавлен,
-- внешний integration etc.) — INSERT просто пропускается.

CREATE OR REPLACE FUNCTION public.convert_external_event_to_task(
  p_workspace_id uuid,
  p_project_id uuid,
  p_name text,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_calendar_id uuid,
  p_google_event_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_thread_id uuid;
  v_user_id uuid := auth.uid();
  v_participant_id uuid;
  v_sort_order int := 10;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM set_config('clientcase.skip_mirror', 'on', true);

  IF p_project_id IS NOT NULL THEN
    SELECT COALESCE(MAX(sort_order), 0) + 10 INTO v_sort_order
    FROM project_threads
    WHERE project_id = p_project_id AND is_deleted = false;
  END IF;

  INSERT INTO project_threads (
    project_id, workspace_id, name, type, access_type,
    sort_order, start_at, end_at
  )
  VALUES (
    p_project_id, p_workspace_id, p_name, 'task', 'all',
    v_sort_order, p_start_at, p_end_at
  )
  RETURNING id INTO v_thread_id;

  INSERT INTO task_google_event_map (thread_id, user_id, calendar_id, google_event_id)
  VALUES (v_thread_id, v_user_id, p_calendar_id, p_google_event_id);

  -- Назначаем создателя задачи как исполнителя по умолчанию.
  -- Резолвим workspace participant. Если его нет — пропускаем без ошибки,
  -- задача всё равно создастся (пустые assignees — допустимое состояние).
  SELECT id INTO v_participant_id
  FROM participants
  WHERE user_id = v_user_id
    AND workspace_id = p_workspace_id
    AND is_deleted = false
  LIMIT 1;

  IF v_participant_id IS NOT NULL THEN
    INSERT INTO task_assignees (thread_id, participant_id)
    VALUES (v_thread_id, v_participant_id)
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM set_config('clientcase.skip_mirror', 'off', true);

  PERFORM net.http_post(
    url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/google-calendar-mirror-task',
    body := jsonb_build_object('thread_id', v_thread_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', 'ad0fe058034556f88382e73fa68ead65390bd22bfc7b4d1c58a68e662d44e81c'
    ),
    timeout_milliseconds := 30000
  );

  RETURN v_thread_id;
END;
$function$;
