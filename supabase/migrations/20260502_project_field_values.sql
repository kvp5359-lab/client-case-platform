-- Значения кастомных полей конкретного проекта.
-- Поле value — jsonb с примитивом по типу поля.

CREATE TABLE IF NOT EXISTS public.project_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  field_definition_id uuid NOT NULL REFERENCES public.field_definitions(id) ON DELETE CASCADE,
  value jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, field_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_pfv_project ON public.project_field_values(project_id);
CREATE INDEX IF NOT EXISTS idx_pfv_field ON public.project_field_values(field_definition_id);

ALTER TABLE public.project_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY pfv_select ON public.project_field_values
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects pr
      JOIN public.participants p ON p.workspace_id = pr.workspace_id
      WHERE pr.id = project_field_values.project_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY pfv_insert ON public.project_field_values
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects pr
      JOIN public.participants p ON p.workspace_id = pr.workspace_id
      WHERE pr.id = project_field_values.project_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY pfv_update ON public.project_field_values
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects pr
      JOIN public.participants p ON p.workspace_id = pr.workspace_id
      WHERE pr.id = project_field_values.project_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE POLICY pfv_delete ON public.project_field_values
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects pr
      JOIN public.participants p ON p.workspace_id = pr.workspace_id
      WHERE pr.id = project_field_values.project_id
        AND p.user_id = auth.uid()
        AND p.is_deleted = false
    )
  );

CREATE OR REPLACE FUNCTION public.touch_pfv_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pfv_set_updated_at ON public.project_field_values;
CREATE TRIGGER pfv_set_updated_at
  BEFORE UPDATE ON public.project_field_values
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_pfv_updated_at();
