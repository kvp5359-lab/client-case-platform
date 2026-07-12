-- Консолидация отправки D3.1 (гибрид): RPC deliver_message — единая точка
-- доставки УЖЕ снятого с черновика сообщения через канонический диспетчер.
--
-- Зачем: публикация черновика/отложенного = UPDATE is_draft=false, на который
-- БД-триггер не срабатывает (он на INSERT). Раньше фронт слал сам и ТОЛЬКО в
-- Telegram-группу (дыра: email/wazzup/mtproto-черновики могли не уйти).
-- Теперь фронт снимает is_draft и зовёт deliver_message → dispatch_message_to_channels
-- (тот же канон, что триггер/cron: маршрутизация + гейт visibility). Текст и
-- не-email вложения уходят каноном; email-вложения диспетчер архитектурно
-- пропускает (гонка загрузки) → их дошлёт фронт-invoke, как в обычной отправке.
--
-- Совместимо с CAS-механизмом отложенной отправки (Фаза 2.2): is_draft снимает
-- ВЫЗЫВАЮЩИЙ (CAS-захват или кнопка), deliver_message его НЕ перепроверяет —
-- только доставляет. Единственность гарантирует CAS/отсутствие scheduled у кнопки.
--
-- Безопасность: только автор сообщения (auth.uid) или service_role. Гейт
-- visibility — внутри dispatch_message_to_channels (внутреннее не уйдёт клиенту).

CREATE OR REPLACE FUNCTION public.deliver_message(p_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_sender uuid; v_has_att boolean;
BEGIN
  SELECT p.user_id, pm.has_attachments
    INTO v_sender, v_has_att
  FROM public.project_messages pm
  LEFT JOIN public.participants p ON p.id = pm.sender_participant_id
  WHERE pm.id = p_message_id;

  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'Message not found or has no sender';
  END IF;
  IF coalesce(auth.role(),'') <> 'service_role' AND v_sender <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: only the author can deliver this message'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.dispatch_message_to_channels(p_message_id, coalesce(v_has_att, false));
END;
$function$;
REVOKE ALL ON FUNCTION public.deliver_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deliver_message(uuid) TO authenticated, service_role;
