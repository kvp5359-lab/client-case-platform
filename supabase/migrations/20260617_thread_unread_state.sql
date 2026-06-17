-- Фаза 2: персональные счётчики непрочитанного (фан-аут). Additive, не читается до read-cutover.
CREATE TABLE IF NOT EXISTS public.thread_unread_state (
  participant_id        uuid NOT NULL,
  thread_id             uuid NOT NULL REFERENCES public.project_threads(id) ON DELETE CASCADE,
  unread_count          bigint NOT NULL DEFAULT 0,
  unread_event_count    bigint NOT NULL DEFAULT 0,
  unread_reaction_count bigint NOT NULL DEFAULT 0,
  has_unread_reaction   boolean NOT NULL DEFAULT false,
  manually_unread       boolean NOT NULL DEFAULT false,
  last_read_at          timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (participant_id, thread_id)
) WITH (fillfactor = 80);
CREATE INDEX IF NOT EXISTS idx_thread_unread_state_participant ON public.thread_unread_state (participant_id);
ALTER TABLE public.thread_unread_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.thread_unread_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.thread_unread_state TO service_role;

-- Точное зеркало 3-веточной модели доступа из get_inbox_threads_v2:
-- view_all/project_participant требуют живого проекта; assignee/member — нет (ветка 3).
CREATE OR REPLACE FUNCTION public.inbox_accessible_participant_ids(p_thread_id uuid)
RETURNS TABLE(participant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH t AS (
    SELECT id, workspace_id, project_id, owner_user_id, legacy_channel
    FROM project_threads WHERE id = p_thread_id AND is_deleted = false
  )
  SELECT p.id
  FROM t
  JOIN participants p ON p.workspace_id = t.workspace_id AND p.is_deleted = false
  WHERE CASE
    WHEN t.project_id IS NOT NULL THEN
      (t.legacy_channel IS DISTINCT FROM 'internal' OR is_internal_member(t.workspace_id, p.user_id))
      AND (
        ( EXISTS (SELECT 1 FROM projects pr WHERE pr.id = t.project_id AND pr.is_deleted = false)
          AND ( EXISTS (SELECT 1 FROM workspace_roles wr WHERE wr.workspace_id = t.workspace_id AND wr.name = ANY(p.workspace_roles)
                          AND (wr.is_owner OR (wr.permissions->>'view_all_projects')::boolean))
                OR EXISTS (SELECT 1 FROM project_participants pp WHERE pp.project_id = t.project_id AND pp.participant_id = p.id) ) )
        OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.thread_id = t.id AND ta.participant_id = p.id)
        OR EXISTS (SELECT 1 FROM project_thread_members ptm WHERE ptm.thread_id = t.id AND ptm.participant_id = p.id)
      )
    ELSE
      p.user_id = t.owner_user_id
      OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.thread_id = t.id AND ta.participant_id = p.id)
      OR EXISTS (SELECT 1 FROM project_thread_members ptm WHERE ptm.thread_id = t.id AND ptm.participant_id = p.id)
  END;
$$;
REVOKE ALL ON FUNCTION public.inbox_accessible_participant_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inbox_accessible_participant_ids(uuid) TO service_role;
