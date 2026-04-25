"use client"

/**
 * TaskPanelTabbedShell — обёртка над TaskPanel с системой вкладок.
 *
 * Заменяет в WorkspaceLayout прямое использование <TaskPanel> + useTaskPanelSetup.
 * Управляет набором открытых вкладок (per-user-per-project, DB-backed) и сверху
 * каждой панели рендерит TaskPanelTabBar.
 *
 * Маршрутизация контента вкладки:
 *  - thread → существующий TaskPanel в режиме треда (с TabBar в topSlot)
 *  - tasks  → существующий TaskPanel в режиме проекта (Mode 2) с TabBar в topSlot
 *  - history/documents/assistant/extra/forms/materials → собственный shell + контент
 *
 * Старая «основная» правая панель проекта в WorkspaceLayout продолжает работать
 * параллельно — её мы не трогаем до подтверждения, что новая обкатана.
 */

import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { TaskPanel } from './TaskPanel'
import { TaskPanelTabBar, type SystemTabDef } from './TaskPanelTabBar'
import {
  useTaskPanelTabs,
  buildSystemTab,
  buildThreadTab,
} from './useTaskPanelTabs'
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
import type { TaskItem } from './types'
import type { ProjectHeaderInfo } from './TaskPanel'

const ExtraPanelContent = lazy(() =>
  import('@/components/extra-panel/ExtraPanelContent').then((m) => ({
    default: m.ExtraPanelContent,
  })),
)

interface TaskPanelTabbedShellProps {
  workspaceId: string
  /** projectId текущей страницы — определяет, для какого проекта грузим/пишем вкладки. */
  projectId: string | null
}

export interface TaskPanelTabbedShellApi {
  /** Открыть тред во вкладке (или активировать существующую). */
  openThreadTab: (task: TaskItem) => void
  /** Открыть «список задач проекта» во вкладке (Mode 2 старого TaskPanel). */
  openProjectTab: (project: ProjectHeaderInfo) => void
  /** Закрыть всё. */
  closeAll: () => void
}

/**
 * Хук, возвращающий и API для внешнего открытия вкладок (для TaskPanelContext),
 * и сами рендер-методы для UI. Чтобы родитель мог одновременно прокидывать API
 * через контекст и рендерить shell.
 */
export function useTaskPanelTabbedShell({ workspaceId, projectId }: TaskPanelTabbedShellProps) {
  const tabs = useTaskPanelTabs({ projectId })

  const openThreadTab = useCallback(
    (task: TaskItem) => {
      tabs.openTab(buildThreadTab(task.id, task.name))
    },
    [tabs],
  )

  const openProjectTab = useCallback(
    (project: ProjectHeaderInfo) => {
      // Проект-в-панели = вкладка «Все задачи». Используем системную вкладку 'tasks'.
      // refId = projectId, чтобы знать, какой проект показывать.
      tabs.openTab({ id: `tasks:${project.id}`, type: 'tasks', refId: project.id, title: project.name })
    },
    [tabs],
  )

  const api: TaskPanelTabbedShellApi = useMemo(
    () => ({ openThreadTab, openProjectTab, closeAll: tabs.closeAll }),
    [openThreadTab, openProjectTab, tabs.closeAll],
  )

  const shellElement = (
    <TaskPanelTabbedShellRenderer
      tabs={tabs.tabs}
      activeTab={tabs.activeTab}
      activeTabId={tabs.activeTabId}
      onActivate={tabs.activateTab}
      onCloseTab={tabs.closeTab}
      onOpenSystem={(def: SystemTabDef) => tabs.openTab(buildSystemTab(def.type, def.title))}
      onOpenThreadTab={openThreadTab}
      onCloseAll={tabs.closeAll}
      workspaceId={workspaceId}
      projectId={projectId}
    />
  )

  return { api, shellElement, hasOpenTabs: tabs.tabs.length > 0 }
}

interface RendererProps {
  tabs: TaskPanelTab[]
  activeTab: TaskPanelTab | null
  activeTabId: string | null
  onActivate: (id: string) => void
  onCloseTab: (id: string) => void
  onOpenSystem: (def: SystemTabDef) => void
  onOpenThreadTab: (task: TaskItem) => void
  onCloseAll: () => void
  workspaceId: string
  projectId: string | null
}

function TaskPanelTabbedShellRenderer({
  tabs,
  activeTab,
  activeTabId,
  onActivate,
  onCloseTab,
  onOpenSystem,
  onOpenThreadTab,
  onCloseAll,
  workspaceId,
  projectId,
}: RendererProps) {
  // Анимация въезда
  const open = tabs.length > 0
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    if (!open) {
      setPainted(false)
      return
    }
    const id = requestAnimationFrame(() => setPainted(true))
    document.body.setAttribute('data-task-panel-open', '')
    return () => {
      cancelAnimationFrame(id)
      document.body.removeAttribute('data-task-panel-open')
    }
  }, [open])
  const visible = open && painted

  if (!open || !activeTab) return null

  const tabBar = (
    <TaskPanelTabBar
      tabs={tabs}
      activeTabId={activeTabId}
      onActivate={onActivate}
      onClose={onCloseTab}
      onOpenSystem={onOpenSystem}
    />
  )

  // Thread / tasks вкладки рендерим через существующий TaskPanel (с topSlot=tabBar).
  if (activeTab.type === 'thread' && activeTab.refId) {
    return (
      <ThreadTabRenderer
        threadId={activeTab.refId}
        workspaceId={workspaceId}
        topSlot={tabBar}
        onClose={onCloseAll}
      />
    )
  }

  if (activeTab.type === 'tasks' && activeTab.refId) {
    return (
      <TasksTabRenderer
        projectId={activeTab.refId}
        workspaceId={workspaceId}
        topSlot={tabBar}
        onClose={onCloseAll}
        onOpenThreadInTab={onOpenThreadTab}
      />
    )
  }

  // Системные вкладки — собственный shell.
  return (
    <SystemTabShell
      visible={visible}
      title={activeTab.title}
      onCloseAll={onCloseAll}
      topSlot={tabBar}
    >
      <SystemTabContent
        tab={activeTab}
        projectId={projectId}
        workspaceId={workspaceId}
        onOpenThread={onOpenThreadTab}
      />
    </SystemTabShell>
  )
}

// ─── Thread tab ────────────────────────────────────────────────

interface ThreadTabRendererProps {
  threadId: string
  workspaceId: string
  topSlot: React.ReactNode
  onClose: () => void
}

function ThreadTabRenderer({ threadId, workspaceId, topSlot, onClose }: ThreadTabRendererProps) {
  const { data: thread } = useProjectThreadById(threadId, true)

  const task: TaskItem | null = useMemo(() => {
    if (!thread) return null
    return {
      id: thread.id,
      name: thread.name,
      type: thread.type,
      project_id: thread.project_id,
      workspace_id: thread.workspace_id,
      status_id: thread.status_id,
      deadline: thread.deadline,
      accent_color: thread.accent_color,
      icon: thread.icon,
      is_pinned: thread.is_pinned,
      created_at: thread.created_at,
      sort_order: thread.sort_order,
    }
  }, [thread])

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

  if (!task) {
    // пока нет данных — рендерим пустой shell с tabBar, чтобы не моргать
    return <LoadingShell topSlot={topSlot} onClose={onClose} />
  }

  return (
    <TaskPanel
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
      topSlot={topSlot}
      showProjectLink
    />
  )
}

// ─── Tasks tab (project list) ───────────────────────────────────

interface TasksTabRendererProps {
  projectId: string
  workspaceId: string
  topSlot: React.ReactNode
  onClose: () => void
  onOpenThreadInTab: (task: TaskItem) => void
}

function TasksTabRenderer({ projectId, workspaceId, topSlot, onClose, onOpenThreadInTab }: TasksTabRendererProps) {
  const { data: project } = useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => getProjectById(projectId),
    staleTime: STALE_TIME.MEDIUM,
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
    return <LoadingShell topSlot={topSlot} onClose={onClose} />
  }

  return (
    <TaskPanel
      stackTop={{ kind: 'project', project: projectInfo }}
      open
      onClose={onClose}
      workspaceId={workspaceId}
      onRename={() => {}}
      onSettingsSave={() => {}}
      settingsPending={false}
      onOpenThreadInStack={onOpenThreadInTab}
      topSlot={topSlot}
    />
  )
}

// ─── System tab shell ──────────────────────────────────────────

interface SystemTabShellProps {
  visible: boolean
  title: string
  onCloseAll: () => void
  topSlot: React.ReactNode
  children: React.ReactNode
}

function SystemTabShell({ visible, title, onCloseAll, topSlot, children }: SystemTabShellProps) {
  const portalRoot = typeof document !== 'undefined' ? document.getElementById('workspace-panel-root') : null
  const panel = (
    <div
      className={cn(
        'side-panel flex flex-col z-50',
        'transition-transform duration-200 ease-out',
        visible ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {topSlot}
      <div className="flex items-center justify-between px-4 h-[40px] border-b shrink-0 bg-white">
        <div className="text-sm font-medium truncate">{title}</div>
        <button
          type="button"
          onClick={onCloseAll}
          className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-gray-100 hover:text-foreground"
          aria-label="Закрыть панель"
          title="Закрыть панель"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  )
  return portalRoot ? createPortal(panel, portalRoot) : panel
}

function LoadingShell({ topSlot, onClose }: { topSlot: React.ReactNode; onClose: () => void }) {
  const portalRoot = typeof document !== 'undefined' ? document.getElementById('workspace-panel-root') : null
  const panel = (
    <div className="side-panel flex flex-col z-50">
      {topSlot}
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
      <button onClick={onClose} className="hidden">close</button>
    </div>
  )
  return portalRoot ? createPortal(panel, portalRoot) : panel
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
            onOpenThread({
              id: t.id,
              name: t.name,
              type: t.type,
              project_id: t.project_id,
              workspace_id: t.workspace_id,
              status_id: t.status_id,
              deadline: t.deadline,
              accent_color: t.accent_color,
              icon: t.icon,
              is_pinned: t.is_pinned,
              created_at: t.created_at,
              sort_order: t.sort_order,
            })
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
