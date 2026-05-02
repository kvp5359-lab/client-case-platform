-- Глобальная привязка user_id (наш сервис) ↔ tg_user_id (Telegram).
-- Нужна для:
--  * Telegram Business: при подключении бота через Settings → Business → Chatbots
--    Telegram присылает только tg_user_id; мы должны знать, чьё это подключение.
--  * Будущих фич: личные уведомления сотруднику в TG, DM-бот.
--
-- Один user_id → один tg_user_id (один сотрудник = один личный TG). Если
-- сотрудник перепривяжет другой TG — старая запись перезаписывается.

CREATE TABLE public.user_telegram_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tg_user_id bigint NOT NULL UNIQUE,
  tg_username text,
  tg_first_name text,
  tg_last_name text,
  linked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_telegram_links_tg_user ON public.user_telegram_links(tg_user_id);

ALTER TABLE public.user_telegram_links ENABLE ROW LEVEL SECURITY;

-- Видеть свою связку — каждый сам.
CREATE POLICY "Users see own tg link"
  ON public.user_telegram_links
  FOR SELECT
  USING (user_id = auth.uid());

-- Менеджеры воркспейса видят связки сотрудников своего воркспейса (для UI
-- «Telegram Business» в настройках интеграций).
CREATE POLICY "Workspace managers see participants tg links"
  ON public.user_telegram_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      JOIN public.participants p_target
        ON p_target.workspace_id = p.workspace_id
       AND p_target.user_id = user_telegram_links.user_id
      WHERE p.user_id = auth.uid()
        AND p.is_deleted = false
        AND p_target.is_deleted = false
        AND (wr.permissions->>'manage_workspace_settings')::boolean = true
    )
  );

-- INSERT/UPDATE/DELETE — только service role (Edge Function).

COMMENT ON TABLE public.user_telegram_links IS 'Глобальная привязка user_id ↔ tg_user_id. Один сотрудник = один личный TG-аккаунт.';

-- ===========================================================================
-- Токены для двухшагового подключения Telegram Business
-- ===========================================================================
-- Сотрудник в UI жмёт «Подключить Telegram Business» → создаём токен →
-- показываем deep-link t.me/clientcase_bot?start=biz_<token>. Когда сотрудник
-- кликает и жмёт START в боте, webhook ловит /start с токеном → создаёт
-- запись в user_telegram_links (или обновляет существующую).
-- TTL: 30 минут.

CREATE TABLE public.telegram_business_link_tokens (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  consumed_at timestamptz
);

CREATE INDEX idx_tblt_user ON public.telegram_business_link_tokens(user_id);

ALTER TABLE public.telegram_business_link_tokens ENABLE ROW LEVEL SECURITY;

-- Сам видит свои токены.
CREATE POLICY "Users see own business link tokens"
  ON public.telegram_business_link_tokens
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT — пользователь сам себе создаёт токен в своём воркспейсе.
CREATE POLICY "Users insert own business link tokens"
  ON public.telegram_business_link_tokens
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = telegram_business_link_tokens.workspace_id
        AND p.is_deleted = false
    )
  );

COMMENT ON TABLE public.telegram_business_link_tokens IS 'Одноразовые токены для привязки tg-аккаунта сотрудника при подключении Telegram Business.';
