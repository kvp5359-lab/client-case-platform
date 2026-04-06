import { createContext, useContext, useMemo } from 'react'
import type { ProjectMessage, MessageChannel } from '@/services/api/messenger/messengerService'
import type { MessengerAccent } from './utils/messageStyles'

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
  onForward?: (msg: ProjectMessage) => void
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
      onForward: value.onForward,
      onPublishDraft: value.onPublishDraft,
      onEditDraft: value.onEditDraft,
      isDelayedPending: value.isDelayedPending,
      getDelayedExpiresAt: value.getDelayedExpiresAt,
      onCancelDelayed: value.onCancelDelayed,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      value.onForward,
      value.onPublishDraft,
      value.onEditDraft,
      value.isDelayedPending,
      value.getDelayedExpiresAt,
      value.onCancelDelayed,
    ],
  )

  return <MessengerContext.Provider value={ctx}>{children}</MessengerContext.Provider>
}
