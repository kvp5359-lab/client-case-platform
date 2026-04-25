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

import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { TaskPanel } from './TaskPanel'
import { TaskPanelTabBar, type SystemTabDef } from './TaskPanelTabBar'
import { PanelProjectInfoRow } from './PanelProjectInfoRow'
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
import { useInboxThreadsV2 } from '@/hooks/messenger/useInbox'
import { useProjectPermissions, useWorkspacePermissions } from '@/hooks/permissions'
import type { TaskItem } from './types'
import type { ProjectHeaderInfo } from './TaskPanel'
import type { TaskPanelTabType } from './taskPanelTabs.types'

const ExtraPanelContent = lazy(() =>
  import('@/components/extra-panel/ExtraPanelContent').then((m) => ({
    default: m.ExtraPanelContent,
  })),
)

/**
 * Видимость системных вкладок по правам пользователя.
 *
 * Возвращает Set типов системных вкладок, которые user может открывать.
 * Используется и для фильтрации [+] меню (нет смысла предлагать), и для
 * фильтрации UI бейджей (если user потерял доступ — не показываем вкладку).
 */
function usePanelTabsVisibility(workspaceId: string, projectId: string | null): Set<TaskPanelTabType> {
  const { hasModuleAccess } = useProjectPermissions({ projectId: projectId || '' })
  const { isClientOnly } = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  return useMemo(() => {
    const set = new Set<TaskPanelTabType>()
    if (projectId) {
      if (hasModuleAccess('tasks')) set.add('tasks')
      if (hasModuleAccess('history')) set.add('history')
      if (hasModuleAccess('documents')) set.add('documents')
      if (hasModuleAccess('forms')) set.add('forms')
      if (hasModuleAccess('knowledge_base')) set.add('materials')
      if (!isClientOnly) set.add('extra')
    }
    if (
      !projectId ||
      hasModuleAccess('ai_knowledge_all') ||
      hasModuleAccess('ai_knowledge_project') ||
      hasModuleAccess('ai_project_assistant')
    ) {
      set.add('assistant')
    }
    // 'thread' — отдельные треды, видимость определяется RLS / openThreadTab.
    return set
  }, [projectId, hasModuleAccess, isClientOnly])
}

/** Маппинг ProjectThread (из БД) → TaskItem (для TaskPanel и openThreadTab). */
function threadToTaskItem(
  thread: {
    id: string
    name: string
    type: 'task' | 'chat'
    project_id: string | null
    workspace_id: string
    status_id: string | null
    deadline: string | null
    accent_color: string
    icon: string
    is_pinned: boolean
    created_at: string
    sort_order: number | null
  },
): TaskItem {
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
    sort_order: thread.sort_order ?? 0,
  }
}

interface TaskPanelTabbedShellProps {
  workspaceId: string
  /**
   * projectId текущей страницы — стартовое значение «активного проекта».
   * При открытии треда/проекта другого projectId shell автоматически переключится
   * на его scope (вкладки per-project). На страницах без проекта (/boards, /inbox)
   * передаём null — projectId возьмётся из task.project_id первого открываемого треда.
   */
  pageProjectId: string | null
}

export interface TaskPanelTabbedShellApi {
  /** Открыть тред во вкладке (или активировать существующую). */
  openThreadTab: (task: TaskItem) => void
  /** Открыть «список задач проекта» во вкладке (Mode 2 старого TaskPanel). */
  openProjectTab: (project: ProjectHeaderInfo) => void
  /** Полный сброс: удалить все вкладки из БД. */
  closeAll: () => void
  /** Скрыть панель UI (вкладки в БД сохраняются). */
  hidePanel: () => void
  /** Показать панель (если есть вкладки — появятся; если нет — no-op). */
  showPanel: () => void
  /** Переключить hidden. */
  togglePanel: () => void
  /** Скрыта ли панель прямо сейчас (но вкладки есть). */
  isHidden: boolean
  /** Есть ли хотя бы одна вкладка. */
  hasTabs: boolean
  /** id треда из активной вкладки (для подсветки в BoardView и т.п.). */
  activeThreadId: string | null
  /** id проекта из активной вкладки (для подсветки проектов на досках). */
  activeProjectRefId: string | null
}

/**
 * Хук, возвращающий и API для внешнего открытия вкладок (для TaskPanelContext),
 * и сами рендер-методы для UI.
 *
 * activeProjectId — динамическое состояние scope. Меняется автоматически при
 * открытии треда/проекта другого projectId. При смене страницы проекта — синк
 * с pageProjectId.
 */
export function useTaskPanelTabbedShell({ workspaceId, pageProjectId }: TaskPanelTabbedShellProps) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(pageProjectId)
  // Hidden — UI-only флаг «панель скрыта». Не трогает вкладки в БД.
  // Сбрасывается на false при любом open*Tab (см. ниже).
  const [hidden, setHidden] = useState(false)
  // Синк с pageProjectId: переключаем scope ТОЛЬКО когда pageProjectId реально
  // изменился (пользователь перешёл на другой проект). Render-time pattern из
  // React docs (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [lastPageProjectId, setLastPageProjectId] = useState(pageProjectId)
  if (pageProjectId !== lastPageProjectId) {
    setLastPageProjectId(pageProjectId)
    if (pageProjectId) setActiveProjectId(pageProjectId)
  }

  const tabs = useTaskPanelTabs({ projectId: activeProjectId })

  // Очередь pending-вкладок: когда нужно сменить projectId перед openTab,
  // ждём готовности хука с новым projectId.
  const [pendingOpen, setPendingOpen] = useState<TaskPanelTab | null>(null)
  useEffect(() => {
    if (!pendingOpen) return
    if (!tabs.isReady) return
    tabs.openTab(pendingOpen)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- queue-processor: ждём готовности tabs, затем сбрасываем очередь
    setPendingOpen(null)
  }, [pendingOpen, tabs])

  const tabsOpenTab = tabs.openTab
  const openThreadTab = useCallback(
    (task: TaskItem) => {
      const targetPid = task.project_id ?? null
      const tab = buildThreadTab(task.id, task.name, {
        threadType: task.type,
        icon: task.icon,
        accentColor: task.accent_color,
      })
      // Открытие нового треда — гарантированно показываем панель.
      setHidden(false)
      if (targetPid !== activeProjectId) {
        setActiveProjectId(targetPid)
        setPendingOpen(tab)
      } else {
        tabsOpenTab(tab)
      }
    },
    [activeProjectId, tabsOpenTab],
  )

  const openProjectTab = useCallback(
    (project: ProjectHeaderInfo) => {
      const targetPid = project.id
      const tab: TaskPanelTab = {
        id: `tasks:${project.id}`,
        type: 'tasks',
        refId: project.id,
        // Заголовок «Задачи» (одинаковый для обоих путей: и из [+] меню, и из
        // клика на проект на доске). Имя проекта видно в шапке самой вкладки.
        title: 'Задачи',
      }
      setHidden(false)
      if (targetPid !== activeProjectId) {
        setActiveProjectId(targetPid)
        setPendingOpen(tab)
      } else {
        tabsOpenTab(tab)
      }
    },
    [activeProjectId, tabsOpenTab],
  )

  // Активный thread/project из текущей активной вкладки — для подсветки.
  const activeThreadId = tabs.activeTab?.type === 'thread' ? (tabs.activeTab.refId ?? null) : null
  const activeProjectRefId =
    tabs.activeTab?.type === 'tasks' ? (tabs.activeTab.refId ?? null) : null

  const hidePanel = useCallback(() => setHidden(true), [])
  const showPanel = useCallback(() => setHidden(false), [])
  const togglePanel = useCallback(() => setHidden((h) => !h), [])
  const hasTabs = tabs.tabs.length > 0

  const api: TaskPanelTabbedShellApi = useMemo(
    () => ({
      openThreadTab,
      openProjectTab,
      closeAll: tabs.closeAll,
      hidePanel,
      showPanel,
      togglePanel,
      isHidden: hidden,
      hasTabs,
      activeThreadId,
      activeProjectRefId,
    }),
    [
      openThreadTab,
      openProjectTab,
      tabs.closeAll,
      hidePanel,
      showPanel,
      togglePanel,
      hidden,
      hasTabs,
      activeThreadId,
      activeProjectRefId,
    ],
  )

  const onOpenSystemTab = useCallback(
    (def: SystemTabDef) => {
      // «Все задачи» — это всегда tasks-вкладка ТЕКУЩЕГО проекта (с refId).
      // Без refId её нечем рендерить — поэтому требуется активный projectId.
      if (def.type === 'tasks') {
        if (!activeProjectId) return
        tabsOpenTab({
          id: `tasks:${activeProjectId}`,
          type: 'tasks',
          refId: activeProjectId,
          title: def.title,
        })
        return
      }
      tabsOpenTab(buildSystemTab(def.type, def.title))
    },
    [tabsOpenTab, activeProjectId],
  )

  const shellElement = (
    <TaskPanelTabbedShellRenderer
      tabs={tabs.tabs}
      activeTab={tabs.activeTab}
      activeTabId={tabs.activeTabId}
      onActivate={tabs.activateTab}
      onCloseTab={tabs.closeTab}
      onOpenSystem={onOpenSystemTab}
      onOpenThreadTab={openThreadTab}
      onHidePanel={hidePanel}
      hidden={hidden}
      workspaceId={workspaceId}
      projectId={activeProjectId}
      pageProjectId={pageProjectId}
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
  onHidePanel: () => void
  hidden: boolean
  workspaceId: string
  /** Активный projectId scope-а вкладок. */
  projectId: string | null
  /** projectId страницы, на которой находится пользователь. */
  pageProjectId: string | null
}

function TaskPanelTabbedShellRenderer({
  tabs,
  activeTab,
  activeTabId,
  onActivate,
  onCloseTab,
  onOpenSystem,
  onOpenThreadTab,
  onHidePanel,
  hidden,
  workspaceId,
  projectId,
  pageProjectId,
}: RendererProps) {
  // Видимость системных вкладок по правам пользователя в текущем scope (project).
  const visibleSystemTypes = usePanelTabsVisibility(workspaceId, projectId)
  // Фильтруем уже открытые вкладки: если user потерял доступ к системному
  // разделу (например, перешёл в проект где модуля нет) — скрываем эту
  // вкладку из бара. Сама запись в БД остаётся: при переключении scope обратно
  // в проект где доступ есть — вкладка снова появится.
  const visibleTabs = useMemo(
    () =>
      tabs.filter((t) => {
        if (t.type === 'thread' || t.type === 'tasks') return true // RLS отрулит
        return visibleSystemTypes.has(t.type)
      }),
    [tabs, visibleSystemTypes],
  )
  // Карта непрочитанных по thread_id — для бейджей на thread-вкладках.
  const { data: inboxThreads = [] } = useInboxThreadsV2(workspaceId)
  const unreadByThreadId = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of inboxThreads) {
      const total = (t.unread_count ?? 0) + (t.unread_event_count ?? 0)
      if (total > 0 || t.has_unread_reaction || t.manually_unread) {
        map[t.thread_id] = total > 0 ? total : 1
      }
    }
    return map
  }, [inboxThreads])
  // Один persistent .side-panel контейнер. Анимация въезда срабатывает только
  // при первом появлении (tabs.length: 0 → >0). Переключение между вкладками
  // не размонтирует контейнер — меняется только содержимое.
  // hidden=true прячет панель UI, но не трогает вкладки в БД.
  const open = tabs.length > 0 && !hidden
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- сброс painted при закрытии панели; альтернатива (key-based remount) ломает анимацию
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

  const portalRoot = typeof document !== 'undefined' ? document.getElementById('workspace-panel-root') : null

  // Контент активной вкладки. Все рендереры возвращают «голое» содержимое
  // без обёртки .side-panel — обёртка живёт здесь и не размонтируется.
  // Если активная вкладка стала недоступной по правам — показываем заглушку.
  const activeTabAccessible =
    !activeTab ||
    activeTab.type === 'thread' ||
    activeTab.type === 'tasks' ||
    visibleSystemTypes.has(activeTab.type)
  let activeContent: React.ReactNode = null
  if (activeTab && !activeTabAccessible) {
    activeContent = (
      <div className="flex-1 flex items-center justify-center p-6 text-sm text-muted-foreground text-center">
        Нет доступа к этому разделу.
      </div>
    )
  } else if (activeTab) {
    if (activeTab.type === 'thread' && activeTab.refId) {
      activeContent = (
        <ThreadTabContent
          key={`thread:${activeTab.refId}`}
          threadId={activeTab.refId}
          workspaceId={workspaceId}
          onClose={onHidePanel}
        />
      )
    } else if (activeTab.type === 'tasks' && activeTab.refId) {
      activeContent = (
        <TasksTabContent
          key={`tasks:${activeTab.refId}`}
          projectId={activeTab.refId}
          workspaceId={workspaceId}
          onClose={onHidePanel}
          onOpenThreadInTab={onOpenThreadTab}
        />
      )
    } else {
      activeContent = (
        <SystemTabBody
          key={`sys:${activeTab.id}`}
          tab={activeTab}
          projectId={projectId}
          workspaceId={workspaceId}
          onOpenThread={onOpenThreadTab}
        />
      )
    }
  }

  const panel = (
    <div
      className={cn(
        'side-panel flex flex-col z-50',
        'transition-transform duration-200 ease-out',
        !open && 'hidden',
        visible ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {/* Строка 1: информация о проекте текущего scope + кнопка скрыть панель. */}
      <PanelProjectInfoRow
        projectId={projectId}
        workspaceId={workspaceId}
        pageProjectId={pageProjectId}
        onHidePanel={onHidePanel}
      />
      {/* Строка 2: ряд открытых вкладок + меню добавления.
          Учтена видимость по правам — недоступные системные вкладки
          скрываются из бара и из меню. */}
      <TaskPanelTabBar
        tabs={visibleTabs}
        activeTabId={activeTabId}
        onActivate={onActivate}
        onClose={onCloseTab}
        onOpenSystem={onOpenSystem}
        unreadByThreadId={unreadByThreadId}
        visibleSystemTypes={visibleSystemTypes}
      />
      {/* Строка 3+: содержимое активной вкладки (со своей шапкой). */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{activeContent}</div>
    </div>
  )

  if (!portalRoot) return panel
  return createPortal(panel, portalRoot)
}

// ─── Thread tab content (bare) ─────────────────────────────────

interface ThreadTabContentProps {
  threadId: string
  workspaceId: string
  onClose: () => void
}

function ThreadTabContent({ threadId, workspaceId, onClose }: ThreadTabContentProps) {
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

function TasksTabContent({ projectId, workspaceId, onClose, onOpenThreadInTab }: TasksTabContentProps) {
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

function SystemTabBody({ tab, projectId, workspaceId, onOpenThread }: SystemTabBodyProps) {
  // Заголовок-строка убрана — название уже видно в самой вкладке.
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

function LoadingBody() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
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
