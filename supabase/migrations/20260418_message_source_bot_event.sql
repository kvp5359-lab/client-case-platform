-- Новое значение в enum message_source для событий от бота,
-- которые ДОЛЖНЫ считаться непрочитанными (в отличие от 'telegram_service',
-- которое RPC get_inbox_threads_v2 исключает из счётчика).
--
-- Используется так:
--   - просмотр статьи клиентом  → 'telegram_service' (не дёргает бейдж)
--   - загрузка документа в слот → 'bot_event'        (дёргает бейдж)

ALTER TYPE public.message_source ADD VALUE IF NOT EXISTS 'bot_event';
