-- «Глушащие» триггеры поддержки thread_inbox_meta. Ошибка триггера НЕ блокирует
-- исходную операцию (вставку сообщения/реакции/события) — доставка важнее свежести меты.
CREATE OR REPLACE FUNCTION public.trg_thread_inbox_meta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_thread uuid;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'project_messages' THEN
      v_thread := COALESCE(NEW.thread_id, OLD.thread_id);
    ELSIF TG_TABLE_NAME = 'message_reactions' THEN
      SELECT pm.thread_id INTO v_thread FROM project_messages pm WHERE pm.id = COALESCE(NEW.message_id, OLD.message_id);
    ELSIF TG_TABLE_NAME = 'message_attachments' THEN
      SELECT pm.thread_id INTO v_thread FROM project_messages pm WHERE pm.id = COALESCE(NEW.message_id, OLD.message_id);
    ELSIF TG_TABLE_NAME = 'audit_logs' THEN
      IF COALESCE(NEW.resource_type, OLD.resource_type) IN ('task','thread') THEN
        v_thread := COALESCE(NEW.resource_id, OLD.resource_id);
      END IF;
    END IF;
    IF v_thread IS NOT NULL THEN
      PERFORM compute_thread_inbox_meta(v_thread);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- никогда не роняем исходную операцию; дрейф ловит сверочный джоб
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_meta_messages ON public.project_messages;
CREATE TRIGGER trg_inbox_meta_messages AFTER INSERT OR UPDATE OR DELETE ON public.project_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_thread_inbox_meta();
DROP TRIGGER IF EXISTS trg_inbox_meta_reactions ON public.message_reactions;
CREATE TRIGGER trg_inbox_meta_reactions AFTER INSERT OR UPDATE OR DELETE ON public.message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_thread_inbox_meta();
DROP TRIGGER IF EXISTS trg_inbox_meta_attachments ON public.message_attachments;
CREATE TRIGGER trg_inbox_meta_attachments AFTER INSERT OR UPDATE OR DELETE ON public.message_attachments
  FOR EACH ROW EXECUTE FUNCTION public.trg_thread_inbox_meta();
DROP TRIGGER IF EXISTS trg_inbox_meta_audit ON public.audit_logs;
CREATE TRIGGER trg_inbox_meta_audit AFTER INSERT OR UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_thread_inbox_meta();
