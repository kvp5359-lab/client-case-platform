/**
 * Страница "Входящие" — хронологический список чатов (v2)
 * Каждый чат — отдельная строка, сортировка по времени последнего сообщения.
 */

import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { MessengerTabContent } from '@/components/messenger/MessengerTabContent'
import { useFilteredInbox } from '@/hooks/messenger/useFilteredInbox'
import { useAuth } from '@/contexts/AuthContext'
import { useSidePanelStore } from '@/store/sidePanelStore'
import {
  getCurrentProjectParticipant,
  getCurrentWorkspaceParticipant,
  markAsRead,
  markAsUnread,
  type MessageChannel,
} from '@/services/api/messenger/messengerService'
import { messengerKeys, invalidateMessengerCaches, projectTemplateKeys, STALE_TIME } from '@/hooks/queryKeys'
import { useThreadTemplatesForProject } from '@/hooks/messenger/useThreadTemplates'
import { useCreateThread, useProjectThreads } from '@/hooks/messenger/useProjectThreads'
import { TaskPanel } from '@/components/tasks/TaskPanel'
import { useTaskPanelSetup } from '@/components/tasks/useTaskPanelSetup'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import { newThreadToTaskItem } from '@/components/tasks/taskListConstants'
import type { ChatSettingsResult } from '@/components/messenger/chatSettingsTypes'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { MessengerAccent } from '@/components/messenger/utils/messageStyles'
import type { ThreadTemplate } from '@/types/threadTemplate'
import { InboxChatHeader, useProjectChatParticipants } from './InboxChatHeader'
import { InboxSidebar } from './InboxSidebar'
import { useInboxFilters } from './useInboxFilters'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'

const ChatSettingsDialog = lazy(() =>
  import('@/components/messenger/ChatSettingsDialog').then((m) => ({
    default: m.ChatSettingsDialog,
  })),
)

export default function InboxPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [toolbarContainer, setToolbarContainer] = useState<HTMLDivElement | null>(null)
  const closePanel = useSidePanelStore((s) => s.closePanel)
  const setPendingInitialMessage = useSidePanelStore((s) => s.setPendingInitialMessage)

  // Стейт диалога создания треда
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createDefaultTab, setCreateDefaultTab] = useState<'task' | 'chat' | 'email'>('task')
  const [createTemplate, setCreateTemplate] = useState<ThreadTemplate | null>(null)

  // TaskPanel. Деструктурируем setOpenThread из tp, чтобы линтер не требовал
  // весь объект tp в deps useCallback (он новый на каждом рендере).
  const tp = useTaskPanelSetup({ workspaceId: workspaceId ?? '' })
  const { setOpenThread: tpSetOpenThread } = tp

  useEffect(() => {
    closePanel()
  }, [closePanel])

  const { data: chats = [], isLoading } = useFilteredInbox(workspaceId ?? '')

  const {
    filter,
    handleSetFilter,
    searchQuery,
    setSearchQuery,
    searchOpen,
    setSearchOpen,
    closeSearch,
    filteredChats,
    unreadCount,
  } = useInboxFilters(chats)

  // Активный чат — выбранный или первый из списка
  const activeChat = useMemo(() => {
    if (selectedThreadId) return chats.find((c) => c.thread_id === selectedThreadId) ?? null
    return filteredChats.length > 0 ? filteredChats[0] : null
  }, [selectedThreadId, chats, filteredChats])

  // Участники проекта для хедера. Для workspace-level тредов (project_id=null)
  // участников проекта нет — передаём undefined, хук отключает запрос.
  const { data: participants = [] } = useProjectChatParticipants(
    activeChat?.project_id ?? undefined,
  )

  // Project template id активного чата — для фильтрации шаблонов тредов.
  const { data: activeProjectTemplateId = null } = useQuery<string | null>({
    queryKey: projectTemplateKeys.idByProject(activeChat?.project_id ?? null),
    queryFn: async () => {
      if (!activeChat?.project_id) return null
      const { data, error } = await supabase
        .from('projects')
        .select('template_id')
        .eq('id', activeChat.project_id)
        .maybeSingle()
      if (error) throw error
      return (data?.template_id as string | null) ?? null
    },
    enabled: !!activeChat?.project_id,
    staleTime: STALE_TIME.STANDARD,
  })

  // Все видимые шаблоны в контексте активного проекта: глобальные + scoped.
  const { data: allVisibleTemplates = [] } = useThreadTemplatesForProject(
    workspaceId,
    activeProjectTemplateId,
  )

  // Существующие треды активного проекта — чтобы отфильтровать шаблоны,
  // которые уже материализовались в тред с этим source_template_id.
  const { data: activeProjectThreads = [] } = useProjectThreads(
    activeChat?.project_id ?? undefined,
  )
  const usedTemplateIds = useMemo(() => {
    const set = new Set<string>()
    for (const t of activeProjectThreads) {
      if (t.source_template_id) set.add(t.source_template_id)
    }
    return set
  }, [activeProjectThreads])
  const threadTemplates = useMemo(
    () => allVisibleTemplates.filter((t) => !usedTemplateIds.has(t.id)),
    [allVisibleTemplates, usedTemplateIds],
  )

  // Создание треда — projectId из активного чата
  const createProjectId = activeChat?.project_id ?? ''
  const createChatMutation = useCreateThread(createProjectId, workspaceId ?? '')

  const handleOpenCreateDialog = useCallback(
    (defaultTab?: 'task' | 'chat' | 'email', template?: ThreadTemplate) => {
      setCreateDefaultTab(defaultTab ?? 'task')
      setCreateTemplate(template ?? null)
      setCreateDialogOpen(true)
    },
    [],
  )

  const invalidateInbox = useCallback(() => {
    if (!workspaceId) return
    invalidateMessengerCaches(queryClient, workspaceId)
  }, [workspaceId, queryClient])

  const handleCreateChat = useCallback(
    async (result: ChatSettingsResult) => {
      let senderName = 'Вы'
      if (result.initialMessage && user && workspaceId) {
        try {
          const p = await getCurrentWorkspaceParticipant(workspaceId, user.id)
          if (p) senderName = p.name
        } catch {
          /* fallback */
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
          sourceTemplateId: result.sourceTemplateId,
        },
        {
          onSuccess: (newChat) => {
            if (result.initialMessage) {
              setPendingInitialMessage({
                threadId: newChat.id,
                html: result.initialMessage.html,
                files: result.initialMessage.files,
                isEmail: result.channelType === 'email',
                senderName,
              })
            }
            setCreateDialogOpen(false)
            setCreateTemplate(null)
            invalidateInbox()
            tpSetOpenThread(newThreadToTaskItem(newChat as ProjectThread, result))
          },
        },
      )
    },
    [createChatMutation, user, workspaceId, setPendingInitialMessage, invalidateInbox, tpSetOpenThread],
  )

  const getChannel = (chat: InboxThreadEntry): MessageChannel =>
    (chat.legacy_channel as MessageChannel) ?? 'client'

  const markReadMutation = useMutation({
    mutationFn: async (chat: InboxThreadEntry) => {
      if (!user) throw new Error('Не авторизован')
      // Workspace-level треды (project_id=null) пока не поддерживаются
      // mark-as-read из InboxPage — у них нет project-участника.
      if (!chat.project_id) return
      const participant = await getCurrentProjectParticipant(chat.project_id, user.id)
      if (!participant) throw new Error('Участник не найден')
      return markAsRead(
        participant.participantId,
        chat.project_id,
        getChannel(chat),
        chat.thread_id,
      )
    },
    onSuccess: (_, chat) => {
      queryClient.setQueryData(messengerKeys.unreadCountByThreadId(chat.thread_id), 0)
      invalidateInbox()
    },
    onError: () => {
      toast.error('Не удалось отметить как прочитанное')
    },
  })

  const markUnreadMutation = useMutation({
    mutationFn: async (chat: InboxThreadEntry) => {
      if (!user) throw new Error('Не авторизован')
      if (!chat.project_id) return
      const participant = await getCurrentProjectParticipant(chat.project_id, user.id)
      if (!participant) throw new Error('Участник не найден')
      return markAsUnread(
        participant.participantId,
        chat.project_id,
        getChannel(chat),
        chat.thread_id,
      )
    },
    onSuccess: (_, chat) => {
      queryClient.invalidateQueries({
        queryKey: messengerKeys.unreadCountByThreadId(chat.thread_id),
      })
      invalidateInbox()
    },
    onError: () => {
      toast.error('Не удалось отметить как непрочитанное')
    },
  })

  return (
    <WorkspaceLayout>
      <div className="h-full overflow-hidden bg-white p-6 pr-[72px]">
        <div className="flex h-full overflow-hidden max-w-7xl mx-auto rounded-lg border bg-white">
          {/* Левая панель — список чатов */}
          <InboxSidebar
            filter={filter}
            onSetFilter={handleSetFilter}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            searchOpen={searchOpen}
            onOpenSearch={() => setSearchOpen(true)}
            onCloseSearch={closeSearch}
            unreadCount={unreadCount}
            isLoading={isLoading}
            filteredChats={filteredChats}
            activeThreadId={activeChat?.thread_id ?? null}
            onSelectThread={setSelectedThreadId}
            onMarkAsRead={(chat) => markReadMutation.mutate(chat)}
            onMarkAsUnread={(chat) => markUnreadMutation.mutate(chat)}
          />

          {/* Правая панель — мессенджер конкретного чата */}
          <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
            {activeChat && workspaceId ? (
              <>
                <InboxChatHeader
                  key={`header-${activeChat.thread_id}`}
                  chat={activeChat}
                  workspaceId={workspaceId}
                  participants={participants}
                  toolbarRef={setToolbarContainer}
                  threadTemplates={threadTemplates}
                  onCreateThread={handleOpenCreateDialog}
                />
                <div className="flex-1 min-h-0">
                  <MessengerTabContent
                    key={activeChat.thread_id}
                    projectId={activeChat.project_id ?? undefined}
                    workspaceId={workspaceId}
                    channel={getChannel(activeChat)}
                    threadId={activeChat.thread_id}
                    accent={(activeChat.thread_accent_color as MessengerAccent) ?? 'blue'}
                    toolbarPortalContainer={toolbarContainer}
                  />
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                <MessageSquare className="h-12 w-12 opacity-20" />
                <p className="text-sm">Выберите чат</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Диалог создания треда */}
      {createDialogOpen && createProjectId && (
        <Suspense fallback={null}>
          <ChatSettingsDialog
            chat={null}
            projectId={createProjectId}
            workspaceId={workspaceId ?? ''}
            defaultThreadType={createDefaultTab === 'task' ? 'task' : 'chat'}
            defaultTabMode={createDefaultTab}
            initialTemplate={createTemplate}
            open={createDialogOpen}
            onOpenChange={(v) => {
              if (!v) {
                setCreateDialogOpen(false)
                setCreateTemplate(null)
              }
            }}
            onCreate={handleCreateChat}
            onUpdate={() => {}}
            isPending={createChatMutation.isPending}
          />
        </Suspense>
      )}

      {/* TaskPanel — боковая панель треда после создания */}
      <TaskPanel
        {...tp.taskPanelProps}
        showProjectLink
        onProjectClick={() => {
          // Передаём открытый тред в layout-уровневую TaskPanel,
          // чтобы панель пережила размонтирование InboxPage при навигации
          // на страницу проекта. Затем локальную копию закрываем.
          if (tp.openThread) globalOpenThread(tp.openThread)
          tp.setOpenThread(null)
        }}
      />
    </WorkspaceLayout>
  )
}
