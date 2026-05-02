-- Привязать каждую существующую группу-клиент к записи workspace_integrations,
-- чтобы telegram-бот настраивался на уровне юрфирмы, а не сервиса.
--
-- Шаги миграции:
--  1. Колонка integration_id (nullable, FK)
--  2. Создаём 2 записи workspace_integrations типа 'telegram_workspace_bot'
--     для текущей единственной активной юрфирмы (client-case) — отдельно
--     для bot_version v1 и v2. Токен в secrets оставляем пустым: до его
--     заполнения через UI/SQL helper resolveBotToken будет фоллбэчиться на
--     env TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_TOKEN_V2.
--  3. Бэкфилл: все project_telegram_chats этой юрфирмы привязываются к
--     соответствующей записи по bot_version.
-- Откат: UPDATE project_telegram_chats SET integration_id = NULL — поведение
-- становится таким, как до миграции.

ALTER TABLE public.project_telegram_chats
  ADD COLUMN IF NOT EXISTS integration_id uuid
    REFERENCES public.workspace_integrations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ptc_integration ON public.project_telegram_chats(integration_id);

-- Запись для бота v1 (создаётся, если её ещё нет)
WITH ws AS (
  SELECT '8a946780-77e9-42cd-a05b-cdb66e53c941'::uuid AS id
), inserted AS (
  INSERT INTO public.workspace_integrations (workspace_id, type, config, secrets, is_active)
  SELECT ws.id, 'telegram_workspace_bot',
         jsonb_build_object('bot_version', 'v1', 'note', 'Migrated from env TELEGRAM_BOT_TOKEN'),
         '{}'::jsonb,
         true
  FROM ws
  WHERE NOT EXISTS (
    SELECT 1 FROM public.workspace_integrations wi
    WHERE wi.workspace_id = ws.id
      AND wi.type = 'telegram_workspace_bot'
      AND wi.config->>'bot_version' = 'v1'
  )
  RETURNING id, workspace_id
), target AS (
  SELECT id FROM inserted
  UNION ALL
  SELECT id FROM public.workspace_integrations
   WHERE workspace_id = '8a946780-77e9-42cd-a05b-cdb66e53c941'
     AND type = 'telegram_workspace_bot'
     AND config->>'bot_version' = 'v1'
   LIMIT 1
)
UPDATE public.project_telegram_chats ptc
SET integration_id = (SELECT id FROM target LIMIT 1)
WHERE ptc.workspace_id = '8a946780-77e9-42cd-a05b-cdb66e53c941'
  AND ptc.integration_id IS NULL
  AND COALESCE(ptc.bot_version, 'v1') = 'v1';

-- Запись для бота v2 (создаётся, если её ещё нет)
WITH ws AS (
  SELECT '8a946780-77e9-42cd-a05b-cdb66e53c941'::uuid AS id
), inserted AS (
  INSERT INTO public.workspace_integrations (workspace_id, type, config, secrets, is_active)
  SELECT ws.id, 'telegram_workspace_bot',
         jsonb_build_object('bot_version', 'v2', 'note', 'Migrated from env TELEGRAM_BOT_TOKEN_V2'),
         '{}'::jsonb,
         true
  FROM ws
  WHERE NOT EXISTS (
    SELECT 1 FROM public.workspace_integrations wi
    WHERE wi.workspace_id = ws.id
      AND wi.type = 'telegram_workspace_bot'
      AND wi.config->>'bot_version' = 'v2'
  )
  RETURNING id
), target AS (
  SELECT id FROM inserted
  UNION ALL
  SELECT id FROM public.workspace_integrations
   WHERE workspace_id = '8a946780-77e9-42cd-a05b-cdb66e53c941'
     AND type = 'telegram_workspace_bot'
     AND config->>'bot_version' = 'v2'
   LIMIT 1
)
UPDATE public.project_telegram_chats ptc
SET integration_id = (SELECT id FROM target LIMIT 1)
WHERE ptc.workspace_id = '8a946780-77e9-42cd-a05b-cdb66e53c941'
  AND ptc.integration_id IS NULL
  AND ptc.bot_version = 'v2';
