/**
 * CreateThreadPopover — кнопка «+» с popover для создания нового треда.
 * Содержит: типы (задача / чат / email) + шаблоны из workspaceId.
 */

import { useState } from 'react'
import { Plus, MessageSquare, CheckSquare, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getChatIconComponent } from '@/components/messenger/ChatSettingsDialog'
import type { ThreadTemplate } from '@/types/threadTemplate'

interface CreateThreadPopoverProps {
  threadTemplates: ThreadTemplate[]
  onCreateChat: (defaultTab?: 'task' | 'chat' | 'email', template?: ThreadTemplate) => void
}

const THREAD_TYPES = [
  { tab: 'task' as const, label: 'Задача', icon: CheckSquare },
  { tab: 'chat' as const, label: 'Чат', icon: MessageSquare },
  { tab: 'email' as const, label: 'Email', icon: Mail },
] as const

const ACCENT_BG: Record<string, string> = {
  blue: 'bg-blue-500',
  slate: 'bg-stone-600',
  emerald: 'bg-emerald-600',
  amber: 'bg-amber-500',
  rose: 'bg-red-500',
  violet: 'bg-violet-600',
  orange: 'bg-orange-500',
  cyan: 'bg-cyan-600',
  pink: 'bg-pink-500',
  indigo: 'bg-indigo-600',
}

export function CreateThreadPopover({ threadTemplates, onCreateChat }: CreateThreadPopoverProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-sm px-1.5 py-1 rounded-full transition-all text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
          title="Создать"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="end" sideOffset={6}>
        {/* Типы тредов */}
        {THREAD_TYPES.map((item) => (
          <button
            key={item.tab}
            type="button"
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
            onClick={() => {
              setOpen(false)
              onCreateChat(item.tab)
            }}
          >
            <item.icon className="w-4 h-4 text-muted-foreground" />
            {item.label}
          </button>
        ))}

        {/* Шаблоны */}
        {threadTemplates.length > 0 && (
          <>
            <div className="border-t my-1" />
            <p className="text-[11px] font-medium uppercase text-muted-foreground px-2 py-1">
              Шаблоны
            </p>
            {threadTemplates.map((t) => {
              const IconComp = getChatIconComponent(t.icon)
              return (
                <button
                  key={t.id}
                  type="button"
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
                  onClick={() => {
                    setOpen(false)
                    onCreateChat(
                      t.is_email ? 'email' : t.thread_type === 'task' ? 'task' : 'chat',
                      t,
                    )
                  }}
                >
                  <div
                    className={cn(
                      'w-5 h-5 rounded flex items-center justify-center flex-shrink-0',
                      ACCENT_BG[t.accent_color ?? ''] ?? 'bg-muted',
                    )}
                  >
                    <IconComp className="w-3 h-3 text-white" />
                  </div>
                  <span className="truncate">{t.name}</span>
                </button>
              )
            })}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
