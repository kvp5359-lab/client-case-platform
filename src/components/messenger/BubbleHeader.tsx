import { Forward, Mail, MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { stripHtml } from '@/utils/format/messengerHtml'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import { isEmailSource } from '@/services/api/messenger/messengerService.types'
import type { MessengerAccent } from './utils/messageStyles'
import { bubbleStyles } from './utils/messageStyles'
import { useContactCardStore } from '@/store/contactCardStore'
import { useMessengerContext } from './MessengerContext'

interface BubbleHeaderProps {
  message: ProjectMessage
  isOwn: boolean
  showAvatar: boolean
  accent: MessengerAccent
}

export function BubbleHeader({ message, isOwn, showAvatar, accent }: BubbleHeaderProps) {
  const colors = bubbleStyles[accent]
  const { threadContactParticipantId } = useMessengerContext()
  const senderClickTarget = message.sender_participant_id ?? threadContactParticipantId ?? null
  // Имя берём из join'нутого participant'а (актуальное) — sender_name это
  // исторический snapshot на момент создания сообщения. Fallback на snapshot,
  // если participant уже удалён или не привязан.
  const participantName = message.sender
    ? [message.sender.name, message.sender.last_name].filter(Boolean).join(' ')
    : ''
  const displayName = participantName || message.sender_name
  return (
    <>
      {/* Sender name */}
      {!isOwn && showAvatar && (
        <div className="flex items-center gap-1.5 mb-1">
          {senderClickTarget ? (
            <button
              type="button"
              onClick={() => useContactCardStore.getState().open(senderClickTarget)}
              className="text-xs font-medium text-foreground hover:text-primary hover:underline transition-colors"
            >
              {displayName}
            </button>
          ) : (
            <span className="text-xs font-medium text-foreground">{displayName}</span>
          )}
          {message.sender_role && (
            <span className="text-xs text-muted-foreground">({message.sender_role})</span>
          )}
          {message.source === 'telegram' && <MessageSquareText className="h-3 w-3 text-blue-500" />}
          {isEmailSource(message.source) && <Mail className="h-3 w-3 text-red-500" />}
        </div>
      )}

      {/* Forwarded from label */}
      {message.forwarded_from_name && (
        <div
          className={cn(
            'flex items-center gap-1 mb-1 text-xs italic',
            isOwn
              ? message.is_draft
                ? 'text-muted-foreground'
                : 'text-white/70'
              : 'text-muted-foreground',
          )}
        >
          <Forward className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">Переслано от {message.forwarded_from_name}</span>
        </div>
      )}

      {/* Reply quote */}
      {message.reply_to_message && (
        <button
          type="button"
          className={cn(
            'border-l-2 pl-2 mb-2 text-xs opacity-75 text-left w-full cursor-pointer hover:opacity-100 transition-opacity',
            isOwn ? colors.replyBorder : 'border-foreground/30',
          )}
          onClick={(e) => {
            e.stopPropagation()
            const el = document.getElementById(`msg-${message.reply_to_message!.id}`)
            if (!el) return
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.style.backgroundColor = 'rgb(254 243 199)' // amber-100
            el.style.color = 'rgb(180 83 9)' // amber-700
            el.style.boxShadow = 'inset 0 0 0 2px rgb(180 83 9)' // amber-700 inner border
            setTimeout(() => {
              el.style.backgroundColor = ''
              el.style.color = ''
              el.style.boxShadow = ''
            }, 2000)
          }}
        >
          <span className="font-medium">{message.reply_to_message.sender_name}</span>
          <p className="line-clamp-1">{stripHtml(message.reply_to_message.content)}</p>
        </button>
      )}
    </>
  )
}
