-- Этап 3 CRM-фрейма: шаблон «Лид» и подтипы финальных статусов.
--
-- 1. project_templates.is_lead_template — флаг «это шаблон лида».
--    Используется маршрутизацией входящих (этап 9), кнопкой конверсии (11),
--    и фильтром в Boards для воронки (этап 4).
-- 2. statuses.final_kind — подтип финального статуса для аналитики воронки:
--    'won' (выигран), 'lost' (проигран), 'abandoned' (слит).
--    Заполняется только для статусов с is_final = true.

-- ============================================================================
-- 1. is_lead_template на шаблонах проектов
-- ============================================================================

ALTER TABLE public.project_templates
  ADD COLUMN IF NOT EXISTS is_lead_template boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_project_templates_is_lead
  ON public.project_templates(workspace_id)
  WHERE is_lead_template = true;

COMMENT ON COLUMN public.project_templates.is_lead_template IS
  'Шаблон лида (CRM-фрейм этап 3). Если true — проекты с этим шаблоном считаются лидами: '
  'участвуют в воронке продаж, могут быть конвертированы в рабочие проекты, '
  'входящие сообщения от новых контактов автоматом создают новый лид по этому шаблону.';

-- ============================================================================
-- 2. final_kind на статусах
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_final_kind') THEN
    CREATE TYPE public.status_final_kind AS ENUM ('won', 'lost', 'abandoned');
  END IF;
END $$;

ALTER TABLE public.statuses
  ADD COLUMN IF NOT EXISTS final_kind public.status_final_kind;

-- Гарантируем согласованность: final_kind можно ставить только когда is_final = true.
-- Если is_final сбрасывается в false — final_kind тоже должен быть NULL.
ALTER TABLE public.statuses
  DROP CONSTRAINT IF EXISTS statuses_final_kind_requires_is_final;

ALTER TABLE public.statuses
  ADD CONSTRAINT statuses_final_kind_requires_is_final
    CHECK (final_kind IS NULL OR is_final = true);

COMMENT ON COLUMN public.statuses.final_kind IS
  'Подтип финального статуса для аналитики воронки (CRM-фрейм этап 3). '
  'won — сделка выиграна, lost — проиграна, abandoned — слита (клиент перестал отвечать). '
  'Заполняется только для статусов с is_final = true.';
