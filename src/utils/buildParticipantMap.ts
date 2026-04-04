import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'

/**
 * Строит Map<threadId, AvatarParticipant[]> из строк с вложенным объектом participants.
 * Используется в useThreadMembersMap и useTaskAssigneesMap.
 */
export function buildParticipantMap(
  rows: Array<{ thread_id: string; participants: unknown }>,
): Record<string, AvatarParticipant[]> {
  const map: Record<string, AvatarParticipant[]> = {}
  for (const row of rows) {
    const p = row.participants as AvatarParticipant
    if (!map[row.thread_id]) map[row.thread_id] = []
    map[row.thread_id].push(p)
  }
  return map
}
