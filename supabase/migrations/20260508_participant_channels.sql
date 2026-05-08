-- Каналы связи участника (участник = participant; см. ТЗ CRM-фрейма раздел 3).
-- Один participant может иметь несколько каналов любого типа: два email,
-- рабочий + личный telegram, телефон. При входящем сообщении система ищет
-- participant по уникальному (workspace_id, channel_type, external_id).
--
-- Существующие поля participants.email/phone/telegram_user_id остаются
-- (NOT NULL email пока трогать рано — UI читает оттуда). После миграции UI
-- будет отдельный шаг по их депрекации и удалению.

-- ============================================================================
-- 1. Таблица participant_channels
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.participant_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Тип канала: 'telegram', 'email', 'phone' (потом whatsapp/instagram и т.д.).
  -- Не enum, чтобы новый тип не требовал миграции.
  channel_type text NOT NULL,
  -- Идентификатор в канале:
  --   telegram → telegram_user_id::text
  --   email    → нормализованный (lowercase) email
  --   phone    → телефон в произвольном формате (нормализацию делает фронт)
  external_id text NOT NULL,
  -- Опциональная подпись («рабочий», «личный»). NULL = без подписи.
  label text,
  -- Основной канал этого типа у участника (для отображения в списках,
  -- по умолчанию). Поддержка опциональная — в MVP проставляется только
  -- бэкфилом и при ручном переключении в UI.
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Один и тот же external_id одного типа не может быть привязан к разным
  -- participant'ам в одном воркспейсе. Это ключ для маршрутизации входящих.
  CONSTRAINT participant_channels_unique_per_workspace
    UNIQUE (workspace_id, channel_type, external_id)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_pc_participant ON public.participant_channels(participant_id);
CREATE INDEX IF NOT EXISTS idx_pc_workspace_type ON public.participant_channels(workspace_id, channel_type);

-- updated_at автообновление
CREATE OR REPLACE FUNCTION public.tg_participant_channels_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_participant_channels_touch_updated_at ON public.participant_channels;
CREATE TRIGGER trg_participant_channels_touch_updated_at
  BEFORE UPDATE ON public.participant_channels
  FOR EACH ROW EXECUTE FUNCTION public.tg_participant_channels_touch_updated_at();

-- ============================================================================
-- 2. RLS — копируем логику participants:
--    SELECT — любой участник того же воркспейса
--    INSERT/UPDATE/DELETE — владелец воркспейса, manage_participants, или сам
-- ============================================================================

ALTER TABLE public.participant_channels ENABLE ROW LEVEL SECURITY;

-- SELECT: видно всем участникам воркспейса
CREATE POLICY participant_channels_select ON public.participant_channels
  FOR SELECT
  USING (
    public.is_workspace_participant(workspace_id, (SELECT auth.uid()))
  );

-- INSERT: менеджер или сам participant (если есть user_id)
CREATE POLICY participant_channels_insert ON public.participant_channels
  FOR INSERT
  WITH CHECK (
    public.is_workspace_owner((SELECT auth.uid()), workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_participants')
    OR EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_channels.participant_id
        AND p.user_id = (SELECT auth.uid())
        AND p.is_deleted = false
    )
  );

-- UPDATE: те же
CREATE POLICY participant_channels_update ON public.participant_channels
  FOR UPDATE
  USING (
    public.is_workspace_owner((SELECT auth.uid()), workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_participants')
    OR EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_channels.participant_id
        AND p.user_id = (SELECT auth.uid())
        AND p.is_deleted = false
    )
  )
  WITH CHECK (
    public.is_workspace_owner((SELECT auth.uid()), workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_participants')
    OR EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_channels.participant_id
        AND p.user_id = (SELECT auth.uid())
        AND p.is_deleted = false
    )
  );

-- DELETE: те же
CREATE POLICY participant_channels_delete ON public.participant_channels
  FOR DELETE
  USING (
    public.is_workspace_owner((SELECT auth.uid()), workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_participants')
    OR EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_channels.participant_id
        AND p.user_id = (SELECT auth.uid())
        AND p.is_deleted = false
    )
  );

-- ============================================================================
-- 3. Бэкфил из существующих participants.email/phone/telegram_user_id
--    Email: пропускаем placeholder вида 'tg_*@telegram.placeholder' — это
--    не настоящий email, а заглушка для NOT NULL.
-- ============================================================================

-- Email — пропускаем суффикс @telegram.placeholder (заглушка для NOT NULL).
INSERT INTO public.participant_channels (participant_id, workspace_id, channel_type, external_id, is_primary)
SELECT id, workspace_id, 'email', lower(email), true
FROM public.participants
WHERE is_deleted = false
  AND email IS NOT NULL
  AND email <> ''
  AND email NOT LIKE '%@telegram.placeholder'
ON CONFLICT (workspace_id, channel_type, external_id) DO NOTHING;

-- Phone
INSERT INTO public.participant_channels (participant_id, workspace_id, channel_type, external_id, is_primary)
SELECT id, workspace_id, 'phone', phone, true
FROM public.participants
WHERE is_deleted = false
  AND phone IS NOT NULL
  AND phone <> ''
ON CONFLICT (workspace_id, channel_type, external_id) DO NOTHING;

-- Telegram
INSERT INTO public.participant_channels (participant_id, workspace_id, channel_type, external_id, is_primary)
SELECT id, workspace_id, 'telegram', telegram_user_id::text, true
FROM public.participants
WHERE is_deleted = false
  AND telegram_user_id IS NOT NULL
ON CONFLICT (workspace_id, channel_type, external_id) DO NOTHING;

-- ============================================================================
-- 4. Колонка projects.contact_participant_id — поле «Контакт» на проекте
-- ============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS contact_participant_id uuid
    REFERENCES public.participants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_contact_participant_id
  ON public.projects(contact_participant_id)
  WHERE contact_participant_id IS NOT NULL;

-- Комментарии — для читаемости схемы в БД
COMMENT ON TABLE public.participant_channels IS
  'Каналы связи участника (telegram/email/phone и т.д.). Один participant — много каналов любого типа. Маршрутизация входящих сообщений ищет participant по (workspace_id, channel_type, external_id).';

COMMENT ON COLUMN public.projects.contact_participant_id IS
  'Поле «Контакт» — про кого этот проект (бизнес-связка). Может быть participant без user_id (= лид без аккаунта). Не путать с project_participants — там «кому открыт ЛК».';

COMMENT ON COLUMN public.participants.email IS
  'DEPRECATED 2026-05-08: переезжает в participant_channels (channel_type=email). Колонка остаётся пока UI не мигрирован. Удаление — после полной миграции UI.';

COMMENT ON COLUMN public.participants.phone IS
  'DEPRECATED 2026-05-08: переезжает в participant_channels (channel_type=phone).';

COMMENT ON COLUMN public.participants.telegram_user_id IS
  'DEPRECATED 2026-05-08: переезжает в participant_channels (channel_type=telegram, external_id=telegram_user_id::text).';
