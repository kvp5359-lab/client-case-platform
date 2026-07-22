/**
 * Список кандидатов для @-упоминаний в треде + id исполнителей.
 *
 * Вся логика отбора/порядка — в чистой `buildMentionItems`
 * (src/lib/messenger/mentionCandidates.ts, там же правила и тесты).
 * Здесь только сбор данных: участники проекта ∪ участники задачи ∪
 * исполнители → relatedIds; общий список сотрудников — только в тредах
 * проекта (в личных диалогах упоминание раздавало бы доступ к переписке).
 */
import { useMemo } from 'react'
import { useProjectParticipants, useThreadMembers } from './useChatSettingsData'
import { useTaskAssigneeIds } from '@/components/tasks/useTaskAssignees'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { buildMentionItems, type MentionItem } from '@/lib/messenger/mentionCandidates'

export type { MentionItem }

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
    const relatedIds = new Set<string>()
    for (const p of projectParticipants) relatedIds.add(p.id)
    if (threadMemberIds) for (const id of threadMemberIds) relatedIds.add(id)
    for (const id of assigneeIds) relatedIds.add(id)
    return buildMentionItems({
      participants: workspaceParticipants,
      relatedIds,
      currentUserId,
      includeWorkspaceStaff: !!threadProjectId,
    })
  }, [
    workspaceParticipants,
    projectParticipants,
    threadMemberIds,
    assigneeIds,
    currentUserId,
    threadProjectId,
  ])

  return { mentionItems, assigneeIds }
}
