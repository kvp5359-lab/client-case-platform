-- Trigger function: на изменения project_threads / project_thread_members
-- зовём edge function google-calendar-mirror-task через net.http_post.
--
-- Поддерживает guard `clientcase.skip_mirror = 'on'` (см. RPC
-- convert_external_event_to_task) — нужен чтобы при создании треда через
-- convert не сработал mirror до того, как вставится строка маппинга.

CREATE OR REPLACE FUNCTION public.notify_google_calendar_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_thread_id uuid;
BEGIN
  IF current_setting('clientcase.skip_mirror', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'project_threads' THEN
    v_thread_id := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'project_thread_members' THEN
    v_thread_id := COALESCE(NEW.thread_id, OLD.thread_id);
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM net.http_post(
    url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/google-calendar-mirror-task',
    body := jsonb_build_object('thread_id', v_thread_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', '__INTERNAL_FUNCTION_SECRET__'
    ),
    timeout_milliseconds := 30000
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_thread ON public.project_threads;
CREATE TRIGGER trg_mirror_thread
  AFTER INSERT OR UPDATE OF name, description, start_at, end_at, is_deleted, owner_user_id OR DELETE
  ON public.project_threads
  FOR EACH ROW EXECUTE FUNCTION public.notify_google_calendar_mirror();

DROP TRIGGER IF EXISTS trg_mirror_thread_members ON public.project_thread_members;
CREATE TRIGGER trg_mirror_thread_members
  AFTER INSERT OR DELETE
  ON public.project_thread_members
  FOR EACH ROW EXECUTE FUNCTION public.notify_google_calendar_mirror();
