-- Поддержка thread_unread_state. Все триггеры «глушащие» (не роняют исходную операцию).
CREATE OR REPLACE FUNCTION public.recompute_thread_unread_pairs(p_thread_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM count(recompute_thread_unread_for(a.participant_id, p_thread_id))
  FROM inbox_accessible_participant_ids(p_thread_id) a;
END; $$;

CREATE OR REPLACE FUNCTION public.refresh_thread_unread_pairs(p_thread_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM thread_unread_state u WHERE u.thread_id = p_thread_id
    AND NOT EXISTS (SELECT 1 FROM inbox_accessible_participant_ids(p_thread_id) a WHERE a.participant_id = u.participant_id);
  PERFORM recompute_thread_unread_pairs(p_thread_id);
END; $$;

CREATE OR REPLACE FUNCTION public.trg_thread_unread()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_thread uuid;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'project_messages' THEN v_thread := COALESCE(NEW.thread_id, OLD.thread_id);
    ELSIF TG_TABLE_NAME = 'message_reactions' THEN
      SELECT pm.thread_id INTO v_thread FROM project_messages pm WHERE pm.id = COALESCE(NEW.message_id, OLD.message_id);
    ELSIF TG_TABLE_NAME = 'audit_logs' THEN
      IF COALESCE(NEW.resource_type, OLD.resource_type) IN ('task','thread') THEN v_thread := COALESCE(NEW.resource_id, OLD.resource_id); END IF;
    END IF;
    IF v_thread IS NOT NULL THEN PERFORM recompute_thread_unread_pairs(v_thread); END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_thread_unread_read_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  BEGIN
    PERFORM recompute_thread_unread_for(COALESCE(NEW.participant_id, OLD.participant_id), COALESCE(NEW.thread_id, OLD.thread_id));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_unread_messages ON public.project_messages;
CREATE TRIGGER trg_unread_messages AFTER INSERT OR UPDATE OR DELETE ON public.project_messages FOR EACH ROW EXECUTE FUNCTION public.trg_thread_unread();
DROP TRIGGER IF EXISTS trg_unread_reactions ON public.message_reactions;
CREATE TRIGGER trg_unread_reactions AFTER INSERT OR UPDATE OR DELETE ON public.message_reactions FOR EACH ROW EXECUTE FUNCTION public.trg_thread_unread();
DROP TRIGGER IF EXISTS trg_unread_audit ON public.audit_logs;
CREATE TRIGGER trg_unread_audit AFTER INSERT OR UPDATE OR DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.trg_thread_unread();
DROP TRIGGER IF EXISTS trg_unread_read_status ON public.message_read_status;
CREATE TRIGGER trg_unread_read_status AFTER INSERT OR UPDATE OR DELETE ON public.message_read_status FOR EACH ROW EXECUTE FUNCTION public.trg_thread_unread_read_status();
