/**
 * Страница "Входящие" — хронологический список чатов (v2)
 * Каждый чат — отдельная строка, сортировка по времени последнего сообщения.
 */

import { useState, useCallback, useEffect, useMemo, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { MessageSquare, ArrowLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isMobileViewport } from '@/lib/isMobile'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { MessengerTabContent } from '@/components/messenger/MessengerTabContent'
import {
  useFilteredInbox,
  useFilteredInboxUnread,
  useFilteredInboxAwaitingReply,
  useFilteredInboxNeedsReply,
  useFilteredInboxSearch,
  useInboxMessageStatuses,
  useInboxSegmentCounts,
} from '@/hooks/messenger/useFilteredInbox'
import { useDebounce } from '@/hooks/shared/useDebounce'
import { useInboxMarkMutations } from '@/hooks/messenger/useInboxMarkMutations'
import { useAuth } from '@/contexts/AuthContext'
import { useMySenderName } from '@/hooks/messenger/useMySenderName'
import { useSidePanelStore } from '@/store/sidePanelStore'
import {
  getCurrentWorkspaceParticipant,
  type MessageChannel,
} from '@/services/api/messenger/messengerService'
import { invalidateMessengerCaches, projectTemplateKeys, STALE_TIME } from '@/hooks/queryKeys'
import { useThreadTemplatesForProject } from '@/hooks/messenger/useThreadTemplates'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCreateThread, useProjectThreads } from '@/hooks/messenger/useProjectThreads'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import { newThreadToTaskItem } from '@/components/tasks/taskListConstants'
import type { ChatSettingsResult } from '@/components/messenger/chatSettingsTypes'
import type { MessengerAccent } from '@/components/messenger/utils/messageStyles'
import type { ThreadTemplate } from '@/types/threadTemplate'
import { InboxChatHeader, useProjectChatParticipants } from './InboxChatHeader'
import { InboxSidebar } from './InboxSidebar'
import { useInboxFilters, type InboxFilter } from './useInboxFilters'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import { LazyChatSettingsDialog as ChatSettingsDialog } from '@/components/lazyChatSettingsDialog'
import { stashThreadDraft } from '@/components/messenger/hooks/stashThreadDraft'

export default function InboxPage() {
  usePageTitle('Входящие')
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { user } = useAuth()
  const selfSenderName = useMySenderName(workspaceId)
  const queryClient = useQueryClient()
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [toolbarContainer, setToolbarContainer] = useState<HTMLDivElement | null>(null)
  const closePanel = useSidePanelStore((s) => s.closePanel)
  const setPendingInitialMessage = useSidePanelStore((s) => s.setPendingInitialMessage)

  // Стейт диалога создания треда
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createDefaultTab, setCreateDefaultTab] = useState<'task' | 'chat' | 'email'>('task')
  const [createTemplate, setCreateTemplate] = useState<ThreadTemplate | null>(null)

  useEffect(() => {
    closePanel()
  }, [closePanel])

  const {
    data: chats = [],
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useFilteredInbox(workspaceId ?? '')

  // Активная вкладка — владелец стейта здесь (controlled), чтобы загейтить
  // тяжёлые списки awaiting/needs по активной вкладке (грузить только открытую).
  const [filter, setFilter] = useState<InboxFilter>('unread')

  // Все непрочитанные одним запросом — источник вкладки «Непрочитанные» (без каскада догрузки).
  const { data: unreadChats = [] } = useFilteredInboxUnread(workspaceId ?? '')
  // «Ждём клиента» / «Нужно ответить» — тяжёлые списки, грузятся ЛЕНИВО (только
  // когда соответствующая вкладка активна). Бейджи-счётчики — из лёгких агрегатов.
  const { data: awaitingChats = [] } = useFilteredInboxAwaitingReply(
    workspaceId ?? '',
    filter === 'awaiting',
  )
  const { data: needsReplyChats = [] } = useFilteredInboxNeedsReply(
    workspaceId ?? '',
    filter === 'needs_reply',
  )
  // Счётчики бейджей вкладок — из лёгких агрегатов (тот же RPC, что сайдбар).
  const { needsReply: needsReplyCount, awaiting: awaitingCount } =
    useInboxSegmentCounts(workspaceId ?? '')

  const {
    handleSetFilter,
    searchQuery,
    setSearchQuery,
    searchOpen,
    setSearchOpen,
    closeSearch,
    filteredChats,
    unreadCount,
  } = useInboxFilters(chats, unreadChats, awaitingChats, needsReplyChats, filter, setFilter)

  // Серверный поиск по тредам инбокса (по названию треда/проекта) — по всем
  // тредам, а не по загруженным страницам. При активном поиске он заменяет
  // вкладочный список.
  const debouncedSearch = useDebounce(searchQuery.trim(), 300)
  const { data: searchResults = [] } = useFilteredInboxSearch(workspaceId ?? '', debouncedSearch)
  const isSearching = searchQuery.trim().length > 0
  const displayChats = isSearching ? searchResults : filteredChats
  // Статусы доставки последних исходящих — для галочки в превью.
  const deliveryStatuses = useInboxMessageStatuses(workspaceId ?? '')

  // Активный чат — выбранный или первый из списка
  const activeChat = useMemo(() => {
    if (selectedThreadId) return chats.find((c) => c.thread_id === selectedThreadId) ?? null
    // На мобиле НЕ авто-выбираем первый чат — открываем список (master-detail),
    // в чат заходим тапом. На десктопе двухпанельный режим → дефолт на первый.
    if (isMobileViewport()) return null
    return displayChats.length > 0 ? displayChats[0] : null
  }, [selectedThreadId, chats, displayChats])

  // Чат для рендера контента — лагает за activeChat при закрытии: панель уезжает
  // (translate по activeChat), а содержимое держим ещё 300мс, пока идёт анимация
  // выезда. Иначе при закрытии контент пропадёт мгновенно и слайда не видно.
  const [renderChat, setRenderChat] = useState<typeof activeChat>(activeChat)
  useEffect(() => {
    if (activeChat) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- синхронизация renderChat с задержкой на закрытие
      setRenderChat(activeChat)
      return
    }
    const t = setTimeout(() => setRenderChat(null), 300)
    return () => clearTimeout(t)
  }, [activeChat])

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
          type: result.channelType === 'email' ? 'email' : result.threadType,
          emailData:
            result.channelType === 'email'
              ? {
                  contactEmails: (result.contactEmails ?? []).map((e) => e.email),
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
          onSuccess: async (newChat) => {
            if (result.asDraft) {
              // Черновик: не отправляем, кладём в черновик треда (composer
              // подхватит при открытии; переживает перезагрузку).
              if (result.initialMessage) {
                await stashThreadDraft(
                  newChat.id,
                  result.initialMessage.html,
                  result.initialMessage.files,
                )
              }
            } else if (result.initialMessage) {
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
            // Открываем тред в layout-уровневой панели (новая система вкладок).
            globalOpenThread(newThreadToTaskItem(newChat as ProjectThread, result))
          },
        },
      )
    },
    [createChatMutation, user, workspaceId, setPendingInitialMessage, invalidateInbox],
  )

  // Общие mark-read/unread мутации: одна реализация на InboxPage + BoardInboxList.
  // Оптимистичный патч + invalidate + rollback + toast — всё внутри хука.
  const { markRead: markReadMutation, markUnread: markUnreadMutation } =
    useInboxMarkMutations(workspaceId)

  // Догрузка страниц — только на вкладке «Все» без активного поиска. На
  // «Непрочитанных» источник полный (useFilteredInboxUnread), при поиске —
  // серверный (searchResults); пагинация там не нужна — иначе короткий список
  // запускал бы каскад догрузки всего инбокса.
  const showLoadMore = !isSearching && filter === 'all' && hasNextPage

  return (
    <WorkspaceLayout>
      <div className="h-full overflow-hidden bg-white p-0 md:p-6 md:pr-[72px]">
        <div className="relative flex h-full overflow-hidden max-w-7xl mx-auto md:rounded-lg md:border bg-white">
          {/* Левая панель — список чатов. На мобиле при открытом чате
              сжимается в узкую полоску слева (как фон под правой панелью),
              иначе на весь экран. Десктоп — колонка 35%. */}
          <InboxSidebar
            className={activeChat ? 'w-[28px] md:w-[35%]' : undefined}
            narrow={!!activeChat}
            filter={filter}
            onSetFilter={handleSetFilter}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            searchOpen={searchOpen}
            onOpenSearch={() => setSearchOpen(true)}
            onCloseSearch={closeSearch}
            unreadCount={unreadCount}
            awaitingCount={awaitingCount}
            needsReplyCount={needsReplyCount}
            isLoading={isLoading}
            filteredChats={displayChats}
            activeThreadId={activeChat?.thread_id ?? null}
            onSelectThread={setSelectedThreadId}
            onMarkAsRead={(chat) => markReadMutation.mutate(chat)}
            onMarkAsUnread={(chat) => markUnreadMutation.mutate(chat)}
            deliveryStatuses={deliveryStatuses}
            hasNextPage={showLoadMore}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={fetchNextPage}
            selfSenderName={selfSenderName}
          />

          {/* Правая панель — мессенджер конкретного чата. На мобиле: абсолютный
              оверлей, выезжающий справа (translate), left-[28px] оставляет полоску
              списка, тень слева. Десктоп: обычная колонка в потоке. Контент —
              renderChat (лагает при закрытии, чтобы был виден слайд выезда). */}
          <div
            className={cn(
              'absolute inset-y-0 right-0 left-[28px] z-10 flex flex-col overflow-hidden min-w-0',
              'transition-transform duration-300 ease-out shadow-[-6px_0_16px_-4px_rgba(0,0,0,0.18)]',
              activeChat ? 'translate-x-0' : 'translate-x-full',
              'md:static md:flex-1 md:left-auto md:translate-x-0 md:shadow-none md:z-auto md:transition-none',
            )}
          >
            {renderChat && workspaceId ? (
              <>
                {/* Строка «назад/закрыть» к списку — только мобила. Слева —
                    «← Входящие», справа — крестик. Оба закрывают чат. */}
                <div className="md:hidden flex items-center justify-between border-b shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedThreadId(null)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Входящие
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedThreadId(null)}
                    aria-label="Закрыть чат"
                    className="px-3 py-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <InboxChatHeader
                  key={`header-${renderChat.thread_id}`}
                  chat={renderChat}
                  workspaceId={workspaceId}
                  participants={participants}
                  toolbarRef={setToolbarContainer}
                  threadTemplates={threadTemplates}
                  onCreateThread={handleOpenCreateDialog}
                />
                <div className="flex-1 min-h-0">
                  <MessengerTabContent
                    key={renderChat.thread_id}
                    projectId={renderChat.project_id ?? undefined}
                    workspaceId={workspaceId}
                    channel={(renderChat.legacy_channel as MessageChannel) ?? 'client'}
                    threadId={renderChat.thread_id}
                    accent={(renderChat.thread_accent_color as MessengerAccent) ?? 'blue'}
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

      {/* TaskPanel рендерит layout-уровневый WorkspaceLayout. */}
    </WorkspaceLayout>
  )
}
