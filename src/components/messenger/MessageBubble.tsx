import { memo, useState } from 'react'
import { ATTACHMENT_PLACEHOLDER } from '@/lib/messenger/attachmentPlaceholder'
import { Loader2, Trash2, BellOff, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MessageAttachments } from './MessageAttachment'
import { isImage, isAudio } from '@/lib/messenger/attachmentHelpers'
import { getInitials, getAvatarColor } from '@/utils/avatarHelpers'
import { useContactCardStore } from '@/store/contactCardStore'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import { isEmailSource } from '@/services/api/messenger/messengerService.types'
import { resolveBubbleAppearance } from './utils/messageStyles'
import { useCollapsibleText } from './hooks/useCollapsibleText'
import { useMessageTranslation } from './hooks/useMessageTranslation'
import { useQuotePopup } from './hooks/useQuotePopup'
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

export type { MessengerAccent } from './utils/messageStyles'

// «Командные» отправители маркируются кольцом аватара. Источник правды —
// STAFF_ROLES из permissions.ts (Владелец/Администратор/Сотрудник/Исполнитель).

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
  /** Тон контура непрочитанного: 'red' (обычный) или 'slate' (заглушённый тред). */
  unreadTone?: 'red' | 'slate'
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
  unreadTone = 'red',
  lastReadAt,
}: MessageBubbleProps) {
  const {
    currentParticipantId,
    accent = 'blue',
    projectId,
    workspaceId,
    channel,
    isClientThread,
    viewerIsClient,
    isEmailThread,
    isBusinessThread,
    isWazzupThread,
    onReply,
    onReact,
    onEdit,
    onDelete,
    onQuote,
    onForward,
    onPublishDraft,
    onEditDraft,
    onRetryTelegramSend,
    onCancelScheduled,
    onSendScheduledNow,
    onReschedule,
    threadContactParticipantId,
  } = useMessengerContext()
  const isScheduled = !!message.is_draft && !!message.scheduled_send_at
  // «В процессе отправки» — приглушённый бабл + лейбл «Отправляется».
  // Состояние включает:
  //  - optimistic (только что INSERT, в БД ещё нет)
  //  - real в БД, но Edge Function (Gmail/Telegram/Wazzup) ещё не подтвердила доставку
  // Визуальный эффект непрерывный: бабл засветлён до финальной галочки.
  const isOptimisticId = message.id.startsWith('optimistic-')
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
  // Сообщение удалено в Telegram (soft-delete): по умолчанию скрываем контент
  // плашкой «Сообщение удалено», по клику раскрываем текст с пометкой «Удалено».
  const isDeleted = !!message.is_deleted
  const [revealDeleted, setRevealDeleted] = useState(false)
  const showRealContent = !isDeleted || revealDeleted
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [reactionPopoverOpen, setReactionPopoverOpen] = useState(false)

  // Перевод сообщения (унифицированно для входящего/исходящего) — см. хук.
  const {
    displayContent,
    displayMessage,
    translationSource,
    viewMode,
    handleTranslate,
    handleToggleViewMode,
    isTranslating,
  } = useMessageTranslation(message, isOwn)

  const { textRef, isCollapsed, isOverflowing, maxCollapsedHeight, toggleCollapsed } =
    useCollapsibleText(displayContent)

  // Popup «Цитировать» по выделению текста (императивный DOM) — см. хук.
  // contentRef вешаем на div с контентом сообщения.
  const { contentRef } = useQuotePopup(onQuote)

  const hasAttachments = !!message.attachments?.length
  const hasAttachmentsOnly = !!(
    hasAttachments &&
    (message.content === ATTACHMENT_PLACEHOLDER || !message.content.trim())
  )
  const hasImages = !!message.attachments?.some((a) => isImage(a.mime_type))
  const hasAudio = !!message.attachments?.some((a) => isAudio(a.mime_type))
  const hasFiles = !!message.attachments?.some(
    (a) => !isImage(a.mime_type) && !isAudio(a.mime_type),
  )
  // Есть файлы (без картинок/аудио) → время кладём ОВЕРЛЕЕМ в правый нижний угол
  // последнего файла (как у картинок), а не в текст/подвал бабла.
  const fileOverlayTimestamp = hasFiles && !hasImages && !hasAudio
  // Раскраска бабла (цвет/маркеры/staff/pill) — единая чистая функция
  // resolveBubbleAppearance (utils/messageStyles), а не инлайн. «Где считается
  // вид бабла» = там. Логика зависит от visibility×направление×клиентский-тред.
  const {
    ownBubbleClass,
    incomingBubbleClass,
    showVisMarkSelf,
    showVisMarkNote,
    showStaffMark,
    staffRingColor,
    staffBorderColor,
    timestampPillBg,
  } = resolveBubbleAppearance({
    accent,
    visibility: message.visibility,
    notifySubscribers: message.notify_subscribers,
    senderRole: message.sender_role,
    isDraft: !!message.is_draft,
    isOwn,
    isClientThread: !!isClientThread,
    viewerIsClient: !!viewerIsClient,
    deliveryFailed,
  })

  return (
    <div
      className={cn('flex group items-start', isOwn ? 'justify-end' : 'justify-start')}
      onMouseDown={(e) => {
        // Второй клик двойного клика по ПУСТОМУ месту ряда браузер по умолчанию
        // расширяет на ближайшее слово в баббле → выделение → всплывает
        // «Цитировать». Гасим это выделение (preventDefault на mousedown с
        // detail===2), только когда цель — сам ряд. Двойной клик для «Ответить»
        // (событие dblclick) при этом срабатывает как обычно.
        if (e.detail === 2 && e.target === e.currentTarget) e.preventDefault()
      }}
      onDoubleClick={(e) => {
        // Двойной клик по ПУСТОМУ месту сбоку от бабла (свободное пространство
        // flex-ряда) = «Ответить» на это сообщение. Срабатывает только когда
        // цель — сам ряд (e.target === e.currentTarget), не бабл/аватар/кнопки
        // внутри. Черновики не отвечаемы.
        if (e.target === e.currentTarget && !message.is_draft) {
          // На случай, если выделение всё же возникло — снимаем, чтобы не
          // показывался popup «Цитировать».
          window.getSelection()?.removeAllRanges()
          onReply(message)
        }
      }}
    >
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
                  showStaffMark && cn('ring-2 ring-offset-1', staffRingColor),
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

      <div className={cn('max-w-[82%] min-w-0 flex flex-col', isOwn ? 'items-end' : 'items-start')}>
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
          onForward={onForward}
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
          isTranslating={isTranslating}
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
              'relative rounded-2xl min-w-[10rem] overflow-hidden transition-all duration-500',
              // Только файлы/картинки без текста — маленький равномерный отступ
              // вокруг вложений. Иначе обычный текстовый padding.
              hasAttachmentsOnly ? 'p-2.5' : 'px-4 py-2.5',
              // Оптимистическое сообщение — приглушаем до возврата из БД.
              isOptimistic && 'opacity-70',
              // Левый индикатор бабла:
              //  - 4px красный — непрочитанное (приоритет, перебивает «сотрудник»);
              //    в заглушённом треде тон 'slate' — тёмно-серый (спокойное непрочитанное);
              //  - 2px цвета акцента — прочитанное от сотрудника в клиентском чате.
              isUnread && !isOwn
                ? cn('border-l-4', unreadTone === 'slate' ? 'border-slate-500' : 'border-red-500')
                : !isOwn && showStaffMark && cn('border-l-2', staffBorderColor),
              // Нижний резерв под absolute-таймстамп — только для аудио без текста
              // (у файлов время оверлеем на плашке, у картинок — на картинке).
              hasAttachmentsOnly && hasAudio && !hasImages && !fileOverlayTimestamp && 'pb-6',
              message.is_draft
                ? isScheduled
                  ? 'bg-white border-2 border-dashed border-amber-500 text-gray-900'
                  : accent === 'dark'
                    ? 'bg-white border-2 border-stone-600 text-gray-900'
                    : 'bg-white border-2 border-blue-500 text-gray-900'
                : isOwn
                  ? deliveryFailed
                    ? 'bg-transparent border-2 border-red-500 text-red-600'
                    : ownBubbleClass
                  : cn(incomingBubbleClass, showAvatar && 'rounded-tl-md'),
            )}
          >
            {/* Failed delivery badge */}
            {deliveryFailed && !message.is_draft && <DeliveryFailedBadge />}

            <BubbleHeader message={message} isOwn={isOwn} showAvatar={showAvatar} accent={accent} />

            {/* Сообщение удалено в Telegram (soft-delete). По умолчанию — плашка,
                по клику раскрывается исходный текст/вложения с пометкой «Удалено». */}
            {isDeleted && (
              <button
                type="button"
                onClick={() => setRevealDeleted((v) => !v)}
                className={cn(
                  'flex items-center gap-1.5 text-xs italic mb-1',
                  isOwn ? 'opacity-80 hover:opacity-100' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Trash2 className="h-3 w-3 shrink-0" />
                <span>{revealDeleted ? 'Удалено · скрыть' : 'Сообщение удалено · показать'}</span>
              </button>
            )}

            {/* Text content — displayMessage может содержать переведённый content вместо оригинала.
                leadingIcon: «Заметка» — перечёркнутый колокол, «Только я» — замок
                (рендерится flex-соседом текста, чтобы ширина бабла учитывала иконку). */}
            {showRealContent && !hasAttachmentsOnly && (
              <BubbleTextContent
                message={displayMessage}
                isOwn={isOwn}
                accent={accent}
                lightBubble={showVisMarkSelf}
                leadingIcon={
                  showVisMarkSelf ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : showVisMarkNote ? (
                    <BellOff className="h-3.5 w-3.5" />
                  ) : undefined
                }
                // Время в конце текста — только когда нет картинок и нет файлов.
                // С картинками/файлами оно идёт оверлеем на последнем вложении.
                showTimestamp={!hasImages && !fileOverlayTimestamp}
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

            {/* Failed attachment plate — файл должен был быть, но webhook не смог его загрузить из Telegram.
                Источник правды — project_messages.attachment_status='failed' (см. миграцию 20260527_telegram_attachment_status).
                Без этой плашки потерянные файлы выглядели в UI как обычные текстовые сообщения, и юзер о потере не знал. */}
            {showRealContent && message.attachment_status === 'failed' && (
              <div className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
                <div className="flex items-start gap-2">
                  <span className="text-sm leading-none">⚠️</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium mb-0.5">Файл из Telegram не загружен</div>
                    {message.attachment_error?.failed_files?.length ? (
                      <ul className="text-[11px] leading-snug space-y-0.5 break-words">
                        {message.attachment_error.failed_files.slice(0, 5).map((f, i) => (
                          <li key={i}>
                            <span className="font-mono">{f.file_name}</span>
                            {f.reason ? <span className="text-red-700"> — {f.reason}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[11px] leading-snug text-red-800">
                        Загрузка вложения из Telegram не удалась. Откройте чат в Telegram чтобы посмотреть файл.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Pending attachment — webhook качает прямо сейчас. Тонкая полоска без алёрта. */}
            {showRealContent && message.attachment_status === 'pending' && (
              <div className="mt-2 text-[11px] text-muted-foreground italic">
                Загружаю файл из Telegram…
              </div>
            )}

            {/* Attachments */}
            {showRealContent && hasAttachments && (
              <MessageAttachments
                attachments={message.attachments!}
                isOwn={isOwn}
                isDraft={message.is_draft}
                isFailed={deliveryFailed}
                projectId={projectId}
                workspaceId={workspaceId}
                threadId={message.thread_id ?? undefined}
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
                fileTimestamp={
                  fileOverlayTimestamp ? (
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
                flushTop={hasAttachmentsOnly}
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
            unreadTone={unreadTone}
          />

          {/* Timestamp в правом нижнем углу бабла — только когда есть аудио/файлы
              без картинок. Для картинок таймстамп идёт оверлеем на самой картинке
              (см. imageTimestampOverlay у MessageAttachments выше). */}
          {/* Absolute-время внизу — только для аудио без текста (у файлов время
              оверлеем на плашке, у картинок — на картинке, у текста — в тексте). */}
          {hasAttachmentsOnly && hasAudio && !hasImages && !fileOverlayTimestamp && (
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
              bubbleOwnClass={ownBubbleClass}
              bubbleIncomingClass={incomingBubbleClass}
              lightBubble={showVisMarkSelf}
              onReply={onReply}
              onQuote={onQuote}
              onReact={onReact}
              onEdit={onEdit}
              onDelete={onDelete}
              canDelete={canDelete}
              onForward={onForward}
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
              isTranslating={isTranslating}
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
