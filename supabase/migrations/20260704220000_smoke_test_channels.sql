-- Смок-тест каналов: allowlist тестовых тредов + серверная RPC отправки.
-- КРИТИЧНО: смок шлёт РЕАЛЬНЫЕ сообщения — только в треды из allowlist (тест-чаты
-- владельца), НИКОГДА в клиентские. RPC проверяет allowlist на сервере.
-- Применено в прод через MCP. Инструмент: scripts/smoke-channels.mjs (инертен, пока
-- allowlist пуст).

CREATE TABLE IF NOT EXISTS public.smoke_test_threads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    uuid NOT NULL REFERENCES public.project_threads(id) ON DELETE CASCADE,
  channel      text NOT NULL,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id)
);
ALTER TABLE public.smoke_test_threads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.smoke_test_threads FROM anon, authenticated;
GRANT ALL ON public.smoke_test_threads TO service_role;

CREATE OR REPLACE FUNCTION public.smoke_send_test(p_thread_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ws uuid; v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM smoke_test_threads WHERE thread_id = p_thread_id) THEN
    RAISE EXCEPTION 'Тред % не в allowlist смок-теста — отправка запрещена', p_thread_id;
  END IF;
  SELECT workspace_id INTO v_ws FROM project_threads WHERE id = p_thread_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'Тред % не найден', p_thread_id; END IF;
  INSERT INTO project_messages (thread_id, workspace_id, sender_name, content, source, visibility)
  VALUES (p_thread_id, v_ws, 'SMOKE-TEST',
          '🔧 Смок-тест канала ' || to_char(now(), 'HH24:MI:SS') || ' — можно игнорировать',
          'web', 'client')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.smoke_send_test(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smoke_send_test(uuid) TO service_role;
