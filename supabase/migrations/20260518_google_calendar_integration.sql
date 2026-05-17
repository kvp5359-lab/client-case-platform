-- Google Calendar integration (read-sync MVP).
--
-- Архитектура: модель Б из обсуждения 2026-05-17 — events из Google
-- читаются в нашу БД (`external_calendar_events`), мёржатся с задачами
-- в `BoardListCalendarView`. Запись назад в Google НЕ делаем (отдельная
-- итерация в будущем).
--
-- Сущности:
--   1. google_calendar_tokens — OAuth-токены пользователя для scope
--      calendar.readonly (отдельные от google_drive_tokens — каждый
--      scope подключается независимо).
--   2. calendars — «календарь» как сущность нашей системы. Может быть
--      internal (наши задачи, default для воркспейса) или google
--      (привязан к конкретному Google Calendar ID + user).
--   3. external_calendar_events — кэш событий из внешних источников
--      (Google и т.п.). Обновляется через Edge Function sync (pg_cron).

-- ── 1. Токены Google Calendar (отдельно от Drive) ──────────────────────

CREATE TABLE IF NOT EXISTS public.google_calendar_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  -- Email Google-аккаунта, к которому подключились (для UI «подключён aaa@gmail.com»).
  google_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Пользователь видит только свои токены.
CREATE POLICY google_calendar_tokens_select_own ON public.google_calendar_tokens
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Удалить свои (отключить интеграцию).
CREATE POLICY google_calendar_tokens_delete_own ON public.google_calendar_tokens
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- INSERT/UPDATE — только service_role (через edge-функции).

-- ── 2. Сущность «Календарь» в нашей системе ────────────────────────────

CREATE TABLE IF NOT EXISTS public.calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  source text NOT NULL DEFAULT 'internal' CHECK (source IN ('internal', 'google')),
  -- Для source=google:
  google_account_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  google_calendar_id text,
  -- Кто создал (для прав).
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- is_visible — глобальный switch «не выключать sync, но не показывать в UI».
  is_visible boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Один Google-календарь от одного аккаунта = одна запись в нашей системе.
  UNIQUE NULLS NOT DISTINCT (workspace_id, google_account_user_id, google_calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_calendars_workspace ON public.calendars(workspace_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_calendars_google_user ON public.calendars(google_account_user_id) WHERE source = 'google';

ALTER TABLE public.calendars ENABLE ROW LEVEL SECURITY;

-- SELECT: любой участник воркспейса видит все календари этого воркспейса.
CREATE POLICY calendars_select_workspace ON public.calendars
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.workspace_id = calendars.workspace_id
      AND p.user_id = (SELECT auth.uid())
      AND p.is_deleted = false
      AND p.can_login = true
  ));

-- INSERT: участник воркспейса может создать свой календарь.
CREATE POLICY calendars_insert_member ON public.calendars
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.workspace_id = calendars.workspace_id
        AND p.user_id = (SELECT auth.uid())
        AND p.is_deleted = false
        AND p.can_login = true
    )
  );

-- UPDATE/DELETE: только владелец календаря или владелец воркспейса.
CREATE POLICY calendars_update_owner ON public.calendars
  FOR UPDATE TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    OR public.is_workspace_owner((SELECT auth.uid()), workspace_id)
  );

CREATE POLICY calendars_delete_owner ON public.calendars
  FOR DELETE TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    OR public.is_workspace_owner((SELECT auth.uid()), workspace_id)
  );

-- ── 3. Кэш событий из внешних календарей ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.external_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES public.calendars(id) ON DELETE CASCADE,
  -- ID события в внешней системе (Google event id и т.п.).
  external_id text NOT NULL,
  title text,
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  location text,
  html_link text,
  -- updatedAt из внешнего источника (для инкрементального sync).
  updated_at_external timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (calendar_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_calendar_events_range
  ON public.external_calendar_events(calendar_id, start_at, end_at);

ALTER TABLE public.external_calendar_events ENABLE ROW LEVEL SECURITY;

-- SELECT: видит тот же круг, что и сам calendar (через JOIN).
CREATE POLICY external_calendar_events_select ON public.external_calendar_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.calendars c
    JOIN public.participants p
      ON p.workspace_id = c.workspace_id
     AND p.user_id = (SELECT auth.uid())
     AND p.is_deleted = false
     AND p.can_login = true
    WHERE c.id = external_calendar_events.calendar_id
      AND c.is_deleted = false
  ));

-- INSERT/UPDATE/DELETE: только service_role (Edge Function sync).

-- ── 4. Триггер updated_at ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_calendars_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_calendars_updated_at ON public.calendars;
CREATE TRIGGER trg_touch_calendars_updated_at
  BEFORE UPDATE ON public.calendars
  FOR EACH ROW EXECUTE FUNCTION public.touch_calendars_updated_at();

DROP TRIGGER IF EXISTS trg_touch_google_calendar_tokens ON public.google_calendar_tokens;
CREATE TRIGGER trg_touch_google_calendar_tokens
  BEFORE UPDATE ON public.google_calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION public.touch_calendars_updated_at();
