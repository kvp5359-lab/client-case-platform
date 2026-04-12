"use client"

import { useRouter } from 'next/navigation'
import { FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { DisplayMode, VisibleField } from './types'

interface BoardProjectRowProps {
  project: BoardProject
  workspaceId: string
  displayMode: DisplayMode
  visibleFields: VisibleField[]
  /** true, если именно этот проект открыт в боковой панели — строка подсвечивается. */
  isSelected?: boolean
}

/**
 * Строка проекта в списке доски. Клик открывает TaskPanel в Режиме 2
 * (список задач проекта в правой панели). Если layout-уровневая панель
 * недоступна (контекст отсутствует) — фолбэк на переход на страницу проекта
 * через router.push.
 *
 * Ctrl/Cmd + клик и средняя кнопка мыши — как и раньше, открывают страницу
 * проекта в новой вкладке (обычное поведение браузера для ссылок).
 */
export function BoardProjectRow({ project, workspaceId, displayMode, visibleFields, isSelected }: BoardProjectRowProps) {
  const router = useRouter()
  const layoutPanel = useLayoutTaskPanel()
  const href = `/workspaces/${workspaceId}/projects/${project.id}`
  const showTemplate = visibleFields.includes('template')

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Ctrl/Cmd + клик или средняя кнопка — отдаём браузеру, он откроет в новой вкладке.
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

  if (displayMode === 'cards') {
    return (
      <a
        href={href}
        onClick={handleClick}
        className={cn(
          'rounded-md border px-2 py-1 hover:shadow-sm transition-shadow cursor-pointer overflow-hidden block',
          isSelected
            ? 'bg-brand-100 border-brand-200 shadow-sm'
            : 'bg-background',
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <FolderOpen
            className={cn(
              'h-3.5 w-3.5 shrink-0',
              isSelected ? 'text-brand-600' : 'text-muted-foreground',
            )}
          />
          <span
            className={cn(
              'text-[14px] truncate leading-snug',
              isSelected && 'font-medium text-brand-700',
            )}
          >
            {project.name}
          </span>
          {showTemplate && project.template_name && (
            <span className="text-[12px] text-muted-foreground/60 truncate shrink-0">{project.template_name}</span>
          )}
        </div>
      </a>
    )
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 w-full text-left transition-colors cursor-pointer',
        isSelected
          ? 'bg-brand-100 hover:bg-brand-100'
          : 'hover:bg-accent/50',
      )}
    >
      <FolderOpen
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          isSelected ? 'text-brand-600' : 'text-muted-foreground',
        )}
      />
      <span
        className={cn(
          'text-[14px] truncate',
          isSelected && 'font-medium text-brand-700',
        )}
      >
        {project.name}
      </span>
      {showTemplate && project.template_name && (
        <span className="text-[13px] text-muted-foreground/60 truncate shrink-0">{project.template_name}</span>
      )}
    </a>
  )
}
