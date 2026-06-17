-- Диагностическая таблица таймингов открытия тредов (perfTrace).
-- Пишется только при включённом тумблере «Диагностика производительности».
-- Низкий объём, короткоживущие данные. Читается аналитиком/Claude через MCP.
CREATE TABLE IF NOT EXISTS public.perf_traces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid,
  thread_id   uuid,
  channel     text,
  thread_type text,
  total_ms    integer,
  marks       jsonb NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perf_traces_created_at ON public.perf_traces (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_traces_thread ON public.perf_traces (thread_id);

ALTER TABLE public.perf_traces ENABLE ROW LEVEL SECURITY;

-- INSERT: любой залогиненный пишет только свои записи (user_id = auth.uid()).
DROP POLICY IF EXISTS perf_traces_insert ON public.perf_traces;
CREATE POLICY perf_traces_insert ON public.perf_traces
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- SELECT: автор видит свои (для отладки с фронта). Аналитика — через service_role (MCP), он RLS не ограничен.
DROP POLICY IF EXISTS perf_traces_select_own ON public.perf_traces;
CREATE POLICY perf_traces_select_own ON public.perf_traces
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.perf_traces FROM PUBLIC, anon;
-- Дефолтные привилегии проекта грантят новым таблицам широкий набор для
-- authenticated. RLS режет UPDATE/DELETE (нет политик), но TRUNCATE идёт мимо
-- RLS — поэтому явно снимаем всё лишнее, оставляя только INSERT/SELECT.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.perf_traces FROM authenticated;
GRANT INSERT, SELECT ON public.perf_traces TO authenticated;
GRANT ALL ON public.perf_traces TO service_role;
