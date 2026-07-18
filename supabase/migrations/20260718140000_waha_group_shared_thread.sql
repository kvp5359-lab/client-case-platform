-- WAHA: группа = ОДИН общий тред на команду (вариант А).
-- Раньше тред группы ключевался по (waha_session_id, waha_chat_id) → при двух
-- сотрудниках в одной группе создавалось два треда (по одному на сессию),
-- сообщения дедуплились глобально по waha_message_id и оседали только в одном.
-- Теперь тред группы уникален по (workspace_id, waha_chat_id): обе сессии
-- резолвят один и тот же общий тред. Личные (1:1) чаты не затронуты.
create unique index if not exists uq_project_threads_waha_group
  on public.project_threads (workspace_id, waha_chat_id)
  where waha_group = true and is_deleted = false;
