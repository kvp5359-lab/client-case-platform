-- Сид точки отсчёта непрочитанного при выдаче доступа больше не «съедает»
-- @упоминания, сделанные ДО выдачи (инцидент 2026-07-23: человека упомянули
-- в треде, потом добавили в проект → baseline = момент добавления → оба
-- упоминания разом стали «прочитанными», контуры и бейдж пропали).
--
-- Теперь после сидирования last_read_at отматывается к самому раннему
-- упоминанию участника в только что ЗАСЕЯННЫХ тредах (существующие строки
-- чтения не трогаются — там реальная точка прочтения). Гейты видимости:
-- self — никогда; team — только staff-участнику (клиенту team не виден,
-- отмотка дала бы фантомный бейдж на невидимое).
--
-- Пара к отмотке в trg_mention_recompute (20260722190000): та ветка отматывает
-- точечно, когда доступ выдаёт САМО упоминание; эта — когда доступ выдают
-- руками (проект/участник треда) позже упоминаний.
--
-- ⚠️ Применено в прод через MCP 2026-07-23. Полные тела — источник правды прод
-- (drift-aware): здесь зафиксированы те же тела для fresh-apply.

CREATE OR REPLACE FUNCTION public.seed_read_status_on_project_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seeded uuid[];
  v_is_staff boolean;
BEGIN
  -- Точка отсчёта непрочитанного = момент выдачи доступа (2026-06-09).
  WITH ins AS (
    INSERT INTO message_read_status (participant_id, thread_id, project_id, channel, last_read_at, manually_unread)
    SELECT NEW.participant_id, t.id, t.project_id, 'client', NEW.added_at, false
    FROM project_threads t
    WHERE t.project_id = NEW.project_id
      AND t.is_deleted = false
    ON CONFLICT (participant_id, thread_id) DO NOTHING
    RETURNING thread_id
  )
  SELECT array_agg(thread_id) INTO v_seeded FROM ins;

  IF v_seeded IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = NEW.participant_id
        AND EXISTS (
          SELECT 1 FROM unnest(COALESCE(p.workspace_roles, '{}'::text[])) r(role)
          WHERE is_staff_role(r.role)
        )
    ) INTO v_is_staff;

    UPDATE message_read_status mrs
    SET last_read_at = m.first_mention - interval '1 microsecond'
    FROM (
      SELECT pm.thread_id, min(pm.created_at) AS first_mention
      FROM message_mentions mm
      JOIN project_messages pm ON pm.id = mm.message_id
      WHERE mm.participant_id = NEW.participant_id
        AND pm.thread_id = ANY(v_seeded)
        AND pm.is_draft = false
        AND COALESCE(pm.visibility::text, 'client') <> 'self'
        AND (COALESCE(pm.visibility::text, 'client') <> 'team' OR v_is_staff)
      GROUP BY pm.thread_id
    ) m
    WHERE mrs.participant_id = NEW.participant_id
      AND mrs.thread_id = m.thread_id
      AND mrs.last_read_at >= m.first_mention;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.seed_read_status_on_thread_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seeded uuid[];
  v_is_staff boolean;
BEGIN
  WITH ins AS (
    INSERT INTO message_read_status (participant_id, thread_id, project_id, channel, last_read_at, manually_unread)
    SELECT NEW.participant_id, t.id, t.project_id, 'client', NEW.added_at, false
    FROM project_threads t
    WHERE t.id = NEW.thread_id
      AND t.is_deleted = false
    ON CONFLICT (participant_id, thread_id) DO NOTHING
    RETURNING thread_id
  )
  SELECT array_agg(thread_id) INTO v_seeded FROM ins;

  -- Зеркало seed_read_status_on_project_access. При выдаче доступа САМИМ
  -- упоминанием отмотку делает trg_mention_recompute (точечно к своему
  -- сообщению) — конфликт исключён условием last_read_at >= first_mention.
  IF v_seeded IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = NEW.participant_id
        AND EXISTS (
          SELECT 1 FROM unnest(COALESCE(p.workspace_roles, '{}'::text[])) r(role)
          WHERE is_staff_role(r.role)
        )
    ) INTO v_is_staff;

    UPDATE message_read_status mrs
    SET last_read_at = m.first_mention - interval '1 microsecond'
    FROM (
      SELECT pm.thread_id, min(pm.created_at) AS first_mention
      FROM message_mentions mm
      JOIN project_messages pm ON pm.id = mm.message_id
      WHERE mm.participant_id = NEW.participant_id
        AND pm.thread_id = ANY(v_seeded)
        AND pm.is_draft = false
        AND COALESCE(pm.visibility::text, 'client') <> 'self'
        AND (COALESCE(pm.visibility::text, 'client') <> 'team' OR v_is_staff)
      GROUP BY pm.thread_id
    ) m
    WHERE mrs.participant_id = NEW.participant_id
      AND mrs.thread_id = m.thread_id
      AND mrs.last_read_at >= m.first_mention;
  END IF;

  RETURN NEW;
END;
$function$;
