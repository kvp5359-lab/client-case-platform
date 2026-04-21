-- Одна наша запись project_messages может соответствовать нескольким TG-сообщениям
-- (текст + каждый файл). Реакции приходят отдельно на каждое TG-сообщение.
-- Чтобы реакции на разные элементы бабла (текст, файлы) не затирали друг друга —
-- храним id конкретного TG-сообщения, на котором стоит реакция, и при upsert
-- удаляем только записи с тем же source_tg_msg_id.

ALTER TABLE public.message_reactions
  ADD COLUMN IF NOT EXISTS telegram_source_message_id bigint;

CREATE INDEX IF NOT EXISTS idx_message_reactions_source_tg
  ON public.message_reactions (message_id, telegram_source_message_id)
  WHERE telegram_source_message_id IS NOT NULL;
