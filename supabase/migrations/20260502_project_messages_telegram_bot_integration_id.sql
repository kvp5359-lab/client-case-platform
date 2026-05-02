-- Сохраняем, через какого Telegram-бота было отправлено сообщение из сервиса.
-- Нужно для edit/delete/reaction — Telegram требует, чтобы эти операции
-- выполнялись тем же ботом, который отправил исходное сообщение. Если
-- интеграция-id NULL (наследие до миграции или ответ через бота-секретаря),
-- edge-функции уходят на resolveBotToken по telegram_chat_id.

ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS telegram_bot_integration_id uuid
    REFERENCES public.workspace_integrations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pm_telegram_bot_integration
  ON public.project_messages(telegram_bot_integration_id)
  WHERE telegram_bot_integration_id IS NOT NULL;
