/**
 * Диалог выбора чата для пересылки сообщения.
 */

import { createElement } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { getChatIconComponent, getChatTabAccent } from './EditChatDialog'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'

interface ForwardMessageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chats: ProjectThread[]
  currentThreadId?: string
  onSelect: (chat: ProjectThread) => void
}

export function ForwardMessageDialog({
  open,
  onOpenChange,
  chats,
  currentThreadId,
  onSelect,
}: ForwardMessageDialogProps) {
  const available = chats.filter((c) => c.id !== currentThreadId && c.type === 'chat')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Переслать в чат</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1 mt-1">
          {available.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Нет доступных чатов</p>
          )}
          {available.map((chat) => {
            const IconComponent = getChatIconComponent(chat.icon)
            const accent = getChatTabAccent(chat.accent_color)
            return (
              <button
                key={chat.id}
                onClick={() => {
                  onSelect(chat)
                  onOpenChange(false)
                }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                  'hover:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs',
                    accent.active,
                  )}
                >
                  {createElement(IconComponent, { className: 'h-3.5 w-3.5' })}
                </span>
                <span className="text-sm font-medium truncate">{chat.name}</span>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
