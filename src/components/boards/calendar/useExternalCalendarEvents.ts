/**
 * Запрос внешних событий (Google Calendar и т.п.) из выбранных календарей-источников.
 * Скрывает события, которые уже превращены в задачи (через task_google_event_map).
 * Окно [now-30d, now+90d] для производительности.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { externalCalendarKeys } from '@/hooks/queryKeys'
import type { CalEvent } from './calEventTypes'

export function useExternalCalendarEvents(workspaceId: string, calendarIds: string[]) {
  const calendarIdsKey = useMemo(() => [...calendarIds].sort().join(','), [calendarIds])

  return useQuery({
    queryKey: externalCalendarKeys.byWorkspaceCalendars(workspaceId, calendarIdsKey),
    enabled: calendarIds.length > 0,
    queryFn: async (): Promise<CalEvent[]> => {
      if (calendarIds.length === 0) return []

      const { data: cals } = await supabase
        .from('calendars')
        .select('id, color')
        .in('id', calendarIds)
      const colorById = new Map<string, string>(
        ((cals ?? []) as Array<{ id: string; color: string }>).map((c) => [c.id, c.color]),
      )

      const { data: maps } = await supabase
        .from('task_google_event_map')
        .select('calendar_id, google_event_id')
        .in('calendar_id', calendarIds)
      const mappedSet = new Set<string>(
        ((maps ?? []) as Array<{ calendar_id: string; google_event_id: string }>)
          .map((m) => `${m.calendar_id}::${m.google_event_id}`),
      )

      const fromIso = new Date(Date.now() - 30 * 86400000).toISOString()
      const toIso = new Date(Date.now() + 90 * 86400000).toISOString()
      const { data, error } = await supabase
        .from('external_calendar_events')
        .select('id, calendar_id, external_id, title, start_at, end_at, html_link, location')
        .in('calendar_id', calendarIds)
        .lte('start_at', toIso)
        .gte('end_at', fromIso)
      if (error) throw error

      return (data ?? [])
        .filter((r) => {
          const row = r as { calendar_id: string; external_id: string }
          return !mappedSet.has(`${row.calendar_id}::${row.external_id}`)
        })
        .map((r) => {
          const row = r as {
            id: string
            calendar_id: string
            title: string
            start_at: string
            end_at: string
            html_link: string | null
            location: string | null
            external_id: string
          }
          return {
            id: `ext:${row.id}`,
            title: row.title,
            start: new Date(row.start_at),
            end: new Date(row.end_at),
            kind: 'external' as const,
            external: {
              calendar_id: row.calendar_id,
              external_id: row.external_id,
              color: colorById.get(row.calendar_id) ?? '#6b7280',
              html_link: row.html_link,
              location: row.location,
            },
          } as CalEvent
        })
    },
  })
}
