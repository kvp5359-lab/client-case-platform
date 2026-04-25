"use client"

/**
 * Содержимое вкладок панели Threada.
 * Вынесено из TaskPanelTabbedShell.tsx — изолированные under-the-tab компоненты
 * без общего замыкания с orchestrator.
 */

import { useMemo, lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { TaskPanel } from './TaskPanel'
import type { ProjectHeaderInfo } from './TaskPanel'
import { threadToTaskItem } from './threadToTaskItem'
import type { TaskItem } from './types'
import type { TaskPanelTab } from './taskPanelTabs.types'
import { useProjectThreadById, useProjectThreads } from '@/hooks/messenger/useProjectThreads'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useTaskAssigneesMap } from './useTaskAssignees'
import {
  useUpdateTaskStatus,
  useUpdateTaskDeadline,
  useRenameTask,
  useUpdateTaskSettings,
} from './useTaskMutations'
import { workspaceThreadKeys, projectKeys, STALE_TIME } from '@/hooks/queryKeys'
import { getProjectById } from '@/services/api/projectService'
import { AiPanelContent } from '@/components/ai-panel'
import { PanelDocumentsContent } from '@/components/documents/PanelDocumentsContent'
import { AllHistoryContent } from '@/components/history/AllHistoryContent'
import { useAuth } from '@/contexts/AuthContext'

const ExtraPanelContent = lazy(() =>
  import('@/components/extra-panel/ExtraPanelContent').then((m) => ({
    default: m.ExtraPanelContent,
  })),
)

export function LoadingBody() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  )
}

// ─── Thread tab content (bare) ─────────────────────────────────

interface ThreadTabContentProps {
  threadId: string
  workspaceId: string
  onClose: () => void
}

export function ThreadTabContent({ threadId, workspaceId, onClose }: ThreadTabContentProps) {
  const { data: thread, isLoading, isFetched } = useProjectThreadById(threadId, true)

  const task: TaskItem | null = useMemo(
    () => (thread ? threadToTaskItem(thread) : null),
    [thread],
  )

  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)
  const threadIds = useMemo(() => (task ? [task.id] : []), [task])
  const { data: membersMap = {} } = useTaskAssigneesMap(threadIds)
  const invalidateKeys = useMemo(
    () => [workspaceThreadKeys.workspace(workspaceId)],
    [workspaceId],
  )
  const updateStatus = useUpdateTaskStatus(invalidateKeys)
  const updateDeadline = useUpdateTaskDeadline(invalidateKeys)
  const renameTask = useRenameTask(invalidateKeys)
  const updateSettings = useUpdateTaskSettings(invalidateKeys)

  // Тред не найден после загрузки — либо удалён, либо RLS не пускает
  // (нет доступа к проекту/треду). Показываем заглушку.
  if (!task && isFetched && !isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-2 text-sm text-muted-foreground text-center">
        <div>Тред недоступен или удалён.</div>
      </div>
    )
  }
  if (!task) return <LoadingBody />

  return (
    <TaskPanel
      bare
      stackTop={{ kind: 'task', task }}
      open
      onClose={onClose}
      workspaceId={workspaceId}
      statuses={taskStatuses}
      members={membersMap[task.id] ?? []}
      onStatusChange={(statusId) => updateStatus.mutate({ threadId: task.id, statusId })}
      onDeadlineSet={(d) => updateDeadline.mutate({ threadId: task.id, deadline: d.toISOString() })}
      onDeadlineClear={() => updateDeadline.mutate({ threadId: task.id, deadline: null })}
      onRename={(name) => renameTask.mutate({ threadId: task.id, name })}
      onSettingsSave={(p) => updateSettings.mutate({ threadId: task.id, ...p })}
      deadlinePending={updateDeadline.isPending}
      settingsPending={updateSettings.isPending}
      showProjectLink
    />
  )
}

// ─── Tasks tab content (bare) ───────────────────────────────────

interface TasksTabContentProps {
  projectId: string
  workspaceId: string
  onClose: () => void
  onOpenThreadInTab: (task: TaskItem) => void
}

export function TasksTabContent({
  projectId,
  workspaceId,
  onClose,
  onOpenThreadInTab,
}: TasksTabContentProps) {
  const { data: project, isLoading, isFetched, error } = useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => getProjectById(projectId),
    staleTime: STALE_TIME.MEDIUM,
    retry: false,
  })

  const projectInfo: ProjectHeaderInfo | null = useMemo(() => {
    if (!project) return null
    return {
      id: project.id,
      name: project.name,
      created_at: project.created_at ?? null,
      description: project.description ?? null,
    }
  }, [project])

  if (!projectInfo) {
    if ((isFetched && !isLoading) || error) {
      return (
        <div className="flex-1 flex items-center justify-center p-6 text-sm text-muted-foreground text-center">
          Проект недоступен или удалён.
        </div>
      )
    }
    return <LoadingBody />
  }

  return (
    <TaskPanel
      bare
      stackTop={{ kind: 'project', project: projectInfo }}
      open
      onClose={onClose}
      workspaceId={workspaceId}
      onRename={() => {}}
      onSettingsSave={() => {}}
      settingsPending={false}
      onOpenThreadInStack={onOpenThreadInTab}
    />
  )
}

// ─── System tab body (bare) ─────────────────────────────────────

interface SystemTabBodyProps {
  tab: TaskPanelTab
  projectId: string | null
  workspaceId: string
  onOpenThread: (task: TaskItem) => void
}

export function SystemTabBody({ tab, projectId, workspaceId, onOpenThread }: SystemTabBodyProps) {
  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="flex-1 min-h-0 overflow-hidden">
        <SystemTabContent
          tab={tab}
          projectId={projectId}
          workspaceId={workspaceId}
          onOpenThread={onOpenThread}
        />
      </div>
    </div>
  )
}

// ─── System tab content dispatcher ─────────────────────────────

interface SystemTabContentProps {
  tab: TaskPanelTab
  projectId: string | null
  workspaceId: string
  onOpenThread: (task: TaskItem) => void
}

function SystemTabContent({ tab, projectId, workspaceId, onOpenThread }: SystemTabContentProps) {
  const { user } = useAuth()
  const { data: projectThreads = [] } = useProjectThreads(projectId ?? undefined)

  if (!projectId) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Откройте проект, чтобы пользоваться этим разделом.
      </div>
    )
  }

  switch (tab.type) {
    case 'history':
      return (
        <AllHistoryContent
          projectId={projectId}
          workspaceId={workspaceId}
          threads={projectThreads}
          currentUserId={user?.id}
          onOpenChat={(threadId) => {
            const t = projectThreads.find((x) => x.id === threadId)
            if (!t) return
            onOpenThread(threadToTaskItem(t))
          }}
        />
      )
    case 'documents':
      return <PanelDocumentsContent projectId={projectId} workspaceId={workspaceId} />
    case 'assistant':
      return <AiPanelContent workspaceId={workspaceId} projectId={projectId} />
    case 'extra':
      return (
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <ExtraPanelContent projectId={projectId} workspaceId={workspaceId} />
        </Suspense>
      )
    case 'forms':
      return (
        <div className="p-4 text-sm text-muted-foreground">
          Анкеты в боковой панели — в разработке. Пока пользуйтесь вкладкой «Анкеты» на главной странице проекта.
        </div>
      )
    case 'materials':
      return (
        <div className="p-4 text-sm text-muted-foreground">
          Полезные материалы в боковой панели — в разработке.
        </div>
      )
    default:
      return null
  }
}
