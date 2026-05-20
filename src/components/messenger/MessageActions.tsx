import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { MoreVertical, Eye, Languages, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import { bubbleStyles, type MessengerAccent } from './utils/messageStyles'
import {
  renderMessageMenuBody,
  DROPDOWN_COMPONENTS,
  CONTEXT_COMPONENTS,
} from './MessageMenuBody'

interface MessageActionsProps {
  message: ProjectMessage
  isOwn: boolean
  accent?: MessengerAccent
  onReply: (msg: ProjectMessage) => void
  onQuote?: (text: string) => void
  onReact: (messageId: string, emoji: string) => void
  onEdit?: (msg: ProjectMessage) => void
  onDelete?: (messageId: string) => void
  canDelete?: boolean
  onForwardToChat?: (msg: ProjectMessage, targetChatId: string) => void
  forwardChats?: ProjectThread[]
  currentThreadId?: string
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
  onReply,
  onQuote,
  onReact,
  onEdit,
  onDelete,
  canDelete,
  onForwardToChat,
  forwardChats,
  currentThreadId,
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
      ? colors.own
      : colors.incoming

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
        'absolute top-1 right-1 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity',
        (moreMenuOpen || reactionPopoverOpen) && 'opacity-100',
      )}
    >
      {renderTranslationToggle()}
      {onViewEmail && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Открыть письмо"
          className={cn('h-6 w-6 rounded-full hover:brightness-110', pillClass)}
          onClick={onViewEmail}
        >
          <Eye className="h-4 w-4" />
        </Button>
      )}
      <DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Ещё действия"
            className={cn(
              'h-6 w-6 rounded-full hover:brightness-110',
              pillClass,
            )}
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
            onForwardToChat,
            forwardChats,
            currentThreadId,
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
  )
}

interface MessageContextMenuProps
  extends Omit<MessageActionsProps, 'moreMenuOpen' | 'setMoreMenuOpen' | 'channel'> {
  children: ReactNode
  disabled?: boolean
}

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
  onForwardToChat,
  forwardChats,
  currentThreadId,
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
          onForwardToChat,
          forwardChats,
          currentThreadId,
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
