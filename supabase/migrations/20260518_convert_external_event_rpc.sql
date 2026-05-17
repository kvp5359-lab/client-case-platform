-- RPC convert_external_event_to_task — атомарно создаёт задачу из
-- внешнего события Google Calendar.
--
-- Зачем: без RPC возникал race — триггер AFTER INSERT на
-- project_threads срабатывал ДО того, как клиент успевал вставить
-- строку в task_google_event_map. Mirror видел тред без маппинга и
-- создавал дубль в target_calendar. RPC ставит guard
-- `clientcase.skip_mirror='on'`, делает оба INSERT-а, и в конце сам
-- зовёт mirror функцию с уже валидным state'ом.

CREATE OR REPLACE FUNCTION public.convert_external_event_to_task(
  p_workspace_id uuid,
  p_project_id uuid,
  p_name text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_calendar_id uuid,
  p_google_event_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_thread_id uuid;
  v_user_id uuid := auth.uid();
  v_sort_order int := 10;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Заглушаем mirror-триггер на время транзакции.
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

  -- Снимаем guard и зовём mirror, чтобы он увидел уже существующий маппинг.
  PERFORM set_config('clientcase.skip_mirror', 'off', true);

  PERFORM net.http_post(
    url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/google-calendar-mirror-task',
    body := jsonb_build_object('thread_id', v_thread_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', '__INTERNAL_FUNCTION_SECRET__'
    ),
    timeout_milliseconds := 30000
  );

  RETURN v_thread_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_external_event_to_task TO authenticated;
