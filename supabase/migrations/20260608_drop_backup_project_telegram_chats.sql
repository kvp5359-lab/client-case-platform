-- Удаление резервной копии project_telegram_chats (снимок 28 мая при унификации
-- Telegram-ботов). Живая таблица работает и защищена RLS; бэкап без RLS светил
-- данные в схеме public → Supabase Security Advisor (rls_disabled_in_public, ERROR).
-- DROP применён в проде вручную 2026-06-08; файл фиксирует изменение в истории схемы.
DROP TABLE IF EXISTS public._backup_project_telegram_chats_20260528;
