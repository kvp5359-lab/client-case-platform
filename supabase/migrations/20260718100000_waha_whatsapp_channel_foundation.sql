-- WAHA (WhatsApp через self-hosted) — фундамент канала.
-- Паттерн зеркалит wazzup/mtproto/business.

-- 0. Источник сообщений.
ALTER TYPE message_source ADD VALUE IF NOT EXISTS 'waha';

-- 1. Таблица сессий WAHA: маппинг сессия WhatsApp → сотрудник (владелец номера).
CREATE TABLE IF NOT EXISTS public.waha_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_name   text NOT NULL,          -- имя сессии в WAHA (глобально уникально в инстансе)
  phone          text,                   -- номер (заполняется после привязки)
  status         text NOT NULL DEFAULT 'STOPPED',  -- STARTING/SCAN_QR_CODE/WORKING/FAILED/STOPPED
  engine         text NOT NULL DEFAULT 'NOWEB',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_waha_sessions_session_name UNIQUE (session_name)
);

ALTER TABLE public.waha_sessions ENABLE ROW LEVEL SECURITY;

-- Доступ: владелец сессии ИЛИ владелец/менеджер воркспейса (как личные диалоги).
CREATE POLICY waha_sessions_select ON public.waha_sessions
  FOR SELECT TO authenticated
  USING (
    owner_user_id = (select auth.uid())
    OR public.is_workspace_owner((select auth.uid()), workspace_id)
    OR public.has_workspace_permission((select auth.uid()), workspace_id, 'manage_workspace_settings')
  );

CREATE POLICY waha_sessions_manage ON public.waha_sessions
  FOR ALL TO authenticated
  USING (
    public.is_workspace_owner((select auth.uid()), workspace_id)
    OR public.has_workspace_permission((select auth.uid()), workspace_id, 'manage_workspace_settings')
  )
  WITH CHECK (
    public.is_workspace_owner((select auth.uid()), workspace_id)
    OR public.has_workspace_permission((select auth.uid()), workspace_id, 'manage_workspace_settings')
  );

REVOKE ALL ON public.waha_sessions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waha_sessions TO authenticated;
GRANT ALL ON public.waha_sessions TO service_role;

-- 2. Поля в project_threads под WhatsApp-канал.
ALTER TABLE public.project_threads
  ADD COLUMN IF NOT EXISTS waha_session_id uuid REFERENCES public.waha_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS waha_chat_id    text,     -- JID чата/группы (…@c.us / …@g.us)
  ADD COLUMN IF NOT EXISTS waha_group      boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_threads_waha
  ON public.project_threads (waha_session_id, waha_chat_id)
  WHERE waha_session_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_project_threads_waha_session
  ON public.project_threads (waha_session_id)
  WHERE waha_session_id IS NOT NULL;

-- 3. Поля в project_messages под WhatsApp.
ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS waha_message_id text,
  ADD COLUMN IF NOT EXISTS waha_status     text;  -- sent/delivered/read/failed (галочки)

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_messages_waha_message_id
  ON public.project_messages (waha_message_id)
  WHERE waha_message_id IS NOT NULL;
