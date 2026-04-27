"use client"

/**
 * WorkspaceLayout — layout с sidebar и правой панелью.
 *
 * Правая панель — единая система вкладок треда (TaskPanelTabbedShell),
 * привязанная к layout-уровню через TaskPanelContext. Старая «основная»
 * правая панель (PanelTabs / MessengerPanelContent) удалена и архивирована
 * в `_archive/legacy-side-panel/`.
 */

import { useState, useEffect, useMemo, createContext, useContext } from 'react'
import { useParams } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WorkspaceSidebarFull } from './WorkspaceSidebarFull'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { FloatingPanelButtons } from './FloatingPanelButtons'
import { useNewMessageToast } from '@/hooks/messenger/useNewMessageToast'
import { useFaviconBadge } from '@/hooks/messenger/useFaviconBadge'
import { useWorkspaceMessagesRealtime } from '@/hooks/messenger/useWorkspaceMessagesRealtime'
import { useQueryClient } from '@tanstack/react-query'
import { messengerKeys } from '@/hooks/queryKeys'
import { useTaskPanelTabbedShell } from '@/components/tasks/TaskPanelTabbedShell'
import { TaskPanelContext, setGlobalOpenThread } from '@/components/tasks/TaskPanelContext'
import { useScrollIntoViewOnPanel } from '@/hooks/shared/useScrollIntoViewOnPanel'

const PANEL_DEFAULT_WIDTH = '50%'

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
  if (hasShellAbove) {
    return <>{children}</>
  }
  return <WorkspaceLayoutImpl workspaceId={propWorkspaceId}>{children}</WorkspaceLayoutImpl>
}

/** Shell-обёртка для использования в Next.js layout.tsx. */
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

  // pageContext.projectId — нужен для синка scope вкладок с текущей страницей.
  // Сам стор используется ещё для chatsEnabled (из ProjectPage), activeChatId
  // (диалог создания чата), pageContext.templateId (старая Ai-панель — здесь
  // больше не нужно, оставлено в сторе для других мест).
  const pageContext = useSidePanelStore((s) => s.pageContext)
  const setContext = useSidePanelStore((s) => s.setContext)

  // Sync workspaceId in store
  useEffect(() => {
    if (workspaceId) {
      setContext({ workspaceId })
    }
  }, [workspaceId, setContext])

  // Единая workspace-level Realtime-подписка на project_messages/message_reactions.
  useWorkspaceMessagesRealtime(workspaceId)

  // Toast уведомления и favicon badge
  useNewMessageToast(workspaceId)
  useFaviconBadge(workspaceId)

  // Когда сеть возвращается — рефетчим всё мессенджерное, чтобы подтянуть
  // актуальный telegram_message_id для сообщений, отправленных в офлайне.
  const queryClient = useQueryClient()
  useEffect(() => {
    const onOnline = () => {
      queryClient.invalidateQueries({ queryKey: messengerKeys.all })
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [queryClient])

  // Layout-уровневая система вкладок треда (per-user-per-project, DB-backed).
  const taskPanelShell = useTaskPanelTabbedShell({
    workspaceId,
    pageProjectId: pageContext.projectId ?? null,
  })
  const {
    openThreadTab,
    openProjectTab,
    closeAll: closeAllTabs,
    hidePanel,
    showPanel,
    togglePanel,
    isHidden,
    hasTabs,
    activeThreadId,
    activeProjectRefId,
  } = taskPanelShell.api

  const taskPanelCtx = useMemo(
    () => ({
      openThread: openThreadTab,
      pushThread: openThreadTab,
      openProject: openProjectTab,
      pushProject: openProjectTab,
      closeThread: closeAllTabs,
      hidePanel,
      showPanel,
      togglePanel,
      isHidden,
      hasTabs,
      activeThreadId,
      activeProjectId: activeProjectRefId,
    }),
    [
      openThreadTab,
      openProjectTab,
      closeAllTabs,
      hidePanel,
      showPanel,
      togglePanel,
      isHidden,
      hasTabs,
      activeThreadId,
      activeProjectRefId,
    ],
  )

  // Глобальный ref для открытия TaskPanel из хуков вне React-дерева
  // (toast уведомления, sidebar бейджи и т.п.).
  useEffect(() => {
    setGlobalOpenThread(openThreadTab)
    return () => setGlobalOpenThread(null)
  }, [openThreadTab])

  // Авто-скролл кликнутого элемента из-под открывающейся боковой панели.
  useScrollIntoViewOnPanel()

  // panel-open marker для тоастов / отступа основного контента.
  const panelVisible = hasTabs && !isHidden
  useEffect(() => {
    if (panelVisible) document.body.setAttribute('data-panel-open', '')
    else document.body.removeAttribute('data-panel-open')
    return () => document.body.removeAttribute('data-panel-open')
  }, [panelVisible])

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

        {/* Main content + right panel root (портал для shell) */}
        <div id="workspace-panel-root" className="flex-1 flex min-w-0 relative overflow-hidden">
          <main
            className="flex-1 overflow-y-auto overflow-x-hidden"
            style={panelVisible ? { marginRight: PANEL_DEFAULT_WIDTH } : undefined}
          >
            {children}
          </main>
        </div>

        {/* Плавающая кнопка (показ скрытой панели) */}
        <FloatingPanelButtons />

        {/* TaskPanel — система вкладок (через portal в #workspace-panel-root) */}
        {taskPanelShell.shellElement}
      </div>
    </TaskPanelContext.Provider>
  )
}
