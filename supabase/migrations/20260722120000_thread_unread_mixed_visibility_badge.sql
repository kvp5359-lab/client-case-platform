-- Красный бейдж при СМЕШЕНИИ непрочитанного внутри треда: есть и «Всем»
-- (visibility='client'), и «Команде» (team). По аналогии со «смешанным» бейджем
-- проекта в сайдбаре (там `rose`, когда у непрочитанных тредов разные акценты).
--
-- Данных для этого не было: unread_count складывал обе видимости в ОДНО число.
-- Добавляем булев флаг (не второй счётчик — для «смешано» нужен только факт
-- наличия обоих видов).
--
-- ⚠️ Флаг кладём ТОЛЬКО в get_inbox_thread_aggregates. Его читают оба бейджа:
-- UnreadBadge — напрямую, InboxChatItem — через кэш агрегатов (хук
-- useThreadMixedUnread). В get_inbox_threads_v3_for НЕ трогаем сознательно: от
-- него зависят 6 `_impl`-обёрток с жёстким совпадением колонок, и ровно такая
-- правка однажды клала прод (инцидент get_workspace_threads →
-- get_board_filtered_threads: пропали задачи/доски/календарь).
--
-- ⚠️ DRIFT: тело recompute_thread_unread_for в проде расходилось с репо
-- (обновлялось через MCP). Здесь — полное актуальное тело + разбивка по
-- видимости. Применено в прод 2026-07-22 через MCP.

ALTER TABLE public.thread_unread_state
  ADD COLUMN IF NOT EXISTS has_mixed_unread boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.recompute_thread_unread_for(p_participant_id uuid, p_thread_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid; v_last_read timestamptz; v_manual boolean; v_is_staff boolean;
  v_own_last timestamptz; v_wm timestamptz;
  v_unread bigint; v_events bigint; v_reactions bigint; v_priority bigint;
  v_unread_client bigint; v_unread_team bigint;
  v_last_reaction_at timestamptz; v_last_reaction_emoji text; v_has_unread_reaction boolean;
  v_subscribed boolean; v_state text;
  o_unread bigint; o_events bigint; o_reactions bigint; o_has_reaction boolean; o_emoji text;
  o_mixed boolean;
  m_unread bigint; m_events bigint; m_reactions bigint; m_has_reaction boolean; m_emoji text;
BEGIN
  SELECT user_id,
         EXISTS (SELECT 1 FROM unnest(workspace_roles) r WHERE is_staff_role(r))
    INTO v_user_id, v_is_staff
    FROM participants WHERE id = p_participant_id;
  SELECT last_read_at, manually_unread INTO v_last_read, v_manual
    FROM message_read_status WHERE participant_id = p_participant_id AND thread_id = p_thread_id;
  v_manual := COALESCE(v_manual, false);

  -- Водяной знак для СЧЁТЧИКОВ (хранимый last_read_at не трогаем): отправив
  -- сообщение, участник неявно прочитал всё до него. Закрывает гонку
  -- recompute(INSERT своего сообщения) vs markAsRead.
  SELECT max(created_at) INTO v_own_last FROM project_messages
    WHERE thread_id = p_thread_id AND sender_participant_id = p_participant_id
      AND source <> 'telegram_service'::message_source;
  v_wm := GREATEST(v_last_read, v_own_last);

  -- Один проход: общий счётчик + разбивка по видимости (для «смешано»).
  SELECT count(*),
         count(*) FILTER (WHERE pm.visibility = 'client'),
         count(*) FILTER (WHERE pm.visibility <> 'client')
    INTO v_unread, v_unread_client, v_unread_team
  FROM project_messages pm
  WHERE pm.thread_id = p_thread_id AND pm.source <> 'telegram_service'::message_source
    AND pm.sender_participant_id IS DISTINCT FROM p_participant_id
    AND (v_wm IS NULL OR pm.created_at > v_wm)
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
    AND (v_wm IS NULL OR pm.created_at > v_wm)
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
    AND (v_wm IS NULL OR al.created_at > v_wm)
    AND al.action <> 'change_deadline'
    AND (al.action <> 'change_status' OR COALESCE(s.silent_transition, false) = false)
    AND (
      EXISTS (SELECT 1 FROM task_assignees ta
              WHERE ta.thread_id = p_thread_id AND ta.participant_id = p_participant_id)
      OR NOT EXISTS (SELECT 1 FROM task_assignees ta2
                     WHERE ta2.thread_id = p_thread_id)
    );

  SELECT count(*) INTO v_reactions FROM message_reactions mr JOIN project_messages pm ON pm.id = mr.message_id
  WHERE pm.thread_id = p_thread_id AND mr.participant_id IS DISTINCT FROM p_participant_id
    AND (v_wm IS NULL OR mr.created_at > v_wm);

  SELECT mr.created_at, mr.emoji INTO v_last_reaction_at, v_last_reaction_emoji
  FROM message_reactions mr JOIN project_messages pm ON pm.id = mr.message_id
  WHERE pm.thread_id = p_thread_id AND mr.participant_id IS DISTINCT FROM p_participant_id
  ORDER BY mr.created_at DESC, mr.id DESC LIMIT 1;
  v_has_unread_reaction := v_last_reaction_at IS NOT NULL AND (v_wm IS NULL OR v_last_reaction_at > v_wm);

  v_subscribed := is_thread_subscribed(p_participant_id, p_thread_id);
  SELECT state INTO v_state FROM project_thread_subscriptions
    WHERE thread_id = p_thread_id AND participant_id = p_participant_id;

  IF v_subscribed THEN
    o_unread := v_unread;
    o_events := CASE WHEN v_state = 'muted_events' THEN 0 ELSE v_events END;
    o_reactions := v_reactions;
    o_has_reaction := v_has_unread_reaction; o_emoji := v_last_reaction_emoji;
    -- «Смешано» = среди непрочитанных СООБЩЕНИЙ есть и «Всем», и «Команде».
    -- События/реакции не в счёт — у них нет видимости.
    o_mixed := (COALESCE(v_unread_client, 0) > 0 AND COALESCE(v_unread_team, 0) > 0);
    m_unread := 0; m_events := 0; m_reactions := 0; m_has_reaction := false; m_emoji := NULL;
  ELSIF v_state = 'muted' THEN
    o_unread := v_priority; o_events := 0; o_reactions := 0;
    o_has_reaction := false; o_emoji := NULL; o_mixed := false;
    m_unread := v_unread; m_events := v_events; m_reactions := v_reactions;
    m_has_reaction := v_has_unread_reaction; m_emoji := v_last_reaction_emoji;
  ELSE
    o_unread := v_priority; o_events := 0; o_reactions := 0;
    o_has_reaction := false; o_emoji := NULL; o_mixed := false;
    m_unread := 0; m_events := 0; m_reactions := 0; m_has_reaction := false; m_emoji := NULL;
  END IF;

  INSERT INTO thread_unread_state AS u (
    participant_id, thread_id, unread_count, unread_event_count, unread_reaction_count,
    has_unread_reaction, manually_unread, last_read_at, last_reaction_emoji, has_mixed_unread,
    muted_unread_count, muted_unread_event_count, muted_unread_reaction_count,
    muted_has_unread_reaction, muted_last_reaction_emoji, updated_at
  ) VALUES (
    p_participant_id, p_thread_id, o_unread, o_events, o_reactions,
    o_has_reaction, v_manual, v_last_read, o_emoji, o_mixed,
    m_unread, m_events, m_reactions, m_has_reaction, m_emoji, now()
  )
  ON CONFLICT (participant_id, thread_id) DO UPDATE SET
    unread_count=EXCLUDED.unread_count, unread_event_count=EXCLUDED.unread_event_count, unread_reaction_count=EXCLUDED.unread_reaction_count,
    has_unread_reaction=EXCLUDED.has_unread_reaction, manually_unread=EXCLUDED.manually_unread, last_read_at=EXCLUDED.last_read_at,
    last_reaction_emoji=EXCLUDED.last_reaction_emoji, has_mixed_unread=EXCLUDED.has_mixed_unread,
    muted_unread_count=EXCLUDED.muted_unread_count, muted_unread_event_count=EXCLUDED.muted_unread_event_count,
    muted_unread_reaction_count=EXCLUDED.muted_unread_reaction_count, muted_has_unread_reaction=EXCLUDED.muted_has_unread_reaction,
    muted_last_reaction_emoji=EXCLUDED.muted_last_reaction_emoji, updated_at=now();
END;
$function$;

-- Агрегаты: новая колонка has_mixed_unread (смена RETURNS TABLE → DROP+CREATE).
DROP FUNCTION IF EXISTS public.get_inbox_thread_aggregates(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_inbox_thread_aggregates_impl(uuid, uuid);

CREATE FUNCTION public.get_inbox_thread_aggregates_impl(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, project_id uuid, legacy_channel text, thread_accent_color text, last_message_at timestamp with time zone, unread_count bigint, unread_event_count bigint, unread_reaction_count bigint, has_unread_reaction boolean, manually_unread boolean, last_reaction_emoji text, last_from_staff boolean, has_external boolean, has_mixed_unread boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT us.thread_id, pt.project_id, pt.legacy_channel::text, pt.accent_color::text,
    m.last_message_at, us.unread_count, us.unread_event_count, us.unread_reaction_count,
    us.has_unread_reaction, us.manually_unread, us.last_reaction_emoji, m.last_from_staff, m.has_external,
    us.has_mixed_unread
  FROM thread_unread_state us
  JOIN thread_inbox_meta m ON m.thread_id = us.thread_id
  JOIN project_threads pt ON pt.id = us.thread_id AND pt.is_deleted = false
  WHERE us.participant_id = (SELECT id FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1);
$function$;

CREATE FUNCTION public.get_inbox_thread_aggregates(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, project_id uuid, legacy_channel text, thread_accent_color text, last_message_at timestamp with time zone, unread_count bigint, unread_event_count bigint, unread_reaction_count bigint, has_unread_reaction boolean, manually_unread boolean, last_reaction_emoji text, last_from_staff boolean, has_external boolean, has_mixed_unread boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN IF p_user_id IS DISTINCT FROM (SELECT auth.uid()) AND coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'access denied: p_user_id must equal the authenticated caller' USING ERRCODE='42501'; END IF; RETURN QUERY SELECT * FROM public.get_inbox_thread_aggregates_impl($1, $2); END; $function$;

-- Гранты 1:1 как были. ⚠️ Supabase выдаёт новым функциям EXECUTE для
-- authenticated/service_role по умолчанию — у `_impl` их быть НЕ должно: он
-- SECURITY DEFINER и обходит проверку «p_user_id = auth.uid()» из обёртки
-- (иначе залогиненный прочитал бы чужие счётчики).
REVOKE ALL ON FUNCTION public.get_inbox_thread_aggregates(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_inbox_thread_aggregates(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_inbox_thread_aggregates(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_inbox_thread_aggregates_impl(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_inbox_thread_aggregates_impl(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_inbox_thread_aggregates_impl(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_inbox_thread_aggregates_impl(uuid, uuid) FROM service_role;
