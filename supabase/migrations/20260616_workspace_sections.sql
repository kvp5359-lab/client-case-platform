-- Разделы (workspace_sections): группировка досок и списков в именованные
-- разделы воркспейса (м-к-м). Раздел общий для команды (личных разделов нет),
-- видят все участники, создают/меняют — владелец или менеджер с
-- manage_workspace_settings. Доска/список может входить в несколько разделов.

CREATE TABLE IF NOT EXISTS public.workspace_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  color text,
  order_index integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_workspace_sections_ws
  ON public.workspace_sections(workspace_id) WHERE is_deleted = false;

-- Членство: доска ('board') или список ('list') в разделе.
CREATE TABLE IF NOT EXISTS public.workspace_section_items (
  section_id uuid NOT NULL REFERENCES public.workspace_sections(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('board', 'list')),
  item_id uuid NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  PRIMARY KEY (section_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_section_items_section
  ON public.workspace_section_items(section_id);
-- Для запроса «в каких разделах состоит этот элемент».
CREATE INDEX IF NOT EXISTS idx_section_items_item
  ON public.workspace_section_items(item_type, item_id);

ALTER TABLE public.workspace_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_section_items ENABLE ROW LEVEL SECURITY;

-- ── RLS: workspace_sections ──
DROP POLICY IF EXISTS ws_sections_select ON public.workspace_sections;
CREATE POLICY ws_sections_select ON public.workspace_sections
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.workspace_id = workspace_sections.workspace_id
      AND p.user_id = (SELECT auth.uid())
      AND p.is_deleted = false
  )
);

DROP POLICY IF EXISTS ws_sections_write ON public.workspace_sections;
CREATE POLICY ws_sections_write ON public.workspace_sections
FOR ALL USING (
  public.is_workspace_owner((SELECT auth.uid()), workspace_sections.workspace_id)
  OR public.has_workspace_permission((SELECT auth.uid()), workspace_sections.workspace_id, 'manage_workspace_settings')
) WITH CHECK (
  public.is_workspace_owner((SELECT auth.uid()), workspace_sections.workspace_id)
  OR public.has_workspace_permission((SELECT auth.uid()), workspace_sections.workspace_id, 'manage_workspace_settings')
);

-- ── RLS: workspace_section_items (доступ через родительский раздел) ──
DROP POLICY IF EXISTS ws_section_items_select ON public.workspace_section_items;
CREATE POLICY ws_section_items_select ON public.workspace_section_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.workspace_sections s
    JOIN public.participants p ON p.workspace_id = s.workspace_id
    WHERE s.id = workspace_section_items.section_id
      AND p.user_id = (SELECT auth.uid())
      AND p.is_deleted = false
  )
);

DROP POLICY IF EXISTS ws_section_items_write ON public.workspace_section_items;
CREATE POLICY ws_section_items_write ON public.workspace_section_items
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.workspace_sections s
    WHERE s.id = workspace_section_items.section_id
      AND (
        public.is_workspace_owner((SELECT auth.uid()), s.workspace_id)
        OR public.has_workspace_permission((SELECT auth.uid()), s.workspace_id, 'manage_workspace_settings')
      )
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_sections s
    WHERE s.id = workspace_section_items.section_id
      AND (
        public.is_workspace_owner((SELECT auth.uid()), s.workspace_id)
        OR public.has_workspace_permission((SELECT auth.uid()), s.workspace_id, 'manage_workspace_settings')
      )
  )
);

-- Гранты: только authenticated/service_role; anon исключаем (default privileges
-- иначе могут выдать ему доступ).
REVOKE ALL ON public.workspace_sections FROM PUBLIC, anon;
REVOKE ALL ON public.workspace_section_items FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_sections TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_section_items TO authenticated, service_role;
