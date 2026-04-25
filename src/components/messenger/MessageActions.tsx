import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { MoreVertical } from 'lucide-react'
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
  accent = 'blue',
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
  moreMenuOpen,
  setMoreMenuOpen,
  reactionPopoverOpen,
  setReactionPopoverOpen,
}: MessageActionsProps) {
  const quickReactions = useQuickReactions()
  const colors = bubbleStyles[accent] ?? bubbleStyles.blue
  // Фон пилюли — цвет бабла. Для своих — солид (bg-blue-500 text-white),
  // для входящих — лёгкий тинт (bg-blue-100/70 ...). В обоих случаях цвет
  // совпадает с баблом — кнопка не выглядит «чужеродным» кружком и перекрывает
  // галочку/время, если попала на них в коротком бабле.
  const pillClass = isOwn ? colors.own : colors.incoming

  return (
    <div
      className={cn(
        'absolute top-1 right-1 z-10 flex items-center opacity-0 group-hover:opacity-100 transition-opacity',
        (moreMenuOpen || reactionPopoverOpen) && 'opacity-100',
      )}
    >
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
            onCloseMenu: () => setMoreMenuOpen(false),
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
          reactionPopoverOpen,
          setReactionPopoverOpen,
        })}
      </ContextMenuContent>
    </ContextMenu>
  )
}
