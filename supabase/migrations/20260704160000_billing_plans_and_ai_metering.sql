-- Тарифы, биллинг воркспейсов и учёт токенов ИИ (Фаза 1 — фундамент).
-- Всё аддитивно и обратно совместимо: нет строки в workspace_billing → воркспейс
-- безлимитный (как сейчас). Учёт токенов начинает копиться после деплоя Фазы 2.
-- План: docs/feature-backlog/2026-07-04-billing-plans-and-ai-metering.md

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Тарифы (определения)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,          -- starter/team/business
  name          text NOT NULL,
  description   text,
  price_monthly numeric(12,2) NOT NULL DEFAULT 0,
  currency      text NOT NULL DEFAULT 'RUB',
  -- лимиты (NULL = без лимита)
  max_participants  integer,
  max_projects      integer,
  max_tasks         integer,
  max_storage_mb    integer,
  ai_tokens_monthly bigint,                     -- включённая месячная квота токенов
  enabled_modules   text[] NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
-- Тарифы видны всем авторизованным (витрина), меняет только service_role.
DROP POLICY IF EXISTS plans_select ON public.plans;
CREATE POLICY plans_select ON public.plans FOR SELECT TO authenticated USING (is_active = true);
REVOKE ALL ON public.plans FROM anon;
GRANT SELECT ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;

-- Черновые тарифы. ЦИФРЫ — ЗАГЛУШКИ, владелец правит под свою модель.
INSERT INTO public.plans (code, name, description, price_monthly, max_participants, max_projects, max_tasks, max_storage_mb, ai_tokens_monthly, enabled_modules, sort_order)
VALUES
  ('starter',  'Старт',   'Для одного специалиста',       990,   3,   10,  1000,   2048,    500000, ARRAY['tasks','chats','documents','knowledge'], 1),
  ('team',     'Команда', 'Небольшая команда',           2990,  10,   50,  10000, 10240,   3000000, ARRAY['tasks','chats','documents','knowledge','forms','digest','ai_chat'], 2),
  ('business', 'Бизнес',  'Без ограничений по объёму',   7990,  NULL, NULL, NULL,  102400, 20000000, ARRAY['tasks','chats','documents','knowledge','forms','digest','ai_chat','finance'], 3)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Привязка воркспейса к тарифу
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workspace_billing (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id      uuid REFERENCES public.plans(id),
  status       text NOT NULL DEFAULT 'active',   -- trial/active/past_due/canceled
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end   timestamptz,
  trial_ends_at        timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspace_billing ENABLE ROW LEVEL SECURITY;
-- Участник видит тариф своего воркспейса; менять — только service_role
-- (назначает платформенный владелец; на MVP — SQL/админка Фазы 4).
DROP POLICY IF EXISTS workspace_billing_select ON public.workspace_billing;
CREATE POLICY workspace_billing_select ON public.workspace_billing FOR SELECT TO authenticated
  USING (is_workspace_participant(workspace_id, (SELECT auth.uid())));
REVOKE ALL ON public.workspace_billing FROM anon;
GRANT SELECT ON public.workspace_billing TO authenticated;
GRANT ALL ON public.workspace_billing TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Учёт токенов ИИ
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  function_name text,
  provider      text,                            -- anthropic/google/openai
  model         text,
  input_tokens  bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  total_tokens  bigint NOT NULL DEFAULT 0,
  user_id       uuid,
  feature       text,
  meta          jsonb
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_ws_time ON public.ai_usage_events (workspace_id, occurred_at DESC);
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
-- Сырой лог читают только менеджеры воркспейса; пишет только service_role.
DROP POLICY IF EXISTS ai_usage_events_select ON public.ai_usage_events;
CREATE POLICY ai_usage_events_select ON public.ai_usage_events FOR SELECT TO authenticated
  USING (is_workspace_owner((SELECT auth.uid()), workspace_id)
      OR has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_workspace_settings'));
REVOKE ALL ON public.ai_usage_events FROM anon, authenticated;
GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

-- Rollup помесячно (для быстрых квот без скана сырого лога).
CREATE TABLE IF NOT EXISTS public.ai_usage_monthly (
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  period        date NOT NULL,                   -- первый день месяца
  model         text NOT NULL DEFAULT '',
  input_tokens  bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  total_tokens  bigint NOT NULL DEFAULT 0,
  request_count integer NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, period, model)
);
ALTER TABLE public.ai_usage_monthly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_usage_monthly_select ON public.ai_usage_monthly;
CREATE POLICY ai_usage_monthly_select ON public.ai_usage_monthly FOR SELECT TO authenticated
  USING (is_workspace_participant(workspace_id, (SELECT auth.uid())));
REVOKE ALL ON public.ai_usage_monthly FROM anon;
GRANT SELECT ON public.ai_usage_monthly TO authenticated;
GRANT ALL ON public.ai_usage_monthly TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC
-- ─────────────────────────────────────────────────────────────────────────────

-- Запись расхода токенов. Только service_role (зовут edge-функции). Best-effort:
-- при любой ошибке edge-код глушит вызов, ответ ИИ не страдает.
CREATE OR REPLACE FUNCTION public.log_ai_usage(
  p_workspace_id uuid,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_function_name text DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_feature text DEFAULT NULL,
  p_meta jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_in  bigint := GREATEST(COALESCE(p_input_tokens, 0), 0);
  v_out bigint := GREATEST(COALESCE(p_output_tokens, 0), 0);
  v_period date := date_trunc('month', now())::date;
  v_model text := COALESCE(p_model, '');
BEGIN
  IF p_workspace_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.ai_usage_events
    (workspace_id, function_name, provider, model, input_tokens, output_tokens, total_tokens, user_id, feature, meta)
  VALUES
    (p_workspace_id, p_function_name, p_provider, p_model, v_in, v_out, v_in + v_out, p_user_id, p_feature, p_meta);

  INSERT INTO public.ai_usage_monthly
    (workspace_id, period, model, input_tokens, output_tokens, total_tokens, request_count, updated_at)
  VALUES
    (p_workspace_id, v_period, v_model, v_in, v_out, v_in + v_out, 1, now())
  ON CONFLICT (workspace_id, period, model) DO UPDATE SET
    input_tokens  = ai_usage_monthly.input_tokens  + EXCLUDED.input_tokens,
    output_tokens = ai_usage_monthly.output_tokens + EXCLUDED.output_tokens,
    total_tokens  = ai_usage_monthly.total_tokens  + EXCLUDED.total_tokens,
    request_count = ai_usage_monthly.request_count + 1,
    updated_at    = now();
END;
$$;
REVOKE ALL ON FUNCTION public.log_ai_usage(uuid, bigint, bigint, text, text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_ai_usage(uuid, bigint, bigint, text, text, text, uuid, text, jsonb) TO service_role;

-- Токены воркспейса за месяц (по умолчанию текущий).
CREATE OR REPLACE FUNCTION public.get_workspace_ai_usage(p_workspace_id uuid, p_period date DEFAULT NULL)
RETURNS TABLE(period date, total_tokens bigint, input_tokens bigint, output_tokens bigint, request_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(p_period, date_trunc('month', now())::date) AS period,
    COALESCE(sum(m.total_tokens), 0)::bigint,
    COALESCE(sum(m.input_tokens), 0)::bigint,
    COALESCE(sum(m.output_tokens), 0)::bigint,
    COALESCE(sum(m.request_count), 0)::int
  FROM ai_usage_monthly m
  WHERE m.workspace_id = p_workspace_id
    AND m.period = COALESCE(p_period, date_trunc('month', now())::date)
    AND is_workspace_participant(p_workspace_id, (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.get_workspace_ai_usage(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_ai_usage(uuid, date) TO authenticated, service_role;

-- План воркспейса + эффективные лимиты (override из workspace_limits перебивает план).
-- Нет строки billing → всё NULL (безлимит), как до внедрения тарифов.
CREATE OR REPLACE FUNCTION public.resolve_workspace_plan(p_workspace_id uuid)
RETURNS TABLE(
  plan_code text, plan_name text, status text,
  max_participants integer, max_projects integer, max_tasks integer,
  max_storage_mb integer, ai_tokens_monthly bigint, enabled_modules text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    pl.code, pl.name, b.status,
    COALESCE(wl.max_participants, pl.max_participants),
    COALESCE(wl.max_projects,     pl.max_projects),
    pl.max_tasks,
    COALESCE(wl.max_storage_mb,   pl.max_storage_mb),
    pl.ai_tokens_monthly,
    COALESCE(pl.enabled_modules, '{}')
  FROM (SELECT 1) x
  LEFT JOIN workspace_billing b ON b.workspace_id = p_workspace_id
  LEFT JOIN plans pl ON pl.id = b.plan_id
  LEFT JOIN workspace_limits wl ON wl.workspace_id = p_workspace_id
  WHERE is_workspace_participant(p_workspace_id, (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.resolve_workspace_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_workspace_plan(uuid) TO authenticated, service_role;

-- Расширяем сводку потребления: + план + токены (использовано/включено).
-- Набор колонок меняется → CREATE OR REPLACE не годится, дропаем.
DROP FUNCTION IF EXISTS public.get_workspace_usage_and_limits(uuid);
CREATE OR REPLACE FUNCTION public.get_workspace_usage_and_limits(p_workspace_id uuid)
RETURNS TABLE(
  participants_count integer, projects_count integer, storage_mb integer,
  max_participants integer, max_projects integer, max_storage_mb integer,
  plan_code text, plan_name text,
  ai_tokens_used bigint, ai_tokens_monthly bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    (SELECT count(*)::int FROM participants p WHERE p.workspace_id=p_workspace_id AND p.is_deleted=false),
    (SELECT count(*)::int FROM projects pr WHERE pr.workspace_id=p_workspace_id AND pr.is_deleted=false),
    (SELECT COALESCE(round(sum(f.file_size)/1048576.0),0)::int FROM files f WHERE f.workspace_id=p_workspace_id),
    COALESCE(wl.max_participants, pl.max_participants),
    COALESCE(wl.max_projects,     pl.max_projects),
    COALESCE(wl.max_storage_mb,   pl.max_storage_mb),
    pl.code, pl.name,
    (SELECT COALESCE(sum(m.total_tokens),0)::bigint FROM ai_usage_monthly m
       WHERE m.workspace_id=p_workspace_id AND m.period=date_trunc('month', now())::date),
    pl.ai_tokens_monthly
  FROM (SELECT 1) x
  LEFT JOIN workspace_billing b ON b.workspace_id=p_workspace_id
  LEFT JOIN plans pl ON pl.id=b.plan_id
  LEFT JOIN workspace_limits wl ON wl.workspace_id=p_workspace_id
  WHERE is_workspace_participant(p_workspace_id, (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.get_workspace_usage_and_limits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_usage_and_limits(uuid) TO authenticated, service_role;

-- Флаг «достигнут лимит» + kind ai_tokens (учитывает план и override).
CREATE OR REPLACE FUNCTION public.workspace_at_limit(p_workspace_id uuid, p_kind text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_max_p int; v_max_pr int; v_max_tok bigint;
BEGIN
  SELECT COALESCE(wl.max_participants, pl.max_participants),
         COALESCE(wl.max_projects,     pl.max_projects),
         pl.ai_tokens_monthly
    INTO v_max_p, v_max_pr, v_max_tok
  FROM (SELECT 1) x
  LEFT JOIN workspace_billing b ON b.workspace_id=p_workspace_id
  LEFT JOIN plans pl ON pl.id=b.plan_id
  LEFT JOIN workspace_limits wl ON wl.workspace_id=p_workspace_id;

  RETURN CASE p_kind
    WHEN 'participants' THEN v_max_p IS NOT NULL AND
      (SELECT count(*) FROM participants p WHERE p.workspace_id=p_workspace_id AND p.is_deleted=false) >= v_max_p
    WHEN 'projects' THEN v_max_pr IS NOT NULL AND
      (SELECT count(*) FROM projects pr WHERE pr.workspace_id=p_workspace_id AND pr.is_deleted=false) >= v_max_pr
    WHEN 'ai_tokens' THEN v_max_tok IS NOT NULL AND
      (SELECT COALESCE(sum(m.total_tokens),0) FROM ai_usage_monthly m
         WHERE m.workspace_id=p_workspace_id AND m.period=date_trunc('month', now())::date) >= v_max_tok
    ELSE false
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.workspace_at_limit(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_at_limit(uuid, text) TO authenticated, service_role;
