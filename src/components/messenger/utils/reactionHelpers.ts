import type { MessageReaction } from '@/services/api/messengerService'

/** Get display name from reaction author */
export function getReactionAuthorName(r: MessageReaction): string {
  if (r.participant?.name) {
    return [r.participant.name, r.participant.last_name].filter(Boolean).join(' ')
  }
  return r.telegram_user_name ?? 'Telegram'
}

/** Group reactions: emoji → count + participantIds + names */
export function groupReactions(reactions: MessageReaction[]) {
  const map = new Map<
    string,
    { count: number; participantIds: (string | null)[]; names: string[]; avatarUrl: string | null }
  >()
  for (const r of reactions) {
    const existing = map.get(r.emoji)
    const name = getReactionAuthorName(r)
    const avatarUrl = r.participant?.avatar_url ?? null
    if (existing) {
      existing.count++
      existing.participantIds.push(r.participant_id)
      existing.names.push(name)
      if (!existing.avatarUrl && avatarUrl) existing.avatarUrl = avatarUrl
    } else {
      map.set(r.emoji, { count: 1, participantIds: [r.participant_id], names: [name], avatarUrl })
    }
  }
  return map
}
