"use client"

/**
 * MessengerPanelContent — содержимое мессенджер-панели: вкладки чатов + MessengerTabContent
 *
 * Extracted from WorkspaceLayout.tsx (Z5-22)
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
    reactionEmoji,
    isClientManuallyUnread,
    isInternalManuallyUnread,
    unreadByThreadId,
    chatAccessTooltips,
    threadTemplates,
    deleteChatMutation,
    pinThreadMutation,
  } = useMessengerPanelData(projectId, workspaceId)

  // overrideChatId может быть из localStorage и указывать на удалённый/несуществующий чат
  const overrideValid = overrideChatId && visibleChats.some((c) => c.id === overrideChatId)
  const threadId = (overrideValid ? overrideChatId : null) ?? clientChatId ?? visibleChats[0]?.id
  const currentChat = chats.find((c) => c.id === threadId)
  const channel: 'client' | 'internal' =
    // TODO (Z1-10): legacy_channel may contain other values — extend the type
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
      <div className="flex items-center justify-center h-full text-center px-6">
        <p className="text-sm text-muted-foreground">Нет доступных чатов в этом проекте</p>
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
              const hasReaction = isClient
                ? hasClientReaction
                : (threadUnread?.hasReaction ?? false)
              const unread =
                (isClient
                  ? clientUnread
                  : isInternal
                    ? internalUnread
                    : (threadUnread?.count ?? 0)) + (hasReaction ? 1 : 0)
              const isManuallyUnread = isClient
                ? isClientManuallyUnread
                : isInternal
                  ? isInternalManuallyUnread
                  : (threadUnread?.manuallyUnread ?? false)

              return (
                <ChatTabItem
                  key={chat.id}
                  chat={chat}
                  isActive={threadId === chat.id}
                  threadId={threadId}
                  unread={unread}
                  hasReaction={hasReaction}
                  reactionEmoji={reactionEmoji}
                  isManuallyUnread={isManuallyUnread}
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
        <MessengerTabContent
          key={threadId ?? 'default'}
          projectId={projectId}
          workspaceId={workspaceId}
          channel={channel}
          threadId={threadId}
          accent={currentChat?.accent_color ?? (channel === 'internal' ? 'dark' : 'blue')}
          toolbarPortalContainer={toolbarPortalContainer}
        />
      </div>
    </div>
  )
}
