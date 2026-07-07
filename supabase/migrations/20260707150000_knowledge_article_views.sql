-- knowledge_article_views — сохранённые представления (наборы фильтров) для
-- базы знаний. Лёгкий аналог item_lists: только имя + фильтр + видимость,
-- без колонок/иконок/корзины (представлений немного, delete = hard).
--
-- Фильтр — общий примитив FilterGroup (@/lib/filters/types), тот же формат,
-- что board_lists.filters и item_lists.filter_config.
--
-- owner_user_id IS NULL → общее представление воркспейса (видят все участники,
-- меняют управляющие базой знаний и владельцы).
-- owner_user_id NOT NULL → личное представление этого юзера.

CREATE TABLE IF NOT EXISTS public.knowledge_article_views (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  filter_config   jsonb NOT NULL DEFAULT '{"logic":"and","rules":[]}'::jsonb,
  sort_order      integer NOT NULL DEFAULT 0,
  created_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.knowledge_article_views IS 'Сохранённые представления (наборы фильтров) базы знаний.';
COMMENT ON COLUMN public.knowledge_article_views.owner_user_id IS 'NULL = общее представление воркспейса; NOT NULL = личное представление этого юзера.';
COMMENT ON COLUMN public.knowledge_article_views.filter_config IS 'FilterGroup из @/lib/filters/types — общий формат с item_lists.filter_config.';

CREATE INDEX IF NOT EXISTS idx_knowledge_article_views_workspace
  ON public.knowledge_article_views(workspace_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_article_views_owner
  ON public.knowledge_article_views(owner_user_id) WHERE owner_user_id IS NOT NULL;

-- ── Триггер автообновления updated_at ────────────────────

CREATE OR REPLACE FUNCTION public.touch_knowledge_article_views_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_article_views_touch_updated_at ON public.knowledge_article_views;
CREATE TRIGGER trg_knowledge_article_views_touch_updated_at
  BEFORE UPDATE ON public.knowledge_article_views
  FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_article_views_updated_at();

-- ── RLS ──────────────────────────────────────────────────

ALTER TABLE public.knowledge_article_views ENABLE ROW LEVEL SECURITY;

-- Общее представление создаёт/меняет управляющий базой знаний или админ ворка.
-- Вынесено в выражение, повторяемое в insert/update/delete.

-- SELECT: участник воркспейса видит общие (owner NULL) + свои личные.
DROP POLICY IF EXISTS knowledge_article_views_select ON public.knowledge_article_views;
CREATE POLICY knowledge_article_views_select ON public.knowledge_article_views
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.workspace_id = knowledge_article_views.workspace_id
      AND p.user_id = (SELECT auth.uid())
      AND p.is_deleted = false
  )
  AND (owner_user_id IS NULL OR owner_user_id = (SELECT auth.uid()))
);

-- INSERT: личные — сам юзер; общие — управляющий БЗ или админ воркспейса.
DROP POLICY IF EXISTS knowledge_article_views_insert ON public.knowledge_article_views;
CREATE POLICY knowledge_article_views_insert ON public.knowledge_article_views
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.workspace_id = knowledge_article_views.workspace_id
      AND p.user_id = (SELECT auth.uid())
      AND p.is_deleted = false
  )
  AND created_by = (SELECT auth.uid())
  AND (
    owner_user_id = (SELECT auth.uid())
    OR (owner_user_id IS NULL AND (
      public.is_workspace_owner((SELECT auth.uid()), knowledge_article_views.workspace_id)
      OR public.has_workspace_permission((SELECT auth.uid()), knowledge_article_views.workspace_id, 'manage_knowledge_base')
      OR public.has_workspace_permission((SELECT auth.uid()), knowledge_article_views.workspace_id, 'manage_workspace_settings')
    ))
  )
);

-- UPDATE: владелец личного или управляющий для общих.
DROP POLICY IF EXISTS knowledge_article_views_update ON public.knowledge_article_views;
CREATE POLICY knowledge_article_views_update ON public.knowledge_article_views
FOR UPDATE
USING (
  (owner_user_id = (SELECT auth.uid()))
  OR (owner_user_id IS NULL AND (
    public.is_workspace_owner((SELECT auth.uid()), knowledge_article_views.workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), knowledge_article_views.workspace_id, 'manage_knowledge_base')
    OR public.has_workspace_permission((SELECT auth.uid()), knowledge_article_views.workspace_id, 'manage_workspace_settings')
  ))
)
WITH CHECK (
  (owner_user_id = (SELECT auth.uid()))
  OR (owner_user_id IS NULL AND (
    public.is_workspace_owner((SELECT auth.uid()), knowledge_article_views.workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), knowledge_article_views.workspace_id, 'manage_knowledge_base')
    OR public.has_workspace_permission((SELECT auth.uid()), knowledge_article_views.workspace_id, 'manage_workspace_settings')
  ))
);

-- DELETE: то же, что UPDATE.
DROP POLICY IF EXISTS knowledge_article_views_delete ON public.knowledge_article_views;
CREATE POLICY knowledge_article_views_delete ON public.knowledge_article_views
FOR DELETE
USING (
  (owner_user_id = (SELECT auth.uid()))
  OR (owner_user_id IS NULL AND (
    public.is_workspace_owner((SELECT auth.uid()), knowledge_article_views.workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), knowledge_article_views.workspace_id, 'manage_knowledge_base')
    OR public.has_workspace_permission((SELECT auth.uid()), knowledge_article_views.workspace_id, 'manage_workspace_settings')
  ))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_article_views TO authenticated;
