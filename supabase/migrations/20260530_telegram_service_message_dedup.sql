-- Multi-bot dedup для СЛУЖЕБНЫХ сообщений Telegram
-- (вступил/вышел/создал группу/переименовал — source='telegram_service').
--
-- Проблема: в группе с 2+ ботами (секретарь + личные боты сотрудников)
-- каждый бот получает свой webhook на одно и то же служебное событие, но с
-- РАЗНЫМ telegram_message_id. Поэтому:
--   - uq_telegram_message_per_chat (chat, msg_id, bot) НЕ схлопывает —
--     message_id разный у разных ботов;
--   - uq_project_messages_telegram_content_dedup НЕ покрывает — он только
--     WHERE source='telegram', а служебные пишутся как 'telegram_service'.
-- Итог: служебное событие задваивалось (по строке на каждого бота), хотя в
-- самом Telegram оно одно. См. .claude/rules/gotchas.md (multi-bot dedup).
--
-- Fix: отдельный partial UNIQUE по (chat_id, date, md5(content)) только для
-- 'telegram_service'. Дата события одинакова у всех ботов → одно и то же
-- событие схлопывается, разные события (разный текст/время) — сохраняются.
-- Существующий рабочий индекс обычных сообщений не трогаем.
--
-- Старые задвоенные строки имеют telegram_message_date = NULL (до этого фикса
-- поле не заполнялось) → не попадают в partial-индекс (WHERE date IS NOT NULL),
-- поэтому CREATE не упадёт на исторических дублях. История остаётся как есть,
-- дедуп включается для новых событий (sync.ts теперь пишет дату).

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_messages_telegram_service_dedup
  ON public.project_messages (
    telegram_chat_id,
    telegram_message_date,
    md5(COALESCE(content, ''))
  )
  WHERE (
    source = 'telegram_service'
    AND telegram_chat_id IS NOT NULL
    AND telegram_message_date IS NOT NULL
  );
