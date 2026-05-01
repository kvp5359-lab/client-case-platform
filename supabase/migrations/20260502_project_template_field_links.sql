-- Связь шаблон проекта ↔ кастомные поля.
-- Поля живут в общем справочнике field_definitions (per-workspace),
-- здесь — выбор того, какие из них попадают в проекты данного шаблона,
-- их порядок и флаг обязательности.

CREATE TABLE IF NOT EXISTS public.project_template_field_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  field_definition_id uuid NOT NULL REFERENCES public.field_definitions(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, field_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_ptfl_template ON public.project_template_field_links(template_id, order_index);
CREATE INDEX IF NOT EXISTS idx_ptfl_field ON public.project_template_field_links(field_definition_id);

ALTER TABLE public.project_template_field_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY ptfl_select ON public.project_template_field_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_templates pt
      JOIN public.participants p ON p.workspace_id = pt.workspace_id
      WHERE pt.id = project_template_field_links.template_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY ptfl_insert ON public.project_template_field_links
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_templates pt
      JOIN public.participants p ON p.workspace_id = pt.workspace_id
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      WHERE pt.id = project_template_field_links.template_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_templates')::boolean = true
    )
  );

CREATE POLICY ptfl_update ON public.project_template_field_links
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_templates pt
      JOIN public.participants p ON p.workspace_id = pt.workspace_id
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      WHERE pt.id = project_template_field_links.template_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_templates')::boolean = true
    )
  );

CREATE POLICY ptfl_delete ON public.project_template_field_links
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_templates pt
      JOIN public.participants p ON p.workspace_id = pt.workspace_id
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      WHERE pt.id = project_template_field_links.template_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_templates')::boolean = true
    )
  );
