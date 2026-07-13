-- Защита от гонки создания лид-диалога: клиент жмёт Start и сразу пишет —
-- два параллельных webhook'а могли завести два треда одному (клиент, бот).
-- Partial unique гарантирует один активный диалог на пару. Групп не задевает
-- (у них уникальность (chat, integration) уже соблюдается по данным; NULL
-- integration_id — легаси-группы — исключены из индекса).
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_telegram_chats_chat_integration_active
  ON public.project_telegram_chats (telegram_chat_id, integration_id)
  WHERE is_active = true AND integration_id IS NOT NULL;
