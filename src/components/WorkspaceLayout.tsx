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
import { useParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LimitWarningBanner } from '@/components/workspace/LimitWarningBanner'
import { WorkspaceSidebarFull } from './WorkspaceSidebarFull'
import { MobileBottomNav } from './WorkspaceSidebar/MobileBottomNav'
import { useSidebarCollapsed } from './WorkspaceSidebar/useSidebarCollapsed'
import { useRightPanelResize } from '@/hooks/useRightPanelResize'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { FloatingPanelButtons } from './FloatingPanelButtons'
import { GlobalContactCardDialog } from '@/components/contacts/GlobalContactCardDialog'
import { useContactCardStore } from '@/store/contactCardStore'
import { SendFailureToasts } from '@/components/messenger/SendFailureToasts'
import { useNewMessageToast } from '@/hooks/messenger/useNewMessageToast'
import { useFaviconBadge } from '@/hooks/messenger/useFaviconBadge'
import { useWorkspaceMessagesRealtime } from '@/hooks/messenger/useWorkspaceMessagesRealtime'
import { useQueryClient } from '@tanstack/react-query'
import { messengerKeys } from '@/hooks/queryKeys'
import { useTaskPanelTabbedShell } from '@/components/tasks/TaskPanelTabbedShell'
import { TaskPanelContext, setGlobalOpenThread } from '@/components/tasks/TaskPanelContext'
import { useScrollIntoViewOnPanel } from '@/hooks/shared/useScrollIntoViewOnPanel'


/**
 * Контекст «shell уже выше по дереву». Устанавливается в Next.js layout —
 * тогда внутренние <WorkspaceLayout> в page-components работают как no-op
 * passthrough, чтобы не размонтировать сайдбар при смене проекта.
 */
const WorkspaceShellContext = createContext<boolean>(false)

type WorkspaceLayoutProps = {
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

  // Клиенты работают без сайдбара — у них в шапке проекта свой селектор.
  const { isClientOnly } = useWorkspacePermissions({ workspaceId })

  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  // Режим настроек: сайдбар проектов заменяется на вертикальное меню настроек.
  const isSettingsRoute = pathname.includes('/settings')
  // Закрываем мобильный drawer при смене маршрута — тап по пункту навигации
  // (Входящие/Задачи/проект/доска) уводит на новую страницу, сайдбар должен
  // уйти сам. На десктопе mobileOpen всегда false → эффект безвреден.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- сброс UI-флага при смене маршрута
    setMobileOpen(false)
  }, [pathname])
  const { isCollapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapsed()
  const { panelWidth, handlePointerDown: handlePanelResize } = useRightPanelResize()

  // Прокидываем актуальную ширину панели в CSS-переменную — её читают
  // .side-panel и handle. Во время drag хук обновляет переменную напрямую
  // через DOM (без ре-рендеров), здесь — синк после mouseup и при mount.
  useEffect(() => {
    document.documentElement.style.setProperty('--panel-width', `${panelWidth}px`)
  }, [panelWidth])

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
    // Закрыть карточку контакта при смене воркспейса — GlobalContactCardDialog
    // смонтирован на этом layout и не размонтируется при переходе между
    // воркспейсами, иначе показал бы участника прежнего воркспейса.
    useContactCardStore.getState().close()
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
    openSystemTab,
    openKnowledgeArticleTab,
    closeTab,
    openTabs,
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
      openSystemTab,
      openKnowledgeArticleTab,
      closeThread: closeAllTabs,
      closeTab,
      openTabs,
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
      openSystemTab,
      openKnowledgeArticleTab,
      closeAllTabs,
      closeTab,
      openTabs,
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
        {!isClientOnly && (
          <>
            {/* Нижняя панель навигации (мобила) — заменяет плавающий бургер,
                ВСЕГДА снизу независимо от раздела. «Меню» открывает/закрывает
                выезжающий сайдбар. И сайдбар, и правая панель укорочены снизу
                на высоту таб-бара (globals.css) — ничто его не перекрывает. */}
            {workspaceId && (
              <MobileBottomNav
                workspaceId={workspaceId}
                onOpenMenu={() => setMobileOpen((v) => !v)}
              />
            )}

            {/* Sidebar */}
            <div
              className={cn(
                'fixed inset-y-0 left-0 z-40 md:relative md:z-auto',
                'transition-all duration-200 md:translate-x-0 overflow-hidden',
                mobileOpen ? 'translate-x-0' : '-translate-x-full',
              )}
            >
              {isSettingsRoute ? (
                /* Режим настроек: та же обёртка сайдбара (шапка/низ/фон), но
                   средняя часть — меню разделов настроек вместо поиска/проектов. */
                <WorkspaceSidebarFull
                  workspaceId={workspaceId}
                  settingsMode
                  onMobileClose={() => setMobileOpen(false)}
                />
              ) : sidebarCollapsed ? (
                <WorkspaceSidebarFull
                  workspaceId={workspaceId}
                  compact
                  onExpand={toggleSidebar}
                />
              ) : (
                <WorkspaceSidebarFull
                  workspaceId={workspaceId}
                  onCollapse={toggleSidebar}
                  onMobileClose={() => setMobileOpen(false)}
                />
              )}
            </div>

            {/* Overlay для мобильных */}
            {mobileOpen && (
              <div
                className="fixed inset-0 bg-black/50 z-30 md:hidden"
                onClick={() => setMobileOpen(false)}
              />
            )}
          </>
        )}

        {/* Main content + right panel root (портал для shell) */}
        <div id="workspace-panel-root" className="flex-1 flex min-w-0 relative overflow-hidden">
          <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[var(--cc-bottom-nav-h)] md:pb-0">
            {!isClientOnly && <LimitWarningBanner workspaceId={workspaceId} />}
            {children}
          </main>
        </div>

        {/* Плавающая кнопка (показ скрытой панели) */}
        <FloatingPanelButtons />

        {/* TaskPanel — система вкладок (через portal в #workspace-panel-root) */}
        {taskPanelShell.shellElement}

        {/* Resize-handle на левой границе правой панели (только когда панель видна).
            Позиция — через CSS-переменную, чтобы handle ехал плавно вместе с
            панелью во время drag (без ре-рендеров React). */}
        {panelVisible && (
          <div
            className="hidden md:block fixed top-0 z-[60] h-full w-1 cursor-col-resize hover:bg-primary/30 transition-colors"
            style={{ right: 'calc(var(--panel-width, 600px) - 2px)', touchAction: 'none' }}
            onPointerDown={handlePanelResize}
          />
        )}

        {/* Глобальная карточка контакта — открывается из useContactCardStore. */}
        <GlobalContactCardDialog />

        {/* Sticky-toast'ы про неотправленные сообщения. Подписан на realtime
            таблицы message_send_failures (фильтр user_id=auth.uid()). Видит
            ошибки с любого устройства, переживает перезагрузку страницы. */}
        {workspaceId && <SendFailureToasts workspaceId={workspaceId} />}
      </div>
    </TaskPanelContext.Provider>
  )
}
