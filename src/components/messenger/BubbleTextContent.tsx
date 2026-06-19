import { useEffect, useRef, type ReactNode } from 'react'
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
import { BubbleLinkMenu, type BubbleLinkMenuHandle } from './BubbleLinkMenu'

type BubbleTextContentProps = {
  message: ProjectMessage
  isOwn: boolean
  accent: MessengerAccent
  hasAttachments: boolean
  deliveryStatus: DeliveryStatus
  deliveryFailed: boolean
  textRef: React.RefObject<HTMLDivElement | null>
  isCollapsed: boolean
  isOverflowing: boolean
  maxCollapsedHeight: number
  toggleCollapsed: () => void
  onPublishDraft?: (msg: ProjectMessage) => void
  onRetrySend?: (msg: ProjectMessage) => void
  /** Своё сообщение на светлом фоне (self/жёлтый) — тёмный цвет времени. */
  lightBubble?: boolean
  /** Иконка-метка режима перед текстом (Заметка/Только я) — flex-соседом, чтобы
   *  ширина бабла учитывала её и текст переносился естественно. */
  leadingIcon?: ReactNode
}

export function BubbleTextContent({
  message,
  isOwn,
  accent,
  hasAttachments,
  deliveryStatus,
  deliveryFailed,
  textRef,
  isCollapsed,
  isOverflowing,
  maxCollapsedHeight,
  toggleCollapsed,
  onPublishDraft,
  onRetrySend,
  lightBubble = false,
  leadingIcon,
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

  // Правый клик на ссылке внутри баббла должен открывать меню для ссылки,
  // а не общее меню сообщения. Вешаем native listener на capture phase —
  // он сработает раньше React event delegation на корне, поэтому Radix
  // ContextMenuTrigger родителя не успеет открыть своё меню.
  // stopImmediatePropagation — на случай, если что-то ещё висит на том же
  // узле в capture phase.
  const linkMenuRef = useRef<BubbleLinkMenuHandle>(null)
  const contentContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = contentContainerRef.current
    if (!node) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const anchor = target?.closest?.('a') as HTMLAnchorElement | null
      if (!anchor || !anchor.href) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      linkMenuRef.current?.openAt(e.clientX, e.clientY, anchor.href)
    }
    node.addEventListener('contextmenu', handler, true)
    return () => node.removeEventListener('contextmenu', handler, true)
  }, [message.content])

  return (
    <div>
      <div className="flex items-start gap-1">
        {leadingIcon && <span className="mt-[3px] shrink-0 opacity-80">{leadingIcon}</span>}
        <div className="relative min-w-0 flex-1">
        <div
          ref={textRef}
          className={cn(isOverflowing && isCollapsed && 'overflow-hidden')}
          style={collapsedStyle}
        >
          <div className={cn('flex items-end justify-between gap-2', hasAttachments && 'block')}>
            {isHtmlContent(message.content) ? (
              <div
                ref={contentContainerRef}
                className="text-sm break-words min-w-0 messenger-content messenger-links"
                dangerouslySetInnerHTML={{
                  __html: linkifyHtml(sanitizeMessengerHtml(message.content)),
                }}
              />
            ) : (
              <div
                ref={contentContainerRef}
                className="text-sm whitespace-pre-wrap break-words min-w-0 messenger-links"
                dangerouslySetInnerHTML={{
                  // Переносы строк рендерим настоящими <br>, а не CSS pre-wrap по
                  // символам \n. Иначе при копировании из бабла браузер кладёт в
                  // text/html плоский текст без разрывов (CSS-перенос не даёт <br>)
                  // → форматирование слетает при вставке в Tiptap/Google Docs.
                  __html: sanitizeMessengerHtml(linkifyText(message.content).replace(/\n/g, '<br>')),
                }}
              />
            )}
            {!hasAttachments && (
              <BubbleTimestamp
                message={message}
                isOwn={isOwn}
                deliveryStatus={deliveryStatus}
                deliveryFailed={deliveryFailed}
                lightBubble={lightBubble}
                className="flex-shrink-0 mb-[3px] ml-auto"
              />
            )}
          </div>

          {/* Fade-out реализован через mask-image на textRef — см. collapsedStyle.
              Универсально работает поверх любого фона, не нуждается в подстановке
              цветов акцента или highlight. */}
        </div>

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
              isOwn && !message.is_draft && !deliveryFailed && !lightBubble
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
                deliveryFailed={deliveryFailed}
                lightBubble={lightBubble}
              />
            )}
            {message.is_draft && !message.scheduled_send_at && onPublishDraft && (
              <DraftPublishButton
                message={message}
                accent={accent}
                onPublishDraft={onPublishDraft}
              />
            )}
            {!message.is_draft && deliveryFailed && onRetrySend && (
              <RetrySendButton message={message} onRetrySend={onRetrySend} />
            )}
          </div>
        </div>
      )}
      <BubbleLinkMenu ref={linkMenuRef} />
    </div>
  )
}

type DraftPublishButtonProps = {
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

type RetrySendButtonProps = {
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
