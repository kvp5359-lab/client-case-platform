"use client"

import { Fragment, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { safeCssColor } from '@/utils/isValidCssColor'
import { StatusDropdown, type StatusOption } from '@/components/common/status-dropdown'
import { ParticipantAvatars, type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { UnreadBadge } from '@/components/tasks/UnreadBadge'
import { TaskActionsMenu } from '@/components/tasks/TaskActionsMenu'
import { useThreadCounterpartName } from '@/hooks/messenger/useThreadCounterpartName'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { CardLayout, CardFieldId, CardFieldStyle, DisplayMode, VisibleField } from './types'
import { formatDeadline, formatTimeRange, isOverdue } from './boardListUtils'
import { resolveCardLayout, fieldStyleToClasses, visibleFieldsToLayout } from './cardLayoutUtils'

type BoardTaskRowProps = {
  task: WorkspaceTask
  workspaceId: string
  assignees: AvatarParticipant[]
  statuses: StatusOption[]
  visibleFields: VisibleField[]
  displayMode: DisplayMode
  onOpenTask: (taskId: string) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  /** Удалить задачу (мягко в корзину) — используется полем `menu`. */
  onDeleteTask?: (task: WorkspaceTask) => void
  /** Изменить дедлайн — используется полем `menu`. */
  onDeadlineChange?: (taskId: string, deadline: string | null) => void
  isSelected?: boolean
  cardLayout?: CardLayout | null
}

/** Поле «проект»: если тред не привязан к проекту, показываем имя контакта. */
function ProjectOrCounterpartField({
  task,
  workspaceId,
  classes,
  rowHasRightAligned,
}: {
  task: WorkspaceTask
  workspaceId: string
  classes: string
  /** В этой же строке есть поле с align=right — значит project не должен
   *  забирать всё свободное место (иначе ml-auto у time/deadline не сработает). */
  rowHasRightAligned: boolean
}) {
  const counterpartName = useThreadCounterpartName(task.id, workspaceId)
  const value = task.project_name ?? counterpartName
  if (!value) return null
  // grow=1 → поле забирает свободное место первым (иначе ml-auto у time/deadline
  // съедает пространство в пустой зазор и контакт обрезается до 4 символов).
  // НО: если в строке есть поле с align=right (например, «Время» справа),
  // grow убираем — иначе right-align не сработает, время прилипает сразу
  // после проекта вместо правого края.
  // shrink=0.7 → при нехватке ширины контакт/проект сжимается слабее, чем name,
  // т.к. в name обычно общий префикс «Re: Вакансия…», а в контакте — уникальная
  // часть, важнее для распознавания строки.
  return (
    <span
      className={cn(classes, 'min-w-0 text-muted-foreground/60')}
      style={{ flex: rowHasRightAligned ? '0 0.7 auto' : '1 0.7 auto' }}
    >
      {value}
    </span>
  )
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
  onStatusChange,
  onOpenTask,
  onDeleteTask,
  onDeadlineChange,
  rowHasRightAligned,
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
  onStatusChange: (taskId: string, statusId: string | null) => void
  onOpenTask: (taskId: string) => void
  onDeleteTask?: (task: WorkspaceTask) => void
  onDeadlineChange?: (taskId: string, deadline: string | null) => void
  rowHasRightAligned: boolean
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

    case 'time': {
      const timeRange = formatTimeRange(task.start_at, task.end_at)
      if (!timeRange) return null
      return (
        <span className={cn(classes, 'shrink-0 tabular-nums text-muted-foreground')}>
          {timeRange}
        </span>
      )
    }

    case 'assignees':
      if (assignees.length === 0) return null
      return (
        <div className={cn('shrink-0', style.align === 'right' && 'ml-auto')}>
          <ParticipantAvatars participants={assignees} maxVisible={2} size="sm" />
        </div>
      )

    case 'project':
      return (
        <ProjectOrCounterpartField
          task={task}
          workspaceId={workspaceId}
          classes={classes}
          rowHasRightAligned={rowHasRightAligned}
        />
      )

    case 'unread':
      return (
        <div className={cn('flex items-center shrink-0', style.align === 'right' && 'ml-auto')}>
          <UnreadBadge threadId={task.id} workspaceId={workspaceId} accentColor={task.accent_color} />
        </div>
      )

    case 'menu':
      // Меню — поверх контента справа, абсолютным позиционированием.
      // НЕ участвует в flex-распределении (иначе `shrink-0`+`ml-auto`
      // съедает свободное место и сжимает соседнее поле, см. case с
      // длинным контактом справа). Видно только на hover, появляется
      // поверх правого края (контент за ним всё равно затемнён ховером).
      return (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 bg-background rounded opacity-0 group-hover/board-row:opacity-100 transition-opacity">
          <TaskActionsMenu
            onOpen={() => onOpenTask(task.id)}
            statuses={statuses}
            currentStatusId={task.status_id}
            onStatusChange={(sid) => onStatusChange(task.id, sid)}
            deadline={task.deadline}
            onDeadlineSet={
              onDeadlineChange
                ? (d) => onDeadlineChange(task.id, d.toISOString())
                : undefined
            }
            onDeadlineClear={
              onDeadlineChange ? () => onDeadlineChange(task.id, null) : undefined
            }
            onRequestDelete={onDeleteTask ? () => onDeleteTask(task) : undefined}
            align="end"
          />
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
  onDeleteTask,
  onDeadlineChange,
  isSelected,
  cardLayout,
}: BoardTaskRowProps) {
  const deadline = formatDeadline(task.deadline)
  const overdue = isOverdue(task.deadline)
  const currentStatus = statuses.find((s) => s.id === task.status_id) ?? null

  const rows = useMemo(
    () => resolveCardLayout(cardLayout, 'thread')
      ?? visibleFieldsToLayout(visibleFields, displayMode, 'thread'),
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
    onStatusChange,
    onOpenTask,
    onDeleteTask,
    onDeadlineChange,
  }

  const isCards = displayMode === 'cards'
  const selectedOutlineColor = safeCssColor(task.status_color) ?? 'hsl(var(--brand-500))'
  const selectedStyle = isSelected
    ? { outline: `3px solid ${selectedOutlineColor}`, outlineOffset: '-3px' }
    : undefined

  return (
    <div
      className={cn(
        'group/board-row relative cursor-pointer overflow-hidden transition-colors',
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
        // ml-auto у поля с align=right сработает только если в flex-контейнере
        // есть свободное место. Но name с flex-basis: auto + shrink=1 при
        // длинном тексте забирает весь slack, а project (даже с grow=0 моим
        // фиксом) и time остаются shrink-0 — между ними фактического свободного
        // места не остаётся, margin-left:auto = 0.
        // Решение: перед первым right-aligned полем рендерим невидимый
        // flex-1 spacer. Он явно тянется на всё свободное пространство и
        // отодвигает right-поля к правому краю. project с grow=0 (через
        // rowHasRightAligned) не борется с ним за это место.
        const rowHasRightAligned = row.fields.some((f) => f.style.align === 'right')
        const firstRightIdx = row.fields.findIndex((f) => f.style.align === 'right')
        return (
          <div key={i} className={cn('flex items-center gap-1.5 min-w-0', i > 0 && 'mt-0.5')}>
            {row.fields.map((f, fi) => (
              <Fragment key={f.fieldId}>
                {rowHasRightAligned && fi === firstRightIdx && (
                  // min-w-[24px] — иначе при длинном name (sum > container)
                  // spacer схлопывается в 0 и time прилипает к name. Минимум
                  // 24px даёт визуальный зазор и отнимает у name всего ~6%
                  // ширины, не критично для читаемости.
                  <div className="flex-1 min-w-[24px]" aria-hidden />
                )}
                <TaskField
                  fieldId={f.fieldId}
                  style={f.style}
                  {...fieldProps}
                  rowHasRightAligned={rowHasRightAligned}
                />
              </Fragment>
            ))}
          </div>
        )
      })}
    </div>
  )
}
