-- Разрешаем тип 'email' для project_threads.
-- UI-типы (TabMode) уже используют 'task' | 'chat' | 'email'
-- (src/components/messenger/chatSettingsTypes.ts), но БД-CHECK
-- ограничивал chat/task. Расширяем чтобы webhook resend-webhook мог
-- создавать треды с правильным типом.
ALTER TABLE public.project_threads
  DROP CONSTRAINT IF EXISTS project_threads_type_check;
ALTER TABLE public.project_threads
  ADD CONSTRAINT project_threads_type_check
  CHECK (type = ANY (ARRAY['chat'::text, 'task'::text, 'email'::text]));
