-- Модель «заглушить + архив» (как в Telegram).
--
-- Раньше mute ОБНУЛЯЛ непрочитанное насовсем. Теперь:
--   • подписан            → всё как прежде (обычные счётчики), архивные = 0;
--   • явно заглушён (mute) → полное непрочитанное уходит в АРХИВНЫЕ счётчики
--                            (серый бейдж во вкладке «Заглушённые»), а в обычные
--                            попадает только ПРИОРИТЕТНОЕ (меня @упомянули ИЛИ
--                            ответили на моё сообщение) — оно «высовывается» в
--                            «Непрочитанные», НЕ снимая mute;
--   • пассивный (доступ есть, не участник/не подписан) → фантомное непрочитанное
--     гасим (как и было), но прямое упоминание/ответ всё равно высовывается.
--
-- Ключевое отличие от прежней автоподписки: @упоминание/ответ БОЛЬШЕ НЕ снимают
-- mute — тред остаётся заглушённым, высовывается только сам приоритетный элемент.
-- Прочитал → уехало обратно в архив.
--
-- ⚠️ Тела recompute_thread_unread_for сняты с ПРОДА (drift repo↔prod) + новая логика.

-- 1. Архивные счётчики (для замьюченных тредов).
ALTER TABLE public.thread_unread_state
  ADD COLUMN IF NOT EXISTS muted_unread_count          bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS muted_unread_event_count    bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS muted_unread_reaction_count bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS muted_has_unread_reaction   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS muted_last_reaction_emoji   text;

-- 2. Пересчёт непрочитанного: три состояния + приоритетное «высовывание».
CREATE OR REPLACE FUNCTION public.recompute_thread_unread_for(p_participant_id uuid, p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid; v_last_read timestamptz; v_manual boolean; v_is_staff boolean;
  v_unread bigint; v_events bigint; v_reactions bigint; v_priority bigint;
  v_last_reaction_at timestamptz; v_last_reaction_emoji text; v_has_unread_reaction boolean;
  v_subscribed boolean; v_explicit_mute boolean;
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

  -- Полное непрочитанное (гейт видимости как раньше: client / team+staff+notify|mention).
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

  -- Приоритетное: меня @упомянули ИЛИ ответили на моё сообщение. Именно оно
  -- высовывается из mute (и из пассивного состояния) в «Непрочитанные».
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

  -- Три состояния.
  v_subscribed := is_thread_subscribed(p_participant_id, p_thread_id);
  v_explicit_mute := EXISTS (SELECT 1 FROM project_thread_subscriptions s
                             WHERE s.thread_id = p_thread_id AND s.participant_id = p_participant_id
                               AND s.state = 'muted');

  IF v_subscribed THEN
    o_unread := v_unread; o_events := v_events; o_reactions := v_reactions;
    o_has_reaction := v_has_unread_reaction; o_emoji := v_last_reaction_emoji;
    m_unread := 0; m_events := 0; m_reactions := 0; m_has_reaction := false; m_emoji := NULL;
  ELSIF v_explicit_mute THEN
    -- Заглушён: полное → архив; в обычные только приоритетное «высовывание».
    o_unread := v_priority; o_events := 0; o_reactions := 0;
    o_has_reaction := false; o_emoji := NULL;
    m_unread := v_unread; m_events := v_events; m_reactions := v_reactions;
    m_has_reaction := v_has_unread_reaction; m_emoji := v_last_reaction_emoji;
  ELSE
    -- Пассивный: фантом гасим, приоритетное всё равно высовывается.
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

-- 3. Упоминание больше НЕ подписывает (не снимает mute) — только пересчитывает
--    непрочитанное упомянутого, чтобы приоритетное «высовывание» посчиталось.
--    (Ответ на сообщение считается сам — recompute_thread_unread_pairs на INSERT
--    сообщения пересчитывает всех участников, включая автора исходного.)
CREATE OR REPLACE FUNCTION public.trg_mention_recompute()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_thread uuid;
BEGIN
  BEGIN
    SELECT thread_id INTO v_thread FROM project_messages WHERE id = NEW.message_id;
    IF v_thread IS NOT NULL THEN
      PERFORM recompute_thread_unread_for(NEW.participant_id, v_thread);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS mention_autosubscribe ON public.message_mentions;
DROP TRIGGER IF EXISTS mention_recompute ON public.message_mentions;
CREATE TRIGGER mention_recompute
  AFTER INSERT ON public.message_mentions
  FOR EACH ROW EXECUTE FUNCTION public.trg_mention_recompute();

DROP FUNCTION IF EXISTS public.trg_mention_autosubscribe();

-- 4. Вкладка «Заглушённые»: замьюченные треды с непрочитанным (архивные счётчики).
--    Отображение через общий get_inbox_threads_v3_for, но счётчики-бейджи подменяем
--    на архивные (muted_*), чтобы фронт рисовал серый бейдж штатной логикой.
CREATE OR REPLACE FUNCTION public.get_inbox_muted_threads(p_workspace_id uuid, p_user_id uuid)
RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT id FROM participants
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1
  )
  SELECT
    v.thread_id, v.thread_name, v.thread_icon, v.thread_accent_color, v.thread_type,
    v.project_id, v.project_name, v.channel_type, v.legacy_channel,
    v.last_message_at, v.last_message_text, v.last_message_attachment_name,
    v.last_message_attachment_count, v.last_message_attachment_mime,
    v.last_sender_name, v.last_sender_avatar_url,
    us.muted_unread_count AS unread_count,
    v.manually_unread,
    us.muted_has_unread_reaction AS has_unread_reaction,
    us.muted_unread_reaction_count AS unread_reaction_count,
    us.muted_last_reaction_emoji AS last_reaction_emoji,
    v.last_reaction_at, v.last_reaction_sender_name, v.last_reaction_sender_avatar_url,
    v.last_reaction_message_preview, v.email_contact, v.email_subject,
    v.last_event_at, v.last_event_text, v.last_event_status_color,
    us.muted_unread_event_count AS unread_event_count,
    v.counterpart_name, v.counterpart_avatar_url, v.last_read_at, v.last_event_sender_avatar_url
  FROM get_inbox_threads_v3_for(p_workspace_id, p_user_id, ARRAY(
    SELECT us2.thread_id FROM thread_unread_state us2, me
    WHERE us2.participant_id = me.id
      AND (us2.muted_unread_count > 0 OR us2.muted_unread_event_count > 0
           OR us2.muted_unread_reaction_count > 0 OR us2.muted_has_unread_reaction = true)
  )) v
  JOIN me ON true
  JOIN thread_unread_state us ON us.thread_id = v.thread_id AND us.participant_id = me.id
  ORDER BY GREATEST(
             COALESCE(v.last_message_at, 'epoch'::timestamptz),
             COALESCE(v.last_event_at, 'epoch'::timestamptz)
           ) DESC, v.thread_id DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_inbox_muted_threads(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_inbox_muted_threads(uuid, uuid) TO authenticated, service_role;

-- 5. Бэкафилл: пересчитать все существующие пары (заполнить архивные счётчики).
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
