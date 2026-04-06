import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MessageAttachments } from './MessageAttachment'
import { getInitials, getAvatarColor } from '@/utils/avatarHelpers'
import type { ProjectMessage, MessageChannel } from '@/services/api/messenger/messengerService'
import { bubbleStyles } from './utils/messageStyles'
import { useCollapsibleText } from './hooks/useCollapsibleText'
import { TelegramFailedBadge, useTelegramDeliveryStatus } from './TelegramDeliveryIndicator'
import { QuotePopup } from './QuotePopup'
import { ReactionBadges } from './ReactionBadges'
import { MessageActions } from './MessageActions'
import { SendCountdown } from './SendCountdown'
import { getDeliveryStatus } from './bubbleUtils'
import { BubbleHeader } from './BubbleHeader'
import { BubbleTimestamp } from './BubbleTimestamp'
import { BubbleTextContent, DraftPublishButton } from './BubbleTextContent'
import { DeleteMessageDialog } from './DeleteMessageDialog'

export type { MessengerAccent } from './utils/messageStyles'

interface MessageBubbleProps {
  message: ProjectMessage
  isOwn: boolean
  currentParticipantId: string | null
  accent?: import('./utils/messageStyles').MessengerAccent
  showAvatar?: boolean
  viewerRole?: string | null
  projectId?: string
  workspaceId?: string
  onReply: (msg: ProjectMessage) => void
  onReact: (messageId: string, emoji: string) => void
  onEdit?: (msg: ProjectMessage) => void
  onDelete?: (messageId: string) => void
  canDelete?: boolean
  onQuote?: (text: string) => void
  onForward?: (msg: ProjectMessage) => void
  onPublishDraft?: (msg: ProjectMessage) => void
  onEditDraft?: (msg: ProjectMessage) => void
  channel?: MessageChannel
  isTelegramLinked?: boolean
  isDelayedPending?: boolean
  delayedExpiresAt?: number
  onCancelDelayed?: () => void
}

function MessageBubbleImpl({
  message,
  isOwn,
  currentParticipantId,
  accent = 'blue',
  showAvatar = true,
  projectId,
  workspaceId,
  onReply,
  onReact,
  onEdit,
  onDelete,
  canDelete,
  onQuote,
  onForward,
  onPublishDraft,
  onEditDraft,
  channel,
  isTelegramLinked,
  isDelayedPending,
  delayedExpiresAt,
  onCancelDelayed,
}: MessageBubbleProps) {
  const colors = bubbleStyles[accent]
  const tgDeliveryStatus = useTelegramDeliveryStatus(message, isOwn, isTelegramLinked)
  const deliveryStatus = getDeliveryStatus(message, isOwn, tgDeliveryStatus)
  const tgFailed = tgDeliveryStatus === 'failed'

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [reactionPopoverOpen, setReactionPopoverOpen] = useState(false)

  const { textRef, isCollapsed, isOverflowing, maxCollapsedHeight, toggleCollapsed } =
    useCollapsibleText(message.content)

  // Quote popup on text selection
  const contentRef = useRef<HTMLDivElement>(null)
  const [quotePopup, setQuotePopup] = useState<{ x: number; y: number; text: string } | null>(null)

  const handleMouseUp = useCallback(() => {
    if (!onQuote) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setQuotePopup(null)
      return
    }
    const container = contentRef.current
    if (!container) return
    const range = selection.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) {
      setQuotePopup(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    setQuotePopup({
      x: rect.left + rect.width / 2 - containerRect.left,
      y: rect.top - containerRect.top - 4,
      text: selection.toString().trim(),
    })
  }, [onQuote])

  useEffect(() => {
    if (!quotePopup) return
    const hide = () => setQuotePopup(null)
    document.addEventListener('mousedown', hide)
    return () => document.removeEventListener('mousedown', hide)
  }, [quotePopup])

  const hasAttachments = !!message.attachments?.length
  const hasAttachmentsOnly = !!(
    hasAttachments &&
    (message.content === '📎' || !message.content.trim())
  )

  return (
    <div className={cn('flex group overflow-hidden', isOwn ? 'justify-end' : 'justify-start')}>
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
          {/* Quote popup */}
          {quotePopup && (
            <QuotePopup
              x={quotePopup.x}
              y={quotePopup.y}
              text={quotePopup.text}
              onQuote={(text) => {
                onQuote?.(text)
                setQuotePopup(null)
              }}
            />
          )}

          <div
            className={cn(
              'relative rounded-2xl px-4 py-2.5 min-w-[10rem] overflow-hidden',
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
              onForward={onForward}
              onPublishDraft={onPublishDraft}
              onEditDraft={onEditDraft}
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
    </div>
  )
}

// memo нужен потому, что MessageBubble рендерится десятками в MessageList.map() и
// при каждом новом сообщении/скролле/realtime-событии все баблы иначе ререндерятся.
export const MessageBubble = memo(MessageBubbleImpl)
