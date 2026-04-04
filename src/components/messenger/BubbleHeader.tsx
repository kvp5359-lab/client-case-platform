import { Forward, Mail, MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { stripHtml } from '@/utils/messengerHtml'
import type { ProjectMessage } from '@/services/api/messengerService'
import type { MessengerAccent } from './utils/messageStyles'
import { bubbleStyles } from './utils/messageStyles'

interface BubbleHeaderProps {
  message: ProjectMessage
  isOwn: boolean
  showAvatar: boolean
  accent: MessengerAccent
}

export function BubbleHeader({ message, isOwn, showAvatar, accent }: BubbleHeaderProps) {
  const colors = bubbleStyles[accent]
  return (
    <>
      {/* Sender name */}
      {!isOwn && showAvatar && (
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs font-medium text-foreground">{message.sender_name}</span>
          {message.sender_role && (
            <span className="text-xs text-muted-foreground">({message.sender_role})</span>
          )}
          {message.source === 'telegram' && <MessageSquareText className="h-3 w-3 text-blue-500" />}
          {message.source === 'email' && <Mail className="h-3 w-3 text-red-500" />}
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
        <div
          className={cn(
            'border-l-2 pl-2 mb-2 text-xs opacity-75',
            isOwn ? colors.replyBorder : 'border-foreground/30',
          )}
        >
          <span className="font-medium">{message.reply_to_message.sender_name}</span>
          <p className="line-clamp-1">{stripHtml(message.reply_to_message.content)}</p>
        </div>
      )}
    </>
  )
}
