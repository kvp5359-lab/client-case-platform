"use client"

import { useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { getCurrentWorkspaceParticipant } from '@/services/api/messenger/messengerService'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { ChatSettingsResult } from '@/components/messenger/chatSettingsTypes'

/**
 * Ставит первое сообщение нового треда (включая email) в очередь pendingInitialMessage.
 * Мессенджер при открытии треда сам отправит его через стандартный путь
 * (для email — БД-триггер вызовет email-internal-send).
 *
 * Используется на двух точках создания тредов: TaskListView и BoardListCard.
 * Открытие треда в панели — ответственность вызывающего, чтобы не навязывать
 * UI-стратегию.
 */
export function useQueueThreadInitialMessage(workspaceId: string) {
  const { user } = useAuth()
  const setPendingInitialMessage = useSidePanelStore((s) => s.setPendingInitialMessage)

  return useCallback(
    async (thread: ProjectThread, result: ChatSettingsResult) => {
      if (!result.initialMessage || !user) return
      let senderName = 'Вы'
      try {
        const p = await getCurrentWorkspaceParticipant(workspaceId, user.id)
        if (p) senderName = p.name
      } catch {
        /* fallback */
      }
      setPendingInitialMessage({
        threadId: thread.id,
        html: result.initialMessage.html,
        files: result.initialMessage.files,
        isEmail: result.channelType === 'email',
        senderName,
      })
    },
    [workspaceId, user, setPendingInitialMessage],
  )
}
