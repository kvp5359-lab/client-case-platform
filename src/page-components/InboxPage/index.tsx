/**
 * Страница "Входящие" — хронологический список чатов (v2)
 * Каждый чат — отдельная строка, сортировка по времени последнего сообщения.
 */

import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { Inbox, MessageSquare, Search, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
import { messengerKeys, invalidateMessengerCaches, taskKeys } from '@/hooks/queryKeys'
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
import { InboxChatItem } from '@/components/messenger/InboxChatItem'
import { InboxChatHeader, useProjectChatParticipants } from './InboxChatHeader'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'

const ChatSettingsDialog = lazy(() =>
  import('@/components/messenger/ChatSettingsDialog').then((m) => ({
    default: m.ChatSettingsDialog,
  })),
)

type InboxFilter = 'all' | 'unread'

export default function InboxPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [filter, setFilter] = useState<InboxFilter>('unread')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [toolbarContainer, setToolbarContainer] = useState<HTMLDivElement | null>(null)
  const closePanel = useSidePanelStore((s) => s.closePanel)
  const setPendingInitialMessage = useSidePanelStore((s) => s.setPendingInitialMessage)

  // Стейт диалога создания треда
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createDefaultTab, setCreateDefaultTab] = useState<'task' | 'chat' | 'email'>('task')
  const [createTemplate, setCreateTemplate] = useState<ThreadTemplate | null>(null)

  // TaskPanel
  const tp = useTaskPanelSetup({ workspaceId: workspaceId ?? '' })

  useEffect(() => {
    closePanel()
  }, [closePanel])

  const { data: chats = [], isLoading } = useFilteredInbox(workspaceId ?? '')

  // «Снимок» ID тредов при включении фильтра «Непрочитанные» —
  // чтобы прочитанный чат не пропадал до смены фильтра
  const [unreadSnapshot, setUnreadSnapshot] = useState<Set<string> | null>(null)

  // Сброс снимка при смене фильтра; при включении unread — делаем снимок
  const handleSetFilter = useCallback(
    (f: InboxFilter) => {
      if (f === 'unread') {
        const ids = new Set(
          chats
            .filter((c) => c.unread_count > 0 || c.has_unread_reaction || c.manually_unread || (c.unread_event_count ?? 0) > 0)
            .map((c) => c.thread_id),
        )
        setUnreadSnapshot(ids)
      } else {
        setUnreadSnapshot(null)
      }
      setFilter(f)
    },
    [chats],
  )

  // Фильтрация и поиск
  const filteredChats = useMemo(() => {
    let result = chats

    if (filter === 'unread') {
      result = result.filter(
        (c) =>
          c.unread_count > 0 ||
          c.has_unread_reaction ||
          c.manually_unread ||
          (unreadSnapshot?.has(c.thread_id) ?? false),
      )
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (c) => c.thread_name.toLowerCase().includes(q) || c.project_name.toLowerCase().includes(q),
      )
    }

    return result
  }, [chats, filter, searchQuery, unreadSnapshot])

  // Активный чат — выбранный или первый из списка
  const activeChat = useMemo(() => {
    if (selectedThreadId) return chats.find((c) => c.thread_id === selectedThreadId) ?? null
    return filteredChats.length > 0 ? filteredChats[0] : null
  }, [selectedThreadId, chats, filteredChats])

  // Участники проекта для хедера
  const { data: participants = [] } = useProjectChatParticipants(activeChat?.project_id)

  // Project template id активного чата — для фильтрации шаблонов тредов.
  const { data: activeProjectTemplateId = null } = useQuery<string | null>({
    queryKey: ['project-template-id', activeChat?.project_id ?? null],
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
    staleTime: 60_000,
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
            tp.setOpenThread(newThreadToTaskItem(newChat as ProjectThread, result))
          },
        },
      )
    },
    [createChatMutation, user, workspaceId, setPendingInitialMessage, invalidateInbox],
  )

  const getChannel = (chat: InboxThreadEntry): MessageChannel =>
    (chat.legacy_channel as MessageChannel) ?? 'client'

  const markReadMutation = useMutation({
    mutationFn: async (chat: InboxThreadEntry) => {
      if (!user) throw new Error('Не авторизован')
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

  const unreadCount = useMemo(
    () =>
      chats.filter((c) => c.unread_count > 0 || c.has_unread_reaction || c.manually_unread || (c.unread_event_count ?? 0) > 0).length,
    [chats],
  )

  return (
    <WorkspaceLayout>
      <div className="h-full overflow-hidden bg-white p-6 pr-[72px]">
        <div className="flex h-full overflow-hidden max-w-7xl mx-auto rounded-lg border bg-white">
          {/* Левая панель — список чатов */}
          <div className="w-[35%] min-w-[220px] max-w-[352px] flex flex-col border-r overflow-hidden">
            {/* Заголовок + поиск */}
            <div className="px-4 py-3 border-b shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">Входящие</h2>
              </div>

              <div className="flex items-center gap-1">
                {searchOpen ? (
                  /* Поле поиска заменяет фильтры */
                  <div className="flex items-center gap-1.5 flex-1">
                    <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Поиск по чату или проекту..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 text-sm py-1 bg-transparent focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOpen(false)
                        setSearchQuery('')
                      }}
                      className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  /* Фильтры + кнопка поиска */
                  <>
                    <button
                      type="button"
                      onClick={() => handleSetFilter('all')}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full transition-colors',
                        filter === 'all'
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-500 hover:bg-gray-100',
                      )}
                    >
                      Все
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetFilter('unread')}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1',
                        filter === 'unread'
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-500 hover:bg-gray-100',
                      )}
                    >
                      Непрочитанные
                      {unreadCount > 0 && (
                        <span
                          className={cn(
                            'min-w-[16px] h-4 px-1 rounded-full text-[10px] font-medium flex items-center justify-center',
                            filter === 'unread'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-600',
                          )}
                        >
                          {unreadCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchOpen(true)}
                      className="ml-auto p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    >
                      <Search className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Список чатов */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {isLoading ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Загрузка...
                </div>
              ) : filteredChats.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {filter === 'unread'
                    ? 'Нет непрочитанных'
                    : searchQuery
                      ? 'Ничего не найдено'
                      : 'Нет активных чатов'}
                </div>
              ) : (
                filteredChats.map((chat) => (
                  <InboxChatItem
                    key={chat.thread_id}
                    chat={chat}
                    isSelected={activeChat?.thread_id === chat.thread_id}
                    onClick={() => setSelectedThreadId(chat.thread_id)}
                    onMarkAsRead={() => markReadMutation.mutate(chat)}
                    onMarkAsUnread={() => markUnreadMutation.mutate(chat)}
                  />
                ))
              )}
            </div>
          </div>

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
                    projectId={activeChat.project_id}
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
