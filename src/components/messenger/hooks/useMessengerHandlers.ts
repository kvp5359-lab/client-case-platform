/**
 * Action handlers for MessengerTabContent
 */

import { useCallback } from 'react'
import { playSendSound } from '@/hooks/messenger'
import type { MessageChannel } from '@/services/api/messengerService'
import { type ProjectMessage } from '@/services/api/messengerService'
import { useSidePanelStore } from '@/store/sidePanelStore'
import type { ForwardedAttachment } from '@/services/api/messengerService'

interface UseMessengerHandlersParams {
  channel: MessageChannel
  threadId?: string
  projectId?: string
  isEmailChat: boolean
  currentParticipant:
    | { participantId: string; name: string; role: string | null }
    | null
    | undefined
  sendMessage: {
    mutate: (args: {
      content: string
      replyToMessageId?: string | null
      replyToMessage?: ProjectMessage | null
      attachments?: File[]
      forwardedAttachments?: ForwardedAttachment[]
    }) => void
  }
  sendEmail: { mutate: (args: { threadId: string; content: string; files?: File[] }) => void }
  editMessageMutation: {
    mutate: (args: {
      messageId: string
      content: string
      senderName: string
      senderRole: string | null
    }) => void
  }
  saveDraftMutation: {
    mutate: (args: {
      content: string
      senderParticipantId: string
      senderName: string
      senderRole: string | null
      attachments?: File[]
    }) => void
    isPending: boolean
  }
  updateDraftMutation: {
    mutate: (
      args: { messageId: string; content: string; keepAttachmentIds?: string[]; newFiles?: File[] },
      options?: { onSuccess?: () => void },
    ) => void
  }
  publishDraftMutation: {
    mutate: (args: {
      messageId: string
      senderName: string
      senderRole: string | null
      participantId: string
    }) => void
  }
  sendDelay: number
  sendWithDelay: (args: {
    content: string
    senderParticipantId: string
    senderName: string
    senderRole: string | null
    attachments?: File[]
  }) => Promise<boolean | null>
  scheduleExistingDraft: (
    messageId: string,
    content: string,
    senderName: string,
    senderRole: string | null,
  ) => void
  cancelDelayedSend: (messageId: string) => Promise<ProjectMessage | null>
  replyTo: ProjectMessage | null
  forwardedAttachments: ForwardedAttachment[]
  stopTyping: () => void
  setReplyTo: (msg: ProjectMessage | null) => void
  setEditingMessage: (msg: ProjectMessage | null) => void
  setForwardedAttachments: (
    fn: ((prev: ForwardedAttachment[]) => ForwardedAttachment[]) | ForwardedAttachment[],
  ) => void
  setSendTrigger: (fn: (prev: number) => number) => void
  editingMessage: ProjectMessage | null
}

export function useMessengerHandlers({
  channel,
  threadId,
  isEmailChat,
  currentParticipant,
  sendMessage,
  sendEmail,
  editMessageMutation,
  saveDraftMutation,
  updateDraftMutation,
  publishDraftMutation,
  sendDelay,
  sendWithDelay,
  scheduleExistingDraft,
  cancelDelayedSend,
  replyTo,
  forwardedAttachments,
  stopTyping,
  setReplyTo,
  setEditingMessage,
  setForwardedAttachments,
  setSendTrigger,
  editingMessage,
}: UseMessengerHandlersParams) {
  const forwardMessageToChannel = useSidePanelStore((s) => s.forwardMessageToChannel)

  const handleSend = useCallback(
    async (content: string, replyToId?: string | null, files?: File[]) => {
      if (isEmailChat && threadId) {
        sendEmail.mutate({ threadId, content, files })
        stopTyping()
        setSendTrigger((prev) => prev + 1)
        return
      }

      if (sendDelay > 0 && currentParticipant && !replyToId && forwardedAttachments.length === 0) {
        const delayed = await sendWithDelay({
          content,
          senderParticipantId: currentParticipant.participantId,
          senderName: currentParticipant.name,
          senderRole: currentParticipant.role,
          attachments: files,
        })
        if (delayed) {
          playSendSound()
          setReplyTo(null)
          stopTyping()
          setSendTrigger((prev) => prev + 1)
          setTimeout(() => setSendTrigger((prev) => prev + 1), 500)
          return
        }
      }

      playSendSound()
      sendMessage.mutate({
        content,
        replyToMessageId: replyToId,
        replyToMessage: replyTo,
        attachments: files,
        forwardedAttachments: forwardedAttachments.length > 0 ? forwardedAttachments : undefined,
      })
      setReplyTo(null)
      setForwardedAttachments([])
      stopTyping()
      setSendTrigger((prev) => prev + 1)
    },
    [
      sendMessage,
      sendEmail,
      isEmailChat,
      threadId,
      replyTo,
      forwardedAttachments,
      stopTyping,
      sendDelay,
      sendWithDelay,
      currentParticipant,
      setReplyTo,
      setForwardedAttachments,
      setSendTrigger,
    ],
  )

  const handleEdit = (
    messageId: string,
    content: string,
    draftFiles?: { keepAttachmentIds: string[]; newFiles: File[]; publish?: boolean },
  ) => {
    if (!currentParticipant) return
    if (editingMessage?.is_draft) {
      updateDraftMutation.mutate(
        {
          messageId,
          content,
          keepAttachmentIds: draftFiles?.keepAttachmentIds,
          newFiles: draftFiles?.newFiles,
        },
        {
          onSuccess: () => {
            if (draftFiles?.publish) {
              if (sendDelay > 0) {
                scheduleExistingDraft(
                  messageId,
                  content,
                  currentParticipant.name,
                  currentParticipant.role,
                )
                setSendTrigger((prev) => prev + 1)
                setTimeout(() => setSendTrigger((prev) => prev + 1), 500)
              } else {
                publishDraftMutation.mutate({
                  messageId,
                  senderName: currentParticipant.name,
                  senderRole: currentParticipant.role,
                  participantId: currentParticipant.participantId,
                })
              }
            }
          },
        },
      )
      return
    }
    editMessageMutation.mutate({
      messageId,
      content,
      senderName: currentParticipant.name,
      senderRole: currentParticipant.role,
    })
  }

  const handleStartEdit = (msg: ProjectMessage) => {
    setEditingMessage(msg)
    setReplyTo(null)
  }

  const handleForward = useCallback(
    (msg: ProjectMessage) => {
      const targetChannel = channel === 'client' ? 'internal' : 'client'
      forwardMessageToChannel({
        senderName: msg.sender_name,
        content: msg.content,
        attachments: msg.attachments?.map((a) => ({
          file_name: a.file_name,
          file_size: a.file_size,
          mime_type: a.mime_type,
          storage_path: a.storage_path,
          file_id: a.file_id,
        })),
        targetChannel,
      })
    },
    [channel, forwardMessageToChannel],
  )

  const handleSaveDraft = useCallback(
    (content: string, files?: File[]) => {
      if (!currentParticipant) return
      saveDraftMutation.mutate({
        content,
        senderParticipantId: currentParticipant.participantId,
        senderName: currentParticipant.name,
        senderRole: currentParticipant.role,
        attachments: files,
      })
    },
    [currentParticipant, saveDraftMutation],
  )

  const handleEditDraft = useCallback(
    (msg: ProjectMessage) => {
      setEditingMessage(msg)
      setReplyTo(null)
    },
    [setEditingMessage, setReplyTo],
  )

  const handlePublishDraft = useCallback(
    (msg: ProjectMessage) => {
      if (!currentParticipant) return
      publishDraftMutation.mutate({
        messageId: msg.id,
        senderName: currentParticipant.name,
        senderRole: currentParticipant.role,
        participantId: currentParticipant.participantId,
      })
    },
    [currentParticipant, publishDraftMutation],
  )

  const handleCancelDelayed = useCallback(
    async (messageId: string) => {
      const msg = await cancelDelayedSend(messageId)
      if (msg) {
        setEditingMessage(msg)
        setReplyTo(null)
      }
    },
    [cancelDelayedSend, setEditingMessage, setReplyTo],
  )

  return {
    handleSend,
    handleEdit,
    handleStartEdit,
    handleForward,
    handleSaveDraft,
    handleEditDraft,
    handlePublishDraft,
    handleCancelDelayed,
  }
}
