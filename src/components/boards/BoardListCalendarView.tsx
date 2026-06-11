"use client"

/**
 * Календарный вид для списка на доске (board_lists.display_mode='calendar').
 *
 * Берёт уже отфильтрованные задачи (по filter списка) и показывает их в
 * time-grid недели. В календаре видны только задачи с заполненными
 * start_at/end_at — задачи без интервала времени просто не отображаются.
 *
 * Drag/resize меняют start_at/end_at. Drag из других списков на день/слот
 * календаря — отдельный механизм через @dnd-kit (см. useCalendarDropMonitor).
 *
 * Создание задачи кликом по пустому слоту — минимальный диалог только с
 * названием, как на странице /calendar.
 */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Calendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar'
import withDragAndDrop, {
  type withDragAndDropProps,
} from 'react-big-calendar/lib/addons/dragAndDrop'
import { format as fmt, parse as dfParse, startOfWeek, getDay, startOfDay, setHours } from 'date-fns'
import { ru } from 'date-fns/locale'
import { makeNextNDaysView } from './calendar/nextNDaysView'
import {
  findDaySlotAtPoint,
  computeTimeFromCoords,
  pxPerMinute,
  getMinHourFromGutter,
} from './calendar/coordsToTime'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import { externalCalendarKeys } from '@/hooks/queryKeys'
import { useUpdateThreadTime } from '@/hooks/useCalendarThreads'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useSyncCalendar, useWriteExternalEvent } from '@/hooks/useGoogleCalendar'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { ACCENT_HEX } from './calendar/accentColors'
import { DEFAULT_CALENDAR_SETTINGS, type CalendarSettings, type ListHeight } from './types'
import { ConvertExternalEventDialog } from './ConvertExternalEventDialog'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { CalEvent } from './calendar/calEventTypes'
import { CalendarEventContent } from './calendar/CalendarEventContent'
import { makeCalendarToolbar } from './calendar/makeCalendarToolbar'
import { useBoardListTimes } from './calendar/useBoardListTimes'
import { useExternalCalendarEvents } from './calendar/useExternalCalendarEvents'
import { useCalendarDropMonitor, type PreviewRect } from './calendar/useCalendarDropMonitor'
import { CalendarHoverOverlay, type HoverTime } from './calendar/CalendarHoverOverlay'
import { buildCalendarMessages } from './calendar/calendarMessages'

const localizer = dateFnsLocalizer({
  format: (date: Date, formatStr: string) => fmt(date, formatStr, { locale: ru }),
  parse: (value: string, formatStr: string) => dfParse(value, formatStr, new Date(), { locale: ru }),
  startOfWeek: (date: Date) => startOfWeek(date, { locale: ru }),
  getDay,
  locales: { ru },
})

const DnDCalendar = withDragAndDrop<CalEvent>(Calendar)

type Props = {
  /** ID board_list — используется в id @dnd-kit Droppable для фильтрации
   *  событий useDndMonitor (на доске может быть несколько календарей). */
  listId: string
  workspaceId: string
  tasks: WorkspaceTask[]
  onOpenTask?: (task: WorkspaceTask) => void
  settings?: CalendarSettings | null
  listHeight?: ListHeight
  /** Колбэк при клике/выделении пустого слота. Поднимается наверх
   *  (BoardListCard), который открывает полный ChatSettingsDialog
   *  с предзаполненными startAt/endAt. */
  onCreateAtSlot?: (start: Date, end: Date) => void
}

const NEXT_N_VIEW = 'next_n' as unknown as View

const VIEW_BY_DEFAULT: Record<CalendarSettings['default_view'], View> = {
  day: Views.DAY,
  work_week: Views.WORK_WEEK,
  week: Views.WEEK,
  next_n: NEXT_N_VIEW,
}

export function BoardListCalendarView({
  listId,
  workspaceId,
  tasks,
  onOpenTask,
  settings,
  listHeight = 'auto',
  onCreateAtSlot,
}: Props) {
  const cs = settings ?? DEFAULT_CALENDAR_SETTINGS
  const initialView = VIEW_BY_DEFAULT[cs.default_view] ?? Views.WEEK
  const [view, setView] = useState<View>(initialView)
  const [date, setDate] = useState<Date>(() => new Date())

  const taskIds = useMemo(() => tasks.map((t) => t.id).sort(), [tasks])

  const { data: times = {} } = useBoardListTimes(workspaceId, taskIds)

  const taskEvents: CalEvent[] = useMemo(
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
            kind: 'task' as const,
            resource: { ...t, start_at: time.start_at, end_at: time.end_at },
          } as CalEvent
        })
        .filter((x): x is CalEvent => x !== null),
    [tasks, times],
  )

  // Внешние события (Google Calendar и т.п.) из выбранных календарей-источников.
  const calendarIds = useMemo(() => settings?.calendar_ids ?? [], [settings?.calendar_ids])
  const { data: externalEvents = [] } = useExternalCalendarEvents(workspaceId, calendarIds)

  const events: CalEvent[] = useMemo(
    () => [...taskEvents, ...externalEvents],
    [taskEvents, externalEvents],
  )

  const updateTime = useUpdateThreadTime()
  const writeExternal = useWriteExternalEvent()
  const syncCal = useSyncCalendar()
  const queryClient = useQueryClient()
  const [convertEvent, setConvertEvent] = useState<CalEvent | null>(null)

  const handleManualSync = useCallback(async () => {
    if (calendarIds.length === 0) return
    await Promise.all(calendarIds.map((id) => syncCal.mutateAsync(id).catch(() => null)))
  }, [calendarIds, syncCal])

  const ToolbarComponent = useMemo(
    () => makeCalendarToolbar(calendarIds, handleManualSync, syncCal.isPending),
    [calendarIds, handleManualSync, syncCal.isPending],
  )

  const components = useMemo(
    () => ({ event: CalendarEventContent, toolbar: ToolbarComponent }),
    [ToolbarComponent],
  )

  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)
  const finalStatusIds = useMemo(() => {
    const set = new Set<string>()
    for (const s of taskStatuses) if (s.is_final) set.add(s.id)
    return set
  }, [taskStatuses])

  // Прошедшие события — осветляем фон смешиванием с белым (color-mix), а не
  // ставим opacity. opacity делает прозрачным и текст — на пёстром фоне
  // сетки читаемость падает. color-mix меняет только фон, текст остаётся
  // полноценно белым. 65% оригинал + 35% белый — заметно мягче, цвет
  // узнаваем, белый текст ещё держится. Поддержка color-mix: все
  // современные браузеры (Chrome 111+, Safari 16.2+, Firefox 113+).
  const lighten = (hex: string) => `color-mix(in srgb, ${hex} 65%, white)`

  const eventPropGetter = useCallback((event: CalEvent) => {
    if (event.kind === 'external') {
      const isPast = event.end.getTime() < Date.now()
      const baseBg = event.external?.color ?? '#6b7280'
      return {
        style: {
          backgroundColor: isPast ? lighten(baseBg) : baseBg,
        },
        className: 'text-white rounded text-xs px-1.5 py-0.5',
      }
    }
    // event.resource может быть undefined у preview-ивента (dragFromOutsideItem
    // возвращает только {title}) — берём дефолт.
    const accent = event.resource?.accent_color
    const bg = (accent && ACCENT_HEX[accent]) || ACCENT_HEX.blue
    const isPast = event.end.getTime() < Date.now()
    const statusId = event.resource?.status_id
    const isFinal = !!statusId && finalStatusIds.has(statusId)
    return {
      style: { backgroundColor: isPast ? lighten(bg) : bg },
      className: cn(
        'text-white rounded text-xs px-1.5 py-0.5',
        isFinal && 'line-through',
      ),
    }
  }, [finalStatusIds])

  const draggableAccessor = useCallback(() => true, [])
  const resizableAccessor = useCallback(() => true, [])

  const handleSelectEvent = useCallback(
    (event: CalEvent) => {
      if (event.kind === 'external') {
        setConvertEvent(event)
        return
      }
      if (event.resource) onOpenTask?.(event.resource)
    },
    [onOpenTask],
  )

  // Оптимистичный апдейт external_calendar_events в кэше React Query —
  // блок визуально едет сразу, не дожидаясь ответа edge-функции.
  const optimisticUpdateExternal = useCallback(
    (eventId: string, newStart: Date, newEnd: Date) => {
      const id = eventId.replace(/^ext:/, '')
      queryClient.setQueriesData<CalEvent[]>(
        { queryKey: externalCalendarKeys.byWorkspace(workspaceId) },
        (old) => {
          if (!old) return old
          return old.map((e) =>
            e.kind === 'external' && e.id === eventId
              ? { ...e, start: newStart, end: newEnd }
              : e,
          )
        },
      )
      return id
    },
    [queryClient, workspaceId],
  )

  // Drop и resize отличаются только триггером — действие одно:
  // двинуть интервал события (внешнего или нашей задачи).
  const handleEventChange = useCallback(
    ({ event, start, end }: { event: CalEvent; start: Date | string; end: Date | string }) => {
      const s = start instanceof Date ? start : new Date(start)
      const e = end instanceof Date ? end : new Date(end)
      if (event.kind === 'external') {
        if (!event.external) return
        optimisticUpdateExternal(event.id, s, e)
        writeExternal.mutate({
          action: 'update',
          calendar_id: event.external.calendar_id,
          external_id: event.external.external_id,
          start_at: s.toISOString(),
          end_at: e.toISOString(),
        })
        return
      }
      if (!event.resource) return
      updateTime.mutate({
        threadId: event.resource.id,
        projectId: event.resource.project_id,
        workspaceId: event.resource.workspace_id,
        start_at: s.toISOString(),
        end_at: e.toISOString(),
      })
    },
    [updateTime, writeExternal, optimisticUpdateExternal],
  )

  const handleEventDrop: NonNullable<withDragAndDropProps<CalEvent>['onEventDrop']> = handleEventChange
  const handleEventResize: NonNullable<withDragAndDropProps<CalEvent>['onEventResize']> = handleEventChange

  // Создание задачи кликом по пустому слоту — поднимаем наверх
  // (BoardListCard), он откроет ChatSettingsDialog с предзаполненным
  // интервалом. Минимальная длительность короткого клика — 30 мин.
  const handleSelectSlot = useCallback(
    (info: { start: Date; end: Date; action?: string; box?: { clientX: number; clientY: number } }) => {
      let s = info.start
      let e = info.end
      if ((info.action === 'click' || info.action === 'doubleClick') && info.box) {
        const slot = findDaySlotAtPoint(info.box.clientX, info.box.clientY)
        if (slot) {
          const computed = computeTimeFromCoords(
            info.box.clientX,
            info.box.clientY,
            view,
            date,
            slot,
          )
          if (computed) {
            s = computed
            e = new Date(computed.getTime() + 30 * 60 * 1000)
          }
        }
      }
      const MIN_MS = 30 * 60 * 1000
      if (e.getTime() - s.getTime() < MIN_MS) e = new Date(s.getTime() + MIN_MS)
      onCreateAtSlot?.(s, e)
    },
    [onCreateAtSlot, view, date],
  )

  const minHour = Math.max(0, Math.min(23, cs.min_hour))
  const maxHour = Math.max(minHour + 1, Math.min(24, cs.max_hour))

  const nextNDays = Math.max(2, Math.min(60, cs.next_n_days ?? 7))
  const NextNView = useMemo(() => makeNextNDaysView(nextNDays), [nextNDays])
  const showNextN = cs.default_view === 'next_n'
  const viewsProp = useMemo(
    () =>
      showNextN
        ? { day: true, work_week: true, week: true, next_n: NextNView }
        : { day: true, work_week: true, week: true },
    [showNextN, NextNView],
  )

  // Drop из обычных board-листов (через @dnd-kit) на сетку календаря.
  const droppableId = `calendar-drop:${listId}`
  const { setNodeRef: setDroppableRef } = useDroppable({ id: droppableId })
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [hoverTime, setHoverTime] = useState<HoverTime>(null)

  // Доступ к актуальным `tasks/view/date` из обработчиков dnd-monitor
  // без пересоздания подписки.
  const tasksRef = useRef(tasks)
  const viewRef = useRef(view)
  const dateRef = useRef(date)
  useEffect(() => {
    tasksRef.current = tasks
    viewRef.current = view
    dateRef.current = date
  })

  const { previewRect } = useCalendarDropMonitor(droppableId, workspaceId, {
    tasksRef,
    viewRef,
    dateRef,
  }) as { previewRect: PreviewRect }

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node
      setDroppableRef(node)
    },
    [setDroppableRef],
  )

  // Mousemove на контейнере календаря — считаем время по той же формуле,
  // что использует click-to-create, и кладём лейбл рядом с курсором.
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (previewRect) return
    if (e.buttons > 0) {
      if (hoverTime) setHoverTime(null)
      return
    }
    const overEvent = document.elementsFromPoint(e.clientX, e.clientY).some(
      (el) => (el as HTMLElement).classList?.contains('rbc-event'),
    )
    if (overEvent) {
      if (hoverTime) setHoverTime(null)
      return
    }
    const slot = findDaySlotAtPoint(e.clientX, e.clientY)
    if (!slot) {
      setHoverTime(null)
      return
    }
    const time = computeTimeFromCoords(e.clientX, e.clientY, viewRef.current, dateRef.current, slot)
    if (!time) {
      setHoverTime(null)
      return
    }
    const slotRect = slot.getBoundingClientRect()
    const ppm = pxPerMinute(slot)
    const minHourGutter = getMinHourFromGutter(slot)
    const minutesFromTop = time.getHours() * 60 + time.getMinutes() - minHourGutter * 60
    const stripeTop = slotRect.top + minutesFromTop * ppm
    const hh = String(time.getHours()).padStart(2, '0')
    const mm = String(time.getMinutes()).padStart(2, '0')
    setHoverTime({
      stripeLeft: slotRect.left,
      stripeTop,
      stripeWidth: slotRect.width,
      labelLeft: slotRect.right - 4,
      label: `${hh}:${mm}`,
    })
  }, [previewRect, hoverTime])

  const handleMouseLeave = useCallback(() => setHoverTime(null), [])

  const heightClass =
    listHeight === 'full' ? 'h-full min-h-[400px]' :
    listHeight === 'medium' ? 'h-[600px]' :
    'h-[480px]'

  const messages = useMemo(() => buildCalendarMessages(nextNDays), [nextNDays])

  return (
    <>
      <div
        ref={setContainerRef}
        className={cn(heightClass)}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseLeave}
        onMouseLeave={handleMouseLeave}
      >
        <DnDCalendar
          localizer={localizer}
          events={events}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          views={viewsProp as never}
          defaultView={initialView}
          step={10}
          timeslots={6}
          min={setHours(startOfDay(new Date()), minHour)}
          max={setHours(startOfDay(new Date()), maxHour)}
          eventPropGetter={eventPropGetter}
          components={components}
          onSelectEvent={handleSelectEvent}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          onSelectSlot={handleSelectSlot}
          draggableAccessor={draggableAccessor}
          resizableAccessor={resizableAccessor}
          selectable
          resizable
          culture="ru"
          messages={messages}
        />
      </div>
      <CalendarHoverOverlay hoverTime={hoverTime} previewRect={previewRect} />
      {convertEvent && convertEvent.external && (
        <ConvertExternalEventDialog
          open={!!convertEvent}
          onClose={() => setConvertEvent(null)}
          workspaceId={workspaceId}
          externalRowId={convertEvent.id.replace(/^ext:/, '')}
          externalEventId={convertEvent.external.external_id}
          calendarId={convertEvent.external.calendar_id}
          initialTitle={convertEvent.title}
          startAt={convertEvent.start.toISOString()}
          endAt={convertEvent.end.toISOString()}
          htmlLink={convertEvent.external.html_link}
          location={convertEvent.external.location}
        />
      )}
    </>
  )
}
