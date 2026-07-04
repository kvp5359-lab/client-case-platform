-- Админка платформы, этап 2: биллинг без платёжки + управление регистрацией.
-- Редактор тарифов, ручные платежи, статусы trial/active/past_due, крон просрочки,
-- конфиг платформы (регистрация/дефолтный триал), инвайты.
-- План: docs/feature-backlog/2026-07-04-platform-admin-console.md

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Конфиг платформы (singleton)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_config (
  id                       integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  registration_open        boolean NOT NULL DEFAULT true,
  default_trial_days       integer NOT NULL DEFAULT 0,   -- 0 = триал не выдаётся (текущее поведение)
  default_trial_plan_code  text,
  updated_at               timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_config FROM anon, authenticated;
GRANT ALL ON public.platform_config TO service_role;

-- Публичная проверка «регистрация открыта?» (нужна странице /register до логина).
CREATE OR REPLACE FUNCTION public.registration_allowed()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT registration_open FROM platform_config WHERE id = 1), true);
$$;
REVOKE ALL ON FUNCTION public.registration_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_allowed() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_get_platform_config()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM require_platform_admin();
  SELECT to_jsonb(c) - 'id' INTO v FROM platform_config c WHERE c.id = 1;
  RETURN COALESCE(v, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_platform_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_platform_config() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_platform_config(
  p_registration_open boolean,
  p_default_trial_days integer,
  p_default_trial_plan_code text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_admin uuid;
BEGIN
  v_admin := require_platform_admin();
  UPDATE platform_config SET
    registration_open       = COALESCE(p_registration_open, registration_open),
    default_trial_days      = GREATEST(COALESCE(p_default_trial_days, default_trial_days), 0),
    default_trial_plan_code = p_default_trial_plan_code,
    updated_at              = now()
  WHERE id = 1;
  PERFORM _platform_admin_log(v_admin, 'set_platform_config', NULL, NULL, jsonb_build_object(
    'registration_open', p_registration_open,
    'default_trial_days', p_default_trial_days,
    'default_trial_plan_code', p_default_trial_plan_code));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_platform_config(boolean, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_config(boolean, integer, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Инвайты (при закрытой регистрации)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,
  note       text,
  max_uses   integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_invites FROM anon, authenticated;
GRANT ALL ON public.platform_invites TO service_role;

CREATE OR REPLACE FUNCTION public.admin_create_invite(
  p_note text DEFAULT NULL, p_max_uses integer DEFAULT 1, p_expires_days integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_admin uuid; v_code text; v_id uuid;
BEGIN
  v_admin := require_platform_admin();
  v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  INSERT INTO platform_invites (code, note, max_uses, expires_at, created_by)
  VALUES (v_code, p_note, GREATEST(COALESCE(p_max_uses, 1), 1),
          CASE WHEN p_expires_days IS NOT NULL THEN now() + make_interval(days => p_expires_days) END,
          v_admin)
  RETURNING id INTO v_id;
  PERFORM _platform_admin_log(v_admin, 'create_invite', NULL, NULL,
    jsonb_build_object('code', v_code, 'note', p_note, 'max_uses', p_max_uses));
  RETURN jsonb_build_object('id', v_id, 'code', v_code);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_create_invite(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_invite(text, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_invite(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_admin uuid; v_code text;
BEGIN
  v_admin := require_platform_admin();
  DELETE FROM platform_invites WHERE id = p_id RETURNING code INTO v_code;
  PERFORM _platform_admin_log(v_admin, 'delete_invite', NULL, NULL, jsonb_build_object('code', v_code));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_invite(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_invites()
RETURNS TABLE(id uuid, code text, note text, max_uses integer, used_count integer,
              expires_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM require_platform_admin();
  RETURN QUERY
  SELECT i.id, i.code, i.note, i.max_uses, i.used_count, i.expires_at, i.created_at
  FROM platform_invites i ORDER BY i.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_invites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_invites() TO authenticated, service_role;

-- Погашение инвайта при регистрации (страница /register, до логина → anon).
-- Атомарно: инкремент только если код жив. ⚠️ Гейт регистрации — UI-уровень
-- (Google OAuth его обходит); строгий enforcement — через auth hook, отдельно.
CREATE OR REPLACE FUNCTION public.consume_platform_invite(p_code text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ok boolean := false;
BEGIN
  UPDATE platform_invites
     SET used_count = used_count + 1
   WHERE code = p_code
     AND used_count < max_uses
     AND (expires_at IS NULL OR expires_at > now())
  RETURNING true INTO v_ok;
  RETURN COALESCE(v_ok, false);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_platform_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_platform_invite(text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Платежи (ручная отметка оплаты)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  amount        numeric(12,2) NOT NULL,
  currency      text NOT NULL DEFAULT 'RUB',
  paid_at       date NOT NULL DEFAULT current_date,
  period_months integer NOT NULL DEFAULT 1,
  comment       text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_payments_ws ON public.platform_payments (workspace_id, paid_at DESC);
ALTER TABLE public.platform_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_payments FROM anon, authenticated;
GRANT ALL ON public.platform_payments TO service_role;

-- Отметить оплату: пишет платёж + продлевает paid_until (current_period_end)
-- от max(сейчас, текущий конец периода) на N месяцев, статус → active.
CREATE OR REPLACE FUNCTION public.admin_record_payment(
  p_workspace_id uuid, p_amount numeric, p_currency text DEFAULT 'RUB',
  p_paid_at date DEFAULT current_date, p_period_months integer DEFAULT 1,
  p_comment text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_admin uuid; v_id uuid; v_months integer;
BEGIN
  v_admin := require_platform_admin();
  v_months := GREATEST(COALESCE(p_period_months, 1), 0);

  INSERT INTO platform_payments (workspace_id, amount, currency, paid_at, period_months, comment, created_by)
  VALUES (p_workspace_id, p_amount, COALESCE(p_currency, 'RUB'), COALESCE(p_paid_at, current_date), v_months, p_comment, v_admin)
  RETURNING id INTO v_id;

  IF v_months > 0 THEN
    INSERT INTO workspace_billing (workspace_id, plan_id, status, current_period_start, current_period_end, updated_at)
    VALUES (p_workspace_id, NULL, 'active', now(), now() + make_interval(months => v_months), now())
    ON CONFLICT (workspace_id) DO UPDATE SET
      status = 'active',
      current_period_end = GREATEST(COALESCE(workspace_billing.current_period_end, now()), now())
                             + make_interval(months => v_months),
      updated_at = now();
  END IF;

  PERFORM _platform_admin_log(v_admin, 'record_payment', p_workspace_id, NULL, jsonb_build_object(
    'amount', p_amount, 'currency', p_currency, 'months', v_months, 'comment', p_comment));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_record_payment(uuid, numeric, text, date, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_payment(uuid, numeric, text, date, integer, text) TO authenticated, service_role;

-- Удалить ошибочный платёж (даты биллинга НЕ откатывает — поправь их руками).
CREATE OR REPLACE FUNCTION public.admin_delete_payment(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_admin uuid; v_ws uuid; v_amount numeric;
BEGIN
  v_admin := require_platform_admin();
  DELETE FROM platform_payments WHERE id = p_payment_id RETURNING workspace_id, amount INTO v_ws, v_amount;
  PERFORM _platform_admin_log(v_admin, 'delete_payment', v_ws, NULL, jsonb_build_object('amount', v_amount));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_payment(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_payments(p_workspace_id uuid DEFAULT NULL, p_limit integer DEFAULT 200)
RETURNS TABLE(id uuid, workspace_id uuid, workspace_name text, amount numeric, currency text,
              paid_at date, period_months integer, comment text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM require_platform_admin();
  RETURN QUERY
  SELECT pp.id, pp.workspace_id, w.name, pp.amount, pp.currency,
         pp.paid_at, pp.period_months, pp.comment, pp.created_at
  FROM platform_payments pp
  LEFT JOIN workspaces w ON w.id = pp.workspace_id
  WHERE p_workspace_id IS NULL OR pp.workspace_id = p_workspace_id
  ORDER BY pp.paid_at DESC, pp.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_payments(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payments(uuid, integer) TO authenticated, service_role;

-- Ручная правка дат/статуса биллинга (без платежа).
CREATE OR REPLACE FUNCTION public.admin_set_billing_dates(
  p_workspace_id uuid, p_status text,
  p_trial_ends_at timestamptz, p_paid_until timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_admin uuid;
BEGIN
  v_admin := require_platform_admin();
  IF p_status IS NOT NULL AND p_status NOT IN ('trial', 'active', 'past_due', 'canceled') THEN
    RAISE EXCEPTION 'Недопустимый статус: %', p_status;
  END IF;

  INSERT INTO workspace_billing (workspace_id, plan_id, status, trial_ends_at, current_period_end, updated_at)
  VALUES (p_workspace_id, NULL, COALESCE(p_status, 'active'), p_trial_ends_at, p_paid_until, now())
  ON CONFLICT (workspace_id) DO UPDATE SET
    status             = COALESCE(p_status, workspace_billing.status),
    trial_ends_at      = p_trial_ends_at,
    current_period_end = p_paid_until,
    updated_at         = now();

  PERFORM _platform_admin_log(v_admin, 'set_billing_dates', p_workspace_id, NULL, jsonb_build_object(
    'status', p_status, 'trial_ends_at', p_trial_ends_at, 'paid_until', p_paid_until));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_billing_dates(uuid, text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_billing_dates(uuid, text, timestamptz, timestamptz) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Редактор тарифов
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_plans()
RETURNS SETOF public.plans
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM require_platform_admin();
  RETURN QUERY SELECT * FROM plans ORDER BY sort_order, code;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_plans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_plans() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_upsert_plan(p jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_admin uuid; v_id uuid;
BEGIN
  v_admin := require_platform_admin();
  IF COALESCE(p->>'code', '') = '' OR COALESCE(p->>'name', '') = '' THEN
    RAISE EXCEPTION 'code и name обязательны';
  END IF;

  INSERT INTO plans (code, name, description, price_monthly, currency,
                     max_participants, max_projects, max_tasks, max_storage_mb,
                     ai_tokens_monthly, enabled_modules, is_active, sort_order, updated_at)
  VALUES (
    p->>'code', p->>'name', p->>'description',
    COALESCE((p->>'price_monthly')::numeric, 0), COALESCE(p->>'currency', 'RUB'),
    (p->>'max_participants')::integer, (p->>'max_projects')::integer,
    (p->>'max_tasks')::integer, (p->>'max_storage_mb')::integer,
    (p->>'ai_tokens_monthly')::bigint,
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p->'enabled_modules') x), '{}'),
    COALESCE((p->>'is_active')::boolean, true),
    COALESCE((p->>'sort_order')::integer, 0), now())
  ON CONFLICT (code) DO UPDATE SET
    name              = EXCLUDED.name,
    description       = EXCLUDED.description,
    price_monthly     = EXCLUDED.price_monthly,
    currency          = EXCLUDED.currency,
    max_participants  = EXCLUDED.max_participants,
    max_projects      = EXCLUDED.max_projects,
    max_tasks         = EXCLUDED.max_tasks,
    max_storage_mb    = EXCLUDED.max_storage_mb,
    ai_tokens_monthly = EXCLUDED.ai_tokens_monthly,
    enabled_modules   = EXCLUDED.enabled_modules,
    is_active         = EXCLUDED.is_active,
    sort_order        = EXCLUDED.sort_order,
    updated_at        = now()
  RETURNING id INTO v_id;

  PERFORM _platform_admin_log(v_admin, 'upsert_plan', NULL, NULL, jsonb_build_object(
    'code', p->>'code', 'price_monthly', p->>'price_monthly', 'is_active', p->>'is_active'));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_upsert_plan(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_plan(jsonb) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Дефолтный триал для НОВЫХ воркспейсов (по конфигу; 0 дней = выключено)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_workspace_trial()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE cfg platform_config; v_plan uuid;
BEGIN
  SELECT * INTO cfg FROM platform_config WHERE id = 1;
  IF FOUND AND cfg.default_trial_days > 0 THEN
    SELECT id INTO v_plan FROM plans WHERE code = cfg.default_trial_plan_code AND is_active;
    INSERT INTO workspace_billing (workspace_id, plan_id, status, trial_ends_at)
    VALUES (NEW.id, v_plan, 'trial', now() + make_interval(days => cfg.default_trial_days))
    ON CONFLICT (workspace_id) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- сид триала не должен ломать создание воркспейса
END;
$$;
DROP TRIGGER IF EXISTS trg_seed_workspace_trial ON public.workspaces;
CREATE TRIGGER trg_seed_workspace_trial
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.seed_workspace_trial();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Крон просрочки: trial/active с истёкшей датой → past_due + алерт в TG.
--    Автоблокировки НЕТ — решение принимает админ руками.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_billing_maintenance()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  cfg   public.platform_alert_config;
  v_names text;
  v_msg text;
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

  IF v_names IS NULL THEN RETURN; END IF;

  SELECT * INTO cfg FROM platform_alert_config WHERE id = 1;
  IF NOT FOUND OR NOT cfg.enabled OR cfg.bot_token IS NULL OR cfg.chat_id IS NULL THEN
    RETURN;
  END IF;

  v_msg := E'💳 ClientCase — истёк оплаченный период / триал:\n• ' || v_names ||
           E'\nСтатус переведён в «Просрочен». Блокировка — вручную из админки.';
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

SELECT cron.schedule('billing-maintenance', '0 5 * * *', 'SELECT public.run_billing_maintenance();')
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-maintenance');
