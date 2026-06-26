-- Настраиваемые дефолты иконки и цвета для НОВЫХ тредов по каналам.
-- Хранятся на уровне воркспейса в workspaces.channel_defaults (jsonb).
-- Ключи каналов: telegram (групповые чаты/секретарь), telegram_personal
-- (Business + MTProto, личные диалоги сотрудника), wazzup (WhatsApp/Instagram),
-- email (Gmail + Resend). При создании треда значение КОПИРУЕТСЯ в поля
-- project_threads.icon/accent_color — дальше тред живёт независимо, ручная
-- смена иконки/цвета у конкретного треда работает как раньше.
--
-- Стартовый сид повторяет прежние жёсткие дефолты в коде (за исключением
-- email: фикс 'red' → 'rose', т.к. 'red' не входит в union ThreadAccentColor
-- и на фронте не рендерился корректно).

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS channel_defaults jsonb NOT NULL DEFAULT
    '{
      "telegram":          {"icon": "telegram",  "accent_color": "blue"},
      "telegram_personal": {"icon": "telegram",  "accent_color": "blue"},
      "wazzup":            {"icon": "whatsapp",  "accent_color": "emerald"},
      "email":             {"icon": "mail",      "accent_color": "rose"}
    }'::jsonb;

-- Хелпер: вернуть иконку+цвет по умолчанию для канала воркспейса.
-- Единый источник правды о фолбэках для ВСЕХ рантаймов (SQL RPC, edge
-- functions, mtproto-service, next API). Если в channel_defaults ключа нет
-- или поле пустое — отдаёт зашитый фолбэк по типу канала.
CREATE OR REPLACE FUNCTION public.resolve_channel_default(
  p_workspace_id uuid,
  p_channel_key text
)
RETURNS TABLE(icon text, accent_color text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH cfg AS (
    SELECT (channel_defaults -> p_channel_key) AS v
    FROM workspaces
    WHERE id = p_workspace_id
  ),
  fb AS (
    SELECT
      CASE p_channel_key
        WHEN 'wazzup'            THEN 'whatsapp'
        WHEN 'email'             THEN 'mail'
        WHEN 'telegram'          THEN 'telegram'
        WHEN 'telegram_personal' THEN 'telegram'
        ELSE 'message-circle'
      END AS icon,
      CASE p_channel_key
        WHEN 'wazzup' THEN 'emerald'
        WHEN 'email'  THEN 'rose'
        ELSE 'blue'
      END AS accent_color
  )
  SELECT
    COALESCE(NULLIF((SELECT v ->> 'icon' FROM cfg), ''), (SELECT icon FROM fb)),
    COALESCE(NULLIF((SELECT v ->> 'accent_color' FROM cfg), ''), (SELECT accent_color FROM fb));
$$;

REVOKE ALL ON FUNCTION public.resolve_channel_default(uuid, text) FROM PUBLIC;
-- Supabase раздаёт новым public-функциям грант anon по умолчанию — REVOKE PUBLIC
-- его НЕ снимает, нужен явный REVOKE FROM anon (SECURITY DEFINER читает workspaces).
REVOKE EXECUTE ON FUNCTION public.resolve_channel_default(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_channel_default(uuid, text) TO authenticated, service_role;
