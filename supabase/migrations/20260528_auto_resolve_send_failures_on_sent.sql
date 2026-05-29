-- Когда сообщение становится sent (любым путём: success edge function, ретрай,
-- manual recovery через UPDATE), автоматически закрываем соответствующие
-- открытые записи в message_send_failures. Иначе тосты «Не удалось отправить»
-- висят зомбями, и пользователь рискует нажать «Повторить» → дубль в TG.
--
-- Связь делаем через metadata->>'message_id'. Для watchdog-failures
-- (scan_dispatch_failures) и server-side log'ов это поле всегда заполнено.
--
-- Случай 2026-05-28: после фикса uq_telegram_message_per_chat (миграция
-- 20260528_fix_uq_telegram_message_per_chat_include_bot) 4 сообщения Анны
-- recovery'или вручную через UPDATE send_status='sent', но в БД остались
-- открытые записи message_send_failures с тем же message_id → у пользователя
-- висели 4 зомби-тоста. Триггер закрывает такие записи автоматически + один
-- раз backfill'ит уже накопившиеся.

CREATE OR REPLACE FUNCTION public.auto_resolve_send_failures_on_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.send_status = 'sent' AND OLD.send_status IS DISTINCT FROM 'sent' THEN
    UPDATE public.message_send_failures
    SET resolved_at = now(),
        resolved_by = COALESCE(resolved_by, NEW.sender_participant_id)
    WHERE resolved_at IS NULL
      AND metadata->>'message_id' = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_resolve_send_failures_on_sent ON public.project_messages;
CREATE TRIGGER trg_auto_resolve_send_failures_on_sent
AFTER UPDATE OF send_status ON public.project_messages
FOR EACH ROW
EXECUTE FUNCTION public.auto_resolve_send_failures_on_sent();

-- Backfill: закрываем все висящие failures, для которых соответствующее
-- сообщение уже sent.
UPDATE public.message_send_failures msf
SET resolved_at = now()
WHERE msf.resolved_at IS NULL
  AND msf.metadata->>'message_id' IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.project_messages pm
    WHERE pm.id::text = msf.metadata->>'message_id'
      AND pm.send_status = 'sent'
  );
