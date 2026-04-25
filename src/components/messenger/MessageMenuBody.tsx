import { createElement } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  Reply,
  Pencil,
  Trash2,
  Copy,
  SmilePlus,
  Forward,
  Send,
  ExternalLink,
} from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { REACTIONS } from './ReactionPicker'
import { trackReactionUsage } from '@/utils/messenger/recentReactions'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import { getChatIconComponent, getChatTabAccent } from './EditChatDialog'
import { stripHtml, isHtmlContent, sanitizeMessengerHtml } from '@/utils/format/messengerHtml'
import { toast } from 'sonner'

/**
 * Общая модель действий над сообщением: используется и в dropdown «три точки»,
 * и в контекстном меню по правой кнопке на баббле. Пункты рендерятся через
 * компоненты-примитивы радикса, которые мы передаём извне.
 */
export interface MenuComponents {
  Item: ComponentType<{ onClick?: () => void; className?: string; children: ReactNode }>
  Separator: ComponentType<Record<string, never>>
  Sub: ComponentType<{ children: ReactNode }>
  SubTrigger: ComponentType<{ children: ReactNode }>
  SubContent: ComponentType<{ className?: string; children: ReactNode }>
}

export interface MessageMenuBodyProps {
  message: ProjectMessage
  isOwn: boolean
  quickReactions: string[]
  onReply: (msg: ProjectMessage) => void
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
  onDeleteDialogOpen: () => void
  onCloseMenu?: () => void
  reactionPopoverOpen: boolean
  setReactionPopoverOpen: (v: boolean) => void
}

export function renderMessageMenuBody(comps: MenuComponents, props: MessageMenuBodyProps) {
  const {
    message,
    isOwn,
    quickReactions,
    onReply,
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
    onDeleteDialogOpen,
    onCloseMenu,
    reactionPopoverOpen,
    setReactionPopoverOpen,
  } = props
  const { Item, Separator, Sub, SubTrigger, SubContent } = comps

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

  const availableForwardChats =
    onForwardToChat && forwardChats
      ? forwardChats.filter((c) => c.id !== currentThreadId && c.type === 'chat')
      : []

  return (
    <>
      {/* Quick reactions row */}
      <div className="flex items-center justify-between px-2 py-1.5">
        {quickReactions.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              trackReactionUsage(emoji)
              onReact(message.id, emoji)
              onCloseMenu?.()
            }}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted text-lg transition-colors"
          >
            {emoji}
          </button>
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

      <Item onClick={() => onReply(message)}>
        <Reply className="h-4 w-4 mr-2" />
        Ответить
      </Item>

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

      {onViewEmail && message.source === 'email' && message.email_metadata?.body_html && (
        <Item onClick={onViewEmail}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Открыть письмо
        </Item>
      )}

      {onForwardToChat && availableForwardChats.length > 0 && (
        <Sub>
          <SubTrigger>
            <Forward className="h-4 w-4 mr-2" />
            Переслать в чат
          </SubTrigger>
          <SubContent className="min-w-[180px]">
            {availableForwardChats.map((chat) => {
              const IconComponent = getChatIconComponent(chat.icon)
              const accent = getChatTabAccent(chat.accent_color)
              return (
                <Item key={chat.id} onClick={() => onForwardToChat(message, chat.id)}>
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] mr-2',
                      accent.active,
                    )}
                  >
                    {createElement(IconComponent, { className: 'h-3 w-3' })}
                  </span>
                  <span className="truncate">{chat.name}</span>
                </Item>
              )
            })}
          </SubContent>
        </Sub>
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
  Sub: DropdownMenuSub as MenuComponents['Sub'],
  SubTrigger: DropdownMenuSubTrigger as MenuComponents['SubTrigger'],
  SubContent: DropdownMenuSubContent as MenuComponents['SubContent'],
}

export const CONTEXT_COMPONENTS: MenuComponents = {
  Item: ContextMenuItem as MenuComponents['Item'],
  Separator: ContextMenuSeparator as MenuComponents['Separator'],
  Sub: ContextMenuSub as MenuComponents['Sub'],
  SubTrigger: ContextMenuSubTrigger as MenuComponents['SubTrigger'],
  SubContent: ContextMenuSubContent as MenuComponents['SubContent'],
}
