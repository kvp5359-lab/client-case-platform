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
        {/* Плавающая круглая кнопка «Назад» на левой границе панели — не смещает шапку. */}
        {canGoBack && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="absolute left-0 top-1 -translate-x-[60%] z-20 flex items-center justify-center w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm text-muted-foreground hover:text-foreground hover:bg-gray-50 transition-colors"
            title="Назад"
            aria-label="Назад"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        {/* Шапка проекта — та же геометрия, что у шапки треда: h-[61px], жёсткие
            высоты строк (30 + 26 + 5 pt), иконка w-6 h-6, заголовок text-sm. */}
        <div className="border-b shrink-0 h-[61px] flex flex-col">
          <div className="flex items-center gap-2 px-4 h-[30px] shrink-0">
            <span className="shrink-0 flex items-center justify-center w-6 h-6 text-muted-foreground">
              <FolderOpen className="w-4 h-4" />
            </span>

            <h2 className="text-sm font-semibold leading-tight truncate min-w-0 flex-1">
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

          <div
            className={cn(
              'flex items-start gap-2 pr-4 pl-[48px] h-[26px] shrink-0 text-xs text-muted-foreground/70 min-w-0',
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
