-- Cron-retry для исходящих Telegram-сообщений больше не передаёт
-- reply_to_telegram_message_id.
--
-- Зачем: первый INSERT через триггер шлёт сообщение с reply_parameters.
-- Если оригинал был отправлен сторонним ботом (типичный случай — клиент
-- ответил через employee-бот сотрудника, на которого наш бот-секретарь
-- не имеет видимости), Telegram отдаёт «message to be replied not found».
-- В edge-функции есть fallback (убрать reply, повторить с blockquote),
-- но он не всегда срабатывает — тогда сообщение остаётся в pending.
--
-- Cron-retry через 60 секунд с тем же reply повторяет ту же ошибку,
-- и сообщение так и не доходит. Юзер видит «красный» бабл и кнопку
-- «Повторить отправку», которая (см. retryTelegramSend в messengerService.edit.ts)
-- НЕ передаёт reply_to_telegram_message_id — поэтому на ней всегда успех.
--
-- Этим патчем cron-retry приводится к той же логике, что и manual retry:
-- без reply, без visual-цитаты, просто текст. Контекст пользователь
-- видит и так — сообщения идут друг за другом в треде.
--
-- Значение x-internal-secret в команде заменяется на плейсхолдер и
-- проставляется отдельно в БД (см. infrastructure.md, security: ротация
-- INTERNAL_FUNCTION_SECRET — убрать значения из репо, 2026-05-17).

CREATE OR REPLACE FUNCTION public.retry_undelivered_telegram_messages()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT pm.id, pm.project_id, pm.content, pm.sender_name, pm.sender_role,
           pm.channel, pm.thread_id,
           ptc.telegram_chat_id
    FROM project_messages pm
    JOIN project_telegram_chats ptc
      ON ptc.is_active = true
      AND (
        (pm.thread_id IS NOT NULL AND ptc.thread_id = pm.thread_id)
        OR (pm.thread_id IS NULL AND ptc.project_id = pm.project_id AND ptc.channel = pm.channel)
      )
    WHERE pm.source = 'web'
      AND pm.telegram_message_id IS NULL
      AND pm.is_draft = false
      AND pm.content <> '📎'
      AND pm.telegram_retry_count < 1
      AND pm.created_at < now() - interval '60 seconds'
      AND pm.created_at > now() - interval '10 minutes'
    ORDER BY pm.created_at ASC
    LIMIT 5
  LOOP
    UPDATE project_messages
    SET telegram_retry_count = telegram_retry_count + 1
    WHERE id = r.id;

    PERFORM net.http_post(
      url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/telegram-send-message',
      body := jsonb_build_object(
        'message_id', r.id,
        'project_id', r.project_id,
        'content', r.content,
        'sender_name', r.sender_name,
        'sender_role', r.sender_role,
        'telegram_chat_id', r.telegram_chat_id
        -- reply_to_telegram_message_id намеренно НЕ передаём, см. шапку файла.
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', '__INTERNAL_FUNCTION_SECRET__'
      )
    );
  END LOOP;
END;
$function$;
