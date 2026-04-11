import { createElement } from 'react'
import { cn } from '@/lib/utils'
import {
  Reply,
  Pencil,
  Quote,
  Trash2,
  MoreHorizontal,
  Copy,
  SmilePlus,
  Forward,
  Send,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ReactionPicker, REACTIONS } from './ReactionPicker'
import type { ProjectMessage, MessageChannel } from '@/services/api/messenger/messengerService'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import { getChatIconComponent, getChatTabAccent } from './EditChatDialog'
import { stripHtml } from '@/utils/format/messengerHtml'
import { toast } from 'sonner'

/** First 6 reactions for quick access */
const QUICK_REACTIONS = REACTIONS.slice(0, 6)

interface MessageActionsProps {
  message: ProjectMessage
  isOwn: boolean
  onReply: (msg: ProjectMessage) => void
  onReact: (messageId: string, emoji: string) => void
  onEdit?: (msg: ProjectMessage) => void
  onDelete?: (messageId: string) => void
  canDelete?: boolean
  onQuote?: (text: string) => void
  onForwardToChat?: (msg: ProjectMessage, targetChatId: string) => void
  forwardChats?: ProjectThread[]
  currentThreadId?: string
  onPublishDraft?: (msg: ProjectMessage) => void
  onEditDraft?: (msg: ProjectMessage) => void
  onViewEmail?: () => void
  channel?: MessageChannel
  onDeleteDialogOpen: () => void
  moreMenuOpen: boolean
  setMoreMenuOpen: (v: boolean) => void
  reactionPopoverOpen: boolean
  setReactionPopoverOpen: (v: boolean) => void
}

export function MessageActions({
  message,
  isOwn,
  onReply,
  onReact,
  onEdit,
  onDelete,
  canDelete,
  onQuote,
  onForwardToChat,
  forwardChats,
  currentThreadId,
  onPublishDraft,
  onEditDraft,
  onViewEmail,
  channel: _channel,
  onDeleteDialogOpen,
  moreMenuOpen,
  setMoreMenuOpen,
  reactionPopoverOpen,
  setReactionPopoverOpen,
}: MessageActionsProps) {
  const handleCopyText = () => {
    const text = stripHtml(message.content)
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Скопировано')
    })
  }

  return (
    <div
      className={cn(
        'absolute -bottom-2 right-1 z-10 flex gap-0.5 items-center opacity-0 group-hover:opacity-100 transition-opacity',
        'bg-gray-100 border-2 border-white rounded-full px-1 py-px',
        (moreMenuOpen || reactionPopoverOpen) && 'opacity-100',
      )}
    >
      {!message.is_draft && (
        <>
          <TooltipProvider>
            {/* Reply */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onReply(message)}
                >
                  <Reply className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Ответить</TooltipContent>
            </Tooltip>

            {/* Quote full message */}
            {onQuote && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onQuote(stripHtml(message.content))}
                  >
                    <Quote className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Цитировать</TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>

          {/* Reaction picker */}
          <ReactionPicker onPick={(emoji) => onReact(message.id, emoji)} />
        </>
      )}

      {/* More menu */}
      <DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Ещё действия">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isOwn ? 'end' : 'start'} side="top" className="w-52">
          {message.is_draft ? (
            <>
              {onPublishDraft && (
                <DropdownMenuItem onClick={() => onPublishDraft(message)}>
                  <Send className="h-4 w-4 mr-2" />
                  Отправить
                </DropdownMenuItem>
              )}

              {onEditDraft && (
                <DropdownMenuItem onClick={() => onEditDraft(message)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Редактировать
                </DropdownMenuItem>
              )}

              <DropdownMenuItem onClick={handleCopyText}>
                <Copy className="h-4 w-4 mr-2" />
                Копировать текст
              </DropdownMenuItem>

              {canDelete && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={onDeleteDialogOpen}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Удалить
                  </DropdownMenuItem>
                </>
              )}
            </>
          ) : (
            <>
              {/* Quick reactions row */}
              <div className="flex items-center justify-between px-2 py-1.5">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onReact(message.id, emoji)
                      setMoreMenuOpen(false)
                    }}
                    className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted text-lg transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
                {/* Full picker button */}
                <Popover open={reactionPopoverOpen} onOpenChange={setReactionPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors">
                      <SmilePlus className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="end" side="top">
                    <div className="grid grid-cols-6 gap-1">
                      {REACTIONS.map((e) => (
                        <button
                          key={e}
                          onClick={() => {
                            onReact(message.id, e)
                            setReactionPopoverOpen(false)
                            setMoreMenuOpen(false)
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

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => onReply(message)}>
                <Reply className="h-4 w-4 mr-2" />
                Ответить
              </DropdownMenuItem>

              {isOwn && onEdit && (
                <DropdownMenuItem onClick={() => onEdit(message)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Редактировать
                </DropdownMenuItem>
              )}

              <DropdownMenuItem onClick={handleCopyText}>
                <Copy className="h-4 w-4 mr-2" />
                Копировать текст
              </DropdownMenuItem>

              {onViewEmail && message.source === 'email' && message.email_metadata?.body_html && (
                <DropdownMenuItem onClick={onViewEmail}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Открыть письмо
                </DropdownMenuItem>
              )}

              {onForwardToChat && (() => {
                const available = (forwardChats ?? []).filter(
                  (c) => c.id !== currentThreadId && c.type === 'chat',
                )
                if (available.length === 0) return null
                return (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Forward className="h-4 w-4 mr-2" />
                      Переслать в чат
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-[180px]">
                      {available.map((chat) => {
                        const IconComponent = getChatIconComponent(chat.icon)
                        const accent = getChatTabAccent(chat.accent_color)
                        return (
                          <DropdownMenuItem
                            key={chat.id}
                            onClick={() => onForwardToChat(message, chat.id)}
                          >
                            <span
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] mr-2',
                                accent.active,
                              )}
                            >
                              {createElement(IconComponent, { className: 'h-3 w-3' })}
                            </span>
                            <span className="truncate">{chat.name}</span>
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )
              })()}

              {canDelete && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={onDeleteDialogOpen}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Удалить
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
