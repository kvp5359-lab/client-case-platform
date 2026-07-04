-- Админка платформы, этап 5: метрики роста.
-- Регистрации по неделям, активные воркспейсы, распределение по тарифам, выручка.
-- План: docs/feature-backlog/2026-07-04-platform-admin-console.md

CREATE OR REPLACE FUNCTION public.admin_growth_metrics()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM require_platform_admin();
  SELECT jsonb_build_object(
    -- Сводные цифры
    'totals', jsonb_build_object(
      'users', (SELECT count(*) FROM auth.users),
      'workspaces', (SELECT count(*) FROM workspaces WHERE is_deleted = false),
      'active_ws_7d', (SELECT count(DISTINCT pr.workspace_id) FROM projects pr
                        WHERE pr.last_activity_at > now() - interval '7 days'),
      'active_ws_30d', (SELECT count(DISTINCT pr.workspace_id) FROM projects pr
                         WHERE pr.last_activity_at > now() - interval '30 days'),
      'paying', (SELECT count(*) FROM workspace_billing b WHERE b.status = 'active' AND b.current_period_end > now()),
      'on_trial', (SELECT count(*) FROM workspace_billing b WHERE b.status = 'trial'),
      'past_due', (SELECT count(*) FROM workspace_billing b WHERE b.status = 'past_due')),
    -- Регистрации пользователей по неделям (последние 12)
    'signups_by_week', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('week', x.week, 'count', x.cnt) ORDER BY x.week), '[]'::jsonb)
      FROM (
        SELECT date_trunc('week', u.created_at)::date AS week, count(*) AS cnt
        FROM auth.users u
        WHERE u.created_at > now() - interval '12 weeks'
        GROUP BY 1 ORDER BY 1 DESC LIMIT 12
      ) x),
    -- Новые воркспейсы по неделям (последние 12)
    'workspaces_by_week', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('week', x.week, 'count', x.cnt) ORDER BY x.week), '[]'::jsonb)
      FROM (
        SELECT date_trunc('week', w.created_at)::date AS week, count(*) AS cnt
        FROM workspaces w
        WHERE w.created_at > now() - interval '12 weeks'
        GROUP BY 1 ORDER BY 1 DESC LIMIT 12
      ) x),
    -- Распределение воркспейсов по тарифам
    'plan_distribution', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('plan', x.plan_name, 'count', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      FROM (
        SELECT COALESCE(pl.name, 'Без тарифа') AS plan_name, count(*) AS cnt
        FROM workspaces w
        LEFT JOIN workspace_billing b ON b.workspace_id = w.id
        LEFT JOIN plans pl ON pl.id = b.plan_id
        WHERE w.is_deleted = false
        GROUP BY 1
      ) x),
    -- Выручка по месяцам из ручных платежей (последние 12, по валютам)
    'revenue_by_month', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'month', x.month, 'currency', x.currency, 'amount', x.amount) ORDER BY x.month, x.currency), '[]'::jsonb)
      FROM (
        SELECT date_trunc('month', pp.paid_at)::date AS month, pp.currency, sum(pp.amount) AS amount
        FROM platform_payments pp
        WHERE pp.paid_at > now() - interval '12 months'
        GROUP BY 1, 2
      ) x)
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_growth_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_growth_metrics() TO authenticated, service_role;
