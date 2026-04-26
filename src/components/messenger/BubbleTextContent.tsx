import { ChevronDown, RefreshCw, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  isHtmlContent,
  sanitizeMessengerHtml,
  linkifyText,
  linkifyHtml,
} from '@/utils/format/messengerHtml'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import type { MessengerAccent } from './utils/messageStyles'
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
  onRetrySend?: (msg: ProjectMessage) => void
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
  onRetrySend,
}: BubbleTextContentProps) {
  // Fade-out для свёрнутого текста через mask-image — работает поверх любого
  // фона бабла (акцентный цвет / подсветка поиска / draft) без подстановки
  // конкретных цветов. Нижние ~40px плавно уходят в прозрачность.
  const collapsedStyle =
    isOverflowing && isCollapsed
      ? {
          maxHeight: maxCollapsedHeight,
          maskImage: 'linear-gradient(to bottom, black calc(100% - 90px), rgba(0,0,0,0.2) calc(100% - 35px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 90px), rgba(0,0,0,0.2) calc(100% - 35px), transparent 100%)',
        }
      : undefined

  return (
    <div>
      <div className="relative">
        <div
          ref={textRef}
          className={cn(isOverflowing && isCollapsed && 'overflow-hidden')}
          style={collapsedStyle}
        >
          <div className={cn('flex items-end justify-between gap-2', hasAttachments && 'block')}>
            {isHtmlContent(message.content) ? (
              <div
                className="text-sm break-words min-w-0 messenger-content messenger-links"
                dangerouslySetInnerHTML={{
                  __html: linkifyHtml(sanitizeMessengerHtml(message.content)),
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

          {/* Fade-out реализован через mask-image на textRef — см. collapsedStyle.
              Универсально работает поверх любого фона, не нуждается в подстановке
              цветов акцента или highlight. */}
        </div>

      </div>

      {isOverflowing && (
        <div className="flex items-center justify-between mt-1">
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              'inline-flex items-center gap-1 text-xs font-semibold hover:opacity-80 transition-opacity',
              // Собственные сообщения имеют тёмный акцентный фон — текст белый.
              // Draft/tg-failed и входящие — светлый фон, текст тёмный.
              isOwn && !message.is_draft && !tgFailed
                ? 'text-white'
                : 'text-foreground',
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
