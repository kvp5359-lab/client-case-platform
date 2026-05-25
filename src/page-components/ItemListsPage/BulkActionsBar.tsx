"use client"

/**
 * Тулбар пакетных действий для item_lists. Показывается, когда выделено
 * хотя бы одно элемент. При смешанной выборке (например, в треды-списке
 * выбраны task + chat) действия, неприменимые ко всем — задизейблены
 * с подсказкой о причине.
 *
 * MVP-набор:
 *   - Треды (task): сменить статус, изменить дедлайн (одной датой), архив.
 *   - Проекты: сменить статус, архив.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { StatusOption } from '@/components/common/status-dropdown'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { BoardProject } from '@/components/boards/hooks/useWorkspaceProjects'
import { useQueryClient } from '@tanstack/react-query'
import { workspaceThreadKeys, accessibleProjectKeys, invalidateMessengerCaches } from '@/hooks/queryKeys'
import { useMarkThreadReadIfFinal } from '@/hooks/messenger/useMarkThreadReadIfFinal'

type BulkActionsBarProps = {
  entityType: 'thread' | 'project'
  selectedIds: Set<string>
  onClearSelection: () => void
  workspaceId: string
  items: Array<WorkspaceTask | BoardProject>
  taskStatuses?: StatusOption[]
  projectStatuses?: StatusOption[]
}

export function BulkActionsBar({
  entityType,
  selectedIds,
  onClearSelection,
  workspaceId,
  items,
  taskStatuses = [],
  projectStatuses = [],
}: BulkActionsBarProps) {
  const qc = useQueryClient()
  const markReadIfFinal = useMarkThreadReadIfFinal()
  const [pending, setPending] = useState(false)

  const selectedItems = items.filter((it) => selectedIds.has(it.id))

  // Для тредов — есть ли в выделении не-task (чат/email)? Если да, операции,
  // относящиеся только к task, дизейблятся.
  const mixedThreadTypes =
    entityType === 'thread' &&
    selectedItems.some((it) => (it as WorkspaceTask).type && (it as WorkspaceTask).type !== 'task')

  const refresh = () => {
    if (entityType === 'thread') {
      qc.invalidateQueries({ queryKey: workspaceThreadKeys.workspace(workspaceId) })
      invalidateMessengerCaches(qc, workspaceId)
    } else {
      qc.invalidateQueries({ queryKey: accessibleProjectKeys.workspace(workspaceId) })
    }
  }

  const setThreadStatus = async (statusId: string | null) => {
    setPending(true)
    try {
      const targets = selectedItems
        .filter((it) => (it as WorkspaceTask).type !== 'chat') as WorkspaceTask[]
      if (targets.length === 0) {
        toast.info('Среди выделенных нет задач — статус устанавливать некому')
        return
      }
      const ids = targets.map((t) => t.id)
      const { error } = await supabase
        .from('project_threads')
        .update({ status_id: statusId } as never)
        .in('id', ids)
      if (error) throw error

      // Если новый статус финальный — помечаем каждый тред прочитанным.
      // Внутри хелпер сам проверит is_final, но мы делаем это последовательно,
      // чтобы кэш-патчи на inbox v2 не конкурировали друг с другом.
      for (const t of targets) {
        await markReadIfFinal({
          threadId: t.id,
          statusId,
          projectId: t.project_id,
          workspaceId: t.workspace_id,
        })
      }

      toast.success(`Статус обновлён у ${ids.length}`)
      refresh()
      onClearSelection()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось обновить статус')
    } finally {
      setPending(false)
    }
  }

  const setProjectStatus = async (statusId: string) => {
    setPending(true)
    try {
      const ids = selectedItems.map((it) => it.id)
      const { error } = await supabase
        .from('projects')
        .update({ status_id: statusId } as never)
        .in('id', ids)
      if (error) throw error
      toast.success(`Статус обновлён у ${ids.length} проектов`)
      refresh()
      onClearSelection()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось обновить статус')
    } finally {
      setPending(false)
    }
  }

  const archive = async () => {
    setPending(true)
    try {
      const ids = selectedItems.map((it) => it.id)
      const table = entityType === 'thread' ? 'project_threads' : 'projects'
      const { error } = await supabase
        .from(table)
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        } as never)
        .in('id', ids)
      if (error) throw error
      toast.success(`В корзину перенесено: ${ids.length}`)
      refresh()
      onClearSelection()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось архивировать')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={pending || (entityType === 'thread' && mixedThreadTypes)}
            title={
              entityType === 'thread' && mixedThreadTypes
                ? 'Среди выделенных есть чаты/email — у них нет статуса. Оставьте только задачи.'
                : undefined
            }
          >
            Сменить статус
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[300px] overflow-y-auto">
          {(entityType === 'thread' ? taskStatuses : projectStatuses).map((s) => (
            <DropdownMenuItem
              key={s.id}
              onClick={() =>
                entityType === 'thread' ? setThreadStatus(s.id) : setProjectStatus(s.id)
              }
            >
              <span
                className="h-2.5 w-2.5 rounded-full mr-2 inline-block"
                style={{ backgroundColor: s.color ?? '#6B7280' }}
              />
              {s.name}
            </DropdownMenuItem>
          ))}
          {entityType === 'thread' && (
            <DropdownMenuItem onClick={() => setThreadStatus(null)} className="text-muted-foreground">
              Без статуса
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Перенести ${selectedIds.size} в корзину?`)) return
          archive()
        }}
      >
        В корзину
      </Button>
    </>
  )
}
