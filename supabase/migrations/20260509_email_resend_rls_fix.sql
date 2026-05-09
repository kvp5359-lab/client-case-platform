-- Фикс RLS-полиси для email-таблиц.
-- В исходной миграции (20260509_email_resend_schema.sql) параметры has_workspace_permission
-- были перепутаны местами: функция принимает (p_user_id, p_workspace_id, p_permission),
-- а в полиси передавали (workspace_id, auth.uid(), permission). В итоге даже владельцу
-- запрос всегда возвращал false и таблицы выглядели пустыми.

DROP POLICY IF EXISTS email_virtual_addresses_select ON public.email_virtual_addresses;
CREATE POLICY email_virtual_addresses_select ON public.email_virtual_addresses
  FOR SELECT USING (public.is_workspace_participant(workspace_id, auth.uid()));

DROP POLICY IF EXISTS email_virtual_addresses_modify ON public.email_virtual_addresses;
CREATE POLICY email_virtual_addresses_modify ON public.email_virtual_addresses
  FOR ALL USING (public.has_workspace_permission(auth.uid(), workspace_id, 'manage_workspace_settings'));

DROP POLICY IF EXISTS email_inbound_unmatched_select ON public.email_inbound_unmatched;
CREATE POLICY email_inbound_unmatched_select ON public.email_inbound_unmatched
  FOR SELECT USING (public.has_workspace_permission(auth.uid(), workspace_id, 'manage_workspace_settings'));

DROP POLICY IF EXISTS email_inbound_unmatched_update ON public.email_inbound_unmatched;
CREATE POLICY email_inbound_unmatched_update ON public.email_inbound_unmatched
  FOR UPDATE USING (public.has_workspace_permission(auth.uid(), workspace_id, 'manage_workspace_settings'));

DROP POLICY IF EXISTS workspace_email_settings_select ON public.workspace_email_settings;
CREATE POLICY workspace_email_settings_select ON public.workspace_email_settings
  FOR SELECT USING (public.is_workspace_participant(workspace_id, auth.uid()));

DROP POLICY IF EXISTS workspace_email_settings_modify ON public.workspace_email_settings;
CREATE POLICY workspace_email_settings_modify ON public.workspace_email_settings
  FOR ALL USING (public.has_workspace_permission(auth.uid(), workspace_id, 'manage_workspace_settings'));
