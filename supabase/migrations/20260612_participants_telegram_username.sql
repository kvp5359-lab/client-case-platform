-- Username собеседника в Telegram (для MTProto-контактов и не только).
-- Нужен, чтобы из карточки контакта можно было найти диалог в самом Telegram
-- (по @username). Резолвится в mtproto-service при входящем сообщении.
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS telegram_username text;

COMMENT ON COLUMN public.participants.telegram_username IS
  'Telegram @username собеседника (без @). Заполняется из mtproto-service при резолве контакта.';
