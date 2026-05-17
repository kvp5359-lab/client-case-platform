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
import { Calendar, momentLocalizer, Views, Navigate, type View } from 'react-big-calendar'
import withDragAndDrop, {
  type withDragAndDropProps,
} from 'react-big-calendar/lib/addons/dragAndDrop'
// Внутренний импорт — RBC не экспортирует TimeGrid из index, нужен для
// кастомного вида «Следующие N дней».
// @ts-expect-error — type definitions for internal path не поставляются
import TimeGrid from 'react-big-calendar/lib/TimeGrid'
import moment from 'moment-timezone'
import 'moment/locale/ru'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import { supabase } from '@/lib/supabase'
import { calendarKeys } from '@/hooks/queryKeys'
import { useUpdateThreadTime } from '@/hooks/useCalendarThreads'
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

const calendarComponents = { event: CalendarEventContent }

interface Props {
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
    const range = Array.from({ length: n }, (_, i) =>
      moment((props as { date: Date }).date).startOf('day').add(i, 'day').toDate(),
    )
    return <TimeGrid {...props} range={range} eventOffset={15} />
  }
  ;(View as unknown as { range: (date: Date) => Date[] }).range = (date: Date) =>
    Array.from({ length: n }, (_, i) => moment(date).startOf('day').add(i, 'day').toDate())
  ;(View as unknown as { navigate: (date: Date, action: string) => Date }).navigate = (
    date: Date,
    action: string,
  ) => {
    switch (action) {
      case Navigate.PREVIOUS:
        return moment(date).subtract(n, 'day').toDate()
      case Navigate.NEXT:
        return moment(date).add(n, 'day').toDate()
      default:
        return date
    }
  }
  ;(View as unknown as { title: (date: Date) => string }).title = (date: Date) => {
    const start = moment(date)
    const end = moment(date).add(n - 1, 'day')
    return `${start.format('D MMM')} — ${end.format('D MMM')}`
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
    // event.resource может быть undefined у preview-ивента (dragFromOutsideItem
    // возвращает только {title}) — берём дефолт.
    const accent = event.resource?.accent_color
    const bg = (accent && ACCENT_HEX[accent]) || ACCENT_HEX.blue
    return {
      style: { backgroundColor: bg },
      className: 'text-white rounded text-xs px-1.5 py-0.5',
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

  // Создание задачи кликом по пустому слоту — поднимаем наверх
  // (BoardListCard), он откроет ChatSettingsDialog с предзаполненным
  // интервалом. Минимальная длительность короткого клика — 30 мин:
  // при step=10 мин RBC по умолчанию даёт 10-минутный слот, что слишком
  // мало для типичной задачи.
  const handleSelectSlot = useCallback(
    ({ start, end }: { start: Date; end: Date }) => {
      const MIN_MS = 30 * 60 * 1000
      const e = end.getTime() - start.getTime() < MIN_MS
        ? new Date(start.getTime() + MIN_MS)
        : end
      onCreateAtSlot?.(start, e)
    },
    [onCreateAtSlot],
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

  // Размер 30-минутного блока в пикселях по текущей сетке.
  const pxPerMinute = (daySlotEl: HTMLElement) => {
    const groups = daySlotEl.querySelectorAll('.rbc-timeslot-group').length
    if (groups === 0) return 0
    return daySlotEl.getBoundingClientRect().height / (groups * 60)
  }

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
      <div ref={setContainerRef} className={cn(heightClass)}>
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
          min={moment().startOf('day').hour(minHour).toDate()}
          max={moment().startOf('day').hour(maxHour).toDate()}
          eventPropGetter={eventPropGetter}
          components={calendarComponents}
          onSelectEvent={handleSelectEvent}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          onSelectSlot={handleSelectSlot}
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
    </>
  )
}

/** Находит .rbc-day-slot под точкой (через elementsFromPoint — обходит
 *  overlay'и dnd-kit, которые на короткий момент могут перекрывать слот). */
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
  const startOfRange = (() => {
    const m = moment(date)
    if (view === Views.DAY) return m.startOf('day')
    if (view === Views.WORK_WEEK) {
      // RBC по умолчанию: пн-пт текущей недели.
      const day = m.day() // 0..6, вс=0
      const monday = m.clone().subtract(day === 0 ? 6 : day - 1, 'day').startOf('day')
      return monday
    }
    if ((view as string) === 'next_n') {
      // Кастомный вид: range = [date, date+N-1].
      return m.startOf('day')
    }
    // Week: воскресенье текущей недели (Sunday-start у moment).
    return m.clone().startOf('week')
  })()

  const dayDate = startOfRange.clone().add(colIndex, 'day').toDate()

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
  const snappedMin = Math.round(rawMin / 10) * 10
  const h = Math.floor(snappedMin / 60)
  const m = snappedMin % 60

  const result = new Date(dayDate)
  result.setHours(h, m, 0, 0)
  return result
}
