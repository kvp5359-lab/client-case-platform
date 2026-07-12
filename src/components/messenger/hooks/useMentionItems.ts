/**
 * Список кандидатов для @-упоминаний в треде + id исполнителей.
 * Вынесено из MengerTabContent (распил оркестратора) — логика не менялась.
 *
 * Кандидаты = ТОЛЬКО люди, связанные с задачей: участники проекта ∪ участники
 * задачи (thread members) ∪ исполнители. Только с аккаунтом (user_id) — telegram-
 * контакты упоминать бессмысленно (не видят ЛК). Себя исключаем.
 */
import { useMemo } from 'react'
import { useProjectParticipants, useThreadMembers } from './useChatSettingsData'
import { useTaskAssigneeIds } from '@/components/tasks/useTaskAssignees'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'

export type MentionItem = { id: string; label: string; avatarUrl: string | null }

export function useMentionItems(params: {
  threadId: string
  threadProjectId: string | null | undefined
  workspaceId: string
  currentUserId: string | undefined
}): { mentionItems: MentionItem[]; assigneeIds: string[] } {
  const { threadId, threadProjectId, workspaceId, currentUserId } = params
  const { data: projectParticipants = [] } = useProjectParticipants(
    threadProjectId ?? undefined,
  )
  const { data: threadMemberIds } = useThreadMembers(threadId)
  const { data: assigneeIds = [] } = useTaskAssigneeIds(threadId)
  const { data: workspaceParticipants = [] } = useWorkspaceParticipants(workspaceId)

  const mentionItems = useMemo<MentionItem[]>(() => {
    const allowed = new Set<string>()
    for (const p of projectParticipants) allowed.add(p.id)
    if (threadMemberIds) for (const id of threadMemberIds) allowed.add(id)
    for (const id of assigneeIds) allowed.add(id)
    return workspaceParticipants
      .filter(
        (p) =>
          p.user_id && // только с аккаунтом (без telegram-контактов)
          p.user_id !== currentUserId && // себя не упоминаем
          allowed.has(p.id),
      )
      .map((p) => ({
        id: p.id,
        label: [p.name, p.last_name].filter(Boolean).join(' '),
        avatarUrl: p.avatar_url,
      }))
  }, [workspaceParticipants, projectParticipants, threadMemberIds, assigneeIds, currentUserId])

  return { mentionItems, assigneeIds }
}
