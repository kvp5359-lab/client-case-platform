/**
 * Core state and data hooks for MessengerTabContent
 */

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  useProjectMessages,
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
  useMarkAsRead,
  useMarkAsUnread,
  useUnreadCount,
  useLastReadAt,
  useToggleReaction,
  useTelegramLink,
  useTypingIndicator,
  useMessageSearch,
  useSaveDraft,
  useUpdateDraft,
  usePublishDraft,
} from '@/hooks/messenger'
import type { MessageChannel } from '@/services/api/messenger/messengerService'
import { useWorkspacePermissions } from '@/hooks/permissions/useWorkspacePermissions'
import {
  getCurrentProjectParticipant,
  getCurrentWorkspaceParticipant,
  type ProjectMessage,
} from '@/services/api/messenger/messengerService'
import { useIsManuallyUnread, useHasUnreadReaction } from '@/hooks/messenger/useInbox'
import { useDelayedSend } from '@/hooks/messenger/useDelayedSend'
import { useEmailLink } from '@/hooks/email/useEmailLink'
import { useSendEmail } from '@/hooks/email/useSendEmail'
// import { useChatState } from '@/hooks/messenger/useChatState'
import { useDocumentPickerLogic } from './useDocumentPickerLogic'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { stripHtmlKeepNewlines } from '@/utils/format/messengerHtml'
import type { ForwardedAttachment } from '@/services/api/messenger/messengerService'

interface UseMessengerStateParams {
  projectId?: string
  workspaceId: string
  channel: MessageChannel
  threadId?: string
  telegramDialogOpen: boolean
}

export function useMessengerState({
  projectId,
  workspaceId,
  channel,
  threadId,
  telegramDialogOpen,
}: UseMessengerStateParams) {
  const { user } = useAuth()

  const [replyTo, setReplyTo] = useState<ProjectMessage | null>(null)
  const [editingMessage, setEditingMessage] = useState<ProjectMessage | null>(null)
  const [quoteText, setQuoteText] = useState<string | null>(null)
  const [forwardedAttachments, setForwardedAttachments] = useState<ForwardedAttachment[]>([])
  const [sendTrigger, setSendTrigger] = useState(0)

  // TODO: включить когда RPC get_chat_state будет создан в Supabase
  // useChatState(threadId, projectId, workspaceId, channel)

  const { isLinked, telegramLink, linkCode, isLoadingCode, unlink, isUnlinking } = useTelegramLink(
    projectId,
    channel,
    threadId,
    telegramDialogOpen,
  )

  const { data: emailLink } = useEmailLink(threadId)
  const isEmailChat = !!emailLink

  const { data: currentParticipant } = useQuery({
    queryKey: ['messenger', 'current-participant', projectId ?? workspaceId, user?.id],
    queryFn: () =>
      projectId
        ? getCurrentProjectParticipant(projectId, user!.id)
        : getCurrentWorkspaceParticipant(workspaceId, user!.id),
    enabled: !!(projectId || workspaceId) && !!user,
    staleTime: Infinity,
  })

  const {
    messages,
    isLoading,
    fetchOlderMessages,
    hasMoreOlder,
    isFetchingOlder,
    latestPageMessageCount,
  } = useProjectMessages(projectId, channel, threadId)

  const sendMessage = useSendMessage(
    projectId,
    workspaceId,
    currentParticipant ?? undefined,
    channel,
    threadId,
  )
  const sendEmail = useSendEmail(projectId ?? '', workspaceId, threadId)

  const editMessageMutation = useEditMessage(projectId, channel, threadId)
  const deleteMessageMutation = useDeleteMessage(projectId, channel, threadId)
  const saveDraftMutation = useSaveDraft(projectId, workspaceId, channel, threadId)
  const updateDraftMutation = useUpdateDraft(projectId, workspaceId, channel, threadId)
  const publishDraftMutation = usePublishDraft(projectId, workspaceId, channel, threadId)

  const {
    sendDelay,
    sendWithDelay,
    scheduleExistingDraft,
    cancelDelayedSend,
    isPending: isDelayedPending,
    getExpiresAt,
  } = useDelayedSend(projectId, workspaceId, channel, threadId)

  const { isOwner, can } = useWorkspacePermissions({ workspaceId })
  const isAdmin = isOwner || can('edit_all_projects')

  const pid = currentParticipant?.participantId
  const markAsRead = useMarkAsRead(projectId, workspaceId, channel, pid, threadId)
  const markAsUnread = useMarkAsUnread(projectId, workspaceId, channel, pid, threadId)
  const { data: unreadCount = 0 } = useUnreadCount(projectId, channel, pid, threadId)
  const { data: isManuallyUnread = false } = useIsManuallyUnread(
    workspaceId,
    projectId ?? '',
    channel,
    threadId,
  )
  const { data: hasUnreadReaction = false } = useHasUnreadReaction(
    workspaceId,
    projectId ?? '',
    channel,
    threadId,
  )
  const { data: lastReadAt } = useLastReadAt(projectId, channel, pid, threadId)
  const toggleReaction = useToggleReaction(projectId, channel, pid, workspaceId, threadId)

  const { typingUsers, startTyping, stopTyping } = useTypingIndicator(
    projectId,
    currentParticipant?.participantId ?? null,
    currentParticipant?.name ?? null,
    channel,
    threadId,
  )

  const { searchQuery, setSearchQuery, searchResults, isSearching, isSearchActive, resultCount } =
    useMessageSearch(projectId, channel, threadId)

  const documentPickerLogic = useDocumentPickerLogic(projectId ?? '', workspaceId)

  // Handle pending initial message from chat creation
  const pendingInitialMessage = useSidePanelStore((s) => s.pendingInitialMessage)
  const setPendingInitialMessage = useSidePanelStore((s) => s.setPendingInitialMessage)
  const initialSendStartedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!pendingInitialMessage || !threadId) return
    if (pendingInitialMessage.threadId !== threadId) return
    if (initialSendStartedRef.current === threadId) return
    initialSendStartedRef.current = threadId

    const pending = pendingInitialMessage
    setPendingInitialMessage(null)

    if (pending.isEmail) {
      sendEmail.mutate({
        threadId,
        content: pending.html,
        files: pending.files.length > 0 ? pending.files : undefined,
      })
    } else {
      sendMessage.mutate({
        content: pending.html,
        attachments: pending.files.length > 0 ? pending.files : undefined,
      })
    }
  }, [pendingInitialMessage, threadId, sendEmail, sendMessage, setPendingInitialMessage])

  // Подхватываем документы, проброшенные из FloatingBatchActions → sendDocumentsToMessenger
  const pendingMessengerDocuments = useSidePanelStore((s) => s.pendingMessengerDocuments)
  const clearPendingMessengerDocuments = useSidePanelStore((s) => s.clearPendingMessengerDocuments)
  const handleConfirmDocPickerRef = useRef(documentPickerLogic.handleConfirmDocPicker)
  useEffect(() => {
    handleConfirmDocPickerRef.current = documentPickerLogic.handleConfirmDocPicker
  })
  useEffect(() => {
    if (!pendingMessengerDocuments) return
    if (pendingMessengerDocuments.channel !== channel) return
    clearPendingMessengerDocuments()
    handleConfirmDocPickerRef.current(new Set(pendingMessengerDocuments.ids))
  }, [pendingMessengerDocuments, channel, clearPendingMessengerDocuments])

  // Подхватываем пересылку сообщения из другого канала
  const pendingForwardMessage = useSidePanelStore((s) => s.pendingForwardMessage)
  const clearPendingForwardMessage = useSidePanelStore((s) => s.clearPendingForwardMessage)
  const setQuoteTextRef = useRef(setQuoteText)
  useEffect(() => {
    setQuoteTextRef.current = setQuoteText
  })
  const setForwardedAttachmentsRef = useRef(setForwardedAttachments)
  useEffect(() => {
    setForwardedAttachmentsRef.current = setForwardedAttachments
  })

  useEffect(() => {
    if (!pendingForwardMessage) return
    if (pendingForwardMessage.targetChatId !== threadId) return
    clearPendingForwardMessage()

    const plainText = stripHtmlKeepNewlines(pendingForwardMessage.content)
    if (plainText.trim() && plainText !== '📎') {
      setQuoteTextRef.current(plainText)
    }

    if (pendingForwardMessage.attachments?.length) {
      const fwdAtts: ForwardedAttachment[] = pendingForwardMessage.attachments
        .filter((a) => a.file_id)
        .map((a) => ({
          file_id: a.file_id!,
          file_name: a.file_name,
          file_size: a.file_size,
          mime_type: a.mime_type,
          storage_path: a.storage_path,
        }))
      setForwardedAttachmentsRef.current(fwdAtts)
    }
  }, [pendingForwardMessage, threadId, clearPendingForwardMessage])

  const showUnread = unreadCount > 0 || isManuallyUnread || hasUnreadReaction

  return {
    // Auth & participant
    user,
    currentParticipant,
    isAdmin,
    // Messages
    messages,
    isLoading,
    fetchOlderMessages,
    hasMoreOlder,
    isFetchingOlder,
    latestPageMessageCount,
    // Mutations
    sendMessage,
    sendEmail,
    editMessageMutation,
    deleteMessageMutation,
    saveDraftMutation,
    updateDraftMutation,
    publishDraftMutation,
    // Delayed send
    sendDelay,
    sendWithDelay,
    scheduleExistingDraft,
    cancelDelayedSend,
    isDelayedPending,
    getExpiresAt,
    // Read/unread
    markAsRead,
    markAsUnread,
    showUnread,
    lastReadAt,
    // Reactions
    toggleReaction,
    // Typing
    typingUsers,
    startTyping,
    stopTyping,
    // Search
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    isSearchActive,
    resultCount,
    // Document picker
    documentPickerLogic,
    // Telegram
    isLinked,
    telegramLink,
    linkCode,
    isLoadingCode,
    unlink,
    isUnlinking,
    // Email
    emailLink,
    isEmailChat,
    // Local state
    replyTo,
    setReplyTo,
    editingMessage,
    setEditingMessage,
    quoteText,
    setQuoteText,
    forwardedAttachments,
    setForwardedAttachments,
    sendTrigger,
    setSendTrigger,
  }
}
