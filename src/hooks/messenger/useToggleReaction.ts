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
} from '@/services/api/messenger/messengerService'
import { messengerKeys, inboxKeys } from '@/hooks/queryKeys'

export function useToggleReaction(
  projectId: string | undefined,
  channel: MessageChannel,
  participantId: string | undefined,
  workspaceId: string | undefined,
  threadId: string,
) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const messagesKey = messengerKeys.messagesByThreadId(threadId)

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
            queryClient.setQueryData(messengerKeys.unreadCountByThreadId(threadId), 0)
            queryClient.invalidateQueries({
              queryKey: messengerKeys.lastReadAtByThreadId(threadId),
            })
            if (workspaceId) {
              queryClient.invalidateQueries({ queryKey: inboxKeys.threadsV2(workspaceId) })
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
