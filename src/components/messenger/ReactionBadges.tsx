import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { MessageReaction } from '@/services/api/messenger/messengerService'
import { groupReactions } from './utils/reactionHelpers'
import type { MessengerAccent } from './utils/messageStyles'
import { acc, ACCENT_SLUGS } from '@/lib/accentPalette'

/** Accent-colored backgrounds for own reactions (из настраиваемой палитры) */
const OWN_REACTION_STYLES: Record<MessengerAccent, string> = {
  ...(Object.fromEntries(
    ACCENT_SLUGS.map((s) => [s, `${acc.bgMain(s)} ${acc.textOn(s)} hover:opacity-90`]),
  ) as Record<MessengerAccent, string>),
  dark: 'bg-stone-600 hover:bg-stone-700 text-white',
}

/** Accent-colored backgrounds for other users' reactions */
const OTHER_REACTION_STYLES: Record<MessengerAccent, string> = {
  ...(Object.fromEntries(
    ACCENT_SLUGS.map((s) => [s, `${acc.bgLight(s)} hover:brightness-95`]),
  ) as Record<MessengerAccent, string>),
  dark: 'bg-stone-100 hover:bg-stone-200',
}

type ReactionBadgesProps = {
  reactions: MessageReaction[]
  currentParticipantId: string | null
  onReact: (emoji: string) => void
  accent?: MessengerAccent
  /** last_read_at пользователя в этом треде — реакции позже этой метки от других участников считаются непрочитанными. */
  lastReadAt?: string
}

export function ReactionBadges({
  reactions,
  currentParticipantId,
  onReact,
  accent = 'blue',
  lastReadAt,
}: ReactionBadgesProps) {
  const grouped = groupReactions(reactions)
  if (grouped.size === 0) return null

  // Эмодзи, у которых есть хотя бы одна чужая реакция, созданная после last_read_at
  const unreadEmojis = new Set<string>()
  if (lastReadAt) {
    for (const r of reactions) {
      if (r.created_at > lastReadAt && r.participant_id !== currentParticipantId) {
        unreadEmojis.add(r.emoji)
      }
    }
  }

  const ownStyle = OWN_REACTION_STYLES[accent] ?? OWN_REACTION_STYLES.blue
  const otherStyle = OTHER_REACTION_STYLES[accent] ?? OTHER_REACTION_STYLES.blue

  return (
    <div className="relative -mt-2 ml-2 flex flex-wrap gap-1 z-10">
      <TooltipProvider>
        {Array.from(grouped.entries()).map(
          ([emoji, { count, participantIds, names, avatarUrl }]) => {
            const isMine = currentParticipantId
              ? participantIds.includes(currentParticipantId)
              : false
            const isUnread = unreadEmojis.has(emoji)
            const authorName = names[0] ?? ''
            return (
              <Tooltip key={emoji}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onReact(emoji)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full h-7 pl-1.5 pr-0.5 text-xs border-2 transition-colors',
                      isUnread
                        ? 'bg-red-100 border-red-500 text-red-600'
                        : cn('border-white', isMine ? ownStyle : otherStyle),
                    )}
                  >
                    <span className="text-sm leading-none">{emoji}</span>
                    {count > 1 && <span className="text-xs">{count}</span>}
                    <Avatar className="h-4 w-4">
                      {avatarUrl && <AvatarImage src={avatarUrl} alt={authorName} />}
                      <AvatarFallback className="text-[8px] font-medium bg-gray-300 text-white">
                        {authorName[0]?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {names.join(', ')}
                </TooltipContent>
              </Tooltip>
            )
          },
        )}
      </TooltipProvider>
    </div>
  )
}
