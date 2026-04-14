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
import { resolveCardLayout, fieldStyleToClasses } from './cardLayoutUtils'

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
}) {
  const classes = fieldStyleToClasses(style)

  switch (fieldId) {
    case 'status':
      return (
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
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
        <span className={cn(classes, 'min-w-0 flex-1 leading-snug', isSelected && 'font-medium text-brand-700')}>
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
        <div className="shrink-0">
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
      return <UnreadBadge threadId={task.id} workspaceId={workspaceId} accentColor={task.accent_color} />

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

  const resolved = useMemo(
    () => resolveCardLayout(cardLayout, 'task'),
    [cardLayout],
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

  // ── Динамический рендеринг через cardLayout ──
  if (resolved) {
    const content = resolved.map((row, i) => (
      <div key={i} className={cn('flex items-center gap-1.5 min-w-0', i > 0 && 'mt-0.5')}>
        {row.fields.map((f) => (
          <TaskField key={f.fieldId} fieldId={f.fieldId} style={f.style} {...fieldProps} />
        ))}
      </div>
    ))

    return (
      <div
        className={cn(
          'cursor-pointer overflow-hidden transition-colors',
          isCards
            ? cn(
                'rounded-md border px-2.5 py-1 hover:shadow-sm',
                isSelected ? 'bg-brand-100 border-brand-200' : 'border-border/50 bg-background',
              )
            : cn(
                'px-2.5 py-1',
                isSelected ? 'bg-brand-100' : 'hover:bg-accent/50',
              ),
        )}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {content}
      </div>
    )
  }

  // ── Fallback: старый рендеринг через visibleFields ──
  const showStatus = visibleFields.includes('status')
  const showDeadline = visibleFields.includes('deadline')
  const showAssignees = visibleFields.includes('assignees')
  const showProject = visibleFields.includes('project')

  if (displayMode === 'cards') {
    const hasBottom = (showDeadline && deadline) || (showProject && task.project_name)
    return (
      <div
        className={cn(
          'rounded-md border px-2.5 py-1 transition-colors cursor-pointer overflow-hidden',
          isSelected
            ? 'bg-brand-100 border-brand-200'
            : 'border-border/50 bg-background hover:bg-accent/50',
        )}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {showStatus && (
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
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
          )}
          <span className={cn('text-[14px] truncate leading-snug', isSelected && 'font-medium text-brand-700')}>
            {task.name}
          </span>
          {showAssignees && assignees.length > 0 && (
            <div className="shrink-0">
              <ParticipantAvatars participants={assignees} maxVisible={2} size="sm" />
            </div>
          )}
          <div className="flex-1" />
          <UnreadBadge threadId={task.id} workspaceId={workspaceId} accentColor={task.accent_color} />
        </div>

        {hasBottom && (
          <div className="flex items-center gap-1.5 mt-0.5 pl-[24px]">
            {showProject && task.project_name && (
              <span className="text-[10px] text-muted-foreground truncate">
                {task.project_name}
              </span>
            )}
            <div className="flex-1" />
            {showDeadline && deadline && (
              <span className={cn('text-[10px] shrink-0', overdue ? 'text-red-500' : 'text-muted-foreground')}>
                {deadline}
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2.5 py-1 w-full text-left transition-colors cursor-pointer',
        isSelected ? 'bg-brand-100' : 'hover:bg-accent/50',
      )}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {showStatus && (
        <div onClick={(e) => e.stopPropagation()}>
          {statuses.length > 0 ? (
            <StatusDropdown
              currentStatus={currentStatus}
              statuses={statuses}
              onStatusChange={(statusId) => onStatusChange(task.id, statusId)}
              size="sm"
            />
          ) : (
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: safeCssColor(task.status_color) ?? '#d1d5db' }}
            />
          )}
        </div>
      )}

      <span className={cn('text-[14px] truncate', isSelected && 'font-medium text-brand-700')}>
        {task.name}
      </span>
      {showProject && task.project_name && (
        <span className="text-[13px] text-muted-foreground/60 truncate shrink-0">
          {task.project_name}
        </span>
      )}

      <div className="flex-1" />

      {showDeadline && deadline && (
        <span className={cn('text-[11px] shrink-0', overdue ? 'text-red-500' : 'text-muted-foreground')}>
          {deadline}
        </span>
      )}

      {showAssignees && assignees.length > 0 && (
        <div className="shrink-0">
          <ParticipantAvatars participants={assignees} maxVisible={2} />
        </div>
      )}

      <UnreadBadge threadId={task.id} workspaceId={workspaceId} accentColor={task.accent_color} />
    </div>
  )
}
