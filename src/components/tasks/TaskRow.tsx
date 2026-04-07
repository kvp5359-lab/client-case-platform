"use client"

/**
 * TaskRow — единая строка задачи. Используется в TasksTabContent и TasksPage.
 */

import { useMemo, forwardRef } from 'react'
import { CheckSquare, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusDropdown, type StatusOption } from '@/components/ui/status-dropdown'
import { type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { DraggableAttributes } from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { safeCssColor } from '@/utils/isValidCssColor'
import { DeadlinePopover } from './DeadlinePopover'
import { AssigneesPopover } from './AssigneesPopover'
import { UnreadBadge } from './UnreadBadge'
import type { TaskItem } from './types'

interface TaskRowProps {
  task: TaskItem
  workspaceId: string
  statuses: StatusOption[]
  members: AvatarParticipant[]
  onOpen: () => void
  onStatusChange: (statusId: string | null) => void
  onDeadlineSet: (date: Date) => void
  onDeadlineClear: () => void
  deadlinePending: boolean
  /** Показывать название проекта (на странице «Все задачи») */
  showProject?: boolean
  /** Drag handle props (от useSortable) */
  dragHandleProps?: {
    attributes: DraggableAttributes
    listeners: SyntheticListenerMap | undefined
  }
  /** Стили для sortable-анимации */
  style?: React.CSSProperties
  /** Прозрачность при перетаскивании */
  isDragging?: boolean
}

export const TaskRow = forwardRef<HTMLDivElement, TaskRowProps>(function TaskRow({
  task,
  workspaceId,
  statuses,
  members,
  onOpen,
  onStatusChange,
  onDeadlineSet,
  onDeadlineClear,
  deadlinePending,
  showProject,
  dragHandleProps,
  style,
  isDragging,
}, ref) {
  const currentStatus = useMemo(
    () => statuses.find((s) => s.id === task.status_id) ?? null,
    [statuses, task.status_id],
  )
  const nameStyle = currentStatus?.text_color
    ? { color: safeCssColor(currentStatus.text_color) }
    : undefined

  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        'group/row relative flex items-center gap-3 px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors bg-background',
        isDragging && 'opacity-50 shadow-lg z-10',
      )}
    >
      {/* Drag handle — появляется слева при hover, поверх padding строки */}
      {dragHandleProps && (
        <button
          type="button"
          className="absolute -left-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none p-0.5 shrink-0"
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground/40" aria-hidden="true" />
        </button>
      )}

      {/* Статус */}
      {statuses.length > 0 ? (
        <StatusDropdown
          currentStatus={currentStatus}
          statuses={statuses}
          onStatusChange={onStatusChange}
          size="sm"
        />
      ) : (
        <CheckSquare className="w-4 h-4 shrink-0 text-muted-foreground" />
      )}

      {/* Кликабельная область — открывает карточку задачи */}
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen()
          }
        }}
        className="flex-1 flex items-center gap-2 min-w-0 text-left cursor-pointer"
      >
        <span className="text-sm font-medium truncate" style={nameStyle}>
          {task.name}
          {showProject && task.project_name && (
            <span className="font-normal text-muted-foreground/60 ml-1.5">
              · {task.project_name}
            </span>
          )}
        </span>
        {/* Исполнители — сразу после названия */}
        <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <AssigneesPopover
            threadId={task.id}
            projectId={task.project_id}
            workspaceId={workspaceId}
            assignees={members}
          />
        </span>
      </div>

      <UnreadBadge threadId={task.id} workspaceId={workspaceId} accentColor={task.accent_color} />

      {/* Срок */}
      <DeadlinePopover
        deadline={task.deadline}
        onSet={onDeadlineSet}
        onClear={onDeadlineClear}
        isPending={deadlinePending}
      />
    </div>
  )
})
