"use client"

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { safeCssColor } from '@/utils/isValidCssColor'
import { StatusDropdown, type StatusOption } from '@/components/ui/status-dropdown'
import { ParticipantAvatars, type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { UnreadBadge } from '@/components/tasks/UnreadBadge'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { CardLayout, CardFieldId, CardFieldStyle, DisplayMode, VisibleField } from './types'
import { formatDeadline, isOverdue } from './boardListUtils'
import { resolveCardLayout, fieldStyleToClasses, visibleFieldsToLayout } from './cardLayoutUtils'

interface BoardTaskRowProps {
  task: WorkspaceTask
  workspaceId: string
  assignees: AvatarParticipant[]
  statuses: StatusOption[]
  visibleFields: VisibleField[]
  displayMode: DisplayMode
  onOpenTask: (taskId: string) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  isSelected?: boolean
  cardLayout?: CardLayout | null
}

/** Рендерит одно поле задачи по fieldId с учётом стиля */
function TaskField({
  fieldId,
  style,
  task,
  deadline,
  overdue,
  statuses,
  currentStatus,
  assignees,
  workspaceId,
  isSelected,
  onStatusChange,
  stretch,
}: {
  fieldId: CardFieldId
  style: CardFieldStyle
  task: WorkspaceTask
  deadline: string | null
  overdue: boolean
  statuses: StatusOption[]
  currentStatus: StatusOption | null
  assignees: AvatarParticipant[]
  workspaceId: string
  isSelected?: boolean
  onStatusChange: (taskId: string, statusId: string | null) => void
  stretch?: boolean
}) {
  const classes = fieldStyleToClasses(style)

  switch (fieldId) {
    case 'spacer':
      return <div className="shrink-0 w-[18px]" aria-hidden />

    case 'status':
      return (
        <div className={cn('shrink-0', style.align === 'right' && 'ml-auto')} onClick={(e) => e.stopPropagation()}>
          {statuses.length > 0 ? (
            <StatusDropdown
              currentStatus={currentStatus}
              statuses={statuses}
              onStatusChange={(statusId) => onStatusChange(task.id, statusId)}
              size="sm"
            />
          ) : (
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: safeCssColor(task.status_color) ?? '#d1d5db' }}
            />
          )}
        </div>
      )

    case 'name':
      return (
        <span
          className={cn(
            classes,
            'min-w-0 leading-snug',
            stretch && 'flex-1',
            overdue && 'text-red-500',
          )}
        >
          {task.name}
        </span>
      )

    case 'deadline':
      if (!deadline) return null
      return (
        <span className={cn(classes, 'shrink-0', overdue ? 'text-red-500' : 'text-muted-foreground')}>
          {deadline}
        </span>
      )

    case 'assignees':
      if (assignees.length === 0) return null
      return (
        <div className={cn('shrink-0', style.align === 'right' && 'ml-auto')}>
          <ParticipantAvatars participants={assignees} maxVisible={2} size="sm" />
        </div>
      )

    case 'project':
      if (!task.project_name) return null
      return (
        <span className={cn(classes, 'shrink-0 text-muted-foreground')}>
          {task.project_name}
        </span>
      )

    case 'unread':
      return (
        <div className={cn('shrink-0', style.align === 'right' && 'ml-auto')}>
          <UnreadBadge threadId={task.id} workspaceId={workspaceId} accentColor={task.accent_color} />
        </div>
      )

    default:
      return null
  }
}

export function BoardTaskRow({
  task,
  workspaceId,
  assignees,
  statuses,
  visibleFields,
  displayMode,
  onOpenTask,
  onStatusChange,
  isSelected,
  cardLayout,
}: BoardTaskRowProps) {
  const deadline = formatDeadline(task.deadline)
  const overdue = isOverdue(task.deadline)
  const currentStatus = statuses.find((s) => s.id === task.status_id) ?? null

  const rows = useMemo(
    () => resolveCardLayout(cardLayout, 'task')
      ?? visibleFieldsToLayout(visibleFields, displayMode, 'task'),
    [cardLayout, visibleFields, displayMode],
  )

  const handleClick = () => onOpenTask(task.id)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpenTask(task.id)
    }
  }

  const fieldProps = {
    task,
    deadline,
    overdue,
    statuses,
    currentStatus,
    assignees,
    workspaceId,
    isSelected,
    onStatusChange,
  }

  const isCards = displayMode === 'cards'
  const selectedOutlineColor = safeCssColor(task.status_color) ?? 'hsl(var(--brand-500))'
  const selectedStyle = isSelected
    ? { outline: `3px solid ${selectedOutlineColor}`, outlineOffset: '-3px' }
    : undefined

  return (
    <div
      className={cn(
        'cursor-pointer overflow-hidden transition-colors',
        isCards
          ? cn(
              'rounded-md border px-2.5 py-1 hover:shadow-sm',
              isSelected ? 'bg-background border-transparent' : 'border-border/50 bg-background',
            )
          : cn(
              'rounded-md px-2.5 py-1',
              isSelected ? 'bg-transparent' : 'hover:bg-accent/50',
            ),
      )}
      style={selectedStyle}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {rows.map((row, i) => {
        const lastLeftIdx = row.fields.reduce(
          (acc, f, idx) => (f.style.align === 'left' ? idx : acc),
          -1,
        )
        return (
          <div key={i} className={cn('flex items-center gap-1.5 min-w-0', i > 0 && 'mt-0.5')}>
            {row.fields.map((f, idx) => (
              <TaskField
                key={f.fieldId}
                fieldId={f.fieldId}
                style={f.style}
                stretch={idx === lastLeftIdx}
                {...fieldProps}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
