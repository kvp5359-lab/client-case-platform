-- Кэш аватаров клиентов из мессенджеров.
--
-- Telegram: один аватар на tg_user_id (общий для всех воркспейсов — это
-- публичный аватар пользователя в TG). Если is_missing=true — недавно
-- проверяли, фото нет; не дёргаем заново до истечения fetched_at.
CREATE TABLE IF NOT EXISTS public.telegram_user_avatars (
  tg_user_id BIGINT PRIMARY KEY,
  avatar_url TEXT,
  is_missing BOOLEAN NOT NULL DEFAULT false,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.telegram_user_avatars ENABLE ROW LEVEL SECURITY;

-- SELECT: любой аутентифицированный (URL аватара — публичный по природе)
DROP POLICY IF EXISTS "telegram_user_avatars_select" ON public.telegram_user_avatars;
CREATE POLICY "telegram_user_avatars_select" ON public.telegram_user_avatars
  FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE — только service role (из edge function)
DROP POLICY IF EXISTS "telegram_user_avatars_service" ON public.telegram_user_avatars;
CREATE POLICY "telegram_user_avatars_service" ON public.telegram_user_avatars
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Wazzup отдаёт avatarUri в webhook'ах. Кэшируем на уровне треда — у каждого
-- клиента свой чат, и тред уже однозначно идентифицирует контакта.
ALTER TABLE public.project_threads
  ADD COLUMN IF NOT EXISTS wazzup_contact_avatar_url TEXT;
