import { ChevronDown, RefreshCw, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isHtmlContent, sanitizeMessengerHtml, linkifyText } from '@/utils/format/messengerHtml'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import type { MessengerAccent } from './utils/messageStyles'
import { bubbleStyles } from './utils/messageStyles'
import type { DeliveryStatus } from './bubbleUtils'
import { BubbleTimestamp } from './BubbleTimestamp'

interface BubbleTextContentProps {
  message: ProjectMessage
  isOwn: boolean
  accent: MessengerAccent
  hasAttachments: boolean
  /** Есть ли реакции. Если да — inline-время скрываем, MessageBubble сам рисует
   *  absolute-время в нижнем правом углу (как в Telegram). */
  hasReactions: boolean
  deliveryStatus: DeliveryStatus
  tgFailed: boolean
  textRef: React.RefObject<HTMLDivElement | null>
  isCollapsed: boolean
  isOverflowing: boolean
  maxCollapsedHeight: number
  toggleCollapsed: () => void
  onPublishDraft?: (msg: ProjectMessage) => void
  onRetrySend?: (msg: ProjectMessage) => void
}

export function BubbleTextContent({
  message,
  isOwn,
  accent,
  hasAttachments,
  hasReactions,
  deliveryStatus,
  tgFailed,
  textRef,
  isCollapsed,
  isOverflowing,
  maxCollapsedHeight,
  toggleCollapsed,
  onPublishDraft,
  onRetrySend,
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
          {!hasAttachments && !hasReactions && (
            <BubbleTimestamp
              message={message}
              isOwn={isOwn}
              deliveryStatus={deliveryStatus}
              tgFailed={tgFailed}
              className="flex-shrink-0 mb-[3px] ml-auto"
            />
          )}
        </div>

        {/* Gradient fade at collapsed bottom.
            Цвет градиента должен совпадать с фоном бабла:
            - draft → светло-белый
            - own + tgFailed → нейтральный background (как сам бабл в ошибке)
            - own → акцентный тёмный (fadeGradient)
            - incoming → акцентный светлый (fadeGradientIncoming, под bg-{accent}-100/70) */}
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
                  : colors.fadeGradientIncoming,
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
            {isCollapsed && !hasAttachments && !hasReactions && (
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
            {!message.is_draft && tgFailed && onRetrySend && (
              <RetrySendButton message={message} onRetrySend={onRetrySend} />
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

interface RetrySendButtonProps {
  message: ProjectMessage
  onRetrySend: (msg: ProjectMessage) => void
}

export function RetrySendButton({ message, onRetrySend }: RetrySendButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onRetrySend(message)
      }}
      className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors text-red-500 hover:text-red-700 hover:bg-red-50"
    >
      <RefreshCw className="h-3 w-3" />
      Повторить отправку
    </button>
  )
}
