"use client"

/**
 * useDelayedSend — manages delayed message sending with countdown and cancel.
 *
 * Flow: send → save as draft with scheduled_send_at → countdown → publishDraft.
 * Cancel: delete draft, return content to editor.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/hooks/useWorkspace'
import {
  saveDraftMessage,
  publishDraftMessage,
  markAsRead,
  type ProjectMessage,
  type MessageChannel,
} from '@/services/api/messenger/messengerService'
import { messengerKeys, inboxKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface PendingMessage {
  messageId: string
  content: string
  expiresAt: number // Date.now() + delay
  attachments?: ProjectMessage['attachments']
}

export function useDelayedSend(
  projectId: string | undefined,
  workspaceId: string,
  channel: MessageChannel = 'client',
  threadId?: string,
) {
  const queryClient = useQueryClient()
  const [pendingMessages, setPendingMessages] = useState<Map<string, PendingMessage>>(new Map())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const messagesKey = threadId
    ? messengerKeys.messagesByThreadId(threadId)
    : messengerKeys.messages(projectId ?? '', channel)

  const { data: workspace } = useWorkspace(workspaceId)
  const sendDelay = ((workspace as Record<string, unknown>)?.send_delay_seconds as number) ?? 0

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  const invalidateMessages = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: messagesKey })
    queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
  }, [queryClient, messagesKey, workspaceId])

  /**
   * Send with delay: save as draft with scheduled_send_at, start countdown.
   * Returns true if delayed, false if delay=0 (caller should send normally).
   */
  const sendWithDelay = useCallback(
    async (params: {
      content: string
      senderParticipantId: string
      senderName: string
      senderRole: string | null
      attachments?: File[]
    }): Promise<boolean> => {
      if (sendDelay <= 0) return false

      try {
        const message = await saveDraftMessage({
          projectId,
          workspaceId,
          content: params.content,
          senderParticipantId: params.senderParticipantId,
          senderName: params.senderName,
          senderRole: params.senderRole,
          attachments: params.attachments,
          channel,
          threadId,
        })

        // Set scheduled_send_at
        const scheduledAt = new Date(Date.now() + sendDelay * 1000).toISOString()
        await supabase
          .from('project_messages')
          .update({ scheduled_send_at: scheduledAt } as Record<string, unknown>)
          .eq('id', message.id)

        invalidateMessages()

        // Mark chat as read (same as useSendMessage.onSuccess)
        markAsRead(params.senderParticipantId, projectId, channel, threadId)
          .then(() => {
            const unreadKey = threadId
              ? messengerKeys.unreadCountByThreadId(threadId)
              : messengerKeys.unreadCount(projectId ?? '', channel)
            const lastReadKey = threadId
              ? messengerKeys.lastReadAtByThreadId(threadId)
              : messengerKeys.lastReadAt(projectId ?? '', channel)
            queryClient.setQueryData(unreadKey, 0)
            queryClient.invalidateQueries({
              queryKey: lastReadKey,
            })
            queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
          })
          .catch(() => {
            /* not critical */
          })

        const expiresAt = Date.now() + sendDelay * 1000
        const pending: PendingMessage = {
          messageId: message.id,
          content: params.content,
          expiresAt,
          attachments: message.attachments,
        }

        setPendingMessages((prev) => new Map(prev).set(message.id, pending))

        // Start countdown timer
        const timer = setTimeout(async () => {
          try {
            await publishDraftMessage(message.id, params.senderName, params.senderRole)
            // Clear scheduled_send_at
            await supabase
              .from('project_messages')
              .update({ scheduled_send_at: null } as Record<string, unknown>)
              .eq('id', message.id)
          } catch {
            toast.error('Не удалось отправить сообщение')
          }
          setPendingMessages((prev) => {
            const next = new Map(prev)
            next.delete(message.id)
            return next
          })
          timersRef.current.delete(message.id)
          invalidateMessages()
        }, sendDelay * 1000)

        timersRef.current.set(message.id, timer)
        return true
      } catch {
        toast.error('Ошибка при сохранении сообщения')
        return false
      }
    },
    [sendDelay, projectId, workspaceId, channel, threadId, invalidateMessages, queryClient],
  )

  /**
   * Schedule an existing draft for delayed publish (e.g. after editing a cancelled draft).
   */
  const scheduleExistingDraft = useCallback(
    async (
      messageId: string,
      content: string,
      senderName: string,
      senderRole: string | null,
    ): Promise<boolean> => {
      if (sendDelay <= 0) return false

      try {
        const scheduledAt = new Date(Date.now() + sendDelay * 1000).toISOString()
        await supabase
          .from('project_messages')
          .update({ scheduled_send_at: scheduledAt } as Record<string, unknown>)
          .eq('id', messageId)

        invalidateMessages()

        const expiresAt = Date.now() + sendDelay * 1000
        const pending: PendingMessage = {
          messageId,
          content,
          expiresAt,
        }

        setPendingMessages((prev) => new Map(prev).set(messageId, pending))

        const timer = setTimeout(async () => {
          try {
            await publishDraftMessage(messageId, senderName, senderRole)
            await supabase
              .from('project_messages')
              .update({ scheduled_send_at: null } as Record<string, unknown>)
              .eq('id', messageId)
          } catch {
            toast.error('Не удалось отправить сообщение')
          }
          setPendingMessages((prev) => {
            const next = new Map(prev)
            next.delete(messageId)
            return next
          })
          timersRef.current.delete(messageId)
          invalidateMessages()
        }, sendDelay * 1000)

        timersRef.current.set(messageId, timer)
        return true
      } catch {
        return false
      }
    },
    [sendDelay, invalidateMessages],
  )

  /**
   * Cancel a pending delayed send.
   * Removes scheduled_send_at, loads full message and returns it
   * so the caller can set it as editingMessage (with attachments).
   */
  const cancelDelayedSend = useCallback(
    async (messageId: string): Promise<ProjectMessage | null> => {
      const pending = pendingMessages.get(messageId)
      if (!pending) return null

      // Cancel timer
      const timer = timersRef.current.get(messageId)
      if (timer) {
        clearTimeout(timer)
        timersRef.current.delete(messageId)
      }

      // Clear scheduled_send_at — keep as regular draft
      try {
        await supabase
          .from('project_messages')
          .update({ scheduled_send_at: null } as Record<string, unknown>)
          .eq('id', messageId)
      } catch {
        toast.error('Ошибка при отмене отправки')
      }

      // Load full message with attachments
      let fullMessage: ProjectMessage | null = null
      try {
        const { data } = await supabase
          .from('project_messages')
          .select(
            '*, sender:participants!sender_participant_id(avatar_url), reactions:message_reactions(*, participant:participants!participant_id(name, last_name, avatar_url)), attachments:message_attachments(*)',
          )
          .eq('id', messageId)
          .single()
        if (data) fullMessage = data as unknown as ProjectMessage
      } catch {
        /* ignore */
      }

      setPendingMessages((prev) => {
        const next = new Map(prev)
        next.delete(messageId)
        return next
      })
      invalidateMessages()

      return fullMessage
    },
    [pendingMessages, invalidateMessages],
  )

  /** Check if a message is in pending delayed state */
  const isPending = useCallback(
    (messageId: string) => pendingMessages.has(messageId),
    [pendingMessages],
  )

  /** Get expiry time for countdown UI */
  const getExpiresAt = useCallback(
    (messageId: string) => pendingMessages.get(messageId)?.expiresAt ?? null,
    [pendingMessages],
  )

  return {
    sendDelay,
    sendWithDelay,
    scheduleExistingDraft,
    cancelDelayedSend,
    isPending,
    getExpiresAt,
    hasPendingMessages: pendingMessages.size > 0,
  }
}
