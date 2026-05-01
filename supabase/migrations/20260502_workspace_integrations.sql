-- Единая таблица интеграций воркспейса.
-- Сейчас — пустая «полка»: существующие Gmail/Telegram продолжают работать
-- через свои таблицы (email_accounts, project_telegram_chats). По мере того
-- как интеграции переедут под per-workspace конфигурацию (per-workspace
-- Telegram-бот, Telegram Business), они начнут писаться в эту таблицу.

CREATE TABLE IF NOT EXISTS public.workspace_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secrets jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_integrations_workspace
  ON public.workspace_integrations(workspace_id, type);

ALTER TABLE public.workspace_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_integrations_select ON public.workspace_integrations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = workspace_integrations.workspace_id
        AND p.is_deleted = false
    )
  );

CREATE POLICY workspace_integrations_insert ON public.workspace_integrations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = workspace_integrations.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_workspace_settings')::boolean = true
    )
  );

CREATE POLICY workspace_integrations_update ON public.workspace_integrations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = workspace_integrations.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_workspace_settings')::boolean = true
    )
  );

CREATE POLICY workspace_integrations_delete ON public.workspace_integrations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = workspace_integrations.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_workspace_settings')::boolean = true
    )
  );

CREATE OR REPLACE FUNCTION public.touch_workspace_integrations_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_integrations_set_updated_at ON public.workspace_integrations;
CREATE TRIGGER workspace_integrations_set_updated_at
  BEFORE UPDATE ON public.workspace_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_workspace_integrations_updated_at();
