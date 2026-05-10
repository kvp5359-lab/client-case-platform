-- Финансовый модуль: статьи доходов и расходов как отдельный справочник.
--
-- Раньше в транзакции (project_transactions.service_id) тыкали ссылку на
-- finance_services — справочник того, что мы продаём клиенту. Семантически
-- это неверно: «статья дохода» (за что пришли деньги) и «статья расхода»
-- (за что мы заплатили) — другие наборы значений, которые могут пересекаться
-- с услугами по названию, но в общем независимы.
--
-- Делаем общую таблицу finance_transaction_categories с полем kind
-- ('income' | 'expense'), а в transactions — category_id.

-- 1. Таблица категорий
CREATE TABLE IF NOT EXISTS public.finance_transaction_categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('income', 'expense')),
  name         text NOT NULL,
  is_deleted   boolean NOT NULL DEFAULT false,
  deleted_at   timestamptz,
  deleted_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_tx_categories_workspace_kind_idx
  ON public.finance_transaction_categories (workspace_id, kind, is_deleted);

ALTER TABLE public.finance_transaction_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_tx_categories_select ON public.finance_transaction_categories
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.workspace_id = finance_transaction_categories.workspace_id
      AND p.user_id = auth.uid() AND p.is_deleted = false));

CREATE POLICY finance_tx_categories_insert ON public.finance_transaction_categories
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.workspace_id = finance_transaction_categories.workspace_id
      AND p.user_id = auth.uid() AND p.is_deleted = false));

CREATE POLICY finance_tx_categories_update ON public.finance_transaction_categories
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.workspace_id = finance_transaction_categories.workspace_id
      AND p.user_id = auth.uid() AND p.is_deleted = false));

CREATE POLICY finance_tx_categories_delete ON public.finance_transaction_categories
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.workspace_id = finance_transaction_categories.workspace_id
      AND p.user_id = auth.uid() AND p.is_deleted = false));

DROP TRIGGER IF EXISTS finance_tx_categories_set_updated_at ON public.finance_transaction_categories;
CREATE TRIGGER finance_tx_categories_set_updated_at
  BEFORE UPDATE ON public.finance_transaction_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_finance_updated_at();

-- 2. Колонка category_id в project_transactions; service_id больше не нужен
ALTER TABLE public.project_transactions
  ADD COLUMN IF NOT EXISTS category_id uuid
    REFERENCES public.finance_transaction_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS project_transactions_category_idx
  ON public.project_transactions (category_id);

-- service_id переезжает в category_id концептуально — данных пока нет, тестовые
-- транзакции потеряют ссылку, это ОК. Колонку убираем, чтобы не было путаницы.
ALTER TABLE public.project_transactions
  DROP COLUMN IF EXISTS service_id;
