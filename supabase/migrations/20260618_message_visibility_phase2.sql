-- Фаза 2: видимость сообщения (client/team/self).
-- План: docs/feature-backlog/2026-06-18-message-visibility-modes-and-subscription.md
--
-- visibility:
--   client — клиент + команда (как сейчас, уходит наружу)
--   team   — только команда (наружу НЕ уходит, см. routing-skip миграцию)
--   self   — только автор
-- notify_subscribers: для team — false = «Заметка» (тихо, не копит непрочитанное у подписчиков)
--
-- АДДИТИВНО + no-op на текущих данных (все сообщения = 'client'):
--   колонки с дефолтом 'client'/true; RLS restrictive пропускает все 'client';
--   гейт видимости в непрочитанном срабатывает только на team/self (которых ещё нет).

-- 1. Enum + колонки
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_visibility') THEN
    CREATE TYPE public.message_visibility AS ENUM ('client','team','self');
  END IF;
END $$;

ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS visibility public.message_visibility NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS notify_subscribers boolean NOT NULL DEFAULT true;

-- 2. RLS: restrictive-политика на чтение (AND с существующей permissive select).
--    client → всем с базовым доступом; team → только staff (internal); self → только автор.
--    Закрывает утечку: легаси-колонка project_messages.channel у team-сообщения остаётся
--    'client', поэтому без этой политики клиент-участник (если залогинен) увидел бы team.
DROP POLICY IF EXISTS project_messages_visibility ON public.project_messages;
CREATE POLICY project_messages_visibility ON public.project_messages
  AS RESTRICTIVE FOR SELECT TO public
  USING (
    visibility = 'client'
    OR (visibility = 'team' AND is_internal_member(workspace_id, (SELECT auth.uid())))
    OR (visibility = 'self' AND sender_participant_id IN (
          SELECT id FROM participants WHERE user_id = (SELECT auth.uid())))
  );

-- 3. Непрочитанное: гейт подписки (Фаза 1) + гейт видимости (Фаза 2).
--    Сообщение считается непрочитанным для участника, если:
--      visibility='client'  → всегда (для подписчиков), ЛИБО
--      visibility='team'    → только staff-участнику И не «тихо» (notify_subscribers).
--    'self' не считается никому (автор исключён sender-проверкой, остальным невидимо).
CREATE OR REPLACE FUNCTION public.recompute_thread_unread_for(p_participant_id uuid, p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid; v_last_read timestamptz; v_manual boolean; v_is_staff boolean;
  v_unread bigint; v_events bigint; v_reactions bigint;
  v_last_reaction_at timestamptz; v_last_reaction_emoji text; v_has_unread_reaction boolean;
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
      OR (pm.visibility = 'team' AND COALESCE(v_is_staff, false) AND pm.notify_subscribers = true)
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

  -- Гейт подписки: не подписан → авто-сигналы обнуляются (manually_unread сохраняется).
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
