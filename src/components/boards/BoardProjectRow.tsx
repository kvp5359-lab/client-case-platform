"use client"

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { CardLayout, CardFieldId, CardFieldStyle, DisplayMode, VisibleField } from './types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import { formatDeadline, isOverdue } from './boardListUtils'
import { resolveCardLayout, fieldStyleToClasses, visibleFieldsToLayout } from './cardLayoutUtils'
import { useAllProjectStatuses } from '@/hooks/useStatuses'

interface BoardProjectRowProps {
  project: BoardProject
  workspaceId: string
  displayMode: DisplayMode
  visibleFields: VisibleField[]
  isSelected?: boolean
  cardLayout?: CardLayout | null
  /** Ближайшая незавершённая задача этого проекта — используется полем `next_task`. */
  nextTask?: WorkspaceTask
  /** Имя автора проекта (resolved from created_by uuid) — используется полем `created_by`. */
  authorName?: string | null
}

function ProjectField({
  fieldId,
  style,
  project,
  deadline,
  overdue,
  isSelected,
  nextTask,
  authorName,
  statusName,
  statusColor,
}: {
  fieldId: CardFieldId
  style: CardFieldStyle
  project: BoardProject
  deadline: string | null
  overdue: boolean
  isSelected?: boolean
  nextTask?: WorkspaceTask
  authorName?: string | null
  statusName: string | null
  statusColor: string | null
}) {
  const classes = fieldStyleToClasses(style)

  switch (fieldId) {
    case 'spacer':
      return <div className="shrink-0 w-3.5" aria-hidden />

    case 'icon':
      return (
        <FolderOpen
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            isSelected ? 'text-brand-600' : 'text-muted-foreground',
          )}
        />
      )

    case 'name':
      return (
        <span className={cn(classes, 'min-w-0 leading-snug', isSelected && 'font-medium text-brand-700')}>
          {project.name}
        </span>
      )

    case 'status': {
      if (!statusName) return null
      return (
        <span
          className={cn(classes, 'shrink-0 inline-flex items-center text-[11px] px-2 py-0.5 rounded-md border')}
          style={{
            backgroundColor: statusColor ? `${statusColor}1A` : undefined,
            color: statusColor ?? undefined,
            borderColor: statusColor ? `${statusColor}66` : undefined,
          }}
        >
          {statusName}
        </span>
      )
    }

    case 'deadline':
      if (!deadline) return null
      return (
        <span className={cn(classes, 'shrink-0', overdue ? 'text-red-500' : 'text-muted-foreground')}>
          {deadline}
        </span>
      )

    case 'template':
      if (!project.template_name) return null
      return (
        <span className={cn(classes, 'shrink-0 text-muted-foreground/60')}>
          {project.template_name}
        </span>
      )

    case 'created_at': {
      const created = formatDeadline(project.created_at)
      if (!created) return null
      return (
        <span className={cn(classes, 'shrink-0 text-muted-foreground/60')}>
          {created}
        </span>
      )
    }

    case 'created_by':
      if (!authorName) return null
      return (
        <span className={cn(classes, 'shrink-0 text-muted-foreground/80 truncate')}>
          {authorName}
        </span>
      )

    case 'next_task': {
      if (!nextTask || !nextTask.deadline) {
        return <span className={cn(classes, 'shrink-0 text-muted-foreground/40')}>—</span>
      }
      const taskOverdue = isOverdue(nextTask.deadline)
      const taskDeadline = formatDeadline(nextTask.deadline)
      return (
        <span className={cn(classes, 'min-w-0 flex items-center gap-1.5 truncate')}>
          <span className={cn('truncate', isSelected ? 'text-brand-700' : 'text-muted-foreground')}>
            {nextTask.name}
          </span>
          {taskDeadline && (
            <span className={cn('shrink-0', taskOverdue ? 'text-red-500' : 'text-muted-foreground/60')}>
              {taskDeadline}
            </span>
          )}
        </span>
      )
    }

    default:
      return null
  }
}

export function BoardProjectRow({
  project,
  workspaceId,
  displayMode,
  visibleFields,
  isSelected,
  cardLayout,
  nextTask,
  authorName,
}: BoardProjectRowProps) {
  const router = useRouter()
  const layoutPanel = useLayoutTaskPanel()
  const href = `/workspaces/${workspaceId}/projects/${project.id}`
  const deadline = formatDeadline(project.deadline)
  const overdue = isOverdue(project.deadline)

  // Resolve status name/color через единый кэш статусов воркспейса.
  // useQuery с одинаковым ключом не делает повторных запросов.
  const { data: allStatuses = [] } = useAllProjectStatuses(workspaceId)
  const status = project.status_id ? allStatuses.find((s) => s.id === project.status_id) : null
  const statusName = status?.name ?? null
  const statusColor = status?.color ?? null

  const rows = useMemo(
    () => resolveCardLayout(cardLayout, 'project')
      ?? visibleFieldsToLayout(visibleFields, displayMode, 'project'),
    [cardLayout, visibleFields, displayMode],
  )

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.ctrlKey || e.metaKey || e.button === 1) return
    e.preventDefault()
    if (layoutPanel?.openProject) {
      layoutPanel.openProject({
        id: project.id,
        name: project.name,
        created_at: project.created_at,
        description: project.description,
      })
    } else {
      router.push(href)
    }
  }

  const fieldProps = { project, deadline, overdue, isSelected, nextTask, authorName, statusName, statusColor }
  const isCards = displayMode === 'cards'

  return (
    <a
      href={href}
      onClick={handleClick}
      className={cn(
        'block cursor-pointer overflow-hidden transition-colors',
        isCards
          ? cn(
              'rounded-md border px-2.5 py-1 hover:shadow-sm',
              isSelected ? 'bg-brand-100 border-brand-200 shadow-sm' : 'bg-background',
            )
          : cn(
              'px-2.5 py-1',
              isSelected ? 'bg-brand-100' : 'hover:bg-accent/50',
            ),
      )}
    >
      {rows.map((row, i) => (
        <div key={i} className={cn('flex items-center gap-1.5 min-w-0', i > 0 && 'mt-0.5')}>
          {row.fields.map((f) => (
            <ProjectField key={f.fieldId} fieldId={f.fieldId} style={f.style} {...fieldProps} />
          ))}
        </div>
      ))}
    </a>
  )
}
