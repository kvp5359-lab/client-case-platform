import { ChevronDown, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isHtmlContent, sanitizeMessengerHtml, linkifyText } from '@/utils/messengerHtml'
import type { ProjectMessage } from '@/services/api/messengerService'
import type { MessengerAccent } from './utils/messageStyles'
import { bubbleStyles } from './utils/messageStyles'
import type { DeliveryStatus } from './bubbleUtils'
import { BubbleTimestamp } from './BubbleTimestamp'

interface BubbleTextContentProps {
  message: ProjectMessage
  isOwn: boolean
  accent: MessengerAccent
  hasAttachments: boolean
  deliveryStatus: DeliveryStatus
  tgFailed: boolean
  textRef: React.RefObject<HTMLDivElement | null>
  isCollapsed: boolean
  isOverflowing: boolean
  maxCollapsedHeight: number
  toggleCollapsed: () => void
  onPublishDraft?: (msg: ProjectMessage) => void
}

export function BubbleTextContent({
  message,
  isOwn,
  accent,
  hasAttachments,
  deliveryStatus,
  tgFailed,
  textRef,
  isCollapsed,
  isOverflowing,
  maxCollapsedHeight,
  toggleCollapsed,
  onPublishDraft,
}: BubbleTextContentProps) {
  const colors = bubbleStyles[accent]

  return (
    <div>
      <div
        ref={textRef}
        className={cn('relative', isOverflowing && isCollapsed && 'overflow-hidden')}
        style={isOverflowing && isCollapsed ? { maxHeight: maxCollapsedHeight } : undefined}
      >
        <div className={cn('flex items-end justify-between gap-2', hasAttachments && 'block')}>
          {isHtmlContent(message.content) ? (
            <div
              className="text-sm break-words min-w-0 messenger-content messenger-links"
              dangerouslySetInnerHTML={{
                __html: sanitizeMessengerHtml(message.content),
              }}
            />
          ) : (
            <div
              className="text-sm whitespace-pre-wrap break-words min-w-0 messenger-links"
              dangerouslySetInnerHTML={{
                __html: sanitizeMessengerHtml(linkifyText(message.content)),
              }}
            />
          )}
          {!hasAttachments && (
            <BubbleTimestamp
              message={message}
              isOwn={isOwn}
              deliveryStatus={deliveryStatus}
              tgFailed={tgFailed}
              className="flex-shrink-0 mb-[3px] ml-auto"
            />
          )}
        </div>

        {/* Gradient fade at collapsed bottom */}
        {isOverflowing && isCollapsed && (
          <div
            className={cn(
              'absolute bottom-0 left-0 right-0 h-12 pointer-events-none bg-gradient-to-t to-transparent',
              message.is_draft
                ? 'from-white/90'
                : isOwn
                  ? tgFailed
                    ? 'from-background/90'
                    : colors.fadeGradient
                  : 'from-muted/90',
            )}
          />
        )}
      </div>

      {isOverflowing && (
        <div className="flex items-center justify-between mt-1">
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              'flex items-center gap-1 text-xs transition-colors',
              message.is_draft
                ? 'text-muted-foreground hover:text-foreground'
                : isOwn
                  ? 'text-white/70 hover:text-white'
                  : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', !isCollapsed && 'rotate-180')}
            />
            {isCollapsed ? 'Показать полностью' : 'Свернуть'}
          </button>
          <div className="flex items-center gap-2">
            {isCollapsed && !hasAttachments && (
              <BubbleTimestamp
                message={message}
                isOwn={isOwn}
                deliveryStatus={!message.is_draft ? deliveryStatus : null}
                tgFailed={tgFailed}
              />
            )}
            {message.is_draft && onPublishDraft && (
              <DraftPublishButton
                message={message}
                accent={accent}
                onPublishDraft={onPublishDraft}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface DraftPublishButtonProps {
  message: ProjectMessage
  accent: MessengerAccent
  onPublishDraft: (msg: ProjectMessage) => void
}

export function DraftPublishButton({ message, accent, onPublishDraft }: DraftPublishButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onPublishDraft(message)
      }}
      className={cn(
        'flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors',
        accent === 'dark'
          ? 'text-stone-500 hover:text-stone-700 hover:bg-stone-100'
          : 'text-blue-500 hover:text-blue-700 hover:bg-blue-50',
      )}
    >
      <Send className="h-3 w-3" />
      Отправить
    </button>
  )
}
