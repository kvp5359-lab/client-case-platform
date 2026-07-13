-- Telegram лид-боты: приёмник холодных лидов через рекламного бота.
--
-- Обычный бот (@BotFather) получает личку от незнакомца → создаётся личный
-- диалог (project_id=NULL) с меткой кампании. Тип интеграции 'telegram_lead_bot'
-- живёт в workspace_integrations.type (это text — ALTER TYPE не нужен).
--
-- Единственное изменение схемы — колонка-метка на треде. Связь диалог↔бот↔клиент
-- держит существующая project_telegram_chats (project_id уже nullable с 20260518).
--
-- Аддитивно, идемпотентно, нулевой риск (новая nullable-колонка).

ALTER TABLE public.project_threads
  ADD COLUMN IF NOT EXISTS lead_source jsonb;

COMMENT ON COLUMN public.project_threads.lead_source IS
  'Источник холодного лида для тредов лид-ботов: {bot_integration_id, campaign, start_payload}. NULL для не-лид-тредов.';
