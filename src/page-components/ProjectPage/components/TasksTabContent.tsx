/**
 * Вкладка «Задачи» внутри проекта — обёртка над TaskListView с фильтром по проекту.
 */

import { TaskListView } from '@/components/tasks/TaskListView'

interface TasksTabContentProps {
  projectId: string
  workspaceId: string
}

export function TasksTabContent({ projectId, workspaceId }: TasksTabContentProps) {
  return <TaskListView workspaceId={workspaceId} projectId={projectId} />
}
