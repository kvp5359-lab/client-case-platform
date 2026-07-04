-- Алерты владельцу в Telegram о сбоях: провалы отправки сообщений
-- (message_send_failures) + падения pg_cron. Раз в 10 минут pg_cron зовёт
-- run_platform_alerts(); пока не заполнен конфиг (bot_token+chat_id) — «спит».
-- Шлёт напрямую в Telegram Bot API через pg_net (без edge-функции).

CREATE TABLE IF NOT EXISTS public.platform_alert_config (
  id            integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled       boolean NOT NULL DEFAULT false,
  bot_token     text,                 -- токен любого Telegram-бота владельца
  chat_id       text,                 -- numeric id владельца (личка с ботом)
  last_check_at timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_alert_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_alert_config ENABLE ROW LEVEL SECURITY;
-- Конфиг содержит секрет (bot_token) — клиентам НЕ доступен, только service_role.
REVOKE ALL ON public.platform_alert_config FROM anon, authenticated;
GRANT ALL ON public.platform_alert_config TO service_role;

-- Проверка сбоев с момента прошлой проверки + отправка в Telegram.
CREATE OR REPLACE FUNCTION public.run_platform_alerts()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  cfg           public.platform_alert_config;
  v_since       timestamptz;
  v_send_fails  integer;
  v_cron_fails  integer;
  v_msg         text;
  v_url         text;
BEGIN
  SELECT * INTO cfg FROM platform_alert_config WHERE id = 1;
  IF NOT FOUND OR NOT cfg.enabled OR cfg.bot_token IS NULL OR cfg.chat_id IS NULL THEN
    RETURN;  -- не настроено — молчим
  END IF;
  v_since := cfg.last_check_at;

  -- Новые НЕзакрытые сбои отправки.
  SELECT count(*) INTO v_send_fails
  FROM message_send_failures
  WHERE resolved_at IS NULL AND created_at > v_since;

  -- Новые падения pg_cron (кроме самих алертов).
  SELECT count(*) INTO v_cron_fails
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE jrd.status = 'failed'
    AND jrd.start_time > v_since
    AND j.jobname <> 'platform-alerts';

  -- Сдвигаем водяной знак всегда (чтобы не повторять).
  UPDATE platform_alert_config SET last_check_at = now(), updated_at = now() WHERE id = 1;

  IF v_send_fails = 0 AND v_cron_fails = 0 THEN
    RETURN;
  END IF;

  v_msg := '⚠️ ClientCase — сбои за последние 10 мин:';
  IF v_send_fails > 0 THEN
    v_msg := v_msg || E'\n• Не отправлено сообщений: ' || v_send_fails;
  END IF;
  IF v_cron_fails > 0 THEN
    v_msg := v_msg || E'\n• Падений фоновых задач (cron): ' || v_cron_fails;
  END IF;

  v_url := 'https://api.telegram.org/bot' || cfg.bot_token || '/sendMessage';
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('chat_id', cfg.chat_id, 'text', v_msg, 'disable_notification', false)
  );
EXCEPTION WHEN OTHERS THEN
  -- алерты не должны ронять крон/транзакции
  NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.run_platform_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_platform_alerts() TO service_role;

-- pg_cron: каждые 10 минут.
SELECT cron.schedule('platform-alerts', '*/10 * * * *', 'SELECT public.run_platform_alerts();')
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'platform-alerts');
