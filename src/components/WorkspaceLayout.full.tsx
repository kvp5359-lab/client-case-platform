"use client"

/**
 * WorkspaceLayout — обёртка для всех страниц внутри рабочего пространства
 *
 * Содержит:
 * - Sidebar (боковая панель) — на мобильных выезжает поверх контента
 * - Main контент
 * - Встроенная правая панель (split-pane) с тремя вкладками: Клиенты / Команда / Ассистент
 *
 * PanelTabs and MessengerPanelContent extracted to separate files (Z5-22).
 * Chat create/update mutations moved to ChatSettingsSection (conditionally rendered).
 */

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useParams, useLocation } from 'next/navigation'
import { Menu, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WorkspaceSidebar } from './WorkspaceSidebar'
import { AiPanelContent } from '@/components/ai-panel'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { FloatingPanelButtons } from './FloatingPanelButtons'
import {
  ChatSettingsDialog,
  type ChatSettingsResult,
} from '@/components/messenger/ChatSettingsDialog'
import { useCreateThread, useUpdateThread } from '@/hooks/messenger/useProjectThreads'
import type { ProjectThread, ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import type { ThreadTemplate } from '@/types/threadTemplate'
import { useNewMessageToast } from '@/hooks/messenger/useNewMessageToast'
import { useFaviconBadge } from '@/hooks/messenger/useFaviconBadge'
import { getCurrentWorkspaceParticipant } from '@/services/api/messengerService'
import { useAuth } from '@/contexts/AuthContext'
import { useProjectPermissions, useWorkspacePermissions } from '@/hooks/permissions'
import { SYSTEM_WORKSPACE_ROLES } from '@/types/permissions'
import { PanelTabs } from './PanelTabs'
import { MessengerPanelContent } from './MessengerPanelContent'

const ExtraPanelContent = lazy(() =>
  import('@/components/extra-panel/ExtraPanelContent').then((m) => ({
    default: m.ExtraPanelContent,
  })),
)

const PANEL_DEFAULT_WIDTH = '45%'

interface WorkspaceLayoutProps {
  children: React.ReactNode
}

export function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const location = useLocation()
  const isSettingsPage = location.pathname.includes('/settings')

  // Side Panel
  const panelTab = useSidePanelStore((s) => s.panelTab)
  const pageContext = useSidePanelStore((s) => s.pageContext)
  const closePanel = useSidePanelStore((s) => s.closePanel)
  const openPanel = useSidePanelStore((s) => s.openPanel)
  const setContext = useSidePanelStore((s) => s.setContext)
  const messengerEnabled = useSidePanelStore((s) => s.messengerEnabled)

  const panelOpen = panelTab !== null

  // Toast-уведомления о новых сообщениях
  useNewMessageToast(workspaceId)

  // Бейдж непрочитанных на favicon
  useFaviconBadge(workspaceId)

  // Сдвигаем тосты влево, когда боковая панель открыта
  useEffect(() => {
    if (panelOpen) {
      document.body.setAttribute('data-panel-open', '')
    } else {
      document.body.removeAttribute('data-panel-open')
    }
    return () => document.body.removeAttribute('data-panel-open')
  }, [panelOpen])

  // Закрываем правую панель на страницах настроек
  useEffect(() => {
    if (isSettingsPage) {
      closePanel()
    }
  }, [isSettingsPage, closePanel])

  // Синхронизируем workspaceId из URL в store
  useEffect(() => {
    if (workspaceId) {
      setContext({ workspaceId })
    }
  }, [workspaceId, setContext])

  // Горячая клавиша: Cmd+Shift+K (Mac) или Ctrl+Shift+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'k') {
        e.preventDefault()
        const store = useSidePanelStore.getState()
        store.togglePanel('assistant')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Определяем доступные вкладки
  const hasProject = !!pageContext.projectId
  const showMessenger = hasProject && messengerEnabled

  // AI-ассистент: виден если нет проекта (БЗ) или есть хотя бы один AI-модуль
  const { hasModuleAccess, isLoading: permissionsLoading } = useProjectPermissions({
    projectId: pageContext.projectId ?? '',
  })
  const showAssistant =
    !hasProject ||
    hasModuleAccess('ai_knowledge_all') ||
    hasModuleAccess('ai_knowledge_project') ||
    hasModuleAccess('ai_project_assistant')

  // Клиент не видит вкладку "Дополнительно"
  const { userRoles } = useWorkspacePermissions({ workspaceId: workspaceId ?? '' })
  const isClientOnly =
    userRoles.length > 0 && userRoles.every((r) => r === SYSTEM_WORKSPACE_ROLES.CLIENT)
  const showExtra = hasProject && !isClientOnly

  // Если пользователь оказался на недоступной вкладке — закрыть панель
  const hasAnyTab = showMessenger || showAssistant || showExtra
  useEffect(() => {
    if (permissionsLoading || !panelOpen) return
    if (!hasAnyTab) {
      closePanel()
      return
    }
    if (panelTab === 'assistant' && !showAssistant) {
      closePanel()
    }
    if (panelTab === 'extra' && !showExtra) {
      closePanel()
    }
    if ((panelTab === 'client' || panelTab === 'internal') && !showMessenger) {
      closePanel()
    }
  }, [
    panelTab,
    showMessenger,
    showAssistant,
    showExtra,
    hasAnyTab,
    permissionsLoading,
    panelOpen,
    closePanel,
  ])

  // Гибкие чаты — state + handlers for ChatSettingsDialog
  const activeChatId = useSidePanelStore((s) => s.activeChatId)
  const openChat = useSidePanelStore((s) => s.openChat)
  // Unified chat settings dialog: null = closed, undefined = create mode, ProjectThread = edit mode
  const [settingsChat, setSettingsChat] = useState<ProjectThread | null | undefined>(null)
  const [defaultTab, setDefaultTab] = useState<'task' | 'chat' | 'email'>('chat')
  const [initialTemplate, setInitialTemplate] = useState<ThreadTemplate | null>(null)
  const settingsOpen = settingsChat !== null

  const handleSelectChat = useCallback(
    (chat: ProjectThread) => {
      const channel = chat.legacy_channel ?? 'client'
      openChat(chat.id, channel as 'client' | 'internal')
    },
    [openChat],
  )

  return (
    <div className="h-screen flex bg-white relative">
      {/* Мобильный оверлей + кнопка закрытия — вне sidebar'а */}
      {sidebarOpen && (
        <>
          <div
            aria-hidden="true"
            role="none"
            className="md:hidden fixed inset-0 bg-black/40 z-40 cursor-pointer"
            onClick={() => setSidebarOpen(false)}
          />
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Закрыть меню"
            className="md:hidden fixed top-4 left-[268px] z-[51] w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'transition-transform duration-300 ease-in-out',
          'fixed inset-y-0 left-0 z-50',
          'md:relative md:z-20',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <WorkspaceSidebar />
      </div>

      {/* Контент + правая панель */}
      <div className="flex-1 flex min-w-0 relative">
        {/* Основной контент */}
        <div
          className="flex flex-col min-w-0 overflow-hidden w-full"
          style={panelOpen ? { marginRight: PANEL_DEFAULT_WIDTH } : undefined}
        >
          <div className="md:hidden flex items-center px-3 py-2 border-b bg-white">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Открыть меню"
              className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col">{children}</div>
        </div>

        {/* Правая панель (split-pane) */}
        <div
          className={cn(
            'absolute top-0 right-0 h-full w-[45%] min-w-[360px] border-l border-gray-200 bg-white flex flex-col overflow-hidden shadow-[-2px_0_8px_rgba(0,0,0,0.08)] z-20',
            !panelOpen && 'hidden',
          )}
        >
          {panelOpen && (
            <div className="flex flex-col h-full min-w-0">
              {/* Шапка: вкладки + кнопка закрытия */}
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
                {panelTab === 'assistant' && pageContext.workspaceId && (
                  <AiPanelContent
                    workspaceId={pageContext.workspaceId}
                    projectId={pageContext.projectId}
                    templateId={pageContext.templateId}
                  />
                )}
                {panelTab === 'extra' && pageContext.projectId && pageContext.workspaceId && (
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    }
                  >
                    <ExtraPanelContent
                      projectId={pageContext.projectId}
                      workspaceId={pageContext.workspaceId}
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

      {/* Единый диалог создания/редактирования чата — conditionally rendered */}
      {hasProject && (
        <ChatSettingsSection
          projectId={pageContext.projectId!}
          workspaceId={pageContext.workspaceId ?? ''}
          settingsChat={settingsChat}
          settingsOpen={settingsOpen}
          defaultTab={defaultTab}
          initialTemplate={initialTemplate}
          onClose={() => {
            setSettingsChat(null)
            setInitialTemplate(null)
          }}
          onCreated={(newChat) => {
            setSettingsChat(null)
            openChat(newChat.id)
          }}
        />
      )}
    </div>
  )
}

/**
 * ChatSettingsSection — renders ChatSettingsDialog with create/update mutations.
 * Conditionally rendered only when a project is active, avoiding
 * useCreateThread / useUpdateThread hooks on non-project pages.
 */
function ChatSettingsSection({
  projectId,
  workspaceId,
  settingsChat,
  settingsOpen,
  defaultTab,
  initialTemplate,
  onClose,
  onCreated,
}: {
  projectId: string
  workspaceId: string
  settingsChat: ProjectThread | null | undefined
  settingsOpen: boolean
  defaultTab?: 'task' | 'chat' | 'email'
  initialTemplate?: ThreadTemplate | null
  onClose: () => void
  onCreated: (chat: ProjectThread) => void
}) {
  const { user } = useAuth()
  const createChatMutation = useCreateThread(projectId, workspaceId)
  const updateChatMutation = useUpdateThread()
  const setPendingInitialMessage = useSidePanelStore((s) => s.setPendingInitialMessage)

  const handleCreateChat = useCallback(
    async (result: ChatSettingsResult) => {
      // Resolve sender name before mutating (needed for optimistic display)
      let senderName = 'Вы'
      if (result.initialMessage && user) {
        try {
          const p = await getCurrentWorkspaceParticipant(workspaceId, user.id)
          if (p) senderName = p.name
        } catch {
          /* fallback to 'Вы' */
        }
      }

      createChatMutation.mutate(
        {
          name: result.name,
          accessType: result.accessType,
          accentColor: result.accentColor,
          icon: result.icon,
          type: result.threadType,
          emailData:
            result.channelType === 'email' && result.contactEmails?.length
              ? {
                  contactEmails: result.contactEmails.map((e) => e.email),
                  subject: result.emailSubject,
                }
              : undefined,
          memberIds: result.memberIds,
          accessRoles: result.accessRoles,
          deadline: result.deadline,
          statusId: result.statusId,
          assigneeIds: result.assigneeIds,
          projectIdOverride: result.projectId !== undefined ? result.projectId : undefined,
        },
        {
          onSuccess: (newChat) => {
            // Set pending message BEFORE opening chat — so MessengerTabContent sees it immediately
            if (result.initialMessage) {
              setPendingInitialMessage({
                threadId: newChat.id,
                html: result.initialMessage.html,
                files: result.initialMessage.files,
                isEmail: result.channelType === 'email',
                senderName,
              })
            }
            onCreated(newChat)
          },
        },
      )
    },
    [createChatMutation, onCreated, workspaceId, user, setPendingInitialMessage],
  )

  const handleEditSave = useCallback(
    (params: { name: string; accent_color: ThreadAccentColor; icon: string }) => {
      if (!settingsChat) return
      updateChatMutation.mutate(
        { threadId: settingsChat.id, projectId, ...params },
        { onSuccess: () => onClose() },
      )
    },
    [settingsChat, updateChatMutation, projectId, onClose],
  )

  return (
    <ChatSettingsDialog
      chat={settingsChat ?? null}
      projectId={projectId}
      workspaceId={workspaceId}
      defaultThreadType={defaultTab === 'task' ? 'task' : 'chat'}
      defaultTabMode={defaultTab}
      initialTemplate={initialTemplate}
      open={settingsOpen}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      onCreate={handleCreateChat}
      onUpdate={handleEditSave}
      isPending={createChatMutation.isPending || updateChatMutation.isPending}
    />
  )
}
