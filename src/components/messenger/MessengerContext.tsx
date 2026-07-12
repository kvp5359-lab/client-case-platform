import { createContext, useContext, useMemo } from 'react'
import type { ProjectMessage, MessageChannel } from '@/services/api/messenger/messengerService'
import type { MessengerAccent } from './utils/messageStyles'

export type MessengerContextValue = {
  // Static per chat session
  currentParticipantId: string | null
  viewerRole?: string | null
  projectId?: string
  workspaceId?: string
  accent: MessengerAccent
  channel?: MessageChannel
  isAdmin?: boolean
  isTelegramLinked?: boolean
  /** В треде участвует клиент — включает подсветку сообщений сотрудников. */
  isClientThread?: boolean
  /**
   * Текущий зритель — клиент (все его workspace-роли = «Клиент»). Для клиента
   * подсветку «сотрудник» (кольцо/полоса) НЕ показываем — это внутренний маркер
   * команды, клиенту он не нужен.
   */
  viewerIsClient?: boolean
  /**
   * Тред — почтовый. Все исходящие в нём шлются email'ом, у которого нет
   * понятия реакции. Управляет видимостью UI быстрых реакций — независимо
   * от source конкретного сообщения, потому что наши исходящие через
   * web-форму попадают с source='web', хотя по факту это email.
   */
  isEmailThread?: boolean
  /** Тред — Telegram Business. Реакции через Bot API в 1-на-1 не работают. */
  isBusinessThread?: boolean
  /** Тред — Wazzup (WhatsApp/IG). Реакции через шлюз не доставляются. */
  isWazzupThread?: boolean
  /**
   * Контакт-собеседник треда (для личных диалогов email/wazzup/telegram).
   * Используется в баблах входящих сообщений как fallback при клике на аватарку:
   * у email-сообщений sender_participant_id=NULL, поэтому открываем карточку
   * контакта треда вместо отсутствующего sender'а.
   */
  threadContactParticipantId?: string | null

  // Callbacks
  onReply: (msg: ProjectMessage) => void
  onReact: (messageId: string, emoji: string) => void
  onEdit?: (msg: ProjectMessage) => void
  onDelete?: (messageId: string) => void
  onQuote?: (text: string) => void
  /** Разложить сообщение на блоки буфера пересылки (текст + файлы). */
  onForward?: (msg: ProjectMessage) => void
  currentThreadId?: string
  onPublishDraft?: (msg: ProjectMessage) => void
  onEditDraft?: (msg: ProjectMessage) => void
  onRetryTelegramSend?: (msg: ProjectMessage) => void

  // Delayed send
  isDelayedPending?: (messageId: string) => boolean
  getDelayedExpiresAt?: (messageId: string) => number | null
  onCancelDelayed?: (messageId: string) => void

  // Запланированная отправка (scheduled_send_at в будущем)
  onCancelScheduled?: (messageId: string) => void
  onSendScheduledNow?: (messageId: string) => void
  onReschedule?: (messageId: string, sendAt: Date) => void
}

const MessengerContext = createContext<MessengerContextValue | null>(null)

export function useMessengerContext(): MessengerContextValue {
  const ctx = useContext(MessengerContext)
  if (!ctx) {
    throw new Error('useMessengerContext must be used within <MessengerProvider>')
  }
  return ctx
}

type MessengerProviderProps = {
  children: React.ReactNode
} & MessengerContextValue

export function MessengerProvider({ children, ...value }: MessengerProviderProps) {
  const ctx = useMemo<MessengerContextValue>(
    () => ({
      currentParticipantId: value.currentParticipantId,
      viewerRole: value.viewerRole,
      projectId: value.projectId,
      workspaceId: value.workspaceId,
      accent: value.accent,
      channel: value.channel,
      isAdmin: value.isAdmin,
      isTelegramLinked: value.isTelegramLinked,
      isClientThread: value.isClientThread,
      viewerIsClient: value.viewerIsClient,
      isEmailThread: value.isEmailThread,
      isBusinessThread: value.isBusinessThread,
      isWazzupThread: value.isWazzupThread,
      threadContactParticipantId: value.threadContactParticipantId,
      onReply: value.onReply,
      onReact: value.onReact,
      onEdit: value.onEdit,
      onDelete: value.onDelete,
      onQuote: value.onQuote,
      onForward: value.onForward,
      currentThreadId: value.currentThreadId,
      onPublishDraft: value.onPublishDraft,
      onEditDraft: value.onEditDraft,
      onRetryTelegramSend: value.onRetryTelegramSend,
      isDelayedPending: value.isDelayedPending,
      getDelayedExpiresAt: value.getDelayedExpiresAt,
      onCancelDelayed: value.onCancelDelayed,
      onCancelScheduled: value.onCancelScheduled,
      onSendScheduledNow: value.onSendScheduledNow,
      onReschedule: value.onReschedule,
    }),

    [
      value.currentParticipantId,
      value.viewerRole,
      value.projectId,
      value.workspaceId,
      value.accent,
      value.channel,
      value.isAdmin,
      value.isTelegramLinked,
      value.isClientThread,
      value.viewerIsClient,
      value.isEmailThread,
      value.isBusinessThread,
      value.isWazzupThread,
      value.threadContactParticipantId,
      value.onReply,
      value.onReact,
      value.onEdit,
      value.onDelete,
      value.onQuote,
      value.onForward,
      value.currentThreadId,
      value.onPublishDraft,
      value.onEditDraft,
      value.onRetryTelegramSend,
      value.isDelayedPending,
      value.getDelayedExpiresAt,
      value.onCancelDelayed,
      value.onCancelScheduled,
      value.onSendScheduledNow,
      value.onReschedule,
    ],
  )

  return <MessengerContext.Provider value={ctx}>{children}</MessengerContext.Provider>
}
