-- Настройки перевода на уровне воркспейса.
-- translation_model: если NULL — берём общую workspaces.ai_model.
-- translation_use_thread_context: если true — edge function передаёт LLM
--   последние N сообщений треда как контекст для лучшего перевода.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS translation_model text,
  ADD COLUMN IF NOT EXISTS translation_use_thread_context boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workspaces.translation_model IS 'Модель для перевода (overrides ai_model для translate-message). NULL — использовать ai_model.';
COMMENT ON COLUMN public.workspaces.translation_use_thread_context IS 'Передавать N последних сообщений треда LLM при переводе для улучшения качества.';
