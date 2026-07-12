/**
 * «Кто получит уведомление» для подсказки при наведении на режим видимости
 * композера. Вынесено из MengerTabContent (распил оркестратора) — логика не
 * менялась. Лениво: подписчики тянутся только после первого наведения (primed),
 * кэш — на тред.
 */
import { useMemo, useState } from 'react'
import { useThreadSubscribers } from '@/hooks/messenger/useThreadSubscription'
import { useProjectParticipants } from './useChatSettingsData'
import { CLIENT_ROLES } from '../chatSettingsTypes'
import type { NotifyRecipients } from '../ComposerVisibilitySwitch'

export function useComposerRecipients(params: {
  threadId: string
  workspaceId: string
  threadProjectId: string | null | undefined
  myParticipantId: string | null
  currentUserId: string | undefined
  allowClientMode: boolean
}): { recipients: NotifyRecipients; primeRecipients: () => void } {
  const { threadId, workspaceId, threadProjectId, myParticipantId, currentUserId, allowClientMode } =
    params
  const [recipientsPrimed, setRecipientsPrimed] = useState(false)
  const { data: projectParticipants = [] } = useProjectParticipants(threadProjectId ?? undefined)
  const threadSubscribers = useThreadSubscribers(threadId, workspaceId, recipientsPrimed)

  const recipients = useMemo<NotifyRecipients>(() => {
    // get_thread_subscribers отдаёт ВСЕХ с доступом к треду + флаг подписки.
    // Доступ = все сотрудники тут; уведомление = из них подписанные.
    const byId = new Map(projectParticipants.map((p) => [p.id, p]))
    const clientRoles = CLIENT_ROLES as readonly string[]
    const accessStaff: string[] = []
    const notifyStaff: string[] = []
    let accessExtra = 0
    let notifyExtra = 0
    let hasClient = false
    for (const [id, subscribed] of Object.entries(threadSubscribers.subscribers)) {
      // Себя не показываем — исключаем по participant_id (работает и в личных
      // диалогах без проекта, где participant по имени не разрешается).
      if (myParticipantId && id === myParticipantId) continue
      const p = byId.get(id)
      if (!p) {
        accessExtra++ // доступ есть (assignee/member вне проекта), имя неизвестно
        if (subscribed) notifyExtra++
        continue
      }
      if (p.user_id && p.user_id === currentUserId) continue // подстраховка по user_id
      if ((p.project_roles ?? []).some((r) => clientRoles.includes(r))) {
        hasClient = true // клиент — в командные списки не кладём
        continue
      }
      const name = [p.name, p.last_name].filter(Boolean).join(' ') || 'Без имени'
      accessStaff.push(name)
      if (subscribed) notifyStaff.push(name)
    }
    return {
      loading: recipientsPrimed && threadSubscribers.isLoading,
      accessStaff,
      notifyStaff,
      accessExtra,
      notifyExtra,
      hasClient: hasClient || allowClientMode,
    }
  }, [
    threadSubscribers.subscribers,
    threadSubscribers.isLoading,
    recipientsPrimed,
    projectParticipants,
    myParticipantId,
    currentUserId,
    allowClientMode,
  ])

  return { recipients, primeRecipients: () => setRecipientsPrimed(true) }
}
