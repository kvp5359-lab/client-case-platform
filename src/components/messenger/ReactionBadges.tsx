import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { MessageReaction } from '@/services/api/messenger/messengerService'
import { groupReactions } from './utils/reactionHelpers'
import type { MessengerAccent } from './utils/messageStyles'

/** Accent-colored backgrounds for own reactions */
const OWN_REACTION_STYLES: Record<string, string> = {
  blue: 'bg-blue-500 hover:bg-blue-600 text-white',
  slate: 'bg-stone-600 hover:bg-stone-700 text-white',
  emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  amber: 'bg-amber-500 hover:bg-amber-600 text-white',
  rose: 'bg-red-500 hover:bg-red-600 text-white',
  violet: 'bg-violet-600 hover:bg-violet-700 text-white',
  orange: 'bg-orange-500 hover:bg-orange-600 text-white',
  cyan: 'bg-cyan-600 hover:bg-cyan-700 text-white',
  pink: 'bg-pink-500 hover:bg-pink-600 text-white',
  indigo: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  green: 'bg-green-600 hover:bg-green-700 text-white',
  dark: 'bg-stone-600 hover:bg-stone-700 text-white',
}

/** Accent-colored backgrounds for other users' reactions */
const OTHER_REACTION_STYLES: Record<string, string> = {
  blue: 'bg-blue-100 hover:bg-blue-200',
  slate: 'bg-stone-100 hover:bg-stone-200',
  emerald: 'bg-emerald-100 hover:bg-emerald-200',
  amber: 'bg-amber-100 hover:bg-amber-200',
  rose: 'bg-red-100 hover:bg-red-200',
  violet: 'bg-violet-100 hover:bg-violet-200',
  orange: 'bg-orange-100 hover:bg-orange-200',
  cyan: 'bg-cyan-100 hover:bg-cyan-200',
  pink: 'bg-pink-100 hover:bg-pink-200',
  indigo: 'bg-indigo-100 hover:bg-indigo-200',
  green: 'bg-green-100 hover:bg-green-200',
  dark: 'bg-stone-100 hover:bg-stone-200',
}

interface ReactionBadgesProps {
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
    <div className="absolute bottom-0 left-1 flex flex-wrap gap-1 z-10">
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
                        ? 'bg-red-50 border-red-300 text-red-600'
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
