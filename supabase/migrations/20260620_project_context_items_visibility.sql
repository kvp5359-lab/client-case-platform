-- Видимость заметок «Материалы команды»: режим доступа + индивидуальные участники.
-- Модель зеркалит доступ тредов (project_threads.access_type/access_roles + project_thread_members).
-- Применялась через MCP; файл добавлен для закрытия дрейфа repo↔prod. Идемпотентна.

-- 1. Колонки доступа на заметке
ALTER TABLE public.project_context_items
  ADD COLUMN IF NOT EXISTS access_type text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS access_roles text[] NOT NULL DEFAULT '{}';

-- created_by: автор всегда видит свою заметку (важно для INSERT...RETURNING под RLS)
ALTER TABLE public.project_context_items
  ALTER COLUMN created_by SET DEFAULT auth.uid();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_context_items_access_type_check'
  ) THEN
    ALTER TABLE public.project_context_items
      ADD CONSTRAINT project_context_items_access_type_check
      CHECK (access_type IN ('all', 'roles', 'custom'));
  END IF;
END $$;

-- 2. Индивидуальные участники заметки (режим 'custom')
CREATE TABLE IF NOT EXISTS public.project_context_item_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.project_context_items(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, participant_id)
);

ALTER TABLE public.project_context_item_members ENABLE ROW LEVEL SECURITY;

-- 3. Функция видимости (scalar-аргументы из строки — НЕ перечитывает project_context_items,
--    безопасно для INSERT...RETURNING под SELECT-полицией).
CREATE OR REPLACE FUNCTION public.context_note_visible(
  p_project_id uuid,
  p_workspace_id uuid,
  p_access_type text,
  p_access_roles text[],
  p_created_by uuid,
  p_item_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_participant_id uuid;
  v_project_roles text[];
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  -- Автор заметки — всегда
  IF p_created_by = p_user_id THEN RETURN true; END IF;

  -- Владелец / админ воркспейса (view_all_projects) — всегда
  IF EXISTS (
    SELECT 1 FROM participants par
    JOIN workspace_roles wr ON wr.name = ANY(par.workspace_roles) AND wr.workspace_id = par.workspace_id
    WHERE par.user_id = p_user_id AND par.workspace_id = p_workspace_id AND par.is_deleted = false
      AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true)
  ) THEN
    RETURN true;
  END IF;

  -- Личность в проекте
  SELECT par.id INTO v_participant_id
    FROM participants par
    WHERE par.user_id = p_user_id AND par.workspace_id = p_workspace_id AND par.is_deleted = false;
  IF v_participant_id IS NULL THEN RETURN false; END IF;

  -- Явный участник заметки (режим custom) — всегда
  IF EXISTS (
    SELECT 1 FROM project_context_item_members m
    WHERE m.item_id = p_item_id AND m.participant_id = v_participant_id
  ) THEN
    RETURN true;
  END IF;

  SELECT pp.project_roles INTO v_project_roles
    FROM project_participants pp
    WHERE pp.project_id = p_project_id AND pp.participant_id = v_participant_id;
  v_project_roles := COALESCE(v_project_roles, '{}');

  -- Команда (Администратор / Исполнитель) видит всегда — по требованию
  IF 'Администратор' = ANY(v_project_roles) OR 'Исполнитель' = ANY(v_project_roles) THEN
    RETURN true;
  END IF;

  IF p_access_type = 'all' THEN RETURN true; END IF;
  IF p_access_type = 'roles' AND COALESCE(p_access_roles, '{}') && v_project_roles THEN RETURN true; END IF;
  RETURN false;
END;
$$;

-- 4. SELECT-полиция: базовый гейт модуля И гейт видимости конкретной заметки
DROP POLICY IF EXISTS project_context_items_select ON public.project_context_items;
CREATE POLICY project_context_items_select ON public.project_context_items
  FOR SELECT TO public
  USING (
    (
      has_project_module_access((SELECT auth.uid()), project_id, 'project_context')
      OR has_workspace_permission((SELECT auth.uid()), workspace_id, 'view_all_projects')
    )
    AND context_note_visible(project_id, workspace_id, access_type, access_roles, created_by, id, (SELECT auth.uid()))
  );

-- 5. RLS для участников заметки: доступ тем, кто может редактировать заметку
DROP POLICY IF EXISTS project_context_item_members_all ON public.project_context_item_members;
CREATE POLICY project_context_item_members_all ON public.project_context_item_members
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM project_context_items i
      WHERE i.id = item_id
        AND (
          has_project_module_access((SELECT auth.uid()), i.project_id, 'project_context')
          OR has_workspace_permission((SELECT auth.uid()), i.workspace_id, 'edit_all_projects')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_context_items i
      WHERE i.id = item_id
        AND (
          has_project_module_access((SELECT auth.uid()), i.project_id, 'project_context')
          OR has_workspace_permission((SELECT auth.uid()), i.workspace_id, 'edit_all_projects')
        )
    )
  );
