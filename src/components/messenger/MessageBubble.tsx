import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MessageAttachments } from './MessageAttachment'
import { getInitials, getAvatarColor } from '@/utils/avatarHelpers'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import { bubbleStyles } from './utils/messageStyles'
import { useCollapsibleText } from './hooks/useCollapsibleText'
import { TelegramFailedBadge, useTelegramDeliveryStatus } from './TelegramDeliveryIndicator'
// QuotePopup рендерится императивно (DOM) — см. handleMouseUp в MessageBubble
import { ReactionBadges } from './ReactionBadges'
import { MessageActions } from './MessageActions'
import { SendCountdown } from './SendCountdown'
import { getDeliveryStatus } from './bubbleUtils'
import { BubbleHeader } from './BubbleHeader'
import { BubbleTimestamp } from './BubbleTimestamp'
import { BubbleTextContent, DraftPublishButton } from './BubbleTextContent'
import { DeleteMessageDialog } from './DeleteMessageDialog'
import { EmailFullViewDialog } from './EmailFullViewDialog'
import { useMessengerContext } from './MessengerContext'

export type { MessengerAccent } from './utils/messageStyles'

interface MessageBubbleProps {
  message: ProjectMessage
  isOwn: boolean
  showAvatar?: boolean
  canDelete?: boolean
  isDelayedPending?: boolean
  delayedExpiresAt?: number
  onCancelDelayed?: () => void
}

function MessageBubbleImpl({
  message,
  isOwn,
  showAvatar = true,
  canDelete,
  isDelayedPending,
  delayedExpiresAt,
  onCancelDelayed,
}: MessageBubbleProps) {
  const {
    currentParticipantId,
    accent = 'blue',
    projectId,
    workspaceId,
    channel,
    isTelegramLinked,
    onReply,
    onReact,
    onEdit,
    onDelete,
    onQuote,
    onForwardToChat,
    forwardChats,
    currentThreadId,
    onPublishDraft,
    onEditDraft,
  } = useMessengerContext()
  const colors = bubbleStyles[accent]
  const tgDeliveryStatus = useTelegramDeliveryStatus(message, isOwn, isTelegramLinked)
  const deliveryStatus = getDeliveryStatus(message, isOwn, tgDeliveryStatus)
  const tgFailed = tgDeliveryStatus === 'failed'

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [emailViewOpen, setEmailViewOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [reactionPopoverOpen, setReactionPopoverOpen] = useState(false)

  const { textRef, isCollapsed, isOverflowing, maxCollapsedHeight, toggleCollapsed } =
    useCollapsibleText(message.content)

  // Quote popup on text selection — императивный DOM, чтобы не вызывать re-render бабла
  // и не терять браузерное выделение текста
  const contentRef = useRef<HTMLDivElement>(null)
  const quotePopupRef = useRef<HTMLDivElement | null>(null)
  const quoteTextRef = useRef<string>('')

  const destroyQuotePopup = useCallback(() => {
    if (quotePopupRef.current) {
      quotePopupRef.current.remove()
      quotePopupRef.current = null
      quoteTextRef.current = ''
    }
  }, [])

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!onQuote) return
      if ((e.target as HTMLElement).closest('[data-quote-popup]')) return
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        destroyQuotePopup()
        return
      }
      const container = contentRef.current
      if (!container) return
      const range = selection.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) {
        destroyQuotePopup()
        return
      }
      const text = selection.toString().trim()
      quoteTextRef.current = text
      const rect = range.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const x = rect.left + rect.width / 2 - containerRect.left
      const y = rect.top - containerRect.top - 4

      // Удаляем старый popup если есть
      destroyQuotePopup()

      // Создаём popup императивно — без setState, без re-render
      const popup = document.createElement('div')
      popup.setAttribute('data-quote-popup', '')
      popup.className = 'absolute z-20 -translate-x-1/2 -translate-y-full'
      popup.style.left = `${x}px`
      popup.style.top = `${y}px`
      popup.innerHTML = `<button type="button" class="flex items-center gap-1.5 bg-popover text-popover-foreground border shadow-md rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
        Цитировать
      </button>`

      popup.addEventListener('mousedown', (evt) => {
        evt.preventDefault()
        evt.stopPropagation()
      })
      popup.querySelector('button')!.addEventListener('click', () => {
        onQuote!(quoteTextRef.current)
        window.getSelection()?.removeAllRanges()
        destroyQuotePopup()
      })

      container.appendChild(popup)
      quotePopupRef.current = popup
    },
    [onQuote, destroyQuotePopup],
  )

  // Скрываем popup при клике вне бабла
  useEffect(() => {
    const hide = (e: MouseEvent) => {
      if (!quotePopupRef.current) return
      if (contentRef.current?.contains(e.target as Node)) return
      destroyQuotePopup()
    }
    document.addEventListener('mousedown', hide)
    return () => document.removeEventListener('mousedown', hide)
  }, [destroyQuotePopup])

  // Cleanup при unmount
  useEffect(() => destroyQuotePopup, [destroyQuotePopup])

  const hasAttachments = !!message.attachments?.length
  const hasAttachmentsOnly = !!(
    hasAttachments &&
    (message.content === '📎' || !message.content.trim())
  )

  return (
    <div className={cn('flex group', isOwn ? 'justify-end' : 'justify-start')}>
      {/* Avatar (other messages only) */}
      {!isOwn && (
        <div className="w-8 flex-shrink-0 self-start mr-2 mt-1">
          {showAvatar ? (
            <Avatar className="h-8 w-8">
              {message.sender?.avatar_url && (
                <AvatarImage src={message.sender.avatar_url} alt={message.sender_name} />
              )}
              <AvatarFallback
                className={cn('text-xs font-medium', getAvatarColor(message.sender_name))}
              >
                {getInitials(message.sender_name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="h-8 w-8" />
          )}
        </div>
      )}

      <div className={cn('max-w-[75%] min-w-0 flex flex-col', isOwn ? 'items-end' : 'items-start')}>
        {/* Bubble + reactions */}
        <div className="relative pb-2 max-w-full" ref={contentRef} onMouseUp={handleMouseUp}>
          {/* Quote popup рендерится императивно через DOM — см. handleMouseUp */}

          <div
            id={`msg-${message.id}`}
            className={cn(
              'relative rounded-2xl px-4 py-2.5 min-w-[10rem] overflow-hidden transition-all duration-500',
              message.reactions?.length && 'pb-5',
              message.is_draft
                ? accent === 'dark'
                  ? 'bg-white border-2 border-stone-600 text-gray-900'
                  : 'bg-white border-2 border-blue-500 text-gray-900'
                : isOwn
                  ? tgFailed
                    ? 'bg-transparent border-2 border-red-500 text-red-600'
                    : colors.own
                  : cn(colors.incoming, showAvatar && 'rounded-tl-md'),
            )}
          >
            {/* Draft label */}
            {message.is_draft && (
              <span
                className={cn(
                  'absolute -top-2.5 right-3 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider bg-white',
                  accent === 'dark' ? 'text-stone-500' : 'text-blue-500',
                )}
              >
                Черновик
              </span>
            )}

            {/* Failed delivery badge */}
            {tgFailed && !message.is_draft && <TelegramFailedBadge />}

            <BubbleHeader message={message} isOwn={isOwn} showAvatar={showAvatar} accent={accent} />

            {/* Text content */}
            {!hasAttachmentsOnly && (
              <BubbleTextContent
                message={message}
                isOwn={isOwn}
                accent={accent}
                hasAttachments={hasAttachments}
                deliveryStatus={deliveryStatus}
                tgFailed={tgFailed}
                textRef={textRef}
                isCollapsed={isCollapsed}
                isOverflowing={isOverflowing}
                maxCollapsedHeight={maxCollapsedHeight}
                toggleCollapsed={toggleCollapsed}
                onPublishDraft={onPublishDraft}
              />
            )}

            {/* Attachments */}
            {hasAttachments && (
              <MessageAttachments
                attachments={message.attachments!}
                isOwn={isOwn}
                isDraft={message.is_draft}
                isFailed={tgFailed}
                projectId={projectId}
                workspaceId={workspaceId}
              />
            )}

            {/* Time under attachments */}
            {hasAttachments && (
              <div className="flex items-center gap-1 mt-1 justify-end">
                <BubbleTimestamp
                  message={message}
                  isOwn={isOwn}
                  deliveryStatus={deliveryStatus}
                  tgFailed={tgFailed}
                />
              </div>
            )}

            {/* Send now button for short drafts */}
            {message.is_draft && onPublishDraft && !isOverflowing && (
              <div className="flex justify-end mt-1.5">
                <DraftPublishButton
                  message={message}
                  accent={accent}
                  onPublishDraft={onPublishDraft}
                />
              </div>
            )}
          </div>

          {/* Reaction badges */}
          <ReactionBadges
            reactions={message.reactions ?? []}
            currentParticipantId={currentParticipantId}
            onReact={(emoji) => onReact(message.id, emoji)}
            accent={accent}
          />

          {/* Hover actions */}
          {!isDelayedPending && (
            <MessageActions
              message={message}
              isOwn={isOwn}
              onReply={onReply}
              onReact={onReact}
              onEdit={onEdit}
              onDelete={onDelete}
              canDelete={canDelete}
              onQuote={onQuote}
              onForwardToChat={onForwardToChat}
              forwardChats={forwardChats}
              currentThreadId={currentThreadId}
              onPublishDraft={onPublishDraft}
              onEditDraft={onEditDraft}
              onViewEmail={message.source === 'email' ? () => setEmailViewOpen(true) : undefined}
              channel={channel}
              onDeleteDialogOpen={() => setDeleteDialogOpen(true)}
              moreMenuOpen={moreMenuOpen}
              setMoreMenuOpen={setMoreMenuOpen}
              reactionPopoverOpen={reactionPopoverOpen}
              setReactionPopoverOpen={setReactionPopoverOpen}
            />
          )}
        </div>

        {/* Delayed send countdown */}
        {isDelayedPending && delayedExpiresAt && onCancelDelayed && (
          <SendCountdown expiresAt={delayedExpiresAt} onCancel={onCancelDelayed} />
        )}
      </div>

      <DeleteMessageDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        telegramMessageId={message.telegram_message_id}
        onConfirm={() => onDelete?.(message.id)}
      />

      <EmailFullViewDialog
        message={message}
        open={emailViewOpen}
        onOpenChange={setEmailViewOpen}
      />
    </div>
  )
}

// memo нужен потому, что MessageBubble рендерится десятками в MessageList.map() и
// при каждом новом сообщении/скролле/realtime-событии все баблы иначе ререндерятся.
export const MessageBubble = memo(MessageBubbleImpl)
