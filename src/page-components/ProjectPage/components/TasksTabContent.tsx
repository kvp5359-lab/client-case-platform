/**
 * Универсальное тело вкладки «Задачи» проекта.
 *
 * Единый источник для ДВУХ поверхностей:
 *  - полная страница проекта (ProjectTabsContent)
 *  - боковая панель проекта (TaskPanelProjectView)
 *
 * Любая доработка вкладки задач (например, блок «Заметки») делается ЗДЕСЬ —
 * и автоматически повторяется в боковой панели.
 *
 * Заметки гейтятся сами (по модулю project_context), чтобы вызывающему коду
 * не нужно было прокидывать `modules`.
 */

import { lazy, Suspense } from 'react'
import { TaskListView } from '@/components/tasks/TaskListView'
import { useProjectData } from '@/hooks/projects/useProjectData'
import { useProjectModules } from '@/hooks/projects/useProjectModules'

const ProjectContextTabContent = lazy(() =>
  import('./ProjectContextTabContent').then((m) => ({ default: m.ProjectContextTabContent })),
)

type TasksTabContentProps = {
  projectId: string
  workspaceId: string
  /** Пробрасывается в TaskListView (в панели колонка проекта скрыта). */
  showProject?: boolean
  showProjectLink?: boolean
}

export function TasksTabContent({
  projectId,
  workspaceId,
  showProject,
  showProjectLink,
}: TasksTabContentProps) {
  const { projectTemplate } = useProjectData(projectId)
  const { modules } = useProjectModules(projectId, workspaceId, projectTemplate)

  return (
    <div className="space-y-6">
      <TaskListView
        workspaceId={workspaceId}
        projectId={projectId}
        showProject={showProject}
        showProjectLink={showProjectLink}
      />
      {modules.projectContext && (
        <Suspense fallback={null}>
          <ProjectContextTabContent projectId={projectId} workspaceId={workspaceId} />
        </Suspense>
      )}
    </div>
  )
}
