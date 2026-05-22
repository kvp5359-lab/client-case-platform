-- Кнопка «Повторить» на фронте — это просто UPDATE send_status в 'pending'.
-- Этот триггер ловит такой апдейт и заново дёргает каналы через
-- dispatch_message_to_channels (тот же путь, что и при INSERT).
--
-- Срабатывает только при переходе из failed в pending. INSERT не трогаем
-- (там работает notify_telegram_on_new_message).

CREATE OR REPLACE FUNCTION public.notify_on_send_status_retry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Только переход failed → pending = ручной retry.
  -- Прочие изменения send_status (sent←pending, failed←pending) — нормальный
  -- жизненный цикл, не требуют re-dispatch.
  IF OLD.send_status = 'failed' AND NEW.send_status = 'pending' THEN
    PERFORM public.dispatch_message_to_channels(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_on_send_status_retry ON public.project_messages;
CREATE TRIGGER trg_notify_on_send_status_retry
  AFTER UPDATE OF send_status ON public.project_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_send_status_retry();
