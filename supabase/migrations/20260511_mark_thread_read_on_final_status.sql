-- Backstop: при переводе треда в финальный статус — автоматически помечаем его
-- прочитанным для пользователя, который сделал смену (auth.uid()).
--
-- Зачем триггер, если есть фронт-логика useMarkThreadReadIfFinal?
-- Фронт-логика — для UX (моментально гасит бейдж в кэше React Query).
-- Триггер — гарантия, что запись в message_read_status появится при ЛЮБОМ
-- пути смены статуса (включая прямой SQL, пакетные операции, будущие точки).

CREATE OR REPLACE FUNCTION mark_thread_read_on_final_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_final BOOLEAN;
  v_user_id UUID;
  v_participant_id UUID;
BEGIN
  -- Меняется ли status_id и есть ли новый статус?
  IF NEW.status_id IS NULL OR NEW.status_id IS NOT DISTINCT FROM OLD.status_id THEN
    RETURN NEW;
  END IF;

  -- Финальный ли новый статус?
  SELECT is_final INTO v_is_final FROM statuses WHERE id = NEW.status_id;
  IF v_is_final IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Кто сейчас инициировал смену? В фоновых вызовах (service_role) auth.uid()=NULL —
  -- пропускаем, потому что некого помечать.
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Ищем participant'а: проектного (если у треда есть project_id) или
  -- workspace-уровневого (для личных диалогов без проекта).
  IF NEW.project_id IS NOT NULL THEN
    SELECT p.id INTO v_participant_id
    FROM participants p
    JOIN project_participants pp
      ON pp.participant_id = p.id AND pp.project_id = NEW.project_id
    WHERE p.user_id = v_user_id AND p.is_deleted = false
    LIMIT 1;
  ELSE
    SELECT id INTO v_participant_id
    FROM participants
    WHERE user_id = v_user_id
      AND workspace_id = NEW.workspace_id
      AND is_deleted = false
    LIMIT 1;
  END IF;

  IF v_participant_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO message_read_status (participant_id, thread_id, project_id, channel, last_read_at, manually_unread)
  VALUES (v_participant_id, NEW.id, NEW.project_id, 'client', NOW(), false)
  ON CONFLICT (participant_id, thread_id) DO UPDATE
  SET last_read_at = NOW(), manually_unread = false;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mark_thread_read_on_final_status_trigger ON project_threads;
CREATE TRIGGER mark_thread_read_on_final_status_trigger
AFTER UPDATE OF status_id ON project_threads
FOR EACH ROW
EXECUTE FUNCTION mark_thread_read_on_final_status();
