-- (C) Per-bot telegram_message_id — правильная подпись реакций в multi-bot группах.
--
-- В группе с несколькими ботами Telegram даёт КАЖДОМУ боту свой message_id для
-- одного сообщения. Реакция «именная» (привязана к боту) → чтобы поставить её от
-- бота реагирующего, нужен message_id ЭТОГО сообщения ДЛЯ ЕГО бота. Раньше хранили
-- один (бота-«победителя» дедупа) → чужой бот не мог реагировать.
--
-- Решение: карта bot_key → message_id на каждом сообщении.
--   telegram_bot_msg_ids = { "secretary": 328, "<integration_id>": 5171, ... }
-- Захват — в _shared/syncTelegramIncomingMessage.ts на всех исходах дедупа.
-- Чтение — в telegram-set-reaction (message_id для бота реагирующего).

ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS telegram_bot_msg_ids jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Атомарная запись (jsonb_set под row-lock — безопасно при одновременных
-- webhook'ах разных ботов). Не перезаписываем существующий ключ (первый id
-- бота стабилен).
CREATE OR REPLACE FUNCTION public.record_telegram_bot_msg_id(
  p_row_id uuid, p_bot_key text, p_msg_id bigint
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  UPDATE public.project_messages
  SET telegram_bot_msg_ids = jsonb_set(
        COALESCE(telegram_bot_msg_ids, '{}'::jsonb),
        ARRAY[p_bot_key],
        to_jsonb(p_msg_id),
        true)
  WHERE id = p_row_id
    AND p_bot_key IS NOT NULL
    AND NOT (COALESCE(telegram_bot_msg_ids, '{}'::jsonb) ? p_bot_key);
$$;

REVOKE ALL ON FUNCTION public.record_telegram_bot_msg_id(uuid, text, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.record_telegram_bot_msg_id(uuid, text, bigint) TO service_role;
