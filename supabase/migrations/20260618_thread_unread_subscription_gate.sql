-- Фаза 1 (миграция B): гейт подписки в формуле непрочитанного.
-- recompute_thread_unread_for теперь обнуляет АВТО-счётчики (сообщения/события/реакции),
-- если участник НЕ подписан на тред (is_thread_subscribed=false).
-- manually_unread сохраняется (это отдельный явный сигнал пользователя).
--
-- Семантика непрочитанного меняется НАМЕРЕННО (см. план). НЕ сверять со старой формулой.
-- Эффект: пассивный view_all-админ перестаёт видеть фантомное непрочитанное на тредах,
-- где он не участник; реальные участники не затронуты.
--
-- ⚠️ Тело снято с прода (drift repo↔prod) + добавлен гейт. Это источник правды.

CREATE OR REPLACE FUNCTION public.recompute_thread_unread_for(p_participant_id uuid, p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid; v_last_read timestamptz; v_manual boolean;
  v_unread bigint; v_events bigint; v_reactions bigint;
  v_last_reaction_at timestamptz; v_last_reaction_emoji text; v_has_unread_reaction boolean;
BEGIN
  SELECT user_id INTO v_user_id FROM participants WHERE id = p_participant_id;
  SELECT last_read_at, manually_unread INTO v_last_read, v_manual
    FROM message_read_status WHERE participant_id = p_participant_id AND thread_id = p_thread_id;
  v_manual := COALESCE(v_manual, false);

  SELECT count(*) INTO v_unread FROM project_messages pm
  WHERE pm.thread_id = p_thread_id AND pm.source <> 'telegram_service'::message_source
    AND pm.sender_participant_id IS DISTINCT FROM p_participant_id AND (v_last_read IS NULL OR pm.created_at > v_last_read);

  SELECT count(*) INTO v_events FROM audit_logs al
  LEFT JOIN statuses s ON al.action = 'change_status'
    AND (al.details->>'new_status') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND s.id = (al.details->>'new_status')::uuid
  WHERE al.resource_id = p_thread_id AND al.resource_type IN ('task','thread') AND al.user_id IS DISTINCT FROM v_user_id
    AND (v_last_read IS NULL OR al.created_at > v_last_read)
    AND (al.action <> 'change_status' OR COALESCE(s.silent_transition, false) = false);

  SELECT count(*) INTO v_reactions FROM message_reactions mr JOIN project_messages pm ON pm.id = mr.message_id
  WHERE pm.thread_id = p_thread_id AND mr.participant_id IS DISTINCT FROM p_participant_id
    AND (v_last_read IS NULL OR mr.created_at > v_last_read);

  SELECT mr.created_at, mr.emoji INTO v_last_reaction_at, v_last_reaction_emoji
  FROM message_reactions mr JOIN project_messages pm ON pm.id = mr.message_id
  WHERE pm.thread_id = p_thread_id AND mr.participant_id IS DISTINCT FROM p_participant_id
  ORDER BY mr.created_at DESC, mr.id DESC LIMIT 1;
  v_has_unread_reaction := v_last_reaction_at IS NOT NULL AND (v_last_read IS NULL OR v_last_reaction_at > v_last_read);

  -- ГЕЙТ ПОДПИСКИ: не подписан → авто-сигналы непрочитанного обнуляются.
  -- manually_unread (v_manual) НЕ трогаем — это отдельный явный сигнал.
  IF NOT is_thread_subscribed(p_participant_id, p_thread_id) THEN
    v_unread := 0; v_events := 0; v_reactions := 0;
    v_has_unread_reaction := false; v_last_reaction_emoji := NULL;
  END IF;

  INSERT INTO thread_unread_state AS u (
    participant_id, thread_id, unread_count, unread_event_count, unread_reaction_count,
    has_unread_reaction, manually_unread, last_read_at, last_reaction_emoji, updated_at
  ) VALUES (
    p_participant_id, p_thread_id, v_unread, v_events, v_reactions,
    v_has_unread_reaction, v_manual, v_last_read, v_last_reaction_emoji, now()
  )
  ON CONFLICT (participant_id, thread_id) DO UPDATE SET
    unread_count=EXCLUDED.unread_count, unread_event_count=EXCLUDED.unread_event_count, unread_reaction_count=EXCLUDED.unread_reaction_count,
    has_unread_reaction=EXCLUDED.has_unread_reaction, manually_unread=EXCLUDED.manually_unread, last_read_at=EXCLUDED.last_read_at,
    last_reaction_emoji=EXCLUDED.last_reaction_emoji, updated_at=now();
END;
$function$;
