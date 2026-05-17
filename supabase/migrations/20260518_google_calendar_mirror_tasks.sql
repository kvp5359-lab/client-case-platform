-- Зеркалирование задач сервиса в Google Calendar (one-way: сервис → Google).
-- Per-user настройка: сотрудник выбирает целевой Google-календарь, и все
-- задачи (project_threads с заполненными start_at/end_at), где он
-- участник или создатель, автоматически появляются как события у него
-- в Google.

CREATE TABLE IF NOT EXISTS public.user_calendar_mirror_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_calendar_id uuid NOT NULL REFERENCES public.calendars(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mirror_settings_user_ws
  ON public.user_calendar_mirror_settings(user_id, workspace_id) WHERE enabled = true;

ALTER TABLE public.user_calendar_mirror_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY mirror_settings_select_own ON public.user_calendar_mirror_settings
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY mirror_settings_insert_own ON public.user_calendar_mirror_settings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY mirror_settings_update_own ON public.user_calendar_mirror_settings
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY mirror_settings_delete_own ON public.user_calendar_mirror_settings
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Маппинг наша_задача ↔ google_event для каждого юзера, который её зеркалит.
CREATE TABLE IF NOT EXISTS public.task_google_event_map (
  thread_id uuid NOT NULL REFERENCES public.project_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_id uuid NOT NULL REFERENCES public.calendars(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  last_pushed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_event_map_thread ON public.task_google_event_map(thread_id);

ALTER TABLE public.task_google_event_map ENABLE ROW LEVEL SECURITY;
-- INSERT/UPDATE/DELETE — только service_role через edge-функцию.
-- SELECT — собственные строки (нужно фронту, чтобы скрыть external events,
-- уже связанные с задачами через convert).
CREATE POLICY task_event_map_select_own ON public.task_google_event_map
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_mirror_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_touch_mirror_settings ON public.user_calendar_mirror_settings;
CREATE TRIGGER trg_touch_mirror_settings
  BEFORE UPDATE ON public.user_calendar_mirror_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_mirror_settings_updated_at();
