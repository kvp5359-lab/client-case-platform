-- Email (Resend) — добавляем значение в enum message_source.
-- Должно быть в отдельной миграции: новое значение enum нельзя использовать
-- в той же транзакции, в которой оно создано.

ALTER TYPE public.message_source ADD VALUE IF NOT EXISTS 'email_internal';
