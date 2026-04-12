"use client"

/**
 * Режим 2 панели задач: открытый проект со списком задач.
 * Выделен из TaskPanel для снижения размера файла.
 */

import { lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink, FolderOpen, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatSmartDate } from '@/utils/format/dateFormat'
import { TaskPanelContext, useLayoutTaskPanel } from './TaskPanelContext'
import type { ProjectHeaderInfo } from './TaskPanel'
import type { TaskItem } from './types'

const TaskListView = lazy(() =>
  import('./TaskListView').then((m) => ({ default: m.TaskListView })),
)

interface TaskPanelProjectViewProps {
  project: ProjectHeaderInfo
  workspaceId: string
  visible: boolean
  canGoBack: boolean
  onBack?: () => void
  onClose: () => void
  onOpenThreadInStack?: (task: TaskItem) => void
}

export function TaskPanelProjectView({
  project,
  workspaceId,
  visible,
  canGoBack,
  onBack,
  onClose,
  onOpenThreadInStack,
}: TaskPanelProjectViewProps) {
  const router = useRouter()
  const parentPanelCtx = useLayoutTaskPanel()
  const projectHref = `/workspaces/${workspaceId}/projects/${project.id}`

  return (
    <TaskPanelContext.Provider
      value={{
        openThread: (next) => onOpenThreadInStack?.(next),
        pushThread: (next) => onOpenThreadInStack?.(next),
        closeThread: parentPanelCtx?.closeThread ?? onClose,
        isInsidePanel: true,
      }}
    >
      <div
        className={cn(
          'side-panel flex flex-col z-50',
          'transition-transform duration-200 ease-out',
          visible ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Шапка проекта */}
        <div className="border-b shrink-0 flex flex-col py-2 gap-0.5">
          <div className="flex items-center gap-2 px-4 min-h-[32px]">
            {canGoBack && onBack && (
              <button
                type="button"
                onClick={onBack}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Назад"
                aria-label="Назад"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            <FolderOpen className="w-4 h-4 shrink-0 text-muted-foreground" />

            <h2 className="text-base font-semibold leading-tight truncate min-w-0 flex-1">
              {project.name}
            </h2>

            <a
              href={projectHref}
              onClick={(e) => {
                if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault()
                  router.push(projectHref)
                }
              }}
              className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Открыть проект"
              aria-label="Открыть проект"
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {(project.created_at || project.description) && (
            <div
              className={cn(
                'flex items-center gap-2 pr-4 text-xs text-muted-foreground/70 min-w-0',
                canGoBack ? 'pl-[72px]' : 'pl-[44px]',
              )}
            >
              {project.created_at && (
                <span className="shrink-0">
                  Создан {formatSmartDate(project.created_at)}
                </span>
              )}
              {project.created_at && project.description && (
                <span className="shrink-0 opacity-40">•</span>
              )}
              {project.description && (
                <span className="truncate" title={project.description}>
                  {project.description}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Тело: список задач проекта */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="p-4">
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  Загрузка…
                </div>
              }
            >
              <TaskListView
                workspaceId={workspaceId}
                projectId={project.id}
                showProject={false}
                showProjectLink={false}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </TaskPanelContext.Provider>
  )
}
