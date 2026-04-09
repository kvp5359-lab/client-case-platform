/**
 * Main container for "Messages" tab
 */

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { MessageChannel } from '@/services/api/messenger/messengerService'
import { messengerKeys } from '@/hooks/queryKeys'
import { MessageList } from './MessageList'
import type { MessengerAccent } from './MessageBubble'
import { MessengerProvider } from './MessengerContext'
import { MessageInput } from './MessageInput'
import { TelegramLinkDialog } from './TelegramLinkDialog'
import { EmailLinkDialog } from './EmailLinkDialog'
import { TypingIndicator } from './TypingIndicator'
import { DocumentPickerDialog } from './DocumentPickerDialog'
import { ChatToolbar } from './ChatToolbar'
import { ReadUnreadButton } from './ReadUnreadButton'
import { EmailSubjectBar } from './EmailSubjectBar'
import { useMessengerState } from './hooks/useMessengerState'
import { useMessengerHandlers } from './hooks/useMessengerHandlers'
import { useOptimisticEmail } from './hooks/useOptimisticEmail'
import { useProjectThreads } from '@/hooks/messenger/useProjectThreads'

interface MessengerTabContentProps {
  projectId?: string
  workspaceId: string
  accent?: MessengerAccent
  channel?: MessageChannel
  threadId?: string
  toolbarPortalContainer?: HTMLDivElement | null
}

export function MessengerTabContent({
  projectId,
  workspaceId,
  accent = 'blue',
  channel = 'client',
  threadId,
  toolbarPortalContainer,
}: MessengerTabContentProps) {
  const queryClient = useQueryClient()
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false)
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { data: allThreads = [] } = useProjectThreads(projectId)

  const state = useMessengerState({
    projectId,
    workspaceId,
    channel,
    threadId,
    telegramDialogOpen,
  })

  const handlers = useMessengerHandlers({
    channel,
    threadId,
    projectId,
    isEmailChat: state.isEmailChat,
    currentParticipant: state.currentParticipant,
    sendMessage: state.sendMessage,
    sendEmail: state.sendEmail,
    editMessageMutation: state.editMessageMutation,
    saveDraftMutation: state.saveDraftMutation,
    updateDraftMutation: state.updateDraftMutation,
    publishDraftMutation: state.publishDraftMutation,
    sendDelay: state.sendDelay,
    sendWithDelay: state.sendWithDelay,
    scheduleExistingDraft: state.scheduleExistingDraft,
    cancelDelayedSend: state.cancelDelayedSend,
    replyTo: state.replyTo,
    forwardedAttachments: state.forwardedAttachments,
    stopTyping: state.stopTyping,
    setReplyTo: state.setReplyTo,
    setEditingMessage: state.setEditingMessage,
    setForwardedAttachments: state.setForwardedAttachments,
    setSendTrigger: state.setSendTrigger,
    editingMessage: state.editingMessage,
  })

  const handleReact = useCallback(
    (msgId: string, emoji: string) => state.toggleReaction.mutate({ messageId: msgId, emoji }),
    [state.toggleReaction],
  )

  const handleDelete = useCallback(
    (messageId: string) => state.deleteMessageMutation.mutate(messageId),
    [state.deleteMessageMutation],
  )

  const displayMessages = useOptimisticEmail({
    messages: state.messages,
    searchResults: state.searchResults,
    isSearchActive: state.isSearchActive,
    projectId,
    workspaceId,
    threadId,
    currentParticipant: state.currentParticipant,
    sendEmail: state.sendEmail,
  })

  const toolbarContent = (
    <ChatToolbar
      searchQuery={state.searchQuery}
      onSearchChange={state.setSearchQuery}
      searchOpen={searchOpen}
      onSearchToggle={() => {
        setSearchOpen(!searchOpen)
        if (searchOpen) state.setSearchQuery('')
      }}
      resultCount={state.resultCount}
      isSearching={state.isSearching}
      isEmailChat={state.isEmailChat}
      isLinked={state.isLinked}
      telegramChatTitle={state.telegramLink?.telegram_chat_title ?? null}
      contactEmail={state.emailLink?.contact_email ?? null}
      onTelegramClick={() => setTelegramDialogOpen(true)}
      onEmailClick={() => setEmailDialogOpen(true)}
    />
  )

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {toolbarPortalContainer ? (
        createPortal(toolbarContent, toolbarPortalContainer)
      ) : (
        <div className="relative flex items-center px-4 py-2 bg-muted/30">
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-border via-border/40 to-transparent" />
          {toolbarContent}
        </div>
      )}

      <MessengerProvider
        currentParticipantId={state.currentParticipant?.participantId ?? null}
        viewerRole={state.currentParticipant?.role}
        projectId={projectId}
        workspaceId={workspaceId}
        accent={accent}
        channel={channel}
        isAdmin={state.isAdmin}
        isTelegramLinked={state.isLinked}
        onReply={state.setReplyTo}
        onReact={handleReact}
        onEdit={handlers.handleStartEdit}
        onDelete={handleDelete}
        onQuote={state.setQuoteText}
        onForwardToChat={handlers.handleForwardToChat}
        forwardChats={allThreads}
        currentThreadId={threadId}
        onPublishDraft={handlers.handlePublishDraft}
        onEditDraft={handlers.handleEditDraft}
        isDelayedPending={state.isDelayedPending}
        getDelayedExpiresAt={state.getExpiresAt}
        onCancelDelayed={handlers.handleCancelDelayed}
      >
      <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
        {state.isEmailChat && (
          <EmailSubjectBar
            subject={state.emailLink?.subject}
            contactEmail={state.emailLink?.contact_email}
          />
        )}

        <MessageList
          messages={displayMessages}
          isLoading={state.isLoading}
          hasMoreOlder={state.isSearchActive ? false : state.hasMoreOlder}
          isFetchingOlder={state.isFetchingOlder}
          lastReadAt={state.lastReadAt ?? undefined}
          onFetchOlder={state.fetchOlderMessages}
          scrollToBottomTrigger={state.sendTrigger}
          auditEvents={state.auditEvents}
        />

        {/* Кнопка Прочитано/Непрочитано — наезжает на список через negative margin */}
        <div className="flex justify-center -mt-8 mb-1 relative z-10 pointer-events-none">
          <ReadUnreadButton
            showUnread={state.showUnread}
            onMarkRead={() => state.markAsRead.mutate()}
            onMarkUnread={() => state.markAsUnread.mutate()}
            isMarkReadPending={state.markAsRead.isPending}
            isMarkUnreadPending={state.markAsUnread.isPending}
          />
        </div>

        <TypingIndicator typingUsers={state.typingUsers} />

        <MessageInput
          projectId={projectId ?? ''}
          channel={channel}
          workspaceId={workspaceId}
          threadId={threadId}
          replyTo={state.replyTo}
          onClearReply={() => state.setReplyTo(null)}
          onSend={handlers.handleSend}
          isPending={
            state.sendMessage.isPending ||
            state.sendEmail.isPending ||
            state.editMessageMutation.isPending
          }
          onTyping={state.startTyping}
          accent={accent}
          editingMessage={state.editingMessage}
          onClearEdit={() => state.setEditingMessage(null)}
          onEdit={handlers.handleEdit}
          quoteText={state.quoteText}
          onClearQuote={() => state.setQuoteText(null)}
          onOpenDocPicker={state.documentPickerLogic.handleOpenDocPicker}
          projectDocumentsCount={state.documentPickerLogic.projectDocuments.length}
          addFilesRef={state.documentPickerLogic.addFilesRef}
          onDocumentDrop={state.documentPickerLogic.handleDocumentDrop}
          forwardedAttachments={state.forwardedAttachments}
          onRemoveForwardedAttachment={(index) =>
            state.setForwardedAttachments((prev) => prev.filter((_, i) => i !== index))
          }
          onSaveDraft={handlers.handleSaveDraft}
          isSavingDraft={state.saveDraftMutation.isPending}
        />
      </div>

      <TelegramLinkDialog
        open={telegramDialogOpen}
        onClose={() => {
          setTelegramDialogOpen(false)
          queryClient.invalidateQueries({
            queryKey: messengerKeys.telegramLink(projectId ?? '', channel),
          })
        }}
        isLinked={state.isLinked}
        chatTitle={state.telegramLink?.telegram_chat_title ?? null}
        linkCode={state.linkCode}
        isLoadingCode={state.isLoadingCode}
        onUnlink={state.unlink}
        isUnlinking={state.isUnlinking}
        channel={channel}
      />

      <EmailLinkDialog
        open={emailDialogOpen}
        onClose={() => setEmailDialogOpen(false)}
        chatId={threadId}
        emailLink={state.emailLink ?? null}
      />

      <DocumentPickerDialog
        key={state.documentPickerLogic.docPickerKey}
        open={state.documentPickerLogic.docPickerOpen}
        onOpenChange={state.documentPickerLogic.setDocPickerOpen}
        documents={state.documentPickerLogic.projectDocuments}
        statusMap={state.documentPickerLogic.statusMap}
        onConfirm={state.documentPickerLogic.handleConfirmDocPicker}
        confirmLabel="Прикрепить"
        isLoading={state.documentPickerLogic.isDownloading}
      />

      </MessengerProvider>
    </div>
  )
}
