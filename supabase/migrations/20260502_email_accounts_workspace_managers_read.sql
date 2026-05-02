-- Владельцы / администраторы воркспейса должны видеть все Gmail-ящики
-- сотрудников на странице «Интеграции». Существующая политика
-- "Users can view own email accounts" ограничивает этим только своих,
-- что корректно для обычных юзеров. Для манагеров расширяем.

CREATE POLICY "Workspace managers can view all email accounts"
  ON public.email_accounts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = email_accounts.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_workspace_settings')::boolean = true
    )
  );
