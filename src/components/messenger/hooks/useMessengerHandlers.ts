/**
 * Action handlers for MessengerTabContent
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { playSendSound } from '@/hooks/messenger'

/**
 * Gmail API ограничивает raw email размером 25 МБ. С учётом base64-кодировки
 * (×1.33), памяти edge function (держит и bytes и base64 одновременно) и
 * самого raw email в памяти — практический потолок суммарного binary ~15 МБ.
 * Выше — функция падает по WORKER_RESOURCE_LIMIT, и письмо не уходит.
 */
const EMAIL_ATTACHMENTS_MAX_BYTES = 15 * 1024 * 1024

export function totalAttachmentsSize(files: File[]): number {
  return files.reduce((sum, f) => sum + f.size, 0)
}

export function checkEmailAttachmentsLimit(files: File[]): {
  ok: boolean
  totalMb: string
} {
  const totalBytes = totalAttachmentsSize(files)
  return {
    ok: totalBytes <= EMAIL_ATTACHMENTS_MAX_BYTES,
    totalMb: (totalBytes / 1024 / 1024).toFixed(1),
  }
}
import type { MessageChannel, MessageVisibility } from '@/services/api/messenger/messengerService'
import { type ProjectMessage } from '@/services/api/messenger/messengerService'
import { useSidePanelStore } from '@/store/sidePanelStore'
import type { ForwardedAttachment } from '@/services/api/messenger/messengerService'
import { stripHtml } from '@/utils/format/messengerHtml'

type UseMessengerHandlersParams = {
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
      originalContent?: string | null
      originalLanguage?: string | null
      visibility?: MessageVisibility
      notifySubscribers?: boolean
      mentions?: string[]
    }) => void
  }
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
      visibility?: MessageVisibility
      notifySubscribers?: boolean
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
  retryTelegramSendMutation: {
    mutate: (args: { message: ProjectMessage }) => void
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
  channel: _channel,
  threadId: _threadId,
  isEmailChat,
  currentParticipant,
  sendMessage,
  editMessageMutation,
  saveDraftMutation,
  updateDraftMutation,
  publishDraftMutation,
  retryTelegramSendMutation,
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
  const addToForwardBuffer = useSidePanelStore((s) => s.addToForwardBuffer)

  const handleSend = useCallback(
    async (
      content: string,
      replyToId?: string | null,
      files?: File[],
      options?: {
        originalContent?: string | null
        originalLanguage?: string | null
        visibility?: MessageVisibility
        notifySubscribers?: boolean
        mentions?: string[]
      },
    ) => {
      // Email-чаты теперь идут через обычный sendMessage → INSERT project_messages
      // (source='web') → триггер notify_telegram_on_new_message видит type='email'
      // и зовёт email-internal-send (Gmail OAuth / Resend). Старый прямой путь
      // через gmail-send удалён — он минул триггер, цитировал по-старому и не
      // заполнял email_message_id/in_reply_to/references, из-за чего письма у
      // клиента отделялись в новый тред. Старый хук useSendEmail (прямой invoke
      // gmail-send) и оптимистичный useOptimisticEmail удалены 2026-07-12 —
      // цепочка была инертна (mutate не вызывался), только путала.

      // Лимит email-вложений (15 МБ). Без проверки edge function падает по
      // WORKER_RESOURCE_LIMIT, и письмо вообще не уходит.
      if (isEmailChat && files && files.length > 0) {
        const check = checkEmailAttachmentsLimit(files)
        if (!check.ok) {
          toast.error(
            `Слишком большой объём вложений: ${check.totalMb} МБ. За одно письмо принимается не больше 15 МБ. Разбейте на несколько писем.`,
            { duration: 8000 },
          )
          return
        }
      }

      // Отложенная отправка (с «Отменить») — только для обычного сообщения клиенту.
      // Внутренние (team/self) идут сразу через mutate, минуя delay-путь.
      if (
        sendDelay > 0 &&
        (options?.visibility ?? 'client') === 'client' &&
        currentParticipant &&
        !replyToId &&
        forwardedAttachments.length === 0
      ) {
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
        originalContent: options?.originalContent ?? null,
        originalLanguage: options?.originalLanguage ?? null,
        visibility: options?.visibility ?? 'client',
        notifySubscribers: options?.notifySubscribers ?? true,
        mentions: options?.mentions ?? [],
      })
      setReplyTo(null)
      setForwardedAttachments([])
      stopTyping()
      setSendTrigger((prev) => prev + 1)
    },
    [
      sendMessage,
      isEmailChat,
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

  // «Переслать сообщение»: раскладываем на гранулярные блоки буфера —
  // текстовый блок (если есть текст) + по блоку на каждое вложение. В буфере
  // их можно отметить по отдельности.
  const handleForward = useCallback(
    (msg: ProjectMessage) => {
      let added = 0
      const text = stripHtml(msg.content).trim()
      if (text && text !== '📎') {
        addToForwardBuffer({
          id: crypto.randomUUID(),
          kind: 'text',
          sourceMessageId: msg.id,
          fromAuthorName: msg.sender_name,
          content: msg.content,
          attachments: [],
        })
        added++
      }
      for (const a of msg.attachments ?? []) {
        addToForwardBuffer({
          id: crypto.randomUUID(),
          kind: 'file',
          sourceMessageId: msg.id,
          fromAuthorName: msg.sender_name,
          content: '',
          attachments: [
            {
              file_id: a.file_id,
              file_name: a.file_name,
              file_size: a.file_size,
              mime_type: a.mime_type,
              storage_path: a.storage_path,
            },
          ],
        })
        added++
      }
      if (added > 0) toast.success('Добавлено к пересылке')
    },
    [addToForwardBuffer],
  )

  const handleSaveDraft = useCallback(
    (
      content: string,
      files?: File[],
      options?: { visibility?: MessageVisibility; notifySubscribers?: boolean },
    ) => {
      if (!currentParticipant) return
      saveDraftMutation.mutate({
        content,
        senderParticipantId: currentParticipant.participantId,
        senderName: currentParticipant.name,
        senderRole: currentParticipant.role,
        attachments: files,
        visibility: options?.visibility,
        notifySubscribers: options?.notifySubscribers,
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

  const handleRetryTelegramSend = useCallback(
    (msg: ProjectMessage) => {
      retryTelegramSendMutation.mutate({ message: msg })
    },
    [retryTelegramSendMutation],
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
    handleRetryTelegramSend,
    handleCancelDelayed,
  }
}
