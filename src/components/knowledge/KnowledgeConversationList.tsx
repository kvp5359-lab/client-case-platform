import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, MessageSquare, Trash2, Loader2 } from 'lucide-react'
import type { KnowledgeConversation } from '@/services/api/knowledgeSearchService'

interface KnowledgeConversationListProps {
  conversations: KnowledgeConversation[]
  activeId: string | null
  isLoading: boolean
  onSelect: (conversation: KnowledgeConversation) => void
  onNew: () => void
  onDelete: (id: string) => void
}

export function KnowledgeConversationList({
  conversations,
  activeId,
  isLoading,
  onSelect,
  onNew,
  onDelete,
}: KnowledgeConversationListProps) {
  return (
    <div className="flex flex-col h-full border-r">
      <div className="p-3 border-b">
        <Button onClick={onNew} variant="outline" size="sm" className="w-full gap-2">
          <Plus className="h-4 w-4" />
          Новый диалог
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center p-4">Нет диалогов</p>
        ) : (
          <div className="p-1.5 space-y-0.5">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  'group flex items-center gap-2 rounded-md px-2.5 py-2 cursor-pointer text-sm hover:bg-muted/50 transition-colors',
                  activeId === conv.id && 'bg-muted',
                )}
                onClick={() => onSelect(conv)}
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{conv.title || 'Новый диалог'}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(conv.id)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
