-- Финансовый модуль — налоги.
--
-- Справочник ставок НДС/налога на воркспейс + связь с услугой проекта.
-- Налог накручивается сверху на subtotal позиции: total_with_tax = total * (1 + rate/100).
-- Колонка project_services.total остаётся без налога (subtotal); расчёт с налогом — на фронте.
--
-- snapshot tax_rate (numeric) хранится прямо в project_services, чтобы при
-- удалении или изменении ставки в справочнике уже добавленные позиции
-- сохраняли свои исторические значения.

-- ─────────────────────────────────────────────────────────────────────
-- 1. finance_tax_rates — справочник ставок налога воркспейса
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_tax_rates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  rate         numeric(5, 2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  is_default   boolean NOT NULL DEFAULT false,
  is_deleted   boolean NOT NULL DEFAULT false,
  deleted_at   timestamptz,
  deleted_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_tax_rates_workspace_idx
  ON public.finance_tax_rates (workspace_id, is_deleted);

-- Один is_default на воркспейс среди живых.
CREATE UNIQUE INDEX IF NOT EXISTS finance_tax_rates_one_default_per_workspace
  ON public.finance_tax_rates (workspace_id)
  WHERE is_default = true AND is_deleted = false;

ALTER TABLE public.finance_tax_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_tax_rates_select ON public.finance_tax_rates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.workspace_id = finance_tax_rates.workspace_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY finance_tax_rates_insert ON public.finance_tax_rates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.workspace_id = finance_tax_rates.workspace_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY finance_tax_rates_update ON public.finance_tax_rates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.workspace_id = finance_tax_rates.workspace_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY finance_tax_rates_delete ON public.finance_tax_rates
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.workspace_id = finance_tax_rates.workspace_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

DROP TRIGGER IF EXISTS finance_tax_rates_set_updated_at ON public.finance_tax_rates;
CREATE TRIGGER finance_tax_rates_set_updated_at
  BEFORE UPDATE ON public.finance_tax_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_finance_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 2. project_services: добавляем налог
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.project_services
  ADD COLUMN IF NOT EXISTS tax_rate_id uuid
    REFERENCES public.finance_tax_rates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5, 2)
    CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 100));

CREATE INDEX IF NOT EXISTS project_services_tax_rate_idx
  ON public.project_services (tax_rate_id);
