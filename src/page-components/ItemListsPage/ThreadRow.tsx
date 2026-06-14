"use client"

import { memo } from 'react'
import { Pin } from 'lucide-react'
import { format } from 'date-fns'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { StatusDropdown, type StatusOption } from '@/components/common/status-dropdown'
import { DatePicker } from '@/components/ui/date-picker'
import { useUpdateTaskStatus, useUpdateTaskDeadline } from '@/components/tasks/useTaskMutations'
import { workspaceThreadKeys } from '@/hooks/queryKeys'
import { usePrefetchThreadMessages } from '@/hooks/messenger/usePrefetchThreadMessages'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { TableShellColumn } from './TableShell'
import type { ItemListColumnKey } from './columns'

type ThreadRowProps = {
  task: WorkspaceTask
  columns: TableShellColumn[]
  checked: boolean
  /** Стабильный колбэк — принимает id, чтобы memo'нутая строка не перерисовывалась
   *  при каждом изменении выделения (раньше onToggle замыкался на selectedIds). */
  onToggle: (id: string) => void
  onOpen: (task: WorkspaceTask) => void
  assigneesMap: Record<string, { id: string; name?: string | null; last_name?: string | null }[]>
  taskStatuses: StatusOption[]
  /** Имя собеседника из карты на уровне таблицы (P4b: не звать per-row хук). */
  counterpartName: string | null
}

export const ThreadRow = memo(function ThreadRow({ task, columns, checked, onToggle, onOpen, assigneesMap, taskStatuses, counterpartName }: ThreadRowProps) {
  const updateStatus = useUpdateTaskStatus([
    workspaceThreadKeys.workspace(task.workspace_id),
  ])
  const updateDeadline = useUpdateTaskDeadline([
    workspaceThreadKeys.workspace(task.workspace_id),
  ])

  const currentStatus = taskStatuses.find((s) => s.id === task.status_id) ?? null
  const assignees = assigneesMap[task.id] ?? []
  const prefetchMessages = usePrefetchThreadMessages()

  return (
    <tr className="border-b hover:bg-muted/30" onMouseEnter={() => prefetchMessages(task.id)}>
      <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={checked} onCheckedChange={() => onToggle(task.id)} />
      </td>
      {columns.map((c) => {
        switch (c.key as ItemListColumnKey) {
          case 'name':
            return (
              <td key={c.key} className="px-3 py-2 cursor-pointer truncate" onClick={() => onOpen(task)}>
                <div className="flex items-center gap-2 min-w-0">
                  {task.is_pinned && <Pin className="h-3 w-3 text-amber-500 shrink-0" />}
                  <span className="truncate font-medium">{task.name}</span>
                </div>
              </td>
            )
          case 'type':
            return (
              <td key={c.key} className="px-3 py-2">
                <Badge variant="outline" className="text-xs">
                  {task.type === 'chat' ? 'Чат' : 'Задача'}
                </Badge>
              </td>
            )
          case 'status':
            return (
              <td key={c.key} className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDropdown
                    currentStatus={currentStatus}
                    statuses={taskStatuses}
                    onStatusChange={(newId) =>
                      updateStatus.mutate({ threadId: task.id, statusId: newId })
                    }
                    size="sm"
                  />
                  {currentStatus && (
                    <span className="text-xs truncate">{currentStatus.name}</span>
                  )}
                </div>
              </td>
            )
          case 'project':
            return (
              <td key={c.key} className="px-3 py-2 truncate text-xs text-muted-foreground">
                {task.project_name ?? counterpartName ?? '—'}
              </td>
            )
          case 'deadline':
            return (
              <td key={c.key} className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                <DatePicker
                  date={task.deadline ? new Date(task.deadline) : undefined}
                  onDateChange={(d) =>
                    updateDeadline.mutate({ threadId: task.id, deadline: d ? d.toISOString() : null })
                  }
                  placeholder="—"
                />
              </td>
            )
          case 'assignees':
            return (
              <td key={c.key} className="px-3 py-2 text-xs">
                {assignees.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span>{assignees.length} чел.</span>
                )}
              </td>
            )
          case 'is_pinned':
            return (
              <td key={c.key} className="px-3 py-2">
                {task.is_pinned ? <Pin className="h-3.5 w-3.5 text-amber-500" /> : null}
              </td>
            )
          case 'created_at':
          case 'updated_at': {
            const value = c.key === 'created_at' ? task.created_at : task.updated_at
            return (
              <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground">
                {value ? format(new Date(value), 'dd.MM.yyyy') : '—'}
              </td>
            )
          }
          default:
            return <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground">—</td>
        }
      })}
    </tr>
  )
})
