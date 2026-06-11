"use client"

/**
 * Диалог «Сделать из события задачу» — открывается при клике на событие
 * Google Calendar в нашей календарной сетке.
 *
 * Создаёт project_thread (type='task') с теми же датами + запись в
 * task_google_event_map, чтобы обратный mirror не сделал дубль в Google.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ExternalLink, Trash2, CalendarClock, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { externalCalendarKeys, projectKeys, workspaceThreadKeys } from '@/hooks/queryKeys'
import { useWriteExternalEvent } from '@/hooks/useGoogleCalendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Props = {
  open: boolean
  onClose: () => void
  workspaceId: string
  /** UUID нашей записи в external_calendar_events. */
  externalRowId: string
  /** ID события в Google (для маппинга). */
  externalEventId: string
  /** UUID нашего календаря (для маппинга). */
  calendarId: string
  initialTitle: string
  startAt: string
  endAt: string
  htmlLink?: string | null
  /** Место проведения из Google-события (если задано). */
  location?: string | null
}

/** Человекочитаемый интервал события: «11 июн, 7:00–9:50» или межсуточный. */
function formatEventWhen(startIso: string, endIso: string): string {
  const s = new Date(startIso)
  const e = new Date(endIso)
  const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
  const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (s.toDateString() === e.toDateString()) {
    return `${dateFmt.format(s)}, ${timeFmt.format(s)}–${timeFmt.format(e)}`
  }
  return `${dateFmt.format(s)} ${timeFmt.format(s)} — ${dateFmt.format(e)} ${timeFmt.format(e)}`
}

export function ConvertExternalEventDialog({
  open,
  onClose,
  workspaceId,
  externalEventId,
  calendarId,
  initialTitle,
  startAt,
  endAt,
  htmlLink,
  location,
}: Props) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(initialTitle)
  const [projectId, setProjectId] = useState<string>('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const writeExternal = useWriteExternalEvent()

  const { data: projects = [] } = useQuery({
    queryKey: projectKeys.forConvertDialog(workspaceId),
    enabled: open && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return (data ?? []) as Array<{ id: string; name: string }>
    },
  })

  const createTask = useMutation({
    mutationFn: async () => {
      // Атомарный RPC: вставляет тред + маппинг под guard'ом, потом
      // вручную зовёт mirror. Без RPC возникал race: триггер на INSERT
      // треда срабатывал до записи маппинга, и mirror создавал дубль в
      // target_calendar.
      const { data, error } = await supabase.rpc('convert_external_event_to_task', {
        p_workspace_id: workspaceId,
        p_project_id: (projectId || null) as string,
        p_name: name.trim() || initialTitle,
        p_start_at: startAt,
        p_end_at: endAt,
        p_calendar_id: calendarId,
        p_google_event_id: externalEventId,
      })
      if (error) throw error
      return { id: data as string }
    },
    onSuccess: () => {
      toast.success('Событие превращено в задачу')
      queryClient.invalidateQueries({ queryKey: workspaceThreadKeys.workspace(workspaceId) })
      queryClient.invalidateQueries({ queryKey: externalCalendarKeys.byWorkspace(workspaceId) })
      onClose()
    },
    onError: (e) => toast.error(`Не удалось: ${e instanceof Error ? e.message : 'ошибка'}`),
  })

  const handleDelete = () => {
    writeExternal.mutate(
      { action: 'delete', calendar_id: calendarId, external_id: externalEventId },
      {
        onSuccess: () => {
          toast.success('Событие удалено из Google Calendar')
          setConfirmDelete(false)
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[460px] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Превратить событие в задачу</DialogTitle>
          <DialogDescription>
            Создастся задача с теми же датами — с ней дальше работают как обычно
            (исполнители, статус, комментарии). Событие в Google останется и будет
            связано с задачей.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Сводка по событию Google — что именно превращаем */}
          <div className="rounded-lg border bg-muted/40 px-3 py-2.5 space-y-1.5">
            <p className="text-sm font-medium leading-snug break-words">{initialTitle}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              {formatEventWhen(startAt, endAt)}
            </p>
            {location && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="break-words">{location}</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="convert-event-name">Название задачи</Label>
            <Input
              id="convert-event-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Проект (необязательно)</Label>
            <Select value={projectId || 'none'} onValueChange={(v) => setProjectId(v === 'none' ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Без проекта" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без проекта</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Действия: второстепенные (иконки) слева, основные справа.
            flex-wrap + min-w-0 — не распирает диалог, переносится при нехватке места. */}
        <DialogFooter className="flex flex-row flex-wrap items-center justify-between gap-2 sm:justify-between">
          <div className="flex items-center gap-1 min-w-0">
            {htmlLink && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Открыть в Google Calendar"
                aria-label="Открыть в Google Calendar"
                onClick={() => window.open(htmlLink, '_blank', 'noopener')}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Удалить событие из Google Calendar"
              aria-label="Удалить событие из Google Calendar"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmDelete(true)}
              disabled={writeExternal.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Отмена</Button>
            <Button onClick={() => createTask.mutate()} disabled={createTask.isPending}>
              {createTask.isPending ? 'Создаю…' : 'Создать задачу'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить событие из Google Calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              Событие будет удалено безвозвратно в самом Google Calendar — у вас и
              у всех участников. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={writeExternal.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {writeExternal.isPending ? 'Удаляю…' : 'Удалить событие'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
