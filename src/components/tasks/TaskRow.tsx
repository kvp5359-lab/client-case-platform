"use client"

/**
 * TaskRow — единая строка задачи. Используется в TasksTabContent и TasksPage.
 */

import { useMemo, createElement, forwardRef } from 'react'
import { CheckSquare, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusDropdown, type StatusOption } from '@/components/common/status-dropdown'
import { type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { DraggableAttributes } from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { safeCssColor } from '@/utils/isValidCssColor'
import { getDeadlineGroup } from '@/utils/deadlineUtils'
import { getChatIconComponent } from '@/components/messenger/EditChatDialog'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import { DeadlinePopover } from './DeadlinePopover'
import type { TaskTimeValue } from './TaskTimePickerPopover'
import { AssigneesPopover } from './AssigneesPopover'
import { UnreadBadge } from './UnreadBadge'
import { TaskActionsMenu } from './TaskActionsMenu'
import type { TaskItem } from './types'

type TaskRowProps = {
  task: TaskItem
  workspaceId: string
  statuses: StatusOption[]
  members: AvatarParticipant[]
  onOpen: () => void
  onStatusChange: (statusId: string | null) => void
  onDeadlineSet: (date: Date) => void
  onDeadlineClear: () => void
  /** Новый API: пробрасывает все три поля (deadline, startAt, endAt). */
  onTimeChange?: (v: TaskTimeValue) => void
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
  /** Подсветка строки, когда эта задача открыта в боковой панели. */
  isActive?: boolean
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
  onTimeChange,
  deadlinePending,
  finalStatusIds,
  showProject,
  dragHandleProps,
  style,
  isDragging,
  onRequestDelete,
  isActive,
}, ref) {
  const currentStatus = useMemo(
    () => statuses.find((s) => s.id === task.status_id) ?? null,
    [statuses, task.status_id],
  )
  const isFinal = !!task.status_id && !!finalStatusIds?.has(task.status_id)
  const isOverdue = !isFinal && getDeadlineGroup(task.deadline) === 'overdue'
  const nameStyle = isOverdue
    ? undefined
    : currentStatus?.text_color
      ? { color: safeCssColor(currentStatus.text_color) }
      : undefined

  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        'group/row relative flex items-center gap-3 px-3 py-1 border-b border-border/50 hover:bg-muted/30 transition-colors bg-background',
        isDragging && 'opacity-50 shadow-lg z-10',
        // Подсветка задачи, открытой в боковой панели. Светлее активного
        // проекта в сайдбаре (там bg-gray-200) — для строки задачи такой тон
        // визуально перегружен, поэтому намеренно более лёгкий фон. hover
        // держим тем же, чтобы при наведении индикация не пропадала.
        isActive && 'bg-gray-100 hover:bg-gray-100',
      )}
    >
      {/* Drag handle — появляется слева при hover, поверх padding строки */}
      {dragHandleProps && (
        <button
          type="button"
          className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none p-0.5 shrink-0"
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
        <span
          className={cn('text-sm font-medium truncate', isOverdue && 'text-red-600')}
          style={nameStyle}
        >
          {task.name}
        </span>
        {task.type && task.type !== 'task' && (
          <span className={cn('shrink-0', isFinal && 'opacity-40')}>
            {createElement(getChatIconComponent(task.icon), {
              className: cn('w-3.5 h-3.5', COLOR_TEXT[task.accent_color] ?? 'text-blue-500'),
            })}
          </span>
        )}
        {/* Имя проекта — показываем только если оно есть. У задач без
            проекта плейсхолдер не нужен: отсутствие имени само по себе
            достаточный сигнал (особенно на странице «Без проекта»). */}
        {showProject && task.project_name && (
          <span className="text-sm truncate shrink-0 text-muted-foreground/60">
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

        {/* Срок — прижат к исполнителям. Заполненный виден всегда,
            пустой плейсхолдер «Срок» — только при наведении на строку. */}
        <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <DeadlinePopover
            deadline={task.deadline}
            startAt={task.start_at}
            endAt={task.end_at}
            onChange={onTimeChange}
            onSet={onDeadlineSet}
            onClear={onDeadlineClear}
            isPending={deadlinePending}
            isFinal={isFinal}
            triggerClassName={
              !task.deadline ? 'hidden group-hover/row:inline-flex' : undefined
            }
          />
        </span>

        <UnreadBadge threadId={task.id} workspaceId={workspaceId} accentColor={task.accent_color} />

        {/* Меню «три точки» — единый компонент для всех мест UI.
            Если onRequestDelete не передан — внутри сам решит, что показать. */}
        <TaskActionsMenu
          onOpen={onOpen}
          statuses={statuses}
          currentStatusId={task.status_id}
          onStatusChange={onStatusChange}
          deadline={task.deadline}
          onDeadlineSet={onDeadlineSet}
          onDeadlineClear={onDeadlineClear}
          deadlinePending={deadlinePending}
          onRequestDelete={onRequestDelete}
          triggerClassName="opacity-0 group-hover/row:opacity-100"
        />
      </div>
    </div>
  )
})
