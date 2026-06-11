import type { ComponentType, ReactNode } from 'react'
import {
  Reply,
  Pencil,
  Trash2,
  Copy,
  SmilePlus,
  Forward,
  Send,
  ExternalLink,
  Quote,
  Languages,
} from 'lucide-react'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { REACTIONS } from './ReactionPicker'
import { trackReactionUsage } from '@/utils/messenger/recentReactions'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import { isEmailSource } from '@/services/api/messenger/messengerService.types'
import { isReactionSupportedForSource } from '@/services/api/messenger/reactionStrategies'
import { stripHtml, isHtmlContent, sanitizeMessengerHtml } from '@/utils/format/messengerHtml'
import { toast } from 'sonner'

/**
 * Общая модель действий над сообщением: используется и в dropdown «три точки»,
 * и в контекстном меню по правой кнопке на баббле. Пункты рендерятся через
 * компоненты-примитивы радикса, которые мы передаём извне.
 */
export type MenuComponents = {
  Item: ComponentType<{ onClick?: () => void; className?: string; children: ReactNode }>
  Separator: ComponentType<Record<string, never>>
}

export type MessageMenuBodyProps = {
  message: ProjectMessage
  isOwn: boolean
  quickReactions: string[]
  onReply: (msg: ProjectMessage) => void
  /** Цитировать всё сообщение (plain text → blockquote в редакторе). */
  onQuote?: (text: string) => void
  onReact: (messageId: string, emoji: string) => void
  onEdit?: (msg: ProjectMessage) => void
  onDelete?: (messageId: string) => void
  canDelete?: boolean
  /** Разложить сообщение на блоки буфера пересылки (текст + файлы). */
  onForward?: (msg: ProjectMessage) => void
  onPublishDraft?: (msg: ProjectMessage) => void
  onEditDraft?: (msg: ProjectMessage) => void
  onViewEmail?: () => void
  onTranslate?: (msg: ProjectMessage) => void
  onDeleteDialogOpen: () => void
  onCloseMenu?: () => void
  /** Принудительно скрыть UI быстрых реакций — для тредов, где реакции
   *  технически не доставляются (email, business, wazzup). По умолчанию
   *  решение принимается по message.source. */
  reactionsDisabled?: boolean
  reactionPopoverOpen: boolean
  setReactionPopoverOpen: (v: boolean) => void
}

export function renderMessageMenuBody(comps: MenuComponents, props: MessageMenuBodyProps) {
  const {
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
    onCloseMenu,
    reactionsDisabled,
    reactionPopoverOpen,
    setReactionPopoverOpen,
  } = props
  const { Item, Separator } = comps

  const handleCopyText = () => {
    const raw = message.content
    const plain = stripHtml(raw)
    // Если контент HTML — копируем и как text/html, и как text/plain,
    // чтобы редакторы (Word, Notion, Google Docs) получили форматирование,
    // а терминалы/textarea — обычный текст.
    if (isHtmlContent(raw) && typeof ClipboardItem !== 'undefined') {
      const html = sanitizeMessengerHtml(raw)
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })
      navigator.clipboard
        .write([item])
        .then(() => toast.success('Скопировано'))
        .catch(() => {
          navigator.clipboard.writeText(plain).then(() => toast.success('Скопировано'))
        })
      return
    }
    navigator.clipboard.writeText(plain).then(() => toast.success('Скопировано'))
  }

  if (message.is_draft) {
    return (
      <>
        {onPublishDraft && (
          <Item onClick={() => onPublishDraft(message)}>
            <Send className="h-4 w-4 mr-2" />
            Отправить
          </Item>
        )}
        {onEditDraft && (
          <Item onClick={() => onEditDraft(message)}>
            <Pencil className="h-4 w-4 mr-2" />
            Редактировать
          </Item>
        )}
        <Item onClick={handleCopyText}>
          <Copy className="h-4 w-4 mr-2" />
          Копировать текст
        </Item>
        {canDelete && onDelete && (
          <>
            <Separator />
            <Item
              className="text-destructive focus:text-destructive"
              onClick={onDeleteDialogOpen}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Удалить
            </Item>
          </>
        )}
      </>
    )
  }

  // В каналах, где Telegram/WhatsApp/email не позволяют доставить
  // реакцию получателю, скрываем UI «быстрых реакций» совсем — вместо
  // этого менеджер использует «Ответить» свайпом и шлёт эмодзи как
  // обычное сообщение. См. infrastructure.md → «Мессенджер-каналы».
  //
  // reactionsDisabled приходит из контекста треда (например, для email-
  // треда наши исходящие имеют source='web', но реакции там тоже не
  // работают). Если контекст явно отключил — приоритетнее source-проверки.
  const reactionsAllowed = !reactionsDisabled && isReactionSupportedForSource(message.source)

  return (
    <>
      {reactionsAllowed && (
        <>
          {/* Quick reactions row.
              Каждый эмодзи обёрнут в Item (DropdownMenuItem / ContextMenuItem) —
              Radix сам закрывает родительское меню после клика. Иначе для
              ContextMenu (правая кнопка мыши) меню остаётся открытым, потому
              что у ContextMenu Root нет controlled open/onOpenChange. */}
          <div className="flex items-center justify-between px-2 py-1.5">
            {quickReactions.map((emoji) => (
              <Item
                key={emoji}
                onClick={() => {
                  trackReactionUsage(emoji)
                  onReact(message.id, emoji)
                }}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted text-lg transition-colors p-0 cursor-pointer"
              >
                {emoji}
              </Item>
            ))}
            {/* Full picker button */}
            <Popover open={reactionPopoverOpen} onOpenChange={setReactionPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                >
                  <SmilePlus className="h-4 w-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="end" side="top">
                <div className="grid grid-cols-6 gap-1">
                  {REACTIONS.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        trackReactionUsage(e)
                        onReact(message.id, e)
                        setReactionPopoverOpen(false)
                        onCloseMenu?.()
                      }}
                      className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted text-lg transition-colors"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Separator />
        </>
      )}

      <Item onClick={() => onReply(message)}>
        <Reply className="h-4 w-4 mr-2" />
        Ответить
      </Item>

      {onQuote && (
        <Item onClick={() => onQuote(stripHtml(message.content))}>
          <Quote className="h-4 w-4 mr-2" />
          Цитировать
        </Item>
      )}

      {isOwn && onEdit && (
        <Item onClick={() => onEdit(message)}>
          <Pencil className="h-4 w-4 mr-2" />
          Редактировать
        </Item>
      )}

      <Item onClick={handleCopyText}>
        <Copy className="h-4 w-4 mr-2" />
        Копировать текст
      </Item>

      {onTranslate && (
        <Item onClick={() => onTranslate(message)}>
          <Languages className="h-4 w-4 mr-2" />
          Перевести
        </Item>
      )}

      {onViewEmail && isEmailSource(message.source) && message.email_metadata?.body_html && (
        <Item onClick={onViewEmail}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Открыть письмо
        </Item>
      )}

      {onForward && (
        <Item onClick={() => onForward(message)}>
          <Forward className="h-4 w-4 mr-2" />
          Переслать сообщение
        </Item>
      )}

      {canDelete && onDelete && (
        <>
          <Separator />
          <Item
            className="text-destructive focus:text-destructive"
            onClick={onDeleteDialogOpen}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Удалить
          </Item>
        </>
      )}
    </>
  )
}

export const DROPDOWN_COMPONENTS: MenuComponents = {
  Item: DropdownMenuItem as MenuComponents['Item'],
  Separator: DropdownMenuSeparator as MenuComponents['Separator'],
}

export const CONTEXT_COMPONENTS: MenuComponents = {
  Item: ContextMenuItem as MenuComponents['Item'],
  Separator: ContextMenuSeparator as MenuComponents['Separator'],
}
