-- Аудит безопасности 2026-06-12, этап 1.3.
-- docbuilder_app_settings.settings (jsonb) хранит API-ключи (anthropic/gemini/openrouter/
-- google vision/sheets) в открытом виде, а SELECT-политика была USING (true) —
-- любой залогиненный пользователь ClientCase читал чужие платные ключи.
-- Сужаем до участников docbuilder (любая роль в docbuilder_allowed_users) —
-- оба реальных пользователя старого приложения продолжают работать,
-- все остальные юзеры платформы отрезаны.
-- Откат (если старое приложение пострадает):
--   DROP POLICY app_settings_select ON docbuilder_app_settings;
--   CREATE POLICY app_settings_select ON docbuilder_app_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS app_settings_select ON public.docbuilder_app_settings;
CREATE POLICY app_settings_select ON public.docbuilder_app_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.docbuilder_allowed_users u
      WHERE lower(u.email) = public.docbuilder_user_email()
    )
  );
