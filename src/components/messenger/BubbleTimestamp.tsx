import { Mail, MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import type { DeliveryStatus } from './bubbleUtils'
import { DeliveryIcon, formatTime } from './bubbleUtils'

interface BubbleTimestampProps {
  message: ProjectMessage
  isOwn: boolean
  deliveryStatus: DeliveryStatus
  tgFailed?: boolean
  className?: string
}

export function BubbleTimestamp({
  message,
  isOwn,
  deliveryStatus,
  tgFailed = false,
  className,
}: BubbleTimestampProps) {
  return (
    <span
      className={cn(
        'text-[10px] leading-none flex items-center gap-1',
        isOwn
          ? message.is_draft
            ? 'text-muted-foreground'
            : tgFailed
              ? 'text-muted-foreground'
              : 'text-white/60'
          : 'text-muted-foreground',
        className,
      )}
    >
      {isOwn && message.source === 'telegram' && <MessageSquareText className="h-3 w-3" />}
      {isOwn && message.source === 'email' && <Mail className="h-3 w-3" />}
      {formatTime(message.created_at)}
      {message.is_edited && <span className="italic">ред.</span>}
      {deliveryStatus && <DeliveryIcon status={deliveryStatus} />}
    </span>
  )
}
