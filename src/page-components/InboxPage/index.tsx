/**
 * Страница "Входящие" — хронологический список чатов (v2)
 * Каждый чат — отдельная строка, сортировка по времени последнего сообщения.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Inbox, MessageSquare, Search, X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { MessengerTabContent } from '@/components/messenger/MessengerTabContent'
import { useFilteredInbox } from '@/hooks/messenger/useFilteredInbox'
import { useAuth } from '@/contexts/AuthContext'
import { useSidePanelStore } from '@/store/sidePanelStore'
import {
  getCurrentProjectParticipant,
  markAsRead,
  markAsUnread,
  type MessageChannel,
} from '@/services/api/messenger/messengerService'
import { messengerKeys, invalidateMessengerCaches } from '@/hooks/queryKeys'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { MessengerAccent } from '@/components/messenger/utils/messageStyles'
import { InboxChatItem } from '@/components/messenger/InboxChatItem'
import { InboxChatHeader, useProjectChatParticipants } from './InboxChatHeader'

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
            .filter((c) => c.unread_count > 0 || c.has_unread_reaction || c.manually_unread)
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

  const invalidateInbox = useCallback(() => {
    if (!workspaceId) return
    invalidateMessengerCaches(queryClient, workspaceId)
  }, [workspaceId, queryClient])

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
      chats.filter((c) => c.unread_count > 0 || c.has_unread_reaction || c.manually_unread).length,
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
    </WorkspaceLayout>
  )
}
