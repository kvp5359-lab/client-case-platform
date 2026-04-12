"use client"

import { cn } from '@/lib/utils'
import { safeCssColor } from '@/utils/isValidCssColor'
import { StatusDropdown, type StatusOption } from '@/components/ui/status-dropdown'
import { ParticipantAvatars, type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { UnreadBadge } from '@/components/tasks/UnreadBadge'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceTasks'
import type { DisplayMode, VisibleField } from './types'

interface BoardTaskRowProps {
  task: WorkspaceTask
  workspaceId: string
  assignees: AvatarParticipant[]
  statuses: StatusOption[]
  visibleFields: VisibleField[]
  displayMode: DisplayMode
  onOpenTask: (taskId: string) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  /** true, если именно этот тред открыт в боковой панели — строка подсвечивается. */
  isSelected?: boolean
}

function formatDeadline(deadline: string | null): string | null {
  if (!deadline) return null
  const d = new Date(deadline)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const taskDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((taskDate.getTime() - today.getTime()) / 86400000)

  if (diffDays === 0) return 'Сегодня'
  if (diffDays === 1) return 'Завтра'
  if (diffDays === -1) return 'Вчера'

  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false
  return new Date(deadline) < new Date(new Date().toDateString())
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
}: BoardTaskRowProps) {
  const deadline = formatDeadline(task.deadline)
  const overdue = isOverdue(task.deadline)
  const currentStatus = statuses.find((s) => s.id === task.status_id) ?? null

  const showStatus = visibleFields.includes('status')
  const showDeadline = visibleFields.includes('deadline')
  const showAssignees = visibleFields.includes('assignees')

  const handleClick = () => onOpenTask(task.id)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpenTask(task.id)
    }
  }

  const showProject = visibleFields.includes('project')

  // ── Вид карточки ──
  if (displayMode === 'cards') {
    const hasBottom = (showDeadline && deadline) || (showProject && task.project_name)
    return (
      <div
        className={cn(
          'rounded-md border px-2 py-1 transition-colors cursor-pointer overflow-hidden',
          isSelected
            ? 'bg-brand-100 border-brand-200'
            : 'border-border/50 bg-background hover:bg-accent/50',
        )}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {/* Верхняя строка: статус + название + исполнители */}
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

        {/* Нижняя строка: проект, исполнители, срок */}
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

  // ── Вид списка (по умолчанию) ──
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 w-full text-left transition-colors cursor-pointer',
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
