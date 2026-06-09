-- Точка отсчёта непрочитанного = момент выдачи доступа (Фаза 1: сидирование).
--
-- Проблема: если для пары (participant, thread) нет строки в message_read_status,
-- last_read_at трактуется как NULL → ВСЕ сообщения треда считаются непрочитанными.
-- Новый сотрудник, получивший доступ к проекту с историей, видел тысячи
-- фантомных непрочитанных.
--
-- Решение: при выдаче доступа сразу проставляем «прочитано до момента доступа»
-- (last_read_at = added_at / assigned_at). Сообщения, пришедшие ПОСЛЕ выдачи
-- доступа, остаются непрочитанными — как и должно быть.
--
-- ON CONFLICT DO NOTHING — не перетираем уже существующую отметку прочтения
-- (если участник был добавлен ранее и уже что-то читал).
--
-- Формула в RPC inbox не меняется (Фаза 2 — отдельно). Здесь только наполнение.

-- ── Доступ к проекту → сидируем все неудалённые треды проекта ──
CREATE OR REPLACE FUNCTION public.seed_read_status_on_project_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO message_read_status (participant_id, thread_id, project_id, channel, last_read_at, manually_unread)
  SELECT NEW.participant_id, t.id, t.project_id, 'client', NEW.added_at, false
  FROM project_threads t
  WHERE t.project_id = NEW.project_id
    AND t.is_deleted = false
  ON CONFLICT (participant_id, thread_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_read_status_on_project_access ON public.project_participants;
CREATE TRIGGER trg_seed_read_status_on_project_access
  AFTER INSERT ON public.project_participants
  FOR EACH ROW EXECUTE FUNCTION public.seed_read_status_on_project_access();

-- ── Custom-доступ к треду → сидируем конкретный тред ──
CREATE OR REPLACE FUNCTION public.seed_read_status_on_thread_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO message_read_status (participant_id, thread_id, project_id, channel, last_read_at, manually_unread)
  SELECT NEW.participant_id, t.id, t.project_id, 'client', NEW.added_at, false
  FROM project_threads t
  WHERE t.id = NEW.thread_id
    AND t.is_deleted = false
  ON CONFLICT (participant_id, thread_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_read_status_on_thread_member ON public.project_thread_members;
CREATE TRIGGER trg_seed_read_status_on_thread_member
  AFTER INSERT ON public.project_thread_members
  FOR EACH ROW EXECUTE FUNCTION public.seed_read_status_on_thread_member();

-- ── Назначение исполнителем → сидируем конкретный тред ──
CREATE OR REPLACE FUNCTION public.seed_read_status_on_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO message_read_status (participant_id, thread_id, project_id, channel, last_read_at, manually_unread)
  SELECT NEW.participant_id, t.id, t.project_id, 'client', NEW.assigned_at, false
  FROM project_threads t
  WHERE t.id = NEW.thread_id
    AND t.is_deleted = false
  ON CONFLICT (participant_id, thread_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_read_status_on_assignee ON public.task_assignees;
CREATE TRIGGER trg_seed_read_status_on_assignee
  AFTER INSERT ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.seed_read_status_on_assignee();
