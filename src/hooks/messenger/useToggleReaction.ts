"use client"

/**
 * Хук для toggle реакции на сообщение
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  toggleReaction,
  getCurrentProjectParticipant,
  getCurrentWorkspaceParticipant,
  markAsRead,
  type MessageChannel,
} from '@/services/api/messengerService'
import { messengerKeys, inboxKeys } from '@/hooks/queryKeys'

export function useToggleReaction(
  projectId: string | undefined,
  channel: MessageChannel = 'client',
  participantId?: string,
  workspaceId?: string,
  threadId?: string,
) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const messagesKey = threadId
    ? messengerKeys.messagesByThreadId(threadId)
    : messengerKeys.messages(projectId ?? '', channel)

  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!user) throw new Error('Не авторизован')
      const pid =
        participantId ??
        (projectId
          ? (await getCurrentProjectParticipant(projectId, user.id))?.participantId
          : workspaceId
            ? (await getCurrentWorkspaceParticipant(workspaceId, user.id))?.participantId
            : null)
      if (!pid) throw new Error('Участник не найден')
      return toggleReaction(messageId, pid, emoji)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey })

      // Реакция = прочитал чат
      const pid = participantId
      if (pid) {
        markAsRead(pid, projectId, channel, threadId)
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
            if (workspaceId) {
              queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
            }
          })
          .catch(() => {
            /* not critical */
          })
      }
    },
    onError: () => {
      toast.error('Не удалось поставить реакцию')
    },
  })
}
