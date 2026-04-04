/**
 * Popover для выбора шаблона треда в ChatSettingsDialog.
 * Показывает список шаблонов workspace, сгруппированных по типу.
 */

import { useState, createElement } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Zap, Search, MessageSquare, CheckSquare, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThreadTemplates } from '@/hooks/messenger/useThreadTemplates'
import { getChatIconComponent } from './ChatSettingsDialog'
import { COLOR_BG } from './threadConstants'
import type { ThreadTemplate } from '@/types/threadTemplate'

interface ThreadTemplatePickerProps {
  workspaceId: string | undefined
  onSelect: (template: ThreadTemplate) => void
}

export function ThreadTemplatePicker({ workspaceId, onSelect }: ThreadTemplatePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data: templates = [] } = useThreadTemplates(workspaceId)

  if (templates.length === 0) return null

  const q = search.toLowerCase()
  const filtered = templates.filter(
    (t) => t.name.toLowerCase().includes(q) || (t.description?.toLowerCase().includes(q) ?? false),
  )

  const tasks = filtered.filter((t) => t.thread_type === 'task' && !t.is_email)
  const chats = filtered.filter((t) => t.thread_type === 'chat' && !t.is_email)
  const emails = filtered.filter((t) => t.is_email)

  const renderItem = (t: ThreadTemplate) => (
    <button
      key={t.id}
      type="button"
      className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted text-left text-sm"
      onClick={() => {
        onSelect(t)
        setOpen(false)
        setSearch('')
      }}
    >
      <div
        className={cn(
          'w-5 h-5 rounded flex items-center justify-center flex-shrink-0',
          COLOR_BG[t.accent_color] ?? 'bg-blue-500',
        )}
      >
        {createElement(getChatIconComponent(t.icon), {
          className: 'w-3 h-3 text-white',
        })}
      </div>
      <span className="truncate">{t.name}</span>
    </button>
  )

  const renderGroup = (label: string, icon: typeof MessageSquare, items: ThreadTemplate[]) => {
    if (items.length === 0) return null
    return (
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase text-muted-foreground px-2 py-1">
          {createElement(icon, { className: 'w-3 h-3' })}
          {label}
        </p>
        {items.map(renderItem)}
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground/50 hover:text-muted-foreground h-7 text-xs px-2"
        >
          <Zap className="w-3.5 h-3.5" />
          Шаблон
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        {templates.length > 5 && (
          <div className="flex items-center gap-1 mb-2 px-1">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="h-7 text-sm border-0 shadow-none focus-visible:ring-0 p-0"
            />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto space-y-1">
          {renderGroup('Задачи', CheckSquare, tasks)}
          {renderGroup('Чаты', MessageSquare, chats)}
          {renderGroup('Email', Mail, emails)}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">Ничего не найдено</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
