"use client"

/**
 * CreateThreadButtonGroup — split-кнопка «+ Создать задачу» + chevron-popover.
 *
 * Левая часть — быстрая кнопка, делает основной action (по умолчанию «задача»).
 * Правая часть — chevron, открывает popover с:
 *   • альтернативные типы (Задача / Чат / Email)
 *   • Шаблоны тредов проекта
 *
 * Используется в TaskListView (страница «Задачи» проекта) вместо одиночной
 * кнопки «Создать задачу». Триггерит ChatSettingsDialog с правильными
 * defaultThreadType + initialTemplate.
 */

import { useState } from 'react'
import { ChevronDown, MessageSquare, CheckSquare, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getChatIconComponent } from '@/components/messenger/ChatSettingsDialog'
import type { ThreadTemplate } from '@/types/threadTemplate'

export type ThreadKind = 'task' | 'chat' | 'email'

interface Props {
  threadTemplates: ThreadTemplate[]
  onCreate: (kind: ThreadKind, template?: ThreadTemplate) => void
  /** Тип action'а при клике на основную кнопку. По умолчанию 'task'. */
  primary?: ThreadKind
  className?: string
}

const TYPE_LABELS: Record<ThreadKind, { label: string; icon: typeof CheckSquare }> = {
  task: { label: 'Задача', icon: CheckSquare },
  chat: { label: 'Чат', icon: MessageSquare },
  email: { label: 'Email', icon: Mail },
}

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

export function CreateThreadButtonGroup({
  threadTemplates,
  onCreate,
  primary = 'task',
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const primaryMeta = TYPE_LABELS[primary]
  const PrimaryIcon = primaryMeta.icon

  return (
    <div className={cn('flex shrink-0', className)}>
      <Button
        size="sm"
        variant="outline"
        className="h-9 rounded-r-none border-r-0"
        onClick={() => onCreate(primary)}
      >
        <PrimaryIcon className="w-4 h-4 mr-1.5" />
        Создать
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-9 rounded-l-none px-2"
            aria-label="Больше вариантов"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="end" sideOffset={6}>
          {/* Типы тредов */}
          {(['task', 'chat', 'email'] as ThreadKind[]).map((k) => {
            const m = TYPE_LABELS[k]
            const I = m.icon
            return (
              <button
                key={k}
                type="button"
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
                onClick={() => {
                  setOpen(false)
                  onCreate(k)
                }}
              >
                <I className="w-4 h-4 text-muted-foreground shrink-0" />
                {m.label}
              </button>
            )
          })}

          {threadTemplates.length > 0 && (
            <>
              <div className="border-t my-1" />
              <p className="text-[11px] font-medium uppercase text-muted-foreground px-2 py-1">
                Шаблоны
              </p>
              {threadTemplates.map((t) => {
                const IconComp = getChatIconComponent(t.icon)
                const kind: ThreadKind = t.is_email
                  ? 'email'
                  : t.thread_type === 'task'
                    ? 'task'
                    : 'chat'
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
                    onClick={() => {
                      setOpen(false)
                      onCreate(kind, t)
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
    </div>
  )
}
