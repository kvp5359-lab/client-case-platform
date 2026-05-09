-- Включаем project_threads в публикацию Supabase Realtime.
-- Без этого client-side подписка на postgres_changes/INSERT не получает
-- событий — Postgres просто их не публикует. Нужно для realtime
-- инвалидации списка тредов проекта при создании треда из webhook'ов
-- (resend-webhook, и в перспективе других интеграций).
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_threads;
