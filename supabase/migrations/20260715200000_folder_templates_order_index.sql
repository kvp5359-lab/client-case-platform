-- Порядок шаблонов папок (drag & drop в настройках).
--
-- До этой миграции folder_templates не имела order_index и список сортировался
-- по created_at DESC. Зеркалим модель document_kit_templates/project_templates,
-- где сортировка перетаскиванием уже работает (integer NOT NULL DEFAULT 0).

ALTER TABLE public.folder_templates
  ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;

-- Бэкафилл: нумеруем в текущем видимом порядке (created_at DESC), чтобы после
-- выката список не перетасовался у пользователя.
--
-- Гейт `NOT EXISTS (order_index <> 0)` делает миграцию идемпотентной и, что
-- важнее, безопасной при повторном db push на живой базе: как только кто-то
-- перетащил хоть одну строку, бэкафилл больше не трогает ручной порядок.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.folder_templates WHERE order_index <> 0) THEN
    WITH numbered AS (
      SELECT
        id,
        (row_number() OVER (PARTITION BY workspace_id ORDER BY created_at DESC) - 1)::int AS idx
      FROM public.folder_templates
    )
    UPDATE public.folder_templates ft
    SET order_index = numbered.idx
    FROM numbered
    WHERE ft.id = numbered.id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_folder_templates_workspace_order
  ON public.folder_templates (workspace_id, order_index);
