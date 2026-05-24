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
 *
 * Создание задачи кликом по пустому слоту — минимальный диалог только с
 * названием, как на странице /calendar.
 */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDroppable, useDndMonitor } from '@dnd-kit/core'
import { createPortal } from 'react-dom'
import { Calendar, dateFnsLocalizer, Views, Navigate, type View } from 'react-big-calendar'
import withDragAndDrop, {
  type withDragAndDropProps,
} from 'react-big-calendar/lib/addons/dragAndDrop'
// Внутренний импорт — RBC не экспортирует TimeGrid из index, нужен для
// кастомного вида «Следующие N дней».
// @ts-expect-error — type definitions for internal path не поставляются
import TimeGrid from 'react-big-calendar/lib/TimeGrid'
import { format as fmt, parse as dfParse, startOfWeek, getDay, startOfDay, addDays, subDays, setHours } from 'date-fns'
import { ru } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import { supabase } from '@/lib/supabase'
import { calendarKeys, externalCalendarKeys } from '@/hooks/queryKeys'
import { useUpdateThreadTime } from '@/hooks/useCalendarThreads'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useSyncCalendar, useWriteExternalEvent } from '@/hooks/useGoogleCalendar'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import type { ToolbarProps } from 'react-big-calendar'
// Hex-карта акцентов для inline style (Tailwind-классы не работают —
// .rbc-event имеет жёсткий background-color дефолтом, перебить класс
// без !important на всех bg-* не выйдет, а inline style побеждает по
// специфичности).
const ACCENT_HEX: Record<string, string> = {
  blue: '#3b82f6',
  slate: '#57534e',
  emerald: '#059669',
  amber: '#f59e0b',
  rose: '#ef4444',
  violet: '#7c3aed',
  orange: '#f97316',
  cyan: '#0891b2',
  pink: '#ec4899',
  indigo: '#4f46e5',
}
import { cn } from '@/lib/utils'
import { DEFAULT_CALENDAR_SETTINGS, type CalendarSettings, type ListHeight } from './types'
import { ConvertExternalEventDialog } from './ConvertExternalEventDialog'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'

const localizer = dateFnsLocalizer({
  format: (date: Date, formatStr: string) => fmt(date, formatStr, { locale: ru }),
  parse: (value: string, formatStr: string) => dfParse(value, formatStr, new Date(), { locale: ru }),
  startOfWeek: (date: Date) => startOfWeek(date, { locale: ru }),
  getDay,
  locales: { ru },
})

/**
 * Унифицированный тип события календарной сетки. Может быть либо задачей
 * (kind='task' — наша project_threads), либо внешним событием из подключённого
 * календаря (kind='external' — Google и т.п. через external_calendar_events).
 * Для kind='external' resize/drag отключены (read-only).
 */
type CalEvent = {
  id: string
  title: string
  start: Date
  end: Date
  kind: 'task' | 'external'
  /** Для kind='task' — данные задачи. */
  resource?: WorkspaceTask & { start_at: string; end_at: string }
  /** Для kind='external' — мета внешнего события. */
  external?: {
    calendar_id: string
    external_id: string
    color: string
    html_link?: string | null
    location?: string | null
  }
}

const DnDCalendar = withDragAndDrop<CalEvent>(Calendar)

/** Контент события в сетке: название задачи + название проекта мелким
 *  под ней. Время рендерит сам RBC в .rbc-event-label (см. CSS
 *  flex-порядок в globals.css). */
function CalendarEventContent({ event }: { event: CalEvent }) {
  const project = event.resource?.project_name
  return (
    <>
      <div className="font-medium truncate">{event.title}</div>
      {project && (
        <div className="truncate opacity-75 text-[10px] leading-tight">{project}</div>
      )}
    </>
  )
}

/** Кастомный toolbar — копирует дефолтное поведение RBC + добавляет кнопку
 *  «Синхронизировать» справа (если в настройках списка выбраны календари). */
function makeCalendarToolbar(
  calendarIds: string[],
  onSync: () => void,
  syncing: boolean,
) {
  return function CalendarToolbar(props: ToolbarProps<CalEvent>) {
    const { label, onNavigate, onView, view, views } = props
    const viewsList = Array.isArray(views) ? views : Object.keys(views)
    return (
      <div className="rbc-toolbar">
        <span className="rbc-btn-group">
          <button type="button" onClick={() => onNavigate('TODAY')}>Сегодня</button>
          <button type="button" onClick={() => onNavigate('PREV')}>←</button>
          <button type="button" onClick={() => onNavigate('NEXT')}>→</button>
        </span>
        <span className="rbc-toolbar-label">{label}</span>
        <span className="rbc-btn-group">
          {viewsList.map((name) => (
            <button
              key={name}
              type="button"
              className={view === name ? 'rbc-active' : ''}
              onClick={() => onView(name as View)}
            >
              {props.localizer.messages[name as keyof typeof props.localizer.messages] as string}
            </button>
          ))}
          {calendarIds.length > 0 && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              title="Синхронизировать Google-календари"
              className="!px-2"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
            </button>
          )}
        </span>
      </div>
    )
  }
}

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

/**
 * Фабрика кастомного RBC-вида «Следующие N дней» — обёртка над TimeGrid,
 * где range/navigate/title замкнуты на N. Помещается в `views` пропом.
 */
function makeNextNDaysView(n: number) {
  const View = (props: Record<string, unknown>) => {
    const baseDate = startOfDay((props as { date: Date }).date)
    const range = Array.from({ length: n }, (_, i) => addDays(baseDate, i))
    return <TimeGrid {...props} range={range} eventOffset={15} />
  }
  ;(View as unknown as { range: (date: Date) => Date[] }).range = (date: Date) => {
    const baseDate = startOfDay(date)
    return Array.from({ length: n }, (_, i) => addDays(baseDate, i))
  }
  ;(View as unknown as { navigate: (date: Date, action: string) => Date }).navigate = (
    date: Date,
    action: string,
  ) => {
    switch (action) {
      case Navigate.PREVIOUS:
        return subDays(date, n)
      case Navigate.NEXT:
        return addDays(date, n)
      default:
        return date
    }
  }
  ;(View as unknown as { title: (date: Date) => string }).title = (date: Date) => {
    const start = date
    const end = addDays(date, n - 1)
    return `${fmt(start, 'd MMM', { locale: ru })} — ${fmt(end, 'd MMM', { locale: ru })}`
  }
  return View
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
  const idsKey = taskIds.join(',')

  // Подгрузка start_at/end_at — отдельно от основного RPC, чтобы не менять
  // get_workspace_threads. На больших списках это запрос «in (uuid[])» по
  // индексированному project_threads.id — дёшево. Бьём на чанки по 40, чтобы
  // GET-URL не упирался в лимит PostgREST.
  const { data: times = {} } = useQuery({
    queryKey: [...calendarKeys.all, 'board-list-times', workspaceId, idsKey],
    enabled: taskIds.length > 0,
    queryFn: async (): Promise<Record<string, { start_at: string; end_at: string }>> => {
      const chunks: string[][] = []
      for (let i = 0; i < taskIds.length; i += 40) chunks.push(taskIds.slice(i, i + 40))

      const results = await Promise.all(
        chunks.map((chunk) =>
          supabase
            .from('project_threads')
            .select('id, start_at, end_at')
            .in('id', chunk)
            .not('start_at', 'is', null)
            .not('end_at', 'is', null),
        ),
      )

      const map: Record<string, { start_at: string; end_at: string }> = {}
      for (const { data, error } of results) {
        if (error) throw error
        for (const row of data ?? []) {
          if (row.start_at && row.end_at) {
            map[row.id] = { start_at: row.start_at, end_at: row.end_at }
          }
        }
      }
      return map
    },
  })

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
  // Мемоизация — иначе новый массив на каждый рендер ломает deps useCallback/useMemo ниже.
  const calendarIds = useMemo(() => settings?.calendar_ids ?? [], [settings?.calendar_ids])
  const calendarIdsKey = useMemo(() => [...calendarIds].sort().join(','), [calendarIds])
  const { data: externalEvents = [] } = useQuery({
    queryKey: externalCalendarKeys.byWorkspaceCalendars(workspaceId, calendarIdsKey),
    enabled: calendarIds.length > 0,
    queryFn: async (): Promise<CalEvent[]> => {
      if (calendarIds.length === 0) return []
      // Берём календари (для цвета) одним запросом.
      const { data: cals } = await supabase
        .from('calendars')
        .select('id, color')
        .in('id', calendarIds)
      const colorById = new Map<string, string>(
        ((cals ?? []) as Array<{ id: string; color: string }>).map((c) => [c.id, c.color]),
      )
      // Сначала — какие external-события уже превращены в задачи (или
      // примирорены из задач). Их прячем, чтобы не было дублей.
      const { data: maps } = await supabase
        .from('task_google_event_map')
        .select('calendar_id, google_event_id')
        .in('calendar_id', calendarIds)
      const mappedSet = new Set<string>(
        ((maps ?? []) as Array<{ calendar_id: string; google_event_id: string }>)
          .map((m) => `${m.calendar_id}::${m.google_event_id}`),
      )
      // События в окне [now-30d, now+90d] для производительности.
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
        const row = r as { id: string; calendar_id: string; title: string; start_at: string; end_at: string; html_link: string | null; location: string | null; external_id: string }
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

  const eventPropGetter = useCallback((event: CalEvent) => {
    if (event.kind === 'external') {
      // Внешнее событие — цвет от его календаря.
      const isPast = event.end.getTime() < Date.now()
      return {
        style: {
          backgroundColor: event.external?.color ?? '#6b7280',
          ...(isPast ? { opacity: 0.55 } : {}),
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
      style: { backgroundColor: bg, ...(isPast ? { opacity: 0.55 } : {}) },
      className: cn(
        'text-white rounded text-xs px-1.5 py-0.5',
        isFinal && 'line-through',
      ),
    }
  }, [finalStatusIds])

  /** Drag/resize разрешены и для внешних событий (write-back в Google). */
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

  const handleEventDrop: NonNullable<withDragAndDropProps<CalEvent>['onEventDrop']> = useCallback(
    ({ event, start, end }) => {
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

  const handleEventResize: NonNullable<withDragAndDropProps<CalEvent>['onEventResize']> =
    useCallback(
      ({ event, start, end }) => {
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

  // Создание задачи кликом по пустому слоту — поднимаем наверх
  // (BoardListCard), он откроет ChatSettingsDialog с предзаполненным
  // интервалом. Минимальная длительность короткого клика — 30 мин:
  // при step=10 мин RBC по умолчанию даёт 10-минутный слот, что слишком
  // мало для типичной задачи.
  const handleSelectSlot = useCallback(
    (info: { start: Date; end: Date; action?: string; box?: { clientX: number; clientY: number } }) => {
      let s = info.start
      let e = info.end
      // На click пересчитываем время сами по реальным координатам клика —
      // тем же расчётом, что использует hover-полоска. Гарантирует, что
      // start события == время на полоске под курсором. RBC внутри
      // считает иначе (closestSlotFromPoint от offsetHeight вместо
      // нашей метрики по timeslot-group), из-за этого без override'а
      // время могло разойтись на одну ступень.
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
  // - useDroppable регистрирует календарь как drop-target.
  // - useDndMonitor слушает глобальные drag-события и сам решает,
  //   относится ли событие к нашему календарю (по `over.id`).
  //   Преимущество перед регистрационным реестром: меньше связности с
  //   BoardView, всё локально.
  const droppableId = `calendar-drop:${listId}`
  const { setNodeRef: setDroppableRef } = useDroppable({ id: droppableId })
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Плавающий лейбл со временем под курсором (вне drag) — чтобы не
  // приходилось «на глаз» отсчитывать минуты от часовой линии. Показывает
  // ровно то время, которое попадёт в start нового события при клике.
  const [hoverTime, setHoverTime] = useState<
    | {
        stripeLeft: number
        stripeTop: number
        stripeWidth: number
        labelLeft: number
        label: string
      }
    | null
  >(null)

  // Превью под курсором — фиксированно-позиционированный «призрак» блока,
  // показывает куда упадёт задача при отпускании мыши.
  const [previewRect, setPreviewRect] = useState<
    | {
        left: number
        width: number
        top: number
        height: number
        startLabel: string
        title: string
        accent: string
      }
    | null
  >(null)

  // Доступ к актуальным `tasks/view/date` из обработчиков dnd-monitor
  // без пересоздания подписки. Обновление в useEffect, чтобы не нарушать
  // правило «refs не трогаем в render-фазе».
  const tasksRef = useRef(tasks)
  const viewRef = useRef(view)
  const dateRef = useRef(date)
  useEffect(() => {
    tasksRef.current = tasks
    viewRef.current = view
    dateRef.current = date
  })

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node
      setDroppableRef(node)
    },
    [setDroppableRef],
  )

  // Mousemove на контейнере календаря — считаем время по той же формуле,
  // что использует click-to-create, и кладём лейбл рядом с курсором.
  // Уходит при leave/во время drag (превью drag и так показывает время).
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (previewRect) return
    // Пока кнопка мыши зажата — RBC ведёт выбор диапазона, наш индикатор
    // только мешает. Прячем до отпускания.
    if (e.buttons > 0) {
      if (hoverTime) setHoverTime(null)
      return
    }
    // Если курсор поверх существующего события — прячем полоску, чтобы не
    // мешала видеть и нажимать на событие. Создать новое поверх существующего
    // всё равно нельзя (RBC ловит клик на событие).
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
    // Полоску и лейбл рисуем по computed-времени, а не по границе DOM-слота.
    // Так стрипа всегда стоит ровно на той же высоте, что соответствует
    // времени, которое попадёт в onSelectSlot. Микродвижения мыши не
    // двигают полоску, пока время не сменилось.
    const slotRect = slot.getBoundingClientRect()
    const ppm = pxPerMinute(slot)
    const minHour = getMinHourFromGutter(slot)
    const minutesFromTop = time.getHours() * 60 + time.getMinutes() - minHour * 60
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


  // Обработчик dnd: на каждый move/over пересчитываем превью; на drop
  // ставим время. Фильтруем по `over.id === нашему droppableId` чтобы
  // на доске с несколькими календарями не было пересечений.
  useDndMonitor({
    onDragMove: (e) => {
      const overId = e.over ? String(e.over.id) : null
      if (overId !== droppableId) {
        if (previewRect) setPreviewRect(null)
        return
      }
      const act = e.activatorEvent as unknown as { clientX?: number; clientY?: number }
      const x = (act?.clientX ?? 0) + e.delta.x
      const y = (act?.clientY ?? 0) + e.delta.y
      const slot = findDaySlotAtPoint(x, y)
      if (!slot) {
        if (previewRect) setPreviewRect(null)
        return
      }
      const time = computeTimeFromCoords(x, y, viewRef.current, dateRef.current, slot)
      if (!time) return
      // Геометрия превью: левый край = day-slot, ширина = day-slot, верх =
      // относит. start time в day-slot. Высота — 30 мин в пикселях.
      const rect = slot.getBoundingClientRect()
      const ppm = pxPerMinute(slot)
      const dayStartMin = parseInt(getMinHourFromGutter(slot) + '', 10) * 60
      const offsetMin = time.getHours() * 60 + time.getMinutes() - dayStartMin
      const top = rect.top + offsetMin * ppm
      const height = Math.max(8, 30 * ppm)
      const activeId = String(e.active.id)
      const taskId = activeId.startsWith('task:') ? activeId.split(':')[1] : ''
      const task = tasksRef.current.find((t) => t.id === taskId)
      setPreviewRect({
        left: rect.left,
        width: rect.width,
        top,
        height,
        startLabel:
          `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`,
        title: task?.name ?? '',
        accent: task?.accent_color ?? 'blue',
      })
    },
    onDragEnd: (e) => {
      const overId = e.over ? String(e.over.id) : null
      setPreviewRect(null)
      if (overId !== droppableId) return
      const activeId = String(e.active.id)
      if (!activeId.startsWith('task:')) return
      const taskId = activeId.split(':')[1]
      if (!taskId) return
      const act = e.activatorEvent as unknown as { clientX?: number; clientY?: number }
      const x = (act?.clientX ?? 0) + e.delta.x
      const y = (act?.clientY ?? 0) + e.delta.y
      const slot = findDaySlotAtPoint(x, y)
      if (!slot) return
      const time = computeTimeFromCoords(x, y, viewRef.current, dateRef.current, slot)
      if (!time) return
      const task = tasksRef.current.find((t) => t.id === taskId)
      const end = new Date(time.getTime() + 30 * 60 * 1000)
      updateTime.mutate({
        threadId: taskId,
        projectId: task?.project_id ?? null,
        workspaceId: task?.workspace_id ?? workspaceId,
        start_at: time.toISOString(),
        end_at: end.toISOString(),
      })
    },
    onDragCancel: () => setPreviewRect(null),
  })

  const heightClass =
    listHeight === 'full' ? 'h-full min-h-[400px]' :
    listHeight === 'medium' ? 'h-[600px]' :
    'h-[480px]'

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
          messages={{
            today: 'Сегодня',
            previous: '←',
            next: '→',
            week: 'Неделя',
            work_week: 'Будни',
            day: 'День',
            // Подпись таба кастомного вида — типы Messages не знают про next_n
            ...({ next_n: `${nextNDays} дн.` } as object),
            date: 'Дата',
            time: 'Время',
            event: 'Задача',
            allDay: 'Весь день',
            noEventsInRange: 'Нет задач со временем',
          }}
        />
      </div>
      {hoverTime && !previewRect &&
        createPortal(
          <>
            <div
              className="fixed z-[9998] pointer-events-none"
              style={{
                left: hoverTime.stripeLeft,
                top: hoverTime.stripeTop,
                width: hoverTime.stripeWidth,
                height: 2,
                backgroundColor: 'hsl(var(--primary) / 0.95)',
              }}
            />
            <div
              className="fixed z-[9999] pointer-events-none text-[12px] font-medium leading-none px-1 bg-white"
              style={{
                left: hoverTime.labelLeft,
                top: hoverTime.stripeTop,
                transform: 'translate(-100%, -50%)',
                color: 'hsl(var(--primary) / 0.95)',
              }}
            >
              {hoverTime.label}
            </div>
          </>,
          document.body,
        )}
      {previewRect &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none rounded text-white text-xs px-1.5 py-0.5 opacity-80"
            style={{
              left: previewRect.left,
              top: previewRect.top,
              width: previewRect.width,
              height: previewRect.height,
              backgroundColor: ACCENT_HEX[previewRect.accent] ?? ACCENT_HEX.blue,
              boxShadow: '0 0 0 1px white inset',
            }}
          >
            <div className="font-medium truncate">{previewRect.title}</div>
            <div className="opacity-85">{previewRect.startLabel}</div>
          </div>,
          document.body,
        )}
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
        />
      )}
    </>
  )
}

/** Находит .rbc-day-slot под точкой (через elementsFromPoint — обходит
 *  overlay'и dnd-kit, которые на короткий момент могут перекрывать слот). */
// Размер 30-минутного блока в пикселях по текущей сетке.
function pxPerMinute(daySlotEl: HTMLElement): number {
  const groups = daySlotEl.querySelectorAll('.rbc-timeslot-group').length
  if (groups === 0) return 0
  return daySlotEl.getBoundingClientRect().height / (groups * 60)
}

function findDaySlotAtPoint(clientX: number, clientY: number): HTMLElement | null {
  const elements = document.elementsFromPoint(clientX, clientY)
  for (const el of elements) {
    const candidate = (el as HTMLElement).closest?.('.rbc-day-slot') as HTMLElement | null
    if (candidate) return candidate
  }
  return null
}

/** Достаёт min_hour из первой подписи .rbc-time-gutter (формат «8:00»). */
function getMinHourFromGutter(slotInsideTimeContent: HTMLElement): number {
  const timeContent = slotInsideTimeContent.closest('.rbc-time-content')
  const gutter = timeContent?.parentElement?.querySelector('.rbc-time-gutter')
  const firstLabel = gutter?.querySelector('.rbc-label')?.textContent?.trim() ?? '00:00'
  return parseInt(firstLabel.split(':')[0] ?? '0', 10) || 0
}

/**
 * Считает Date+время по координатам курсора и DOM-элементу day-slot RBC.
 *
 *  1. Колонка → дата: индекс day-slot внутри `.rbc-time-content` +
 *     стартовая дата текущего диапазона (зависит от view).
 *  2. Y → минуты: доля Y относительно высоты колонки * длительность
 *     видимой сетки. min_hour берём из подписи `.rbc-time-gutter`.
 *  3. Снап на 10 минут (шаг резайза).
 *
 * Возвращает `null`, если не удалось определить колонку или сетка пуста.
 */
function computeTimeFromCoords(
  _clientX: number,
  clientY: number,
  view: View,
  date: Date,
  daySlot: HTMLElement,
): Date | null {
  // _clientX оставлен в сигнатуре только для согласованности с вызовами —
  // X нужен лишь снаружи в findDaySlotAtPoint.

  // Все day-slot этого календаря, чтобы найти индекс колонки.
  const timeContent = daySlot.closest('.rbc-time-content') as HTMLElement | null
  if (!timeContent) return null
  const daySlots = Array.from(timeContent.querySelectorAll<HTMLElement>('.rbc-day-slot'))
  const colIndex = daySlots.indexOf(daySlot)
  if (colIndex < 0) return null

  // Стартовая дата текущего диапазона.
  const startOfRange: Date = (() => {
    if (view === Views.DAY) return startOfDay(date)
    if (view === Views.WORK_WEEK) {
      // RBC по умолчанию: пн-пт текущей недели.
      const day = getDay(date) // 0..6, вс=0
      return startOfDay(subDays(date, day === 0 ? 6 : day - 1))
    }
    if ((view as string) === 'next_n') {
      // Кастомный вид: range = [date, date+N-1].
      return startOfDay(date)
    }
    // Week: воскресенье текущей недели (Sunday-start).
    return startOfWeek(date, { weekStartsOn: 0 })
  })()

  const dayDate = addDays(startOfRange, colIndex)

  // Y → минуты: доля Y в колонке * её длительность.
  const rect = daySlot.getBoundingClientRect()
  const y = clientY - rect.top
  const ratio = Math.max(0, Math.min(1, y / rect.height))

  const groups = daySlot.querySelectorAll('.rbc-timeslot-group').length
  const totalMinutes = groups * 60
  if (totalMinutes === 0) return null
  const gutter = timeContent.parentElement?.querySelector('.rbc-time-gutter')
  const firstLabel = gutter?.querySelector('.rbc-label')?.textContent?.trim() ?? '00:00'
  const minHour = parseInt(firstLabel.split(':')[0] ?? '0', 10) || 0

  const rawMin = minHour * 60 + ratio * totalMinutes
  // floor (а не round) → полоска всегда у верхнего края слота, в котором
  // находится курсор. Это совпадает с тем, как RBC внутренне считает
  // click-to-slot (Math.floor в closestSlotToPosition), и интуитивно:
  // мышь не может «обогнать» полоску вниз.
  const snappedMin = Math.floor(rawMin / 10) * 10
  const h = Math.floor(snappedMin / 60)
  const m = snappedMin % 60

  const result = new Date(dayDate)
  result.setHours(h, m, 0, 0)
  return result
}
