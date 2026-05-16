"use client"

/**
 * Time-grid календарь воркспейса. Показывает треды-задачи с заполненными
 * start_at/end_at. Задачи без интервала времени в календарь не попадают.
 *
 * Этап 1: только отображение. Drag/resize, создание кликом по слоту и
 * привязка к задачам через drop из списка — следующие этапы.
 */

import { useMemo, useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { calendarKeys } from '@/hooks/queryKeys'
import { Calendar, momentLocalizer, Views, type View } from 'react-big-calendar'
import withDragAndDrop, {
  type withDragAndDropProps,
} from 'react-big-calendar/lib/addons/dragAndDrop'
import moment from 'moment-timezone'
import 'moment/locale/ru'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  useCalendarThreads,
  useUpdateThreadTime,
  type CalendarThread,
} from '@/hooks/useCalendarThreads'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import type { TaskItem } from '@/components/tasks/types'
import { COLOR_BG } from '@/components/messenger/threadConstants'
import { cn } from '@/lib/utils'

moment.locale('ru')
const localizer = momentLocalizer(moment)

const DnDCalendar = withDragAndDrop<CalendarEvent>(Calendar)

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  resource: CalendarThread
}

export default function CalendarPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  usePageTitle('Календарь')
  const closePanel = useSidePanelStore((s) => s.closePanel)
  const layoutPanel = useLayoutTaskPanel()
  const updateTime = useUpdateThreadTime()
  const queryClient = useQueryClient()

  useEffect(() => {
    closePanel()
  }, [closePanel])

  const [view, setView] = useState<View>(Views.WEEK)
  const [date, setDate] = useState<Date>(() => new Date())

  // Диапазон, который сейчас видит пользователь — для запроса в БД.
  // Для week/work_week берём 7 дней вокруг date с запасом, для day — 1 день,
  // для agenda — 30 дней. Запас в ±1 день нужен из-за разных часовых поясов.
  const { from, to } = useMemo(() => {
    const m = moment(date)
    if (view === Views.DAY) {
      return {
        from: m.clone().startOf('day').subtract(1, 'day').toDate(),
        to: m.clone().endOf('day').add(1, 'day').toDate(),
      }
    }
    if (view === Views.AGENDA) {
      return {
        from: m.clone().startOf('day').toDate(),
        to: m.clone().add(30, 'days').endOf('day').toDate(),
      }
    }
    return {
      from: m.clone().startOf('week').subtract(1, 'day').toDate(),
      to: m.clone().endOf('week').add(1, 'day').toDate(),
    }
  }, [view, date])

  const { data: threads = [], isLoading } = useCalendarThreads(workspaceId, from, to)

  const events: CalendarEvent[] = useMemo(
    () =>
      threads.map((t) => ({
        id: t.id,
        title: t.name,
        start: new Date(t.start_at),
        end: new Date(t.end_at),
        resource: t,
      })),
    [threads],
  )

  const eventPropGetter = useCallback((event: CalendarEvent) => {
    const bg = COLOR_BG[event.resource.accent_color] ?? 'bg-blue-500'
    return {
      className: cn(bg, 'border-0 text-white rounded text-xs px-1.5 py-0.5'),
    }
  }, [])

  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      if (!layoutPanel) return
      const t = event.resource
      const taskItem: TaskItem = {
        id: t.id,
        name: t.name,
        type: t.type === 'task' ? 'task' : 'chat',
        project_id: t.project_id,
        workspace_id: t.workspace_id,
        status_id: t.status_id,
        deadline: t.deadline,
        accent_color: t.accent_color,
        icon: t.icon,
        is_pinned: false,
        created_at: new Date().toISOString(),
        sort_order: 0,
      }
      layoutPanel.openThread(taskItem)
    },
    [layoutPanel],
  )

  const handleEventDrop: NonNullable<withDragAndDropProps<CalendarEvent>['onEventDrop']> =
    useCallback(
      ({ event, start, end }) => {
        const startDate = start instanceof Date ? start : new Date(start)
        const endDate = end instanceof Date ? end : new Date(end)
        updateTime.mutate({
          threadId: event.resource.id,
          projectId: event.resource.project_id,
          workspaceId: event.resource.workspace_id,
          start_at: startDate.toISOString(),
          end_at: endDate.toISOString(),
        })
      },
      [updateTime],
    )

  const handleEventResize: NonNullable<withDragAndDropProps<CalendarEvent>['onEventResize']> =
    useCallback(
      ({ event, start, end }) => {
        const startDate = start instanceof Date ? start : new Date(start)
        const endDate = end instanceof Date ? end : new Date(end)
        updateTime.mutate({
          threadId: event.resource.id,
          projectId: event.resource.project_id,
          workspaceId: event.resource.workspace_id,
          start_at: startDate.toISOString(),
          end_at: endDate.toISOString(),
        })
      },
      [updateTime],
    )

  // Создание задачи кликом по пустому слоту. Минимальный диалог только с
  // названием — полная форма (исполнители/проект/статус) отдельная итерация.
  const [createSlot, setCreateSlot] = useState<{ start: Date; end: Date } | null>(null)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleSelectSlot = useCallback(({ start, end }: { start: Date; end: Date }) => {
    setCreateName('')
    setCreateSlot({ start, end })
  }, [])

  const submitCreate = useCallback(async () => {
    if (!workspaceId || !createSlot) return
    const name = createName.trim()
    if (!name) return
    setCreating(true)
    const { error } = await supabase
      .from('project_threads')
      .insert({
        workspace_id: workspaceId,
        name,
        type: 'task',
        start_at: createSlot.start.toISOString(),
        end_at: createSlot.end.toISOString(),
      })
    setCreating(false)
    if (error) {
      toast.error(`Не удалось создать: ${error.message}`)
      return
    }
    queryClient.invalidateQueries({ queryKey: calendarKeys.all })
    setCreateSlot(null)
    setCreateName('')
  }, [workspaceId, createSlot, createName, queryClient])

  const scrollToTime = useMemo(() => moment().subtract(1, 'hour').toDate(), [])

  if (!workspaceId) return null

  return (
    <WorkspaceLayout>
      <div className="h-full flex flex-col bg-white">
        <div className="px-6 py-4 border-b">
          <h1 className="text-xl font-semibold">Календарь</h1>
        </div>
        <div className="flex-1 overflow-hidden px-6 py-4">
          <DnDCalendar
            localizer={localizer}
            events={events}
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            views={[Views.DAY, Views.WORK_WEEK, Views.WEEK, Views.AGENDA]}
            defaultView={Views.WEEK}
            step={30}
            timeslots={1}
            min={moment().startOf('day').hour(7).toDate()}
            max={moment().startOf('day').hour(22).toDate()}
            eventPropGetter={eventPropGetter}
            onSelectEvent={handleSelectEvent}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
            onSelectSlot={handleSelectSlot}
            selectable
            resizable
            scrollToTime={scrollToTime}
            culture="ru"
            messages={{
              today: 'Сегодня',
              previous: 'Назад',
              next: 'Вперёд',
              week: 'Неделя',
              work_week: 'Будни',
              day: 'День',
              agenda: 'Список',
              date: 'Дата',
              time: 'Время',
              event: 'Задача',
              allDay: 'Весь день',
              noEventsInRange: isLoading ? 'Загрузка…' : 'Нет задач в этом диапазоне',
              showMore: (n) => `Ещё ${n}`,
            }}
            style={{ height: '100%' }}
          />
        </div>
      </div>

      <Dialog
        open={createSlot !== null}
        onOpenChange={(open) => !open && setCreateSlot(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Новая задача</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && createName.trim()) submitCreate()
              }}
              placeholder="Название задачи"
              disabled={creating}
            />
            {createSlot && (
              <p className="text-xs text-muted-foreground">
                {moment(createSlot.start).format('dd, D MMM, HH:mm')} —{' '}
                {moment(createSlot.end).format('HH:mm')}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateSlot(null)} disabled={creating}>
              Отмена
            </Button>
            <Button onClick={submitCreate} disabled={creating || !createName.trim()}>
              {creating ? 'Создание…' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceLayout>
  )
}
