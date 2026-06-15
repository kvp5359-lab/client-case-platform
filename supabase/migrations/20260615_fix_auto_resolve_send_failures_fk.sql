-- Фикс латентного бага (с 28 мая): триггер auto_resolve_send_failures_on_sent
-- писал resolved_by = NEW.sender_participant_id (participants.id) в колонку с
-- FK на auth.users(id). participants.id ≠ auth.users.id → 23503 (FK violation),
-- что валило КАЖДЫЙ переход send_status → 'sent'. Сообщение залипало в 'failed'
-- несмотря на реальную доставку в Telegram → пользователь жал «Повторить» →
-- ДУБЛЬ. Проявлялось, когда первая отправка дала транзиентный сетевой фейл
-- (открытая failure-запись) + отправитель — participant (id≠user_id, всегда).
--
-- Фикс: в авто-закрытии НЕ трогаем resolved_by (закрытие системное, «кем» не
-- важно — достаточно resolved_at).
CREATE OR REPLACE FUNCTION public.auto_resolve_send_failures_on_sent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.send_status = 'sent' AND OLD.send_status IS DISTINCT FROM 'sent' THEN
    UPDATE public.message_send_failures
    SET resolved_at = now()
    WHERE resolved_at IS NULL
      AND metadata->>'message_id' = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$function$;
