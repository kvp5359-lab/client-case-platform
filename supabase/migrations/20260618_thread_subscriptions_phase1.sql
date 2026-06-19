-- Фаза 1: подписка на тред (разделение «доступ» vs «кому прилетает непрочитанное»).
-- План: docs/feature-backlog/2026-06-18-message-visibility-modes-and-subscription.md
--
-- Модель подписки: таблица хранит ТОЛЬКО явные оверрайды (subscribed/muted).
-- Если явной строки нет — действует ДЕФОЛТ inbox_default_subscribed():
-- активный участник (project_participant / assignee / thread_member / владелец личного
-- треда) подписан; пассивный view_all-админ — НЕТ (это убирает фантомное непрочитанное).
--
-- Эта миграция АДДИТИВНА: recompute_thread_unread_for здесь НЕ меняется,
-- поэтому поведение бейджей пока не меняется. Гейт формулы — отдельной миграцией B.

-- 1. Таблица явных оверрайдов подписки (per-participant, как thread_unread_state)
CREATE TABLE IF NOT EXISTS public.project_thread_subscriptions (
  thread_id      uuid NOT NULL REFERENCES public.project_threads(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  state          text NOT NULL CHECK (state IN ('subscribed','muted')),
  source         text,            -- 'manual' | 'auto_reply' | 'auto_mention' (для диагностики)
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_thread_subscriptions_participant
  ON public.project_thread_subscriptions (participant_id);

-- 2. Дефолт подписки = «активный участник» (зеркало inbox_accessible_participant_ids
--    БЕЗ ветки view_all — пассивный наблюдатель по умолчанию НЕ подписан).
CREATE OR REPLACE FUNCTION public.inbox_default_subscribed(p_thread_id uuid, p_participant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH t AS (
    SELECT id, project_id, owner_user_id
    FROM project_threads WHERE id = p_thread_id AND is_deleted = false
  )
  SELECT EXISTS (
    SELECT 1 FROM t
    WHERE
      CASE
        WHEN t.project_id IS NOT NULL THEN
          EXISTS (SELECT 1 FROM project_participants pp WHERE pp.project_id = t.project_id AND pp.participant_id = p_participant_id)
          OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.thread_id = t.id AND ta.participant_id = p_participant_id)
          OR EXISTS (SELECT 1 FROM project_thread_members ptm WHERE ptm.thread_id = t.id AND ptm.participant_id = p_participant_id)
        ELSE
          EXISTS (SELECT 1 FROM participants p WHERE p.id = p_participant_id AND p.user_id = t.owner_user_id)
          OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.thread_id = t.id AND ta.participant_id = p_participant_id)
          OR EXISTS (SELECT 1 FROM project_thread_members ptm WHERE ptm.thread_id = t.id AND ptm.participant_id = p_participant_id)
      END
  );
$function$;

-- 3. Эффективная подписка: явный оверрайд → иначе дефолт.
CREATE OR REPLACE FUNCTION public.is_thread_subscribed(p_participant_id uuid, p_thread_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM project_thread_subscriptions s
                 WHERE s.thread_id = p_thread_id AND s.participant_id = p_participant_id AND s.state = 'muted') THEN false
    WHEN EXISTS (SELECT 1 FROM project_thread_subscriptions s
                 WHERE s.thread_id = p_thread_id AND s.participant_id = p_participant_id AND s.state = 'subscribed') THEN true
    ELSE inbox_default_subscribed(p_thread_id, p_participant_id)
  END;
$function$;

-- 4. При смене подписки — пересчитать непрочитанное этой пары (глушащий триггер).
CREATE OR REPLACE FUNCTION public.trg_thread_unread_subscription()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM recompute_thread_unread_for(
    COALESCE(NEW.participant_id, OLD.participant_id),
    COALESCE(NEW.thread_id, OLD.thread_id)
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS thread_unread_on_subscription ON public.project_thread_subscriptions;
CREATE TRIGGER thread_unread_on_subscription
  AFTER INSERT OR UPDATE OR DELETE ON public.project_thread_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.trg_thread_unread_subscription();

-- 5. RLS: пользователь управляет ТОЛЬКО своей подпиской (своими participants).
ALTER TABLE public.project_thread_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pts_select ON public.project_thread_subscriptions;
CREATE POLICY pts_select ON public.project_thread_subscriptions
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM participants p WHERE p.id = participant_id AND p.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS pts_write ON public.project_thread_subscriptions;
CREATE POLICY pts_write ON public.project_thread_subscriptions
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM participants p WHERE p.id = participant_id AND p.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM participants p WHERE p.id = participant_id AND p.user_id = (SELECT auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_thread_subscriptions TO authenticated;
GRANT ALL ON public.project_thread_subscriptions TO service_role;
