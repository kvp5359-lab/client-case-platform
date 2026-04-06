/**
 * Shared conversation tabs bar — used by ProjectAiChat and KnowledgeChat.
 * Shows "New" button, active conversation tab, and "History" popover.
 */

import { useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  Check,
  X,
  MessageSquare,
  History,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatSmartDateTime } from '@/utils/format/dateFormat'
import type { KnowledgeConversation } from '@/services/api/knowledge/knowledgeSearchService'

export type AccentColor = 'purple' | 'orange' | 'blue' | 'green'

const accentActiveClasses: Record<AccentColor, string> = {
  purple: 'bg-purple-100 border border-purple-300 text-purple-800 font-medium',
  orange: 'bg-orange-100 border border-orange-300 text-orange-800 font-medium',
  blue: 'bg-blue-100 border border-blue-300 text-blue-800 font-medium',
  green: 'bg-green-100 border border-green-300 text-green-800 font-medium',
}

interface ConversationTabsBarProps {
  conversations: KnowledgeConversation[]
  activeConversationId: string | null
  loadingConversations: boolean
  accent?: AccentColor
  onSelectConversation: (conv: KnowledgeConversation) => void
  onNewConversation: () => void
  onDeleteConversation: (id: string, e?: React.MouseEvent) => void
  onRenameConversation: (id: string, title: string) => void
}

export function ConversationTabsBar({
  conversations,
  activeConversationId,
  loadingConversations,
  accent = 'purple',
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation,
}: ConversationTabsBarProps) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const isNewConversation =
    !activeConversationId || !conversations.some((c) => c.id === activeConversationId)
  const activeConversation = conversations.find((c) => c.id === activeConversationId)

  const activeClass = accentActiveClasses[accent]

  const handleConfirmRename = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const trimmed = editingTitle.trim()
    if (trimmed) {
      onRenameConversation(id, trimmed)
    }
    setEditingId(null)
  }

  const handleRenameKeyDown = (id: string, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirmRename(id)
    } else if (e.key === 'Escape') {
      setEditingId(null)
    }
  }

  const handleNew = () => {
    onNewConversation()
    setHistoryOpen(false)
  }

  const handleSelect = (conv: KnowledgeConversation) => {
    onSelectConversation(conv)
    setHistoryOpen(false)
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/30 overflow-hidden shrink-0">
      <Button
        variant="ghost"
        size="sm"
        className={cn('h-7 px-2 gap-1 shrink-0', isNewConversation && activeClass)}
        onClick={handleNew}
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="text-xs">Новый</span>
      </Button>

      {/* Текущий диалог */}
      {activeConversation && !isNewConversation && (
        <>
          <div className="w-px h-4 bg-border shrink-0" />
          <div
            className={cn(
              'group flex items-center gap-0.5 h-7 rounded-md text-xs transition-colors min-w-0 flex-1',
              activeClass,
            )}
          >
            {editingId === activeConversation.id ? (
              <div className="flex items-center gap-0.5 px-1.5 min-w-0 flex-1">
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => handleRenameKeyDown(activeConversation.id, e)}
                  onClick={(e) => e.stopPropagation()}
                  className="min-w-0 flex-1 text-xs bg-background border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
                <button
                  type="button"
                  className="shrink-0 p-0.5 hover:text-foreground"
                  onClick={(e) => handleConfirmRename(activeConversation.id, e)}
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="shrink-0 p-0.5 hover:text-foreground"
                  onClick={() => setEditingId(null)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <>
                <span className="truncate pl-2 pr-0.5 py-1">
                  {activeConversation.title || 'Диалог'}
                  <span className="ml-1.5 text-[10px] opacity-50 font-normal">
                    {formatSmartDateTime(activeConversation.created_at)}
                  </span>
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 p-0.5 mr-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                    >
                      <MoreVertical className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={4}>
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingId(activeConversation.id)
                        setEditingTitle(activeConversation.title || '')
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Переименовать
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => onDeleteConversation(activeConversation.id, e)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </>
      )}

      {/* Загрузка */}
      {loadingConversations && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mx-2" />
      )}

      {/* История диалогов */}
      {conversations.length > 0 && (
        <>
          <div className="w-px h-4 bg-border shrink-0" />
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 shrink-0">
                <History className="h-3.5 w-3.5" />
                <span className="text-xs">История</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
              <div className="p-2 border-b">
                <p className="text-xs font-medium text-muted-foreground px-2">
                  История диалогов ({conversations.length})
                </p>
              </div>
              <ScrollArea className="max-h-[320px]">
                <div className="p-1.5 space-y-0.5">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={cn(
                        'group flex items-center gap-2 rounded-md px-2.5 py-2 cursor-pointer text-sm hover:bg-muted/50 transition-colors',
                        activeConversationId === conv.id && 'bg-muted',
                      )}
                      onClick={() => handleSelect(conv)}
                    >
                      <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <span className="block truncate text-xs">{conv.title || 'Диалог'}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {new Date(conv.created_at).toLocaleString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  )
}
