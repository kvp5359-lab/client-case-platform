-- Автоматически добавляем telegram_message_id в массив telegram_message_ids
-- при INSERT/UPDATE project_messages. Это избавляет edge-функции от необходимости
-- вручную собирать массив — триггер гарантирует, что массив всегда включает
-- актуальный telegram_message_id.

CREATE OR REPLACE FUNCTION public.sync_telegram_message_ids()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.telegram_message_id IS NOT NULL
     AND NOT (NEW.telegram_message_ids @> ARRAY[NEW.telegram_message_id]) THEN
    NEW.telegram_message_ids := array_append(
      COALESCE(NEW.telegram_message_ids, '{}'),
      NEW.telegram_message_id
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_telegram_message_ids ON public.project_messages;
CREATE TRIGGER trg_sync_telegram_message_ids
  BEFORE INSERT OR UPDATE OF telegram_message_id ON public.project_messages
  FOR EACH ROW EXECUTE FUNCTION public.sync_telegram_message_ids();

UPDATE public.project_messages
SET telegram_message_ids = ARRAY[telegram_message_id]
WHERE telegram_message_id IS NOT NULL
  AND NOT (telegram_message_ids @> ARRAY[telegram_message_id]);
