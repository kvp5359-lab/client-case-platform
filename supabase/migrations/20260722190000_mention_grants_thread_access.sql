-- @-упоминание выдаёт доступ к треду (решение владельца 2026-07-22).
--
-- Раньше упоминание только подписывало (mention_recompute → recompute). Если
-- упомянутый не имел доступа к треду (не участник проекта/задачи, не исполнитель,
-- не view_all) — он не видел ни тред, ни непрочитанное: «отметили в пустоту».
--
-- Теперь: упомянутый СОТРУДНИК (workspace-роль из is_staff_role, есть аккаунт,
-- не заблокирован) без доступа к треду добавляется в project_thread_members →
-- получает доступ (ветка member в can_user_access_thread / inbox_accessible_participant_ids).
--
-- Гейты выдачи доступа (пост-ревью):
--   • только СОТРУДНИКИ с аккаунтом: клиентам/без user_id доступ НЕ выдаётся
--     (RLS insert mentions = автор сообщения, а автором может быть и клиент);
--   • только треды ПРОЕКТА (project_id NOT NULL): в личных диалогах упоминание
--     раздавало бы коллегам доступ к личной переписке с клиентом в обход
--     замысла RLS 2026-07-02 (members в orphan-тредах — только owner/менеджер);
--   • не для сообщений «Только я» (visibility='self'): recompute такие никому
--     не считает, а restrictive-RLS прячет само сообщение от упомянутого —
--     получилась бы тихая выдача доступа без какого-либо сигнала.
--
-- ⚠️ Нюанс baseline: INSERT в project_thread_members триггерит
-- seed_read_status_on_thread_member, который сидирует message_read_status с
-- last_read_at = added_at (СЕЙЧАС) — это ПОЗЖЕ сообщения с упоминанием, и оно
-- оказалось бы «прочитанным». Поэтому после выдачи доступа отматываем baseline
-- на 1 мкс раньше сообщения: непрочитанным становится ровно упоминающее
-- сообщение, старая история остаётся прочитанной (инвариант «точка отсчёта
-- непрочитанного = момент выдачи доступа» сохранён).

CREATE OR REPLACE FUNCTION public.trg_mention_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_thread uuid;
  v_msg_created timestamptz;
  v_visibility text;
  v_project_id uuid;
  v_is_staff boolean;
  v_has_access boolean;
BEGIN
  BEGIN
    SELECT pm.thread_id, pm.created_at, pm.visibility::text, t.project_id
      INTO v_thread, v_msg_created, v_visibility, v_project_id
    FROM project_messages pm
    JOIN project_threads t ON t.id = pm.thread_id
    WHERE pm.id = NEW.message_id;
    IF v_thread IS NULL THEN
      RETURN NEW;
    END IF;

    IF v_project_id IS NOT NULL AND COALESCE(v_visibility, 'client') <> 'self' THEN
      SELECT EXISTS (
        SELECT 1
        FROM participants p
        WHERE p.id = NEW.participant_id
          AND p.user_id IS NOT NULL
          AND p.is_deleted = false
          AND p.can_login = true
          AND EXISTS (
            SELECT 1 FROM unnest(COALESCE(p.workspace_roles, '{}'::text[])) r(role)
            WHERE is_staff_role(r.role)
          )
      ) INTO v_is_staff;

      IF v_is_staff THEN
        SELECT EXISTS (
          SELECT 1 FROM inbox_accessible_participant_ids(v_thread) a
          WHERE a.participant_id = NEW.participant_id
        ) INTO v_has_access;

        IF NOT v_has_access THEN
          INSERT INTO project_thread_members (thread_id, participant_id)
          VALUES (v_thread, NEW.participant_id)
          ON CONFLICT (thread_id, participant_id) DO NOTHING;

          -- Отмотка baseline (см. шапку): затрагивает только свежесидированную
          -- строку (last_read_at >= created_at сообщения возможен лишь у неё).
          UPDATE message_read_status
          SET last_read_at = v_msg_created - interval '1 microsecond'
          WHERE participant_id = NEW.participant_id
            AND thread_id = v_thread
            AND last_read_at >= v_msg_created;
        END IF;
      END IF;
    END IF;

    PERFORM recompute_thread_unread_for(NEW.participant_id, v_thread);
  EXCEPTION WHEN OTHERS THEN
    -- Не роняем вставку упоминания, но провал выдачи доступа не должен быть
    -- невидимым (иначе фича молча деградирует до «отметили в пустоту»).
    RAISE WARNING 'trg_mention_recompute: mention processing failed for message %, participant %: %',
      NEW.message_id, NEW.participant_id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;
