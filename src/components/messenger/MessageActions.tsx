import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { MoreVertical, Eye, Languages, Loader2, Reply, Quote, Copy, SmilePlus } from 'lucide-react'
import { stripHtml, stripHtmlKeepNewlines } from '@/utils/format/messengerHtml'
import { copyMessageText } from '@/utils/messenger/copyMessageText'
import { REACTIONS } from './ReactionPicker'
import { trackReactionUsage } from '@/utils/messenger/recentReactions'
import { isReactionSupportedForSource } from '@/services/api/messenger/reactionStrategies'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useQuickReactions } from '@/hooks/messenger/useQuickReactions'
import type { ProjectMessage, MessageChannel } from '@/services/api/messenger/messengerService'
import { bubbleStyles, type MessengerAccent } from './utils/messageStyles'
import {
  renderMessageMenuBody,
  DROPDOWN_COMPONENTS,
  CONTEXT_COMPONENTS,
} from './MessageMenuBody'

type MessageActionsProps = {
  message: ProjectMessage
  isOwn: boolean
  accent?: MessengerAccent
  /** Классы фона бабла (с учётом visibility: team=нейтраль, self=жёлтый) —
   *  чтобы пилюля действий совпадала с цветом бабла, а не акцента. */
  bubbleOwnClass?: string
  bubbleIncomingClass?: string
  /** Светлый фон бабла (self) — иконки действий тёмные, не белые. */
  lightBubble?: boolean
  onReply: (msg: ProjectMessage) => void
  onQuote?: (text: string) => void
  onReact: (messageId: string, emoji: string) => void
  onEdit?: (msg: ProjectMessage) => void
  onDelete?: (messageId: string) => void
  canDelete?: boolean
  onForward?: (msg: ProjectMessage) => void
  onPublishDraft?: (msg: ProjectMessage) => void
  onEditDraft?: (msg: ProjectMessage) => void
  onViewEmail?: () => void
  onTranslate?: (msg: ProjectMessage) => void
  /** Если задан — для сообщения уже есть кэш перевода на текущий язык юзера,
   *  ИЛИ это отправленное сообщение, где автор сам отправил перевод (оригинал
   *  лежит в message.original_content). Рендерим кнопку-пилюлю переключения
   *  «оригинал ↔ перевод» в углу баббла. */
  translationToggle?: {
    currentMode: 'original' | 'translation'
    /** null для отправленных переводов (target = язык клиента, мы не сохраняли). */
    targetLanguage: string | null
    sourceLanguage: string | null
    onToggle: () => void
  }
  /** Идёт сетевой запрос перевода — показать спиннер вместо/рядом с три-точками. */
  isTranslating?: boolean
  channel?: MessageChannel
  onDeleteDialogOpen: () => void
  /** Принудительно скрыть UI быстрых реакций — используется для тредов,
   *  где реакции технически не доставляются получателю (email, business,
   *  wazzup). По умолчанию false. */
  reactionsDisabled?: boolean
  moreMenuOpen: boolean
  setMoreMenuOpen: (v: boolean) => void
  reactionPopoverOpen: boolean
  setReactionPopoverOpen: (v: boolean) => void
}

export function MessageActions({
  message,
  isOwn,
  accent = 'blue',
  bubbleOwnClass,
  bubbleIncomingClass,
  lightBubble = false,
  onReply,
  onQuote,
  onReact,
  onEdit,
  onDelete,
  canDelete,
  onForward,
  onPublishDraft,
  onEditDraft,
  onViewEmail,
  onTranslate,
  translationToggle,
  isTranslating,
  onDeleteDialogOpen,
  reactionsDisabled,
  moreMenuOpen,
  setMoreMenuOpen,
  reactionPopoverOpen,
  setReactionPopoverOpen,
}: MessageActionsProps) {
  const quickReactions = useQuickReactions()
  const colors = bubbleStyles[accent] ?? bubbleStyles.blue
  const isScheduled = !!message.is_draft && !!message.scheduled_send_at
  // Есть ли текст для Цитировать/Копировать (у вложений без подписи — нет).
  const hasText = !!stripHtml(message.content).trim()
  // Быстрая реакция из ряда иконок (отдельный popover, не путать с меню).
  const [quickReactOpen, setQuickReactOpen] = useState(false)
  const reactionsAllowed =
    !message.is_draft && !reactionsDisabled && isReactionSupportedForSource(message.source)
  // Кнопки действий: по умолчанию приглушённые без фона (не яркая пилюля),
  // подложка и полный цвет — только при наведении.
  const actionBtnClass = cn(
    'h-6 w-6 rounded-full transition-colors',
    isOwn
      ? message.is_draft
        ? // Черновик — светлый бабл (белый фон + цветной бордер), белая иконка невидима.
          'text-foreground/55 hover:text-foreground hover:bg-foreground/10'
        : lightBubble
          ? 'text-amber-900/60 hover:text-amber-900 hover:bg-black/10'
          : 'text-white/60 hover:text-white hover:bg-white/20'
      : 'text-foreground/45 hover:text-foreground hover:bg-foreground/10',
  )
  // Фон пилюли — цвет бабла. Для своих — солид (bg-blue-500 text-white),
  // для входящих — лёгкий тинт (bg-blue-100/70 ...). В обоих случаях цвет
  // совпадает с баблом — кнопка не выглядит «чужеродным» кружком и перекрывает
  // галочку/время, если попала на них в коротком бабле.
  //
  // Drafts/scheduled — бабл белый с цветным dashed-бордером (amber/blue), поэтому
  // accent-пилюля выглядит чужеродно (синий кружок на белом). Подбираем
  // нейтральный фон под цвет бордера бабла.
  const draftPillClass = isScheduled
    ? 'bg-amber-100 text-amber-700'
    : 'bg-gray-100 text-gray-600'
  const pillClass = message.is_draft
    ? draftPillClass
    : isOwn
      ? bubbleOwnClass ?? colors.own
      : bubbleIncomingClass ?? colors.incoming

  // Пилюля-toggle перевода живёт в том же контейнере, но видна всегда, без
  // group-hover: иначе юзер не догадается, что у сообщения есть готовый перевод.
  const renderTranslationToggle = () => {
    if (isTranslating) {
      return (
        <span
          className={cn(
            'h-6 px-1.5 rounded-full inline-flex items-center justify-center',
            pillClass,
          )}
          title="Переводим…"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
        </span>
      )
    }
    if (!translationToggle) return null
    const showingTranslation = translationToggle.currentMode === 'translation'
    const activeLang = showingTranslation
      ? translationToggle.targetLanguage
      : translationToggle.sourceLanguage
    return (
      <button
        type="button"
        onClick={translationToggle.onToggle}
        className={cn(
          'h-6 rounded-full inline-flex items-center gap-1 text-[10px] font-medium uppercase hover:brightness-110 transition-all',
          activeLang ? 'px-1.5' : 'w-6 justify-center',
          pillClass,
        )}
        title={showingTranslation ? 'Показать оригинал' : 'Показать перевод'}
      >
        <Languages className="h-3 w-3" />
        {activeLang}
      </button>
    )
  }

  return (
    <div
      className={cn(
        'absolute top-1 right-1 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
        (moreMenuOpen || reactionPopoverOpen || quickReactOpen) && 'opacity-100',
      )}
    >
      {renderTranslationToggle()}
      {/* Единая подложка ряда — в цвет бабла, чтобы иконки не налезали на
          содержимое. Сами иконки приглушены, подсветка — на hover.
          Непрозрачный bg-background снизу — иначе у входящих полупрозрачный
          тинт бабла (/70) просвечивает текст под кнопками. */}
      <div className="rounded-full bg-background shadow-sm">
      <div className={cn('flex items-center gap-0.5 rounded-full px-0.5', pillClass)}>
      {/* Быстрые действия при наведении: Ответить, Цитировать, Копировать.
          У СВОИХ сообщений их прячем — оставляем только «три точки».
          Полный набор (перевод, удалить) — в меню «три точки». */}
      {!isOwn && !message.is_draft && (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Ответить"
            title="Ответить"
            className={actionBtnClass}
            onClick={() => onReply(message)}
          >
            <Reply className="h-4 w-4" />
          </Button>
          {onQuote && hasText && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Цитировать"
              title="Цитировать"
              className={actionBtnClass}
              onClick={() => onQuote(stripHtmlKeepNewlines(message.content))}
            >
              <Quote className="h-4 w-4" />
            </Button>
          )}
          {hasText && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Копировать текст"
              title="Копировать текст"
              className={actionBtnClass}
              onClick={() => copyMessageText(message)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
        </>
      )}
      {!isOwn && onViewEmail && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Открыть письмо"
          className={actionBtnClass}
          onClick={onViewEmail}
        >
          <Eye className="h-4 w-4" />
        </Button>
      )}
      {!isOwn && reactionsAllowed && (
        <Popover open={quickReactOpen} onOpenChange={setQuickReactOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Реакция"
              title="Реакция"
              className={actionBtnClass}
            >
              <SmilePlus className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="end" side="top">
            <div className="grid grid-cols-6 gap-1">
              {REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    trackReactionUsage(e)
                    onReact(message.id, e)
                    setQuickReactOpen(false)
                  }}
                  className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted text-lg transition-colors"
                >
                  {e}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
      <DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Ещё действия"
            className={actionBtnClass}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isOwn ? 'end' : 'start'} side="top" className="w-52">
          {renderMessageMenuBody(DROPDOWN_COMPONENTS, {
            message,
            isOwn,
            quickReactions,
            onReply,
            onQuote,
            onReact,
            onEdit,
            onDelete,
            canDelete,
            onForward,
            onPublishDraft,
            onEditDraft,
            onViewEmail,
            onTranslate,
            onDeleteDialogOpen,
            onCloseMenu: () => setMoreMenuOpen(false),
            reactionsDisabled,
            reactionPopoverOpen,
            setReactionPopoverOpen,
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
      </div>
    </div>
  )
}

type MessageContextMenuProps = {
  children: ReactNode
  disabled?: boolean
} & Omit<MessageActionsProps, 'moreMenuOpen' | 'setMoreMenuOpen' | 'channel'>

/**
 * Оборачивает содержимое бабла. Правая кнопка мыши открывает то же меню,
 * что и «три точки» в MessageActions — единая точка истины через renderMessageMenuBody.
 */
export function MessageContextMenu({
  children,
  disabled,
  message,
  isOwn,
  onReply,
  onQuote,
  onReact,
  onEdit,
  onDelete,
  canDelete,
  onForward,
  onPublishDraft,
  onEditDraft,
  onViewEmail,
  onTranslate,
  onDeleteDialogOpen,
  reactionsDisabled,
  reactionPopoverOpen,
  setReactionPopoverOpen,
}: MessageContextMenuProps) {
  const quickReactions = useQuickReactions()
  if (disabled) return <>{children}</>
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {renderMessageMenuBody(CONTEXT_COMPONENTS, {
          message,
          isOwn,
          quickReactions,
          onReply,
          onQuote,
          onReact,
          onEdit,
          onDelete,
          canDelete,
          onForward,
          onPublishDraft,
          onEditDraft,
          onViewEmail,
          onTranslate,
          onDeleteDialogOpen,
          reactionsDisabled,
          reactionPopoverOpen,
          setReactionPopoverOpen,
        })}
      </ContextMenuContent>
    </ContextMenu>
  )
}
