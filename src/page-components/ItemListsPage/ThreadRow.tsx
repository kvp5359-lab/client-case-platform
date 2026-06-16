"use client"

import { memo, createElement } from 'react'
import { Pin } from 'lucide-react'
import { toast } from 'sonner'
import { formatSmartDateCompact } from '@/utils/format/dateFormat'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import { StatusDropdown, type StatusOption } from '@/components/common/status-dropdown'
import { DeadlinePopover } from '@/components/tasks/DeadlinePopover'
import { AssigneesPopover } from '@/components/tasks/AssigneesPopover'
import { useUpdateTaskStatus, useUpdateTaskDeadline } from '@/components/tasks/useTaskMutations'
import { workspaceThreadKeys } from '@/hooks/queryKeys'
import { usePrefetchThreadMessages } from '@/hooks/messenger/usePrefetchThreadMessages'
import { cn } from '@/lib/utils'
import { type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { TableShellColumn, RowRenderMeta } from './TableShell'
import type { ItemListColumnKey } from './columns'

type ThreadRowProps = {
  task: WorkspaceTask
  columns: TableShellColumn[]
  checked: boolean
  /** Стабильный колбэк — принимает id, чтобы memo'нутая строка не перерисовывалась
   *  при каждом изменении выделения (раньше onToggle замыкался на selectedIds). */
  onToggle: (id: string) => void
  onOpen: (task: WorkspaceTask) => void
  assigneesMap: Record<string, AvatarParticipant[]>
  taskStatuses: StatusOption[]
  /** Имя собеседника из карты на уровне таблицы (P4b: не звать per-row хук). */
  counterpartName: string | null
  /** Виртуализация: ref для measureElement + индекс строки (см. TableShell). */
  measureRef?: RowRenderMeta['measureRef']
  dataIndex?: number
  /** Строка под клавиатурным фокусом — подсветка. */
  focused?: boolean
}

export const ThreadRow = memo(function ThreadRow({ task, columns, checked, onToggle, onOpen, assigneesMap, taskStatuses, counterpartName, measureRef, dataIndex, focused }: ThreadRowProps) {
  const updateStatus = useUpdateTaskStatus([
    workspaceThreadKeys.workspace(task.workspace_id),
  ])
  const updateDeadline = useUpdateTaskDeadline([
    workspaceThreadKeys.workspace(task.workspace_id),
  ])

  const currentStatus = taskStatuses.find((s) => s.id === task.status_id) ?? null
  const assignees = assigneesMap[task.id] ?? []
  const prefetchMessages = usePrefetchThreadMessages()

  // Inline-правки с undo: меняем сразу (оптимистично), но даём «Отменить» (best
  // practice для табличного редактирования). Undo-мутация без toast — не плодит цепочку.
  const handleStatusChange = (newId: string | null) => {
    const prev = task.status_id
    updateStatus.mutate(
      { threadId: task.id, statusId: newId },
      {
        onSuccess: () =>
          toast('Статус изменён', {
            action: {
              label: 'Отменить',
              onClick: () => updateStatus.mutate({ threadId: task.id, statusId: prev }),
            },
          }),
      },
    )
  }
  const handleDeadlineChange = (deadline: string | null, startAt: string | null, endAt: string | null) => {
    const prev = { deadline: task.deadline, start_at: task.start_at, end_at: task.end_at }
    updateDeadline.mutate(
      { threadId: task.id, deadline, start_at: startAt, end_at: endAt },
      {
        onSuccess: () =>
          toast('Срок изменён', {
            action: {
              label: 'Отменить',
              onClick: () => updateDeadline.mutate({ threadId: task.id, ...prev }),
            },
          }),
      },
    )
  }

  return (
    <tr
      ref={measureRef}
      data-index={dataIndex}
      className={cn('border-b hover:bg-muted/30', focused && 'bg-muted/60')}
      onMouseEnter={() => prefetchMessages(task.id)}
    >
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
                  {task.type && task.type !== 'task' && (
                    <span className="shrink-0">
                      {createElement(getChatIconComponent(task.icon), {
                        className: `w-3.5 h-3.5 ${COLOR_TEXT[task.accent_color as ThreadAccentColor] ?? 'text-blue-500'}`,
                      })}
                    </span>
                  )}
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
                    onStatusChange={handleStatusChange}
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
                <DeadlinePopover
                  deadline={task.deadline}
                  startAt={task.start_at}
                  endAt={task.end_at}
                  onChange={(v) => handleDeadlineChange(v.deadline, v.startAt, v.endAt)}
                  isPending={updateDeadline.isPending}
                />
              </td>
            )
          case 'assignees':
            return (
              <td key={c.key} className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                <AssigneesPopover
                  threadId={task.id}
                  projectId={task.project_id}
                  workspaceId={task.workspace_id}
                  assignees={assignees}
                  triggerOverride={
                    c.display === 'names' ? (
                      <button
                        type="button"
                        className="text-left truncate w-full hover:text-foreground transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {assignees.length === 0 ? (
                          <span className="text-muted-foreground/50">Назначить</span>
                        ) : (
                          assignees
                            .map((a) => `${a.name}${a.last_name ? ` ${a.last_name}` : ''}`)
                            .join(', ')
                        )}
                      </button>
                    ) : undefined
                  }
                />
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
                {formatSmartDateCompact(value)}
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
