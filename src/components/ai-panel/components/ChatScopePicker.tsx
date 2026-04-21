import { useState } from 'react'
import { Check, ChevronDown, MessageSquare } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ChatScope } from '@/services/api/messenger/messengerAiService'

export interface ProjectThreadOption {
  id: string
  name: string
  type: 'chat' | 'task'
}

interface Props {
  chatScope: ChatScope
  projectThreads: ProjectThreadOption[]
  chatMessagesCount: number
  setChatScope: (scope: ChatScope) => void
}

export function ChatScopePicker({
  chatScope,
  projectThreads,
  chatMessagesCount,
  setChatScope,
}: Props) {
  const [open, setOpen] = useState(false)
  const isAllChats = chatScope.mode === 'all'
  const selectedCount = chatScope.threadIds.length

  const label = isAllChats
    ? 'Все чаты'
    : selectedCount === 0
      ? 'Выбрать чаты'
      : selectedCount === 1
        ? projectThreads.find((t) => t.id === chatScope.threadIds[0])?.name ?? '1 чат'
        : `${selectedCount} чата`

  const toggleThread = (threadId: string) => {
    if (isAllChats) {
      setChatScope({ mode: 'selected', threadIds: [threadId] })
      return
    }
    const next = chatScope.threadIds.includes(threadId)
      ? chatScope.threadIds.filter((id) => id !== threadId)
      : [...chatScope.threadIds, threadId]
    setChatScope({ mode: 'selected', threadIds: next })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
            isAllChats || selectedCount > 0
              ? 'bg-blue-100 border-blue-300 text-blue-800'
              : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
          }`}
          title="Где искать в переписке"
        >
          <MessageSquare className="h-3 w-3" />
          {label}
          {(isAllChats || selectedCount > 0) && chatMessagesCount > 0 && (
            <span className="opacity-70">{chatMessagesCount}</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start" sideOffset={4}>
        <button
          type="button"
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
          onClick={() => {
            setChatScope({ mode: 'all', threadIds: [] })
            setOpen(false)
          }}
        >
          <span className="w-4 inline-flex justify-center">
            {isAllChats && <Check className="h-3.5 w-3.5" />}
          </span>
          Все чаты проекта
        </button>
        <div className="border-t my-1" />
        <p className="text-[11px] font-medium uppercase text-muted-foreground px-2 py-1">
          Выбрать треды
        </p>
        <div className="max-h-64 overflow-y-auto">
          {projectThreads.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-2">Нет тредов в проекте</p>
          ) : (
            projectThreads.map((t) => {
              const checked = !isAllChats && chatScope.threadIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
                  onClick={() => toggleThread(t.id)}
                >
                  <span className="w-4 inline-flex justify-center">
                    {checked && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="truncate">{t.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                    {t.type === 'task' ? 'задача' : 'чат'}
                  </span>
                </button>
              )
            })
          )}
        </div>
        {!isAllChats && selectedCount > 0 && (
          <>
            <div className="border-t my-1" />
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
              onClick={() => setChatScope({ mode: 'selected', threadIds: [] })}
            >
              Очистить выбор
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
