"use client"

/**
 * WorkspaceLayout — layout с sidebar и правой панелью
 */

import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense, createContext, useContext } from 'react'
import { useParams } from 'next/navigation'
import { Menu, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WorkspaceSidebarFull } from './WorkspaceSidebarFull'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { AiPanelContent } from '@/components/ai-panel'
import { PanelTabs } from './PanelTabs'
import { FloatingPanelButtons } from './FloatingPanelButtons'
import { MessengerPanelContent } from './MessengerPanelContent'
import { ChatSettingsSection } from './ChatSettingsSection'
import { useProjectPermissions, useWorkspacePermissions } from '@/hooks/permissions'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { ThreadTemplate } from '@/types/threadTemplate'
import { useNewMessageToast } from '@/hooks/messenger/useNewMessageToast'
import { useFaviconBadge } from '@/hooks/messenger/useFaviconBadge'
import { useWorkspaceMessagesRealtime } from '@/hooks/messenger/useWorkspaceMessagesRealtime'
import { TaskPanel } from '@/components/tasks/TaskPanel'
import { useTaskPanelSetup } from '@/components/tasks/useTaskPanelSetup'
import { TaskPanelContext, setGlobalOpenThread } from '@/components/tasks/TaskPanelContext'
import { newThreadToTaskItem } from '@/components/tasks/taskListConstants'
import { useScrollIntoViewOnPanel } from '@/hooks/shared/useScrollIntoViewOnPanel'

const ExtraPanelContent = lazy(() =>
  import('@/components/extra-panel/ExtraPanelContent').then((m) => ({
    default: m.ExtraPanelContent,
  })),
)

const PANEL_DEFAULT_WIDTH = '45%'

/**
 * Контекст «shell уже выше по дереву». Устанавливается в Next.js layout —
 * тогда внутренние <WorkspaceLayout> в page-components работают как no-op
 * passthrough, чтобы не размонтировать сайдбар при смене проекта.
 */
const WorkspaceShellContext = createContext<boolean>(false)

interface WorkspaceLayoutProps {
  children: React.ReactNode
  workspaceId?: string
}

export function WorkspaceLayout({ children, workspaceId: propWorkspaceId }: WorkspaceLayoutProps) {
  const hasShellAbove = useContext(WorkspaceShellContext)
  // Если shell уже есть в дереве выше — просто пропускаем children дальше.
  // Это позволяет страницам продолжать оборачивать свой контент в <WorkspaceLayout>,
  // но между переходами сайдбар живёт в Next.js layout и не перемонтируется.
  if (hasShellAbove) {
    return <>{children}</>
  }

  return <WorkspaceLayoutImpl workspaceId={propWorkspaceId}>{children}</WorkspaceLayoutImpl>
}

/**
 * Shell-обёртка для использования в Next.js layout.tsx.
 * Рендерит сайдбар, правую панель, диалоги — всё, кроме children area.
 * Дочерние WorkspaceLayout через контекст станут no-op.
 */
export function WorkspaceLayoutShell({ children, workspaceId: propWorkspaceId }: WorkspaceLayoutProps) {
  return (
    <WorkspaceShellContext.Provider value={true}>
      <WorkspaceLayoutImpl workspaceId={propWorkspaceId}>{children}</WorkspaceLayoutImpl>
    </WorkspaceShellContext.Provider>
  )
}

function WorkspaceLayoutImpl({ children, workspaceId: propWorkspaceId }: WorkspaceLayoutProps) {
  const params = useParams<{ workspaceId?: string }>()
  const workspaceId = propWorkspaceId || params.workspaceId || ''

  const [mobileOpen, setMobileOpen] = useState(false)

  // Side Panel
  const panelTab = useSidePanelStore((s) => s.panelTab)
  const pageContext = useSidePanelStore((s) => s.pageContext)
  const openPanel = useSidePanelStore((s) => s.openPanel)
  const setContext = useSidePanelStore((s) => s.setContext)
  const messengerEnabled = useSidePanelStore((s) => s.chatsEnabled)
  const panelOpen = panelTab !== null

  // Sync workspaceId in store
  useEffect(() => {
    if (workspaceId) {
      setContext({ workspaceId })
    }
  }, [workspaceId, setContext])

  // data-panel-open for toast positioning
  useEffect(() => {
    if (panelOpen) {
      document.body.setAttribute('data-panel-open', '')
    } else {
      document.body.removeAttribute('data-panel-open')
    }
    return () => document.body.removeAttribute('data-panel-open')
  }, [panelOpen])

  // Горячая клавиша Cmd+Shift+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'k') {
        e.preventDefault()
        useSidePanelStore.getState().togglePanel('assistant')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Доступные вкладки панели
  const hasProject = !!pageContext.projectId
  const showMessenger = hasProject && messengerEnabled

  const { hasModuleAccess } = useProjectPermissions({ projectId: pageContext.projectId ?? '' })
  const showAssistant =
    !hasProject ||
    hasModuleAccess('ai_knowledge_all') ||
    hasModuleAccess('ai_knowledge_project') ||
    hasModuleAccess('ai_project_assistant')

  const { isClientOnly } = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const showExtra = hasProject && !isClientOnly

  // Единая workspace-level Realtime-подписка на project_messages/message_reactions.
  // Один WebSocket-канал вместо 4+ дублей в сайдбаре/useInbox/useNewMessageToast.
  useWorkspaceMessagesRealtime(workspaceId)

  // Toast уведомления и favicon badge
  useNewMessageToast(workspaceId)
  useFaviconBadge(workspaceId)

  // Чат-диалог (создание/редактирование)
  const activeChatId = useSidePanelStore((s) => s.activeChatId)
  const openChatFromStore = useSidePanelStore((s) => s.openChat)
  const [settingsChat, setSettingsChat] = useState<ProjectThread | null | undefined>(null)
  const [defaultTab, setDefaultTab] = useState<'task' | 'chat' | 'email'>('chat')
  const [initialTemplate, setInitialTemplate] = useState<ThreadTemplate | null>(null)
  const settingsOpen = settingsChat !== null

  // TaskPanel. Деструктурируем нужные методы из tp, чтобы
  // линтер не требовал весь объект tp в deps memo/эффектов (он новый на каждом рендере).
  const tp = useTaskPanelSetup({ workspaceId })
  const {
    setOpenThread: tpSetOpenThread,
    pushThread: tpPushThread,
    openProjectTasks: tpOpenProject,
    pushProject: tpPushProject,
  } = tp
  const taskPanelCtx = useMemo(
    () => ({
      openThread: tpSetOpenThread,
      pushThread: tpPushThread,
      openProject: tpOpenProject,
      pushProject: tpPushProject,
      closeThread: () => tpSetOpenThread(null),
    }),
    [tpSetOpenThread, tpPushThread, tpOpenProject, tpPushProject],
  )

  // Глобальный ref для открытия TaskPanel из хуков вне React-дерева
  useEffect(() => {
    setGlobalOpenThread(tpSetOpenThread)
    return () => setGlobalOpenThread(null)
  }, [tpSetOpenThread])

  // Авто-скролл кликнутого элемента из-под открывающейся боковой панели.
  // DOM-driven: хук сам наблюдает за появлением `.side-panel` в любом месте
  // дерева (основная sidePanel, layout-уровневая TaskPanel, локальная TaskPanel
  // внутри BoardsPage — все они рендерятся с классом `.side-panel`).
  useScrollIntoViewOnPanel()

  // При смене проекта закрываем TaskPanel, если открытый элемент (тред или
  // проект в Режиме 2) относится к другому проекту. Реагируем только на
  // ИЗМЕНЕНИЕ projectId: тост нового сообщения может открыть тред из другого
  // проекта без навигации — такую панель закрывать нельзя.
  const currentProjectId = pageContext.projectId ?? null
  const prevProjectIdRef = useRef(currentProjectId)
  const setOpenThread = tp.setOpenThread
  useEffect(() => {
    const prev = prevProjectIdRef.current
    prevProjectIdRef.current = currentProjectId
    if (prev === currentProjectId) return
    const openTask = tp.openThread
    const openProject = tp.openProject
    if (openTask) {
      const openTaskProjectId = openTask.project_id ?? null
      if (openTaskProjectId === null || openTaskProjectId !== currentProjectId) {
        setOpenThread(null)
      }
    } else if (openProject) {
      if (openProject.id !== currentProjectId) {
        setOpenThread(null)
      }
    }
    // tp.openThread/openProject читаем без подписки — эффект должен срабатывать
    // только на смену projectId, иначе открытие панели тут же её и закроет.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, setOpenThread])

  const handleSelectChat = useCallback(
    (chat: ProjectThread) => {
      const channel = chat.legacy_channel ?? 'client'
      openChatFromStore(chat.id, channel as 'client' | 'internal')
    },
    [openChatFromStore],
  )

  return (
    <TaskPanelContext.Provider value={taskPanelCtx}>
    <div className="flex h-screen bg-background relative">
      {/* Мобильная кнопка меню */}
      <button
        className="fixed top-3 left-3 z-50 md:hidden p-2 rounded-md bg-background border"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 md:relative md:z-auto',
          'transition-transform duration-200 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <WorkspaceSidebarFull workspaceId={workspaceId} />
      </div>

      {/* Overlay для мобильных */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content + right panel */}
      <div id="workspace-panel-root" className="flex-1 flex min-w-0 relative overflow-hidden">
        {/* Main content */}
        <main
          className="flex-1 overflow-auto"
          style={panelOpen ? { marginRight: PANEL_DEFAULT_WIDTH } : undefined}
        >
          {children}
        </main>

        {/* Правая панель */}
        <div
          className={cn(
            'side-panel flex flex-col z-20',
            !panelOpen && 'hidden',
          )}
        >
          {panelOpen && (
            <div className="flex flex-col h-full min-w-0">
              {/* Шапка с вкладками */}
              <div className="flex items-center px-3 py-2 border-b bg-gray-50/80 shrink-0">
                <PanelTabs
                  activeTab={panelTab}
                  onTabChange={openPanel}
                  showMessenger={showMessenger}
                  showAssistant={showAssistant}
                  showExtra={showExtra}
                  projectId={pageContext.projectId}
                  workspaceId={workspaceId}
                />
              </div>

              {/* Контент панели */}
              <div className="flex-1 min-h-0">
                {(panelTab === 'client' || panelTab === 'internal') &&
                  pageContext.projectId &&
                  pageContext.workspaceId && (
                    <MessengerPanelContent
                      projectId={pageContext.projectId}
                      workspaceId={pageContext.workspaceId}
                      overrideChatId={activeChatId ?? undefined}
                      onSelectChat={handleSelectChat}
                      onCreateChat={(tab, template) => {
                        setDefaultTab(tab ?? 'chat')
                        setInitialTemplate(template ?? null)
                        setSettingsChat(undefined)
                      }}
                      onEditChat={(chat) => setSettingsChat(chat)}
                    />
                  )}
                {panelTab === 'assistant' && workspaceId && (
                  <AiPanelContent
                    workspaceId={workspaceId}
                    projectId={pageContext.projectId}
                    templateId={pageContext.templateId}
                  />
                )}
                {panelTab === 'extra' && pageContext.projectId && workspaceId && (
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    }
                  >
                    <ExtraPanelContent
                      projectId={pageContext.projectId}
                      workspaceId={workspaceId}
                    />
                  </Suspense>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Плавающие кнопки */}
      <FloatingPanelButtons />

      {/* TaskPanel — боковая панель треда после создания */}
      <TaskPanel {...tp.taskPanelProps} showProjectLink />

      {/* Диалог создания/редактирования чата. Монтируется только когда открыт —
          тогда и грузится chunk с Tiptap и остальной обвязкой. */}
      {pageContext.projectId && settingsOpen && (
        <Suspense fallback={null}>
          <ChatSettingsSection
            projectId={pageContext.projectId}
            workspaceId={pageContext.workspaceId ?? workspaceId}
            settingsChat={settingsChat}
            settingsOpen={settingsOpen}
            defaultTab={defaultTab}
            initialTemplate={initialTemplate}
            onClose={() => {
              setSettingsChat(null)
              setInitialTemplate(null)
            }}
            onCreated={(newChat, result) => {
              setSettingsChat(null)
              tp.setOpenThread(newThreadToTaskItem(newChat, result))
            }}
          />
        </Suspense>
      )}
    </div>
    </TaskPanelContext.Provider>
  )
}

