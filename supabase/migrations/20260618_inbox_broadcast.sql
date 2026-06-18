-- Фаза 3: рассылка изменений инбокса через Realtime Broadcast (масштабируется
-- лучше Postgres Changes — нет RLS-проверки на каждого подписчика на каждое событие).
-- Триггер шлёт лёгкий сигнал в приватный топик inbox:<workspace_id>; клиент по нему
-- инвалидирует кэши. Глушащий — не роняет вставку. Dual-rollout: пока активны ОБА
-- транспорта (Postgres Changes остаётся в useWorkspaceMessagesRealtime до подтверждения).
CREATE OR REPLACE FUNCTION public.trg_inbox_broadcast()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ws uuid; v_project uuid;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'project_messages' THEN
      v_ws := COALESCE(NEW.workspace_id, OLD.workspace_id);
      v_project := COALESCE(NEW.project_id, OLD.project_id);
    ELSIF TG_TABLE_NAME = 'project_threads' THEN
      v_ws := COALESCE(NEW.workspace_id, OLD.workspace_id);
      v_project := COALESCE(NEW.project_id, OLD.project_id);
    ELSIF TG_TABLE_NAME = 'message_reactions' THEN
      SELECT pt.workspace_id, pt.project_id INTO v_ws, v_project
      FROM project_messages pm JOIN project_threads pt ON pt.id = pm.thread_id
      WHERE pm.id = COALESCE(NEW.message_id, OLD.message_id);
    END IF;
    IF v_ws IS NOT NULL THEN
      PERFORM realtime.send(
        jsonb_build_object('project_id', v_project, 'tbl', TG_TABLE_NAME),
        'inbox_changed', 'inbox:' || v_ws::text, true
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_broadcast_messages ON public.project_messages;
CREATE TRIGGER trg_inbox_broadcast_messages AFTER INSERT OR UPDATE OR DELETE ON public.project_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_inbox_broadcast();
DROP TRIGGER IF EXISTS trg_inbox_broadcast_reactions ON public.message_reactions;
CREATE TRIGGER trg_inbox_broadcast_reactions AFTER INSERT OR UPDATE OR DELETE ON public.message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_inbox_broadcast();
DROP TRIGGER IF EXISTS trg_inbox_broadcast_threads ON public.project_threads;
CREATE TRIGGER trg_inbox_broadcast_threads AFTER INSERT OR UPDATE OR DELETE ON public.project_threads
  FOR EACH ROW EXECUTE FUNCTION public.trg_inbox_broadcast();

-- Realtime Authorization: участник воркспейса может ПОЛУЧАТЬ broadcast своего топика.
-- (RLS на realtime.messages трогает только приватные каналы; публичные presence/typing не задеты.)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inbox_broadcast_read ON realtime.messages;
CREATE POLICY inbox_broadcast_read ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND realtime.messages.topic LIKE 'inbox:%'
    AND EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.workspace_id = NULLIF(split_part(realtime.messages.topic, ':', 2), '')::uuid
        AND p.user_id = (SELECT auth.uid()) AND p.is_deleted = false
    )
  );
