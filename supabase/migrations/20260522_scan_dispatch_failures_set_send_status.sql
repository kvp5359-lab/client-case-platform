-- Расширение watchdog'а: при не-2xx ответе edge function — переводим
-- сообщение в send_status='failed'. Это страховка на случай, когда
-- сама edge function упала с throw до того, как успела отметить статус
-- (markMessageFailed выкинул из-за ошибки UPDATE и т.п.).
-- Без этой подстраховки сообщение остаётся в pending, фронт не показывает
-- красный бабл, юзер не может нажать «Повторить».
--
-- UPDATE происходит только для строк в статусе pending — это защищает от
-- ситуации, когда какой-то отложенный не-2xx ответ догоняется уже после
-- успешной доставки (сообщение в sent), и мы случайно перебиваем статус.

CREATE OR REPLACE FUNCTION public.scan_dispatch_failures()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dispatch RECORD;
  v_msg RECORD;
  v_existing_id uuid;
  v_error_text text;
  v_error_code text;
  v_count integer := 0;
BEGIN
  FOR v_dispatch IN
    SELECT sd.request_id, sd.message_id, sd.function_name, sd.dispatched_at,
           r.status_code, r.error_msg, r.content
    FROM public.message_send_dispatch sd
    JOIN net._http_response r ON r.id = sd.request_id
    WHERE sd.processed_at IS NULL
    ORDER BY sd.dispatched_at
    LIMIT 200
  LOOP
    -- 2xx — успех, просто помечаем processed
    IF v_dispatch.status_code BETWEEN 200 AND 299 THEN
      UPDATE public.message_send_dispatch SET processed_at = now()
        WHERE request_id = v_dispatch.request_id;
      CONTINUE;
    END IF;

    IF v_dispatch.status_code IS NULL THEN
      v_error_text := 'Сервис ' || v_dispatch.function_name || ' не ответил'
        || COALESCE(': ' || v_dispatch.error_msg, '');
      v_error_code := 'NETWORK_ERROR';
    ELSE
      v_error_text := 'Сервис ' || v_dispatch.function_name || ' вернул ошибку '
        || v_dispatch.status_code
        || COALESCE(': ' || LEFT(v_dispatch.content::text, 300), '');
      v_error_code := 'HTTP_' || v_dispatch.status_code;
    END IF;

    -- Подстраховка статуса: только pending → failed, чтобы не перетереть sent.
    UPDATE public.project_messages
    SET send_status = 'failed',
        send_failed_reason = COALESCE(send_failed_reason, LEFT(v_error_text, 500))
    WHERE id = v_dispatch.message_id
      AND send_status = 'pending';

    SELECT id INTO v_existing_id FROM public.message_send_failures f
      WHERE (f.metadata->>'dispatch_request_id')::bigint = v_dispatch.request_id
         OR (f.thread_id IS NOT DISTINCT FROM (
              SELECT thread_id FROM public.project_messages WHERE id = v_dispatch.message_id
            )
            AND f.created_at >= v_dispatch.dispatched_at - interval '5 seconds'
            AND f.created_at <= v_dispatch.dispatched_at + interval '60 seconds')
      LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      UPDATE public.message_send_dispatch SET processed_at = now()
        WHERE request_id = v_dispatch.request_id;
      CONTINUE;
    END IF;

    SELECT pm.thread_id, pm.workspace_id, pm.project_id, pm.sender_participant_id,
           pm.content,
           p.user_id
    INTO v_msg
    FROM public.project_messages pm
    LEFT JOIN public.participants p ON p.id = pm.sender_participant_id
    WHERE pm.id = v_dispatch.message_id;

    IF v_msg IS NULL OR v_msg.user_id IS NULL THEN
      UPDATE public.message_send_dispatch SET processed_at = now()
        WHERE request_id = v_dispatch.request_id;
      CONTINUE;
    END IF;

    INSERT INTO public.message_send_failures (
      workspace_id, project_id, thread_id, user_id, participant_id,
      content, error_text, error_code, source,
      metadata, created_at
    ) VALUES (
      v_msg.workspace_id, v_msg.project_id, v_msg.thread_id, v_msg.user_id, v_msg.sender_participant_id,
      LEFT(COALESCE(v_msg.content, ''), 500),
      v_error_text, v_error_code, v_dispatch.function_name,
      jsonb_build_object(
        'dispatch_request_id', v_dispatch.request_id,
        'origin', 'dispatch_watchdog',
        'http_status', v_dispatch.status_code,
        'message_id', v_dispatch.message_id
      ),
      now()
    );

    UPDATE public.message_send_dispatch SET processed_at = now()
      WHERE request_id = v_dispatch.request_id;
    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.message_send_dispatch
  WHERE processed_at IS NOT NULL AND processed_at < now() - interval '3 days';

  RETURN v_count;
END;
$function$;
