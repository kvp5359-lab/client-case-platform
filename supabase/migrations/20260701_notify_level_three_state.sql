-- Трёхуровневые уведомления по треду: 'all' / 'messages' / 'off'.
--   • all      (state='subscribed'/дефолт) — сообщения + технические события (статус/срок);
--   • messages (state='muted_events')       — сообщения да, события НЕТ (не считаются
--     непрочитанным, нет контура). Тред остаётся в обычных вкладках, НЕ в архиве;
--   • off      (state='muted')               — тишина, тред в «Заглушённые» (кроме @/ответа).
--
-- Развивает mute-архив: добавляет промежуточный уровень «только сообщения».
-- ⚠️ Тела сняты с ПРОДА (drift) + новая логика.

-- 1. Разрешить третье состояние.
ALTER TABLE public.project_thread_subscriptions
  DROP CONSTRAINT IF EXISTS project_thread_subscriptions_state_check;
ALTER TABLE public.project_thread_subscriptions
  ADD CONSTRAINT project_thread_subscriptions_state_check
  CHECK (state = ANY (ARRAY['subscribed'::text, 'muted_events'::text, 'muted'::text]));

-- 2. Эффективная подписка: 'muted' → нет; 'subscribed'/'muted_events' → да; иначе дефолт.
--    'muted_events' считается ПОДПИСАННЫМ (сообщения и тосты идут как обычно).
CREATE OR REPLACE FUNCTION public.is_thread_subscribed(p_participant_id uuid, p_thread_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM project_thread_subscriptions s
                 WHERE s.thread_id = p_thread_id AND s.participant_id = p_participant_id AND s.state = 'muted') THEN false
    WHEN EXISTS (SELECT 1 FROM project_thread_subscriptions s
                 WHERE s.thread_id = p_thread_id AND s.participant_id = p_participant_id
                   AND s.state IN ('subscribed','muted_events')) THEN true
    ELSE inbox_default_subscribed(p_thread_id, p_participant_id)
  END;
$function$;

-- 3. Пересчёт непрочитанного: у 'muted_events' обнуляем событийный счётчик,
--    сообщения/реакции — как у подписанного.
CREATE OR REPLACE FUNCTION public.recompute_thread_unread_for(p_participant_id uuid, p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid; v_last_read timestamptz; v_manual boolean; v_is_staff boolean;
  v_unread bigint; v_events bigint; v_reactions bigint; v_priority bigint;
  v_last_reaction_at timestamptz; v_last_reaction_emoji text; v_has_unread_reaction boolean;
  v_subscribed boolean; v_state text;
  o_unread bigint; o_events bigint; o_reactions bigint; o_has_reaction boolean; o_emoji text;
  m_unread bigint; m_events bigint; m_reactions bigint; m_has_reaction boolean; m_emoji text;
BEGIN
  SELECT user_id,
         EXISTS (SELECT 1 FROM unnest(workspace_roles) r WHERE is_staff_role(r))
    INTO v_user_id, v_is_staff
    FROM participants WHERE id = p_participant_id;
  SELECT last_read_at, manually_unread INTO v_last_read, v_manual
    FROM message_read_status WHERE participant_id = p_participant_id AND thread_id = p_thread_id;
  v_manual := COALESCE(v_manual, false);

  SELECT count(*) INTO v_unread FROM project_messages pm
  WHERE pm.thread_id = p_thread_id AND pm.source <> 'telegram_service'::message_source
    AND pm.sender_participant_id IS DISTINCT FROM p_participant_id
    AND (v_last_read IS NULL OR pm.created_at > v_last_read)
    AND (
      pm.visibility = 'client'
      OR (pm.visibility = 'team' AND COALESCE(v_is_staff, false) AND (
            pm.notify_subscribers = true
            OR EXISTS (SELECT 1 FROM message_mentions mm
                       WHERE mm.message_id = pm.id AND mm.participant_id = p_participant_id)
         ))
    );

  SELECT count(*) INTO v_priority FROM project_messages pm
  WHERE pm.thread_id = p_thread_id AND pm.source <> 'telegram_service'::message_source
    AND pm.sender_participant_id IS DISTINCT FROM p_participant_id
    AND (v_last_read IS NULL OR pm.created_at > v_last_read)
    AND (
      pm.visibility = 'client'
      OR (pm.visibility = 'team' AND COALESCE(v_is_staff, false) AND (
            pm.notify_subscribers = true
            OR EXISTS (SELECT 1 FROM message_mentions mm
                       WHERE mm.message_id = pm.id AND mm.participant_id = p_participant_id)
         ))
    )
    AND (
      EXISTS (SELECT 1 FROM message_mentions mm
              WHERE mm.message_id = pm.id AND mm.participant_id = p_participant_id)
      OR EXISTS (SELECT 1 FROM project_messages orig
                 WHERE orig.id = pm.reply_to_message_id
                   AND orig.sender_participant_id = p_participant_id)
    );

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

  v_subscribed := is_thread_subscribed(p_participant_id, p_thread_id);
  SELECT state INTO v_state FROM project_thread_subscriptions
    WHERE thread_id = p_thread_id AND participant_id = p_participant_id;

  IF v_subscribed THEN
    -- Подписан (all/дефолт/messages). У 'messages' событийный счётчик гасим.
    o_unread := v_unread;
    o_events := CASE WHEN v_state = 'muted_events' THEN 0 ELSE v_events END;
    o_reactions := v_reactions;
    o_has_reaction := v_has_unread_reaction; o_emoji := v_last_reaction_emoji;
    m_unread := 0; m_events := 0; m_reactions := 0; m_has_reaction := false; m_emoji := NULL;
  ELSIF v_state = 'muted' THEN
    -- Заглушён полностью: полное непрочитанное → архив; в обычные только приоритет.
    o_unread := v_priority; o_events := 0; o_reactions := 0;
    o_has_reaction := false; o_emoji := NULL;
    m_unread := v_unread; m_events := v_events; m_reactions := v_reactions;
    m_has_reaction := v_has_unread_reaction; m_emoji := v_last_reaction_emoji;
  ELSE
    -- Пассивный: фантом гасим, приоритет всё равно высовывается.
    o_unread := v_priority; o_events := 0; o_reactions := 0;
    o_has_reaction := false; o_emoji := NULL;
    m_unread := 0; m_events := 0; m_reactions := 0; m_has_reaction := false; m_emoji := NULL;
  END IF;

  INSERT INTO thread_unread_state AS u (
    participant_id, thread_id, unread_count, unread_event_count, unread_reaction_count,
    has_unread_reaction, manually_unread, last_read_at, last_reaction_emoji,
    muted_unread_count, muted_unread_event_count, muted_unread_reaction_count,
    muted_has_unread_reaction, muted_last_reaction_emoji, updated_at
  ) VALUES (
    p_participant_id, p_thread_id, o_unread, o_events, o_reactions,
    o_has_reaction, v_manual, v_last_read, o_emoji,
    m_unread, m_events, m_reactions, m_has_reaction, m_emoji, now()
  )
  ON CONFLICT (participant_id, thread_id) DO UPDATE SET
    unread_count=EXCLUDED.unread_count, unread_event_count=EXCLUDED.unread_event_count, unread_reaction_count=EXCLUDED.unread_reaction_count,
    has_unread_reaction=EXCLUDED.has_unread_reaction, manually_unread=EXCLUDED.manually_unread, last_read_at=EXCLUDED.last_read_at,
    last_reaction_emoji=EXCLUDED.last_reaction_emoji,
    muted_unread_count=EXCLUDED.muted_unread_count, muted_unread_event_count=EXCLUDED.muted_unread_event_count,
    muted_unread_reaction_count=EXCLUDED.muted_unread_reaction_count, muted_has_unread_reaction=EXCLUDED.muted_has_unread_reaction,
    muted_last_reaction_emoji=EXCLUDED.muted_last_reaction_emoji, updated_at=now();
END;
$function$;

-- 4. RPC уровня уведомлений для текущего пользователя.
CREATE OR REPLACE FUNCTION public.get_my_thread_notify_level(p_thread_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_pid uuid; v_ws uuid; v_state text;
BEGIN
  SELECT workspace_id INTO v_ws FROM project_threads WHERE id = p_thread_id AND is_deleted = false;
  IF v_ws IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_pid FROM participants
    WHERE workspace_id = v_ws AND user_id = (SELECT auth.uid()) AND is_deleted = false LIMIT 1;
  IF v_pid IS NULL THEN RETURN NULL; END IF;

  SELECT state INTO v_state FROM project_thread_subscriptions
    WHERE thread_id = p_thread_id AND participant_id = v_pid;

  IF v_state = 'muted' THEN RETURN 'off';
  ELSIF v_state = 'muted_events' THEN RETURN 'messages';
  ELSIF v_state = 'subscribed' THEN RETURN 'all';
  ELSE
    RETURN CASE WHEN inbox_default_subscribed(p_thread_id, v_pid) THEN 'all' ELSE 'off' END;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_thread_notify_level(p_thread_id uuid, p_level text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_pid uuid; v_ws uuid; v_state text;
BEGIN
  IF p_level NOT IN ('all','messages','off') THEN RAISE EXCEPTION 'invalid level: %', p_level; END IF;
  SELECT workspace_id INTO v_ws FROM project_threads WHERE id = p_thread_id AND is_deleted = false;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;
  SELECT id INTO v_pid FROM participants
    WHERE workspace_id = v_ws AND user_id = (SELECT auth.uid()) AND is_deleted = false LIMIT 1;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'participant not found'; END IF;

  v_state := CASE p_level WHEN 'all' THEN 'subscribed' WHEN 'messages' THEN 'muted_events' ELSE 'muted' END;

  INSERT INTO project_thread_subscriptions (thread_id, participant_id, state, source)
  VALUES (p_thread_id, v_pid, v_state, 'manual')
  ON CONFLICT (thread_id, participant_id)
  DO UPDATE SET state = EXCLUDED.state, source = 'manual', updated_at = now();

  RETURN p_level;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_thread_notify_level(uuid) FROM public;
REVOKE ALL ON FUNCTION public.set_my_thread_notify_level(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_thread_notify_level(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_my_thread_notify_level(uuid, text) TO authenticated, service_role;

-- 5. Пересчёт всех пар (событийные счётчики у существующих 'muted_events' нет — их пока 0).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT participant_id, thread_id FROM thread_unread_state
    UNION
    SELECT participant_id, thread_id FROM project_thread_subscriptions
  LOOP
    PERFORM recompute_thread_unread_for(r.participant_id, r.thread_id);
  END LOOP;
END $$;
