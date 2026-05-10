-- Таблица item_lists — отдельные списки тредов и проектов с фильтром,
-- настраиваемыми колонками таблицы и пакетными действиями.
--
-- Альтернатива доскам: доска даёт несколько подсписков рядом (kanban),
-- list — одна выборка в табличном виде с чекбоксами и сортировкой.
-- Фильтр и сортировка — общий примитив с board_lists (см. lib/filters/).
--
-- owner_user_id IS NULL → общий список воркспейса (видят все участники,
-- меняют менеджеры с manage_workspace_settings и владельцы).
-- owner_user_id NOT NULL → личный список этого юзера (видит и меняет
-- только владелец).

CREATE TABLE IF NOT EXISTS public.item_lists (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type     text NOT NULL CHECK (entity_type IN ('thread', 'project')),
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  icon            text,
  color           text,
  filter_config   jsonb NOT NULL DEFAULT '{"logic":"and","rules":[]}'::jsonb,
  sort_by         text,
  sort_dir        text CHECK (sort_dir IS NULL OR sort_dir IN ('asc', 'desc')),
  columns         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  is_deleted      boolean NOT NULL DEFAULT false,
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.item_lists IS 'Отдельные списки тредов и проектов с фильтром и табличным представлением.';
COMMENT ON COLUMN public.item_lists.owner_user_id IS 'NULL = общий список воркспейса; NOT NULL = личный список этого юзера.';
COMMENT ON COLUMN public.item_lists.entity_type IS 'Тип сущности: thread (треды project_threads) или project.';
COMMENT ON COLUMN public.item_lists.filter_config IS 'FilterGroup из @/lib/filters/types — общий формат с board_lists.filters.';
COMMENT ON COLUMN public.item_lists.columns IS 'Массив [{key, width, order, visible}] — настройка колонок таблицы.';

CREATE INDEX IF NOT EXISTS idx_item_lists_workspace
  ON public.item_lists(workspace_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_item_lists_owner
  ON public.item_lists(owner_user_id) WHERE is_deleted = false AND owner_user_id IS NOT NULL;

-- ── Триггер автообновления updated_at ────────────────────

CREATE OR REPLACE FUNCTION public.touch_item_lists_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_item_lists_touch_updated_at ON public.item_lists;
CREATE TRIGGER trg_item_lists_touch_updated_at
  BEFORE UPDATE ON public.item_lists
  FOR EACH ROW EXECUTE FUNCTION public.touch_item_lists_updated_at();

-- ── RLS ──────────────────────────────────────────────────

ALTER TABLE public.item_lists ENABLE ROW LEVEL SECURITY;

-- SELECT: участник воркспейса видит общие (owner_user_id IS NULL) + свои личные.
DROP POLICY IF EXISTS item_lists_select ON public.item_lists;
CREATE POLICY item_lists_select ON public.item_lists
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.workspace_id = item_lists.workspace_id
      AND p.user_id = (SELECT auth.uid())
      AND p.is_deleted = false
  )
  AND (owner_user_id IS NULL OR owner_user_id = (SELECT auth.uid()))
);

-- INSERT: личные списки создаёт сам пользователь, общие — менеджер с
-- manage_workspace_settings или владелец воркспейса.
DROP POLICY IF EXISTS item_lists_insert ON public.item_lists;
CREATE POLICY item_lists_insert ON public.item_lists
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.workspace_id = item_lists.workspace_id
      AND p.user_id = (SELECT auth.uid())
      AND p.is_deleted = false
  )
  AND created_by = (SELECT auth.uid())
  AND (
    -- личный — обязательно своего юзера
    owner_user_id = (SELECT auth.uid())
    OR
    -- общий — нужны права на управление воркспейсом
    (owner_user_id IS NULL AND (
      public.is_workspace_owner((SELECT auth.uid()), item_lists.workspace_id)
      OR public.has_workspace_permission((SELECT auth.uid()), item_lists.workspace_id, 'manage_workspace_settings')
    ))
  )
);

-- UPDATE: владелец личного списка или менеджер для общих.
DROP POLICY IF EXISTS item_lists_update ON public.item_lists;
CREATE POLICY item_lists_update ON public.item_lists
FOR UPDATE
USING (
  (owner_user_id = (SELECT auth.uid()))
  OR (owner_user_id IS NULL AND (
    public.is_workspace_owner((SELECT auth.uid()), item_lists.workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), item_lists.workspace_id, 'manage_workspace_settings')
  ))
)
WITH CHECK (
  (owner_user_id = (SELECT auth.uid()))
  OR (owner_user_id IS NULL AND (
    public.is_workspace_owner((SELECT auth.uid()), item_lists.workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), item_lists.workspace_id, 'manage_workspace_settings')
  ))
);

-- DELETE: то же что и UPDATE.
DROP POLICY IF EXISTS item_lists_delete ON public.item_lists;
CREATE POLICY item_lists_delete ON public.item_lists
FOR DELETE
USING (
  (owner_user_id = (SELECT auth.uid()))
  OR (owner_user_id IS NULL AND (
    public.is_workspace_owner((SELECT auth.uid()), item_lists.workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), item_lists.workspace_id, 'manage_workspace_settings')
  ))
);
