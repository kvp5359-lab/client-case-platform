-- Триггеры изменения доступа + сверка thread_unread_state.
CREATE OR REPLACE FUNCTION public.trg_thread_unread_access_thread()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_thread uuid;
BEGIN
  BEGIN
    v_thread := COALESCE(NEW.thread_id, OLD.thread_id);
    IF v_thread IS NOT NULL THEN PERFORM refresh_thread_unread_pairs(v_thread); END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_thread_unread_access_project()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_project uuid; r RECORD;
BEGIN
  BEGIN
    v_project := COALESCE(NEW.project_id, OLD.project_id);
    IF v_project IS NOT NULL THEN
      FOR r IN SELECT id FROM project_threads WHERE project_id = v_project AND is_deleted = false LOOP
        PERFORM refresh_thread_unread_pairs(r.id);
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_unread_access_assignees ON public.task_assignees;
CREATE TRIGGER trg_unread_access_assignees AFTER INSERT OR DELETE ON public.task_assignees FOR EACH ROW EXECUTE FUNCTION public.trg_thread_unread_access_thread();
DROP TRIGGER IF EXISTS trg_unread_access_members ON public.project_thread_members;
CREATE TRIGGER trg_unread_access_members AFTER INSERT OR DELETE ON public.project_thread_members FOR EACH ROW EXECUTE FUNCTION public.trg_thread_unread_access_thread();
DROP TRIGGER IF EXISTS trg_unread_access_participants ON public.project_participants;
CREATE TRIGGER trg_unread_access_participants AFTER INSERT OR DELETE ON public.project_participants FOR EACH ROW EXECUTE FUNCTION public.trg_thread_unread_access_project();

CREATE OR REPLACE FUNCTION public.reconcile_thread_unread()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM thread_unread_state u WHERE NOT EXISTS (
    SELECT 1 FROM project_threads t WHERE t.id = u.thread_id AND t.is_deleted = false
      AND u.participant_id IN (SELECT participant_id FROM inbox_accessible_participant_ids(t.id)));
  SELECT count(recompute_thread_unread_for(a.participant_id, t.id)) INTO v_count
  FROM project_threads t CROSS JOIN LATERAL inbox_accessible_participant_ids(t.id) a
  WHERE t.is_deleted = false;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.reconcile_thread_unread() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_thread_unread() TO service_role;
