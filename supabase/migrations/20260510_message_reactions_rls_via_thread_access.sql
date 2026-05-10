-- Старая SELECT-политика на message_reactions использовала JOIN
-- project_participants, что не работает для workspace-level тредов
-- (project_id=NULL) и системных инбоксов (project_participants
-- содержит только владельца проекта). В итоге в личных диалогах
-- Telegram Business / MTProto / Wazzup реакции на баблах не
-- показывались, хотя список тредов их видит (там — service_definer
-- RPC, обходит RLS).
--
-- Новая политика: SELECT по реакциям разрешён, если у пользователя
-- есть доступ к треду этого сообщения. Та же логика, что и у
-- project_messages — через can_user_access_thread.

DROP POLICY IF EXISTS "message_reactions_select" ON public.message_reactions;

CREATE POLICY "message_reactions_select" ON public.message_reactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_messages pm
      WHERE pm.id = message_reactions.message_id
        AND pm.thread_id IS NOT NULL
        AND can_user_access_thread(pm.thread_id, (SELECT auth.uid()))
    )
  );
