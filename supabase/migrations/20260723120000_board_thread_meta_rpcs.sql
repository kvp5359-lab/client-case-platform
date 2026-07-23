-- Перф доски (аудит docs/audit/2026-07-23-board-performance-audit.md):
-- исполнители и времена для БОЛЬШОГО набора тредов — одним запросом.
--
-- Раньше фронт бил `.in('thread_id', chunk)` чанками по 40 (GET упирается в
-- лимит URL) — доска с календарным списком (~2000 тредов) давала ~50+50
-- параллельных запросов на каждый маунт (замерено: суммарно ~32 секунды
-- сетевого времени). RPC = POST с массивом id, лимита URL нет.
--
-- SECURITY INVOKER — RLS вызывающего применяется к task_assignees /
-- participants / project_threads ровно как у прежних прямых SELECT'ов.

CREATE OR REPLACE FUNCTION public.get_task_assignees_for_threads(p_thread_ids uuid[])
RETURNS TABLE (
  thread_id uuid,
  participant_id uuid,
  name text,
  last_name text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT ta.thread_id, p.id, p.name, p.last_name, p.avatar_url
  FROM public.task_assignees ta
  JOIN public.participants p ON p.id = ta.participant_id
  WHERE ta.thread_id = ANY (p_thread_ids)
$$;

REVOKE ALL ON FUNCTION public.get_task_assignees_for_threads(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_task_assignees_for_threads(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_task_assignees_for_threads(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_thread_times_for_threads(p_thread_ids uuid[])
RETURNS TABLE (
  id uuid,
  start_at timestamptz,
  end_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT t.id, t.start_at, t.end_at
  FROM public.project_threads t
  WHERE t.id = ANY (p_thread_ids)
    AND t.start_at IS NOT NULL
    AND t.end_at IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.get_thread_times_for_threads(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_thread_times_for_threads(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_thread_times_for_threads(uuid[]) TO authenticated, service_role;
