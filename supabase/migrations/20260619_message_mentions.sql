-- Фаза 3: @упоминания. message_mentions — кого упомянули в сообщении.
-- Поведение: @тег ПОДПИСЫВАЕТ упомянутого на тред (он потом может отписаться).
-- Реализовано триггером автоподписки на вставку упоминания.

CREATE TABLE IF NOT EXISTS public.message_mentions (
  message_id     uuid NOT NULL REFERENCES public.project_messages(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_message_mentions_participant
  ON public.message_mentions (participant_id);

-- Автоподписка: упомянули участника → подписываем его на тред.
-- (subscription-триггер пересчитает непрочитанное.) Перебивает mute — @тег это
-- осознанное «нужен ты»; человек может отписаться снова.
CREATE OR REPLACE FUNCTION public.trg_mention_autosubscribe()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_thread uuid;
BEGIN
  SELECT thread_id INTO v_thread FROM project_messages WHERE id = NEW.message_id;
  IF v_thread IS NULL THEN RETURN NEW; END IF;
  INSERT INTO project_thread_subscriptions (thread_id, participant_id, state, source)
  VALUES (v_thread, NEW.participant_id, 'subscribed', 'auto_mention')
  ON CONFLICT (thread_id, participant_id)
  DO UPDATE SET state = 'subscribed', source = 'auto_mention', updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS mention_autosubscribe ON public.message_mentions;
CREATE TRIGGER mention_autosubscribe
  AFTER INSERT ON public.message_mentions
  FOR EACH ROW EXECUTE FUNCTION public.trg_mention_autosubscribe();

-- RLS: читать — кто имеет доступ к треду сообщения; вставлять — автор сообщения.
ALTER TABLE public.message_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_mentions_select ON public.message_mentions;
CREATE POLICY message_mentions_select ON public.message_mentions
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM project_messages m
    WHERE m.id = message_id AND m.thread_id IS NOT NULL
      AND can_user_access_thread(m.thread_id, (SELECT auth.uid()))
  ));

DROP POLICY IF EXISTS message_mentions_insert ON public.message_mentions;
CREATE POLICY message_mentions_insert ON public.message_mentions
  FOR INSERT TO public
  WITH CHECK (EXISTS (
    SELECT 1 FROM project_messages m
    WHERE m.id = message_id
      AND m.sender_participant_id IN (
        SELECT id FROM participants WHERE user_id = (SELECT auth.uid())
      )
  ));

GRANT SELECT, INSERT ON public.message_mentions TO authenticated;
GRANT ALL ON public.message_mentions TO service_role;
