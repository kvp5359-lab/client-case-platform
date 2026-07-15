-- Порядок шаблонов слотов (drag & drop в настройках).
--
-- Колонка sort_order в slot_templates существовала с самого начала, но была
-- мёртвой: все значения 0, никто её не писал и не читал (справочник грузился
-- по created_at DESC, пикер — по name). Оживляем её вместо добавления
-- order_index, как у остальных *_templates: две колонки порядка в одной
-- таблице — гарантированная путаница «а по какой сортируем».
--
-- Слоты-экземпляры (folder_template_slots, document_kit_template_folder_slots)
-- тоже упорядочены через sort_order — так что для слотов это своя конвенция.

-- Бэкафилл в текущем видимом порядке (created_at DESC), чтобы список не
-- перетасовался после выката. Гейт по «все нули/NULL» делает миграцию
-- идемпотентной и не даёт затереть настроенный руками порядок при повторе.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.slot_templates WHERE COALESCE(sort_order, 0) <> 0) THEN
    WITH numbered AS (
      SELECT
        id,
        (row_number() OVER (PARTITION BY workspace_id ORDER BY created_at DESC) - 1)::int AS idx
      FROM public.slot_templates
    )
    UPDATE public.slot_templates st
    SET sort_order = numbered.idx
    FROM numbered
    WHERE st.id = numbered.id;
  END IF;
END $$;

-- NULL здесь означал бы «место в списке не определено» — такого состояния у
-- строки справочника быть не должно.
UPDATE public.slot_templates SET sort_order = 0 WHERE sort_order IS NULL;

ALTER TABLE public.slot_templates
  ALTER COLUMN sort_order SET DEFAULT 0,
  ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_slot_templates_workspace_sort
  ON public.slot_templates (workspace_id, sort_order);
