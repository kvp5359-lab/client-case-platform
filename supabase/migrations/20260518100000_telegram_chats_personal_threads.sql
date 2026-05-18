-- Поддержка привязки Telegram-группы к тредам без проекта (личные диалоги,
-- треды-задачи без project_id).
--
-- До этого:
--   - project_telegram_chats.project_id был NOT NULL — INSERT для треда
--     с project_id = NULL падал, /link бот говорил «✅ привязано», но
--     запись не создавалась. Отправка из сервиса и приём из Telegram
--     не работали.
--   - RLS-полиции читали только по project_id (через project_participants).
--     Даже если бы запись создалась, фронт её не увидел бы у владельца
--     личного треда.
--
-- После:
--   - project_id допускает NULL.
--   - SELECT/UPDATE проходят либо как участник проекта (старое условие),
--     либо как владелец треда (для тредов без проекта — через
--     project_threads.owner_user_id = auth.uid()).

ALTER TABLE public.project_telegram_chats ALTER COLUMN project_id DROP NOT NULL;

DROP POLICY IF EXISTS project_tg_chats_select ON public.project_telegram_chats;
CREATE POLICY project_tg_chats_select ON public.project_telegram_chats
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM project_participants pp
    JOIN participants p ON p.id = pp.participant_id
    WHERE pp.project_id = project_telegram_chats.project_id
      AND p.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM project_threads pt
    WHERE pt.id = project_telegram_chats.thread_id
      AND pt.owner_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS project_tg_chats_update ON public.project_telegram_chats;
CREATE POLICY project_tg_chats_update ON public.project_telegram_chats
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM project_participants pp
    JOIN participants p ON p.id = pp.participant_id
    WHERE pp.project_id = project_telegram_chats.project_id
      AND p.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM project_threads pt
    WHERE pt.id = project_telegram_chats.thread_id
      AND pt.owner_user_id = (SELECT auth.uid())
  )
);
