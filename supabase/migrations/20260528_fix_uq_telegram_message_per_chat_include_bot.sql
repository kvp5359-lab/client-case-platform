-- Bug 2026-05-28: разные боты в одной TG-группе имеют независимую нумерацию
-- сообщений. Старый бот когда-то использовал msg_id=328 → запись в БД с
-- (chat, 328, bot=ae023cda). Через 8 дней новый бот тоже добирается до своего
-- msg_id=328 и Edge Function пытается записать (chat, 328) для нового outgoing
-- сообщения → 23505 на uq_telegram_message_per_chat → markMessageSent throw →
-- сообщение зависает в pending/failed, хотя в TG доставлено.
--
-- Старый индекс не включал telegram_bot_integration_id, поэтому считал
-- сообщения от разных ботов в одной группе «дублями».
--
-- Фикс: расширить partial UNIQUE на bot_integration_id. NULL обрабатываем
-- через COALESCE на специальное значение, чтобы NULL'ы тоже подчинялись
-- ограничению (это secretary-bot записи, у которых stamp не ставится — для
-- них продолжаем считать (chat, msg_id) уникальным как и раньше).
--
-- См. docs/bugs/open/2026-05-28-telegram-send-stuck-pending.md.

DROP INDEX IF EXISTS public.uq_telegram_message_per_chat;

CREATE UNIQUE INDEX uq_telegram_message_per_chat
ON public.project_messages (
  telegram_chat_id,
  telegram_message_id,
  COALESCE(telegram_bot_integration_id::text, 'secretary')
)
WHERE telegram_message_id IS NOT NULL AND telegram_chat_id IS NOT NULL;

COMMENT ON INDEX public.uq_telegram_message_per_chat IS
  'Partial UNIQUE: (chat, msg_id, bot). Включает bot_integration_id, потому что разные боты в группе имеют независимую нумерацию msg_id. NULL bot (legacy secretary) → "secretary" placeholder. Bug 2026-05-28.';
