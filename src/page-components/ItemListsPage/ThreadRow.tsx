"use client"

import { Pin } from 'lucide-react'
import { format } from 'date-fns'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { StatusDropdown, type StatusOption } from '@/components/ui/status-dropdown'
import { DatePicker } from '@/components/ui/date-picker'
import { useUpdateTaskStatus, useUpdateTaskDeadline } from '@/components/tasks/useTaskMutations'
import { workspaceThreadKeys } from '@/hooks/queryKeys'
import { useThreadCounterpartName } from '@/hooks/messenger/useThreadCounterpartName'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { TableShellColumn } from './TableShell'
import type { ItemListColumnKey } from './columns'

type ThreadRowProps = {
  task: WorkspaceTask
  columns: TableShellColumn[]
  checked: boolean
  onToggle: () => void
  onOpen: () => void
  assigneesMap: Record<string, { id: string; name?: string | null; last_name?: string | null }[]>
  taskStatuses: StatusOption[]
}

export function ThreadRow({ task, columns, checked, onToggle, onOpen, assigneesMap, taskStatuses }: ThreadRowProps) {
  const updateStatus = useUpdateTaskStatus([
    workspaceThreadKeys.workspace(task.workspace_id),
  ] as never)
  const updateDeadline = useUpdateTaskDeadline([
    workspaceThreadKeys.workspace(task.workspace_id),
  ] as never)

  const currentStatus = taskStatuses.find((s) => s.id === task.status_id) ?? null
  const assignees = assigneesMap[task.id] ?? []
  const counterpartName = useThreadCounterpartName(task.id, task.workspace_id)

  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={checked} onCheckedChange={onToggle} />
      </td>
      {columns.map((c) => {
        switch (c.key as ItemListColumnKey) {
          case 'name':
            return (
              <td key={c.key} className="px-3 py-2 cursor-pointer truncate" onClick={onOpen}>
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
                      updateStatus.mutate({ taskId: task.id, statusId: newId } as never)
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
                    updateDeadline.mutate({ taskId: task.id, deadline: d ? d.toISOString() : null } as never)
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
}
