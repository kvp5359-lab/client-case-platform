import type { ProjectMessage, MessageVisibility } from '@/services/api/messenger/messengerService'
import type { MessengerAccent } from './MessageBubble'
import type { ComposerMode } from './ComposerVisibilitySwitch'
import type { TaskStatus } from '@/hooks/useStatuses'
import type { ForwardedAttachment } from '@/services/api/messenger/messengerService'

export type MessageInputProps = {
  projectId: string
  channel: string
  workspaceId: string
  threadId?: string
  replyTo: ProjectMessage | null
  onClearReply: () => void
  onSend: (
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
  ) => void
  isPending: boolean
  onTyping?: () => void
  accent?: MessengerAccent
  editingMessage: ProjectMessage | null
  onClearEdit: () => void
  onEdit: (
    messageId: string,
    content: string,
    draftFiles?: { keepAttachmentIds: string[]; newFiles: File[]; publish?: boolean },
  ) => void
  quoteText?: string | null
  /** Счётчик, растущий на каждый setQuoteText. Передаётся в useQuoteInsertion,
   *  чтобы повторное цитирование того же текста тоже триггерило вставку. */
  quoteNonce?: number
  onClearQuote?: () => void
  onOpenDocPicker?: () => void
  projectDocumentsCount?: number
  addFilesRef?: React.MutableRefObject<((files: File[]) => void) | null>
  /** Ref для вставки готового HTML в редактор (используется буфером пересылки). */
  insertContentRef?: React.MutableRefObject<((html: string) => void) | null>
  onDocumentDrop?: (documentId: string) => void
  forwardedAttachments?: ForwardedAttachment[]
  onRemoveForwardedAttachment?: (index: number) => void
  onSaveDraft?: (
    content: string,
    files?: File[],
    options?: { visibility?: MessageVisibility; notifySubscribers?: boolean },
  ) => void
  isSavingDraft?: boolean
  onSchedule?: (
    sendAt: Date,
    content: string,
    replyToId?: string | null,
    files?: File[],
    options?: { visibility?: MessageVisibility; notifySubscribers?: boolean },
  ) => void
  /** Если задан — отправка заблокирована (тултип на кнопке + Enter не шлёт).
   *  Напр. email-черновик без темы/получателя. */
  sendBlockedReason?: string | null
  /** Режим видимости (Клиенту/Команде/Заметка/Только я) — поднят в MessengerTabContent. */
  composerMode?: ComposerMode
  /** Участники для @-упоминаний. */
  mentionItems?: { id: string; label: string; avatarUrl?: string | null }[]
  /**
   * Pending-статус задачи (Planfix-style) — пикер поднят в MessengerTabContent,
   * сюда передаётся для коммита статуса при отправке. undefined — не task-тред.
   */
  statusPending?: {
    isTaskThread: boolean
    taskStatuses: TaskStatus[]
    currentStatusId: string | null
    effectivePendingStatusId: string | null
    handlePickStatus: (statusId: string | null) => void
    updateStatusMutation: {
      mutate: (
        vars: { threadId: string; statusId: string },
        opts?: { onSuccess?: () => void },
      ) => void
    }
    clearPending: () => void
  }
}
