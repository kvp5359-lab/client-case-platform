-- Привязать справочник полей (field_definitions) к юрфирме
-- До этой миграции таблица не имела workspace_id, RLS-политика SELECT была `true`,
-- то есть любая юрфирма видела поля всех остальных. Это баг безопасности.
--
-- Миграция:
-- 1. Добавляет workspace_id (FK на workspaces, ON DELETE CASCADE).
-- 2. Бэкфиллит существующие строки в активную юрфирму client-case
--    (8a946780-77e9-42cd-a05b-cdb66e53c941). Это безопасно: все 31 фактически
--    используемое поле и так привязано к этому воркспейсу через form_templates
--    и form_kits. Остальные 18 «осиротевших» полей (не используются нигде)
--    тоже отправляются туда — мусор оставляем для ручной чистки потом.
-- 3. Делает колонку NOT NULL.
-- 4. Добавляет индекс по workspace_id.
-- 5. Переписывает RLS-политики: SELECT/INSERT/UPDATE/DELETE — все скоупятся
--    по принадлежности юрфирме.

-- 1. Add nullable column
ALTER TABLE public.field_definitions
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 2. Backfill all existing rows to the only active workspace (client-case)
UPDATE public.field_definitions
SET workspace_id = '8a946780-77e9-42cd-a05b-cdb66e53c941'
WHERE workspace_id IS NULL;

-- 3. Make NOT NULL
ALTER TABLE public.field_definitions
  ALTER COLUMN workspace_id SET NOT NULL;

-- 4. Index for fast lookup by workspace
CREATE INDEX IF NOT EXISTS idx_field_definitions_workspace_id
  ON public.field_definitions(workspace_id);

-- 5. Replace RLS policies — scope by workspace
DROP POLICY IF EXISTS field_definitions_select ON public.field_definitions;
DROP POLICY IF EXISTS field_definitions_insert ON public.field_definitions;
DROP POLICY IF EXISTS field_definitions_update ON public.field_definitions;
DROP POLICY IF EXISTS field_definitions_delete ON public.field_definitions;

-- SELECT: any participant of the workspace can read its fields
CREATE POLICY field_definitions_select ON public.field_definitions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = field_definitions.workspace_id
        AND p.is_deleted = false
    )
  );

-- INSERT: only users with manage_templates in the target workspace
CREATE POLICY field_definitions_insert ON public.field_definitions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = field_definitions.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_templates')::boolean = true
    )
  );

-- UPDATE: only users with manage_templates in this row's workspace
CREATE POLICY field_definitions_update ON public.field_definitions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = field_definitions.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_templates')::boolean = true
    )
  );

-- DELETE: same condition as UPDATE
CREATE POLICY field_definitions_delete ON public.field_definitions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = field_definitions.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_templates')::boolean = true
    )
  );
