-- Telegram MTProto канал — параллельная интеграция к Telegram Business.
-- Используем личный аккаунт сотрудника как клиент Telegram (через gramjs),
-- что даёт всё, чего не хватает в Bot API: реакции в обе стороны,
-- прочитанность сообщений (галочки), статус «онлайн», typing.
--
-- Зона ответственности: только private chats (1-на-1). Групповые чаты
-- остаются на бот-секретаре (через telegram-webhook), чтобы не получить
-- дубли сообщений.
--
-- Хранение сессий: gramjs StringSession шифруется AES-256-GCM на стороне
-- MTProto-сервиса перед записью в БД (ключ — env переменная сервиса).
-- В колонке `session_encrypted` лежит base64.

-- ===========================================================================
-- 1. Активные сессии
-- ===========================================================================
-- Один сотрудник = одна сессия (можно переподключиться, тогда старая
-- замещается). user_id PK гарантирует это.

CREATE TABLE public.telegram_mtproto_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- gramjs StringSession, зашифрован AES-256-GCM на стороне MTProto-сервиса.
  session_encrypted text NOT NULL,

  -- Сведения о Telegram-аккаунте (для UI и сверки).
  tg_user_id bigint NOT NULL UNIQUE,
  tg_username text,
  tg_first_name text,
  tg_last_name text,
  tg_phone text,

  -- Статус коннекта. is_active=false если сессия отключилась/протухла.
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,

  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tms_workspace ON public.telegram_mtproto_sessions(workspace_id);
CREATE INDEX idx_tms_tg_user ON public.telegram_mtproto_sessions(tg_user_id);

ALTER TABLE public.telegram_mtproto_sessions ENABLE ROW LEVEL SECURITY;

-- Юзер видит свою сессию.
CREATE POLICY "Users see own mtproto session"
  ON public.telegram_mtproto_sessions
  FOR SELECT
  USING (user_id = auth.uid());

-- Менеджеры воркспейса видят все сессии своего воркспейса (для UI «Интеграции»).
CREATE POLICY "Workspace managers see all mtproto sessions"
  ON public.telegram_mtproto_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = telegram_mtproto_sessions.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_workspace_settings')::boolean = true
    )
  );

-- INSERT/UPDATE/DELETE — только service role (MTProto-сервис).

CREATE TRIGGER tms_set_updated_at
  BEFORE UPDATE ON public.telegram_mtproto_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.telegram_mtproto_sessions IS 'Сессии Telegram MTProto (личные аккаунты сотрудников). Один user_id = одна сессия.';

-- ===========================================================================
-- 2. Промежуточные auth-state'ы (между sendCode и signIn)
-- ===========================================================================
-- Telegram-логин двухшаговый: sendCode → signIn(code). Между шагами надо
-- хранить phone_code_hash. TTL короткий (5 минут) — после этого Telegram
-- сам отвергает код.

CREATE TABLE public.telegram_mtproto_auth_states (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  phone_code_hash text NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- session_encrypted на стадии sendCode: gramjs создаёт временный StringSession,
  -- который надо передать в signIn (иначе он не свяжет код с попыткой логина).
  pending_session_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);

ALTER TABLE public.telegram_mtproto_auth_states ENABLE ROW LEVEL SECURITY;

-- INSERT/SELECT/DELETE — только service role.

COMMENT ON TABLE public.telegram_mtproto_auth_states IS 'Промежуточное состояние логина MTProto: phone_code_hash + pending session между sendCode и signIn.';

-- ===========================================================================
-- 3. project_threads — поля для MTProto-привязки
-- ===========================================================================
-- Параллельные с business_connection_id колонки: для тредов, которые
-- открываются через MTProto-канал, а не через Business.

ALTER TABLE public.project_threads
  ADD COLUMN mtproto_session_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN mtproto_client_tg_user_id bigint;

CREATE UNIQUE INDEX uq_threads_mtproto_per_client
  ON public.project_threads(mtproto_session_user_id, mtproto_client_tg_user_id)
  WHERE mtproto_session_user_id IS NOT NULL
    AND mtproto_client_tg_user_id IS NOT NULL
    AND is_deleted = false;

COMMENT ON COLUMN public.project_threads.mtproto_session_user_id IS 'Если тред пришёл через Telegram MTProto — id сотрудника-владельца сессии.';
COMMENT ON COLUMN public.project_threads.mtproto_client_tg_user_id IS 'Telegram user id клиента в этом MTProto-треде.';

-- ===========================================================================
-- 4. project_messages — статус прочитанности + новый источник
-- ===========================================================================
-- Через MTProto Telegram присылает updateReadHistoryOutbox, когда клиент
-- прочитал наше исходящее. Сохраняем timestamp, чтобы UI рисовал «двойные галочки».
ALTER TABLE public.project_messages
  ADD COLUMN recipient_read_at timestamptz;

COMMENT ON COLUMN public.project_messages.recipient_read_at IS 'Когда получатель прочитал это сообщение (из updateReadHistoryOutbox через MTProto).';

-- Новое значение enum для source.
ALTER TYPE message_source ADD VALUE IF NOT EXISTS 'telegram_mtproto';

-- ===========================================================================
-- 5. Расширяем триггер исходящих сообщений: ветка на MTProto
-- ===========================================================================
-- Если у треда заполнен mtproto_session_user_id — шлём в новый эндпоинт
-- MTProto-сервиса (URL внутри VPS-сети). Эту работу не может делать
-- Edge Function, потому что MTProto требует постоянного TCP-коннекта.

-- Триггер обновим на этапе 6 (когда сервис будет задеплоен и URL известен).
-- Пока миграция только готовит схему — реальная маршрутизация добавляется
-- следом за деплоем сервиса.
