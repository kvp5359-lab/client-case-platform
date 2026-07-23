-- Привязка треда к Telegram-группе видна всем, кто видит сам тред.
--
-- Было: SELECT/UPDATE на project_telegram_chats пускали только участников
-- проекта и владельца треда. Владелец воркспейса (view_all), исполнитель,
-- участник треда — не проходили ни одну ветку → фронт не видел привязку →
-- тред выглядел «внутренним»: без режима «Всем» в композере и без чёрно-серой
-- раскраски командных сообщений (инцидент 2026-07-23, третий за день случай
-- класса «владелец не записан участником проекта»).
--
-- Добавлена ветка через единую функцию доступа can_user_access_thread(uuid,uuid)
-- — та же, что охраняет project_messages: «видишь переписку → видишь привязку»,
-- рассинхрон невозможен. Прежние ветки сохранены (привязки без thread_id
-- продолжают ходить по ним).
--
-- ⚠️ Применено в прод через MCP 2026-07-23 (ALTER POLICY).

ALTER POLICY project_tg_chats_select ON public.project_telegram_chats
USING (
  (EXISTS ( SELECT 1
     FROM (project_participants pp
       JOIN participants p ON ((p.id = pp.participant_id)))
    WHERE ((pp.project_id = project_telegram_chats.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid)))))
  OR (EXISTS ( SELECT 1
     FROM project_threads pt
    WHERE ((pt.id = project_telegram_chats.thread_id) AND (pt.owner_user_id = ( SELECT auth.uid() AS uid)))))
  OR (project_telegram_chats.thread_id IS NOT NULL
      AND can_user_access_thread(project_telegram_chats.thread_id, ( SELECT auth.uid() AS uid)))
);

ALTER POLICY project_tg_chats_update ON public.project_telegram_chats
USING (
  (EXISTS ( SELECT 1
     FROM (project_participants pp
       JOIN participants p ON ((p.id = pp.participant_id)))
    WHERE ((pp.project_id = project_telegram_chats.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid)))))
  OR (EXISTS ( SELECT 1
     FROM project_threads pt
    WHERE ((pt.id = project_telegram_chats.thread_id) AND (pt.owner_user_id = ( SELECT auth.uid() AS uid)))))
  OR (project_telegram_chats.thread_id IS NOT NULL
      AND can_user_access_thread(project_telegram_chats.thread_id, ( SELECT auth.uid() AS uid)))
);
