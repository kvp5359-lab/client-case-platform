-- Фаза 1 обобщения «шаблон треда + переопределения»: владелец привязки может
-- быть не только проект-шаблон, но и интеграция (канал/лид-бот).
--
-- Приводим junction к «правильной с нуля» форме: суррогатный PK, исполнители
-- ссылаются на строку-привязку (binding_id), владелец — через exclusive-arc
-- (template_id XOR integration_id). Существующие строки = проектный владелец
-- (integration_id NULL) → CHECK им удовлетворяет, данные не мигрируют по смыслу.
--
-- ВНИМАНИЕ: меняет форму ключей → проектный фронт (запись исполнителей и
-- переопределений) переводится на binding_id той же волной; типы регенерируются.
-- Транзакционно (apply_migration оборачивает в BEGIN/COMMIT).

-- 1. Суррогатный ключ строки-привязки.
ALTER TABLE public.project_template_thread_templates
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

-- 2. Исполнители ссылаются на строку-привязку. Бэкафилл из текущей пары ключей.
ALTER TABLE public.project_template_thread_assignees
  ADD COLUMN IF NOT EXISTS binding_id uuid;
UPDATE public.project_template_thread_assignees a
  SET binding_id = j.id
  FROM public.project_template_thread_templates j
  WHERE a.template_id = j.template_id
    AND a.thread_template_id = j.thread_template_id
    AND a.binding_id IS NULL;

-- 3. Второй тип владельца (колонка + FK).
ALTER TABLE public.project_template_thread_templates
  ADD COLUMN IF NOT EXISTS integration_id uuid
    REFERENCES public.workspace_integrations(id) ON DELETE CASCADE;

-- 4. Новый PK по суррогату: снять составной FK исполнителей и составной PK.
ALTER TABLE public.project_template_thread_assignees
  DROP CONSTRAINT project_template_thread_assig_template_id_thread_template__fkey;
ALTER TABLE public.project_template_thread_templates
  DROP CONSTRAINT project_template_thread_templates_pkey;
ALTER TABLE public.project_template_thread_templates
  ADD CONSTRAINT project_template_thread_templates_pkey PRIMARY KEY (id);

-- 4b. Теперь template_id вне PK → можно сделать nullable + «ровно один владелец».
ALTER TABLE public.project_template_thread_templates
  ALTER COLUMN template_id DROP NOT NULL;
ALTER TABLE public.project_template_thread_templates
  ADD CONSTRAINT chk_pttt_one_owner
    CHECK (num_nonnulls(template_id, integration_id) = 1);

-- 5. Прежняя уникальность (проекты) + уникальность для каналов — как partial.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pttt_project
  ON public.project_template_thread_templates (template_id, thread_template_id)
  WHERE template_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pttt_integration
  ON public.project_template_thread_templates (integration_id, thread_template_id)
  WHERE integration_id IS NOT NULL;

-- 6. Исполнители: ключ по (binding_id, participant_id); owner-колонки nullable.
ALTER TABLE public.project_template_thread_assignees
  ALTER COLUMN binding_id SET NOT NULL;
ALTER TABLE public.project_template_thread_assignees
  ADD CONSTRAINT project_template_thread_assignees_binding_fkey
    FOREIGN KEY (binding_id)
    REFERENCES public.project_template_thread_templates(id) ON DELETE CASCADE;
ALTER TABLE public.project_template_thread_assignees
  DROP CONSTRAINT project_template_thread_assignees_pkey;
ALTER TABLE public.project_template_thread_assignees
  ADD CONSTRAINT project_template_thread_assignees_pkey PRIMARY KEY (binding_id, participant_id);
ALTER TABLE public.project_template_thread_assignees
  ALTER COLUMN template_id DROP NOT NULL;
ALTER TABLE public.project_template_thread_assignees
  ALTER COLUMN thread_template_id DROP NOT NULL;

-- 6b. Backward-compat: старый проектный фронт вставляет исполнителей парой
-- (template_id, thread_template_id) без binding_id. Триггер сам подставит
-- binding_id из строки-привязки → существующий код проектов работает как есть,
-- окна поломки при cutover нет.
CREATE OR REPLACE FUNCTION public.ptta_fill_binding_id()
  RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.binding_id IS NULL
     AND NEW.template_id IS NOT NULL
     AND NEW.thread_template_id IS NOT NULL THEN
    SELECT id INTO NEW.binding_id
    FROM public.project_template_thread_templates
    WHERE template_id = NEW.template_id
      AND thread_template_id = NEW.thread_template_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ptta_fill_binding_id ON public.project_template_thread_assignees;
CREATE TRIGGER trg_ptta_fill_binding_id
  BEFORE INSERT ON public.project_template_thread_assignees
  FOR EACH ROW EXECUTE FUNCTION public.ptta_fill_binding_id();

-- 7. RLS: обобщить владельца (проект-шаблон ИЛИ канал-интеграция).
DROP POLICY IF EXISTS pttt_select ON public.project_template_thread_templates;
CREATE POLICY pttt_select ON public.project_template_thread_templates
  FOR SELECT USING (
    (template_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.project_templates pt
      JOIN public.participants p ON p.workspace_id = pt.workspace_id
      WHERE pt.id = project_template_thread_templates.template_id
        AND p.user_id = (SELECT auth.uid()) AND p.is_deleted = false))
    OR (integration_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspace_integrations wi
      JOIN public.participants p ON p.workspace_id = wi.workspace_id
      WHERE wi.id = project_template_thread_templates.integration_id
        AND p.user_id = (SELECT auth.uid()) AND p.is_deleted = false))
  );

DROP POLICY IF EXISTS pttt_write ON public.project_template_thread_templates;
CREATE POLICY pttt_write ON public.project_template_thread_templates
  FOR ALL USING (
    (template_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.project_templates pt
      JOIN public.participants p ON p.workspace_id = pt.workspace_id
      WHERE pt.id = project_template_thread_templates.template_id
        AND p.user_id = (SELECT auth.uid())
        AND p.workspace_roles && ARRAY['Владелец','Администратор']
        AND p.is_deleted = false))
    OR (integration_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspace_integrations wi
      JOIN public.participants p ON p.workspace_id = wi.workspace_id
      WHERE wi.id = project_template_thread_templates.integration_id
        AND p.user_id = (SELECT auth.uid())
        AND p.workspace_roles && ARRAY['Владелец','Администратор']
        AND p.is_deleted = false))
  ) WITH CHECK (
    (template_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.project_templates pt
      JOIN public.participants p ON p.workspace_id = pt.workspace_id
      WHERE pt.id = project_template_thread_templates.template_id
        AND p.user_id = (SELECT auth.uid())
        AND p.workspace_roles && ARRAY['Владелец','Администратор']
        AND p.is_deleted = false))
    OR (integration_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspace_integrations wi
      JOIN public.participants p ON p.workspace_id = wi.workspace_id
      WHERE wi.id = project_template_thread_templates.integration_id
        AND p.user_id = (SELECT auth.uid())
        AND p.workspace_roles && ARRAY['Владелец','Администратор']
        AND p.is_deleted = false))
  );

-- Исполнители: доступ резолвится через владельца строки-привязки (binding_id).
DROP POLICY IF EXISTS ptta_select ON public.project_template_thread_assignees;
CREATE POLICY ptta_select ON public.project_template_thread_assignees
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.project_template_thread_templates j
      WHERE j.id = project_template_thread_assignees.binding_id AND (
        (j.template_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.project_templates pt
          JOIN public.participants p ON p.workspace_id = pt.workspace_id
          WHERE pt.id = j.template_id
            AND p.user_id = (SELECT auth.uid()) AND p.is_deleted = false))
        OR (j.integration_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.workspace_integrations wi
          JOIN public.participants p ON p.workspace_id = wi.workspace_id
          WHERE wi.id = j.integration_id
            AND p.user_id = (SELECT auth.uid()) AND p.is_deleted = false))
      )
    )
  );

DROP POLICY IF EXISTS ptta_write ON public.project_template_thread_assignees;
CREATE POLICY ptta_write ON public.project_template_thread_assignees
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.project_template_thread_templates j
      WHERE j.id = project_template_thread_assignees.binding_id AND (
        (j.template_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.project_templates pt
          JOIN public.participants p ON p.workspace_id = pt.workspace_id
          WHERE pt.id = j.template_id AND p.user_id = (SELECT auth.uid())
            AND p.workspace_roles && ARRAY['Владелец','Администратор'] AND p.is_deleted = false))
        OR (j.integration_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.workspace_integrations wi
          JOIN public.participants p ON p.workspace_id = wi.workspace_id
          WHERE wi.id = j.integration_id AND p.user_id = (SELECT auth.uid())
            AND p.workspace_roles && ARRAY['Владелец','Администратор'] AND p.is_deleted = false))
      )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_template_thread_templates j
      WHERE j.id = project_template_thread_assignees.binding_id AND (
        (j.template_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.project_templates pt
          JOIN public.participants p ON p.workspace_id = pt.workspace_id
          WHERE pt.id = j.template_id AND p.user_id = (SELECT auth.uid())
            AND p.workspace_roles && ARRAY['Владелец','Администратор'] AND p.is_deleted = false))
        OR (j.integration_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.workspace_integrations wi
          JOIN public.participants p ON p.workspace_id = wi.workspace_id
          WHERE wi.id = j.integration_id AND p.user_id = (SELECT auth.uid())
            AND p.workspace_roles && ARRAY['Владелец','Администратор'] AND p.is_deleted = false))
      )
    )
  );
