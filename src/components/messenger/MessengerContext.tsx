import { createContext, useContext, useMemo } from 'react'
import type { ProjectMessage, MessageChannel } from '@/services/api/messenger/messengerService'
import type { MessengerAccent } from './utils/messageStyles'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'

export interface MessengerContextValue {
  // Static per chat session
  currentParticipantId: string | null
  viewerRole?: string | null
  projectId?: string
  workspaceId?: string
  accent: MessengerAccent
  channel?: MessageChannel
  isAdmin?: boolean
  isTelegramLinked?: boolean

  // Callbacks
  onReply: (msg: ProjectMessage) => void
  onReact: (messageId: string, emoji: string) => void
  onEdit?: (msg: ProjectMessage) => void
  onDelete?: (messageId: string) => void
  onQuote?: (text: string) => void
  onForwardToChat?: (msg: ProjectMessage, targetChatId: string) => void
  forwardChats?: ProjectThread[]
  currentThreadId?: string
  onPublishDraft?: (msg: ProjectMessage) => void
  onEditDraft?: (msg: ProjectMessage) => void

  // Delayed send
  isDelayedPending?: (messageId: string) => boolean
  getDelayedExpiresAt?: (messageId: string) => number | null
  onCancelDelayed?: (messageId: string) => void
}

const MessengerContext = createContext<MessengerContextValue | null>(null)

export function useMessengerContext(): MessengerContextValue {
  const ctx = useContext(MessengerContext)
  if (!ctx) {
    throw new Error('useMessengerContext must be used within <MessengerProvider>')
  }
  return ctx
}

interface MessengerProviderProps extends MessengerContextValue {
  children: React.ReactNode
}

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
      onReply: value.onReply,
      onReact: value.onReact,
      onEdit: value.onEdit,
      onDelete: value.onDelete,
      onQuote: value.onQuote,
      onForwardToChat: value.onForwardToChat,
      forwardChats: value.forwardChats,
      currentThreadId: value.currentThreadId,
      onPublishDraft: value.onPublishDraft,
      onEditDraft: value.onEditDraft,
      isDelayedPending: value.isDelayedPending,
      getDelayedExpiresAt: value.getDelayedExpiresAt,
      onCancelDelayed: value.onCancelDelayed,
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
      value.onReply,
      value.onReact,
      value.onEdit,
      value.onDelete,
      value.onQuote,
      value.onForwardToChat,
      value.forwardChats,
      value.currentThreadId,
      value.onPublishDraft,
      value.onEditDraft,
      value.isDelayedPending,
      value.getDelayedExpiresAt,
      value.onCancelDelayed,
    ],
  )

  return <MessengerContext.Provider value={ctx}>{children}</MessengerContext.Provider>
}
