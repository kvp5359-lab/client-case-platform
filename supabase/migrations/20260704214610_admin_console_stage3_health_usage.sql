-- Админка платформы, этап 3: здоровье каналов в UI + обзор потребления.
-- Зеркало read-only проверок scripts/channel-health.mjs, но с привязкой к воркспейсам.
-- План: docs/feature-backlog/2026-07-04-platform-admin-console.md

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Здоровье платформы (read-only, ничего не отправляет)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_platform_health()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM require_platform_admin();
  SELECT jsonb_build_object(
    -- Застрявшие исходящие (pending > 15 мин), по воркспейсам
    'stuck_pending', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'workspace_id', x.workspace_id, 'workspace_name', w.name, 'count', x.cnt,
          'oldest_at', x.oldest) ORDER BY x.cnt DESC), '[]'::jsonb)
      FROM (
        SELECT m.workspace_id, count(*) AS cnt, min(m.created_at) AS oldest
        FROM project_messages m
        WHERE m.send_status = 'pending' AND m.created_at < now() - interval '15 minutes'
        GROUP BY m.workspace_id
      ) x LEFT JOIN workspaces w ON w.id = x.workspace_id),
    -- Незакрытые сбои отправки, по воркспейсам
    'unresolved_failures', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'workspace_id', x.workspace_id, 'workspace_name', w.name, 'count', x.cnt,
          'last_at', x.last_at, 'last_error', x.last_error) ORDER BY x.cnt DESC), '[]'::jsonb)
      FROM (
        SELECT f.workspace_id, count(*) AS cnt, max(f.created_at) AS last_at,
               (array_agg(f.error_text ORDER BY f.created_at DESC))[1] AS last_error
        FROM message_send_failures f
        WHERE f.resolved_at IS NULL
        GROUP BY f.workspace_id
      ) x LEFT JOIN workspaces w ON w.id = x.workspace_id),
    -- Просроченный Gmail watch у активных ящиков (входящие письма не приходят)
    'gmail_watch_expired', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'workspace_id', ea.workspace_id, 'workspace_name', w.name,
          'email', ea.email, 'expired_at', ea.watch_expires_at)
          ORDER BY ea.watch_expires_at), '[]'::jsonb)
      FROM email_accounts ea LEFT JOIN workspaces w ON w.id = ea.workspace_id
      WHERE ea.is_active AND ea.watch_expires_at < now()),
    -- MTProto-сессии: неактивные давно не видевшиеся — сигнал
    'mtproto', jsonb_build_object(
      'active', (SELECT count(*) FROM telegram_mtproto_sessions ms WHERE ms.is_active),
      'stale', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'workspace_id', ms.workspace_id, 'workspace_name', w.name,
          'tg_username', ms.tg_username, 'last_seen_at', ms.last_seen_at)), '[]'::jsonb)
        FROM telegram_mtproto_sessions ms LEFT JOIN workspaces w ON w.id = ms.workspace_id
        WHERE ms.is_active AND (ms.last_seen_at IS NULL OR ms.last_seen_at < now() - interval '24 hours'))),
    -- Падения pg_cron за сутки
    'cron_failures_24h', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'jobname', x.jobname, 'count', x.cnt, 'last_at', x.last_at,
          'last_message', x.last_message) ORDER BY x.cnt DESC), '[]'::jsonb)
      FROM (
        SELECT j.jobname, count(*) AS cnt, max(jrd.start_time) AS last_at,
               (array_agg(jrd.return_message ORDER BY jrd.start_time DESC))[1] AS last_message
        FROM cron.job_run_details jrd
        JOIN cron.job j ON j.jobid = jrd.jobid
        WHERE jrd.status = 'failed' AND jrd.start_time > now() - interval '24 hours'
        GROUP BY j.jobname
      ) x),
    'checked_at', now()
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_platform_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_health() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Обзор потребления: топы за текущий месяц + динамика токенов по месяцам
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_usage_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM require_platform_admin();
  SELECT jsonb_build_object(
    -- Топ-10 по токенам ИИ за текущий месяц (+ квота тарифа)
    'top_ai', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'workspace_id', x.workspace_id, 'workspace_name', w.name,
          'tokens', x.tokens, 'quota', pl.ai_tokens_monthly) ORDER BY x.tokens DESC), '[]'::jsonb)
      FROM (
        SELECT m.workspace_id, sum(m.total_tokens) AS tokens
        FROM ai_usage_monthly m
        WHERE m.period = date_trunc('month', now())::date
        GROUP BY m.workspace_id ORDER BY sum(m.total_tokens) DESC LIMIT 10
      ) x
      LEFT JOIN workspaces w ON w.id = x.workspace_id
      LEFT JOIN workspace_billing b ON b.workspace_id = x.workspace_id
      LEFT JOIN plans pl ON pl.id = b.plan_id),
    -- Топ-10 по хранилищу
    'top_storage', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'workspace_id', x.workspace_id, 'workspace_name', w.name, 'mb', x.mb)
          ORDER BY x.mb DESC), '[]'::jsonb)
      FROM (
        SELECT f.workspace_id, round(sum(f.file_size)/1048576.0)::bigint AS mb
        FROM files f GROUP BY f.workspace_id
        ORDER BY sum(f.file_size) DESC LIMIT 10
      ) x LEFT JOIN workspaces w ON w.id = x.workspace_id),
    -- Топ-10 по сообщениям за 30 дней
    'top_messages_30d', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'workspace_id', x.workspace_id, 'workspace_name', w.name, 'count', x.cnt)
          ORDER BY x.cnt DESC), '[]'::jsonb)
      FROM (
        SELECT m.workspace_id, count(*) AS cnt
        FROM project_messages m
        WHERE m.created_at > now() - interval '30 days'
        GROUP BY m.workspace_id ORDER BY count(*) DESC LIMIT 10
      ) x LEFT JOIN workspaces w ON w.id = x.workspace_id),
    -- Токены ИИ всей платформы по месяцам (последние 6)
    'ai_by_month', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'period', x.period, 'tokens', x.tokens, 'requests', x.reqs)
          ORDER BY x.period), '[]'::jsonb)
      FROM (
        SELECT m.period, sum(m.total_tokens) AS tokens, sum(m.request_count) AS reqs
        FROM ai_usage_monthly m GROUP BY m.period
        ORDER BY m.period DESC LIMIT 6
      ) x)
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_usage_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_usage_overview() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Алерт «воркспейс близок к лимиту токенов» (>90% квоты) — в ежедневный
--    крон биллинга. Повторяется каждый день, пока потребление выше порога.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_billing_maintenance()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  cfg   public.platform_alert_config;
  v_names text;
  v_quota text;
  v_msg text := '';
BEGIN
  WITH expired_trials AS (
    UPDATE workspace_billing SET status = 'past_due', updated_at = now()
    WHERE status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < now()
    RETURNING workspace_id
  ),
  expired_paid AS (
    UPDATE workspace_billing SET status = 'past_due', updated_at = now()
    WHERE status = 'active' AND current_period_end IS NOT NULL AND current_period_end < now()
    RETURNING workspace_id
  ),
  all_expired AS (
    SELECT workspace_id FROM expired_trials UNION SELECT workspace_id FROM expired_paid
  )
  SELECT string_agg(w.name, E'\n• ') INTO v_names
  FROM all_expired e JOIN workspaces w ON w.id = e.workspace_id;

  -- Воркспейсы, съевшие >90% месячной квоты токенов
  SELECT string_agg(w.name || ' (' || x.pct || '%)', E'\n• ') INTO v_quota
  FROM (
    SELECT m.workspace_id, round(100.0 * sum(m.total_tokens) / pl.ai_tokens_monthly) AS pct
    FROM ai_usage_monthly m
    JOIN workspace_billing b ON b.workspace_id = m.workspace_id
    JOIN plans pl ON pl.id = b.plan_id AND pl.ai_tokens_monthly IS NOT NULL AND pl.ai_tokens_monthly > 0
    WHERE m.period = date_trunc('month', now())::date
    GROUP BY m.workspace_id, pl.ai_tokens_monthly
    HAVING sum(m.total_tokens) >= 0.9 * pl.ai_tokens_monthly
  ) x JOIN workspaces w ON w.id = x.workspace_id;

  IF v_names IS NULL AND v_quota IS NULL THEN RETURN; END IF;

  SELECT * INTO cfg FROM platform_alert_config WHERE id = 1;
  IF NOT FOUND OR NOT cfg.enabled OR cfg.bot_token IS NULL OR cfg.chat_id IS NULL THEN
    RETURN;
  END IF;

  IF v_names IS NOT NULL THEN
    v_msg := E'💳 ClientCase — истёк оплаченный период / триал:\n• ' || v_names ||
             E'\nСтатус переведён в «Просрочен». Блокировка — вручную из админки.';
  END IF;
  IF v_quota IS NOT NULL THEN
    IF v_msg <> '' THEN v_msg := v_msg || E'\n\n'; END IF;
    v_msg := v_msg || E'🔥 Близко к лимиту токенов ИИ (>90% квоты):\n• ' || v_quota;
  END IF;

  PERFORM net.http_post(
    url := 'https://api.telegram.org/bot' || cfg.bot_token || '/sendMessage',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('chat_id', cfg.chat_id, 'text', v_msg, 'disable_notification', false)
  );
EXCEPTION WHEN OTHERS THEN
  NULL;  -- обслуживание биллинга не должно ронять крон
END;
$$;
REVOKE ALL ON FUNCTION public.run_billing_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_billing_maintenance() TO service_role;
