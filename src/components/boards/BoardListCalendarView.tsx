"use client"

/**
 * Календарный вид для списка на доске (board_lists.display_mode='calendar').
 *
 * Берёт уже отфильтрованные задачи (по filter списка) и показывает их в
 * time-grid недели. В календаре видны только задачи с заполненными
 * start_at/end_at — задачи без интервала времени просто не отображаются.
 *
 * Drag/resize меняют start_at/end_at. Drag из других списков на день/слот
 * календаря — отдельный механизм через @dnd-kit (см. BoardListCardsDropZone).
 */

import { useMemo, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, momentLocalizer, Views, type View } from 'react-big-calendar'
import withDragAndDrop, {
  type withDragAndDropProps,
} from 'react-big-calendar/lib/addons/dragAndDrop'
import moment from 'moment-timezone'
import 'moment/locale/ru'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import { supabase } from '@/lib/supabase'
import { calendarKeys } from '@/hooks/queryKeys'
import { useUpdateThreadTime } from '@/hooks/useCalendarThreads'
import { COLOR_BG } from '@/components/messenger/threadConstants'
import { cn } from '@/lib/utils'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'

moment.locale('ru')
const localizer = momentLocalizer(moment)

interface CalEvent {
  id: string
  title: string
  start: Date
  end: Date
  resource: WorkspaceTask & { start_at: string; end_at: string }
}

const DnDCalendar = withDragAndDrop<CalEvent>(Calendar)

interface Props {
  workspaceId: string
  tasks: WorkspaceTask[]
  onOpenTask?: (task: WorkspaceTask) => void
}

export function BoardListCalendarView({ workspaceId, tasks, onOpenTask }: Props) {
  const [view, setView] = useState<View>(Views.WEEK)
  const [date, setDate] = useState<Date>(() => new Date())

  const taskIds = useMemo(() => tasks.map((t) => t.id).sort(), [tasks])
  const idsKey = taskIds.join(',')

  // Подгрузка start_at/end_at — отдельно от основного RPC, чтобы не менять
  // get_workspace_threads. На больших списках это запрос «in (uuid[])» по
  // индексированному project_threads.id — дёшево.
  const { data: times = {} } = useQuery({
    queryKey: [...calendarKeys.all, 'board-list-times', workspaceId, idsKey],
    enabled: taskIds.length > 0,
    queryFn: async (): Promise<Record<string, { start_at: string; end_at: string }>> => {
      const { data, error } = await supabase
        .from('project_threads')
        .select('id, start_at, end_at')
        .in('id', taskIds)
        .not('start_at', 'is', null)
        .not('end_at', 'is', null)
      if (error) throw error
      const map: Record<string, { start_at: string; end_at: string }> = {}
      for (const row of data ?? []) {
        if (row.start_at && row.end_at) {
          map[row.id] = { start_at: row.start_at, end_at: row.end_at }
        }
      }
      return map
    },
  })

  const events: CalEvent[] = useMemo(
    () =>
      tasks
        .map((t) => {
          const time = times[t.id]
          if (!time) return null
          return {
            id: t.id,
            title: t.name,
            start: new Date(time.start_at),
            end: new Date(time.end_at),
            resource: { ...t, start_at: time.start_at, end_at: time.end_at },
          } as CalEvent
        })
        .filter((x): x is CalEvent => x !== null),
    [tasks, times],
  )

  const updateTime = useUpdateThreadTime()

  const eventPropGetter = useCallback((event: CalEvent) => {
    const bg = COLOR_BG[event.resource.accent_color] ?? 'bg-blue-500'
    return {
      className: cn(bg, 'border-0 text-white rounded text-xs px-1.5 py-0.5'),
    }
  }, [])

  const handleSelectEvent = useCallback(
    (event: CalEvent) => {
      onOpenTask?.(event.resource)
    },
    [onOpenTask],
  )

  const handleEventDrop: NonNullable<withDragAndDropProps<CalEvent>['onEventDrop']> = useCallback(
    ({ event, start, end }) => {
      const s = start instanceof Date ? start : new Date(start)
      const e = end instanceof Date ? end : new Date(end)
      updateTime.mutate({
        threadId: event.resource.id,
        projectId: event.resource.project_id,
        workspaceId: event.resource.workspace_id,
        start_at: s.toISOString(),
        end_at: e.toISOString(),
      })
    },
    [updateTime],
  )

  const handleEventResize: NonNullable<withDragAndDropProps<CalEvent>['onEventResize']> =
    useCallback(
      ({ event, start, end }) => {
        const s = start instanceof Date ? start : new Date(start)
        const e = end instanceof Date ? end : new Date(end)
        updateTime.mutate({
          threadId: event.resource.id,
          projectId: event.resource.project_id,
          workspaceId: event.resource.workspace_id,
          start_at: s.toISOString(),
          end_at: e.toISOString(),
        })
      },
      [updateTime],
    )

  return (
    <div className="h-[600px] min-h-[400px]">
      <DnDCalendar
        localizer={localizer}
        events={events}
        view={view}
        onView={setView}
        date={date}
        onNavigate={setDate}
        views={[Views.DAY, Views.WORK_WEEK, Views.WEEK]}
        defaultView={Views.WEEK}
        step={30}
        timeslots={1}
        min={moment().startOf('day').hour(8).toDate()}
        max={moment().startOf('day').hour(21).toDate()}
        eventPropGetter={eventPropGetter}
        onSelectEvent={handleSelectEvent}
        onEventDrop={handleEventDrop}
        onEventResize={handleEventResize}
        resizable
        culture="ru"
        messages={{
          today: 'Сегодня',
          previous: '←',
          next: '→',
          week: 'Неделя',
          work_week: 'Будни',
          day: 'День',
          date: 'Дата',
          time: 'Время',
          event: 'Задача',
          allDay: 'Весь день',
          noEventsInRange: 'Нет задач со временем',
        }}
      />
    </div>
  )
}
