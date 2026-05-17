-- Google Calendar — переход на personal-видимость.
--
-- Раньше: календарь принадлежал воркспейсу — события видели все участники.
-- Теперь: календарь видит ТОЛЬКО его owner (тот, кто его добавил через
-- свой Google-аккаунт). События тоже только для owner'а.
--
-- workspace_id остаётся (календарь принадлежит конкретному WS — после
-- ухода пользователя из WS его календари тоже уходят), но visibility
-- сужена до owner_user_id = auth.uid().

-- ── calendars ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS calendars_select_workspace ON public.calendars;

CREATE POLICY calendars_select_owner ON public.calendars
  FOR SELECT TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    OR public.is_workspace_owner((SELECT auth.uid()), workspace_id)
  );

-- ── external_calendar_events ───────────────────────────────────────────

DROP POLICY IF EXISTS external_calendar_events_select ON public.external_calendar_events;

CREATE POLICY external_calendar_events_select_owner ON public.external_calendar_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.calendars c
    WHERE c.id = external_calendar_events.calendar_id
      AND c.is_deleted = false
      AND (
        c.owner_user_id = (SELECT auth.uid())
        OR public.is_workspace_owner((SELECT auth.uid()), c.workspace_id)
      )
  ));
