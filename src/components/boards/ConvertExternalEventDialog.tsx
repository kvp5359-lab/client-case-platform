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
import { ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

interface Props {
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
}: Props) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(initialTitle)
  const [projectId, setProjectId] = useState<string>('')

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-for-convert', workspaceId],
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
        p_project_id: projectId || null,
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
      queryClient.invalidateQueries({ queryKey: ['workspace-threads', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['external-calendar-events', workspaceId] })
      onClose()
    },
    onError: (e) => toast.error(`Не удалось: ${e instanceof Error ? e.message : 'ошибка'}`),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Превратить событие в задачу</DialogTitle>
          <DialogDescription>
            Создастся задача с теми же датами. Дальше с ней можно работать
            обычным образом (исполнители, статус, комментарии). Само событие
            в Google останется на месте и будет связано с задачей.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="space-y-1">
            <Label>Проект (необязательно)</Label>
            <Select value={projectId || 'none'} onValueChange={(v) => setProjectId(v === 'none' ? '' : v)}>
              <SelectTrigger>
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

        <DialogFooter className="flex flex-row justify-between gap-2 sm:justify-between">
          {htmlLink && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => window.open(htmlLink, '_blank', 'noopener')}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Открыть в Google
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Отмена</Button>
            <Button
              onClick={() => createTask.mutate()}
              disabled={createTask.isPending}
            >
              {createTask.isPending ? 'Создаю…' : 'Создать задачу'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
