-- Финансовый модуль (MVP).
--
-- Три таблицы:
--   1. finance_services       — справочник услуг воркспейса (название + базовая цена).
--   2. project_services       — услуги в проекте (snapshot имени и цены, кол-во, сумма).
--   3. project_transactions   — доходы и расходы проекта в одной таблице.
--
-- Контрагент = participant из существующего воркспейс-справочника людей.
-- Валюта одна, EUR (зашита; колонку currency добавим позже при необходимости).
-- Мягкое удаление через is_deleted/deleted_at/deleted_by.
--
-- ТЗ: docs/feature-backlog/2026-05-09-finance-module.md

-- ─────────────────────────────────────────────────────────────────────
-- 1. finance_services — справочник услуг воркспейса
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_services (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name        text NOT NULL,
  base_price  numeric(12, 2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz,
  deleted_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_services_workspace_idx
  ON public.finance_services (workspace_id, is_deleted);

ALTER TABLE public.finance_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_services_select ON public.finance_services
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.workspace_id = finance_services.workspace_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY finance_services_insert ON public.finance_services
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.workspace_id = finance_services.workspace_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY finance_services_update ON public.finance_services
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.workspace_id = finance_services.workspace_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY finance_services_delete ON public.finance_services
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.workspace_id = finance_services.workspace_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 2. project_services — услуги конкретного проекта
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_services (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  service_id  uuid REFERENCES public.finance_services(id) ON DELETE SET NULL,
  name        text NOT NULL,
  quantity    numeric(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price       numeric(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  total       numeric(12, 2) GENERATED ALWAYS AS (quantity * price) STORED,
  sort_order  integer NOT NULL DEFAULT 0,
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz,
  deleted_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_services_project_idx
  ON public.project_services (project_id, is_deleted);
CREATE INDEX IF NOT EXISTS project_services_service_idx
  ON public.project_services (service_id);

ALTER TABLE public.project_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_services_select ON public.project_services
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects pr
      JOIN public.participants p ON p.workspace_id = pr.workspace_id
      WHERE pr.id = project_services.project_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY project_services_insert ON public.project_services
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects pr
      JOIN public.participants p ON p.workspace_id = pr.workspace_id
      WHERE pr.id = project_services.project_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY project_services_update ON public.project_services
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects pr
      JOIN public.participants p ON p.workspace_id = pr.workspace_id
      WHERE pr.id = project_services.project_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY project_services_delete ON public.project_services
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects pr
      JOIN public.participants p ON p.workspace_id = pr.workspace_id
      WHERE pr.id = project_services.project_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 3. project_transactions — доходы и расходы (в одной таблице, type)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('income', 'expense')),
  date            date NOT NULL DEFAULT CURRENT_DATE,
  participant_id  uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  service_id      uuid REFERENCES public.finance_services(id) ON DELETE SET NULL,
  amount          numeric(12, 2) NOT NULL CHECK (amount > 0),
  comment         text,
  is_deleted      boolean NOT NULL DEFAULT false,
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_transactions_project_type_idx
  ON public.project_transactions (project_id, type, is_deleted);
CREATE INDEX IF NOT EXISTS project_transactions_date_idx
  ON public.project_transactions (date DESC);
CREATE INDEX IF NOT EXISTS project_transactions_participant_idx
  ON public.project_transactions (participant_id);
CREATE INDEX IF NOT EXISTS project_transactions_service_idx
  ON public.project_transactions (service_id);

ALTER TABLE public.project_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_transactions_select ON public.project_transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects pr
      JOIN public.participants p ON p.workspace_id = pr.workspace_id
      WHERE pr.id = project_transactions.project_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY project_transactions_insert ON public.project_transactions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects pr
      JOIN public.participants p ON p.workspace_id = pr.workspace_id
      WHERE pr.id = project_transactions.project_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY project_transactions_update ON public.project_transactions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects pr
      JOIN public.participants p ON p.workspace_id = pr.workspace_id
      WHERE pr.id = project_transactions.project_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY project_transactions_delete ON public.project_transactions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects pr
      JOIN public.participants p ON p.workspace_id = pr.workspace_id
      WHERE pr.id = project_transactions.project_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 4. updated_at триггеры
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_finance_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_services_set_updated_at ON public.finance_services;
CREATE TRIGGER finance_services_set_updated_at
  BEFORE UPDATE ON public.finance_services
  FOR EACH ROW EXECUTE FUNCTION public.touch_finance_updated_at();

DROP TRIGGER IF EXISTS project_services_set_updated_at ON public.project_services;
CREATE TRIGGER project_services_set_updated_at
  BEFORE UPDATE ON public.project_services
  FOR EACH ROW EXECUTE FUNCTION public.touch_finance_updated_at();

DROP TRIGGER IF EXISTS project_transactions_set_updated_at ON public.project_transactions;
CREATE TRIGGER project_transactions_set_updated_at
  BEFORE UPDATE ON public.project_transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_finance_updated_at();
