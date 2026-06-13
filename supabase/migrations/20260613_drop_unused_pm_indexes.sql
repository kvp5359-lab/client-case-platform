-- Дроп 4 неиспользуемых вторичных индексов на project_messages (самая горячая на
-- запись таблица — каждый лишний индекс платится на КАЖДОМ INSERT входящего/
-- исходящего сообщения). Все четыре: idx_scan=0 на проде (pg_stat_user_indexes),
-- НЕ уникальные (не дедуп), НЕ покрывают внешние ключи.
--
-- ⚠️ Перф-аудит называл «5 на project_messages + 5 на message_send_failures = 10».
-- Проверка FK-покрытия показала, что дропать можно только эти 4:
--   * idx_project_messages_email_send_account_id — ЕДИНСТВЕННОЕ покрытие FK
--     email_send_account_id → email_accounts на большой таблице → ОСТАВЛЕН
--     (дроп создал бы непокрытый FK, seq-scan при удалении email-аккаунта);
--   * все 5 индексов message_send_failures — единственные покрытия своих FK
--     (integration_id/participant_id/project_id/resolved_by/user_id), а выигрыш
--     на запись там мизерный (строка пишется только при сбое отправки) → ОСТАВЛЕНЫ.
--
-- Уникальные дедуп-индексы (uq_project_messages_telegram_* — idx_scan=0, но
-- работают через конфликт на INSERT, а не сканами) НЕ трогаются.
--
-- Дропаемые:
--   idx_project_messages_email_in_reply_to          — partial по email_in_reply_to (заголовок-строка)
--   idx_project_messages_email_metadata_message_id  — expression по email_metadata->>'message_id_header'
--                                                      (рабочий аналог — idx_project_messages_email_message_id, не трогаем)
--   idx_messages_unlinked_email                      — partial (source='email' AND thread_id IS NULL)
--   idx_project_messages_draft_sender                — partial (is_draft=true), частичный → FK не покрывает
--
-- Обратимо: при необходимости индекс пересоздаётся CREATE INDEX по определению выше.

DROP INDEX IF EXISTS public.idx_project_messages_email_in_reply_to;
DROP INDEX IF EXISTS public.idx_project_messages_email_metadata_message_id;
DROP INDEX IF EXISTS public.idx_messages_unlinked_email;
DROP INDEX IF EXISTS public.idx_project_messages_draft_sender;
