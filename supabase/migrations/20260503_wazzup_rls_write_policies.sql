-- HOTFIX: миграция 20260503_wazzup_integration.sql дала только SELECT-полиси,
-- из-за чего фронт не мог сохранить API-ключ (UPSERT отбивался RLS молча).
-- Также нужен UPDATE на wazzup_channels для UI-привязки каналов к сотрудникам.

CREATE POLICY "Workspace managers manage wazzup settings"
  ON public.wazzup_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id AND wr.name = ANY(p.workspace_roles)
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = wazzup_settings.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_workspace_settings')::boolean = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id AND wr.name = ANY(p.workspace_roles)
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = wazzup_settings.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_workspace_settings')::boolean = true
    )
  );

CREATE POLICY "Workspace managers update wazzup channels"
  ON public.wazzup_channels
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id AND wr.name = ANY(p.workspace_roles)
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = wazzup_channels.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_workspace_settings')::boolean = true
    )
  );
