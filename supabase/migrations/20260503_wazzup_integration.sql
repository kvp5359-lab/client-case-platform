-- Wazzup (WhatsApp / Instagram / etc через шлюз wazzup24.com) — этап 1: схема БД.
--
-- Архитектура «как у Telegram Business»:
--   - один общий аккаунт Wazzup на воркспейс (API-ключ);
--   - каждый канал Wazzup (= номер WhatsApp) привязан к конкретному сотруднику;
--   - входящие сообщения создают тред в системном «инбоксе» сотрудника
--     (is_system_wazzup_inbox=true), один тред на одного клиента в рамках канала;
--   - исходящие из UI идут через Edge Function wazzup-send → REST Wazzup v3.
--
-- Защита webhook: Wazzup не поддерживает custom-headers, поэтому секрет идёт
-- query-param'ом в URL: …/wazzup-webhook?key=<webhook_secret>.

-- ===========================================================================
-- 1. Настройки Wazzup на воркспейс (один API-ключ на ws)
-- ===========================================================================
CREATE TABLE public.wazzup_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  api_key text NOT NULL,                     -- ключ из кабинета Wazzup
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
                                              -- секрет для query-param при приёме webhooks
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.wazzup_settings ENABLE ROW LEVEL SECURITY;

-- SELECT: участникам воркспейса с правом manage_workspace_settings.
CREATE POLICY "Workspace managers see wazzup settings"
  ON public.wazzup_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = wazzup_settings.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_workspace_settings')::boolean = true
    )
  );

-- INSERT/UPDATE/DELETE — только service role (через хук, который дёргает Edge Function).
-- Если решим позволить менеджерам напрямую — добавим политики позже.

CREATE TRIGGER wazzup_settings_set_updated_at
  BEFORE UPDATE ON public.wazzup_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================================================
-- 2. Каналы Wazzup (= номера WhatsApp / Instagram / etc) с привязкой к сотруднику
-- ===========================================================================
CREATE TABLE public.wazzup_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- user_id может быть NULL: канал ещё не назначен сотруднику (только что подгрузили из Wazzup).
  channel_id text NOT NULL UNIQUE,           -- channelId из Wazzup (UUID)
  transport text NOT NULL,                   -- whatsapp | wapi | whatsgroup | instagram | tgapi | …
  name text,                                 -- человекочитаемое имя канала из Wazzup
  phone text,                                -- номер телефона / username (если есть)
  state text,                                -- active | disabled | qridle | foreignphone | … (state из Wazzup)
  is_active boolean NOT NULL DEFAULT true,   -- мягкое отключение в нашей БД
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wazzup_channels_ws_user ON public.wazzup_channels(workspace_id, user_id);

ALTER TABLE public.wazzup_channels ENABLE ROW LEVEL SECURITY;

-- Сотрудник видит свои каналы.
CREATE POLICY "Users see own wazzup channels"
  ON public.wazzup_channels
  FOR SELECT
  USING (user_id = auth.uid());

-- Менеджеры воркспейса видят все каналы воркспейса.
CREATE POLICY "Workspace managers see all wazzup channels"
  ON public.wazzup_channels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = wazzup_channels.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_workspace_settings')::boolean = true
    )
  );

CREATE TRIGGER wazzup_channels_set_updated_at
  BEFORE UPDATE ON public.wazzup_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================================================
-- 3. Системный «инбокс Wazzup» сотрудника — флаг на projects
-- ===========================================================================
-- Аналог is_system_business_inbox для TG Business. Один инбокс Wazzup на
-- сотрудника в воркспейсе. Колонку system_inbox_user_id переиспользуем —
-- она универсальная (создана в миграции 20260503_telegram_business.sql).

ALTER TABLE public.projects
  ADD COLUMN is_system_wazzup_inbox boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX uq_projects_system_wazzup_inbox_per_user
  ON public.projects(workspace_id, system_inbox_user_id)
  WHERE is_system_wazzup_inbox = true;

COMMENT ON COLUMN public.projects.is_system_wazzup_inbox IS
  'Системный проект «Wazzup (WhatsApp)» сотрудника. Скрывается из обычных списков проектов.';

-- ===========================================================================
-- 4. Поля треда под Wazzup-диалог
-- ===========================================================================
ALTER TABLE public.project_threads
  ADD COLUMN wazzup_channel_id uuid REFERENCES public.wazzup_channels(id) ON DELETE SET NULL,
  ADD COLUMN wazzup_chat_id text,            -- chatId в Wazzup (телефон без + или username)
  ADD COLUMN wazzup_chat_type text;          -- whatsapp | instagram | …

CREATE UNIQUE INDEX uq_threads_wazzup_per_chat
  ON public.project_threads(wazzup_channel_id, wazzup_chat_id)
  WHERE wazzup_channel_id IS NOT NULL
    AND wazzup_chat_id IS NOT NULL
    AND is_deleted = false;

COMMENT ON COLUMN public.project_threads.wazzup_channel_id IS
  'Если тред пришёл из Wazzup — наш id канала (не channelId Wazzup).';
COMMENT ON COLUMN public.project_threads.wazzup_chat_id IS
  'Идентификатор чата в Wazzup (телефон без +, либо username для Instagram и т.п.).';

-- ===========================================================================
-- 5. Поля сообщения под Wazzup
-- ===========================================================================
-- wazzup_message_id — id сообщения у Wazzup (UUID). Хранится для дедупа,
-- статусов доставки и реакций.
ALTER TABLE public.project_messages
  ADD COLUMN wazzup_message_id text,
  ADD COLUMN wazzup_status text;             -- sent | delivered | read | error

CREATE UNIQUE INDEX uq_project_messages_wazzup_dedup
  ON public.project_messages(wazzup_message_id)
  WHERE wazzup_message_id IS NOT NULL;

COMMENT ON COLUMN public.project_messages.wazzup_message_id IS
  'messageId из Wazzup. Уникален. Используется для дедупа входящих и для эха исходящих.';
COMMENT ON COLUMN public.project_messages.wazzup_status IS
  'Последний известный статус доставки от Wazzup: sent / delivered / read / error.';

-- ===========================================================================
-- 6. Расширяем CHECK на project_messages.source (если он есть)
-- ===========================================================================
-- В реальной БД source хранится как text без enum'а — если CHECK существует,
-- его нужно расширить на новое значение 'wazzup'. Делаем через DO-блок,
-- чтобы миграция была идемпотентна и не падала при отсутствии CHECK'а.

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.project_messages'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%source%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.project_messages DROP CONSTRAINT %I',
      v_constraint_name
    );
    EXECUTE $check$
      ALTER TABLE public.project_messages
      ADD CONSTRAINT project_messages_source_check
      CHECK (source IN (
        'web', 'telegram', 'email', 'telegram_service', 'bot_event',
        'telegram_business', 'telegram_mtproto', 'wazzup'
      ))
    $check$;
  END IF;
END $$;
