"use client"

/**
 * TaskRow — единая строка задачи. Используется в TasksTabContent и TasksPage.
 */

import { useMemo, createElement, forwardRef } from 'react'
import { CheckSquare, GripVertical, MoreVertical, ExternalLink, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusDropdown, type StatusOption } from '@/components/ui/status-dropdown'
import { type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { DraggableAttributes } from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { safeCssColor } from '@/utils/isValidCssColor'
import { getChatIconComponent } from '@/components/messenger/EditChatDialog'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
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
  /** ID статусов с is_final — для отключения подсветки просрочки */
  finalStatusIds?: Set<string>
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
  /** Запрос на удаление задачи (если не передан — меню «три точки» не показывается) */
  onRequestDelete?: () => void
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
  finalStatusIds,
  showProject,
  dragHandleProps,
  style,
  isDragging,
  onRequestDelete,
}, ref) {
  const currentStatus = useMemo(
    () => statuses.find((s) => s.id === task.status_id) ?? null,
    [statuses, task.status_id],
  )
  const nameStyle = currentStatus?.text_color
    ? { color: safeCssColor(currentStatus.text_color) }
    : undefined
  const isFinal = !!task.status_id && !!finalStatusIds?.has(task.status_id)

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
        </span>
        {task.type && task.type !== 'task' && (
          <span className="shrink-0">
            {createElement(getChatIconComponent(task.icon), {
              className: cn('w-3.5 h-3.5', COLOR_TEXT[task.accent_color] ?? 'text-blue-500'),
            })}
          </span>
        )}
        {showProject && task.project_name && (
          <span className="text-sm text-muted-foreground/60 truncate shrink-0">
            · {task.project_name}
          </span>
        )}
        {/* Исполнители — сразу после названия */}
        <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <AssigneesPopover
            threadId={task.id}
            projectId={task.project_id}
            workspaceId={workspaceId}
            assignees={members}
            dimmed={isFinal}
          />
        </span>

        {/* Меню «три точки» — сразу после исполнителей */}
        {onRequestDelete && (
          <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover/row:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                  aria-label="Меню задачи"
                >
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={onOpen} className="text-xs cursor-pointer">
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  Открыть
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onRequestDelete}
                  className="text-xs cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        )}
      </div>

      <UnreadBadge threadId={task.id} workspaceId={workspaceId} accentColor={task.accent_color} />

      {/* Срок */}
      <DeadlinePopover
        deadline={task.deadline}
        onSet={onDeadlineSet}
        onClear={onDeadlineClear}
        isPending={deadlinePending}
        isFinal={isFinal}
      />
    </div>
  )
})
