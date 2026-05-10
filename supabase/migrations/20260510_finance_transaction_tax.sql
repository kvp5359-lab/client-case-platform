-- Налог в транзакциях (доходах и расходах).
--
-- Логика как у project_services: FK на finance_tax_rates + snapshot процента.
-- Считаем «чистую» сумму без налога: amount × 100 / (100 + tax_rate).
-- При изменении/удалении ставки в справочнике уже добавленные транзакции
-- сохраняют свой исторический tax_rate.

ALTER TABLE public.project_transactions
  ADD COLUMN IF NOT EXISTS tax_rate_id uuid
    REFERENCES public.finance_tax_rates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5, 2)
    CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 100));

CREATE INDEX IF NOT EXISTS project_transactions_tax_rate_idx
  ON public.project_transactions (tax_rate_id);
