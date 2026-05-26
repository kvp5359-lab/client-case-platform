import { memo, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { CornerDownRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MessageAttachments } from './MessageAttachment'
import { isImage } from './utils/attachmentHelpers'
import { getInitials, getAvatarColor } from '@/utils/avatarHelpers'
import { useContactCardStore } from '@/store/contactCardStore'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import { isEmailSource } from '@/services/api/messenger/messengerService.types'
import { bubbleStyles } from './utils/messageStyles'
import { useCollapsibleText } from './hooks/useCollapsibleText'
import { DeliveryFailedBadge, useDeliveryStatus } from './DeliveryIndicator'
import { isSoftTelegramError } from './DeliveryIndicator'
// QuotePopup рендерится императивно (DOM) — см. handleMouseUp в MessageBubble
import { ReactionBadges } from './ReactionBadges'
import { MessageActions, MessageContextMenu } from './MessageActions'
import { SendCountdown } from './SendCountdown'
import { BubbleHeader } from './BubbleHeader'
import { BubbleTimestamp } from './BubbleTimestamp'
import { BubbleTextContent, DraftPublishButton, RetrySendButton } from './BubbleTextContent'
import { ScheduledControls, formatScheduledTime } from './ScheduledControls'
import { DeleteMessageDialog } from './DeleteMessageDialog'
import { EmailFullViewDialog } from './EmailFullViewDialog'
import { useMessengerContext } from './MessengerContext'
import { useTranslateMessage } from '@/hooks/messenger/useTranslateMessage'
import { useMyPreferredLanguage } from '@/hooks/useMyPreferredLanguage'
import { useThreadTranslations } from '@/hooks/messenger/useThreadTranslations'
import { isStaffRole } from '@/types/permissions'

export type { MessengerAccent } from './utils/messageStyles'

// «Командные» отправители маркируются кольцом аватара. Источник правды —
// STAFF_ROLES из permissions.ts (Владелец/Администратор/Сотрудник/Исполнитель).
const isTeamSender = isStaffRole

type MessageBubbleProps = {
  message: ProjectMessage
  isOwn: boolean
  showAvatar?: boolean
  canDelete?: boolean
  isDelayedPending?: boolean
  delayedExpiresAt?: number
  /** Передаём id сообщения внутрь — позволяет родителю не пересоздавать стрелку на каждый рендер. */
  onCancelDelayed?: (messageId: string) => void
  /** Чужое сообщение, пришедшее после last_read_at — подсветить как непрочитанное. */
  isUnread?: boolean
  /** Нужен ReactionBadges, чтобы определить непрочитанные реакции. */
  lastReadAt?: string
}

function MessageBubbleImpl({
  message,
  isOwn,
  showAvatar = true,
  canDelete,
  isDelayedPending,
  delayedExpiresAt,
  onCancelDelayed,
  isUnread,
  lastReadAt,
}: MessageBubbleProps) {
  const {
    currentParticipantId,
    accent = 'blue',
    projectId,
    workspaceId,
    channel,
    isClientThread,
    isEmailThread,
    isBusinessThread,
    isWazzupThread,
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
    onRetryTelegramSend,
    onCancelScheduled,
    onSendScheduledNow,
    onReschedule,
    isSearchActive,
    onJumpToMessage,
    threadContactParticipantId,
  } = useMessengerContext()
  const isScheduled = !!message.is_draft && !!message.scheduled_send_at
  // «В процессе отправки» — приглушённый бабл + лейбл «Отправляется».
  // Состояние включает:
  //  - optimistic (только что INSERT, в БД ещё нет)
  //  - real в БД, но Edge Function (Gmail/Telegram/Wazzup) ещё не подтвердила доставку
  // Визуальный эффект непрерывный: бабл засветлён до финальной галочки.
  const isOptimisticId = message.id.startsWith('optimistic-')
  const colors = bubbleStyles[accent]
  const showStaffMark = !!isClientThread && isTeamSender(message.sender_role)
  // Имя отправителя берём из join'нутого participant'а (актуальное на момент рендера).
  // sender_name на сообщении — это исторический snapshot, может быть устаревший
  // (например, после переименования контакта).
  const participantDisplayName = message.sender
    ? [message.sender.name, message.sender.last_name].filter(Boolean).join(' ')
    : ''
  const displayName = participantDisplayName || message.sender_name
  const rawDeliveryStatus = useDeliveryStatus(message, isOwn)
  // Soft-fail: сообщение доставлено (есть telegram_message_id), но
  // потерялась только цитата / fallback на бота-секретаря.
  // UI не красит такой бабл, рисует тонкую метку.
  const softTelegramError = isSoftTelegramError(message)
  // Drafts/scheduled — ещё не отправлены, поэтому таймер «не доставлено»
  // в useDeliveryStatus для них не имеет смысла.
  const deliveryFailed =
    rawDeliveryStatus === 'failed' && !softTelegramError && !message.is_draft
  // Старый getDeliveryStatus возвращал 'pending' | 'sent' | 'read' | null, а
  // 'failed' рендерится отдельным бейджем. Маппим, чтобы не трогать DeliveryIcon.
  const deliveryStatus = rawDeliveryStatus === 'failed' ? null : rawDeliveryStatus

  // Финальный флаг «в процессе отправки»: оптимистик ИЛИ ожидание доставки
  // (для исходящих, ещё не подтверждённых каналом). Используется и для
  // приглушения, и для лейбла «Отправляется».
  const isOptimistic =
    isOptimisticId || (isOwn && deliveryStatus === 'pending' && !message.is_draft)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [emailViewOpen, setEmailViewOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [reactionPopoverOpen, setReactionPopoverOpen] = useState(false)

  // ─── Перевод сообщения (унифицированно для двух источников) ───────────
  // (A) Кэш перевода входящего: message_translations на моём preferred_language.
  // (B) Отправленный перевод: автор писал на своём языке, в БД ушёл перевод,
  //     оригинал лежит в message.original_content. Виден только автору.
  // Источник нормализуется в `translationSource` ниже — и логика toggle/
  // подмены контента одна на оба случая.
  const { data: preferredLang } = useMyPreferredLanguage()
  const { data: threadTranslations } = useThreadTranslations(
    message.thread_id ?? undefined,
    preferredLang ?? undefined,
  )
  const existingTranslation = useMemo(
    () => threadTranslations?.find((t) => t.message_id === message.id) ?? null,
    [threadTranslations, message.id],
  )

  // Унифицированный «оригинал ↔ перевод» pair.
  const translationSource = useMemo(() => {
    // (B) — приоритет, потому что для автора это его собственное намерение
    // (перевёл и отправил), не зависит от текущего preferred_language.
    if (isOwn && message.original_content) {
      return {
        kind: 'sent' as const,
        originalContent: message.original_content,
        originalLanguage: message.original_language ?? null,
        translatedContent: message.content,
        // Target language для отправленных не сохраняли — известно только что
        // это «язык клиента»; в пилюле показываем иконку без кода.
        targetLanguage: null as string | null,
      }
    }
    if (existingTranslation) {
      return {
        kind: 'received' as const,
        originalContent: message.content,
        originalLanguage: existingTranslation.source_language ?? null,
        translatedContent: existingTranslation.translated_content,
        targetLanguage: existingTranslation.target_language,
      }
    }
    return null
  }, [isOwn, message.content, message.original_content, message.original_language, existingTranslation])

  // viewMode: какой контент показывать ВНУТРИ баббла.
  // Дефолт для отправленных — 'translation' (то, что реально ушло клиенту).
  // Дефолт для входящих — 'original' (как клиент написал).
  const [viewMode, setViewMode] = useState<'original' | 'translation'>(() =>
    isOwn && message.original_content ? 'translation' : 'original',
  )
  const translateMutation = useTranslateMessage()
  const handleTranslate = useCallback(() => {
    const target = preferredLang || 'ru'
    translateMutation.mutate(
      { messageId: message.id, targetLanguage: target, threadId: message.thread_id ?? undefined },
      {
        onSuccess: () => {
          // После успешного перевода переключаемся на показ перевода в баббле.
          setViewMode('translation')
        },
      },
    )
  }, [preferredLang, translateMutation, message.id, message.thread_id])
  const handleToggleViewMode = useCallback(() => {
    setViewMode((m) => (m === 'translation' ? 'original' : 'translation'))
  }, [])

  // Финальный контент: если есть translationSource — берём из него по viewMode,
  // иначе обычный message.content.
  const displayContent = translationSource
    ? viewMode === 'translation'
      ? translationSource.translatedContent
      : translationSource.originalContent
    : message.content
  const displayMessage = useMemo(
    () => (displayContent === message.content ? message : { ...message, content: displayContent }),
    [message, displayContent],
  )

  const { textRef, isCollapsed, isOverflowing, maxCollapsedHeight, toggleCollapsed } =
    useCollapsibleText(displayContent)

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

  // Показ/скрытие popup'а «Цитировать» по выделению текста.
  // Слушаем mouseup на document'е, а не на самом баббле — иначе если юзер
  // протянул выделение за границы баббла, mouseup случается вне нашего div'а
  // и кнопка просто не появляется. По document — ловим всегда.
  useEffect(() => {
    if (!onQuote) return
    const showOrHide = (e: MouseEvent) => {
      // Клик по самому popup'у — не пересчитываем выделение.
      if ((e.target as HTMLElement | null)?.closest?.('[data-quote-popup]')) return
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        destroyQuotePopup()
        return
      }
      const container = contentRef.current
      if (!container) return
      const range = selection.getRangeAt(0)
      // Показываем popup только если выделение пересекается с нашим баблом —
      // не открываем своё для выделений в других сообщениях.
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
    }
    document.addEventListener('mouseup', showOrHide)
    return () => document.removeEventListener('mouseup', showOrHide)
  }, [onQuote, destroyQuotePopup])

  // Скрываем popup при клике (mousedown) вне бабла. mouseup для popup-показа
  // уже на document'е выше, mousedown отдельно — для срабатывания при клике
  // вне выделения (тогда выделение схлопывается, и mouseup-обработчик уберёт
  // popup).
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
  const hasImages = !!message.attachments?.some((a) => isImage(a.mime_type))
  const hasNonImageAttachments = !!message.attachments?.some((a) => !isImage(a.mime_type))
  // Pill-фон таймстампа, лежащего поверх картинки — повторяет фон бабла,
  // чтобы выглядело как «вырез» в углу изображения.
  const timestampPillBg = message.is_draft
    ? 'bg-white'
    : isOwn
      ? deliveryFailed
        ? 'bg-white'
        : colors.own.split(' ').find((c) => c.startsWith('bg-')) ?? ''
      : colors.incoming.split(' ').find((c) => c.startsWith('bg-')) ?? ''

  return (
    <div className={cn('flex group items-start', isOwn ? 'justify-end' : 'justify-start')}>
      {/* Кнопка «Перейти к сообщению» — только в режиме поиска и только
          на hover над конкретным сообщением */}
      {isSearchActive && onJumpToMessage && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onJumpToMessage(message.id)
          }}
          className="self-center mr-2 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-muted-foreground/30 rounded-full text-muted-foreground hover:text-foreground hover:border-muted-foreground/60 hover:bg-muted whitespace-nowrap"
          aria-label="Перейти к сообщению в чате"
        >
          <CornerDownRight className="h-3 w-3" />
          Перейти к сообщению
        </button>
      )}

      {/* Avatar (other messages only).
          У сообщений от команды (любая роль кроме «Клиент» / «Telegram-контакт»)
          добавляем кольцо цвета акцента чата — визуальный маркер принадлежности
          к команде, чтобы отличать от клиента. */}
      {!isOwn && (
        <div className="w-8 flex-shrink-0 self-start mr-2 mt-1">
          {showAvatar ? (
            <button
              type="button"
              onClick={() => {
                const pid = message.sender_participant_id ?? threadContactParticipantId
                if (pid) useContactCardStore.getState().open(pid)
              }}
              disabled={!message.sender_participant_id && !threadContactParticipantId}
              className={cn(
                'rounded-full focus:outline-none',
                (message.sender_participant_id || threadContactParticipantId) &&
                  'hover:ring-2 hover:ring-offset-1 hover:ring-primary/30 transition-shadow cursor-pointer',
              )}
              aria-label={`Открыть карточку ${displayName}`}
            >
              <Avatar
                className={cn(
                  'h-8 w-8',
                  showStaffMark && cn('ring-2 ring-offset-1', colors.staffRing),
                )}
              >
                {message.sender?.avatar_url && (
                  <AvatarImage src={message.sender.avatar_url} alt={displayName} />
                )}
                <AvatarFallback
                  className={cn('text-xs font-medium', getAvatarColor(displayName))}
                >
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
            </button>
          ) : (
            <div className="h-8 w-8" />
          )}
        </div>
      )}

      <div className={cn('max-w-[75%] min-w-0 flex flex-col', isOwn ? 'items-end' : 'items-start')}>
        {/* Bubble + reactions */}
        <MessageContextMenu
          disabled={isDelayedPending}
          message={message}
          isOwn={isOwn}
          onReply={onReply}
          onQuote={onQuote}
          onReact={onReact}
          onEdit={onEdit}
          onDelete={onDelete}
          canDelete={canDelete}
          onForwardToChat={onForwardToChat}
          forwardChats={forwardChats}
          currentThreadId={currentThreadId}
          onPublishDraft={onPublishDraft}
          onEditDraft={onEditDraft}
          onViewEmail={isEmailSource(message.source) ? () => setEmailViewOpen(true) : undefined}
          onTranslate={handleTranslate}
          translationToggle={
            translationSource
              ? {
                  currentMode: viewMode,
                  targetLanguage: translationSource.targetLanguage,
                  sourceLanguage: translationSource.originalLanguage,
                  onToggle: handleToggleViewMode,
                }
              : undefined
          }
          isTranslating={translateMutation.isPending}
          onDeleteDialogOpen={() => setDeleteDialogOpen(true)}
          reactionsDisabled={Boolean(isEmailThread || isBusinessThread || isWazzupThread)}
          reactionPopoverOpen={reactionPopoverOpen}
          setReactionPopoverOpen={setReactionPopoverOpen}
        >
        <div className="relative max-w-full" ref={contentRef}>
          {/* Quote popup рендерится императивно через DOM — см. useEffect на mouseup в document */}

          {/* Оптимистический лейбл «Отправляется» — для свежих исходящих,
              которые ещё не вернулись из БД через realtime. */}
          {isOptimistic && !message.is_draft && (
            <span className="absolute -top-1.5 right-3 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider bg-white inline-flex items-center gap-1 z-10 whitespace-nowrap text-blue-500">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Отправляется
            </span>
          )}

          {/* Draft / Scheduled label — вынесен наружу бабла, чтобы overflow-hidden не обрезал */}
          {message.is_draft && (
            <span
              className={cn(
                'absolute -top-1.5 right-3 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider bg-white inline-flex items-center gap-1 z-10 whitespace-nowrap',
                isScheduled
                  ? 'text-amber-600'
                  : accent === 'dark'
                    ? 'text-stone-500'
                    : 'text-blue-500',
              )}
            >
              {isScheduled
                ? `⏱ На ${formatScheduledTime(message.scheduled_send_at!)}`
                : 'Черновик'}
            </span>
          )}

          <div
            id={`msg-${message.id}`}
            className={cn(
              'relative rounded-2xl px-4 py-2.5 min-w-[10rem] overflow-hidden transition-all duration-500',
              // Оптимистическое сообщение — приглушаем до возврата из БД.
              isOptimistic && 'opacity-70',
              // Левый индикатор бабла:
              //  - 4px красный — непрочитанное (приоритет, перебивает «сотрудник»);
              //  - 2px цвета акцента — прочитанное от сотрудника в клиентском чате.
              isUnread && !isOwn
                ? 'border-l-4 border-red-500'
                : !isOwn && showStaffMark && cn('border-l-2', colors.staffBorder),
              // Нижний padding только для аудио/файлов: у них таймстамп лежит абсолютно
              // под бабла. Если в сообщении есть картинки — таймстамп уезжает поверх
              // картинки, и лишний отступ снизу не нужен.
              hasNonImageAttachments && !hasImages && 'pb-6',
              message.is_draft
                ? isScheduled
                  ? 'bg-white border-2 border-dashed border-amber-500 text-gray-900'
                  : accent === 'dark'
                    ? 'bg-white border-2 border-stone-600 text-gray-900'
                    : 'bg-white border-2 border-blue-500 text-gray-900'
                : isOwn
                  ? deliveryFailed
                    ? 'bg-transparent border-2 border-red-500 text-red-600'
                    : colors.own
                  : cn(colors.incoming, showAvatar && 'rounded-tl-md'),
            )}
          >
            {/* Failed delivery badge */}
            {deliveryFailed && !message.is_draft && <DeliveryFailedBadge />}

            <BubbleHeader message={message} isOwn={isOwn} showAvatar={showAvatar} accent={accent} />

            {/* Text content — displayMessage может содержать переведённый content вместо оригинала */}
            {!hasAttachmentsOnly && (
              <BubbleTextContent
                message={displayMessage}
                isOwn={isOwn}
                accent={accent}
                hasAttachments={hasAttachments}
                deliveryStatus={deliveryStatus}
                deliveryFailed={deliveryFailed}
                textRef={textRef}
                isCollapsed={isCollapsed}
                isOverflowing={isOverflowing}
                maxCollapsedHeight={maxCollapsedHeight}
                toggleCollapsed={toggleCollapsed}
                onPublishDraft={onPublishDraft}
                onRetrySend={onRetryTelegramSend}
              />
            )}

            {/* Attachments */}
            {hasAttachments && (
              <MessageAttachments
                attachments={message.attachments!}
                isOwn={isOwn}
                isDraft={message.is_draft}
                isFailed={deliveryFailed}
                projectId={projectId}
                workspaceId={workspaceId}
                imageTimestampOverlay={
                  hasImages ? (
                    <div
                      className={cn(
                        'flex items-center gap-1 rounded-full px-1.5 py-0.5 backdrop-blur-sm',
                        timestampPillBg,
                      )}
                    >
                      <BubbleTimestamp
                        message={message}
                        isOwn={isOwn}
                        deliveryStatus={deliveryStatus}
                        deliveryFailed={deliveryFailed}
                      />
                    </div>
                  ) : undefined
                }
              />
            )}

            {/* Timestamp для attachment-баббла рендерится absolute (см. ниже),
                чтобы его позиция не менялась при появлении/исчезновении реакций. */}

            {/* Send now button for short drafts */}
            {message.is_draft && !isScheduled && onPublishDraft && !isOverflowing && (
              <div className="flex justify-end mt-1.5">
                <DraftPublishButton
                  message={message}
                  accent={accent}
                  onPublishDraft={onPublishDraft}
                />
              </div>
            )}

            {/* Controls for scheduled messages */}
            {isScheduled && !isOverflowing && (
              <ScheduledControls
                messageId={message.id}
                scheduledSendAt={message.scheduled_send_at}
                onSendNow={onSendScheduledNow}
                onCancel={onCancelScheduled}
                onReschedule={onReschedule}
              />
            )}

            {/* Retry send button for failed Telegram delivery */}
            {!message.is_draft && deliveryFailed && onRetryTelegramSend && !isOverflowing && (
              <div className="flex justify-end mt-1.5">
                <RetrySendButton message={message} onRetrySend={onRetryTelegramSend} />
              </div>
            )}

            {/* Soft-fail плашка: сообщение доставлено, но цитата не ушла */}
            {softTelegramError && !message.is_draft && (
              <div
                className="mt-1 text-[10px] text-muted-foreground/80 italic"
                title="Telegram отклонил цитирование оригинала. Сообщение отправлено как обычный текст."
              >
                📎 без цитаты
              </div>
            )}
          </div>

          {/* Reaction badges */}
          <ReactionBadges
            reactions={message.reactions ?? []}
            currentParticipantId={currentParticipantId}
            onReact={(emoji) => onReact(message.id, emoji)}
            accent={accent}
            lastReadAt={lastReadAt}
          />

          {/* Timestamp в правом нижнем углу бабла — только когда есть аудио/файлы
              без картинок. Для картинок таймстамп идёт оверлеем на самой картинке
              (см. imageTimestampOverlay у MessageAttachments выше). */}
          {hasNonImageAttachments && !hasImages && (
            <div className="absolute bottom-2 right-4 flex items-center gap-1 z-10 pointer-events-none">
              <BubbleTimestamp
                message={message}
                isOwn={isOwn}
                deliveryStatus={deliveryStatus}
                deliveryFailed={deliveryFailed}
              />
            </div>
          )}

          {/* Hover actions — единственная кнопка: «три точки». Тот же набор действий
              доступен по правой кнопке мыши через MessageContextMenu. */}
          {!isDelayedPending && (
            <MessageActions
              message={message}
              isOwn={isOwn}
              accent={accent}
              onReply={onReply}
              onQuote={onQuote}
              onReact={onReact}
              onEdit={onEdit}
              onDelete={onDelete}
              canDelete={canDelete}
              onForwardToChat={onForwardToChat}
              forwardChats={forwardChats}
              currentThreadId={currentThreadId}
              onPublishDraft={onPublishDraft}
              onEditDraft={onEditDraft}
              onViewEmail={isEmailSource(message.source) ? () => setEmailViewOpen(true) : undefined}
              onTranslate={handleTranslate}
              translationToggle={
                translationSource
                  ? {
                      currentMode: viewMode,
                      targetLanguage: translationSource.targetLanguage,
                      sourceLanguage: translationSource.originalLanguage,
                      onToggle: handleToggleViewMode,
                    }
                  : undefined
              }
              isTranslating={translateMutation.isPending}
              channel={channel}
              onDeleteDialogOpen={() => setDeleteDialogOpen(true)}
              reactionsDisabled={Boolean(isEmailThread || isBusinessThread || isWazzupThread)}
              moreMenuOpen={moreMenuOpen}
              setMoreMenuOpen={setMoreMenuOpen}
              reactionPopoverOpen={reactionPopoverOpen}
              setReactionPopoverOpen={setReactionPopoverOpen}
            />
          )}
        </div>
        </MessageContextMenu>

        {/* Delayed send countdown */}
        {isDelayedPending && delayedExpiresAt && onCancelDelayed && (
          <SendCountdown expiresAt={delayedExpiresAt} onCancel={() => onCancelDelayed(message.id)} />
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
