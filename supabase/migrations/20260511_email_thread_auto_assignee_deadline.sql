-- Авто-логика для email-тредов:
--   1. При создании треда с type='email' — назначаем исполнителя и срок «сегодня»,
--      если они пустые.
--   2. При входящем сообщении в существующий email-тред — если тред в финальном
--      статусе, открываем его (status_id := NULL); если deadline пустой —
--      ставим «сегодня»; если нет исполнителя — назначаем.
--
-- Исполнитель: participant пользователя, которому «принадлежит» этот ящик.
--   - personal email (project_id IS NULL): participants.user_id = thread.owner_user_id
--   - проектный email: participants.user_id = email_accounts.user_id
--     (берём через project_threads.email_send_account_id)
--
-- «Сегодня без времени» — полночь Europe/Madrid в формате timestamptz, чтобы
-- фронт показывал просто дату «11 мая».

CREATE OR REPLACE FUNCTION public.today_madrid_midnight()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT ((now() AT TIME ZONE 'Europe/Madrid')::date)::timestamp AT TIME ZONE 'Europe/Madrid';
$$;

-- Резолвит participant-исполнителя для email-треда по тем же правилам, что и фронт.
CREATE OR REPLACE FUNCTION public.resolve_email_thread_assignee(p_thread project_threads)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_participant_id UUID;
BEGIN
  -- 1. personal email-тред — owner_user_id
  IF p_thread.owner_user_id IS NOT NULL THEN
    v_user_id := p_thread.owner_user_id;
  -- 2. проектный email-тред — владелец email-аккаунта, через который отправляем
  ELSIF p_thread.email_send_account_id IS NOT NULL THEN
    SELECT user_id INTO v_user_id FROM email_accounts WHERE id = p_thread.email_send_account_id;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_participant_id
  FROM participants
  WHERE user_id = v_user_id
    AND workspace_id = p_thread.workspace_id
    AND is_deleted = false
  LIMIT 1;

  RETURN v_participant_id;
END;
$$;

-- ─── Триггер 1: при создании email-треда ───────────────────────────

CREATE OR REPLACE FUNCTION public.email_thread_auto_setup_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_id UUID;
BEGIN
  IF NEW.type <> 'email' THEN
    RETURN NEW;
  END IF;

  -- Срок «сегодня», если не задан.
  IF NEW.deadline IS NULL THEN
    NEW.deadline := public.today_madrid_midnight();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_thread_auto_setup_on_insert_trigger ON project_threads;
CREATE TRIGGER email_thread_auto_setup_on_insert_trigger
BEFORE INSERT ON project_threads
FOR EACH ROW
EXECUTE FUNCTION public.email_thread_auto_setup_on_insert();

-- Назначаем assignee в AFTER INSERT, потому что нужен thread.id.
CREATE OR REPLACE FUNCTION public.email_thread_assign_owner_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_id UUID;
BEGIN
  IF NEW.type <> 'email' THEN
    RETURN NEW;
  END IF;

  v_participant_id := public.resolve_email_thread_assignee(NEW);
  IF v_participant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ON CONFLICT — на случай, если participant уже привязан как assignee.
  INSERT INTO task_assignees (thread_id, participant_id)
  VALUES (NEW.id, v_participant_id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_thread_assign_owner_after_insert_trigger ON project_threads;
CREATE TRIGGER email_thread_assign_owner_after_insert_trigger
AFTER INSERT ON project_threads
FOR EACH ROW
EXECUTE FUNCTION public.email_thread_assign_owner_after_insert();

-- ─── Триггер 2: при новом входящем сообщении в email-тред ────────

CREATE OR REPLACE FUNCTION public.email_thread_reopen_on_incoming_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread project_threads%ROWTYPE;
  v_is_inbound BOOLEAN;
  v_is_final BOOLEAN;
  v_sender_user_id UUID;
  v_participant_id UUID;
BEGIN
  -- Берём тред целиком (нам нужны type, status_id, deadline, project_id, и т.д.)
  SELECT * INTO v_thread FROM project_threads WHERE id = NEW.thread_id;
  IF v_thread.id IS NULL OR v_thread.type <> 'email' THEN
    RETURN NEW;
  END IF;

  -- Входящее ли это сообщение? Считаем входящим, если отправитель не наш
  -- сотрудник (participant без user_id или sender_participant_id IS NULL).
  IF NEW.sender_participant_id IS NULL THEN
    v_is_inbound := TRUE;
  ELSE
    SELECT user_id INTO v_sender_user_id
    FROM participants WHERE id = NEW.sender_participant_id;
    v_is_inbound := (v_sender_user_id IS NULL);
  END IF;

  IF NOT v_is_inbound THEN
    RETURN NEW;
  END IF;

  -- Реоткрываем тред: если статус финальный — сбрасываем в NULL.
  IF v_thread.status_id IS NOT NULL THEN
    SELECT is_final INTO v_is_final FROM statuses WHERE id = v_thread.status_id;
    IF v_is_final IS TRUE THEN
      UPDATE project_threads SET status_id = NULL WHERE id = v_thread.id;
    END IF;
  END IF;

  -- Срок «сегодня», если не задан.
  IF v_thread.deadline IS NULL THEN
    UPDATE project_threads
    SET deadline = public.today_madrid_midnight()
    WHERE id = v_thread.id;
  END IF;

  -- Исполнитель, если не назначен ни один.
  IF NOT EXISTS (SELECT 1 FROM task_assignees WHERE thread_id = v_thread.id) THEN
    v_participant_id := public.resolve_email_thread_assignee(v_thread);
    IF v_participant_id IS NOT NULL THEN
      INSERT INTO task_assignees (thread_id, participant_id)
      VALUES (v_thread.id, v_participant_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_thread_reopen_on_incoming_message_trigger ON project_messages;
CREATE TRIGGER email_thread_reopen_on_incoming_message_trigger
AFTER INSERT ON project_messages
FOR EACH ROW
EXECUTE FUNCTION public.email_thread_reopen_on_incoming_message();
