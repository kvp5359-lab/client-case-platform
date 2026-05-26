-- Фикс: вложения во внутреннем чате (без TG/Wazzup/MTProto/Email) застревали в pending.
--
-- Симптом (баг от 2026-05-26):
--   Анна Бурнаева в чате без подключённого Telegram отправляет текст + 3 docx.
--   shouldSplit на фронте делит на 2 записи: текстовая (становится sent) и
--   файловая с content='📎', has_attachments=true. Файловая навсегда висит
--   в send_status='pending', через 60 сек локальный таймер красит её красным,
--   кнопка «Повторить отправку» бесполезна (статус в БД — pending, retry-trigger
--   работает только на failed→pending).
--
-- Корневая причина:
--   В dispatch_message_to_channels стояла ранняя защитная ветка
--     IF NEW.has_attachments = true AND NOT p_force_attachments THEN RETURN; END IF;
--   Её смысл: «для записи с вложениями триггер не отправляет — это делает
--   фронт через invoke на соответствующий *-send» (так сделано во избежание
--   race: триггер мог стартовать отправку до того, как фронт успел залить
--   файлы в Storage).
--
--   Проблема: эта защита глобальная и срабатывает ДО проверки канала. Для
--   тредов вообще без внешнего канала (внутренний чат сотрудников) RETURN
--   уходит, а финальный UPDATE send_status='sent' (для тредов без каналов)
--   находится ниже и недостижим.
--
-- Решение:
--   Перенести проверку has_attachments внутрь каждой ветки канала — ровно
--   перед dispatch_send_http. Тогда:
--     - При наличии внешнего канала + has_attachments → RETURN (фронт инвоукнет).
--     - При отсутствии внешнего канала → пропускаем все ветки и доходим
--       до финального UPDATE send_status='sent' (записи без канала = доставлять
--       нечего = считаем доставленным сразу).
--
-- Плюс backfill уже застрявших сообщений того же класса.

CREATE OR REPLACE FUNCTION public.dispatch_message_to_channels(p_message_id uuid, p_force_attachments boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  NEW project_messages%ROWTYPE;
  v_tg_chat RECORD;
  v_mtproto_session_user_id UUID;
  v_mtproto_client_tg_user_id BIGINT;
  v_business_connection_id TEXT;
  v_wazzup_channel_id UUID;
  v_wazzup_chat_id TEXT;
  v_email_send_account_id UUID;
  v_is_email_thread BOOLEAN;
  v_reply_tg_msg_id BIGINT;
  v_attach_flag BOOLEAN;
BEGIN
  SELECT * INTO NEW FROM project_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NEW.source IN (
    'telegram','telegram_service','telegram_business','telegram_mtproto',
    'bot_event','wazzup','email_internal'
  ) THEN
    RETURN;
  END IF;

  IF NEW.sender_participant_id IS NULL AND (NEW.content IS NULL OR NEW.content = '') THEN
    RETURN;
  END IF;

  v_attach_flag := (NEW.has_attachments = true AND p_force_attachments);

  -- Email-ветка: если тред email — отправляем через edge function. Для
  -- email-вложений фронт сам инвоукает email-internal-send после загрузки
  -- файлов в Storage (см. messengerService.send.ts), поэтому здесь RETURN
  -- без отправки.
  IF NEW.thread_id IS NOT NULL THEN
    SELECT pt.email_send_account_id,
           (pt.email_send_account_id IS NOT NULL OR EXISTS (
              SELECT 1 FROM project_messages pm2
              WHERE pm2.thread_id = NEW.thread_id
                AND pm2.source = 'email_internal'
              LIMIT 1
           ))
    INTO v_email_send_account_id, v_is_email_thread
    FROM project_threads pt WHERE pt.id = NEW.thread_id;

    IF v_is_email_thread THEN
      IF NEW.has_attachments = true THEN
        RETURN;
      END IF;

      PERFORM public.dispatch_send_http(
        'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/email-internal-send',
        jsonb_build_object('message_id', NEW.id),
        NEW.id,
        'email-internal-send'
      );
      RETURN;
    END IF;
  END IF;

  -- MTProto-ветка: личный TG-аккаунт сотрудника. Вложения шлёт фронт
  -- (telegram-mtproto-send) после загрузки в Storage — здесь RETURN.
  IF NEW.thread_id IS NOT NULL THEN
    SELECT mtproto_session_user_id, mtproto_client_tg_user_id
    INTO v_mtproto_session_user_id, v_mtproto_client_tg_user_id
    FROM project_threads WHERE id = NEW.thread_id;

    IF v_mtproto_session_user_id IS NOT NULL AND v_mtproto_client_tg_user_id IS NOT NULL THEN
      IF NEW.has_attachments = true AND NOT p_force_attachments THEN
        RETURN;
      END IF;
      IF NEW.reply_to_message_id IS NOT NULL THEN
        SELECT telegram_message_id INTO v_reply_tg_msg_id
        FROM project_messages WHERE id = NEW.reply_to_message_id;
      END IF;
      PERFORM public.dispatch_send_http(
        'https://mtproto.kvp-projects.com/messages/send',
        jsonb_build_object(
          'message_id_internal', NEW.id,
          'user_id', v_mtproto_session_user_id,
          'client_tg_user_id', v_mtproto_client_tg_user_id,
          'text', NEW.content,
          'reply_to_telegram_message_id', v_reply_tg_msg_id
        ),
        NEW.id,
        'mtproto-send'
      );
      RETURN;
    END IF;
  END IF;

  -- Telegram Business: вложения шлёт фронт (telegram-business-send).
  IF NEW.thread_id IS NOT NULL THEN
    SELECT business_connection_id INTO v_business_connection_id
    FROM project_threads WHERE id = NEW.thread_id;
    IF v_business_connection_id IS NOT NULL THEN
      IF NEW.has_attachments = true AND NOT p_force_attachments THEN
        RETURN;
      END IF;
      PERFORM public.dispatch_send_http(
        'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/telegram-business-send',
        jsonb_build_object('message_id', NEW.id)
          || CASE WHEN v_attach_flag THEN jsonb_build_object('attachments_only', true) ELSE '{}'::jsonb END,
        NEW.id,
        'telegram-business-send'
      );
      RETURN;
    END IF;
  END IF;

  -- Wazzup (WhatsApp/Instagram): вложения шлёт фронт (wazzup-send).
  IF NEW.thread_id IS NOT NULL THEN
    SELECT wazzup_channel_id, wazzup_chat_id INTO v_wazzup_channel_id, v_wazzup_chat_id
    FROM project_threads WHERE id = NEW.thread_id;
    IF v_wazzup_channel_id IS NOT NULL AND v_wazzup_chat_id IS NOT NULL THEN
      IF NEW.has_attachments = true AND NOT p_force_attachments THEN
        RETURN;
      END IF;
      PERFORM public.dispatch_send_http(
        'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/wazzup-send',
        jsonb_build_object('message_id', NEW.id)
          || CASE WHEN v_attach_flag THEN jsonb_build_object('attachments_only', true) ELSE '{}'::jsonb END,
        NEW.id,
        'wazzup-send'
      );
      RETURN;
    END IF;
  END IF;

  -- Telegram (групповой бот): вложения шлёт фронт (telegram-send-message
  -- с attachments_only=true).
  IF NEW.thread_id IS NOT NULL THEN
    SELECT * INTO v_tg_chat FROM project_telegram_chats
    WHERE thread_id = NEW.thread_id AND is_active = true;
  END IF;

  IF NOT FOUND AND NEW.thread_id IS NULL AND NEW.channel IS NOT NULL THEN
    SELECT * INTO v_tg_chat FROM project_telegram_chats
    WHERE project_id = NEW.project_id AND channel = NEW.channel AND is_active = true;
  END IF;

  IF v_tg_chat.id IS NOT NULL THEN
    IF NEW.has_attachments = true AND NOT p_force_attachments THEN
      RETURN;
    END IF;
    IF NEW.reply_to_message_id IS NOT NULL AND v_reply_tg_msg_id IS NULL THEN
      SELECT telegram_message_id INTO v_reply_tg_msg_id
      FROM project_messages WHERE id = NEW.reply_to_message_id;
    END IF;

    PERFORM public.dispatch_send_http(
      'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/telegram-send-message',
      jsonb_build_object(
        'message_id', NEW.id,
        'project_id', NEW.project_id,
        'content', NEW.content,
        'sender_name', NEW.sender_name,
        'sender_role', NEW.sender_role,
        'telegram_chat_id', v_tg_chat.telegram_chat_id,
        'reply_to_telegram_message_id', v_reply_tg_msg_id
      )
        || CASE WHEN v_attach_flag THEN jsonb_build_object('attachments_only', true) ELSE '{}'::jsonb END,
      NEW.id,
      'telegram-send-message'
    );
    RETURN;
  END IF;

  -- Дошли сюда — значит ни один канал не подходит. Это внутренний тред
  -- (общение между сотрудниками в проекте), отправлять некуда. Считаем
  -- сообщение доставленным сразу, независимо от has_attachments.
  UPDATE public.project_messages
  SET send_status = 'sent',
      send_failed_reason = NULL
  WHERE id = NEW.id
    AND send_status = 'pending';
END;
$function$;

-- Backfill: уже застрявшие сообщения с has_attachments=true во внутренних
-- тредах без внешних каналов — переводим в sent. По БД на момент миграции
-- это `5b692239` (Анна Бурнаева, 3 docx) и потенциально другие, которые
-- незаметно для пользователей висят в pending.
UPDATE public.project_messages pm
SET send_status = 'sent',
    send_failed_reason = NULL
WHERE pm.send_status = 'pending'
  AND pm.has_attachments = true
  AND pm.source = 'web'
  AND pm.thread_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.project_threads pt
    WHERE pt.id = pm.thread_id
      AND (
        pt.business_connection_id IS NOT NULL
        OR pt.mtproto_session_user_id IS NOT NULL
        OR pt.wazzup_channel_id IS NOT NULL
        OR pt.email_send_account_id IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.project_telegram_chats c
          WHERE c.thread_id = pt.id AND c.is_active = true
        )
        OR pt.type = 'email'
      )
  );
