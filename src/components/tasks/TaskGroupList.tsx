"use client"

/**
 * Рендер сгруппированного списка задач с секцией «Завершены».
 * Используется в TaskListView.
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DeadlineGroup } from '@/utils/deadlineUtils'
import type { TaskStatus } from '@/hooks/useStatuses'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { TaskRow } from './TaskRow'
import type { TaskItem } from './types'
import { GROUP_ORDER, GROUP_LABELS, GROUP_COLORS } from './taskListConstants'

interface TaskGroupListProps {
  grouped: Map<DeadlineGroup, TaskItem[]>
  completedTasks: TaskItem[]
  workspaceId: string
  taskStatuses: TaskStatus[]
  membersMap: Record<string, AvatarParticipant[]>
  showProject: boolean
  onOpenTask: (id: string) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  onDeadlineSet: (taskId: string, date: Date) => void
  onDeadlineClear: (taskId: string) => void
  deadlinePending: boolean
}

export function TaskGroupList({
  grouped,
  completedTasks,
  workspaceId,
  taskStatuses,
  membersMap,
  showProject,
  onOpenTask,
  onStatusChange,
  onDeadlineSet,
  onDeadlineClear,
  deadlinePending,
}: TaskGroupListProps) {
  const [completedExpanded, setCompletedExpanded] = useState(false)

  return (
    <div className="space-y-6">
      {GROUP_ORDER.map((group) => {
        const items = grouped.get(group)
        if (!items || items.length === 0) return null
        return (
          <div key={group}>
            <div className="flex items-center gap-2 mb-2">
              <h2
                className={cn(
                  'text-xs font-semibold uppercase tracking-wider',
                  GROUP_COLORS[group],
                )}
              >
                {GROUP_LABELS[group]}
              </h2>
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>
            <div>
              {items.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  workspaceId={workspaceId}
                  statuses={taskStatuses}
                  members={membersMap[task.id] ?? []}
                  onOpen={() => onOpenTask(task.id)}
                  onStatusChange={(statusId) => onStatusChange(task.id, statusId)}
                  onDeadlineSet={(date) => onDeadlineSet(task.id, date)}
                  onDeadlineClear={() => onDeadlineClear(task.id)}
                  deadlinePending={deadlinePending}
                  showProject={showProject}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Секция «Завершены» — свёрнута по умолчанию */}
      {completedTasks.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setCompletedExpanded((v) => !v)}
            className="flex items-center gap-2 mb-2 group"
          >
            {completedExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Завершены
            </h2>
            <span className="text-xs text-muted-foreground">{completedTasks.length}</span>
          </button>
          {completedExpanded && (
            <div className="opacity-60">
              {completedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  workspaceId={workspaceId}
                  statuses={taskStatuses}
                  members={membersMap[task.id] ?? []}
                  onOpen={() => onOpenTask(task.id)}
                  onStatusChange={(statusId) => onStatusChange(task.id, statusId)}
                  onDeadlineSet={(date) => onDeadlineSet(task.id, date)}
                  onDeadlineClear={() => onDeadlineClear(task.id)}
                  deadlinePending={deadlinePending}
                  showProject={showProject}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
