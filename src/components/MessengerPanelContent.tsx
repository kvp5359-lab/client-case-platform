"use client"

/**
 * MessengerPanelContent — содержимое мессенджер-панели: вкладки чатов + MessengerTabContent
 *
 * Extracted from WorkspaceLayout.tsx
 * Contains chat tabs row, delete confirmation dialog, and the messenger itself.
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { MessengerTabContent } from '@/components/messenger/MessengerTabContent'
import { ChatTabItem } from '@/components/messenger/ChatTabItem'
import { CreateThreadPopover } from '@/components/messenger/CreateThreadPopover'
import { DeleteThreadDialog } from '@/components/messenger/DeleteThreadDialog'
import { useMessengerPanelData } from '@/hooks/messenger/useMessengerPanelData'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { getBadgeDisplay, type BadgeDisplay } from '@/utils/inboxUnread'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { ThreadTemplate } from '@/types/threadTemplate'

interface MessengerPanelContentProps {
  projectId: string
  workspaceId: string
  overrideChatId?: string
  onSelectChat: (chat: ProjectThread) => void
  onCreateChat: (defaultTab?: 'task' | 'chat' | 'email', template?: ThreadTemplate) => void
  onEditChat: (chat: ProjectThread) => void
}

export function MessengerPanelContent({
  projectId,
  workspaceId,
  overrideChatId,
  onSelectChat,
  onCreateChat,
  onEditChat,
}: MessengerPanelContentProps) {
  const [toolbarPortalContainer, setToolbarPortalContainer] = useState<HTMLDivElement | null>(null)
  const [deletingChat, setDeletingChat] = useState<ProjectThread | null>(null)

  const restoreActiveChatId = useSidePanelStore((s) => s.restoreActiveChatId)
  const openChatFn = useSidePanelStore((s) => s.openChat)

  // Restore last opened chat on mount
  useEffect(() => {
    if (!overrideChatId) {
      restoreActiveChatId(projectId)
    }
  }, [projectId, overrideChatId, restoreActiveChatId])

  const {
    chats,
    chatsLoading,
    visibleChats,
    clientChatId,
    internalChatId,
    clientUnread,
    internalUnread,
    hasClientReaction,
    clientReactionCount,
    reactionEmoji,
    hasInternalReaction,
    internalReactionCount,
    isClientManuallyUnread,
    isInternalManuallyUnread,
    unreadByThreadId,
    chatAccessTooltips,
    threadTemplates,
    deleteChatMutation,
    pinThreadMutation,
  } = useMessengerPanelData(projectId, workspaceId)

  const internalReactionEmoji = internalChatId
    ? unreadByThreadId[internalChatId]?.reactionEmoji ?? null
    : null

  // overrideChatId может быть из localStorage и указывать на удалённый/несуществующий чат
  const overrideValid = overrideChatId && visibleChats.some((c) => c.id === overrideChatId)
  const threadId = (overrideValid ? overrideChatId : null) ?? clientChatId ?? visibleChats[0]?.id
  const currentChat = chats.find((c) => c.id === threadId)
  const channel: 'client' | 'internal' =
    // TODO: legacy_channel may contain other values — extend the type
    (currentChat?.legacy_channel as 'client' | 'internal') ?? 'client'

  const handleDeleteChat = useCallback(() => {
    if (!deletingChat) return
    deleteChatMutation.mutate(deletingChat, {
      onSuccess: () => {
        setDeletingChat(null)
        const fallback = visibleChats.find((c) => c.id !== deletingChat.id)
        if (fallback)
          openChatFn(fallback.id, (fallback.legacy_channel as 'client' | 'internal') ?? 'client')
      },
    })
  }, [deletingChat, deleteChatMutation, visibleChats, openChatFn])

  if (chatsLoading && visibleChats.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!chatsLoading && visibleChats.length === 0) {
    return (
      <div className="flex flex-col h-full min-w-0">
        <div className="flex items-center px-3 py-1.5 border-b shrink-0">
          <CreateThreadPopover
            threadTemplates={threadTemplates}
            onCreateChat={onCreateChat}
            variant="empty"
          />
        </div>
        <div className="flex items-center justify-center flex-1 text-center px-6">
          <p className="text-sm text-muted-foreground">Нет доступных чатов в этом проекте</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Second row: chat tabs */}
      <div className="flex items-center px-3 py-1.5 border-b shrink-0 group/chatrow">
        <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 bg-muted rounded-full p-1 w-fit">
            {visibleChats.map((chat) => {
              const isClient = chat.legacy_channel === 'client'
              const isInternal = chat.legacy_channel === 'internal'
              const threadUnread = unreadByThreadId[chat.id]

              // Единая логика бейджа через центральную функцию
              let badge: BadgeDisplay
              if (isClient) {
                badge = getBadgeDisplay({
                  unread_count: clientUnread,
                  has_unread_reaction: hasClientReaction,
                  unread_reaction_count: clientReactionCount,
                  manually_unread: isClientManuallyUnread,
                  last_reaction_emoji: reactionEmoji,
                })
              } else if (isInternal) {
                badge = getBadgeDisplay({
                  unread_count: internalUnread,
                  has_unread_reaction: hasInternalReaction,
                  unread_reaction_count: internalReactionCount,
                  manually_unread: isInternalManuallyUnread,
                  last_reaction_emoji: internalReactionEmoji,
                })
              } else {
                badge = getBadgeDisplay({
                  unread_count: threadUnread?.unreadCount ?? 0,
                  has_unread_reaction: threadUnread?.hasReaction ?? false,
                  unread_reaction_count: threadUnread?.reactionCount ?? 0,
                  manually_unread: threadUnread?.manuallyUnread ?? false,
                  last_reaction_emoji: threadUnread?.reactionEmoji ?? null,
                  unread_event_count: threadUnread?.eventCount ?? 0,
                })
              }

              return (
                <ChatTabItem
                  key={chat.id}
                  chat={chat}
                  isActive={threadId === chat.id}
                  threadId={threadId}
                  badge={badge}
                  accessTooltip={chatAccessTooltips[chat.id]}
                  onSelect={onSelectChat}
                  onEdit={onEditChat}
                  onDelete={setDeletingChat}
                  onPin={(chatId, pid, isPinned) =>
                    pinThreadMutation.mutate({ threadId: chatId, projectId: pid, isPinned })
                  }
                  projectId={projectId}
                />
              )
            })}
          </div>
        </div>
        <div className="relative flex items-center gap-1 ml-auto pl-2 shrink-0 before:absolute before:-top-1.5 before:-bottom-1.5 before:left-0 before:w-3 before:-translate-x-full before:bg-gradient-to-l before:from-black/[0.06] before:to-transparent before:pointer-events-none">
          <CreateThreadPopover threadTemplates={threadTemplates} onCreateChat={onCreateChat} />
          {/* Search + Telegram status — right */}
          <div ref={setToolbarPortalContainer} className="flex items-center gap-2 shrink-0" />
        </div>
      </div>

      {/* Delete chat confirmation */}
      <DeleteThreadDialog
        thread={deletingChat}
        onConfirm={handleDeleteChat}
        onClose={() => setDeletingChat(null)}
      />

      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        {threadId ? (
          <MessengerTabContent
            key={threadId}
            projectId={projectId}
            workspaceId={workspaceId}
            channel={channel}
            threadId={threadId}
            accent={currentChat?.accent_color ?? (channel === 'internal' ? 'dark' : 'blue')}
            toolbarPortalContainer={toolbarPortalContainer}
          />
        ) : null}
      </div>
    </div>
  )
}
